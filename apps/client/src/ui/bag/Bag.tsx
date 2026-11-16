import { useState } from 'react';
import { C, isEquipSlot } from '@dtl/shared';
import { ITEM, t } from '@dtl/content';
import { UiIcon } from '../ContentIcon';
import { Game, reqId } from '../../game/engine';
import { Button } from '../kit';
import { closePanel, useUI } from '../store';
import { ItemDetail, ItemIcon, Window } from '../windows/common';

export function Bag() {
  const inv = useUI((s) => s.inv);
  const gold = useUI((s) => s.char?.gold ?? 0);
  const [sel, setSel] = useState<number | null>(null);
  const item = sel !== null ? inv[sel] : null;
  const def = item ? ITEM.get(item.id) : undefined;
  const g = Game.current;
  return (
    <Window title={t('ui.bag')} onClose={() => closePanel('bag')} cls="bag" width={460}>
      <div className="bag-grid">
        {inv.map((it, i) => (
          <ItemIcon
            key={i}
            item={it}
            selected={sel === i}
            onClick={() => {
              setSel(it ? i : null);
            }}
          />
        ))}
      </div>
      <div className="gold">
        <b>{gold}</b> <UiIcon id="cur_linh_thach" fallback="💠" className="inline" />
      </div>
      {item && def && sel !== null ? (
        <ItemDetail item={item}>
          {def.kind === 'consumable' && (
            <Button variant="primary" onClick={() => g?.send(C.USE, { slot: sel, r: reqId() })}>
              {t('ui.item.use')}
            </Button>
          )}
          {isEquipSlot(def.kind) && (
            <Button
              variant="primary"
              onClick={() => {
                g?.send(C.EQUIP, { slot: sel, r: reqId() });
                setSel(null);
              }}
            >
              {t('ui.item.equip')}
            </Button>
          )}
        </ItemDetail>
      ) : (
        <div className="k-card k-dim">{t('ui.bag.empty_hint')}</div>
      )}
    </Window>
  );
}
