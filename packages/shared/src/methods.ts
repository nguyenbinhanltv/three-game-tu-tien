// Công pháp (Phase 3-5): công thức dùng chung client (hiển thị) và server (tính thật). Hàm thuần.
// Dữ liệu (công pháp, chiêu, biến thức) nằm ở packages/content/data/methods.json.

import type { ResourceDef } from './resource';
import type { SkillDef } from './types';

/** Cảnh giới (tầng) mở chọn công pháp chủ tu. */
export const METHOD_UNLOCK_LEVEL = 5;
export const MAX_SKILL_LEVEL = 5;
/** Biến thức A/B mở từ cấp chiêu này; cấp EMPOWER_LEVEL thì biến thức đã chọn mạnh thêm. */
export const VARIANT_MIN_LEVEL = 3;
export const EMPOWER_LEVEL = 5;
/** Hệ số nhân phần thưởng của biến thức khi chiêu đạt cấp 5. */
export const EMPOWER_MUL = 1.25;
/** Thanh chiêu: 6 chiêu chung + chiêu đặc trưng + chiêu tối thượng. */
export const BAR_SIZE = 8;
export const BAR_CORE = 6;
/** Vòng sạc chiêu tối thượng. */
export const CHARGE_MAX = 100;
/** Đổi công pháp ở Lạc Vân chân nhân: tốn linh thạch theo cảnh giới, chờ tối thiểu chừng này giây giữa hai lần. */
export const METHOD_SWITCH_COOLDOWN_SEC = 60;
export function methodSwitchCost(level: number): number {
  return 40 + level * 12;
}

export type MethodRole = 'dps' | 'tank' | 'support';
export type VariantId = 'a' | 'b';

/** Nội tại của công pháp: tham số theo `kind` (xem methods.json). */
export interface MethodPassive {
  kind: 'kiem_y' | 'the' | 'dan_kinh';
  /** Phòng ngự cộng thêm (Kim Thân). */
  defMul?: number;
  /** Hồi phục cộng thêm (Đan Kinh). */
  healMul?: number;
  /** Kiếm tu: bạo kích gốc cộng thêm; Kiếm ý đầy (`resource.max`) thì cộng thêm `critAtMax`. */
  critBase?: number;
  critAtMax?: number;
  /** Kiếm tu: đòn thứ ba của chuỗi đánh thường hoàn lại chừng này giây GCD. */
  gcdRefund?: number;
  /** Hộ pháp: khí huyết tối đa cộng thêm (tỉ lệ). */
  hpMul?: number;
  /** Hộ pháp: sát thương lên quái trong `r` mét nhân thêm `mul` (cận chiến thật). */
  melee?: { r: number; mul: number };
  /** Đan sư: tầm các chiêu đánh xa cộng thêm (mét). */
  rangeBonus?: number;
}

export interface MethodDef {
  id: string;
  role: MethodRole;
  /** id chiêu đặc trưng (ô 7) và chiêu tối thượng (ô 8). */
  sig: string;
  ult: string;
  /** id chiêu lướt của công pháp (K-2): không nằm trên thanh chiêu, có phím riêng. */
  dash: string;
  /** Màu VFX chiêu của công pháp (hex). */
  color: string;
  passive: MethodPassive;
  /** Tài nguyên riêng của công pháp (VS-2a): Kiếm ý / Huyết khí / Đan hỏa. Luật ở `resource.ts`. */
  resource: ResourceDef;
}

/**
 * Biến thức của một chiêu. Mọi trường đều tùy chọn, cộng dồn lên chiêu gốc; client dùng `fx` để đổi hình dạng
 * hiệu ứng (không mang luật). `empower` (cấp 5) nhân các giá trị thưởng lên `EMPOWER_MUL`.
 */
export interface SkillVariant {
  id: VariantId;
  /** Hệ số nhân sức mạnh chiêu. */
  powerMul?: number;
  /** Đánh nhiều lần: mỗi phần tử là hệ số sức mạnh một lần (thay cho 1 lần đánh). */
  hits?: number[];
  /** Xuyên: đánh thêm một quái phía sau mục tiêu với hệ số này. */
  pierce?: number;
  /** Ngắt chú thành công thì choáng thêm chừng này giây. */
  stunOnInterrupt?: number;
  /** Vệt để lại trên đất: giữ `dur` giây, mỗi giây gây `mul` hệ số cho quái trong bán kính `r`. */
  trail?: { dur: number; mul: number; r: number };
  radiusMul?: number;
  /** Nhân thời gian niệm (0 = bỏ niệm). */
  castMul?: number;
  cdMul?: number;
  durationMul?: number;
  /** Lá chắn lớn hơn (nhân lượng). */
  amountMul?: number;
  /** Cho cả đồng đội gần nhất trong bán kính này (lá chắn). */
  ally?: number;
  /** Hồi theo thời gian: tổng nhân `totalMul` lượng gốc, trải đều `dur` giây. */
  hot?: { dur: number; totalMul: number };
  /** Lan sang mục tiêu gần quanh mục tiêu chính: bán kính, hệ số. */
  cleave?: { r: number; mul: number };
  /** Đánh dấu lan sang tối đa n quái gần mục tiêu. */
  markSpread?: number;
  /** Đánh dấu mạnh hơn (cộng vào hệ số). */
  markBonus?: number;
  /** Khiêu khích kèm giáp giảm sát thương (tỉ lệ) trong 3 giây. */
  tauntGuard?: number;
  /** Nhân thời gian khiêu khích. */
  tauntMul?: number;
  /** Nhân bán kính hồi. */
  healRadiusMul?: number;
  /** Nhân lượng hồi cho bản thân. */
  selfHealMul?: number;
  /** E2-G: nhân chiều dài vệt (`line`) hoặc quãng lướt (`dash`, tối đa 12 m). */
  lenMul?: number;
  /** E2-G: nhân sức độc (Mộc Linh Trận); nhân thời gian thiêu đốt (Đan Hỏa Phong Tràn); đẩy lùi mục tiêu ở nhát cuối (m). */
  poisonMul?: number;
  burnMul?: number;
  knock?: number;
  /** E2-G: `guard` đổi tỉ lệ phản; `guardAlly` giảm sát thương cho đồng đội trong `r` mét. */
  reflect?: number;
  guardAlly?: { r: number; reduce: number };
  /** E2-G: khiên tổ đội thêm hồi `regen` (tỉ lệ máu tối đa mỗi giây) trong thời gian khiên. */
  regen?: number;
  /** E2-G: `buff` thêm hồi/giậm. */
  buffRegen?: number;
  buffStomp?: { every: number; r: number; mul: number };
  /** E2-G: số kiếm đan; ưu tiên quái đã đánh dấu. */
  count?: number;
  markFirst?: boolean;
  /** E2-G: lướt xong quay về chỗ cũ; đẩy đổi thành kéo; choáng; không choáng; làm chậm vùng. */
  returnBack?: boolean;
  pull?: boolean;
  stun?: number;
  noStun?: boolean;
  slow?: { dur: number; mul: number };
  /** E2-G: người được hồi (Dược Vũ) nhận thêm khiên bằng tỉ lệ này của máu tối đa. */
  selfShield?: number;
  /** E4-G: hạ gục mục tiêu thì hoàn lại tỉ lệ này của hồi chiêu (Thuấn Di Trảm A). */
  refund?: number;
  /** E4-G: dư chấn sau đòn `aoe`: `n` lần cách nhau `gap` giây, mỗi lần `mul` × sức mạnh. */
  aftershocks?: { n: number; gap: number; mul: number };
  /** E4-G: kiếm ảnh ra đòn trễ chừng này giây sau chiêu gốc (Phân Anh A). */
  echoDelay?: number;
  /** E4-G: khiêu khích quái trong `r` mét quanh chỗ tới, `dur` giây (Thuấn Di Hộ Thế A). */
  tauntAt?: { r: number; dur: number };
  /** E4-G: hồi sinh thêm số người (Thuấn Di Cứu Viện B = 2). */
  reviveN?: number;
  /** E4-G: `buff` thêm giảm sát thương (Thiên Kim Pháp Tướng A). */
  buffReduce?: number;
  /** E4-G: `hot` tăng công/phòng cho đạo hữu được hồi, theo thời lượng chiêu. */
  partyBuff?: { kind: 'atk' | 'def'; pct: number };
  /** E4-G: số đồng đội được chữa (Anh Dược Hóa Thân). */
  allyCount?: number;
  /** Nhãn hình dạng hiệu ứng cho client. */
  fx: string;
}

export interface SkillLevelMods {
  powerMul: number;
  cdMul: number;
}

/**
 * Cấp chiêu 1–5: cấp chẵn tăng sức mạnh (~7%), cấp lẻ từ 3 giảm hồi chiêu (~8%); cấp 3 mở biến thức,
 * cấp 5 làm biến thức đã chọn mạnh thêm.
 */
export function skillLevelMods(level: number): SkillLevelMods {
  const lv = clampSkillLevel(level);
  const powerSteps = Math.floor(lv / 2);
  const cdSteps = Math.floor((lv - 1) / 2);
  return { powerMul: 1 + 0.07 * powerSteps, cdMul: 1 - 0.08 * cdSteps };
}

export function clampSkillLevel(level: unknown): number {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.max(1, Math.min(MAX_SKILL_LEVEL, n));
}

/** Chi phí nâng chiêu lên cấp `toLevel` (2..5): Bí Tịch Tàn Quyển và linh thạch. Ngoài khoảng thì null. */
export function skillUpgradeCost(toLevel: number): { scrolls: number; gold: number } | null {
  if (!Number.isInteger(toLevel) || toLevel < 2 || toLevel > MAX_SKILL_LEVEL) return null;
  const scrolls = [1, 2, 3, 5][toLevel - 2];
  const gold = [60, 150, 350, 800][toLevel - 2];
  return scrolls === undefined || gold === undefined ? null : { scrolls, gold };
}

export function variantUnlocked(level: number): boolean {
  return clampSkillLevel(level) >= VARIANT_MIN_LEVEL;
}

/** Đổi biến thức miễn phí nhưng không dồn dập: giữa hai lần đổi (mọi chiêu) cách nhau chừng này giây. */
export const VARIANT_SWITCH_COOLDOWN_SEC = 5;

export type VariantBlock = 'low' | 'combat' | 'casting' | 'cooldown';

/**
 * Quy tắc đổi biến thức (server quyết, client chỉ dùng để làm mờ nút): chiêu phải từ cấp 3; không đổi khi đang giao
 * chiến, đang niệm chú, hay vừa đổi chưa quá `VARIANT_SWITCH_COOLDOWN_SEC`. Trả về lý do bị chặn hoặc null nếu được đổi.
 */
export function variantSwitchBlock(o: {
  skillLevel: number;
  inCombat: boolean;
  casting: boolean;
  sinceLastSwitchMs: number;
}): VariantBlock | null {
  if (!variantUnlocked(o.skillLevel)) return 'low';
  if (o.inCombat) return 'combat';
  if (o.casting) return 'casting';
  if (o.sinceLastSwitchMs < VARIANT_SWITCH_COOLDOWN_SEC * 1000) return 'cooldown';
  return null;
}

/** Chiêu đã mở biến thức `v` chưa thì mới được dùng; chưa mở hoặc id lạ thì không có biến thức. */
export function activeVariant(
  variants: { a: SkillVariant; b: SkillVariant } | undefined,
  level: number,
  chosen: unknown,
): SkillVariant | null {
  if (!variants || !variantUnlocked(level)) return null;
  if (chosen !== 'a' && chosen !== 'b') return null;
  const v = variants[chosen];
  return level >= EMPOWER_LEVEL ? empowerVariant(v) : v;
}

/** Cấp 5: các giá trị thưởng của biến thức nhân `EMPOWER_MUL` (giá trị đánh đổi giữ nguyên). */
export function empowerVariant(v: SkillVariant): SkillVariant {
  const up = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * EMPOWER_MUL * 1000) / 1000);
  const out: SkillVariant = { ...v };
  if (v.hits) out.hits = v.hits.map((h) => up(h)!);
  out.pierce = up(v.pierce);
  out.stunOnInterrupt = up(v.stunOnInterrupt);
  if (v.trail) out.trail = { ...v.trail, mul: up(v.trail.mul)! };
  if (v.cleave) out.cleave = { ...v.cleave, mul: up(v.cleave.mul)! };
  if (v.hot) out.hot = { ...v.hot, totalMul: up(v.hot.totalMul)! };
  out.reflect = up(v.reflect);
  out.regen = up(v.regen);
  out.buffRegen = up(v.buffRegen);
  out.selfShield = up(v.selfShield);
  out.refund = up(v.refund) === undefined ? undefined : Math.min(0.9, up(v.refund)!);
  if (v.aftershocks) out.aftershocks = { ...v.aftershocks, mul: up(v.aftershocks.mul)! };
  if (v.partyBuff) out.partyBuff = { ...v.partyBuff, pct: Math.min(0.5, up(v.partyBuff.pct)!) };
  out.buffReduce = v.buffReduce === undefined ? undefined : Math.min(0.5, up(v.buffReduce)!);
  if (v.guardAlly) out.guardAlly = { ...v.guardAlly, reduce: Math.min(0.9, up(v.guardAlly.reduce)!) };
  if (v.buffStomp) out.buffStomp = { ...v.buffStomp, mul: up(v.buffStomp.mul)! };
  out.markBonus = up(v.markBonus);
  if (v.powerMul !== undefined && v.powerMul > 1) out.powerMul = 1 + (v.powerMul - 1) * EMPOWER_MUL;
  for (const k of Object.keys(out) as (keyof SkillVariant)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Chiêu sau khi gộp cấp chiêu và biến thức. Chỉ là con số; kiểu chiêu (kind) giữ nguyên. */
export interface ResolvedSkill {
  def: SkillDef;
  level: number;
  variant: SkillVariant | null;
  power: number;
  cd: number;
  cast: number;
  mp: number;
  radius: number | undefined;
  duration: number | undefined;
  /** Hệ số từng nhát đánh (đã nhân sức mạnh); 1 phần tử với chiêu thường. */
  hits: number[];
}

export function resolveSkill(
  def: SkillDef,
  level: unknown,
  variants: { a: SkillVariant; b: SkillVariant } | undefined,
  chosen: unknown,
): ResolvedSkill {
  const lv = clampSkillLevel(level);
  const mods = skillLevelMods(lv);
  const v = activeVariant(variants, lv, chosen);
  const power = def.power * mods.powerMul * (v?.powerMul ?? 1);
  const hits = (v?.hits ?? def.hitsMul ?? [1]).map((h) => h * power);
  return {
    def,
    level: lv,
    variant: v,
    power,
    cd: round2(def.cd * mods.cdMul * (v?.cdMul ?? 1)),
    cast: round2(def.cast * (v?.castMul ?? 1)),
    mp: def.mp,
    radius: def.radius === undefined ? undefined : round2(def.radius * (v?.radiusMul ?? 1)),
    duration: def.duration === undefined ? undefined : round2(def.duration * (v?.durationMul ?? 1)),
    hits,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- chiêu tối thượng: vòng sạc ----------

/** Sạc từ sát thương gây ra: mỗi nhát cơ bản (≈ một lần công) cho khoảng 1,6; chiêu mạnh cho nhiều hơn. Tối đa 14 mỗi nhát. */
export function chargeFromDealt(dmg: number, atk: number): number {
  if (!(dmg > 0) || !(atk > 0)) return 0;
  return Math.min(14, (dmg / atk) * 1.6);
}

/** Sạc từ sát thương nhận vào (đã trừ khiên): 50% máu tối đa ≈ 30. Tối đa 20 mỗi lần. */
export function chargeFromTaken(dmg: number, mhp: number): number {
  if (!(dmg > 0) || !(mhp > 0)) return 0;
  return Math.min(20, (dmg / mhp) * 60);
}

export function addCharge(cur: number, gain: number): number {
  return Math.max(0, Math.min(CHARGE_MAX, cur + gain));
}

// ---------- nội tại ----------

/** Hồi phục sau cộng thêm của công pháp (Đan Kinh: +20%). */
export function healAmount(base: number, healMul: number | undefined): number {
  return Math.round(base * (1 + (healMul ?? 0)));
}

/** Giảm sát thương: nhận `n`, giảm `reduce` (0..0,9). */
export function reduceDamage(n: number, reduce: number): number {
  const r = Math.max(0, Math.min(0.9, reduce));
  return Math.max(1, Math.round(n * (1 - r)));
}

/**
 * Chiêu đổi id (K-2): id cũ → id mới. Server đổi khóa `skillLv`/`skillVar` trong `characters.meta` khi đọc nhân vật
 * (idempotent, giữ cấp, biến thức; `sanitizeMethodMeta`). Không bao giờ xóa mục đã thêm: chuỗi đổi nhiều lần giữ đủ.
 */
export const SKILL_ID_ALIASES: Readonly<Record<string, string>> = {
  skl_kiem_anh_phan_quang: 'skl_phi_kiem_truy_hon',
  skl_xuan_phong_hoa_vu: 'skl_hoi_xuan_quyet',
};

/** Đổi khóa id cũ sang mới trong một bảng id → giá trị (không ghi đè khóa mới nếu đã có). Trả về true nếu có đổi. */
export function migrateSkillKeys<T>(table: Record<string, T> | undefined | null): boolean {
  if (!table || typeof table !== 'object') return false;
  let changed = false;
  for (const [from, to] of Object.entries(SKILL_ID_ALIASES)) {
    if (!(from in table)) continue;
    if (!(to in table)) table[to] = table[from] as T; // `from in table` đã kiểm ở trên
    delete table[from];
    changed = true;
  }
  return changed;
}
