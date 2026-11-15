/**
 * Bộ khung UI chung (P2-C1). Mọi bảng mới import từ đây; xem trang mẫu `?viewer=ui`.
 * Khung vẽ bằng CSS (viền vát, đồng thau), màu theo assets/palette.json qua biến `--k-*` trong tokens.css.
 */
import './tokens.css';
import './kit.css';

export { Button, type ButtonVariant, Segmented, Slider, type TabItem, Tabs } from './Controls';
export { Modal } from './Modal';
export { Divider, Header, Panel, PanelBody, type PanelTone, PanelWindow } from './Panel';
export { ProgressBar } from './ProgressBar';
export { type Rarity, Slot } from './Slot';
export { TipCard, Tooltip } from './Tooltip';
