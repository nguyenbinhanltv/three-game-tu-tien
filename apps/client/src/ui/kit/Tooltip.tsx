import { createPortal } from 'react-dom';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { uiScale } from '../uiScale';

const GAP = 8;
const MARGIN = 8;

/**
 * Chú giải: hiện sau 250 ms khi rê chuột, ngay khi focus bàn phím, ẩn khi rời hoặc nhấn Esc. Vẽ `position: fixed` qua portal
 * ra `document.body` (bảng có `filter` và `clip-path` nên tip không thể nằm trong); ưu tiên phía trên, tự lật xuống khi hết chỗ và ép vào trong màn hình.
 */
export function Tooltip({ content, children, tipClass }: { content: ReactNode; children: ReactNode; tipClass?: string }) {
  const id = useId();
  const host = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open || !host.current || !tip.current) return;
    const a = host.current.getBoundingClientRect();
    const b = tip.current.getBoundingClientRect();
    let y = a.top - b.height - GAP;
    if (y < MARGIN) y = a.bottom + GAP;
    // Hết chỗ cả hai phía (chú giải dài): ép vào trong màn hình, chấp nhận che nhẹ ô gốc thay vì tràn mép dưới.
    y = Math.max(MARGIN, Math.min(y, window.innerHeight - b.height - MARGIN));
    const x = Math.min(Math.max(MARGIN, a.left + a.width / 2 - b.width / 2), window.innerWidth - b.width - MARGIN);
    // Tip được phóng bằng `zoom: var(--ui-scale)`: left/top của chính nó cũng bị nhân, nên chia lại để ra đúng px màn hình.
    const s = uiScale();
    setPos({ x: x / s, y: y / s });
  }, [open, content]);

  return (
    <span
      ref={host}
      className="k-tip-host"
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(250)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          // Esc đóng chú giải trước, không để rơi xuống đóng cả bảng hoặc thả chuột của game.
          e.stopPropagation();
          hide();
        }
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className={'k-tip' + (tipClass ? ' ' + tipClass : '')}
            data-show={pos ? 'true' : 'false'}
            style={{ left: pos?.x ?? 0, top: pos?.y ?? 0 }}
          >
            <div className="k-tip-edge">
              <div className="k-tip-in">{content}</div>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Bố cục chuẩn cho nội dung chú giải: tên (tô màu theo phẩm), dòng phụ, các dòng chỉ số, mô tả. */
export function TipCard({
  title,
  rarity,
  sub,
  lines,
  desc,
}: {
  title: string;
  rarity?: number;
  sub?: string;
  lines?: { text: string; tone?: 'good' | 'bad' | 'dim' | 'set' }[];
  desc?: string;
}) {
  return (
    <div>
      <div className="k-tip-title" data-q={rarity}>
        {title}
      </div>
      {sub && <div className="k-tip-sub">{sub}</div>}
      {lines?.map((l, i) => (
        <div key={i} className={'k-tip-line' + (l.tone ? ' ' + l.tone : '')}>
          {l.text}
        </div>
      ))}
      {desc && <div className="k-tip-desc">{desc}</div>}
    </div>
  );
}
