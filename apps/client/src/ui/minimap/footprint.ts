// Vùng mặt đất camera đang thấy (Chân Cảnh U8): bốn góc màn hình chiếu xuống mặt phẳng y = groundY. Hàm thuần, minimap dùng để
// vẽ hình thang "tầm nhìn" nên hướng bản đồ khớp với hướng camera chéo khóa góc của level.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * Bốn góc (trên-trái, trên-phải, dưới-phải, dưới-trái của màn hình) trên mặt đất, theo thứ tự đi vòng quanh. `fov` là FOV dọc (độ),
 * `aspect` = rộng/cao. Góc nào không chạm đất (tia hướng lên hay song song) bị kéo về `maxDist` mét trước mặt để hình vẫn đóng.
 */
export function groundFootprint(
  pos: V3,
  fwd: V3,
  fovDeg: number,
  aspect: number,
  groundY: number,
  maxDist = 80,
): { x: number; z: number }[] {
  const f = norm(fwd);
  const right = norm(cross(f, { x: 0, y: 1, z: 0 }));
  const up = cross(right, f);
  const th = Math.tan((fovDeg * Math.PI) / 360);
  const out: { x: number; z: number }[] = [];
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const d = norm({
      x: f.x + right.x * sx * th * aspect + up.x * sy * th,
      y: f.y + right.y * sx * th * aspect + up.y * sy * th,
      z: f.z + right.z * sx * th * aspect + up.z * sy * th,
    });
    let k = d.y < -1e-4 ? (groundY - pos.y) / d.y : Infinity;
    if (!(k > 0) || k > maxDist) k = maxDist;
    out.push({ x: pos.x + d.x * k, z: pos.z + d.z * k });
  }
  return out;
}
