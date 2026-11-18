import type { ReactNode } from 'react';
import { t } from '@dtl/content';
import { CornerCloud, CrossMark } from './patterns';

/** Nút đóng tròn son. Luôn có nhãn đọc màn hình. */
export function CloseButton({ onClick, label }: { onClick?: () => void; label?: string }) {
  return (
    <button type="button" className="u2-close" onClick={onClick} aria-label={label ?? t('ui.u2.close')}>
      <CrossMark />
    </button>
  );
}

/** Tiêu đề cuộn: nhô trên viền trái của Panel, đầu phải vát nhọn. Thường dùng qua prop `title` của `Panel`. */
export function PanelTitle({ children }: { children: ReactNode }) {
  return <div className="u2-title">{children}</div>;
}

/**
 * Cửa sổ giấy ngà viền ngọc, vạch kim trong, bốn góc kim chạm mây.
 * `title` thêm tiêu đề cuộn; `onClose` thêm nút đóng; `tone="ink"` là bản tối.
 */
export function Panel({
  title,
  onClose,
  tone,
  children,
  className,
}: {
  title?: ReactNode;
  onClose?: () => void;
  tone?: 'giay' | 'ink';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={'u2-panel' + (className ? ' ' + className : '')} data-title={title ? '1' : undefined} data-tone={tone}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <CornerCloud key={c} className="u2-panel__corner" data-c={c} />
      ))}
      {title && <PanelTitle>{title}</PanelTitle>}
      {onClose && (
        <div className="u2-panel__close">
          <CloseButton onClick={onClose} />
        </div>
      )}
      {children}
    </section>
  );
}
