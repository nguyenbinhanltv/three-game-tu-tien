#!/usr/bin/env node
// Họa Pháp Lô 2 — V-P10 đợt 1: timeline ĐỘT PHÁ (lên tầng + bốn cảnh giới) bằng sprite vẽ tay nhóm `dp_*` (tranh đơn sắc, kiểu tô 12 = theo bảng màu
// của timeline). Mỗi cảnh giới một hình riêng; ba nhịp tụ → vỡ tại mốc nhấn `I` (+30 ms `dp_crack`) → tan. Timeline kích theo S.FX nên mọi `t` ≥ 0:
// nhịp tụ nằm trong [0, I), `I` phải bằng `scene.impactAt` của thẻ cảnh. Ghi đè toàn bộ file (không giữ sửa tay). Dùng: node tools/vfx-forge/dot-pha.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fxDir = path.join(root, 'packages/content/data/fx');
const cardDir = path.join(root, 'packages/content/data/vfx/cards');
const r2 = (x) => Math.round(x * 100) / 100;
/** Chân nhân vật so với neo `self` (ngực). */
const FEET = -1.15;

/**
 * Tấm sprite là quad 2×2 nên K = 0,5 cho `size` = cạnh ô theo MÉT (tranh `dp_*` chiếm ~88% ô). Tấm quay mặt về camera chéo 52°: mép dưới thấp hơn tâm
 * `GROUND × size`, nên tâm phải cao hơn chân ít nhất chừng đó, không thì nền cắt ngang hình (phiến đá dùng chính điều này để "trồi lên").
 */
const GROUND = 0.31;
const K = 0.5;
let seq = 1000;
/** Sprite vẽ tay (billboard). `size`/`sizeTo` mét của ô vuông; `off` so với ngực; `up` = trôi lên bao nhiêu mét trong vòng đời. */
const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], up, ...rest } = o;
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
    ...(up ? { move: { to: 'self', offset: [off[0], r2(off[1] + up), off[2]], ease: 'out' } } : {}),
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
  life: 1.2,
  size: 0.07,
  at: 'self',
  offset: [0, -0.4, 0],
  tone: 'rim',
  tier: 1,
  ...o,
});
/** Nhịp tụ: khói xoáy thu nhỏ vào người + hạt hút vào tâm. */
const gather = (I, size, off = [0, 0.5, 0]) => [
  sprite('dp_swirl', { t: 0, dur: I, off, size, sizeTo: size * 0.42, alpha: 0.7, erodeFrom: 0.75, tone: 'core' }),
  parts('spark', 0, 36, { speed: 3.2, life: r2(I * 0.9), inward: true, tone: 'body', tier: 0 }),
];
/** Nhịp vỡ: mảnh vỏ kén bắn ra (thay sao tỏa tia) + vết rách sáng ở +30 ms (điểm nhấn) + chớp/rung nhẹ. */
const burst = (I, off, size, big = true) => [
  sprite('dp_shell', { t: I, dur: 0.45, off, size: size * 0.5, sizeTo: size, tone: 'rim', alpha: 0.9, erodeFrom: 0.25 }),
  sprite('dp_crack', { t: r2(I + 0.03), dur: 0.18, off, size: size * 0.7, sizeTo: size * 0.85, tone: 'rim', alpha: 0.95, erodeFrom: 0.35 }),
  ...(big
    ? [
        { type: 'flash', t: I, amount: 0.22, tier: 0 },
        { type: 'shake', t: I, level: 0.22, tier: 1 },
        { type: 'camera', t: 0, pull: 0.1, dur: 2.4 },
      ]
    : []),
];
/** Bóng mực trên đất: lõi tối cho nền sáng ban ngày (chuẩn 2 luật 4). */
const inkFloor = (I, r, dur = 2.2) => ({
  type: 'decal',
  tex: 'scorch',
  t: I,
  r,
  dur,
  at: 'self',
  offset: [0, FEET, 0],
  grow: 0.15,
  tone: 'shadow',
  alpha: 0.7,
  tier: 0,
});
/** Dư ba: khói mỏng bay lên + đốm sáng bốc lên. */
const linger = (I, y, size, n = 60) => [
  sprite('dp_wisp', { t: r2(I + 0.45), dur: 1.5, off: [0, y, 0], up: 1.6, size, sizeTo: size * 1.2, alpha: 0.6, erodeFrom: 0.2, tier: 1 }),
  parts('spark', r2(I + 0.05), n, { speed: 2.6, life: 2.0, grav: -2.4, tone: 'accent', tier: 0 }),
  parts('spark', r2(I + 0.2), Math.round(n * 0.6), { speed: 1.5, life: 2.2, grav: -3, size: 0.06 }),
];

const impactAt = (id) => JSON.parse(fs.readFileSync(path.join(cardDir, `${id}.json`), 'utf8')).scene.impactAt;

const T = {
  // Lên một tầng: dải mực-ngọc quấn một vòng quanh thân, đầu dải bung chùm lá. Nhỏ, không chớp/rung.
  fx_levelup(I) {
    return {
      fxKind: 'levelup',
      palette: 'len_tang',
      replaces: ['levelup'],
      events: [
        sprite('dp_ribbon', { t: 0, dur: I, off: [0, 0.2, 0], size: 2.4, sizeTo: 3.8, alpha: 0.5, erodeFrom: 0.85, tone: 'core' }),
        parts('spark', 0, 14, { speed: 2, life: r2(I), inward: true, tone: 'body', tier: 0 }),
        sprite('dp_ribbon', { t: I, dur: 0.7, off: [0, 0.4, 0], size: 4.4, sizeTo: 4.9, tone: 'core', alpha: 0.55, erodeFrom: 0.4 }),
        sprite('dp_ribbon', { t: I, dur: 0.65, off: [0, 0.4, 0], size: 4, sizeTo: 4.6, tone: 'body', erodeFrom: 0.35 }),
        sprite('dp_crack', { t: r2(I + 0.03), dur: 0.16, off: [0, 1.6, 0], size: 1.8, sizeTo: 2.2, tone: 'rim', erodeFrom: 0.35 }),
        sprite('dp_leaves', {
          t: r2(I + 0.05),
          dur: 0.75,
          off: [0, 1.7, 0],
          up: 1.2,
          size: 2.2,
          sizeTo: 3.4,
          tone: 'body',
          erodeFrom: 0.3,
        }),
        sprite('dp_wisp', {
          t: r2(I + 0.22),
          dur: 0.8,
          off: [0, 2, 0],
          up: 1,
          size: 2.4,
          sizeTo: 2.9,
          alpha: 0.55,
          erodeFrom: 0.2,
          tier: 1,
        }),
        parts('spark', r2(I + 0.05), 30, { speed: 1.8, life: 1.1, grav: -2.6, tone: 'accent', offset: [0, 0.4, 0], tier: 0 }),
      ],
    };
  },
  // Trúc Cơ "dựng nền": bốn phiến đá mực trồi nghiêng quanh chân, giữa là cuộn khói mực bốc đứng.
  fx_dotpha_tc(I) {
    // [x, z, cỡ]: bốn phiến lệch cỡ, hai phiến sau (z âm = xa camera) cao hơn để không che người.
    const slabs = [
      [-1.6, 0.5, 3.6],
      [1.5, 0.7, 3.2],
      [-1.0, -1.1, 4.6],
      [1.2, -1.0, 5],
    ];
    return {
      fxKind: 'ascend',
      palette: 'dotpha_tc',
      replaces: ['ascend'],
      events: [
        ...gather(I, 5.2),
        {
          type: 'decal',
          tex: 'crack',
          t: r2(I - 0.25),
          r: 3,
          dur: 2.6,
          at: 'self',
          offset: [0, FEET, 0],
          grow: 0.5,
          tone: 'accent',
          alpha: 0.55,
          tier: 0,
        },
        ...slabs.map(([x, z, s], i) =>
          sprite('dp_slab', {
            t: r2(I + i * 0.03),
            dur: 1.7,
            // Trồi từ dưới nền (nền cắt phần chưa nhô) lên tới lúc chân phiến vừa chạm mặt đất, rồi đứng yên (ease out).
            off: [x, r2(FEET + 0.06 * s), z],
            up: r2((GROUND * 0.88 - 0.06) * s),
            size: s * 0.92,
            sizeTo: s,
            erodeFrom: 0.62,
            tier: i < 2 ? 0 : 1,
          }),
        ),
        sprite('dp_plume', { t: I, dur: 1.9, off: [0, 1.6, 0], up: 1.2, size: 4.4, sizeTo: 7, tone: 'body', alpha: 0.85, erodeFrom: 0.35 }),
        ...burst(I, [0, 0.2, 0], 4.2),
        inkFloor(I, 2.6),
        ...linger(I, 3.2, 3.4, 80),
        parts('dust', I, 24, { speed: 3, life: 0.8, size: 0.3, offset: [0, FEET + 0.1, 0], tone: 'core' }),
      ],
    };
  },
  // Kết Đan "ngưng đan": khói xoáy thu vào một viên đan vỏ mực trên đỉnh đầu, vỏ nứt rồi vỡ, hai vòng đan vân lệch tâm trôi ra.
  fx_dotpha_kd(I) {
    const P = [0, 1.75, 0];
    return {
      fxKind: 'ascend',
      when: 'ket_dan',
      palette: 'dotpha_kd',
      replaces: ['ascend'],
      events: [
        ...gather(I, 6, [0, 0.9, 0]),
        sprite('dp_pill', { t: r2(I - 0.3), dur: 0.3, off: P, size: 0.5, sizeTo: 1.3, tone: 'core', alpha: 0.9, erodeFrom: 0.95 }),
        sprite('dp_pill', { t: I, dur: 1.5, off: P, size: 1.5, sizeTo: 1.9, tone: 'body', erodeFrom: 0.6, follow: true }),
        ...burst(I, P, 4),
        sprite('dp_orbit', {
          t: r2(I + 0.05),
          dur: 1.7,
          off: [0.3, 1.5, 0],
          size: 3,
          sizeTo: 6.4,
          tone: 'body',
          alpha: 0.85,
          erodeFrom: 0.45,
        }),
        sprite('dp_orbit', {
          t: r2(I + 0.16),
          dur: 1.5,
          off: [-0.4, 1.9, 0],
          size: 2.2,
          sizeTo: 4.6,
          tone: 'accent',
          alpha: 0.75,
          erodeFrom: 0.45,
          tier: 1,
        }),
        sprite('dp_orbit', {
          t: r2(I + 0.05),
          dur: 1.5,
          off: [0.3, 1.4, 0],
          size: 3.3,
          sizeTo: 6.8,
          tone: 'core',
          alpha: 0.5,
          erodeFrom: 0.35,
          tier: 1,
        }),
        inkFloor(I, 2.4),
        ...linger(I, 2.6, 3, 90),
      ],
    };
  },
  // Nguyên Anh "sen nở": búp sen mực khép quanh người, nở tám cánh, hài nhi sáng ngồi trên đỉnh.
  fx_dotpha_na(I) {
    return {
      fxKind: 'ascend',
      when: 'nguyen_anh',
      palette: 'dotpha_na',
      replaces: ['ascend'],
      events: [
        sprite('dp_bud', { t: 0, dur: I, off: [0, 0.5, 0], size: 2.6, sizeTo: 3.5, tone: 'core', alpha: 0.55, erodeFrom: 0.9 }),
        parts('spark', 0, 36, { speed: 3.2, life: r2(I * 0.9), inward: true, tone: 'body', tier: 0 }),
        sprite('dp_lotus', {
          t: I,
          dur: 2.1,
          off: [0, 0.75, 0],
          size: 4.4,
          sizeTo: 6.6,
          tone: 'core',
          alpha: 0.6,
          erodeFrom: 0.45,
          tier: 1,
        }),
        sprite('dp_lotus', { t: I, dur: 2.0, off: [0, 0.75, 0], size: 4, sizeTo: 6.2, tone: 'body', erodeFrom: 0.5 }),
        ...burst(I, [0, 0.4, 0], 4.2),
        sprite('dp_infant', {
          t: r2(I + 0.1),
          dur: 2.0,
          off: [0, 3, 0],
          up: 0.3,
          size: 1.2,
          sizeTo: 1.7,
          tone: 'rim',
          erodeFrom: 0.7,
          follow: true,
        }),
        sprite('dp_petal', { t: r2(I + 0.3), dur: 1.6, off: [-1.9, 2.6, 0.4], up: -1.8, size: 1.6, alpha: 0.85, erodeFrom: 0.5, tier: 1 }),
        sprite('dp_petal', { t: r2(I + 0.5), dur: 1.6, off: [1.8, 3.0, -0.3], up: -2, size: 1.3, alpha: 0.85, erodeFrom: 0.5, tier: 1 }),
        inkFloor(I, 2.8),
        ...linger(I, 2.8, 3.2, 90),
        parts('petal', r2(I + 0.1), 40, { speed: 2.2, life: 2.2, size: 0.12, offset: [0, 1.5, 0], tone: 'body' }),
      ],
    };
  },
  // Hóa Thần "thần hồn xuất": bóng thần hồn cao gấp ba vươn lên sau lưng, hai vạt mây mực rách xòe hai bên, rồi thu về nhập thân.
  fx_dotpha_hn(I) {
    return {
      fxKind: 'ascend',
      when: 'hoa_than',
      palette: 'dotpha_hn',
      replaces: ['ascend'],
      events: [
        ...gather(I, 5),
        sprite('dp_spirit', {
          t: r2(I - 0.4),
          dur: 0.4,
          off: [0, 0.8, -0.8],
          up: 0.8,
          size: 2,
          sizeTo: 3.6,
          tone: 'core',
          alpha: 0.4,
          erodeFrom: 0.9,
          awayFromCam: true,
        }),
        sprite('dp_mantle', {
          t: I,
          dur: 1.6,
          off: [0, 2.1, -1.2],
          size: 5.5,
          sizeTo: 8.4,
          tone: 'core',
          alpha: 0.8,
          erodeFrom: 0.45,
          awayFromCam: true,
        }),
        sprite('dp_mantle', {
          t: r2(I + 0.06),
          dur: 1.4,
          off: [0, 2.1, -1.1],
          size: 4.6,
          sizeTo: 7.2,
          tone: 'body',
          alpha: 0.6,
          erodeFrom: 0.4,
          awayFromCam: true,
          tier: 1,
        }),
        sprite('dp_spirit', {
          t: I,
          dur: 1.45,
          off: [0, 2.3, -0.9],
          up: 0.4,
          size: 5,
          sizeTo: 6.2,
          tone: 'body',
          alpha: 0.9,
          erodeFrom: 0.75,
          awayFromCam: true,
        }),
        // Nhập lại: bóng co nhỏ dần về phía người.
        sprite('dp_spirit', {
          t: r2(I + 1.35),
          dur: 0.55,
          off: [0, 2.2, -0.8],
          up: -1.4,
          size: 5.6,
          sizeTo: 2,
          tone: 'rim',
          alpha: 0.6,
          erodeFrom: 0.3,
          awayFromCam: true,
          tier: 1,
        }),
        ...burst(I, [0, 0.6, 0], 4.4),
        inkFloor(I, 2.8),
        ...linger(I, 3.4, 3.6, 90),
      ],
    };
  },
};

for (const [id, make] of Object.entries(T)) {
  seq = 1000;
  const { events, ...head } = make(impactAt(id));
  const tl = { skill: id, trigger: 'fx', ...head, events };
  fs.writeFileSync(path.join(fxDir, `${id}.json`), JSON.stringify(tl, null, 2) + '\n');
  const sprites = events.filter((e) => e.shape === 'sprite').length;
  const decals = events.filter((e) => e.type === 'decal').length;
  const hat = events.filter((e) => e.type === 'particles').reduce((a, e) => a + e.n, 0);
  console.log(`${id}: ${sprites} sprite + ${decals} decal = ${sprites + decals} draw, ${hat} hạt`);
}
