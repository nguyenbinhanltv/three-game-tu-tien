import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

const stage = document.createElement('div');
stage.id = 'stage';
document.body.prepend(stage);

createRoot(document.getElementById('root')!).render(<App />);
