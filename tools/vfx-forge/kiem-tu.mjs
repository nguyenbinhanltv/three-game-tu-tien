#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Kiếm tu: dựng timeline 10 chiêu theo concept Codex (màu ngọc lam/cyan, lõi mực lam lục tối, viền bạc) bằng sprite vẽ tay (ô `kiem_*` của atlas, kiểu tô `kiem` = `fxA.x` 2).
// Mỗi chiêu một hình riêng và ba nhịp báo trước / trúng (+30 ms `kiem_flash`) / dư ba.
// Chạy lại an toàn: bỏ mọi sự kiện `mesh`, decal rune, hạt rim cũ (cả trong `variants`), giữ âm thanh/rung/hitstop/chớp/vignette/camera. Dùng: node tools/vfx-forge/kiem-tu.mjs [id...]
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
  skl_kiem_anh_bo: 1.05,
  skl_phi_kiem_truy_hon: 1,
  skl_van_kiem_quy_tong: 0.75,
  skl_hoanh_kiem_pha_mach: 0.62,
  skl_kiem_vu_tam_diep: 0.9,
  skl_kiem_dan_ban_menh: 1,
  skl_nghich_kiem_chuyen_phong: 0.62,
  skl_phan_anh_kiem_anh: 0.9,
  skl_thuan_di_tram: 0.9,
  skl_thien_kiem_hoa_hinh: 0.55,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `kiem_flash`). */
let A = 1;
const ALPHA = {
  skl_van_kiem_quy_tong: 0.85,
  skl_thien_kiem_hoa_hinh: 0.8,
  skl_phan_anh_kiem_anh: 0.8,
  skl_hoanh_kiem_pha_mach: 0.65,
  skl_nghich_kiem_chuyen_phong: 0.65,
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
    ...(name === 'kiem_flash' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
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
  sprite('kiem_flash', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
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
  sprite('kiem_sparks', {
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
const ground = (at, off, size, t = 0.02, o = {}) =>
  sprite('kiem_cracks', { t, dur: 0.6, at, off, size, sizeTo: size * 1.15, alpha: 0.8, erodeFrom: 0.15, ...o });

const SPEC = {
  // Kiếm Ảnh Bộ (lướt, mọi mốc ≥ 0): hàng ảnh kiếm nối đuôi dọc đường lướt, hai đầu bật chớp chữ thập.
  skl_kiem_anh_bo: () => [
    flash('self', [0, 1.1, 0], 2.4, 0, { dur: 0.22 }),
    strike('kiem_afterimages', { size: 8.5, at: 'ahead', off: [0, 1.1, 2.4], dur: 0.24, alpha: 0.45, align: 'aim', erodeFrom: 0.1 }),
    sprite('kiem_slash', { t: 0.02, dur: 0.2, at: 'ahead', off: [0, 1.2, 1.6], size: 4.2, alpha: 0.9, align: 'aim', erodeFrom: 0.3 }),
    flash('ahead', [0, 1.1, 6.4], 2.2, 0.02),
    // lõi mực tối dọc đường lướt (nền sáng ban ngày)
    scorch('ahead', [0, 0.02, 1.8], 2.2, 0, 1.4),
    scorch('ahead', [0, 0.02, 4], 2.4, 0.02, 1.4),
    scorch('ahead', [0, 0.02, 6.2], 2.6, 0.04, 1.4),
    after('ahead', [0, 2.2, 5], 2.2, 0.2, 1.1),
    sparks('ahead', [0, 1.1, 5], 8, 0.04),
  ],
  // Phi Kiếm Truy Hồn: phi kiếm lớn đuôi lụa bay vòng cung đuổi mục tiêu, trúng thì cắm xuống bừng Kiếm ấn nổi trên đầu.
  skl_phi_kiem_truy_hon: () => [
    ...[gather('kiem_flying', { size: 3.4, off: [0, 1.4, 1.2], rest: { at: 'self', align: 'aim' } })],
    pullIn('self', [0, 1.3, 0.6], -0.24),
    sprite('kiem_flying', {
      t: -0.02,
      dur: 0.2,
      at: 'self',
      off: [0, 1.5, 2],
      size: 5,
      alpha: 0.95,
      align: 'aim',
      erodeFrom: 0.5,
      move: { to: 'target', offset: [0, 1.3, -2.8], ease: 'out' },
    }),
    flash('target', [0, 1.3, 0], 1.6, 0.03, { dur: 0.12 }),
    sprite('kiem_seal', { t: 0.05, dur: 0.8, off: [0, 3.3, 0], size: 2.2, alpha: 0.95, erodeFrom: 0.35 }),
    scorch('target', [0, 0.02, 0], 1.6, 0.02),
    after('target', [0, 2.9, 0], 2.0, 0.18, 1.3),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Vạn Kiếm Quy Tông (chiêu cuối): mưa kiếm hình nón rơi chụm, cắm nghiêng thành vòng kiếm đứng quanh cột sáng, nứt đất lan.
  skl_van_kiem_quy_tong: () => [
    ...[gather('kiem_rain', { size: 7, off: [0, 5, 0] })],
    pullIn('target', [0, 4.5, 0], -0.3),
    strike('kiem_rain', { size: 9, off: [0, 6.2, 0], dur: 0.3, erodeFrom: 0.2 }),
    strike('kiem_circle', { size: 9, off: [0, 0.5, 0], t: 0.05, dur: 0.5, alpha: 0.4, erodeFrom: 0.15 }),
    flash('target', [0, 1.4, 0], 2.4, 0.03, { dur: 0.14 }),
    ground('target', [0, 0.15, 0], 6.5, 0.04, { dur: 0.5, alpha: 0.5 }),
    scorch('target', [0, 0.02, 0], 4.2, 0.03, 2.4),
    after('target', [0, 2.6, 0], 4, 0.22, 1.8),
    sparks('target', [0, 1.4, 0], 16, 0),
  ],
  // Hoành Kiếm Phá Mạch: đạo kiếm khí bản rộng răng cưa quét ngang 12 m, để lại vết nứt đất.
  skl_hoanh_kiem_pha_mach: () => [
    ...[gather('kiem_wave', { size: 5, off: [0, 1.0, 2], rest: { at: 'ahead', align: 'aim' } })],
    pullIn('self', [0, 1.1, 0.6], -0.24),
    strike('kiem_wave', { size: 11, at: 'ahead', off: [0, 1.0, 6.2], dur: 0.5, align: 'aim', erodeFrom: 0.2 }),
    flash('ahead', [0, 1.1, 11], 1.2, 0.02, { dur: 0.1 }),
    scorch('ahead', [0, 0.02, 6.2], 2.6, 0.02),
    after('ahead', [0, 1.2, 6], 3.2, 0.2, 1.1),
    sparks('ahead', [0, 1.1, 6], 12, 0.02),
  ],
  // Kiếm Vũ Tam Điệp: ba nhát liền thành chữ ký ba nét — ba cung chém ba góc như cánh quạt, nét cuối to nhất, khắc Kiếm ấn.
  skl_kiem_vu_tam_diep: () => [
    ...[gather('kiem_arcs3', { size: 3, off: [0, 1.2, 0] })],
    pullIn('target', [0, 1.2, 0], -0.22),
    // gắn `hit` 0/1/2: mỗi nhát chỉ phát ở mốc trúng của nó (server báo hit marks), nét cuối to nhất + Kiếm ấn
    strike('kiem_slash', { size: 4.2, off: [0, 1.2, 0], t: 0, dur: 0.3, rot: [0, 0, 0], erodeFrom: 0.2, hit: 0 }),
    strike('kiem_slash', { size: 4.4, off: [0, 1.2, 0], t: 0, dur: 0.3, rot: [0, 0, 58], erodeFrom: 0.2, hit: 1 }),
    strike('kiem_arcs3', { size: 5.2, off: [0, 1.2, 0], t: 0, dur: 0.6, rot: [0, 0, -50], erodeFrom: 0.2, hit: 2 }),
    flash('target', [0, 1.2, 0], 2.4, 0.02, { hit: 2 }),
    sprite('kiem_seal', { t: 0.08, dur: 0.6, off: [0, 2.4, 0], size: 1.8, alpha: 0.9, erodeFrom: 0.3, hit: 2 }),
    scorch('target', [0, 0.02, 0], 1.8, 0.0),
    after('target', [0, 1.3, 0], 2.4, 0.2, 1.3),
  ],
  // Kiếm Đan Bản Mệnh: viên kiếm đan sáng lượn trên vòng quỹ đạo mực nghiêng quanh thân, mỗi nhịp phóng một vệt đâm.
  skl_kiem_dan_ban_menh: () => [
    ...[gather('kiem_pill', { size: 1.6, off: [0, 1.2, 0], rest: { at: 'self' } })],
    pullIn('self', [0, 1.2, 0], -0.24),
    strike('kiem_pill', { size: 3.4, at: 'self', off: [0, 1.3, 0], dur: 1.2, erodeFrom: 0.5 }),
    sprite('kiem_slash', { t: 0.3, dur: 0.35, at: 'self', off: [0, 1.3, 2.4], size: 4, alpha: 0.9, align: 'aim', erodeFrom: 0.3 }),
    flash('self', [0, 1.3, 0], 1.8, 0.02),
    scorch('self', [0, -1.05, 0], 1.5, -0.1),
    after('self', [0, 1.3, 0], 2, 0.3, 1.1),
  ],
  // Nghịch Kiếm Chuyển Phong (lướt, mọi mốc ≥ 0): kiếm quang thẳng quấn xoáy gió xoắn ốc như mũi khoan, cuốn lá bụi hai bên.
  skl_nghich_kiem_chuyen_phong: () => [
    flash('self', [0, 1.1, 0], 1.2, 0, { dur: 0.1 }),
    strike('kiem_drill', { size: 8.5, at: 'ahead', off: [0, 1.2, 4], dur: 0.55, align: 'aim', erodeFrom: 0.25 }),
    flash('ahead', [0, 1.2, 8], 1.2, 0.03, { dur: 0.1 }),
    scorch('ahead', [0, 0.02, 1.6], 2.4, 0, 1.4),
    scorch('ahead', [0, 0.02, 4.4], 3.4, 0.02, 1.4),
    scorch('ahead', [0, 0.02, 7.4], 2.8, 0.04, 1.4),
    after('ahead', [0, 1.3, 5], 2.6, 0.22, 1.2),
    sparks('ahead', [0, 1.2, 5], 10, 0.05),
  ],
  // Phân Anh Kiếm Ảnh: bên người hiện một thanh kiếm khổng lồ trong suốt như bóng gương, lặp lại mỗi nhát chém bằng vết chém mờ.
  skl_phan_anh_kiem_anh: () => [
    ...[gather('kiem_ghost', { size: 3.6, off: [1.6, 2.0, -0.4], rest: { at: 'self' } })],
    pullIn('self', [1.2, 1.6, 0], -0.24),
    strike('kiem_ghost', { size: 5.2, at: 'self', off: [1.6, 2.1, -0.4], dur: 1.1, alpha: 0.8, erodeFrom: 0.4 }),
    sprite('kiem_slash', { t: 0.25, dur: 0.4, at: 'self', off: [1.2, 1.3, 1.6], size: 3.6, alpha: 0.5, align: 'aim', erodeFrom: 0.3 }),
    flash('self', [1.4, 1.8, 0], 1.8, 0.03),
    scorch('self', [0, -1.05, 0], 1.5, -0.1),
    after('self', [1.2, 1.4, 0], 2, 0.3, 1.1),
  ],
  // Thuấn Di Trảm: vết RÁCH KHÔNG GIAN thẳng đứng mở ra trước mặt địch (ruột tối mép bạc, mảnh vỡ bay quanh), nhát chém giáng dọc khe.
  skl_thuan_di_tram: () => [
    sprite('kiem_sparks', { t: -0.1, dur: 0.3, at: 'self', off: [0, 1.0, 0], size: 2, alpha: 0.6, erodeFrom: 0.3 }),
    pullIn('target', [0, 1.4, 0], -0.2),
    strike('kiem_rift', { size: 4.6, off: [0, 1.7, 0], t: 0, dur: 0.6, erodeFrom: 0.3 }),
    strike('kiem_slash', { size: 4, off: [0, 1.6, 0], t: 0.05, dur: 0.3, rot: [0, 0, 90], erodeFrom: 0.2 }),
    flash('target', [0, 1.4, 0], 2.4, 0.03),
    scorch('target', [0, 0.02, 0], 1.8, 0.03),
    after('target', [0, 1.4, 0], 2.6, 0.2, 1.3),
    sparks('target', [0, 1.3, 0], 10, 0.02),
  ],
  // Thiên Kiếm Hóa Hình (chiêu cuối): thanh kiếm khổng lồ trong suốt từ trời cắm xuống, nứt đất lan, vành đá vỡ bay lên.
  skl_thien_kiem_hoa_hinh: () => [
    ...[gather('kiem_bigsword', { size: 7, off: [0, 8, 0] })],
    pullIn('target', [0, 6, 0], -0.3),
    strike('kiem_bigsword', {
      size: 9,
      off: [0, 8, 0],
      dur: 0.7,
      erodeFrom: 0.3,
      move: { to: 'target', offset: [0, 4.6, 0], ease: 'in' },
    }),
    strike('kiem_cracks', { size: 11, off: [0, 0.4, 0], t: 0.06, dur: 1.2, erodeFrom: 0.4 }),
    flash('target', [0, 1.4, 0], 4.2, 0.04, { dur: 0.24 }),
    scorch('target', [0, 0.02, 0], 4.6, 0.04, 2.6),
    after('target', [0, 1.8, 0], 4.2, 0.24, 1.8),
    sparks('target', [0, 1.5, 0], 16, 0),
  ],
};

/** Biến thể (`variants`, bật theo nhánh công pháp): thay hình cũ bằng sprite cùng tinh thần, nhỏ gọn (cộng thêm vào hình chính). */
const VARIANTS = {
  skl_phi_kiem_truy_hon: () => ({
    deep: [
      sprite('kiem_flying', {
        t: 0.1,
        dur: 0.24,
        at: 'target',
        off: [0, 5, 0],
        size: 3,
        alpha: 0.9,
        move: { to: 'target', ease: 'in', offset: [0, 0.8, 0] },
      }),
    ],
    spread: [2.6, -2.4].map((x, i) =>
      sprite('kiem_flying', {
        t: 0.12,
        dur: 0.24,
        at: 'target',
        off: [0, 1, 0],
        size: 2,
        alpha: 0.85,
        move: { to: 'target', offset: [x, 1, i ? 1.8 : 1.2], ease: 'out' },
      }),
    ),
  }),
  skl_hoanh_kiem_pha_mach: () => ({
    long: [sprite('kiem_wave', { t: 0.2, dur: 0.5, at: 'ahead', off: [0, 0.9, 15], size: 6, alpha: 0.8, align: 'aim', erodeFrom: 0.3 })],
    twin: [
      sprite('kiem_slash', {
        t: 0,
        dur: 0.34,
        at: 'ahead',
        off: [0, 0.9, 1],
        size: 4,
        alpha: 0.85,
        align: 'aim',
        move: { to: 'ahead', offset: [0, 0.9, 12], ease: 'out' },
      }),
    ],
  }),
  skl_kiem_vu_tam_diep: () => ({ knock: [flash('target', [0, 0.4, 0], 2, 0.1, { dur: 0.3 })] }),
  skl_nghich_kiem_chuyen_phong: () => ({ return: [flash('self', [0, 0.6, 0], 1.6, 0.3, { dur: 0.3 })] }),
  skl_thuan_di_tram: () => ({
    blast: [sprite('kiem_cracks', { t: 0.12, dur: 0.7, at: 'target', off: [0, 0.3, 0], size: 4.4, alpha: 0.85, erodeFrom: 0.3 })],
  }),
  skl_thien_kiem_hoa_hinh: () => ({
    freeze: [sprite('kiem_cracks', { t: 0.3, dur: 1.0, at: 'target', off: [0, 0.3, 0], size: 12, alpha: 0.8, erodeFrom: 0.4 })],
    echo: [sprite('kiem_ghost', { t: 0.4, dur: 0.8, at: 'target', off: [0, 2, 0], size: 6, alpha: 0.55, erodeFrom: 0.3 })],
  }),
};

const HEAD = {
  skl_kiem_anh_bo: { trigger: 'fx', fxKind: 'dash', method: 'lac_kiem_quyet' },
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
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'),
  );
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  if (t.variants) {
    const v = VARIANTS[id]?.() ?? {};
    for (const k of Object.keys(t.variants)) {
      // giữ sự kiện không phải hình (âm thanh...), thay phần mesh bằng sprite mới
      t.variants[k] = [...t.variants[k].filter((e) => e.type !== 'mesh'), ...(v[k] ?? [])];
    }
  }
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
