// Trạng thái dòng chảy chiêu của một người chơi (K-2, VS-2b): đòn đang chờ `hitAt`, chuỗi đánh thường, cửa sổ chuỗi chiêu, lướt.
// Chỉ là dữ liệu và hàm thuần; sim.ts gọi các hàm này ở các điểm móc (xem beginSkill, resolvePending, onDash).

import { chainBonus, chainDeadline, NO_CHAIN, type ChainBonus, type SkillDef } from '@dtl/shared';
import { METHOD_SKILLS, SKILLS } from '@dtl/content';

/** Một đòn đã bấm, đã trừ linh lực/đặt hồi chiêu, chờ tới `at` (giờ server, ms) mới áp hiệu quả. */
interface PendingStrike {
  skill: SkillDef;
  target: string;
  at: number;
  /** Chỉ số đòn trong chuỗi đánh thường (-1 nếu chiêu không có combo). */
  combo: number;
  /** Hệ số nhân hiệu quả đã chốt lúc bấm (combo, chuỗi chiêu). */
  mul: number;
  /** Linh lực đã trả lúc bấm (sau thưởng chuỗi): hoàn đúng số này nếu đòn bị hủy vì mục tiêu. */
  mp: number;
  /** Để hoàn lại nếu đòn bị hủy vì mục tiêu (chết, ra tầm): linh lực, hồi chiêu cũ, vòng sạc cũ. */
  prevCd: number | undefined;
  prevCharge: number;
}

export class SkillFlow {
  pending: PendingStrike | null = null;
  /** Chỉ số và lúc (ms) của đòn thường liên hoàn gần nhất. */
  comboIdx = -1;
  comboAt = 0;
  /** id chiêu → lúc (ms) chiêu áp xong gần nhất: mở cửa sổ cho các chiêu có `chain.after` chứa id đó. */
  readonly opened = new Map<string, number>();
  lastDashAt = -1e9;

  reset(): void {
    this.pending = null;
    this.comboIdx = -1;
    this.opened.clear();
  }
}

const CHAINED: SkillDef[] = [...SKILLS, ...METHOD_SKILLS].filter((s) => s.chain);

/** Hạn cửa sổ chuỗi của `skill` (ms, giờ server), 0 nếu đang đóng hoặc chiêu không có chuỗi. */
export function chainUntil(flow: SkillFlow, skill: SkillDef, nowMs: number): number {
  return skill.chain ? chainDeadline(skill.chain, (id) => flow.opened.get(id), nowMs) : 0;
}

/** Thưởng chuỗi `skill` đang được hưởng (không tiêu cửa sổ); `NO_CHAIN` nếu cửa sổ đóng. */
export function chainOf(flow: SkillFlow, skill: SkillDef, nowMs: number): ChainBonus {
  return skill.chain && chainUntil(flow, skill, nowMs) > 0 ? chainBonus(skill.chain) : NO_CHAIN;
}

/**
 * Dùng chiêu chuỗi: trả thưởng và đóng cửa sổ (xóa mốc của mọi chiêu mở trong `after`, nên một chiêu mở chỉ nuôi được
 * một chiêu chuỗi: chọn nhánh này thì nhánh kia đóng).
 */
export function takeChain(flow: SkillFlow, skill: SkillDef, nowMs: number): ChainBonus {
  const b = chainOf(flow, skill, nowMs);
  if (b !== NO_CHAIN) for (const id of skill.chain!.after) flow.opened.delete(id);
  return b;
}

/** Các chiêu đang mở chuỗi → lúc hết hạn (ms, giờ server): gửi cho client để sáng viền ô chiêu. */
export function chainDeadlines(flow: SkillFlow, nowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of CHAINED) {
    const until = chainUntil(flow, s, nowMs);
    if (until > 0) out[s.id] = until;
  }
  return out;
}
