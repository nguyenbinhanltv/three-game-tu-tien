// Hào quang cảnh giới trên nhân vật (RFX-1): hàm thuần quyết định hiện gì, bao nhiêu, mờ bao nhiêu.
// Chỉ là lớp hình theo `lv` server đã đồng bộ (`PState.lv`) và công pháp `mt`; không đọc/ghi luật chơi.
import { ANH_BIEN_LEVEL, HOA_THAN_LEVEL, KET_DAN_LEVEL, NGUYEN_ANH_LEVEL, PF_DEAD, PF_FLYING, PF_MEDITATING } from '@dtl/shared';
import type { SkillDef } from '@dtl/shared';

/** 0 = chưa có; 1 Kết Đan; 2 Nguyên Anh; 3 Hóa Thần; 4 Ảnh Biến (đỉnh). Các bậc cộng dồn. */
export type AuraStage = 0 | 1 | 2 | 3 | 4;
/** Đạo của nhân vật (theo công pháp đang tu). */
export type AuraDao = 'kiem' | 'ho' | 'dan';

export function auraStage(lv: number): AuraStage {
  if (lv >= ANH_BIEN_LEVEL) return 4;
  if (lv >= HOA_THAN_LEVEL) return 3;
  if (lv >= NGUYEN_ANH_LEVEL) return 2;
  if (lv >= KET_DAN_LEVEL) return 1;
  return 0;
}

/** Đạo theo id công pháp `PState.mt`; chưa chọn thì Kiếm tu (nhân vật mặc định). */
export function daoOf(mt: string | undefined): AuraDao {
  if (!mt) return 'kiem';
  if (/kim_than|ho_phap|hophap/.test(mt)) return 'ho';
  if (/dan_kinh|dan_su|dansu|moc_dan/.test(mt)) return 'dan';
  return 'kiem';
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

export interface AuraState {
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
