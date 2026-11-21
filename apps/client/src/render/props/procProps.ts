// Vật dụng dựng bằng mã (TN-2): dùng tạm cho pháp bảo có cờ `proc` trong artifacts.json, tới khi có GLB dựng từ concept.
// Mỗi món là MỘT lưới gộp, màu theo đỉnh, một vật liệu → một draw call; không texture, không phát sáng.
// Khi GLB vào manifest: bỏ cờ `proc` ở dữ liệu và xóa hàm dựng tương ứng ở đây.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface ProcProp {
  scene: THREE.Object3D;
  dispose(): void;
}

/** Tô một màu cho mọi đỉnh của `g` (thuộc tính `color`), bỏ uv để các mảnh gộp được với nhau. */
function tint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  if (src !== g) g.dispose();
  const n = src.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  src.deleteAttribute('uv');
  return src;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => g.translate(x, y, z);

/** Bảng màu theo concept hồn phiên (`concept-vu-khi/hon_tu_hon_phien`): tím đen, xám tím tro, bạc lạnh, xương, đồng sẫm. */
export const HON_PHIEN_COLORS = {
  cloth: 0x2a2338,
  trim: 0x6e6a8c,
  silver: 0xc9d4e0,
  bone: 0xe6dfc8,
  bronze: 0x5a4630,
  wood: 0x241a16,
} as const;
/** Chiều cao cả cây phiên (mét, trước khi lớp vẽ pháp bảo nhân cỡ). */
export const HON_PHIEN_HEIGHT = 0.62;

/**
 * Hồn phiên: cán thiết mộc, đầu nụ sen bằng xương, đòn ngang, lá phiên đuôi én có viền, ba chuông đồng.
 * Gốc ở chân cán, cán dọc trục Y, lá phiên nằm trong mặt XY và rủ về −Y.
 */
export function hon_phien_geometry(): THREE.BufferGeometry {
  const C = HON_PHIEN_COLORS;
  const H = HON_PHIEN_HEIGHT;
  const parts: THREE.BufferGeometry[] = [];
  // Cán và khâu bịt chân.
  parts.push(tint(at(new THREE.CylinderGeometry(0.011, 0.013, H, 6), 0, H / 2, 0), C.wood));
  parts.push(tint(at(new THREE.CylinderGeometry(0.016, 0.012, 0.03, 6), 0, 0.015, 0), C.bronze));
  // Đầu nụ sen: nụ chính và bốn cánh nhỏ chụm quanh.
  parts.push(tint(at(new THREE.ConeGeometry(0.026, 0.07, 6), 0, H + 0.03, 0), C.bone));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const petal = new THREE.ConeGeometry(0.012, 0.04, 4);
    petal.rotateZ(-0.5).rotateY(a);
    parts.push(tint(at(petal, Math.cos(a) * 0.02, H + 0.005, -Math.sin(a) * 0.02), C.bone));
  }
  // Đòn ngang treo phiên.
  const barY = H - 0.05;
  const bar = new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5);
  bar.rotateZ(Math.PI / 2);
  parts.push(tint(at(bar, 0.09, barY, 0), C.bronze));
  // Lá phiên đuôi én: viền bạc xám phía sau, nền tím đen phía trước (lệch nhẹ theo Z để không trùng mặt).
  const flag = (w: number, h: number, notch: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(w, 0);
    s.lineTo(w, -h);
    s.lineTo(w / 2, -h + notch);
    s.lineTo(0, -h);
    s.closePath();
    return s;
  };
  const trim = new THREE.ShapeGeometry(flag(0.17, 0.4, 0.09));
  parts.push(tint(at(trim, 0.005, barY - 0.004, 0), C.trim));
  const cloth = new THREE.ShapeGeometry(flag(0.146, 0.365, 0.08));
  parts.push(tint(at(cloth, 0.017, barY - 0.014, 0.002), C.cloth));
  const back = new THREE.ShapeGeometry(flag(0.146, 0.365, 0.08));
  back.rotateY(Math.PI);
  parts.push(tint(at(back, 0.163, barY - 0.014, -0.002), C.cloth));
  // Vạch bạc dọc giữa lá phiên (hình học, không phải chữ).
  parts.push(tint(at(new THREE.BoxGeometry(0.008, 0.2, 0.001), 0.09, barY - 0.14, 0.004), C.silver));
  // Ba chuông đồng treo dưới đòn ngang, phía ngoài lá phiên.
  for (let i = 0; i < 3; i++) {
    const x = 0.03 + i * 0.06;
    parts.push(tint(at(new THREE.ConeGeometry(0.012, 0.022, 6), x, barY - 0.016, 0.012), C.bronze));
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('hon_phien: không gộp được lưới');
  merged.computeVertexNormals();
  return merged;
}

const BUILDERS: Readonly<Record<string, () => THREE.BufferGeometry>> = { prop_hon_phien: hon_phien_geometry };

export function hasProcProp(asset: string): boolean {
  return asset in BUILDERS;
}

/** Dựng vật dụng thủ tục theo id asset; null nếu id không có hàm dựng. Người gọi phải `dispose()` khi bỏ. */
export function buildProcProp(asset: string): ProcProp | null {
  const build = BUILDERS[asset];
  if (!build) return null;
  const geo = build();
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = asset;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const scene = new THREE.Group();
  scene.name = asset;
  scene.add(mesh);
  return {
    scene,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
