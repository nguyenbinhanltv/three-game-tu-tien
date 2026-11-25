#!/usr/bin/env node
// Họa Pháp Lô 2: ƯỚC LƯỢNG phủ màn hình tất định của THÂN vùng nổ quái/boss (`mon_boom_*`), KHÔNG tính vạch báo đỏ (`mon_warn*`). Mở rộng `cover.mjs` cho quái:
//  - hiểu hệ số `mul` của vùng (tròn: r/4; quạt/dải: clamp(r/8, 0,5..4), xem `game/fx/monFx.ts`): `FxRunner` nhân `scale` của mesh với `mul` (trừ fit=area);
//  - sprite phẳng/dựng đứng: cạnh thật = 2 × scale × mul (ô rộng 2 đơn vị), phủ thật = phần ô có alpha > 16% (từ atlas), nhân alpha và phần còn lại (erode);
//  - decal nền của vùng nổ: phủ = diện tích vùng × alpha (vùng tròn r, quạt nửa góc w, dải r×w);
//  - ánh xạ tiền tố → nhóm atlas theo `PREFIX_GROUP`/`SPRITE_GROUPS` ở `render/vfx/art.ts` (thứ tự ô = thứ tự tên cùng NHÓM trong `FX_SPRITES`).
// Khung camera chéo (cách 20 m, FOV dọc 32°, 16:9) rộng 20,4 × 11,5 m. Số liệu: `thân` = sprite + decal nền; `sprite` = chỉ sprite. Không trừ phần chồng nhau (cận trên có trọng số).
// Dùng: node tools/vfx-forge/cover-mon.mjs [--fill] [<monId>__<chiêu> ...]   (mặc định 33 chiêu A6; kèm mốc A4 elite_cu_nham_vien__caster, elite_huyet_nha_lang__caster)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const art = fs.readFileSync('apps/client/src/render/vfx/art.ts', 'utf8');
const groups = {};
for (const m of art.matchAll(/^\s{2}(\w+): \{ file: '([^']+)', cols: (\d+), rows: (\d+) \}/gm))
  groups[m[1]] = { file: m[2], cols: Number(m[3]) };
const prefixGroup = {};
{
  const blk = art.match(/const PREFIX_GROUP[^{]*\{([\s\S]*?)\n\};/)[1];
  for (const m of blk.matchAll(/^\s+(\w+): '(\w+)'/gm)) prefixGroup[m[1]] = m[2];
}
const NAMES = [
  ...fs
    .readFileSync('packages/shared/src/fxtimeline.ts', 'utf8')
    .match(/export const FX_SPRITES = \[([\s\S]*?)\] as const/)[1]
    .matchAll(/'([a-z0-9_]+)'/g),
].map((m) => m[1]);
const FILL = {};
{
  const seen = {};
  const cache = {};
  for (const n of NAMES) {
    const pre = n.split('_')[0];
    const g = prefixGroup[pre] ?? pre;
    const i = (seen[g] = (seen[g] ?? -1) + 1);
    const grp = groups[g];
    const atlas = grp && `apps/client/public/${grp.file}`;
    if (!grp || !fs.existsSync(atlas)) continue;
    cache[g] ??= await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = cache[g];
    const cell = info.width / grp.cols;
    const cx = (i % grp.cols) * cell;
    const cy = Math.floor(i / grp.cols) * cell;
    let c = 0;
    let tot = 0;
    for (let y = 0; y < cell; y += 2)
      for (let x = 0; x < cell; x += 2) {
        tot++;
        if (data[((cy + y) * info.width + cx + x) * 4 + 3] > 40) c++;
      }
    FILL[n] = c / tot;
  }
}
const missing = NAMES.filter((n) => FILL[n] === undefined);
if (process.argv.includes('--fill')) {
  // Bảng tỉ lệ phủ thật của sprite A6 cho bộ sinh `tools/vfx/gen-fx-a6.py` (khớp ngân sách phủ): `node tools/vfx-forge/cover-mon.mjs --fill > tools/vfx/a6-fill.json`
  const A6P = /^(guong|mac|dong|phu|tuq|kieu|sa|may)_/;
  const o = {};
  for (const n of NAMES.filter((x) => A6P.test(x))) o[n] = Number((FILL[n] ?? 1).toFixed(3));
  console.log(JSON.stringify(o, null, 1));
  process.exit(0);
}

const H = 2 * 20 * Math.tan((16 * Math.PI) / 180);
const AREA = H * H * (16 / 9);
const num = (s) => (Array.isArray(s) ? Math.max(s[0], s[2] ?? s[0]) : (s ?? 1));
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const CARDS = 'packages/content/data/vfx/cards/mon/';
const A6 = [
  'boss_hu_anh_chu',
  'boss_dinh_linh',
  'boss_phu_chu',
  'boss_tu_quang_duc_chu',
  'boss_kieu_thu',
  'boss_ve_kieu',
  'boss_thach_tuong',
  'boss_dao_linh',
  'boss_lo_linh',
  'elite_hu_anh_nhan',
  'elite_anh_hac_vuong',
  'elite_lo_thach_tuong',
  'elite_sa_tuong',
  'elite_may_lang_vuong',
];
const BASE = ['elite_cu_nham_vien__caster', 'elite_huyet_nha_lang__caster'];
const args = process.argv.slice(2);
const keys = args.length
  ? args
  : [
      ...fs
        .readdirSync(CARDS)
        .filter((f) => A6.some((m) => f.startsWith(`${m}__`)))
        .map((f) => f.replace(/\.json$/, ''))
        .sort(),
      ...BASE,
    ];

const rows = [];
for (const key of keys) {
  const card = JSON.parse(fs.readFileSync(`${CARDS}${key}.json`, 'utf8'));
  const z = card.zone;
  const shape = z.shape === 'circle' ? 'circle' : z.shape === 'cone' ? 'cone' : 'line';
  const tlId = `mon_boom_${shape}__${key}`;
  const file = `packages/content/data/fx/${tlId}.json`;
  if (!fs.existsSync(file)) {
    rows.push({ key, err: 'không có timeline' });
    continue;
  }
  const tl = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mul = shape === 'circle' ? z.r / 4 : clamp(z.r / 8, 0.5, 4);
  const zoneArea = shape === 'circle' ? Math.PI * z.r * z.r : shape === 'cone' ? ((2 * z.w) / 360) * Math.PI * z.r * z.r : z.r * (z.w ?? 3);
  const sprites = tl.events.filter((e) => e.type === 'mesh' && e.shape === 'sprite');
  const decals = tl.events.filter((e) => e.type === 'decal');
  const sprAt = (t) =>
    sprites.reduce((a, e) => {
      const k = (t - e.t) / e.dur;
      if (k < 0 || k > 1) return a;
      const s = num(e.scale) + (num(e.scaleTo ?? e.scale) - num(e.scale)) * easeOut(k);
      const rem = Math.max(0, 1 - Math.max(0, (k - (e.erodeFrom ?? 0.5)) / (1 - (e.erodeFrom ?? 0.5))));
      const edge = 2 * s * (e.fit === 'area' ? 1 : mul);
      return a + (edge * edge * (FILL[e.sprite] ?? 1) * (e.alpha ?? 1) * rem) / AREA;
    }, 0);
  const decAt = (t) =>
    decals.reduce((a, e) => {
      const live = t >= (e.t ?? 0) && t <= (e.t ?? 0) + (e.dur ?? 1);
      return live ? a + (zoneArea * (e.alpha ?? 1)) / AREA : a;
    }, 0);
  let peakS = 0;
  let peakT = 0;
  for (let t = 0; t <= 0.4; t += 0.01) {
    peakS = Math.max(peakS, sprAt(t));
    peakT = Math.max(peakT, sprAt(t) + decAt(t));
  }
  rows.push({
    key,
    elite: key.startsWith('elite_'),
    zoneFrac: zoneArea / AREA,
    spr30: sprAt(0.03),
    tot30: sprAt(0.03) + decAt(0.03),
    peakS,
    peakT,
  });
}
const f = (x) => x.toFixed(2);
console.log(
  `khung ${H.toFixed(1)}×${((H * 16) / 9).toFixed(1)} m = ${AREA.toFixed(0)} m²; sprite thiếu atlas: ${missing.length ? missing.join(',') : 'không'}`,
);
console.log('chiêu'.padEnd(46), 'vùng', 'sprite@30', 'thân@30', 'sprite đỉnh', 'thân đỉnh', 'trần', 'đạt?');
for (const r of rows) {
  if (r.err) {
    console.log(r.key.padEnd(46), r.err);
    continue;
  }
  const cap = r.elite ? 0.2 : 0.35;
  console.log(
    r.key.padEnd(46),
    f(r.zoneFrac).padStart(4),
    f(r.spr30).padStart(9),
    f(r.tot30).padStart(8),
    f(r.peakS).padStart(11),
    f(r.peakT).padStart(9),
    String(cap).padStart(4),
    r.peakT <= cap ? 'đạt' : 'VƯỢT',
  );
}
