import { questSpot, type ObjectiveDef } from '@dtl/shared';
import { itemName, LEVELS, monsterName, realmName, t } from '@dtl/content';

/** Tên điểm của mục tiêu `touch`/`scan`: tìm ở mọi level (id điểm là duy nhất toàn game). */
function spotName(id: string | undefined): string {
  for (const lv of Object.values(LEVELS)) {
    const sp = questSpot(lv, id);
    if (sp) return t(sp.nameKey);
  }
  return id ?? '';
}

function escortName(id: string | undefined): string {
  for (const lv of Object.values(LEVELS)) {
    const e = lv.escorts?.find((x) => x.id === id);
    if (e) return t(`npc.${e.npc}.name`);
  }
  return id ?? '';
}

export function objectiveText(o: ObjectiveDef): string {
  switch (o.type) {
    case 'kill':
      return t('ui.obj.kill', { name: monsterName(o.target ?? '') });
    case 'gather':
      return t('ui.obj.gather', { name: itemName(o.target ?? '') });
    case 'craft':
      return t('ui.obj.craft', { name: itemName(o.target ?? '') });
    case 'level':
      return t('ui.obj.level', { realm: realmName(o.count) });
    case 'talk':
      return t('ui.obj.talk', { name: t(`npc.${o.target}.name`) });
    case 'fly':
      return t('ui.obj.fly');
    case 'enhance':
      return t('ui.obj.enhance', { n: o.count });
    case 'dungeon':
      // Có `target` (Phục Mạch Quật…) thì nêu tên bí cảnh đó; không có thì là Kiếm Trủng như cũ.
      return o.target ? t('ui.obj.dungeon_named', { name: t(`dungeon.${o.target}.name`) }) : t('ui.obj.dungeon');
    case 'duel':
      return t('ui.obj.duel');
    case 'clone':
      return t('ui.obj.clone');
    case 'meditate':
      return t('ui.obj.meditate');
    case 'touch':
      return t('ui.obj.touch', { name: spotName(o.target) });
    case 'scan':
      return t('ui.obj.scan', { name: spotName(o.target) });
    case 'escort':
      return t('ui.obj.escort', { name: escortName(o.target) });
    default:
      return t('ui.obj.breakthrough');
  }
}
