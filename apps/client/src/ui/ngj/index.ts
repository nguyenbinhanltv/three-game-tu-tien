/**
 * Bộ giao diện "Ngọc Giản Kim Văn" (UI-1): token, chất liệu sơn mài / giấy ngà, góc hoa văn, bảng tên theo bản đồ,
 * nút, ô thoi/tròn/bát giác, thanh có đầu mút, tab dọc, chú giải, icon hệ thống nét vàng, chữ triện, giảm chuyển động.
 * Xem mọi thành phần ở `?ui=ngj`. HUD/bảng thật chuyển sang ở UI-2/UI-3.
 */
import './tokens.css';
import './ngj.css';
import './screens.css';

export {
  Corners,
  Cartouche,
  RingSweep,
  NgjButton,
  NgjPanel,
  NgjSlot,
  NgjTipCard,
  NgjTooltip,
  OrnateBar,
  OrnateCorner,
  type CornerKind,
  type MapMotif,
  type RailTab,
  type SlotShape,
  TabRail,
} from './ngj';
export { isSysIcon, SealNumeral, SYS_ICON_NAMES, SysIcon, type SysIconName } from './icons';
export { installMotion, setReduceMotion, useReduceMotion } from './motion';
export { MethodCarousel } from './MethodCarousel';
