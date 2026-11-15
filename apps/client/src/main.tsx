import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

const root = document.getElementById('root')!;

const q = new URLSearchParams(location.search);
if (q.get('viewer') === 'asset' || q.has('show')) {
  // Trang xem asset: nạp động để code viewer không vào bundle game chính. Không cần màn tiêu đề.
  // `?show=char` (M1-10) là alias: mở model người chơi (`?show=<id asset>` cho asset khác trong manifest).
  document.getElementById('boot')?.remove();
  void import('./viewer').then((m) => m.mountViewer(root));
} else {
  const stage = document.createElement('div');
  stage.id = 'stage';
  document.body.prepend(stage);

  createRoot(root).render(<App />);
}
