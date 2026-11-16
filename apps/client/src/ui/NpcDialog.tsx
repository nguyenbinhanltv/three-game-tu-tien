import { Portrait } from './Art';
import { ContentIcon, UiIcon } from './ContentIcon';
import { useState } from 'react';
import { C, sellPrice } from '@dtl/shared';
import { hasString, ITEM, itemName, METHOD, NPC, PILL_QUALITY, QUESTS, realmName, RECIPES, t } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { objectiveText } from './Hud';
import { ItemDetail, ItemIcon, RewardLine, statLines, Window } from './Panels';
import { Button, Divider, Tabs } from './kit';
import { RootTab } from './Realm';
import { EnhanceTab, ForgeTab, GemTab, PromoteTab, RefineTab, SalvageTab } from './UpgradeTabs';
import { set, useUI } from './store';

type Tab = 'talk' | 'shop' | 'craft' | 'enhance' | 'gem' | 'refine' | 'salvage' | 'forge' | 'promote' | 'root';

function QuestTab({ npcId }: { npcId: string }) {
  const quests = useUI((s) => s.quests);
  const level = useUI((s) => s.char?.level ?? 1);
  const g = Game.current;
  const offers = QUESTS.filter((q) => q.giver === npcId && !quests.active[q.id] && !quests.done.includes(q.id) && (!q.requires || quests.done.includes(q.requires)));
  const turnins = QUESTS.filter((q) => q.turnin === npcId && quests.active[q.id]);
  return (
    <div className="npc-quests">
      <div className="npc-greet-row">
        <Portrait id={npcId} className="npc-portrait" />
        <div className="npc-greet">“{t(`npc.${npcId}.greet`)}”</div>
      </div>
      {turnins.map((q) => {
        const prog = quests.active[q.id];
        const complete = q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count || (o.type === 'talk' && o.target === npcId));
        return (
          <div key={q.id} className={'k-card quest-card' + (complete ? ' ready' : '')}>
            <div className="quest-title">
              {complete ? <UiIcon id="mark_xong" fallback="❓" className="inline" /> : '⏳'} {t(`quest.${q.id}.name`)}
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
              <Button variant="primary" onClick={() => g?.send(C.QUEST, { a: 'turnin', id: q.id })}>
                {t('ui.quest.turnin')}
              </Button>
            ) : (
              <div className="k-dim">{t('ui.quest.in_progress')}</div>
            )}
          </div>
        );
      })}
      {offers.map((q) => {
        const lowLevel = (q.minLevel ?? 1) > level;
        return (
          <div key={q.id} className="k-card quest-card offer">
            <div className="quest-title"><UiIcon id="mark_nhan" fallback="❗" className="inline" /> {t(`quest.${q.id}.name`)}</div>
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
              <Button variant="primary" onClick={() => g?.send(C.QUEST, { a: 'accept', id: q.id })}>
                {t('ui.quest.accept')}
              </Button>
            )}
          </div>
        );
      })}
      {!offers.length && !turnins.length && <div className="k-dim">{t('ui.npc.no_quest')}</div>}
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
            <div key={id} className="k-card shop-row">
              <ItemIcon item={{ id, n: 1 }} small />
              <div className="shop-info">
                <div className="item-name" data-q={d.rarity}>{itemName(id)}</div>
                <div className="k-dim">{statLines(d).join(' · ') || t(`item.${id}.desc`)}</div>
              </div>
              <Button disabled={gold < d.price} onClick={() => g?.send(C.BUY, { npc: npcId, item: id, n: 1, r: reqId() })}>
                {t('ui.shop.buy')} {d.price} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" />
              </Button>
            </div>
          );
        })}
      </div>
      <Divider label={<>{t('ui.shop.sell_title')} — <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /> {gold}</>} />
      <div className="bag-grid">
        {inv.map((it, i) => (
          <ItemIcon key={i} item={it} selected={sel === i} onClick={() => setSel(it ? i : null)} />
        ))}
      </div>
      {item && def && sel !== null && (
        <ItemDetail item={item}>
          {def.sell > 0 && (
            <>
              <Button variant="primary" onClick={() => g?.send(C.SELL, { npc: npcId, slot: sel, n: 1, r: reqId() })}>
                {t('ui.item.sell')} (+{sellPrice(item, def)} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" />)
              </Button>
              {item.n > 1 && (
                <Button
                  onClick={() => {
                    g?.send(C.SELL, { npc: npcId, slot: sel, n: item.n, r: reqId() });
                    setSel(null);
                  }}
                >
                  {t('ui.item.sell_all')} (+{sellPrice(item, def) * item.n} <UiIcon id="cur_linh_thach" fallback="💠" className="inline" />)
                </Button>
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
  const level = useUI((s) => s.char?.level ?? 1);
  const equip = useUI((s) => s.equip);
  const methodId = useUI((s) => s.method?.method);
  const support = methodId ? METHOD.get(methodId)?.passive.kind === 'dan_kinh' : false;
  const count = (id: string) => inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
  const pct = (n: number) => Math.round(n * 100);
  return (
    <div className="shop-list">
      {RECIPES.filter((r) => r.npc === npcId).map((r) => {
        const out = ITEM.get(r.output.id)!;
        // Pháp bảo (trang bị): mỗi người một món; đã có (túi hoặc đang đeo) thì khóa nút.
        const isGear = out.kind !== 'consumable' && out.kind !== 'material';
        const owned = isGear && (count(out.id) > 0 || Object.values(equip).some((e) => e?.id === out.id));
        const lowLevel = !!r.reqLevel && level < r.reqLevel;
        const w = support ? PILL_QUALITY.support : PILL_QUALITY.base;
        const max = isGear ? (owned || lowLevel ? 0 : Math.min(1, ...r.inputs.map((i) => Math.floor(count(i.id) / i.n)), r.gold > 0 ? Math.floor(gold / r.gold) : 1)) : lowLevel ? 0 : Math.min(...r.inputs.map((i) => Math.floor(count(i.id) / i.n)), r.gold > 0 ? Math.floor(gold / r.gold) : 99);
        return (
          <div key={r.id} className="k-card shop-row craft">
            <ItemIcon item={{ id: out.id, n: r.output.n }} small />
            <div className="shop-info">
              <div className="item-name" data-q={out.rarity}>{itemName(out.id)}</div>
              <div className="k-dim">{t(`item.${out.id}.desc`)}</div>
              {r.quality && <div className="craft-chance" data-support={support ? '1' : undefined}>{t(support ? 'ui.craft.chance_support' : 'ui.craft.chance', { a: pct(w[0]), b: pct(w[1]), c: pct(w[2]) })}</div>}
              {r.reqLevel && <div className={lowLevel ? 'bad' : 'k-dim'}>{t('ui.craft.need_level', { n: realmName(r.reqLevel) })}</div>}
              <div className="craft-inputs">
                {r.inputs.map((i) => (
                  <span key={i.id} className={count(i.id) >= i.n ? 'ok' : 'bad'}>
                    <ContentIcon def={ITEM.get(i.id)} /> {itemName(i.id)} {count(i.id)}/{i.n}
                  </span>
                ))}
                <span className={gold >= r.gold ? 'ok' : 'bad'}>{t('ui.craft.cost', { n: r.gold })}</span>
              </div>
            </div>
            <div className="craft-btns">
              <Button variant="primary" disabled={max < 1} onClick={() => g?.send(C.CRAFT, { id: r.id, n: 1, r: reqId() })}>
                {t('ui.craft.make')}
              </Button>
              {owned && <span className="k-dim">{t('ui.craft.owned')}</span>}
              {!isGear && max >= 5 && (
                <Button onClick={() => g?.send(C.CRAFT, { id: r.id, n: 5, r: reqId() })}>
                  {t('ui.craft.make5')}
                </Button>
              )}
            </div>
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
  if (npc.enhance) tabs.push('enhance', 'gem', 'refine', 'salvage', 'forge', 'promote');
  if (npc.rootChange) tabs.push('root');
  const cur = tabs.includes(tab) ? tab : 'talk';
  return (
    <Window title={t(`npc.${npcId}.name`)} sub={t(`npc.${npcId}.title`)} onClose={() => set({ npc: null })} cls="npc" width={540}>
      {tabs.length > 1 && <Tabs items={tabs.map((x) => ({ id: x, label: hasString(`ui.npc.tab.${x}.${npcId}`) ? t(`ui.npc.tab.${x}.${npcId}`) : t('ui.npc.tab.' + x) }))} value={cur} onChange={(id) => setTab(id as Tab)} label={t('ui.npc.tabs')} />}
      {cur === 'talk' && <QuestTab npcId={npcId} />}
      {cur === 'shop' && <ShopTab npcId={npcId} />}
      {cur === 'craft' && <CraftTab npcId={npcId} />}
      {cur === 'enhance' && <EnhanceTab npcId={npcId} />}
      {cur === 'gem' && <GemTab npcId={npcId} />}
      {cur === 'refine' && <RefineTab npcId={npcId} />}
      {cur === 'salvage' && <SalvageTab npcId={npcId} />}
      {cur === 'forge' && <ForgeTab npcId={npcId} />}
      {cur === 'promote' && <PromoteTab npcId={npcId} />}
      {cur === 'root' && <RootTab npcId={npcId} />}
    </Window>
  );
}
