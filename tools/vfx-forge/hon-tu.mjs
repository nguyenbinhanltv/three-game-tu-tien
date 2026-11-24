#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Hồn tu: dựng lại timeline 11 chiêu theo concept Codex đã duyệt (sprite vẽ tay trong `vfx_sprites.webp` + khói + sợi hồn).
// Mỗi chiêu một hình riêng: bàn tay hồn (Phệ Hồn / Định Thần), vuốt, lính giáo, phướn, lốc xoáy, mặt hồn (Âm Hồn Triều / Hoàng Tuyền Đạn), sợi hồn có đầu sáng (Sưu Hồn).
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
/** Sprite vẽ tay (billboard). `size` mét (ô vuông), `off` offset tâm. */
const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], ...rest } = o;
  return mesh({ shape: 'sprite', sprite: name, billboard: true, offset: off, scale: size, scaleTo: sizeTo ?? size, ...rest });
};
/** Cụm khói billboard: lớp viền sáng lạnh (body, to, mờ) vẽ trước + lõi tối đặc (shadow) sau. */
const puff = (at, off, sc, t, a = 0.9, dur = 0.95, extra = {}) => [
  mesh({
    shape: 'flip',
    flip: 'ink_smoke',
    t,
    dur,
    at,
    offset: off,
    scale: sc * 1.25,
    billboard: true,
    alpha: a * 0.5,
    tone: 'body',
    erodeFrom: 0.4,
    ...extra,
  }),
  mesh({
    shape: 'flip',
    flip: 'ink_smoke',
    t: t + 0.01,
    dur,
    at,
    offset: off,
    scale: sc,
    billboard: true,
    alpha: a,
    tone: 'shadow',
    erodeFrom: 0.4,
    ...extra,
  }),
];
/** Sợi hồn: dải ribbon uốn (lõi tối + viền sáng mảnh), bay lên và tỏa ra. */
const wisp = (at, i, n, R, t, o = {}) => {
  const a = (i / n) * Math.PI * 2;
  return mesh({
    shape: 'ribbon',
    t,
    dur: 0.8,
    at,
    offset: [r2(Math.cos(a) * R * 0.5), 0.4, r2(Math.sin(a) * R * 0.5)],
    rot: [-80, r2(a * 57.3), 0],
    scale: [R * 1.2, R * 1.2, R * 3.6],
    sweep: 0.5,
    erodeFrom: 0.4,
    ragged: 0.8,
    ink: true,
    move: { to: at, offset: [r2(Math.cos(a) * R * 1.3), R * 1.6, r2(Math.sin(a) * R * 1.3)], ease: 'out' },
    ...o,
  });
};
const cold = (at, off, n, t) => ({
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
});
/** Sợi hồn bị rút từ mục tiêu về người ra chiêu. */
const pull = (i, t, len = 3, w = 1.2) =>
  mesh({
    shape: 'ribbon',
    t,
    dur: 0.6,
    at: 'target',
    offset: [r2((i - 1) * 0.6), 1.3, 0],
    rot: [-80, r2(90 + (i - 1) * 28), 0],
    scale: [w, w, len],
    sweep: 0.55,
    erodeFrom: 0.4,
    ragged: 0.8,
    ink: true,
    tone: i === 1 ? 'rim' : 'body',
    move: { to: 'self', offset: [0, 1.3, 0], ease: 'in' },
  });

const SPEC = {
  // Phệ Hồn: bàn tay khói năm ngón chộp từ trên xuống, kéo sợi hồn sáng về người ra chiêu.
  skl_phe_hon: () => [
    sprite('hon_hand_claw', { t: -0.28, dur: 0.3, off: [0.8, 3.9, 0], size: 2.3, sizeTo: 2.8, alpha: 0.35, erodeFrom: 0.8 }),
    sprite('hon_hand_claw', {
      t: 0,
      dur: 0.75,
      off: [0.5, 3.3, 0],
      size: 3.7,
      sizeTo: 4,
      alpha: 0.92,
      erodeFrom: 0.55,
      move: { to: 'target', offset: [0.3, 2.4, 0], ease: 'out' },
    }),
    ...puff('target', [0, 0.5, 0], 3.2, 0.02, 0.8, 0.8),
    ...[0, 1, 2].map((i) => pull(i, 0.05 + i * 0.04)),
    sprite('hon_wisps', {
      t: 0.17,
      dur: 0.75,
      off: [0, 1.6, 0],
      size: 1.8,
      sizeTo: 2.1,
      alpha: 0.8,
      erodeFrom: 0.5,
      move: { to: 'target', offset: [0, 3.4, 0], ease: 'out' },
    }),
    cold('target', [0, 1.4, 0], 10, 0),
  ],
  // Âm Ảnh Bộ: bóng trùm đen lướt như sao chổi, đuôi khói dẹt dài, vài sợi hồn tách khỏi đuôi.
  skl_u_anh_bo: () => [
    sprite('hon_wraith', {
      t: 0,
      dur: 1.0,
      at: 'self',
      off: [0, 1.5, 0.5],
      size: 2.4,
      sizeTo: 2.7,
      alpha: 0.95,
      erodeFrom: 0.8,
      move: { to: 'ahead', offset: [0, 1.5, 4], ease: 'out' },
    }),
    sprite('hon_whips', {
      t: 0.02,
      dur: 1.0,
      at: 'ahead',
      off: [0, 1.2, 0.5],
      size: 3.2,
      alpha: 0.7,
      erodeFrom: 0.7,
      move: { to: 'ahead', offset: [0, 1.2, 5.5], ease: 'out' },
    }),
    ...[0, 1, 2, 3, 4].flatMap((i) => puff('ahead', [0, 0.9, 1.4 + i * 1.5], 2.1 - i * 0.16, i * 0.03, 0.85, 0.9)),
    cold('ahead', [0, 1.2, 5], 8, 0.2),
  ],
  // Tất Đầu Thành Binh: ba lính giáo khói đứng thế tam giác quanh người, chân tan thành khói.
  skl_tat_dau_thanh_binh: () => [
    ...[
      [-2.5, 1.1, 0],
      [2.5, 1.1, 0.05],
      [0, -2.3, 0.1],
    ].flatMap(([x, z, dt]) => [
      sprite('hon_soldier', {
        t: -0.2 + dt,
        dur: 1.25,
        at: 'self',
        off: [x, 1.6, z],
        size: 3.3,
        sizeTo: 3.5,
        alpha: 0.95,
        erodeFrom: 0.62,
      }),
      ...puff('self', [x, 0.5, z], 1.8, -0.15 + dt, 0.8, 1),
    ]),
    sprite('hon_wisps', { t: 0.1, dur: 1, at: 'self', off: [0, 1.4, 0], size: 3, alpha: 0.6, erodeFrom: 0.5 }),
    cold('self', [0, 1.2, 0], 8, 0.3),
  ],
  // Tế Phiên: phướn có cán + dải vải uốn chữ S dựng sau lưng, sợi hồn xoáy dưới chân.
  skl_te_phien: () => [
    sprite('hon_banner', { t: -0.15, dur: 1.4, at: 'self', off: [0.8, 2.0, 0], size: 3.5, sizeTo: 3.8, alpha: 0.95, erodeFrom: 0.7 }),
    ...[0, 1, 2, 3].map((i) =>
      wisp('self', i, 4, 1.5, 0.05 + i * 0.03, { offset: [r2(Math.cos(i * 1.57) * 0.8), 0.2, r2(Math.sin(i * 1.57) * 0.8)] }),
    ),
    sprite('hon_wisps', { t: 0.05, dur: 1.1, at: 'self', off: [0.6, 0.9, 0.3], size: 2, alpha: 0.7, erodeFrom: 0.5 }),
    ...puff('self', [0.9, 0.4, 0], 2, 0, 0.85, 1),
    cold('self', [1, 4.2, 0], 8, 0.25),
  ],
  // Hồn Trảo: ba vệt vuốt khói cào chéo, bàn tay hồn mờ phía sau.
  skl_hon_trao: () => [
    sprite('hon_hand_claw', { t: -0.1, dur: 0.45, off: [-0.8, 2.3, 0], size: 3.1, sizeTo: 3.4, alpha: 0.55, erodeFrom: 0.5 }),
    sprite('hon_wisps', {
      t: 0.2,
      dur: 0.6,
      off: [0.4, 1.4, 0],
      size: 2.2,
      alpha: 0.65,
      erodeFrom: 0.4,
      move: { to: 'target', offset: [0.4, 3, 0], ease: 'out' },
    }),
    sprite('hon_claws3', { t: 0, dur: 0.6, off: [0, 1.3, 0], size: 4.3, sizeTo: 4.6, alpha: 0.98, erodeFrom: 0.5 }),
    ...puff('target', [0, 0.8, 0], 2.6, 0.03, 0.8, 0.7),
    cold('target', [0, 1.3, 0], 10, 0),
  ],
  // Âm Phong: lốc phễu xoáy cao quanh mục tiêu (ba lớp chồng, đáy hẹp miệng loe), sợi hồn và mặt hồn bị cuốn lên.
  skl_am_phong: () => [
    sprite('hon_tornado', { t: -0.3, dur: 0.35, off: [0, 1.4, 0], size: 2, sizeTo: 3, alpha: 0.4, erodeFrom: 0.8 }),
    sprite('hon_tornado', { t: 0, dur: 0.95, off: [0, 2.3, 0], size: 4.4, sizeTo: 4.9, alpha: 0.95, erodeFrom: 0.6, spin: 60 }),
    sprite('hon_tornado', { t: 0.06, dur: 0.85, off: [0.3, 2.0, 0.2], size: 3.4, sizeTo: 3.9, alpha: 0.55, erodeFrom: 0.5, spin: -80 }),
    ...puff('target', [0, 0.5, 0], 3.2, 0, 0.8, 0.9),
    sprite('hon_wisps', {
      t: 0.08,
      dur: 0.8,
      off: [0, 3.2, 0],
      size: 3.2,
      alpha: 0.7,
      erodeFrom: 0.4,
      move: { to: 'target', offset: [0, 4.6, 0], ease: 'out' },
    }),
    ...[0, 1, 2].map((i) =>
      sprite('hon_face_grin', {
        t: 0.07 + i * 0.05,
        dur: 0.7,
        off: [r2(Math.cos(i * 2.1) * 2.3), 0.9, r2(Math.sin(i * 2.1) * 2.3)],
        size: 1.3,
        alpha: 0.75,
        erodeFrom: 0.4,
        move: { to: 'target', offset: [r2(Math.cos(i * 2.1 + 2) * 1.1), 3.6, r2(Math.sin(i * 2.1 + 2) * 1.1)], ease: 'out' },
      }),
    ),
    cold('target', [0, 1.8, 0], 10, 0.04),
  ],
  // Hồn Chướng: màn khói hồn dày bao thân như tấm vải gấp nếp, mặt hồn mờ lộ trong nếp khói.
  skl_hon_chuong: () => [
    sprite('hon_curtain', {
      t: -0.2,
      dur: 1.4,
      at: 'self',
      off: [-1.4, 1.3, -0.6],
      size: 2.0,
      sizeTo: 2.2,
      alpha: 0.85,
      rot: [0, 0, 9],
      erodeFrom: 0.6,
    }),
    sprite('hon_curtain', {
      t: -0.15,
      dur: 1.35,
      at: 'self',
      off: [1.4, 1.3, -0.6],
      size: 2.0,
      sizeTo: 2.2,
      alpha: 0.85,
      rot: [0, 0, -9],
      erodeFrom: 0.6,
    }),
    sprite('hon_curtain', { t: 0.06, dur: 1.2, at: 'self', off: [0, 1.4, -1.4], size: 2.5, sizeTo: 2.7, alpha: 0.85, erodeFrom: 0.6 }),
    ...[0, 1, 2, 3].flatMap((i) => {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      return puff('self', [r2(Math.cos(a) * 1.1), 0.6, r2(Math.sin(a) * 1.1)], 1.6, i * 0.02, 0.75, 1.1);
    }),
    sprite('hon_face_scream', { t: 0.1, dur: 1.1, at: 'self', off: [0, 2.5, -0.2], size: 1.9, sizeTo: 2.1, alpha: 0.85, erodeFrom: 0.6 }),
    sprite('hon_wisps', { t: 0.22, dur: 0.9, at: 'self', off: [0, 1.5, 0], size: 2.4, alpha: 0.6, erodeFrom: 0.4 }),
    cold('self', [0, 1.6, 0], 8, 0.1),
  ],
  // Sưu Hồn Thuật: sợi hồn sáng rút từ mục tiêu về người ra chiêu, đầu mũi là quả cầu hồn sáng kéo đuôi sao chổi.
  skl_suu_hon_thuat: () => [
    ...[0, 1, 2].map((i) => pull(i, -0.02 + i * 0.05, 3, 0.95)),
    sprite('hon_orb', {
      t: 0,
      dur: 0.6,
      off: [0, 1.5, 0],
      size: 2.3,
      sizeTo: 1.5,
      alpha: 0.98,
      erodeFrom: 0.75,
      move: { to: 'self', offset: [0, 1.5, 0], ease: 'in' },
    }),
    sprite('hon_orb', {
      t: 0.1,
      dur: 0.55,
      off: [0.6, 1.6, 0],
      size: 1.2,
      alpha: 0.7,
      erodeFrom: 0.6,
      move: { to: 'self', offset: [0, 1.5, 0], ease: 'in' },
    }),
    sprite('hon_wisps', { t: 0, dur: 0.6, off: [0, 1.4, 0], size: 2.0, alpha: 0.6, erodeFrom: 0.5 }),
    ...puff('target', [0, 0.9, 0], 2.0, 0, 0.75, 0.8),
    {
      type: 'particles',
      kind: 'spark',
      t: 0.1,
      n: 14,
      speed: 1.6,
      spread: 1,
      life: 0.3,
      size: 0.08,
      at: 'self',
      offset: [0, 1.4, 0],
      tone: 'rim',
      inward: true,
      tier: 1,
    },
    cold('self', [0, 1.4, 0], 8, 0.45),
  ],
  // Âm Hồn Triều: sóng khói thấp tràn ngang, đầu sóng cuộn, mặt nạ hồn lớn ở đầu sóng, vài mặt hồn nhỏ trong sóng.
  skl_am_hon_trieu: () => [
    sprite('hon_wave', {
      t: 0,
      dur: 0.9,
      at: 'ahead',
      off: [0, 1.4, 3],
      size: 3.6,
      sizeTo: 4,
      alpha: 0.95,
      erodeFrom: 0.55,
      move: { to: 'ahead', offset: [0, 1.5, 10], ease: 'out' },
    }),
    sprite('hon_face_scream', {
      t: 0.04,
      dur: 0.85,
      at: 'ahead',
      off: [0, 2.3, 2.4],
      size: 2.1,
      sizeTo: 2.4,
      alpha: 0.9,
      erodeFrom: 0.55,
      move: { to: 'ahead', offset: [0, 2.6, 9.4], ease: 'out' },
    }),
    sprite('hon_wave', {
      t: 0.09,
      dur: 0.8,
      at: 'ahead',
      off: [-1.2, 1.1, 1.5],
      size: 2.2,
      alpha: 0.6,
      erodeFrom: 0.5,
      move: { to: 'ahead', offset: [-1.2, 1.2, 7], ease: 'out' },
    }),
    ...[0, 1, 2].flatMap((i) => puff('ahead', [r2((i % 2 ? 1 : -1) * 0.6), 0.7, 1 + i * 2.6], 1.8, i * 0.04, 0.8, 0.85)),
    cold('ahead', [0, 1.8, 8], 8, 0.2),
  ],
  // Định Thần Thuật: bàn tay hồn xòe ấn từ trên xuống, xích khói quấn quanh thân mục tiêu.
  skl_dinh_than_thuat: () => [
    sprite('hon_hand_press', {
      t: -0.08,
      dur: 0.8,
      off: [0, 4.0, 0],
      size: 3.9,
      sizeTo: 4.2,
      alpha: 0.92,
      erodeFrom: 0.55,
      move: { to: 'target', offset: [0, 2.6, 0], ease: 'out' },
    }),
    sprite('hon_chain', {
      t: 0.02,
      dur: 0.8,
      off: [-1.5, 1.0, 0],
      size: 2.3,
      alpha: 0.95,
      rot: [0, 0, 25],
      erodeFrom: 0.6,
      move: { to: 'target', offset: [-1.1, 1.1, 0], ease: 'out' },
    }),
    sprite('hon_chain', {
      t: 0.04,
      dur: 0.8,
      off: [1.5, 1.1, 0],
      size: 2.2,
      alpha: 0.9,
      rot: [0, 0, -155],
      erodeFrom: 0.6,
      move: { to: 'target', offset: [1.1, 1.2, 0], ease: 'out' },
    }),
    ...puff('target', [0, 0.5, 0], 3, 0.03, 0.85, 0.85),
    sprite('hon_wisps', {
      t: 0.2,
      dur: 0.7,
      off: [0, 1.6, 0],
      size: 2.2,
      alpha: 0.65,
      erodeFrom: 0.4,
      move: { to: 'target', offset: [0, 3.2, 0], ease: 'out' },
    }),
    cold('target', [0, 1.3, 0], 10, 0),
  ],
  // Hoàng Tuyền Đạn: quả cầu hồn nổ thành chùm mặt hồn (thét, sọ, bóng trùm, sầu) bay tỏa ra, kéo đuôi khói về tâm.
  skl_hoang_tuyen_dan: () => [
    sprite('hon_orb', { t: -0.25, dur: 0.3, off: [0, 1.5, 0], size: 1.8, sizeTo: 2.4, alpha: 0.95, erodeFrom: 0.9 }),
    ...['hon_face_scream', 'hon_face_grin', 'hon_wraith', 'hon_face_sad', 'hon_face_grin', 'hon_face_scream'].map((nm, i) => {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      return sprite(nm, {
        t: 0.01 * i,
        dur: 0.8,
        off: [r2(Math.cos(a) * 0.5), 1.5, r2(Math.sin(a) * 0.5)],
        size: 2.1,
        sizeTo: 2.4,
        alpha: 0.92,
        erodeFrom: 0.5,
        move: { to: 'target', offset: [r2(Math.cos(a) * 3.6), 1.7 + (i % 2) * 0.6, r2(Math.sin(a) * 3.6)], ease: 'out' },
      });
    }),
    ...puff('target', [0, 0.9, 0], 3, 0.02, 0.75, 0.8),
    sprite('hon_wisps', { t: 0.18, dur: 0.8, off: [0, 2.2, 0], size: 3.4, alpha: 0.6, erodeFrom: 0.5 }),
    cold('target', [0, 1.5, 0], 12, 0),
  ],
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  t.events = t.events.filter((e) => !(e.type === 'mesh' && typeof e.seed === 'number' && e.seed >= 1000));
  const evs = SPEC[id]();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
