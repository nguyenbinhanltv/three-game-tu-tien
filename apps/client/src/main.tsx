import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

const root = document.getElementById('root')!;

if (new URLSearchParams(location.search).get('viewer') === 'asset') {
  // Trang xem asset: nạp động để code viewer không vào bundle game chính. Không cần màn tiêu đề.
  document.getElementById('boot')?.remove();
  void import('./viewer').then((m) => m.mountViewer(root));
} else {
  const stage = document.createElement('div');
  stage.id = 'stage';
  document.body.prepend(stage);

  createRoot(root).render(<App />);
}
