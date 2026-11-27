#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Hồn tu: dựng lại timeline 11 chiêu theo concept Codex đã duyệt (sprite vẽ tay trong `vfx_sprites.webp`).
// Mỗi chiêu một hình riêng (bàn tay hồn, vuốt, lính giáo, phướn, lốc, vòng khói + mặt hồn, sợi hồn chữ S, sóng, bàn tay + xích, chùm mặt hồn) và ba nhịp rõ:
//   báo trước (t < 0): bản mờ nhỏ của hình + hạt hút vào (tụ khí);  trúng (t = 0): hình bật gần đủ cỡ + một lớp sáng lạnh ngắn (điểm nhấn +30 ms);
//   dư ba (t ≥ 0,17): hình mỏng dần như khói + sợi hồn bay lên.
// Chạy lại an toàn: bỏ mọi sự kiện mesh seed >= 1000 rồi thêm lại; giữ nguyên âm thanh, rung, hitstop, hạt viết tay. Dùng: node tools/vfx-forge/hon-tu.mjs [id...]
import fs from 'node:fs';

const r2 = (x) => Math.round(x * 100) / 100;
let seq = 1000;
const S = () => seq++;
const mesh = (o) => ({
  type: 'mesh',
  t: 0,
  dur: 0.7,
  at: 'target',
  sweep: 0,
  erodeFrom: 0.5,
  ragged: 0.5,
  tone: 'body',
  alpha: 0.95,
  tier: 0,
  seed: S(),
  ...o,
});
/** Hệ số cỡ theo chiêu (đo phủ bằng `cover.mjs` rồi chỉnh cho sát trần: chiêu thường ≤ 0,2, chiêu cuối ≤ 0,35). */
let K = 1;
const SCALE = { skl_tat_dau_thanh_binh: 1.35, skl_hoang_tuyen_dan: 1.1 };
/** Sprite vẽ tay (billboard). `size` mét (ô vuông), `off` offset tâm. */
const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], ...rest } = o;
  return mesh({
    shape: 'sprite',
    sprite: name,
    billboard: true,
    offset: off,
    scale: r2(size * K),
    scaleTo: r2((sizeTo ?? size) * K),
    ...rest,
  });
};
/** Khói thấp dưới chân (billboard ink_smoke), mờ: chỉ để nối hình với mặt đất, không phủ khối đặc. */
const puff = (at, off, sc, t, a = 0.5, dur = 0.8) =>
  mesh({ shape: 'flip', flip: 'ink_smoke', t, dur, at, offset: off, scale: sc, billboard: true, alpha: a, tone: 'shadow', erodeFrom: 0.3 });
const sparks = (at, off, n, t, extra = {}) => ({
  type: 'particles',
  kind: 'spark',
  t,
  n,
  speed: 3.5,
  spread: 1,
  life: 0.35,
  size: 0.07,
  at,
  offset: off,
  tone: 'rim',
  tier: 1,
  ...extra,
});
/** Tụ khí báo trước: hạt sáng hút vào tâm. */
const pullIn = (at, off, t = -0.26) => sparks(at, off, 12, t, { speed: 1.7, life: 0.26, inward: true });

/**
 * Nhịp trúng: hình chính bật ra ở 80% cỡ rồi lớn dần, mỏng dần từ `erodeFrom`; `flash` thêm bản sáng lạnh to hơn chút sống 0,18 s (điểm nhấn khung +30 ms).
 */
const strike = (name, o) => {
  const { size, off, move, flash = false, t = 0, dur = 0.5, alpha = 0.92, erodeFrom = 0.05, ...rest } = o;
  const end = move?.offset ?? off;
  const out = [sprite(name, { t, dur, off, size: size * 0.8, sizeTo: size, alpha, erodeFrom, move, ...rest })];
  if (flash)
    out.push(
      sprite(name, { t, dur: 0.18, off: end, size: size * 1.02, sizeTo: size * 1.1, alpha: 0.4, tone: 'rim', erodeFrom: 0.15, ...rest }),
    );
  return out;
};
/** Báo trước: bản mờ nhỏ của hình (sống 0,28 s trước khi trúng). */
const gather = (name, o) => {
  const { size, off, t = -0.28, rest = {} } = o;
  return [sprite(name, { t, dur: 0.28, off, size: size * 0.5, sizeTo: size * 0.72, alpha: 0.38, erodeFrom: 0.8, ...rest })];
};
/** Dư ba: sợi hồn/khói bay lên từ chỗ trúng. */
const after = (at, off, size = 2.2, t = 0.17, up = 1.6, name = 'hon_wisps') =>
  sprite(name, {
    t,
    dur: 0.7,
    at,
    off,
    size,
    alpha: 0.6,
    erodeFrom: 0.25,
    move: { to: at, offset: [off[0], off[1] + up, off[2]], ease: 'out' },
  });

const SPEC = {
  // Phệ Hồn: bàn tay hồn năm ngón chộp từ trên xuống.
  skl_phe_hon: () => [
    ...gather('hon_hand_claw', { size: 3.9, off: [0.8, 4.2, 0] }),
    pullIn('target', [0, 1.5, 0]),
    ...strike('hon_hand_claw', { size: 3.9, off: [0.5, 3.6, 0], flash: true, move: { to: 'target', offset: [0.3, 2.6, 0], ease: 'out' } }),
    puff('target', [0, 0.35, 0], 1.8, 0.02),
    after('target', [0, 1.6, 0], 2, 0.17, 1.8),
    sparks('target', [0, 1.4, 0], 10, 0),
  ],
  // Âm Ảnh Bộ: bóng trùm đen lướt, đuôi roi khói dẹt dài (chiêu lướt kích theo S.FX: mọi mốc ≥ 0, không có báo trước trên timeline).
  skl_u_anh_bo: () => [
    ...strike('hon_wraith', {
      size: 2.4,
      at: 'self',
      off: [0, 1.5, 0.5],
      flash: true,
      dur: 0.9,
      move: { to: 'ahead', offset: [0, 1.5, 4], ease: 'out' },
    }),
    sprite('hon_whips', {
      t: 0.02,
      dur: 0.9,
      at: 'self',
      off: [0, 1.2, -0.5],
      size: 3.1,
      alpha: 0.7,
      erodeFrom: 0.3,
      move: { to: 'ahead', offset: [0, 1.2, 2.5], ease: 'out' },
    }),
    ...[0, 1, 2].map((i) => puff('ahead', [0, 0.8, 1.2 + i * 1.6], 1.7 - i * 0.2, i * 0.03, 0.4, 0.8)),
    after('ahead', [0, 1.2, 3], 2.1, 0.2, 1.2),
    sparks('ahead', [0, 1.2, 5], 8, 0.2),
  ],
  // Tất Đầu Thành Binh (chiêu cuối): ba hồn binh cầm giáo đứng thế tam giác quanh người, chân tan thành khói.
  skl_tat_dau_thanh_binh: () => {
    const P = [
      [-2.9, 1.0],
      [2.9, 1.0],
      [0, -2.6],
    ];
    return [
      ...P.flatMap(([x, z]) => gather('hon_soldier', { size: 3.1, off: [x, 1.5, z], rest: { at: 'self' } })),
      pullIn('self', [0, 1.2, 0], -0.24),
      ...P.flatMap(([x, z], i) =>
        strike('hon_soldier', { size: 3.1, at: 'self', off: [x, 1.55, z], flash: i === 0, dur: 0.95, erodeFrom: 0.08 }),
      ),
      ...P.map(([x, z]) => puff('self', [x, 0.3, z], 1.4, 0.02, 0.4, 0.9)),
      after('self', [0, 1.3, 0], 3.2, 0.2, 1.5),
      sparks('self', [0, 1.5, 0], 10, 0.3),
    ];
  },
  // Tế Phiên: phướn có cán + dải vải uốn chữ S dựng sau lưng.
  skl_te_phien: () => [
    ...gather('hon_banner', { size: 3.6, off: [0.8, 1.6, 0], rest: { at: 'self' } }),
    pullIn('self', [0.8, 0.6, 0]),
    ...strike('hon_banner', { size: 3.6, at: 'self', off: [0.8, 2.0, 0], flash: true, dur: 0.95, erodeFrom: 0.1 }),
    puff('self', [0.8, 0.3, 0], 1.6, 0, 0.45, 1),
    after('self', [0.4, 0.9, 0.3], 2, 0.17, 1.4),
    sparks('self', [0.8, 3.4, 0], 8, 0.25),
  ],
  // Hồn Trảo: ba vệt vuốt khói cào chéo, bàn tay hồn mờ phía sau.
  skl_hon_trao: () => [
    ...gather('hon_hand_claw', { size: 3.2, off: [-0.8, 2.6, 0] }),
    pullIn('target', [0, 1.4, 0], -0.2),
    ...strike('hon_claws3', { size: 4.4, off: [0, 2.6, 0], flash: true, dur: 0.24, erodeFrom: 0.12 }),
    sprite('hon_hand_claw', { t: -0.04, dur: 0.4, off: [-0.8, 3.0, 0], size: 3.2, alpha: 0.5, erodeFrom: 0.2 }),
    after('target', [0.3, 2.6, 0], 2.1, 0.19, 1.6),
    sparks('target', [0, 1.3, 0], 10, 0),
  ],
  // Âm Phong: lốc phễu xoáy cao quanh mục tiêu, sợi hồn và mặt hồn bị cuốn lên.
  skl_am_phong: () => [
    ...gather('hon_tornado', { size: 3.6, off: [0, 5.6, 0] }),
    pullIn('target', [0, 1.2, 0], -0.22),
    ...strike('hon_tornado', { size: 4.2, off: [0, 6.4, 0], flash: true, dur: 0.3, erodeFrom: 0.08 }),
    sprite('hon_tornado', { t: 0.05, dur: 0.3, off: [0.3, 5.8, -0.2], size: 3.2, alpha: 0.4, erodeFrom: 0.2 }),
    puff('target', [0, 0.35, 0], 1.6, 0, 0.2, 0.4),
    after('target', [0, 4.4, 0], 3, 0.17, 1.5),
    ...[0, 1, 2].map((i) =>
      sprite('hon_face_grin', {
        t: 0.08 + i * 0.05,
        dur: 0.6,
        off: [r2(Math.cos(i * 2.1) * 2.4), 2.6, r2(Math.sin(i * 2.1) * 2.4)],
        size: 1.2,
        alpha: 0.75,
        erodeFrom: 0.3,
        move: { to: 'target', offset: [r2(Math.cos(i * 2.1 + 2)), 3.5, r2(Math.sin(i * 2.1 + 2))], ease: 'out' },
      }),
    ),
    sparks('target', [0, 1.8, 0], 10, 0.04),
  ],
  // Hồn Chướng: vòng màn khói hồn bao thân (giữa rỗng để thấy người), mặt hồn mờ lộ trong nếp khói.
  skl_hon_chuong: () => [
    ...gather('hon_ring', { size: 3.4, off: [0, 0.9, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 1, 0], -0.24),
    ...strike('hon_ring', { size: 3.4, at: 'self', off: [0, 0.95, 0], flash: true, dur: 1.0, erodeFrom: 0.1 }),
    sprite('hon_veil', { t: 0.04, dur: 1.2, at: 'self', off: [0, 1.5, -0.4], size: 3.0, alpha: 0.55, erodeFrom: 0.35 }),
    sprite('hon_face_pale', { t: 0.08, dur: 1.1, at: 'self', off: [0, 2.7, -0.2], size: 1.9, alpha: 0.85, erodeFrom: 0.4 }),
    after('self', [0, 1.4, 0], 2.4, 0.2, 1.5),
    sparks('self', [0, 1.6, 0], 8, 0.1),
  ],
  // Sưu Hồn Thuật: sợi hồn chữ S rút từ mục tiêu về người ra chiêu, đầu mũi là quả cầu hồn sáng.
  skl_suu_hon_thuat: () => [
    ...gather('hon_thread_s1', { size: 3.6, off: [0, 3.8, 0] }),
    pullIn('target', [0, 1.3, 0], -0.2),
    ...strike('hon_thread_s1', { size: 4.2, off: [0, 4.4, -1.6], flash: true, dur: 0.28, erodeFrom: 0.12 }),
    sprite('hon_thread_s2', { t: 0.04, dur: 0.26, off: [0, 4.0, -1.8], size: 3.4, alpha: 0.45, erodeFrom: 0.15 }),
    sprite('hon_orb', {
      t: 0,
      dur: 0.55,
      off: [0, 2.8, 0],
      size: 1.6,
      sizeTo: 1.3,
      alpha: 0.98,
      erodeFrom: 0.7,
      move: { to: 'self', offset: [0, 1.4, 0], ease: 'in' },
    }),
    after('self', [0, 1.3, 0], 1.8, 0.3, 1.2),
    sparks('self', [0, 1.4, 0], 12, 0.4, { speed: 1.6, life: 0.3, inward: true }),
  ],
  // Âm Hồn Triều: sóng khói thấp tràn ngang, đầu sóng cuộn, mặt nạ hồn lớn ở đầu sóng.
  skl_am_hon_trieu: () => [
    ...gather('hon_wave', { size: 3.6, off: [0, 1.0, 1.6], rest: { at: 'ahead' } }),
    ...strike('hon_wave', {
      size: 3.7,
      at: 'ahead',
      off: [0, 1.4, 3],
      flash: true,
      dur: 0.85,
      erodeFrom: 0.25,
      move: { to: 'ahead', offset: [0, 1.5, 10], ease: 'out' },
    }),
    sprite('hon_face_scream', {
      t: 0.04,
      dur: 0.8,
      at: 'ahead',
      off: [0, 2.3, 2.4],
      size: 2.1,
      sizeTo: 2.3,
      alpha: 0.9,
      erodeFrom: 0.3,
      move: { to: 'ahead', offset: [0, 2.4, 9.4], ease: 'out' },
    }),
    sprite('hon_face_pale', {
      t: 0.1,
      dur: 0.75,
      at: 'ahead',
      off: [-1.3, 1.5, 1.5],
      size: 1.3,
      alpha: 0.75,
      erodeFrom: 0.3,
      move: { to: 'ahead', offset: [-1.3, 1.5, 7], ease: 'out' },
    }),
    after('ahead', [0, 1.3, 6], 2.2, 0.2, 1.2),
    sparks('ahead', [0, 1.8, 8], 8, 0.2),
  ],
  // Định Thần Thuật: bàn tay hồn xòe ấn từ trên xuống, xích khói quấn quanh thân mục tiêu.
  skl_dinh_than_thuat: () => [
    ...gather('hon_hand_press', { size: 4, off: [0, 5.6, 0] }),
    pullIn('target', [0, 1.2, 0], -0.22),
    ...strike('hon_hand_press', { size: 4, off: [0, 5.6, 0], flash: true, dur: 0.36, move: { to: 'target', offset: [0, 4.2, 0], ease: 'out' } }),
    sprite('hon_chain', {
      t: 0.02,
      dur: 0.45,
      off: [-2.4, 1.0, 0],
      size: 2.3,
      alpha: 0.95,
      rot: [0, 0, 25],
      erodeFrom: 0.3,
      move: { to: 'target', offset: [-1.9, 1.1, 0], ease: 'out' },
    }),
    sprite('hon_chain', {
      t: 0.04,
      dur: 0.45,
      off: [2.4, 1.1, 0],
      size: 2.2,
      alpha: 0.9,
      rot: [0, 0, -155],
      erodeFrom: 0.3,
      move: { to: 'target', offset: [1.9, 1.2, 0], ease: 'out' },
    }),
    after('target', [0, 3.6, 0], 2.2, 0.2, 1.5),
    sparks('target', [0, 1.3, 0], 10, 0),
  ],
  // Hoàng Tuyền Đạn: cầu hồn tụ khí rồi nổ thành chùm mặt hồn (thét, sọ, sầu, quỷ sừng, bóng trùm) bay tỏa ra, kéo đuôi khói về tâm.
  skl_hoang_tuyen_dan: () => {
    const NAMES = [
      'hon_face_scream',
      'hon_face_grin',
      'hon_face_horn',
      'hon_face_sad',
      'hon_wraith',
      'hon_face_pale',
      'hon_face_scream',
      'hon_face_horn',
    ];
    return [
      sprite('hon_orb', { t: -0.27, dur: 0.3, off: [0, 1.5, 0], size: 1.2, sizeTo: 2.2, alpha: 0.95, erodeFrom: 0.9 }),
      pullIn('target', [0, 1.5, 0], -0.27),
      sprite('hon_orb', { t: 0, dur: 0.14, off: [0, 1.5, 0], size: 1.6, sizeTo: 2.2, alpha: 0.7, tone: 'rim', erodeFrom: 0.2 }),
      ...NAMES.map((nm, i) => {
        const a = (i / NAMES.length) * Math.PI * 2 + 0.3;
        return sprite(nm, {
          t: 0.01 * i,
          dur: 0.45,
          off: [r2(Math.cos(a) * 2.4), r2(3.4 + Math.max(0, Math.sin(a)) * 2.6), r2(Math.sin(a) * 2.4)],
          size: 1.7,
          sizeTo: 2,
          alpha: 0.92,
          erodeFrom: 0.15,
          move: { to: 'target', offset: [r2(Math.cos(a) * 4.8), r2(3.6 + (i % 2) * 0.6 + Math.max(0, Math.sin(a)) * 2.6), r2(Math.sin(a) * 4.8)], ease: 'out' },
        });
      }),
      sprite('hon_swarm9', { t: 0.02, dur: 0.16, off: [0, 4.6, 0], size: 3.2, alpha: 0.5, erodeFrom: 0.12 }),
      after('target', [0, 4.2, 0], 3.2, 0.18, 1.6),
      sparks('target', [0, 1.5, 0], 12, 0),
    ];
  },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  K = SCALE[id] ?? 1.2;
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  t.events = t.events.filter((e) => !(e.type === 'mesh' && typeof e.seed === 'number' && e.seed >= 1000));
  // bỏ hạt do bản trước sinh (spark rim/inward) để chạy lại không nhân đôi; hạt viết tay còn lại (dust/spark accent) giữ nguyên
  t.events = t.events.filter((e) => !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'));
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
