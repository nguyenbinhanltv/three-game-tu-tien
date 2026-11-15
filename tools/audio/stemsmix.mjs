// Trộn lớp giao chiến (M4-13) ngoài trình duyệt: dùng cho stems.test.mjs và stems-preview.mjs.
// Bảng âm lượng STEM_MIX và hằng ATTACK/RELEASE đọc thẳng từ code client để không lệch.
import fs from 'node:fs';
import path from 'node:path';
import { decode, findFfmpeg, ROOT, SR } from './common.mjs';

const CLIENT = path.join(ROOT, 'apps/client/src/game');
const AUDIO = path.join(ROOT, 'apps/client/public/audio');

/** Đọc STEM_MIX từ musicDirector.ts. */
export function readStemMix() {
  const src = fs.readFileSync(path.join(CLIENT, 'musicDirector.ts'), 'utf8');
  const m = /STEM_MIX[^=]*=\s*(\{[\s\S]*?\n\});/.exec(src);
  if (!m) throw new Error('không thấy STEM_MIX trong musicDirector.ts');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${m[1]});`)();
}

export function readStemZones() {
  const src = fs.readFileSync(path.join(CLIENT, 'musicDirector.ts'), 'utf8');
  const m = /STEM_ZONES = \[([^\]]*)\]/.exec(src);
  return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
}

export function readRamps() {
  const src = fs.readFileSync(path.join(CLIENT, 'stemMusic.ts'), 'utf8');
  return { attack: Number(/const ATTACK = ([\d.]+)/.exec(src)[1]), release: Number(/const RELEASE = ([\d.]+)/.exec(src)[1]) };
}

export const manifest = () => JSON.parse(fs.readFileSync(path.join(AUDIO, 'manifest.json'), 'utf8'));

/** Giải mã bộ ba (nền, nhịp, căng) của vùng từ file webm trong manifest, đúng thứ tự client nạp. */
export function loadGroup(zone, kind = 'webm') {
  const ff = findFfmpeg();
  if (!ff) throw new Error('cần ffmpeg (pnpm install)');
  const m = manifest().music;
  const pick = (e) => {
    const f = e.src.find((s) => s.endsWith('.' + kind));
    if (!f) throw new Error(`thiếu .${kind}`);
    return path.join(AUDIO, f);
  };
  const entry = (role) => Object.values(m).find((e) => e.stem?.of === zone && e.stem.role === role);
  const files = { base: m[zone], pulse: entry('pulse'), edge: entry('edge') };
  if (!files.base || !files.pulse || !files.edge) throw new Error(`thiếu stem của ${zone} trong manifest`);
  return { base: decode(ff, pick(files.base), 2), pulse: decode(ff, pick(files.pulse), 2), edge: decode(ff, pick(files.edge), 2) };
}

/** Trộn tĩnh ba lớp với âm lượng `mix` ({base, pulse, edge}), bằng độ dài của lớp nền. */
export function mixStatic(g, mix) {
  const n = g.base[0].length;
  return [0, 1].map((c) => {
    const o = new Float32Array(n);
    for (const k of ['base', 'pulse', 'edge']) {
      const a = g[k][c];
      const v = mix[k];
      if (v) for (let i = 0; i < n; i++) o[i] += a[i] * v;
    }
    return o;
  });
}

/**
 * Trộn theo dòng thời gian mức giao chiến: `steps` = [[giây bắt đầu, mức], ...]. Âm lượng lớp chuyển tuyến tính như
 * client (lên trong attack giây, xuống trong release giây), vòng lặp liên tục theo mẫu.
 */
export function mixTimeline(g, table, steps, total, { attack, release }) {
  const n = g.base[0].length;
  const N = Math.round(total * SR);
  const out = [new Float32Array(N), new Float32Array(N)];
  for (const k of ['base', 'pulse', 'edge']) {
    // Đường âm lượng từng mẫu.
    let cur = table[steps[0][1]][k];
    let from = cur;
    let to = cur;
    let t0 = 0;
    let dur = 1;
    let si = 1;
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      while (si < steps.length && steps[si][0] <= t) {
        const nt = table[steps[si][1]][k];
        if (nt !== to) {
          from = cur;
          to = nt;
          t0 = steps[si][0];
          dur = to > from ? attack : release;
        }
        si++;
      }
      cur = t >= t0 + dur ? to : from + ((to - from) * (t - t0)) / dur;
      if (cur) for (let c = 0; c < 2; c++) out[c][i] += g[k][c][i % n] * cur;
    }
  }
  return out;
}
