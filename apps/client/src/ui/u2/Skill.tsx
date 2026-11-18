import type { CSSProperties, ReactNode } from 'react';
import { t } from '@dtl/content';
import { IconFrame } from './Slot';
import { InkStroke, LockMark } from './patterns';

/**
 * Ô chiêu: IconFrame + phím + hồi chiêu quét vàng. `cooldown` là phần còn lại 0–1 (1 = vừa bấm); `cdText` là số giây hiện giữa ô.
 * `locked` phủ khóa và không bấm được; `active` làm viền sáng (đang ra chiêu).
 */
export function SkillButton({
  icon,
  keyLabel,
  cooldown = 0,
  cdText,
  locked,
  active,
  onClick,
  label,
}: {
  icon?: ReactNode;
  keyLabel?: string;
  cooldown?: number;
  cdText?: string;
  locked?: boolean;
  active?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const cd = Math.max(0, Math.min(1, cooldown));
  return (
    <button type="button" className="u2-slot u2-skill" data-active={active ? '1' : undefined} disabled={locked} onClick={onClick} aria-label={[label, locked ? t('ui.u2.locked') : undefined].filter(Boolean).join(', ') || undefined}>
      <IconFrame>{icon}</IconFrame>
      {keyLabel && <span className="u2-skill__key">{keyLabel}</span>}
      {cd > 0 && <span className="u2-skill__cd" style={{ '--cd': cd } as CSSProperties} />}
      {cd > 0 && cdText && <span className="u2-skill__cdn">{cdText}</span>}
      {locked && (
        <span className="u2-slot__lock">
          <LockMark />
        </span>
      )}
    </button>
  );
}

/** Dải tên chiêu: vệt mực loang + chữ display kim (≤ 3 từ, ≥ 28 px). `enter` chạy vệt quét 400 ms. */
export function InkBanner({ children, enter }: { children: ReactNode; enter?: boolean }) {
  return (
    <div className="u2-ink" data-enter={enter ? '1' : undefined}>
      <InkStroke className="u2-ink__bg" />
      <span className="u2-ink__t">{children}</span>
    </div>
  );
}
