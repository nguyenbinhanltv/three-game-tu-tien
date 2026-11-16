import { Portrait } from './Art';
import { ContentIcon, UiIcon } from './ContentIcon';
import './panels.css';
import './tutien.css';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { artifactLevelMods, BAR_SIZE, C, CHARGE_MAX, NGUNG_KHI_MAX, tribDef, tribPhaseIndex, tribPhaseStart, TRUC_CO_LEVEL, type ObjectiveDef, PF_DEAD, PF_FLYING, PF_MEDITATING, PF_TRIBULATION, type SkillDef, WORLD_SIZE } from '@dtl/shared';
import { ARTIFACT, hasString, ITEM, itemName, METHOD, monsterName, nextMajorRealmName, QUEST, realmName, resolveBarSkill, skillBar, t, VARIANTS } from '@dtl/content';
import { Game } from '../game/engine';
import { trackedQuestId } from '../game/offscreen';
import { artifactLines } from './gear';
import { Button, Divider, Header, Panel, PanelBody, ProgressBar, TipCard, Tooltip } from './kit';
import { DebugPanel } from './DebugPanel';
import { NpcDialog } from './NpcDialog';
import { DuelBanner, InviteStack, PartyFrame } from './Party';
import { Minimap } from './minimap/Minimap';
import { Panels } from './Panels';
import { TrialBanner } from './Realm';
import { breakGoal } from './breakGoal';
import { type BossLine, type ChapterCard, set, setTrackQuest, type TargetCast, togglePanel, useUI } from './store';

function PlayerFrame() {
  const char = useUI((s) => s.char);
  const hp = useUI((s) => s.hp);
  const mhp = useUI((s) => s.mhp);
  const mp = useUI((s) => s.mp);
  const mmp = useUI((s) => s.mmp);
  // Mọi hook phải đứng trước lệnh return sớm (store khởi đầu với char = null).
  const flags = useUI((s) => s.flags);
  if (!char) return null;
  const goal = breakGoal(char);
  // Đang độ kiếp thì không mời đột phá nữa.
  if (flags & PF_TRIBULATION) goal.ready = false;
  const full = goal.ready || (flags & PF_TRIBULATION) !== 0 || (char.level === NGUNG_KHI_MAX && char.xp >= char.xpNeed);
  return (
    <div className={'frame player-frame' + (goal.ready ? ' can-break' : '')}>
      <div className="frame-head">
        <span className="frame-name">{char.name}</span>
        <span className="frame-realm" data-tier={char.level >= TRUC_CO_LEVEL ? 'tc' : 'nk'}>
          {realmName(char.level)}
        </span>
      </div>
      <ProgressBar cls="hp" value={hp} max={mhp} text={`${hp} / ${mhp}`} segs={4} trail />
      <ProgressBar cls="mp" value={mp} max={mmp} text={`${mp} / ${mmp}`} segs={4} trail />
      <div className="frame-xp-row">
        <ProgressBar cls="xp" value={char.xp} max={char.xpNeed} text={full ? t('ui.xp_full') : `${t('ui.xp')} ${char.xp} / ${char.xpNeed}`} />
        {goal.ready && (
          // Chỉ mở bảng Nhân vật ở khối đột phá: bắt đầu độ kiếp tốn Trúc Cơ Đan nên không làm bằng một cú bấm trên HUD.
          <Button
            size="s"
            variant="primary"
            className="break-btn"
            title={t(goal.kind === 'trib' ? 'ui.frame.break_trib' : 'ui.frame.break_bk', { n: char.level })}
            onClick={(e) => {
              set({ panel: 'char' });
              blurAfterPointer(e);
            }}
          >
            {t('ui.frame.break')}
          </Button>
        )}
      </div>
      {!goal.ready && goal.kind && <div className="frame-next">{t(goal.kind === 'trib' ? 'ui.frame.next_trib' : 'ui.frame.next_bk', { n: goal.level })}</div>}
    </div>
  );
}

function TargetFrame({ below }: { below: boolean }) {
  const target = useUI((s) => s.target);
  const bossId = useUI((s) => s.boss?.id);
  // Boss đang chọn đã có thanh lớn ở giữa phía trên.
  if (!target || (target.boss && target.id === bossId)) return null;
  return (
    <div className={'frame target-frame' + (below ? ' below-boss' : '')} data-kind={target.kind}>
      {target.kind !== 'player' && <Portrait id={target.def} className="frame-portrait" />}
      <div className="frame-head">
        <span className="frame-name">{target.name}</span>
        {target.kind !== 'npc' && <span className="frame-realm">{target.kind === 'mon' ? t('ui.level_short', { n: target.level }) : realmName(target.level)}</span>}
      </div>
      {target.kind !== 'npc' && <ProgressBar key={target.id} cls={'hp ' + (target.kind === 'player' ? 'ally' : 'enemy')} value={target.hp} max={target.mhp} text={`${target.hp} / ${target.mhp}`} segs={4} trail label={t('ui.hp')} />}
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
      <Portrait id={boss.def} className="boss-portrait" />
      <div className="boss-head">
        <span className="boss-name">{monsterName(boss.def)}</span>
        <span className="boss-level">{t('ui.level_short', { n: boss.level })}</span>
      </div>
      <div className="boss-title">{t(`mon.${boss.def}.title`)}</div>
      <div className="boss-hp">
        <ProgressBar cls="hp boss" value={boss.hp} max={boss.mhp} text={`${boss.hp} / ${boss.mhp} · ${t('ui.boss.hp', { pct })}`} segs={10} trail />
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
/** Thẻ ngắn 0,6 giây khi mình tung chiêu tối thượng: viền sáng theo màu công pháp, tên chiêu. Không nhận chuột/phím. */
function UltCardView() {
  const card = useUI((s) => s.ultCard);
  const now = useNow(100);
  if (!card || now >= card.until) return null;
  return (
    <div className="ult-card" key={card.id} style={{ '--mc': '#' + card.color } as CSSProperties}>
      <div className="ult-card-name">{t(`skill.${card.skill}.name`)}</div>
    </div>
  );
}

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
        <div className="chapter-kicker">{t(k + '.kicker', { realm: realmName(level), next: nextMajorRealmName(level) })}</div>
        <div className="chapter-title">{t(k + '.title', { realm: realmName(level), next: nextMajorRealmName(level) })}</div>
        <div className="chapter-rule" />
        <div className="chapter-sub">{t(k + '.sub', { realm: realmName(level), next: nextMajorRealmName(level) })}</div>
      </div>
    </div>
  );
}

/**
 * Cảnh mở đầu (P2-B1): letterbox dày trượt vào, một câu thoại cổ phong hiện rồi mờ, gợi ý bỏ qua nhỏ.
 * Không nhận chuột/phím (phím bất kỳ do engine bắt); HUD khác ẩn nhờ lớp `.cine` trên `.hud`.
 */
function CineView() {
  const cine = useUI((s) => s.cine);
  if (!cine) return null;
  return (
    <div className={'cine' + (cine.kind && cine.kind !== 'sect' ? ' cine-' + cine.kind : '') + (cine.out ? ' out' : '')} key={cine.id} style={{ '--dur': cine.dur + 'ms' } as CSSProperties}>
      <div className="cine-bar cine-top" />
      <div className="cine-bar cine-bot" />
      {cine.kind === 'boss' || cine.kind === 'phase' ? (
        <div className="cine-name">
          <div className="cine-name-main">{cine.name}</div>
          {cine.title && <div className="cine-name-title">{cine.title}</div>}
          <div className="cine-name-say">{t('ui.boss.say', { text: cine.text ?? '' })}</div>
        </div>
      ) : (
        <>
          <div className="cine-line">{t('ui.cine.sect.line')}</div>
          <div className="cine-skip">{t('ui.cine.skip')}</div>
        </>
      )}
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
    case 'enhance':
      return t('ui.obj.enhance', { n: o.count });
    case 'dungeon':
      return t('ui.obj.dungeon');
    case 'duel':
      return t('ui.obj.duel');
    case 'meditate':
      return t('ui.obj.meditate');
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
              // Nhiệm vụ không theo dõi chỉ hiện mục tiêu chưa xong đầu tiên cho gọn.
              if (id !== tracked && (ok || q.objectives.findIndex((x, j) => (prog[j] ?? 0) < x.count) !== i)) return null;
              const count = o.type === 'level' || o.type === 'talk' || o.type === 'fly' || o.type === 'breakthrough' || o.type === 'enhance' || o.type === 'dungeon' || o.type === 'duel' ? '' : ` ${cur}/${o.count}`;
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

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Bấm bằng chuột xong thì bỏ focus để phím số/mũi tên tiếp theo tới game (bàn phím giữ focus). */
function blurAfterPointer(e: React.MouseEvent<HTMLElement>): void {
  if (e.detail > 0) e.currentTarget.blur();
}

/**
 * Thanh chiêu: ô vát viền đồng thau, icon atlas, nhãn phím, hồi chiêu quét theo vòng (conic, bắt đầu từ trên,
 * chiều kim đồng hồ) kèm số giây, xám khi thiếu linh lực hoặc không ra chiêu được (ngự kiếm/lơ lửng, khớp luật
 * `airborne()` của server), khóa khi chưa đủ cảnh giới. Viền hàng đợi (M1-11) và vòng tự đánh giữ nguyên.
 */
function SkillBar() {
  const char = useUI((s) => s.char);
  const cds = useUI((s) => s.cds);
  const gcdAt = useUI((s) => s.gcdAt);
  const flags = useUI((s) => s.flags);
  const auto = useUI((s) => s.autoAttack);
  const wantFly = useUI((s) => s.wantFly);
  const mp = useUI((s) => s.mp);
  const queued = useUI((s) => s.queuedSkill);
  const empowered = useUI((s) => s.empowered);
  // Một cờ do engine tính sẵn: trước đây đăng ký x/y/z nên cả thanh chiêu dựng lại mỗi lần vị trí đổi.
  const airborne = useUI((s) => s.airborne);
  const method = useUI((s) => s.method);
  const now = useNow(100);
  if (!char) return null;
  const mdef = method?.method ? METHOD.get(method.method) : undefined;
  const bar = skillBar(method?.method);
  const charge = method?.charge ?? 0;
  const pas = mdef?.passive;
  const stackKind = pas?.kind === 'kiem_y' || pas?.kind === 'the' ? pas.kind : null;
  const slots: (SkillDef | null)[] = Array.from({ length: BAR_SIZE }, (_, i) => bar[i] ?? null);
  return (
    <div className="skillbar" style={mdef ? ({ '--mc': '#' + mdef.color } as CSSProperties) : undefined}>
      {stackKind && (
        <div className="stack-pips" aria-label={t(`ui.method.stacks.${stackKind}`)}>
          <span>{t(`ui.method.stacks.${stackKind}`)}</span>
          {Array.from({ length: pas?.max ?? 5 }, (_, i) => (
            <i key={i} className={i < (method?.stacks ?? 0) ? 'on' : ''} />
          ))}
        </div>
      )}
      <div className="skill-row">
        {slots.map((sk, i) => {
          if (!sk) {
            // Ô 7–8 khi chưa chọn công pháp: ô trống, bấm để mở bảng Công pháp.
            return (
              <Tooltip key={'empty' + i} content={<TipCard title={t(i === 6 ? 'ui.method.slot7' : 'ui.method.slot8')} desc={t('ui.method.empty_slot')} />}>
                <button type="button" className="skill" data-state="empty" aria-label={`${t(i === 6 ? 'ui.method.slot7' : 'ui.method.slot8')} (${i + 1})`} onClick={(e) => { togglePanel('method'); blurAfterPointer(e); }}>
                  <span className="skill-icon">
                    <span className="content-icon">＋</span>
                  </span>
                  <span className="skill-key">{i + 1}</span>
                </button>
              </Tooltip>
            );
          }
          const rs = resolveBarSkill(method, sk);
          const locked = char.level < sk.unlock;
          const ready = Math.max(cds[sk.id] ?? 0, gcdAt);
          const left = Math.max(0, ready - now);
          const total = (cds[sk.id] ?? 0) > gcdAt ? Math.max(1, rs.cd) * 1000 : 1000;
          const noMp = !locked && mp < sk.mp;
          const blocked = !locked && airborne;
          const charging = !locked && !!sk.ult && charge < CHARGE_MAX;
          const state = locked ? 'locked' : blocked ? 'air' : charging ? 'charging' : noMp ? 'nomp' : sk.ult ? 'ultready' : left > 80 ? 'cd' : 'ready';
          const lv = method?.lv[sk.id] ?? 1;
          const vr = method?.vr[sk.id];
          const lines = [
            ...(lv > 1 ? [{ text: t('ui.skill.level_tag', { n: lv }) }] : []),
            ...(vr && VARIANTS[sk.id] ? [{ text: t('ui.skill.variant_tag', { name: t(`skill.${sk.id}.var.${vr}.name`) }) }] : []),
            ...(sk.ult ? [{ text: t('ui.skill.ult_charge', { n: Math.floor(charge) }), tone: charging ? ('bad' as const) : undefined }] : []),
            ...(sk.mp ? [{ text: `${t('ui.mp')}: ${sk.mp}`, tone: noMp ? ('bad' as const) : undefined }] : []),
            ...(rs.cd ? [{ text: t('ui.skill.cd', { n: rs.cd }) }] : []),
            ...(blocked ? [{ text: t('ui.skill.airborne'), tone: 'bad' as const }] : []),
            ...(noMp ? [{ text: t('ui.skill.no_mp'), tone: 'bad' as const }] : []),
          ];
          return (
            <Tooltip
              key={sk.id}
              content={<TipCard title={t(`skill.${sk.id}.name`)} sub={locked ? t('ui.char.locked', { realm: realmName(sk.unlock) }) : undefined} lines={lines} desc={t(`skill.${sk.id}.desc`)} />}
            >
              <button
                type="button"
                className={'skill' + (i === 0 && auto ? ' auto' : '') + (i === queued ? ' queued' : '') + ((empowered[sk.id] ?? 0) > Date.now() ? ' empowered' : '')}
                data-state={state}
                data-method={sk.method ? '1' : undefined}
                aria-label={`${t(`skill.${sk.id}.name`)} (${i + 1})`}
                onClick={(e) => {
                  Game.current?.useSkill(i);
                  blurAfterPointer(e);
                }}
              >
                <span className="skill-icon">
                  <ContentIcon def={sk} />
                </span>
                <span className="skill-key">{i + 1}</span>
                {charging && (
                  <>
                    <span className="skill-charge" style={{ '--p': Math.min(1, charge / CHARGE_MAX) } as CSSProperties} />
                    <span className="skill-charge-text">{Math.floor(charge)}</span>
                  </>
                )}
                {!charging && left > 80 && !locked && (
                  <>
                    <span className="skill-sweep" style={{ '--p': Math.min(1, left / total) } as CSSProperties} />
                    {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
                  </>
                )}
                {locked && <span className="skill-lock">🔒</span>}
              </button>
            </Tooltip>
          );
        })}
        <ArtifactSlot />
      </div>
      <BuffRow />
      <div className="action-row">
        <Button size="s" pressed={(flags & PF_MEDITATING) !== 0} onClick={(e) => { Game.current?.toggleMeditate(); blurAfterPointer(e); }} title={t('ui.help.meditate_v')}>
          <UiIcon id="hud_thien" fallback="🧘" className="inline" /> <span>{t('ui.meditate')}</span> <kbd>Z</kbd>
        </Button>
        <Button size="s" pressed={wantFly || (flags & PF_FLYING) !== 0} onClick={(e) => { Game.current?.toggleFly(); blurAfterPointer(e); }} title={t('ui.help.fly_v')}>
          <UiIcon id="hud_ngu_kiem" fallback="🗡️" className="inline" /> <span>{t('ui.fly')}</span> <kbd>F</kbd>
        </Button>
        <Button size="s" data-bag onClick={(e) => { togglePanel('bag'); blurAfterPointer(e); }}>
          <UiIcon id="hud_tui" fallback="🎒" className="inline" /> <span>{t('ui.bag.short')}</span> <kbd>B</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('char'); blurAfterPointer(e); }}>
          <UiIcon id="hud_nhan_vat" fallback="👤" className="inline" /> <span>{t('ui.char')}</span> <kbd>C</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('method'); blurAfterPointer(e); }} title={t('ui.method.title')}>
          <UiIcon id="hud_cong_phap" fallback="☯️" className="inline" /> <span>{t('ui.method.key')}</span> <kbd>V</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('party'); blurAfterPointer(e); }} title={t('ui.party.title')}>
          <UiIcon id="hud_to_doi" fallback="👥" className="inline" /> <span>{t('ui.party.key')}</span> <kbd>P</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('quests'); blurAfterPointer(e); }}>
          <UiIcon id="hud_nhiem_vu" fallback="📜" className="inline" /> <span>{t('ui.quests')}</span> <kbd>L</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('help'); blurAfterPointer(e); }} title={t('ui.help')}>
          <UiIcon id="hud_tro_giup" fallback="❔" className="inline" /> <kbd>H</kbd>
        </Button>
        <Button size="s" onClick={(e) => { togglePanel('settings'); blurAfterPointer(e); }} title={`${t('ui.settings')} (O)`}>
          <UiIcon id="hud_cai_dat" fallback="⚙️" className="inline" /> <kbd>O</kbd>
        </Button>
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
  const tribId = useUI((s) => s.tribId);
  const now = useNow(250);
  if (!tribEnd || now >= tribEnd) return null;
  // Pha, thời lượng và lời nhắc đọc từ `tribulations.json` theo kiếp đang độ (E1-F); Trúc Cơ giữ ba pha của S2-C.
  const def = tribDef(tribId);
  const left = Math.max(0, (tribEnd - now) / 1000);
  const elapsed = def.duration - left;
  const pi = tribPhaseIndex(def, elapsed);
  const ph = def.phases[pi];
  // Pha có tia khóa mệnh: ban đầu tia cuối tích tụ (hint), sau `delay` giây là mưa sét (hint2).
  const after = !!ph.final && elapsed >= tribPhaseStart(def, pi) + ph.final.delay;
  const key = 'ui.trib.' + def.id + '.';
  const title = hasString(key + 'title') ? t(key + 'title') : t('ui.trib.title');
  return (
    <div className="trib" role="status">
      <div className="trib-title">{title}</div>
      <div className="trib-phases">
        {def.phases.map((p, i) => {
          const start = tribPhaseStart(def, i);
          const len = p.end - start;
          return (
            <div key={p.id} className={'trib-phase' + (i === pi ? ' on' : '')} style={{ flex: len }}>
              <ProgressBar cls="kiep" value={Math.max(0, Math.min(len, elapsed - start))} max={len} text={i === pi ? t('ui.trib.secs', { n: Math.ceil(left) }) : undefined} />
              <div className="trib-phase-name">{t(key + p.id)}</div>
            </div>
          );
        })}
      </div>
      <div className="trib-hint">{t(key + ph.id + (after ? '.hint2' : '.hint'))}</div>
    </div>
  );
}

/** Letterbox mỏng suốt cảnh độ kiếp. Đặt đầu `.hud` (không z-index) để mọi khung HUD sau nó vẽ đè lên dải đen. */
function TribBars() {
  const tribEnd = useUI((s) => s.tribEnd);
  const now = useNow(250);
  if (!tribEnd || now >= tribEnd) return null;
  return (
    <>
      <div className="trib-bar trib-bar-top" />
      <div className="trib-bar trib-bar-bot" />
    </>
  );
}

const CHAT_IDLE_MS = 12_000;

function Chat() {
  const log = useUI((s) => s.log);
  const open = useUI((s) => s.chatOpen);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Không gõ và không có dòng mới trong 12 giây thì nhật ký mờ đi (HUD gọn); có dòng mới hoặc mở chat thì hiện lại.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIdle(false);
    const id = window.setTimeout(() => setIdle(true), CHAT_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [log]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const submit = () => {
    const m = text.trim();
    // Lệnh chat tổ đội/tỉ thí: chỉ là ý định, server kiểm mọi điều kiện.
    const cmd = /^\/(moi|p|tithi|roi)(?:\s+(.*))?$/i.exec(m);
    if (cmd) {
      const arg = (cmd[2] ?? '').trim();
      const g = Game.current;
      const c = cmd[1].toLowerCase();
      if (c === 'moi' && arg) g?.send(C.PARTY, { a: 'inv', n: arg });
      else if (c === 'p' && arg) g?.send(C.PARTY, { a: 'say', m: arg });
      else if (c === 'tithi' && arg) g?.send(C.DUEL, { a: 'inv', n: arg });
      else if (c === 'roi') g?.send(C.PARTY, { a: 'leave' });
    } else if (m) Game.current?.send(C.CHAT, { m });
    setText('');
    set({ chatOpen: false });
    inputRef.current?.blur();
  };
  return (
    <div className={'chat' + (open ? ' open' : '') + (idle && !open ? ' idle' : '')}>
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

/**
 * Bảng hồi sinh (P2-B5): hiện khi mực thủy mặc đã phủ gần hết màn (độ trễ CSS khớp `PANEL_INK` trong deathFx), nằm trên
 * lớp mực của hậu kỳ. Chỉ gửi ý định hồi sinh; server quyết định.
 */
function DeathOverlay() {
  const dead = useUI((s) => (s.flags & PF_DEAD) !== 0);
  if (!dead) return null;
  return (
    <div className="death">
      <Panel tone="paper" size="s" className="death-panel" role="alertdialog" aria-labelledby="death-title">
        <Header id="death-title" title={t('ui.dead.title')} sub={t('ui.dead.sub')} />
        <PanelBody>
          <p className="death-line">{t('ui.dead.line')}</p>
          <Divider />
          <p className="death-hint">{t('ui.dead.hint')}</p>
          <div className="death-actions">
            <Button variant="primary" size="l" onClick={() => Game.current?.send(C.RESPAWN)}>
              {t('ui.dead.respawn')}
            </Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

/** Gợi ý khóa chuột: hiện 6 giây mỗi lần chuột được thả rồi tự mờ, không nằm lì giữa màn hình che nhân vật. */
function LockHint() {
  return <div className="hint lock fading">{t('ui.hint.lock')}</div>;
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
  const chapter = useUI((s) => s.chapter);
  const bossLine = useUI((s) => s.bossLine);
  const now = useNow(250);
  // Cắt cảnh: thẻ chương ẩn toàn bộ HUD; câu thoại boss (letterbox) chỉ ẩn phần không cần khi đang đánh.
  const cut = chapter && now < chapter.until ? 'chapter' : bossLine && now < bossLine.until ? 'line' : undefined;
  // Chỉ báo ngoài màn hình nằm ngoài .hud (trong lớp cảnh), nên đánh dấu thêm trên body để CSS ẩn cùng lúc.
  useEffect(() => {
    if (cut === 'chapter') document.body.dataset.cut = cut;
    else delete document.body.dataset.cut;
    return () => {
      delete document.body.dataset.cut;
    };
  }, [cut]);
  const cining = useUI((s) => s.cine !== null && !s.cine.out);
  const dueling = useUI((s) => s.duel !== null);
  return (
    <div className={'hud' + (dueling ? ' duel-on' : '') + (hasBoss ? ' with-boss' : '') + (cining ? ' cining' : '')} data-cut={cut}>
      <TribBars />
      <PlayerFrame />
      <PartyFrame />
      <InviteStack />
      <DuelBanner />
      <CineView />
      <ChapterCardView />
      <UltCardView />
      <BossLineView />
      <BossBar />
      <TargetFrame below={hasBoss} />
      <div className="right-col">
        <Minimap />
        <QuestTracker />
      </div>
      <Toasts />
      <Tribulation />
      <TrialBanner />
      {mouseLook && <div className="crosshair" />}
      {controls === 'mouse' && !mouseLook && !npc && !panel && !dead && <LockHint />}
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


/** Ô pháp bảo phụ (P3-8): ô riêng cuối thanh chiêu, phím 9. Server quyết định mọi thứ; ô chỉ gửi ý định. */
function ArtifactSlot() {
  const art = useUI((s) => s.method?.art);
  const cds = useUI((s) => s.cds);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const now = useNow(100);
  const def = art?.id ? ARTIFACT.get(art.id) : undefined;
  const item = art?.id ? ITEM.get(art.id) : undefined;
  if (!def || !item || !art) {
    return (
      <>
        <span className="sep" />
        <Tooltip content={<TipCard title={t('ui.art.slot')} desc={t('ui.art.none')} />}>
          <button type="button" className="skill" data-state="empty" aria-label={`${t('ui.art.slot')} (9)`} onClick={(e) => { togglePanel('char'); blurAfterPointer(e); }}>
            <span className="skill-icon">
              <span className="content-icon">＋</span>
            </span>
            <span className="skill-key">9</span>
          </button>
        </Tooltip>
      </>
    );
  }
  const mods = artifactLevelMods(art.lv);
  const total = Math.max(1, def.cd * mods.cdMul) * 1000;
  const left = Math.max(0, (cds[def.skill] ?? 0) - now);
  const noMp = mp < def.mp;
  const state = airborne ? 'air' : noMp ? 'nomp' : left > 80 ? 'cd' : 'ready';
  return (
    <>
      <span className="sep" />
      <Tooltip content={<TipCard title={itemName(item.id)} sub={t('ui.art.title')} lines={artifactLines(item, art)} desc={t(`item.${item.id}.desc`)} />}>
        <button
          type="button"
          className="skill art-slot"
          data-state={state}
          data-method="1"
          style={{ '--mc': '#' + def.color } as CSSProperties}
          aria-label={`${itemName(item.id)} (9)`}
          onClick={(e) => {
            Game.current?.useArtifact();
            blurAfterPointer(e);
          }}
        >
          <span className="skill-icon">
            <ContentIcon def={item} />
          </span>
          <span className="skill-key">9</span>
          <span className="art-lv">{art.lv}</span>
          {art.need > 0 && <span className="art-qi" style={{ '--p': Math.min(1, art.qi / art.need) } as CSSProperties} />}
          {left > 80 && (
            <>
              <span className="skill-sweep" style={{ '--p': Math.min(1, left / total) } as CSSProperties} />
              {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
            </>
          )}
        </button>
      </Tooltip>
    </>
  );
}

const BUFF_ICON: Record<string, string> = { atk: 'buff_atk', def: 'buff_def', crit: 'buff_crit' };

/** Hàng đan tăng sức đang có hiệu lực (P3-8), kèm thời gian còn lại. */
function BuffRow() {
  const buffs = useUI((s) => s.method?.buffs);
  const off = useUI((s) => s.methodOff);
  const now = useNow(1000);
  const list = Object.entries(buffs ?? {}).filter(([, [, until]]) => until + off > now);
  if (!list.length) return null;
  return (
    <div className="buff-row" aria-label={t('ui.buff.title')}>
      {list.map(([kind, [mag, until]]) => {
        const left = Math.max(0, Math.ceil((until + off - now) / 1000));
        return (
          <Tooltip key={kind} content={<TipCard title={t('ui.buff.title')} lines={[{ text: `${t('ui.pill.buff.' + kind)} +${Math.round(mag * 100)}%`, tone: 'good' }, { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, tone: 'dim' }]} />}>
            <span className="buff-chip">
              <UiIcon id={BUFF_ICON[kind] ?? 'buff_atk'} fallback={ITEM.get(BUFF_ICON[kind])?.iconFallback ?? '✦'} />
              <em>{left >= 60 ? t('ui.buff.min', { n: Math.ceil(left / 60) }) : t('ui.buff.sec', { n: left })}</em>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
