import { QUALITIES } from '../../base/quality';
import { type ReactNode, useState } from 'react';
import { t } from '@dtl/content';
import { getVolume, isMuted, setMuted, setVolume, sfx, unlockAudio, VOLUME_KEYS, type VolumeKey } from '../../game/audio/audio';
import { Game } from '../../game/engine';
import { AURA_COMBATS, AURA_MODES, AURA_OTHERS } from '../../game/fx/realmAuraRules';
import { Button, Divider, PanelWindow, Segmented, Slider, Tabs, Tooltip } from '../u2/win';
import { setReduceMotion, useReduceMotion } from '../u2/shell';
import { closePanel, openPanel, set, setHudPref, useUI } from '../store';
import { setUiScaleUser, uiScaleUser } from '../uiScale';
import { setTouchPref, useTouchState, type TouchPref } from '../../input/touchMode';
type SegProps<V extends string | number | boolean> = Parameters<typeof Segmented<V>>[0];
import { PRESET_IDS, PRESETS, presetOf, type PresetId } from './settingsPresets';

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

/** Nhãn hiển thị + biểu tượng (i) mở gợi ý dài trong tooltip (thay cho đoạn chữ xám dưới mỗi cài đặt). */
function Field({ label, hint, bare, children }: { label: string; hint?: string; bare?: boolean; children: ReactNode }) {
  return (
    <div className="set-field">
      {(!bare || hint) && (
        <div className="set-label">
          {!bare && <span>{label}</span>}
          {hint && (
            <Tooltip content={<div className="set-tip">{hint}</div>}>
              <button type="button" className="set-info" aria-label={t('ui.settings.info')}>
                i
              </button>
            </Tooltip>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function LSeg<V extends string | number | boolean>({ bare, hint, ...p }: SegProps<V> & { bare?: boolean; hint?: string }) {
  return (
    <Field label={p.label ?? ''} hint={hint} bare={bare}>
      <Segmented {...p} />
    </Field>
  );
}

/** Cài đặt chia bốn nhóm (Chân Cảnh U11): Đồ họa (mức nhanh, chất lượng, hiệu ứng chiến đấu, khí tức), Âm thanh, Điều khiển, Giao diện. */
const TABS = ['graphics', 'audio', 'controls', 'interface'] as const;
type TabId = (typeof TABS)[number];

export function Settings() {
  const [tab, setTab] = useState<TabId>('graphics');
  const quality = useUI((s) => s.quality);
  const qualityLock = useUI((s) => s.qualityLock);
  const qualityHint = useUI((s) => s.qualityHint);
  const hintSeen = useUI((s) => s.qualityHintSeen);
  const fps = useUI((s) => s.fps);
  const camShake = useUI((s) => s.camShake);
  const reduceMotion = useReduceMotion();
  const fxQ = useUI((s) => s.fxQuality);
  const hitStop = useUI((s) => s.hitStop);
  const impactFrame = useUI((s) => s.impactFrame);
  const staticFx = useUI((s) => s.staticFx);
  const heroRim = useUI((s) => s.heroRim);
  const auraMode = useUI((s) => s.auraMode);
  const auraOthers = useUI((s) => s.auraOthers);
  const auraCombat = useUI((s) => s.auraCombat);
  const offscreen = useUI((s) => s.offscreen);
  const chapterCards = useUI((s) => s.chapterCards);
  const colliders = useUI((s) => s.debugColliders);
  const [mute, setMute] = useState(isMuted());
  const skillLayout = useUI((s) => s.skillLayout);
  const touchPref = useTouchState((s) => s.pref);
  const [uiMul, setUiMul] = useState(() =>
    [0.8, 1, 1.2, 1.4].reduce((a, b) => (Math.abs(b - uiScaleUser()) < Math.abs(a - uiScaleUser()) ? b : a)),
  );
  const onOff = [
    { value: true, label: t('ui.settings.cam_shake_on') },
    { value: false, label: t('ui.settings.cam_shake_off') },
  ];
  const preset = presetOf({ quality, fxQuality: fxQ, impactFrame, heroRim });
  const applyPreset = (id: PresetId) => {
    const g = Game.current;
    const p = PRESETS[id];
    g?.setQuality(p.quality);
    g?.setFxQuality(p.fxQuality);
    g?.setImpactFrame(p.impactFrame);
    g?.setHeroRim(p.heroRim);
  };
  // Khung va chạm chỉ có ở bản thử hoặc `?debug`.
  const debugOk = Game.current?.debugOk === true;
  return (
    <PanelWindow title={t('ui.settings')} onClose={() => closePanel('settings')} width={540}>
      <Tabs
        label={t('ui.settings.tabs')}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        items={TABS.map((id) => ({ id, label: t('ui.settings.tab.' + id) }))}
      />
      {tab === 'graphics' && (
        <div data-testid="settings-graphics">
          <Divider label={t('ui.settings.preset')} />
          {/* Không khớp preset nào (đã chỉnh riêng) thì không ô nào sáng. */}
          <LSeg
            bare
            hint={t('ui.settings.preset_hint')}
            label={t('ui.settings.preset')}
            value={(preset ?? '') as PresetId}
            onChange={(id: PresetId) => applyPreset(id)}
            options={PRESET_IDS.map((id) => ({ value: id, label: t('ui.settings.preset.' + id) }))}
          />
          <Divider label={t('ui.settings.quality')} />
          {qualityHint && !hintSeen && (
            <div className="set-suggest" data-testid="quality-hint">
              <span>{t('ui.settings.quality_suggest', { q: t('ui.settings.q.' + qualityHint) })}</span>
              <Button
                onClick={() => {
                  Game.current?.setQuality(qualityHint);
                  Game.current?.dismissQualityHint();
                }}
              >
                {t('ui.settings.quality_apply')}
              </Button>
              <Button onClick={() => Game.current?.dismissQualityHint()}>{t('ui.settings.quality_dismiss')}</Button>
            </div>
          )}
          <LSeg
            bare
            hint={t('ui.settings.quality_hint')}
            label={t('ui.settings.quality')}
            value={quality}
            onChange={(q) => Game.current?.setQuality(q)}
            options={QUALITIES.map((q) => ({ value: q, label: t('ui.settings.q.' + q) }))}
          />
          <LSeg
            hint={t('ui.settings.quality_lock_hint')}
            label={t('ui.settings.quality_lock')}
            value={qualityLock}
            onChange={(on) => Game.current?.setQualityLock(on)}
            options={onOff}
          />
          <div className="k-dim set-fps">{t('ui.settings.fps', { n: fps })}</div>
          <Divider label={t('ui.settings.group_combat')} />
          <Slider
            label={t('ui.settings.cam_shake')}
            value={camShake}
            min={0}
            max={100}
            step={5}
            format={(n) => n + '%'}
            onChange={(n) => Game.current?.setCamShake(n)}
          />
          <Slider
            label={t('ui.settings.hit_stop')}
            value={hitStop}
            min={0}
            max={100}
            step={5}
            format={(n) => n + '%'}
            onChange={(n) => Game.current?.setHitStop(n)}
          />
          <LSeg
            label={t('ui.settings.fx_quality')}
            value={fxQ}
            onChange={(q) => Game.current?.setFxQuality(q)}
            options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t('ui.settings.fxq.' + q) }))}
            hint={t('ui.settings.fx_quality_hint')}
          />
          <LSeg
            label={t('ui.settings.impact_frame')}
            value={impactFrame}
            onChange={(on) => Game.current?.setImpactFrame(on)}
            options={onOff}
          />
          <LSeg
            label={t('ui.settings.hero_rim')}
            value={heroRim}
            onChange={(on) => Game.current?.setHeroRim(on)}
            options={onOff}
            hint={t('ui.settings.hero_rim_hint')}
          />
          <LSeg
            label={t('ui.settings.fx_static')}
            value={staticFx}
            onChange={(on) => Game.current?.setStaticFx(on)}
            options={onOff}
            hint={t('ui.settings.fx_static_hint')}
          />
          {debugOk && (
            <>
              <LSeg
                label={t('ui.settings.colliders')}
                value={colliders}
                onChange={(on) => Game.current?.setDebugColliders(on)}
                options={onOff}
                hint={t('ui.settings.colliders_hint')}
              />
            </>
          )}
          <Divider label={t('ui.settings.realm_aura')} />
          <LSeg
            bare
            label={t('ui.settings.realm_aura')}
            value={auraMode}
            onChange={(m) => Game.current?.setAuraMode(m)}
            options={AURA_MODES.map((m) => ({ value: m, label: t('ui.settings.aura.mode.' + m) }))}
          />
          <LSeg
            label={t('ui.settings.aura_others')}
            value={auraOthers}
            onChange={(m) => Game.current?.setAuraOthers(m)}
            options={AURA_OTHERS.map((m) => ({ value: m, label: t('ui.settings.aura.others.' + m) }))}
          />
          <LSeg
            label={t('ui.settings.aura_combat')}
            value={auraCombat}
            onChange={(m) => Game.current?.setAuraCombat(m)}
            options={AURA_COMBATS.map((m) => ({ value: m, label: t('ui.settings.aura.combat.' + m) }))}
            hint={t('ui.settings.realm_aura_hint')}
          />
        </div>
      )}
      {tab === 'audio' && (
        <div data-testid="settings-audio">
          <Divider label={t('ui.settings.sound')} />
          <LSeg
            bare
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
        </div>
      )}
      {tab === 'controls' && (
        <div data-testid="settings-controls">
          <Divider label={t('ui.settings.touch')} />
          <LSeg
            bare
            label={t('ui.settings.touch')}
            value={touchPref}
            onChange={(m: TouchPref) => setTouchPref(m)}
            options={(['auto', 'on', 'off'] as const).map((m) => ({ value: m, label: t('ui.settings.touch.' + m) }))}
            hint={t('ui.settings.touch_hint')}
          />
          <Divider label={t('ui.settings.skill_layout')} />
          <LSeg
            bare
            label={t('ui.settings.skill_layout')}
            value={skillLayout}
            onChange={(m) => setHudPref('skillLayout', m)}
            options={(['arc', 'bar'] as const).map((m) => ({ value: m, label: t('ui.settings.skill_layout.' + m) }))}
            hint={t('ui.settings.skill_layout_hint')}
          />
          <Divider label={t('ui.settings.offscreen')} />
          <LSeg
            bare
            label={t('ui.settings.offscreen')}
            value={offscreen}
            onChange={(on) => Game.current?.setOffscreen(on)}
            options={onOff}
            hint={t('ui.settings.offscreen_hint')}
          />
        </div>
      )}
      {tab === 'interface' && (
        <div data-testid="settings-interface">
          <Divider label={t('ui.settings.uiscale')} />
          <LSeg
            bare
            label={t('ui.settings.uiscale')}
            value={uiMul}
            onChange={(m) => {
              setUiScaleUser(m);
              setUiMul(m);
            }}
            options={[0.8, 1, 1.2, 1.4].map((m) => ({ value: m, label: t('ui.settings.uiscale.' + m) }))}
            hint={t('ui.settings.uiscale_hint')}
          />
          <Divider label={t('ui.settings.chapter')} />
          <LSeg
            bare
            label={t('ui.settings.chapter')}
            value={chapterCards}
            onChange={(on) => Game.current?.setChapterCards(on)}
            options={onOff}
            hint={t('ui.settings.chapter_hint')}
          />
          <Divider label={t('ui.settings.reduce_motion')} />
          <LSeg
            bare
            label={t('ui.settings.reduce_motion')}
            value={reduceMotion}
            onChange={setReduceMotion}
            options={onOff}
            hint={t('ui.settings.reduce_motion_hint')}
          />
          <Divider label={t('ui.settings.credits')} />
          <div>
            <Button onClick={() => openPanel('credits')}>{t('ui.settings.credits_open')}</Button>
          </div>
          <div>
            <Button
              onClick={() => {
                Game.current?.dispose();
                set({ phase: 'login', windows: [], needName: false, log: [] });
              }}
            >
              {t('ui.settings.logout')}
            </Button>
          </div>
        </div>
      )}
    </PanelWindow>
  );
}
