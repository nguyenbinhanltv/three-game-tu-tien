import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Game } from '../../game/engine';
import { PREVIEW_H, PREVIEW_W } from '../../game/camera/charPreview';

/**
 * Xem trước nhân vật 3D (TD-C): canvas 2D nhận điểm ảnh từ render target của engine; chỉ vẽ khi bảng mở (gắn lúc mount,
 * gỡ lúc unmount nên model và render target được giải phóng). Kéo chuột ngang để xoay. Không dựng được hoặc vượt
 * ngân sách thì hiện `fallback` (hình bóng 2D).
 */
export function Preview3D({ fallback }: { fallback: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const g = Game.current;
    const canvas = ref.current;
    if (failed || !g || !canvas || !g.renderer) {
      if (!failed) setFailed(true);
      return;
    }
    const p = g.preview;
    p.onFail = () => setFailed(true);
    p.attach(canvas);
    return () => {
      p.onFail = null;
      p.detach();
    };
  }, [failed]);

  const drag = useRef<number | null>(null);
  if (failed) return <>{fallback}</>;
  return (
    <canvas
      ref={ref}
      className="char-preview"
      width={PREVIEW_W}
      height={PREVIEW_H}
      data-testid="char-preview"
      aria-hidden="true"
      onPointerDown={(e) => {
        drag.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        Game.current?.preview.rotate(e.clientX - drag.current);
        drag.current = e.clientX;
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
}
