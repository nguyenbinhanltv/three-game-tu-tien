import * as THREE from 'three/webgpu';
import { LEVELS } from '@dtl/content';
import { fbm, hash01, propsOf, type TerrainDef, type Terrain } from '@dtl/shared';
import { createWorldMaterial } from '../../render/materials/world';
import { vanHaiArt, type VhIsland } from './vanHaiArt';

/**
 * Cây tán lá dày kiểu thẻ alpha cho Vân Hải (MAP-3), thay rừng bonsai tối màu: mỗi cây là thân thon + tán gồm 4 thẻ cắt chéo
 * dán một texture lá có kênh alpha (vẽ thủ tục trên canvas, nhiều tông xanh, bóng đổ trong tán). Màu tán nhân theo bảng màu từng đảo
 * (`VH_PALETTES`), cụm theo nhiễu để thành lùm rừng chứ không rải đều. Chỉ để nhìn (như cỏ): không va chạm.
 * Hai InstancedMesh (thân, tán) cho cả level.
 */

const MAX_TREES = 2600;

/** Texture tán lá xám sáng có alpha (tông xanh do `instanceColor` nhân vào). */
function canopyTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  // hình dạng tán: nhiều chùm lá tròn xếp thành đám bầu dục, chùm trên sáng, chùm dưới tối
  const blobs = 150;
  for (let i = 0; i < blobs; i++) {
    const a = hash01(i, 1, 501) * Math.PI * 2;
    const rr = Math.sqrt(hash01(i, 2, 503)) * 0.46;
    const x = S / 2 + Math.cos(a) * rr * S * 1.0;
    const y = S / 2 + Math.sin(a) * rr * S * 0.8 - S * 0.02;
    const r = S * (0.045 + hash01(i, 3, 505) * 0.05);
    const up = 1 - y / S;
    const shade = Math.round(255 * Math.min(1, 0.68 + 0.32 * up * (0.75 + hash01(i, 4, 507) * 0.5)));
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath();
    g.ellipse(x, y, r * 1.25, r, hash01(i, 5, 509) * 3.14, 0, Math.PI * 2);
    g.fill();
    // viền tối nhỏ cho tách lá
    g.strokeStyle = 'rgba(70,80,70,0.28)';
    g.lineWidth = 1.4;
    g.stroke();
  }
  // đốm sáng nắng lên đỉnh tán
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + (hash01(i, 6, 511) - 0.5) * S * 0.6;
    const y = S * (0.2 + hash01(i, 7, 513) * 0.25);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(x, y, S * 0.018, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

/** Bốn thẻ cắt chéo (ba đứng, một nằm) đường kính 1, tâm gốc; pháp tuyến hướng lên (shading mềm như tán cây thật). */
function canopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(1, 0.86);
    p.rotateY((i * Math.PI) / 3);
    parts.push(p);
  }
  const top = new THREE.PlaneGeometry(0.8, 0.8);
  top.rotateX(-Math.PI / 2);
  top.translate(0, 0.12, 0);
  parts.push(top);
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    const pp = p.getAttribute('position');
    const pu = p.getAttribute('uv');
    for (let i = 0; i < pp.count; i++) {
      pos.push(pp.getX(i), pp.getY(i), pp.getZ(i));
      uv.push(pu.getX(i), pu.getY(i));
      nor.push(0, 1, 0);
    }
    const pi = p.getIndex()!;
    for (let i = 0; i < pi.count; i++) idx.push(base + pi.getX(i));
    // mặt sau: tam giác đảo chiều, pháp tuyến vẫn hướng lên (không lật tối như DoubleSide)
    for (let i = 0; i < pi.count; i += 3) idx.push(base + pi.getX(i), base + pi.getX(i + 2), base + pi.getX(i + 1));
    base += pp.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Tán lá: tông xanh theo đảo, sáng hơn màu cỏ để ra màu lá chứ không bết. */
function foliageColor(isl: VhIsland, r: number): THREE.Color {
  const base = new THREE.Color(isl.pal.grass).lerp(new THREE.Color(0x3f8a5a), 0.45);
  base.offsetHSL((r - 0.5) * 0.05, 0.12, (r - 0.5) * 0.12);
  return base.multiplyScalar(1.15);
}

export interface VhTreeSpot {
  x: number;
  z: number;
  /** Cao độ đất tại gốc. */
  y: number;
  /** Tỉ lệ (thân cao 3,4·s, tán rộng 10,5·s). */
  s: number;
  yaw: number;
  isl: VhIsland;
  /** Độ lệch sắc tán 0..1. */
  tone: number;
}

/** Điểm trồng cây vườn Vân Hải: hàm thuần theo địa hình (dựng cảnh và bake collider dùng chung, COL-B). */
export function vanHaiTreeSpots(terrain: Terrain): VhTreeSpot[] {
  const def: TerrainDef = terrain.def;
  const art = vanHaiArt(def);
  const props = propsOf('van_hai');
  const spots = def.features.filter((f) => f.id.startsWith('pad_') || f.id.startsWith('poi_'));
  const bridgeEnds: [number, number][] = [];
  for (const b of def.bridges ?? []) bridgeEnds.push([b.ax, b.az], [b.bx, b.bz]);
  // Tâm bãi quái và nút thu thập: giữ trống 3 m để thân cây không đè chỗ quái đứng/người nhặt (COL-B, `map:report`).
  const keepClear = [...(LEVELS.van_hai?.camps ?? []), ...(LEVELS.van_hai?.nodes ?? [])];
  const out: VhTreeSpot[] = [];
  for (const isl of art.islands) {
    if (isl.kind === 'hub') continue; // sân Phù Đảo Các để trống (quảng trường, NPC)
    const want = Math.min(560, Math.round((isl.r * isl.r) / 95));
    let placed = 0;
    for (let k = 0; k < want * 6 && placed < want && out.length < MAX_TREES; k++) {
      const a = hash01(k, Math.round(isl.x), 521) * Math.PI * 2;
      const rr = Math.sqrt(hash01(k, Math.round(isl.z), 523)) * (isl.r - 8);
      const x = isl.x + Math.cos(a) * rr;
      const z = isl.z + Math.sin(a) * rr;
      // lùm: chỉ nhận chỗ nhiễu cao, thưa dần ở chỗ thấp
      const dens = fbm(x * 0.017, z * 0.017, 3, def.seed + 777);
      if (hash01(k, Math.round(x), 525) > dens * 2.2 - 0.05) continue;
      if (art.trailW(isl, x, z) > 0.2 || art.pondW(x, z) > 0) continue;
      if (spots.some((sp) => Math.hypot(sp.x - x, sp.z - z) < 12)) continue;
      if (bridgeEnds.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 14)) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
      if (keepClear.some((c) => Math.hypot(c.x - x, c.z - z) < 3)) continue;
      if (terrain.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 3)) continue;
      const y = terrain.heightAt(x, z);
      if (!Number.isFinite(y)) continue;
      out.push({ x, z, y, s: 0.8 + hash01(k, 9, 527) * 0.9, yaw: hash01(k, 11, 529) * 6.28, isl, tone: hash01(k, 13, 531) });
      placed++;
    }
  }
  return out;
}

export class VanHaiGarden {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  readonly count: number;

  constructor(terrain: Terrain) {
    this.group.name = 'vanHaiGarden';
    const spots = vanHaiTreeSpots(terrain);
    const trunks: THREE.Matrix4[] = [];
    const crowns: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const t of spots) {
      const trunkH = 3.4 * t.s;
      e.set(0, t.yaw, 0);
      q.setFromEuler(e);
      trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y + trunkH / 2 - 0.1, t.z), q, new THREE.Vector3(t.s, t.s, t.s)));
      const cw = 10.5 * t.s;
      crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y + trunkH + cw * 0.34, t.z), q, new THREE.Vector3(cw, cw, cw)));
      colors.push(foliageColor(t.isl, t.tone));
    }
    this.count = crowns.length;
    if (!this.count) return;
    const tex = this.track(canopyTexture());
    const crownMat = this.track(createWorldMaterial({ map: tex, alphaTest: 0.5, roughness: 0.92 }));
    const crownGeo = this.track(canopyGeometry());
    const cm = new THREE.InstancedMesh(crownGeo, crownMat, this.count);
    crowns.forEach((m, i) => {
      cm.setMatrixAt(i, m);
      cm.setColorAt(i, colors[i]!);
    });
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    cm.frustumCulled = false;
    cm.castShadow = true;
    cm.name = 'van-hai-crowns';
    this.group.add(cm);
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.1, 0.2, 1 * 3.4, 6, 1));
    const trunkMat = this.track(createWorldMaterial({ color: 0x5a4636, roughness: 0.95 }));
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, this.count);
    trunks.forEach((m, i) => tm.setMatrixAt(i, m));
    tm.instanceMatrix.needsUpdate = true;
    tm.frustumCulled = false;
    tm.castShadow = true;
    tm.name = 'van-hai-trunks';
    this.group.add(tm);
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
