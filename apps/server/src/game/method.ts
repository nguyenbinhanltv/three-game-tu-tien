// Công pháp (Phase 3-5), phần không đụng tới sim: trạng thái chạy, đọc/ghi `characters.meta`, tin đồng bộ.
// Luật nằm ở packages/shared/src/methods.ts; sim.ts chỉ gọi các hàm này tại các điểm móc.

import {
  clampSkillLevel,
  CHARGE_MAX,
  MAX_SKILL_LEVEL,
  migrateSkillKeys,
  resolveSkill,
  type MethodDef,
  type MethodMsg,
  type MethodPassive,
  type ResolvedSkill,
  type SkillDef,
  type VariantId,
} from '@dtl/shared';
import { METHOD, SKILL, VARIANTS } from '@dtl/content';

/** Phần công pháp lưu trong `characters.meta` (JSON). Không cần đổi bảng DB. */
export interface MethodMeta {
  method?: string;
  /** id chiêu → cấp (chỉ lưu cấp > 1). */
  skillLv?: Record<string, number>;
  /** id chiêu → biến thức đã chọn. */
  skillVar?: Record<string, VariantId>;
  /** Lần đổi công pháp gần nhất (ms, giờ server) để chống đổi dồn. */
  methodAt?: number;
}

/** Làm sạch phần công pháp của meta khi đọc từ DB (dữ liệu hỏng/cũ: bỏ phần lạ). */
export function sanitizeMethodMeta(meta: MethodMeta): void {
  if (typeof meta.method !== 'string' || !METHOD.has(meta.method)) delete meta.method;
  // Chiêu đổi id (K-2): giữ cấp và biến thức theo id mới.
  migrateSkillKeys(meta.skillLv);
  migrateSkillKeys(meta.skillVar);
  const lv: Record<string, number> = {};
  if (meta.skillLv && typeof meta.skillLv === 'object') {
    for (const [id, n] of Object.entries(meta.skillLv)) {
      if (SKILL.has(id) && typeof n === 'number' && n > 1) lv[id] = clampSkillLevel(n);
    }
  }
  meta.skillLv = lv;
  const vr: Record<string, VariantId> = {};
  if (meta.skillVar && typeof meta.skillVar === 'object') {
    for (const [id, v] of Object.entries(meta.skillVar)) {
      if (VARIANTS[id] && (v === 'a' || v === 'b')) vr[id] = v;
    }
  }
  meta.skillVar = vr;
  if (typeof meta.methodAt !== 'number' || !Number.isFinite(meta.methodAt)) delete meta.methodAt;
}

export function methodOf(meta: MethodMeta): MethodDef | undefined {
  return meta.method ? METHOD.get(meta.method) : undefined;
}

export function passiveOf(meta: MethodMeta): MethodPassive | undefined {
  return methodOf(meta)?.passive;
}

export function skillLevelOf(meta: MethodMeta, id: string): number {
  return clampSkillLevel(meta.skillLv?.[id] ?? 1);
}

/** Phòng ngự cộng thêm theo công pháp (Kim Thân). */
export function methodDefMul(meta: MethodMeta): number {
  const p = passiveOf(meta);
  return p?.kind === 'the' ? (p.defMul ?? 0) : 0;
}

/** Chiêu `skill` của người có `meta`, đã gộp cấp và biến thức. */
export function resolveFor(meta: MethodMeta, skill: SkillDef): ResolvedSkill {
  return resolveSkill(skill, skillLevelOf(meta, skill.id), VARIANTS[skill.id], meta.skillVar?.[skill.id]);
}

export function setSkillLevel(meta: MethodMeta, id: string, lv: number): void {
  const n = Math.min(MAX_SKILL_LEVEL, Math.max(1, lv));
  meta.skillLv ??= {};
  if (n > 1) meta.skillLv[id] = n;
  else delete meta.skillLv[id];
}

/** Hồi theo thời gian đang chạy trên một người chơi (Xuân Phong Hóa Vũ, Hồi Nguyên biến thức B). */
export interface Hot {
  sid: string;
  nextAt: number;
  endAt: number;
  /** Lượng hồi mỗi giây. */
  per: number;
}

/** Vệt kiếm khí trên đất (Kiếm Khí Trảm biến thức B). */
export interface Trail {
  owner: string;
  x: number;
  z: number;
  r: number;
  nextAt: number;
  endAt: number;
  /** Hệ số sát thương mỗi nhịp (đã nhân sức mạnh chiêu). */
  power: number;
}

/** Trạng thái chạy của người chơi (không lưu DB: kiếm ý/thế/sạc mất khi thoát). */
export class MethodRt {
  /** Kiếm ý hoặc thế (cùng một chỗ vì mỗi người chỉ có một công pháp). */
  stacks = 0;
  stackAt = 0;
  /** Vòng sạc chiêu tối thượng 0..CHARGE_MAX. */
  charge = 0;
  /** Giảm sát thương tới lúc `guardUntil` (ms), tỉ lệ `guardReduce`. */
  guardUntil = 0;
  guardReduce = 0;
  /** Gửi lại cho client khi đổi (tối đa ~4 lần/giây). */
  dirty = true;
  sentAt = 0;
  /** Đang tung chiêu tối thượng: đòn của nó không nạp lại vòng sạc. */
  lockCharge = false;

  reset(): void {
    this.stacks = 0;
    this.charge = 0;
    this.guardUntil = 0;
    this.guardReduce = 0;
    this.dirty = true;
  }

  setGuard(now: number, reduce: number, sec: number): void {
    const until = now + sec * 1000;
    // Lớp yếu không kéo dài lớp mạnh đang chạy.
    if (now < this.guardUntil && reduce < this.guardReduce) return;
    this.guardReduce = reduce;
    this.guardUntil = Math.max(this.guardUntil, until);
    this.dirty = true;
  }

  toMsg(meta: MethodMeta, now: number): MethodMsg {
    return {
      method: meta.method ?? '',
      lv: { ...(meta.skillLv ?? {}) },
      vr: { ...(meta.skillVar ?? {}) },
      stacks: this.stacks,
      charge: Math.min(CHARGE_MAX, Math.floor(this.charge)),
      guardUntil: now < this.guardUntil ? this.guardUntil : 0,
      now,
    };
  }
}
