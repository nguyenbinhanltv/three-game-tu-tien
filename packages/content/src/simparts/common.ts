// Tách từ sim.ts (tối ưu Đợt E): common.
import { formationHurts, type MonsterDef, type SkillDef } from '@dtl/shared';
import {
  counterMul,
  CRIT_CHANCE,
  CRIT_MULT,
  elemCounter,
  METHOD_UNLOCK_LEVEL,
  STAT_CAPS,
  computeDamage,
  GCD,
  playerBaseStats,
} from '@dtl/shared';
import { ITEM, METHODS, MARK, METHOD_SKILLS, PATHS, SKILL, SKILLS, t } from '../index';

import { at } from '@dtl/shared';
/** Trang bị dự kiến ở mỗi cảnh giới (theo phần thưởng nhiệm vụ). */
function gear(level: number): { atk: number; def: number; hp: number } {
  const pick = (ids: string[]) => {
    let best = { atk: 0, def: 0, hp: 0 };
    for (const id of ids) {
      const d = ITEM.get(id);
      if (d && (d.reqLevel ?? 1) <= level) best = { atk: d.stats?.atk ?? 0, def: d.stats?.def ?? 0, hp: d.stats?.hp ?? 0 };
    }
    return best;
  };
  const w = pick(['itm_moc_kiem', 'itm_thiet_kiem', 'itm_thanh_phong_kiem']);
  const r = pick(['itm_bo_y', 'itm_dao_bao', 'itm_linh_ti_bao']);
  return { atk: w.atk + r.atk, def: w.def + r.def, hp: w.hp + r.hp };
}

export function player(level: number): { atk: number; def: number; hp: number } {
  const b = playerBaseStats(level);
  const g = gear(level);
  return { atk: b.atk + g.atk, def: b.def + g.def, hp: b.hp + g.hp };
}

/** Sát thương trung bình một đòn (roll giữa, không bạo kích). */
export const hit = (atk: number, power: number, def: number) => computeDamage(atk, power, def, 0.5, 1).dmg;

// ---------- công pháp (3-10) ----------

export type MethodId = 'lac_kiem_quyet' | 'bat_dong_kim_than' | 'thanh_moc_dan_kinh';
// VS-3: danh sách và tên lấy từ hướng tu (thứ tự paths.json), không viết cứng.
export const METHOD_IDS = PATHS.flatMap((p) => p.methods) as MethodId[];
export const METHOD_NAME = Object.fromEntries(PATHS.flatMap((p) => p.methods.map((m) => [m, t(`path.${p.id}.name`)] as const))) as Record<
  MethodId,
  string
>;
const methodDef = (id?: MethodId) => (id ? METHODS.find((m) => m.id === id) : undefined);
/** Từ Ngưng Khí 5 mới chọn công pháp. */
export const methodAt = (level: number, id?: MethodId) => (level >= METHOD_UNLOCK_LEVEL ? methodDef(id) : undefined);

/** Số quái bị kéo cùng lúc khi vào cụm (M-2: cụm 3–4 con, mỗi con thức giấc theo tầm `aggro`): bình quân hai con. */
export const PULL = 2;
/** Một người đánh kéo `PULL` quái, hạ lần lượt: mỗi lần hạ chịu trung bình (PULL+1)/2 con đánh cùng lúc. */
export const PULL_FACTOR = (PULL + 1) / 2;
/** Người chơi thật dùng khiên/hồi đúng lúc khoảng 60% so với "dùng đều tay". */
export const SUSTAIN_EFF = 0.6;
/** Mộc độc phủ trung bình bấy nhiêu quái trong cụm. */
const POISON_MOBS = 2;

/** Chiêu công pháp dùng được ở cấp `level` và mô hình hóa: chiêu đặc trưng + lướt có sát thương (chiêu tối thượng không tính). */
function methodSkills(level: number, id?: MethodId): SkillDef[] {
  const m = methodAt(level, id);
  if (!m) return [];
  return [m.sig, m.dash].map((sid) => METHOD_SKILLS.find((s) => s.id === sid)!).filter((s) => s && s.unlock <= level);
}

/**
 * VS-2: người chơi thật làm đúng cơ chế mới (ấn, tư thế, xả tài nguyên) khoảng chừng này so với "làm đều tay".
 * Cùng ý với `SUSTAIN_EFF`; nhịp lên cấp tính theo mức này, bảng "VS-2" bên dưới in cả hai đầu mút.
 */
export const SKILL_EFF = 0.6;
/** Hộ pháp có đủ 40 Huyết khí lúc tiêu Trấn ấn khoảng chừng này số lần (đánh một mình, kéo `PULL` quái). */
/** TN-8: tỉ lệ nhịp trận trúng quái khi đánh một mình (không phải quái nào cũng đứng trong trận suốt thời gian trận). */
const FORMATION_COVER = 0.7;
const TANK_RES_READY = 0.7;
/** `base`: bấm theo hồi chiêu, không dùng cơ chế VS-2 (mô hình trước VS-2); `skilled`: dùng đủ; `avg`: người chơi thật (`SKILL_EFF`). */
export type PlayMode = 'base' | 'avg' | 'skilled';

/**
 * Sát thương trung bình mỗi giây của người chơi lên một quái (xoay vòng các chiêu đã mở). `monElem`: hệ quái, tính khắc chế.
 * Lớp VS-2 chỉ cộng phần cơ chế MỚI (nhát bắn thêm của Kiếm ấn, Mất thế, tư thế). Thưởng đã có từ trước VS-2 mà mô hình
 * vốn không tính (dấu Truy hồn +20%, Lôi Đình xả Kiếm ý, chuỗi cũ) vẫn để ngoài: nhịp 3–4 giờ đã được hiệu chỉnh như thế.
 */
export function playerDps(level: number, atk: number, monDef: number, id?: MethodId, monElem?: string, mode: PlayMode = 'avg'): number {
  const m = methodAt(level, id);
  const pas = m?.passive;
  // Nhịp đánh: mọi đòn thường 1 GCD; kiếm tu hoàn 0,2 s mỗi chuỗi 3 đòn.
  const gcd = GCD - (pas?.gcdRefund ? pas.gcdRefund / 3 : 0);
  // Bạo kích: nền 10% + nội tại; đủ kiếm ý (đánh liên tục) thì thêm `critAtMax`.
  const crit = Math.min(STAT_CAPS.critRate, CRIT_CHANCE + (pas?.critBase ?? 0) + (pas?.critAtMax ?? 0));
  const critMul = 1 + crit * (CRIT_MULT - 1);
  const melee = 1 + (pas?.melee?.mul ?? 0);
  const one = (s: SkillDef) => hit(atk, s.power, monDef) * critMul * melee * counterMul(elemCounter(s.elem, monElem));
  // TN-8: trận đánh theo nhịp: số nhịp có hiệu lực của một lần đặt × tỉ lệ quái đứng trong trận (đánh một mình, kéo cụm nhỏ).
  const formHits = (s: SkillDef): number =>
    s.kind === 'formation' && s.formation && formationHurts(s.formation.mode)
      ? Math.floor((s.formation.dur - s.formation.arm) / s.formation.every) * FORMATION_COVER
      : 1;
  const deals = (s: SkillDef) =>
    s.kind === 'damage' ||
    s.kind === 'aoe' ||
    (s.kind === 'dash' && s.power > 0) ||
    (s.kind === 'formation' && !!s.formation && formationHurts(s.formation.mode));
  /** Xoay vòng: chiêu có hồi chiêu dùng ngay khi hồi xong, thời gian còn lại đánh đòn `basic`. */
  const rot = (skills: SkillDef[], basic: SkillDef): number => {
    let perSec = 0;
    let gcdUsed = 0;
    for (const s of skills) {
      if (s === basic || s.unlock > level || !deals(s) || s.cd <= 0) continue;
      perSec += (one(s) * formHits(s)) / s.cd;
      // Thiêu đốt của chiêu vùng (Đan Hỏa Vũ): sát thương theo thời gian, không giảm theo phòng ngự.
      if (s.burn) perSec += (atk * s.burn.mul * s.burn.dur) / s.cd;
      // Lướt không ăn GCD.
      if (s.kind !== 'dash') gcdUsed += (gcd + s.cast) / s.cd;
    }
    return perSec + (one(basic) / gcd) * Math.max(0, 1 - gcdUsed);
  };
  const bar = [...SKILLS, ...methodSkills(level, id)];
  const basic = at(SKILLS, 0);
  let perSec = rot(bar, basic);
  // Mộc độc đan sư: sát thương theo thời gian mỗi mục tiêu, không giảm theo phòng ngự, phủ `POISON_MOBS` quái trong cụm.
  const hx = m ? METHOD_SKILLS.find((s) => s.id === m.sig && s.poison) : undefined;
  if (hx?.poison && hx.unlock <= level) perSec += ((atk * hx.poison.mul * hx.poison.dur) / hx.cd) * POISON_MOBS;
  // TN-2: ấn bào mòn (Hồn ấn) là lõi của Hồn tu, đi kèm chiêu đặc trưng nên tính ở lớp nền như mộc độc: mỗi giây mỗi tầng
  // `dot.per` × công kích, không giảm theo phòng ngự. Số tầng giữ được = tổng (thời gian ấn / hồi chiêu) của các chiêu đặt ấn.
  // Phần rút máu và hồi khi thu hồn KHÔNG tính vào độ trụ (ước lượng dè dặt).
  if (m) {
    for (const md of MARK.values()) {
      if (!md.dot || md.method !== m.id) continue;
      const stacks = Math.min(
        md.max,
        bar.filter((a) => a.unlock <= level && a.cd > 0 && a.applyMark?.id === md.id).reduce((n, a) => n + md.dur / a.cd, 0),
      );
      perSec += atk * md.dot.per * stacks;
    }
  }
  if (mode === 'base' || !m) return perSec;

  // ---------- lớp VS-2 ----------
  const avail = bar.filter((s) => s.unlock <= level);
  const mine = (markId: string) => {
    const md = MARK.get(markId);
    return md && (!md.method || md.method === m.id) ? md : undefined;
  };
  let bonus = 0;
  // (1) Kiếm ấn: chiêu tiêu ấn bắn thêm một nhát mỗi tầng. Số tầng lúc tiêu = số lần chiêu đặt ấn kịp ra giữa hai lần tiêu.
  for (const s of avail) {
    const cm = s.consumeMark;
    const md = cm?.extraHit ? mine(cm.id) : undefined;
    if (!cm?.extraHit || !md || s.cd <= 0) continue;
    const stacks = Math.min(
      md.max,
      avail.filter((a) => a.applyMark?.id === cm.id && a.cd > 0).reduce((n, a) => n + s.cd / a.cd, 0),
    );
    bonus += (one(s) * cm.extraHit * stacks) / s.cd;
  }
  // (2) Mất thế: tiêu Trấn ấn + xả đủ Huyết khí → mọi sát thương lên quái +`ampAll` trong thời gian ấn.
  for (const s of avail) {
    const th = s.consumeMark?.then;
    const opener = th ? avail.find((a) => a.applyMark?.id === s.consumeMark!.id && a.cd > 0) : undefined;
    const md = th ? mine(th.mark) : undefined;
    if (!th || !opener || !md?.ampAll) continue;
    bonus += perSec * md.ampAll * Math.min(1, md.dur / opener.cd) * TANK_RES_READY;
    break;
  }
  // (3) Tư thế: trong `dur` giây mỗi `cd` giây, vài ô đổi sang chiêu tư thế.
  const st = METHOD_SKILLS.find((s) => s.method === m.id && s.kind === 'stance' && s.unlock <= level);
  if (st?.stance) {
    const swap = st.stance.swap;
    const inStance = bar.map((s) => (swap[s.id] ? (SKILL.get(swap[s.id]!) ?? s) : s));
    const basicIn = swap[basic.id] ? (SKILL.get(swap[basic.id]!) ?? basic) : basic;
    bonus += (st.stance.dur / st.cd) * (rot(inStance, basicIn) - rot(bar, basic));
  }
  return perSec + bonus * (mode === 'skilled' ? 1 : SKILL_EFF);
}

/** Máu tự hồi bằng chiêu (khiên, hồi nguyên, hồi xuân) theo tỉ lệ máu tối đa mỗi giây, nhân hiệu suất dùng thật. */
export function selfSustain(level: number, id?: MethodId, mode: PlayMode = 'avg'): number {
  const m = methodAt(level, id);
  const healMul = 1 + (m?.passive.healMul ?? 0);
  const eff = mode === 'base' || !m ? 0 : mode === 'skilled' ? 1 : SKILL_EFF;
  // TN-8: trận hồi (Hộ Trận, Sinh Tử Cấm) hồi `heal` × số nhịp có hiệu lực mỗi lần đặt.
  const formHeal = (s: SkillDef): number =>
    s.kind === 'formation' && s.formation?.heal
      ? s.formation.heal * Math.floor((s.formation.dur - s.formation.arm) / s.formation.every)
      : 0;
  const sus = (s: SkillDef) => (s.kind === 'heal' || s.kind === 'hot' ? s.power * healMul : s.kind === 'shield' ? s.power : formHeal(s));
  let r = 0;
  for (const s of [...SKILLS, ...methodSkills(level, id)]) {
    if (s.unlock > level || s.cd <= 0) continue;
    r += sus(s) / s.cd;
    // VS-2: Đan sư xả Đan hỏa (`res.cost`) thì chiêu hồi mạnh thêm `bonusMul`.
    if (m && s.res?.cost && s.res.id === m.resource.id && s.res.bonusMul) r += ((sus(s) * (s.res.bonusMul - 1)) / s.cd) * eff;
  }
  // VS-2: tư thế đổi ô hồi/khiên (Lô Hỏa Hồi Nguyên, Kim Thân Hộ Thế) trong `dur` giây mỗi `cd` giây.
  const st = m ? METHOD_SKILLS.find((s) => s.method === m.id && s.kind === 'stance' && s.unlock <= level) : undefined;
  if (st?.stance) {
    for (const [from, to] of Object.entries(st.stance.swap)) {
      const a = SKILL.get(from);
      const b = SKILL.get(to);
      if (!a || !b || !(b.cd > 0) || !(sus(b) > 0)) continue;
      r += (st.stance.dur / st.cd) * (sus(b) / b.cd - (a.cd > 0 && a.unlock <= level ? sus(a) / a.cd : 0)) * eff;
    }
  }
  return r * SUSTAIN_EFF;
}

/** Trang bị và nội tại công pháp ở cảnh giới `level` (hộ pháp: khí huyết +12%, phòng ngự +15%). */
export function playerM(level: number, id?: MethodId): { atk: number; def: number; hp: number } {
  const p = player(level);
  const pas = methodAt(level, id)?.passive;
  return { atk: p.atk, def: Math.round(p.def * (1 + (pas?.defMul ?? 0))), hp: Math.round(p.hp * (1 + (pas?.hpMul ?? 0))) };
}

/** Sát thương mỗi giây một quái thường gây lên người đứng yên, không né vùng. */
export function monsterDps(def: MonsterDef, atk: number, pDef: number): number {
  const cs = def.ai?.caster;
  if (cs) return hit(atk, cs.mul, pDef) / (cs.cast + cs.cd);
  const cb = def.ai?.combo;
  return (hit(atk, 1, pDef) + (cb ? cb.chance * hit(atk, cb.mul, pDef) : 0)) / def.attackCd;
}

export const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
