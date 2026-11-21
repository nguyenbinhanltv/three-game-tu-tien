import type * as THREE from 'three/webgpu';
import type { LocoDir, MonsterDef, SkillTiming } from '@dtl/shared';
import type { HitOpts, HitReact } from '../combat/hitreact';
import { FLAGS, readFlags } from '../../base/flags';

/** Trạng thái hiển thị một nhân vật/quái nhận mỗi khung (chỉ trình bày, suy từ trạng thái server). */
export interface AnimState {
  /** Tốc độ ngang (m/s). */
  speed: number;
  flying: boolean;
  /** Ngự không (E3-K): đang bay mà không cần kiếm (Nguyên Anh, trong 30 m so với mặt đất). */
  sky?: boolean;
  meditating: boolean;
  dead: boolean;
  casting: boolean;
  airborne: boolean;
  /** Đang giao chiến (quái đuổi/đánh): đứng yên thì dùng tư thế thủ thay vì idle thường. */
  combat?: boolean;
  /** Hướng đi so với hướng nhìn (K-4): đi lùi/ngang khi nhân vật nhìn mục tiêu. Bỏ trống = đi tới. */
  moveDir?: LocoDir;
  /** Góc hướng đi so với hướng nhìn (rad, 0 = tới, +π/2 = trái, ±π = lùi), liên tục: nhân vật v3 trộn 8 hướng. Bỏ trống = 0. */
  moveAngle?: number;
  /** Điểm nhìn (thế giới) của mục tiêu đang chọn: nhân vật v3 quay đầu nhìn theo, giới hạn góc. */
  lookAt?: { x: number; y: number; z: number };
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
  attack(o?: AttackOpts): void;
  /**
   * Phát động tác của một chiêu (pose id, M3-4). Trả false nếu model không có động tác này (gọi `attack()` thay);
   * true nếu đã nhận, kể cả khi bỏ qua vì đang bay/trên không/chết (server không cho ra chiêu). Muốn biết động tác
   * có thật sự phát không thì hỏi `performing(pose)`.
   */
  perform?(pose: string, o?: PerformOpts): boolean;
  /** Bậc phát sáng của vũ khí theo cường hóa (0, 1 từ +7, 2 từ +10); model không hỗ trợ thì bỏ qua. */
  setWeaponGlow?(stage: number): void;
  /** Thể tu: tay không, găng + giáp nhẹ (model không hỗ trợ thì bỏ qua). */
  setBrawlerGear?(on: boolean): void;
  /** Màu ánh kiếm theo bộ trang bị (hex '#rrggbb'; '' = không); kiếm có ánh nhẹ dù chưa +7. */
  setWeaponTint?(hex: string): void;
  /** Bỏ động tác đang chờ (`delay`) và tắt nhanh động tác chưa tới lúc ra đòn (vd. niệm chú bị phá). */
  cancelPerform?(): void;
  /** Di chuyển/lướt hủy phần thu về của động tác chiêu đang phát, nếu đã qua mốc hủy trong dữ liệu chiêu (K-4). */
  cancelRecovery?(kind: 'move' | 'dash'): boolean;
  /** Lướt hiển thị: hình bắt đầu ở (fromX, fromZ) thế giới rồi trượt về vị trí thật trong `dur` giây (K-4). */
  dashFrom?(fromX: number, fromZ: number, dur: number): void;
  /** Bị hất ngã rồi đứng dậy (K-4). */
  knockdown?(): void;
  /** Đồng hồ animation chiêu đang phát (K-6): bùng nổ VFX hẹn theo đồng hồ này để khớp hitAt kể cả khi hit-stop. */
  performClock?(): { t: number; skill: string } | null;
  /** Nghe sự kiện chiêu (K-4). */
  onSkillEvent?: ((e: SkillEvent) => void) | null;
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
  /** Gốc và mũi lưỡi kiếm (thế giới) nếu kiếm đang cầm tay (K-6). */
  bladePoints?(base: THREE.Vector3, tip: THREE.Vector3): boolean;
  readonly grounded?: boolean;
}

/** Sự kiện từ máy trạng thái chiêu (K-4), phát đúng khung hình: VFX, âm thanh, rung camera đăng ký ở đây (K-6, K-7). */
export interface SkillEvent {
  kind: 'windup' | 'hit' | 'recovery' | 'cancel' | 'end';
  /** Id chiêu (rỗng nếu động tác không gắn chiêu). */
  skill: string;
  /** Mốc `hitAt` thứ mấy (0-based) khi `kind` = 'hit'; còn lại là số mốc đã qua. */
  index: number;
  /** Đòn thứ mấy của chuỗi đánh thường (0-based), -1 nếu không phải chuỗi. */
  combo: number;
  /** Giây kể từ lúc bấm (theo đồng hồ animation, dừng khi khựng hit-stop). */
  t: number;
  /** Đòn đẩy lùi (đòn cuối chuỗi). */
  kb: boolean;
  /** Chỉ ở `windup`: số giây (đồng hồ animation) còn lại tới mốc `hitAt` đầu tiên, để lên lịch tiếng vung (K-7). */
  hitIn?: number;
}

/** Đòn dự phòng (clip của asset, không có pose chiêu): thông tin để phát sự kiện `windup`/`hit` đúng khung (NV3-A3). */
export interface AttackOpts {
  skill?: string;
  combo?: number;
  kb?: boolean;
}

export interface PerformOpts {
  /** Thời gian của chiêu (từ dữ liệu) để máy trạng thái phát sự kiện `hitAt` và cắt thu về khi di chuyển/lướt (K-4). */
  timing?: SkillTiming;
  skill?: string;
  /** Đòn thứ mấy của chuỗi đánh thường. */
  combo?: number;
  /** Tầm lao người hiển thị (m) về phía trước trong lúc vung (xem `lungeReach`). */
  reach?: number;
  /** Bắt đầu từ giây này của clip (bỏ bớt nhịp chuẩn bị để lúc ra đòn khớp với hiệu ứng vừa tới). */
  from?: number;
  /** Chờ bao lâu (giây) rồi mới phát. */
  delay?: number;
}

export interface MonsterView extends CharacterView {
  readonly def: MonsterDef;
}

/** `?models=legacy`: luôn dùng model khối (so sánh, hoặc khi model mới lỗi). */
export function legacyModelsRequested(search?: string): boolean {
  return (search === undefined ? FLAGS : readFlags(search)).legacyModels;
}
