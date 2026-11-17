import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import { installUiScale } from './ui/uiScale';
import { installMotion } from './ui/ngj/motion';

const root = document.getElementById('root')!;

const q = new URLSearchParams(location.search);
if (q.get('viewer') === 'asset' || q.has('show')) {
  // Trang xem asset: nạp động để code viewer không vào bundle game chính. Không cần màn tiêu đề.
  // `?show=char` (M1-10) là alias: mở model người chơi (`?show=<id asset>` cho asset khác trong manifest).
  document.getElementById('boot')?.remove();
  void import('./viewer').then((m) => m.mountViewer(root));
} else if (q.get('ui') === 'kit') {
  // Trang xem bộ giao diện Ngọc Giản Kim Văn (UI-1), nạp động như các trang xem khác.
  document.getElementById('boot')?.remove();
  void import('./ui/ngj/mount').then((m) => m.mountNgjKit(root));
} else if (q.get('viewer') === 'ui') {
  // Trang xem thử bộ khung UI (P2-C1), nạp động như viewer asset.
  document.getElementById('boot')?.remove();
  void import('./ui/kit/viewer').then((m) => m.mountKitViewer(root));
} else {
  const stage = document.createElement('div');
  stage.id = 'stage';
  document.body.prepend(stage);

  installUiScale();
  installMotion();
  createRoot(root).render(<App />);
}
