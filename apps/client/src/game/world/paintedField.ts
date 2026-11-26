import * as THREE from 'three/webgpu';
import { heightAt, levelId } from '../../base/levelCtx';
import { ckGrassK } from './cuuKieuArt';
import { baseOf } from '../../base/quality';
import { createBlades } from '../../render/painted/lab/blades';
import { createFlowers, FLOWER_RING } from '../../render/painted/lab/flowers';
import {
  CT,
  GAME_RINGS,
  getPaintedLattice,
  getPaintedRefField,
  HEIGHT,
  LIGHT,
  REGION,
  SEED,
  SLOTS,
  WINDOW,
} from '../../render/painted/fieldShared';
import { GRASS_PUSH_SLOTS, grassBlockedByCollider, grassDensityAt, setGrassColliders, type GrassLayer, type Pusher } from './grass';

/**
 * Lớp cỏ Họa Cảnh của game (`?style=painted`): lá và hoa là bản dịch TSL đã đo khớp ở cảnh thử (render/painted/lab), đọc độ cao và độ phủ cỏ từ
 * lưới cuộn dựng từ địa hình game (xem render/painted/fieldShared.ts). Luật mọc cỏ chung với cỏ thường (`grassDensityAt`).
 */
const wrapIdx = (v: number): number => ((v % REGION) + REGION) % REGION;

export class PaintedGameField implements GrassLayer {
  readonly mesh = new THREE.Group();
  count = 0;
  private readonly F = getPaintedRefField();
  private readonly lat = getPaintedLattice();
  private readonly blades: ReturnType<typeof createBlades>;
  private readonly flowers: ReturnType<typeof createFlowers>;
  private enabled = true;
  private density = 1;
  private t = 0;
  private filled = 0;
  private readonly slotKey = new Int32Array(SLOTS * SLOTS * 2).fill(-2147483648);

  constructor() {
    this.mesh.name = 'env-grass-painted';
    this.mesh.visible = false;
    Object.assign(FLOWER_RING, { tiles: 3, cell: 0.7 });
    const groundAt = (x: number, z: number): number => heightAt(x, z);
    this.blades = createBlades(this.F, { height: HEIGHT, seed: SEED, density: 1, rings: GAME_RINGS }, groundAt);
    this.blades.init();
    this.flowers = createFlowers(this.F, { height: HEIGHT, seed: SEED }, groundAt);
    this.mesh.add(this.blades.group, this.flowers.group);
  }

  /** Dựng một ô 16×16 m của lưới (độ cao, độ phủ cỏ theo luật cỏ thường, độ dốc) vào chỗ cuộn của nó. */
  private fillChunk(cx: number, cz: number): void {
    const d = this.lat.data;
    const x0 = cx * CT;
    const z0 = cz * CT;
    setGrassColliders(x0, z0, CT);
    // cỏ không mọc dày trên đường/sân đá của level (như cỏ mặc định): hiện chỉ Cửu Kiều
    const roadK = levelId() === 'cuu_kieu' ? ckGrassK : null;
    const n = CT + 1;
    const hs = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = heightAt(x0 + i + 0.5, z0 + j + 0.5);
    for (let j = 0; j < CT; j++) {
      for (let i = 0; i < CT; i++) {
        const x = x0 + i;
        const z = z0 + j;
        const h = hs[j * n + i]!;
        const slopeG = (Math.abs(hs[j * n + i + 1]! - h) + Math.abs(hs[(j + 1) * n + i]! - h)) * 1.5;
        let dens = grassDensityAt(x + 0.5, z + 0.5, h, slopeG);
        if (dens > 0 && grassBlockedByCollider(x + 0.5, z + 0.5)) dens = 0;
        if (dens > 0 && roadK) dens *= roadK(x + 0.5, z + 0.5);
        const tx = wrapIdx(x);
        const tz = wrapIdx(z);
        const k = tz * REGION + tx;
        d.heights[k] = h;
        d.map[k * 4] = 64; // dry 0,25
        d.map[k * 4 + 1] = Math.round(255 * Math.min(1, dens / 0.55)); // growth
        d.map[k * 4 + 2] = 0; // wet
        d.map[k * 4 + 3] = dens > 0 ? 140 : 0; // flowers 0,55
        // độ dốc của "thế đất" lấy trên vài mét (như nguồn: không phải từng gồ ghề)
        const sx = (heightAt(x + 8.5, z + 0.5) - heightAt(x - 7.5, z + 0.5)) / 16;
        const sz = (heightAt(x + 0.5, z + 8.5) - heightAt(x + 0.5, z - 7.5)) / 16;
        d.slope[k * 2] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + sx * 2)));
        d.slope[k * 2 + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + sz * 2)));
      }
    }
    const s = wrapIdx(cx * CT) / CT + SLOTS * (wrapIdx(cz * CT) / CT);
    this.slotKey[s * 2] = cx;
    this.slotKey[s * 2 + 1] = cz;
    this.filled++;
    this.lat.tex.tHeight.needsUpdate = true;
    this.lat.tex.tMap.needsUpdate = true;
    this.lat.tex.tSlope.needsUpdate = true;
  }

  private chunkReady(cx: number, cz: number): boolean {
    const s = wrapIdx(cx * CT) / CT + SLOTS * (wrapIdx(cz * CT) / CT);
    return this.slotKey[s * 2] === cx && this.slotKey[s * 2 + 1] === cz;
  }

  setQuality(q: string): void {
    const b = baseOf(q);
    this.density = q === 'low' || b === 'low' ? 0 : b === 'medium' ? 0.6 : 1;
    // Thấp: không vẽ gì (instanceCount 0), kể cả khi bên ngoài đặt `mesh.visible = true`
    for (const r of this.blades.rings) r.geometry.instanceCount = this.density > 0 ? Math.max(1, Math.round(r.count * this.density)) : 0;
    this.count = 0;
    this.mesh.visible = this.enabled && this.density > 0 && this.filled > 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on && this.density > 0 && this.filled > 0;
  }

  update(dt: number, center: { x: number; y: number; z: number }, _pushers: Pusher[], budget = 1): void {
    void _pushers;
    void GRASS_PUSH_SLOTS;
    this.t += dt;
    const F = this.F;
    // đồng hồ và gió như nguồn (`field.update`): gió trôi theo hướng gió, chậm khi lặng
    F.uTime.value = this.t;
    const drift = 0.35 + LIGHT.wind[2]! * 0.55;
    F.uWindScroll.value.x += LIGHT.wind[0]! * drift * dt;
    F.uWindScroll.value.y += LIGHT.wind[1]! * drift * dt;
    if (!this.enabled || this.density <= 0) {
      this.mesh.visible = false;
      return;
    }
    const cx = Math.floor(center.x / CT);
    const cz = Math.floor(center.z / CT);
    const need: [number, number][] = [];
    for (let dz = -WINDOW; dz <= WINDOW; dz++)
      for (let dx = -WINDOW; dx <= WINDOW; dx++) if (!this.chunkReady(cx + dx, cz + dz)) need.push([cx + dx, cz + dz]);
    if (need.length) {
      need.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cz) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2));
      // nhảy xa (dịch chuyển, vào level): dựng hết một lần để lá không đứng trên độ cao cũ; còn lại dựng dần
      const take = need.length > 8 ? need.length : Math.max(1, budget);
      for (let k = 0; k < take && k < need.length; k++) this.fillChunk(need[k]![0], need[k]![1]);
    }
    this.blades.follow(center.x, center.z);
    this.flowers.follow(center.x, center.z);
    this.count = this.blades.rings.reduce((a, r) => a + r.geometry.instanceCount * r.tiles.length, 0);
    this.mesh.visible = this.filled > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    for (const r of this.blades.rings) {
      r.geometry.dispose();
      r.material.dispose();
    }
    this.flowers.dispose();
  }
}
