// Hóa Thần sơ kỳ (cấp 28), E4-K: phân thân thần niệm (phím G), lĩnh vực (nhỏ từ Nguyên Anh trung kỳ, lớn từ Hóa Thần), ô chiêu 10.
// Hàm thuần và hằng số dùng chung client (hiển thị) và server (tính thật). Client chỉ gửi ý định (`CloneCmd`).
import { HOA_THAN_LEVEL } from './formulas';

// --- Phân thân thần niệm ---
export const CLONE_UNLOCK_LEVEL = HOA_THAN_LEVEL;
/** Phân thân sống bao lâu (ms). */
export const CLONE_LIFE_MS = 20_000;
/** Hồi chiêu tính từ lúc tạo (ms), theo nhân vật, giữ qua đổi room. */
export const CLONE_CD_MS = 90_000;
/** Linh lực tốn khi tạo. */
export const CLONE_MP = 60;
/** Phân thân chỉ ra chiêu lên mục tiêu trong tầm này quanh nó (m). */
export const CLONE_REACH = 24;
/** Chủ đi xa hơn chừng này thì phân thân bước theo (m); đứng cách chủ `CLONE_FOLLOW_GAP`. */
export const CLONE_FOLLOW_DIST = 14;
export const CLONE_FOLLOW_GAP = 4;
export const CLONE_SPEED = 7;
/** Sát thương chiêu lặp lại so với chủ (50%) và chiêu cuối khi tan (gấp đôi một nhịp). */
export const CLONE_POWER_MUL = 0.5;
export const CLONE_FINALE_MUL = 1;
/** Khí huyết phân thân so với chủ (chỉ bị trừ khi gánh đòn thay chủ: hộ pháp). */
export const CLONE_HP_FRAC = 0.5;
/** Nhịp server cập nhật phân thân (ms) và khoảng tối thiểu giữa hai lệnh G (ms). */
export const CLONE_TICK_MS = 250;
export const CLONE_CMD_GAP_MS = 500;

export type CloneMoveKind = 'echo' | 'taunt' | 'heal' | 'finale';
/** Một chiêu của phân thân (dữ liệu ở `packages/content/data/clones.json`, theo công pháp). */
export interface CloneMoveDef {
  id: string;
  kind: CloneMoveKind;
  /** Nhịp lặp (giây); `finale` không dùng. */
  cd?: number;
  /** Bán kính tác dụng quanh phân thân (m). */
  r?: number;
  /** `echo`/`finale`: hệ số sát thương so với chiêu của chủ. */
  mul?: number;
  /** `taunt`: phần sát thương quái trong vùng đánh chủ mà phân thân gánh (0..1). */
  share?: number;
  /** `taunt`: thời gian khiêu khích mỗi nhịp (giây). */
  sec?: number;
  /** `heal`: phần khí huyết tối đa của mỗi đồng đội hồi mỗi nhịp. */
  pct?: number;
}
export interface CloneMethodDef {
  moves: CloneMoveDef[];
}

export function cloneUnlocked(level: number): boolean {
  return level >= CLONE_UNLOCK_LEVEL;
}

/** Điểm đặt phân thân: ngay trước mặt chủ (server không nhận điểm do client chọn). */
export function clonePlace(owner: { x: number; z: number; yaw: number }): { x: number; z: number } {
  return { x: owner.x + Math.sin(owner.yaw) * CLONE_FOLLOW_GAP, z: owner.z + Math.cos(owner.yaw) * CLONE_FOLLOW_GAP };
}

/** Client → server: tạo/thu phân thân (không tham số; vị trí do server chọn). */
export type CloneCmd = Record<string, never>;

/** Server → client: trạng thái phân thân của mình. */
export interface CloneStateMsg {
  open: boolean;
  /** Còn bao nhiêu ms nữa phân thân tan (0 = không có). */
  left: number;
  /** Còn bao nhiêu ms nữa tạo lại được. */
  cd: number;
}

// --- Lĩnh vực ---
/** Bán kính lĩnh vực theo cấp: 0 trước Nguyên Anh trung kỳ (25); 8 m (25), 10 m (26–27), 20 m (Hóa Thần sơ kỳ 28). */
export function domainRadius(level: number): number {
  if (level >= CLONE_UNLOCK_LEVEL) return 20;
  if (level >= 26) return 10;
  if (level >= 25) return 8;
  return 0;
}

/** Lĩnh vực lớn (Hóa Thần) mạnh gấp rưỡi lĩnh vực nhỏ. */
export function domainScale(level: number): number {
  return level >= CLONE_UNLOCK_LEVEL ? 1.5 : 1;
}

/** Hiệu ứng thụ động (lĩnh vực nhỏ) theo vai trò công pháp; nhân `domainScale` ở lĩnh vực lớn. */
export const DOMAIN_EFFECT = {
  /** Kiếm tu: bạo kích cộng thêm. */
  dps: { crit: 0.06 },
  /** Hộ pháp: đồng đội (gồm chủ) trong vùng giảm sát thương nhận. */
  tank: { reduce: 0.06 },
  /** Đan sư: đồng đội trong vùng hồi khí huyết mỗi giây (tỉ lệ khí huyết tối đa; đã gồm +10% hồi phục quy đổi). */
  support: { regen: 0.004 },
} as const;
/** Nhịp lĩnh vực hồi máu (ms). */
export const DOMAIN_TICK_MS = 1000;
