import { ContentIcon, UiIcon } from './ContentIcon';
import './panels.css';
import './tutien.css';
import './u2/shell/hud.css';
import './u2/hud/hud.css';
import { type CSSProperties, useEffect } from 'react';
import {
  ARTIFACT_MAX_LEVEL,
  artifactLevelMods,
  BAR_SIZE,
  CLONE_UNLOCK_LEVEL,
  BONDED_ARTIFACT_ID,
  bondedLevel,
  SPIRIT_CD_MS,
  SPIRIT_CHANNEL_MS,
  SPIRIT_MP,
  spiritUnlocked,
  soulUnlocked,
  SOUL_DEATH_CD_MS,
  SOUL_RANGE,
  SOUL_SCOUT,
  SOUL_SCOUT_CD_MS,
  SOUL_SCOUT_MS,
  PF_SOUL,
  C,
  tribDef,
  ELEMENTS,
  elemCounterOf,
  tribPhaseIndex,
  tribPhaseStart,
  PF_DEAD,
} from '@dtl/shared';
import {
  ARTIFACT,
  hasString,
  ITEM,
  itemName,
  nextMajorRealmName,
  realmName,
  resolveBarSkill,
  t,
  tierBar,
  VARIANTS,
  METHOD_SKILLS,
} from '@dtl/content';
import { Portrait, useArtUrl } from './Art';
import { Game } from '../game/engine';
import { artifactLines } from './gear';
import { Corners, RingSweep } from './u2/shell';
import { Button, Divider, Header, Panel, PanelBody, ProgressBar, TipCard, Tooltip } from './u2/win';
import { DebugPanel } from './DebugPanel';
import { NpcDialog } from './NpcDialog';
import { DuelBanner, InviteStack, PartyFrame } from './Party';
import { Minimap } from './minimap/Minimap';
import { Panels } from './windows/Panels';
import { TrialBanner } from './Realm';
import { Calli, preloadCalli } from './calli/Calli';
import { BagWarn } from './BagWarn';
import { type BossLine, type ChapterCard, togglePanel, useUI } from './store';
import { HubBar } from './u2/hud/HubBar';
import { ChapterMap } from './chapters/ChapterMap';
import { JadeRing } from './u2/patterns';
import './u2/boot/trib.css';
import { PlayerCard, BossCard, TargetCastBar } from './u2/hud/Frames';
import { QuestTrack } from './u2/hud/QuestChat';
import { ChatBox } from './u2/hud/Chat';
import { SkillBanner } from './u2/hud/SkillBanner';
import { SkillCluster } from './u2/hud/SkillCluster';
import { ResourceBar } from './u2/hud/ResourceBar';
import { chainLines, skillMpNow } from './skillChain';
import { TouchControls } from './u2/touch/TouchControls';
import './u2/touch/touch.css';
import { blurAfterPointer, useNow } from './u2/hud/common';
import { hudVars, useHudMode } from './u2/hud/hudVars';

function TargetFrame({ below }: { below: boolean }) {
  const target = useUI((s) => s.target);
  const bossId = useUI((s) => s.boss?.id);
  const talking = useUI((s) => s.npc !== null);
  // Boss đang chọn đã có thanh lớn ở giữa phía trên.
  if (!target || (target.boss && target.id === bossId)) return null;
  // Đang mở bảng hội thoại/cửa hàng của NPC: tên NPC đã nằm trên tiêu đề bảng, ẩn khung mục tiêu để khỏi bị tab tiêu đề đè.
  if (talking && target.kind === 'npc') return null;
  return (
    <div className={'frame target-frame' + (below ? ' below-boss' : '')} data-kind={target.kind}>
      <Corners />
      {target.kind !== 'player' && <Portrait id={target.def} className="frame-portrait" />}
      <div className="frame-head">
        <span className="frame-name">{target.name}</span>
        {target.kind !== 'npc' && (
          <span className="frame-realm">{target.kind === 'mon' ? t('ui.level_short', { n: target.level }) : realmName(target.level)}</span>
        )}
      </div>
      {target.kind !== 'npc' && (
        <ProgressBar
          key={target.id}
          cls={'hp ' + (target.kind === 'player' ? 'ally' : 'enemy')}
          value={target.hp}
          max={target.mhp}
          text={`${target.hp} / ${target.mhp}`}
          segs={4}
          trail
          label={t('ui.hp')}
        />
      )}
      {target.cast && <TargetCastBar cast={target.cast} />}
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
      <div className="ult-card-name">
        <Calli k={`skill.${card.skill}.name`} em={3.2} />
      </div>
    </div>
  );
}

function ChapterCardView() {
  const card = useUI((s) => s.chapter);
  return card ? <ChapterCardShow card={card} /> : null;
}

/** Tranh nền mờ sau chữ của thẻ chương (nạp lười, thiếu ảnh thì thẻ như cũ). */
const CARD_ART: Partial<Record<ChapterCard['kind'], string>> = { ch2: 'chuong_2', ascend_kd: 'ket_dan' };

function ChapterCardShow({ card }: { card: ChapterCard }) {
  const now = useNow(250);
  const art = useArtUrl('loading', CARD_ART[card.kind]);
  const level = useUI((s) => s.char?.level ?? 1);
  if (now >= card.until) return null;
  const k = 'ui.chapter.' + card.kind;
  return (
    <div className={'chapter-card chapter-' + card.kind} key={card.id} style={{ '--dur': card.dur + 'ms' } as CSSProperties}>
      {art && <div className="chapter-art" style={{ backgroundImage: `url("${art}")` }} />}
      {(card.kind === 'trib' || card.kind.startsWith('ascend')) && <RingSweep />}
      <div className="lb lb-top" />
      <div className="lb lb-bot" />
      <div className="chapter-text">
        <div className="chapter-kicker">{t(k + '.kicker', { realm: realmName(level), next: nextMajorRealmName(level) })}</div>
        <div className="chapter-title">
          {/* Tên cảnh giới (ascend*) và tên nơi chốn/độ kiếp: ảnh thư pháp khi đã vẽ, lùi về chữ. */}
          {k.startsWith('ui.chapter.ascend') ? (
            <Calli k={'realm.' + level} text={realmName(level)} big />
          ) : (
            <Calli
              big={k === 'ui.chapter.trib'}
              k={k + '.title'}
              text={t(k + '.title', { realm: realmName(level), next: nextMajorRealmName(level) })}
            />
          )}
        </div>
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
    <div
      className={'cine' + (cine.kind && cine.kind !== 'sect' ? ' cine-' + cine.kind : '') + (cine.out ? ' out' : '')}
      key={cine.id}
      style={{ '--dur': cine.dur + 'ms' } as CSSProperties}
    >
      <div className="cine-bar cine-top" />
      <div className="cine-bar cine-bot" />
      {cine.kind === 'dan' ? null : cine.kind === 'boss' || cine.kind === 'phase' ? (
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
  const danPg = useUI((s) => s.danPg);
  const tamCanh = useUI((s) => s.tamCanh);
  const soulUntil = useUI((s) => s.soulUntil);
  const nguHanh = useUI((s) => s.nguHanh);
  const cloneUntil = useUI((s) => s.cloneUntil);
  const steles = useUI((s) => s.steles);
  const now = useNow(250);
  if (!tribEnd || now >= tribEnd) return null;
  // Pha, thời lượng và lời nhắc đọc từ `tribulations.json` theo kiếp đang độ (E1-F); Trúc Cơ giữ ba pha của S2-C.
  const def = tribDef(tribId);
  const left = Math.max(0, (tribEnd - now) / 1000);
  const elapsed = def.duration - left;
  const pi = tribPhaseIndex(def, elapsed);
  const ph = def.phases[pi]!;
  // Pha có tia khóa mệnh: ban đầu tia cuối tích tụ (hint), sau `delay` giây là mưa sét (hint2).
  const after = !!ph.final && elapsed >= tribPhaseStart(def, pi) + ph.final.delay;
  const key = 'ui.trib.' + def.id + '.';
  const title = hasString(key + 'title') ? t(key + 'title') : t('ui.trib.title');
  return (
    <div className="trib" role="status">
      <div className="trib-ring" aria-hidden="true">
        <Portrait id={Game.current?.view?.players.get(Game.current.sid)?.g === 'f' ? 'player_f' : 'player_m'} />
        <JadeRing />
      </div>
      <div className="trib-title">{title}</div>
      <div className="trib-phases">
        {def.phases.map((p, i) => {
          const start = tribPhaseStart(def, i);
          const len = p.end - start;
          return (
            <div key={p.id} className={'trib-phase' + (i === pi ? ' on' : '')} style={{ flex: len }}>
              <ProgressBar
                cls="kiep"
                value={Math.max(0, Math.min(len, elapsed - start))}
                max={len}
                text={i === pi ? t('ui.trib.secs', { n: Math.ceil(left) }) : undefined}
              />
              <div className="trib-phase-name">{t(key + p.id)}</div>
            </div>
          );
        })}
      </div>
      {ph.mechanic === 'dan_tran' && danPg >= 0 && (
        <div className="trib-dan" data-testid="dan-bar">
          <ProgressBar cls="dan" value={danPg} max={100} text={t('ui.trib.dan_tran.label', { n: Math.round(danPg) })} />
        </div>
      )}
      {ph.mechanic === 'tam_canh' && tamCanh >= 0 && (
        <div className="trib-dan trib-tam" data-testid="tam-bar">
          <ProgressBar cls="tam" value={tamCanh} max={100} text={t('ui.trib.tam_canh.label', { n: Math.round(tamCanh) })} />
        </div>
      )}
      {ph.mechanic === 'xuat_khieu' && (
        <div className={'trib-soul' + (now < soulUntil ? ' on' : '')} data-testid="soul-hint">
          {now < soulUntil ? t('ui.trib.xuat_khieu.on', { n: Math.ceil((soulUntil - now) / 1000) }) : t('ui.trib.xuat_khieu.hint')}
        </div>
      )}
      {ph.mechanic === 'ngu_hanh' && (
        <div className="trib-hanh" data-testid="hanh-hint">
          {nguHanh && now < nguHanh.at + 800
            ? t('ui.trib.ngu_hanh.now', { e: t('elem.' + ELEMENTS[nguHanh.e]), k: t('elem.' + elemCounterOf(ELEMENTS[nguHanh.e]!)) })
            : t('ui.trib.ngu_hanh.wait')}
        </div>
      )}
      {steles >= 0 && def.phases.some((q) => q.danLoi) && (
        <div className="trib-soul trib-steles" data-testid="steles-hint">
          {t('ui.trib.anh_bien.steles', { lit: [0, 1, 2, 3, 4].filter((i) => steles & (1 << i)).length })}
        </div>
      )}
      {ph.mechanic === 'phan_than' && (
        <div className={'trib-soul trib-clone' + (now < cloneUntil ? ' on' : '')} data-testid="clone-hint">
          {now < cloneUntil ? t('ui.trib.phan_than.on', { n: Math.ceil((cloneUntil - now) / 1000) }) : t('ui.trib.phan_than.hint')}
        </div>
      )}
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
  const soulFlee = useUI((s) => (s.flags & PF_SOUL) !== 0);
  const until = useUI((s) => s.soul.until);
  const now = performance.now();
  useNow(250);
  if (!dead) return null;
  return (
    <div className="death">
      <Panel tone="paper" size="s" className="death-panel" role="alertdialog" aria-labelledby="death-title">
        <Header
          id="death-title"
          title={<Calli k={soulFlee ? 'ui.dead.soul_title' : 'ui.dead.title'} em={2.7} />}
          sub={soulFlee ? t('ui.dead.soul_sub') : t('ui.dead.sub')}
        />
        <PanelBody>
          <p className="death-line">
            {soulFlee ? t('ui.dead.soul_line', { n: Math.max(0, Math.ceil((until - now) / 1000)) }) : t('ui.dead.line')}
          </p>
          <Divider />
          <p className="death-hint">{t('ui.dead.hint')}</p>
          <div className="death-actions">
            <Button variant="primary" size="l" onClick={() => Game.current?.send(C.RESPAWN)}>
              <Calli k="ui.dead.respawn" em={2.4} />
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
  const panel = useUI((s) => s.windows.length > 0);
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
  // Thẻ chiêu tối thượng chỉ sống 0,6 s: nạp trước ảnh tên chiêu lúc vào game (nạp lúc thẻ hiện thì thường chưa kịp).
  useEffect(() => {
    preloadCalli(METHOD_SKILLS.filter((s) => s.ult).map((s) => `skill.${s.id}.name`));
  }, []);
  const cining = useUI((s) => s.cine !== null && !s.cine.out && s.cine.kind !== 'dan');
  const dueling = useUI((s) => s.duel !== null);
  const skillLayout = useUI((s) => s.skillLayout);
  const questCollapsed = useUI((s) => s.questCollapsed);
  const chatCollapsed = useUI((s) => s.chatCollapsed);
  const chatSize = useUI((s) => s.chatSize);
  const mode = useHudMode();
  return (
    <div
      className={'hud u2hud' + (dueling ? ' duel-on' : '') + (hasBoss ? ' with-boss' : '') + (cining ? ' cining' : '')}
      data-cut={cut}
      data-mode={mode}
      data-skills={skillLayout}
      style={hudVars(mode, { skillLayout, questCollapsed, chatCollapsed, chatSize })}
    >
      <TribBars />
      <PlayerCard />
      <PartyFrame />
      <InviteStack />
      <DuelBanner />
      <CineView />
      <ChapterCardView />
      <UltCardView />
      <BossLineView />
      <BossCard />
      <TargetFrame below={hasBoss} />
      <div className="u2h-zone u2h-tr">
        <HubBar />
        <Minimap />
        {mode !== 'touch' && <QuestTrack />}
      </div>
      {mode === 'touch' && <QuestTrack />}
      <ChapterMap />
      <Toasts />
      <Tribulation />
      <TrialBanner />
      <BagWarn />
      {mouseLook && <div className="crosshair" />}
      {controls === 'mouse' && mode !== 'touch' && !mouseLook && !npc && !panel && !dead && <LockHint />}
      {hint && !npc && <div className="hint">{hint}</div>}
      <CastBar />
      <SkillBanner />
      {mode === 'touch' ? <TouchControls /> : <SkillCluster layout={skillLayout} utility={<UtilityRow />} />}
      <ChatBox />
      <Panels />
      {npc && <NpcDialog npcId={npc} />}
      <DeathOverlay />
      <DebugPanel />
      <Corner />
    </div>
  );
}

/**
 * Ô tiện ích cạnh cụm kỹ năng (U2-2): pháp bảo phụ (9), đan lô (T), thần thức (V), nguyên anh (X), chip phân thân (G), dấu chồng
 * công pháp, hàng chiêu bậc cao (Shift+số) và buff. Giữ nguyên logic cũ; chỉ đổi chỗ đặt.
 */
function UtilityRow() {
  const char = useUI((s) => s.char);
  const cds = useUI((s) => s.cds);
  const gcdAt = useUI((s) => s.gcdAt);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const method = useUI((s) => s.method);
  const empowered = useUI((s) => s.empowered);
  const clone = useUI((s) => s.clone);
  const now = useNow(100);
  if (!char) return null;
  const tier = tierBar(method?.method);
  return (
    <>
      <div className="u2h-slots">
        {tier.length > 0 && (
          <div className="u2h-extras u2h-tier" aria-label={t('ui.skill.tier_row')}>
            {tier.map((sk, j) => {
              // Chiêu bậc cao chưa mở thì ẩn (không vẽ ô khóa): chỉ hiện những ô đã dùng được.
              if (char.level < sk.unlock) return null;
              const rs = resolveBarSkill(method, sk);
              const locked = char.level < sk.unlock;
              const ready = Math.max(cds[sk.id] ?? 0, gcdAt);
              const left = Math.max(0, ready - now);
              const total = (cds[sk.id] ?? 0) > gcdAt ? Math.max(1, rs.cd) * 1000 : 1000;
              // VS-2b: cửa sổ chuỗi đang mở thì sáng viền, linh lực tính theo thưởng chuỗi.
              const chainOpen = !locked && (empowered[sk.id] ?? 0) > now;
              const mpNow = skillMpNow(sk, chainOpen);
              const noMp = !locked && mp < mpNow;
              const state = locked ? 'locked' : airborne ? 'air' : noMp ? 'nomp' : left > 80 ? 'cd' : 'ready';
              const lv = method?.lv[sk.id] ?? 1;
              const vr = method?.vr[sk.id];
              const lines = [
                { text: t('ui.skill.tier_key', { n: j + 1 }) },
                ...(lv > 1 ? [{ text: t('ui.skill.level_tag', { n: lv }) }] : []),
                ...(vr && VARIANTS[sk.id] ? [{ text: t('ui.skill.variant_tag', { name: t(`skill.${sk.id}.var.${vr}.name`) }) }] : []),
                ...(sk.mp ? [{ text: `${t('ui.mp')}: ${mpNow}`, tone: noMp ? ('bad' as const) : undefined }] : []),
                ...(rs.cd ? [{ text: t('ui.skill.cd', { n: rs.cd }) }] : []),
                ...(locked ? [] : chainLines(sk, chainOpen)),
              ];
              return (
                <Tooltip
                  key={sk.id}
                  content={
                    <TipCard
                      title={t(`skill.${sk.id}.name`)}
                      sub={locked ? t('ui.char.locked', { realm: realmName(sk.unlock) }) : undefined}
                      lines={lines}
                      desc={t(`skill.${sk.id}.desc`)}
                    />
                  }
                >
                  <button
                    type="button"
                    className={'skill' + (chainOpen ? ' empowered' : '')}
                    data-state={state}
                    data-method="1"
                    aria-label={`${t(`skill.${sk.id}.name`)} (Shift+${j + 1})`}
                    onClick={(e) => {
                      Game.current?.useSkill(BAR_SIZE + 2 + j);
                      blurAfterPointer(e);
                    }}
                  >
                    <span className="skill-icon">
                      <ContentIcon def={sk} />
                    </span>
                    <span className="skill-key">⇧{j + 1}</span>
                    {!locked && left > 80 && (
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
          </div>
        )}
        <div className="u2h-extras">
          <ArtifactSlot />
          <BondedSlot />
          <SpiritSlot />
          <SoulSlot />
        </div>
      </div>
      <div className="u2h-chips">
        <ResourceBar />
        {char.level >= CLONE_UNLOCK_LEVEL && (
          <div className={'clone-chip' + (now < clone.until ? ' on' : '')} data-testid="clone-chip" aria-label={t('ui.clone.title')}>
            <span className="clone-key">G</span>
            {now < clone.until
              ? t('ui.clone.left', { n: Math.ceil((clone.until - now) / 1000) })
              : now < clone.cdUntil
                ? t('ui.clone.cd', { n: Math.ceil((clone.cdUntil - now) / 1000) })
                : t('ui.clone.title')}
          </div>
        )}
        <BuffRow />
      </div>
    </>
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
          <button
            type="button"
            className="skill"
            data-state="empty"
            aria-label={`${t('ui.art.slot')} (9)`}
            onClick={(e) => {
              togglePanel('char');
              blurAfterPointer(e);
            }}
          >
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
      <Tooltip
        content={
          <TipCard title={itemName(item.id)} sub={t('ui.art.title')} lines={artifactLines(item, art)} desc={t(`item.${item.id}.desc`)} />
        }
      >
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

/** Bản mệnh pháp bảo Ngưng Đan Lô (E2-E, phím T): có từ Kết Đan, cấp theo cảnh giới. Ẩn khi chưa Kết Đan. */
function BondedSlot() {
  const level = useUI((s) => s.char?.level ?? 0);
  const cds = useUI((s) => s.cds);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const now = useNow(100);
  const lv = bondedLevel(level);
  const def = ARTIFACT.get(BONDED_ARTIFACT_ID);
  const item = ITEM.get(BONDED_ARTIFACT_ID);
  if (lv < 1 || !def || !item) return null;
  const mods = artifactLevelMods(lv);
  const total = Math.max(1, def.cd * mods.cdMul) * 1000;
  const left = Math.max(0, (cds[def.skill] ?? 0) - now);
  const noMp = mp < def.mp;
  const state = airborne ? 'air' : noMp ? 'nomp' : left > 80 ? 'cd' : 'ready';
  const lines = [
    { text: t('ui.bonded.key') },
    { text: t('ui.bonded.level', { n: lv, max: ARTIFACT_MAX_LEVEL }) },
    { text: `${t('ui.mp')}: ${def.mp}`, tone: noMp ? ('bad' as const) : undefined },
    { text: t('ui.skill.cd', { n: Math.round(total / 1000) }) },
    { text: t(`art.${def.id}.skill.desc`, { n: Math.round(def.power * mods.powerMul * 100), r: def.radius }) },
    { text: t(`art.passive.${def.passive.kind}`, { n: Math.round(def.passive.per * lv * 100) }), tone: 'good' as const },
  ];
  return (
    <Tooltip content={<TipCard title={itemName(item.id)} sub={t('ui.bonded.title')} lines={lines} desc={t(`item.${item.id}.desc`)} />}>
      <button
        type="button"
        className="skill art-slot"
        data-state={state}
        data-method="1"
        style={{ '--mc': '#' + def.color } as CSSProperties}
        aria-label={`${itemName(item.id)} (T)`}
        onClick={(e) => {
          Game.current?.useBonded();
          blurAfterPointer(e);
        }}
      >
        <span className="skill-icon">
          <ContentIcon def={item} />
        </span>
        <span className="skill-key">T</span>
        <span className="art-lv">{lv}</span>
        {left > 80 && (
          <>
            <span className="skill-sweep" style={{ '--p': Math.min(1, left / total) } as CSSProperties} />
            {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
          </>
        )}
      </button>
    </Tooltip>
  );
}

/** Thần thức (E2-E, phím V giữ): hiện từ Kết Đan; vòng sạc khi đang vận, đồng hồ hồi chiêu sau khi quét. */
function SpiritSlot() {
  const level = useUI((s) => s.char?.level ?? 0);
  const sp = useUI((s) => s.spirit);
  const mp = useUI((s) => s.mp);
  const now = performance.now();
  useNow(100);
  if (!spiritUnlocked(level)) return null;
  const channel = sp.chUntil > now;
  const left = Math.max(0, sp.cdUntil - now);
  const noMp = mp < SPIRIT_MP;
  const state = channel ? 'charging' : left > 80 ? 'cd' : noMp ? 'nomp' : 'ready';
  const lines = [
    { text: t('ui.spirit.range', { n: sp.r }) },
    { text: `${t('ui.mp')}: ${SPIRIT_MP}`, tone: noMp ? ('bad' as const) : undefined },
    { text: t('ui.skill.cd', { n: SPIRIT_CD_MS / 1000 }) },
  ];
  return (
    <Tooltip content={<TipCard title={t('ui.spirit.title')} lines={lines} desc={t('ui.spirit.desc')} />}>
      <button
        type="button"
        className="skill"
        data-state={state}
        data-method="1"
        aria-label={`${t('ui.spirit.title')} (V)`}
        onPointerDown={(e) => {
          Game.current?.spiritHold(true);
          blurAfterPointer(e);
        }}
        onPointerUp={() => Game.current?.spiritHold(false)}
        onPointerLeave={() => Game.current?.spiritHold(false)}
      >
        <span className="skill-icon">
          <UiIcon id="hud_than_thuc" fallback="👁" />
        </span>
        <span className="skill-key">V</span>
        {channel && (
          <span className="skill-charge" style={{ '--p': 1 - Math.min(1, (sp.chUntil - now) / SPIRIT_CHANNEL_MS) } as CSSProperties} />
        )}
        {!channel && left > 80 && (
          <>
            <span className="skill-sweep" style={{ '--p': Math.min(1, left / SPIRIT_CD_MS) } as CSSProperties} />
            {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
          </>
        )}
      </button>
    </Tooltip>
  );
}

/** Nguyên anh xuất khiếu (E3-K, phím X): hiện từ Nguyên Anh; đồng hồ hồi chiêu, đếm ngược lúc đang xuất khiếu. */
function SoulSlot() {
  const level = useUI((s) => s.char?.level ?? 0);
  const soul = useUI((s) => s.soul);
  const now = performance.now();
  useNow(100);
  if (!soulUnlocked(level)) return null;
  const out = soul.k === SOUL_SCOUT;
  const left = Math.max(0, soul.cdUntil - now);
  const state = out ? 'charging' : left > 80 ? 'cd' : 'ready';
  const rescue = soul.deathCdUntil - now;
  const lines = [
    { text: t('ui.soul.range', { n: SOUL_RANGE, s: SOUL_SCOUT_MS / 1000 }) },
    { text: t('ui.skill.cd', { n: SOUL_SCOUT_CD_MS / 1000 }) },
    {
      text: rescue > 0 ? t('ui.soul.rescue_cd', { n: Math.ceil(rescue / 1000) }) : t('ui.soul.rescue', { n: SOUL_DEATH_CD_MS / 60000 }),
      tone: rescue > 0 ? ('bad' as const) : undefined,
    },
  ];
  return (
    <Tooltip content={<TipCard title={t('ui.soul.title')} lines={lines} desc={t('ui.soul.desc')} />}>
      <button
        type="button"
        className="skill"
        data-state={state}
        data-method="1"
        aria-label={`${t('ui.soul.title')} (X)`}
        onPointerDown={(e) => {
          Game.current?.soulToggle();
          blurAfterPointer(e);
        }}
      >
        <span className="skill-icon">
          <UiIcon id="hud_nguyen_anh" fallback="👻" />
        </span>
        <span className="skill-key">X</span>
        {out && <span className="skill-cd-text">{Math.max(0, Math.ceil((soul.until - now) / 1000))}</span>}
        {!out && left > 80 && (
          <>
            <span className="skill-sweep" style={{ '--p': Math.min(1, left / SOUL_SCOUT_CD_MS) } as CSSProperties} />
            {left > 1000 && <span className="skill-cd-text">{Math.ceil(left / 1000)}</span>}
          </>
        )}
      </button>
    </Tooltip>
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
          <Tooltip
            key={kind}
            content={
              <TipCard
                title={t('ui.buff.title')}
                lines={[
                  { text: `${t('ui.pill.buff.' + kind)} +${Math.round(mag * 100)}%`, tone: 'good' },
                  { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, tone: 'dim' },
                ]}
              />
            }
          >
            <span className="buff-chip">
              <UiIcon id={BUFF_ICON[kind] ?? 'buff_atk'} fallback={ITEM.get(BUFF_ICON[kind]!)?.iconFallback ?? '✦'} />
              <em>{left >= 60 ? t('ui.buff.min', { n: Math.ceil(left / 60) }) : t('ui.buff.sec', { n: left })}</em>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
