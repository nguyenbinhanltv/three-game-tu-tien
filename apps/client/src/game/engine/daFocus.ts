// Dạ Cảnh (`?style=da`): "lớp tối quanh trận". Khi đang giao chiến, phần khung hình xa người chơi tối dần (hậu kỳ, không thêm draw call),
// để vạch báo và chiêu quanh mình nổi lên. Chỉ là lớp hình; trạng thái giao chiến lấy từ cờ `combat` của camera.
import * as THREE from 'three/webgpu';
import { postParams } from '../../render/post';

/** Tốc độ vào/ra (1/giây): vào nhanh hơn ra để hết trận cảnh sáng lại từ từ. */
export const FOCUS_IN = 3;
export const FOCUS_OUT = 1.2;

const _v = new THREE.Vector3();
let level = 0;

/** Bước mức tối (0..1) về phía `target` theo `dt`; thuần số để kiểm. */
export function stepFocus(cur: number, target: number, dt: number): number {
  const k = Math.min(1, dt * (target > cur ? FOCUS_IN : FOCUS_OUT));
  const next = cur + (target - cur) * k;
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** Gọi mỗi khung khi `?style=da`: chiếu vị trí người chơi ra UV màn hình và cập nhật mức tối. */
export function updateDaFocus(camera: THREE.PerspectiveCamera, dt: number, combat: boolean, x: number, y: number, z: number): void {
  level = stepFocus(level, combat ? 1 : 0, dt);
  postParams.focusDark.value = level;
  if (level <= 0) return;
  _v.set(x, y + 1, z).project(camera);
  // NDC (-1..1, y lên) → UV (0..1, y xuống như `screenUV`).
  postParams.focus.value.set(_v.x * 0.5 + 0.5, 0.5 - _v.y * 0.5);
  postParams.focusAspect.value = camera.aspect;
}

/** Tắt hẳn (đổi level, rời Dạ Cảnh). */
export function resetDaFocus(): void {
  level = 0;
  postParams.focusDark.value = 0;
}
