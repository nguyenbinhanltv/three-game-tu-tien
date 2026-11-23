import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  float,
  length,
  luminance,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  sin,
  texture,
  time,
  triplanarTexture,
  uv,
  vertexColor,
  vec2,
  vec3,
} from 'three/tsl';
import {
  CUU_KIEU_HUB,
  CUU_KIEU_RAIL,
  CUU_KIEU_REEDS,
  CUU_KIEU_ROAD,
  CUU_KIEU_ROAD_HALF,
  CUU_KIEU_ROCKS,
  CUU_KIEU_SPAN,
  CUU_KIEU_TREES,
  fbm,
  hash01,
} from '@dtl/shared';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markBloom } from '../../render/post';
import { withSightFade } from './occlusion';

/**
 * Kiến trúc và cảnh quan Thiên Lộ Giới (TN-7, mỹ thuật), dựng bằng code, không asset ngoài, chỉ để nhìn:
 *  - **Con đường lát đá** uốn từ cổng Kiều Đầu lên Bậc Cuối (phiến đá ấm, bó vỉa) và **lan can** hai bên (trụ, thanh ngang, đèn lồng; có va chạm ở `terrain.colliders`: vòng ở mỗi trụ + hai vòng trung gian dọc thanh ngang (khe ~0,4 m < thân người chơi), chừa lối băng ngang, xem `CUU_KIEU_RAIL`);
 *  - **Chuỗi chín nhịp cầu vòm đá cổ** trên biển mây: vòm xây bằng khối đá dày màu ấm, rêu ở chân, tường bụng cầu, mặt cầu dày, lan can khối, mố trụ lớn, cổng đá;
 *  - **Kiều Đầu**: cổng vòm đá có mái, đình hai tầng mái ngói, rạp vải với lửa trại, đèn lồng;
 *  - **Cổ thụ** tán nhiều lớp bất đều, cây vừa, **đá tảng** rêu phủ, **cỏ lau trắng**, cỏ chân và hoa nhỏ, **thác nước** rộng có bọt ở chân.
 * Dữ liệu vị trí từ `cuukieu.art.ts` (sinh bởi `tools/maps/gen-cuu_kieu.mjs`). Khoảng 20 draw call.
 */

export interface CkWondersInput {
  heightAt(x: number, z: number): number;
  /** Cao độ lớp biển mây thấp nhất (`TerrainDef.seaY`). */
  seaY: number;
}

const STONE = 0xb4a688;
const STONE_LIGHT = 0xc6b99c;
const STONE_DARK = 0x8a7d66;
const MOSS = 0x5f7040;
const WOOD = 0x5a3a28;
const BARK = 0x3e2d20;
const ROOF = 0x2e4d49;
const BRONZE = 0xa07c42;
const CLOTH = 0xe9e0c8;
const LANTERN = 0xffa24a;

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
/** Pha hai màu (số hex) theo t ∈ [0,1]. */
function lerpHex(a: number, b: number, t: number): number {
  return tmpA
    .set(a)
    .lerp(tmpB.set(b), Math.min(1, Math.max(0, t)))
    .getHex();
}
/** Nhân sáng/tối một màu hex. */
function shade(a: number, k: number): number {
  return tmpA.set(a).multiplyScalar(k).getHex();
}

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

  /**
   * Khối cầu thấp bất đều (tán cây, đá): đỉnh lệch theo nhiễu băm theo vị trí (đỉnh trùng vị trí lệch như nhau nên không nứt), pháp tuyến tính lại (mặt phẳng nhỏ),
   * màu: `color` ở thân, ngả `top` ở mặt hướng lên (rêu, lá sáng), tối hơn ở đáy.
   */
  blob(
    r: number,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    color: number,
    top: number,
    amp: number,
    seed: number,
    yaw = 0,
  ): void {
    const g0 = new THREE.IcosahedronGeometry(1, 1);
    g0.deleteAttribute('normal');
    g0.deleteAttribute('uv');
    const gi = mergeVertices(g0, 1e-4); // gộp đỉnh trùng để pháp tuyến mượt (tán lá tròn trịa, không 'mặt phẳng nhỏ')
    g0.dispose();
    const p = gi.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const h = Math.sin(p.getX(i) * 12.9898 + p.getY(i) * 78.233 + p.getZ(i) * 37.719 + seed * 9.31) * 43758.5453;
      const k = 1 + amp * (h - Math.floor(h) - 0.5);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    gi.computeVertexNormals();
    const g = gi.toNonIndexed();
    gi.dispose();
    this.m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(r * sx, r * sy, r * sz),
    );
    this.nm.getNormalMatrix(this.m);
    const na = g.getAttribute('normal');
    const pg = g.getAttribute('position');
    for (let i = 0; i < pg.count; i++) {
      this.v.set(pg.getX(i), pg.getY(i), pg.getZ(i)).applyMatrix4(this.m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(this.nm).normalize();
      this.nrm.push(this.v.x, this.v.y, this.v.z);
      const up = Math.min(1, Math.max(0, this.v.y * 1.4 - 0.1));
      const down = Math.min(1, Math.max(0, -this.v.y));
      this.c.set(lerpHex(color, top, up));
      this.c.multiplyScalar(1 - down * 0.35);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    g.dispose();
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
   * Cung vòm xây bằng khối đá: nửa elip trong mặt phẳng đứng chứa hướng `yaw` (rad quanh y, 0 = +z), bán kính dọc hướng `rx` × đứng `ry`, ghép từ `n` phiến hộp
   * dày `thick` (hướng kính) × rộng `depth` (ngang), mỗi phiến một sắc đá riêng, ngả rêu ở chân vòm; tâm elip ở (x, y, z), chân vòm ở độ cao `y`.
   */
  arch(rx: number, ry: number, thick: number, depth: number, x: number, y: number, z: number, yaw: number, n = 18, seed = 0): void {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let prev: [number, number] | null = null;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      const u = Math.cos(a) * rx;
      const v = Math.sin(a) * ry;
      if (prev) {
        const du = u - prev[0];
        const dv = v - prev[1];
        const len = Math.hypot(du, dv);
        const foot = Math.max(0, 1 - Math.min(i, n - i + 1) / (n * 0.28));
        let col = shade(STONE, 0.88 + hash01(i, seed, 7101) * 0.26);
        col = lerpHex(col, MOSS, foot * 0.55 + hash01(i, seed, 7103) * 0.12);
        // phiến khóa và phiến dày xen kẽ: lồi nhẹ ra ngoài
        const t2 = thick + (i % 2 ? 0.35 : 0);
        this.box(
          depth,
          t2,
          len + 0.1,
          x + fx * ((u + prev[0]) / 2),
          y + (v + prev[1]) / 2 - t2 / 2,
          z + fz * ((u + prev[0]) / 2),
          col,
          yaw,
          -Math.atan2(dv, du),
        );
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
  return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.03 });
}

/** Ba texture Codex của Thiên Lộ Giới (đá xây, thẻ lá RGBA, nước chảy), nạp từ `public/terrain-ck/` (xem `terrain-textures.ts --set ck`). */
export interface CkTex {
  masonry: THREE.Texture;
  leaf: THREE.Texture;
  water: THREE.Texture;
}

/** Đá xây: texture Codex chiếu triplanar theo tọa độ thế giới (không cần UV), nhân màu đỉnh (sắc từng khối đá, rêu ở chân). */
function stoneMat(tex: CkTex | null): THREE.MeshStandardNodeMaterial {
  if (!tex) return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 });
  // texture Codex ngả cam và màu đỉnh cũng ấm: nhân thẳng sẽ ra đồng đỏ. Khử bão hòa texture (~50%) và màu đỉnh (~65%), chỉ giữ độ sáng từng khối đá/rêu.
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0.02 });
  const c = triplanarTexture(texture(tex.masonry), null, null, float(0.11), positionWorld, normalWorld).rgb;
  const vc = vertexColor();
  m.colorNode = mix(vec3(luminance(c)), c, 0.5)
    .mul(mix(vec3(luminance(vc)), vc, 0.35))
    .mul(1.78);
  return m;
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

  private disposed = false;

  constructor(private readonly inp: CkWondersInput) {
    this.group.name = 'ck-wonders';
    // Phần không cần texture dựng ngay; cầu, lan can, cây, thác chờ texture Codex (lỗi tải thì dựng bằng vật liệu màu đỉnh).
    this.buildRoad();
    this.buildHub();
    this.buildRocks();
    this.buildReeds();
    this.buildGroundCover();
    void this.loadTextures().then((tex) => {
      if (this.disposed) {
        if (tex) for (const t of Object.values(tex)) t.dispose();
        return;
      }
      if (tex) this.disposables.push(...Object.values(tex));
      this.buildRailings(tex);
      this.buildBridges(tex);
      this.buildTrees(tex);
      this.buildFalls(tex);
    });
  }

  /** Nạp ba texture từ `terrain-ck/manifest.json` (mục `extras`); null nếu thiếu/lỗi. */
  private async loadTextures(): Promise<CkTex | null> {
    try {
      const base = `${import.meta.env.BASE_URL}terrain-ck/`;
      const man = (await (await fetch(`${base}manifest.json`)).json()) as { extras?: Record<string, string> };
      const ex = man.extras;
      if (!ex?.masonry || !ex.leaf || !ex.water) return null;
      const loader = new THREE.TextureLoader();
      const load = async (name: string, wrap: boolean): Promise<THREE.Texture> => {
        const t = await loader.loadAsync(`${base}${name}`);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      };
      const [masonry, leaf, water] = await Promise.all([load(ex.masonry, true), load(ex.leaf, false), load(ex.water, true)]);
      return { masonry, leaf, water };
    } catch {
      return null;
    }
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
    /** Tứ giác p00-p10-p11-p01 (hai tam giác), mặt hướng lên. */
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
      const len = 2.7 - gap;
      for (const [o0, o1] of [
        [-hw + gap, -gap / 2],
        [gap / 2, hw - gap],
      ] as const) {
        const base = 0.82 + hash01(i, o0 < 0 ? 1 : 2, 9101) * 0.3;
        // phiến đá ấm, thỉnh thoảng ngả rêu ở mép
        const mossy = hash01(i, o0 < 0 ? 3 : 4, 9107) > 0.82 ? 0.35 : 0;
        quad(
          at(f, o0, 0, 0.1),
          at(f, o1, 0, 0.1),
          at(f, o1, len, 0.1),
          at(f, o0, len, 0.1),
          lerpHex(shade(STONE_LIGHT, base), MOSS, mossy),
        );
      }
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
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh(geo, mat, 'ck-road');
  }

  /** Lan can hai bên đường: trụ có mũ, thanh ngang nối trụ, cứ ba trụ một đèn lồng. Khung "mở" của `CUU_KIEU_RAIL` là lối băng ngang (không trụ, không va chạm). */
  private buildRailings(tex: CkTex | null): void {
    const b = new Builder();
    const lamps = new Builder();
    const off = CUU_KIEU_ROAD_HALF + 0.35;
    for (const side of [-1, 1]) {
      let prev: THREE.Vector3 | null = null;
      CUU_KIEU_RAIL.forEach(([fx, fz, yaw, open], i) => {
        if (open) {
          prev = null;
          return;
        }
        const x = fx + Math.cos(yaw) * off * side;
        const z = fz - Math.sin(yaw) * off * side;
        const y = this.inp.heightAt(x, z);
        const p = new THREE.Vector3(x, y, z);
        const k = 0.88 + hash01(i, side, 9401) * 0.22;
        b.box(0.62, 1.55, 0.62, x, y - 0.1, z, shade(STONE, k), yaw);
        b.box(0.92, 0.24, 0.92, x, y + 1.45, z, shade(STONE_DARK, k), yaw);
        if (i % 3 === 0) lamps.box(0.36, 0.5, 0.36, x, y + 1.7, z, LANTERN, yaw);
        if (prev) {
          const dx = x - prev.x;
          const dz = z - prev.z;
          const dy = y - prev.y;
          const L = Math.hypot(dx, dz);
          b.box(
            0.3,
            0.3,
            L,
            (x + prev.x) / 2,
            (y + prev.y) / 2 + 0.86,
            (z + prev.z) / 2,
            shade(STONE, k * 0.95),
            Math.atan2(dx, dz),
            -Math.atan2(dy, L),
          );
        }
        prev = p;
      });
    }
    this.mesh(b.build(), stoneMat(tex), 'ck-railings', true);
    this.mesh(lamps.build(), lampMat(), 'ck-road-lanterns');
  }

  /**
   * Chuỗi chín nhịp cầu vòm đá cổ trên biển mây. Mỗi nhịp: mặt cầu dày (võng lưng), lan can khối, hai vòm xây bằng khối đá dày ngả rêu ở chân, tường bụng cầu
   * (chân tường theo vòm, đỉnh theo đáy mặt cầu), mố trụ lớn chống xuống mây, cổng đá có mái ở mỗi điểm hạ cánh. Điểm đầu nối đúng cuối đường (độ cao theo địa hình).
   */
  private buildBridges(tex: CkTex | null): void {
    const b = new Builder();
    const lamps = new Builder();
    const span = CUU_KIEU_SPAN;
    const [x0, z0, y0raw] = span[0]!;
    // dời cả chuỗi để nhịp đầu chạm đúng mặt đất ở cuối đường
    const dy = this.inp.heightAt(x0, z0) + 0.45 - y0raw;
    const SP = span.map(([x, z, y]) => [x, z, y + dy] as const);
    const W = 9.6;
    const DECK_T = 2.8;
    const N = 8;
    // điểm hạ cánh: bệ tròn dày, vòng rêu, mố trụ lớn, cổng đá
    SP.forEach(([x, z, y], k) => {
      // mố trụ VUÔNG xây bậc (rõ ở cự ly trung, không còn tròn như cột La Mã): bệ vuông có gờ, thân gồm tám tầng đá thon dần xuống, mỗi tầng có gờ nhô,
      // vết rêu/ố tối chảy dọc bốn mặt. Mặt trụ xoay theo hướng cầu để thẳng hàng với vòm.
      const ny = k + 1 < SP.length ? Math.atan2(SP[k + 1]![0] - x, SP[k + 1]![1] - z) : Math.atan2(x - SP[k - 1]![0], z - SP[k - 1]![1]);
      b.box(26, 1.6, 26, x, y - 9.6, z, shade(STONE, 0.78), ny);
      b.box(21, 1.8, 21, x, y - 8.0, z, shade(STONE, 0.86), ny);
      b.box(25, 3.4, 25, x, y - 3.2, z, shade(STONE, 0.95), ny);
      b.box(27.2, 0.9, 27.2, x, y - 0.5, z, lerpHex(STONE_DARK, MOSS, 0.4), ny); // gờ bệ
      for (let c = 0; c < 8; c++) {
        const w = 16 + c * 1.1;
        const top = y - 3.6 - c * 19.5;
        b.box(w, 19.5, w, x, top - 19.5, z, shade(STONE, 0.86 - c * 0.012), ny);
        b.box(w + 1.7, 1.1, w + 1.7, x, top - 1.1, z, lerpHex(STONE_DARK, MOSS, 0.3 + (c % 3) * 0.1), ny); // gờ nhô cuối mỗi tầng
        // vết rêu/ố tối chảy dọc mặt từng tầng (dải mỏng nổi 0,2 m cạnh mặt, vị trí/độ dài ngẫu nhiên theo tầng và mặt)
        for (let f = 0; f < 4; f++) {
          for (let q = 0; q < 2; q++) {
            if (hash01(k * 8 + c, f * 2 + q, 7609) < 0.45) continue;
            const ang = ny + (f * Math.PI) / 2;
            const lat = (hash01(k * 8 + c, f * 2 + q, 7611) - 0.5) * (w - 3);
            const len = 7 + hash01(k * 8 + c, f * 2 + q, 7613) * 12;
            const px = x + Math.sin(ang) * (w / 2 + 0.2) + Math.cos(ang) * lat;
            const pz = z + Math.cos(ang) * (w / 2 + 0.2) - Math.sin(ang) * lat;
            b.box(1.4 + hash01(k * 8 + c, f, 7615) * 2.4, len, 0.45, px, top - 1.4 - len, pz, lerpHex(MOSS, 0x2c3a24, 0.5), ang);
          }
        }
      }
      if (k > 0 && k < SP.length - 1) {
        const nx = SP[k + 1]![0] - x;
        const nz = SP[k + 1]![1] - z;
        const gy = Math.atan2(nx, nz);
        for (const s of [-1, 1]) {
          const px = x + Math.cos(gy) * s * 5.6;
          const pz = z - Math.sin(gy) * s * 5.6;
          b.box(1.9, 10.5, 1.9, px, y, pz, shade(STONE, 0.95), gy);
          b.box(2.5, 0.8, 2.5, px, y + 10.5, pz, STONE_DARK, gy);
          b.box(1.5, 0.5, 1.5, px, y + 11.3, pz, BRONZE, gy);
          lamps.box(0.6, 0.85, 0.6, px, y + 11.8, pz, LANTERN, gy);
        }
        b.box(13.6, 1.3, 2.2, x, y + 10.6, z, STONE, gy);
        b.roof(15.4, 5.2, 2.6, x, y + 11.9, z, ROOF, gy);
      }
    });
    for (let k = 1; k < SP.length; k++) {
      const [ax, az, ay] = SP[k - 1]!;
      const [bx, bz, by] = SP[k]!;
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz);
      const HUMP = Math.min(18, Math.max(6, L * 0.2));
      const yaw = Math.atan2(dx, dz);
      const fx = dx / L;
      const fz = dz / L;
      const nx = fz;
      const nz = -fx;
      /** Mặt trên của mặt cầu tại t. */
      const top = (t: number): { x: number; y: number; z: number } => ({
        x: ax + dx * t,
        z: az + dz * t,
        y: ay + (by - ay) * t + HUMP * Math.sin(Math.PI * t),
      });
      for (let i = 0; i < N; i++) {
        const p0 = top(i / N);
        const p1 = top((i + 1) / N);
        const sl = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const len = Math.hypot(sl, p1.y - p0.y) + 0.06;
        const pitch = -Math.atan2(p1.y - p0.y, sl);
        const mx = (p0.x + p1.x) / 2;
        const mz = (p0.z + p1.z) / 2;
        const my = (p0.y + p1.y) / 2;
        const kk = 0.9 + hash01(i, k, 7201) * 0.2;
        b.box(W, DECK_T, len, mx, my - DECK_T, mz, shade(STONE, kk), yaw, pitch);
        b.box(W - 1.6, 0.3, len, mx, my - 0.25, mz, shade(STONE_LIGHT, kk), yaw, pitch); // mặt lát
        for (const s of [-1, 1]) {
          const px = mx + nx * s * (W / 2 - 0.55);
          const pz = mz + nz * s * (W / 2 - 0.55);
          b.box(1.1, 1.5, len, px, my - 0.1, pz, shade(STONE_DARK, kk), yaw, pitch);
          b.box(1.5, 0.28, len * 0.98, px, my + 1.4, pz, shade(STONE, kk * 1.05), yaw, pitch);
          if (i % 2 === 0) {
            b.box(1.7, 2.3, 1.7, px, p0.y - 0.35, pz, shade(STONE, kk), yaw);
            if (i % 4 === 0) lamps.box(0.45, 0.6, 0.45, px, p0.y + 2.0, pz, LANTERN, yaw);
          }
        }
      }
      // vòm đôi xây bằng khối đá dày; đỉnh vòm chạm đáy mặt cầu ở giữa nhịp
      const rx = L / 2 - 1.2;
      const ry = HUMP * 1.02;
      const thick = 3.0;
      const mid = top(0.5);
      const baseY = mid.y - DECK_T + 0.35 - ry - thick / 2;
      for (const s of [-1, 1]) {
        b.arch(rx, ry, thick, 3.6, mid.x + nx * s * (W / 2 - 2.0), baseY, mid.z + nz * s * (W / 2 - 2.0), yaw, 18, k * 2 + (s > 0 ? 1 : 0));
      }
      // tường bụng cầu (spandrel): khối đá lấp giữa vòm và mặt cầu, chân theo vòm
      const M = 14;
      for (let i = 0; i < M; i++) {
        const t = (i + 0.5) / M;
        const u = (t - 0.5) * 2 * rx;
        const archTop = baseY + ry * Math.sqrt(Math.max(0, 1 - (u / rx) ** 2)) + thick / 2;
        const deckBottom = top(t).y - DECK_T;
        const h = deckBottom - archTop + 0.5;
        if (h < 0.4) continue;
        const p = top(t);
        for (const s of [-1, 1]) {
          const col = lerpHex(shade(STONE, 0.8 + hash01(i, k * 3 + (s > 0 ? 1 : 0), 7207) * 0.3), MOSS, hash01(i, k, 7209) * 0.35);
          b.box(L / M + 0.2, h, 2.4, p.x + nx * s * (W / 2 - 1.4), archTop - 0.25, p.z + nz * s * (W / 2 - 1.4), col, yaw);
        }
      }
      // thanh giằng giữa hai vòm
      b.box(W - 3.2, 0.9, 1.4, mid.x, baseY + ry - 0.5, mid.z, STONE_DARK, yaw);
    }
    this.mesh(b.build(), stoneMat(tex), 'ck-bridges', true);
    this.mesh(lamps.build(), lampMat(), 'ck-bridge-lanterns');
    // ánh sáng cuối chuỗi cầu: đĩa vàng nhạt phía chân trời
    const last = SP[SP.length - 1]!;
    const halo = new THREE.Mesh(this.own(new THREE.CircleGeometry(95, 40)), this.own(glowMat(0xffd9a0, 0.34)));
    halo.position.set(last[0] + 60, last[2] + 46, last[1] - 130);
    halo.rotation.y = Math.atan2(last[0] + 60 - 1024, last[1] - 130 - 1024) + Math.PI;
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

    // Cổng vòm đá: hai trụ, vòm xây khối, xà, mái ngói, hai đèn lồng treo
    {
      const g = CUU_KIEU_HUB.gate;
      const y0 = H(g.x, g.z);
      for (const s of [-1, 1]) {
        const [px, pz] = rot(g.x, g.z, g.yaw, s * 6.4, 0);
        b.box(3.0, 1.1, 3.0, px, y0 - 0.2, pz, STONE_DARK, g.yaw);
        b.box(2.3, 10.2, 2.3, px, y0 + 0.8, pz, shade(STONE, 0.95), g.yaw);
        b.box(3.0, 0.8, 3.0, px, y0 + 10.8, pz, BRONZE, g.yaw);
      }
      b.arch(5.4, 3.8, 1.3, 2.6, g.x, y0 + 8.1, g.z, g.yaw + Math.PI / 2, 14, 99);
      b.box(15.8, 1.3, 2.8, g.x, y0 + 11.4, g.z, STONE, g.yaw);
      b.roof(19.5, 7.4, 3.8, g.x, y0 + 12.6, g.z, ROOF, g.yaw);
      b.box(8, 0.5, 0.6, g.x, y0 + 16.3, g.z, BRONZE, g.yaw);
      for (const s of [-1, 1]) {
        const [lx, lz] = rot(g.x, g.z, g.yaw, s * 4.2, 0);
        b.box(0.1, 1.6, 0.1, lx, y0 + 9.5, lz, WOOD, g.yaw);
        lamps.box(0.8, 1.1, 0.8, lx, y0 + 8.4, lz, LANTERN, g.yaw);
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
    this.mesh(b.build(), withSightFade(solidMat()), 'ck-hub', true); // camera chéo: tòa Kiều Đầu mờ khi che người
    this.mesh(
      cloth.build(),
      withSightFade(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })),
      'ck-hub-cloth',
      true,
    );
    this.mesh(lamps.build(), lampMat(), 'ck-hub-lanterns');
    this.mesh(flames.build(), lampMat(), 'ck-hub-fire');
  }

  /**
   * Cây: thân dày cong, gốc xòe, ba cành lớn (lưới có màu đỉnh) + lõi tán sẫm (sáu khối nhỏ) + các thẻ lá có alpha (texture tán lá Codex) gắn quanh khung tán,
   * nên mép tán là mép lá thật thay vì khối cầu bóng. Thẻ lá nhân bản theo cây (một lưới riêng). Cổ thụ (tỉ lệ ≥ 1,6) to gấp đôi cây vừa.
   * Không có texture (lỗi tải): lõi tán dùng khối lớn hơn.
   */
  private buildTrees(tex: CkTex | null): void {
    const b = new Builder();
    b.cyl(1.7, 2.3, 1.4, 9, 0, -0.2, 0, BARK);
    const seg: [number, number, number, number][] = [
      [1.25, 1.55, 2.4, 1.4],
      [1.05, 1.25, 2.2, 3.7],
      [0.85, 1.05, 2.0, 5.8],
      [0.6, 0.85, 1.9, 7.6],
    ];
    seg.forEach(([rt, rb, h, y], i) => b.cyl(rt, rb, h, 8, 0.28 * i + 0.1 * i * i * 0.2, y, 0.12 * i, shade(BARK, 1 + i * 0.04)));
    for (const [bx, bz, tilt, yaw] of [
      [0.9, 0.2, 0.9, 0.4],
      [-0.7, 0.9, 0.85, 2.6],
      [-0.2, -1.0, 0.8, 4.4],
    ] as const)
      b.box(0.55, 5.4, 0.55, bx + 0.7, 6.3, bz, BARK, yaw, tilt);
    // lõi tán (sẫm, che phần nhìn xuyên giữa các thẻ lá)
    const clumps: [number, number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const tier = i % 3;
      const ang = i * 2.399;
      const rad = 2.2 + (i % 5) * 1.25 + tier * 0.35;
      clumps.push([
        Math.cos(ang) * rad,
        8.2 + tier * 1.9 + (i % 4) * 0.45,
        Math.sin(ang) * rad,
        2.5 + hash01(i, 3, 7301) * 2.1 - tier * 0.25,
      ]);
    }
    const coreK = tex ? 0.55 : 1;
    const pal = [0x1c3a24, 0x23442a, 0x2a4b2c, 0x30522d, 0x274628];
    clumps.forEach(([x, y, z, size], i) => {
      if (tex && i % 2 === 1) return; // có thẻ lá: chỉ giữ nửa số khối lõi
      b.blob(size * coreK, 1.15, 0.66, 1.05, x, y, z, pal[i % pal.length]!, 0x4d6a34, 0.5, i, i);
    });
    const geo = b.build();
    if (!geo || !CUU_KIEU_TREES.length) return;
    const n = CUU_KIEU_TREES.length;
    const place = (mesh: THREE.InstancedMesh): void => {
      const o = new THREE.Object3D();
      const tint = new THREE.Color();
      CUU_KIEU_TREES.forEach(([x, z, s, yaw], i) => {
        o.position.set(x, this.inp.heightAt(x, z) - 0.4, z);
        o.rotation.set(0, yaw, 0);
        o.scale.set(s * 0.82, s * (0.8 + hash01(i, 7, 7307) * 0.2), s * 0.82);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        const v = 0.78 + hash01(i, 3, 9201) * 0.32;
        mesh.setColorAt(i, tint.setRGB(v, v * (0.94 + hash01(i, 5, 9203) * 0.1), v * 0.9));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const trunk = new THREE.InstancedMesh(this.own(geo), this.own(withSightFade(solidMat())), n);
    trunk.name = 'ck-trees';
    trunk.castShadow = true;
    place(trunk);
    if (!tex) return;
    // thẻ lá: bốn thẻ quanh mỗi cụm tán, hướng ra ngoài + hơi lên, quay ngẫu nhiên; pháp tuyến hướng ra ngoài (sáng đều như tán cây)
    const pos: number[] = [];
    const nrm: number[] = [];
    const uvs: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    let vi = 0;
    clumps.forEach(([cx, cy, cz, size], ci) => {
      for (let k = 0; k < 5; k++) {
        const a = hash01(ci, k, 7501) * Math.PI * 2;
        const el = (hash01(ci, k, 7503) - 0.25) * 1.6;
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
        const centre = new THREE.Vector3(cx, cy, cz).addScaledVector(dir, size * 0.85);
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        if (right.lengthSq() < 0.01) right.set(1, 0, 0);
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();
        const roll = hash01(ci, k, 7505) * Math.PI * 2;
        const half = 2.5 + hash01(ci, k, 7507) * 1.6;
        const r2 = right.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
        const u2 = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));
        const v = 0.7 + hash01(ci, k, 7509) * 0.5;
        c.setRGB(v * 0.95, v, v * 0.9);
        for (const [sx, sy, su, sv] of [
          [-1, -1, 0, 0],
          [1, -1, 1, 0],
          [1, 1, 1, 1],
          [-1, 1, 0, 1],
        ] as const) {
          const p = centre
            .clone()
            .addScaledVector(r2, sx * half)
            .addScaledVector(u2, sy * half);
          pos.push(p.x, p.y, p.z);
          nrm.push(dir.x, dir.y * 0.6 + 0.4, dir.z);
          uvs.push(su, sv);
          col.push(c.r, c.g, c.b);
        }
        idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        vi += 4;
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lg.setIndex(idx);
    lg.computeBoundingSphere();
    const lm = withSightFade(
      new THREE.MeshStandardNodeMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        alphaTest: 0.45,
      }),
    );
    const lt = texture(tex.leaf);
    lm.colorNode = lt.rgb;
    lm.opacityNode = lt.a;
    const leaves = new THREE.InstancedMesh(this.own(lg), this.own(lm), n);
    leaves.name = 'ck-leaves';
    place(leaves);
  }

  /** Đá tảng: khối bất đều, đá xám xanh, rêu phủ mặt trên; va chạm ở `terrain.colliders` (~1,25 × tỉ lệ). */
  private buildRocks(): void {
    const b = new Builder();
    b.blob(1.7, 1.1, 0.72, 0.95, 0, 0.5, 0, 0x6f776a, 0x4f6a3a, 0.7, 11);
    b.blob(1.0, 1.0, 0.8, 0.9, 1.5, 0.2, 0.7, 0x77806f, 0x56703d, 0.7, 17);
    b.blob(0.75, 1.0, 0.8, 1.0, -1.3, 0.1, -0.8, 0x6a7266, 0x4c6637, 0.7, 23);
    const geo = b.build();
    if (!geo || !CUU_KIEU_ROCKS.length) return;
    const mesh = new THREE.InstancedMesh(this.own(geo), this.own(solidMat()), CUU_KIEU_ROCKS.length);
    mesh.name = 'ck-rocks';
    const o = new THREE.Object3D();
    const tint = new THREE.Color();
    CUU_KIEU_ROCKS.forEach(([x, z, s, yaw], i) => {
      o.position.set(x, this.inp.heightAt(x, z) - 0.25 * s, z);
      o.rotation.set(0, yaw, 0);
      o.scale.setScalar(s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const v = 0.82 + hash01(i, 9, 7401) * 0.3;
      mesh.setColorAt(i, tint.setRGB(v, v, v * 0.97));
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
      const n = Math.max(8, Math.round(r * r * 0.28));
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
        o.scale.set(1, 0.75 + hash01(pi, i, 9317) * 0.7, 1);
        o.updateMatrix();
        mesh.setMatrixAt(k++, o.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  /**
   * Phủ đất tầm trung: chùm cỏ cao 0,8–1,9 m trải đều trên cao nguyên (lưới 11 m lệch ngẫu nhiên, mật độ theo nhiễu: dày ở vùng ẩm, thưa ở mảng đất khô), tránh đường/rìa/dốc;
   * và các đốm hoa nhỏ (trắng, vàng nhạt, tím, hồng) thành cụm. Hai lưới nhân bản, không va chạm.
   */
  private buildGroundCover(): void {
    const C = 1024;
    const tuft = new Builder();
    const m = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(0.085, 1.1, 3, 1, true);
      g.translate(0, 0.55, 0);
      const a = (i / 5) * Math.PI * 2 + i * 0.5;
      m.compose(
        new THREE.Vector3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.34, a, Math.cos(a) * 0.34)),
        new THREE.Vector3(1, 0.65 + 0.2 * (i % 3), 1),
      );
      tuft.add(g, lerpHex(0x3f4d24, 0x8a8a4c, 0.15 + 0.17 * i), m);
      g.dispose();
    }
    const tg = tuft.build();
    const pts: [number, number, number, number][] = [];
    const STEP = 9;
    for (let gx = -600; gx <= 600; gx += STEP) {
      for (let gz = -600; gz <= 600; gz += STEP) {
        const x = C + gx + (hash01(gx, gz, 8101) - 0.5) * STEP;
        const z = C + gz + (hash01(gx, gz, 8103) - 0.5) * STEP;
        if (Math.max(Math.abs(x - C), Math.abs(z - C)) > 640) continue;
        const dens = 0.55 + fbm(x * 0.012, z * 0.012, 2, 4141) * 1.1;
        if (hash01(gx, gz, 8105) > dens) continue;
        const h = this.inp.heightAt(x, z);
        if (h < this.inp.heightAt(C, C) - 40) continue;
        const sl = Math.abs(this.inp.heightAt(x + 3, z) - h) + Math.abs(this.inp.heightAt(x, z + 3) - h);
        if (sl > 3.2) continue;
        let near = Infinity;
        for (let i = 0; i < CUU_KIEU_ROAD.length; i += 2)
          near = Math.min(near, Math.hypot(CUU_KIEU_ROAD[i]![0] - x, CUU_KIEU_ROAD[i]![1] - z));
        if (near < CUU_KIEU_ROAD_HALF + 2.5) continue;
        pts.push([x, z, h, hash01(gx, gz, 8107)]);
      }
    }
    if (tg && pts.length) {
      const mesh = new THREE.InstancedMesh(this.own(tg), this.own(solidMat()), pts.length);
      mesh.name = 'ck-tufts';
      const o = new THREE.Object3D();
      const tint = new THREE.Color();
      pts.forEach(([x, z, h, r], i) => {
        o.position.set(x, h - 0.05, z);
        o.rotation.set(0, r * 40, 0);
        const sc = 0.75 + r * 0.9;
        o.scale.set(sc, sc * (0.9 + hash01(i, 2, 8109) * 0.7), sc);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        const v = 0.78 + hash01(i, 4, 8111) * 0.4;
        mesh.setColorAt(i, tint.setRGB(v * (0.92 + r * 0.2), v * 0.88, v * 0.7));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // hoa nhỏ theo cụm
    const flowers: [number, number, number, number][] = [];
    for (let c = 0; c < 130; c++) {
      const cx = C + (hash01(c, 1, 8201) - 0.5) * 1200;
      const cz = C + (hash01(c, 2, 8203) - 0.5) * 1200;
      const kind = hash01(c, 3, 8205);
      for (let i = 0; i < 26; i++) {
        const a = hash01(c, i, 8207) * Math.PI * 2;
        const d = Math.sqrt(hash01(c, i, 8209)) * 5.5;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (Math.max(Math.abs(x - C), Math.abs(z - C)) > 630) continue;
        const h = this.inp.heightAt(x, z);
        if (h < this.inp.heightAt(C, C) - 40) continue;
        flowers.push([x, z, h, kind]);
      }
    }
    if (flowers.length) {
      const fg = new THREE.CircleGeometry(0.2, 5);
      fg.rotateX(-Math.PI / 2 + 0.35);
      const mesh = new THREE.InstancedMesh(
        this.own(fg),
        this.own(new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0, side: THREE.DoubleSide })),
        flowers.length,
      );
      mesh.name = 'ck-flowers';
      const o = new THREE.Object3D();
      const tint = new THREE.Color();
      const pal = [0xf4f0e6, 0xf2d878, 0xb59ad6, 0xe8a0b4];
      flowers.forEach(([x, z, h, kind], i) => {
        o.position.set(x, h + 0.34 + hash01(i, 6, 8211) * 0.25, z);
        o.rotation.set(0, hash01(i, 5, 8213) * 6.28, 0);
        o.scale.setScalar(0.8 + hash01(i, 7, 8215) * 0.9);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, tint.set(pal[Math.min(3, Math.floor((kind + hash01(i, 8, 8217) * 0.3) * 4)) % 4]!));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  /**
   * Thác nước: mỗi thác là ba dải rộng chồng nhau bám sườn vách từ rìa cao nguyên xuống biển mây; dải dùng texture nước chảy Codex cuộn theo UV (trượt xuống,
   * mỗi dải một tốc độ/độ lệch), mép mờ. Chân thác có ba sprite bọt sương (cộng sáng, nhấp nháy). Không có texture: dải sáng mờ như trước.
   */
  private buildFalls(tex: CkTex | null): void {
    const C = 1024;
    const plateau = this.inp.heightAt(C, C);
    const angles = [28, 98, 158, 214, 322].map((d) => (d * Math.PI) / 180);
    const pos: number[] = [];
    const uvs: number[] = [];
    const ph: number[] = [];
    const idx: number[] = [];
    const foams: [number, number, number][] = [];
    let vi = 0;
    angles.forEach((a, ai) => {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let d0 = 540;
      for (; d0 < 880; d0 += 2) if (this.inp.heightAt(C + dx * d0, C + dz * d0) < plateau - 45) break;
      const sheets = [
        { off: -13, hw: 10, phase: 0.0 },
        { off: 0, hw: 14, phase: 1.7 },
        { off: 13.5, hw: 10.5, phase: 3.1 },
      ];
      let baseD = d0 + 40;
      for (const sh of sheets) {
        const rows = 34;
        const first = vi;
        for (let r = 0; r <= rows; r++) {
          const d = d0 - 4 + r * 4.0;
          const cx = C + dx * d + -dz * sh.off;
          const cz = C + dz * d + dx * sh.off;
          // nhấc ra ngoài mặt vách (vách gần thẳng đứng, lưới địa hình thô nên dải áp sát sẽ bị chôn)
          const y = this.inp.heightAt(cx, cz) + 1.2 + (sh.off === 0 ? 0.2 : 0);
          if (y > this.inp.seaY + 6) baseD = Math.max(baseD, d);
          for (const s of [-1, 1]) {
            pos.push(cx + dx * 2.4 + -dz * sh.hw * s, y, cz + dz * 2.4 + dx * sh.hw * s);
            uvs.push(s < 0 ? 0 : 1, r / rows);
            ph.push(sh.phase + ai);
            vi++;
          }
          if (r < rows) {
            const i = first + r * 2;
            idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
          }
        }
      }
      for (const off of [-12, 0, 12]) foams.push([C + dx * (baseD + 8) + -dz * off, this.inp.seaY + 9, C + dz * (baseD + 8) + dx * off]);
    });
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('ph', new THREE.Float32BufferAttribute(ph, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const v = uv();
    const p = attribute('ph', 'float');
    const sheet = smoothstep(float(0), float(0.3), v.x).mul(smoothstep(float(1), float(0.7), v.x));
    const fadeTop = smoothstep(float(0), float(0.04), v.y);
    const fadeBot = smoothstep(float(1), float(0.72), v.y);
    if (tex) {
      // hai lớp nước cuộn ngược tốc độ để dòng chảy có chiều sâu
      const w1 = texture(tex.water, vec2(v.x.mul(1.5).add(p.mul(0.37)), v.y.mul(2.6).sub(time.mul(0.5))));
      const w2 = texture(tex.water, vec2(v.x.mul(2.3).add(p.mul(0.61)).add(0.4), v.y.mul(4.1).sub(time.mul(0.85))));
      const wc = w1.rgb.mul(0.55).add(w2.rgb.mul(0.45));
      mat.colorNode = mix(vec3(0.74, 0.9, 0.97), wc.mul(1.8), 0.75);
      mat.opacityNode = clamp(sheet.mul(fadeTop).mul(fadeBot).mul(luminance(wc).mul(0.9).add(0.42)), 0, 1);
    } else {
      const stripes = sin(v.y.mul(40).add(p.mul(2.3)).sub(time.mul(6.5)))
        .mul(0.5)
        .add(0.5);
      mat.colorNode = mix(vec3(0.8, 0.92, 0.97), vec3(1, 1, 1), stripes);
      mat.opacityNode = clamp(sheet.mul(fadeTop).mul(fadeBot).mul(stripes.mul(0.25).add(0.62)), 0, 1);
    }
    const fall = new THREE.Mesh(this.own(g), this.own(mat));
    fall.name = 'ck-falls';
    fall.renderOrder = 2;
    fall.frustumCulled = false;
    this.group.add(fall);

    // sprite bọt sương ở chân thác
    const fm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const q = length(uv().sub(vec2(0.5, 0.5))).mul(2);
    const shimmer = sin(time.mul(1.4).add(q.mul(7)))
      .mul(0.14)
      .add(0.86);
    fm.colorNode = vec3(0.92, 0.97, 1);
    fm.opacityNode = clamp(smoothstep(float(1), float(0.05), q).mul(0.5).mul(shimmer), 0, 1);
    this.own(fm);
    foams.forEach(([x, y, z], i) => {
      const sp = new THREE.Sprite(fm);
      sp.position.set(x, y, z);
      sp.scale.setScalar(34 + hash01(i, 1, 6301) * 22);
      sp.renderOrder = 3;
      sp.name = 'ck-foam';
      this.group.add(sp);
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose?.();
  }
}
