// Trạng thái dòng chảy chiêu của một người chơi (K-2): đòn đang chờ `hitAt`, chuỗi đánh thường, cửa sổ cường hóa, lướt.
// Chỉ là dữ liệu và hàm thuần; sim.ts gọi các hàm này ở các điểm móc (xem beginSkill, resolvePending, onDash).

import { empowerOpen, type SkillDef } from '@dtl/shared';
import { METHOD_SKILLS, SKILLS } from '@dtl/content';

/** Một đòn đã bấm, đã trừ linh lực/đặt hồi chiêu, chờ tới `at` (giờ server, ms) mới áp hiệu quả. */
interface PendingStrike {
  skill: SkillDef;
  target: string;
  at: number;
  /** Chỉ số đòn trong chuỗi đánh thường (-1 nếu chiêu không có combo). */
  combo: number;
  /** Hệ số nhân sát thương đã chốt lúc bấm (combo, cường hóa). */
  mul: number;
  /** Để hoàn lại nếu đòn bị hủy vì mục tiêu (chết, ra tầm): linh lực, hồi chiêu cũ, vòng sạc cũ. */
  prevCd: number | undefined;
  prevCharge: number;
}

export class SkillFlow {
  pending: PendingStrike | null = null;
  /** Chỉ số và lúc (ms) của đòn thường liên hoàn gần nhất. */
  comboIdx = -1;
  comboAt = 0;
  /** id chiêu → lúc (ms) chiêu áp xong gần nhất: mở cửa sổ cường hóa cho chiêu có `empower.by` = id đó. */
  readonly opened = new Map<string, number>();
  lastDashAt = -1e9;

  reset(): void {
    this.pending = null;
    this.comboIdx = -1;
    this.opened.clear();
  }
}

const EMPOWERED: SkillDef[] = [...SKILLS, ...METHOD_SKILLS].filter((s) => s.empower);

/** Chiêu `skill` đang được cường hóa không (cửa sổ của chiêu mở còn hiệu lực)? */
export function isEmpowered(flow: SkillFlow, skill: SkillDef, nowMs: number): boolean {
  return !!skill.empower && empowerOpen(skill.empower, flow.opened.get(skill.empower.by), nowMs);
}

/** Các chiêu đang cường hóa → lúc hết hạn (ms, giờ server): gửi cho client để sáng viền ô chiêu. */
export function empowerDeadlines(flow: SkillFlow, nowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of EMPOWERED) {
    if (isEmpowered(flow, s, nowMs)) out[s.id] = flow.opened.get(s.empower!.by)! + s.empower!.window * 1000;
  }
  return out;
}
