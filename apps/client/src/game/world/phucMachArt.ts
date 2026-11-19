import * as THREE from 'three/webgpu';
import { fbm } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { heightAt } from '../../base/levelCtx';
import { DungeonFx } from './dungeonFx';

/**
 * Cảnh Phục Mạch Quật (DUN-1 PR2; chỉ để nhìn, KHÔNG va chạm, không đổi vùng boss/đợt quái/cổng): hầm mỏ cũ của Tàng Mạch Hội.
 * Phần dựng bằng Blender (`arch_phuc_mach`: cụm mạch tinh khổng lồ, cột đá sa thạch, khung chống gỗ, cửa hầm + ray + xe quặng, nhũ đá, mạch tinh treo trần)
 * nạp ở `engine/levelLoad.ts` `loadPmModel`. File này dựng phần thủ tục: màu đất, mạng mạch tinh khắc sàn đài chiến, khe nứt lõm có ánh lục, bụi hầm
 * (`DungeonFx`) và vòng trận cổng ra.
 */

const SEED = 20261119;
const CENTER = LEVELS.phuc_mach!.dungeon!.center;

/** Tâm vòm hang và kích thước (khớp `cave` trong `phuc_mach.assets.json` và `DOME_R/DOME_H` của `phuc_mach_arch.py`). */
export const PM_DOME = { r: 135, h: 75 };

const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const PM = {
  earth: hex(0x6e4e38),
  dark: hex(0x3a2a20),
  clay: hex(0x80503a),
  dust: hex(0x8c6e50),
  rock: hex(0x6a5646),
  packed: hex(0x4a3628),
  vein: hex(0x3fa890),
};

/** Màu đất hầm (RGB 0..1, viết vào `out`): đất son nâu, mảng đất sét đỏ, bụi sáng, đá vụn tối; lòng đài chiến nén chặt sẫm hơn; dốc lộ đá sa thạch. */
export function pmGroundColor(x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.012, z * 0.012, 2, SEED + 300);
  const m = fbm(x * 0.045, z * 0.045, 2, SEED + 331);
  const f = fbm(x * 0.16, z * 0.16, 1, SEED + 377);
  let c = lerp3(PM.earth, PM.dust, Math.min(0.55, Math.max(0, n * 1.2 + 0.1)));
  c = lerp3(c, PM.clay, Math.min(0.6, Math.max(0, fbm(x * 0.008 - 11, z * 0.008 + 3, 2, SEED + 457) - 0.02) * 1.9));
  c = lerp3(c, PM.dark, Math.min(0.5, Math.max(0, -m - 0.02) * 1.3));
  const d = Math.hypot(x - CENTER.x, z - CENTER.z);
  const arena = 1 - Math.min(1, Math.max(0, (d - 46) / 18));
  c = lerp3(c, PM.packed, arena * 0.65);
  // ánh lục mạch tinh thấm nhẹ quanh vòng 62 (khớp mạng mạch khắc sàn)
  c = lerp3(c, PM.vein, Math.exp(-(((d - 62) / 6) ** 2)) * 0.16);
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp3(c, PM.rock, Math.min(1, (slope - 0.12) * 4.2));
  const k = 0.9 + f * 0.16;
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
}

/** Vùng cấm đặt vật: khu giữa đài chiến và lối vào phía nam (dải 9 m). */
export function pmKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 0);
}

/** Mạng mạch tinh khắc sàn đài chiến: thân mạch chính tỏa tám hướng, phân nhánh nhỏ, vòng tròn mảnh; vẽ canvas, cộng sáng mờ (một draw call). */
function veinTexture(): THREE.CanvasTexture {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const h = N / 2;
  g.lineCap = 'round';
  let s = SEED >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    if (len < 12 || depth > 3) return;
    g.strokeStyle = `rgba(70,200,165,${0.22 + 0.12 * (3 - depth)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    let cx = x;
    let cy = y;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.7;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      g.lineTo(cx, cy);
    }
    g.stroke();
    if (rnd() < 0.8) branch(cx, cy, a + 0.7 + rnd() * 0.4, len * 0.55, w * 0.65, depth + 1);
    if (rnd() < 0.8) branch(cx, cy, a - 0.7 - rnd() * 0.4, len * 0.55, w * 0.65, depth + 1);
    if (rnd() < 0.5) branch(x + (cx - x) * 0.5, y + (cy - y) * 0.5, a + 1.0, len * 0.4, w * 0.6, depth + 1);
  };
  for (let i = 0; i < 8; i++) branch(h, h, (i / 8) * Math.PI * 2 + 0.2, h * 0.5, 3, 0);
  g.strokeStyle = 'rgba(80,200,170,0.3)';
  g.lineWidth = 3;
  for (const r of [h * 0.34, h * 0.66, h * 0.96]) {
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class PhucMachArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'phuc-mach-art';
    this.addVeins();
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: LEVELS.phuc_mach!.dungeon!.exit,
      seed: SEED,
      keepOut: pmKeepOut,
      cracks: { count: 30, rMin: 24, rMax: 100, floor: [0.2, 0.95, 0.72], halo: [0.1, 0.55, 0.42], rock: [0.34, 0.25, 0.18] },
      mist: { a: [0.42, 0.32, 0.24], b: [0.62, 0.5, 0.36], innerR: 36, outerR: 140, opacity: 0.3 },
      ring: { rgb: '150,240,210', mote: 0xb5f7de },
    });
    this.group.add(this.fx.group);
  }

  private addVeins(): void {
    const tex = veinTexture();
    const R = 66;
    const geo = new THREE.RingGeometry(0.01, R, 96, 36).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, heightAt(CENTER.x + p.getX(i), CENTER.z + p.getZ(i)) + 0.09);
      uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
    }
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(CENTER.x, 0, CENTER.z);
    mesh.name = 'pm-veins';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  update(dt: number): void {
    this.fx.update(dt);
  }

  dispose(): void {
    this.fx.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
