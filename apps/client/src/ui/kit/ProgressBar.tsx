import { useEffect, useRef } from 'react';
import { HpTrail } from '../../game/entities/hpTrail';

/**
 * Đoạn trễ của thanh: chạy bằng requestAnimationFrame và ghi thẳng `style.width`, không re-render React
 * mỗi khung. Vòng lặp chỉ chạy khi đoạn trễ còn nằm trên máu. Đổi mục tiêu thì component được mount lại
 * (`key`) nên đoạn trễ bắt đầu từ máu hiện tại.
 */
function useTrail(frac: number) {
  const el = useRef<HTMLDivElement>(null);
  const trail = useRef<HpTrail | null>(null);
  if (!trail.current) trail.current = new HpTrail(frac);
  const target = useRef(frac);
  target.current = frac;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const v = trail.current!.update(target.current, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (el.current) el.current.style.width = v * 100 + '%';
      raf = v > target.current ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frac]);
  return { el, width: trail.current.value * 100 + '%' };
}

function ProgressTrail({ frac }: { frac: number }) {
  const { el, width } = useTrail(frac);
  return <div ref={el} className="gauge-trail" style={{ width }} />;
}

/**
 * Thanh đo dùng chung cho máu, linh lực, tu vi, tiến độ chế tác: đầu vát, viền đồng thau, gradient theo bảng
 * màu tâm trạng, mép sáng, vạch chia (`segs` đoạn), đoạn trễ màu nhạt (`trail`). Màu và kích cỡ theo `cls`
 * (`hp`, `hp ally`, `hp boss`, `mp`, `xp`, `tcast`…, định nghĩa ở mục `.gauge` trong styles.css). Có `label`
 * thì thành `role="progressbar"` cho trình đọc màn hình.
 */
export function ProgressBar({
  cls,
  value,
  max,
  text,
  segs = 0,
  trail = false,
  label,
}: {
  cls: string;
  value: number;
  max: number;
  text?: string;
  segs?: number;
  trail?: boolean;
  label?: string;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={'gauge ' + cls}
      style={segs ? ({ '--segs': segs } as React.CSSProperties) : undefined}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? max : undefined}
      aria-valuenow={label ? value : undefined}
    >
      <div className="gauge-in">
        {trail && <ProgressTrail frac={frac} />}
        <div className="gauge-fill" style={{ width: frac * 100 + '%' }} />
        {segs > 1 && <div className="gauge-ticks" />}
      </div>
      {text !== undefined && <div className="gauge-text">{text}</div>}
    </div>
  );
}
