import { comboNext, GCD, lungeReach, poseIdFor, skillTiming, usesStrikeTiming, type SkillDef } from '@dtl/shared';
import { METHOD_SKILLS, POSE, SKILL, SKILLS } from '@dtl/content';
import type { CharacterView, PerformOpts } from '../character/view';
import { ANIM_FX } from '../character/animFx';
import { isKiemTu } from '../character/kiemTu';

/** FX của chiêu → chiêu (mỗi chiêu một fx riêng trong skills.json). */
// Chiêu tư thế (VS-2e) mượn fx + pose của một chiêu thường: tra theo fx luôn ra chiêu thường đó. Chiêu tư thế có fx RIÊNG (Hóa Hình của
// Cổ Thần, TN-5) không mượn của ai nên vào bảng như chiêu thường (nếu không thì không có động tác, timeline và tên chiêu).
const ALL_SKILLS = [...SKILLS, ...METHOD_SKILLS];
const SKILL_BY_FX = new Map<string, SkillDef>(ALL_SKILLS.filter((s) => s.kind !== 'stance' && !s.stanceOf).map((s) => [s.fx, s]));
for (const s of ALL_SKILLS) if (s.kind === 'stance' && !s.stanceOf && !SKILL_BY_FX.has(s.fx)) SKILL_BY_FX.set(s.fx, s);
/** FX mà model khối cũ phản ứng bằng `attack()` (giữ nguyên hành vi khi model không có động tác riêng). */
const ATTACK_FX = new Set(['sword', 'slash', 'thunder', 'rain', 'kanh', 'vankiem']);

/** Động tác bắt đầu sớm hơn lúc ra đòn bao nhiêu khi chỉ biết qua FX (đủ cho nhịp vào thế). */
export const FX_LEAD = 0.06;
/** Dung sai (ms) cho khe tối thiểu giữa hai lần dự đoán (engine cho ra chiêu từ 60 ms trước hết GCD). */
const PREDICT_GAP_SLACK = 100;
/** Dự đoán còn hiệu lực bao lâu chờ FX của server (ms). Quá thì coi như server từ chối. */
const PREDICT_TTL = 800;
/** Trễ hiệu ứng tối đa để chờ động tác dự đoán tới lúc ra đòn (giây). */
export const MAX_HOLD = 0.25;

/** Khoảng cách tới mục tiêu mà dưới đó không lao người nữa (m): đứng sát thì đòn vung tại chỗ. */
const LUNGE_STAND_OFF = 1.3;

/**
 * Tùy chọn `perform` từ dữ liệu chiêu (K-4): thời gian, đòn trong chuỗi, tầm lao người. Chiêu niệm chú không dùng mốc
 * `hitAt` từ lúc bấm (động tác xếp lịch theo thanh niệm) nên không kèm thời gian. `gap`: khoảng cách tới mục tiêu (m) nếu biết.
 */
export function performOpts(skill: SkillDef, combo: number | undefined, gap: number | undefined): PerformOpts {
  if (!usesStrikeTiming(skill)) return { skill: skill.id };
  const idx = combo !== undefined && combo >= 0 && skill.combo?.hits[combo] ? combo : undefined;
  const timing = skillTiming(skill, idx);
  // Lao người chỉ cho chuỗi đánh thường, và không vượt quá chỗ đứng sát mục tiêu.
  const reach = skill.combo && gap !== undefined ? Math.max(0, Math.min(lungeReach(timing, true), gap - LUNGE_STAND_OFF)) : 0;
  return { timing, skill: skill.id, combo: idx ?? -1, reach };
}

/**
 * Pose của chiêu theo đòn trong chuỗi và công pháp của người ra chiêu (K-5: ba ngôn ngữ động tác). Thiếu pose riêng
 * thì rơi về pose gốc của chiêu (`content:check` bảo đảm đủ bộ cho đòn thường và Kiếm Khí Trảm).
 */
export function poseOf(skill: SkillDef, combo?: number, method?: string): string {
  const base = skill.pose!;
  const id = poseIdFor(base, { combo, method });
  const chosen = POSE.has(id) ? id : base;
  // Thân Pháp T4 (cờ ?thanphap): bản pose-to-pose `<id>_tp` nếu có; giữ nguyên thời lượng và khung trúng nên không đổi nhịp combat.
  return ANIM_FX.poses && isKiemTu(method) && POSE.has(`${chosen}_tp`) ? `${chosen}_tp` : chosen;
}

/** Lúc ra đòn (giây trong clip) của động tác chiêu `skill` (đúng pose `poseId` nếu đã chọn), 0 nếu không có. */
export function releaseAt(skill: SkillDef | undefined, poseId?: string): number {
  const id = poseId ?? skill?.pose;
  return (id && POSE.get(id)?.hit?.[0]) || 0;
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
  /** Đòn thường liên hoàn của mình: chỉ số đòn gần nhất và lúc đó (ms), để đoán đòn kế khi chưa có FX. */
  private combo = { idx: -1, at: 0 };
  /** Lúc dự đoán gần nhất (ms): tự đánh gửi lặp mỗi 220 ms tới khi tin hồi chiêu của server về, mỗi lần gửi lặp không được dự đoán lại. */
  private lastPredictAt = -Infinity;
  /** Hiệu ứng đòn của mình đang được giữ tới lúc này (performance.now, ms). */
  private holdUntil = 0;

  /** Người chơi vừa gửi chiêu và mọi điều kiện kiểm được ở client đều qua: vào thế ngay. */
  predict(model: CharacterView | undefined, skill: SkillDef, now: number, gap?: number, method?: string): void {
    if (!model?.perform || !skill.pose || skill.cast > 0) return;
    // Mỗi đòn dự đoán một lần: server chỉ nhận một chiêu mỗi GCD, nên trong GCD (trừ dung sai 100 ms của `ready` ở engine) mọi lần gọi
    // thêm chỉ là gửi lặp, không khởi động lại nhát vung, không tăng chỉ số liên hoàn, không phát lại sự kiện windup/hit.
    if (now - this.lastPredictAt < GCD * 1000 - PREDICT_GAP_SLACK) return;
    const idx = skill.combo ? comboNext(skill.combo, this.combo.idx, this.combo.at, now) : undefined;
    // Chỉ ghi dự đoán khi động tác thật sự bắt đầu: bị bỏ qua (trên không, bay, chết) thì FX về phải phát ngay,
    // không giữ hiệu ứng chờ một nhát vung không có.
    const pose = poseOf(skill, idx, method);
    if (!model.perform(pose, performOpts(skill, idx, gap)) || !model.performing?.(pose)) return;
    this.lastPredictAt = now;
    if (idx !== undefined) this.combo = { idx, at: now };
    this.predicted = { fx: skill.fx, at: now, release: now + releaseAt(skill, pose) * 1000 };
  }

  /**
   * FX chiêu của người chơi `model` tới. Trả về số giây nên giữ hiệu ứng lại (chỉ với đòn của mình đã dự đoán),
   * 0 = phát ngay.
   */
  onFx(
    fx: string,
    model: CharacterView | undefined,
    mine: boolean,
    now: number,
    extra: { n?: number; gap?: number; method?: string } = {},
  ): number {
    const skill = SKILL_BY_FX.get(fx);
    if (!skill || !model) return 0;
    const p = this.predicted;
    // Đòn thứ mấy của chuỗi: server là nguồn thật; khớp lại đồng hồ chuỗi của mình để đòn kế không lệch.
    if (mine && skill.combo && extra.n !== undefined) this.combo = { idx: extra.n, at: now };
    if (mine && p && p.fx === fx && now - p.at < PREDICT_TTL) {
      this.predicted = null;
      const hold = Math.min(MAX_HOLD, (p.release - now) / 1000);
      if (hold <= 0.02) return 0;
      this.holdUntil = now + hold * 1000;
      return hold;
    }
    // Đã xếp lịch từ lúc niệm chú.
    const pose = skill.pose ? poseOf(skill, extra.n, extra.method) : undefined;
    if (pose && model.performing?.(pose)) return 0;
    const done = pose
      ? model.perform?.(pose, { ...performOpts(skill, extra.n, extra.gap), from: Math.max(0, releaseAt(skill, pose) - FX_LEAD) })
      : false;
    if (!done && ATTACK_FX.has(fx)) {
      // Cùng quy ước `perform`: combo chuẩn hóa (-1 nếu không phải chuỗi) và `kb` theo mốc thời gian của đòn.
      const po = performOpts(skill, extra.n, extra.gap);
      model.attack({ skill: skill.id, combo: po.combo, kb: !!po.timing?.kb });
    }
    return 0;
  }

  /**
   * FX `cast` (bắt đầu niệm chiêu `skillId` trong `d` giây, cả hai do server gửi): xếp lịch động tác chém để ra đòn
   * đúng lúc niệm xong. Không có id (server cũ) hoặc id lạ thì không xếp lịch: FX chiêu tới sẽ phát động tác như
   * người khác, không đoán chiêu theo thời lượng.
   */
  onCast(model: CharacterView | undefined, skillId: string | undefined, d: number, method?: string): void {
    const skill = skillId ? SKILL.get(skillId) : undefined;
    if (!model?.perform || !skill?.pose) return;
    const pose = poseOf(skill, undefined, method);
    model.perform(pose, { ...performOpts(skill, undefined, undefined), delay: Math.max(0, d - releaseAt(skill, pose)) });
  }

  /** Chiêu lướt (K-2) ứng với FX `fx`, nếu có. */
  dashOf(fx: string): SkillDef | undefined {
    const s = SKILL_BY_FX.get(fx);
    return s?.dash ? s : undefined;
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
