// Thang sao Cổ Thần (TN-5): chín ô sao, thưởng đang có, giá sao kế tiếp và nút rèn. Chỉ gửi ý định (`C.STAR`); server kiểm và trừ.
import { C, COTHAN_METHOD } from '@dtl/shared';
import { GLOSSARY, itemName, realmName, STARS, t } from '@dtl/content';
import { Game, reqId } from '../game/engine';
import { useUI } from './store';
import { starView } from './starView';
import { Button } from './u2/win';

/** Có hiện bảng sao không: chỉ khi đang xem công pháp Cổ Thần Quyết. */
export const showsStars = (methodId: string | undefined): boolean => methodId === COTHAN_METHOD;

export function StarPanel({ level, gold }: { level: number; gold: number }) {
  const method = useUI((s) => s.method);
  const inv = useUI((s) => s.inv);
  const mats = inv.reduce((n, s) => (s?.id === STARS.item ? n + s.n : n), 0);
  const v = starView({ table: STARS, stars: method?.sr, level, method: method?.method || undefined, mats, gold });
  const g = Game.current;
  const name = (n: number) => GLOSSARY.coThanStars[n - 1] ?? String(n);
  return (
    <div className="star-panel" data-testid="star-panel" data-stars={v.stars}>
      <div className="k-dim">{t('ui.star.hint')}</div>
      <div
        className="star-pips"
        role="meter"
        aria-label={t('ui.star.title')}
        aria-valuemin={0}
        aria-valuemax={v.pips.length}
        aria-valuenow={v.stars}
      >
        {v.pips.map((on, i) => (
          <i key={i} className={on ? 'on' : ''} title={name(i + 1)} />
        ))}
      </div>
      <div className="star-now">
        <b>{v.stars ? name(v.stars) : t('ui.star.none')}</b>
        {v.stars > 0 && (
          <span className="k-dim">
            {t('ui.star.bonus', { hp: Math.round(v.bonus.hp * 100), reduce: Math.round(v.bonus.reduce * 100) })}
          </span>
        )}
      </div>
      {v.next ? (
        <div className="star-next">
          <span>{t('ui.star.next', { star: name(v.next.star), mats: v.next.mats, item: itemName(STARS.item), gold: v.next.gold })}</span>
          <span className="k-dim">{t('ui.star.have', { mats, realm: realmName(v.next.level) })}</span>
          <Button size="s" variant="primary" disabled={!!v.block} data-testid="star-up" onClick={() => g?.send(C.STAR, { r: reqId() })}>
            {t('ui.star.up')}
          </Button>
          {v.block && <span className="k-dim star-why">{t(`ui.star.block.${v.block}`)}</span>}
        </div>
      ) : (
        <div className="ok">{t('ui.star.max')}</div>
      )}
    </div>
  );
}
