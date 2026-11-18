import type { MouseEvent } from 'react';
import { t } from '@dtl/content';
import { bagLow } from '../../itemInfo';
import { SysIcon, type SysIconName } from '../../ngj';
import { Tooltip } from '../../kit';
import { QUEST } from '@dtl/content';
import { type Panel, togglePanel, useUI } from '../../store';
import { IconFrame } from '../Slot';

/** Bấm bằng chuột xong thì bỏ focus để phím số/mũi tên tiếp theo tới game (bàn phím giữ focus). */
function blurAfterPointer(e: MouseEvent<HTMLElement>): void {
  if (e.detail > 0) e.currentTarget.blur();
}

interface HubItem {
  id: string;
  icon: SysIconName;
  /** Khóa i18n tên. */
  name: string;
  key: string;
  panel: Panel;
}

/**
 * Bảy mục của Ngọc Đái: Túi B, Nhân vật C, Công pháp K, Tổ đội P, Nhiệm vụ L, Hành trình N, Cài đặt O.
 * Hành trình (N) mở bản đồ chương khi màn đó có (U2-4); tạm mở bản đồ lớn (cùng bảng với M).
 */
export const HUB_ITEMS: readonly HubItem[] = [
  { id: 'bag', icon: 'bag', name: 'ui.bag.short', key: 'B', panel: 'bag' },
  { id: 'char', icon: 'character', name: 'ui.char', key: 'C', panel: 'char' },
  { id: 'method', icon: 'method', name: 'ui.method.key', key: 'K', panel: 'method' },
  { id: 'party', icon: 'party', name: 'ui.party.key', key: 'P', panel: 'party' },
  { id: 'quests', icon: 'quest', name: 'ui.quests', key: 'L', panel: 'quests' },
  { id: 'journey', icon: 'map', name: 'ui.hub.journey', key: 'N', panel: 'map' },
  { id: 'settings', icon: 'settings', name: 'ui.settings', key: 'O', panel: 'settings' },
];

/** Huy hiệu: số (nhiệm vụ đã xong chờ trả), chấm (túi sắp đầy), hoặc không có. */
function useBadges(): Record<string, string | undefined> {
  const quests = useUI((s) => s.quests);
  const inv = useUI((s) => s.inv);
  const ready = Object.keys(quests.active).filter((id) => {
    const q = QUEST.get(id);
    const prog = quests.active[id];
    return q && prog && q.objectives.every((o, i) => (prog[i] ?? 0) >= o.count);
  }).length;
  return { quests: ready > 0 ? String(ready) : undefined, bag: bagLow(inv) !== null ? '' : undefined };
}

/** Hàng 7 icon góc phải trên: ô bát giác cùng hình với ô vật phẩm, huy hiệu đỏ, tooltip tên + phím. */
export function HubBar() {
  const badges = useBadges();
  const windows = useUI((s) => s.windows);
  return (
    <nav className="u2h-hub" aria-label={t('ui.hub.label')}>
      {HUB_ITEMS.map((it) => (
        <Tooltip key={it.id} content={<span className="u2h-tip">{`${t(it.name)} · ${it.key}`}</span>}>
          <button
            type="button"
            className="u2h-hubbtn"
            aria-pressed={windows.some((w) => w.id === it.panel) || undefined}
            aria-label={`${t(it.name)} (${it.key})`}
            data-testid={'hub-' + it.id}
            onClick={(e) => {
              togglePanel(it.panel);
              blurAfterPointer(e);
            }}
          >
            <IconFrame size="s">
              <SysIcon name={it.icon} size={22} />
            </IconFrame>
            {badges[it.id] !== undefined && (
              <span className="u2h-badge" data-dot={badges[it.id] === '' ? '1' : undefined}>
                {badges[it.id]}
              </span>
            )}
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}
