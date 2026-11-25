#!/usr/bin/env node
// Họa Pháp Lô 2 — đợt Đao tu: dựng timeline 10 chiêu theo concept Codex (than thép + BẠC THÉP chủ đạo, đồng chỉ điểm nhỏ; lõi than tối + viền bạc + vệt mực tối dưới nét chém để tách nền đá sáng) bằng sprite vẽ tay (ô `dao_*`, kiểu tô `dao` = `fxA.x` 9).
// Mỗi chiêu một hình riêng và ba nhịp báo trước / trúng (+30 ms `dao_flash`) / dư ba. Chạy lại an toàn (bỏ mesh, decal rune, scorch/mép vùng do bản này sinh). Dùng: node tools/vfx-forge/dao-tu.mjs [id...]
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
  skl_pha_phong_tien: 1,
  skl_bao_nhan: 1,
  skl_tram_son_dao: 0.9,
  skl_hoanh_dao: 1,
  skl_tam_dao: 1,
  skl_doan_luu: 1,
  skl_liet_dia_tram: 1,
  skl_thuan_dao_tram: 1,
  skl_huyet_chien_the: 1,
  skl_doan_thien_dao: 0.85,
};
/** Hệ số alpha thân theo chiêu (không áp cho chớp `dao_flash`). */
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
    ...(name === 'dao_flash' || rest.alpha === undefined ? {} : { alpha: r2(rest.alpha * A) }),
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
  sprite('dao_flash', { t, dur: 0.18, at, off, size, sizeTo: size * 1.25, alpha: 0.9, erodeFrom: 0.3, ...o });
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
  sprite('dao_dust', {
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
  sprite('dao_cleft', { t, dur: 0.6, at, off, size, sizeTo: size * 1.15, alpha: 0.8, erodeFrom: 0.15, ...o });

/** Vệt tối (mực than) dưới nét chém: tách nét bạc khỏi nền đá sáng ban ngày (sprite `dao_shadow`, chiều cao sát đất). */
const shade = (at, off, size, t = 0, o = {}) => sprite('dao_shadow', { t, dur: 0.9, at, off, size, alpha: 0.7, erodeFrom: 0.4, ...o });

const SPEC = {
  // Phá Phong Tiễn (lướt, mọi mốc ≥ 0): sóng gió xẻ hình chữ V mũi nhọn, vệt đao dày ở giữa, tới nơi bật một nhát chớp sắc.
  skl_pha_phong_tien: () => [
    shade('ahead', [0, 0.3, 3], 5.5),
    strike('dao_vwedge', { size: 5.6, at: 'ahead', off: [0, 1.1, 3.2], dur: 0.5, align: 'aim', erodeFrom: 0.3 }),
    sprite('dao_streaks', { t: 0.02, dur: 0.6, at: 'ahead', off: [0, 1, 2.2], size: 6, alpha: 0.7, align: 'aim', erodeFrom: 0.4 }),
    flash('ahead', [0, 1.1, 6], 1.2, 0.03, { dur: 0.1 }),
    scorch('ahead', [0, 0.02, 2.4], 3, 0, 1.4),
    scorch('ahead', [0, 0.02, 5], 3.2, 0.03, 1.4),
    after('ahead', [0, 1.1, 5], 3, 0.2, 1),
    sparks('ahead', [0, 1.1, 5], 8, 0.04),
  ],
  // Bạo Nhẫn: bảy lưỡi đao cong ngắn xòe ra như quạt từ một điểm, mảnh thép văng.
  skl_bao_nhan: () => [
    ...[gather('dao_fan', { size: 2.6, off: [0, 1.3, 0] })],
    pullIn('target', [0, 1.3, 0], -0.24),
    shade('target', [0, 0.3, 0], 3.8, 0.02),
    strike('dao_fan', { size: 5, off: [0, 1.4, 0], dur: 0.5, erodeFrom: 0.3 }),
    sprite('dao_shards', { t: 0.05, dur: 0.6, off: [0, 1.4, 0], size: 4, alpha: 0.85, erodeFrom: 0.3 }),
    flash('target', [0, 1.3, 0], 1.6, 0.03, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 2.6, 0.03, 1.6),
    after('target', [0, 1.3, 0], 2.6, 0.2, 1.2),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Trảm Sơn Đao (chiêu cuối): lưỡi đao thép khổng lồ hình cung bổ từ trời xuống, chẻ nền thành khe nứt dài thẳng, đá tảng tách đôi bay lên.
  skl_tram_son_dao: () => [
    ...[gather('dao_giant', { size: 4, off: [0, 7, 0] })],
    pullIn('target', [0, 5, 0], -0.3),
    shade('target', [0, 0.3, 0], 8, 0.04, { dur: 1.2 }),
    strike('dao_giant', { size: 8, off: [0, 7, 0], dur: 0.5, erodeFrom: 0.35, move: { to: 'target', offset: [0, 3.4, 0], ease: 'in' } }),
    strike('dao_cleft', { size: 10, off: [0, 0.4, 0], t: 0.06, dur: 1.3, erodeFrom: 0.45 }),
    sprite('dao_shards', { t: 0.08, dur: 0.8, off: [0, 1.6, 0], size: 6, alpha: 0.85, erodeFrom: 0.3 }),
    flash('target', [0, 1.4, 0], 3, 0.04, { dur: 0.16 }),
    scorch('target', [0, 0.02, 0], 4.2, 0.04, 2.6),
    scorch('target', [0, 0.02, 0], 3.2, 0.06, 2.6),
    after('target', [0, 1.6, 0], 4, 0.24, 1.6),
    sparks('target', [0, 1.4, 0], 14, 0),
  ],
  // Hoành Đao: vệt đao bản rộng như lưỡi liềm thép, lưng có răng cưa, quét ngang 12 m để lại luồng gió thép.
  skl_hoanh_dao: () => [
    ...[gather('dao_scythe', { size: 4, off: [0, 1, 2], rest: { at: 'ahead', align: 'aim' } })],
    pullIn('self', [0, 1.1, 0.6], -0.24),
    shade('ahead', [0, 0.2, 5.5], 9, 0.02),
    strike('dao_scythe', { size: 10, at: 'ahead', off: [0, 1, 5.5], dur: 0.5, align: 'aim', erodeFrom: 0.3 }),
    sprite('dao_streaks', { t: 0.04, dur: 0.6, at: 'ahead', off: [0, 1, 6], size: 8, alpha: 0.6, align: 'aim', erodeFrom: 0.4 }),
    flash('ahead', [0, 1.1, 10], 1.2, 0.03, { dur: 0.1 }),
    scorch('ahead', [0, 0.02, 3], 3, 0.02, 1.6),
    scorch('ahead', [0, 0.02, 7], 3.2, 0.04, 1.6),
    after('ahead', [0, 1.1, 6], 3.2, 0.2, 1.1),
    sparks('ahead', [0, 1.1, 6], 10, 0.02),
  ],
  // Tâm Đao: đại đao cắm đứng phía trước, sau lưng đao là bức tường ánh thép dựng đứng, tua chuôi bay.
  skl_tam_dao: () => [
    ...[gather('dao_planted', { size: 2.4, off: [0, 1.4, 0.8], rest: { at: 'self' } })],
    pullIn('self', [0, 1.2, 0.8], -0.24),
    shade('self', [0, 0.25, 0.8], 3.4, 0),
    strike('dao_planted', { size: 4.2, at: 'self', off: [0, 1.8, 0.9], dur: 1.6, erodeFrom: 0.55 }),
    flash('self', [0, 1.4, 0.8], 1.6, 0.03, { dur: 0.12 }),
    scorch('self', [0, -1.05, 0.8], 2.6, -0.05, 2.4),
    after('self', [0, 1.2, 0.8], 2.6, 0.25, 1),
  ],
  // Đoạn Lưu: chém đứt dòng chảy — vết chém thẳng đứng mảnh, hai dải lụa khí thép bị tách đôi chảy lệch về hai phía.
  skl_doan_luu: () => [
    ...[gather('dao_ribbons', { size: 2.6, off: [0, 1.5, 0] })],
    pullIn('target', [0, 1.4, 0], -0.24),
    shade('target', [0, 0.3, 0], 3.6, 0.02),
    strike('dao_ribbons', { size: 4.8, off: [0, 1.6, 0], dur: 0.6, erodeFrom: 0.35 }),
    sprite('dao_shards', { t: 0.06, dur: 0.6, off: [0, 1.3, 0], size: 2.8, alpha: 0.8, erodeFrom: 0.3 }),
    flash('target', [0, 1.5, 0], 1.4, 0.03, { dur: 0.1 }),
    scorch('target', [0, 0.02, 0], 2.6, 0.03, 1.6),
    after('target', [0, 1.3, 0], 2.4, 0.2, 1.2),
  ],
  // Liệt Địa Trảm: hai khe nứt thép bắt chéo chữ X rạch nền, đá tảng văng lên bốn góc.
  skl_liet_dia_tram: () => [
    ...[gather('dao_xcrack', { size: 3, off: [0, 0.6, 0] })],
    pullIn('target', [0, 0.8, 0], -0.24),
    zoneEdge('target', 7, 0.05),
    shade('target', [0, 0.25, 0], 6, 0.02, { dur: 1.2 }),
    strike('dao_xcrack', { size: 7.2, off: [0, 0.5, 0], t: 0.04, dur: 1.2, erodeFrom: 0.45 }),
    sprite('dao_shards', { t: 0.06, dur: 0.8, off: [0, 1.5, 0], size: 5, alpha: 0.85, erodeFrom: 0.3 }),
    flash('target', [0, 1.2, 0], 1.8, 0.04, { dur: 0.12 }),
    scorch('target', [0, 0.02, 0], 3.4, 0.04, 2),
    after('target', [0, 1.3, 0], 3.2, 0.22, 1.2),
    sparks('target', [0, 1.2, 0], 10, 0.02),
  ],
  // Thuấn Đao Trảm: vạch cắt ngang mảnh sáng chớp trước mặt địch; ở chỗ đứng cũ còn bóng đao mờ cùng vệt tốc độ ngang.
  skl_thuan_dao_tram: () => [
    sprite('dao_cutline', { t: -0.1, dur: 0.4, at: 'self', off: [0, 1.2, 0], size: 3, alpha: 0.5, erodeFrom: 0.3 }),
    pullIn('target', [0, 1.4, 0], -0.2),
    shade('target', [0, 0.3, 0], 3.4, 0.02),
    strike('dao_cutline', { size: 4.6, off: [0, 1.4, 0], t: 0, dur: 0.6, erodeFrom: 0.35 }),
    sprite('dao_streaks', { t: 0.02, dur: 0.5, off: [0, 1.2, 0], size: 4.5, alpha: 0.7, erodeFrom: 0.4 }),
    flash('target', [0, 1.4, 0], 1.4, 0.03, { dur: 0.1 }),
    scorch('target', [0, 0.02, 0], 2.4, 0.03, 1.6),
    after('target', [0, 1.3, 0], 2.4, 0.2, 1.2),
    sparks('target', [0, 1.3, 0], 8, 0.02),
  ],
  // Huyết Chiến Thế: hai đại đao bắt chéo chữ X lơ lửng sau lưng, cờ chiến rách tơi tung bay (than xám, KHÔNG đỏ).
  skl_huyet_chien_the: () => [
    ...[gather('dao_crossed', { size: 2.6, off: [0, 2, -0.8], rest: { at: 'self' } })],
    pullIn('self', [0, 1.4, 0], -0.24),
    shade('self', [0, 0.25, -0.4], 3.6, 0),
    strike('dao_crossed', { size: 4.6, at: 'self', off: [0, 2.3, -0.9], dur: 1.7, erodeFrom: 0.55 }),
    sprite('dao_dust', { t: 0.05, dur: 1, at: 'self', off: [0, 0.8, 0], size: 3.4, alpha: 0.55, erodeFrom: 0.3 }),
    flash('self', [0, 1.4, 0], 1.6, 0.03, { dur: 0.12 }),
    scorch('self', [0, -1.05, 0], 2.8, -0.1, 2.4),
    after('self', [0, 1.3, 0], 2.6, 0.25, 1.2),
  ],
  // Đoạn Thiên Đao: vệt đao thép khổng lồ rạch ngang bầu trời mở khe tối trong mây, cột ánh đao rơi thẳng xuống, sóng gió thép tỏa ra mặt đất.
  skl_doan_thien_dao: () => [
    ...[gather('dao_skyslash', { size: 4, off: [0, 6, 0] })],
    pullIn('target', [0, 4.5, 0], -0.3),
    zoneEdge('target', 12, 0.06),
    shade('target', [0, 0.3, 0], 7, 0.04, { dur: 1.2 }),
    strike('dao_skyslash', { size: 8.4, off: [0, 5.4, 0], dur: 0.8, erodeFrom: 0.4 }),
    strike('dao_cleft', { size: 9, off: [0, 0.4, 0], t: 0.08, dur: 1.1, erodeFrom: 0.45 }),
    sprite('dao_dust', { t: 0.1, dur: 1, off: [0, 0.9, 0], size: 5, alpha: 0.5, erodeFrom: 0.3 }),
    flash('target', [0, 1.4, 0], 2.4, 0.05, { dur: 0.14 }),
    scorch('target', [0, 0.02, 0], 3.8, 0.04, 2.6),
    after('target', [0, 1.6, 0], 3.6, 0.24, 1.4),
    sparks('target', [0, 1.4, 0], 12, 0),
  ],
};

const VARIANTS = {};

const HEAD = {
  skl_pha_phong_tien: { trigger: 'fx', fxKind: 'dash', method: 'liet_nhan_dao_kinh' },
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
      !(e.type === 'decal' && e.tex === 'crack' && e.alpha === 0.31) &&
      !(e.type === 'particles' && e.tier === 1 && e.tone === 'rim' && e.kind === 'spark'),
  );
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
