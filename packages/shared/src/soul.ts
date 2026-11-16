// Cơ chế Nguyên Anh (E3-K), mở ở Nguyên Anh sơ kỳ (cấp 24): nguyên anh xuất khiếu, ngự không, thuấn di.
// Hàm thuần và hằng số dùng chung client (dự đoán, hiển thị) và server (tính thật). Client chỉ gửi ý định (`SoulCmd`, phím X).
import { NGUYEN_ANH_LEVEL } from './formulas';

/** Cấp tối thiểu của cả ba cơ chế. */
export const SOUL_UNLOCK_LEVEL = NGUYEN_ANH_LEVEL;

// --- Xuất khiếu khi tử vong ---
/** Nguyên anh thoát ra bao lâu (ms) trước khi tự hồi sinh ở nơi an toàn. */
export const SOUL_DEATH_MS = 10_000;
/** Lần cứu mạng kế tiếp sau bao lâu (ms), theo nhân vật, giữ qua đổi room. */
export const SOUL_DEATH_CD_MS = 10 * 60_000;
/** Khí huyết khi hồi sinh sau xuất khiếu (tỉ lệ khí huyết tối đa); không mất tu vi. */
export const SOUL_DEATH_HP = 0.3;

// --- Xuất khiếu chủ động (phím X) ---
/** Thời gian tối đa ở dạng nguyên anh (ms). */
export const SOUL_SCOUT_MS = 20_000;
/** Hồi chiêu tính từ lúc nhập lại thân xác (ms). */
export const SOUL_SCOUT_CD_MS = 30_000;
/** Bán kính tối đa quanh thân xác (m); ra xa hơn bị kéo lại. */
export const SOUL_RANGE = 60;
/** Nguyên anh bay cao tối đa so với mặt đất (m). */
export const SOUL_ALT = 30;
/** Vừa giao chiến trong chừng này (ms) thì không xuất khiếu chủ động được. */
export const SOUL_COMBAT_BLOCK_MS = 5000;
/** Khoảng tối thiểu giữa hai lệnh X (ms). */
export const SOUL_CMD_GAP_MS = 400;

// --- Ngự không ---
/** Ngự không (không cần kiếm): bay trong phạm vi này so với mặt đất, miễn linh lực. */
export const SKY_ALT = 30;
/** Ngự không chậm hơn ngự kiếm 15%. */
export const SKY_SPEED_MUL = 0.85;

// --- Thuấn di (thay Lướt cơ bản của cả ba công pháp) ---
export const BLINK_DIST = 12;
/** Hồi chiêu (giây). */
export const BLINK_CD = 14;

export function soulUnlocked(level: number): boolean {
  return level >= SOUL_UNLOCK_LEVEL;
}

/** Ngự không: Nguyên Anh trở lên. */
export function skyFlightUnlocked(level: number): boolean {
  return level >= SOUL_UNLOCK_LEVEL;
}

/** Đang bay trong tầm ngự không (không kiếm) so với mặt đất `ground`. */
export function inSkyBand(level: number, y: number, ground: number): boolean {
  return skyFlightUnlocked(level) && y - ground <= SKY_ALT + 0.5;
}

/** Lướt cơ bản có được thay bằng thuấn di không: đủ cấp và chiêu thuần di chuyển (không xuyên, không đẩy). */
export function blinkReplaces(level: number, dash: { pierce?: unknown; push?: unknown } | undefined): boolean {
  return level >= SOUL_UNLOCK_LEVEL && !!dash && !dash.pierce && !dash.push;
}

/** Trạng thái nguyên anh: 0 không, 1 thám thính (phím X), 2 vừa thoát ra khi tử vong. */
export type SoulKind = 0 | 1 | 2;
export const SOUL_NONE = 0;
export const SOUL_SCOUT = 1;
export const SOUL_DEATH = 2;

/** Client → server: nhập hoặc xuất khiếu. `on: true` xuất khiếu, `false` nhập lại; thiếu thì đảo trạng thái. */
export interface SoulCmd {
  on?: boolean;
}

/** Server → client: trạng thái nguyên anh của mình. Thân xác ở (bx,by,bz). `to` = nơi nguyên anh bay về khi tử vong. */
export interface SoulStateMsg {
  open: boolean;
  k: SoulKind;
  /** Còn bao nhiêu ms nữa hết dạng nguyên anh. */
  left: number;
  bx: number;
  by: number;
  bz: number;
  to?: { x: number; z: number };
  /** Hồi chiêu xuất khiếu chủ động còn lại (ms). */
  cd: number;
  /** Hồi chiêu cứu mạng còn lại (ms). */
  dcd: number;
}
