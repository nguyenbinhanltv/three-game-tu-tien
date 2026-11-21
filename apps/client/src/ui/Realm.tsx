// Cảnh giới Phase 3-7: bình cảnh (tâm ma / Phá Cảnh Đan), Bản Nguyên (linh căn ngũ hành + Lôi, TN-1). Dùng bộ khung `ui/u2/win`.
// Client chỉ hiển thị trạng thái server gửi (CharView) và gửi ý định; mọi phán định ở server.
import './realm.css';
import { useEffect, useState } from 'react';
import {
  BOTTLENECK_RETRY_SEC,
  C,
  DAO_MUL,
  DAO_UNLOCK_LEVEL,
  daoOf,
  type CharView,
  isBottleneckLevel,
  isPeakLevel,
  peakGated,
  isRootId,
  originOpen,
  bottleneckPill,
  type RootId,
  ROOT_IDS,
  rootChangeCost,
  TRIAL_DURATION,
} from '@dtl/shared';
import { itemName, nextMajorRealmName, ORIGINS, realmName, t } from '@dtl/content';
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
          {t('ui.root.title')}: {t(`origin.${root}.name`)}
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
            <UiIcon id={`root_${id}`} fallback={t(`elem.${id}`)} className="inline" /> {t(`origin.${id}.name`)}
          </button>
        ))}
        <button type="button" className={'root-opt rnd' + (value === null ? ' sel' : '')} onClick={() => onChange(null)}>
          {t('ui.root.random')}
        </button>
      </div>
      <div className="k-dim root-pick-desc">{value ? t(`root.${value}.desc`) : ''}</div>
      <LockedOrigins />
    </div>
  );
}

/** Tám Bản Nguyên chưa mở (TN-1): chỉ để biết phía trước còn gì, gom theo chương mở; không bấm được. */
export function LockedOrigins() {
  const locked = ORIGINS.filter((o) => !originOpen(o));
  const chapters = [...new Set(locked.map((o) => o.chapter!))].sort((a, b) => a - b);
  return (
    <div className="root-locked" data-testid="root-locked">
      <span className="root-locked-label">{t('ui.root.locked')}</span>
      {chapters.map((ch) => (
        <div key={ch} className="root-locked-row">
          <span className="root-locked-ch">
            <span aria-hidden="true">🔒</span> {t('ui.root.locked_at', { n: ch })}
          </span>
          {locked
            .filter((o) => o.chapter === ch)
            .map((o) => (
              <span
                key={o.id}
                className="root-lock"
                data-origin={o.id}
                title={t('ui.root.locked_hint', { desc: t(`origin.${o.id}.desc`), n: ch })}
              >
                {t(`origin.${o.id}.name`)}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

/** Tab đổi linh căn ở NPC có `rootChange`. */
/** Tab Đạo (TN-3): từ Vấn Đỉnh chọn MỘT nguồn làm Đạo, một lần, miễn phí. Server tự kiểm cấp và chưa chọn (`onChooseDao`). */
export function DaoTab() {
  const char = useUI((s) => s.char);
  if (!char) return null;
  const chosen = daoOf({ dao: char.dao });
  const locked = char.level < DAO_UNLOCK_LEVEL;
  const g = Game.current;
  return (
    <div className="shop-list">
      <Divider label={t('ui.dao.title')} />
      <div className="k-dim">
        {t(chosen ? 'ui.dao.chosen_desc' : locked ? 'ui.dao.locked' : 'ui.dao.desc', {
          lv: DAO_UNLOCK_LEVEL,
          pct: Math.round(DAO_MUL * 100),
        })}
      </div>
      {ROOT_IDS.map((id) => {
        const cur = chosen === id;
        return (
          <div key={id} className="k-card shop-row" data-dao={id}>
            <span className="root-glyph" aria-hidden="true">
              <UiIcon id={`root_${id}`} fallback={t(`elem.${id}`)} />
            </span>
            <div className="shop-info">
              <div className="item-name">{t(`origin.${id}.name`)}</div>
              <div className="k-dim">{t(`root.${id}.desc`)}</div>
              <div className="k-dim">{t(`ui.dao.domain.${id}`)}</div>
            </div>
            <Button variant="primary" disabled={!!chosen || locked} onClick={() => g?.send(C.DAO, { root: id })}>
              {cur ? t('ui.dao.current') : t('ui.dao.pick')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

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
        const cur = char.root === id;
        return (
          <div key={id} className="k-card shop-row" data-root={id}>
            <span className="root-glyph" aria-hidden="true">
              <UiIcon id={`root_${id}`} fallback={t(`elem.${id}`)} />
            </span>
            <div className="shop-info">
              <div className="item-name">{t(`origin.${id}.name`)}</div>
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
      <LockedOrigins />
    </div>
  );
}
