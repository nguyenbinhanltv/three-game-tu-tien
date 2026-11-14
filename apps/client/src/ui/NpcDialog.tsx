import { useState } from 'react';
import { C, enhanceChance, enhanceCost, EQUIP_SLOTS, MAX_ENHANCE } from '@dtl/shared';
import { ENHANCE_ORE, ITEM, itemName, NPC, QUESTS, realmName, RECIPES, t } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { objectiveText } from './Hud';
import { ItemDetail, ItemIcon, RewardLine, statLines, Window } from './Panels';
import { set, useUI } from './store';

type Tab = 'talk' | 'shop' | 'craft' | 'enhance';

function QuestTab({ npcId }: { npcId: string }) {
  const quests = useUI((s) => s.quests);
  const level = useUI((s) => s.char?.level ?? 1);
  const g = Game.current;
  const offers = QUESTS.filter((q) => q.giver === npcId && !quests.active[q.id] && !quests.done.includes(q.id) && (!q.requires || quests.done.includes(q.requires)));
  const turnins = QUESTS.filter((q) => q.turnin === npcId && quests.active[q.id]);
  return (
    <div className="npc-quests">
      <div className="npc-greet">“{t(`npc.${npcId}.greet`)}”</div>
      {turnins.map((q) => {
        const prog = quests.active[q.id];
        const complete = q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count || (o.type === 'talk' && o.target === npcId));
        return (
          <div key={q.id} className={'quest-card' + (complete ? ' ready' : '')}>
            <div className="quest-title">
              {complete ? '❓' : '⏳'} {t(`quest.${q.id}.name`)}
            </div>
            <div className="quest-desc">{complete ? `“${t(`quest.${q.id}.done`)}”` : t(`quest.${q.id}.desc`)}</div>
            {!complete &&
              q.objectives.map((o, i) => {
                const cur = Math.min(o.count, prog[i] ?? 0);
                const count = o.type === 'kill' || o.type === 'gather' || o.type === 'craft' ? ` ${cur}/${o.count}` : '';
                return (
                  <div key={i} className={'quest-obj' + (cur >= o.count ? ' ok' : '')}>
                    {cur >= o.count ? '✔' : '○'} {objectiveText(o)}
                    {count}
                  </div>
                );
              })}
            <RewardLine id={q.id} />
            {complete ? (
              <button className="btn primary" onClick={() => g?.send(C.QUEST, { a: 'turnin', id: q.id })}>
                {t('ui.quest.turnin')}
              </button>
            ) : (
              <div className="muted">{t('ui.quest.in_progress')}</div>
            )}
          </div>
        );
      })}
      {offers.map((q) => {
        const lowLevel = (q.minLevel ?? 1) > level;
        return (
          <div key={q.id} className="quest-card offer">
            <div className="quest-title">❗ {t(`quest.${q.id}.name`)}</div>
            <div className="quest-desc">{t(`quest.${q.id}.desc`)}</div>
            {q.objectives.map((o, i) => (
              <div key={i} className="quest-obj">
                ○ {objectiveText(o)}
                {o.type === 'kill' || o.type === 'gather' || o.type === 'craft' ? ` ×${o.count}` : ''}
              </div>
            ))}
            <RewardLine id={q.id} />
            {lowLevel ? (
              <div className="bad">{t('ui.quest.need_level', { realm: realmName(q.minLevel ?? 1) })}</div>
            ) : (
              <button className="btn primary" onClick={() => g?.send(C.QUEST, { a: 'accept', id: q.id })}>
                {t('ui.quest.accept')}
              </button>
            )}
          </div>
        );
      })}
      {!offers.length && !turnins.length && <div className="muted">{t('ui.npc.no_quest')}</div>}
    </div>
  );
}

function ShopTab({ npcId }: { npcId: string }) {
  const npc = NPC.get(npcId)!;
  const gold = useUI((s) => s.char?.gold ?? 0);
  const inv = useUI((s) => s.inv);
  const [sel, setSel] = useState<number | null>(null);
  const g = Game.current;
  const item = sel !== null ? inv[sel] : null;
  const def = item ? ITEM.get(item.id) : undefined;
  return (
    <div className="shop">
      <div className="shop-list">
        {(npc.sells ?? []).map((id) => {
          const d = ITEM.get(id)!;
          return (
            <div key={id} className="shop-row">
              <ItemIcon item={{ id, n: 1 }} small />
              <div className="shop-info">
                <div className={'item-name r' + d.rarity}>{itemName(id)}</div>
                <div className="muted">{statLines(d).join(' · ') || t(`item.${id}.desc`)}</div>
              </div>
              <button className="btn" disabled={gold < d.price} onClick={() => g?.send(C.BUY, { npc: npcId, item: id, n: 1, r: reqId() })}>
                {t('ui.shop.buy')} {d.price} 💠
              </button>
            </div>
          );
        })}
      </div>
      <div className="section-title">
        {t('ui.shop.sell_title')} — 💠 {gold}
      </div>
      <div className="grid">
        {inv.map((it, i) => (
          <ItemIcon key={i} item={it} selected={sel === i} onClick={() => setSel(it ? i : null)} />
        ))}
      </div>
      {item && def && sel !== null && (
        <ItemDetail item={item}>
          {def.sell > 0 && (
            <>
              <button className="btn primary" onClick={() => g?.send(C.SELL, { npc: npcId, slot: sel, n: 1, r: reqId() })}>
                {t('ui.item.sell')} (+{def.sell} 💠)
              </button>
              {item.n > 1 && (
                <button
                  className="btn"
                  onClick={() => {
                    g?.send(C.SELL, { npc: npcId, slot: sel, n: item.n, r: reqId() });
                    setSel(null);
                  }}
                >
                  {t('ui.item.sell_all')} (+{def.sell * item.n} 💠)
                </button>
              )}
            </>
          )}
        </ItemDetail>
      )}
    </div>
  );
}

function CraftTab({ npcId }: { npcId: string }) {
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const g = Game.current;
  const count = (id: string) => inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
  return (
    <div className="shop-list">
      {RECIPES.filter((r) => r.npc === npcId).map((r) => {
        const out = ITEM.get(r.output.id)!;
        const max = Math.min(...r.inputs.map((i) => Math.floor(count(i.id) / i.n)), r.gold > 0 ? Math.floor(gold / r.gold) : 99);
        return (
          <div key={r.id} className="shop-row craft">
            <ItemIcon item={{ id: out.id, n: r.output.n }} small />
            <div className="shop-info">
              <div className={'item-name r' + out.rarity}>{itemName(out.id)}</div>
              <div className="muted">{t(`item.${out.id}.desc`)}</div>
              <div className="craft-inputs">
                {r.inputs.map((i) => (
                  <span key={i.id} className={count(i.id) >= i.n ? 'ok' : 'bad'}>
                    {ITEM.get(i.id)?.icon} {itemName(i.id)} {count(i.id)}/{i.n}
                  </span>
                ))}
                <span className={gold >= r.gold ? 'ok' : 'bad'}>{t('ui.craft.cost', { n: r.gold })}</span>
              </div>
            </div>
            <div className="craft-btns">
              <button className="btn primary" disabled={max < 1} onClick={() => g?.send(C.CRAFT, { id: r.id, n: 1, r: reqId() })}>
                {t('ui.craft.make')}
              </button>
              {max >= 5 && (
                <button className="btn" onClick={() => g?.send(C.CRAFT, { id: r.id, n: 5, r: reqId() })}>
                  {t('ui.craft.make5')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnhanceTab({ npcId }: { npcId: string }) {
  const equip = useUI((s) => s.equip);
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const g = Game.current;
  const ore = inv.reduce((s, x) => s + (x && x.id === ENHANCE_ORE ? x.n : 0), 0);
  const worn = EQUIP_SLOTS.filter((es) => equip[es]);
  return (
    <div className="shop-list">
      <div className="section-title">
        {t('ui.enh.title')} — {ITEM.get(ENHANCE_ORE)?.icon} {ore} · 💠 {gold}
      </div>
      {worn.length === 0 && <div className="muted">{t('ui.enh.none')}</div>}
      {worn.map((es) => {
        const it = equip[es]!;
        const def = ITEM.get(it.id)!;
        const plus = it.plus ?? 0;
        const maxed = plus >= MAX_ENHANCE;
        const cost = enhanceCost(plus, Math.max(def.price, def.sell * 3));
        return (
          <div key={es} className="shop-row">
            <ItemIcon item={it} small />
            <div className="shop-info">
              <div className={'item-name r' + def.rarity}>{itemName(it.id, plus)}</div>
              <div className="muted">{statLines(def, plus).join(' · ')}</div>
              {!maxed && (
                <div className="craft-inputs">
                  <span className={gold >= cost.gold && ore >= cost.ore ? 'ok' : 'bad'}>{t('ui.enh.cost', { gold: cost.gold, ore: cost.ore })}</span>
                  <span>{t('ui.enh.chance', { n: Math.round(enhanceChance(plus) * 100) })}</span>
                </div>
              )}
            </div>
            <button className="btn primary" disabled={maxed || gold < cost.gold || ore < cost.ore} onClick={() => g?.send(C.ENHANCE, { npc: npcId, slot: es, r: reqId() })}>
              {maxed ? t('ui.enh.max') : t('ui.enh.do')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function NpcDialog({ npcId }: { npcId: string }) {
  const npc = NPC.get(npcId);
  const [tab, setTab] = useState<Tab>('talk');
  if (!npc) return null;
  const tabs: Tab[] = ['talk'];
  if (npc.sells) tabs.push('shop');
  if (npc.recipes) tabs.push('craft');
  if (npc.enhance) tabs.push('enhance');
  const cur = tabs.includes(tab) ? tab : 'talk';
  return (
    <Window title={`${t(`npc.${npcId}.name`)} — ${t(`npc.${npcId}.title`)}`} onClose={() => set({ npc: null })} cls="npc">
      {tabs.length > 1 && (
        <div className="tabs">
          {tabs.map((x) => (
            <button key={x} className={'tab' + (cur === x ? ' on' : '')} onClick={() => setTab(x)}>
              {t('ui.npc.tab.' + x)}
            </button>
          ))}
        </div>
      )}
      {cur === 'talk' && <QuestTab npcId={npcId} />}
      {cur === 'shop' && <ShopTab npcId={npcId} />}
      {cur === 'craft' && <CraftTab npcId={npcId} />}
      {cur === 'enhance' && <EnhanceTab npcId={npcId} />}
    </Window>
  );
}
