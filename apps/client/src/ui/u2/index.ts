/**
 * UI Kit 2.0 "Mặc Kim Giản" (U2-1). Bảng mới import từ `../u2`; token ở `tokens.css`, xem mọi thành phần ở `?ui=kit`.
 * HUD/bảng thật chuyển sang kit này ở U2-2…U2-4; bộ cũ (`ui/kit`, `ui/ngj`) còn chạy song song đến U2-5.
 */
import './fonts.css';
import './tokens.css';
import './u2.css';

export { Panel, PanelTitle, CloseButton } from './Panel';
export { Button, Tabs, Badge, Bar, type TabDef } from './Controls';
export { Slot, IconFrame } from './Slot';
export { Tooltip, Dialog, Toasts, type ToastItem } from './Overlay';
export { SkillButton, InkBanner } from './Skill';
export { CornerCloud, CloudScroll, WaveLine, InkStroke, SonSeal, JadeRing, LockMark, CrossMark } from './patterns';
export { SysGlyph, isSysGlyph } from './SysGlyph';
export { SetMark, emblemOf } from './SetMark';
