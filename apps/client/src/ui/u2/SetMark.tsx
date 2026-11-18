import type { CSSProperties } from 'react';
import { SET, t } from '@dtl/content';
import { SET_EMBLEMS } from './setEmblems';

/** Id bộ có dấu ấn (`set_lac_kiem` → khóa `lac_kiem`). */
export const emblemOf = (set: string | undefined): string | undefined => (set ? SET_EMBLEMS[set.replace(/^set_/, '')] : undefined);

/** Dấu ấn bộ trang bị: huy hiệu tròn nhỏ ở góc dưới trái của icon, tô bằng màu sáng của bộ (`look.blade`). Ẩn ở ô nhỏ (container query ở styles.css). */
export function SetMark({ set }: { set: string }) {
  const d = emblemOf(set);
  if (!d) return null;
  const color = SET.get(set)?.look.blade;
  return (
    <span className="set-mark" title={t(`set.${set}.name`)} style={color ? ({ '--set-c': color } as CSSProperties) : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    </span>
  );
}
