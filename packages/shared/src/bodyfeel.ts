import type { MonsterDef } from './types';

/**
 * Hạng thân (P2-E1/E2): chỉ để TRÌNH BÀY ở client (độ giật khi trúng đòn, tách thân khỏi nhau). Server không đọc,
 * không ảnh hưởng va chạm hay sát thương logic.
 */
export type BodyClass = 'small' | 'medium' | 'large' | 'boss';

/** Hạng theo `scale` trong monsters.json; boss luôn là `boss`. */
export function bodyClassOf(def: Pick<MonsterDef, 'scale' | 'boss'>): BodyClass {
  if (def.boss) return 'boss';
  if (def.scale >= 1.7) return 'large';
  if (def.scale >= 1.25) return 'medium';
  return 'small';
}

/** Tham số phản ứng trúng đòn theo hạng. Nhân vào hằng số gốc của `HitReact`. */
export interface HitFeel {
  /** Hệ số thời gian hit-stop. */
  stop: number;
  /** Hệ số giật lùi (đòn thường). */
  knock: number;
  /** Hệ số nhân thêm khi đòn nặng (cờ `hv`). */
  heavyKnock: number;
  /** Hệ số biên độ rung thân. */
  shake: number;
  /** Biên độ rung cộng thêm khi đòn nặng (trước hệ số `shake`). */
  heavyShake: number;
}

/**
 * Sói/cáo nhỏ bị đẩy và giật rõ; quái vừa ít hơn; quái lớn gần như đứng vững; boss gần như không lùi, chỉ rung thân và
 * chớp (khựng ngắn để boss không đứng hình khi nhiều người đánh). Đòn nặng luôn rõ hơn đòn thường trong mọi hạng.
 */
export const HIT_FEEL: Record<BodyClass, HitFeel> = {
  small: { stop: 1, knock: 1.35, heavyKnock: 1.7, shake: 1.2, heavyShake: 0.03 },
  medium: { stop: 1, knock: 0.8, heavyKnock: 1.7, shake: 1, heavyShake: 0.035 },
  large: { stop: 0.9, knock: 0.3, heavyKnock: 2.2, shake: 1.05, heavyShake: 0.045 },
  boss: { stop: 0.75, knock: 0.07, heavyKnock: 3.2, shake: 0.8, heavyShake: 0.06 },
};

/** Phản ứng của người chơi/NPC (thân người): như hạng vừa nhưng giật nhẹ hơn một chút. */
export const HIT_FEEL_HUMAN: HitFeel = { stop: 1, knock: 0.9, heavyKnock: 1.5, shake: 1, heavyShake: 0.03 };

/** Bán kính thân (m, scale 1) theo dáng model, để tách thân hiển thị. */
const BODY_BASE_RADIUS: Record<MonsterDef['model'], number> = {
  wolf: 0.42,
  boar: 0.5,
  fox: 0.34,
  ape: 0.5,
  serpent: 0.6,
};

/** Bán kính thân người chơi/NPC. */
export const PLAYER_BODY_RADIUS = 0.4;

/** Bán kính thân quái (m, đã tính scale). */
export function bodyRadiusOf(def: Pick<MonsterDef, 'model' | 'scale'>): number {
  return BODY_BASE_RADIUS[def.model] * def.scale;
}
