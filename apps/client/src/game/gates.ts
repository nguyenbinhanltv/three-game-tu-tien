import { DUNGEON_EXIT, PORTAL_POS } from '@dtl/shared';
import { LEVELS } from '@dtl/content';

/** Cổng tương tác của một level: `portal` đi xuống phó bản, `exit` đi ra khỏi phó bản. */
export interface Gate {
  id: 'portal' | 'exit';
  x: number;
  z: number;
  color: number;
  /** Cổng vào: level đích. */
  to?: string;
  /** Độ mờ gốc của đĩa (hang: cổng ra chỉ là vệt sáng ấm, không chói). */
  opacity?: number;
  /** Đĩa nằm phẳng trên nền. */
  flat?: boolean;
}

const BLUE = 0x8fdcff;
const GOLD = 0xffd27a;

/** Cổng cần vẽ (đĩa sáng) ở level. Vân Lam và Kiếm Trủng dùng chung cảnh nên cả hai đĩa luôn hiện (hành vi cũ). */
export function gatesToDraw(level: string): Gate[] {
  if (level === 'van_lam' || level === 'kiem_trung') return [{ id: 'portal', ...PORTAL_POS, color: BLUE, to: 'kiem_trung' }, { id: 'exit', ...DUNGEON_EXIT, color: GOLD }];
  return gatesOf(level);
}

/** Cổng bấm F được ở level (E2-C): cổng vào phó bản theo `LevelDef.portals`, cổng ra theo `dungeon.exit`. */
export function gatesOf(level: string): Gate[] {
  if (level === 'van_lam') return [{ id: 'portal', ...PORTAL_POS, color: BLUE, to: 'kiem_trung' }];
  if (level === 'kiem_trung') return [{ id: 'exit', ...DUNGEON_EXIT, color: GOLD }];
  const lv = LEVELS[level];
  const out: Gate[] = (lv?.portals ?? []).map((q) => ({ id: 'portal' as const, x: q.x, z: q.z, color: BLUE, to: q.to }));
  if (lv?.dungeon && !lv.tribulation) out.push({ id: 'exit', x: lv.dungeon.exit.x, z: lv.dungeon.exit.z, color: lv.dungeon.bound ? 0xc9863a : GOLD, opacity: lv.dungeon.bound ? 0.2 : undefined, flat: !!lv.dungeon.bound });
  return out;
}
