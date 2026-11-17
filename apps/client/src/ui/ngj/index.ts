/**
 * Bộ giao diện "Ngọc Giản Kim Văn" (UI-1): token, chất liệu sơn mài / giấy ngà, góc hoa văn, bảng tên theo bản đồ,
 * nút, ô thoi/tròn/bát giác, thanh có đầu mút, tab dọc, chú giải, icon hệ thống nét vàng, chữ triện, giảm chuyển động.
 * Xem mọi thành phần ở `?ui=kit`. HUD/bảng thật chuyển sang ở UI-2/UI-3.
 */
import './tokens.css';
import './ngj.css';

export { Corners, Cartouche, NgjButton, type NgjButtonVariant, NgjPanel, NgjSlot, NgjTipCard, NgjTooltip, OrnateBar, OrnateCorner, type CornerKind, type MapMotif, type Material, type RailTab, type SlotShape, TabRail } from './ngj';
export { isSysIcon, SealNumeral, sealGlyphs, SYS_ICON_NAMES, SysIcon, type SysIconName } from './icons';
export { installMotion, installNgjHud, ngjHud, reduceMotion, setReduceMotion, useReduceMotion } from './motion';
