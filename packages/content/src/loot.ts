// Bảng rơi đồ và linh thạch của quái. CHỈ server (và công cụ kiểm/mô phỏng) được import tệp này:
// client không bao giờ được biết tỉ lệ rơi. Bài kiểm `apps/client/src/no-server-data.test.ts` chặn import nhầm.
import type { LootDef } from '@dtl/shared';
import lootJson from '../data/loot.json';

export const LOOT = new Map<string, LootDef>(Object.entries(lootJson as unknown as Record<string, LootDef>));

const NONE: LootDef = { gold: [0, 0], drops: [] };

/** Bảng rơi của quái; quái không khai báo thì không rơi gì. */
export function lootOf(monsterId: string): LootDef {
  return LOOT.get(monsterId) ?? NONE;
}
