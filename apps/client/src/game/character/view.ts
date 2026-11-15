import type * as THREE from 'three/webgpu';
import type { MonsterDef } from '@dtl/shared';
import type { HitOpts, HitReact } from '../hitreact';

/** Trạng thái hiển thị một nhân vật/quái nhận mỗi khung (chỉ trình bày, suy từ trạng thái server). */
export interface AnimState {
  /** Tốc độ ngang (m/s). */
  speed: number;
  flying: boolean;
  meditating: boolean;
  dead: boolean;
  casting: boolean;
  airborne: boolean;
  /** Đang giao chiến (quái đuổi/đánh): đứng yên thì dùng tư thế thủ thay vì idle thường. */
  combat?: boolean;
  /** Boss bị ngắt chú hoặc mất thế (cờ MF_STUN). */
  stunned?: boolean;
}

/** Đòn lớn của boss có vùng báo trước (M5-5): `slam` vùng tròn, `sweep` vùng chữ nhật/quạt từ boss. */
export type BossMoveKind = 'slam' | 'sweep';

/**
 * Lớp hiển thị một nhân vật: model khối (`Humanoid`, `MonsterModel`) hoặc model có xương
 * (`SkinnedCharacter`). `EntityManager` chỉ làm việc qua interface này.
 */
export interface CharacterView {
  /** Gốc đặt vào cảnh; vị trí/hướng do `EntityManager` ghi. */
  readonly root: THREE.Group;
  /** Chiều cao (m, đã tính scale) cho nhãn, thanh máu, điểm ngắm. */
  readonly height: number;
  /** Phản ứng trúng đòn (hit-stop, chớp, giật lùi, rung). */
  readonly hit: HitReact;
  /** Ra đòn (một lần). */
  attack(): void;
  /**
   * Phát động tác của một chiêu (pose id, M3-4). Trả false nếu model không có động tác này (gọi `attack()` thay);
   * true nếu đã nhận, kể cả khi bỏ qua vì đang bay/trên không/chết (server không cho ra chiêu). Muốn biết động tác
   * có thật sự phát không thì hỏi `performing(pose)`.
   */
  perform?(pose: string, o?: PerformOpts): boolean;
  /** Bậc phát sáng của vũ khí theo cường hóa (0, 1 từ +7, 2 từ +10); model không hỗ trợ thì bỏ qua. */
  setWeaponGlow?(stage: number): void;
  /** Màu ánh kiếm theo bộ trang bị (hex '#rrggbb'; '' = không); kiếm có ánh nhẹ dù chưa +7. */
  setWeaponTint?(hex: string): void;
  /** Bỏ động tác đang chờ (`delay`) và tắt nhanh động tác chưa tới lúc ra đòn (vd. niệm chú bị phá). */
  cancelPerform?(): void;
  /** Đang phát (hoặc đang chờ phát) động tác `pose`. */
  performing?(pose: string): boolean;
  hitReact(o: HitOpts): void;
  update(dt: number, a: AnimState): void;
  /**
   * Boss vừa thả vùng báo trước: phát động tác đòn lớn sao cho lúc chạm khớp lúc vùng nổ sau `delay` giây.
   * Trả false nếu model không có động tác này.
   */
  bossMove?(kind: BossMoveKind, delay: number): boolean;
  /** Khoảng cách tới người xem (m): chọn LOD và tần số cập nhật animation. Model khối bỏ qua. */
  setViewDistance?(d: number): void;
  /** LOD/bóng/nhịp mixer theo camera và suất LOD0 (EntityManager, M3-9). Model khối bỏ qua. */
  setView?(v: { dist: number; inView: boolean; allowLod0: boolean; self?: boolean }): void;
  dispose(): void;
  /**
   * Cho vệt/hạt theo nhân vật (render/vfx/trail.ts, M4-5); model không có thì không sinh hiệu ứng đó.
   * `steps`: số bước chân khi chạy (tăng mỗi lần chân chạm đất); `attacks`: số lần ra đòn;
   * `hasSword`: có kiếm sau lưng; `grounded`: đang đứng trên đất ở khung gần nhất.
   */
  readonly steps?: number;
  readonly attacks?: number;
  readonly hasSword?: boolean;
  readonly grounded?: boolean;
}

export interface PerformOpts {
  /** Bắt đầu từ giây này của clip (bỏ bớt nhịp chuẩn bị để lúc ra đòn khớp với hiệu ứng vừa tới). */
  from?: number;
  /** Chờ bao lâu (giây) rồi mới phát. */
  delay?: number;
}

export interface MonsterView extends CharacterView {
  readonly def: MonsterDef;
}

/**
 * `?p2e=0`: tắt tinh chỉnh P2-E (tách thân, chân bám đất, nghiêng thân thú) để chụp so sánh trước/sau hoặc khi nghi lỗi.
 * Đọc một lần lúc nạp trang.
 */
export const P2E_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('p2e') === '0';

/** `?models=legacy`: luôn dùng model khối (so sánh, hoặc khi model mới lỗi). */
export function legacyModelsRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('models') === 'legacy';
}
