// Trạng thái hiển thị của một nhánh công pháp (VS-2d): hàm thuần, tách khỏi component để test không cần store.
import { pickBlock, pickedBranch, type BranchDef, type BranchPicks, type MethodDef } from '@dtl/shared';

export type BranchState = 'picked' | 'open' | 'locked' | 'other';

/** Đã chọn, chọn được, chưa đủ cảnh giới, hay đã chọn nhánh khác ở cùng mốc. Server vẫn kiểm lại khi nhận lệnh. */
export function branchState(m: MethodDef, picks: BranchPicks | undefined, b: BranchDef, level: number): BranchState {
  const picked = pickedBranch(m, picks, b.tier);
  if (picked) return picked.id === b.id ? 'picked' : 'other';
  return pickBlock(m, picks, b.tier, b.id, level) === null ? 'open' : 'locked';
}
