import * as THREE from 'three/webgpu';
import { clamp, float, mix, smoothstep, sin, time, uv, vec3 } from 'three/tsl';
import { CUU_KIEU_HUB, CUU_KIEU_REEDS, CUU_KIEU_ROAD, CUU_KIEU_ROAD_HALF, CUU_KIEU_SPAN, CUU_KIEU_TREES, hash01 } from '@dtl/shared';
import { markBloom } from '../../render/post';

/**
 * Kiến trúc và cảnh quan Thiên Lộ Giới (TN-7, mỹ thuật), dựng bằng code, không asset ngoài, chỉ để nhìn (va chạm trụ/cây đã nằm trong `terrain.colliders`):
 *  - **Con đường lát đá** uốn từ cổng Kiều Đầu lên Bậc Cuối (phiến đá, bó vỉa) và **lan can** hai bên (trụ, thanh ngang, đèn lồng);
 *  - **Chuỗi chín nhịp cầu vòm đá** nối nhau trên biển mây phía bắc (mặt cầu võng, vòm đôi, lan can, trụ chống xuống mây, đèn) và ánh sáng cuối đường;
 *  - **Kiều Đầu**: cổng vòm đá có mái ở đầu đường, đình hai tầng mái ngói, rạp vải với lửa trại, đèn lồng;
 *  - **Cổ thụ**, cây vừa, **cỏ lau trắng**, **thác nước** đổ từ rìa cao nguyên xuống biển mây.
 * Dữ liệu vị trí từ `cuukieu.art.ts` (sinh bởi `tools/maps/gen-cuu_kieu.mjs`). Khoảng 12 draw call.
 */

export interface CkWondersInput {
  heightAt(x: number, z: number): number;
}

const STONE = 0xa9b1ab;
const STONE_DARK = 0x8e9690;
const WOOD = 0x5a3a28;
const ROOF = 0x2e4d49;
const BRONZE = 0xa07c42;
const CLOTH = 0xe9e0c8;
const LANTERN = 0xffa24a;

/** Gom hình nguyên thủy đã đặt chỗ vào một lưới có màu đỉnh (một draw call cho cả khối). */
class Builder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly nm = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();
  private readonly c = new THREE.Color();

  add(geo: THREE.BufferGeometry, color: number, matrix: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    this.nm.getNormalMatrix(matrix);
    this.c.set(color);
    for (let i = 0; i < pa.count; i++) {
      this.v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(matrix);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(this.nm).normalize();
      this.nrm.push(this.v.x, this.v.y, this.v.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (g !== geo) g.dispose();
  }

  /** Hộp `w × h × d`, tâm đáy ở (x, y, z), xoay `ry` quanh y và `rx` quanh x (độ dốc). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this.m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    this.add(g, color, this.m);
    g.dispose();
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: number): void {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    this.m.makeTranslation(x, y, z);
    this.add(g, color, this.m);
    g.dispose();
  }

  /** Mái chóp bốn mặt (mái ngói) bề rộng `w` × `d`, cao `h`, chân ở (x, y, z). */
  roof(w: number, d: number, h: number, x: number, y: number, z: number, color: number, ry = 0): void {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, h / 2, 0);
    this.m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(w, 1, d));
    this.add(g, color, this.m);
    g.dispose();
  }

  /**
   * Cung vòm đá: nửa elip trong mặt phẳng đứng chứa hướng `yaw` (rad quanh y, 0 = +z), bán kính dọc hướng `rx` × đứng `ry`, ghép từ các phiến hộp
   * dày `thick` (hướng kính) × rộng `depth` (ngang), tâm elip ở (x, y, z). Chân vòm ở độ cao `y`.
   */
  arch(rx: number, ry: number, thick: number, depth: number, x: number, y: number, z: number, color: number, yaw: number): void {
    const N = 22;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let prev: [number, number] | null = null;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      const u = Math.cos(a) * rx;
      const v = Math.sin(a) * ry;
      if (prev) {
        const du = u - prev[0];
        const dv = v - prev[1];
        const len = Math.hypot(du, dv);
        const mu = (u + prev[0]) / 2;
        const mv = (v + prev[1]) / 2;
        this.box(depth, thick, len + 0.12, x + fx * mu, y + mv - thick / 2, z + fz * mu, color, yaw, -Math.atan2(dv, du));
      }
      prev = [u, v];
    }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

function solidMat(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04 });
}

function lampMat(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  markBloom(m, 0.35);
  return m;
}

function glowMat(color: number, opacity: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  markBloom(m, 0.2);
  return m;
}

/** Điểm tim đường tại độ dài cung `s` (m) và hướng tiếp tuyến (rad quanh y, 0 = +z). */
interface RoadFrame {
  x: number;
  z: number;
  yaw: number;
}

/** Lấy mẫu đường tim đều nhau mỗi `step` mét. Hàm thuần (có test). */
export function roadSamples(step: number): RoadFrame[] {
  const out: RoadFrame[] = [];
  let carry = 0;
  const pts = CUU_KIEU_ROAD;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let s = carry; s < len; s += step) {
      const t = s / len;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw });
      carry = s + step - len;
    }
  }
  return out;
}

export class CkWonders {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(private readonly inp: CkWondersInput) {
    this.group.name = 'ck-wonders';
    this.buildRoad();
    this.buildRailings();
    this.buildBridges();
    this.buildHub();
    this.buildTrees();
    this.buildReeds();
    this.buildFalls();
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private mesh(geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, shadow = false): THREE.Mesh | null {
    if (!geo) return null;
    const m = new THREE.Mesh(this.own(geo), this.own(mat));
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /** Mặt đường lát đá: phiến đá hai hàng nối nhau (khe hở lộ cỏ), bó vỉa sẫm hai bên, bám địa hình. */
  private buildRoad(): void {
    const pos: number[] = [];
    const col: number[] = [];
    const nrm: number[] = [];
    const c = new THREE.Color();
    const hw = CUU_KIEU_ROAD_HALF;
    const frames = roadSamples(2.7);
    /** Tứ giác p00-p10-p11-p01 (hai tam giác). */
    const quad = (p00: THREE.Vector3, p10: THREE.Vector3, p11: THREE.Vector3, p01: THREE.Vector3, color: number): void => {
      c.set(color);
      const up = (p10.x - p00.x) * (p11.z - p00.z) - (p10.z - p00.z) * (p11.x - p00.x);
      const tri = up > 0 ? [p00, p11, p10, p00, p01, p11] : [p00, p10, p11, p00, p11, p01];
      for (const p of tri) {
        pos.push(p.x, p.y, p.z);
        nrm.push(0, 1, 0);
        col.push(c.r, c.g, c.b);
      }
    };
    const at = (f: RoadFrame, off: number, dz: number, lift: number): THREE.Vector3 => {
      const nx = Math.cos(f.yaw);
      const nz = -Math.sin(f.yaw);
      const fx = Math.sin(f.yaw);
      const fz = Math.cos(f.yaw);
      const x = f.x + nx * off + fx * dz;
      const z = f.z + nz * off + fz * dz;
      return new THREE.Vector3(x, this.inp.heightAt(x, z) + lift, z);
    };
    const gap = 0.07;
    frames.forEach((f, i) => {
      const h = hash01(i, 7, 9101);
      const base = 0.86 + h * 0.2;
      const tone = (k: number): number => {
        const v = Math.min(1, base * k);
        return (
          ((Math.round(((STONE >> 16) & 255) * v) & 255) << 16) |
          ((Math.round(((STONE >> 8) & 255) * v) & 255) << 8) |
          (Math.round((STONE & 255) * v) & 255)
        );
      };
      // hai phiến cạnh nhau, mỗi phiến một sắc riêng; dz = chiều dài phiến
      const len = 2.7 - gap;
      for (const [o0, o1, k] of [
        [-hw + gap, -gap / 2, 1],
        [gap / 2, hw - gap, 0.94 + hash01(i, 11, 9103) * 0.1],
      ] as const) {
        quad(at(f, o0, 0, 0.1), at(f, o1, 0, 0.1), at(f, o1, len, 0.1), at(f, o0, len, 0.1), tone(k));
      }
      // bó vỉa hai bên
      for (const s of [-1, 1]) {
        const o0 = s * hw;
        const o1 = s * (hw + 0.7);
        quad(at(f, o0, 0, 0.22), at(f, o1, 0, 0.22), at(f, o1, 2.7, 0.22), at(f, o0, 2.7, 0.22), STONE_DARK);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardNodeMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh(geo, mat, 'ck-road');
  }

  /** Lan can hai bên đường: trụ có mũ cách ~4,5 m, thanh ngang nối trụ, cứ ba trụ một đèn lồng. */
  private buildRailings(): void {
    const b = new Builder();
    const lamps = new Builder();
    const off = CUU_KIEU_ROAD_HALF + 0.35;
    const frames = roadSamples(4.5);
    for (const side of [-1, 1]) {
      let prev: THREE.Vector3 | null = null;
      frames.forEach((f, i) => {
        // bỏ lan can ở lối vào cổng Kiều Đầu (12 m đầu) để người đi vào thoáng
        const nx = Math.cos(f.yaw) * off * side;
        const nz = -Math.sin(f.yaw) * off * side;
        const x = f.x + nx;
        const z = f.z + nz;
        const y = this.inp.heightAt(x, z);
        const p = new THREE.Vector3(x, y, z);
        if (i > 2) {
          b.box(0.55, 1.5, 0.55, x, y - 0.1, z, STONE, f.yaw);
          b.box(0.85, 0.22, 0.85, x, y + 1.4, z, STONE_DARK, f.yaw);
          if (i % 3 === 0) lamps.box(0.36, 0.5, 0.36, x, y + 1.62, z, LANTERN, f.yaw);
          if (prev) {
            const dx = x - prev.x;
            const dz = z - prev.z;
            const dy = y - prev.y;
            const L = Math.hypot(dx, dz);
            b.box(0.26, 0.28, L, (x + prev.x) / 2, (y + prev.y) / 2 + 0.86, (z + prev.z) / 2, Math.atan2(dx, dz), -Math.atan2(dy, L));
          }
        }
        prev = p;
      });
    }
    this.mesh(b.build(), solidMat(), 'ck-railings', true);
    this.mesh(lamps.build(), lampMat(), 'ck-road-lanterns');
  }

  /** Chuỗi chín nhịp cầu vòm nối nhau trên biển mây: mặt cầu võng, hai vòm, lan can, trụ chống xuống mây, đèn ở mỗi điểm hạ cánh. */
  private buildBridges(): void {
    const b = new Builder();
    const lamps = new Builder();
    const span = CUU_KIEU_SPAN;
    const W = 8.4;
    const N = 10;
    for (let k = 0; k < span.length; k++) {
      const [x, z, y] = span[k]!;
      // điểm hạ cánh: bệ tròn, trụ chống xuống biển mây
      b.cyl(10.5, 11, 2.6, 20, x, y - 2.5, z, STONE);
      b.cyl(5.6, 8.5, 150, 14, x, y - 152, z, STONE_DARK);
      b.cyl(11.2, 11.2, 0.5, 20, x, y - 0.4, z, STONE_DARK);
      // cổng đá ở điểm hạ cánh (hai trụ, xà, mái nhỏ): để chín nhịp đọc ra là chín cầu
      const gy =
        k + 1 < span.length ? Math.atan2(span[k + 1]![0] - x, span[k + 1]![1] - z) : Math.atan2(x - span[k - 1]![0], z - span[k - 1]![1]);
      if (k > 0 && k < span.length - 1) {
        for (const s of [-1, 1]) {
          const px = x + Math.cos(gy) * s * 5.2;
          const pz = z - Math.sin(gy) * s * 5.2;
          b.box(1.5, 9.5, 1.5, px, y, pz, STONE, gy);
          b.box(2.0, 0.6, 2.0, px, y + 9.5, pz, BRONZE, gy);
          lamps.box(0.55, 0.8, 0.55, px, y + 10.1, pz, LANTERN, gy);
        }
        b.box(12.4, 1.1, 1.8, x, y + 9.6, z, STONE, gy);
        b.roof(14.2, 4.4, 2.2, x, y + 10.7, z, ROOF, gy);
      }
    }
    for (let k = 1; k < span.length; k++) {
      const [ax, az, ay] = span[k - 1]!;
      const [bx, bz, by] = span[k]!;
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz);
      // lưng cầu cong như cầu đá vòm: độ cao lưng ~20% nhịp (6–18 m), vòm dưới đỡ vừa chạm đáy mặt cầu
      const HUMP = Math.min(18, Math.max(6, L * 0.2));
      const yaw = Math.atan2(dx, dz);
      const fx = dx / L;
      const fz = dz / L;
      const nx = fz;
      const nz = -fx;
      const pt = (t: number): { x: number; y: number; z: number } => ({
        x: ax + dx * t,
        z: az + dz * t,
        y: ay + (by - ay) * t + HUMP * Math.sin(Math.PI * t),
      });
      for (let i = 0; i < N; i++) {
        const p0 = pt(i / N);
        const p1 = pt((i + 1) / N);
        const sl = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const pitch = -Math.atan2(p1.y - p0.y, sl);
        const mx = (p0.x + p1.x) / 2;
        const mz = (p0.z + p1.z) / 2;
        const my = (p0.y + p1.y) / 2;
        b.box(W, 1.0, Math.hypot(sl, p1.y - p0.y) + 0.05, mx, my - 1.0, mz, STONE, yaw, pitch);
        for (const s of [-1, 1]) {
          const px = mx + nx * s * (W / 2 - 0.3);
          const pz = mz + nz * s * (W / 2 - 0.3);
          b.box(0.55, 1.1, Math.hypot(sl, p1.y - p0.y) + 0.05, px, my - 0.1, pz, STONE_DARK, yaw, pitch);
          if (i % 2 === 0) {
            b.box(0.8, 1.7, 0.8, px, p0.y - 0.5, pz, STONE, yaw);
            if (i % 4 === 0) lamps.box(0.4, 0.5, 0.4, px, p0.y + 1.25, pz, LANTERN, yaw);
          }
        }
      }
      // hai vòm đỡ mặt cầu, chân vòm chôn vào bệ hai đầu
      const mid = pt(0.5);
      for (const s of [-1, 1]) {
        b.arch(L / 2 - 1.2, HUMP + 1.2, 1.6, 1.7, mid.x + nx * s * 3.0, (ay + by) / 2 - 2.6, mid.z + nz * s * 3.0, STONE, yaw);
      }
      // thanh ngang giữa hai vòm
      b.box(W - 1.4, 0.8, 1.2, mid.x, mid.y - HUMP * 0.45, mid.z, STONE_DARK, yaw);
    }
    this.mesh(b.build(), solidMat(), 'ck-bridges', true);
    this.mesh(lamps.build(), lampMat(), 'ck-bridge-lanterns');
    // ánh sáng cuối chuỗi cầu: đĩa vàng nhạt phía chân trời, và hai chùm mờ
    const last = span[span.length - 1]!;
    const halo = new THREE.Mesh(this.own(new THREE.CircleGeometry(95, 40)), this.own(glowMat(0xffd9a0, 0.42)));
    halo.position.set(last[0], last[2] + 42, last[1] - 150);
    halo.name = 'ck-bridge-halo';
    this.group.add(halo);
  }

  /** Kiều Đầu: cổng vòm đá có mái ở đầu đường, đình hai tầng mái ngói với đèn lồng và hàng quán, rạp vải với lửa trại. */
  private buildHub(): void {
    const b = new Builder();
    const lamps = new Builder();
    const cloth = new Builder();
    const flames = new Builder();
    const H = (x: number, z: number) => this.inp.heightAt(x, z);
    const rot = (cx: number, cz: number, yaw: number, lx: number, lz: number): [number, number] => [
      cx + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      cz - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    ];

    // Cổng vòm đá: hai trụ, vòm, xà, mái ngói, hai đèn lồng treo
    {
      const g = CUU_KIEU_HUB.gate;
      const y0 = H(g.x, g.z);
      for (const s of [-1, 1]) {
        const [px, pz] = rot(g.x, g.z, g.yaw, s * 6.4, 0);
        b.box(2.8, 1.0, 2.8, px, y0 - 0.2, pz, STONE_DARK, g.yaw);
        b.box(2.2, 10.2, 2.2, px, y0 + 0.7, pz, STONE, g.yaw);
        b.box(2.9, 0.8, 2.9, px, y0 + 10.7, pz, BRONZE, g.yaw);
      }
      b.arch(5.4, 3.8, 1.2, 2.4, g.x, y0 + 8.1, g.z, STONE, g.yaw + Math.PI / 2);
      b.box(15.8, 1.3, 2.6, g.x, y0 + 11.3, g.z, STONE, g.yaw);
      b.roof(19.5, 7.2, 3.8, g.x, y0 + 12.5, g.z, ROOF, g.yaw);
      b.box(8, 0.5, 0.6, g.x, y0 + 16.2, g.z, BRONZE, g.yaw);
      for (const s of [-1, 1]) {
        const [lx, lz] = rot(g.x, g.z, g.yaw, s * 4.2, 0);
        b.box(0.1, 1.6, 0.1, lx, y0 + 9.4, lz, WOOD, g.yaw);
        lamps.box(0.8, 1.1, 0.8, lx, y0 + 8.3, lz, LANTERN, g.yaw);
      }
    }

    // Đình hai tầng
    {
      const p = CUU_KIEU_HUB.pavilion;
      const y0 = H(p.x, p.z);
      b.box(14.5, 0.8, 10.5, p.x, y0 - 0.2, p.z, STONE, p.yaw);
      b.box(13.2, 0.35, 9.2, p.x, y0 + 0.6, p.z, STONE_DARK, p.yaw);
      for (const [lx, lz] of [
        [-5.6, -3.6],
        [5.6, -3.6],
        [-5.6, 3.6],
        [5.6, 3.6],
      ] as const) {
        const [px, pz] = rot(p.x, p.z, p.yaw, lx, lz);
        b.cyl(0.42, 0.5, 6.0, 10, px, y0 + 0.9, pz, WOOD);
        b.box(1.1, 0.4, 1.1, px, y0 + 6.7, pz, BRONZE, p.yaw);
        lamps.box(0.6, 0.85, 0.6, px + Math.sign(lx) * 0.1, y0 + 5.2, pz + Math.sign(lz) * 0.9, LANTERN, p.yaw);
      }
      b.box(13.5, 0.7, 9.6, p.x, y0 + 7.0, p.z, WOOD, p.yaw);
      b.roof(18.5, 13.5, 3.4, p.x, y0 + 7.6, p.z, ROOF, p.yaw);
      b.box(9.8, 0.6, 6.2, p.x, y0 + 10.2, p.z, WOOD, p.yaw);
      b.roof(12.5, 8.5, 3.0, p.x, y0 + 10.7, p.z, ROOF, p.yaw);
      b.cyl(0.12, 0.2, 1.6, 6, p.x, y0 + 13.5, p.z, BRONZE);
      // quán: bàn, thùng, hũ
      const [tx, tz] = rot(p.x, p.z, p.yaw, 0, -1.2);
      b.box(4.2, 1.0, 1.4, tx, y0 + 0.95, tz, WOOD, p.yaw);
      for (const [lx, lz] of [
        [-3.4, 2.4],
        [-2.4, 2.6],
        [3.2, 2.2],
      ] as const) {
        const [bx, bz] = rot(p.x, p.z, p.yaw, lx, lz);
        b.cyl(0.6, 0.55, 1.2, 10, bx, y0 + 0.95, bz, WOOD);
      }
      // cột cờ nhỏ trước đình, cờ lụa
      const [fx, fz] = rot(p.x, p.z, p.yaw, 8.6, 5.4);
      b.cyl(0.1, 0.14, 6.5, 6, fx, H(fx, fz), fz, WOOD);
      cloth.box(0.05, 2.6, 1.5, fx, H(fx, fz) + 3.8, fz + 0.8, 0x7fb08c, p.yaw);
    }

    // Rạp vải + lửa trại
    {
      const t = CUU_KIEU_HUB.tent;
      const y0 = H(t.x, t.z);
      for (const [lx, lz] of [
        [-3.2, -2.4],
        [3.2, -2.4],
        [-3.2, 2.4],
        [3.2, 2.4],
      ] as const) {
        const [px, pz] = rot(t.x, t.z, t.yaw, lx, lz);
        b.cyl(0.12, 0.16, 3.6, 6, px, y0, pz, WOOD);
      }
      cloth.box(7.6, 0.12, 6.0, t.x, y0 + 3.5, t.z, CLOTH, t.yaw, 0.12);
      cloth.box(7.8, 0.9, 0.12, t.x, y0 + 2.7, rot(t.x, t.z, t.yaw, 0, 3.0)[1], CLOTH, t.yaw);
      const [cx, cz] = rot(t.x, t.z, t.yaw, -1.2, 0.4);
      b.box(1.6, 0.9, 1.1, cx, y0, cz, WOOD, t.yaw);
      b.box(1.2, 0.7, 1.2, cx + 1.7, y0, cz - 0.4, WOOD, t.yaw + 0.5);
      const [fx, fz] = rot(t.x, t.z, t.yaw, 1.8, -1.6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.box(0.14, 1.3, 0.14, fx + Math.cos(a) * 0.5, y0, fz + Math.sin(a) * 0.5, WOOD, a, 0.5);
      }
      b.cyl(0.55, 0.7, 0.4, 8, fx, y0, fz, STONE_DARK);
      flames.box(0.5, 0.9, 0.5, fx, y0 + 0.3, fz, 0xffb060, 0.7);
      lamps.box(0.4, 0.55, 0.4, t.x + 3.2, y0 + 2.7, rot(t.x, t.z, t.yaw, 0, 3.0)[1], LANTERN);
    }
    this.mesh(b.build(), solidMat(), 'ck-hub', true);
    this.mesh(
      cloth.build(),
      new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
      'ck-hub-cloth',
      true,
    );
    this.mesh(lamps.build(), lampMat(), 'ck-hub-lanterns');
    this.mesh(flames.build(), lampMat(), 'ck-hub-fire');
  }

  /** Cổ thụ và cây vừa: thân thon + tán dẹt nhiều cụm (một lưới có màu đỉnh, nhân bản theo tỉ lệ/xoay). */
  private buildTrees(): void {
    const b = new Builder();
    const m = new THREE.Matrix4();
    b.cyl(0.55, 1.15, 6.8, 9, 0, 0, 0, 0x4d3324);
    b.cyl(0.3, 0.55, 3.2, 7, 0.5, 5.6, 0.2, 0x4d3324);
    b.cyl(0.4, 0.8, 3.4, 7, -0.9, 4.8, -0.3, 0x4d3324);
    const clumps: [number, number, number, number, number][] = [
      [0, 9.0, 0, 5.8, 0x2c5733],
      [4.2, 8.0, 1.4, 4.4, 0x356538],
      [-4.0, 8.2, -1.8, 4.6, 0x2c5733],
      [1.0, 11.0, -2.8, 4.0, 0x3f7240],
      [-1.4, 10.8, 3.0, 3.8, 0x356538],
      [-5.6, 10.2, 2.4, 3.0, 0x3f7240],
      [5.4, 10.6, -2.0, 3.2, 0x4a7a44],
      [0.4, 12.4, 0.6, 3.0, 0x4a7a44],
    ];
    for (const [x, y, z, r, color] of clumps) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.62, r));
      b.add(g, color, m);
      g.dispose();
    }
    const geo = b.build();
    if (!geo || !CUU_KIEU_TREES.length) return;
    const mesh = new THREE.InstancedMesh(this.own(geo), this.own(solidMat()), CUU_KIEU_TREES.length);
    mesh.name = 'ck-trees';
    const o = new THREE.Object3D();
    const tint = new THREE.Color();
    CUU_KIEU_TREES.forEach(([x, z, s, yaw], i) => {
      o.position.set(x, this.inp.heightAt(x, z) - 0.3, z);
      o.rotation.set(0, yaw, 0);
      o.scale.setScalar(s * 0.95);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const v = 0.88 + hash01(i, 3, 9201) * 0.28;
      mesh.setColorAt(i, tint.setRGB(v, v * (0.96 + hash01(i, 5, 9203) * 0.1), v * 0.95));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** Cỏ lau trắng: từng bụi là vài chục thân mảnh nghiêng, đầu có bông trắng ngà xù (một lưới có màu đỉnh nhân bản). */
  private buildReeds(): void {
    const rb = new Builder();
    const m = new THREE.Matrix4();
    rb.box(0.09, 2.5, 0.09, 0, 0, 0, 0x8d8a62, 0, 0.05);
    const plume = new THREE.IcosahedronGeometry(1, 0); // 20 mặt: hàng nghìn ngọn nên phải rẻ
    m.compose(new THREE.Vector3(0.06, 2.55, 0), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.95, 0.2));
    rb.add(plume, 0xf4f0e0, m);
    m.compose(new THREE.Vector3(0.08, 2.1, 0), new THREE.Quaternion(), new THREE.Vector3(0.15, 0.55, 0.15));
    rb.add(plume, 0xdcd6bd, m);
    plume.dispose();
    const blade = rb.build();
    let total = 0;
    const counts = CUU_KIEU_REEDS.map(([, , r]) => {
      const n = Math.max(10, Math.round(r * r * 0.4));
      total += n;
      return n;
    });
    if (!blade || !total) return;
    const mesh = new THREE.InstancedMesh(this.own(blade), this.own(solidMat()), total);
    mesh.name = 'ck-reeds';
    const o = new THREE.Object3D();
    let k = 0;
    CUU_KIEU_REEDS.forEach(([cx, cz, r], pi) => {
      for (let i = 0; i < counts[pi]!; i++) {
        const a = hash01(pi, i, 9301) * Math.PI * 2;
        const d = Math.sqrt(hash01(pi, i, 9303)) * r;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        o.position.set(x, this.inp.heightAt(x, z) - 0.05, z);
        o.rotation.set((hash01(pi, i, 9307) - 0.5) * 0.4, hash01(pi, i, 9311) * Math.PI * 2, (hash01(pi, i, 9313) - 0.5) * 0.4);
        const sc = 0.75 + hash01(pi, i, 9317) * 0.7;
        o.scale.set(1, sc, 1);
        o.updateMatrix();
        mesh.setMatrixAt(k++, o.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  /** Thác nước: dải mỏng bám sườn vách từ rìa cao nguyên xuống biển mây, vệt sáng chạy xuống. */
  private buildFalls(): void {
    const C = 1024; // tâm bản đồ (size 2048)
    const plateau = this.inp.heightAt(C, C);
    const angles = [28, 98, 158, 214, 322].map((d) => (d * Math.PI) / 180);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const v = uv();
    const stripes = sin(v.y.mul(48).sub(time.mul(7)))
      .mul(0.5)
      .add(0.5);
    const sheet = smoothstep(float(0), float(0.28), v.x).mul(smoothstep(float(1), float(0.72), v.x));
    const fadeTop = smoothstep(float(0), float(0.05), v.y);
    const fadeBot = smoothstep(float(1), float(0.6), v.y);
    mat.colorNode = mix(vec3(0.82, 0.93, 0.98), vec3(1, 1, 1), stripes);
    mat.opacityNode = clamp(sheet.mul(fadeTop).mul(fadeBot).mul(stripes.mul(0.4).add(0.58)), 0, 1);
    this.own(mat);
    for (const a of angles) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let d0 = 540;
      for (; d0 < 880; d0 += 2) if (this.inp.heightAt(C + dx * d0, C + dz * d0) < plateau - 45) break;
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      const hw = 5.8;
      const rows = 30;
      for (let r = 0; r <= rows; r++) {
        const d = d0 - 4 + r * 4.4;
        const x = C + dx * d;
        const z = C + dz * d;
        const y = this.inp.heightAt(x, z) + 0.7;
        for (const s of [-1, 1]) {
          pos.push(x + -dz * hw * s, y, z + dx * hw * s);
          uvs.push(s < 0 ? 0 : 1, r / rows);
        }
        if (r < rows) {
          const i = r * 2;
          idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(this.own(g), mat);
      m.name = 'ck-fall';
      m.renderOrder = 2;
      this.group.add(m);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose?.();
  }
}
