// Ngoại hình XEM THỬ của Tủ ngoại trang: bản nháp chồng lên trang bị thật, dùng đúng các hàm chung của server
// (`visualEquip`, `setStatuses`, `lookSet`, `accessoryCode`) để người chơi thấy trước đúng cái sẽ hiện sau khi Áp dụng.
// Chỉ để dựng hình; chỉ số và dữ liệu thật không đổi.
import { accessoryCode, glowStage, lookSet, setStatuses, visualEquip, type Equipment } from '@dtl/shared';
import { SET, SETS, swordModelOf } from '@dtl/content';
import type { PlayerLook } from '../../game/character/playerSkins';
import { tintOfTriple } from '../../game/entities/entityVis';
import type { Draft } from './model';

/**
 * `base` = ngoại hình thật của mình (giới tính, màu chọn lúc tạo, kiểu tóc, skin ô 10 giữ nguyên).
 * Ô nháp `null` = hiện đúng món đang mặc.
 */
export function draftLook(base: PlayerLook, equip: Equipment, draft: Draft): PlayerLook {
  const over: Record<string, string> = {};
  for (const [slot, id] of Object.entries(draft.over)) if (id) over[slot] = id;
  const ve = visualEquip(equip, { over });
  const setId = lookSet(
    setStatuses(
      SETS,
      Object.values(ve).map((x) => x.id),
    ),
  )?.id;
  const acc = accessoryCode(SETS, ve);
  const weaponId = ve.weapon?.id;
  const glow = glowStage(equip.weapon?.plus ?? 0);
  const tint = tintOfTriple(draft.dye);
  const { set: _s, acc: _a, tint: _t, ...rest } = base;
  return {
    ...rest,
    w: swordModelOf(weaponId, glow),
    ...(setId && SET.has(setId) ? { set: setId } : {}),
    ...(acc ? { acc } : {}),
    ...(tint ? { tint } : {}),
  };
}
