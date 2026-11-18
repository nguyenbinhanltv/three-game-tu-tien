// R-8: tách từ game/vfx.ts (hàm nhận `v: Vfx`, trước là phương thức của lớp Vfx).
import { PARTICLES } from '../../render/vfx/particles';
import { SwordRainFx } from '../../render/vfx/swordRain';
import * as THREE from 'three/webgpu';
import { FxPool, type FxMesh } from '../../render/materials/vfx';
import { BoltGeometry, boltShape, type BoltShape } from '../../render/vfx/lightning';
import { type InkTiming } from '../../render/vfx/ink';

export interface Fx {
  t: number;
  dur: number;
  /** k = tiến độ 0..1. */
  update(k: number, dt: number): void;
  end(): void;
}

export type PosFn = (out: THREE.Vector3) => boolean;

export const HOT_BOLT = 0xff9a5a;
export const HOT_BOLT_CORE = 0xffc89a;
export const _a = new THREE.Vector3();
export const _b = new THREE.Vector3();
export const _c = new THREE.Vector3();
export const _q = new THREE.Quaternion();
export const _up = new THREE.Vector3(0, 1, 0);
export const UP = new THREE.Vector3(0, 1, 0);
export const AX_X = new THREE.Vector3(1, 0, 0);
export const AX_Z = new THREE.Vector3(0, 0, 1);
/** Tâm hình của lưới cung (SLASH_GEO) theo tọa độ lưới, để đặt dấu chém đúng giữa mục tiêu. */
export const SLASH_CENTER = new THREE.Vector3(0, 0, -0.33);

/**
 * Hướng lưới cung. `stand`: dựng cung vào mặt phẳng vuông góc với hướng `yaw` (thấy trọn hình trăng
 * khi nhìn dọc theo `yaw`), `roll` xoay cung trong mặt phẳng đó, `lean` ngả mặt phẳng về phía trước.
 * Không `stand`: cung nằm ngang, `roll` nghiêng quanh trục tới.
 */
export function orientSlash(q: THREE.Quaternion, yaw: number, roll: number, stand: boolean, lean = 0): void {
  q.setFromAxisAngle(UP, yaw);
  if (lean) q.multiply(_q.setFromAxisAngle(AX_X, lean));
  q.multiply(_q.setFromAxisAngle(AX_Z, roll));
  if (stand) q.multiply(_q.setFromAxisAngle(AX_X, -Math.PI / 2));
}

/** Màu vùng báo trước theo loại đòn (dùng chung cho vùng tròn và telegraph.ts). */
export const HAZARD_COLORS: Record<string, number> = {
  lightning: 0xb48cff,
  frost: 0x9fe4ff,
  fire: 0xffa060,
  spirit: 0xd8f0ff,
};

export const RING_GEO = new THREE.RingGeometry(0.82, 1, 48);
/** Số món rơi đồng thời tối đa còn đủ cột sáng/vòng/lõi (hạ cả bầy một lượt, tránh cộng sáng thành mảng trắng). */
export const LOOT_FX_MAX = 8;
export const TUBE_GEO = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);

/** Một vết mực đang nằm trên đất (M4-14). */
export interface InkMark {
  m: FxMesh;
  t: number;
  T: InkTiming;
  /** Đã bị ép tan sớm vì vượt MAX_INK: tiến độ tan nhanh 0..1 (0 = không bị ép). */
  forced: number;
}

/** Bộ đệm tia sét (lưới + hình) giữ lại giữa các lần đánh: phát không cấp phát. */
export interface Bolt {
  geo: BoltGeometry;
  shape: BoltShape;
}
export const BOLTS: Bolt[] = [];
export const takeBolt = (): Bolt => BOLTS.pop() ?? { geo: new BoltGeometry(), shape: boltShape(0) };
for (let i = 0; i < 6; i++) BOLTS.push(takeBolt());

/** Mưa kiếm (M4-2): lưới instanced dùng chung cho mọi `Vfx`. */
export const RAIN = new SwordRainFx(PARTICLES);

/** Màu mây kiếp: lam tím rất tối (không đen tuyền). */
export const CLOUD_COLOR = 0x2b2840;

/**
 * Pool lưới hiệu ứng dùng chung cho mọi `Vfx` (sống qua các lần đổi room). Mỗi lưới dùng material
 * TSL dùng chung theo kiểu (render/materials/vfx.ts); màu/độ trong là dữ liệu của lưới. 96 lưới
 * ấm sẵn đủ cho một trận đông bình thường; pool chỉ lớn thêm khi vượt mức đó rồi giữ lại.
 */
export const POOL = new FxPool(96);

/** Hệ hiệu ứng: mỗi hiệu ứng là vài lưới phát sáng sống trong thời gian ngắn. */
/** Màu vũng độc khi chết (ngọc lục, Bích Ngọc Kim Thiền). */
export const POOL_COLOR = 0x5fe39a;
/** Vệt lửa dọc đường chém (DV-2 đợt 4): cam than hồng, nhấp nháy mạnh; HDR dưới `FX_MAX_HDR`. */
export const TRAIL_COLOR = 0xff7a30;

/** Số vũng sét tối đa cùng lúc. */
export const STRIKE_POOL_MAX = 2;
