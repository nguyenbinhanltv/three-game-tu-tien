import * as THREE from 'three/webgpu';
import { float, mix, positionWorld, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Thác nhỏ ở khe vách Đoạn Mạch (POLISH-1; chỉ để nhìn, không va chạm, tất định). Điểm đặt chọn TRONG KHE (hai bên khe cao hơn tâm), độ rơi ≥ 28 m.
 *  - Đường chảy THEO ĐỊA HÌNH thật (đi xuống theo gradient, mỗi 3 m một mốc) nên dải nước ôm sát vách chứ không phải một tấm thẳng dán nghiêng;
 *  - dải nước là ỐNG nửa tiết diện 7 cột: phồng ra ở giữa (≤ 0,8 m), vòng cung qua mép trên rồi ôm vách; UV chạy dọc theo dòng, hai lớp nhiễu cuộn ở hai tốc độ,
 *    mép sáng (bọt do chạm đá);
 *  - ở chân: hồ nhỏ nước xanh có gợn (mép mềm, không đĩa trắng), vòng bọt xoáy mờ, bụi nước (điểm cộng sáng).
 * Draw call: 4 (nước, hồ, bọt, bụi nước).
 */

interface FallPoint {
  x: number;
  y: number;
  z: number;
  /** Pháp tuyến mặt đất tại điểm (đơn vị). */
  nx: number;
  ny: number;
  nz: number;
  /** Hướng chảy ngang (đơn vị). */
  dx: number;
  dz: number;
}

interface FallSpot {
  path: FallPoint[];
  w: number;
}

const STEP = 3;
const COLS = 11;

function groundNormal(x: number, z: number, e = 3): { x: number; y: number; z: number } {
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const l = Math.hypot(gx, 1, gz);
  return { x: -gx / l, y: 1 / l, z: -gz / l };
}

/** Đường chảy từ (x0, z0): đi xuống theo gradient, mỗi STEP m; dừng khi hết dốc hoặc quá 150 m. */
function flowPath(x0: number, z0: number): FallPoint[] {
  const out: FallPoint[] = [];
  let x = x0;
  let z = z0;
  let px = 0;
  let pz = 0;
  for (let k = 0; k < 50; k++) {
    const gx = (heightAt(x + 3, z) - heightAt(x - 3, z)) / 6;
    const gz = (heightAt(x, z + 3) - heightAt(x, z - 3)) / 6;
    const gl = Math.hypot(gx, gz);
    if (gl < 0.28 && k > 4) break; // hết dốc
    let dx = gl > 1e-4 ? -gx / gl : px;
    let dz = gl > 1e-4 ? -gz / gl : pz;
    // làm mượt hướng để dòng không ngoằn ngoèo theo nhiễu lưới
    if (k > 0) {
      dx = dx * 0.5 + px * 0.5;
      dz = dz * 0.5 + pz * 0.5;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
    }
    const n = groundNormal(x, z);
    out.push({ x, y: heightAt(x, z), z, nx: n.x, ny: n.y, nz: n.z, dx, dz });
    px = dx;
    pz = dz;
    x += dx * STEP;
    z += dz * STEP;
  }
  return out;
}

export function fallSpots(max = 6): FallSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cand: { x: number; z: number; score: number }[] = [];
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
      if (y - heightAt(x + nx * 55, z + nz * 55) < 28) continue;
      const tx = -nz;
      const tz = nx;
      const side = (heightAt(x + tx * 11, z + tz * 11) + heightAt(x - tx * 11, z - tz * 11)) / 2 - y;
      if (side < 1.2) continue;
      cand.push({ x, z, score: side });
    }
  }
  cand.sort((a, c) => c.score - a.score);
  const out: FallSpot[] = [];
  const centers: { x: number; z: number }[] = [];
  for (const c of cand) {
    if (out.length >= max) break;
    if (centers.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 90)) continue;
    const path = flowPath(c.x, c.z);
    if (path.length < 8 || path[0]!.y - path[path.length - 1]!.y < 20) continue; // quá ngắn/thấp: bỏ
    out.push({ path, w: 2.8 + hash01(Math.floor(c.x), Math.floor(c.z), 8101) * 1.8 });
    centers.push(c);
  }
  return out;
}

export class DoanMachFalls {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  readonly falls: FallSpot[];

  constructor(falls: FallSpot[]) {
    this.group.name = 'doan-mach-falls';
    this.falls = falls;
    if (!falls.length) return;
    const nz = getCloudNoise();

    // 1) dải nước ống nửa tiết diện
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let base = 0;
    falls.forEach((f, fi) => {
      const rows = f.path.length;
      f.path.forEach((p, r) => {
        const q = r / Math.max(1, rows - 1);
        const tx = -p.dz;
        const tz = p.dx;
        const widen = 1 + 0.35 * q;
        for (let c = 0; c < COLS; c++) {
          const u = c / (COLS - 1);
          const off = (u - 0.5) * f.w * widen;
          const bulge = Math.sin(Math.PI * u) * (0.55 + 0.25 * (1 - q)) + (r < 2 ? (2 - r) * 0.55 : 0); // vòng cung ở mép trên
          const lift = 0.35 + bulge;
          const px = p.x + tx * off + p.nx * lift;
          const pz = p.z + tz * off + p.nz * lift;
          const py = Math.max(p.y, heightAt(p.x + tx * off, p.z + tz * off)) + p.ny * lift + 0.15;
          pos.push(px, py, pz);
          uvs.push(u, q * 6 + fi * 0.37);
        }
        if (r > 0) {
          const a = base + (r - 1) * COLS;
          const b = base + r * COLS;
          for (let c = 0; c < COLS - 1; c++) idx.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
        }
      });
      base += rows * COLS;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const across = uv().x.mul(2).sub(1);
    const flowA = uv().y.mul(1.0).sub(time.mul(1.5));
    const flowB = uv().y.mul(1.8).sub(time.mul(2.7));
    const sx = uv().x.mul(2.6);
    const nA = texture(nz, vec2(sx, flowA)).g;
    const nB = texture(nz, vec2(sx.mul(2.2).add(0.4), flowB)).b;
    const streak = smoothstep(0.35, 0.8, nA.mul(0.6).add(nB.mul(0.5)));
    const edge = float(1).sub(across.abs().pow(2.5));
    const rim = smoothstep(0.6, 1.0, across.abs());
    const water = mix(vec3(0.4, 0.62, 0.8), vec3(0.93, 0.98, 1.0), streak).add(vec3(1, 1, 1).mul(rim.mul(0.25)));
    mat.colorNode = water;
    // bọt trắng đậm ở đỉnh (uv.y nhỏ) và ở chân (uv.y lớn) của mỗi dòng
    const along = uv().y.div(6).fract().max(0.0001);
    const qn = uv().y.div(6);
    const topFoam = smoothstep(0.1, 0.0, qn.fract().min(qn.sub(qn.floor())));
    mat.opacityNode = edge
      .mul(float(0.45).add(streak.mul(0.45)).add(rim.mul(0.25)).add(topFoam.mul(0.3)))
      .clamp(0, 0.9)
      .mul(smoothstep(0.0, 0.06, along));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'doan-mach-fall';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    // 2) hồ chân thác: mép mềm theo nhiễu, nước xanh có gợn
    const dg = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const r = uv().sub(0.5).length().mul(2);
    const rip = texture(nz, positionWorld.xz.mul(0.2).add(time.mul(0.035))).g;
    const rip2 = texture(nz, positionWorld.xz.mul(0.6).sub(time.mul(0.05))).b;
    dm.colorNode = mix(vec3(0.3, 0.5, 0.66), vec3(0.62, 0.8, 0.9), smoothstep(0.3, 0.8, rip.mul(0.6).add(rip2.mul(0.4))));
    dm.opacityNode = smoothstep(1.0, 0.55, r.add(rip.sub(0.5).mul(0.35))).mul(0.82);
    const pool = new THREE.InstancedMesh(dg, dm, falls.length);
    const m4 = new THREE.Matrix4();
    falls.forEach((f, i) => {
      const pe = f.path[f.path.length - 1]!;
      m4.compose(
        new THREE.Vector3(pe.x, heightAt(pe.x, pe.z) + 0.35, pe.z),
        new THREE.Quaternion(),
        new THREE.Vector3(f.w * 1.9, 1, f.w * 1.6),
      );
      pool.setMatrixAt(i, m4);
    });
    pool.instanceMatrix.needsUpdate = true;
    pool.frustumCulled = false;
    pool.renderOrder = 2;
    pool.name = 'doan-mach-fall-pool';
    this.group.add(pool);
    this.disposables.push(dg, dm);

    // 3) bọt xoáy quanh chân thác (mờ, không đĩa)
    const fg = new THREE.RingGeometry(0.2, 1, 32).rotateX(-Math.PI / 2);
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ang = uv().sub(0.5).length().mul(2);
    const sw = texture(nz, positionWorld.xz.mul(0.55).add(vec2(time.mul(0.1), time.mul(-0.07)))).g;
    fm.colorNode = vec3(1, 1, 1);
    fm.opacityNode = smoothstep(0.5, 0.85, sw)
      .mul(0.4)
      .mul(smoothstep(1.0, 0.55, ang));
    const foam = new THREE.InstancedMesh(fg, fm, falls.length);
    falls.forEach((f, i) => {
      const pe = f.path[f.path.length - 1]!;
      m4.compose(
        new THREE.Vector3(pe.x, heightAt(pe.x, pe.z) + 0.5, pe.z),
        new THREE.Quaternion(),
        new THREE.Vector3(f.w * 1.3, 1, f.w * 1.1),
      );
      foam.setMatrixAt(i, m4);
    });
    foam.instanceMatrix.needsUpdate = true;
    foam.frustumCulled = false;
    foam.renderOrder = 3;
    foam.name = 'doan-mach-fall-foam';
    this.group.add(foam);
    this.disposables.push(fg, fm);

    // 4) bụi nước ở chân
    const pg = new THREE.BufferGeometry();
    const pp: number[] = [];
    falls.forEach((f, i) => {
      const pe = f.path[f.path.length - 1]!;
      for (let k = 0; k < 16; k++) {
        const a = hash01(i, k, 8111) * 6.28;
        const rr = hash01(i, k, 8112) * f.w * 1.3;
        pp.push(pe.x + Math.cos(a) * rr, pe.y + 1 + hash01(i, k, 8113) * 6, pe.z + Math.sin(a) * rr);
      }
    });
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.computeBoundingSphere();
    const pm = new THREE.PointsMaterial({
      color: 0xe6f4ff,
      size: 10,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.14,
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
