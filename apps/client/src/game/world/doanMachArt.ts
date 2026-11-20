import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVELS, NPCS } from '@dtl/content';
import { bridgeDeckY, type BridgeDef } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { runeMaterial } from '../../render/runeWall';
import { MapleLeaves } from '../../render/mapleLeaves';
import { createWorldMaterial } from '../../render/materials/world';
import { DoanMachFalls, fallSpots } from './doanMachFalls';
import { logger } from '../../base/log';
import { assets, type AssetHandle } from '../core/assets';
import { adoptGltfMaterials } from '../../render/materials/world';

/**
 * Cảnh Đoạn Mạch (MAP-2, chỉ để nhìn, không va chạm): rừng phong thẻ lá alpha theo cụm (đỏ/cam/vàng, mỗi cây là thân + tán xoè bằng các thẻ
 * lá phong chéo nhau), vài cây phong lớn làm điểm nhìn, cổ trận khắc trên vách (phát sáng theo mood, `render/runeWall.ts`) và cầu treo gỗ
 * qua khe cát lún (`TerrainDef.bridges` có `own`: địa hình/server coi là cầu đi được, lưới cầu ở đây bám cùng đường `bridgeDeckY`).
 * Cây KHÔNG có va chạm nên chỉ trồng ngoài lòng sông cạn (`rb_*`), xa trạm, cổng, điểm nhiệm vụ, NPC, nút thu thập, trại quái, đường hộ tống.
 * Draw call: 3 (tán phong ba sắc) + 1 (thân cây) + 1 (cổ trận) + 1 (cầu).
 */

const doanLog = logger('doanMachArt');
const SEED = 20261119;

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

/** Cầu treo của level (khai báo ở `TerrainDef.bridges`, cờ `own`). */
export function ownBridge(): BridgeDef | undefined {
  return levelTerrain().def.bridges?.find((b) => b.own);
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

export interface Spot {
  x: number;
  z: number;
  r: number;
}

/**
 * Chỗ không trồng cây (cây không có va chạm nên phải tránh mọi nơi người chơi, quái, NPC đi lại hoặc cần nhìn rõ):
 * lòng sông cạn `rb_*` (lõi 90% `flatR`), trạm, cổng, điểm nhiệm vụ, điểm đáng chú ý, NPC, nút thu thập, trại quái, điểm hồi sinh, đường hộ
 * tống (dải đệm 14 m), cầu, bệ khác và mọi vật cản. Hàm thuần theo dữ liệu level để test.
 */
export function exclusions(): Spot[] {
  const t = levelTerrain();
  const lv = LEVELS.doan_mach;
  const out: Spot[] = [{ x: 1024, z: 1036, r: 60 }];
  for (const f of t.def.features) out.push({ x: f.x, z: f.z, r: f.id.startsWith('rb_') ? f.flatR * 0.9 : f.flatR + 10 });
  for (const c of t.colliders) out.push({ x: c.x, z: c.z, r: c.r + 3 });
  for (const b of t.def.bridges ?? []) {
    for (let i = 0; i <= 8; i++) out.push({ x: b.ax + ((b.bx - b.ax) * i) / 8, z: b.az + ((b.bz - b.az) * i) / 8, r: 14 });
  }
  for (const n of NPCS) if (n.level === 'doan_mach') out.push({ x: n.x, z: n.z, r: 14 });
  if (lv) {
    if (lv.spawn) out.push({ x: lv.spawn.x, z: lv.spawn.z, r: 30 });
    for (const p of lv.portals ?? []) out.push({ x: p.x, z: p.z, r: p.r + 16 });
    for (const p of lv.pois ?? []) out.push({ x: p.x, z: p.z, r: 22 });
    for (const s of lv.spots ?? []) out.push({ x: s.x, z: s.z, r: 16 });
    for (const n of lv.nodes ?? []) out.push({ x: n.x, z: n.z, r: 12 });
    for (const c of lv.camps ?? []) out.push({ x: c.x, z: c.z, r: 8 });
    for (const e of lv.escorts ?? []) {
      for (let i = 0; i + 1 < e.path.length; i++) {
        const a = e.path[i];
        const b = e.path[i + 1];
        if (!a || !b) continue;
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
        for (let k = 0; k <= n; k++) out.push({ x: a[0] + ((b[0] - a[0]) * k) / n, z: a[1] + ((b[1] - a[1]) * k) / n, r: 14 });
      }
    }
  }
  return out;
}

export interface TreeSpot {
  x: number;
  z: number;
  s: number;
  /** 0 đỏ son, 1 cam, 2 vàng. */
  kind: 0 | 1 | 2;
  rot: number;
  hero?: boolean;
}

/** Điểm trồng phong: lưới lệch 14 m, giữ nơi mật độ rừng cao, đất bằng, xa chỗ cấm. Tối đa `max` (chưa tính cây lớn điểm nhìn). */
export function mapleSpots(max = 700): TreeSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const ex = exclusions();
  const free = (x: number, z: number) => !ex.some((e) => (x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r);
  const rand = rng(SEED);
  const out: TreeSpot[] = [];
  for (let gx = b.x0 + 40; gx < b.x1 - 40; gx += 14) {
    for (let gz = b.z0 + 40; gz < b.z1 - 40; gz += 14) {
      const x = gx + (rand() - 0.5) * 11;
      const z = gz + (rand() - 0.5) * 11;
      const dens = groveDensity(x, z);
      const keep = rand();
      const q = Math.sin(x * 0.02 + z * 0.015) * 0.5 + rand() * 0.8;
      const s = 0.85 + rand() * 0.85;
      const rot = rand() * 6.28;
      if (dens < -0.1 || keep > 0.4 + dens * 0.7) continue;
      if (surfaceNormal(x, z).y < 0.93) continue;
      if (!free(x, z)) continue;
      out.push({ x, z, s, kind: q > 0.62 ? 2 : q > 0.2 ? 1 : 0, rot });
    }
  }
  while (out.length > max) out.splice(Math.floor(rand() * out.length), 1);
  // Cây phong lớn làm điểm nhìn: ba cây ở vành quanh trạm (cách 80–200 m), góc cách đều, đất bằng, chỗ trống.
  const heroKinds: (0 | 1 | 2)[] = [0, 2, 0];
  heroKinds.forEach((kind, i) => {
    const base = -1.1 + (i * Math.PI * 2) / 3;
    let best: { x: number; z: number; d: number } | undefined;
    for (let da = -0.5; da <= 0.5; da += 0.05) {
      for (let r = 80; r <= 200; r += 6) {
        const x = 1024 + Math.cos(base + da) * r;
        const z = 1036 + Math.sin(base + da) * r;
        if (!free(x, z) || surfaceNormal(x, z).y < 0.96) continue;
        // ưu tiên chỗ xa mọi vùng cấm nhất (thoáng, nhìn rõ từ trạm)
        const d = Math.min(...ex.map((e) => Math.hypot(x - e.x, z - e.z) - e.r));
        if (!best || d > best.d) best = { x, z, d };
      }
    }
    if (best) out.push({ x: best.x, z: best.z, s: 2.5, kind, rot: i * 2.1, hero: true });
  });
  return out;
}

export interface RuneSpot {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
}

/** Điểm khắc cổ trận: vách dốc quay vào vùng chơi, có nền thấp trước mặt, cách nhau ≥ 45 m. */
export function runeSpots(max = 130): RuneSpot[] {
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
      cand.push({ pos: new THREE.Vector3(x, y, z), normal: n, size: 28 + rand() * 16 });
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
    if (out.every((o) => o.pos.distanceToSquared(c.pos) > 38 * 38)) out.push(c);
  }
  return out;
}

// ---------- cây phong thẻ lá ----------

/** Dải màu lá (HSL: sắc 0–1, bão hòa, sáng) theo kiểu cây. */
const LEAF_HSL: [number, number, number][][] = [
  [
    [0.0, 0.78, 0.4],
    [0.015, 0.82, 0.46],
    [0.985, 0.7, 0.34],
  ],
  [
    [0.05, 0.88, 0.5],
    [0.08, 0.9, 0.53],
    [0.03, 0.8, 0.42],
  ],
  [
    [0.115, 0.85, 0.56],
    [0.1, 0.85, 0.5],
    [0.13, 0.8, 0.6],
  ],
];

/** Vẽ đường viền một lá phong (năm thùy) tâm (0,0), bán kính r, xoay rot. */
function mapleLeafPath(ctx: CanvasRenderingContext2D, r: number, rot: number): void {
  const tips = 5;
  ctx.beginPath();
  for (let i = 0; i < tips * 2; i++) {
    const a = rot + (i * Math.PI) / tips - Math.PI / 2;
    const rr = i % 2 === 0 ? (i === 0 ? r : r * 0.92) : r * 0.42;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Texture thẻ tán phong: nhiều lá phong chồng nhau trong một đĩa mép lởm chởm, nền trong suốt (alpha test). */
function canopyTexture(kind: number): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('canvas 2d không khả dụng');
  const rand = rng(SEED + 31 + kind * 17);
  const pal = LEAF_HSL[kind] ?? LEAF_HSL[0] ?? [];
  const R = S * 0.46;
  const leaves = 360;
  // Hai lượt: lá tối ở dưới (chiều sâu), lá sáng ở trên.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < leaves / (pass ? 1 : 2); i++) {
      const rr = R * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      // mép lởm chởm: lá ngoài cùng thưa dần
      if (rr > R * 0.8 && rand() < (rr / R - 0.8) * 4) continue;
      const hsl = pal[Math.floor(rand() * pal.length)] ?? [0, 0.8, 0.4];
      const light = hsl[2] * (pass ? 0.9 + rand() * 0.45 : 0.55 + rand() * 0.2);
      ctx.save();
      ctx.translate(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr);
      mapleLeafPath(ctx, 20 + rand() * 12, rand() * 6.28);
      ctx.fillStyle = `hsl(${Math.round(hsl[0] * 360)} ${Math.round(hsl[1] * 100)}% ${Math.round(light * 100)}%)`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsla(${Math.round(hsl[0] * 360)} 60% ${Math.round(light * 55)}% / 0.6)`;
      ctx.stroke();
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

interface Part {
  g: THREE.BufferGeometry;
  col: THREE.Color;
}

function mergeFlat(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const { g, col: c } of parts) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    ng.computeVertexNormals();
    const p = ng.getAttribute('position');
    const n = ng.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const BARK = new THREE.Color(0x4a3426);

/** Thân phong: gốc loe, thân hơi cong, bốn cành lớn đỡ các cụm tán. */
function trunkGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const root = new THREE.CylinderGeometry(0.42, 0.78, 1.1, 7);
  root.translate(0, 0.5, 0);
  parts.push({ g: root, col: BARK });
  const trunk = new THREE.CylinderGeometry(0.26, 0.42, 4.6, 7, 2);
  trunk.translate(0, 3.0, 0);
  parts.push({ g: trunk, col: BARK });
  for (const [rz, ry, h] of [
    [0.75, 0.4, 4.2],
    [-0.7, 2.5, 4.6],
    [0.55, 4.4, 5.2],
    [-0.35, 1.2, 5.8],
  ] as const) {
    const br = new THREE.CylinderGeometry(0.09, 0.2, 2.8, 5);
    br.translate(0, 1.4, 0);
    br.rotateZ(rz);
    br.rotateY(ry);
    br.translate(0, h, 0);
    parts.push({ g: br, col: BARK });
  }
  const out = mergeFlat(parts);
  for (const p of parts) p.g.dispose();
  return out;
}

/**
 * Tán phong bằng thẻ: bảy cụm (tâm, bán kính), mỗi cụm sáu thẻ vuông hướng ngẫu nhiên đặt quanh tâm; pháp tuyến đỉnh hướng ra ngoài
 * khỏi tâm cụm (đổ bóng mềm như khối cầu), màu đỉnh tối ở đáy tán, UV xoay ngẫu nhiên từng thẻ để không lặp họa tiết.
 */
function canopyGeometry(): THREE.BufferGeometry {
  const rand = rng(SEED + 5);
  const blobs: [number, number, number, number][] = [
    [0, 6.7, 0, 3.4],
    [2.3, 5.7, 0.8, 2.6],
    [-2.2, 5.5, -0.9, 2.7],
    [0.7, 5.3, 2.4, 2.4],
    [-0.5, 5.6, -2.5, 2.5],
    [0.4, 8.4, 0.3, 2.5],
    [-1.4, 7.5, 1.2, 2.1],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const corner: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  for (const [bx, by, bz, br] of blobs) {
    for (let k = 0; k < 6; k++) {
      // hướng thẻ ngẫu nhiên đều trên cầu
      const nz = rand() * 2 - 1;
      const ph = rand() * Math.PI * 2;
      const rr = Math.sqrt(1 - nz * nz);
      const n = new THREE.Vector3(rr * Math.cos(ph), nz, rr * Math.sin(ph));
      const u = new THREE.Vector3()
        .crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
        .normalize();
      const v = new THREE.Vector3().crossVectors(n, u).normalize();
      const size = br * (1.9 + rand() * 0.5);
      const off = n.clone().multiplyScalar(br * 0.25 * rand());
      const base = pos.length / 3;
      const rot = Math.floor(rand() * 4);
      corner.forEach(([cx, cy], i) => {
        const p = new THREE.Vector3(bx, by, bz)
          .add(off)
          .addScaledVector(u, cx * size)
          .addScaledVector(v, cy * size);
        pos.push(p.x, p.y, p.z);
        const o = p
          .clone()
          .sub(new THREE.Vector3(bx, by, bz))
          .normalize();
        nor.push(o.x, o.y, o.z);
        const shade = 0.62 + 0.45 * Math.min(1, Math.max(0, (p.y - 3.2) / 6));
        col.push(shade, shade, shade);
        const c = corner[(i + rot) % 4] ?? [0, 0];
        uvs.push(c[0] + 0.5, c[1] + 0.5);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

export interface BridgeFillSample {
  x: number;
  z: number;
  /** Cao độ mặt đất thật bên dưới (lưới địa hình, không tính mặt cầu). */
  floor: number;
  /** Mặt trên khối đá lấp (ngay dưới ván cầu). */
  top: number;
  /** Nửa bề rộng khối lấp: phủ trọn dải `halfW + 0,8` mà `withBridges` (shared) nâng lên. */
  half: number;
}

/**
 * Khối đá lấp dưới cầu. Địa hình là heightfield nên dải quanh trục cầu bị `withBridges` kéo lên mặt cầu bất kể chỗ đứng: ai đi dọc đáy khe tới
 * đó gặp một bậc cao. Thay vì để tường vô hình, vẽ đúng phần bị nâng lên thành khối đá xây (đập đá chống cầu) để nhìn là chỗ không đi qua.
 * Hàm thuần theo địa hình, có test khớp độ cao thật.
 */
export function bridgeFill(b: BridgeDef, step = 1): BridgeFillSample[] {
  const t = levelTerrain();
  const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
  const n = Math.max(1, Math.round(len / step));
  const out: BridgeFillSample[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = b.ax + (b.bx - b.ax) * u;
    const z = b.az + (b.bz - b.az) * u;
    const half = b.halfW + 0.9;
    // đáy = điểm thấp nhất trên cả bề rộng dải (mặt đất dốc ngang thì mép thấp hơn trục)
    const sx = -(b.bz - b.az) / len;
    const sz = (b.bx - b.ax) / len;
    let floor = Infinity;
    for (const off of [-half, -half / 2, 0, half / 2, half]) floor = Math.min(floor, t.surfaceAt(x + sx * off, z + sz * off));
    const deck = bridgeDeckY(b, u);
    if (deck - floor > 0.3) out.push({ x, z, floor, top: deck - 0.12, half });
  }
  return out;
}

/** Cầu treo: ván gỗ theo đường võng `bridgeDeckY`, hai dây thừng, cột đầu cầu sơn đỏ. Một lưới, màu đỉnh. */
/** Đập đá dưới cầu: hai mái đá hai bên trục cầu, lưới (mẫu dọc cầu × 9 hàng), từ đáy khe lên sát ván; gồ ghề + bậc lệch nhau, màu đá theo mảng. */
function damGeometry(b: BridgeDef, yaw: number): THREE.BufferGeometry {
  const fill = bridgeFill(b);
  const ROWS = 15;
  const rnd = rng(SEED + 404);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const palette = [
    new THREE.Color(0x8a5a40),
    new THREE.Color(0x9c6c4c),
    new THREE.Color(0x7a4c36),
    new THREE.Color(0xa87a58),
    new THREE.Color(0x6a4230),
  ];
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const tmp = new THREE.Color();
  if (fill.length < 2) return new THREE.BufferGeometry();
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    fill.forEach((f, i) => {
      for (let r = 0; r <= ROWS; r++) {
        const t = r / ROWS;
        const y = f.floor - 0.6 + (f.top - (f.floor - 0.6)) * t;
        const step = Math.floor((i + side * 3) / 4); // khối kề nhau lệch nhau theo đoạn ~4 m
        const ledge = Math.sin(step * 1.7 + r * 1.3 + side) * 0.5 + (Math.floor(t * 5) / 5 - t) * 1.6; // bậc đá rõ: mỗi tầng thụt vào rồi nhô ở mép
        const bump = (Math.sin(i * 0.9 + r * 1.9 + side * 2) + Math.sin(i * 0.37 - r * 0.8)) * 0.3;
        const out = f.half + 0.15 + ledge + bump - t * 0.2; // thu nhẹ về phía mặt cầu
        // vector ngang vuông góc trục cầu (trục z cục bộ quay `yaw` quanh y)
        const px = f.x + cs * out * side;
        const pz = f.z - sn * out * side;
        pos.push(px, y, pz);
        const n = 0.5 + 0.5 * Math.sin(f.x * 0.45 + f.z * 0.27 + r * 0.9) * Math.cos(step * 0.8 + r * 0.4);
        tmp
          .copy(palette[Math.min(palette.length - 1, Math.floor(n * palette.length))]!)
          .multiplyScalar(1.15 + t * 0.5 + (rnd() - 0.5) * 0.12);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    });
    for (let i = 0; i < fill.length - 1; i++)
      for (let r = 0; r < ROWS; r++) {
        const a = base + i * (ROWS + 1) + r;
        const c = base + (i + 1) * (ROWS + 1) + r;
        if (side > 0) idx.push(a, c + 1, c, a, a + 1, c + 1);
        else idx.push(a, c, c + 1, a, c + 1, a + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** `part`: 'fill' = chỉ đập đá chống cầu (cầu gỗ là GLB Blender `arch_dm_bridge`); 'all' = cả cầu gỗ thủ tục (dự phòng khi GLB chưa nạp được). */
function bridgeGeometry(b: BridgeDef, part: 'fill' | 'all' = 'all'): THREE.BufferGeometry {
  const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
  const deck = (t: number) => new THREE.Vector3(b.ax + (b.bx - b.ax) * t, bridgeDeckY(b, t), b.az + (b.bz - b.az) * t);
  const dir = new THREE.Vector3(b.bx - b.ax, 0, b.bz - b.az).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const WOOD = new THREE.Color(0x7a5434);
  const WOOD2 = new THREE.Color(0x5b3d26);
  const ROPE = new THREE.Color(0x9c8458);
  const RED = new THREE.Color(0xa8281c);
  const parts: Part[] = [];
  const planks = Math.round(len / 0.9);
  const half = b.halfW;
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i <= planks && part === 'all'; i++) {
    const t = i / planks;
    const p = deck(t);
    const q = deck(Math.min(1, t + 0.01));
    const pitch = -Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    const g = new THREE.BoxGeometry(half * 2, 0.1, 0.62);
    g.rotateX(pitch);
    g.rotateY(yaw);
    g.translate(p.x, p.y - 0.06, p.z);
    parts.push({ g, col: i % 3 === 0 ? WOOD2 : WOOD });
  }
  const segs = 24;
  const up = new THREE.Vector3(0, 1, 0);
  for (const sgn of part === 'all' ? [-1, 1] : []) {
    for (let i = 0; i < segs; i++) {
      const p0 = deck(i / segs).addScaledVector(side, sgn * (half + 0.05));
      const p1 = deck((i + 1) / segs).addScaledVector(side, sgn * (half + 0.05));
      p0.y += 1.1;
      p1.y += 1.1;
      const d = p1.clone().sub(p0);
      const g = new THREE.CylinderGeometry(0.045, 0.045, d.length(), 5);
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
  // Đập đá chống cầu: mái đá tự nhiên (lưới liền, không phải khối xếp), mặt ngoài gồ ghề theo nhiễu + bậc đá lệch nhau, màu theo mảng.
  const dam = new THREE.BufferGeometry(); // không dựng đập đá (xem constructor)
  const deckGeo = parts.length ? mergeFlat(parts) : null;
  void damGeometry;
  for (const p of parts) p.g.dispose();
  if (!deckGeo) return dam;
  const merged = mergeGeometries([deckGeo, dam], false) ?? deckGeo;
  deckGeo.dispose();
  dam.dispose();
  return merged;
}

export class DoanMachArt {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private leaves: MapleLeaves | null = null;

  constructor() {
    this.group.name = 'doanMachArt';
    const rand = rng(SEED + 99);
    const dummy = new THREE.Object3D();

    // Cây phong: thân chung + ba mesh tán thẻ lá theo sắc (chung một lưới tán, khác texture).
    const trees = mapleSpots();
    const trunkGeo = trunkGeometry();
    const trunkMat = createWorldMaterial({ vertexColors: true, roughness: 0.95 });
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, trees.length));
    trunk.name = 'maple-trunks';
    trunk.frustumCulled = false;
    trunk.castShadow = true;
    this.group.add(trunk);
    this.disposables.push(trunkGeo, trunkMat, trunk);
    const canopyGeo = canopyGeometry();
    this.disposables.push(canopyGeo);
    let ti = 0;
    for (const kind of [0, 1, 2] as const) {
      const mine = trees.filter((t) => t.kind === kind);
      const map = canopyTexture(kind);
      const mat = createWorldMaterial({ vertexColors: true, map, alphaTest: 0.45, roughness: 0.8, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(canopyGeo, mat, Math.max(1, mine.length));
      mesh.name = `maple-canopy-${kind}`;
      mesh.frustumCulled = false;
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
      this.disposables.push(map, mat, mesh);
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

    // Thác nhỏ trong khe vách (POLISH-1).
    const falls = new DoanMachFalls(fallSpots());
    this.group.add(falls.group);
    this.disposables.push(falls);

    // Lá phong bay quanh camera (GPU, 1 draw call).
    this.leaves = new MapleLeaves();
    this.group.add(this.leaves.mesh);

    // Cầu treo: GLB Blender nạp bất đồng bộ qua `loadBridge`. Không còn đập đá dựng dưới cầu (nhìn như tấm rèm chắn lòng vực): địa hình bên dưới tự hiện.
  }

  private rockHandle: AssetHandle | null = null;
  private gone = false;

  /** Cầu treo gỗ dựng bằng Blender (`arch_dm_bridge`): gốc tại đầu a, z dọc nhịp; mặt cầu theo `bridgeDeckY`. Lỗi thì dựng lại cầu thủ tục. */
  async loadBridge(renderer: THREE.WebGPURenderer): Promise<void> {
    const b = ownBridge();
    if (!b) return;
    try {
      await assets.attach(renderer);
      const h = await assets.acquire('arch_dm_bridge', { pos: { x: b.ax, z: b.az } });
      if (this.gone) {
        h.release();
        return;
      }
      this.rockHandle = h;
      const root = h.scene;
      const mats = adoptGltfMaterials(root);
      for (const m of mats) this.disposables.push(m);
      root.position.set(b.ax, b.ay, b.az);
      root.rotation.y = Math.atan2(b.bx - b.ax, b.bz - b.az); // GLB dọc +z: quay về hướng đầu b
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
      });
      this.group.add(root);
    } catch (e) {
      doanLog.warn('không nạp được cầu Blender, dùng cầu thủ tục', e);
      const bgeo = bridgeGeometry(b, 'all');
      const bmat = createWorldMaterial({ vertexColors: true, roughness: 0.9 });
      const bridge = new THREE.Mesh(bgeo, bmat);
      bridge.name = 'hanging-bridge-fallback';
      bridge.frustumCulled = false;
      this.group.add(bridge);
      this.disposables.push(bgeo, bmat);
    }
  }

  /** Mỗi khung: lá phong bám theo camera. */
  update(cam: THREE.Vector3): void {
    this.leaves?.update(cam, heightAt(cam.x, cam.z));
  }

  dispose(): void {
    this.gone = true;
    this.rockHandle?.release();
    this.rockHandle = null;
    this.leaves?.dispose();
    this.leaves = null;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
