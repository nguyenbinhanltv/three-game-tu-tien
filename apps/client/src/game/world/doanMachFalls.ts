import * as THREE from 'three/webgpu';
import { float, mix, positionWorld, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Thác nhỏ trên vách Đoạn Mạch (POLISH-1; chỉ để nhìn, không va chạm, tất định): vài dải nước mảnh đổ từ mép vách xuống chân vách, có vệt bọt chảy
 * xuống theo nhiễu, nền đá ẩm sẫm hai bên, bụi nước (tấm sương cộng sáng) và vũng bọt ở chân. Mỗi thác là một dải đứng đặt sát vách theo pháp tuyến,
 * chân thác cách điểm rơi một đoạn để không lún vào lưới địa hình thô; chọn điểm ở vách dốc quay vào vùng chơi, có độ rơi ≥ 28 m.
 * Draw call: 3 (dải nước, bụi nước, vũng bọt).
 */

export interface FallSpot {
  x: number;
  z: number;
  /** Pháp tuyến ngang của vách (đơn vị, hướng ra khỏi đá). */
  nx: number;
  nz: number;
  top: number;
  base: number;
  w: number;
}

const COUNT = 7;

export function fallSpots(max = COUNT): FallSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cand: FallSpot[] = [];
  for (let x = b.x0 + 40; x < b.x1 - 40; x += 16) {
    for (let z = b.z0 + 40; z < b.z1 - 40; z += 16) {
      const dx = heightAt(x + 5, z) - heightAt(x - 5, z);
      const dz = heightAt(x, z + 5) - heightAt(x, z - 5);
      const g = Math.hypot(dx, dz) / 10; // độ dốc (dy/dx)
      if (g < 0.9 || g > 3) continue; // vách dốc, không đứng tuyệt đối
      // hướng xuống dốc = -gradient; thác nhìn ra phía thấp
      const nx = -dx / (g * 10);
      const nz = -dz / (g * 10);
      const toC = Math.hypot(cx - x, cz - z) || 1;
      if (nx * ((cx - x) / toC) + nz * ((cz - z) / toC) < 0.3) continue; // quay vào vùng chơi
      const y = heightAt(x, z);
      const low = heightAt(x + nx * 55, z + nz * 55);
      const drop = y - low;
      if (drop < 28) continue;
      cand.push({ x, z, nx, nz, top: y + 2, base: low + 0.5, w: 2.4 + hash01(Math.floor(x), Math.floor(z), 8101) * 2.2 });
    }
  }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(hash01(i, 3, 8103) * (i + 1));
    const a = cand[i]!;
    cand[i] = cand[j]!;
    cand[j] = a;
  }
  const out: FallSpot[] = [];
  for (const c of cand) {
    if (out.length >= max) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > 90)) out.push(c);
  }
  return out;
}

export class DoanMachFalls {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  readonly spots: FallSpot[];

  constructor() {
    this.group.name = 'doan-mach-falls';
    this.spots = fallSpots();
    if (!this.spots.length) return;
    const nz = getCloudNoise();

    // dải nước: dốc theo mặt vách (từ mép trên xuống chân), rộng w
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const mist: number[] = [];
    this.spots.forEach((s, i) => {
      const tx = -s.nz;
      const tz = s.nx;
      const rows = 14;
      for (let r = 0; r <= rows; r++) {
        const q = r / rows;
        // theo mặt địa hình: x,z đi ra theo pháp tuyến cho tới chân, y hạ từ top xuống base (bám đường dốc thật bằng cách lấy mẫu độ cao)
        const d = q * 55;
        for (const side of [-1, 1]) {
          const px = s.x + s.nx * d * 0.78 + tx * side * (s.w * 0.5) * (1 - 0.35 * q);
          const pz = s.z + s.nz * d * 0.78 + tz * side * (s.w * 0.5) * (1 - 0.35 * q);
          const ground = heightAt(px, pz);
          const y = Math.max(ground + 0.6, s.base) + 0.5;
          pos.push(px, Math.min(y, s.top - q * 0.1), pz);
          uvs.push(side * 0.5 + 0.5, q + i * 0.37);
        }
        if (r > 0) {
          const a = i * (rows + 1) * 2 + (r - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      mist.push(s.x + s.nx * 55 * 0.78, s.base + 3, s.z + s.nz * 55 * 0.78);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const across = uv().x.mul(2).sub(1);
    const flow = uv().y.mul(4.5).sub(time.mul(1.6));
    const n1 = texture(nz, vec2(uv().x.mul(2.6).add(uv().y.floor().mul(0.07)), flow)).g;
    const n2 = texture(nz, vec2(uv().x.mul(5.2).add(0.4), flow.mul(1.8).add(0.3))).b;
    const edge = float(1).sub(across.abs().pow(2.2));
    const streak = smoothstep(0.35, 0.8, n1.mul(0.6).add(n2.mul(0.5)));
    mat.colorNode = mix(vec3(0.55, 0.74, 0.86), vec3(0.96, 0.99, 1.0), streak);
    mat.opacityNode = edge.mul(float(0.38).add(streak.mul(0.5))).clamp(0, 0.85);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'doan-mach-fall';
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    // bụi nước ở chân thác (tấm quay mặt về camera): sương cộng sáng mềm
    const pg = new THREE.BufferGeometry();
    const pp: number[] = [];
    this.spots.forEach((_s, i) => {
      for (let k = 0; k < 6; k++) {
        const a = hash01(i, k, 8111) * 6.28;
        pp.push(mist[i * 3]! + Math.cos(a) * 3.2, mist[i * 3 + 1]! + hash01(i, k, 8113) * 5, mist[i * 3 + 2]! + Math.sin(a) * 3.2);
      }
    });
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.computeBoundingSphere();
    const pm = new THREE.PointsMaterial({
      color: 0xe6f4ff,
      size: 16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pg, pm);
    points.name = 'doan-mach-fall-spray';
    points.frustumCulled = false;
    this.group.add(points);
    this.disposables.push(pg, pm);

    // vũng bọt ở chân
    const dg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const r = uv().sub(0.5).length().mul(2);
    const foam = texture(nz, positionWorld.xz.mul(0.35).add(time.mul(0.05))).g;
    dm.colorNode = mix(vec3(0.5, 0.72, 0.82), vec3(0.95, 0.98, 1.0), foam);
    dm.opacityNode = smoothstep(1.0, 0.35, r).mul(float(0.3).add(foam.mul(0.35)));
    const disc = new THREE.InstancedMesh(dg, dm, this.spots.length);
    const m4 = new THREE.Matrix4();
    this.spots.forEach((s, i) => {
      const x = s.x + s.nx * 55 * 0.78;
      const z = s.z + s.nz * 55 * 0.78;
      m4.compose(new THREE.Vector3(x, heightAt(x, z) + 0.35, z), new THREE.Quaternion(), new THREE.Vector3(s.w * 1.6, 1, s.w * 1.6));
      disc.setMatrixAt(i, m4);
    });
    disc.instanceMatrix.needsUpdate = true;
    disc.frustumCulled = false;
    disc.renderOrder = 2;
    disc.name = 'doan-mach-fall-pool';
    this.group.add(disc);
    this.disposables.push(dg, dm);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
