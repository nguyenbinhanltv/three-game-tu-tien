#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Cổ Thần: dựng timeline 5 chiêu theo concept Codex (đá bazan nguyên thủy NÂU SẪM gần đen, hổ phách chỉ ở mạch nứt/viền mảnh) bằng sprite vẽ tay (ô `cth_*`, kiểu tô `cth` = `fxA.x` 11).
// Mỗi chiêu một hình riêng và ba nhịp báo trước / trúng (+30 ms `cth_spark`) / dư ba. Chạy lại an toàn (bỏ mesh, decal rune, scorch/mép vùng do bản này sinh; decal cũ quá lớn được làm nhạt). Dùng: node tools/vfx-forge/co-than.mjs [id...]
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
  skl_cu_bo_xung: 0.7,
  skl_thai_co_quyen: 1,
  skl_co_than_nhat_kich: 0.7,
  skl_tinh_bao: 0.7,
  skl_huyet_cu_ho: 0.85,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `cth_spark`). */
let A = 1;
const ALPHA = {};
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
    ...(name === 'cth_spark' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
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
  sprite('cth_spark', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
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
  sprite('cth_dust', {
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
const zoneEdge = (at, r, t = 0.05, alpha = 0.31) => ({
  type: 'decal',
  tex: 'crack',
  t,
  r,
  dur: 1.4,
  at,
  offset: [0, 0, 0],
  grow: 0.25,
  tone: 'core',
  alpha,
  tier: 1,
});
const ground = (at, off, size, t = 0.02, o = {}) =>
  sprite('cth_crater', { t, dur: 0.6, at, off, size, sizeTo: size * 1.15, alpha: 0.8, erodeFrom: 0.15, ...o });

/** Vệt đất tối dưới nét đánh (sprite `cth_smear`): tách nét đá nâu sẫm khỏi nền đá sáng ban ngày. */
const shade = (at, off, size, t = 0, o = {}) =>
  sprite('cth_smear', { t, dur: 0.9, at, off, size: size * 0.7, alpha: 0.45, erodeFrom: 0.4, ...o });

const SPEC = {
  // Cự Bộ Xung (lướt, mọi mốc ≥ 0): bước chân người khổng lồ — hàng dấu chân khổng lồ lõm xuống đất, bụi cuộn, đá văng.
  skl_cu_bo_xung: () => [
    shade('ahead', [0, 0.3, 3.4], 6),
    strike('cth_footprints', { size: 8, at: 'ahead', off: [0, 0.5, 3.6], dur: 0.9, align: 'aim', erodeFrom: 0.4 }),
    sprite('cth_dust', { t: 0.03, dur: 0.9, at: 'ahead', off: [0, 0.9, 3.4], size: 5, alpha: 0.6, erodeFrom: 0.3 }),
    sprite('cth_boulders', { t: 0.05, dur: 0.6, at: 'ahead', off: [0, 1.2, 5], size: 4, alpha: 0.85, erodeFrom: 0.3 }),
    flash('ahead', [0, 0.8, 6], 1.2, 0.03, { dur: 0.1 }),
    scorch('ahead', [0, 0.02, 2], 3, 0, 1.6),
    scorch('ahead', [0, 0.02, 5.5], 3.2, 0.03, 1.6),
    after('ahead', [0, 1, 5], 3, 0.2, 0.9),
    sparks('ahead', [0, 1, 5], 8, 0.04),
  ],
  // Thái Cổ Quyền: nắm đấm đá nhiều tầng vỉa có mạch hổ phách đấm thẳng ra, sóng nén đất theo sau.
  skl_thai_co_quyen: () => [
    ...[gather('cth_fist', { size: 2.6, off: [0, 1.5, 0] })],
    pullIn('target', [0, 1.4, 0], -0.26),
    shade('target', [0, 0.3, 0], 4.4, 0.02),
    strike('cth_fist', { size: 4.6, off: [0, 1.6, 0], dur: 0.55, erodeFrom: 0.35 }),
    sprite('cth_streaks', { t: 0.02, dur: 0.6, off: [0, 1.2, 0], size: 6, alpha: 0.7, align: 'aim', erodeFrom: 0.4 }),
    sprite('cth_boulders', { t: 0.06, dur: 0.6, off: [0, 1.4, 0], size: 4, alpha: 0.85, erodeFrom: 0.3 }),
    flash('target', [0, 1.4, 0], 1.4, 0.03, { dur: 0.1 }),
    scorch('target', [0, 0.02, 0], 3, 0.03, 1.8),
    after('target', [0, 1.3, 0], 3, 0.22, 1),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Cổ Thần Nhất Kích (chiêu cuối): cánh tay đá khổng lồ bổ từ trời xuống, nền vỡ thành hố lõm với đường đứt gãy tỏa như vỉa, ánh hổ phách qua khe.
  skl_co_than_nhat_kich: () => [
    ...[gather('cth_arm', { size: 4.5, off: [0, 7, 0] })],
    pullIn('target', [0, 5, 0], -0.3),
    zoneEdge('target', 9, 0.06, 0.13),
    shade('target', [0, 0.3, 0], 8, 0.04, { dur: 1.2 }),
    strike('cth_arm', { size: 9, off: [0, 7.2, 0], dur: 0.55, erodeFrom: 0.4, move: { to: 'target', offset: [0, 3.6, 0], ease: 'in' } }),
    strike('cth_crater', { size: 10, off: [0, 0.4, 0], t: 0.07, dur: 1.4, erodeFrom: 0.45 }),
    sprite('cth_boulders', { t: 0.08, dur: 0.8, off: [0, 1.8, 0], size: 6, alpha: 0.85, erodeFrom: 0.3 }),
    sprite('cth_veins', { t: 0.08, dur: 1.2, off: [0, 0.6, 0], size: 6, alpha: 0.8, erodeFrom: 0.5 }),
    flash('target', [0, 1.4, 0], 2.6, 0.04, { dur: 0.16 }),
    scorch('target', [0, 0.02, 0], 4.2, 0.04, 2.6),
    after('target', [0, 1.6, 0], 3.8, 0.24, 1.4),
    sparks('target', [0, 1.4, 0], 12, 0),
  ],
  // Tinh Bạo: khối đá nhân hổ phách nổ thành chùm mảnh hổ phách hóa thạch nhọn tỏa như sao.
  skl_tinh_bao: () => [
    ...[gather('cth_core', { size: 2.4, off: [0, 1.4, 0] })],
    pullIn('target', [0, 1.4, 0], -0.26),
    zoneEdge('target', 8, 0.06, 0.13),
    shade('target', [0, 0.3, 0], 5, 0.03),
    strike('cth_core', { size: 3, off: [0, 1.4, 0], t: -0.04, dur: 0.12, erodeFrom: 0.2 }),
    strike('cth_shards', { size: 8, off: [0, 1.4, 0], t: 0.0, dur: 0.7, erodeFrom: 0.3 }),
    sprite('cth_dust', { t: 0.05, dur: 1, off: [0, 0.9, 0], size: 4.4, alpha: 0.5, erodeFrom: 0.3 }),
    flash('target', [0, 1.4, 0], 2.2, 0.03, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 3.4, 0.03, 2),
    after('target', [0, 1.4, 0], 3.2, 0.22, 1.2),
    sparks('target', [0, 1.3, 0], 14, 0.02),
  ],
  // Huyết Cự Hộ: bia đá cổ khắc phù văn đứng sau lưng, rễ hóa thạch ôm thân, phù văn hổ phách chạy dọc thân bia.
  skl_huyet_cu_ho: () => [
    ...[gather('cth_stele', { size: 2.4, off: [0, 1.6, -0.8], rest: { at: 'self' } })],
    pullIn('self', [0, 1.2, 0], -0.24),
    shade('self', [0, 0.25, -0.4], 4.4, 0),
    strike('cth_stele', { size: 4.4, at: 'self', off: [0, 2.2, -0.9], dur: 1.7, erodeFrom: 0.55 }),
    strike('cth_roots', { size: 3.4, at: 'self', off: [0, 1.2, 0], t: 0.03, dur: 1.7, erodeFrom: 0.55 }),
    sprite('cth_dust', { t: 0.05, dur: 1, at: 'self', off: [0, 0.8, 0], size: 3.4, alpha: 0.5, erodeFrom: 0.3 }),
    flash('self', [0, 1.4, 0], 1.4, 0.03, { dur: 0.1 }),
    scorch('self', [0, -1.05, 0], 3, -0.1, 2.4),
    scorch('self', [0, -1.05, 0], 2.2, 0, 2.4),
    after('self', [0, 1.3, 0], 2.6, 0.25, 1.1),
  ],
};

const VARIANTS = {};

const HEAD = {
  skl_cu_bo_xung: { trigger: 'fx', fxKind: 'dash', method: 'co_than_quyet' },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
for (const id of ids) {
  if (!SPEC[id]) throw new Error(`chưa có công thức cho ${id}`);
  seq = 1000;
  K = SCALE[id] ?? 1;
  A = ALPHA[id] ?? 1;
  const p = `packages/content/data/fx/${id}.json`;
  const t = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { skill: id, ...(HEAD[id] ?? {}), events: [] };
  // bỏ hình cũ (mesh, decal rune, hạt rim/inward, scorch/mép vùng do bản này sinh); giữ âm thanh, rung, hitstop, chớp, vignette, camera, hạt viết tay
  t.events = t.events.filter(
    (e) =>
      e.type !== 'mesh' &&
      !(e.type === 'decal' && e.tex === 'rune') &&
      !(e.type === 'decal' && e.tex === 'scorch' && e.alpha === 0.78) &&
      !(e.type === 'decal' && e.tex === 'crack' && (e.alpha === 0.31 || e.alpha === 0.13)) &&
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'),
  );
  // Decal cũ giữ từ timeline gốc phủ cả vùng (nứt r ≥ 8 alpha ~1, cháy r ≥ 6): làm nhạt/thu nhỏ để phủ ≤ 0,2 (đã gặp ở Đoạn Thiên Đao); mép vùng thật có decal mép mờ của bản này
  for (const e of t.events) {
    if (e.type !== 'decal') continue;
    if (e.tex === 'crack' && e.r >= 8 && e.alpha > 0.5) e.alpha = 0.3;
    if (e.tex === 'scorch' && e.r >= 6 && e.alpha > 0.65) {
      e.r = 4.5;
      e.alpha = 0.6;
    }
  }
  const evs = SPEC[id]().flat();
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  if (t.variants) {
    const v = VARIANTS[id]?.() ?? {};
    for (const k of Object.keys(t.variants)) {
      t.variants[k] = [...t.variants[k].filter((e) => e.type !== 'mesh' && !(e.type === 'decal' && e.tex === 'rune')), ...(v[k] ?? [])];
    }
  }
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, evs.length, 'sự kiện');
}
