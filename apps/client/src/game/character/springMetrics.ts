// Thước đo xuyên thân của vạt áo v3 TRONG client (lò xo mô phỏng thật), dùng để so lò xo trước/sau (`springMetrics.test.ts`, bật bằng SPRING_METRICS=<file ra>).
//
// Cùng định nghĩa với `chr_v3.py`/`cloth_bake.py` ở tư thế nghỉ, nhưng đỉnh lấy từ lưới đã skin sau khi lò xo chạy thật (chr_v3.py chỉ đo LBS tĩnh, lò xo chưa mô phỏng):
//   - cặp mặt chồng: các cặp vùng (tay trái/ngực, tay phải/ngực, hai tay, hai chân, tay/chân cùng phía); vạt chia trái/phải theo vị trí đỉnh (không theo trọng số);
//   - đỉnh vải trong viên nang: đỉnh nằm NGOÀI viên nang ở tư thế nghỉ nhưng nằm TRONG ở tư thế đo (không tính tay).
// Cả hai đều là phần TĂNG so với tư thế nghỉ.
import * as THREE from 'three/webgpu';

export type Region = 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r' | 'torso';

export function regionOf(bone: string): Region {
  let m = /(upperarm|lowerarm|clavicle|hand|thumb|index|middle|ring|pinky)(?:_\d+)?(?:_twist)?_([lr])(?:_|$)/.exec(bone);
  if (m) return m[2] === 'l' ? 'arm_l' : 'arm_r';
  m = /^(thigh|calf|foot|ball)(?:_twist)?_([lr])$/.exec(bone);
  if (m) return m[2] === 'l' ? 'leg_l' : 'leg_r';
  return 'torso';
}

const PAIRS: [Region, Region][] = [['arm_l', 'torso'], ['arm_r', 'torso'], ['arm_l', 'arm_r'], ['leg_l', 'leg_r'], ['arm_l', 'leg_l'], ['arm_r', 'leg_r']];
/** Viên nang thân: [xương đầu, xương cuối, bán kính ở chiều cao 1,8 m]. */
const CAPS: [string, string, number][] = [['pelvis', 'spine_01', 0.11], ['spine_01', 'spine_03', 0.13], ['spine_03', 'neck_01', 0.1]];
for (const sd of ['l', 'r']) CAPS.push([`thigh_${sd}`, `calf_${sd}`, 0.085], [`calf_${sd}`, `foot_${sd}`, 0.06], [`upperarm_${sd}`, `lowerarm_${sd}`, 0.05], [`lowerarm_${sd}`, `hand_${sd}`, 0.04]);

function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12)));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/** Giao hai tam giác (Möller 1997), bỏ qua đồng phẳng. */
export function triTri(a: THREE.Vector3[], b: THREE.Vector3[]): boolean {
  const n2 = new THREE.Vector3().crossVectors(b[1].clone().sub(b[0]), b[2].clone().sub(b[0]));
  const d2 = -n2.dot(b[0]);
  const da = a.map((p) => n2.dot(p) + d2);
  if ((da[0] > 0 && da[1] > 0 && da[2] > 0) || (da[0] < 0 && da[1] < 0 && da[2] < 0)) return false;
  const n1 = new THREE.Vector3().crossVectors(a[1].clone().sub(a[0]), a[2].clone().sub(a[0]));
  const d1 = -n1.dot(a[0]);
  const db = b.map((p) => n1.dot(p) + d1);
  if ((db[0] > 0 && db[1] > 0 && db[2] > 0) || (db[0] < 0 && db[1] < 0 && db[2] < 0)) return false;
  const dir = new THREE.Vector3().crossVectors(n1, n2);
  if (dir.lengthSq() < 1e-18) return false;
  const ax = Math.abs(dir.x) > Math.abs(dir.y) ? (Math.abs(dir.x) > Math.abs(dir.z) ? 'x' : 'z') : Math.abs(dir.y) > Math.abs(dir.z) ? 'y' : 'z';
  const interval = (v: THREE.Vector3[], d: number[]): [number, number] | null => {
    const p = v.map((q) => q[ax]);
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (d[i] === 0) out.push(p[i]);
      if ((d[i] > 0 && d[j] < 0) || (d[i] < 0 && d[j] > 0)) out.push(p[i] + ((p[j] - p[i]) * d[i]) / (d[i] - d[j]));
    }
    return out.length >= 2 ? [Math.min(...out), Math.max(...out)] : null;
  };
  const i1 = interval(a, da);
  const i2 = interval(b, db);
  if (!i1 || !i2) return false;
  return i1[0] <= i2[1] && i2[0] <= i1[1];
}

export interface Posed {
  /** Đỉnh (thế giới) và vị trí xương theo tên. */
  verts: THREE.Vector3[];
  bones: Map<string, THREE.Vector3>;
}

export interface MeshInfo {
  index: number[];
  regionBase: Region[];
  /** Đỉnh có trọng số lò xo vạt (`dtl_o_skirt*`). */
  skirtW: number[];
}

/** Lấy đỉnh đã skin (thế giới) của một SkinnedMesh và vị trí mọi xương; `rig` đã `updateMatrixWorld`. */
export function pose(mesh: THREE.SkinnedMesh): Posed {
  mesh.updateWorldMatrix(true, false);
  mesh.skeleton.update();
  const n = mesh.geometry.getAttribute('position').count;
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3();
    mesh.getVertexPosition(i, v);
    verts.push(v.applyMatrix4(mesh.matrixWorld));
  }
  const bones = new Map<string, THREE.Vector3>();
  for (const b of mesh.skeleton.bones) bones.set(b.name, b.getWorldPosition(new THREE.Vector3()));
  return { verts, bones };
}

export function meshInfo(mesh: THREE.SkinnedMesh): MeshInfo {
  const g = mesh.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const names = mesh.skeleton.bones.map((b) => b.name);
  const n = si.count;
  const regionBase: Region[] = [];
  const skirtW: number[] = [];
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bw = -1;
    let sk = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      const nm = names[si.getComponent(i, k)];
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, k);
      }
      if (nm.startsWith('dtl_o_skirt')) sk += w;
    }
    regionBase.push(regionOf(names[best]));
    skirtW.push(sk);
  }
  const ib = g.getIndex();
  const index = ib ? Array.from(ib.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i);
  return { index, regionBase, skirtW };
}

/** Vùng vạt (cùng cách chọn với cloth_bake.py): dải z 0,17–0,52 chiều cao ngoài viên nang thân (không tính tay, ngực trên), hoặc có trọng số lò xo vạt. */
export function robeMask(rest: Posed, info: MeshInfo): { mask: boolean[]; height: number } {
  const height = Math.max(...rest.verts.map((v) => v.y));
  const zlo = 0.17 * height;
  const zhi = 0.52 * height;
  const kc = height / 1.8;
  const caps = CAPS.filter(([a]) => !a.startsWith('upperarm') && !a.startsWith('lowerarm') && a !== 'spine_03');
  const mask = rest.verts.map((v, i) => {
    const inside = caps.some(([a, b, r]) => segDist(v, rest.bones.get(a)!, rest.bones.get(b)!) < r * kc);
    return (v.y >= zlo && v.y <= zhi && !inside) || (info.skirtW[i] > 0.01 && v.y >= zlo);
  });
  return { mask, height };
}

function regionsFor(rest: Posed, info: MeshInfo, mask: boolean[]): Region[] {
  const sgn = rest.bones.get('thigh_l')!.x > 0 ? 1 : -1;
  const cx = rest.bones.get('pelvis')!.x;
  return info.regionBase.map((r, i) => (mask[i] ? (((rest.verts[i].x - cx) * sgn > 0 ? 'leg_l' : 'leg_r') as Region) : r));
}

/** Số cặp tam giác chồng nhau (không chung đỉnh) giữa các vùng. */
export function overlapCount(p: Posed, info: MeshInfo, regions: Region[], byPair?: Record<string, number>): number {
  const tris: Record<Region, number[][]> = { arm_l: [], arm_r: [], leg_l: [], leg_r: [], torso: [] };
  for (let t = 0; t < info.index.length; t += 3) {
    const f = [info.index[t], info.index[t + 1], info.index[t + 2]];
    const cnt: Partial<Record<Region, number>> = {};
    for (const v of f) cnt[regions[v]] = (cnt[regions[v]] ?? 0) + 1;
    for (const r of Object.keys(cnt) as Region[]) if ((cnt[r] ?? 0) >= 2) tris[r].push(f);
  }
  const cell = 0.04;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<Region, Map<string, number[]>>();
  const gridOf = (r: Region): Map<string, number[]> => {
    let g = grid.get(r);
    if (g) return g;
    g = new Map();
    tris[r].forEach((f, i) => {
      const box = new THREE.Box3().setFromPoints(f.map((v) => p.verts[v]));
      for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
        for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
          for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
            const k = `${x},${y},${z}`;
            const arr = g!.get(k);
            if (arr) arr.push(i);
            else g!.set(k, [i]);
          }
    });
    grid.set(r, g);
    return g;
  };
  void key;
  let total = 0;
  for (const [ra, rb] of PAIRS) {
    const gb = gridOf(rb);
    const seen = new Set<number>();
    tris[ra].forEach((fa, ia) => {
      const A = fa.map((v) => p.verts[v]);
      const box = new THREE.Box3().setFromPoints(A);
      seen.clear();
      for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
        for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
          for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
            for (const ib of gb.get(`${x},${y},${z}`) ?? []) {
              if (seen.has(ib)) continue;
              seen.add(ib);
              const fb = tris[rb][ib];
              if (fb.some((v) => fa.includes(v))) continue;
              if (triTri(A, fb.map((v) => p.verts[v]))) {
                total++;
                if (byPair) byPair[`${ra}×${rb}`] = (byPair[`${ra}×${rb}`] ?? 0) + 1;
              }
            }
          }
      void ia;
    });
  }
  return total;
}

/** Tập đỉnh nằm trong viên nang thân (hệ số 0,9, như chr_v3.py). */
export function capInside(p: Posed, height: number): boolean[] {
  const kc = height / 1.8;
  const caps = CAPS.map(([a, b, r]) => [p.bones.get(a)!, p.bones.get(b)!, r * kc * 0.9] as const);
  return p.verts.map((v) => caps.some(([a, b, r]) => segDist(v, a, b) < r));
}

export interface PoseScore {
  pose: string;
  pen: number;
  cap: number;
}

/** Điểm của một tư thế so với tư thế nghỉ. */
export function score(label: string, restPen: number, restCap: boolean[], posed: Posed, info: MeshInfo, regions: Region[], height: number): PoseScore {
  const ins = capInside(posed, height);
  let cap = 0;
  for (let i = 0; i < ins.length; i++) if (ins[i] && !restCap[i]) cap++;
  return { pose: label, pen: Math.max(0, overlapCount(posed, info, regions) - restPen), cap };
}

export { regionsFor };
