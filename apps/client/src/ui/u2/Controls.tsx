import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/** Nút lục giác vát. `kind`: son (chính, mặc định) | ngoc (phụ) | khoa (không bấm được). `force` chỉ để trang xem hiện trạng thái. */
export function Button({
  kind = 'son',
  size,
  force,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'son' | 'ngoc' | 'khoa'; size?: 's'; force?: 'hover' | 'active' }) {
  return (
    <button
      type="button"
      {...rest}
      className="u2-btn"
      data-kind={kind}
      data-size={size}
      data-force={force}
      disabled={disabled || kind === 'khoa'}
    >
      <span>{children}</span>
    </button>
  );
}

export interface TabDef {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

/** Tab hình thang. `role=tablist`; mũi tên trái/phải đổi tab. */
export function Tabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label?: string }) {
  const go = (idx: number, list: HTMLElement) => {
    const next = tabs[idx]!;
    onChange(next.id);
    (list.children[idx] as HTMLElement | undefined)?.focus(); // roving tabindex: focus theo tab mới
  };
  const step = (dir: number, from: number, list: HTMLElement) => {
    for (let i = 1; i <= tabs.length; i++) {
      const idx = (((from + dir * i) % tabs.length) + tabs.length) % tabs.length;
      if (!tabs[idx]!.disabled) return go(idx, list);
    }
  };
  const edge = (last: boolean, list: HTMLElement) => {
    const order = tabs.map((_, i) => i);
    const idx = (last ? order.reverse() : order).find((i) => !tabs[i]!.disabled);
    if (idx !== undefined) go(idx, list);
  };
  return (
    <div className="u2-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="u2-tab"
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            const list = e.currentTarget.parentElement!;
            if (e.key === 'ArrowRight') step(1, i, list);
            else if (e.key === 'ArrowLeft') step(-1, i, list);
            else if (e.key === 'Home') edge(false, list);
            else if (e.key === 'End') edge(true, list);
            else return;
            e.preventDefault();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Nhãn trạng thái: son (mặc định) | ngoc (thông tin) | kim | lam | xam. */
export function Badge({ tone, children }: { tone?: 'son' | 'ngoc' | 'kim' | 'lam' | 'xam'; children: ReactNode }) {
  return (
    <span className="u2-badge" data-tone={tone}>
      {children}
    </span>
  );
}

/** Thanh vát chéo: hp (son) | mp (ngọc) | xp (kim) | boss. `text` là chữ giữa thanh (đã định dạng ở nơi gọi). */
export function Bar({
  kind = 'hp',
  value,
  max,
  text,
  label,
}: {
  kind?: 'hp' | 'mp' | 'xp' | 'boss';
  value: number;
  max: number;
  text?: ReactNode;
  label?: string;
}) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className="u2-bar"
      data-kind={kind}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <div className="u2-bar__fill" style={{ '--p': p } as CSSProperties} />
      {text !== undefined && <div className="u2-bar__text">{text}</div>}
    </div>
  );
}
