import * as THREE from 'three/webgpu';
import { groundAt } from '../../base/levelCtx';
import { SIGIL_CIRCLE } from '../../render/vfx/sigil';
import type { Vfx } from './vfx';

/**
 * Thiên Nhãn P4-4: VFX/ánh sáng mặt đất cho chín phòng cầu Cửu Kiều (`kieu_1..9`) ở camera chéo.
 * Chỉ là hình: một vòng phù văn lớn trên sàn đấu trường, mỗi cầu một màu; cầu 9 (Đạp Thiên) thêm hào quang vàng
 * hai vòng dưới chân người chơi, thở chậm. Toàn hình nằm đất, cộng sáng thấp để không che người/mục tiêu.
 */
export const KIEU_ROOM_COLORS = [0xc9a96a, 0xa8c4e0, 0x7fd8b0, 0x6fb7e8, 0xb0c47a, 0xe08fa0, 0xe8905a, 0xe8eef0, 0xffd27a] as const;
/** Màu vành hào quang Đạp Thiên (vàng ấm) và vành ngoài (trắng ngà). */
export const DAP_THIEN_COLORS = [0xffd27a, 0xfff2c4] as const;

/** Bán kính vòng sàn theo bán kính đấu trường (m): lớn nhưng chừa lề, trần 26 m. */
export function kieuRingRadius(bound: number): number {
  return Math.max(6, Math.min(26, bound * 0.42));
}

/** Độ đục "thở" của hào quang theo thời gian `t` (giây): 0,45–0,85. */
export function dapThienPulse(t: number): number {
  return 0.65 + 0.2 * Math.sin(t * 1.6);
}

/** Số cầu từ id level (`kieu_5` → 5), không khớp trả 0. */
export function kieuIndex(levelId: string): number {
  const m = /^kieu_([1-9])$/.exec(levelId);
  return m ? Number(m[1]) : 0;
}

/**
 * Dựng hiệu ứng phòng cầu `n` (1..9) tại tâm đấu trường; `pos` trả vị trí người chơi, `alive` sai (đổi level, thoát) thì dọn.
 */
export function startKieuRoomFx(
  v: Vfx,
  n: number,
  center: { x: number; z: number },
  bound: number,
  pos: (out: THREE.Vector3) => boolean,
  alive: () => boolean,
): void {
  if (n < 1 || n > 9) return;
  const ground = v.sigil(
    SIGIL_CIRCLE,
    center.x,
    center.z,
    0,
    kieuRingRadius(bound),
    0,
    KIEU_ROOM_COLORS[n - 1]!,
    groundAt(center.x, center.z) + 0.1,
  );
  ground.fxA.x = 1;
  ground.fxA.z = 0;
  ground.fxColor.multiplyScalar(0.55);
  const halo =
    n === 9
      ? [DAP_THIEN_COLORS[0], DAP_THIEN_COLORS[1]].map((c, i) => {
          const m = v.sigil(SIGIL_CIRCLE, 0, 0, 0, i === 0 ? 2.2 : 3.4, 0, c, 0);
          m.fxA.x = 1;
          m.fxA.z = 0;
          m.fxColor.multiplyScalar(0.7);
          m.visible = false;
          return m;
        })
      : [];
  const p = new THREE.Vector3();
  let t = 0;
  // Vòng lặp theo đoạn 0,5 s: sống thì tự lên lịch tiếp, hết sống thì trả lưới về pool.
  const seg = (): void =>
    v.add(
      0.5,
      (_k, dt) => {
        t += dt;
        ground.fxOpacity = Math.min(1, t * 1.5) * 0.4;
        if (halo.length && pos(p)) {
          const pulse = dapThienPulse(t);
          halo.forEach((m, i) => {
            m.visible = true;
            m.position.set(p.x, groundAt(p.x, p.z) + 0.14 + i * 0.01, p.z);
            m.fxOpacity = Math.min(1, t * 1.5) * pulse * (i === 0 ? 0.9 : 0.5);
          });
        }
      },
      () => {
        if (alive()) seg();
        else for (const m of [ground, ...halo]) v.drop(m);
      },
    );
  seg();
}
