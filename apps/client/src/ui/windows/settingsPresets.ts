// Preset đồ họa (Chân Cảnh U11): một lần bấm đặt cùng lúc chất lượng đồ họa, chất lượng hiệu ứng, khung ngưng đòn và viền nhân vật.
// Hàm thuần; Settings gọi các hàm đặt của Game theo từng trường.
export type PresetId = 'saver' | 'balanced' | 'beauty' | 'ultra';

export interface PresetValues {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  fxQuality: 'low' | 'medium' | 'high';
  impactFrame: boolean;
  heroRim: boolean;
}

export const PRESET_IDS: readonly PresetId[] = ['saver', 'balanced', 'beauty', 'ultra'];

export const PRESETS: Record<PresetId, PresetValues> = {
  saver: { quality: 'low', fxQuality: 'low', impactFrame: false, heroRim: false },
  balanced: { quality: 'medium', fxQuality: 'medium', impactFrame: true, heroRim: true },
  beauty: { quality: 'high', fxQuality: 'high', impactFrame: true, heroRim: true },
  ultra: { quality: 'ultra', fxQuality: 'high', impactFrame: true, heroRim: true },
};

/** Preset khớp đúng các giá trị đang đặt, hoặc null khi người chơi đã tinh chỉnh riêng. */
export function presetOf(cur: Omit<PresetValues, 'quality'> & { quality: string }): PresetId | null {
  return PRESET_IDS.find((id) => (Object.keys(PRESETS[id]) as (keyof PresetValues)[]).every((k) => PRESETS[id][k] === cur[k])) ?? null;
}
