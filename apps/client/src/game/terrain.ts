import * as THREE from 'three/webgpu';
import { createWorldMaterial } from '../render/materials/world';
import {
  COLLIDERS,
  fbm,
  featureWeight,
  FOREST,
  hash01,
  heightAt,
  KIEM_TRUNG,
  LAKE,
  PORTAL_PAD,
  SECT,
  TERRAIN_SEED,
  VALLEY,
  WATER_Y,
  WORLD_SIZE,
} from '@dtl/shared';
import { col, G, GeoBuilder, mat } from './geo';
import { withSightFade } from './occlusion';

const TILE = 256;
const NT = WORLD_SIZE / TILE;
const NEAR_R = 3;
const COARSE_CELL = 32;
const COARSE_N = WORLD_SIZE / COARSE_CELL;
const VEG_NEAR_R = 2;
const VEG_FAR_R = 4;

const C_GRASS_VALLEY = col(0x86b45c);
const C_GRASS_FOREST = col(0x4f8f4c);
const C_GRASS_WILD = col(0x6f9d58);
const C_GRASS_DRY = col(0x9aa86a);
const C_ROCK = col(0x7d7a76);
const C_ROCK_DARK = col(0x5f5d5c);
const C_SNOW = col(0xf3f6fa);
const C_SAND = col(0xcdbf96);
const C_STONE = col(0xb9b3a6);
const C_LAKEBED = col(0x5e7f86);
const C_TOMB = col(0x5d5a66);
const _c = new THREE.Color();

/** Màu mặt đất theo vị trí, độ cao và độ dốc. */
function terrainColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  const wSect = featureWeight(SECT, x, z);
  const wValley = featureWeight(VALLEY, x, z);
  const wForest = featureWeight(FOREST, x, z);
  const wLake = featureWeight(LAKE, x, z);
  const wPad = featureWeight(PORTAL_PAD, x, z);
  const n = fbm(x * 0.013, z * 0.013, 2, TERRAIN_SEED + 300);

  out.copy(C_GRASS_WILD);
  if (wValley > 0) out.lerp(C_GRASS_VALLEY, Math.min(1, wValley * 1.4));
  if (wForest > 0) out.lerp(C_GRASS_FOREST, Math.min(1, wForest * 1.4));
  out.lerp(C_GRASS_DRY, Math.max(0, n) * 0.35);
  out.multiplyScalar(0.92 + n * 0.14);

  // Dốc đứng lộ đá.
  const slope = 1 - ny;
  if (slope > 0.12) out.lerp(n > 0 ? C_ROCK : C_ROCK_DARK, Math.min(1, (slope - 0.12) * 4.5));
  // Tuyết trên đỉnh cao.
  if (h > 250) out.lerp(C_SNOW, Math.min(1, (h - 250) / 60) * (slope < 0.45 ? 1 : 0.4));
  // Bờ cát và lòng hồ.
  if (wLake > 0) {
    if (h < WATER_Y + 2.2) out.lerp(C_SAND, Math.min(1, (WATER_Y + 2.2 - h) / 1.6));
    if (h < WATER_Y - 1) out.lerp(C_LAKEBED, Math.min(1, (WATER_Y - 1 - h) / 5));
  }
  // Sân lát đá của tông môn và bệ cổng bí cảnh.
  if (wSect > 0.82) out.lerp(C_STONE, Math.min(1, (wSect - 0.82) * 8));
  if (wPad > 0.9) out.lerp(C_STONE, Math.min(1, (wPad - 0.9) * 10));
  // Đất chết xám tím của Kiếm Trủng.
  const wTomb = featureWeight(KIEM_TRUNG, x, z);
  if (wTomb > 0.15) out.lerp(C_TOMB, Math.min(1, (wTomb - 0.15) * 1.8));
}

function buildTileGeometry(x0: number, z0: number, size: number, res: number, skirt: number): THREE.BufferGeometry {
  const cell = size / res;
  const w = res + 3;
  const hs = new Float32Array(w * w);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) hs[j * w + i] = heightAt(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
  }
  const n1 = res + 1;
  const skirtVerts = skirt > 0 ? n1 * 4 : 0;
  const vcount = n1 * n1 + skirtVerts;
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const colr = new Float32Array(vcount * 3);
  let o = 0;
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) {
      const hi = (j + 1) * w + (i + 1);
      const h = hs[hi];
      let nx = hs[hi - 1] - hs[hi + 1];
      let ny = 2 * cell;
      let nz = hs[hi - w] - hs[hi + w];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      pos[o] = x;
      pos[o + 1] = h;
      pos[o + 2] = z;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
      terrainColor(x, z, h, ny, _c);
      colr[o] = _c.r;
      colr[o + 1] = _c.g;
      colr[o + 2] = _c.b;
      o += 3;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n1 + i;
      const b = a + 1;
      const c = a + n1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (skirt > 0) {
    // Viền rủ xuống che khe hở giữa các ô khác độ phân giải.
    let sv = n1 * n1;
    const edge = (get: (k: number) => number) => {
      const start = sv;
      for (let k = 0; k < n1; k++) {
        const src = get(k) * 3;
        const dst = sv * 3;
        pos[dst] = pos[src];
        pos[dst + 1] = pos[src + 1] - skirt;
        pos[dst + 2] = pos[src + 2];
        nor[dst] = nor[src];
        nor[dst + 1] = nor[src + 1];
        nor[dst + 2] = nor[src + 2];
        colr[dst] = colr[src];
        colr[dst + 1] = colr[src + 1];
        colr[dst + 2] = colr[src + 2];
        sv++;
      }
      for (let k = 0; k < res; k++) {
        const a = get(k);
        const b = get(k + 1);
        const c = start + k;
        const d = start + k + 1;
        idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
      }
    };
    edge((k) => k);
    edge((k) => res * n1 + k);
    edge((k) => k * n1);
    edge((k) => k * n1 + res);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------- cây cối ----------

const C_TRUNK = col(0x6b4a33);
const C_PINE = [col(0x2f6b45), col(0x3a7a4c), col(0x275c3f)];
const C_LEAF = [col(0x5fa04e), col(0x76b356), col(0x4d8f49)];
const C_SAKURA = [col(0xf3b6c9), col(0xf7c8d6), col(0xe99bb5)];
const C_MAPLE = [col(0xd9773a), col(0xe2a03f), col(0xc65a33)];
const C_STONE_ROCK = [col(0x8a8782), col(0x76746f), col(0x9a968f)];

function addPine(b: GeoBuilder, x: number, y: number, z: number, s: number, r: number, far: boolean): void {
  const c = C_PINE[(r * 3) | 0];
  if (far) {
    b.add(G.cone5, mat(x, y + 4.2 * s, z, 0, r * 6, 0, 2.3 * s, 8 * s, 2.3 * s), c);
    return;
  }
  b.add(G.cyl6, mat(x, y + 1.2 * s, z, 0, 0, 0, 0.28 * s, 2.6 * s, 0.28 * s), C_TRUNK);
  b.add(G.cone7, mat(x, y + 3.2 * s, z, 0, r * 6, 0, 2.5 * s, 3.4 * s, 2.5 * s), c);
  b.add(G.cone7, mat(x, y + 5.2 * s, z, 0, r * 9, 0, 1.9 * s, 3.0 * s, 1.9 * s), c);
  b.add(G.cone7, mat(x, y + 7.0 * s, z, 0, r * 4, 0, 1.2 * s, 2.6 * s, 1.2 * s), c);
}

function addBroadleaf(b: GeoBuilder, x: number, y: number, z: number, s: number, r: number, palette: THREE.Color[], far: boolean): void {
  const c = palette[(r * 3) | 0];
  if (far) {
    b.add(G.ico0, mat(x, y + 4.4 * s, z, 0, r * 6, 0, 2.6 * s, 2.4 * s, 2.6 * s), c);
    return;
  }
  b.add(G.cyl6, mat(x, y + 1.5 * s, z, 0, 0, r * 0.3 - 0.15, 0.3 * s, 3.2 * s, 0.3 * s), C_TRUNK);
  b.add(G.ico1, mat(x, y + 4.5 * s, z, r, r * 6, 0, 2.6 * s, 2.2 * s, 2.6 * s), c, 0.1);
  b.add(G.ico0, mat(x + 1.4 * s, y + 3.6 * s, z + 0.6 * s, 0, r * 3, r, 1.5 * s, 1.3 * s, 1.5 * s), c, 0.1);
  b.add(G.ico0, mat(x - 1.2 * s, y + 3.9 * s, z - 0.8 * s, r, 0, 0, 1.4 * s, 1.2 * s, 1.4 * s), c, 0.1);
}

function addRock(b: GeoBuilder, x: number, y: number, z: number, s: number, r: number): void {
  b.add(G.ico0, mat(x, y + 0.3 * s, z, r * 2, r * 6, r, 1.3 * s, 0.9 * s, 1.1 * s), C_STONE_ROCK[(r * 3) | 0]);
}

function nearCollider(x: number, z: number, pad: number): boolean {
  for (const c of COLLIDERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    const r = c.r + pad;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function buildVegetation(tx: number, tz: number, far: boolean): THREE.BufferGeometry | null {
  const b = new GeoBuilder();
  const cellSize = 16;
  const cells = TILE / cellSize;
  const x0 = tx * TILE;
  const z0 = tz * TILE;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gx = tx * cells + i;
      const gz = tz * cells + j;
      const r1 = hash01(gx, gz, 11);
      const r2 = hash01(gx, gz, 23);
      const r3 = hash01(gx, gz, 37);
      const r4 = hash01(gx, gz, 53);
      const x = x0 + (i + 0.15 + r1 * 0.7) * cellSize;
      const z = z0 + (j + 0.15 + r2 * 0.7) * cellSize;
      const h = heightAt(x, z);
      if (h < WATER_Y + 1.2 || h > 285) continue;
      const wSect = featureWeight(SECT, x, z);
      const wForest = featureWeight(FOREST, x, z);
      const wValley = featureWeight(VALLEY, x, z);
      const wLake = featureWeight(LAKE, x, z);
      const wPad = featureWeight(PORTAL_PAD, x, z);
      if (wPad > 0.85 || featureWeight(KIEM_TRUNG, x, z) > 0.25) continue;
      // Độ dốc: bỏ cây trên vách đá.
      const slope = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h);
      const s = 0.8 + r4 * 0.7;

      if (wSect > 0.8) {
        // Trong tông môn: hàng anh đào quanh rìa sân, không mọc giữa sân.
        const d = Math.hypot(x - SECT.x, z - SECT.z);
        if (d > 62 && d < 108 && r3 < 0.55 && !nearCollider(x, z, 6) && Math.abs(x - SECT.x) > 9) {
          addBroadleaf(b, x, h, z, s * 0.95, r4, C_SAKURA, far);
        }
        continue;
      }
      if (slope > 5.5) {
        if (r3 < 0.12 && !far) addRock(b, x, h, z, 1 + r4 * 2.2, r1);
        continue;
      }
      let density = 0.3;
      if (wForest > 0.3) density = 0.8;
      else if (wValley > 0.4) density = 0.14;
      else if (wLake > 0.3) density = 0.2;
      if (h > 200) density *= 0.5;
      if (r3 > density) {
        if (r3 > 0.94 && !far) addRock(b, x, h, z, 0.6 + r4 * 1.4, r1);
        continue;
      }
      if (h > 150 || (wForest < 0.3 && r4 > 0.55)) addPine(b, x, h, z, s, r4, far);
      else if (wForest > 0.3) addBroadleaf(b, x, h, z, s * 1.15, r4, r1 < 0.16 ? C_MAPLE : C_LEAF, far);
      else addBroadleaf(b, x, h, z, s, r4, r1 < 0.1 ? C_SAKURA : C_LEAF, far);
    }
  }
  return b.count > 0 ? b.build() : null;
}

// ---------- quản lý ô ----------

interface TileRec {
  key: number;
  tx: number;
  tz: number;
  res: number;
  mesh: THREE.Mesh | null;
  veg: THREE.Mesh | null;
  vegFar: boolean | null;
}

export class Terrain {
  group = new THREE.Group();
  material = createWorldMaterial({ vertexColors: true });
  /** Cây, bụi: làm mờ khi đứng chắn giữa camera và nhân vật. */
  vegMaterial = withSightFade(createWorldMaterial({ vertexColors: true }));
  private tiles = new Map<number, TileRec>();
  private coarse: THREE.Mesh;
  private coarseIndex: THREE.BufferAttribute;
  private coarseDirty = true;
  private ctx = -999;
  private ctz = -999;
  shadows = false;
  /** Số ô đã dựng xong (để màn hình loading biết khi nào vào game). */
  ready = false;

  constructor() {
    const g = buildTileGeometry(0, 0, WORLD_SIZE, COARSE_N, 0);
    this.coarseIndex = new THREE.BufferAttribute(new Uint16Array(COARSE_N * COARSE_N * 6), 1);
    this.coarseIndex.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.coarseIndex);
    this.coarse = new THREE.Mesh(g, this.material);
    this.coarse.frustumCulled = false;
    this.coarse.receiveShadow = false;
    this.group.add(this.coarse);
  }

  private desiredRes(d: number): number {
    return d <= 1 ? 64 : 32;
  }

  /** Gọi mỗi khung hình. Dựng tối đa `budget` ô mỗi lần để không giật. */
  update(px: number, pz: number, budget = 1): void {
    const ctx = Math.floor(px / TILE);
    const ctz = Math.floor(pz / TILE);
    if (ctx !== this.ctx || ctz !== this.ctz) {
      this.ctx = ctx;
      this.ctz = ctz;
      for (const [key, t] of this.tiles) {
        const d = Math.max(Math.abs(t.tx - ctx), Math.abs(t.tz - ctz));
        if (d > NEAR_R + 1) {
          this.disposeTile(t);
          this.tiles.delete(key);
          this.coarseDirty = true;
        }
      }
    }
    let pending = 0;
    // Duyệt từ gần ra xa để ô dưới chân có trước.
    for (let ring = 0; ring <= Math.max(NEAR_R, VEG_FAR_R) && budget > 0; ring++) {
      for (let dz = -ring; dz <= ring && budget > 0; dz++) {
        for (let dx = -ring; dx <= ring && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const tx = ctx + dx;
          const tz = ctz + dz;
          if (tx < 0 || tz < 0 || tx >= NT || tz >= NT) continue;
          const key = tz * NT + tx;
          let t = this.tiles.get(key);
          if (!t) {
            t = { key, tx, tz, res: 0, mesh: null, veg: null, vegFar: null };
            this.tiles.set(key, t);
          }
          if (ring <= NEAR_R) {
            const res = this.desiredRes(ring);
            if (t.res !== res) {
              const geo = buildTileGeometry(tx * TILE, tz * TILE, TILE, res, (TILE / res) * 1.5 + 5);
              if (t.mesh) {
                this.group.remove(t.mesh);
                t.mesh.geometry.dispose();
              }
              t.mesh = new THREE.Mesh(geo, this.material);
              t.mesh.receiveShadow = this.shadows;
              this.group.add(t.mesh);
              t.res = res;
              this.coarseDirty = true;
              budget--;
              pending++;
              continue;
            }
          }
          const wantFar = ring > VEG_NEAR_R;
          if (ring <= VEG_FAR_R && t.vegFar !== wantFar) {
            const geo = buildVegetation(tx, tz, wantFar);
            if (t.veg) {
              this.group.remove(t.veg);
              t.veg.geometry.dispose();
              t.veg = null;
            }
            if (geo) {
              t.veg = new THREE.Mesh(geo, this.vegMaterial);
              t.veg.castShadow = this.shadows && !wantFar;
              this.group.add(t.veg);
            }
            t.vegFar = wantFar;
            budget--;
            pending++;
          }
        }
      }
    }
    if (pending === 0) this.ready = true;
    if (this.coarseDirty) this.rebuildCoarseIndex();
  }

  /** Khoét lỗ trên lưới thô ở những ô đã có lưới mịn. */
  private rebuildCoarseIndex(): void {
    this.coarseDirty = false;
    const per = TILE / COARSE_CELL;
    const n1 = COARSE_N + 1;
    // Giữ nguyên một buffer chỉ số, chỉ ghi lại nội dung và đổi draw range
    // (thay buffer mới giữa chừng làm WebGPU báo lỗi).
    const idx = this.coarseIndex.array as Uint16Array;
    let o = 0;
    for (let j = 0; j < COARSE_N; j++) {
      const tz = (j / per) | 0;
      for (let i = 0; i < COARSE_N; i++) {
        const tx = (i / per) | 0;
        const t = this.tiles.get(tz * NT + tx);
        if (t && t.mesh) continue;
        const a = j * n1 + i;
        const b = a + 1;
        const c = a + n1;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    this.coarseIndex.needsUpdate = true;
    this.coarse.geometry.setDrawRange(0, o);
  }

  private disposeTile(t: TileRec): void {
    if (t.mesh) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    if (t.veg) {
      this.group.remove(t.veg);
      t.veg.geometry.dispose();
    }
  }

  tileCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.mesh) n++;
    return n;
  }

  dispose(): void {
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    this.coarse.geometry.dispose();
    this.material.dispose();
    this.vegMaterial.dispose();
  }
}

/** Ảnh bản đồ thu nhỏ: mỗi pixel một màu địa hình. */
export function renderMinimap(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const step = WORLD_SIZE / size;
  const c = new THREE.Color();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * step;
      const z = (j + 0.5) * step;
      const h = heightAt(x, z);
      const hx = heightAt(x + step, z);
      const hz = heightAt(x, z + step);
      const ny = 1 / Math.sqrt(1 + ((hx - h) / step) ** 2 + ((hz - h) / step) ** 2);
      terrainColor(x, z, h, ny, c);
      // Đổ bóng theo hướng dốc cho nổi khối.
      const shade = 0.82 + Math.max(-0.3, Math.min(0.3, (h - hx + (h - hz)) / (step * 1.6)));
      let r = c.r * shade;
      let gg = c.g * shade;
      let bb = c.b * shade;
      if (h < WATER_Y && featureWeight(LAKE, x, z) > 0) {
        r = 0.25;
        gg = 0.5;
        bb = 0.66;
      }
      const o = (j * size + i) * 4;
      // Chuyển gần đúng từ tuyến tính sang sRGB.
      img.data[o] = Math.min(255, Math.sqrt(r) * 255);
      img.data[o + 1] = Math.min(255, Math.sqrt(gg) * 255);
      img.data[o + 2] = Math.min(255, Math.sqrt(bb) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
