#!/usr/bin/env node
// Họa Pháp Lô 2 — V-P10 đợt 2: timeline ĐỘ KIẾP bằng sprite vẽ tay nhóm `kiep_*` (tranh đơn sắc, kiểu tô 12 = theo bảng màu timeline).
//  - `fx_kiep_tc|kd|na|hn` (S.FX `tribstart`): hai tảng mây mực kéo vào trên đầu → trời rách tại mốc nhấn `I` (+30 ms `kiep_knot`) → tia sét đầu
//    cắm xuống cạnh người, đất nứt cháy, khói. Bốn kiếp cùng hình, khác bảng màu và số tia.
//  - `fx_kiep_strike`: chỗ thiên lôi của kiếp đánh xuống (client phát tại điểm S.HAZARD lúc nổ; vạch báo đỏ do đường cũ vẽ).
// Ghi đè toàn bộ file. Dùng: node tools/vfx-forge/do-kiep.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fxDir = path.join(root, 'packages/content/data/fx');
const cardDir = path.join(root, 'packages/content/data/vfx/cards');
const r2 = (x) => Math.round(x * 100) / 100;
/** Chân so với neo `self`; K = 0,5 cho `size` = cạnh ô theo mét; mép dưới tấm billboard thấp hơn tâm GROUND × size (xem dot-pha.mjs). */
const FEET = -1.15;
const K = 0.5;
const GROUND = 0.31;

let seq = 2000;
const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], to, ...rest } = o;
  return {
    type: 'mesh',
    shape: 'sprite',
    sprite: name,
    billboard: true,
    at: 'self',
    t: 0,
    dur: 0.6,
    offset: off,
    scale: r2(size * K),
    scaleTo: r2((sizeTo ?? size) * K),
    sweep: 0,
    erodeFrom: 0.4,
    ragged: 0.5,
    tone: 'body',
    alpha: 0.95,
    tier: 0,
    seed: seq++,
    ...(to ? { move: { to: 'self', offset: to, ease: 'out' } } : {}),
    ...rest,
  };
};
const parts = (kind, t, n, o = {}) => ({
  type: 'particles',
  kind,
  t,
  n,
  speed: 2.4,
  spread: 1,
  life: 1,
  size: 0.07,
  at: 'self',
  offset: [0, 0, 0],
  tone: 'rim',
  tier: 1,
  ...o,
});
const decal = (tex, t, r, dur, o = {}) => ({
  type: 'decal',
  tex,
  t,
  r,
  dur,
  at: 'self',
  offset: [0, FEET, 0],
  grow: 0.15,
  tone: 'shadow',
  alpha: 0.75,
  tier: 0,
  ...o,
});

/** Chỗ sét chạm đất tại (x, z) so với người: mảnh đất mực bắn lên + lõi sáng (+30 ms) + hồ quang bò + khói + vết cháy/nứt. `s` = hệ số cỡ. */
const strikeAt = (t, x, z, s = 1, tier = 0) => [
  decal('scorch', t, 1.9 * s, 2.6, { offset: [x, FEET, z], tier }),
  decal('crack', t, 2.4 * s, 2.2, { offset: [x, FEET, z], tone: 'rim', alpha: 0.6, grow: 0.3, tier: 1 }),
  sprite('kiep_impact', {
    t,
    dur: 0.5,
    off: [x, r2(FEET + GROUND * 3.2 * s * 0.88), z],
    size: 2.5 * s,
    sizeTo: 3.2 * s,
    erodeFrom: 0.3,
    tier,
  }),
  sprite('kiep_knot', {
    t: r2(t + 0.03),
    dur: 0.17,
    off: [x, FEET + 0.7, z],
    size: 1.3 * s,
    sizeTo: 1.8 * s,
    tone: 'rim',
    erodeFrom: 0.35,
    tier,
  }),
  sprite('kiep_arcs', {
    t: r2(t + 0.08),
    dur: 0.5,
    off: [x, r2(FEET + GROUND * 3 * s), z],
    size: 2.6 * s,
    sizeTo: 3.2 * s,
    tone: 'rim',
    erodeFrom: 0.3,
    tier: 1,
  }),
  sprite('kiep_smoke', {
    t: r2(t + 0.18),
    dur: 1.2,
    off: [x, FEET + 1.1, z],
    to: [x, FEET + 2.5, z],
    size: 2.2 * s,
    sizeTo: 2.8 * s,
    tone: 'core',
    alpha: 0.7,
    erodeFrom: 0.25,
    tier: 1,
  }),
  parts('shard', t, Math.round(12 * s), { speed: 4.5, life: 0.6, size: 0.1, offset: [x, FEET + 0.2, z], tone: 'core', tier }),
  parts('spark', t, Math.round(16 * s), { speed: 3.4, life: 0.5, offset: [x, FEET + 0.3, z], tone: 'rim' }),
];

const impactAt = (id) => JSON.parse(fs.readFileSync(path.join(cardDir, `${id}.json`), 'utf8')).scene.impactAt;

/** Mở kiếp. `bolts`: [trễ sau I, x, z, dày] của từng tia. */
const open = (when, palette, bolts) => (I) => ({
  trigger: 'fx',
  fxKind: 'tribstart',
  ...(when ? { when } : {}),
  palette,
  events: [
    // Tụ: hai tảng mây mực phình ra hai bên chỗ trời sắp rách (đứng tại chỗ: trôi vào thì tới lúc rách vẫn còn tản xa), hạt hút lên.
    sprite('kiep_cloud', {
      t: 0,
      dur: 3.2,
      off: [-1.9, 3.7, 0],
      size: 1.6,
      sizeTo: 2.8,
      tone: 'core',
      alpha: 0.9,
      erodeFrom: 0.7,
    }),
    sprite('kiep_cloud2', {
      t: 0.08,
      dur: 3,
      off: [1.9, 3.9, 0],
      size: 1.8,
      sizeTo: 3,
      tone: 'core',
      alpha: 0.85,
      erodeFrom: 0.7,
    }),
    parts('spark', 0, 30, { speed: 3, life: r2(I * 0.9), inward: true, offset: [0, 3.8, 0], tone: 'body', tier: 0 }),
    // Vỡ: trời rách, nút sét lóe ở +30 ms.
    sprite('kiep_rift', { t: I, dur: 1.7, off: [0, 3.8, 0], size: 1.9, sizeTo: 3, tone: 'body', erodeFrom: 0.55 }),
    sprite('kiep_knot', {
      t: r2(I + 0.03),
      dur: 0.18,
      off: [0, 3.8, 0],
      size: 1.4,
      sizeTo: 2,
      tone: 'rim',
      erodeFrom: 0.35,
    }),
    { type: 'flash', t: r2(I + 0.02), amount: 0.2, tier: 0 },
    { type: 'shake', t: r2(I + 0.02), level: 0.2, tier: 1 },
    { type: 'camera', t: 0, pull: 0.1, dur: 3 },
    ...bolts.flatMap(([dt, x, z, thick], i) => [
      {
        type: 'bolt',
        t: r2(I + dt),
        at: 'self',
        offset: [x, FEET, z],
        scale: i === 0 ? 1 : 0.9,
        tone: 'body',
        seed: 30 + i,
        tier: i === 0 ? 0 : 1,
        ink: true,
        ...(thick ? { thick } : {}),
      },
      // Tia sét chạm đất ở ~12% vòng đời 0,42 s của nó.
      ...(i === 0
        ? strikeAt(r2(I + dt + 0.05), x, z, 1, 0)
        : [decal('scorch', r2(I + dt + 0.05), 1.1, 2, { offset: [x, FEET, z], tier: 1 })]),
    ]),
  ],
});

const THREE_BOLTS = [
  [0.02, 1.7, 0.5, 4.5],
  [0.45, -1.9, -0.7],
  [0.9, 0.4, -2.1],
];
const T = {
  fx_kiep_tc: open(null, 'loi', THREE_BOLTS.slice(0, 2)),
  fx_kiep_kd: open('ket_dan', 'kiep_hoa', THREE_BOLTS),
  fx_kiep_na: open('nguyen_anh', 'dotpha_na', THREE_BOLTS),
  fx_kiep_hn: open('hoa_than', 'dotpha_hn', THREE_BOLTS),
  // Phát bằng `FxRunner.startAt` tại điểm sét rơi (không kích theo S.FX); bảng màu do nơi gọi chọn (`loi` hoặc `kiep_hoa`).
  fx_kiep_strike: () => ({ palette: 'loi', events: strikeAt(0, 0, 0, 1, 0) }),
};

for (const [id, make] of Object.entries(T)) {
  seq = 2000;
  const { events, ...head } = make(impactAt(id));
  fs.writeFileSync(path.join(fxDir, `${id}.json`), JSON.stringify({ skill: id, ...head, events }, null, 2) + '\n');
  const sprites = events.filter((e) => e.shape === 'sprite').length;
  const decals = events.filter((e) => e.type === 'decal').length;
  const bolts = events.filter((e) => e.type === 'bolt').length;
  const hat = events.filter((e) => e.type === 'particles').reduce((a, e) => a + e.n, 0);
  console.log(`${id}: ${sprites} sprite + ${decals} decal + ${bolts} tia, ${hat} hạt`);
}
