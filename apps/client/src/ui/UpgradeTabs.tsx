// Nâng cấp trang bị Phase 3-3 ở Thiết lão: cường hóa (Hộ Phù), khảm/tháo/ghép ngọc, tẩy luyện, phân giải.
// Dùng bộ khung `ui/kit`. Client chỉ chọn món/ngọc/dòng và gửi ý định; xác suất và kết quả do server quyết định.
import './upgrade.css';
import { useState } from 'react';
import {
  allGemIds,
  C,
  DUST_ITEM,
  enhanceChance,
  enhanceCost,
  ENHANCE_RISK_FROM,
  EQUIP_SLOTS,
  type EquipSlot,
  gemAffixes,
  gemMergeCost,
  gemRemoveCost,
  gemSocketCost,
  type InvItem,
  isEquipSlot,
  MAX_ENHANCE,
  parseGem,
  PROMOTE_ENHANCE_LOSS,
  PROMOTE_MAT,
  PROMOTE_MAT_COUNT,
  promoteGold,
  promoteOpen,
  promotePlus,
  REFINE_ITEM,
  refineCost,
  SALVAGE_MAX_BATCH,
  salvageYield,
  WARD_ITEM,
  GEM_MERGE_COUNT,
} from '@dtl/shared';
import { ENHANCE_ORE, FORGE, ITEM, itemName, itemTier, promoteTarget, SET, t } from '@dtl/content';
import { ContentIcon, UiIcon } from './ContentIcon';
import { Game, reqId } from '../game/engine';
import { affixText, gearQuality, setLines } from './gear';
import { Button, Divider } from './kit';
import { ItemIcon, statLines } from './windows/common';
import { useUI } from './store';

/** Món có thể xử lý: đang mặc (`w`) hoặc ở túi (`i`). */
interface GearEntry {
  key: string;
  ref: { w: EquipSlot } | { i: number };
  item: InvItem;
  worn: boolean;
}

function gearEntries(inv: (InvItem | null)[], equip: Partial<Record<EquipSlot, InvItem>>): GearEntry[] {
  const out: GearEntry[] = [];
  for (const es of EQUIP_SLOTS) {
    const it = equip[es];
    if (it && ITEM.get(it.id)) out.push({ key: 'w:' + es, ref: { w: es }, item: it, worn: true });
  }
  inv.forEach((it, i) => {
    const def = it ? ITEM.get(it.id) : undefined;
    if (it && def && isEquipSlot(def.kind)) out.push({ key: 'i:' + i, ref: { i }, item: it, worn: false });
  });
  return out;
}

function count(inv: (InvItem | null)[], id: string): number {
  return inv.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0);
}

function GearHead({ e }: { e: GearEntry }) {
  const def = ITEM.get(e.item.id)!;
  return (
    <>
      <ItemIcon item={e.item} small worn={e.worn} />
      <div className="shop-info">
        <div className="item-name" data-q={gearQuality(e.item, def)}>
          {itemName(e.item.id, e.item.plus)}
          {e.worn && <span className="upg-worn"> · {t('ui.upg.worn')}</span>}
        </div>
      </div>
    </>
  );
}

function Mats({ ids }: { ids: string[] }) {
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  return (
    <div className="k-dim upg-mats">
      {ids.map((id) => (
        <span key={id}>
          <ContentIcon def={ITEM.get(id)} /> {count(inv, id)}
        </span>
      ))}
      <span>
        <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /> {gold}
      </span>
    </div>
  );
}

// ---------- cường hóa ----------

export function EnhanceTab({ npcId }: { npcId: string }) {
  const equip = useUI((s) => s.equip);
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const [ward, setWard] = useState(true);
  const g = Game.current;
  const ore = count(inv, ENHANCE_ORE);
  const wards = count(inv, WARD_ITEM);
  const list = gearEntries(inv, equip);
  return (
    <div className="shop-list">
      <Divider label={t('ui.enh.title')} />
      <Mats ids={[ENHANCE_ORE, WARD_ITEM]} />
      <div className="k-dim">{t('ui.enh.rule', { n: ENHANCE_RISK_FROM, max: MAX_ENHANCE })}</div>
      <label className="upg-check">
        <input type="checkbox" checked={ward} onChange={(ev) => setWard(ev.target.checked)} /> {t('ui.enh.use_ward')}
      </label>
      {list.length === 0 && <div className="k-dim">{t('ui.enh.none')}</div>}
      {list.map((e) => {
        const def = ITEM.get(e.item.id)!;
        const plus = e.item.plus ?? 0;
        const maxed = plus >= MAX_ENHANCE;
        const cost = enhanceCost(plus, Math.max(def.price, def.sell * 3));
        const risky = plus >= ENHANCE_RISK_FROM;
        const useWard = ward && risky && wards > 0;
        const enough = gold >= cost.gold && ore >= cost.ore;
        return (
          <div key={e.key} className="k-card shop-row">
            <ItemIcon item={e.item} small worn={e.worn} />
            <div className="shop-info">
              <div className="item-name" data-q={gearQuality(e.item, def)}>
                {itemName(e.item.id, plus)}
                {e.worn && <span className="upg-worn"> · {t('ui.upg.worn')}</span>}
              </div>
              <div className="k-dim">{statLines(def, plus).join(' · ')}</div>
              {!maxed && (
                <div className="craft-inputs">
                  <span className={enough ? 'ok' : 'bad'}>{t('ui.enh.cost', { gold: cost.gold, ore: cost.ore })}</span>
                  <span>{t('ui.enh.chance', { n: Math.round(enhanceChance(plus) * 100) })}</span>
                  {risky && <span className={useWard ? 'ok' : 'bad'}>{useWard ? t('ui.enh.ward_on') : t('ui.enh.risk')}</span>}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              disabled={maxed || !enough}
              onClick={() => g?.send(C.ENHANCE, { npc: npcId, ...e.ref, ward: useWard, r: reqId() })}
            >
              {maxed ? t('ui.enh.max') : t('ui.enh.do')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- khảm ngọc ----------

function gemLines(id: string): string {
  return gemAffixes(id).map(affixText).join(', ');
}

export function GemTab({ npcId }: { npcId: string }) {
  const equip = useUI((s) => s.equip);
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const [pick, setPick] = useState<Record<string, string>>({});
  const g = Game.current;
  const send = (payload: Record<string, unknown>) => g?.send(C.UPGRADE, { npc: npcId, r: reqId(), ...payload });
  const owned = allGemIds().filter((id) => count(inv, id) > 0);
  const list = gearEntries(inv, equip).filter((e) => e.item.inst && e.item.inst.gems.length > 0);
  const dust = count(inv, DUST_ITEM);
  return (
    <div className="shop-list">
      <Divider label={t('ui.gem.title')} />
      <Mats ids={[DUST_ITEM]} />
      {list.length === 0 && <div className="k-dim">{t('ui.gem.none')}</div>}
      {list.map((e) => (
        <div key={e.key} className="k-card shop-row upg-gear">
          <GearHead e={e} />
          <div className="upg-sockets">
            {e.item.inst!.gems.map((gem, idx) => {
              const k = `${e.key}:${idx}`;
              const sel = pick[k] ?? owned[0] ?? '';
              const gd = parseGem(gem);
              const sd = parseGem(sel);
              return (
                <div key={idx} className="upg-socket" data-testid={`socket-${e.key}-${idx}`}>
                  {gd ? (
                    <>
                      <span className="upg-gemname" data-q={gd.tier} title={gemLines(gem)}>
                        <ContentIcon def={ITEM.get(gem)} /> {t(`item.${gem}.name`)}
                      </span>
                      <span className="k-dim">{gemLines(gem)}</span>
                      <Button disabled={gold < gemRemoveCost(gd.tier)} onClick={() => send({ op: 'unsocket', ...e.ref, idx })}>
                        {t('ui.gem.remove', { n: gemRemoveCost(gd.tier) })}
                      </Button>
                    </>
                  ) : (
                    <span className="k-dim">{t('ui.gem.slot_empty')}</span>
                  )}
                  {owned.length > 0 && (
                    <>
                      <select
                        className="upg-select"
                        aria-label={t('ui.gem.choose')}
                        value={sel}
                        onChange={(ev) => setPick({ ...pick, [k]: ev.target.value })}
                      >
                        {owned.map((id) => (
                          <option key={id} value={id}>
                            {t(`item.${id}.name`)} ×{count(inv, id)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="primary"
                        disabled={!sd || gold < gemSocketCost(sd.tier)}
                        onClick={() => send({ op: 'socket', ...e.ref, idx, gem: sel })}
                      >
                        {t(gd ? 'ui.gem.replace' : 'ui.gem.socket', { n: sd ? gemSocketCost(sd.tier) : 0 })}
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Divider label={t('ui.gem.merge_title')} />
      <div className="k-dim">{t('ui.gem.merge_desc', { n: GEM_MERGE_COUNT })}</div>
      {owned.length === 0 && <div className="k-dim">{t('ui.gem.merge_none')}</div>}
      {owned.map((id) => {
        const gd = parseGem(id)!;
        const have = count(inv, id);
        if (gd.tier >= 3) return null;
        const cost = gemMergeCost(gd.tier);
        const can = have >= GEM_MERGE_COUNT && gold >= cost.gold && dust >= cost.dust;
        return (
          <div key={id} className="k-card shop-row">
            <ContentIcon def={ITEM.get(id)} />
            <div className="shop-info">
              <div className="item-name" data-q={gd.tier}>
                {t(`item.${id}.name`)} ×{have}
              </div>
              <div className="craft-inputs">
                <span className={gold >= cost.gold && dust >= cost.dust ? 'ok' : 'bad'}>
                  {t('ui.gem.merge_cost', { gold: cost.gold, dust: cost.dust })}
                </span>
              </div>
            </div>
            <Button variant="primary" disabled={!can} onClick={() => send({ op: 'merge', gem: id })}>
              {t('ui.gem.merge')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- tẩy luyện ----------

export function RefineTab({ npcId }: { npcId: string }) {
  const equip = useUI((s) => s.equip);
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const g = Game.current;
  const stones = count(inv, REFINE_ITEM);
  const dust = count(inv, DUST_ITEM);
  const list = gearEntries(inv, equip).filter((e) => (e.item.inst?.affixes.length ?? 0) > 0);
  return (
    <div className="shop-list">
      <Divider label={t('ui.refine.title')} />
      <Mats ids={[REFINE_ITEM, DUST_ITEM]} />
      <div className="k-dim">{t('ui.refine.desc')}</div>
      {list.length === 0 && <div className="k-dim">{t('ui.refine.none')}</div>}
      {list.map((e) => {
        const inst = e.item.inst!;
        const cost = refineCost(inst.ilvl, inst.q);
        const enough = gold >= cost.gold && stones >= cost.stones && dust >= cost.dust;
        return (
          <div key={e.key} className="k-card shop-row upg-gear">
            <GearHead e={e} />
            <div className="upg-sockets">
              {inst.affixes.map((a, idx) => (
                <div key={idx} className="upg-socket" data-testid={`affix-${e.key}-${idx}`}>
                  <span className="upg-affix">{affixText(a)}</span>
                  <span className={'upg-cost ' + (enough ? 'ok' : 'bad')}>
                    {t('ui.refine.cost', { gold: cost.gold, stones: cost.stones, dust: cost.dust })}
                  </span>
                  <Button
                    variant="primary"
                    disabled={!enough}
                    onClick={() => g?.send(C.UPGRADE, { npc: npcId, op: 'refine', ...e.ref, idx, r: reqId() })}
                  >
                    {t('ui.refine.do')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- phân giải ----------

export function SalvageTab({ npcId }: { npcId: string }) {
  const inv = useUI((s) => s.inv);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const g = Game.current;
  const list = gearEntries(inv, {}).filter((e) => !e.worn);
  const chosen = list.filter((e) => 'i' in e.ref && sel.has(e.ref.i));
  let ore = 0;
  let dust = 0;
  let risky = false;
  for (const e of chosen) {
    const q = gearQuality(e.item);
    const y = salvageYield(q, e.item.plus ?? 0, e.item.inst ? 0 : (ITEM.get(e.item.id)?.price ?? 0), ITEM.get(ENHANCE_ORE)?.price ?? 0);
    ore += y.ore;
    dust += y.dust;
    if (q >= 2 || (e.item.plus ?? 0) > 0) risky = true;
  }
  const toggle = (i: number) => {
    const n = new Set(sel);
    if (n.has(i)) n.delete(i);
    else if (n.size < SALVAGE_MAX_BATCH) n.add(i);
    setSel(n);
    setConfirm(false);
  };
  const quick = (maxQ: number) => {
    setSel(
      new Set(
        list
          .filter((e) => 'i' in e.ref && gearQuality(e.item) <= maxQ && !(e.item.plus ?? 0))
          .map((e) => (e.ref as { i: number }).i)
          .slice(0, SALVAGE_MAX_BATCH),
      ),
    );
    setConfirm(false);
  };
  const run = () => {
    if (risky && !confirm) return setConfirm(true);
    g?.send(C.UPGRADE, {
      npc: npcId,
      op: 'salvage',
      slots: chosen.map((e) => (e.ref as { i: number }).i),
      ids: chosen.map((e) => e.item.id),
      r: reqId(),
    });
    setSel(new Set());
    setConfirm(false);
  };
  return (
    <div className="shop-list">
      <Divider label={t('ui.salvage.title')} />
      <div className="k-dim">{t('ui.salvage.desc')}</div>
      <div className="upg-quick">
        <Button onClick={() => quick(0)}>{t('ui.salvage.pick_q0')}</Button>
        <Button onClick={() => quick(1)}>{t('ui.salvage.pick_q1')}</Button>
        <Button onClick={() => (setSel(new Set()), setConfirm(false))}>{t('ui.salvage.clear')}</Button>
      </div>
      {list.length === 0 && <div className="k-dim">{t('ui.salvage.none')}</div>}
      <div className="upg-grid">
        {list.map((e) => {
          const i = (e.ref as { i: number }).i;
          const y = salvageYield(
            gearQuality(e.item),
            e.item.plus ?? 0,
            e.item.inst ? 0 : (ITEM.get(e.item.id)?.price ?? 0),
            ITEM.get(ENHANCE_ORE)?.price ?? 0,
          );
          return (
            <div
              key={e.key}
              role="checkbox"
              aria-checked={sel.has(i)}
              tabIndex={0}
              className={'upg-cell' + (sel.has(i) ? ' on' : '')}
              onClick={() => toggle(i)}
              onKeyDown={(ev) => {
                if (ev.key === ' ' || ev.key === 'Enter') {
                  ev.preventDefault();
                  toggle(i);
                }
              }}
              title={t('ui.salvage.yield', y)}
              data-testid={`salvage-${i}`}
            >
              <ItemIcon item={e.item} small />
              <span className="item-name" data-q={gearQuality(e.item)}>
                {itemName(e.item.id, e.item.plus)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="upg-total">
        {chosen.length > 0 ? t('ui.salvage.total', { n: chosen.length, ore, dust }) : t('ui.salvage.pick_hint')}
      </div>
      <Button variant="primary" disabled={chosen.length === 0} onClick={run}>
        {confirm ? t('ui.salvage.confirm') : t('ui.salvage.do', { n: chosen.length })}
      </Button>
    </div>
  );
}

// ---------- chế tạo bộ trang bị (P3-4) ----------

export function ForgeTab({ npcId }: { npcId: string }) {
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const equip = useUI((s) => s.equip);
  const g = Game.current;
  const level = useUI((s) => s.char?.level ?? 1);
  const list = FORGE.filter((f) => f.npc === npcId || f.alsoAt?.includes(npcId));
  const sets = [...new Set(list.map((f) => ITEM.get(f.output)?.set).filter((x): x is string => !!x))];
  return (
    <div className="shop-list" data-testid="forge-tab">
      <Divider label={t('ui.forge.title')} />
      <div className="k-dim">{t('ui.forge.desc')}</div>
      {list.map((f) => {
        const out = ITEM.get(f.output)!;
        const tot = f.q.reduce((a, b) => a + b, 0) || 1;
        const can = f.inputs.every((i) => count(inv, i.id) >= i.n) && gold >= f.gold && level >= (f.reqLevel ?? 1);
        return (
          <div key={f.id} className="k-card shop-row craft" data-testid={`forge-${f.id}`}>
            <ItemIcon item={{ id: out.id, n: 1 }} small />
            <div className="shop-info">
              <div className="item-name" data-q={f.q.findIndex((x) => x > 0)}>
                {itemName(out.id)}
              </div>
              <div className="k-dim">
                {t('ui.item.kind.' + out.kind)} ·{' '}
                {t('ui.forge.chance', { a: Math.round((f.q[2]! / tot) * 100), b: Math.round((f.q[3]! / tot) * 100) })}
              </div>
              <div className="craft-inputs">
                {f.inputs.map((i) => (
                  <span key={i.id} className={count(inv, i.id) >= i.n ? 'ok' : 'bad'}>
                    <ContentIcon def={ITEM.get(i.id)} /> {itemName(i.id)} {count(inv, i.id)}/{i.n}
                  </span>
                ))}
                <span className={gold >= f.gold ? 'ok' : 'bad'}>{t('ui.craft.cost', { n: f.gold })}</span>
              </div>
            </div>
            <div className="craft-btns">
              <Button
                variant="primary"
                disabled={!can}
                onClick={() => g?.send(C.UPGRADE, { npc: npcId, op: 'forge', id: f.id, r: reqId() })}
              >
                {t('ui.forge.make')}
              </Button>
            </div>
          </div>
        );
      })}
      {sets.map((sid) => (
        <div key={sid} className="k-card set-card">
          {setLines(SET.get(sid)!, equip).map((l, i) => (
            <div key={i} className={'item-stat' + (l.tone ? ' ' + l.tone : '')}>
              {l.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------- Thăng Bậc (E2-F) ----------

export function PromoteTab({ npcId }: { npcId: string }) {
  const equip = useUI((s) => s.equip);
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const level = useUI((s) => s.char?.level ?? 1);
  const g = Game.current;
  const list = gearEntries(inv, equip).filter((e) => e.item.inst && ITEM.get(e.item.id)?.kind !== 'artifact');
  return (
    <div className="shop-list" data-testid="promote-tab">
      <Divider label={t('ui.upg.tab.promote')} />
      <div className="k-dim">{t('ui.promote.hint', { n: PROMOTE_ENHANCE_LOSS })}</div>
      {list.length === 0 && <div className="k-dim">{t('ui.promote.empty')}</div>}
      {list.map((e) => {
        const def = ITEM.get(e.item.id)!;
        const from = itemTier(def.id);
        const toId = promoteTarget(def.id);
        const open = promoteOpen(from) && !!toId;
        const toDef = toId ? ITEM.get(toId) : undefined;
        const to = from + 1;
        const mat = PROMOTE_MAT[to];
        const cost = open && mat ? { mat, n: PROMOTE_MAT_COUNT, gold: promoteGold(to) } : null;
        const enough = !!cost && count(inv, cost.mat) >= cost.n && gold >= cost.gold && level >= (toDef?.reqLevel ?? 1);
        const plus = e.item.plus ?? 0;
        return (
          <div key={e.key} className="k-card shop-row" data-testid={`promote-${e.key}`}>
            <ItemIcon item={e.item} small worn={e.worn} />
            <div className="shop-info">
              <div className="item-name" data-q={gearQuality(e.item, def)}>
                {itemName(e.item.id, plus)}
                {e.worn && <span className="upg-worn"> · {t('ui.upg.worn')}</span>}
                <span className="k-dim"> · {t('ui.item.tier', { n: from })}</span>
              </div>
              {open && toDef && cost ? (
                <>
                  <div className="k-dim">
                    {t('ui.promote.to')}: {itemName(toDef.id, plus > 0 ? promotePlus(plus) : 0)} · {t('ui.item.tier', { n: to })}
                  </div>
                  <div className="craft-inputs">
                    <span className={count(inv, cost.mat) >= cost.n ? 'ok' : 'bad'}>
                      <ContentIcon def={ITEM.get(cost.mat)} /> {itemName(cost.mat)} {count(inv, cost.mat)}/{cost.n}
                    </span>
                    <span className={gold >= cost.gold ? 'ok' : 'bad'}>{t('ui.promote.fee', { n: cost.gold })}</span>
                    {level < (toDef.reqLevel ?? 1) && <span className="bad">{t('sys.equip_level')}</span>}
                  </div>
                </>
              ) : (
                <div className="k-dim">{t('ui.promote.locked')}</div>
              )}
            </div>
            <Button
              variant="primary"
              disabled={!enough}
              onClick={() => g?.send(C.UPGRADE, { npc: npcId, op: 'promote', ...e.ref, r: reqId() })}
            >
              {t('ui.promote.go')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
