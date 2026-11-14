#!/usr/bin/env node
// Build SFX + âm môi trường từ nguồn CC0 (M4-11, M4-12).
//
//   node tools/audio/build.mjs            build rồi ghi apps/client/public/audio/{sfx,amb}/ + manifest.json + khối giấy phép trong assets/LICENSES.md
//   node tools/audio/build.mjs --check    chỉ kiểm khai báo, nguồn có đủ, gói đều CC0 (không ghi gì)
//
// Đầu vào: tools/audio/sounds.json (khai báo) + file nguồn trong <DTL_ASSET_SOURCE>/sfx/ (không commit).
// DTL_ASSET_SOURCE mặc định là thư mục dtl-asset-source cạnh repo gốc (dò qua git common dir để chạy được trong worktree).
// ffmpeg: biến FFMPEG, rồi `ffmpeg` trong PATH, rồi gói ffmpeg-static nếu cài. Cần libopus và aac.
//
// Xử lý: giải mã về float 48 kHz, trộn lớp (đổi tốc độ, lọc thông thấp, dời thời điểm), cắt lặng đầu/cuối,
// chuẩn hóa theo RMS đoạn to nhất (giới hạn đỉnh -1 dBFS), ghép sprite theo nhóm có khoảng lặng giữa các clip.
// Âm môi trường: chồng lớp lặp ở nhiều tốc độ với đường bao âm lượng ngẫu nhiên có seed, rồi nối vòng bằng
// crossfade công suất bằng nhau, nên chu kỳ thực của file dài (40–60 s) và không nghe ra điểm nối.
// Kết quả xác định (cùng nguồn → cùng byte → cùng hash), tên file theo hash nội dung để CDN cache lâu.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SPEC_FILE = path.join(HERE, 'sounds.json');
const OUT_DIR = path.join(ROOT, 'apps/client/public/audio');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const LICENSES = path.join(ROOT, 'assets/LICENSES.md');
const SR = 48000;
/** Mức chuẩn: RMS đoạn 50 ms to nhất của một SFX đặt ở -14 dBFS (+ level của âm). */
const SFX_REF_DB = -14;
const PEAK_MAX = 10 ** (-1 / 20);
const GAP = 0.12;
const ALLOWED_LICENSES = new Set(['CC0-1.0']);
const LIC_BEGIN = '<!-- audio:begin (sinh bởi tools/audio/build.mjs, đừng sửa tay) -->';
const LIC_END = '<!-- audio:end -->';

const CHECK = process.argv.includes('--check');

// ---------- môi trường ----------

function sourceRoot() {
  if (process.env.DTL_ASSET_SOURCE) return path.resolve(process.env.DTL_ASSET_SOURCE);
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' });
  const common = r.status === 0 ? r.stdout.trim() : path.join(ROOT, '.git');
  return path.resolve(path.dirname(common), '..', 'dtl-asset-source');
}

function findFfmpeg() {
  const tries = [];
  if (process.env.FFMPEG) tries.push(process.env.FFMPEG);
  tries.push('ffmpeg');
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static');
    if (typeof p === 'string') tries.push(p);
  } catch {
    // không cài ffmpeg-static
  }
  for (const t of tries) {
    const r = spawnSync(t, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (r.status === 0 && /libopus/.test(r.stdout) && /\baac\b/.test(r.stdout)) return t;
  }
  return null;
}

// ---------- tiện ích ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dbToGain = (db) => 10 ** (db / 20);

function parseSrc(spec, ref) {
  const i = ref.indexOf(':');
  if (i < 0) throw new Error(`nguồn "${ref}" thiếu tiền tố gói`);
  const pack = ref.slice(0, i);
  const p = spec.packs[pack];
  if (!p) throw new Error(`gói "${pack}" không có trong packs (${ref})`);
  return { pack, file: ref.slice(i + 1), abs: path.join(sourceRoot(), 'sfx', p.dir, ref.slice(i + 1)) };
}

/** Chuẩn hóa một biến thể về mảng lớp. */
function layersOf(v) {
  if (typeof v === 'string') return [{ src: v }];
  if (Array.isArray(v)) return v.map((l) => (typeof l === 'string' ? { src: l } : l));
  return [v];
}

// ---------- giải mã / mã hóa ----------

let FF = null;
const decCache = new Map();

/** Giải mã về float32 48 kHz, `ch` kênh, trả mảng kênh. */
function decode(abs, ch) {
  const key = abs + '|' + ch;
  const hit = decCache.get(key);
  if (hit) return hit;
  const r = spawnSync(FF, ['-v', 'error', '-i', abs, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg không giải mã được ${abs}: ${r.stderr}`);
  const all = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
  const n = all.length / ch;
  const out = [];
  for (let c = 0; c < ch; c++) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = all[i * ch + c];
    out.push(a);
  }
  decCache.set(key, out);
  return out;
}

function encode(chans, kind, args) {
  const ch = chans.length;
  const n = chans[0].length;
  const inter = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) inter[i * ch + c] = chans[c][i];
  const fmt = kind === 'webm' ? ['-c:a', 'libopus', '-vbr', 'on', '-application', 'audio', '-f', 'webm'] : ['-c:a', 'aac', '-movflags', '+faststart', '-f', 'mp4'];
  // MP4 cần đầu ra tua được nên ghi qua file tạm. Không ghi metadata thời gian/bộ mã hóa để byte ổn định giữa các lần build.
  const tmp = path.join(os.tmpdir(), `dtl-audio-${process.pid}-${crypto.randomBytes(4).toString('hex')}.${kind}`);
  const r = spawnSync(
    FF,
    ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', 'pipe:0', ...args, ...fmt, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', tmp],
    { input: Buffer.from(inter.buffer), maxBuffer: 1 << 30 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg mã hóa ${kind} lỗi: ${r.stderr}`);
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buf;
}

// ---------- DSP ----------

/** Đổi tốc độ bằng nội suy tuyến tính (rate > 1: cao hơn, ngắn hơn). */
function resample(a, rate) {
  if (rate === 1) return a;
  const n = Math.floor((a.length - 1) / rate);
  const o = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    const f = p - k;
    o[i] = a[k] * (1 - f) + a[k + 1] * f;
  }
  return o;
}

/** Thông thấp một cực, chạy hai lần (12 dB/oct). */
function lowpass(a, hz) {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / SR);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < a.length; i++) {
      y += k * (a[i] - y);
      a[i] = y;
    }
  }
  return a;
}

function cut(a, start = 0, end) {
  const s = Math.max(0, Math.round(start * SR));
  const e = end === undefined ? a.length : Math.min(a.length, Math.round(end * SR));
  return a.slice(s, e);
}

function fadeEdges(a, inS, outS) {
  const fi = Math.min(a.length, Math.round(inS * SR));
  const fo = Math.min(a.length, Math.round(outS * SR));
  for (let i = 0; i < fi; i++) a[i] *= i / fi;
  for (let i = 0; i < fo; i++) a[a.length - 1 - i] *= i / fo;
}

/** Bỏ lặng đầu/cuối (ngưỡng tương đối so với đỉnh). */
function trimSilence(a, relDb = -46) {
  let pk = 0;
  for (const v of a) pk = Math.max(pk, Math.abs(v));
  const th = pk * dbToGain(relDb);
  let s = 0;
  while (s < a.length && Math.abs(a[s]) < th) s++;
  let e = a.length - 1;
  while (e > s && Math.abs(a[e]) < th) e--;
  s = Math.max(0, s - Math.round(0.004 * SR));
  e = Math.min(a.length, e + Math.round(0.03 * SR));
  return a.slice(s, e);
}

function peakOf(a) {
  let p = 0;
  for (const v of a) p = Math.max(p, Math.abs(v));
  return p;
}

/** RMS lớn nhất trên cửa sổ 50 ms (đo "độ to khi đánh"). */
function loudRms(a) {
  const w = Math.round(0.05 * SR);
  let best = 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * a[i];
    if (i >= w) s -= a[i - w] * a[i - w];
    if (i >= w - 1 || i === a.length - 1) best = Math.max(best, s / Math.min(w, i + 1));
  }
  return Math.sqrt(best);
}

function rmsOf(chans) {
  let s = 0;
  let n = 0;
  for (const a of chans) for (const v of a) {
    s += v * v;
    n++;
  }
  return Math.sqrt(s / n);
}

function scale(chans, g) {
  for (const a of chans) for (let i = 0; i < a.length; i++) a[i] *= g;
}

/** Đường bao âm lượng mượt: nút ngẫu nhiên mỗi `period` giây trong [lo, hi], nội suy cosin. */
function envelope(n, lo, hi, period, rnd) {
  const step = Math.round(period * SR);
  const knots = [];
  for (let k = 0; k <= Math.ceil(n / step) + 1; k++) knots.push(lo + (hi - lo) * rnd());
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / step);
    const f = (i - k * step) / step;
    const t = (1 - Math.cos(Math.PI * f)) / 2;
    e[i] = knots[k] * (1 - t) + knots[k + 1] * t;
  }
  return e;
}

// ---------- SFX ----------

function renderVariant(spec, v) {
  const parts = layersOf(v).map((l) => {
    let a = decode(parseSrc(spec, l.src).abs, 1)[0];
    a = cut(a, l.start, l.end);
    a = resample(a, l.rate ?? 1);
    a = Float32Array.from(a);
    if (l.lp) lowpass(a, l.lp);
    fadeEdges(a, l.start ? 0.004 : 0, l.end !== undefined ? 0.08 : 0.005);
    const g = l.gain ?? 1;
    return { a, at: Math.round((l.at ?? 0) * SR), g };
  });
  const n = Math.max(...parts.map((p) => p.at + p.a.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.a.length; i++) out[p.at + i] += p.a[i] * p.g;
  return out;
}

function buildSfxClip(spec, name, def, v) {
  let a = trimSilence(renderVariant(spec, v));
  if (def.max && a.length > def.max * SR) {
    a = a.slice(0, Math.round(def.max * SR));
    fadeEdges(a, 0, 0.08);
  } else fadeEdges(a, 0, 0.015);
  const target = dbToGain(SFX_REF_DB + (def.level ?? 0));
  const lr = loudRms(a);
  if (lr <= 0) throw new Error(`${name}: biến thể im lặng`);
  let g = target / lr;
  const pk = peakOf(a) * g;
  if (pk > PEAK_MAX) g *= PEAK_MAX / pk;
  scale([a], g);
  return a;
}

// ---------- âm môi trường ----------

function renderAmbient(spec, id, def) {
  const L = Math.round(def.len * SR);
  const F = Math.round((def.xfade ?? 3) * SR);
  const N = L + F;
  const mix = [new Float32Array(N), new Float32Array(N)];
  for (const l of def.layers) {
    const src = decode(parseSrc(spec, l.src).abs, 2);
    const rate = l.rate ?? 1;
    const chans = src.map((c) => {
      const a = Float32Array.from(resample(cut(c, l.start, l.end), rate));
      if (l.lp) lowpass(a, l.lp);
      return a;
    });
    const len = chans[0].length;
    if (!l.loop && len < N) throw new Error(`amb ${id}: lớp ${l.src} ngắn hơn ${(N / SR).toFixed(1)} s mà không đặt loop`);
    const env = l.env ? envelope(N, l.env[0], l.env[1], l.env[2], mulberry32(l.seed ?? 1)) : null;
    const g = l.gain ?? 1;
    const off = Math.round((l.offset ?? 0) * SR);
    // pan > 0: lệch phải bằng cách giảm kênh trái (giữ ảnh stereo gốc).
    const pan = l.pan ?? 0;
    const pg = [pan > 0 ? 1 - pan : 1, pan < 0 ? 1 + pan : 1];
    for (let c = 0; c < 2; c++) {
      const s = chans[c];
      const m = mix[c];
      for (let i = 0; i < N; i++) m[i] += s[(i + off) % len] * g * pg[c] * (env ? env[i] : 1);
    }
  }
  for (const ev of def.events ?? []) {
    const rnd = mulberry32(ev.seed ?? 7);
    const base = decode(parseSrc(spec, ev.src).abs, 1)[0];
    for (let k = 0; k < ev.count; k++) {
      // Rải đều theo ô để không dồn cục, lệch ngẫu nhiên trong ô.
      const t = Math.floor(((k + 0.15 + 0.7 * rnd()) / ev.count) * L);
      const rate = ev.rate[0] + (ev.rate[1] - ev.rate[0]) * rnd();
      const gain = ev.gain[0] + (ev.gain[1] - ev.gain[0]) * rnd();
      const pan = rnd() * 1.4 - 0.7;
      const a = Float32Array.from(resample(base, rate));
      if (ev.lp) lowpass(a, ev.lp);
      // Vang đơn giản: hai lần dội trễ.
      const taps = [[0, 1]];
      if (ev.echo) taps.push([ev.echo[0], 0.45], [ev.echo[1], 0.25]);
      for (const [d, tg] of taps) {
        const o = t + Math.round(d * SR);
        for (let i = 0; i < a.length; i++) {
          const j = (o + i) % N;
          mix[0][j] += a[i] * gain * tg * (1 - Math.max(0, pan));
          mix[1][j] += a[i] * gain * tg * (1 + Math.min(0, pan));
        }
      }
    }
  }
  // Nối vòng: y[i] = x[F+i]; F mẫu cuối trộn công suất bằng nhau với x[0..F) để y[L-1] → y[0] liền mạch.
  const out = mix.map((x) => {
    const y = new Float32Array(L);
    for (let i = 0; i < L; i++) y[i] = x[F + i] ?? 0;
    for (let j = 0; j < F; j++) {
      const i = L - F + j;
      const t = j / F;
      y[i] = x[F + i] * Math.cos((t * Math.PI) / 2) + x[j] * Math.sin((t * Math.PI) / 2);
    }
    return y;
  });
  let g = dbToGain(def.level ?? -22) / rmsOf(out);
  const pk = Math.max(peakOf(out[0]), peakOf(out[1])) * g;
  if (pk > PEAK_MAX) g *= PEAK_MAX / pk;
  scale(out, g);
  return out;
}

/** Độ tương đồng của đoạn cuối với đoạn đầu (kiểm điểm nối) và phổ năng lượng theo 2 s (kiểm không có chu kỳ ngắn). */
function loopReport(out) {
  const a = out[0];
  // Bước nhảy tại điểm nối so với bước nhảy lớn nhất bình thường giữa hai mẫu liền nhau (≤ 1 là liền mạch).
  let maxStep = 1e-9;
  for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
  const d = Math.abs(a[0] - a[a.length - 1]) / maxStep;
  // Tự tương quan đường bao RMS (cửa sổ 0,1 s) đã bỏ thành phần chậm (trừ trung bình trượt 2 s),
  // ở độ trễ 1..20 s: đỉnh cao nghĩa là một mẫu hình lặp lại đều, dễ nghe ra chu kỳ.
  const hop = Math.round(0.1 * SR);
  const raw = [];
  for (let i = 0; i + hop <= a.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j++) s += a[j] * a[j];
    raw.push(Math.sqrt(s / hop));
  }
  const M = raw.length;
  const z = raw.map((_, i) => {
    let s = 0;
    for (let k = -10; k <= 10; k++) s += raw[(i + k + M) % M];
    return raw[i] - s / 21;
  });
  const var0 = z.reduce((x, y) => x + y * y, 0) || 1;
  let maxAc = 0;
  let atLag = 0;
  for (let lag = 10; lag <= Math.min(200, z.length - 10); lag++) {
    let s = 0;
    for (let i = 0; i < z.length; i++) s += z[i] * z[(i + lag) % z.length];
    const ac = s / var0;
    if (ac > maxAc) {
      maxAc = ac;
      atLag = Math.round(lag) / 10;
    }
  }
  return { seamJump: d, periodicity: maxAc, lag: atLag };
}

// ---------- ghi file ----------

function hashName(dir, base, ext, buf) {
  const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const name = `${base}.${h}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

function writeEncoded(subdir, base, chans, webmArgs, m4aArgs, written) {
  const dir = path.join(OUT_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const w = encode(chans, 'webm', webmArgs);
  const m = encode(chans, 'm4a', m4aArgs);
  const fw = hashName(dir, base, 'webm', w);
  const fm = hashName(dir, base, 'm4a', m);
  written.add(path.join(dir, fw));
  written.add(path.join(dir, fm));
  return { files: [`${subdir}/${fw}`, `${subdir}/${fm}`], bytes: { webm: w.length, m4a: m.length } };
}

function licenseBlock(spec, used) {
  const lines = [LIC_BEGIN, '', '### Âm thanh (SFX, âm môi trường)', ''];
  lines.push('Tất cả nguồn là **CC0-1.0** (không bắt buộc ghi công; vẫn ghi để tra lại). File nguồn nằm ở `../dtl-asset-source/sfx/`, khai báo xử lý trong `tools/audio/sounds.json`. Bản build trong `apps/client/public/audio/`.', '');
  lines.push('| Âm | Nguồn | Giấy phép | Ngày | Chi tiết |', '| --- | --- | --- | --- | --- |');
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, srcs] of used) {
    const packs = [...new Set(srcs.map((s) => s.pack))];
    const detail = packs
      .map((p) => {
        const P = spec.packs[p];
        const files = [...new Set(srcs.filter((s) => s.pack === p).map((s) => s.file))].join(', ');
        return `${P.title} — ${P.author} — ${P.url} — file: ${files}`;
      })
      .join('; ');
    const lic = [...new Set(packs.map((p) => spec.packs[p].license))].join(', ');
    lines.push(`| \`${id}\` | OpenGameArt (CC0) | ${lic} | ${today} | ${detail} |`);
  }
  lines.push('', LIC_END);
  return lines.join('\n');
}

function updateLicenses(block) {
  let md = fs.readFileSync(LICENSES, 'utf8');
  const s = md.indexOf(LIC_BEGIN);
  const e = md.indexOf(LIC_END);
  if (s >= 0 && e > s) {
    // Giữ ngày cũ của các dòng không đổi để build lại không làm bẩn diff.
    const old = md.slice(s, e + LIC_END.length);
    const oldDate = new Map();
    for (const line of old.split('\n')) {
      const m = /^\| `([a-z0-9_]+)` \|[^|]*\|[^|]*\| (\d{4}-\d{2}-\d{2}) \| (.*) \|$/.exec(line);
      if (m) oldDate.set(m[1], { date: m[2], detail: m[3] });
    }
    block = block
      .split('\n')
      .map((line) => {
        const m = /^(\| `([a-z0-9_]+)` \|[^|]*\|[^|]*\| )(\d{4}-\d{2}-\d{2})( \| (.*) \|)$/.exec(line);
        const o = m && oldDate.get(m[2]);
        return o && o.detail === m[5] ? m[1] + o.date + m[4] : line;
      })
      .join('\n');
    md = md.slice(0, s) + block + md.slice(e + LIC_END.length);
  } else md = md.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(LICENSES, md);
}

// ---------- chính ----------

function main() {
  const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
  const errors = [];
  for (const [id, p] of Object.entries(spec.packs)) if (!ALLOWED_LICENSES.has(p.license)) errors.push(`gói ${id}: giấy phép ${p.license} không được phép (chỉ CC0)`);
  const used = new Map();
  const note = (id, ref) => {
    const s = parseSrc(spec, ref);
    if (!fs.existsSync(s.abs)) errors.push(`${id}: thiếu file nguồn ${s.abs}`);
    if (!used.has(id)) used.set(id, []);
    used.get(id).push(s);
  };
  for (const [name, def] of Object.entries(spec.sfx)) {
    if (!spec.sprites[def.sprite]) errors.push(`sfx ${name}: sprite "${def.sprite}" chưa khai báo`);
    for (const v of def.variants) for (const l of layersOf(v)) note(`sfx_${name}`, l.src);
  }
  for (const [id, def] of Object.entries(spec.ambient)) {
    for (const l of def.layers) note(`amb_${id}`, l.src);
    for (const ev of def.events ?? []) note(`amb_${id}`, ev.src);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  if (CHECK) {
    console.log(`OK: ${Object.keys(spec.sfx).length} SFX, ${Object.keys(spec.ambient).length} âm môi trường, ${Object.keys(spec.packs).length} gói CC0.`);
    return;
  }
  FF = findFfmpeg();
  if (!FF) {
    console.error('Không tìm thấy ffmpeg có libopus + aac. Đặt FFMPEG=<đường dẫn>, cài ffmpeg vào PATH, hoặc `npm i ffmpeg-static` ở thư mục tạm rồi đặt FFMPEG.');
    process.exit(1);
  }

  const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const manifest = { sprites: {}, sfx: {}, music: old.music ?? {}, ambient: {} };
  const written = new Set();
  const sizes = [];

  // SFX theo sprite.
  for (const sprite of Object.keys(spec.sprites)) {
    const clips = [];
    let t = 0.05;
    for (const [name, def] of Object.entries(spec.sfx)) {
      if (def.sprite !== sprite) continue;
      const variants = [];
      for (const v of def.variants) {
        const a = buildSfxClip(spec, name, def, v);
        variants.push({ a, start: t });
        t += a.length / SR + GAP;
      }
      clips.push({ name, def, variants });
    }
    const buf = new Float32Array(Math.ceil((t + 0.05) * SR));
    for (const c of clips) for (const v of c.variants) buf.set(v.a, Math.round(v.start * SR));
    const enc = writeEncoded('sfx', sprite, [buf], ['-b:a', '48k'], ['-b:a', '64k'], written);
    manifest.sprites[sprite] = spec.sprites[sprite].lazy ? { src: enc.files, lazy: true } : enc.files;
    sizes.push({ file: sprite, dur: t, ...enc.bytes, lazy: !!spec.sprites[sprite].lazy });
    for (const c of clips) {
      const e = {
        variants: c.variants.map((v) => ({
          sprite,
          start: Math.floor(v.start * 1000) / 1000,
          dur: Math.ceil((v.a.length / SR) * 1000) / 1000 + 0.005,
        })),
        pitch: c.def.pitch ?? 0.07,
      };
      if (c.def.bus) e.bus = c.def.bus;
      if (c.def.duck) e.duck = c.def.duck;
      manifest.sfx[c.name] = e;
    }
  }

  // Âm môi trường.
  for (const [id, def] of Object.entries(spec.ambient)) {
    const out = renderAmbient(spec, id, def);
    const rep = loopReport(out);
    const enc = writeEncoded('amb', id, out, ['-b:a', '48k'], ['-b:a', '80k'], written);
    manifest.ambient[id] = { src: enc.files, loop: true };
    sizes.push({ file: `amb/${id}`, dur: def.len, ...enc.bytes, lazy: true, ...rep });
  }

  // Xóa bản cũ không còn dùng.
  for (const sub of ['sfx', 'amb']) {
    const dir = path.join(OUT_DIR, sub);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const p = path.join(dir, f);
      if (!written.has(p)) fs.rmSync(p);
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  updateLicenses(licenseBlock(spec, used));

  const kb = (b) => (b / 1024).toFixed(1);
  console.log('file                 dài(s)  webm KB  m4a KB  nạp');
  let tw = 0;
  let tm = 0;
  let eager = 0;
  for (const s of sizes) {
    tw += s.webm;
    tm += s.m4a;
    if (!s.lazy) eager += s.webm;
    const extra = s.seamJump !== undefined ? `  nối=${s.seamJump.toFixed(3)} chu kỳ=${s.periodicity.toFixed(2)}@${s.lag}s` : '';
    console.log(`${s.file.padEnd(20)} ${s.dur.toFixed(1).padStart(6)} ${kb(s.webm).padStart(8)} ${kb(s.m4a).padStart(7)}  ${s.lazy ? 'khi cần' : 'lúc rảnh'}${extra}`);
  }
  console.log(`Tổng webm ${(tw / 1048576).toFixed(2)} MB, m4a ${(tm / 1048576).toFixed(2)} MB (trình duyệt chỉ tải một định dạng). Nạp lúc rảnh sau khi vào trang: ${kb(eager)} KB webm.`);
  console.log(`${Object.keys(manifest.sfx).length} SFX, ${Object.keys(manifest.ambient).length} âm môi trường → ${path.relative(ROOT, MANIFEST)}`);
}

main();
