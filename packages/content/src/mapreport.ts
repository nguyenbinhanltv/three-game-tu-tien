// Báo cáo bố cục bản đồ (M-1): diện tích vùng, mật độ quái, khoảng cách giữa các vùng, độ phủ của bãi quái, quét chỗ kẹt.
// Chạy: pnpm map:report [--level <id>] [--json out.json] [--png out.png] [--seed N]
//   --level: level cần đo (mặc định van_lam); địa hình, collider, vùng chơi lấy theo level (`terrainOf`). Mục khoảng cách tới tông môn/cổng/Kiếm Trủng chỉ có nghĩa với Vân Lam.
//   --png: ảnh nhìn từ trên xuống (bóng đổ địa hình, nước, ranh vùng, bãi quái) để làm ảnh trước/sau.
// Hàm thuần theo dữ liệu level + địa hình dùng chung với client/server, nên số đo khớp cái người chơi gặp.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  inPoly,
  KIEM_TRUNG,
  levelSpawns,
  MoveCtx,
  MoveState,
  polyArea,
  PORTAL_POS,
  SECT,
  SPAWN_POINT,
  stepMove,
  terrainOf,
  WATER_Y,
  type SpawnDef,
  type ZoneDef,
} from '@dtl/shared';
import { LEVELS, MONSTER, NPCS } from './index';
import { PLACES } from './places';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const SEED = Number(opt('--seed') ?? 1);
/** pnpm chạy trong packages/content; đường dẫn tương đối tính từ nơi gõ lệnh. */
const abs = (p: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);

const LEVEL_ID = opt('--level') ?? 'van_lam';
const level = LEVELS[LEVEL_ID];
if (!level) throw new Error(`map:report: không có level ${LEVEL_ID} (có: ${Object.keys(LEVELS).join(', ')})`);
const terrain = terrainOf(level);
const { heightAt, groundAt } = terrain;
const COLLIDERS = terrain.colliders;
const WORLD_SIZE = terrain.size;
const zones: ZoneDef[] = level.zones ?? [];
const camps = level.camps ?? [];
/** Vùng chơi chính của level (M-1), không có ranh thì cả thế giới. */
const PLAY = terrain.playBounds;
const isLand = (x: number, z: number) => groundAt(x, z) > WATER_Y + 0.5 && heightAt(x, z) > WATER_Y + 0.5;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spawnDefs: SpawnDef[] = levelSpawns(level);
const kindOf = (id: string) => (MONSTER.get(id)?.boss ? 'boss' : MONSTER.get(id)?.elite ? 'elite' : 'normal');

// ---- vị trí quái (mẫu tất định theo seed, giống cách server rải: đều trong đĩa, bỏ chỗ nước) ----
interface Mon {
  mon: string;
  kind: string;
  x: number;
  z: number;
}
const R = rng(SEED);
const mons: Mon[] = [];
for (const sp of spawnDefs) {
  for (let i = 0; i < sp.count; i++) {
    let x = sp.x;
    let z = sp.z;
    for (let t = 0; t < 12; t++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * sp.radius;
      const px = sp.x + Math.cos(a) * r;
      const pz = sp.z + Math.sin(a) * r;
      if (heightAt(px, pz) > WATER_Y + 0.5 || kindOf(sp.mon) === 'boss') {
        x = px;
        z = pz;
        break;
      }
    }
    mons.push({ mon: sp.mon, kind: kindOf(sp.mon), x, z });
  }
}
const normal = mons.filter((m) => m.kind === 'normal');

// ---- vùng ----
interface ZoneRow {
  id: string;
  lv: string;
  areaKm2: number;
  normal: number;
  elite: number;
  densityPerKm2: number;
}
const polyOrDiscs: { id: string; lv: string; area: number; has: (x: number, z: number) => boolean }[] = [];
if (zones.length) {
  for (const z of zones) polyOrDiscs.push({ id: z.id, lv: `${z.lvMin}–${z.lvMax}`, area: polyArea(z.poly), has: (x, zz) => inPoly(z.poly, x, zz) });
} else {
  // Bố cục cũ chưa có vùng: mỗi điểm sinh quái thường là một "vùng" hình đĩa.
  for (const [i, sp] of level.spawns.entries()) {
    if (kindOf(sp.mon) !== 'normal') continue;
    polyOrDiscs.push({ id: `spawn${i}_${sp.mon.replace('mon_', '')}`, lv: `${sp.levelMin}–${sp.levelMax}`, area: Math.PI * sp.radius ** 2, has: (x, z) => (x - sp.x) ** 2 + (z - sp.z) ** 2 <= sp.radius ** 2 });
  }
}
const zoneRows: ZoneRow[] = polyOrDiscs.map((z) => {
  const inside = mons.filter((m) => z.has(m.x, m.z));
  const n = inside.filter((m) => m.kind === 'normal').length;
  return { id: z.id, lv: z.lv, areaKm2: z.area / 1e6, normal: n, elite: inside.filter((m) => m.kind === 'elite').length, densityPerKm2: n / (z.area / 1e6) };
});

// ---- khoảng cách giữa các vùng ----
function zoneCenter(z: ZoneDef): [number, number] {
  const n = z.poly.length;
  return [z.poly.reduce((a, p) => a + p[0], 0) / n, z.poly.reduce((a, p) => a + p[1], 0) / n];
}
function polyGap(a: ZoneDef, b: ZoneDef): number {
  let best = Infinity;
  for (const p of a.poly) for (const q of b.poly) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}
const gaps: { a: string; b: string; centers: number; edge: number }[] = [];
const sectToZone: { zone: string; m: number }[] = [];
if (zones.length) {
  for (const z of zones) {
    const c = zoneCenter(z);
    sectToZone.push({ zone: z.id, m: Math.hypot(c[0] - SECT.x, c[1] - SECT.z) });
  }
  for (let i = 0; i < zones.length; i++)
    for (let j = i + 1; j < zones.length; j++) {
      const ca = zoneCenter(zones[i]);
      const cb = zoneCenter(zones[j]);
      gaps.push({ a: zones[i].id, b: zones[j].id, centers: Math.hypot(ca[0] - cb[0], ca[1] - cb[1]), edge: polyGap(zones[i], zones[j]) });
    }
} else {
  for (const [i, sp] of level.spawns.entries()) {
    if (kindOf(sp.mon) === 'normal') sectToZone.push({ zone: `spawn${i}_${sp.mon.replace('mon_', '')}`, m: Math.hypot(sp.x - SECT.x, sp.z - SECT.z) });
  }
  const boss = level.spawns.find((s) => kindOf(s.mon) === 'boss');
  if (boss) sectToZone.push({ zone: 'boss_han_giao', m: Math.hypot(boss.x - SECT.x, boss.z - SECT.z) });
}
const portalM = Math.hypot(PORTAL_POS.x - SECT.x, PORTAL_POS.z - SECT.z);
const ktM = Math.hypot(KIEM_TRUNG.x - PORTAL_POS.x, KIEM_TRUNG.z - PORTAL_POS.z);

// ---- độ phủ: khoảng cách từ điểm đi được tới quái thường gần nhất ----
function coverage(step: number, inArea: (x: number, z: number) => boolean) {
  const cell = 64;
  const gw = Math.ceil(WORLD_SIZE / cell);
  const buckets = new Map<number, Mon[]>();
  for (const m of normal) {
    const k = Math.floor(m.x / cell) + Math.floor(m.z / cell) * gw;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(m);
  }
  const nearest = (x: number, z: number): number => {
    let best = Infinity;
    for (let ring = 0; ring < 12; ring++) {
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          for (const m of buckets.get(cx + dx + (cz + dz) * gw) ?? []) best = Math.min(best, Math.hypot(m.x - x, m.z - z));
        }
      if (best <= ring * cell) break;
    }
    return best;
  };
  const ds: number[] = [];
  for (let z = PLAY.z0; z <= PLAY.z1; z += step)
    for (let x = PLAY.x0; x <= PLAY.x1; x += step) if (isLand(x, z) && inArea(x, z)) ds.push(nearest(x, z));
  ds.sort((a, b) => a - b);
  const pick = (p: number) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))] ?? NaN;
  return { points: ds.length, within35: ds.filter((d) => d <= 35).length / Math.max(1, ds.length), p50: pick(0.5), p95: pick(0.95), max: ds[ds.length - 1] ?? NaN };
}
const hasZones = zones.length > 0;
const covHunt = coverage(12, (x, z) => (hasZones ? zones.some((zn) => inPoly(zn.poly, x, z)) : polyOrDiscs.some((d) => d.has(x, z))));
const covAll = coverage(24, () => true);

// ---- quét chỗ kẹt: đẩy 8 hướng theo luật stepMove ----
const DIRS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const ctx: MoveCtx = { canFly: false, frozen: false, speedMul: 1, terrain };
function escapes(x: number, z: number): boolean {
  const g = groundAt(x, z);
  for (const yaw of DIRS) {
    const s: MoveState = { x, y: g, z, vy: 0, grounded: true, flying: false };
    for (let k = 0; k < 40; k++) stepMove(s, { s: k, mx: 0, mz: 1, yaw, f: 0 }, ctx);
    if (Math.hypot(s.x - x, s.z - z) >= 6) return true;
  }
  return false;
}
function stuckScan(): { checked: number; stuck: [number, number][] } {
  const stuck: [number, number][] = [];
  let checked = 0;
  const near = (x: number, z: number) => COLLIDERS.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 8) ** 2);
  const nearEdge = (x: number, z: number) => x < PLAY.x0 + 12 || x > PLAY.x1 - 12 || z < PLAY.z0 + 12 || z > PLAY.z1 - 12;
  for (let z = PLAY.z0; z <= PLAY.z1; z += 4)
    for (let x = PLAY.x0; x <= PLAY.x1; x += 4) {
      if (!near(x, z) && !nearEdge(x, z)) continue;
      if (!isLand(x, z)) continue;
      checked++;
      if (!escapes(x, z)) stuck.push([x, z]);
    }
  // Điểm quan trọng: tâm bãi, NPC, cổng, điểm hồi sinh, điểm đặt tên.
  const pts: [string, number, number][] = [
    ...camps.map((c): [string, number, number] => ['camp ' + c.id, c.x, c.z]),
    ...NPCS.map((n): [string, number, number] => ['npc ' + n.id, n.x, n.z]),
    ['spawn', SPAWN_POINT.x, SPAWN_POINT.z],
    ['portal', PORTAL_POS.x, PORTAL_POS.z + 9],
    ...PLACES.filter((p) => p.level === 'van_lam').map((p): [string, number, number] => ['place ' + p.id, p.x, p.z]),
  ];
  for (const [name, x, z] of pts) {
    if (name.startsWith('camp') || name.startsWith('place')) {
      // tâm bãi/điểm đặt tên không được nằm trong collider hay nước sâu
      if (COLLIDERS.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.6) ** 2)) stuck.push([x, z]);
    }
    if (!escapes(x, z)) stuck.push([x, z]);
  }
  return { checked, stuck };
}
const stuck = stuckScan();

// ---- in ----
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '> 770');
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const out: string[] = [];
out.push(`# Báo cáo bản đồ van_lam (${hasZones ? 'zones + camps' : 'bố cục cũ: điểm sinh quái dạng đĩa'})`);
const playW = PLAY.x1 - PLAY.x0;
const playH = PLAY.z1 - PLAY.z0;
out.push(`Vùng đo: ${PLAY.x0}..${PLAY.x1} × ${PLAY.z0}..${PLAY.z1} (${(playW / 1000).toFixed(2)} × ${(playH / 1000).toFixed(2)} km = ${((playW * playH) / 1e6).toFixed(2)} km²)`);
out.push('');
out.push('## Quái');
out.push(`Quái thường ${normal.length}, tinh anh ${mons.filter((m) => m.kind === 'elite').length}, boss ${mons.filter((m) => m.kind === 'boss').length}; bãi/điểm sinh ${spawnDefs.length}${camps.length ? ` (camps ${camps.length}, cụm ${f1(camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0) / camps.length)} con/camp)` : ''}`);
const hunt = polyOrDiscs.reduce((a, z) => a + z.area, 0) / 1e6;
out.push(`Diện tích vùng săn (tổng ${hasZones ? 'zones' : 'đĩa spawn, trùng lặp có thể tính đôi'}): ${hunt.toFixed(3)} km² → ${f1(normal.length / hunt)} quái/km²; ${f1((hunt * 1e6) / Math.max(1, normal.length))} m² mỗi quái`);
out.push('');
out.push('| vùng | cấp | km² | quái thường | tinh anh | quái/km² |');
out.push('|---|---|---|---|---|---|');
for (const r of zoneRows) out.push(`| ${r.id} | ${r.lv} | ${r.areaKm2.toFixed(3)} | ${r.normal} | ${r.elite} | ${f1(r.densityPerKm2)} |`);
out.push('');
out.push('## Khoảng cách');
out.push(`Tông môn → cổng bí cảnh: ${f1(portalM)} m; cổng → tâm Kiếm Trủng: ${f1(ktM)} m`);
out.push('Tông môn → tâm vùng/điểm sinh: ' + sectToZone.map((s) => `${s.zone} ${Math.round(s.m)} m`).join(', '));
if (gaps.length) {
  out.push('');
  out.push('| vùng A | vùng B | tâm–tâm (m) | mép–mép (m) |');
  out.push('|---|---|---|---|');
  for (const g of gaps) out.push(`| ${g.a} | ${g.b} | ${Math.round(g.centers)} | ${Math.round(g.edge)} |`);
}
out.push('');
out.push('## Độ phủ: khoảng cách tới quái thường gần nhất (mục tiêu ≤ 35 m)');
out.push(`Trong vùng săn (${covHunt.points} điểm, lưới 12 m): ≤35 m ${pct(covHunt.within35)}, p50 ${f1(covHunt.p50)} m, p95 ${f1(covHunt.p95)} m, max ${f1(covHunt.max)} m`);
out.push(`Cả vùng chơi, chỗ đi được (${covAll.points} điểm, lưới 24 m): ≤35 m ${pct(covAll.within35)}, p50 ${f1(covAll.p50)} m, p95 ${f1(covAll.p95)} m, max ${f1(covAll.max)} m`);
out.push('');
out.push('## Chỗ kẹt (đẩy 8 hướng theo stepMove, 2 s mỗi hướng, cần thoát ≥ 6 m)');
out.push(`Đã quét ${stuck.checked} điểm quanh vật cản/ranh + tâm bãi, NPC, cổng, điểm đặt tên: ${stuck.stuck.length} chỗ kẹt${stuck.stuck.length ? ': ' + stuck.stuck.slice(0, 12).map((p) => `(${p[0]}, ${p[1]})`).join(' ') : ''}`);
console.log(out.join('\n'));

const jsonOut = opt('--json');
if (jsonOut) {
  fs.writeFileSync(abs(jsonOut), JSON.stringify({ play: PLAY, normal: normal.length, zones: zoneRows, gaps, covHunt, covAll, stuck: stuck.stuck, portalM, sectToZone }, null, 1));
}

// ---- ảnh nhìn từ trên xuống ----
const pngOut = opt('--png');
if (pngOut) {
  const SIZE = Number(opt('--size') ?? 1100);
  const bo = opt('--bounds')?.split(',').map(Number);
  const b = bo && bo.length === 4 ? { x0: bo[0], z0: bo[1], x1: bo[2], z1: bo[3] } : PLAY;
  const sx = (b.x1 - b.x0) / SIZE;
  const sz = (b.z1 - b.z0) / SIZE;
  const hs = new Float32Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) hs[j * SIZE + i] = heightAt(b.x0 + (i + 0.5) * sx, b.z0 + (j + 0.5) * sz);
  const px = new Uint8Array(SIZE * SIZE * 3);
  const put = (i: number, j: number, r: number, g: number, bl: number, a = 1) => {
    if (i < 0 || j < 0 || i >= SIZE || j >= SIZE) return;
    const o = (j * SIZE + i) * 3;
    px[o] = px[o] * (1 - a) + r * a;
    px[o + 1] = px[o + 1] * (1 - a) + g * a;
    px[o + 2] = px[o + 2] * (1 - a) + bl * a;
  };
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++) {
      const h = hs[j * SIZE + i];
      const hx = hs[j * SIZE + Math.min(SIZE - 1, i + 1)] - hs[j * SIZE + Math.max(0, i - 1)];
      const hz = hs[Math.min(SIZE - 1, j + 1) * SIZE + i] - hs[Math.max(0, j - 1) * SIZE + i];
      const shade = Math.max(0.35, Math.min(1.35, 1 + (-(hx * 0.7) - hz * 0.7) / (sx * 2) * 0.9));
      let r: number, g: number, bl: number;
      if (h < WATER_Y - 0.5) [r, g, bl] = [70, 120, 150];
      else if (h < WATER_Y + 2) [r, g, bl] = [214, 200, 150];
      else {
        const t = Math.max(0, Math.min(1, (h - 50) / 330));
        const lerp = (a: number, c: number, k: number) => a + (c - a) * k;
        const k1 = Math.min(1, t * 2.2);
        const k2 = Math.max(0, (t - 0.45) / 0.55);
        r = lerp(lerp(112, 150, k1), 236, k2);
        g = lerp(lerp(150, 140, k1), 236, k2);
        bl = lerp(lerp(88, 128, k1), 240, k2);
      }
      put(i, j, Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, bl * shade));
    }
  const toPx = (x: number, z: number): [number, number] => [Math.round((x - b.x0) / sx), Math.round((z - b.z0) / sz)];
  const dot = (x: number, z: number, rad: number, c: [number, number, number], a = 1) => {
    const [ci, cj] = toPx(x, z);
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) if (di * di + dj * dj <= rad * rad) put(ci + di, cj + dj, c[0], c[1], c[2], a);
  };
  const line = (x0: number, z0: number, x1: number, z1: number, c: [number, number, number]) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / sx);
    for (let k = 0; k <= n; k++) {
      const [i, j] = toPx(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n);
      put(i, j, c[0], c[1], c[2], 0.95);
      put(i + 1, j, c[0], c[1], c[2], 0.5);
    }
  };
  for (const z of zones) {
    const col = z.color.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)) as [number, number, number];
    for (let k = 0; k < z.poly.length; k++) {
      const p = z.poly[k];
      const q = z.poly[(k + 1) % z.poly.length];
      line(p[0], p[1], q[0], q[1], col);
    }
  }
  if (!zones.length) for (const sp of level.spawns) if (kindOf(sp.mon) === 'normal') for (let k = 0; k < 90; k++) dot(sp.x + Math.cos((k / 90) * 6.283) * sp.radius, sp.z + Math.sin((k / 90) * 6.283) * sp.radius, 1, [255, 240, 120]);
  for (const m of mons) dot(m.x, m.z, m.kind === 'normal' ? 1 : 3, m.kind === 'normal' ? [250, 250, 250] : m.kind === 'elite' ? [255, 210, 40] : [255, 60, 60], m.kind === 'normal' ? 0.85 : 1);
  dot(SECT.x, SECT.z, 5, [255, 255, 255]);
  dot(PORTAL_POS.x, PORTAL_POS.z, 4, [120, 220, 255]);
  // PNG tối giản (RGB 8 bit, không lọc).
  const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
  for (let j = 0; j < SIZE; j++) {
    raw[j * (SIZE * 3 + 1)] = 0;
    Buffer.from(px.buffer, j * SIZE * 3, SIZE * 3).copy(raw, j * (SIZE * 3 + 1) + 1);
  }
  const crcT = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(abs(pngOut), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`\nẢnh: ${pngOut}`);
}
