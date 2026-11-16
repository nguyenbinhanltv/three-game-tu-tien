import { type ReactNode } from 'react';
import { bindsOnEquip, enhanceMul, isEquipSlot, sellPrice, type InvItem, type ItemDef } from '@dtl/shared';
import { ITEM, itemName, QUEST, realmName, t } from '@dtl/content';
import { ContentIcon, UiIcon } from '../ContentIcon';
import { artifactLines, compareLines, gearQuality, itemLines, itemSub, pillLines, setLinesForItem, type TipLine } from '../gear';
import { type PanelTone, PanelWindow, Slot, TipCard, Tooltip } from '../kit';
import { useUI } from '../store';

export function statLines(def: ItemDef, plus = 0): string[] {
  const out: string[] = [];
  const mul = enhanceMul(plus);
  if (def.stats?.atk) out.push(t('ui.stat.atk', { n: Math.round(def.stats.atk * mul) }));
  if (def.stats?.def) out.push(t('ui.stat.def', { n: Math.round(def.stats.def * mul) }));
  if (def.stats?.hp) out.push(t('ui.stat.hp', { n: Math.round(def.stats.hp * mul) }));
  if (def.stats?.mp) out.push(t('ui.stat.mp', { n: Math.round(def.stats.mp * mul) }));
  return out;
}

export function ItemIcon({ item, onClick, selected, small, worn }: { item: InvItem | null | undefined; onClick?: () => void; selected?: boolean; small?: boolean; worn?: boolean }) {
  const def = item ? ITEM.get(item.id) : undefined;
  if (!item || !def) return <Slot empty size={small ? 's' : 'm'} />;
  return (
    <Tooltip content={<ItemTip item={item} def={def} worn={worn} />}>
      <Slot icon={<ContentIcon def={def} />} rarity={gearQuality(item, def)} count={item.n} plus={def.kind === 'consumable' ? undefined : item.plus} selected={selected} size={small ? 's' : 'm'} onClick={onClick} label={itemName(def.id, item.plus)} />
    </Tooltip>
  );
}

/** Dòng chỉ số + so sánh với món đang mặc (chỉ khi món này chưa mặc và là trang bị). */
function useTipLines(item: InvItem, def: ItemDef, worn?: boolean): TipLine[] {
  const level = useUI((s) => s.char?.level ?? 1);
  const equip = useUI((s) => s.equip);
  const art = useUI((s) => s.method?.art);
  const lines = itemLines(item, def);
  lines.push(...pillLines(item, def), ...artifactLines(def, art));
  if (!worn && isEquipSlot(def.kind)) lines.push(...compareLines(level, equip, item, def));
  lines.push(...setLinesForItem(item, equip));
  if (item.inst?.bound) lines.push({ text: t('ui.item.bound'), tone: 'dim' });
  else if (item.inst && bindsOnEquip(item.inst.q)) lines.push({ text: t('ui.item.bind_on_equip'), tone: 'dim' });
  return lines;
}

/** Chú giải vật phẩm (rê chuột / focus): tên theo phẩm, loại, chỉ số, dòng phụ, so sánh, mô tả. */
export function ItemTip({ item, def, worn }: { item: InvItem; def: ItemDef; worn?: boolean }) {
  const lines = useTipLines(item, def, worn);
  return <TipCard title={itemName(def.id, item.plus)} rarity={gearQuality(item, def)} sub={itemSub(item, def)} lines={lines} desc={t(`item.${def.id}.desc`)} />;
}

export function ItemDetail({ item, children, worn }: { item: InvItem; children?: React.ReactNode; worn?: boolean }) {
  const def = ITEM.get(item.id);
  const level = useUI((s) => s.char?.level ?? 1);
  if (!def) return null;
  const q = gearQuality(item, def);
  return <ItemDetailBody item={item} def={def} q={q} level={level} worn={worn}>{children}</ItemDetailBody>;
}

function ItemDetailBody({ item, def, q, level, worn, children }: { item: InvItem; def: ItemDef; q: number; level: number; worn?: boolean; children?: React.ReactNode }) {
  const lines = useTipLines(item, def, worn);
  return (
    <div className="k-card item-detail">
      <div className="item-name" data-q={q}>
        {itemName(def.id, item.plus)}
      </div>
      <div className="k-dim">{itemSub(item, def)}</div>
      {lines.map((l, i) => (
        <div key={i} className={'item-stat' + (l.tone ? ' ' + l.tone : '')}>
          {l.text}
        </div>
      ))}
      {def.reqLevel && def.reqLevel > 1 && <div className={'item-req' + (level < def.reqLevel ? ' bad' : '')}>{t('ui.item.req', { realm: realmName(def.reqLevel) })}</div>}
      <div className="item-desc">{t(`item.${def.id}.desc`)}</div>
      {def.sell > 0 && <div className="k-dim">{t('ui.item.sell_price', { n: sellPrice(item, def) })} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /></div>}
      <div className="item-actions">{children}</div>
    </div>
  );
}

/** Cửa sổ chung của các bảng: khung kit (lam đêm, viền đồng thau, tiêu đề serif). */
export function Window({ title, sub, onClose, children, cls, width, tone }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; cls?: string; width?: number; tone?: PanelTone }) {
  return (
    <PanelWindow title={title} sub={sub} onClose={onClose} width={width} tone={tone} className={cls}>
      {children}
    </PanelWindow>
  );
}

export function RewardLine({ id }: { id: string }) {
  const q = QUEST.get(id);
  if (!q) return null;
  return (
    <div className="rewards">
      <b>{t('ui.quest.reward')}:</b>
      {q.rewards.xp > 0 && (
        <span>
          {q.rewards.xp} {t('ui.xp').toLowerCase()}
        </span>
      )}
      {q.rewards.gold > 0 && <span>{q.rewards.gold} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /></span>}
      {(q.rewards.items ?? []).map((it) => (
        <span key={it.id} className="reward-item" data-q={ITEM.get(it.id)?.rarity ?? 0}>
          <ContentIcon def={ITEM.get(it.id)} /> {itemName(it.id)}
          {it.n > 1 ? ` ×${it.n}` : ''}
        </span>
      ))}
    </div>
  );
}
