// Xem trước 3D nhân vật xoay được bằng cách kéo chuột (Chân Cảnh U10): vẽ bằng `CharPreview` của game (cùng đường dựng nhân vật).
// Dùng ở Tủ ngoại trang (bản nháp) và bảng Nhân vật (đang mặc). Chỉ một khung xem trước tồn tại cùng lúc: `openPanel` (ui/store.ts) đóng cửa sổ kia khi mở `char` hoặc `wardrobe`.
import { type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react';
import { t } from '@dtl/content';
import { Game } from '../game/engine';
import type { PlayerLook } from '../game/character/playerSkins';
import './wardrobe/wardrobe.css';

export function CharPreview3D({
  look,
  deps,
  testId = 'char-preview',
}: {
  look: () => PlayerLook;
  deps: readonly unknown[];
  testId?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const g = Game.current;
    const cv = canvas.current;
    if (!g || !cv) return;
    const pv = g.preview;
    pv.onFail = () => setFailed(true);
    pv.attach(cv);
    return () => {
      pv.onFail = null;
      pv.detach();
      g.ents.setPreviewLook(null);
    };
  }, []);

  useEffect(() => {
    const g = Game.current;
    if (g) g.ents.setPreviewLook(look());
    // `look` là hàm tạo mới mỗi lần vẽ; chỉ dựng lại khi `deps` đổi.
  }, deps);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    Game.current?.preview.rotate(e.clientX - drag.current);
    drag.current = e.clientX;
  };
  const up = () => void (drag.current = null);
  return (
    <div className="wd-pv">
      <div
        className="wd-pv-stage"
        data-testid={testId}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label={t('ui.wardrobe.preview')}
      >
        {failed ? <div className="k-dim">{t('ui.wardrobe.preview_off')}</div> : <canvas ref={canvas} />}
      </div>
      <div className="k-dim wd-pv-hint">{t('ui.wardrobe.drag')}</div>
    </div>
  );
}
