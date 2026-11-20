import * as THREE from 'three/webgpu';
import { hash01 } from '@dtl/shared';
import { FOLIAGE_TILE, FOLIAGE_TILE_SIZE, foliageMaterial, type SkyTextures } from './skyAssets';
import type { PropInstance } from './propScatter';

/**
 * Rừng cây thẻ alpha (MAP-1 bản B): thay các mô hình cây Tripo (tán đĩa phẳng xếp tầng, tối khi ngược nắng) bằng cây có thân uốn và tán
 * dựng từ thẻ lá alpha (atlas `public/sky/foliage.*.webp`): tùng, sồi, đào, phong. Mỗi loài dựng một mẫu (thân + thẻ lá, pháp tuyến tán hướng
 * ra từ tâm tán cho khối mềm), rồi gộp mọi cây của một ô 256 m vào một lưới (một draw call/ô, cắt theo khung nhìn, ẩn khi quá xa).
 * Cây không đổ bóng (chỉ nhận). Vị trí/độ cao/xoay/tỉ lệ lấy từ cùng danh sách prop như trước (`allProps`), nên va chạm không đổi.
 */

type Kind = 'pine' | 'oak' | 'peach' | 'maple';

interface Species {
  kind: Kind;
  /** Chiều cao thân (m) ở tỉ lệ 1. */
  height: number;
  /** Bán kính tán (m). */
  crown: number;
  /** Số tầng tán (tùng nhiều tầng, sồi một khối lớn). */
  tiers: number;
  /** Số thẻ lá mỗi tầng. */
  cards: number;
  tint: [number, number, number];
}

const SPECIES: Record<string, Species> = {
  prop_thong_co: { kind: 'pine', height: 13, crown: 6.6, tiers: 4, cards: 8, tint: [1.15, 1.55, 1.1] },
  prop_co_thu: { kind: 'oak', height: 17, crown: 10, tiers: 3, cards: 10, tint: [1.05, 1.35, 0.95] },
  prop_soi_nui: { kind: 'oak', height: 10.5, crown: 6, tiers: 2, cards: 9, tint: [1.0, 1.3, 0.95] },
  prop_anh_dao: { kind: 'peach', height: 7, crown: 4.6, tiers: 2, cards: 9, tint: [1.15, 1.15, 1.15] },
  prop_phong_do: { kind: 'maple', height: 9.5, crown: 5.4, tiers: 2, cards: 9, tint: [1.25, 1.15, 1.05] },
};

/** Id prop được thay bằng cây thẻ. */
export const CARD_TREE_IDS: ReadonlySet<string> = new Set(Object.keys(SPECIES));

const CELL = 384;
/** Ô xa hơn mức này (m) không vẽ (sương đã nuốt). */
const DRAW_RANGE = 800;
/** Ô gần hơn mức này (m) dùng mẫu chi tiết (LOD 0), xa hơn dùng mẫu thưa (LOD 1). */
const LOD_NEAR = 300;

interface Template {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
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

/** Mẫu một loài: thân tapered uốn + các thẻ lá (cùng pháp tuyến hướng ra), gốc ở (0,0,0), cao theo +y. */
function buildTemplate(sp: Species, seed: number, lod: 0 | 1): Template {
  const r = rng(seed);
  // LOD 1 (ô xa): ~33% số thẻ lá và thân 3 đoạn, hình dáng chung giữ nguyên.
  const cardsPerTier = lod === 0 ? sp.cards : Math.max(3, Math.round(sp.cards * 0.33));
  const t: Template = { pos: [], nor: [], uv: [], col: [] };
  const barkUv = FOLIAGE_TILE.bark;
  const bu = barkUv[0] + FOLIAGE_TILE_SIZE[0] * 0.5;
  const bv = barkUv[1] + FOLIAGE_TILE_SIZE[1] * 0.5;
  const lean = (r() - 0.5) * 0.5;
  // Thân: ống 6 cạnh, bán kính giảm dần; pháp tuyến hướng ra theo trục.
  const rows = lod === 0 ? 6 : 3;
  const trunkR = sp.height * 0.032;
  const ring: THREE.Vector3[][] = [];
  const ringR: number[] = [];
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= rows; i++) {
    const q = i / rows;
    const cx = lean * q * q * sp.height * 0.3;
    const cz = Math.sin(q * 2.4 + seed) * sp.height * 0.025 * q;
    centers.push(new THREE.Vector3(cx, sp.height * 0.92 * q, cz));
    ringR.push(trunkR * (1 - q * 0.72));
  }
  for (let i = 0; i <= rows; i++) {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2;
      row.push(new THREE.Vector3(centers[i]!.x + Math.cos(a) * ringR[i]!, centers[i]!.y, centers[i]!.z + Math.sin(a) * ringR[i]!));
    }
    ring.push(row);
  }
  const push = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: [number, number, number]) => {
    t.pos.push(p.x, p.y, p.z);
    t.nor.push(n.x, n.y, n.z);
    t.uv.push(u, v);
    t.col.push(c[0], c[1], c[2]);
  };
  const trunkCol: [number, number, number] = [0.85, 0.78, 0.7];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      const a = ring[i]![j]!;
      const b = ring[i]![j2]!;
      const c = ring[i + 1]![j2]!;
      const d = ring[i + 1]![j]!;
      const nj = new THREE.Vector3(a.x - centers[i]!.x, 0, a.z - centers[i]!.z).normalize();
      const nj2 = new THREE.Vector3(b.x - centers[i]!.x, 0, b.z - centers[i]!.z).normalize();
      for (const [p, n] of [
        [a, nj],
        [b, nj2],
        [c, nj2],
        [a, nj],
        [c, nj2],
        [d, nj],
      ] as const)
        push(p, n, bu, bv, trunkCol);
    }
  // Tán: các tầng thẻ lá. Tùng xếp tầng thu nhỏ dần lên ngọn; loài lá rộng một khối lớn nhiều thẻ.
  const tile = FOLIAGE_TILE[sp.kind];
  const top = centers[rows]!;
  for (let tier = 0; tier < sp.tiers; tier++) {
    const q = sp.tiers === 1 ? 0.5 : tier / (sp.tiers - 1);
    const pine = sp.kind === 'pine';
    const base = pine ? 0.32 + q * 0.62 : 0.55 + q * 0.4;
    const ty = sp.height * base;
    const tc = new THREE.Vector3(lean * base * base * sp.height * 0.3, ty, 0);
    const radius = sp.crown * (pine ? 1 - q * 0.62 : 1 - q * 0.25) * (0.85 + r() * 0.3);
    for (let k = 0; k < cardsPerTier; k++) {
      const yaw = (k / cardsPerTier) * Math.PI * 2 + r() * 0.8;
      const out = radius * (0.35 + r() * 0.55);
      const centre = new THREE.Vector3(
        tc.x + Math.cos(yaw) * out * 0.5,
        ty + (r() - 0.35) * radius * 0.5,
        tc.z + Math.sin(yaw) * out * 0.5,
      );
      const size = radius * (1.05 + r() * 0.5) * (lod === 0 ? 1 : 1.25); // thẻ ít hơn nên to hơn một chút để tán không thưa
      const droop = pine ? 0.35 + r() * 0.3 : (r() - 0.5) * 0.5;
      const rv = new THREE.Vector3(Math.cos(yaw + 1.2), 0, Math.sin(yaw + 1.2));
      const uvv = new THREE.Vector3(
        Math.sin(yaw + 1.2) * Math.sin(droop),
        Math.cos(droop),
        -Math.cos(yaw + 1.2) * Math.sin(droop),
      ).normalize();
      const tint = 0.78 + r() * 0.4;
      const col: [number, number, number] = [sp.tint[0] * tint, sp.tint[1] * tint, sp.tint[2] * tint];
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const vs = corners.map(([sx, sy]) =>
        centre
          .clone()
          .addScaledVector(rv, sx * size * 0.5)
          .addScaledVector(uvv, sy * size * 0.5),
      );
      const uvs = corners.map(
        ([sx, sy]) => [tile[0] + (sx * 0.5 + 0.5) * FOLIAGE_TILE_SIZE[0], tile[1] + (1 - (sy * 0.5 + 0.5)) * FOLIAGE_TILE_SIZE[1]] as const,
      );
      // Pháp tuyến mềm: hướng ra từ tâm tán, hơi dựng lên (thẻ phẳng nhưng sáng như khối).
      const nrm = vs.map((v) =>
        v
          .clone()
          .sub(new THREE.Vector3(tc.x, ty - radius * 0.2, tc.z))
          .normalize()
          .add(new THREE.Vector3(0, 0.45, 0))
          .normalize(),
      );
      for (const i of [0, 1, 2, 0, 2, 3]) push(vs[i]!, nrm[i]!, uvs[i]![0], uvs[i]![1], col);
    }
  }
  void top;
  return t;
}

export class CardForest {
  readonly group = new THREE.Group();
  private chunks: { near: THREE.Mesh; far: THREE.Mesh; cx: number; cz: number }[] = [];
  private mat: THREE.MeshStandardNodeMaterial;
  private dead = false;

  /** `trees`: các instance cây (id thuộc `CARD_TREE_IDS`). */
  constructor(trees: readonly PropInstance[], tex: SkyTextures) {
    this.group.name = 'cardForest';
    this.mat = foliageMaterial(tex);
    const templates: [Map<string, Template>, Map<string, Template>] = [new Map(), new Map()];
    let seed = 11;
    for (const [id, sp] of Object.entries(SPECIES)) {
      seed += 17;
      templates[0].set(id, buildTemplate(sp, seed, 0));
      templates[1].set(id, buildTemplate(sp, seed, 1));
    }
    const byChunk = new Map<number, PropInstance[]>();
    for (const p of trees) {
      if (!templates[0].has(p.id)) continue;
      const key = Math.floor(p.x / CELL) * 4096 + Math.floor(p.z / CELL);
      let a = byChunk.get(key);
      if (!a) byChunk.set(key, (a = []));
      a.push(p);
    }
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    const build = (list: PropInstance[], tpls: Map<string, Template>): THREE.Mesh => {
      const pos: number[] = [];
      const nor: number[] = [];
      const uv: number[] = [];
      const col: number[] = [];
      for (const p of list) {
        const tpl = tpls.get(p.id);
        if (!tpl) continue;
        const sc = p.s;
        m.compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
          new THREE.Vector3(sc, sc * (p.sy ?? 1), sc),
        );
        nm.getNormalMatrix(m);
        const tint = p.tint ?? [1, 1, 1];
        const jit = 0.9 + hash01(Math.round(p.x), Math.round(p.z), 7) * 0.2;
        for (let i = 0; i < tpl.pos.length; i += 3) {
          v.set(tpl.pos[i] ?? 0, tpl.pos[i + 1] ?? 0, tpl.pos[i + 2] ?? 0).applyMatrix4(m);
          pos.push(v.x, v.y, v.z);
          v.set(tpl.nor[i] ?? 0, tpl.nor[i + 1] ?? 0, tpl.nor[i + 2] ?? 0)
            .applyMatrix3(nm)
            .normalize();
          nor.push(v.x, v.y, v.z);
          col.push((tpl.col[i] ?? 1) * tint[0] * jit, (tpl.col[i + 1] ?? 1) * tint[1] * jit, (tpl.col[i + 2] ?? 1) * tint[2] * jit);
        }
        for (const u of tpl.uv) uv.push(u);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.name = 'card-forest-chunk';
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    for (const [key, list] of byChunk) {
      const cx = (Math.floor(key / 4096) + 0.5) * CELL;
      const cz = ((key % 4096) + 0.5) * CELL;
      this.chunks.push({ near: build(list, templates[0]), far: build(list, templates[1]), cx, cz });
    }
  }

  /** Ẩn ô xa (gọi mỗi vài khung); `x`, `z` là vị trí camera/người chơi. */
  update(x: number, z: number): void {
    // Khoảng cách tới tâm ô trừ nửa cạnh ô: ô đang đứng lên luôn LOD 0.
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - x, c.cz - z) - CELL * 0.5;
      c.near.visible = d < LOD_NEAR;
      c.far.visible = d >= LOD_NEAR && d < DRAW_RANGE;
    }
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    for (const c of this.chunks) {
      c.near.geometry.dispose();
      c.far.geometry.dispose();
    }
    this.mat.dispose();
  }
}
