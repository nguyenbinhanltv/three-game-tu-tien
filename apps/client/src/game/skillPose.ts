import type { SkillDef } from '@dtl/shared';
import { POSE, SKILL, SKILLS } from '@dtl/content';
import type { CharacterView } from './character/view';

/** FX của chiêu → chiêu (mỗi chiêu một fx riêng trong skills.json). */
const SKILL_BY_FX = new Map<string, SkillDef>(SKILLS.map((s) => [s.fx, s]));
/** FX mà model khối cũ phản ứng bằng `attack()` (giữ nguyên hành vi khi model không có động tác riêng). */
const ATTACK_FX = new Set(['sword', 'slash', 'thunder', 'rain']);

/** Động tác bắt đầu sớm hơn lúc ra đòn bao nhiêu khi chỉ biết qua FX (đủ cho nhịp vào thế). */
export const FX_LEAD = 0.06;
/** Dự đoán còn hiệu lực bao lâu chờ FX của server (ms). Quá thì coi như server từ chối. */
const PREDICT_TTL = 800;
/** Trễ hiệu ứng tối đa để chờ động tác dự đoán tới lúc ra đòn (giây). */
const MAX_HOLD = 0.25;

/** Lúc ra đòn (giây trong clip) của động tác chiêu, 0 nếu không có. */
export function releaseAt(skill: SkillDef | undefined): number {
  return (skill?.pose && POSE.get(skill.pose)?.hit?.[0]) || 0;
}

/**
 * Động tác chiêu (M3-4), chỉ là lớp hình: server vẫn quyết định chiêu có ra hay không.
 * - Đòn của mình: vào thế ngay khi bấm phím (dự đoán). FX về sớm hơn lúc ra đòn thì giữ hiệu ứng (và số sát thương)
 *   lại tới đúng lúc ra đòn để kiếm khí phóng ra từ nhát vung, không phải trước nó.
 * - Người khác (và đòn của mình không dự đoán, vd. tự đánh): FX tới là lúc ra đòn nên động tác bắt đầu từ
 *   `hit[0] − FX_LEAD`, bỏ bớt nhịp chuẩn bị.
 * - Chiêu niệm chú: động tác chém xếp lịch từ FX `cast` để ra đòn đúng lúc niệm xong; chú hỏng thì hủy.
 */
export class SkillPoses {
  private predicted: { fx: string; at: number; release: number } | null = null;
  /** Hiệu ứng đòn của mình đang được giữ tới lúc này (performance.now, ms). */
  private holdUntil = 0;

  /** Người chơi vừa gửi chiêu và mọi điều kiện kiểm được ở client đều qua: vào thế ngay. */
  predict(model: CharacterView | undefined, skill: SkillDef, now: number): void {
    if (!model?.perform || !skill.pose || skill.cast > 0) return;
    // Chỉ ghi dự đoán khi động tác thật sự bắt đầu: bị bỏ qua (trên không, bay, chết) thì FX về phải phát ngay,
    // không giữ hiệu ứng chờ một nhát vung không có.
    if (!model.perform(skill.pose) || !model.performing?.(skill.pose)) return;
    this.predicted = { fx: skill.fx, at: now, release: now + releaseAt(skill) * 1000 };
  }

  /**
   * FX chiêu của người chơi `model` tới. Trả về số giây nên giữ hiệu ứng lại (chỉ với đòn của mình đã dự đoán),
   * 0 = phát ngay.
   */
  onFx(fx: string, model: CharacterView | undefined, mine: boolean, now: number): number {
    const skill = SKILL_BY_FX.get(fx);
    if (!skill || !model) return 0;
    const p = this.predicted;
    if (mine && p && p.fx === fx && now - p.at < PREDICT_TTL) {
      this.predicted = null;
      const hold = Math.min(MAX_HOLD, (p.release - now) / 1000);
      if (hold <= 0.02) return 0;
      this.holdUntil = now + hold * 1000;
      return hold;
    }
    // Đã xếp lịch từ lúc niệm chú.
    if (skill.pose && model.performing?.(skill.pose)) return 0;
    const done = skill.pose ? model.perform?.(skill.pose, { from: Math.max(0, releaseAt(skill) - FX_LEAD) }) : false;
    if (!done && ATTACK_FX.has(fx)) model.attack();
    return 0;
  }

  /**
   * FX `cast` (bắt đầu niệm chiêu `skillId` trong `d` giây, cả hai do server gửi): xếp lịch động tác chém để ra đòn
   * đúng lúc niệm xong. Không có id (server cũ) hoặc id lạ thì không xếp lịch: FX chiêu tới sẽ phát động tác như
   * người khác, không đoán chiêu theo thời lượng.
   */
  onCast(model: CharacterView | undefined, skillId: string | undefined, d: number): void {
    const skill = skillId ? SKILL.get(skillId) : undefined;
    if (!model?.perform || !skill?.pose) return;
    model.perform(skill.pose, { delay: Math.max(0, d - releaseAt(skill)) });
  }

  /** Chú bị phá (FX `castend`). */
  onCastEnd(model: CharacterView | undefined): void {
    model?.cancelPerform?.();
  }

  /** Còn giữ hiệu ứng đòn của mình bao lâu (giây): sát thương của mình trễ theo cho khớp. */
  holdLeft(now: number): number {
    return Math.max(0, (this.holdUntil - now) / 1000);
  }
}
