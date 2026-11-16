import './character/character.css';
import { t } from '@dtl/content';
import { bagLow } from './itemInfo';
import { togglePanel, useUI } from './store';

/** Cảnh báo túi sắp đầy trên HUD (còn ≤ 10 ô); bấm để mở túi. */
export function BagWarn() {
  const inv = useUI((s) => s.inv);
  const n = bagLow(inv);
  if (n === null) return null;
  return (
    <button type="button" className={'bag-warn' + (n === 0 ? ' full' : '')} data-testid="bag-warn" onClick={() => togglePanel('bag')}>
      🎒 {t('ui.hud.bag_low', { n })}
    </button>
  );
}
