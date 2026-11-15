import type { ReactNode } from 'react';
import { t } from '@dtl/content';

export type Rarity = 0 | 1 | 2 | 3 | 4;

/**
 * Ô vật phẩm: viền vát theo phẩm chất (0 xám, 1 lục, 2 lam, 3 tím có ánh, 4 vàng kim có ánh), số lượng, cấp cường hóa.
 * Không `onClick` thì vẫn là nút (để Tooltip và focus hoạt động); `empty` là ô trống, không focus được.
 * Nội dung (`icon`) do nơi gọi truyền vào, ví dụ `<ContentIcon def={def} />`.
 */
export function Slot({
  icon,
  rarity = 0,
  count,
  plus,
  selected,
  empty,
  size = 'm',
  onClick,
  label,
  disabled,
}: {
  icon?: ReactNode;
  rarity?: number;
  count?: number;
  plus?: number;
  selected?: boolean;
  empty?: boolean;
  size?: 's' | 'm' | 'l';
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const q = Math.max(0, Math.min(4, Math.round(rarity)));
  const aria = empty ? t('ui.kit.slot.empty') : [label, t('ui.kit.rarity.' + q)].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className="k-slot"
      data-q={empty ? undefined : q}
      data-empty={empty ? 'true' : undefined}
      data-size={size}
      aria-label={aria}
      aria-pressed={selected || undefined}
      disabled={disabled}
      tabIndex={empty ? -1 : undefined}
      onClick={empty ? undefined : onClick}
    >
      <span className="k-slot-in">
        {!empty && icon}
        {!empty && count !== undefined && count > 1 && <span className="k-slot-count">{count}</span>}
        {!empty && plus ? <span className="k-slot-plus">+{plus}</span> : null}
      </span>
    </button>
  );
}
