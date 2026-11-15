#!/usr/bin/env node
// Bản nghe thử (MP3) phần âm thanh P2-D2/D3: đi bộ qua sân đá (đèn lồng, chuông xa) → đường đất → cỏ → cát ven hồ → lội nước.
//
//   node tools/audio/walkthrough/walkthrough.mjs --out <file.mp3>
//
// Không phải ghi âm từ trình duyệt: lộ trình, chất liệu mặt đất, nhịp bước, nguồn theo vị trí và lịch chuông do CHÍNH code của game
// quyết định (route.ts chạy surface.ts, footsteps.ts, soundscape.ts), rồi script này trộn lại bằng công thức giống client:
// mức bus theo apps/client/src/game/audioMix.json, suy giảm khoảng cách kiểu "inverse" của PannerNode, pan công suất bằng nhau theo hướng camera.
// Gần đúng, đủ để nghe tương quan giữa nhạc / môi trường / bước chân / nguồn vị trí. Tổng mức được nâng lên −20 LUFS cho dễ nghe
// (tương quan giữa các lớp giữ nguyên); trong game mọi thứ nhỏ hơn theo thanh trượt âm lượng của người chơi.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decode, FFMPEG_HELP, findFfmpeg, ROOT, SR } from '../common.mjs';
import { loudness } from '../loopcore.mjs';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || out.startsWith('--')) {
  console.error('Cách dùng: node tools/audio/walkthrough/walkthrough.mjs --out <file.mp3>');
  process.exit(1);
}
const ff = findFfmpeg();
if (!ff) {
  console.error(FFMPEG_HELP);
  process.exit(1);
}

// 1) Chạy route.ts bằng tsx (cần chạy từ apps/client để phân giải @dtl/*).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-walk-'));
const tsxDir = fs.readdirSync(path.join(ROOT, 'node_modules/.pnpm')).find((d) => d.startsWith('tsx@'));
if (!tsxDir) throw new Error('chưa cài tsx (pnpm install)');
const tsx = path.join(ROOT, 'node_modules/.pnpm', tsxDir, 'node_modules/tsx/dist/cli.mjs');
const r = spawnSync(process.execPath, [tsx, path.join(ROOT, 'tools/audio/walkthrough/route.ts'), tmp], { cwd: path.join(ROOT, 'apps/client'), encoding: 'utf8' });
process.stdout.write(r.stdout);
if (r.status !== 0) {
  process.stderr.write(r.stderr);
  process.exit(1);
}
const ev = JSON.parse(fs.readFileSync(path.join(tmp, 'events.json'), 'utf8'));
const crackleRaw = fs.readFileSync(path.join(tmp, 'crackle.f32'));
const crackle = new Float32Array(crackleRaw.buffer, crackleRaw.byteOffset, crackleRaw.byteLength / 4);

// 2) Nguồn âm đã build.
const AUDIO = path.join(ROOT, 'apps/client/public/audio');
const man = JSON.parse(fs.readFileSync(path.join(AUDIO, 'manifest.json'), 'utf8'));
const MIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/client/src/game/audioMix.json'), 'utf8')).bus;
const pick = (src) => (Array.isArray(src) ? src.find((s) => s.endsWith('.webm')) ?? src[0] : src);
const cache = new Map();
const dec = (rel, ch) => {
  const k = rel + ch;
  if (!cache.has(k)) cache.set(k, decode(ff, path.join(AUDIO, rel), ch));
  return cache.get(k);
};
const SYNTH_GAIN = 0.22;
const TAIL = 5;
const XFADE = 0.6;

let rs = 12345;
const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);

function interp(track, t) {
  let i = 0;
  while (i < track.length - 2 && track[i + 1].t < t) i++;
  const a = track[i];
  const b = track[Math.min(i + 1, track.length - 1)];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: a.yaw + (b.yaw - a.yaw) * f };
}

/** Suy giảm "inverse" của PannerNode và pan công suất bằng nhau (hướng nhìn của camera). */
function spatial(track, t, sx, sz, k) {
  const L = interp(track, t);
  const dx = sx - L.x;
  const dz = sz - L.z;
  const d = Math.max(1e-3, Math.hypot(dx, dz));
  const dg = k.ref / (k.ref + k.rolloff * (Math.max(d, k.ref) - k.ref));
  const pan = d < 1.5 ? 0 : (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d;
  const ang = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return { g: dg, l: Math.cos(ang), r: Math.sin(ang), d };
}

const lowpass2 = (a, hz) => {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / SR);
  for (let p = 0; p < 2; p++) {
    let y = 0;
    for (let i = 0; i < a.length; i++) a[i] = y += k * (a[i] - y);
  }
  return a;
};

function resample(a, rate) {
  const n = Math.floor((a.length - 1) / rate);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    o[i] = a[k] * (1 - (p - k)) + a[k + 1] * (p - k);
  }
  return o;
}

const STEP_SFX = { stone: 'step_stone', grass: 'step_grass', dirt: 'step_dirt', sand: 'step_sand', wood: 'step_wood', water: 'step_water' };
const ZONE = { sect: { music: 'sect', amb: 'forest' }, wild: { music: 'wild', amb: 'wind' }, lake: { music: 'lake', amb: 'stream' } };

function renderClip(c) {
  const N = Math.round((c.dur + TAIL) * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const add = (mono, at, g, pl = 1, pr = 1) => {
    const o = Math.round(at * SR);
    for (let i = 0; i < mono.length && o + i < N; i++) {
      L[o + i] += mono[i] * g * pl;
      R[o + i] += mono[i] * g * pr;
    }
  };
  // Nhạc và môi trường: stream, bắt đầu ở đoạn ngẫu nhiên, vào/ra mờ dần.
  for (const [bus, id] of [['music', ZONE[c.zone].music], ['ambient', ZONE[c.zone].amb]]) {
    const e = man[bus][id];
    const s = dec(pick(e.src), 2);
    const off = Math.floor(rnd() * Math.max(1, s[0].length - N));
    const g = MIX[bus] * (e.gain ?? 1);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const env = Math.min(1, t / XFADE) * Math.min(1, Math.max(0, (c.dur + TAIL - t) / 2));
      L[i] += s[0][(off + i) % s[0].length] * g * env;
      R[i] += s[1][(off + i) % s[1].length] * g * env;
    }
  }
  // Bước chân của mình (giữa, bus sfx).
  for (const f of c.footsteps) {
    const e = man.sfx[STEP_SFX[f.surface]];
    const v = e.variants[Math.floor(rnd() * e.variants.length)];
    const sprite = man.sprites[v.sprite];
    const buf = dec(pick(sprite.src ?? sprite), 1)[0];
    let clip = buf.slice(Math.round(v.start * SR), Math.round((v.start + v.dur) * SR));
    clip = resample(clip, 1 + (rnd() * 2 - 1) * (e.pitch ?? 0.05));
    add(clip, f.t, f.vol * MIX.sfx);
  }
  // Nguồn theo vị trí: lặp bộ đệm, độ to và pan đổi theo từng mẫu.
  const water = dec(pick(man.ambient.water.src), 1)[0];
  const mono = (b) => b;
  for (const s of c.sources) {
    if (s.kind === 'bell') continue;
    const k = ev.kinds[s.kind];
    const buf = mono(s.kind === 'lantern' ? crackle : water);
    const rate = s.kind === 'lantern' ? 0.9 + rnd() * 0.2 : 0.97 + rnd() * 0.06;
    const off = rnd() * buf.length;
    const i0 = Math.round(s.t0 * SR);
    const i1 = Math.min(N, Math.round(s.t1 * SR) + Math.round(0.8 * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR;
      const fin = Math.min(1, (t - s.t0) / 1.2);
      const fout = t > s.t1 ? Math.max(0, 1 - (t - s.t1) / 0.8) : 1;
      const sp = spatial(c.track, Math.min(t, c.dur), s.x, s.z, k);
      const p = (off + (i - i0) * rate) % (buf.length - 1);
      const k0 = Math.floor(p);
      const v = buf[k0] * (1 - (p - k0)) + buf[k0 + 1] * (p - k0);
      const g = v * k.gain * sp.g * fin * fout * MIX.ambient;
      L[i] += g * sp.l;
      R[i] += g * sp.r;
    }
  }
  // Chuông: bồi âm tắt theo hàm mũ như tone() của audio.ts, thông thấp 2,8 kHz, qua bus môi trường.
  for (const b of c.bells) {
    const k = ev.kinds.bell;
    const sp = spatial(c.track, Math.min(b.t, c.dur), b.x, b.z, k);
    const tailLen = Math.round(7 * SR);
    const strike = new Float32Array(tailLen);
    for (const p of ev.bell) {
      const d0 = Math.round(p.delay * SR);
      const n = Math.min(Math.round(p.dur * SR), tailLen - d0);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const att = Math.min(1, t / 0.012);
        const amp = p.gain * Math.pow(0.0001 / p.gain, Math.max(0, t - 0.012) / Math.max(0.001, p.dur - 0.012));
        strike[d0 + i] += Math.sin(2 * Math.PI * p.freq * t) * amp * att;
      }
    }
    lowpass2(strike, 2800);
    add(strike, b.t, SYNTH_GAIN * k.gain * MIX.ambient * sp.g, sp.l, sp.r);
  }
  return { L, R };
}

// 3) Ghép các đoạn (chồng mờ XFADE) rồi chuẩn hóa -20 LUFS.
const parts = ev.clips.map(renderClip);
let total = 0;
const starts = [];
parts.forEach((_, i) => {
  starts.push(total);
  total += Math.round(ev.clips[i].dur * SR) - (i < parts.length - 1 ? Math.round(XFADE * SR) : 0);
});
const len = total + Math.round(TAIL * SR);
const mixL = new Float32Array(len);
const mixR = new Float32Array(len);
parts.forEach((p, i) => {
  const o = starts[i];
  const fadeIn = i === 0 ? 0 : Math.round(XFADE * SR);
  const cutOut = i === parts.length - 1 ? p.L.length : Math.round(ev.clips[i].dur * SR);
  for (let k = 0; k < p.L.length && o + k < len; k++) {
    // Chiều dài đoạn trước đuôi chuông gối lên đoạn sau: chỉ làm mờ phần đầu đoạn sau (nhạc/môi trường đã mờ vào ở renderClip).
    let g = 1;
    if (k < fadeIn) g = k / fadeIn;
    if (k > cutOut) g = Math.max(0, 1 - (k - cutOut) / (TAIL * SR));
    mixL[o + k] += p.L[k] * g;
    mixR[o + k] += p.R[k] * g;
  }
});
const lufs = loudness([mixL, mixR]);
let gain = 10 ** ((-20 - lufs) / 20);
let pk = 0;
for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(mixL[i]), Math.abs(mixR[i]));
if (pk * gain > 0.89) gain = 0.89 / pk;
const inter = new Float32Array(len * 2);
for (let i = 0; i < len; i++) {
  inter[i * 2] = mixL[i] * gain;
  inter[i * 2 + 1] = mixR[i] * gain;
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const enc = spawnSync(
  ff,
  ['-y', '-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '192k', '-metadata', 'title=Dap Thien Lo - nghe thu P2-D2/D3', path.resolve(out)],
  { input: Buffer.from(inter.buffer), maxBuffer: 1 << 28 },
);
if (enc.status !== 0) {
  console.error(enc.stderr.toString());
  process.exit(1);
}
console.log(`đã ghi ${out}: ${(len / SR).toFixed(1)} s, gốc ${lufs.toFixed(1)} LUFS → nâng ${(20 * Math.log10(gain)).toFixed(1)} dB, đỉnh ${(20 * Math.log10(pk * gain)).toFixed(1)} dBFS`);
fs.rmSync(tmp, { recursive: true, force: true });
