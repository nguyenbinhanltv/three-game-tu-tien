import { FX_QUALITY_TIER, type FxQuality } from '@dtl/shared';
import { FLAGS } from '../../base/flags';
import {
  DEFAULT_AURA_COMBAT,
  DEFAULT_AURA_MODE,
  DEFAULT_AURA_OTHERS,
  isAuraCombat,
  isAuraMode,
  isAuraOthers,
  type AuraCombat,
  type AuraMode,
  type AuraOthers,
} from './realmAuraRules';

/**
 * Cài đặt hiệu ứng chiêu (VFX-V0): "Chất lượng hiệu ứng" Thấp/Vừa/Cao và công tắc khựng hình.
 * Lưu localStorage; `?fxq=low|medium|high` ghi đè cho lần nạp đó (công cụ chụp, bench).
 */
const KEY = 'dtl.fxQuality';
const KEY_STOP = 'dtl.hitStop';
const KEY_IMPACT = 'dtl.impactFrame';
const KEY_STATIC = 'dtl.fxStatic';
const KEY_AURA = 'dtl.realmAura';
const KEY_AURA_MODE = 'dtl.auraMode';
const KEY_AURA_OTHERS = 'dtl.auraOthers';
const KEY_AURA_COMBAT = 'dtl.auraCombat';

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

const lsGet = (k: string): string | null => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k));
const lsSet = (k: string, v: string): void => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
};

/** Hào quang cảnh giới (VS-0): Tắt/Tối giản/Chuẩn/Đầy đủ. Khóa cũ `dtl.realmAura=0` (từ bản chỉ bật/tắt) vẫn nghĩa là Tắt; `?aura=0` ép Tắt. */
function readAuraMode(): AuraMode {
  if (!FLAGS.aura) return 'off';
  const m = lsGet(KEY_AURA_MODE);
  if (isAuraMode(m)) return m;
  return lsGet(KEY_AURA) === '0' ? 'off' : DEFAULT_AURA_MODE;
}
const readOthers = (): AuraOthers => {
  const v = lsGet(KEY_AURA_OTHERS);
  return isAuraOthers(v) ? v : DEFAULT_AURA_OTHERS;
};
const readCombat = (): AuraCombat => {
  const v = lsGet(KEY_AURA_COMBAT);
  return isAuraCombat(v) ? v : DEFAULT_AURA_COMBAT;
};

let auraMode: AuraMode = readAuraMode();
let auraOthers: AuraOthers = readOthers();
let auraCombat: AuraCombat = readCombat();

export const fxQuality = (): FxQuality => quality;
export const auraModeOf = (): AuraMode => auraMode;
export const auraOthersOf = (): AuraOthers => auraOthers;
export const auraCombatOf = (): AuraCombat => auraCombat;
/** Hào quang cảnh giới trên nhân vật có bật không (mọi chế độ trừ Tắt). */
export const realmAuraOn = (): boolean => auraMode !== 'off';
export function setAuraMode(m: AuraMode): void {
  auraMode = m;
  lsSet(KEY_AURA_MODE, m);
}
export function setAuraOthers(m: AuraOthers): void {
  auraOthers = m;
  lsSet(KEY_AURA_OTHERS, m);
}
export function setAuraCombat(m: AuraCombat): void {
  auraCombat = m;
  lsSet(KEY_AURA_COMBAT, m);
}
export function setFxQuality(q: FxQuality): void {
  quality = q;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, q);
}
export const hitStopOn = (): boolean => hitStop;
export function setHitStopOn(on: boolean): void {
  hitStop = on;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_STOP, on ? '1' : '0');
}

let impactFrame = typeof localStorage === 'undefined' || localStorage.getItem(KEY_IMPACT) !== '0';
/** Khung va chạm (V-P0): 1–2 khung tương phản cao lúc trúng đòn; người nhạy sáng có thể tắt. */
export const impactFrameOn = (): boolean => impactFrame;
export function setImpactFrameOn(on: boolean): void {
  impactFrame = on;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_IMPACT, on ? '1' : '0');
}

let fxStatic = typeof localStorage !== 'undefined' && localStorage.getItem(KEY_STATIC) === '1';
/** Chế độ tĩnh (V-P0): người không thích rối mắt. Không khung va chạm/chớp, hiệu ứng người khác giảm mạnh hơn (xem `fxHierarchy`). */
export const staticFxOn = (): boolean => fxStatic;
export function setStaticFxOn(on: boolean): void {
  fxStatic = on;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY_STATIC, on ? '1' : '0');
}

/** Hệ số số hạt theo chất lượng, người khác giảm một nửa. */
export function particleScale(q: FxQuality, mine: boolean): number {
  const base = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;
  return mine ? base : base * 0.5;
}

/** Trần số hạt mỗi chiêu (cùng ngân sách `content:check`): mật độ theo preset không được vượt qua mức này tính trên cả chiêu. */
export const CAST_PARTICLE_CAP = 1500;

/**
 * Số hạt một sự kiện: `n` gốc × hệ số chất lượng hiệu ứng × mật độ preset đồ họa (chỉ chiêu của mình, chỉ khi hiệu ứng = Cao),
 * bị chặn để tổng cả chiêu (`emitted` đã phát) không quá `CAST_PARTICLE_CAP`. Tối thiểu 1.
 */
export function emitCount(n: number, q: FxQuality, mine: boolean, density: number, emitted: number): number {
  const dens = q === 'high' && mine ? density : 1;
  const want = Math.max(1, Math.round(n * particleScale(q, mine) * dens));
  return Math.max(1, Math.min(want, CAST_PARTICLE_CAP - emitted));
}
