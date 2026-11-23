// Chỉ báo đồng đội ngoài tầm nhìn (Chân Cảnh U9): hàm thuần, hướng trên màn hình của camera chéo khóa góc.

/**
 * Hướng và khoảng cách từ mình tới đồng đội trên màn hình. `yaw` = yaw camera (camera đặt ở +sin yaw, +cos yaw so với người chơi, nhìn về
 * (−sin yaw, −cos yaw) = phía trên màn hình). `deg`: 0 = lên, 90 = sang phải, theo chiều kim đồng hồ.
 */
export function allyBearing(dx: number, dz: number, yaw: number): { deg: number; dist: number } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const right = dx * c - dz * s; // trục phải của màn hình (c, −s)
  const up = -dx * s - dz * c; // trục lên của màn hình (−s, −c)
  const deg = (Math.atan2(right, up) * 180) / Math.PI;
  return { deg: Math.round((deg + 360) % 360), dist: Math.hypot(dx, dz) };
}
