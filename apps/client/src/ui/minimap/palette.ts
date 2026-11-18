/* eslint-disable no-restricted-syntax -- giá trị dự phòng khi chưa đọc được token (môi trường test); nguồn thật là ui/u2/tokens.css */
// Màu cho canvas minimap lấy từ token `--u-*` (nguồn duy nhất ở ui/u2/tokens.css), đọc một lần khi cần; có giá trị dự phòng
// cho môi trường test (không có CSS).
const FALLBACK = {
  ink0: '#0b0908',
  ink1: '#15110e',
  ink2: '#211a15',
  gold: '#e2b955',
  goldHi: '#fff0b8',
  goldLo: '#8a6a2a',
  ngoc: '#2f8f7f',
  ngocHi: '#6fd6c1',
  ngocLo: '#17493f',
  son: '#b3261e',
  sonHi: '#e8553f',
  chu: '#efe6d0',
  giay: '#efe6d0',
  giayLo: '#d8cba8',
  head: 'serif',
} as const;
const VAR: Record<keyof typeof FALLBACK, string> = {
  ink0: '--u-ink-0',
  ink1: '--u-ink-1',
  ink2: '--u-ink-2',
  gold: '--u-gold',
  goldHi: '--u-gold-hi',
  goldLo: '--u-gold-lo',
  ngoc: '--u-ngoc',
  ngocHi: '--u-ngoc-hi',
  ngocLo: '--u-ngoc-lo',
  son: '--u-son',
  sonHi: '--u-son-hi',
  chu: '--u-chu',
  giay: '--u-giay',
  giayLo: '--u-giay-lo',
  head: '--u-font-head',
};
type Pal = Record<keyof typeof FALLBACK, string>;
let cache: Pal | null = null;

export function pal(): Pal {
  if (cache) return cache;
  const out: Pal = { ...FALLBACK };
  if (typeof document !== 'undefined') {
    const cs = getComputedStyle(document.documentElement);
    let got = 0;
    for (const k of Object.keys(VAR) as (keyof typeof FALLBACK)[]) {
      const v = cs.getPropertyValue(VAR[k]).trim();
      if (v) {
        out[k] = v;
        got++;
      }
    }
    // Token chưa nạp (CSS chưa xong): không nhớ, lần sau đọc lại.
    if (got < 4) return out;
  }
  cache = out;
  return out;
}
