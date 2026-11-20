import * as THREE from 'three/webgpu';
import { float, mix, positionWorld, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Thác nhỏ ở khe vách Đoạn Mạch (POLISH-1; chỉ để nhìn, không va chạm, tất định). Chọn điểm TRONG KHE: nơi mặt vách lõm (độ cao hai bên khe cao hơn tâm khe),
 * dốc vừa, có độ rơi ≥ 28 m. Mỗi thác gồm:
 *  - khe tối sau nước (dải đỏ nâu sẫm rộng hơn nước) và hai bờ đá (dải sẫm, cao hơn mặt vách chút) nên đọc như nước chảy trong khe đá, không phải dải dán lên mặt dốc;
 *  - dải nước: hai lớp nhiễu cuộn xuống ở hai tốc độ, vệt sáng hai bên rìa (mép tạo bọt), vạch pháp tuyến giả (sáng/tối theo đạo hàm nhiễu) cho cảm giác mặt nước gợn;
 *  - bọt trắng đậm ở mép trên;
 *  - ở chân: hồ nhỏ nước xanh có phản chiếu trời (xanh nhạt, viền sáng), vòng bọt xoay, bụi nước (điểm cộng sáng) và sương thấp.
 * Draw call: 6 (khe tối, bờ đá, nước, hồ, vòng bọt, bụi nước).
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
const RUN = 55 * 0.78;

export function fallSpots(max = COUNT): FallSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cand: (FallSpot & { score: number })[] = [];
  for (let x = b.x0 + 40; x < b.x1 - 40; x += 14) {
    for (let z = b.z0 + 40; z < b.z1 - 40; z += 14) {
      const dx = heightAt(x + 5, z) - heightAt(x - 5, z);
      const dz = heightAt(x, z + 5) - heightAt(x, z - 5);
      const g = Math.hypot(dx, dz) / 10;
      if (g < 0.8 || g > 3) continue;
      const nx = -dx / (g * 10);
      const nz = -dz / (g * 10);
      const toC = Math.hypot(cx - x, cz - z) || 1;
      if (nx * ((cx - x) / toC) + nz * ((cz - z) / toC) < 0.3) continue;
      const y = heightAt(x, z);
      const low = heightAt(x + nx * 55, z + nz * 55);
      const drop = y - low;
      if (drop < 28) continue;
      // lõm ngang vách (khe): hai bên cách 11 m dọc đường đồng mức cao hơn tâm
      const tx = -nz;
      const tz = nx;
      const side = (heightAt(x + tx * 11, z + tz * 11) + heightAt(x - tx * 11, z - tz * 11)) / 2 - y;
      if (side < 1.2) continue; // không phải khe: bỏ
      cand.push({ x, z, nx, nz, top: y + 2, base: low + 0.5, w: 2.4 + hash01(Math.floor(x), Math.floor(z), 8101) * 2.0, score: side });
    }
  }
  cand.sort((a, c) => c.score - a.score);
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
    const ROWS = 14;

    // lưới dải: [khe tối (rộng ×1,9), nước (×1), bờ đá hai bên] — mỗi dải một geometry riêng cùng cách lấy mẫu
    const strip = (widthK: number, lift: number, offsetK = 0, sideSel: -1 | 0 | 1 = 0) => {
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      this.spots.forEach((s, i) => {
        const tx = -s.nz;
        const tz = s.nx;
        for (let r = 0; r <= ROWS; r++) {
          const q = r / ROWS;
          const d = q * 55;
          for (const side of [-1, 1]) {
            const half = s.w * 0.5 * widthK * (1 - 0.35 * q);
            const off = sideSel === 0 ? side * half : sideSel * (s.w * 0.5 * offsetK + (side + 1) * 0.5 * s.w * 0.3);
            const px = s.x + s.nx * d * 0.78 + tx * off;
            const pz = s.z + s.nz * d * 0.78 + tz * off;
            const y = Math.max(heightAt(px, pz) + 0.6, s.base) + lift;
            pos.push(px, Math.min(y, s.top + lift - q * 0.1), pz);
            uvs.push(side * 0.5 + 0.5, q + i * 0.37);
          }
          if (r > 0) {
            const a = i * (ROWS + 1) * 2 + (r - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return geo;
    };

    // 1) khe tối sau nước
    const cleftGeo = strip(1.9, 0.25);
    const cleftMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ca = uv().x.mul(2).sub(1);
    const cn = texture(nz, vec2(uv().x.mul(3.0), uv().y.mul(2.2))).g;
    cleftMat.colorNode = mix(vec3(0.12, 0.06, 0.05), vec3(0.3, 0.2, 0.12), cn);
    cleftMat.opacityNode = float(1).sub(ca.abs().pow(3)).mul(0.85);
    const cleft = new THREE.Mesh(cleftGeo, cleftMat);
    cleft.name = 'doan-mach-fall-cleft';
    cleft.frustumCulled = false;
    cleft.renderOrder = 2;
    this.group.add(cleft);
    this.disposables.push(cleftGeo, cleftMat);

    // 2) bờ đá hai bên khe (dải hẹp sẫm, hơi nhô)
    for (const sideSel of [-1, 1] as const) {
      const lipGeo = strip(0.5, 0.45, 1.05, sideSel);
      const lipMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const ln = texture(nz, vec2(uv().x.mul(2), uv().y.mul(5))).b;
      lipMat.colorNode = mix(vec3(0.16, 0.09, 0.07), vec3(0.42, 0.3, 0.2), ln);
      lipMat.opacityNode = float(0.92);
      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.name = 'doan-mach-fall-lip';
      lip.frustumCulled = false;
      lip.renderOrder = 2;
      this.group.add(lip);
      this.disposables.push(lipGeo, lipMat);
    }

    // 3) nước chảy: hai lớp cuộn + pháp tuyến giả + bọt mép trên
    const geo = strip(1.0, 0.6);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const across = uv().x.mul(2).sub(1);
    const qv = uv().y.fract();
    const flowA = uv().y.mul(5).sub(time.mul(1.7));
    const flowB = uv().y.mul(9).sub(time.mul(2.9));
    const sx = uv().x.mul(2.6).add(uv().y.floor().mul(0.07));
    const nA = texture(nz, vec2(sx, flowA)).g;
    const nB = texture(nz, vec2(sx.mul(2.1).add(0.4), flowB)).b;
    const nA2 = texture(nz, vec2(sx, flowA.add(0.03))).g;
    // đạo hàm theo hướng chảy: gợn sáng/tối giả pháp tuyến
    const ripple = nA2.sub(nA).mul(40);
    const streak = smoothstep(0.35, 0.8, nA.mul(0.6).add(nB.mul(0.5)));
    const edge = float(1).sub(across.abs().pow(2.0));
    const rim = smoothstep(0.55, 1.0, across.abs()); // mép: bọt do nước chạm đá
    const topFoam = smoothstep(0.16, 0.0, qv).mul(smoothstep(0.0, 0.5, nB.add(0.35))); // mép trên đổ xuống
    const water = mix(vec3(0.46, 0.68, 0.82), vec3(0.95, 0.98, 1.0), streak)
      .mul(float(1).add(ripple.mul(0.25)))
      .add(vec3(1, 1, 1).mul(rim.mul(0.2)));
    mat.colorNode = mix(water, vec3(1, 1, 1), topFoam.mul(0.9));
    mat.opacityNode = edge.mul(float(0.42).add(streak.mul(0.5)).add(rim.mul(0.2)).add(topFoam.mul(0.4))).clamp(0, 0.92);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'doan-mach-fall';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    // 4) hồ nhỏ ở chân (nước xanh phản chiếu trời nhạt, viền sáng) + vòng bọt xoay + bụi nước
    const dg = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const r = uv().sub(0.5).length().mul(2);
    const ripples = texture(nz, positionWorld.xz.mul(0.22).add(time.mul(0.04))).g;
    const sky = mix(vec3(0.42, 0.62, 0.8), vec3(0.78, 0.9, 0.98), smoothstep(0.2, 0.9, ripples));
    dm.colorNode = mix(sky, vec3(1, 1, 1), smoothstep(0.7, 1.0, r).mul(0.6));
    dm.opacityNode = smoothstep(1.0, 0.82, r).mul(0.78);
    const pool = new THREE.InstancedMesh(dg, dm, this.spots.length);
    const m4 = new THREE.Matrix4();
    this.spots.forEach((s, i) => {
      const x = s.x + s.nx * RUN;
      const z = s.z + s.nz * RUN;
      m4.compose(new THREE.Vector3(x, heightAt(x, z) + 0.4, z), new THREE.Quaternion(), new THREE.Vector3(s.w * 2.1, 1, s.w * 1.7));
      pool.setMatrixAt(i, m4);
    });
    pool.instanceMatrix.needsUpdate = true;
    pool.frustumCulled = false;
    pool.renderOrder = 2;
    pool.name = 'doan-mach-fall-pool';
    this.group.add(pool);
    this.disposables.push(dg, dm);

    const fg = new THREE.RingGeometry(0.55, 1, 28).rotateX(-Math.PI / 2);
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ang = uv().sub(0.5);
    const swirl = texture(nz, positionWorld.xz.mul(0.5).add(vec2(time.mul(0.12), time.mul(-0.08)))).g;
    fm.colorNode = vec3(1, 1, 1);
    fm.opacityNode = smoothstep(0.4, 0.8, swirl)
      .mul(0.55)
      .mul(float(1).sub(ang.length().mul(0.6)));
    const foam = new THREE.InstancedMesh(fg, fm, this.spots.length);
    this.spots.forEach((s, i) => {
      const x = s.x + s.nx * RUN;
      const z = s.z + s.nz * RUN;
      m4.compose(new THREE.Vector3(x, heightAt(x, z) + 0.5, z), new THREE.Quaternion(), new THREE.Vector3(s.w * 1.7, 1, s.w * 1.4));
      foam.setMatrixAt(i, m4);
    });
    foam.instanceMatrix.needsUpdate = true;
    foam.frustumCulled = false;
    foam.renderOrder = 3;
    foam.name = 'doan-mach-fall-foam';
    this.group.add(foam);
    this.disposables.push(fg, fm);

    const pg = new THREE.BufferGeometry();
    const pp: number[] = [];
    this.spots.forEach((s, i) => {
      const bx = s.x + s.nx * RUN;
      const bz = s.z + s.nz * RUN;
      for (let k = 0; k < 14; k++) {
        const a = hash01(i, k, 8111) * 6.28;
        const rr = hash01(i, k, 8112) * 3.8;
        pp.push(bx + Math.cos(a) * rr, heightAt(bx, bz) + 1 + hash01(i, k, 8113) * 6, bz + Math.sin(a) * rr);
      }
    });
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.computeBoundingSphere();
    const pm = new THREE.PointsMaterial({
      color: 0xe6f4ff,
      size: 12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pg, pm);
    points.name = 'doan-mach-fall-spray';
    points.frustumCulled = false;
    this.group.add(points);
    this.disposables.push(pg, pm);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
