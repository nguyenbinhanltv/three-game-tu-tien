#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Hộ pháp (Thể tu): dựng timeline 10 chiêu theo concept Codex (vàng đất/ochre ấm, lõi mực nâu olive, viền kem vàng; không ánh bạc) bằng sprite vẽ tay (ô `hp_*` của atlas, kiểu tô `hophap` = `fxA.x` 3).
// Mỗi chiêu một hình riêng (mũi giáp nêm + rãnh cày, con dấu vuông + nứt chữ điền, vỏ tinh thể, nắm đấm đá, chuông đồng, ba đỉnh núi, sóng đất tường nghiêng, bóng giáp trụ, khiên cổ, pháp tướng) và ba nhịp báo trước / trúng (+30 ms `hp_flash`) / dư ba.
// Chạy lại an toàn: bỏ mọi sự kiện `mesh`, decal rune, hạt rim cũ (cả trong `variants`), giữ âm thanh/rung/hitstop/chớp/vignette/camera. Dùng: node tools/vfx-forge/ho-phap.mjs [id...]
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
/** Hệ số cỡ theo chiêu (chỉnh sau khi đo `pnpm shots vfxlab --clean`: chiêu thường phủ ≤ 0,2, chiêu cuối ≤ 0,35). */
let K = 1;
const SCALE = {
  skl_thiet_bich_xung: 0.68,
  skl_tran_son_an: 0.58,
  skl_kim_cuong_bat_hoai: 1,
  skl_thiet_quyen_chan_dia: 0.7,
  skl_kim_chung_tran: 1,
  skl_son_nhac_hoa_than: 0.92,
  skl_dich_son_xung: 0.55,
  skl_anh_thiet_than: 1,
  skl_thuan_di_ho_the: 0.82,
  skl_thien_kim_phap_tuong: 0.6,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `hp_flash`). */
let A = 1;
const ALPHA = {
  skl_thiet_bich_xung: 0.75,
  skl_dich_son_xung: 0.65,
};
/** Trần chớp toàn màn hình (sự kiện `flash`) cho chiêu hay cháy trắng: giữ cảm giác trúng nhưng không tẩy trắng khung. */
const FLASH_CAP = { skl_thiet_bich_xung: 0.06, skl_dich_son_xung: 0.06 };
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
    ...(name === 'hp_flash' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
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
  sprite('hp_flash', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
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
  sprite('hp_dust', {
    t,
    dur: 0.6,
    at,
    off,
    size,
    alpha: 0.75,
    erodeFrom: 0.2,
    move: { to: at, offset: [off[0], off[1] + up, off[2]], ease: 'out' },
  });
/** Vết cháy mực tối trên đất (decal `scorch`, tông shadow): lõi tối cho nền sáng ban ngày (chuẩn 2 luật 4). alpha 0,78 làm dấu để chạy lại không nhân đôi. */
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
/** Mép vùng tác dụng THẬT (server `radius`): decal nứt đất mờ trải tới bán kính `r` m để người chơi đọc đúng tầm; alpha 0,31 làm dấu để chạy lại không nhân đôi. */
const zoneEdge = (at, r, t = 0.05) => ({
  type: 'decal',
  tex: 'crack',
  t,
  r,
  dur: 1.4,
  at,
  offset: [0, 0, 0],
  grow: 0.25,
  tone: 'core',
  alpha: 0.31,
  tier: 1,
});
const ground = (at, off, size, t = 0.02, o = {}) =>
  sprite('hp_cracks', { t, dur: 0.6, at, off, size, sizeTo: size * 1.15, alpha: 0.8, erodeFrom: 0.15, ...o });

const SPEC = {
  // Thiết Bích Xung (lướt, mọi mốc ≥ 0): mũi giáp vàng hình nêm lao ngang, hai rãnh đất cày bốc bụi phía sau, tới nơi bật cú va nhọn.
  skl_thiet_bich_xung: () => [
    flash('self', [0, 1.0, 0], 1, 0, { dur: 0.08 }),
    strike('hp_wedge', { size: 5.6, at: 'ahead', off: [0, 1.1, 2.8], dur: 0.28, align: 'aim', erodeFrom: 0.15 }),
    sprite('hp_furrows', { t: 0.02, dur: 0.34, at: 'ahead', off: [0, 0.15, 3.2], size: 7, alpha: 0.35, align: 'aim', erodeFrom: 0.15 }),
    flash('ahead', [0, 1.1, 6.2], 1, 0.03, { dur: 0.08 }),
    scorch('ahead', [0, 0.02, 2.2], 3.2, 0, 1.4),
    scorch('ahead', [0, 0.02, 2.2], 2.72, 0, 1.4),
    scorch('ahead', [0, 0.02, 5], 3.4, 0.03, 1.4),
    after('ahead', [0, 2.2, 5], 3, 0.2, 1),
    sparks('ahead', [0, 1.1, 5], 8, 0.04),
  ],
  // Trấn Sơn Ấn: con dấu vuông khắc núi từ trên ép xuống, đất nứt thành ô vuông chữ điền với bốn cột đá ở góc.
  skl_tran_son_an: () => [
    ...[gather('hp_seal', { size: 3.2, off: [0, 4.2, 0] })],
    pullIn('target', [0, 3.6, 0], -0.26),
    strike('hp_seal', { size: 5, off: [0, 6.2, 0], dur: 0.3, erodeFrom: 0.2, move: { to: 'target', offset: [0, 4.4, 0], ease: 'in' } }),
    zoneEdge('target', 12),
    strike('hp_fieldcracks', { size: 11, off: [0, 0.4, 0], t: 0.06, dur: 1.0, alpha: 0.25, erodeFrom: 0.2 }),
    flash('target', [0, 2.0, 0], 2.0, 0.04, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 3.4, 0.03, 2),
    after('target', [0, 3.6, 0], 3.6, 0.2, 1.3),
    sparks('target', [0, 1.2, 0], 12, 0.02),
  ],
  // Kim Cương Bất Hoại (chiêu cuối): vỏ tinh thể vàng nhiều mặt nhọn bao quanh thân như hốc geode, ánh sáng xuyên mặt, mảnh vỡ rơi.
  skl_kim_cuong_bat_hoai: () => [
    ...[gather('hp_crystal', { size: 2.6, off: [0, 1.2, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1.1, 0], -0.28),
    strike('hp_crystal', { size: 4.8, at: 'self', off: [0, 1.25, 0], dur: 1.6, erodeFrom: 0.45 }),
    sprite('hp_rubble', { t: 0.1, dur: 0.8, at: 'self', off: [0, 1.4, 0], size: 4.2, alpha: 0.8, erodeFrom: 0.3 }),
    flash('self', [0, 1.3, 0], 2.8, 0.03, { dur: 0.18 }),
    scorch('self', [0, -1.05, 0], 2.4, -0.1, 2.4),
    scorch('self', [0, -1.05, 0], 2.04, -0.1, 2.4),
    after('self', [0, 1.4, 0], 3, 0.25, 1.4),
    sparks('self', [0, 1.2, 0], 14, 0),
  ],
  // Thiết Quyền Chấn Địa: nắm đấm khổng lồ vàng-đá giáng xuống đất, đất nứt tia xòe, đá tảng bay lên rồi rơi.
  skl_thiet_quyen_chan_dia: () => [
    ...[gather('hp_fist', { size: 2.8, off: [0, 4.4, 0] })],
    pullIn('target', [0, 3, 0], -0.26),
    strike('hp_fist', { size: 4.6, off: [0, 4.6, 0], dur: 0.34, erodeFrom: 0.35, move: { to: 'target', offset: [0, 2.8, 0], ease: 'in' } }),
    zoneEdge('target', 6, 0.06),
    strike('hp_cracks', { size: 8, off: [0, 0.15, 0], t: 0.06, dur: 0.32, alpha: 0.3, erodeFrom: 0.15 }),
    sprite('hp_rubble', { t: 0.08, dur: 0.34, off: [0, 0.6, 0], size: 3.4, alpha: 0.45, erodeFrom: 0.15 }),
    flash('target', [0, 1.2, 0], 1.8, 0.04, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 3, 0.04, 2),
    scorch('target', [0, 0.02, 0], 3.4, 0.05, 2),
    after('target', [0, 2.5, 0], 3.4, 0.22, 1.4),
    sparks('target', [0, 1.3, 0], 12, 0.02),
  ],
  // Kim Chung Trấn: quả chuông đồng vàng lớn úp xuống che thân, sóng âm dọc, bụi tỏa chân chuông.
  skl_kim_chung_tran: () => [
    ...[gather('hp_bell', { size: 2.4, off: [0, 3.6, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1.4, 0], -0.26),
    strike('hp_bell', {
      size: 3.8,
      at: 'self',
      off: [0, 2.2, 0],
      dur: 1.4,
      alpha: 0.85,
      erodeFrom: 0.5,
      move: { to: 'self', offset: [0, 1.7, 0], ease: 'in' },
    }),
    flash('self', [0, 1.4, 0], 2, 0.03, { dur: 0.14 }),
    scorch('self', [0, -1.05, 0], 2.2, -0.05, 2.2),
    after('self', [0, 0.6, 0], 3, 0.25, 1),
  ],
  // Sơn Nhạc Hóa Thân: thân phình lớn thành ngọn núi — ba đỉnh núi đá lởm chởm trồi lên quanh người, tảng đá và mây bụi quấn chân.
  skl_son_nhac_hoa_than: () => [
    ...[gather('hp_peaks', { size: 2.6, off: [0, 1.4, -0.4], rest: { at: 'self' } })],
    pullIn('self', [0, 0.8, 0], -0.26),
    strike('hp_peaks', { size: 5.4, at: 'self', off: [0, 2.4, -0.6], dur: 1.6, erodeFrom: 0.5 }),
    sprite('hp_dust', { t: 0.04, dur: 1, at: 'self', off: [0, 0.8, 0], size: 4.6, alpha: 0.7, erodeFrom: 0.3 }),
    flash('self', [0, 1.4, 0], 2.2, 0.03, { dur: 0.14 }),
    scorch('self', [0, -1.05, 0], 2.6, -0.1, 2.4),
    after('self', [0, 1.2, 0], 3, 0.25, 1.2),
  ],
  // Dịch Sơn Xung (lướt, mọi mốc ≥ 0): sóng đất đá hình tường nghiêng hất ra xa, tảng đá lăn theo hướng húc.
  skl_dich_son_xung: () => [
    flash('self', [0, 1.0, 0], 0.9, 0, { dur: 0.08 }),
    strike('hp_earthwave', { size: 7, at: 'ahead', off: [0, 1.2, 3.8], dur: 0.3, align: 'aim', erodeFrom: 0.15, unless: 'pull' }),
    sprite('hp_rubble', { t: 0.04, dur: 0.36, at: 'ahead', off: [0, 1.4, 5], size: 4.6, alpha: 0.55, align: 'aim', erodeFrom: 0.2 }),
    flash('ahead', [0, 1.2, 7], 1, 0.03, { dur: 0.08 }),
    scorch('ahead', [0, 0.02, 3], 3.4, 0, 1.4),
    scorch('ahead', [0, 0.02, 3], 2.89, 0, 1.4),
    scorch('ahead', [0, 0.02, 6], 3.6, 0.03, 1.4),
    scorch('ahead', [0, 0.02, 4.5], 4.2, 0.02, 1.4),
    after('ahead', [0, 2.2, 6], 3, 0.22, 1),
  ],
  // Anh Thiết Thân: bóng giáp trụ cổ phong trong suốt đứng che sau lưng, mắt xích vàng nối tới đồng đội.
  skl_anh_thiet_than: () => [
    ...[gather('hp_armor', { size: 2.6, off: [0, 2, -0.8], rest: { at: 'self' } })],
    pullIn('self', [0, 1.4, 0], -0.24),
    strike('hp_armor', { size: 4.4, at: 'self', off: [0, 2.2, -0.8], dur: 1.6, alpha: 0.75, erodeFrom: 0.5 }),
    flash('self', [0, 1.4, 0], 2, 0.03, { dur: 0.14 }),
    scorch('self', [0, -1.05, 0], 3.2, -0.1, 2.4),
    scorch('self', [0, -1.05, 0], 2.72, -0.1, 2.4),
    after('self', [0, 1.3, 0], 2.6, 0.25, 1.2),
  ],
  // Thuấn Di Hộ Thế: vệt ánh vàng nối hai điểm, tới nơi úp lên đồng đội tấm khiên cổ đỉnh nhọn.
  skl_thuan_di_ho_the: () => [
    sprite('hp_flash', { t: -0.1, dur: 0.3, at: 'self', off: [0, 1.0, 0], size: 2, alpha: 0.7, erodeFrom: 0.3 }),
    pullIn('target', [0, 1.6, 0], -0.22),
    strike('hp_shield', { size: 2.8, off: [0, 3.1, 0], dur: 1.0, erodeFrom: 0.45 }),
    flash('target', [0, 1.6, 0], 1.5, 0.03, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 3, 0.03, 1.8),
    scorch('target', [0, 0.02, 0], 2.55, 0.03, 1.8),
    sprite('hp_dust', { t: 0.15, dur: 0.5, off: [0, 0.3, 0], size: 2.4, alpha: 0.4, erodeFrom: 0.2 }),
    after('target', [0, 2.6, 0], 2.4, 0.25, 1.2),
  ],
  // Thiên Kim Pháp Tướng: pháp tướng giáp trụ vàng khổng lồ không mặt hiện sau lưng, giậm chân nứt đất.
  skl_thien_kim_phap_tuong: () => [
    ...[gather('hp_guardian', { size: 5, off: [0, 3.6, -2.2], rest: { at: 'self' } })],
    pullIn('self', [0, 1.4, 0], -0.3),
    strike('hp_guardian', { size: 9, at: 'self', off: [0, 4, -2.4], dur: 1.8, alpha: 0.9, erodeFrom: 0.5 }),
    strike('hp_cracks', { size: 9, at: 'self', off: [0, 0.4, 0], t: 0.1, dur: 1.1, erodeFrom: 0.4 }),
    flash('self', [0, 1.4, 0], 2.8, 0.04, { dur: 0.16 }),
    scorch('self', [0, -1.05, 0], 3.4, 0, 2.6),
    after('self', [0, 1.5, 0], 3.4, 0.25, 1.4),
    sparks('self', [0, 1.4, 0], 12, 0.04),
  ],
};

/** Biến thể (`variants`, bật theo nhánh công pháp): thay hình cũ bằng sprite cùng tinh thần, nhỏ gọn (cộng thêm vào hình chính). */
const VARIANTS = {
  skl_tran_son_an: () => ({
    wide: [sprite('hp_fieldcracks', { t: 0.1, dur: 0.9, off: [0, 0.4, 0], size: 14, alpha: 0.7, erodeFrom: 0.4 })],
    guard: [sprite('hp_shield', { t: 0.1, dur: 0.9, at: 'self', off: [0, 1.8, 0.4], size: 2.6, alpha: 0.85, erodeFrom: 0.4 })],
  }),
  skl_thiet_quyen_chan_dia: () => ({
    wide: [sprite('hp_cracks', { t: 0.12, dur: 0.9, off: [0, 0.4, 0], size: 11, alpha: 0.7, erodeFrom: 0.4 })],
    slow: [sprite('hp_dust', { t: 0.1, dur: 1, off: [0, 0.8, 0], size: 4, alpha: 0.6, erodeFrom: 0.3 })],
  }),
  skl_kim_chung_tran: () => ({
    thorn: [sprite('hp_rubble', { t: 0.1, dur: 0.7, at: 'self', off: [0, 1.2, 0], size: 3.6, alpha: 0.8, erodeFrom: 0.3 })],
    ally: [sprite('hp_shield', { t: 0.1, dur: 0.9, at: 'self', off: [0, 1.8, 0], size: 2.4, alpha: 0.8, erodeFrom: 0.4 })],
  }),
  skl_son_nhac_hoa_than: () => ({
    regen: [sprite('hp_dust', { t: 0.2, dur: 1, at: 'self', off: [0, 0.8, 0], size: 3.6, alpha: 0.6, erodeFrom: 0.3 })],
    stomp: [sprite('hp_cracks', { t: 0.3, dur: 0.9, at: 'self', off: [0, 0.4, 0], size: 8, alpha: 0.7, erodeFrom: 0.4 })],
  }),
  skl_dich_son_xung: () => ({
    stun: [flash('ahead', [0, 1.4, 7], 1.6, 0.1, { dur: 0.2 })],
    pull: [
      sprite('hp_rubble', {
        t: 0.1,
        dur: 0.6,
        at: 'ahead',
        off: [0, 1.2, 6],
        size: 4,
        alpha: 0.85,
        align: 'aim',
        erodeFrom: 0.3,
        move: { to: 'ahead', offset: [0, 1.2, 1.5], ease: 'in' },
      }),
      sprite('hp_dust', { t: 0.1, dur: 0.6, at: 'ahead', off: [0, 0.8, 5], size: 3.4, alpha: 0.6, align: 'aim', erodeFrom: 0.3 }),
    ],
  }),
  skl_anh_thiet_than: () => ({
    long: [sprite('hp_armor', { t: 0.2, dur: 1.2, at: 'self', off: [0, 2.2, -1.4], size: 3.4, alpha: 0.5, erodeFrom: 0.4 })],
    self: [sprite('hp_shield', { t: 0.1, dur: 1, at: 'self', off: [0, 1.8, 0.4], size: 2.4, alpha: 0.8, erodeFrom: 0.4 })],
  }),
  skl_thuan_di_ho_the: () => ({
    taunt: [flash('target', [0, 1.6, 0], 1.6, 0.12, { dur: 0.2 })],
    big: [sprite('hp_shield', { t: 0.1, dur: 1, off: [0, 1.9, 0], size: 4.4, alpha: 0.6, erodeFrom: 0.4 })],
  }),
  skl_thien_kim_phap_tuong: () => ({
    immune: [sprite('hp_crystal', { t: 0.2, dur: 1.2, at: 'self', off: [0, 1.3, 0], size: 4.4, alpha: 0.6, erodeFrom: 0.4 })],
    stomp: [sprite('hp_cracks', { t: 0.5, dur: 1, at: 'self', off: [0, 0.4, 0], size: 11, alpha: 0.65, erodeFrom: 0.4 })],
  }),
};

const HEAD = {
  skl_thiet_bich_xung: { trigger: 'fx', fxKind: 'dash', method: 'bat_dong_kim_than' },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  K = SCALE[id] ?? 1;
  A = ALPHA[id] ?? 1;
  const p = `packages/content/data/fx/${id}.json`;
  const t = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { skill: id, ...(HEAD[id] ?? {}), events: [] };
  // bỏ hình cũ (mesh, decal rune, hạt rim/inward, scorch do bản này sinh); giữ âm thanh, rung, hitstop, chớp, vignette, camera, hạt viết tay
  t.events = t.events.filter(
    (e) =>
      e.type !== 'mesh' &&
      !(e.type === 'decal' && e.tex === 'rune') &&
      !(e.type === 'decal' && e.tex === 'scorch' && e.alpha === 0.78) &&
      !(e.type === 'decal' && e.tex === 'crack' && e.alpha === 0.31) &&
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'),
  );
  for (const e of t.events) if (e.type === 'flash' && FLASH_CAP[id] !== undefined) e.amount = Math.min(e.amount, FLASH_CAP[id]);
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  if (t.variants) {
    const v = VARIANTS[id]?.() ?? {};
    for (const k of Object.keys(t.variants)) {
      // giữ sự kiện không phải hình (âm thanh...), thay phần mesh bằng sprite mới
      t.variants[k] = [...t.variants[k].filter((e) => e.type !== 'mesh' && !(e.type === 'decal' && e.tex === 'rune')), ...(v[k] ?? [])];
    }
  }
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
