// Bảng rơi đồ và linh thạch của quái. CHỈ server (và công cụ kiểm/mô phỏng) được import tệp này:
// client không bao giờ được biết tỉ lệ rơi. Bài kiểm `apps/client/src/no-server-data.test.ts` chặn import nhầm.
import type { DropDef, LootDef } from '@dtl/shared';
import lootJson from '../data/loot.json';

/** Lớp nguyên liệu phủ lên bảng rơi của nhiều quái (`$mats` trong loot.json, E2-F): thêm `drops` cho từng quái trong `mons` nếu quái đã có bảng rơi. */
export interface LootMatRule {
  mons: string[];
  drops: DropDef[];
}
const { $mats, ...own } = lootJson as unknown as Record<string, LootDef> & { $mats: LootMatRule[] };
export const LOOT_MATS: LootMatRule[] = $mats ?? [];

export const LOOT = new Map<string, LootDef>(Object.entries(own).map(([id, l]) => [id, { ...l, drops: [...l.drops] }]));
for (const r of LOOT_MATS) for (const m of r.mons) LOOT.get(m)?.drops.push(...r.drops);

const NONE: LootDef = { gold: [0, 0], drops: [] };

/** Bảng rơi của quái; quái không khai báo thì không rơi gì. */
export function lootOf(monsterId: string): LootDef {
  return LOOT.get(monsterId) ?? NONE;
}
