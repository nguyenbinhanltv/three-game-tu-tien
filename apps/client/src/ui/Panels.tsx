import { useEffect, useRef, useState } from 'react';
import { C, enhanceMul, EQUIP_SLOTS, type EquipSlot, type InvItem, type ItemDef, NGUNG_KHI_MAX, WORLD_SIZE } from '@dtl/shared';
import { ITEM, itemName, QUEST, QUESTS, realmName, SKILLS, t, TRUC_CO_PILL } from '@dtl/content';
import { getVolume, isMuted, setMuted, setVolume, sfx, unlockAudio, VOLUME_KEYS, type VolumeKey } from '../game/audio';
import { Game, reqId } from '../game/engine';
import { objectiveText } from './Hud';
import { set, useUI } from './store';

export function statLines(def: ItemDef, plus = 0): string[] {
  const out: string[] = [];
  const mul = enhanceMul(plus);
  if (def.stats?.atk) out.push(t('ui.stat.atk', { n: Math.round(def.stats.atk * mul) }));
  if (def.stats?.def) out.push(t('ui.stat.def', { n: Math.round(def.stats.def * mul) }));
  if (def.stats?.hp) out.push(t('ui.stat.hp', { n: Math.round(def.stats.hp * mul) }));
  if (def.stats?.mp) out.push(t('ui.stat.mp', { n: Math.round(def.stats.mp * mul) }));
  return out;
}

export function ItemIcon({ item, onClick, selected, small }: { item: InvItem | null | undefined; onClick?: () => void; selected?: boolean; small?: boolean }) {
  const def = item ? ITEM.get(item.id) : undefined;
  return (
    <button
      className={'slot' + (def ? ' r' + def.rarity : ' empty') + (selected ? ' selected' : '') + (small ? ' small' : '')}
      onClick={onClick}
      title={def ? itemName(def.id, item!.plus) : undefined}
    >
      {def && <span className="slot-icon">{def.icon}</span>}
      {item && item.n > 1 && <span className="slot-n">{item.n}</span>}
      {item?.plus ? <span className="slot-plus">+{item.plus}</span> : null}
    </button>
  );
}

export function ItemDetail({ item, children }: { item: InvItem; children?: React.ReactNode }) {
  const def = ITEM.get(item.id);
  const level = useUI((s) => s.char?.level ?? 1);
  if (!def) return null;
  return (
    <div className="item-detail">
      <div className={'item-name r' + def.rarity}>
        {def.icon} {itemName(def.id, item.plus)}
      </div>
      <div className="item-kind">{t('ui.item.kind.' + def.kind)}</div>
      {statLines(def, item.plus).map((l) => (
        <div key={l} className="item-stat">
          {l}
        </div>
      ))}
      {def.reqLevel && def.reqLevel > 1 && <div className={'item-req' + (level < def.reqLevel ? ' bad' : '')}>{t('ui.item.req', { realm: realmName(def.reqLevel) })}</div>}
      <div className="item-desc">{t(`item.${def.id}.desc`)}</div>
      {def.sell > 0 && <div className="item-price">{t('ui.item.sell_price', { n: def.sell })} 💠</div>}
      <div className="item-actions">{children}</div>
    </div>
  );
}

function Window({ title, onClose, children, cls }: { title: string; onClose: () => void; children: React.ReactNode; cls?: string }) {
  return (
    <div className={'window ' + (cls ?? '')}>
      <div className="window-head">
        <span>{title}</span>
        <button className="window-close" onClick={onClose} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}

function Bag() {
  const inv = useUI((s) => s.inv);
  const equip = useUI((s) => s.equip);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const [sel, setSel] = useState<number | null>(null);
  const [selEq, setSelEq] = useState<EquipSlot | null>(null);
  const item = sel !== null ? inv[sel] : null;
  const def = item ? ITEM.get(item.id) : undefined;
  const eqItem = selEq ? equip[selEq] : undefined;
  const g = Game.current;
  return (
    <Window title={t('ui.bag')} onClose={() => set({ panel: null })} cls="bag">
      <div className="equip-row">
        {EQUIP_SLOTS.map((es) => (
          <div key={es} className="equip-cell">
            <ItemIcon
              item={equip[es]}
              selected={selEq === es}
              onClick={() => {
                setSelEq(equip[es] ? es : null);
                setSel(null);
              }}
            />
            <div className="equip-label">{t('ui.equip.' + es)}</div>
          </div>
        ))}
        <div className="gold">
          💠 <b>{gold}</b>
          <div className="equip-label">{t('ui.gold')}</div>
        </div>
      </div>
      <div className="grid">
        {inv.map((it, i) => (
          <ItemIcon
            key={i}
            item={it}
            selected={sel === i}
            onClick={() => {
              setSel(it ? i : null);
              setSelEq(null);
            }}
          />
        ))}
      </div>
      {item && def && sel !== null ? (
        <ItemDetail item={item}>
          {def.kind === 'consumable' && (
            <button className="btn primary" onClick={() => g?.send(C.USE, { slot: sel, r: reqId() })}>
              {t('ui.item.use')}
            </button>
          )}
          {(def.kind === 'weapon' || def.kind === 'robe' || def.kind === 'accessory') && (
            <button
              className="btn primary"
              onClick={() => {
                g?.send(C.EQUIP, { slot: sel });
                setSel(null);
              }}
            >
              {t('ui.item.equip')}
            </button>
          )}
        </ItemDetail>
      ) : eqItem && selEq ? (
        <ItemDetail item={eqItem}>
          <button
            className="btn"
            onClick={() => {
              g?.send(C.UNEQUIP, { slot: selEq });
              setSelEq(null);
            }}
          >
            {t('ui.item.unequip')}
          </button>
        </ItemDetail>
      ) : (
        <div className="item-detail muted">{t('ui.bag.empty_hint')}</div>
      )}
    </Window>
  );
}

function Character() {
  const char = useUI((s) => s.char);
  const inv = useUI((s) => s.inv);
  if (!char) return null;
  const canTrib = char.level === NGUNG_KHI_MAX;
  const xpFull = char.xp >= char.xpNeed;
  const hasPill = inv.some((s) => s?.id === TRUC_CO_PILL);
  return (
    <Window title={t('ui.char')} onClose={() => set({ panel: null })} cls="char">
      <div className="char-name">{char.name}</div>
      <div className="char-realm">{realmName(char.level)}</div>
      <table className="stats">
        <tbody>
          <tr>
            <td>{t('ui.hp')}</td>
            <td>{char.mhp}</td>
            <td>{t('ui.mp')}</td>
            <td>{char.mmp}</td>
          </tr>
          <tr>
            <td>{t('ui.atk')}</td>
            <td>{char.atk}</td>
            <td>{t('ui.def')}</td>
            <td>{char.def}</td>
          </tr>
          <tr>
            <td>{t('ui.xp')}</td>
            <td colSpan={3}>
              {char.xp} / {char.xpNeed}
            </td>
          </tr>
          <tr>
            <td>{t('ui.gold')}</td>
            <td colSpan={3}>{char.gold} 💠</td>
          </tr>
        </tbody>
      </table>
      <div className="section-title">{t('ui.char.skills')}</div>
      <div className="skill-list">
        {SKILLS.map((sk, i) => (
          <div key={sk.id} className={'skill-item' + (char.level < sk.unlock ? ' locked' : '')}>
            <span className="skill-item-icon">{sk.icon}</span>
            <div>
              <div className="skill-item-name">
                [{i + 1}] {t(`skill.${sk.id}.name`)}
                {char.level < sk.unlock && <i> — {t('ui.char.locked', { realm: realmName(sk.unlock) })}</i>}
              </div>
              <div className="skill-item-desc">{t(`skill.${sk.id}.desc`)}</div>
            </div>
          </div>
        ))}
      </div>
      {canTrib && (
        <div className="trib-box">
          <div className="muted">{t('ui.char.breakthrough_hint')}</div>
          <div className={xpFull ? 'ok' : 'bad'}>
            {xpFull ? '✔' : '✘'} {t('ui.xp_full')}
          </div>
          <div className={hasPill ? 'ok' : 'bad'}>
            {hasPill ? '✔' : '✘'} {itemName(TRUC_CO_PILL)}
          </div>
          <button
            className="btn primary"
            disabled={!xpFull || !hasPill}
            onClick={() => {
              Game.current?.send(C.BREAKTHROUGH);
              set({ panel: null });
            }}
          >
            ⚡ {t('ui.char.breakthrough')}
          </button>
        </div>
      )}
    </Window>
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
      {q.rewards.gold > 0 && <span>{q.rewards.gold} 💠</span>}
      {(q.rewards.items ?? []).map((it) => (
        <span key={it.id} className={'r' + (ITEM.get(it.id)?.rarity ?? 0)}>
          {ITEM.get(it.id)?.icon} {itemName(it.id)}
          {it.n > 1 ? ` ×${it.n}` : ''}
        </span>
      ))}
    </div>
  );
}

function Quests() {
  const quests = useUI((s) => s.quests);
  const ids = Object.keys(quests.active);
  return (
    <Window title={t('ui.quests')} onClose={() => set({ panel: null })} cls="quests">
      {ids.length === 0 && <div className="muted">{t('ui.quest.none')}</div>}
      {ids.map((id) => {
        const q = QUEST.get(id);
        if (!q) return null;
        const prog = quests.active[id];
        return (
          <div key={id} className="quest-card">
            <div className="quest-title">{t(`quest.${id}.name`)}</div>
            <div className="quest-desc">{t(`quest.${id}.desc`)}</div>
            {q.objectives.map((o, i) => {
              const cur = Math.min(o.count, prog[i] ?? 0);
              const ok = cur >= o.count;
              const count = o.type === 'kill' || o.type === 'gather' || o.type === 'craft' ? ` ${cur}/${o.count}` : '';
              return (
                <div key={i} className={'quest-obj' + (ok ? ' ok' : '')}>
                  {ok ? '✔' : '○'} {objectiveText(o)}
                  {count}
                </div>
              );
            })}
            <div className="quest-turnin">{t('ui.quest.turnin_at', { npc: t(`npc.${q.turnin}.name`) })}</div>
            <RewardLine id={id} />
          </div>
        );
      })}
      <div className="muted">{t('ui.quest.done_count', { n: quests.done.length, total: QUESTS.length })}</div>
    </Window>
  );
}

function Help() {
  const rows = ['move', 'camera', 'jump', 'fly', 'target', 'skill', 'interact', 'meditate', 'panels', 'chat'];
  return (
    <Window title={t('ui.help')} onClose={() => set({ panel: null })} cls="help">
      <table className="help-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td>{t(`ui.help.${r}`)}</td>
              <td>{t(`ui.help.${r}_v`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">{t('ui.help.tip')}</div>
    </Window>
  );
}

/** Thanh trượt âm lượng cho master và từng bus; thả tay thì phát thử một âm trên bus đó. */
function VolumeSlider({ k }: { k: VolumeKey }) {
  const [v, setV] = useState(() => Math.round(getVolume(k) * 100));
  const preview = () => {
    if (k === 'sfx' || k === 'master') sfx('hit');
    else if (k === 'ui') sfx('loot');
  };
  return (
    <label className="vol-row">
      <span>{t('ui.settings.vol.' + k)}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          unlockAudio();
          setVolume(k, n / 100);
          setV(n);
        }}
        onPointerUp={preview}
        onKeyUp={preview}
      />
      <span className="vol-val">{v}%</span>
    </label>
  );
}

function Settings() {
  const quality = useUI((s) => s.quality);
  const fps = useUI((s) => s.fps);
  const controls = useUI((s) => s.controls);
  const [mute, setMute] = useState(isMuted());
  return (
    <Window title={t('ui.settings')} onClose={() => set({ panel: null })} cls="settings">
      <div className="section-title">{t('ui.settings.controls')}</div>
      <div className="seg">
        {['mouse', 'turn', 'strafe'].map((m) => (
          <button key={m} className={'btn' + (controls === m ? ' primary' : '')} onClick={() => Game.current?.setControls(m)}>
            {t('ui.settings.controls.' + m)}
          </button>
        ))}
      </div>
      <div className="muted">{t('ui.settings.controls_hint.' + controls)}</div>
      <div className="section-title">{t('ui.settings.quality')}</div>
      <div className="seg">
        {['low', 'medium', 'high'].map((q) => (
          <button key={q} className={'btn' + (quality === q ? ' primary' : '')} onClick={() => Game.current?.setQuality(q)}>
            {t('ui.settings.q.' + q)}
          </button>
        ))}
      </div>
      <div className="muted">{t('ui.settings.quality_hint')}</div>
      <div className="muted">{t('ui.settings.fps', { n: fps })}</div>
      <div className="section-title">{t('ui.settings.sound')}</div>
      <div className="seg">
        <button
          className={'btn' + (!mute ? ' primary' : '')}
          onClick={() => {
            setMuted(false);
            setMute(false);
          }}
        >
          {t('ui.settings.sound_on')}
        </button>
        <button
          className={'btn' + (mute ? ' primary' : '')}
          onClick={() => {
            setMuted(true);
            setMute(true);
          }}
        >
          {t('ui.settings.sound_off')}
        </button>
      </div>
      {VOLUME_KEYS.map((k) => (
        <VolumeSlider key={k} k={k} />
      ))}
      <button
        className="btn"
        onClick={() => {
          Game.current?.dispose();
          set({ phase: 'login', panel: null, needName: false, log: [] });
        }}
      >
        {t('ui.settings.logout')}
      </button>
    </Window>
  );
}

const MAP_LABELS: { key: string; x: number; z: number }[] = [
  { key: 'ui.zone.sect', x: 2048, z: 2048 },
  { key: 'ui.zone.valley', x: 2048, z: 2640 },
  { key: 'ui.zone.forest', x: 2720, z: 2180 },
  { key: 'ui.zone.lake', x: 1380, z: 2180 },
  { key: 'ui.zone.dungeon', x: 2048, z: 1508 },
];

function WorldMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const SIZE = 560;
    const SPAN = 2200;
    const CX = 2048;
    const CZ = 2150;
    const draw = () => {
      const g = Game.current;
      const cv = ref.current;
      if (!g || !cv || !g.minimap) return;
      const ctx = cv.getContext('2d')!;
      const k = g.minimap.width / WORLD_SIZE;
      ctx.drawImage(g.minimap, (CX - SPAN / 2) * k, (CZ - SPAN / 2) * k, SPAN * k, SPAN * k, 0, 0, SIZE, SIZE);
      const s = SIZE / SPAN;
      const toX = (x: number) => (x - CX) * s + SIZE / 2;
      const toZ = (z: number) => (z - CZ) * s + SIZE / 2;
      ctx.font = '600 14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      for (const l of MAP_LABELS) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,14,22,0.85)';
        ctx.strokeText(t(l.key), toX(l.x), toZ(l.z) - 8);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(t(l.key), toX(l.x), toZ(l.z) - 8);
      }
      ctx.save();
      ctx.translate(toX(g.renderPos.x), toZ(g.renderPos.z));
      ctx.rotate(-g.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#10141c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    draw();
    const id = setInterval(draw, 300);
    return () => clearInterval(id);
  }, []);
  return (
    <Window title={t('ui.map')} onClose={() => set({ panel: null })} cls="map">
      <canvas ref={ref} width={560} height={560} />
    </Window>
  );
}

export function Panels() {
  const panel = useUI((s) => s.panel);
  switch (panel) {
    case 'bag':
      return <Bag />;
    case 'char':
      return <Character />;
    case 'quests':
      return <Quests />;
    case 'help':
      return <Help />;
    case 'settings':
      return <Settings />;
    case 'map':
      return <WorldMap />;
    default:
      return null;
  }
}

export { Window };
