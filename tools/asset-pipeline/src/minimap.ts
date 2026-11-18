// Dựng nền bản đồ cổ cho minimap/bản đồ lớn (M-3): giấy ngà, nét mực đường đồng mức, hồ nước, ranh vùng nét đứt,
// đường mòn chấm. Vẽ từ địa hình dùng chung (`heightAt`) và `zones` của level — KHÔNG phải ảnh chụp địa hình thô.
// Chạy: pnpm minimap:build [--level <id>]   → apps/client/public/map/<id>.webp + <id>.json (toạ độ phủ, px/m). Mặc định van_lam.
// Level khác Vân Lam: phủ vùng chơi ± 100 m quanh tâm vùng chơi của `terrainOf(level)` (hoặc cả thế giới nếu không có ranh), đường mòn tự nối các vùng theo cấp.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { autoTrails, fbm, hash01, inPoly, SECT, PORTAL_POS, mulberry32, terrainOf, TRAILS } from '@dtl/shared';
import { ensureLevel } from '@dtl/content/fixtures';
import { ROOT } from './config.js';

export const MAP_HALF = 1200; // phủ SECT ± 1200 m (vùng chơi ±1100 m + lề)
export const MAP_PX = 2048;
const SEED = 4177;

type RGB = [number, number, number];
const PAPER: RGB = [236, 223, 194];
const INK: RGB = [66, 48, 34];
const WATER: RGB = [150, 178, 184];
const WATER_INK: RGB = [74, 104, 118];
const TRAIL: RGB = [128, 78, 44];

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface MinimapMeta {
  x0: number;
  z0: number;
  size: number;
  px: number;
}

/** Vùng phủ của level: vuông quanh tâm vùng chơi (± nửa cạnh + 100 m), hoặc cả thế giới nếu không có ranh. Vân Lam: SECT ± MAP_HALF. */
export function minimapBounds(levelId: string): { x0: number; z0: number; size: number } {
  const tr = terrainOf(levelId);
  const play = tr.def.play;
  const cy = tr.def.canyon;
  if (cy) {
    // Phó bản hẻm núi: chỉ phủ hẻm + 70 m quanh tâm.
    const half = Math.max(cy.halfW, cy.halfL) + 70;
    return { x0: cy.cx - half, z0: cy.cz - half, size: half * 2 };
  }
  if (!play) return { x0: 0, z0: 0, size: tr.size };
  const half = play.half + 100;
  return { x0: play.cx - half, z0: play.cz - half, size: half * 2 };
}

export function buildMinimapPixels(levelId = 'van_lam'): { data: Uint8ClampedArray; meta: MinimapMeta } {
  const lv = ensureLevel(levelId);
  if (!lv) throw new Error(`minimap: không có level ${levelId}`);
  const tr = terrainOf(lv);
  const { heightAt, inWater: inLakeWater, playDist, playWall: PLAY_WALL } = tr;
  const WATER_Y = tr.def.water?.y ?? -Infinity;
  const N = MAP_PX;
  const { x0, z0, size } = minimapBounds(levelId);
  const step = size / N;
  const H = new Float32Array((N + 2) * (N + 2));
  const hAt = (i: number, j: number) => H[(j + 1) * (N + 2) + (i + 1)];
  for (let j = -1; j <= N; j++)
    for (let i = -1; i <= N; i++) H[(j + 1) * (N + 2) + (i + 1)] = heightAt(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);

  const out = new Float32Array(N * N * 3);
  const water = new Uint8Array(N * N);
  const put = (i: number, j: number, c: RGB, a: number) => {
    if (i < 0 || j < 0 || i >= N || j >= N || a <= 0) return;
    const o = (j * N + i) * 3;
    out[o] += (c[0] - out[o]) * a;
    out[o + 1] += (c[1] - out[o + 1]) * a;
    out[o + 2] += (c[2] - out[o + 2]) * a;
  };

  // 1) giấy + bóng nổi khối nhẹ + chấm nâu theo độ cao
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * step;
      const z = z0 + (j + 0.5) * step;
      const h = hAt(i, j);
      const fiber = fbm(x * 0.012, z * 0.012, 3, SEED) * 0.5 + hash01(i, j, SEED + 1) * 0.5;
      let k = 0.955 + fiber * 0.05 + (hash01(i, j, SEED + 2) - 0.5) * 0.03;
      const sx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * step);
      const sz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * step);
      // ánh sáng từ tây bắc (x−, z−): dốc hướng đông nam sáng, tây bắc tối
      const shade = Math.max(-0.5, Math.min(0.5, (sx + sz) * 0.45));
      k *= 1 - 0.2 * Math.max(0, shade) - 0.06 * Math.max(0, -shade) + 0.04 * Math.max(0, -shade);
      const hi = Math.max(0, Math.min(1, (h - 60) / 260));
      const o = (j * N + i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = PAPER[c] * k * (1 - 0.1 * hi) - hi * (c === 2 ? 8 : 4);
      const w = h < WATER_Y && inLakeWater(x, z);
      water[j * N + i] = w ? 1 : 0;
    }
  }

  // 2) vùng: màu lót mờ
  const zones = lv.zones ?? [];
  for (const zn of zones) {
    const c = hex(zn.color);
    let ax = Infinity,
      bx = -Infinity,
      az = Infinity,
      bz = -Infinity;
    for (const [px, pz] of zn.poly) {
      ax = Math.min(ax, px);
      bx = Math.max(bx, px);
      az = Math.min(az, pz);
      bz = Math.max(bz, pz);
    }
    const i0 = Math.max(0, Math.floor((ax - x0) / step)),
      i1 = Math.min(N - 1, Math.ceil((bx - x0) / step));
    const j0 = Math.max(0, Math.floor((az - z0) / step)),
      j1 = Math.min(N - 1, Math.ceil((bz - z0) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if (inPoly(zn.poly, x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) put(i, j, c, 0.2);
  }

  // 3) hồ: nước lót + gợn sóng + bờ mực
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!water[j * N + i]) continue;
      const rip =
        (j + Math.floor(hash01(Math.floor(i / 40), 0, SEED + 3) * 9)) % 9 === 0 && hash01(Math.floor(i / 14), j, SEED + 4) > 0.45
          ? 0.35
          : 0;
      put(i, j, WATER, 0.86);
      put(i, j, WATER_INK, rip);
    }
  }
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const w = water[j * N + i];
      if (w && (!water[j * N + i - 1] || !water[j * N + i + 1] || !water[(j - 1) * N + i] || !water[(j + 1) * N + i])) {
        put(i, j, WATER_INK, 0.9);
        put(i + 1, j, WATER_INK, 0.35);
        put(i, j + 1, WATER_INK, 0.35);
      }
    }
  }

  // 4) đường đồng mức mực (mỗi 20 m nhạt, mỗi 100 m đậm), bỏ qua dưới nước
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      if (water[j * N + i]) continue;
      const h = hAt(i, j);
      const hx = hAt(i + 1, j);
      const hz = hAt(i, j + 1);
      const cross = (lvl: number) => Math.floor(h / lvl) !== Math.floor(hx / lvl) || Math.floor(h / lvl) !== Math.floor(hz / lvl);
      if (cross(100)) {
        put(i, j, INK, 0.55);
        put(i + 1, j, INK, 0.2);
        put(i, j + 1, INK, 0.2);
      } else if (cross(20)) put(i, j, INK, 0.24);
    }
  }

  // 5) ngoài vùng chơi: tối dần, gạch chéo "vách + sương"
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const d = playDist(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
      if (d <= PLAY_WALL - 24) continue;
      const t = Math.min(1, (d - (PLAY_WALL - 24)) / 70);
      put(i, j, [92, 74, 56], 0.55 * t);
      if ((i + j) % 7 === 0) put(i, j, INK, 0.45 * t);
    }
  }

  // 6) nét vẽ: đoạn thẳng có kiểu nét
  const pt = (wx: number, wz: number): [number, number] => [(wx - x0) / step, (wz - z0) / step];
  const disc = (cx: number, cz: number, r: number, c: RGB, a: number) => {
    for (let dj = -Math.ceil(r); dj <= Math.ceil(r); dj++)
      for (let di = -Math.ceil(r); di <= Math.ceil(r); di++) {
        const d = Math.hypot(di, dj);
        if (d <= r) put(Math.round(cx) + di, Math.round(cz) + dj, c, a * Math.min(1, r + 0.6 - d));
      }
  };
  const stroke = (pts: [number, number][], r: number, c: RGB, a: number, dash: number, gap: number, wobble = 0) => {
    let run = 0;
    const rnd = mulberry32(SEED + pts.length);
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = pt(...pts[s]);
      const [bx, bz] = pt(...pts[s + 1]);
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 0.6) {
        const on = run % (dash + gap) < dash;
        run += 0.6;
        if (!on) continue;
        const t = d / len;
        const w = wobble ? (rnd() - 0.5) * wobble : 0;
        disc(ax + (bx - ax) * t + w, az + (bz - az) * t + w, r, c, a);
      }
    }
  };
  for (const zn of zones) stroke([...zn.poly, zn.poly[0]], 1.5, INK, 0.8, 14, 8);
  // Đường mòn: bezier bậc hai giữa các điểm, nét chấm nâu.
  const hub: [number, number] | undefined =
    tr.def.play && !zones.some((z) => inPoly(z.poly, tr.def.play!.cx, tr.def.play!.cz)) ? [tr.def.play.cx, tr.def.play.cz] : undefined;
  for (const tr of levelId === 'van_lam' ? TRAILS : autoTrails(zones, hub)) {
    const pts: [number, number][] = [];
    for (let s = 0; s + 1 < tr.length; s++) {
      const [a, b] = [tr[s], tr[s + 1]];
      const mx = (a[0] + b[0]) / 2 + (hash01(a[0], b[1], SEED + 5) - 0.5) * 30;
      const mz = (a[1] + b[1]) / 2 + (hash01(a[1], b[0], SEED + 6) - 0.5) * 30;
      for (let t = 0; t < 1; t += 0.04)
        pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mz + t * t * b[1]]);
    }
    pts.push(tr[tr.length - 1]);
    stroke(pts, 1.3, TRAIL, 0.85, 5, 5, 0.6);
  }
  // Vòng mực quanh tông môn và bệ cổng.
  const ring = (cx: number, cz: number, r: number) => {
    const pts: [number, number][] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    stroke(pts, 1.2, INK, 0.7, 30, 6);
  };
  if (levelId === 'van_lam') {
    ring(SECT.x, SECT.z, 95);
    ring(PORTAL_POS.x, PORTAL_POS.z, 40);
  }

  // 7) viền giấy cũ
  const data = new Uint8ClampedArray(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const e = Math.min(i, j, N - 1 - i, N - 1 - j);
      const v = 1 - 0.18 * Math.max(0, 1 - e / 70);
      const o = (j * N + i) * 3;
      const q = (j * N + i) * 4;
      data[q] = out[o] * v;
      data[q + 1] = out[o + 1] * v;
      data[q + 2] = out[o + 2] * v;
      data[q + 3] = 255;
    }
  }
  return { data, meta: { x0, z0, size, px: N } };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const i = process.argv.indexOf('--level');
  const levelId = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'van_lam';
  const { data, meta } = buildMinimapPixels(levelId);
  const dir = path.join(ROOT, 'apps/client/public/map');
  await mkdir(dir, { recursive: true });
  const webp = await sharp(Buffer.from(data.buffer), { raw: { width: meta.px, height: meta.px, channels: 4 } })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
  await writeFile(path.join(dir, `${levelId}.webp`), webp);
  await writeFile(path.join(dir, `${levelId}.json`), JSON.stringify(meta) + '\n');
  console.log(`minimap: ${(webp.length / 1024).toFixed(0)} KB, ${meta.px}px / ${meta.size} m, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && /minimap\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) await main();
