import { FX_QUALITY_TIER, type FxQuality } from '@dtl/shared';
import { FLAGS } from '../../base/flags';

/**
 * Cài đặt hiệu ứng chiêu (VFX-V0): "Chất lượng hiệu ứng" Thấp/Vừa/Cao và công tắc khựng hình.
 * Lưu localStorage; `?fxq=low|medium|high` ghi đè cho lần nạp đó (công cụ chụp, bench).
 */
const KEY = 'dtl.fxQuality';
const KEY_STOP = 'dtl.hitStop';

const isQ = (v: unknown): v is FxQuality => typeof v === 'string' && v in FX_QUALITY_TIER;

function readQuality(): FxQuality {
  if (isQ(FLAGS.fxq)) return FLAGS.fxq;
  if (typeof localStorage !== 'undefined') {
    const q = localStorage.getItem(KEY);
    if (isQ(q)) return q;
  }
  return 'high';
}

let quality: FxQuality = readQuality();
let hitStop = typeof localStorage === 'undefined' || localStorage.getItem(KEY_STOP) !== '0';

export const fxQuality = (): FxQuality => quality;
export function setFxQuality(q: FxQuality): void {
  quality = q;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, q);
}
export const hitStopOn = (): boolean => hitStop;
export function setHitStopOn(on: boolean): void {
  hitStop = on;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_STOP, on ? '1' : '0');
}

/** Hệ số số hạt theo chất lượng, người khác giảm một nửa. */
export function particleScale(q: FxQuality, mine: boolean): number {
  const base = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;
  return mine ? base : base * 0.5;
}
