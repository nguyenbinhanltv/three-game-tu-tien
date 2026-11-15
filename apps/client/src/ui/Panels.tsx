import { ContentIcon } from './ContentIcon';
import { useEffect, useRef, useState } from 'react';
import { C, enhanceMul, EQUIP_SLOTS, type EquipSlot, type InvItem, type ItemDef, NGUNG_KHI_MAX, WORLD_SIZE } from '@dtl/shared';
import { ITEM, itemName, QUEST, QUESTS, realmName, SKILLS, t, TRUC_CO_PILL } from '@dtl/content';
import { getVolume, isMuted, type MusicCredit, musicCredits, setMuted, setVolume, sfx, unlockAudio, VOLUME_KEYS, type VolumeKey } from '../game/audio';
import { Game, reqId } from '../game/engine';
import { objectiveText } from './Hud';
import { Button, Divider, type PanelTone, PanelWindow, ProgressBar, Segmented, Slider, Slot, TipCard, Tooltip } from './kit';
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
  if (!item || !def) return <Slot empty size={small ? 's' : 'm'} />;
  return (
    <Tooltip content={<ItemTip item={item} def={def} />}>
      <Slot icon={<ContentIcon def={def} />} rarity={def.rarity} count={item.n} plus={item.plus} selected={selected} size={small ? 's' : 'm'} onClick={onClick} label={itemName(def.id, item.plus)} />
    </Tooltip>
  );
}

/** Chú giải vật phẩm (rê chuột / focus): tên theo phẩm, loại, chỉ số, mô tả. */
function ItemTip({ item, def }: { item: InvItem; def: ItemDef }) {
  return <TipCard title={itemName(def.id, item.plus)} rarity={def.rarity} sub={t('ui.item.kind.' + def.kind)} lines={statLines(def, item.plus).map((text) => ({ text }))} desc={t(`item.${def.id}.desc`)} />;
}

export function ItemDetail({ item, children }: { item: InvItem; children?: React.ReactNode }) {
  const def = ITEM.get(item.id);
  const level = useUI((s) => s.char?.level ?? 1);
  if (!def) return null;
  return (
    <div className="k-card item-detail">
      <div className="item-name" data-q={def.rarity}>
        {itemName(def.id, item.plus)}
      </div>
      <div className="k-dim">{t('ui.item.kind.' + def.kind)}</div>
      {statLines(def, item.plus).map((l) => (
        <div key={l} className="item-stat">
          {l}
        </div>
      ))}
      {def.reqLevel && def.reqLevel > 1 && <div className={'item-req' + (level < def.reqLevel ? ' bad' : '')}>{t('ui.item.req', { realm: realmName(def.reqLevel) })}</div>}
      <div className="item-desc">{t(`item.${def.id}.desc`)}</div>
      {def.sell > 0 && <div className="k-dim">{t('ui.item.sell_price', { n: def.sell })} 💠</div>}
      <div className="item-actions">{children}</div>
    </div>
  );
}

/** Cửa sổ chung của các bảng: khung kit (lam đêm, viền đồng thau, tiêu đề serif). */
function Window({ title, sub, onClose, children, cls, width, tone }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; cls?: string; width?: number; tone?: PanelTone }) {
  return (
    <PanelWindow title={title} sub={sub} onClose={onClose} width={width} tone={tone} className={cls}>
      {children}
    </PanelWindow>
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
    <Window title={t('ui.bag')} onClose={() => set({ panel: null })} cls="bag" width={460}>
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
          <b>{gold}</b> 💠
          <div className="equip-label">{t('ui.gold')}</div>
        </div>
      </div>
      <Divider />
      <div className="bag-grid">
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
            <Button variant="primary" onClick={() => g?.send(C.USE, { slot: sel, r: reqId() })}>
              {t('ui.item.use')}
            </Button>
          )}
          {(def.kind === 'weapon' || def.kind === 'robe' || def.kind === 'accessory') && (
            <Button
              variant="primary"
              onClick={() => {
                g?.send(C.EQUIP, { slot: sel });
                setSel(null);
              }}
            >
              {t('ui.item.equip')}
            </Button>
          )}
        </ItemDetail>
      ) : eqItem && selEq ? (
        <ItemDetail item={eqItem}>
          <Button
            onClick={() => {
              g?.send(C.UNEQUIP, { slot: selEq });
              setSelEq(null);
            }}
          >
            {t('ui.item.unequip')}
          </Button>
        </ItemDetail>
      ) : (
        <div className="k-card k-dim">{t('ui.bag.empty_hint')}</div>
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
  const stat = (k: string, v: number | string) => (
    <div className="stat-cell">
      <dt>{t(k)}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <Window title={char.name} sub={realmName(char.level)} onClose={() => set({ panel: null })} cls="char" width={440}>
      <ProgressBar cls="xp" value={char.xp} max={char.xpNeed} text={xpFull ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`} label={t('ui.xp')} />
      <dl className="stats">
        {stat('ui.hp', char.mhp)}
        {stat('ui.mp', char.mmp)}
        {stat('ui.atk', char.atk)}
        {stat('ui.def', char.def)}
        {stat('ui.gold', `${char.gold} 💠`)}
      </dl>
      <Divider label={t('ui.char.skills')} />
      <div className="skill-list">
        {SKILLS.map((sk, i) => (
          <div key={sk.id} className={'skill-item' + (char.level < sk.unlock ? ' locked' : '')}>
            <Slot size="s" rarity={1} icon={<ContentIcon def={sk} />} label={t(`skill.${sk.id}.name`)} disabled={char.level < sk.unlock} />
            <div>
              <div className="skill-item-name">
                <kbd>{i + 1}</kbd> {t(`skill.${sk.id}.name`)}
                {char.level < sk.unlock && <i> — {t('ui.char.locked', { realm: realmName(sk.unlock) })}</i>}
              </div>
              <div className="k-dim">{t(`skill.${sk.id}.desc`)}</div>
            </div>
          </div>
        ))}
      </div>
      {canTrib && (
        <div className="k-card trib-box">
          <div className="k-dim">{t('ui.char.breakthrough_hint')}</div>
          <div className={xpFull ? 'ok' : 'bad'}>
            {xpFull ? '✔' : '✘'} {t('ui.xp_full')}
          </div>
          <div className={hasPill ? 'ok' : 'bad'}>
            {hasPill ? '✔' : '✘'} {itemName(TRUC_CO_PILL)}
          </div>
          <Button
            variant="primary"
            disabled={!xpFull || !hasPill}
            onClick={() => {
              Game.current?.send(C.BREAKTHROUGH);
              set({ panel: null });
            }}
          >
            ⚡ {t('ui.char.breakthrough')}
          </Button>
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
        <span key={it.id} className="reward-item" data-q={ITEM.get(it.id)?.rarity ?? 0}>
          <ContentIcon def={ITEM.get(it.id)} /> {itemName(it.id)}
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
    <Window title={t('ui.quests')} sub={t('ui.quest.done_count', { n: quests.done.length, total: QUESTS.length })} onClose={() => set({ panel: null })} cls="quests" width={460}>
      {ids.length === 0 && <div className="k-dim">{t('ui.quest.none')}</div>}
      {ids.map((id) => {
        const q = QUEST.get(id);
        if (!q) return null;
        const prog = quests.active[id];
        return (
          <div key={id} className="k-card quest-card">
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
            <div className="k-dim">{t('ui.quest.turnin_at', { npc: t(`npc.${q.turnin}.name`) })}</div>
            <RewardLine id={id} />
          </div>
        );
      })}
    </Window>
  );
}

function Help() {
  const rows = ['move', 'camera', 'jump', 'fly', 'target', 'skill', 'interact', 'meditate', 'panels', 'chat'];
  return (
    <Window title={t('ui.help')} onClose={() => set({ panel: null })} cls="help" width={520}>
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
      <div className="k-dim">{t('ui.help.tip')}</div>
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
    <Slider
      label={t('ui.settings.vol.' + k)}
      value={v}
      min={0}
      max={100}
      step={5}
      format={(n) => n + '%'}
      onChange={(n) => {
        unlockAudio();
        setVolume(k, n / 100);
        setV(n);
      }}
      onCommit={preview}
    />
  );
}

/** Ghi nguồn nhạc theo manifest (nhạc Suno bản FREE: phi thương mại, bắt buộc ghi nguồn). */
function MusicCredits() {
  const [list, setList] = useState<(MusicCredit & { id: string })[] | null>(null);
  useEffect(() => {
    let alive = true;
    void musicCredits().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <Divider label={t('ui.settings.credits')} />
      {list && list.length > 0 ? (
        <ul className="credits">
          {list.map((c) => (
            <li key={c.id}>
              {t('ui.settings.credits.line', { title: c.title ?? c.id, by: c.by ?? '?', license: c.license ?? '?' })}
              {c.url && (
                <>
                  {' '}
                  <a href={c.url} target="_blank" rel="noreferrer noopener">
                    {t('ui.settings.credits.link')}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="k-dim">{t('ui.settings.credits.procedural')}</div>
      )}
    </>
  );
}

function Settings() {
  const quality = useUI((s) => s.quality);
  const fps = useUI((s) => s.fps);
  const controls = useUI((s) => s.controls);
  const camShake = useUI((s) => s.camShake);
  const offscreen = useUI((s) => s.offscreen);
  const chapterCards = useUI((s) => s.chapterCards);
  const [mute, setMute] = useState(isMuted());
  const onOff = [
    { value: true, label: t('ui.settings.cam_shake_on') },
    { value: false, label: t('ui.settings.cam_shake_off') },
  ];
  return (
    <PanelWindow title={t('ui.settings')} onClose={() => set({ panel: null })}>
      <Divider label={t('ui.settings.controls')} />
      <Segmented label={t('ui.settings.controls')} value={controls} onChange={(m) => Game.current?.setControls(m)} options={['mouse', 'turn', 'strafe'].map((m) => ({ value: m, label: t('ui.settings.controls.' + m) }))} />
      <div className="k-dim">{t('ui.settings.controls_hint.' + controls)}</div>
      <Divider label={t('ui.settings.quality')} />
      <Segmented label={t('ui.settings.quality')} value={quality} onChange={(q) => Game.current?.setQuality(q)} options={['low', 'medium', 'high'].map((q) => ({ value: q, label: t('ui.settings.q.' + q) }))} />
      <div className="k-dim">{t('ui.settings.quality_hint')}</div>
      <div className="k-dim">{t('ui.settings.fps', { n: fps })}</div>
      <Divider label={t('ui.settings.cam_shake')} />
      <Segmented label={t('ui.settings.cam_shake')} value={camShake} onChange={(on) => Game.current?.setCamShake(on)} options={onOff} />
      <Divider label={t('ui.settings.offscreen')} />
      <Segmented label={t('ui.settings.offscreen')} value={offscreen} onChange={(on) => Game.current?.setOffscreen(on)} options={onOff} />
      <div className="k-dim">{t('ui.settings.offscreen_hint')}</div>
      <Divider label={t('ui.settings.chapter')} />
      <Segmented label={t('ui.settings.chapter')} value={chapterCards} onChange={(on) => Game.current?.setChapterCards(on)} options={onOff} />
      <div className="k-dim">{t('ui.settings.chapter_hint')}</div>
      <Divider label={t('ui.settings.sound')} />
      <Segmented
        label={t('ui.settings.sound')}
        value={!mute}
        onChange={(on) => {
          setMuted(!on);
          setMute(!on);
        }}
        options={[
          { value: true, label: t('ui.settings.sound_on') },
          { value: false, label: t('ui.settings.sound_off') },
        ]}
      />
      {VOLUME_KEYS.map((k) => (
        <VolumeSlider key={k} k={k} />
      ))}
      <MusicCredits />
      <div>
        <Button
          onClick={() => {
            Game.current?.dispose();
            set({ phase: 'login', panel: null, needName: false, log: [] });
          }}
        >
          {t('ui.settings.logout')}
        </Button>
      </div>
    </PanelWindow>
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
  const zone = useUI((s) => s.zone);
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
      ctx.font = '700 15px "Palatino Linotype", Georgia, serif';
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
    <Window title={t('ui.map')} sub={zone} onClose={() => set({ panel: null })} cls="map" width={620}>
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
