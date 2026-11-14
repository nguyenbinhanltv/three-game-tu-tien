/**
 * Bồi âm chuông đồ rơi (M4-6), tách khỏi audio.ts để test được không cần Web Audio.
 */

export interface BellPartial {
  freq: number;
  gain: number;
  dur: number;
  delay: number;
}

/** Tỉ lệ bồi âm của chuông đồng (không hài hòa: hum, prime, tierce, quint, nominal, ...). */
const BELL_RATIOS = [0.5, 1, 1.19, 1.5, 2, 2.52, 2.66, 3.01];

/**
 * Chuông đồ rơi (M4-6) theo bậc phẩm chất 0..2: bậc cao chuông trầm hơn, nhiều bồi âm hơn, ngân lâu
 * hơn, và có thêm tiếng chuông nhỏ ngũ cung nối theo. Bồi âm cao tắt nhanh hơn bồi âm thấp như chuông thật.
 */
export function bellPartials(tier: 0 | 1 | 2): BellPartial[] {
  const strikes: { f: number; n: number; dur: number; vol: number; delay: number }[] =
    tier === 0
      ? [{ f: 1568, n: 4, dur: 0.6, vol: 0.2, delay: 0 }]
      : tier === 1
        ? [
            { f: 1047, n: 6, dur: 1.1, vol: 0.24, delay: 0 },
            { f: 1568, n: 3, dur: 0.6, vol: 0.12, delay: 0.09 },
          ]
        : [
            { f: 659, n: 8, dur: 2.0, vol: 0.28, delay: 0 },
            { f: 1319, n: 4, dur: 1.0, vol: 0.13, delay: 0.12 },
            { f: 1976, n: 3, dur: 0.8, vol: 0.1, delay: 0.24 },
          ];
  const out: BellPartial[] = [];
  for (const s of strikes) {
    for (let i = 0; i < s.n; i++) {
      const r = BELL_RATIOS[i];
      out.push({ freq: s.f * r, gain: s.vol / (1 + i * 0.6), dur: s.dur / (0.6 + r * 0.4), delay: s.delay });
    }
  }
  return out;
}

