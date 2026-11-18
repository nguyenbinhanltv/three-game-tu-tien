import { useState } from 'react';
import { t } from '@dtl/content';
import { getVolume, isMuted, setMuted, setVolume, sfx, unlockAudio, VOLUME_KEYS, type VolumeKey } from '../../game/audio/audio';
import { Game } from '../../game/engine';
import { Button, Divider, PanelWindow, Segmented, Slider } from '../kit';
import { setReduceMotion, useReduceMotion } from '../ngj';
import { closePanel, openPanel, set, useUI } from '../store';

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

export function Settings() {
  const quality = useUI((s) => s.quality);
  const fps = useUI((s) => s.fps);
  const controls = useUI((s) => s.controls);
  const camShake = useUI((s) => s.camShake);
  const reduceMotion = useReduceMotion();
  const fxQ = useUI((s) => s.fxQuality);
  const hitStop = useUI((s) => s.hitStop);
  const offscreen = useUI((s) => s.offscreen);
  const chapterCards = useUI((s) => s.chapterCards);
  const [mute, setMute] = useState(isMuted());
  const onOff = [
    { value: true, label: t('ui.settings.cam_shake_on') },
    { value: false, label: t('ui.settings.cam_shake_off') },
  ];
  return (
    <PanelWindow title={t('ui.settings')} onClose={() => closePanel('settings')}>
      <Divider label={t('ui.settings.controls')} />
      <Segmented
        label={t('ui.settings.controls')}
        value={controls}
        onChange={(m) => Game.current?.setControls(m)}
        options={['mouse', 'turn', 'strafe'].map((m) => ({ value: m, label: t('ui.settings.controls.' + m) }))}
      />
      <div className="k-dim">{t('ui.settings.controls_hint.' + controls)}</div>
      <Divider label={t('ui.settings.quality')} />
      <Segmented
        label={t('ui.settings.quality')}
        value={quality}
        onChange={(q) => Game.current?.setQuality(q)}
        options={['low', 'medium', 'high'].map((q) => ({ value: q, label: t('ui.settings.q.' + q) }))}
      />
      <div className="k-dim">{t('ui.settings.quality_hint')}</div>
      <div className="k-dim">{t('ui.settings.fps', { n: fps })}</div>
      <Divider label={t('ui.settings.cam_shake')} />
      <Segmented label={t('ui.settings.cam_shake')} value={camShake} onChange={(on) => Game.current?.setCamShake(on)} options={onOff} />
      <Divider label={t('ui.settings.fx_quality')} />
      <Segmented
        label={t('ui.settings.fx_quality')}
        value={fxQ}
        onChange={(q) => Game.current?.setFxQuality(q)}
        options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t('ui.settings.fxq.' + q) }))}
      />
      <div className="k-dim">{t('ui.settings.fx_quality_hint')}</div>
      <Segmented label={t('ui.settings.hit_stop')} value={hitStop} onChange={(on) => Game.current?.setHitStop(on)} options={onOff} />
      <Divider label={t('ui.settings.offscreen')} />
      <Segmented label={t('ui.settings.offscreen')} value={offscreen} onChange={(on) => Game.current?.setOffscreen(on)} options={onOff} />
      <div className="k-dim">{t('ui.settings.offscreen_hint')}</div>
      <Divider label={t('ui.settings.chapter')} />
      <Segmented
        label={t('ui.settings.chapter')}
        value={chapterCards}
        onChange={(on) => Game.current?.setChapterCards(on)}
        options={onOff}
      />
      <div className="k-dim">{t('ui.settings.chapter_hint')}</div>
      <Divider label={t('ui.settings.reduce_motion')} />
      <Segmented label={t('ui.settings.reduce_motion')} value={reduceMotion} onChange={setReduceMotion} options={onOff} />
      <div className="k-dim">{t('ui.settings.reduce_motion_hint')}</div>
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
    </PanelWindow>
  );
}
