import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '@dtl/content';
import { Panel } from './Panel';
import { Button } from './Controls';

/** Tooltip bọc quanh phần tử kích hoạt: hiện khi rê chuột hoặc focus. `open` ép hiện (trang xem). */
export function Tooltip({ title, sub, rarity, children, tip, open }: { title: ReactNode; sub?: ReactNode; rarity?: number; children: ReactNode; tip?: ReactNode; open?: boolean }) {
  return (
    <span className="u2-tipwrap">
      {children}
      <span className="u2-tip" role="tooltip" data-open={open ? '1' : undefined} data-q={rarity}>
        <div className="u2-tip__h">{title}</div>
        {sub && <div className="u2-tip__sub">{sub}</div>}
        {tip}
      </span>
    </span>
  );
}

/** Hộp thoại giữa màn: nền tối, Escape đóng, focus vào nút đầu, trả focus khi đóng. */
export function Dialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: { title: ReactNode; children: ReactNode; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.u2-dialog__foot button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [onCancel]);
  return (
    <div className="u2 u2-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="u2-dialog" role="dialog" aria-modal="true" ref={box}>
        <Panel title={title} onClose={onCancel}>
          <div className="u2-dialog__body">{children}</div>
          <div className="u2-dialog__foot">
            <Button kind="ngoc" onClick={onCancel}>
              {cancelLabel ?? t('ui.u2.cancel')}
            </Button>
            <Button onClick={onConfirm}>{confirmLabel ?? t('ui.u2.ok')}</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export interface ToastItem {
  id: number;
  text: ReactNode;
  tone?: 'ok' | 'bad';
}

/** Chồng toast góc phải dưới (trình bày thuần: nơi gọi giữ danh sách và hẹn giờ gỡ). */
export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="u2 u2-toasts" role="status" aria-live="polite">
      {items.map((it) => (
        <div key={it.id} className="u2-toast" data-tone={it.tone}>
          {it.text}
        </div>
      ))}
    </div>
  );
}
