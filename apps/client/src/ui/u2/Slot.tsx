import type { ReactNode } from 'react';
import { t } from '@dtl/content';
import { LockMark } from './patterns';

type Q = 0 | 1 | 2 | 3 | 4;
const clampQ = (q: number): Q => Math.max(0, Math.min(4, Math.round(q))) as Q;

/** Khung icon bát giác vát (một hình duy nhất cho mọi ô). `on="light"` khi đặt trên giấy. Chỉ là khung: không focus, không bấm. */
export function IconFrame({
  children,
  rarity,
  size = 'm',
  on = 'dark',
  empty,
}: {
  children?: ReactNode;
  rarity?: number;
  size?: 's' | 'm' | 'l';
  on?: 'dark' | 'light';
  empty?: boolean;
}) {
  return (
    <span className="u2-frame" data-size={size} data-on={on} data-empty={empty ? '1' : undefined} data-q={empty || rarity === undefined ? undefined : clampQ(rarity)}>
      <span className="u2-frame__in">{children}</span>
    </span>
  );
}

/**
 * Ô vật phẩm: IconFrame + viền phẩm chất 0–4 (xám, lục, lam, tím, vàng), số lượng, cấp cường hóa, chọn, khóa.
 * `icon` do nơi gọi truyền (ví dụ `<ContentIcon def={def} />`). Ô trống không focus được.
 */
export function Slot({
  icon,
  rarity = 0,
  count,
  plus,
  selected,
  empty,
  locked,
  size,
  on,
  onClick,
  label,
}: {
  icon?: ReactNode;
  rarity?: number;
  count?: number;
  plus?: number;
  selected?: boolean;
  empty?: boolean;
  locked?: boolean;
  size?: 's' | 'm' | 'l';
  on?: 'dark' | 'light';
  onClick?: () => void;
  label?: string;
}) {
  const q = clampQ(rarity);
  const aria = empty ? t('ui.u2.slot.empty') : [label, t('ui.u2.rarity.' + q)].filter(Boolean).join(', ');
  return (
    <button type="button" className="u2-slot" data-sel={selected ? '1' : undefined} data-empty={empty ? '1' : undefined} onClick={onClick} aria-label={aria} aria-pressed={selected} disabled={empty} tabIndex={empty ? -1 : undefined}>
      <IconFrame rarity={q} size={size} on={on} empty={empty}>
        {!empty && icon}
      </IconFrame>
      {!empty && plus ? <span className="u2-slot__plus">+{plus}</span> : null}
      {!empty && count !== undefined && count > 1 ? <span className="u2-slot__n">{count}</span> : null}
      {locked && !empty ? (
        <span className="u2-slot__lock">
          <LockMark />
        </span>
      ) : null}
    </button>
  );
}
