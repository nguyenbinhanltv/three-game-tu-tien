// Hào quang cảnh giới trên nhân vật (RFX-1): hàm thuần quyết định hiện gì, bao nhiêu, mờ bao nhiêu.
// Chỉ là lớp hình theo `lv` server đã đồng bộ (`PState.lv`) và công pháp `mt`; không đọc/ghi luật chơi.
import { pathOf } from '@dtl/content';
import {
  ANH_BIEN_LEVEL,
  COTHAN_METHOD,
  LOI_METHOD,
  HOA_THAN_LEVEL,
  KET_DAN_LEVEL,
  NGUYEN_ANH_LEVEL,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
} from '@dtl/shared';
import type { SkillDef } from '@dtl/shared';

/** 0 = chưa có; 1 Kết Đan; 2 Nguyên Anh; 3 Hóa Thần; 4 Ảnh Biến (đỉnh). Các bậc cộng dồn. */
export type AuraStage = 0 | 1 | 2 | 3 | 4;
/** Đạo của nhân vật (theo công pháp đang tu). */
export type AuraDao = 'kiem' | 'ho' | 'dan' | 'hon';

export function auraStage(lv: number): AuraStage {
  if (lv >= ANH_BIEN_LEVEL) return 4;
  if (lv >= HOA_THAN_LEVEL) return 3;
  if (lv >= NGUYEN_ANH_LEVEL) return 2;
  if (lv >= KET_DAN_LEVEL) return 1;
  return 0;
}

/** Đạo theo id công pháp `PState.mt`; chưa chọn thì Kiếm tu (nhân vật mặc định). */
export function daoOf(mt: string | undefined): AuraDao {
  // VS-3: tra hướng tu của công pháp (`paths.json` → `dao`), không còn regex trên id.
  return pathOf(mt)?.dao ?? 'kiem';
}

/**
 * Cổ Thần (TN-5): hào quang cảnh giới quá rối trên thân đã nặng giáp (nhiều dải màu, cầu sáng, phân thân), và tím phủ thân lúc hóa hình làm
 * nhân vật nhạt như bóng ma. Quy ước: người tu Cổ Thần chỉ giữ MỘT lớp nhẹ (mode tối đa `min`), và ẩn hẳn hào quang khi đang hóa hình
 * (cảnh biến hình do timeline `fx_co_hoa_hinh` lo, nhân vật giữ nguyên màu gốc đậm).
 */
export function cothanAura(mt: string | undefined, giant: number | undefined, mode: AuraMode): { mode: AuraMode; hidden: boolean } {
  // TN-9: lớp `main` luôn được vẽ ở mọi chế độ nên 'min' vẫn quấn dải tím/vàng quanh thân (rối, như lỗi Cổ Thần trước). Lôi tu bỏ hẳn hào quang
  // cảnh giới: hồ quang điện ở kiếm (`loiBlade.ts`) là dấu hiệu duy nhất, đọc rõ hơn và không phủ lên thân.
  if (mt === LOI_METHOD) return { mode: 'off', hidden: true };
  if (mt !== COTHAN_METHOD) return { mode, hidden: false };
  return { mode: mode === 'off' ? 'off' : 'min', hidden: (giant ?? 0) > 0.02 };
}

/** Số phi kiếm xếp vòng quanh lưng: đủ 9 thanh đều từ Nguyên Anh (hạ theo preset bằng `orbitScale`). */
export function swordCount(lv: number): number {
  return lv >= NGUYEN_ANH_LEVEL ? 9 : 0;
}

/** Bậc chất lượng hiệu ứng: 0 Thấp, 1 Vừa, 2 Cao. Lấy mức thấp hơn của preset đồ họa và "Chất lượng hiệu ứng". */
export function qualityTier(gfx: string, fx: string): 0 | 1 | 2 {
  const t = (q: string) => (q === 'low' ? 0 : q === 'medium' ? 1 : 2);
  return Math.min(t(gfx), t(fx)) as 0 | 1 | 2;
}

/** Cái gì được bật ở một bậc chất lượng, cho mình hay cho người khác. */
export interface AuraCaps {
  /** Hạt linh khí/đốm sáng (GPU, không tốn draw call). */
  particles: boolean;
  /** Hệ số số hạt (0–1). */
  particleScale: number;
  /** Hệ số số phi kiếm/cánh sen (0–1). */
  orbitScale: number;
  /** Có vẽ lớp dựng hình chính (kim đan, hào quang đạo, nhấc người) không. */
  main: boolean;
  /** Lớp chi tiết: vệt kiếm, vòng ngũ hành, mây sen, pháp tướng/phân thân, tia sét. */
  detail: boolean;
  /** Có cho phép bóng pháp tướng không. */
  phantom: boolean;
}

/**
 * Thấp: tắt cho người khác; của mình chỉ giữ lớp hình chính (không hạt, nửa số phi kiếm, không pháp tướng).
 * Vừa: người khác nửa số phi kiếm, không hạt; Cao: đủ (người khác nửa hạt).
 */
export function auraCaps(tier: 0 | 1 | 2, mine: boolean): AuraCaps {
  if (tier === 0) {
    return mine
      ? { particles: false, particleScale: 0, orbitScale: 0.55, main: true, detail: false, phantom: false }
      : { particles: false, particleScale: 0, orbitScale: 0, main: false, detail: false, phantom: false };
  }
  if (tier === 1) {
    return {
      particles: mine,
      particleScale: mine ? 0.6 : 0,
      orbitScale: mine ? 1 : 0.55,
      main: true,
      detail: mine,
      phantom: true,
    };
  }
  return { particles: true, particleScale: mine ? 1 : 0.5, orbitScale: 1, main: true, detail: true, phantom: true };
}

/** Giây sau lần ra chiêu mà coi là "chiến đấu nặng" (hào quang quanh người mờ bớt cho đỡ rối mắt). */
export const AURA_COMBAT_SEC = 2.5;

interface AuraState {
  fl: number;
  /** Giây kể từ lần ra chiêu gần nhất của người này. */
  sinceCast: number;
  speed: number;
}

/** Độ hiện (0–1) của vòng phi kiếm/hào quang đạo (Nguyên Anh): tắt hẳn khi ngự kiếm, mờ khi đang chiến đấu. */
export function haloVisibility(s: AuraState): number {
  if (s.fl & PF_DEAD) return 0;
  if (s.fl & PF_FLYING) return 0;
  if (s.sinceCast < AURA_COMBAT_SEC) return 0.3;
  return 1;
}

/** Người này đứng yên hoặc đả tọa: lúc đó hạt linh khí lắng quanh người và vầng sáng sau lưng hiện. */
export function isCalm(s: AuraState): boolean {
  if (s.fl & (PF_DEAD | PF_FLYING)) return false;
  return !!(s.fl & PF_MEDITATING) || s.speed < 0.5;
}

/** Kim đan và hạt chỉ chớp theo nhịp khi không ngự kiếm; vẫn sáng nhẹ khi chạy. */
export function danGlowVisibility(s: AuraState): number {
  if (s.fl & PF_DEAD) return 0;
  if (s.fl & PF_FLYING) return 0.4;
  return 1;
}

/** Nhịp kim đan: xung hình sin mũ cao ~1,1 Hz (0–1). */
export function danBeat(t: number): number {
  const s = Math.sin(t * Math.PI * 2 * 1.1) * 0.5 + 0.5;
  return Math.pow(s, 6);
}

/** Chiêu này triệu hồi bóng pháp tướng không: chiêu tối thượng hoặc chiêu mở khóa từ Hóa Thần (chiêu thứ 6 của công pháp). */
export function summonsPhantom(def: SkillDef | undefined, lv: number): boolean {
  if (!def || lv < HOA_THAN_LEVEL) return false;
  return !!def.ult || (def.unlock ?? 0) >= HOA_THAN_LEVEL;
}

/** Giai đoạn đời sống của bóng pháp tướng theo giây kể từ lúc bắt đầu (tổng ~1,3 s). */
export const PHANTOM_DUR = 1.3;
export function phantomPhase(t: number): { reveal: number; erode: number; alpha: number } {
  const rise = Math.min(1, t / 0.4);
  const reveal = rise * rise * (3 - 2 * rise) * 1.2;
  const erode = t < 0.85 ? 0 : Math.min(1.1, ((t - 0.85) / (PHANTOM_DUR - 0.85)) * 1.1);
  const alpha = Math.min(1, t / 0.15) * 0.78;
  return { reveal, erode, alpha };
}

// ---------------------------------------------------------------------------------------------------------------
// VS-0: thứ bậc thị giác. Mỗi lớp hào quang thuộc đúng một vai:
//   main  = nhận dạng cảnh giới (1 thứ; cảnh giới mới THAY lớp chính cũ, lớp cũ co vào thành nền), sáng nhất
//   sub   = lớp phụ (tối đa 1 vai, chỉ hiện khi đã đứng yên đủ lâu), ≤ 50% độ sáng
//   extra = lớp trang trí thêm, chỉ ở chế độ Đầy đủ, cùng trần độ sáng với sub
//   bg    = nền (hạt, lõi co lại, trận đồ chân), ≤ 20% độ sáng
//   event = pháp tướng: chỉ bùng ≤ PHANTOM_DUR giây khi ra chiêu tối thượng, không theo độ yên tĩnh
// Cảnh giới → lớp chính / phụ:
//   Kết Đan   : kim đan                       / xoáy ốc vàng
//   Nguyên Anh: vòng kiếm | cánh sen | trận đồ / Nguyên Anh nhỏ (thẻ) (Hộ pháp cũng thẻ)
//   Hóa Thần  : rim light + phù văn lưng       / vòng kiếm | cánh sen
//   Ảnh Biến  : rim light + tia sét tím-vàng   / phù văn lưng
// ---------------------------------------------------------------------------------------------------------------
export type AuraMode = 'off' | 'min' | 'std' | 'full';
export type AuraOthers = 'off' | 'party' | 'near';
export type AuraCombat = 'keep' | 'dim';
export type LayerRole = 'main' | 'sub' | 'extra' | 'bg' | 'event';

export const AURA_MODES: readonly AuraMode[] = ['off', 'min', 'std', 'full'];
export const AURA_OTHERS: readonly AuraOthers[] = ['off', 'party', 'near'];
export const AURA_COMBATS: readonly AuraCombat[] = ['keep', 'dim'];
export const DEFAULT_AURA_MODE: AuraMode = 'std';
export const DEFAULT_AURA_OTHERS: AuraOthers = 'near';
export const DEFAULT_AURA_COMBAT: AuraCombat = 'dim';

/** Giây đứng yên liên tục thì lớp phụ mới hiện (đả tọa hiện ngay). */
export const SETTLE_SEC = 3;
/** Người khác: quá khoảng này (m) chỉ còn lớp chính; quá khoảng tắt kể cả lớp chính (đồng đội giữ tới `OTHERS_FX_DIST`). */
export const OTHERS_MAIN_DIST = 15;
export const OTHERS_OFF_DIST = 30;
/** Số người khác cùng lúc được vẽ lớp phụ trong tầm nhìn. */
export const OTHERS_SUB_MAX = 2;
/** Độ sáng tối đa theo vai (nhân với độ sáng gốc của lớp). Chuẩn theo kế hoạch: chính 1, phụ ≤ 0,5, nền ≤ 0,2. */
export const W_SUB = 0.5;
export const W_BG = 0.2;
/** Đầy đủ nới trần cho lớp phụ/trang trí/nền. */
export const W_SUB_FULL = 0.85;
export const W_BG_FULL = 0.35;
/** Độ sáng lớp chính khi chạy hoặc đang giao chiến (30–50%) và ở chế độ Tối giản. */
export const W_MAIN_ACTIVE = 0.4;
export const W_MAIN_MIN = 0.6;
/** Ngân sách draw call mỗi người (đo bằng `pnpm shots realmaura --perf`). */
export const AURA_DRAW_BUDGET = { std: 25, full: 60 } as const;

export const isAuraMode = (v: unknown): v is AuraMode => AURA_MODES.includes(v as AuraMode);
export const isAuraOthers = (v: unknown): v is AuraOthers => AURA_OTHERS.includes(v as AuraOthers);
export const isAuraCombat = (v: unknown): v is AuraCombat => AURA_COMBATS.includes(v as AuraCombat);

/** Chế độ này có dựng lớp thuộc vai `role` không (lớp không được phép thì không tạo lưới, không tốn draw call). */
export function roleAllowed(role: LayerRole, mode: AuraMode): boolean {
  if (mode === 'off') return false;
  if (role === 'main') return true;
  if (mode === 'min') return false;
  if (role === 'extra') return mode === 'full';
  return true; // sub, bg, event ở Chuẩn và Đầy đủ
}

/** Mỗi lớp của một người được tới mức nào: chỉ lớp chính, hay cả phụ. */
export type AuraLevel = 'none' | 'main' | 'full';

/**
 * Hào quang của người KHÁC ở mức nào, theo cài đặt, khoảng cách tới camera (m) và có phải đồng đội không.
 * Đồng đội luôn giữ lớp chính (tới `maxDist`); `subOk` = người này nằm trong nhóm gần nhất được vẽ lớp phụ.
 */
export function otherAuraLevel(mode: AuraOthers, dist: number, party: boolean, subOk: boolean, maxDist: number): AuraLevel {
  if (mode === 'off') return 'none';
  if (party) return dist > maxDist ? 'none' : dist <= OTHERS_MAIN_DIST && subOk ? 'full' : 'main';
  if (mode === 'party') return 'none';
  if (dist > OTHERS_OFF_DIST) return 'none';
  return dist <= OTHERS_MAIN_DIST && subOk ? 'full' : 'main';
}

export interface AuraWeightIn {
  mode: AuraMode;
  combat: AuraCombat;
  /** Đang chạy/di chuyển (không yên). */
  moving: boolean;
  /** Đang giao chiến (vừa ra chiêu trong `AURA_COMBAT_SEC`). */
  fighting: boolean;
  /** 0–1: đã đứng yên đủ `SETTLE_SEC` (mượt dần). */
  settle: number;
}
export interface AuraWeights {
  main: number;
  sub: number;
  bg: number;
}

/** Độ sáng tối đa theo vai ở trạng thái hiện tại. Chạy/chiến: chỉ lớp chính 40%; yên 3 s: đủ phụ/nền. */
export function auraWeights(i: AuraWeightIn): AuraWeights {
  if (i.mode === 'off') return { main: 0, sub: 0, bg: 0 };
  const full = i.mode === 'full';
  let main = 1;
  if (i.fighting) main = i.combat === 'keep' ? 1 : W_MAIN_ACTIVE;
  else if (i.moving) main = W_MAIN_ACTIVE;
  if (i.mode === 'min') main = Math.min(main, W_MAIN_MIN);
  if (i.mode === 'min') return { main, sub: 0, bg: 0 };
  const s = Math.max(0, Math.min(1, i.settle));
  return { main, sub: s * (full ? W_SUB_FULL : W_SUB), bg: s * (full ? W_BG_FULL : W_BG) };
}

/** Đứng yên liên tục `still` giây (hoặc đang đả tọa) thì coi là "đã yên". */
export function settledTarget(still: number, meditating: boolean): 0 | 1 {
  return meditating || still >= SETTLE_SEC ? 1 : 0;
}

/**
 * Chỗ đặt pháp tướng: LỆCH khỏi trục camera → nhân vật (sang bên + hơi ra sau), không che nhân vật.
 * `dx,dz` = hướng từ camera tới nhân vật (chuẩn hóa), `sign` = ±1 (bên trái/phải, theo hạt giống từng người).
 */
export function phantomAnchor(dx: number, dz: number, sign: number): { x: number; z: number } {
  return { x: -dz * sign * 3.1 + dx * 1.4, z: dx * sign * 3.1 + dz * 1.4 };
}

/**
 * Độ hiện thật của một lớp: độ sáng gốc (kẹp 0–1) × trần theo vai, và luôn ≤ 1 (alpha > 1 làm hệ số hòa trộn thường âm, trừ cả nền).
 * Không có hệ số bù: trần theo vai là trần thật.
 */
export function effectiveOpacity(base: number, role: LayerRole, w: { wMain: number; wSub: number; wBg: number }): number {
  const wt = role === 'main' ? w.wMain : role === 'bg' ? w.wBg : role === 'event' ? 1 : w.wSub;
  return Math.max(0, Math.min(1, Math.max(0, Math.min(1, base)) * wt));
}
