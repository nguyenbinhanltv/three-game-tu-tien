// R-8: tách từ game/vfx.ts (hàm nhận `v: Vfx`, trước là phương thức của lớp Vfx).
import { groundAt } from '../../../base/levelCtx';
import { SIGIL_CIRCLE } from '../../../render/vfx/sigil';
import { hazardFlash, hazardStack, hazardStyle } from '../../../render/vfx/phases';
import { G } from '../../core/geo';
import { HAZARD_COLORS, HOT_BOLT, HOT_BOLT_CORE, POOL_COLOR, TRAIL_COLOR, _a } from './common';
import type { Vfx } from '../vfx';

/**
 * Vũng độc khi quái chết (E3-G): vạch báo tròn `delay` giây (như vùng nguy hiểm), rồi vũng ngọc lục nhấp nháy `dur` giây.
 * Chỉ vẽ: ai đứng trong vũng chịu sát thương nhỏ mỗi nhịp là việc của server.
 */
export function venomPool(v: Vfx, x: number, z: number, r: number, delay: number, dur: number, kind: string): void {
  v.hazard(x, z, r, delay, kind, undefined, 0, false);
  const y = groundAt(x, z);
  let top = y;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    top = Math.max(top, groundAt(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7));
  }
  v.add(
    delay,
    () => {},
    () => {
      const m = v.sigil(SIGIL_CIRCLE, x, z, 0, r, 0, POOL_COLOR, Math.min(top, y + 1.2) + 0.12);
      m.fxColor.multiplyScalar(0.7);
      v.add(
        dur,
        (k) => {
          m.fxA.x = 1;
          m.fxA.z = 0;
          m.fxOpacity = Math.min(1, k * 8) * Math.min(1, (1 - k) * 5) * (0.55 + 0.15 * Math.sin(k * dur * 5));
        },
        () => v.drop(m),
      );
    },
  );
}

/**
 * Vệt lửa (một vũng của chuỗi dọc đường chém, DV-2 đợt 4): hiện lúc vạch nổ, tồn tại `dur` giây rồi tắt dần, nhấp nháy ngọn lửa.
 * Không có vòng báo riêng (vạch chữ nhật của đường chém đã báo). Chỉ vẽ: ai đứng trong vệt chịu sát thương dần là việc của server.
 */
export function trailPool(v: Vfx, x: number, z: number, r: number, delay: number, dur: number): void {
  const y = groundAt(x, z);
  let top = y;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    top = Math.max(top, groundAt(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7));
  }
  const ph = x * 1.7 + z * 2.3;
  v.add(
    delay,
    () => {},
    () => {
      const m = v.sigil(SIGIL_CIRCLE, x, z, 0, r * 1.05, 0, TRAIL_COLOR, Math.min(top, y + 1.2) + 0.14);
      m.fxColor.multiplyScalar(0.9);
      v.add(
        dur,
        (k) => {
          m.fxA.x = 1;
          m.fxA.z = 0;
          const flick = 0.7 + 0.3 * Math.sin(k * dur * 9 + ph) * Math.sin(k * dur * 5.3 + ph * 0.6);
          // Tắt dần ở 1,5 giây cuối để người chơi biết sắp hết.
          m.fxOpacity = Math.min(1, k * 10) * Math.min(1, ((1 - k) * dur) / 1.5) * flick * 0.85;
        },
        () => v.drop(m),
      );
    },
  );
}

/** Vùng nguy hiểm tròn báo trước trên mặt đất (pháp trận), rồi đánh xuống. */
export function hazard(
  v: Vfx,
  x: number,
  z: number,
  r: number,
  delay: number,
  kind: string,
  seed?: number,
  flash = 0,
  boss = false,
  hot = false,
  quiet?: () => boolean,
): void {
  const y = groundAt(x, z);
  const style = hazardStyle(kind, boss);
  const color = kind === 'lightning' ? (hot ? HOT_BOLT : (HAZARD_COLORS[kind] ?? style.color)) : style.color;
  // Mặt đất không phẳng: nâng theo điểm cao nhất quanh vòng (giới hạn để không lơ lửng quá).
  let top = y;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    top = Math.max(top, groundAt(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7));
  }
  // Nhiều quái cùng đặt vùng lên một chỗ (hạ/kéo cả bầy tinh anh): các lớp cộng sáng chồng nhau thành mảng trắng, nên mờ theo số vùng chồng.
  const mine = { x, z, r };
  const stack = hazardStack(v.hazards, mine);
  v.hazards.push(mine);
  const m = v.sigil(SIGIL_CIRCLE, x, z, 0, r, 0, color, Math.min(top, y + 1.2) + 0.22);
  m.fxColor.multiplyScalar((kind !== 'lightning' ? style.gain : 1) * stack.dim);
  v.add(
    delay,
    (k) => {
      m.fxA.x = k;
      m.fxA.z = hazardFlash(k, delay) * stack.dim;
      m.fxOpacity = Math.min(1, k * 10);
    },
    () => {
      v.hazards.splice(v.hazards.indexOf(mine), 1);
      v.drop(m);
      // `quiet` (V5): gọi lúc nổ; trả true khi timeline `mon_boom_*` (game/monFx.ts) thật sự đã vẽ nổ thì không vẽ hình cũ chồng lên.
      // Vùng chồng lên nhau (`stack.fx` false) không vẽ nổ như cũ (tránh cộng sáng thành mảng trắng); vùng đầu tiên mới dùng timeline mới.
      if (!stack.fx) return;
      if (quiet?.()) return;
      if (kind === 'lightning') {
        // Mỗi đòn sét chớp sáng cả cảnh (tối thiểu 0,3) và tia dày hơn (DUN-1 PR7).
        v.lightning(x, y, z, hot ? HOT_BOLT_CORE : 0xe2d4ff, 1.2, seed, Math.max(flash, 0.3) * stack.dim, 1.5);
      } else if (kind !== 'frost') {
        _a.set(x, y + 0.5, z);
        v.burst(_a, color, r * 1.1, 0.45);
      } else {
        _a.set(x, y + 0.5, z);
        v.burst(_a, 0xaee8ff, r * 0.9, 0.5);
        // Gai băng trồi lên.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rr = i === 0 ? 0 : r * 0.55;
          const spike = v.fx(G.cone6, 0xcdf3ff, 0.85, 'solid');
          const sx = x + Math.cos(a) * rr;
          const sz = z + Math.sin(a) * rr;
          const sy = groundAt(sx, sz);
          const hgt = 2.2 + Math.random() * 2;
          v.add(
            0.7,
            (k) => {
              const up = Math.min(1, k * 5);
              spike.position.set(sx, sy + (hgt * up) / 2 - 0.2, sz);
              spike.scale.set(0.5, hgt * up, 0.5);
              spike.fxOpacity = 0.85 * (1 - Math.max(0, k - 0.5) * 2);
            },
            () => v.drop(spike),
          );
        }
      }
    },
  );
}
