import { type ButtonHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode, useRef } from 'react';

/**
 * Sau khi bấm chuột, bỏ focus khỏi nút để mũi tên tiếp theo tới game (xoay camera) thay vì đổi lựa chọn.
 * Bàn phím (Enter/Space, `detail` = 0) giữ focus.
 */
function blurOnPointer(e: MouseEvent<HTMLButtonElement>): void {
  if (e.detail > 0) e.currentTarget.blur();
}

/** Phím mũi tên / Home / End trong tablist, radiogroup: chuyển focus, không để game nhận phím. */
function rovingKey(e: KeyboardEvent, count: number, index: number, go: (i: number) => void): void {
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  if (next < 0) return;
  e.preventDefault();
  e.stopPropagation();
  go(next);
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Nút vát. `pressed` dùng cho nút bật/tắt hoặc lựa chọn (aria-pressed). Trạng thái: hover, active,
 * focus bàn phím (viền ngọc), disabled.
 */
export function Button({
  variant = 'secondary',
  size = 'm',
  pressed,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 's' | 'm' | 'l';
  pressed?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={'k-btn' + (rest.className ? ' ' + rest.className : '')}
      data-variant={variant}
      data-size={size}
      data-pressed={pressed ? 'true' : undefined}
      aria-pressed={pressed}
    >
      <span className="k-btn-in">{children}</span>
    </button>
  );
}

/** Nhóm nút chọn một (radiogroup): mũi tên đổi lựa chọn, Tab chỉ dừng ở lựa chọn hiện tại. */
export function Segmented<T extends string | number | boolean>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="k-seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === cur ? 0 : -1}
          className="k-btn"
          data-variant="secondary"
          data-pressed={o.value === value ? 'true' : undefined}
          onClick={(e) => {
            onChange(o.value);
            blurOnPointer(e);
          }}
          onKeyDown={(e) =>
            rovingKey(e, options.length, i, (n) => {
              onChange(options[n].value);
              refs.current[n]?.focus();
            })
          }
        >
          <span className="k-btn-in">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export type TabItem = {
  id: string;
  label: string;
  disabled?: boolean;
  badge?: number | string;
};

/**
 * Thanh tab (tablist). Nội dung do nơi gọi chọn theo `value`. Mũi tên trái/phải, Home/End đổi tab
 * (kích hoạt ngay), Tab nhảy ra khỏi thanh.
 */
export function Tabs({ items, value, onChange, label }: { items: TabItem[]; value: string; onChange: (id: string) => void; label?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
  return (
    <div className="k-tabs" role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={it.id === value}
          tabIndex={it.id === value ? 0 : -1}
          disabled={it.disabled}
          className="k-tab"
          onClick={(e) => {
            onChange(it.id);
            blurOnPointer(e);
          }}
          onKeyDown={(e) =>
            rovingKey(e, enabled.length, Math.max(0, enabled.indexOf(i)), (n) => {
              const j = enabled[n];
              onChange(items[j].id);
              refs.current[j]?.focus();
            })
          }
        >
          {it.label}
          {it.badge !== undefined && <span className="k-tab-badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Thanh trượt gắn nhãn: nhãn bên trái, giá trị bên phải. Phần đã chạy tô đồng thau. */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  format,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit?: () => void;
  disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className="k-row">
      <span>{label}</span>
      <input
        className="k-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': pct + '%' } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="k-row-val">{format ? format(value) : value}</span>
    </label>
  );
}
