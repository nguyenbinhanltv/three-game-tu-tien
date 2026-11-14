import { ContentIcon } from './ContentIcon';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { C, NGUNG_KHI_MAX, type ObjectiveDef, PF_DEAD, PF_FLYING, PF_MEDITATING, WORLD_SIZE } from '@dtl/shared';
import { itemName, monsterName, QUEST, realmName, SKILLS, t } from '@dtl/content';
import { Game } from '../game/engine';
import { HpTrail } from '../game/hpTrail';
import { trackedQuestId } from '../game/offscreen';
import { DebugPanel } from './DebugPanel';
import { NpcDialog } from './NpcDialog';
import { Panels } from './Panels';
import { type BossLine, type ChapterCard, set, setTrackQuest, type TargetCast, togglePanel, useUI } from './store';

/**
 * Đoạn trễ của thanh: chạy bằng requestAnimationFrame và ghi thẳng `style.width`, không re-render React
 * mỗi khung. Vòng lặp chỉ chạy khi đoạn trễ còn nằm trên máu. Đổi mục tiêu thì component được mount lại
 * (`key`) nên đoạn trễ bắt đầu từ máu hiện tại.
 */
function useTrail(frac: number) {
  const el = useRef<HTMLDivElement>(null);
  const trail = useRef<HpTrail | null>(null);
  if (!trail.current) trail.current = new HpTrail(frac);
  const target = useRef(frac);
  target.current = frac;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const v = trail.current!.update(target.current, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (el.current) el.current.style.width = v * 100 + '%';
      raf = v > target.current ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frac]);
  return { el, width: trail.current.value * 100 + '%' };
}

/**
 * Thanh đo kiểu mới: đầu vát, viền đồng thau, gradient theo bảng màu tâm trạng, mép sáng,
 * vạch chia (`segs` đoạn), đoạn trễ màu nhạt (`trail`).
 */
function Gauge({ cls, value, max, text, segs = 0, trail = false }: { cls: string; value: number; max: number; text?: string; segs?: number; trail?: boolean }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={'gauge ' + cls} style={segs ? ({ '--segs': segs } as React.CSSProperties) : undefined}>
      <div className="gauge-in">
        {trail && <GaugeTrail frac={frac} />}
        <div className="gauge-fill" style={{ width: frac * 100 + '%' }} />
        {segs > 1 && <div className="gauge-ticks" />}
      </div>
      {text !== undefined && <div className="gauge-text">{text}</div>}
    </div>
  );
}

function GaugeTrail({ frac }: { frac: number }) {
  const { el, width } = useTrail(frac);
  return <div ref={el} className="gauge-trail" style={{ width }} />;
}

function PlayerFrame() {
  const char = useUI((s) => s.char);
  const hp = useUI((s) => s.hp);
  const mhp = useUI((s) => s.mhp);
  const mp = useUI((s) => s.mp);
  const mmp = useUI((s) => s.mmp);
  if (!char) return null;
  const full = char.level === NGUNG_KHI_MAX && char.xp >= char.xpNeed;
  return (
    <div className="frame player-frame">
      <div className="frame-head">
        <span className="frame-name">{char.name}</span>
        <span className="frame-realm">{realmName(char.level)}</span>
      </div>
      <Gauge cls="hp" value={hp} max={mhp} text={`${hp} / ${mhp}`} segs={4} trail />
      <Gauge cls="mp" value={mp} max={mmp} text={`${mp} / ${mmp}`} segs={4} trail />
      <Gauge cls="xp" value={char.xp} max={char.xpNeed} text={full ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`} />
    </div>
  );
}

function TargetFrame({ below }: { below: boolean }) {
  const target = useUI((s) => s.target);
  const bossId = useUI((s) => s.boss?.id);
  // Boss đang chọn đã có thanh lớn ở giữa phía trên.
  if (!target || (target.boss && target.id === bossId)) return null;
  return (
    <div className={'frame target-frame' + (below ? ' below-boss' : '')}>
      <div className="frame-head">
        <span className="frame-name">{target.name}</span>
        {target.kind !== 'npc' && <span className="frame-realm">{target.kind === 'mon' ? t('ui.level_short', { n: target.level }) : realmName(target.level)}</span>}
      </div>
      {target.kind !== 'npc' && <Gauge key={target.id} cls={'hp ' + (target.kind === 'player' ? 'ally' : 'enemy')} value={target.hp} max={target.mhp} text={`${target.hp} / ${target.mhp}`} segs={4} trail />}
      {target.cast && <TargetCastBar cast={target.cast} />}
    </div>
  );
}

/** Thanh máu boss giữa phía trên: tên lớn + danh hiệu (font serif), máu 10 vạch có đoạn trễ, niệm chú bên dưới. */
function BossBar() {
  const boss = useUI((s) => s.boss);
  if (!boss) return null;
  // Làm tròn xuống, nhưng còn sống thì tối thiểu 1% (không hiện 100% khi đã mất máu, không hiện 0% khi chưa chết).
  const pct = boss.hp > 0 && boss.mhp > 0 ? Math.max(1, Math.floor((boss.hp / boss.mhp) * 100)) : 0;
  return (
    <div className="boss-bar" key={boss.id}>
      <div className="boss-head">
        <span className="boss-name">{monsterName(boss.def)}</span>
        <span className="boss-level">{t('ui.level_short', { n: boss.level })}</span>
      </div>
      <div className="boss-title">{t(`mon.${boss.def}.title`)}</div>
      <div className="boss-hp">
        <Gauge cls="hp boss" value={boss.hp} max={boss.mhp} text={`${boss.hp} / ${boss.mhp} · ${t('ui.boss.hp', { pct })}`} segs={10} trail />
        {/* Vạch chuyển pha: báo trước boss sẽ đổi chiêu ở mức máu này. */}
        {boss.marks?.map((f) => <div key={f} className="boss-mark" style={{ left: f * 100 + '%' }} />)}
      </div>
      {boss.posture !== undefined && (
        <div className={'gauge posture' + (boss.cast?.kind === 'broken' ? ' broken' : boss.posture >= 0.75 ? ' near' : '')}>
          <div className="gauge-in">
            <div className="gauge-fill" style={{ width: (boss.cast?.kind === 'broken' ? 100 : boss.posture * 100) + '%' }} />
          </div>
          <div className="gauge-label">{t('ui.boss.posture')}</div>
        </div>
      )}
      {boss.cast && <TargetCastBar cast={boss.cast} />}
    </div>
  );
}

/** Câu thoại ngắn của boss khi vào pha mới/gục: hai dải letterbox mỏng + phụ đề, không chặn chuột/phím. */
function BossLineView() {
  const line = useUI((s) => s.bossLine);
  return line ? <BossLineShow line={line} /> : null;
}

function BossLineShow({ line }: { line: BossLine }) {
  const now = useNow(250);
  if (now >= line.until) return null;
  return (
    <div className="boss-line" key={line.id}>
      <div className="lb lb-top" />
      <div className="lb lb-bot" />
      <div className="boss-line-text">
        <span className="boss-line-name">{line.name}</span>
        <span className="boss-line-say">{t('ui.boss.say', { text: line.text })}</span>
      </div>
    </div>
  );
}

/**
 * Thẻ chương (C2): letterbox mỏng, dòng dẫn nhỏ, tiêu đề lớn (DTL Display), phụ đề một dòng mờ dần.
 * Không nhận chuột/phím, không khóa điều khiển; tự gỡ khi hết giờ.
 */
function ChapterCardView() {
  const card = useUI((s) => s.chapter);
  return card ? <ChapterCardShow card={card} /> : null;
}

function ChapterCardShow({ card }: { card: ChapterCard }) {
  const now = useNow(250);
  const level = useUI((s) => s.char?.level ?? 1);
  if (now >= card.until) return null;
  const k = 'ui.chapter.' + card.kind;
  return (
    <div className={'chapter-card chapter-' + card.kind} key={card.id} style={{ '--dur': card.dur + 'ms' } as CSSProperties}>
      <div className="lb lb-top" />
      <div className="lb lb-bot" />
      <div className="chapter-text">
        <div className="chapter-kicker">{t(k + '.kicker', { realm: realmName(level) })}</div>
        <div className="chapter-title">{t(k + '.title')}</div>
        <div className="chapter-rule" />
        <div className="chapter-sub">{t(k + '.sub')}</div>
      </div>
    </div>
  );
}

/** Thanh niệm chú/choáng của mục tiêu (boss). Đoạn đầu tô tối là lúc hộ chú, chưa phá chú được. */
function TargetCastBar({ cast }: { cast: TargetCast }) {
  const now = useNow(50);
  if (now >= cast.end) return null;
  const done = Math.max(0, Math.min(1, 1 - (cast.end - now) / cast.total));
  const guarded = cast.kind === 'chant' && done < cast.open;
  // Niệm chú: thanh đầy dần; choáng: thanh cạn dần.
  const pct = (cast.kind === 'chant' ? done : 1 - done) * 100;
  const label = cast.kind === 'broken' ? 'ui.target.broken' : cast.kind === 'stun' ? 'ui.target.stun' : guarded ? 'ui.target.chant_guard' : 'ui.target.chant';
  return (
    <div className={'gauge tcast ' + cast.kind + (guarded ? ' guarded' : '')}>
      <div className="gauge-in">
        {cast.kind === 'chant' && cast.open > 0 && <div className="tcast-guard" style={{ width: cast.open * 100 + '%' }} />}
        <div className="gauge-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="gauge-text">{t(label)}</div>
    </div>
  );
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
    default:
      return t('ui.obj.breakthrough');
  }
}

function QuestTracker() {
  const quests = useUI((s) => s.quests);
  const track = useUI((s) => s.trackQuest);
  const ids = Object.keys(quests.active);
  if (!ids.length) return null;
  // Nhiệm vụ đang theo dõi (chỉ báo ngoài màn hình trỏ tới): ghim bằng cú nhấp; mặc định nhiệm vụ đầu tiên có đích.
  // Cùng hàm với engine để chấm và chỉ báo luôn cùng một nhiệm vụ.
  const tracked = trackedQuestId(quests, track);
  return (
    <div className="tracker">
      {ids.slice(0, 4).map((id) => {
        const q = QUEST.get(id);
        if (!q) return null;
        const prog = quests.active[id];
        const complete = q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count);
        return (
          <div
            key={id}
            className={'tracker-quest' + (complete ? ' done' : '') + (id === tracked ? ' tracked' : '')}
            title={t(id === tracked ? 'ui.quest.tracked' : 'ui.quest.track')}
            onClick={() => setTrackQuest(id === track ? '' : id)}
          >
            <div className="tracker-title">{t(`quest.${id}.name`)}</div>
            {q.objectives.map((o, i) => {
              const cur = Math.min(o.count, prog[i] ?? 0);
              const ok = cur >= o.count;
              const count = o.type === 'level' || o.type === 'talk' || o.type === 'fly' || o.type === 'breakthrough' ? '' : ` ${cur}/${o.count}`;
              return (
                <div key={i} className={'tracker-obj' + (ok ? ' ok' : '')}>
                  {ok ? '✔ ' : '· '}
                  {objectiveText(o)}
                  {count}
                </div>
              );
            })}
            {complete && <div className="tracker-turnin">{t('ui.quest.turnin_at', { npc: t(`npc.${q.turnin}.name`) })}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const zone = useUI((s) => s.zone);
  const x = useUI((s) => Math.round(s.x));
  const z = useUI((s) => Math.round(s.z));
  useEffect(() => {
    const SIZE = 176;
    const SPAN = 520; // mét hiển thị theo mỗi chiều
    const draw = () => {
      const g = Game.current;
      const cv = ref.current;
      if (!g || !cv || !g.minimap) return;
      const ctx = cv.getContext('2d')!;
      const px = g.renderPos.x;
      const pz = g.renderPos.z;
      const img = g.minimap;
      const k = img.width / WORLD_SIZE;
      ctx.fillStyle = '#1a2330';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, (px - SPAN / 2) * k, (pz - SPAN / 2) * k, SPAN * k, SPAN * k, 0, 0, SIZE, SIZE);
      const s = SIZE / SPAN;
      for (const d of g.dots()) {
        const dx = (d.x - px) * s + SIZE / 2;
        const dz = (d.z - pz) * s + SIZE / 2;
        if (dx < 0 || dz < 0 || dx > SIZE || dz > SIZE) continue;
        ctx.fillStyle = d.c;
        ctx.beginPath();
        ctx.arc(dx, dz, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mũi tên người chơi theo hướng camera.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-g.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#10141c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    draw();
    const id = setInterval(draw, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="minimap" onClick={() => togglePanel('map')} title={t('ui.map') + ' (M)'}>
      <canvas ref={ref} width={176} height={176} />
      <div className="minimap-zone">{zone}</div>
      <div className="minimap-pos">
        {x}, {z}
      </div>
    </div>
  );
}

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function SkillBar() {
  const char = useUI((s) => s.char);
  const cds = useUI((s) => s.cds);
  const gcdAt = useUI((s) => s.gcdAt);
  const flags = useUI((s) => s.flags);
  const auto = useUI((s) => s.autoAttack);
  const wantFly = useUI((s) => s.wantFly);
  const mp = useUI((s) => s.mp);
  const queued = useUI((s) => s.queuedSkill);
  const now = useNow(100);
  if (!char) return null;
  return (
    <div className="skillbar">
      <div className="skill-row">
        {SKILLS.map((sk, i) => {
          const locked = char.level < sk.unlock;
          const ready = Math.max(cds[sk.id] ?? 0, gcdAt);
          const left = Math.max(0, ready - now);
          const total = (cds[sk.id] ?? 0) > gcdAt ? sk.cd * 1000 : 1000;
          const noMp = mp < sk.mp;
          return (
            <button
              key={sk.id}
              className={'skill' + (locked ? ' locked' : '') + (noMp && !locked ? ' nomp' : '') + (i === 0 && auto ? ' auto' : '') + (i === queued ? ' queued' : '')}
              title={`${t(`skill.${sk.id}.name`)}\n${locked ? t('ui.char.locked', { realm: realmName(sk.unlock) }) : t(`skill.${sk.id}.desc`)}${sk.mp ? `\n${t('ui.mp')}: ${sk.mp}` : ''}`}
              onClick={() => Game.current?.useSkill(i)}
            >
              <span className="skill-icon"><ContentIcon def={sk} /></span>
              <span className="skill-key">{i + 1}</span>
              {left > 80 && !locked && (
                <>
                  <span className="skill-cd" style={{ height: Math.min(100, (left / total) * 100) + '%' }} />
                  {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
                </>
              )}
              {locked && <span className="skill-lock">🔒</span>}
            </button>
          );
        })}
      </div>
      <div className="action-row">
        <button className={'action' + (flags & PF_MEDITATING ? ' on' : '')} onClick={() => Game.current?.toggleMeditate()} title={t('ui.help.meditate_v')}>
          🧘 <span>{t('ui.meditate')}</span> <kbd>Z</kbd>
        </button>
        <button className={'action' + (wantFly || flags & PF_FLYING ? ' on' : '')} onClick={() => Game.current?.toggleFly()} title={t('ui.help.fly_v')}>
          🗡️ <span>{t('ui.fly')}</span> <kbd>F</kbd>
        </button>
        <button className="action" data-bag onClick={() => togglePanel('bag')}>
          🎒 <span>{t('ui.bag')}</span> <kbd>B</kbd>
        </button>
        <button className="action" onClick={() => togglePanel('char')}>
          👤 <span>{t('ui.char')}</span> <kbd>C</kbd>
        </button>
        <button className="action" onClick={() => togglePanel('quests')}>
          📜 <span>{t('ui.quests')}</span> <kbd>L</kbd>
        </button>
        <button className="action" onClick={() => togglePanel('help')}>
          ❔ <kbd>H</kbd>
        </button>
        <button className="action" onClick={() => togglePanel('settings')} title={t('ui.settings')}>
          ⚙️
        </button>
      </div>
    </div>
  );
}

function CastBar() {
  const castEnd = useUI((s) => s.castEnd);
  const castTotal = useUI((s) => s.castTotal);
  const now = useNow(50);
  if (!castEnd || now >= castEnd) return null;
  const pct = 100 - ((castEnd - now) / castTotal) * 100;
  return (
    <div className="castbar">
      <div className="castbar-fill" style={{ width: pct + '%' }} />
    </div>
  );
}

function Tribulation() {
  const tribEnd = useUI((s) => s.tribEnd);
  const now = useNow(250);
  if (!tribEnd || now >= tribEnd) return null;
  return (
    <div className="trib">
      <div className="trib-title">⚡ {t('ui.trib.title')} ⚡</div>
      <div>{t('ui.trib.left', { n: Math.ceil((tribEnd - now) / 1000) })}</div>
    </div>
  );
}

function Chat() {
  const log = useUI((s) => s.log);
  const open = useUI((s) => s.chatOpen);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const submit = () => {
    const m = text.trim();
    if (m) Game.current?.send(C.CHAT, { m });
    setText('');
    set({ chatOpen: false });
    inputRef.current?.blur();
  };
  return (
    <div className={'chat' + (open ? ' open' : '')}>
      <div className="chat-log" ref={listRef}>
        {log.map((l) => (
          <div key={l.id} className={'chat-line ' + l.type}>
            {l.from ? <b>{l.from}: </b> : null}
            {l.text}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        className="chat-input"
        value={text}
        maxLength={160}
        placeholder={t('ui.chat.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => set({ chatOpen: true })}
        onBlur={() => set({ chatOpen: false })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            setText('');
            set({ chatOpen: false });
            inputRef.current?.blur();
          }
        }}
      />
    </div>
  );
}

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <div key={x.id} className={'toast ' + x.type}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

function DeathOverlay() {
  const flags = useUI((s) => s.flags);
  if (!(flags & PF_DEAD)) return null;
  return (
    <div className="death">
      <div className="death-title">{t('ui.dead.title')}</div>
      <button className="btn primary" onClick={() => Game.current?.send(C.RESPAWN)}>
        {t('ui.dead.respawn')}
      </button>
    </div>
  );
}

function Corner() {
  const fps = useUI((s) => s.fps);
  const perf = useUI((s) => s.perf);
  return (
    <div className="corner">
      {fps} fps{perf ? ' · ' + perf : ''}
    </div>
  );
}

export function Hud() {
  const hint = useUI((s) => s.hint);
  const npc = useUI((s) => s.npc);
  const panel = useUI((s) => s.panel);
  const controls = useUI((s) => s.controls);
  const mouseLook = useUI((s) => s.mouseLook);
  const dead = useUI((s) => (s.flags & PF_DEAD) !== 0);
  const hasBoss = useUI((s) => s.boss !== null);
  return (
    <div className={'hud' + (hasBoss ? ' with-boss' : '')}>
      <PlayerFrame />
      <ChapterCardView />
      <BossLineView />
      <BossBar />
      <TargetFrame below={hasBoss} />
      <div className="right-col">
        <Minimap />
        <QuestTracker />
      </div>
      <Toasts />
      <Tribulation />
      {mouseLook && <div className="crosshair" />}
      {controls === 'mouse' && !mouseLook && !npc && !panel && !dead && <div className="hint lock">{t('ui.hint.lock')}</div>}
      {hint && !npc && <div className="hint">{hint}</div>}
      <CastBar />
      <SkillBar />
      <Chat />
      <Panels />
      {npc && <NpcDialog npcId={npc} />}
      <DeathOverlay />
      <DebugPanel />
      <Corner />
    </div>
  );
}
