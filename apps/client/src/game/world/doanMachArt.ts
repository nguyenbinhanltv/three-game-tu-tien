import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { runeMaterial } from '../../render/runeWall';
import { createWorldMaterial } from '../../render/materials/world';

/**
 * Cảnh Đoạn Mạch (MAP-2, chỉ để nhìn, không va chạm): rừng phong đỏ/cam/vàng theo cụm, cổ trận khắc trên vách đá (phát sáng theo mood,
 * `render/runeWall.ts`) và cầu treo gỗ bắc qua khe cát lún ở Hoang Sa Huyệt. Tất định theo seed, không đụng dữ liệu gameplay.
 * Draw call: 3 (tán phong ba sắc) + 1 (thân cây) + 1 (cổ trận) + 1 (cầu).
 */

const SEED = 20261119;
/** Cầu treo: hai đầu (x, z) bắc qua khe sâu ~11 m (tìm bằng quét địa hình: độ sâu giữa nhịp so với hai đầu). */
export const BRIDGE = { a: [970, 1500], b: [970, 1548] } as const;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Pháp tuyến mặt đất (đơn vị) theo sai phân heightAt. */
function surfaceNormal(x: number, z: number, e = 3): THREE.Vector3 {
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return new THREE.Vector3(-gx, 1, -gz).normalize();
}

/** Mật độ rừng: các mảng lớn ~100 m từ nhiễu sin chồng, không đều. Hàm thuần để test. */
export function groveDensity(x: number, z: number): number {
  const a = Math.sin(x * 0.0113 + Math.sin(z * 0.0071) * 1.7);
  const b = Math.sin(z * 0.0127 - x * 0.0043 + 1.3);
  const c = Math.sin((x + z) * 0.021 + 0.6);
  return a * 0.5 + b * 0.35 + c * 0.15;
}

interface Spot {
  x: number;
  z: number;
  r: number;
}

/** Vị trí không trồng cây: trạm, bệ (không phải `rb_*`), vật cản và hai đầu cầu. */
function exclusions(): Spot[] {
  const t = levelTerrain();
  const out: Spot[] = [{ x: 1024, z: 1036, r: 60 }];
  for (const f of t.def.features) if (!f.id.startsWith('rb_')) out.push({ x: f.x, z: f.z, r: f.flatR + 10 });
  for (const c of t.colliders) out.push({ x: c.x, z: c.z, r: c.r + 3 });
  for (const e of [BRIDGE.a, BRIDGE.b]) out.push({ x: e[0], z: e[1], r: 14 });
  return out;
}

export interface TreeSpot {
  x: number;
  z: number;
  s: number;
  /** 0 đỏ son, 1 cam, 2 vàng. */
  kind: 0 | 1 | 2;
  rot: number;
}

/** Điểm trồng phong: lưới lệch 15 m, giữ nơi mật độ rừng cao, đất bằng, xa chỗ cấm. Tối đa `max`. */
export function mapleSpots(max = 820): TreeSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const ex = exclusions();
  const rand = rng(SEED);
  const out: TreeSpot[] = [];
  for (let gx = b.x0 + 40; gx < b.x1 - 40; gx += 15) {
    for (let gz = b.z0 + 40; gz < b.z1 - 40; gz += 15) {
      const x = gx + (rand() - 0.5) * 12;
      const z = gz + (rand() - 0.5) * 12;
      const dens = groveDensity(x, z);
      const keep = rand();
      const q = Math.sin(x * 0.02 + z * 0.015) * 0.5 + rand() * 0.8;
      const s = 0.8 + rand() * 0.8;
      const rot = rand() * 6.28;
      if (dens < -0.05 || keep > 0.36 + dens * 0.7) continue;
      if (surfaceNormal(x, z).y < 0.93) continue;
      if (ex.some((e) => (x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r)) continue;
      out.push({ x, z, s, kind: q > 0.62 ? 2 : q > 0.2 ? 1 : 0, rot });
    }
  }
  // Bớt đều ngẫu nhiên thay vì cắt đuôi theo thứ tự lưới (đuôi là một góc bản đồ).
  while (out.length > max) out.splice(Math.floor(rand() * out.length), 1);
  return out;
}

export interface RuneSpot {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
}

/** Điểm khắc cổ trận: vách dốc quay vào vùng chơi, có nền thấp trước mặt, cách nhau ≥ 70 m. */
export function runeSpots(max = 56): RuneSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const rand = rng(SEED + 7);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cand: RuneSpot[] = [];
  for (let x = b.x0 + 20; x < b.x1 - 20; x += 12) {
    for (let z = b.z0 + 20; z < b.z1 - 20; z += 12) {
      const n = surfaceNormal(x, z, 4);
      if (n.y > 0.55 || n.y < 0.12) continue; // vách dốc nhưng không đứng tuyệt đối
      const toC = new THREE.Vector2(cx - x, cz - z).normalize();
      if (n.x * toC.x + n.z * toC.y < 0.35) continue; // mặt vách quay vào trong
      const y = heightAt(x, z);
      // phải có nền thấp trong tầm nhìn: điểm cách 60 m về phía tâm thấp hơn ít nhất 14 m
      if (heightAt(x + toC.x * 60, z + toC.y * 60) > y - 14) continue;
      cand.push({ pos: new THREE.Vector3(x, y, z), normal: n, size: 18 + rand() * 12 });
    }
  }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = cand[i];
    const c = cand[j];
    if (a && c) {
      cand[i] = c;
      cand[j] = a;
    }
  }
  const out: RuneSpot[] = [];
  for (const c of cand) {
    if (out.length >= max) break;
    if (out.every((o) => o.pos.distanceToSquared(c.pos) > 55 * 55)) out.push(c);
  }
  return out;
}

interface Part {
  g: THREE.BufferGeometry;
  col: THREE.Color;
  /** Méo mềm theo vị trí (đỉnh trùng nhau méo như nhau nên lưới không nứt). */
  jitter?: number;
  seed?: number;
  /** Có làm sáng dần lên ngọn không (tán lá). */
  lit?: boolean;
  /** Hàn đỉnh trùng để pháp tuyến mịn (tán lá); mặc định phẳng (ván, cột). */
  smooth?: boolean;
}

function mergeGeo(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const { g, col: c, jitter = 0, seed = 1, lit = false, smooth = false } of parts) {
    let src = g.clone();
    if (smooth) {
      src.deleteAttribute('normal');
      src.deleteAttribute('uv');
      src = mergeVertices(src, 1e-4);
    }
    const p0 = src.getAttribute('position');
    if (jitter) {
      for (let i = 0; i < p0.count; i++) {
        const x = p0.getX(i);
        const y = p0.getY(i);
        const z = p0.getZ(i);
        const k = 1 + jitter * Math.sin(x * 4.1 + seed) * Math.sin(y * 3.7 + seed * 2) * Math.sin(z * 4.3 + seed * 3);
        p0.setXYZ(i, x * k, y * k, z * k);
      }
    }
    // Mịn: tính pháp tuyến trên lưới đã hàn (có chỉ số) rồi mới trải ra; phẳng: trải ra trước.
    if (smooth) src.computeVertexNormals();
    const ng = src.index ? src.toNonIndexed() : src;
    if (!smooth) ng.computeVertexNormals();
    const p = ng.getAttribute('position');
    const n = ng.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const shade = lit ? 0.78 + 0.34 * Math.min(1, Math.max(0, p.getY(i) / 9)) : 1;
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
    if (ng !== src) src.dispose();
    ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const CANOPY = [new THREE.Color(0xc02a1c), new THREE.Color(0xe0651f), new THREE.Color(0xe3ae36)];
const BARK = new THREE.Color(0x4a3426);

/** Tán phong: bảy khối cầu méo chồng lên nhau, cao ~9 m. */
function canopyGeometry(kind: number): THREE.BufferGeometry {
  const base = CANOPY[kind] ?? new THREE.Color(0xc02a1c);
  const blobs: [number, number, number, number][] = [
    [0, 6.6, 0, 3.4],
    [2.2, 5.6, 0.8, 2.5],
    [-2.1, 5.4, -0.9, 2.6],
    [0.6, 5.2, 2.3, 2.3],
    [-0.5, 5.5, -2.4, 2.4],
    [0.4, 8.2, 0.3, 2.3],
    [-1.3, 7.4, 1.1, 2.0],
  ];
  const parts: Part[] = blobs.map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.78, 1);
    g.translate(x, y, z);
    return {
      g,
      col: base.clone().offsetHSL(((i % 3) - 1) * 0.012, 0, (i % 2) * 0.04 - 0.02),
      jitter: 0.22,
      seed: 3 + i * 1.7,
      lit: true,
      smooth: true,
    };
  });
  const out = mergeGeo(parts);
  for (const p of parts) p.g.dispose();
  return out;
}

function trunkGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const trunk = new THREE.CylinderGeometry(0.28, 0.5, 5.4, 7, 2);
  trunk.translate(0, 2.7, 0);
  parts.push({ g: trunk, col: BARK });
  for (const [rz, ry] of [
    [0.7, 0.4],
    [-0.65, 2.3],
    [0.5, 4.0],
  ] as const) {
    const br = new THREE.CylinderGeometry(0.1, 0.2, 2.6, 5);
    br.translate(0, 1.3, 0);
    br.rotateZ(rz);
    br.rotateY(ry);
    br.translate(0, 3.4 + ry * 0.4, 0);
    parts.push({ g: br, col: BARK });
  }
  const out = mergeGeo(parts);
  for (const p of parts) p.g.dispose();
  return out;
}

/** Cầu treo: ván gỗ theo đường võng, hai dây thừng, cột đầu cầu sơn đỏ. Một lưới, màu đỉnh. */
function bridgeGeometry(): THREE.BufferGeometry {
  const [ax, az] = BRIDGE.a;
  const [bx, bz] = BRIDGE.b;
  const ya = heightAt(ax, az) + 0.7;
  const yb = heightAt(bx, bz) + 0.7;
  const len = Math.hypot(bx - ax, bz - az);
  const sag = 2.4;
  const deck = (t: number) => new THREE.Vector3(ax + (bx - ax) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), az + (bz - az) * t);
  const dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const WOOD = new THREE.Color(0x7a5434);
  const WOOD2 = new THREE.Color(0x5b3d26);
  const ROPE = new THREE.Color(0x9c8458);
  const RED = new THREE.Color(0xa8281c);
  const parts: Part[] = [];
  const planks = Math.round(len / 0.9);
  const half = 1.25;
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i <= planks; i++) {
    const t = i / planks;
    const p = deck(t);
    const q = deck(Math.min(1, t + 0.01));
    const pitch = -Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    const g = new THREE.BoxGeometry(half * 2, 0.1, 0.62);
    g.rotateX(pitch);
    g.rotateY(yaw);
    g.translate(p.x, p.y, p.z);
    parts.push({ g, col: i % 3 === 0 ? WOOD2 : WOOD });
  }
  const segs = 24;
  const up = new THREE.Vector3(0, 1, 0);
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const p0 = deck(i / segs).addScaledVector(side, sgn * (half + 0.05));
      const p1 = deck((i + 1) / segs).addScaledVector(side, sgn * (half + 0.05));
      p0.y += 1.1;
      p1.y += 1.1;
      const d = p1.clone().sub(p0);
      const g = new THREE.CylinderGeometry(0.045, 0.045, d.length(), 5);
      // trục xi-lanh là Y: quay về hướng d
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
      g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      parts.push({ g, col: ROPE });
      if (i % 3 === 0) {
        const post = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4);
        post.translate(p0.x, p0.y - 0.55, p0.z);
        parts.push({ g: post, col: ROPE });
      }
    }
    for (const t of [0, 1]) {
      const base = deck(t).addScaledVector(side, sgn * (half + 0.2));
      const post = new THREE.CylinderGeometry(0.22, 0.28, 3.4, 7);
      post.translate(base.x, base.y + 1.2, base.z);
      parts.push({ g: post, col: RED });
      const cap = new THREE.BoxGeometry(0.7, 0.16, 0.7);
      cap.translate(base.x, base.y + 2.95, base.z);
      parts.push({ g: cap, col: WOOD2 });
    }
  }
  const geo = mergeGeo(parts);
  for (const p of parts) p.g.dispose();
  return geo;
}

export class DoanMachArt {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'doanMachArt';
    const rand = rng(SEED + 99);
    const dummy = new THREE.Object3D();

    // Cây phong: thân chung + ba mesh tán theo sắc.
    const trees = mapleSpots();
    const trunkGeo = trunkGeometry();
    const trunkMat = createWorldMaterial({ vertexColors: true, roughness: 0.95 });
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, trees.length));
    trunk.name = 'maple-trunks';
    trunk.frustumCulled = false;
    trunk.castShadow = true;
    this.group.add(trunk);
    this.disposables.push(trunkGeo, trunkMat, trunk);
    let ti = 0;
    for (const kind of [0, 1, 2] as const) {
      const mine = trees.filter((t) => t.kind === kind);
      const geo = canopyGeometry(kind);
      const mat = createWorldMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mine.length));
      mesh.name = `maple-canopy-${kind}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      const c = new THREE.Color();
      mine.forEach((t, i) => {
        dummy.position.set(t.x, heightAt(t.x, t.z) - 0.15, t.z);
        dummy.rotation.set((rand() - 0.5) * 0.08, t.rot, (rand() - 0.5) * 0.08);
        dummy.scale.setScalar(t.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        trunk.setMatrixAt(ti++, dummy.matrix);
        mesh.setColorAt(i, c.setScalar(0.88 + rand() * 0.24));
      });
      mesh.count = mine.length;
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }
    trunk.count = ti;

    // Cổ trận trên vách.
    const runes = runeSpots();
    if (runes.length) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const phase = new Float32Array(runes.length);
      const mat = runeMaterial();
      const mesh = new THREE.InstancedMesh(geo, mat, runes.length);
      mesh.name = 'cliff-runes';
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      runes.forEach((r, i) => {
        // Mặt phẳng nhìn ra theo pháp tuyến vách, nhô 1,2 m cho khỏi lún vào lưới thô.
        dummy.position.copy(r.pos).addScaledVector(r.normal, 1.2);
        dummy.up.set(0, 1, 0);
        dummy.lookAt(dummy.position.clone().add(r.normal));
        dummy.scale.setScalar(r.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        phase[i] = rand() * 6.28;
      });
      geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phase, 1));
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }

    // Cầu treo.
    const bgeo = bridgeGeometry();
    const bmat = createWorldMaterial({ vertexColors: true, roughness: 0.9 });
    const bridge = new THREE.Mesh(bgeo, bmat);
    bridge.name = 'hanging-bridge';
    bridge.castShadow = true;
    bridge.frustumCulled = false;
    this.group.add(bridge);
    this.disposables.push(bgeo, bmat);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
