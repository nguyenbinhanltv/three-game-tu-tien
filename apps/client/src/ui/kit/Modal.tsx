import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Header, Panel, PanelBody, type PanelTone } from './Panel';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại chặn nền: nền tối, nhốt focus (Tab vòng trong hộp), Esc hoặc bấm nền để đóng, trả focus về chỗ cũ.
 * Chặn mọi phím rơi xuống game khi đang mở. `actions` là hàng nút ở chân (thường `Button`).
 * Đặt `dismissible={false}` cho hộp bắt buộc chọn.
 */
export function Modal({
  open,
  title,
  onClose,
  actions,
  width = 420,
  tone,
  dismissible = true,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  width?: number;
  tone?: PanelTone;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = root.current;
    // Focus vào phần tử đầu tiên trong thân hộp, không phải nút đóng.
    (el?.querySelector<HTMLElement>('.k-panel-body')?.querySelector<HTMLElement>(FOCUSABLE) ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => before?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="k-modal-back"
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={root}
        className="k-modal"
        style={{ '--w': width + 'px' } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && dismissible) {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Tab' && root.current) {
            const list = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <Panel tone={tone}>
          <Header title={title} id={titleId} onClose={dismissible ? onClose : undefined} />
          <PanelBody>{children}</PanelBody>
          {actions && <div className="k-modal-foot">{actions}</div>}
        </Panel>
      </div>
    </div>
  );
}
