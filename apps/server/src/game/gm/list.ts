// Danh sách có lọc cho giao diện lệnh GM của phòng tập (kênh `C.GM`, truy vấn `list`): server là nguồn id, tên tiếng Việt và ghi chú.
// Hàm thuần theo (loại, lọc, giới hạn, ngữ cảnh của người hỏi); không đụng sim/DB. Lọc không dấu, không phân biệt hoa thường, theo id hoặc tên.
import {
  ARTIFACTS,
  itemName,
  itemTier,
  ITEMS,
  LAB_SCENES,
  LEVELS,
  METHOD,
  methodName,
  METHODS,
  MONSTERS,
  monsterName,
  QUESTS,
  SETS,
  SKILL,
  skillName,
  t,
} from '@dtl/content';
import { PLACE } from '@dtl/content/places';
import { GM_LIST_MAX, type GmListItem, type GmListKind, type GmListResult } from '@dtl/shared';
import { fold, skinIds, weaponIds } from './tools';

/** Những gì truy vấn cần biết về người hỏi/phòng. */
export interface GmListCtx {
  /** Mã địa điểm đặt tên dùng được ở room này (`/gm tp`). */
  placeIds: string[];
  /** Công pháp đang tu của người hỏi (cho loại `branch`). */
  method: string | null;
}

const item = (id: string, name: string, sub?: string): GmListItem => (sub ? { id, name, sub } : { id, name });

function source(kind: GmListKind, ctx: GmListCtx): GmListItem[] {
  switch (kind) {
    case 'mon':
      return MONSTERS.map((m) => item(m.id, monsterName(m.id), m.boss ? 'boss' : m.elite ? 'tinh anh' : m.elem));
    case 'boss':
      return MONSTERS.filter((m) => m.boss || m.elite).map((m) =>
        item(m.id, monsterName(m.id), (m.boss ? 'boss' : 'tinh anh') + (m.phases?.length ? `, ${m.phases.length} lần đổi pha` : '')),
      );
    case 'item':
      return ITEMS.map((i) => item(i.id, itemName(i.id), `${i.kind} · bậc ${itemTier(i.id)}${i.reqLevel ? ' · cấp ' + i.reqLevel : ''}`));
    case 'weapon':
      return weaponIds().map((id) => item(id, itemName(id), `bậc ${itemTier(id)}`));
    case 'skin':
      return skinIds().map((id) => item(id, itemName(id)));
    case 'skill':
      return [...SKILL.values()].map((s) => item(s.id, skillName(s.id), `${s.method ? methodName(s.method) : 'chung'} · mở cấp ${s.unlock}`));
    case 'method':
      return METHODS.map((m) => item(m.id, methodName(m.id), m.role));
    case 'set':
      return SETS.map((s) => item(s.id, t('set.' + s.id + '.name'), `${s.pieces.length} món`));
    case 'art':
      return ARTIFACTS.map((a) => item(a.id, itemName(a.id)));
    case 'place':
      return ctx.placeIds.map((id) => item(id, id, PLACE.get(id)?.level));
    case 'quest':
      return QUESTS.map((q) => item(q.id, t(`quest.${q.id}.name`), q.minLevel ? `cấp ${q.minLevel}` : undefined));
    case 'scene':
      return LAB_SCENES.map((s) => item(s.id, s.id, `${s.method} cấp ${s.level}`));
    case 'branch':
      return (ctx.method ? (METHOD.get(ctx.method)?.branches ?? []) : []).map((b) => item(b.id, b.id, `mốc ${b.tier}`));
    case 'level':
      return Object.keys(LEVELS).map((id) => item(id, id));
  }
}

/** Danh sách theo loại, lọc `f` (không dấu) theo id hoặc tên, cắt còn `n` phần tử (mặc định và tối đa `GM_LIST_MAX`). */
export function gmList(kind: GmListKind, f: string | undefined, n: number | undefined, ctx: GmListCtx): GmListResult {
  const all = source(kind, ctx);
  const k = fold((f ?? '').trim());
  const hit = k ? all.filter((x) => fold(x.id).includes(k) || fold(x.name).includes(k)) : all;
  const cap = Math.max(1, Math.min(GM_LIST_MAX, Number.isFinite(n) ? Math.floor(n as number) : GM_LIST_MAX));
  return { k: kind, total: hit.length, items: hit.slice(0, cap) };
}
