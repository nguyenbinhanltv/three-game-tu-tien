// Phần DSP thuần của tools/audio/loop.mjs (không gọi ffmpeg, không đụng file) để test đơn vị được.
//
// - estimateTempo: nhịp (BPM) và pha phách từ đường bao onset (tự tương quan, ưu tiên quanh 100 BPM).
// - findBody: bỏ lặng đầu và đoạn fade-out/lặng cuối mà Suno hay thêm vào.
// - findLoop: chọn điểm đầu S trên lưới phách, điểm cuối E = S + n ô nhịp sao cho nhạc ngay sau E giống
//   nhạc ngay sau S nhất (so đặc trưng năng lượng 4 dải), tinh chỉnh E theo tương quan dạng sóng (khớp pha),
//   rồi đặt S vào điểm qua 0 gần nhất (E dời theo).
// - makeLoop: cắt [S, E) và trộn F mẫu cuối với [S-F, S) để mẫu cuối nối liền mẫu đầu khi phát lặp.
// - loudness (EBU R128 / BS.1770-4, có cổng) và truePeak (lấy mẫu dư 4 lần) để chuẩn hóa -16 LUFS, đỉnh -1 dBTP.

export const SR = 48000;

const dbToGain = (db) => 10 ** (db / 20);
const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));

export function mono(chans) {
  if (chans.length === 1) return chans[0];
  const n = chans[0].length;
  const m = new Float32Array(n);
  for (const a of chans) for (let i = 0; i < n; i++) m[i] += a[i] / chans.length;
  return m;
}

// ---------- đặc trưng ----------

/** Năng lượng 4 dải (thấp <250 Hz, trung thấp, trung cao, cao >4 kHz) theo khung `hop` mẫu, dạng log. */
export function bandFeatures(m, hop = 1024, sr = SR) {
  const cuts = [250, 1000, 4000];
  const ks = cuts.map((hz) => 1 - Math.exp((-2 * Math.PI * hz) / sr));
  const frames = Math.floor(m.length / hop);
  const out = Array.from({ length: 4 }, () => new Float32Array(frames));
  const lp = [0, 0, 0];
  const acc = [0, 0, 0, 0];
  for (let f = 0; f < frames; f++) {
    acc.fill(0);
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const x = m[i];
      for (let b = 0; b < 3; b++) lp[b] += ks[b] * (x - lp[b]);
      const bands = [lp[0], lp[1] - lp[0], lp[2] - lp[1], x - lp[2]];
      for (let b = 0; b < 4; b++) acc[b] += bands[b] * bands[b];
    }
    for (let b = 0; b < 4; b++) out[b][f] = Math.log10(acc[b] / hop + 1e-10);
  }
  return out;
}

/** Đường bao onset: tổng phần tăng (chỉnh lưu nửa sóng) của log năng lượng các dải, khung `hop` mẫu. */
export function onsetEnvelope(m, hop = 512, sr = SR) {
  const bands = bandFeatures(m, hop, sr);
  const n = bands[0].length;
  const o = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    let s = 0;
    for (const b of bands) s += Math.max(0, b[f] - b[f - 1]);
    o[f] = s;
  }
  // Bỏ thành phần chậm để tự tương quan không bị đường bao âm lượng chi phối.
  const w = 16;
  const out = new Float32Array(n);
  let run = 0;
  for (let f = 0; f < n; f++) {
    run += o[f];
    if (f >= w) run -= o[f - w];
    out[f] = Math.max(0, o[f] - run / Math.min(w, f + 1));
  }
  return out;
}

/**
 * Ước lượng nhịp trong [minBpm, maxBpm]. Trả { bpm, period (mẫu), phase (mẫu, vị trí phách đầu tiên), confidence 0..1 }.
 * Nếu biết bpm (khai báo trong music.json) thì chỉ tìm pha.
 */
export function estimateTempo(m, { sr = SR, bpm: known = null, minBpm = 60, maxBpm = 180 } = {}) {
  const hop = 512;
  const o = onsetEnvelope(m, hop, sr);
  const fps = sr / hop;
  const ac = (lag) => {
    // Nội suy tuyến tính cho độ trễ lẻ.
    const k = Math.floor(lag);
    const fr = lag - k;
    let s = 0;
    for (let i = 0; i + k + 1 < o.length; i++) s += o[i] * (o[i + k] * (1 - fr) + o[i + k + 1] * fr);
    return s;
  };
  let energy = 0;
  for (const v of o) energy += v * v;
  let lagF;
  let confidence = 1;
  if (known) lagF = (60 / known) * fps;
  else {
    const lo = Math.floor((60 / maxBpm) * fps);
    const hi = Math.ceil((60 / minBpm) * fps);
    let best = -Infinity;
    let bestLag = lo;
    const vals = new Map();
    for (let lag = lo; lag <= hi; lag++) {
      const v = ac(lag);
      vals.set(lag, v);
      const bpm = (60 * fps) / lag;
      // Trọng số log-Gauss quanh 100 BPM để không nhảy sang nửa/gấp đôi nhịp.
      const w = Math.exp(-0.5 * (Math.log2(bpm / 100) / 0.9) ** 2);
      if (v * w > best) {
        best = v * w;
        bestLag = lag;
      }
    }
    // Nội suy parabol quanh đỉnh để lấy chu kỳ lẻ.
    const a = vals.get(bestLag - 1) ?? ac(bestLag - 1);
    const b = vals.get(bestLag);
    const c = vals.get(bestLag + 1) ?? ac(bestLag + 1);
    const den = a - 2 * b + c;
    lagF = bestLag + (den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0);
    confidence = energy > 0 ? Math.max(0, Math.min(1, b / energy)) : 0;
  }
  // Pha: dịch lưới phách để tổng onset rơi trúng phách lớn nhất.
  let bestPhase = 0;
  let bestSum = -1;
  const steps = Math.max(1, Math.round(lagF));
  for (let p = 0; p < steps; p++) {
    let s = 0;
    for (let t = p; t < o.length; t += lagF) s += o[Math.round(t)] ?? 0;
    if (s > bestSum) {
      bestSum = s;
      bestPhase = p;
    }
  }
  const period = lagF * hop;
  return { bpm: (60 * fps) / lagF, period, phase: bestPhase * hop, confidence };
}

/** Phần có nhạc: bỏ lặng đầu (dưới đỉnh RMS -35 dB) và đuôi tắt dần/lặng cuối (dưới mức to điển hình -10 dB). */
export function findBody(m, sr = SR) {
  const hop = Math.round(0.05 * sr);
  const n = Math.floor(m.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += m[i] * m[i];
    env[f] = gainToDb(Math.sqrt(s / hop));
  }
  const sorted = [...env].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.6)] ?? -120;
  const peak = sorted[sorted.length - 1] ?? -120;
  let s = 0;
  while (s < n && env[s] < peak - 35) s++;
  let e = n - 1;
  while (e > s && env[e] < typical - 10) e--;
  return { start: s * hop, end: Math.min(m.length, (e + 1) * hop) };
}

function zNorm(a) {
  let mean = 0;
  for (const v of a) mean += v;
  mean /= a.length || 1;
  let sd = 0;
  for (const v of a) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / (a.length || 1)) || 1;
  return Float32Array.from(a, (v) => (v - mean) / sd);
}

/** Độ giống (tương quan Pearson trung bình qua các dải) của đặc trưng [i, i+w) và [j, j+w). */
function featureSim(feats, i, j, w) {
  let tot = 0;
  for (const b of feats) {
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    let ma = 0;
    let mb = 0;
    for (let k = 0; k < w; k++) {
      ma += b[i + k];
      mb += b[j + k];
    }
    ma /= w;
    mb /= w;
    for (let k = 0; k < w; k++) {
      const x = b[i + k] - ma;
      const y = b[j + k] - mb;
      sab += x * y;
      saa += x * x;
      sbb += y * y;
    }
    tot += saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }
  return tot / feats.length;
}

/** Tương quan chuẩn hóa của dạng sóng [i, i+n) và [j, j+n). */
export function waveCorr(m, i, j, n) {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let k = 0; k < n; k++) {
    const x = m[i + k] ?? 0;
    const y = m[j + k] ?? 0;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/** Điểm qua 0 (đi lên) gần `i` nhất trong ±`radius` mẫu; không có thì trả `i`. */
export function nearestZeroCrossing(m, i, radius) {
  for (let d = 0; d <= radius; d++) {
    for (const k of [i - d, i + d]) if (k > 0 && k < m.length && m[k - 1] <= 0 && m[k] > 0) return k;
  }
  return i;
}

/**
 * Tìm vòng lặp. opts: { bpm?, beatsPerBar=4, start? (giây), end? (giây), minLen? (giây), maxLen? (giây), xfade (giây) }.
 * Trả { start, end (mẫu), bpm, confidence, score (giống nhau 0..1 của đặc trưng sau S và sau E), corr (khớp dạng sóng), bars }.
 */
export function findLoop(chans, opts = {}, sr = SR) {
  const m = mono(chans);
  const body = findBody(m, sr);
  const xf = Math.round((opts.xfade ?? 0.12) * sr);
  const tempo = estimateTempo(m.subarray(body.start, body.end), { sr, bpm: opts.bpm ?? null });
  const P = tempo.period;
  const phase0 = body.start + tempo.phase;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  // Nhịp không chắc (nhạc thiền, nhạc tự do) thì cho E nhảy theo phách thay vì theo ô nhịp.
  const stepBeats = opts.bpm || tempo.confidence >= 0.08 ? beatsPerBar : 1;
  const stepLen = P * stepBeats;

  let S;
  if (opts.start !== undefined) S = Math.round(opts.start * sr);
  else {
    // Phách đầu tiên sau phần mở (bỏ 1 ô nhịp đầu: Suno hay có nhịp lấy đà) và đủ chỗ cho crossfade.
    const minS = Math.max(body.start + P * beatsPerBar, xf);
    const k = Math.ceil((minS - phase0) / P);
    S = Math.round(phase0 + Math.max(0, k) * P);
  }
  S = Math.max(S, xf);

  const hop = 1024;
  const feats = bandFeatures(m, hop, sr).map(zNorm);
  const frame = (x) => Math.round(x / hop);
  let end;
  let score = 1;
  let bars = 0;
  if (opts.end !== undefined) end = Math.round(opts.end * sr);
  else {
    const minLen = (opts.minLen ?? Math.min(45, ((body.end - S) / sr) * 0.6)) * sr;
    const maxLen = (opts.maxLen ?? Infinity) * sr;
    let best = null;
    for (let W of [8, 4, 2]) {
      const w = Math.min(Math.round((W * sr) / hop), Math.max(4, Math.round((stepLen * 2) / hop)));
      // Sai số nhịp cộng dồn qua nhiều ô nhịp, nên mỗi ứng viên được dò thêm ±1/4 phách theo khung đặc trưng.
      const r = Math.max(1, Math.round(P / 4 / hop));
      for (let n = 1; ; n++) {
        const E0 = S + n * stepLen;
        if (E0 - S > maxLen) break;
        if (frame(E0) + w - r > frame(body.end)) break;
        if (E0 - S < minLen) continue;
        for (let d = -r; d <= r; d++) {
          const E = E0 + d * hop;
          if (frame(E) + w > frame(body.end)) continue;
          const sim = featureSim(feats, frame(S), frame(E), w);
          // Ưu tiên nhẹ vòng dài (ít nghe ra lặp) khi độ giống gần bằng nhau.
          const val = sim + 0.03 * ((E - S) / (body.end - S));
          if (!best || val > best.val) best = { val, sim, E, n };
        }
      }
      if (best) break;
    }
    if (!best) throw new Error(`bài quá ngắn để tìm vòng lặp (phần có nhạc ${((body.end - body.start) / sr).toFixed(1)} s, cần ≥ ${(minLen / sr).toFixed(1)} s + đoạn so sánh)`);
    end = Math.round(best.E);
    score = best.sim;
    bars = best.n * (stepBeats / beatsPerBar);
  }

  // Khớp pha: dời E trong ±1 khung đặc trưng (~21 ms) cho dạng sóng sau E giống sau S nhất.
  const win = Math.round(0.25 * sr);
  const radius = opts.end !== undefined ? 0 : Math.min(Math.round(P / 8), hop);
  let corr = -2;
  let bestE = end;
  for (let d = -radius; d <= radius; d++) {
    const c = waveCorr(m, S, end + d, win);
    if (c > corr) {
      corr = c;
      bestE = end + d;
    }
  }
  end = bestE;
  // Đặt S vào điểm qua 0 (±1 ms), E dời theo để giữ độ dài vòng.
  const S2 = nearestZeroCrossing(m, S, Math.round(0.001 * sr));
  end += S2 - S;
  S = S2;
  if (end > m.length) end = m.length;
  if (end - S < xf * 2) throw new Error('vòng lặp quá ngắn');
  return { start: S, end, bpm: tempo.bpm, confidence: tempo.confidence, score, corr, bars, body };
}

/**
 * Cắt vòng [S, E) và trộn `xfade` mẫu cuối với [S-xfade, S): y[L-1] → y[0] liền mạch vì [S-xfade, S) vốn dẫn vào x[S].
 * Khớp pha tốt (corr ≥ 0.5) thì trộn tuyến tính (tín hiệu tương quan), không thì công suất bằng nhau.
 */
export function makeLoop(chans, S, E, xfade, corr = 0) {
  const F = Math.min(xfade, S, E - S);
  const L = E - S;
  const linear = corr >= 0.5;
  return chans.map((x) => {
    const y = x.slice(S, E);
    for (let j = 0; j < F; j++) {
      const t = (j + 0.5) / F;
      const gOut = linear ? 1 - t : Math.cos((t * Math.PI) / 2);
      const gIn = linear ? t : Math.sin((t * Math.PI) / 2);
      y[L - F + j] = x[E - F + j] * gOut + x[S - F + j] * gIn;
    }
    return y;
  });
}

/** Bản không lặp (sting, nhạc một lần): cắt phần có nhạc, giữ đuôi ngân tới khi tắt hẳn, fade-out 50 ms ở cuối. */
export function trimOneShot(chans, sr = SR) {
  const m = mono(chans);
  let pk = 0;
  for (const v of m) pk = Math.max(pk, Math.abs(v));
  const th = pk * dbToGain(-50);
  let s = 0;
  while (s < m.length && Math.abs(m[s]) < th) s++;
  let e = m.length - 1;
  while (e > s && Math.abs(m[e]) < th) e--;
  s = Math.max(0, s - Math.round(0.005 * sr));
  e = Math.min(m.length, e + Math.round(0.05 * sr));
  const fo = Math.min(e - s, Math.round(0.05 * sr));
  return chans.map((x) => {
    const y = x.slice(s, e);
    for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= i / fo;
    return y;
  });
}

// ---------- độ to ----------

function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Độ to tích hợp (LUFS) theo BS.1770-4: lọc K, khối 400 ms chồng 75%, cổng tuyệt đối -70 và cổng tương đối -10 LU. Chỉ cho 48 kHz. */
export function loudness(chans, sr = SR) {
  if (sr !== 48000) throw new Error('loudness chỉ hỗ trợ 48 kHz');
  const k = chans.map((x) =>
    biquad(
      biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]),
      [1, -2, 1],
      [1, -1.99004745483398, 0.99007225036621],
    ),
  );
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  const ms = [];
  for (let s = 0; s + block <= k[0].length; s += step) {
    let z = 0;
    for (const c of k) {
      let acc = 0;
      for (let i = s; i < s + block; i++) acc += c[i] * c[i];
      z += acc / block;
    }
    ms.push(z);
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z);
  const abs = ms.filter((z) => z > 0 && lk(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((z) => lk(z) > rel);
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/**
 * Độ to ngắn hạn lớn nhất (LUFS, khối `win` giây (mặc định 0,4), bước 25 ms, không cổng) theo lọc K của BS.1770-4: đo "độ to khi đánh"
 * của âm ngắn (SFX), nơi `loudness` tích hợp không dùng được vì dưới 400 ms hoặc bị pha loãng bởi khoảng lặng.
 * Âm ngắn hơn một khối được đệm lặng cho đủ một khối.
 */
export function momentaryMax(chans, sr = SR, win = 0.4) {
  if (sr !== 48000) throw new Error('momentaryMax chỉ hỗ trợ 48 kHz');
  const block = Math.round(win * sr);
  const pad = (x) => {
    if (x.length >= block) return x;
    const o = new Float32Array(block);
    o.set(x);
    return o;
  };
  const k = chans.map((x) =>
    biquad(
      biquad(pad(x), [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]),
      [1, -2, 1],
      [1, -1.99004745483398, 0.99007225036621],
    ),
  );
  const step = Math.round(0.025 * sr);
  let best = 0;
  for (let s = 0; s + block <= k[0].length; s += step) {
    let z = 0;
    for (const c of k) {
      let acc = 0;
      for (let i = s; i < s + block; i++) acc += c[i] * c[i];
      z += acc / block;
    }
    if (z > best) best = z;
  }
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -Infinity;
}

/** Đỉnh thực (dBTP) gần đúng: lấy mẫu dư 4 lần bằng sinc cửa sổ Hann 32 nhịp mỗi pha. */
export function truePeak(chans) {
  const taps = 16;
  const phases = [0.25, 0.5, 0.75].map((f) => {
    const h = new Float32Array(taps * 2);
    for (let k = -taps + 1; k <= taps; k++) {
      const x = k - f;
      const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps + 1));
      h[k + taps - 1] = sinc * win;
    }
    return h;
  });
  let pk = 0;
  for (const x of chans) {
    for (let i = 0; i < x.length; i++) {
      pk = Math.max(pk, Math.abs(x[i]));
      for (const h of phases) {
        let s = 0;
        for (let k = -taps + 1; k <= taps; k++) s += (x[i + k] ?? 0) * h[k + taps - 1];
        if (Math.abs(s) > pk) pk = Math.abs(s);
      }
    }
  }
  return gainToDb(pk);
}

/** Hệ số khuếch đại để đạt `lufs`, giới hạn sao cho đỉnh thực ≤ `peak` dBTP. Trả { gainDb, before, peakBefore, limited }. */
export function normalizeGain(chans, lufs = -16, peak = -1, sr = SR) {
  const before = loudness(chans, sr);
  const peakBefore = truePeak(chans);
  let gainDb = lufs - before;
  let limited = false;
  if (peakBefore + gainDb > peak) {
    gainDb = peak - peakBefore;
    limited = true;
  }
  return { gainDb, before, peakBefore, limited };
}

/**
 * Giới hạn đỉnh mềm (nhạc tự soạn nhiều trống): giảm khuếch đại khi đỉnh mẫu vượt `ceilingDb`, nhìn trước `lookMs`
 * (không cắt méo), nhả theo hàm mũ `releaseMs`. `circular`: tín hiệu là vòng lặp, đường bao tính vòng tròn
 * (chạy 2 lượt) để đầu và cuối vòng khớp nhau. Sửa tại chỗ, trả mức giảm lớn nhất (dB, ≤ 0).
 */
export function limitPeaks(chans, ceilingDb = -1.5, sr = SR, { lookMs = 5, releaseMs = 120, circular = true } = {}) {
  const n = chans[0].length;
  const ceil = dbToGain(ceilingDb);
  const W = Math.max(1, Math.round((lookMs / 1000) * sr));
  // Hệ số cần ở từng mẫu.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const a of chans) p = Math.max(p, Math.abs(a[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  const at = (i) => need[circular ? ((i % n) + n) % n : Math.min(n - 1, i)];
  // Nhìn trước: min của need trong [i, i + W] (hàng đợi đơn điệu), qua 2 vòng nếu circular.
  const passes = circular ? 2 : 1;
  const len = n * passes;
  const ahead = new Float32Array(len);
  const dq = new Int32Array(len + W + 1);
  let h = 0;
  let t = 0;
  for (let j = 0; j < len + W; j++) {
    const v = at(j);
    while (t > h && at(dq[t - 1]) >= v) t--;
    dq[t++] = j;
    const i = j - W;
    if (i >= 0) {
      while (dq[h] < i) h++;
      ahead[i] = at(dq[h]);
    }
  }
  // Nhả: đường bao chỉ đi lên chậm, đi xuống tức thì (đã nhìn trước). Rồi làm mượt bằng trung bình trượt W mẫu
  // (trung bình của các giá trị ≤ min trong cửa sổ nhìn trước nên vẫn đủ giảm).
  const rel = Math.exp(-1 / ((releaseMs / 1000) * sr));
  const env = new Float32Array(len);
  let e = 1;
  for (let i = 0; i < len; i++) {
    e = Math.min(ahead[i], 1 - (1 - e) * rel);
    env[i] = e;
  }
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += env[i];
    if (i >= W) sum -= env[i - W];
    // Lượt cuối là lượt đã ổn định trạng thái (vòng tròn): ghi kết quả.
    const k = i - (passes - 1) * n;
    if (k >= 0) out[k] = i >= W ? Math.min(sum / W, env[i]) : env[i];
  }
  let minG = 1;
  for (let i = 0; i < n; i++) {
    const g = out[i];
    if (g < minG) minG = g;
    for (const a of chans) a[i] *= g;
  }
  return gainToDb(minG);
}

export function applyGain(chans, db) {
  const g = dbToGain(db);
  for (const a of chans) for (let i = 0; i < a.length; i++) a[i] *= g;
}

/**
 * Đo điểm nối khi phát lặp. Xoay vòng cho chỗ nối nằm giữa file rồi so bước nhảy đặc trưng năng lượng 4 dải ở chỗ nối
 * với bước nhảy lớn bậc 99% trong bài (mức một phách mạnh bình thường). `seam` ≈ 1 hoặc thấp hơn: chỗ nối không gắt hơn
 * một phách mạnh; > 2: gắt hơn mọi chỗ trong bài, dễ nghe ra.
 * `click`: bước nhảy dạng sóng ở chỗ nối so với bước nhảy lớn nhất bình thường (≤ 1 là không có tiếng tách).
 */
export function seamReport(chans, sr = SR) {
  const m = mono(chans);
  const hop = 1024;
  const sh = Math.floor(m.length / 2 / hop) * hop;
  const rot = new Float32Array(m.length);
  rot.set(m.subarray(sh), 0);
  rot.set(m.subarray(0, sh), m.length - sh);
  const f = bandFeatures(rot, hop, sr);
  const steps = [];
  for (let i = 1; i < f[0].length; i++) {
    let s = 0;
    for (const b of f) s += (b[i] - b[i - 1]) ** 2;
    steps.push(Math.sqrt(s));
  }
  // Chỗ nối nằm ở mẫu m.length - sh của `rot`, tức ranh giới khung k-1|k (bước steps[k-1]); xét cả khung kề vì không thẳng hàng.
  const k = Math.round((m.length - sh) / hop);
  const seam = Math.max(steps[k - 2] ?? 0, steps[k - 1] ?? 0, steps[k] ?? 0);
  const sorted = [...steps].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1e-9;
  let maxStep = 1e-9;
  for (let i = 1; i < m.length; i++) maxStep = Math.max(maxStep, Math.abs(m[i] - m[i - 1]));
  return { seam: seam / p99, click: Math.abs(m[0] - m[m.length - 1]) / maxStep };
}
