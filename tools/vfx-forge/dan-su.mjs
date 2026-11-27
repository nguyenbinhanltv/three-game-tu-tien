#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Đan sư: dựng timeline 14 chiêu theo concept Codex đã duyệt bằng sprite vẽ tay (ô `dan_*` của `vfx_sprites_dan.<hash>.webp`, kiểu tô "đan": viền mực lục thẫm → thân XANH LÁ → viền lục vàng → lõi vàng chanh).
// Mỗi chiêu một hình riêng (lò đan ba chân, viên đan đuôi mực, mưa giọt đan, búp sen, mẫu đơn lửa, mưa lá, xoáy cánh hoa, vòng lá ngọc, đan khổng lồ, xoáy lá, hạc lá, khói hương chữ S, lò đan khổng lồ rót đan dịch, vườn đan) với ba nhịp:
//   báo trước (t < 0): bản mờ nhỏ + hạt hút vào;  trúng (t = 0): hình bật gần đủ cỡ + chớp đốm vàng (`dan_sparks`) ở +30 ms;  dư ba (t ≥ 0,17): hình mỏng dần + lá/đốm bay lên.
// Chạy lại an toàn: bỏ mọi sự kiện `mesh` và decal rune cũ, giữ âm thanh, rung, hitstop, chớp, vignette, camera viết tay. Dùng: node tools/vfx-forge/dan-su.mjs [id...]
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
/** Hệ số cỡ theo chiêu (đo phủ bằng `cover.mjs` + `pnpm shots vfxlab --clean` rồi chỉnh: chiêu thường ≤ 0,2, chiêu cuối ≤ 0,35). */
let K = 1;
const SCALE = {
  skl_dan_lo: 1,
  skl_dan_hoa_chi: 1,
  skl_dan_hoa_vu: 1,
  skl_lo_hoa_hoi_nguyen: 1,
  skl_dan_hoa_phong_tran: 0.56,
  skl_duoc_vu: 0.85,
  skl_hoi_xuan_quyet: 0.85,
  skl_moc_linh_tran: 0.46,
  skl_ngung_dan_ho_the: 0.62,
  skl_thuan_di_cuu_vien: 0.78,
  skl_anh_duoc_hoa_than: 0.9,
  skl_luu_huong_bo: 0.9,
  skl_hoi_thien_dan_lo: 0.7,
  skl_thien_dan_phap_gioi: 0.58,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `dan_sparks`): chiêu bao quanh người để mục tiêu/tên/thanh máu còn đọc được. */
let A = 1;
const ALPHA = {
  skl_ngung_dan_ho_the: 0.32,
  skl_moc_linh_tran: 0.75,
  skl_hoi_xuan_quyet: 0.7,
  skl_duoc_vu: 0.75,
  skl_thien_dan_phap_gioi: 0.8,
  skl_hoi_thien_dan_lo: 0.85,
  skl_dan_hoa_phong_tran: 0.85,
};
/** Sprite vẽ tay (billboard). `size` mét (ô vuông), `off` offset tâm. */
const sprite = (name, o) => {
  const { size, sizeTo, ...rest0 } = o;
  let { off = [0, 0, 0], ...rest } = rest0;
  // Tấm billboard nghiêng theo camera chéo: mép dưới tụt dưới đất một đoạn ≈ 0,62 × nửa cạnh, làm tranh bị mặt đất cắt phẳng. Nâng tâm đủ cao để mép dưới không xuống dưới sàn.
  const lift = (y, sz) => Math.max(y, 0.62 * ((sz * K) / 2) + 0.05);
  const big = Math.max(size, sizeTo ?? size);
  off = [off[0], lift(off[1], big), off[2]];
  if (rest.move?.offset)
    rest = { ...rest, move: { ...rest.move, offset: [rest.move.offset[0], lift(rest.move.offset[1], big), rest.move.offset[2]] } };
  return mesh({
    shape: 'sprite',
    sprite: name,
    billboard: true,
    offset: off,
    scale: r2(size * K),
    scaleTo: r2((sizeTo ?? size) * K),
    ...rest,
    ...(name === 'dan_sparks' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
  });
};
/** Hạt vàng chanh (tone rim). */
const sparks = (at, off, n, t, extra = {}) => ({
  type: 'particles',
  kind: 'spark',
  t,
  n,
  speed: 3,
  spread: 1,
  life: 0.4,
  size: 0.07,
  at,
  offset: off,
  tone: 'rim',
  tier: 1,
  ...extra,
});
/** Lá rơi/bay (hạt `petal`, tone rim). */
const leaves = (at, off, n, t, extra = {}) => sparks(at, off, n, t, { kind: 'petal', speed: 1.6, life: 0.9, size: 0.12, ...extra });
/** Tụ khí báo trước: đốm hút vào tâm. */
const pullIn = (at, off, t = -0.26) => sparks(at, off, 12, t, { speed: 1.6, life: 0.26, inward: true });
/** Chớp điểm nhấn (+30 ms): đốm vàng chanh ngắn 0,18 s. */
const flash = (at, off, size, t = 0, o = {}) =>
  sprite('dan_sparks', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
/** Nhịp trúng: hình chính bật ở 82% cỡ rồi lớn dần, mỏng dần từ `erodeFrom`. */
const strike = (name, o) => {
  const { size, off, t = 0, dur = 0.7, alpha = 0.95, erodeFrom = 0.15, ...rest } = o;
  return sprite(name, { t, dur, off, size: size * 0.82, sizeTo: size, alpha, erodeFrom, ...rest });
};
/** Báo trước: bản mờ nhỏ (sống 0,28 s trước khi trúng). */
const gather = (name, o) => {
  const { size, off, t = -0.28, rest = {} } = o;
  return sprite(name, { t, dur: 0.28, off, size: size * 0.5, sizeTo: size * 0.72, alpha: 0.4, erodeFrom: 0.8, ...rest });
};
/** Dư ba: đốm vàng + lá bay lên từ chỗ trúng. */
const after = (at, off, size = 2.6, t = 0.17, up = 1.3) =>
  sprite('dan_sparks', {
    t,
    dur: 0.6,
    at,
    off,
    size,
    alpha: 0.7,
    erodeFrom: 0.2,
    move: { to: at, offset: [off[0], off[1] + up, off[2]], ease: 'out' },
  });
/** Vết mực lục tối trên đất (decal `scorch`, tông shadow): lõi tối cho nền sáng ban ngày (chuẩn 2 luật 4). alpha 0,78 làm dấu để chạy lại không nhân đôi. */
const scorch = (at, off, r, t = 0, dur = 1.6) => ({
  type: 'decal',
  tex: 'scorch',
  t,
  r,
  dur,
  at,
  offset: off,
  grow: 0.1,
  tone: 'shadow',
  alpha: 0.78,
  tier: 0,
});

const SPEC = {
  // Đan Lô (tư thế): lò đan ba chân lơ lửng trước ngực, lửa lục ở miệng lò, khói thuốc xoắn ốc bốc lên rồi tan.
  skl_dan_lo: () => [
    gather('dan_smoke_spiral', { size: 2.6, off: [0, 1.7, 0.3], rest: { at: 'self' } }),
    pullIn('self', [0, 1.5, 0.3], -0.3),
    scorch('self', [0, 0.02, 0], 1.6, -0.1),
    strike('dan_lo_tripod', { size: 2.6, at: 'self', off: [0, 1.6, 0.5], dur: 1.1, erodeFrom: 0.55 }),
    sprite('dan_flame', { t: 0.0, dur: 1.0, at: 'self', off: [0, 2.15, 0.5], size: 1.4, alpha: 0.9, erodeFrom: 0.5 }),
    sprite('dan_smoke_spiral', {
      t: 0.05,
      dur: 1.0,
      at: 'self',
      off: [0, 2.9, 0.4],
      size: 2.8,
      alpha: 0.65,
      erodeFrom: 0.35,
      move: { to: 'self', offset: [0, 3.5, 0.4], ease: 'out' },
    }),
    flash('self', [0, 1.8, 0.5], 1.8, 0.01),
    after('self', [0, 2.0, 0.4], 2, 0.2, 0.9),
  ],
  // Đan Hỏa Chỉ: viên đan lớn sáng vàng chanh kéo đuôi khói mực lục dài bắn từ ngón tay tới mục tiêu, điểm trúng nở hoa lửa nhỏ.
  skl_dan_hoa_chi: () => [
    gather('dan_pill', { size: 1.8, off: [0, 1.4, 0.8], rest: { at: 'self' } }),
    pullIn('self', [0, 1.4, 0.7], -0.22),
    sprite('dan_ink_tail', {
      t: -0.02,
      dur: 0.4,
      at: 'self',
      off: [0, 1.35, -0.4],
      size: 8.6,
      alpha: 0.95,
      align: 'aim',
      erodeFrom: 0.5,
      move: { to: 'target', offset: [0, 1.7, -6.4], ease: 'out' },
    }),
    sprite('dan_pill', {
      t: -0.02,
      dur: 0.3,
      at: 'self',
      off: [0, 1.4, 1.2],
      size: 3.8,
      alpha: 0.98,
      erodeFrom: 0.45,
      move: { to: 'target', offset: [0, 1.8, -2.8], ease: 'out' },
    }),
    scorch('target', [0, 0.02, 0], 1.6, 0.02),
    flash('target', [0, 1.8, 0], 2.0, 0.03, { dur: 0.12 }),
    sprite('dan_peony', { t: 0.04, dur: 0.3, off: [0, 2.6, 0], size: 2.2, alpha: 0.9, erodeFrom: 0.2 }),
    after('target', [0, 2.7, 0], 2.2, 0.17, 1.2),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Đan Hỏa Vũ (tư thế): mưa giọt đan lửa lục hình giọt nước rơi quanh mục tiêu trong 6 m, mỗi giọt chạm đất nở búp sen lửa nhỏ và vệt mực.
  skl_dan_hoa_vu: () => [
    gather('dan_drop', { size: 2.2, off: [0, 4.5, 0] }),
    pullIn('target', [0, 3.5, 0], -0.3),
    ...[
      [-2.1, -1.2, -0.12],
      [1.9, -1.6, -0.06],
      [0.2, 0.2, 0.0],
      [-1.3, 1.9, 0.05],
      [2.2, 1.4, 0.1],
    ].map(([x, z, dt]) =>
      sprite('dan_drop', {
        t: dt - 0.16,
        dur: 0.26,
        off: [x, 5.2, z],
        size: 1.9,
        alpha: 0.95,
        erodeFrom: 0.6,
        move: { to: 'target', offset: [x, 0.9, z], ease: 'in' },
      }),
    ),
    ...[
      [-2.1, -1.2, 0.0],
      [0.2, 0.2, 0.14],
      [2.2, 1.4, 0.24],
    ].map(([x, z, dt]) => sprite('dan_lotus_bud', { t: dt, dur: 0.55, off: [x, 0.7, z], size: 1.7, alpha: 0.9, erodeFrom: 0.25 })),
    scorch('target', [0, 0.02, 0], 3.2, 0.0),
    flash('target', [0, 1.0, 0], 2.4, 0.02),
    after('target', [0, 1.2, 0], 2.8, 0.2, 1.3),
    sparks('target', [0, 1.1, 0], 12, 0.02),
  ],
  // Lô Hỏa Hồi Nguyên (tư thế): hơi ấm lò đan bốc lên từ chân thành cột khói thuốc tròn như búp sen, đốm than lục lơ lửng.
  skl_lo_hoa_hoi_nguyen: () => [
    gather('dan_smoke_bud', { size: 2.4, off: [0, 1.5, 0], rest: { at: 'self' } }),
    scorch('self', [0, 0.02, 0], 1.7, -0.1),
    pullIn('self', [0, 0.9, 0], -0.22),
    strike('dan_smoke_bud', { size: 3.4, at: 'self', off: [0, 1.9, 0], dur: 1.0, erodeFrom: 0.4, alpha: 0.85 }),
    flash('self', [0, 1.3, 0], 2, 0.01),
    after('self', [0, 1.6, 0], 2.4, 0.2, 1.1),
    leaves('self', [0, 1.0, 0], 8, 0.05, { speed: 0.9 }),
  ],
  // Đan Hỏa Phong Tràn: viên đan lớn ném xuống mục tiêu rồi vỡ thành bông mẫu đơn lửa lục nhiều lớp cánh dày (6 m), cánh ngoài cuộn khói mực.
  skl_dan_hoa_phong_tran: () => [
    gather('dan_pill', { size: 2, off: [0, 1.4, 0.8], rest: { at: 'self' } }),
    pullIn('self', [0, 1.4, 0.6], -0.26),
    sprite('dan_pill', {
      t: -0.14,
      dur: 0.2,
      at: 'self',
      off: [0, 2.4, 0.8],
      size: 2.4,
      alpha: 0.95,
      erodeFrom: 0.5,
      move: { to: 'target', offset: [0, 2.6, 0], ease: 'in' },
    }),
    scorch('target', [0, 0.02, 0], 4, 0.02),
    strike('dan_peony', { size: 8, off: [0, 0.7, 0], dur: 0.36, alpha: 0.35, erodeFrom: 0.15 }),
    sprite('dan_smoke_bud', { t: 0.06, dur: 0.36, off: [0, 3.1, 0], size: 4, alpha: 0.45, erodeFrom: 0.2 }),
    flash('target', [0, 1.9, 0], 2.6, 0.02, { dur: 0.12 }),
    after('target', [0, 2.9, 0], 3, 0.19, 1.5),
    sparks('target', [0, 1.3, 0], 14, 0.02),
  ],
  // Dược Vũ: tay áo vung rải mưa lá thuốc (bạch quả, bạc hà, ngải) rơi chậm quanh người tu và đạo hữu, đường vung để lại dải sương thuốc cong.
  skl_duoc_vu: () => [
    gather('dan_mist_sweep', { size: 4.2, off: [0.5, 1.3, 0.9], rest: { at: 'self' } }),
    pullIn('self', [0, 1.4, 0.5], -0.24),
    scorch('self', [0, 0.02, 0.4], 2.4, 0),
    strike('dan_mist_sweep', { size: 5.2, at: 'self', off: [0.6, 1.3, 0.9], dur: 0.8, erodeFrom: 0.3 }),
    sprite('dan_leaves', {
      t: 0.02,
      dur: 1.3,
      at: 'self',
      off: [0, 2.6, 0],
      size: 7.2,
      alpha: 0.8,
      erodeFrom: 0.4,
      move: { to: 'self', offset: [0, 1.4, 0], ease: 'out' },
    }),
    flash('self', [0, 1.5, 0], 2.2, 0.01),
    leaves('self', [0, 2.8, 0], 16, 0.02, { spread: 3, speed: 0.8, life: 1.3 }),
    after('self', [0, 1.4, 0], 2.8, 0.22, 1),
  ],
  // Hồi Xuân Quyết: gió xuân xoắn mang cánh hoa và sợi mưa quanh người tu và đạo hữu; dây leo độc xanh thẫm trườn lên chân quái (mộc độc).
  skl_hoi_xuan_quyet: () => [
    gather('dan_wind_petals', { size: 4.6, off: [0, 1.3, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 1.2, 0], -0.26),
    strike('dan_wind_petals', { size: 6.2, at: 'self', off: [0, 1.4, 0], dur: 1.2, erodeFrom: 0.4 }),
    sprite('dan_vine', { t: 0.06, dur: 1.0, at: 'target', off: [0, 0.9, 0], size: 3.2, alpha: 0.8, erodeFrom: 0.4 }),
    scorch('target', [0, 0.02, 0], 1.8, 0.04),
    flash('self', [0, 1.3, 0], 2.2, 0.01),
    leaves('self', [0, 1.4, 0], 12, 0.04, { spread: 2.5, speed: 1.2 }),
    after('self', [0, 1.4, 0], 2.6, 0.2, 1),
  ],
  // Mộc Linh Trận: tám lá ngọc lớn dựng đứng thành vòng như bông sen nở quanh vùng 8 m, gân lá sáng, dây leo nối các lá; nhịp hồi lá khép mở nhẹ.
  skl_moc_linh_tran: () => [
    gather('dan_leaf_ring', { size: 5, off: [0, 1.4, 0] }),
    pullIn('area', [0, 1.0, 0], -0.3),
    scorch('area', [0, 0.02, 0], 3.6, -0.1),
    strike('dan_leaf_ring', { size: 9, at: 'area', off: [0, 1.4, 0], dur: 1.5, erodeFrom: 0.55 }),
    sprite('dan_vine', { t: 0.04, dur: 1.2, at: 'area', off: [0, 0.8, 0], size: 5.6, alpha: 0.5, erodeFrom: 0.5 }),
    flash('area', [0, 1.2, 0], 3, 0.01),
    sprite('dan_leaf_ring', { t: 0.9, dur: 0.7, at: 'area', off: [0, 1.4, 0], size: 8.4, alpha: 0.4, erodeFrom: 0.3 }),
    sprite('dan_sparks', { t: 0.9, dur: 0.5, at: 'area', off: [0, 1.2, 0], size: 3.4, alpha: 0.6, erodeFrom: 0.3 }),
    after('area', [0, 1.4, 0], 3.2, 0.2, 1.2),
  ],
  // Ngưng Đan Hộ Thế: viên đan quang khổng lồ trong mờ như viên đan bóng ngọc bao cả đội, vân mây xoáy vàng nhạt; thân rất trong, chỉ viền và vân mây rõ.
  skl_ngung_dan_ho_the: () => [
    gather('dan_pills3', { size: 3, off: [0, 1.4, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 1.3, 0], -0.3),
    scorch('self', [0, 0.02, 0], 2.6, -0.1),
    strike('dan_orb_giant', { size: 8.6, at: 'self', off: [0, 1.6, 0], dur: 1.4, erodeFrom: 0.5 }),
    flash('self', [0, 1.5, 0], 3, 0.01),
    after('self', [0, 1.6, 0], 3.2, 0.22, 1.1),
    sparks('self', [0, 1.5, 0], 10, 0.05),
  ],
  // Thuấn Di Cứu Viện: chỗ đi tan thành xoáy lá cuốn vào, chỗ đến (bên đồng đội ngã) bùng cột sáng búp sen cùng xoáy lá tỏa ra.
  skl_thuan_di_cuu_vien: () => [
    sprite('dan_leaf_vortex', { t: -0.2, dur: 0.4, at: 'origin', off: [0, 1.2, 0], size: 3.6, alpha: 0.85, erodeFrom: 0.4 }),
    pullIn('origin', [0, 1, 0], -0.2),
    scorch('origin', [0, 0.02, 0], 1.6, -0.2, 1),
    strike('dan_lotus_bud', { size: 3.6, at: 'self', off: [0, 1.4, 0], dur: 0.8, erodeFrom: 0.3, alpha: 0.9 }),
    sprite('dan_leaf_vortex', { t: 0.04, dur: 0.7, at: 'self', off: [0, 1.2, 0], size: 4.6, alpha: 0.8, erodeFrom: 0.3 }),
    scorch('self', [0, 0.02, 0], 2, 0.02),
    flash('self', [0, 1.3, 0], 2.6, 0.02),
    after('self', [0, 1.4, 0], 2.8, 0.2, 1.3),
    leaves('self', [0, 1.2, 0], 10, 0.04, { speed: 1.8 }),
  ],
  // Anh Dược Hóa Thân: hạc kết bằng lá thuốc và ánh ngọc bay vút tới đồng đội để lại dải lá và sương, đáp xuống thành sóng ngọc nhẹ rồi tan.
  skl_anh_duoc_hoa_than: () => [
    gather('dan_leaves', { size: 3.4, off: [0, 1.8, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 1.6, 0], -0.26),
    sprite('dan_crane', {
      t: -0.04,
      dur: 0.34,
      at: 'self',
      off: [0, 1.2, 0.4],
      size: 3.6,
      alpha: 0.95,
      align: 'aim',
      erodeFrom: 0.4,
      move: { to: 'target', offset: [0, 4.6, 1.0], ease: 'out' },
    }),
    sprite('dan_mist_sweep', {
      t: 0.0,
      dur: 0.32,
      at: 'self',
      off: [0, 1.1, 0],
      size: 3.2,
      alpha: 0.35,
      align: 'aim',
      erodeFrom: 0.25,
      move: { to: 'target', offset: [0, 4.2, 0.6], ease: 'out' },
    }),
    scorch('target', [0, 0.02, 0], 2, 0.04),
    sprite('dan_lotus_bud', { t: 0.05, dur: 0.3, at: 'target', off: [0, 2.7, 0], size: 2.6, alpha: 0.9, erodeFrom: 0.2 }),
    flash('target', [0, 1.9, 0], 2.2, 0.03, { dur: 0.12 }),
    after('target', [0, 2.8, 0], 2.8, 0.2, 1.3),
    leaves('target', [0, 2.5, 0], 10, 0.04, { speed: 1.4 }),
  ],
  // Lưu Hương Bộ (lướt lùi 8 m): dải khói hương chữ S dọc đường lùi, lá nhỏ rơi dọc đường, bóng khói tan dần ở đầu dải; thanh nhẹ.
  skl_luu_huong_bo: () => [
    sprite('dan_incense_s', {
      t: 0,
      dur: 0.9,
      at: 'self',
      off: [0, 0.9, -4],
      size: 7.2,
      alpha: 0.8,
      align: 'aim',
      erodeFrom: 0.3,
    }),
    sprite('dan_leaves', { t: 0.02, dur: 0.9, at: 'self', off: [0, 1.0, -4], size: 6, alpha: 0.6, erodeFrom: 0.3 }),
    scorch('self', [0, 0.02, -2], 1.8, 0, 1.2),
    flash('self', [0, 1.1, 0], 2, 0),
    sprite('dan_smoke_spiral', { t: 0.0, dur: 0.6, at: 'self', off: [0, 1.4, 0], size: 2.4, alpha: 0.55, erodeFrom: 0.3 }),
    leaves('self', [0, 1.0, -3], 8, 0.02, { spread: 2, speed: 0.8 }),
    after('self', [0, 1.0, -6], 2.4, 0.2, 0.9),
  ],
  // Hồi Thiên Đan Lộ (chiêu cuối): lò đan khổng lồ hiện trên cao rót dòng đan dịch xanh ngọc-vàng nhạt xuống đạo hữu ngã, dưới đó nở bông sen lớn nhiều lớp; khói thuốc cuộn quanh lò.
  skl_hoi_thien_dan_lo: () => [
    gather('dan_smoke_bud', { size: 4.6, off: [0, 5.2, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 4.6, 0], -0.34),
    scorch('self', [0, 0.02, 0], 3.4, -0.2),
    strike('dan_cauldron_big', { size: 6.6, at: 'self', off: [0, 5.4, 0], dur: 1.6, erodeFrom: 0.5 }),
    sprite('dan_smoke_bud', { t: 0.0, dur: 1.3, at: 'self', off: [0, 6.2, 0], size: 5, alpha: 0.55, erodeFrom: 0.4 }),
    sprite('dan_pour', { t: 0.04, dur: 1.1, at: 'self', off: [0, 2.7, 0.2], size: 5.6, alpha: 0.9, erodeFrom: 0.45 }),
    strike('dan_lotus_big', { size: 7.4, t: 0.1, at: 'self', off: [0, 0.8, 0], dur: 1.6, erodeFrom: 0.55, alpha: 0.9 }),
    flash('self', [0, 1.3, 0], 4.4, 0.03, { dur: 0.22 }),
    after('self', [0, 1.8, 0], 3.6, 0.22, 1.8),
    sparks('self', [0, 1.5, 0], 16, 0.04),
  ],
  // Thiên Đan Pháp Giới (chiêu cuối): vườn đan dược 14 m: viên đan khổng lồ bóng ngọc lơ lửng xoay quanh, linh thảo mọc quanh mép vùng, sương vàng nhạt; ngọn lửa thuốc vàng chanh trên đỉnh.
  skl_thien_dan_phap_gioi: () => [
    gather('dan_herb_ring', { size: 8, off: [0, 0.6, 0], rest: { at: 'self' } }),
    pullIn('self', [0, 1, 0], -0.4),
    scorch('self', [0, 0.02, 0], 5, -0.3, 2.4),
    strike('dan_herb_ring', { size: 13, at: 'self', off: [0, 0.4, 0], dur: 2.0, erodeFrom: 0.65 }),
    ...[
      [-4.6, 2.2, -2.6, 0.04],
      [4.8, 2.6, -1.8, 0.1],
      [0.4, 2.4, 4.6, 0.16],
    ].map(([x, y, z, dt]) => sprite('dan_pills3', { t: dt, dur: 1.8, at: 'self', off: [x, y, z], size: 3.4, alpha: 0.85, erodeFrom: 0.6 })),
    sprite('dan_flame', { t: 0.05, dur: 1.6, at: 'self', off: [0, 4.4, 0], size: 3.2, alpha: 0.85, erodeFrom: 0.5 }),
    sprite('dan_smoke_bud', { t: 0.0, dur: 1.8, at: 'self', off: [0, 1.6, 0], size: 4.4, alpha: 0.4, erodeFrom: 0.5 }),
    flash('self', [0, 1.4, 0], 4.2, 0.03, { dur: 0.22 }),
    after('self', [0, 1.6, 0], 3.8, 0.24, 1.6),
    leaves('self', [0, 1.2, 0], 16, 0.05, { spread: 5, speed: 0.7, life: 1.4 }),
  ],
};

const HEAD = {
  skl_luu_huong_bo: { trigger: 'fx', fxKind: 'dash', method: 'thanh_moc_dan_kinh' },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  K = SCALE[id] ?? 1;
  A = ALPHA[id] ?? 1;
  const p = `packages/content/data/fx/${id}.json`;
  const t = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { skill: id, ...(HEAD[id] ?? {}), events: [] };
  // bỏ hình cũ (mesh lotus/pill_orb/petal_blade/rune...), decal rune và hạt rim/inward do bản trước sinh; giữ âm thanh, rung, hitstop, chớp, vignette, camera, hạt viết tay
  t.events = t.events.filter(
    (e) =>
      e.type !== 'mesh' &&
      !(e.type === 'decal' && e.tex === 'rune') &&
      !(e.type === 'decal' && e.tex === 'scorch' && e.alpha === 0.78) &&
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && (e.kind === 'spark' || e.kind === 'petal')),
  );
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
