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
  hitReact(o: HitOpts): void;
  update(dt: number, a: AnimState): void;
  /** Khoảng cách tới người xem (m): chọn LOD và tần số cập nhật animation. Model khối bỏ qua. */
  setViewDistance?(d: number): void;
  dispose(): void;
}

export interface MonsterView extends CharacterView {
  readonly def: MonsterDef;
}

/** `?models=legacy`: luôn dùng model khối (so sánh, hoặc khi model mới lỗi). */
export function legacyModelsRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('models') === 'legacy';
}
