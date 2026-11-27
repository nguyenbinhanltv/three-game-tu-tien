// Nâng tấm hiệu ứng nằm đất lên trên điểm cao nhất quanh nó (tách riêng để `vfx.ts` và `fxTimeline.ts` cùng dùng mà không vòng import).
import { groundAt } from '../../base/levelCtx';

/** Độ cao đặt tấm pháp trận bán kính `r` quanh (x, z) để không chìm dưới đất: điểm cao nhất trong 8 hướng ở mép và giữa bán kính, cộng 0,12 m. */
export function sigilGroundY(x: number, z: number, r: number, ground: (x: number, z: number) => number = groundAt): number {
  let y = ground(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    y = Math.max(y, ground(x + sx * r, z + cz * r), ground(x + sx * r * 0.5, z + cz * r * 0.5));
  }
  return y + 0.12;
}
