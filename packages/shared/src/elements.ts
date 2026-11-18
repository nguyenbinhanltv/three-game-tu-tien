// Khắc chế ngũ hành (3-10): chiêu có hệ `elem` đánh quái có hệ `elem`. Hàm thuần; server tính, client chỉ hiển thị cờ `ke` trong DmgMsg.
// Tương khắc: Kim → Mộc → Thổ → Thủy → Hỏa → Kim.

/** Ngũ hành. Định nghĩa ở đây (module lá) để items/tribulation/gems cùng dùng mà không vòng phụ thuộc; items.ts re-export. */
export const ELEMENTS = ['kim', 'moc', 'thuy', 'hoa', 'tho'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Hệ bị `key` khắc. */
export const ELEM_BEATS: Record<Element, Element> = { kim: 'moc', moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'kim' };

/** Chiêu khắc hệ quái: nhân thêm; bị hệ quái khắc ngược: giảm. Vừa phải để không đảo bảng TTK. */
export const COUNTER_MUL = 1.12;
export const RESIST_MUL = 0.92;

/** 1: chiêu khắc quái; -1: quái khắc chiêu; 0: không liên quan (kể cả khi thiếu hệ). */
export function elemCounter(skillElem: string | undefined, monElem: string | undefined): 1 | -1 | 0 {
  if (!skillElem || !monElem || skillElem === monElem) return 0;
  if (ELEM_BEATS[skillElem as Element] === monElem) return 1;
  if (ELEM_BEATS[monElem as Element] === skillElem) return -1;
  return 0;
}

export function counterMul(c: 1 | -1 | 0): number {
  return c === 1 ? COUNTER_MUL : c === -1 ? RESIST_MUL : 1;
}
