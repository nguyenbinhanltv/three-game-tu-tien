// Nút chọn/đổi/lĩnh ngộ công pháp ở bảng Công pháp (TN-2). Hàm thuần: chỉ quyết định chữ và trạng thái nút;
// server mới là nơi kiểm thật (cảnh giới, linh thạch, đứng gần người truyền công pháp).
import { METHOD_UNLOCK_LEVEL, methodSwitchCost, pathOpen } from '@dtl/shared';
import { itemName, pathOf, realmName, t } from '@dtl/content';

export interface MethodPickView {
  label: string;
  disabled: boolean;
  /** Dòng điều kiện lĩnh ngộ (chỉ khi công pháp thuộc hướng chưa lĩnh ngộ). */
  note?: string;
  /** Hướng của công pháp này phải lĩnh ngộ và đã lĩnh ngộ rồi. */
  learned?: boolean;
}

/** Người truyền công pháp (trùng `METHOD_NPC` của server). */
const METHOD_NPC = 'npc_chuong_mon';

export function methodPickView(o: {
  /** Công pháp đang xem. */
  id: string;
  /** Công pháp đang tu ('' / undefined = chưa chọn). */
  current?: string;
  level: number;
  gold: number;
  /** Hướng đã lĩnh ngộ (tin `mth.paths`). */
  learned?: readonly string[];
}): MethodPickView {
  const open = o.level >= METHOD_UNLOCK_LEVEL;
  const path = pathOf(o.id);
  const unlock = path && !pathOpen(path, o.learned) ? path.unlock : undefined;
  if (path && unlock) {
    const params = { realm: realmName(unlock.level), n: unlock.gold, npc: t(`npc.${METHOD_NPC}.name`) };
    return {
      label: t('ui.method.learn', { n: unlock.gold }),
      disabled: !open || o.level < unlock.level || o.gold < unlock.gold,
      note: unlock.grant ? t('ui.method.learn_need', { ...params, item: itemName(unlock.grant) }) : t('ui.method.learn_need_plain', params),
    };
  }
  const learned = !!path?.unlock;
  if (!o.current) return { label: t('ui.method.pick'), disabled: !open, learned };
  if (o.id === o.current) return { label: t('ui.method.current'), disabled: true, learned };
  return { label: t('ui.method.switch', { n: methodSwitchCost(o.level) }), disabled: !open, learned };
}
