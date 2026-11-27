// Bảng Chỉnh phòng dạng nổi (F4), cho tới khi tab Diễn Võ của bảng F3 nhúng `RoomEditPanel`. Chỉ nạp ở bản dev (từ `game/editor/boot.ts`).
import { createRoot, type Root } from 'react-dom/client';
import { t } from '@dtl/content';
import { RoomEditPanel } from './RoomEditPanel';
import './lab-editor.css';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function toggleRoomEditPanel(): void {
  if (host) {
    root?.unmount();
    host.remove();
    host = null;
    root = null;
    return;
  }
  host = document.createElement('div');
  host.className = 'debug-panel lab-edit-float';
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(
    <>
      <div className="lab-edit-title">{t('ui.gm.lab.edit.title')}</div>
      <RoomEditPanel />
    </>,
  );
}
