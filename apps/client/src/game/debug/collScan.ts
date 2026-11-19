import * as THREE from 'three/webgpu';

/**
 * Thu thập vật thể có hình trong cảnh để công cụ quét va chạm (COL-1 / C-0, `pnpm shots collscan`) so với collider shared.
 * Chỉ đọc cảnh, không đổi gì. Duyệt mọi `Mesh` và từng instance của `InstancedMesh` (cây rải, prop, kiến trúc dựng bằng instance),
 * trả hộp bao thế giới (AABB) kèm tên đường dẫn trong cây cảnh. Bỏ qua thứ không cần va chạm: cỏ, hoa, hạt, lá rơi, decal nền,
 * mây, sương, địa hình (lưới tile), bầu trời, hiệu ứng, thực thể động (người/quái).
 */
export interface ScanItem {
  /** Đường dẫn tên ngắn gọn (nhóm cha > mesh) để gom theo loại vật. */
  path: string;
  /** Instance thứ mấy (-1 nếu không phải InstancedMesh). */
  i: number;
  x: number;
  z: number;
  y0: number;
  y1: number;
  /** Cạnh AABB theo x, z. */
  w: number;
  d: number;
  /** Số tam giác của hình (để biết vật to hay chi tiết nhỏ). */
  tris: number;
  /** Lưới gộp một khối lớn (không phải instance): không tách được từng vật, báo riêng (vd. chunk rừng thẻ). */
  merged?: boolean;
}

/** Tên (đoạn đường dẫn) cho thấy vật không cần va chạm. */
export const SCAN_SKIP =
  /grass|flower|petal|particle|leaf|leaves|cloud|mist|fog|sky|star|rain|snow|dust|canopy|duong_xi|prop_kiem_thanh_phong|mapvis|mote|ray|aurora|decal|trail|shadow|water|pond|lake|terrain|chunk|ground|backdrop|firefl|butterfl|bird|ambient|beacon|rune|glow|aura|vfx|fx|bolt|hazard|ring|sprite|label|marker|nameplate|player|chr_|rig|monster|npc|loot|damage|debug|impostor|billow|haze|veil|smoke|spark|wisp/i;

const _box = new THREE.Box3();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

function boundsOf(geo: THREE.BufferGeometry): THREE.Box3 | null {
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox;
}

function trisOf(geo: THREE.BufferGeometry): number {
  return Math.round((geo.index ? geo.index.count : (geo.attributes.position?.count ?? 0)) / 3);
}

/** Tên có nghĩa của một node (bỏ tên rỗng/mặc định). */
function nm(o: THREE.Object3D): string {
  return o.name && !/^(Group|Mesh|Object3D)$/i.test(o.name) ? o.name : '';
}

export interface ScanOpts {
  /** Chỉ lấy vật trong hộp (x0,z0,x1,z1) — giới hạn theo vùng chơi. */
  box?: { x0: number; z0: number; x1: number; z1: number };
  /** Tối đa số instance mỗi InstancedMesh (cây rải có thể hàng nghìn). */
  maxPerMesh?: number;
}

export function collectScene(root: THREE.Object3D, opts: ScanOpts = {}): ScanItem[] {
  const out: ScanItem[] = [];
  const maxPer = opts.maxPerMesh ?? 20000;
  const walk = (o: THREE.Object3D, path: string, skip: boolean): void => {
    const name = nm(o);
    const p = name ? (path ? path + '>' + name : name) : path;
    const sk = skip || (name !== '' && SCAN_SKIP.test(name)) || o.visible === false;
    if (sk) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const bb = boundsOf(mesh.geometry);
      if (bb) {
        const tris = trisOf(mesh.geometry);
        const im = o as THREE.InstancedMesh;
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        const mn = Array.isArray(mat) ? (mat[0]?.name ?? '') : (mat?.name ?? '');
        if (!SCAN_SKIP.test(mn)) {
          const pathFull = p || '(mesh)';
          if (im.isInstancedMesh) {
            const n = Math.min(im.count, maxPer);
            for (let k = 0; k < n; k++) {
              im.getMatrixAt(k, _m);
              _m.premultiply(o.matrixWorld);
              push(out, pathFull, k, bb, _m, tris, opts);
            }
          } else {
            push(out, pathFull, -1, bb, o.matrixWorld, tris, opts);
            const last = out[out.length - 1];
            if (last && (last.tris > 4000 || Math.max(last.w, last.d) > 40)) last.merged = true;
          }
        }
      }
    }
    for (const c of o.children) walk(c, p, sk);
  };
  walk(root, '', false);
  return out;
}

function push(out: ScanItem[], path: string, i: number, bb: THREE.Box3, m: THREE.Matrix4, tris: number, opts: ScanOpts): void {
  _box.makeEmpty();
  for (let c = 0; c < 8; c++) {
    _v.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(m);
    _box.expandByPoint(_v);
  }
  if (_box.isEmpty()) return;
  const x = (_box.min.x + _box.max.x) / 2;
  const z = (_box.min.z + _box.max.z) / 2;
  const b = opts.box;
  if (b && (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1)) return;
  const r = (n: number): number => Math.round(n * 100) / 100;
  out.push({
    path,
    i,
    x: r(x),
    z: r(z),
    y0: r(_box.min.y),
    y1: r(_box.max.y),
    w: r(_box.max.x - _box.min.x),
    d: r(_box.max.z - _box.min.z),
    tris,
  });
}

/** Cấu trúc cảnh rút gọn (tên, loại, số con, instance) tới độ sâu `depth`: để chỉnh bộ lọc/tên nhóm của công cụ quét. */
export function sceneTree(root: THREE.Object3D, depth: number, maxKids = 60): string[] {
  const lines: string[] = [];
  const walk = (o: THREE.Object3D, d: number): void => {
    const im = o as THREE.InstancedMesh;
    const meshes = o.children.filter((c) => (c as THREE.Mesh).isMesh).length;
    lines.push(
      `${'  '.repeat(d)}${o.name || '·'} [${o.type}] kids=${o.children.length} meshes=${meshes}${im.isInstancedMesh ? ' inst=' + im.count : ''}${o.visible ? '' : ' HIDDEN'}`,
    );
    if (d < depth) for (const c of o.children.slice(0, maxKids)) walk(c, d + 1);
  };
  walk(root, 0);
  return lines;
}
