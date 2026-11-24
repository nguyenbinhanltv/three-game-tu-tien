// Hàm thuần của phòng thử animation (không đụng store/DOM) để test trong Node.

export type LabCam = 'iso' | 'close' | 'front' | 'side';

export interface CamPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

/**
 * Camera cận quanh một người đứng ở (px, py, pz) cao `h` m. `bearing` là hướng ngang (rad) từ người tới camera (lấy từ camera chéo hiện tại cho
 * `close`; cộng thêm π/2, π cho `side`, `front` do hướng nhìn của nhân vật). Cận để thấy tay, kiếm, mặt: FOV 28°, cách ~3,6 m.
 */
export function closeCam(px: number, py: number, pz: number, h: number, bearing: number, dist = 3.6): CamPose {
  return {
    x: px + Math.sin(bearing) * dist,
    y: py + h * 0.82,
    z: pz + Math.cos(bearing) * dist,
    tx: px,
    ty: py + h * 0.55,
    tz: pz,
    fov: 28,
  };
}

/** Các mốc tự chụp quanh một đòn (ms so với `hit[0]`): dồn lực, đỉnh đòn, +30 ms (khung giữ), thu đòn. */
export function keyMoments(hit: number, dur: number): { name: string; at: number }[] {
  const h = Math.max(0.05, hit);
  return [
    { name: 'dolu', at: Math.max(0, h * 0.45) },
    { name: 'dinh', at: h },
    { name: 'p30', at: h + 0.03 },
    { name: 'thu', at: Math.min(dur - 0.02, h + (dur - h) * 0.6) },
  ];
}
