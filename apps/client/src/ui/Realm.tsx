// Cảnh giới Phase 3-7: bình cảnh (tâm ma / Phá Cảnh Đan), linh căn ngũ hành. Dùng bộ khung `ui/u2/win`.
// Client chỉ hiển thị trạng thái server gửi (CharView) và gửi ý định; mọi phán định ở server.
import './realm.css';
import { useEffect, useState } from 'react';
import {
  BOTTLENECK_RETRY_SEC,
  C,
  type CharView,
  isBottleneckLevel,
  isPeakLevel,
  peakGated,
  isRootId,
  bottleneckPill,
  type RootId,
  ROOT_IDS,
  rootChangeCost,
  TRIAL_DURATION,
} from '@dtl/shared';
import { itemName, nextMajorRealmName, realmName, ROOT, t } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { UiIcon } from './ContentIcon';
import { Button, Divider } from './u2/win';
import { closePanel, useUI } from './store';

/** Số giây còn lại, đếm xuống từ `sec` (server gửi lúc `char` đổi). 0 = không chạy. */
function useCountdown(sec: number, key: unknown): number {
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setDeadline(sec > 0 ? Date.now() + sec * 1000 : 0);
    setNow(Date.now());
  }, [sec, key]);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

/** Thẻ linh căn trong bảng nhân vật. */
export function RootCard({ root }: { root: string }) {
  if (!isRootId(root)) return null;
  return (
    <div className="k-card root-card" data-root={root}>
      <span className="root-glyph" aria-hidden="true">
        <UiIcon id={`root_${root}`} fallback={t(`elem.${root}`)} />
      </span>
      <div>
        <div className="root-name">
          {t('ui.root.title')}: {t(`root.${root}.name`)}
        </div>
        <div className="k-dim">{t(`root.${root}.desc`)}</div>
      </div>
    </div>
  );
}

/** Khối bình cảnh trong bảng nhân vật: chỉ hiện khi cấp là mốc bình cảnh và chưa vượt. */
export function BottleneckBox({ char }: { char: CharView }) {
  const inv = useUI((s) => s.inv);
  const wait = useCountdown(char.retry, char);
  const left = useCountdown(char.trial, char);
  const g = Game.current;
  if (!isBottleneckLevel(char.level) || char.bk >= char.level) return null;
  const full = char.xp >= char.xpNeed;
  const pill = bottleneckPill(char.level);
  const pills = inv.reduce((s, x) => s + (x && x.id === pill ? x.n : 0), 0);
  const trialing = left > 0;
  if (peakGated(char.level)) {
    return (
      <div className="k-card bk-box" data-testid="bk-box">
        <div className="bk-title">{t('ui.bk.title')}</div>
        <div className="k-dim">{t('ui.bk.not_yet')}</div>
      </div>
    );
  }
  return (
    <div className="k-card bk-box" data-testid="bk-box">
      <div className="bk-title">{t('ui.bk.title')}</div>
      <div className="k-dim">
        {isPeakLevel(char.level)
          ? t('ui.bk.hint15', { realm: realmName(char.level), to: nextMajorRealmName(char.level) })
          : t('ui.bk.hint', { realm: realmName(char.level) })}
      </div>
      <div className={full ? 'ok' : 'bad'}>
        {full ? '✔' : '✘'} {full ? t('ui.xp_full') : t('ui.bk.xp_not_full')}
      </div>
      <div className="k-dim">{t('ui.bk.trial_desc', { n: TRIAL_DURATION, w: BOTTLENECK_RETRY_SEC })}</div>
      {trialing && <div className="bk-live">{t('ui.bk.in_trial', { n: left })}</div>}
      <div className="bk-actions">
        <Button
          variant="primary"
          disabled={!full || wait > 0 || trialing}
          onClick={() => {
            g?.send(C.BOTTLENECK, { m: 'trial' });
            closePanel('char');
          }}
        >
          {wait > 0 ? t('ui.bk.wait', { n: wait }) : `☯ ${t('ui.bk.trial')}`}
        </Button>
        <Button disabled={!full || pills < 1} onClick={() => g?.send(C.BOTTLENECK, { m: 'pill', r: reqId() })}>
          {t('ui.bk.pill')} ({pills})
        </Button>
      </div>
      <div className="k-dim">
        {itemName(pill)}: {t(`item.${pill}.desc`)}
      </div>
    </div>
  );
}

/** Đồng hồ tâm ma trên HUD khi đang vượt thử thách. */
export function TrialBanner() {
  const char = useUI((s) => s.char);
  const left = useCountdown(char?.trial ?? 0, char);
  if (!char || left <= 0) return null;
  return (
    <div className="trial-banner" role="status" aria-live="polite" data-testid="trial-banner">
      <span className="trial-glyph" aria-hidden="true">
        ☯
      </span>{' '}
      {t('ui.bk.hud', { n: left })}
    </div>
  );
}

/** Chọn linh căn lúc tạo nhân vật (đăng nhập): `null` = để thiên ý định đoạt. */
export function RootPicker({ value, onChange }: { value: RootId | null; onChange: (r: RootId | null) => void }) {
  return (
    <div className="root-picker">
      <label>{t('ui.root.pick')}</label>
      <div className="root-row">
        {ROOT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={'root-opt' + (value === id ? ' sel' : '')}
            data-root={id}
            title={t(`root.${id}.desc`)}
            onClick={() => onChange(id)}
          >
            <UiIcon id={`root_${id}`} fallback={t(`elem.${id}`)} className="inline" /> {t(`elem.${id}`)}
          </button>
        ))}
        <button type="button" className={'root-opt rnd' + (value === null ? ' sel' : '')} onClick={() => onChange(null)}>
          {t('ui.root.random')}
        </button>
      </div>
      <div className="k-dim root-pick-desc">{value ? t(`root.${value}.desc`) : ''}</div>
    </div>
  );
}

/** Tab đổi linh căn ở NPC có `rootChange`. */
export function RootTab({ npcId }: { npcId: string }) {
  const char = useUI((s) => s.char);
  if (!char) return null;
  const cost = rootChangeCost(char.level);
  const g = Game.current;
  return (
    <div className="shop-list">
      <Divider label={t('ui.root.change')} />
      <div className="k-dim">
        {t('ui.root.change_desc', { n: cost })} · <UiIcon id="cur_linh_thach" fallback="💠" className="inline" /> {char.gold}
      </div>
      {ROOT_IDS.map((id) => {
        const def = ROOT.get(id)!;
        const cur = char.root === id;
        return (
          <div key={id} className="k-card shop-row" data-root={id}>
            <span className="root-glyph" aria-hidden="true">
              <UiIcon id={`root_${id}`} fallback={t(`elem.${def.elem}`)} />
            </span>
            <div className="shop-info">
              <div className="item-name">{t(`root.${id}.name`)}</div>
              <div className="k-dim">{t(`root.${id}.desc`)}</div>
            </div>
            <Button
              variant="primary"
              disabled={cur || char.gold < cost}
              onClick={() => g?.send(C.ROOT, { npc: npcId, root: id, r: reqId() })}
            >
              {cur ? t('ui.root.current') : t('ui.root.change_btn', { n: cost })}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
