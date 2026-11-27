import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import './styles2.css';
import { installUiScale } from './ui/uiScale';
import { installTouchMode } from './input/touchMode';
import { urlParams } from './base/flags';
import { installMotion } from './ui/u2/shell/motion';
import { startHires } from './game/hires';

const root = document.getElementById('root')!;

const q = urlParams();
if (q.get('paintedlab') === '1') {
  // Cảnh thử đối chiếu Họa Cảnh với painted-valley (render/painted/lab); nạp động, không vào bundle game.
  document.getElementById('boot')?.remove();
  void import('./render/painted/lab/page').then((m) => m.startPaintedLab(root));
} else if (q.get('paintedlab') === 'far') {
  // Bản đồ độ cao vùng xa (P3a): xem render/painted/lab/farLab.ts
  document.getElementById('boot')?.remove();
  void import('./render/painted/lab/farLab').then((m) => m.startFarLab(root));
} else if (q.get('viewer') === 'asset' || q.has('show')) {
  // Trang xem asset: nạp động để code viewer không vào bundle game chính. Không cần màn tiêu đề.
  // `?show=char` (M1-10) là alias: mở model người chơi (`?show=<id asset>` cho asset khác trong manifest).
  document.getElementById('boot')?.remove();
  void import('./viewer').then((m) => m.mountViewer(root));
} else if (q.get('ui') === 'kit') {
  // Trang xem UI Kit 2.0 "Mặc Kim Giản" (U2-1), nạp động như các trang xem khác.
  document.getElementById('boot')?.remove();
  void import('./ui/u2/mount').then((m) => m.mountU2Kit(root));
} else {
  const stage = document.createElement('div');
  stage.id = 'stage';
  document.body.prepend(stage);

  installTouchMode();
  installUiScale();
  installMotion();
  createRoot(root).render(<App />);
  startHires();
}

// Diễn Võ Trường V3 (chỉ bản dev): nạp lại dữ liệu tức thì + chế độ chỉnh phòng (F4). Bản build bỏ hẳn nhánh này.
if (import.meta.env.DEV) void import('./game/editor/boot').then((m) => m.bootLabEditor());
