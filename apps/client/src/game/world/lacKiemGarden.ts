import * as THREE from 'three/webgpu';
import { SECT } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createWorldMaterial } from '../../render/materials/world';
import { CardMesher, crown } from './lacKiemSky';
import { FOLIAGE_TILE, FOLIAGE_TILE_SIZE, foliageMaterial, loadSkyTextures, type SkyTextures } from './skyAssets';

/**
 * Mật độ chi tiết theo cụm quanh tông môn (MAP-1): vườn hoa, lùm trúc, đá rêu. Mỗi loại một InstancedMesh (ba draw call).
 * Cụm đặt tay (toạ độ tương đối tâm tông môn, khớp bố cục `tools/blender/thien_cong_sect.py`): mỗi khu một điểm nhìn chính
 * (vườn hoa cạnh đại lộ, lùm trúc cuối sân) cộng vài cụm phụ; `blocked` chặn công trình, đại lộ, cổng và các prop có va chạm.
 */

interface Cluster {
  x: number;
  z: number;
  r: number;
  n: number;
}

const FLOWERS: Cluster[] = [
  { x: -27, z: 38, r: 7, n: 90 },
  { x: 27, z: 38, r: 7, n: 90 },
  { x: -31, z: -12, r: 8, n: 80 },
  { x: 31, z: -12, r: 8, n: 80 },
  { x: -62, z: 40, r: 9, n: 70 },
  { x: 62, z: 40, r: 9, n: 70 },
  { x: -64, z: -22, r: 8, n: 60 },
  { x: 64, z: -22, r: 8, n: 60 },
  { x: -18, z: 66, r: 5, n: 40 },
  { x: 18, z: 66, r: 5, n: 40 },
];
const BAMBOO: Cluster[] = [
  { x: -80, z: -26, r: 10, n: 46 },
  { x: 80, z: -26, r: 10, n: 46 },
  { x: -84, z: 36, r: 9, n: 38 },
  { x: 84, z: 36, r: 9, n: 38 },
  { x: -46, z: -80, r: 10, n: 42 },
  { x: 46, z: -80, r: 10, n: 42 },
];
const ROCKS: Cluster[] = [
  { x: -20, z: 58, r: 5, n: 5 },
  { x: 20, z: 62, r: 5, n: 5 },
  { x: -38, z: -34, r: 5, n: 5 },
  { x: 38, z: -34, r: 5, n: 5 },
  { x: -72, z: 12, r: 6, n: 6 },
  { x: 72, z: 12, r: 6, n: 6 },
  { x: -30, z: -92, r: 6, n: 5 },
  { x: 30, z: -92, r: 6, n: 5 },
];

const circle = (x: number, z: number, cx: number, cz: number, r: number) => (x - cx) ** 2 + (z - cz) ** 2 < r * r;

/** Chỗ không đặt cây hoa/trúc/đá: công trình, đại lộ, vòng bát quái, sân cổng, prop có va chạm. */
export function blocked(x: number, z: number): boolean {
  if (Math.abs(x) < 10 && z > -34 && z < 88) return true; // đại lộ + hàng đèn
  if (Math.abs(x) < 25 && z > -66 && z < -24) return true; // chính điện + nền
  if (circle(x, z, 0, 18, 15)) return true; // cự kiếm + bát quái
  if (circle(x, z, -40, -52, 15) || circle(x, z, 40, -52, 15)) return true; // hai lầu
  if (circle(x, z, 0, -93, 13)) return true; // tháp
  if (circle(x, z, -52, 4, 12) || circle(x, z, 52, 4, 12)) return true; // hai đình
  if (Math.abs(x) < 40 && Math.abs(z - 80) < 10) return true; // sơn môn và tường rào
  if (circle(x, z, -20, 28, 3)) return true; // lư hương
  if (circle(x, z, -30, 30, 3) || circle(x, z, 30, 30, 3)) return true; // bia khắc
  return false;
}

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

function scatter(cl: Cluster[], rand: () => number): { x: number; z: number; k: number }[] {
  const out: { x: number; z: number; k: number }[] = [];
  for (const c of cl) {
    let placed = 0;
    for (let tries = 0; placed < c.n && tries < c.n * 6; tries++) {
      const a = rand() * Math.PI * 2;
      const rr = c.r * Math.sqrt(rand());
      const lx = c.x + Math.cos(a) * rr;
      const lz = c.z + Math.sin(a) * rr;
      if (blocked(lx, lz)) continue;
      out.push({ x: SECT.x + lx, z: SECT.z + lz, k: rr / c.r });
      placed++;
    }
  }
  return out;
}

/** Kế hoạch vườn: mọi giá trị ngẫu nhiên từng cây/hoa/đá, tính theo ĐÚNG thứ tự dòng `rand` như khi dựng cảnh. Hàm thuần (không THREE): dựng cảnh và bake va chạm dùng chung. */
interface GardenPlan {
  flowers: { x: number; z: number; rx: number; ry: number; rz: number; s: number; petal: number; light: number }[];
  bamboo: {
    x: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    sx: number;
    sy: number;
    sz: number;
    h: number;
    sat: number;
    l: number;
  }[];
  rocks: { x: number; z: number; s: number; rx: number; ry: number; rz: number; sx: number; sy: number; c: number }[];
}

let planCache: GardenPlan | null = null;
export function gardenPlan(): GardenPlan {
  if (planCache) return planCache;
  const rand = rng(424242);
  const flowers = scatter(FLOWERS, rand).map((p) => ({
    x: p.x,
    z: p.z,
    rx: (rand() - 0.5) * 0.3,
    ry: rand() * 6.28,
    rz: (rand() - 0.5) * 0.3,
    s: 0.95 + rand() * 0.8,
    petal: Math.floor(rand() * PETALS.length),
    light: (rand() - 0.5) * 0.08,
  }));
  const bamboo = scatter(BAMBOO, rand).map((p) => {
    const rx = (rand() - 0.5) * 0.14;
    const ry = rand() * 6.28;
    const rz = (rand() - 0.5) * 0.14;
    const sx = 0.8 + rand() * 0.5;
    const sy = 0.75 + rand() * 0.55;
    const sz = 0.8 + rand() * 0.5;
    const h = 0.27 + rand() * 0.05;
    const sat = 0.4 + rand() * 0.2;
    const l = 0.6 + rand() * 0.25;
    return { x: p.x, z: p.z, rx, ry, rz, sx, sy, sz, h, sat, l };
  });
  const rocks = scatter(ROCKS, rand).map((q) => {
    const s = 0.7 + rand() * 1.5;
    const rx = (rand() - 0.5) * 0.4;
    const ry = rand() * 6.28;
    const rz = (rand() - 0.5) * 0.4;
    const sx = s * (1 + rand() * 0.5);
    const sy = s * (0.8 + rand() * 0.6);
    const c = 0.85 + rand() * 0.3;
    return { x: q.x, z: q.z, s, rx, ry, rz, sx, sy, c };
  });
  return (planCache = { flowers, bamboo, rocks });
}

function merge(parts: { g: THREE.BufferGeometry; col: THREE.Color }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const { g, col: c } of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const p = ng.getAttribute('position');
    const n = ng.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    ng.dispose();
    if (ng !== g) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const PETALS = [0xf2a4b8, 0xffffff, 0xf7d36a, 0xe5708a, 0xc7a6f0, 0xffb089];

export class LacKiemGarden {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private bambooMats: THREE.Matrix4[] = [];
  private bambooCols: THREE.Color[] = [];
  private dead = false;

  constructor() {
    this.group.name = 'lacKiemGarden';
    const plan = gardenPlan();
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Hoa: thân mảnh + đài hoa nhiều cánh (nón dẹt); màu cánh theo cụm.
    {
      const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.5, 4);
      stem.translate(0, 0.25, 0);
      const bloom = new THREE.ConeGeometry(0.1, 0.08, 6);
      bloom.rotateX(Math.PI);
      bloom.translate(0, 0.54, 0);
      const leaf = new THREE.ConeGeometry(0.12, 0.3, 4);
      leaf.translate(0.08, 0.15, 0);
      leaf.rotateZ(-0.7);
      const geo = merge([
        { g: stem, col: new THREE.Color(0.3, 0.7, 0.3) },
        { g: bloom, col: new THREE.Color(1, 1, 1) },
        { g: leaf, col: new THREE.Color(0.35, 0.8, 0.35) },
      ]);
      const pts = plan.flowers;
      const mat = createWorldMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
      mesh.name = 'garden-flowers';
      mesh.frustumCulled = false;
      pts.forEach((p, i) => {
        dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
        dummy.rotation.set(p.rx, p.ry, p.rz);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setHex(PETALS[p.petal] ?? 0xffffff).offsetHSL(0, 0, p.light);
        mesh.setColorAt(i, color);
      });
      mesh.count = pts.length;
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }

    // Trúc: cây rỗng chia đốt (ba đoạn lệch màu nhẹ) + ba tầng lá dẹt ở ngọn.
    {
      const parts: { g: THREE.BufferGeometry; col: THREE.Color }[] = [];
      for (let k = 0; k < 3; k++) {
        const seg = new THREE.CylinderGeometry(0.075 - k * 0.012, 0.085 - k * 0.012, 3.3, 6);
        seg.translate(0, 1.65 + k * 3.3, 0);
        parts.push({ g: seg, col: new THREE.Color(0.44 + k * 0.05, 0.66 + k * 0.03, 0.34) });
        const node = new THREE.CylinderGeometry(0.1 - k * 0.012, 0.1 - k * 0.012, 0.09, 6);
        node.translate(0, k * 3.3 + 3.3, 0);
        parts.push({ g: node, col: new THREE.Color(0.3, 0.5, 0.25) });
      }
      const geo = merge(parts);
      const pts = plan.bamboo;
      const mat = createWorldMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
      mesh.name = 'garden-bamboo';
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.bambooMats = [];
      this.bambooCols = [];
      pts.forEach((p, i) => {
        dummy.position.set(p.x, heightAt(p.x, p.z) - 0.1, p.z);
        dummy.rotation.set(p.rx, p.ry, p.rz);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        this.bambooMats.push(dummy.matrix.clone());
        color.setHSL(p.h, p.sat, p.l);
        mesh.setColorAt(i, color);
        this.bambooCols.push(color.clone());
      });
      mesh.count = pts.length;
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }

    // Đá rêu: khối ico méo, nửa trên phủ rêu xanh.
    {
      const base = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const p = base.getAttribute('position');
      const cols: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const nx = Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.18;
        p.setXYZ(i, p.getX(i) * (1 + nx), p.getY(i) * 0.65, p.getZ(i) * (1 + nx * 0.8));
        const y = p.getY(i);
        const moss = Math.max(0, Math.min(1, (y + 0.1) * 2.2));
        cols.push(0.55 * (1 - moss) + 0.27 * moss, 0.57 * (1 - moss) + 0.5 * moss, 0.58 * (1 - moss) + 0.22 * moss);
      }
      base.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      base.computeVertexNormals();
      const pts = plan.rocks;
      const mat = createWorldMaterial({ vertexColors: true, roughness: 0.95 });
      const mesh = new THREE.InstancedMesh(base, mat, Math.max(1, pts.length));
      mesh.name = 'garden-rocks';
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pts.forEach((q, i) => {
        dummy.position.set(q.x, heightAt(q.x, q.z) + q.s * 0.1, q.z);
        dummy.rotation.set(q.rx, q.ry, q.rz);
        dummy.scale.set(q.sx, q.sy, q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setScalar(q.c);
        mesh.setColorAt(i, color);
      });
      mesh.count = pts.length;
      this.group.add(mesh);
      this.disposables.push(base, mat, mesh);
    }
    this.startLeaves();
  }

  private startLeaves(): void {
    void loadSkyTextures().then((tex) => {
      if (tex) this.addLeaves(tex);
    });
  }

  /** Lá trúc bằng thẻ alpha (hai thẻ chéo nhau ở năm tầng trên ngọn), dùng chung ma trận và màu với thân trúc; hiện sau khi nạp atlas. */
  private addLeaves(tex: SkyTextures): void {
    if (this.dead || !this.bambooMats.length) return;
    const tile = FOLIAGE_TILE.bamboo;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const quad = (cx: number, cy: number, cz: number, yaw: number, w: number, h: number, tilt: number) => {
      const base = pos.length / 3;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const up = sy * h * 0.5;
        pos.push(cx + c * sx * w * 0.5 + s * up * tilt, cy + up, cz + s * sx * w * 0.5 - c * up * tilt);
        uv.push(tile[0] + (sx * 0.5 + 0.5) * FOLIAGE_TILE_SIZE[0], tile[1] + (1 - (sy * 0.5 + 0.5)) * FOLIAGE_TILE_SIZE[1]);
        col.push(1, 1, 1);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let lvl = 0; lvl < 5; lvl++) {
      const y = 6.6 + lvl * 0.85;
      for (let k = 0; k < 3; k++) quad(0, y, 0, (k / 3) * Math.PI + lvl * 0.7, 3.4 - lvl * 0.25, 2.6, 0.25);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = foliageMaterial(tex);
    const mesh = new THREE.InstancedMesh(geo, mat, this.bambooMats.length);
    mesh.name = 'garden-bamboo-leaves';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    this.bambooMats.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.bambooCols[i]!);
    });
    this.group.add(mesh);
    this.disposables.push(geo, mat, mesh);
    // Tùng chậu hai bên đại lộ: thân do Blender (prop_chau_cay), tán là thẻ lá alpha.
    const pots = new CardMesher();
    const r = rng(9090);
    for (const sx of [-1, 1]) {
      const x = SECT.x + sx * 12;
      const z = SECT.z + 46;
      crown(pots, new THREE.Vector3(x, heightAt(x, z) + 3.3, z), 1.7, 'pine', new THREE.Color(1.15, 1.6, 1.1), r);
    }
    const potMat = foliageMaterial(tex);
    const potMesh = new THREE.Mesh(pots.geometry(), potMat);
    potMesh.name = 'garden-pot-crowns';
    potMesh.frustumCulled = false;
    potMesh.castShadow = true;
    this.group.add(potMesh);
    this.disposables.push(potMesh.geometry, potMat);
  }

  dispose(): void {
    this.dead = true;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
