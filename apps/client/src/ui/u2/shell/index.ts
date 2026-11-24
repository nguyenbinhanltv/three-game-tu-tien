/**
 * Bộ giao diện "Ngọc Giản Kim Văn" (UI-1): token, chất liệu sơn mài / giấy ngà, góc hoa văn, bảng tên theo bản đồ,
 * nút, ô thoi/tròn/bát giác, thanh có đầu mút, tab dọc, chú giải, icon hệ thống nét vàng, chữ triện, giảm chuyển động.
 * Trang xem `?ui=ngj` đã gỡ ở U2-5b; kit mới xem ở `?ui=kit` (`ui/u2`).
 */
import './ornament.css';
import './screens.css';

export {
  Corners,
  Cartouche,
  RingSweep,
  NgjButton,
  NgjSlot,
  OrnateCorner,
  type CornerKind,
  type MapMotif,
  type SlotShape,
} from './ornament';
export { isSysIcon, SealNumeral, SysIcon, type SysIconName } from './icons';
export { installMotion, setReduceMotion, useReduceMotion } from './motion';
export { MethodCarousel } from './MethodCarousel';
