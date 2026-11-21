// Tiện ích cho test (không dùng ở mã chạy thật): các thao tác tắt chỉ sửa bộ nhớ, không ghi DB.
import { METHOD } from '@dtl/content';
import type { BranchPicks } from '@dtl/shared';

/**
 * Chọn (hoặc đổi sang) nhánh công pháp cho phép dùng chiêu `skillId`, để test cơ chế của chiêu không phải đi qua
 * bước chọn nhánh. Chiêu chung, chiêu không gắn nhánh hay chưa có công pháp thì không làm gì.
 */
export function allowSkillForTest(c: { meta: { method?: string }; branches: Record<string, BranchPicks> }, skillId: unknown): void {
  if (typeof skillId !== 'string' || !c.meta.method) return;
  const m = METHOD.get(c.meta.method);
  const b = m?.branches.find((x) => x.grants.includes(skillId));
  if (!m || !b) return;
  const picks = (c.branches[m.id] ??= {});
  const cur = m.branches.find((x) => x.tier === b.tier && x.id === picks[b.tier]);
  // Đang ở nhánh cũng cho chiêu này (chiêu mốc 28 thuộc cả hai nhánh) thì giữ nguyên.
  if (!cur?.grants.includes(skillId)) picks[b.tier] = b.id;
}
