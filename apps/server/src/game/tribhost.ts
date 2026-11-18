// Giao diện host của hệ độ kiếp (R-7, tách từ trib.ts để trib/tribmech/tribnhan không import vòng).
import type { FxMsg, HazardGeom, HazardKind, HazardMsg } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './entities';
import type { GuardCfg } from './tribtypes';

/** Tham số thêm của vùng nguy hiểm: kiểu vạch (`pool` = dấu hiệu), thời gian tồn tại, trận môn khắc chế (người đứng trong đó giảm `cut`, cờ `ke`). */
export interface HazardExtra {
  mv?: HazardMsg['mv'];
  dur?: number;
  seal?: { x: number; z: number; r: number; cut: number };
  /** Luôn trúng chủ kiếp bất kể vị trí (không né bằng cách rời sân). */
  reach?: boolean;
}

export interface TribHost {
  now(): number;
  addHazard(g: HazardGeom, delay: number, dmg: number, pct: boolean, kind: HazardKind, src: string, atk?: number, lock?: boolean, grp?: number, guard?: GuardCfg, cut?: { mul: number; max: number }, hot?: boolean, extra?: HazardExtra): void;
  /** Gây sát thương cho `p` (đã tính giảm; `ke` = đứng đúng trận môn khắc chế). */
  damage(p: PlayerEnt, n: number, ke?: 1 | -1): void;
  fx(m: FxMsg): void;
  isDead(p: PlayerEnt): boolean;
  nextGrp(): number;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o?: { dyaw?: number; level?: number }): MonEnt | null;
  /** Bóng tâm ma còn sống của `p`. */
  aliveShadows(p: PlayerEnt): number;
  /** Một bóng tâm ma còn sống của `p` (null nếu không còn). */
  shadowOf(p: PlayerEnt): MonEnt | null;
  /** Kết thúc kiếp (thành công khi hết giờ). */
  end(p: PlayerEnt, success: boolean): void;
  /** Nhật Thực Kiếp: gọi quái kiếp trước mặt người độ kiếp (null nếu không dựng được), gỡ quái, làm quái mất thế, hồi máu người. */
  spawnBoss(p: PlayerEnt, id: string, dist: number): MonEnt | null;
  removeMonster(m: MonEnt): void;
  stunMonster(m: MonEnt, sec: number): void;
  heal(p: PlayerEnt, n: number): void;
}
