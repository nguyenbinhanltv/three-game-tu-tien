// Khối sinh lực dưới thanh chiêu (Chân Cảnh U1): camera chéo đặt người chơi quanh giữa màn hình nên máu/linh lực nằm ngay chân
// thanh chiêu giữa dưới (mắt không phải rời vùng chiến đấu), buff kèm đếm giờ ngay dưới thanh máu.
import { ITEM, t } from '@dtl/content';
import { UiIcon } from '../../ContentIcon';
import { useUI } from '../../store';
import { Bar } from '../index';
import { TipCard, Tooltip } from '../win';
import { useNow } from './common';
import { ResourceBar } from './ResourceBar';

const BUFF_ICON: Record<string, string> = { atk: 'buff_atk', def: 'buff_def', crit: 'buff_crit' };

/** Chip đan tăng sức kèm đếm giờ (dùng cho mình ở chân thanh chiêu và cho đồng đội ở khung tổ đội). `off` = độ lệch giờ server → giờ máy. */
export function BuffChips({
  buffs,
  off,
  now,
  small,
}: {
  buffs: Record<string, [number, number]> | undefined;
  off: number;
  now: number;
  small?: boolean;
}) {
  const list = Object.entries(buffs ?? {}).filter(([, [, until]]) => until + off > now);
  if (!list.length) return null;
  return (
    <div className={'buff-row' + (small ? ' small' : '')} aria-label={t('ui.buff.title')}>
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

/** Hàng đan tăng sức của mình (P3-8), kèm thời gian còn lại. */
export function BuffRow() {
  const buffs = useUI((s) => s.method?.buffs);
  const off = useUI((s) => s.methodOff);
  const now = useNow(1000);
  return <BuffChips buffs={buffs} off={off} now={now} />;
}

/** Máu (trái) + linh lực (phải) quanh chân thanh chiêu, buff dưới thanh máu. Chỉ dùng ở bố cục thanh ngang PC. */
export function VitalsDock() {
  const char = useUI((s) => s.char);
  const hp = useUI((s) => s.hp);
  const mhp = useUI((s) => s.mhp);
  const mp = useUI((s) => s.mp);
  const mmp = useUI((s) => s.mmp);
  if (!char) return null;
  return (
    <section className="u2h-zone u2h-dock" aria-label={t('ui.hp')} data-testid="vitals-dock">
      <ResourceBar dock />
      <div className="u2h-dock-bars">
        <Bar kind="hp" value={hp} max={mhp} text={`${hp} / ${mhp}`} label={t('ui.hp')} />
        <Bar kind="mp" value={mp} max={mmp} text={`${mp} / ${mmp}`} label={t('ui.mp')} />
      </div>
      <BuffRow />
    </section>
  );
}
