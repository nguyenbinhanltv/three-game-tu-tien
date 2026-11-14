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
}

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
  /** Bỏ động tác đang chờ (`delay`) và tắt nhanh động tác chưa tới lúc ra đòn (vd. niệm chú bị phá). */
  cancelPerform?(): void;
  /** Đang phát (hoặc đang chờ phát) động tác `pose`. */
  performing?(pose: string): boolean;
  hitReact(o: HitOpts): void;
  update(dt: number, a: AnimState): void;
  /** Khoảng cách tới người xem (m): chọn LOD và tần số cập nhật animation. Model khối bỏ qua. */
  setViewDistance?(d: number): void;
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

/** `?models=legacy`: luôn dùng model khối (so sánh, hoặc khi model mới lỗi). */
export function legacyModelsRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('models') === 'legacy';
}
