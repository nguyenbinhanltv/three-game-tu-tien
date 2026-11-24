#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Lôi tu: dựng timeline 11 chiêu theo concept Codex đã duyệt bằng sprite sét vẽ tay (ô `loi_*` của `vfx_sprites.webp`, kiểu tô "lôi": viền mực chàm tối → thân tím-lam → lõi trắng xanh).
// Mỗi chiêu một hình riêng (tia chẻ nhánh + dấu ấn, vệt zigzag, giáo sét, mây giông + chùm 9 nhánh, chuỗi cầu sét, vảy giáp, cầu lưới, lệnh bài sét, biển hồ quang, hồ quang xoắn, đường sét ngang) và ba nhịp:
//   báo trước (t < 0): bản mờ nhỏ + hạt hút vào;  trúng (t = 0): hình bật gần đủ cỡ + chớp sáng (`loi_flash`) ở +30 ms;  dư ba (t ≥ 0,17): hình mỏng dần + tia lửa bay lên.
// Chạy lại an toàn: bỏ mọi sự kiện `mesh` và decal rune cũ (bolt/vòng rune/shock_cone...), giữ âm thanh, rung, hitstop, chớp, hạt, vignette, camera viết tay. Dùng: node tools/vfx-forge/loi-tu.mjs [id...]
import fs from 'node:fs';

const r2 = (x) => Math.round(x * 100) / 100;
let seq = 1000;
const S = () => seq++;
const mesh = (o) => ({
  type: 'mesh',
  t: 0,
  dur: 0.6,
  at: 'target',
  sweep: 0,
  erodeFrom: 0.1,
  ragged: 0.5,
  tone: 'body',
  alpha: 0.95,
  tier: 0,
  seed: S(),
  ...o,
});
/** Hệ số cỡ theo chiêu (đo phủ bằng `cover.mjs` rồi chỉnh cho sát trần: chiêu thường ≤ 0,2, chiêu cuối ≤ 0,35). */
let K = 1;
const SCALE = {
  skl_thiem_loi_bo: 0.95,
  skl_loi_an_kich: 0.85,
  skl_cuu_tieu_thien_loi: 0.8,
  skl_loi_the: 0.95,
  skl_loi_chich: 1.0,
  skl_loi_lien: 0.8,
  skl_loi_giap: 0.9,
  skl_phich_lich: 0.85,
  skl_loi_vong: 0.95,
  skl_loi_phat: 0.85,
  skl_loi_hai: 0.6,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `loi_flash`): chiêu bao quanh người để mục tiêu/tên/thanh máu còn đọc được (duyệt 25/11: bớt mảng đặc, giữ nét sét + viền). */
let A = 1;
const ALPHA = {
  skl_loi_the: 0.55,
  skl_loi_giap: 0.5,
  skl_loi_vong: 0.55,
  skl_phich_lich: 0.7,
  skl_loi_hai: 0.7,
  skl_loi_lien: 0.75,
  skl_loi_phat: 0.8,
  skl_cuu_tieu_thien_loi: 0.8,
};
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
    ...(name === 'loi_flash' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
  });
};
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
/** Tụ khí báo trước: tia lửa hút vào tâm. */
const pullIn = (at, off, t = -0.26) => sparks(at, off, 12, t, { speed: 1.7, life: 0.26, inward: true });
/** Chớp điểm nhấn (+30 ms): lõi sáng ngắn 0,18 s. */
const flash = (at, off, size, t = 0, o = {}) =>
  sprite('loi_flash', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
/** Nhịp trúng: hình chính bật ở 82% cỡ rồi lớn dần, mỏng dần từ `erodeFrom`. */
const strike = (name, o) => {
  const { size, off, t = 0, dur = 0.55, alpha = 0.95, erodeFrom = 0.1, ...rest } = o;
  return sprite(name, { t, dur, off, size: size * 0.82, sizeTo: size, alpha, erodeFrom, ...rest });
};
/** Báo trước: bản mờ nhỏ (sống 0,28 s trước khi trúng). */
const gather = (name, o) => {
  const { size, off, t = -0.28, rest = {} } = o;
  return sprite(name, { t, dur: 0.28, off, size: size * 0.5, sizeTo: size * 0.72, alpha: 0.4, erodeFrom: 0.8, ...rest });
};
/** Dư ba: tia lửa/hồ quang bay lên từ chỗ trúng. */
const after = (at, off, size = 2.6, t = 0.17, up = 1.4) =>
  sprite('loi_sparks', {
    t,
    dur: 0.6,
    at,
    off,
    size,
    alpha: 0.75,
    erodeFrom: 0.2,
    move: { to: at, offset: [off[0], off[1] + up, off[2]], ease: 'out' },
  });
const ground = (at, off, size, t = 0.02, o = {}) =>
  sprite('loi_ground_arcs', { t, dur: 0.6, at, off, size, sizeTo: size * 1.15, alpha: 0.8, erodeFrom: 0.15, ...o });

const SPEC = {
  // Thiểm Lôi Bộ (lướt, kích theo S.FX: mọi mốc ≥ 0): vệt sét zigzag từ chỗ đứng sang mục tiêu, hai đầu quầng chớp, vài tia nhỏ.
  skl_thiem_loi_bo: () => [
    flash('self', [0, 1.1, 0], 2.4, 0),
    strike('loi_bolt_zigzag', { size: 6, at: 'ahead', off: [0, 1.2, 2.8], dur: 0.5, align: 'aim' }),
    sprite('loi_bolt_zigzag', { t: 0.04, dur: 0.45, at: 'ahead', off: [0.3, 1.0, 3.4], size: 4.2, alpha: 0.5, align: 'aim', erodeFrom: 0.15 }),
    flash('ahead', [0, 1.2, 5.4], 2.2, 0.02),
    after('ahead', [0, 1.3, 3.8], 2.4, 0.2, 1.1),
    sparks('ahead', [0, 1.2, 4], 10, 0.05),
  ],
  // Lôi Ấn Kích: tia sét dày chẻ nhánh giáng thẳng từ trên xuống, điểm trúng bừng dấu ấn ba vạch chụm.
  skl_loi_an_kich: () => [
    ...[gather('loi_mark', { size: 2.4, off: [0, 1.4, 0] })],
    pullIn('target', [0, 1.4, 0]),
    strike('loi_bolt_forked', { size: 6, off: [0.2, 3.2, 0], erodeFrom: 0.12 }),
    flash('target', [0, 1.2, 0], 3, 0.01),
    sprite('loi_mark', { t: 0.04, dur: 0.55, off: [0, 1.0, 0], size: 2.6, alpha: 0.95, erodeFrom: 0.2 }),
    ground('target', [0, 0.6, 0], 4.6),
    after('target', [0, 1.4, 0], 2.6, 0.18, 1.5),
    sparks('target', [0, 1.3, 0], 12, 0),
  ],
  // Cửu Tiêu Thiên Lôi (chiêu cuối): mây giông cuộn trên đầu mục tiêu, chín nhánh sét lớn tụ về một điểm, cột sét lõi trắng chói nổ sáng.
  skl_cuu_tieu_thien_loi: () => [
    ...[gather('loi_cloud', { size: 6.2, off: [0, 5.6, 0] })],
    pullIn('target', [0, 5.6, 0], -0.3),
    strike('loi_cloud', { size: 6.2, off: [0, 6.0, 0], dur: 1.0, erodeFrom: 0.35, alpha: 0.95 }),
    strike('loi_bolts9', { size: 6, off: [0, 3.5, 0], dur: 0.6, erodeFrom: 0.15 }),
    flash('target', [0, 1.1, 0], 5, 0.02, { dur: 0.22 }),
    ground('target', [0, 0.7, 0], 7, 0.03, { dur: 0.7 }),
    after('target', [0, 1.8, 0], 4, 0.2, 1.8),
    sparks('target', [0, 1.5, 0], 16, 0),
  ],
  // Lôi Thể (tư thế): dải hồ quang xoắn ốc quấn thân từ chân lên vai, tia điện nhảy giữa hai bàn tay.
  skl_loi_the: () => [
    ...[gather('loi_spiral', { size: 3.4, off: [0, 1.2, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1, 0], -0.24),
    strike('loi_spiral', { size: 3.4, at: 'self', off: [0, 1.25, 0], dur: 0.9, erodeFrom: 0.3 }),
    sprite('loi_arcs_pair', { t: 0.02, dur: 0.6, at: 'self', off: [0, 1.2, 0.3], size: 1.8, alpha: 0.9, erodeFrom: 0.25 }),
    flash('self', [0, 1.2, 0], 2.2, 0.01),
    after('self', [0, 1.3, 0], 2.4, 0.2, 1.2),
  ],
  // Lôi Chích: ngọn giáo sét dài đâm thẳng từ người ra mục tiêu, mũi nhọn lõi trắng.
  skl_loi_chich: () => [
    ...[gather('loi_spear', { size: 5, off: [0, 1.2, 1.2], rest: { at: 'self', align: 'aim' } })],
    pullIn('self', [0, 1.2, 0.6], -0.22),
    sprite('loi_spear', {
      t: -0.02,
      dur: 0.34,
      at: 'self',
      off: [0, 1.25, 2.2],
      size: 6.5,
      alpha: 0.95,
      align: 'aim',
      erodeFrom: 0.5,
      move: { to: 'target', offset: [0, 1.3, -2.2], ease: 'out' },
    }),
    flash('target', [0, 1.3, 0], 2.6, 0.03),
    sprite('loi_mark', { t: 0.05, dur: 0.5, off: [0, 1.0, 0], size: 2.0, alpha: 0.9, erodeFrom: 0.2 }),
    after('target', [0, 1.3, 0], 2.4, 0.17, 1.3),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Lôi Liên: chuỗi quả cầu sét nối nhau bằng hồ quang gấp khúc giáng xuống liên hoàn trong vùng 6 m.
  skl_loi_lien: () => [
    ...[gather('loi_orbs', { size: 5, off: [0, 1.4, 0] })],
    pullIn('target', [0, 1.4, 0], -0.24),
    ...[0, 120, 240].map((a, i) =>
      strike('loi_orbs', { size: 5.2, off: [0, 1.4, 0], t: i * 0.03, dur: 0.6, rot: [0, 0, a], erodeFrom: 0.12 }),
    ),
    flash('target', [0, 1.2, 0], 3.2, 0.01),
    ground('target', [0, 0.6, 0], 6.4, 0.03),
    after('target', [0, 1.4, 0], 3, 0.19, 1.5),
    sparks('target', [0, 1.3, 0], 12, 0),
  ],
  // Lôi Giáp (khiên): vảy giáp sét sáu cạnh ghép bao quanh thân, hồ quang chạy giữa các vảy.
  skl_loi_giap: () => [
    ...[gather('loi_scales', { size: 3.4, off: [0, 1.0, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1, 0], -0.24),
    strike('loi_scales', { size: 3.4, at: 'self', off: [0, 1.05, 0], dur: 0.9, erodeFrom: 0.3 }),
    flash('self', [0, 1.1, 0], 2.2, 0.01),
    sprite('loi_arcs_pair', { t: 0.06, dur: 0.5, at: 'self', off: [0, 1.4, 0.2], size: 1.6, alpha: 0.8, erodeFrom: 0.25 }),
    after('self', [0, 1.2, 0], 2.4, 0.2, 1.2),
  ],
  // Phích Lịch Tuyến: một tia sét ngang dày xuyên 10 m, hai đầu nổ chớp, nhiều nhánh rẽ nhỏ hai bên.
  skl_phich_lich: () => [
    ...[gather('loi_bolt_zigzag', { size: 5, off: [0, 1.2, 3], rest: { at: 'ahead', align: 'aim' } })],
    pullIn('self', [0, 1.2, 0.6], -0.24),
    strike('loi_bolt_zigzag', { size: 12, at: 'ahead', off: [0, 1.2, 5.8], dur: 0.5, align: 'aim', erodeFrom: 0.15 }),
    sprite('loi_bolt_zigzag', {
      t: 0.03,
      dur: 0.45,
      at: 'ahead',
      off: [0.4, 1.0, 6],
      size: 8.5,
      alpha: 0.5,
      align: 'aim',
      erodeFrom: 0.15,
    }),
    flash('ahead', [0, 1.2, 0.8], 1.5, 0.01, { dur: 0.1 }),
    flash('ahead', [0, 1.2, 10.8], 1.6, 0.02, { dur: 0.1 }),
    after('ahead', [0, 1.3, 6], 3.4, 0.2, 1.2),
    sparks('ahead', [0, 1.2, 6], 12, 0.02),
  ],
  // Lôi Võng (thủ): quả cầu lưới hồ quang bao quanh người, chỗ giao nhau có điểm sáng, tia lửa tóe khi chịu đòn.
  skl_loi_vong: () => [
    ...[gather('loi_web', { size: 3.6, off: [0, 1.1, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1, 0], -0.24),
    strike('loi_web', { size: 3.6, at: 'self', off: [0, 1.15, 0], dur: 0.95, erodeFrom: 0.35 }),
    flash('self', [0, 1.2, 0], 2.2, 0.01),
    after('self', [0, 1.2, 0], 2.6, 0.2, 1.2),
    sparks('self', [0, 1.2, 0], 10, 0.05),
  ],
  // Lôi Phạt: lệnh bài đạo gia cổ phong khắc phù sét giáng từ mây xuống đầu mục tiêu, xích sét quấn, tia điện lan trên đất.
  skl_loi_phat: () => [
    gather('loi_cloud', { size: 4, off: [0, 5, 0] }),
    ...[gather('loi_tablet', { size: 5.2, off: [0, 4.6, 0] })],
    pullIn('target', [0, 1.3, 0], -0.24),
    strike('loi_tablet', {
      size: 5.2,
      off: [0, 4.4, 0],
      dur: 0.55,
      erodeFrom: 0.15,
      move: { to: 'target', offset: [0, 2.7, 0], ease: 'out' },
    }),
    flash('target', [0, 1.1, 0], 3.6, 0.03),
    ground('target', [0, 0.6, 0], 5.4, 0.04),
    after('target', [0, 1.3, 0], 2.8, 0.19, 1.4),
    sparks('target', [0, 1.2, 0], 12, 0.03),
  ],
  // Lôi Hải: biển hồ quang bò sát đất cuộn lên như sóng điện, nhiều tia nhỏ nhảy cao, giữa vùng nổ chớp lớn.
  skl_loi_hai: () => [
    ...[gather('loi_wave', { size: 5, off: [0, 1.6, 0] })],
    pullIn('target', [0, 1.2, 0], -0.24),
    ...[
      [-2.2, 0.8, 0],
      [2.2, 0.8, 0.04],
      [0, -1.8, 0.08],
    ].map(([x, z, dt]) => strike('loi_wave', { size: 5, off: [x, 1.7, z], t: dt, dur: 0.6, erodeFrom: 0.12 })),
    ground('target', [0, 0.6, 0], 7, 0.0, { dur: 0.7 }),
    flash('target', [0, 1.2, 0], 3.8, 0.02),
    after('target', [0, 1.6, 0], 3.4, 0.19, 1.6),
    sparks('target', [0, 1.4, 0], 14, 0),
  ],
};

const HEAD = {
  skl_thiem_loi_bo: { trigger: 'fx', fxKind: 'dash', method: 'cuu_tieu_loi_kinh' },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  K = SCALE[id] ?? 1;
  A = ALPHA[id] ?? 1;
  const p = `packages/content/data/fx/${id}.json`;
  const t = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { skill: id, ...(HEAD[id] ?? {}), events: [] };
  // bỏ hình cũ (mesh bolt/vòng rune/shock_cone...), decal rune và hạt rim/inward do bản trước sinh; giữ âm thanh, rung, hitstop, chớp, vignette, camera, hạt viết tay
  t.events = t.events.filter(
    (e) =>
      e.type !== 'mesh' &&
      !(e.type === 'decal' && e.tex === 'rune') &&
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'),
  );
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
