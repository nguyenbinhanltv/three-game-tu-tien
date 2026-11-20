// Chiêu và công pháp của người chơi (R-7): onSkill/onDash, resolveSkill, hồi/hộ thể/triệu hồi, tickMethods.
// Tách nguyên văn từ GameSim, chỉ nhận giao diện hẹp `CombatCtx`; mọi sát thương vẫn qua damageMonster/damagePlayer của sim.
import {
  addCharge,
  CHARGE_MAX,
  type DmgMsg,
  caveBoundOf,
  chainMp,
  healAmount,
  markAdd,
  markCount,
  marksPrune,
  markTake,
  packMarks,
  type ConsumeMark,
  type MarkDef,
  resAdd,
  resFromHeal,
  resFromTaken,
  resMax,
  resNow,
  resSpend,
  resSpendAt,
  type FxMsg,
  AIRBORNE_HEIGHT,
  elemDamageMul,
  GCD,
  type LevelDef,
  MF_STUN,
  MS_CHASE,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  PF_CASTING,
  PF_SHIELD,
  S,
  SKILL_MSG_PER_SEC,
  type SkillDef,
  type SysMsg,
  BLINK_CD,
  BLINK_DIST,
  blinkReplaces,
  comboNext,
  dashDir,
  DASH_MIN_GAP_MS,
  DASH_MAX_DIST,
  needsTarget,
  dealsDamage,
  DASH_MAX_SLOPE,
  distToSegment,
  inLine,
  hitOffsets,
  collisionOf,
  planDash,
  strikeDelay,
  type Terrain,
} from '@dtl/shared';
import { MARK, SKILL } from '@dtl/content';
import { type Hot, methodOf, passiveOf, resolveFor, resourceOf, type Trail } from '../method';
import { chainOf, takeChain } from '../skillflow';
import type { DuelSystem } from '../duel';
import type { MirrorSystem } from '../mirror';
import type { CloneSystem } from '../clone';
import { pruneBuffs } from '../artifact';
import type { MonEnt, PlayerEnt, StrikeCtx, Stomp, Summon } from '../entities';
import { LEASH, MARK_ALLY_RANGE, SET_HEAL_RADIUS, TAUNT_BOSS_MUL, visualSeed } from './consts';

import { at } from '@dtl/shared';
/** Phần GameSim mà hệ chiêu cần. */
export interface CombatCtx {
  /** Cộng thanh phá thế của thủ lĩnh (ấn Mất thế, VS-2c). */
  addPosture(m: MonEnt, n: number): void;
  readonly clone: CloneSystem;
  readonly duel: DuelSystem;
  duelStrike(p: PlayerEnt, o: PlayerEnt, powers: number[], elemMul: number): void;
  emit(type: string, payload: object): void;
  fx(m: FxMsg): void;
  /** Trả true nếu đòn có hiệu lực (quái còn sống, không miễn sát thương, không phải bóng của người khác). */
  hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul?: number, elem?: string): boolean;
  homeDist(m: MonEnt): number;
  isDead(p: PlayerEnt): boolean;
  readonly level: LevelDef;
  readonly mirror: MirrorSystem;
  readonly monById: Map<string, MonEnt>;
  readonly monsters: MonEnt[];
  readonly now: number;
  readonly players: Map<string, PlayerEnt>;
  resetAi(m: MonEnt): void;
  sendCd(p: PlayerEnt): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  setMeditating(p: PlayerEnt, on: boolean): void;
  setMonFlags(m: MonEnt, mf: number, ce: number): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  readonly terrain: Terrain;
  tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun?: number): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

export class CombatSystem {
  constructor(private readonly c: CombatCtx) {}

  /** Việc hẹn giờ của chiêu nhiều mốc `hitAt`. */
  delayed: { at: number; fn: () => void }[] = [];
  hots: Hot[] = [];
  trails: Trail[] = [];
  summons: Summon[] = [];
  stomps: Stomp[] = [];
  /** E4-G: kiếm ảnh đang chạy của Phân Anh Kiếm Ảnh (mỗi người một). */
  echoes = new Map<string, { until: number; delay: number; hits: number[]; elem: string }>();

  onSkill(p: PlayerEnt, msg: unknown): void {
    // Giới hạn riêng cho lệnh skill: GCD đã chặn ra chiêu, cái này chặn dội lệnh để dò cửa sổ ngắt chú.
    if (this.c.now - p.skillWindowAt >= 1000) {
      p.skillWindowAt = this.c.now;
      p.skillCount = 0;
    }
    if (++p.skillCount > SKILL_MSG_PER_SEC) return;
    const m = msg as { id?: unknown; t?: unknown } | null;
    if (!m || typeof m.id !== 'string') return;
    const skill = SKILL.get(m.id);
    if (!skill) return;
    const c = p.char;
    if (this.c.isDead(p)) return this.c.warn(p, 'sys.dead');
    if (c.level < skill.unlock) return this.c.warn(p, 'sys.level_low');
    if (skill.method && c.meta.method !== skill.method) return this.c.warn(p, 'sys.no_method');
    if (skill.locked) return this.c.warn(p, 'sys.skill_locked');
    if (this.airborne(p)) return this.c.warn(p, 'sys.cannot_while_flying');
    if (skill.dash) return this.onDash(p, skill, typeof m.t === 'string' ? m.t : '');
    if (p.casting || p.flow.pending) return;
    if (this.c.now < p.gcdAt - 60) return;
    if ((p.cds.get(skill.id) ?? 0) > this.c.now) return this.c.warn(p, 'sys.cooldown');
    // VS-2b: chiêu đang mở chuỗi có thể tốn ít linh lực hơn.
    if (c.mp < chainMp(skill.mp, chainOf(p.flow, skill, this.c.now))) return this.c.warn(p, 'sys.not_enough_mp');
    if (skill.ult && p.mth.charge < CHARGE_MAX) return this.c.warn(p, 'sys.ult_not_ready');
    if (skill.kind === 'revive' && !this.reviveTarget(p, skill.allyRadius ?? 14)) return this.c.warn(p, 'sys.no_ally_dead');
    if (skill.blinkAlly && skill.kind !== 'revive' && !this.nearestAlly(p, skill.blinkAlly.range)) return this.c.warn(p, 'sys.no_ally');
    const rs = resolveFor(c.meta, skill);
    let targetId = '';
    if (needsTarget(skill)) {
      if (typeof m.t !== 'string') return this.c.warn(p, 'sys.no_target');
      const mon = this.c.monById.get(m.t);
      if (!mon && this.c.players.has(m.t)) {
        // Người chơi chỉ là mục tiêu hợp lệ của đúng đối thủ tỉ thí, và chỉ sau khi hết đếm ngược.
        const foe = this.c.duel.anyFoe(p);
        if (!foe || foe.sid !== m.t) return this.c.warn(p, 'sys.no_target');
        if (!this.c.duel.foeOf(p)) return this.c.warn(p, 'duel.not_started');
        if (!this.inRangeP(p, foe, skill.range)) return this.c.warn(p, 'sys.out_of_range');
        targetId = foe.sid;
        p.s.yaw = Math.atan2(foe.move.x - p.move.x, foe.move.z - p.move.z);
      } else {
        if (!mon || mon.state === MS_DEAD) return this.c.warn(p, 'sys.no_target');
        if (!this.inRange(p, mon, this.skillRange(p, skill))) return this.c.warn(p, 'sys.out_of_range');
        targetId = mon.id;
        p.s.yaw = Math.atan2(mon.s.x - p.move.x, mon.s.z - p.move.z);
      }
    }
    if (p.meditating) this.c.setMeditating(p, false);
    p.gcdAt = this.c.now + GCD * 1000;
    if (rs.cast > 0) {
      p.casting = { skill, target: targetId, endAt: this.c.now + rs.cast * 1000 };
      this.c.setFlag(p, PF_CASTING, true);
      this.c.fx({ t: 'cast', src: p.sid, dst: targetId, d: rs.cast, s: skill.id, ...this.fxTag(p, rs) });
      this.c.sendCd(p);
      return;
    }
    this.beginSkill(p, skill, targetId);
  }

  /**
   * Chiêu không niệm (K-2): chuỗi đánh thường, chuỗi chiêu (VS-2b), rồi áp ngay hoặc chờ `hitAt` (hình và sát thương cùng nhịp).
   * Linh lực, hồi chiêu, vòng sạc trừ lúc bấm; đòn bị hủy vì mục tiêu thì hoàn lại.
   */
  beginSkill(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    const f = p.flow;
    this.c.mirror.onSkill(p, skill.id);
    let combo = -1;
    let mul = 1;
    if (skill.combo) {
      combo = comboNext(skill.combo, f.comboIdx, f.comboAt, this.c.now);
      f.comboIdx = combo;
      f.comboAt = this.c.now;
      mul *= at(skill.combo.hits, combo, 'combo.hits').power / Math.max(0.01, skill.power);
      // Kiếm tu: đòn cuối chuỗi hoàn lại một phần GCD (đánh nhanh hơn).
      const refund = passiveOf(p.char.meta)?.gcdRefund;
      if (refund && combo === skill.combo.hits.length - 1) p.gcdAt -= refund * 1000;
    }
    // VS-2b: đang trong cửa sổ chuỗi thì nhận thưởng (sức mạnh, linh lực, hồi chiêu) và đóng cửa sổ ngay lúc bấm.
    const ch = takeChain(f, skill, this.c.now);
    mul *= ch.powerMul;
    const ctx: StrikeCtx = { combo: combo >= 0 ? combo : undefined, mul, mpMul: ch.mpMul, cdMul: ch.cdMul };
    const delay = strikeDelay(skill, combo >= 0 ? combo : undefined) * 1000;
    if (delay <= 0) return this.resolveWith(p, skill, targetId, ctx);
    const prevCd = p.cds.get(skill.id);
    const prevCharge = p.mth.charge;
    const mp = this.commitSkill(p, skill, ctx);
    f.pending = { skill, target: targetId, at: this.c.now + delay, combo, mul, mp, prevCd, prevCharge };
    this.c.sendCd(p);
  }

  resolveWith(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx): void {
    this.executeSkill(p, skill, targetId, ctx);
  }

  /** Hủy đòn đang chờ. `refund`: hoàn linh lực, hồi chiêu, vòng sạc (chỉ khi mục tiêu mất, không phải do người chơi tự hủy). */
  abortStrike(p: PlayerEnt, refund: boolean, notify = true): void {
    const st = p.flow.pending;
    if (!st) return;
    p.flow.pending = null;
    if (st.skill.ult) {
      p.mth.lockCharge = false;
      if (refund) p.mth.charge = st.prevCharge;
      p.mth.dirty = true;
    }
    if (refund) {
      p.char.mp = Math.min(p.char.mmp, p.char.mp + st.mp);
      if (st.prevCd === undefined) p.cds.delete(st.skill.id);
      else p.cds.set(st.skill.id, st.prevCd);
    }
    if (notify) {
      this.c.fx({ t: 'castend', src: p.sid });
      this.c.sendCd(p);
    }
  }

  /** Tới `hitAt`: kiểm lại điều kiện rồi áp. Mục tiêu chết/ra tầm: hủy và hoàn; người ra chiêu chết/bay lên: hủy, không hoàn. */
  resolvePending(p: PlayerEnt): void {
    const st = p.flow.pending;
    if (!st) return;
    if (this.c.isDead(p) || this.airborne(p)) return this.abortStrike(p, false);
    const sk = st.skill;
    if (st.target && needsTarget(sk)) {
      const mon = this.c.monById.get(st.target);
      let ok: boolean;
      if (mon) ok = mon.state !== MS_DEAD && this.inRange(p, mon, this.skillRange(p, sk) * 1.3);
      else {
        const foe = this.c.duel.foeOf(p);
        ok = !!foe && foe.sid === st.target && this.inRangeP(p, foe, sk.range * 1.3);
      }
      if (!ok) return this.abortStrike(p, true);
    }
    // Hồi sinh: người ngã đã được hồi, hồi sinh bởi người khác hoặc rời tầm trong lúc chờ → hủy và hoàn (không phí vòng sạc).
    if (sk.kind === 'revive' && !this.reviveTarget(p, sk.allyRadius ?? 14)) return this.abortStrike(p, true);
    p.flow.pending = null;
    this.resolveSkill(p, sk, st.target, { combo: st.combo >= 0 ? st.combo : undefined, mul: st.mul });
  }

  /**
   * Lướt (K-2): quãng và hướng theo chiêu, lập đường bằng `stepMove` (không xuyên vách), không khi ngự kiếm.
   * Không ăn GCD nhưng có hồi chiêu riêng (≥ 8 s) và khe tối thiểu giữa hai lần; hủy được đòn đang chờ/niệm
   * (chiêu đó mất, không hoàn), nên lướt không đổi được GCD lấy lượt đánh miễn phí.
   */
  onDash(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    const def = skill.dash;
    if (!def) return;
    const c = p.char;
    // Độ kiếp vẫn lướt được: lướt là cách băng qua vạch lôi võng (pha 2).
    if (p.trial) return this.c.warn(p, 'sys.busy');
    if (this.c.now - p.flow.lastDashAt < DASH_MIN_GAP_MS) return;
    if ((p.cds.get(skill.id) ?? 0) > this.c.now) return this.c.warn(p, 'sys.cooldown');
    if (c.mp < skill.mp) return this.c.warn(p, 'sys.not_enough_mp');
    const mon = targetId ? this.c.monById.get(targetId) : undefined;
    const tgt = mon && mon.state !== MS_DEAD && this.inRange(p, mon, skill.range) ? mon : undefined;
    // Đặt mốc ngay khi lệnh hợp lệ tới đây (kể cả khi bị chặn): lệnh bị chặn không thể dội để ép tính đường liên tục.
    p.flow.lastDashAt = this.c.now;
    const dir = dashDir(def, p.s.yaw, tgt ? { dx: tgt.s.x - p.move.x, dz: tgt.s.z - p.move.z } : null);
    if (!dir) return;
    const rsv = resolveFor(c.meta, skill).variant;
    // Thuấn di (E3-K, Nguyên Anh trở lên): thay Lướt cơ bản, xa hơn, hồi lâu hơn; vẫn lập đường bằng `planDash` nên không xuyên vách.
    const blink = blinkReplaces(c.level, def);
    const dashDist = blink ? BLINK_DIST : Math.min(DASH_MAX_DIST, def.dist * (rsv?.lenMul ?? 1));
    const stop = tgt && def.dir === 'target' ? { x: tgt.s.x, z: tgt.s.z, r: (def.stop ?? 1.6) + tgt.def.scale } : undefined;
    // Đã sát mục tiêu: không cần lướt; chiêu có sát thương (Thiết Bích Xung) vẫn húc, chiêu thuần di chuyển thì bỏ.
    // Dịch Sơn Xung B (kéo): không lướt, kéo mục tiêu (và quái quanh nó) từ xa về sát người.
    const pullOnly = !!(def.push && rsv?.pull && tgt);
    const close = !!stop && Math.hypot(stop.x - p.move.x, stop.z - p.move.z) <= stop.r + 1;
    const plan =
      close || pullOnly
        ? { x: p.move.x, z: p.move.z, dist: 0, blocked: true }
        : planDash(p.move, dir, dashDist, stop, {
            terrain: this.c.terrain,
            bound: caveBoundOf(this.c.level),
            collision: collisionOf(this.c.level),
          });
    if (plan.dist < 1 && !(close && skill.power > 0) && !pullOnly) return this.c.warn(p, close ? 'sys.dash_close' : 'sys.dash_blocked');
    const rs = resolveFor(c.meta, skill);
    if (p.meditating) this.c.setMeditating(p, false);
    if (p.casting) this.cancelCast(p);
    this.abortStrike(p, false);
    c.mp -= skill.mp;
    const cdSec = blink ? BLINK_CD : rs.cd;
    if (cdSec > 0) p.cds.set(skill.id, this.c.now + cdSec * 1000);
    p.flow.lastDashAt = this.c.now;
    p.lastCombatAt = this.c.now;
    const from = { x: p.move.x, z: p.move.z, y: p.move.y };
    p.move.x = plan.x;
    p.move.z = plan.z;
    p.move.y = this.c.terrain.groundAt(plan.x, plan.z);
    p.move.vy = 0;
    p.move.grounded = true;
    p.inputs.length = 0;
    p.s.yaw = Math.atan2(dir.x, dir.z);
    this.c.fx({
      t: blink ? 'blink' : skill.fx,
      src: p.sid,
      x: plan.x,
      y: p.move.y,
      z: plan.z,
      d: blink ? 0.4 : 0.3,
      ...(blink ? { ox: from.x, oz: from.z } : this.fxTag(p, rs)),
    });
    // Lướt xuyên (Nghịch Kiếm Chuyển Phong): chém mọi quái sát đường lướt.
    if (def.pierce && skill.power > 0) {
      let killed = false;
      const em = elemDamageMul(c.stats.elemDmg, skill.elem);
      for (const o of this.c.monsters) {
        if (o.state === MS_DEAD || (o.owner && o.owner !== p.sid)) continue;
        if (distToSegment(from.x, from.z, plan.x, plan.z, o.s.x, o.s.z) <= def.pierce.r + o.def.scale) {
          this.c.hitMonster(p, o, rs.power, em, skill.elem);
          if (o.state === MS_DEAD) killed = true;
        }
      }
      // Bộ Kính Quang bậc 3 (4 món): lướt hạ được mục tiêu thì hoàn `nghichKiemRefund` phần hồi chiêu còn lại.
      const refund = skill.id === 'skl_nghich_kiem_chuyen_phong' ? c.stats.setFx.nghichKiemRefund : 0;
      if (killed && refund > 0 && rs.cd > 0) p.cds.set(skill.id, this.c.now + rs.cd * 1000 * (1 - Math.min(1, refund)));
      if (rs.variant?.returnBack) {
        p.move.x = from.x;
        p.move.z = from.z;
        p.move.y = from.y;
      }
    }
    // Lướt có sát thương (Thiết Bích Xung): húc mục tiêu nếu đã sát người.
    if (skill.power > 0 && tgt && (pullOnly || this.inRange(p, tgt, 3))) {
      // Lướt húc trong cửa sổ chuỗi: chỉ nhân sức mạnh, tiêu cửa sổ khi húc trúng (lướt hụt không mất chuỗi).
      const mul = takeChain(p.flow, skill, this.c.now).powerMul;
      this.c.hitMonster(p, tgt, rs.power * mul, elemDamageMul(c.stats.elemDmg, skill.elem), skill.elem);
      // Húc choáng quái thường (hộ pháp): tinh anh nửa thời gian, boss miễn.
      // Bộ Vân Kình bậc 3 (4 món): Dịch Sơn Xung choáng thêm `dichSonStun` giây.
      // VS-2c: húc quái mang Trấn ấn của mình: choáng thêm, tích Huyết khí; đủ Huyết khí thì xả ra khiến quái mất thế.
      const cm = skill.consumeMark;
      const took = cm && tgt.state !== MS_DEAD ? this.takeMonMark(p, tgt, cm.id) : 0;
      const stunSec =
        (rs.variant?.stun ?? skill.stun ?? 0) + (skill.id === 'skl_dich_son_xung' ? c.stats.setFx.dichSonStun : 0) + (took ? (cm?.stun ?? 0) : 0);
      if (stunSec > 0 && tgt.state !== MS_DEAD) this.stunMonster(p, tgt, stunSec);
      if (took && cm) {
        if (cm.res) this.addRes(p, cm.res);
        if (cm.then && tgt.state !== MS_DEAD && this.payRes(p, cm.then.resCost)) this.markMon(p, tgt, cm.then.mark);
      }
      // Dịch Sơn Xung: đẩy (hoặc kéo) mục tiêu.
      if (def.push && pullOnly) {
        // Kéo cả cụm quanh mục tiêu (4 m) về phía người ra chiêu, mục tiêu chính sát nhất.
        const near = this.monstersNear(tgt.s.x, tgt.s.z, 4, tgt);
        for (const o of [tgt, ...near]) if (o.state !== MS_DEAD) this.pushMonster(o, p.move.x, p.move.z, -def.push);
      } else if (def.push && tgt.state !== MS_DEAD) this.pushMonster(tgt, p.move.x, p.move.z, def.push);
    }
    p.flow.opened.set(skill.id, this.c.now);
    this.c.sendCd(p);
  }

  /** Đang ngự kiếm hoặc lơ lửng cao hơn mặt đất (vừa tắt ngự kiếm, đang rơi): không được ra chiêu. */
  airborne(p: PlayerEnt): boolean {
    return p.move.flying || p.move.y - this.c.terrain.groundAt(p.move.x, p.move.z) > AIRBORNE_HEIGHT;
  }

  /** Tầm chiêu của người chơi: đan sư xa hơn (nội tại `rangeBonus`), chỉ chiêu đánh. */
  skillRange(p: PlayerEnt, skill: SkillDef): number {
    const b = passiveOf(p.char.meta)?.rangeBonus ?? 0;
    // Bộ Lạc Kiếm bậc 2 (4 món, E2-F): Hoành Kiếm Phá Mạch xa thêm `hoanhKiemReach` mét.
    const set = skill.id === 'skl_hoanh_kiem_pha_mach' ? p.char.stats.setFx.hoanhKiemReach : 0;
    return skill.range > 0 && needsTarget(skill) ? skill.range + b + set : skill.range;
  }

  inRange(p: PlayerEnt, mon: MonEnt, range: number): boolean {
    const dx = mon.s.x - p.move.x;
    const dz = mon.s.z - p.move.z;
    const dy = mon.s.y - p.move.y;
    const r = range + 1.5 + mon.def.scale;
    return dx * dx + dz * dz + dy * dy * 0.25 <= r * r;
  }

  inRangeP(p: PlayerEnt, o: PlayerEnt, range: number): boolean {
    const dx = o.move.x - p.move.x;
    const dz = o.move.z - p.move.z;
    const dy = o.move.y - p.move.y;
    const r = range + 2;
    return dx * dx + dz * dz + dy * dy * 0.25 <= r * r;
  }

  cancelCast(p: PlayerEnt): void {
    if (!p.casting) return;
    p.casting = null;
    this.c.setFlag(p, PF_CASTING, false);
    this.c.fx({ t: 'castend', src: p.sid });
    this.c.sys(p, 'sys.cast_cancel', undefined, 'bad');
  }

  finishCast(p: PlayerEnt): void {
    const cast = p.casting;
    if (!cast) return;
    p.casting = null;
    this.c.setFlag(p, PF_CASTING, false);
    const mon = this.c.monById.get(cast.target);
    if (!mon && cast.target) {
      // Đang niệm lên đối thủ tỉ thí: trận phải còn và đối thủ còn trong tầm.
      const foe = this.c.duel.foeOf(p);
      if (this.airborne(p) || !foe || foe.sid !== cast.target || !this.inRangeP(p, foe, cast.skill.range * 1.3)) {
        this.c.fx({ t: 'castend', src: p.sid });
        return;
      }
      if (p.char.mp < cast.skill.mp) return;
      return this.executeSkill(p, cast.skill, cast.target);
    }
    if (this.airborne(p) || (cast.target && (!mon || mon.state === MS_DEAD || !this.inRange(p, mon, cast.skill.range * 1.3)))) {
      this.c.fx({ t: 'castend', src: p.sid });
      return;
    }
    if (p.char.mp < cast.skill.mp) return;
    this.executeSkill(p, cast.skill, cast.target);
  }

  /** Thông tin hình cho FX chiêu: biến thức, cấp chiêu, màu công pháp. Chỉ là lớp hình. */
  fxTag(p: PlayerEnt, rs: ReturnType<typeof resolveFor>): Partial<FxMsg> {
    const o: Partial<FxMsg> = {};
    if (rs.variant) o.v = rs.variant.fx;
    if (rs.level > 1) o.lv = rs.level;
    const m = methodOf(p.char.meta);
    if (m) o.c = m.color;
    return o;
  }

  // ---------- tài nguyên riêng (VS-2a): Kiếm ý / Huyết khí / Đan hỏa ----------

  /** Lượng tài nguyên đang có (đã tính rụng theo thời gian); chưa có công pháp thì 0. */
  liveRes(p: PlayerEnt): number {
    const def = resourceOf(p.char.meta);
    return def ? resNow(def, p.mth.res, p.mth.resAt, this.c.now) : 0;
  }

  /** Tài nguyên đang đầy (Kiếm ý đầy: bạo kích cộng thêm). */
  resFull(p: PlayerEnt): boolean {
    const def = resourceOf(p.char.meta);
    return !!def && this.liveRes(p) >= resMax(def);
  }

  /** Tích `n` điểm tài nguyên; mỗi lần tích làm mới mốc rụng. */
  addRes(p: PlayerEnt, n: number): void {
    const def = resourceOf(p.char.meta);
    if (!def || !(n > 0)) return;
    p.mth.res = resAdd(def, this.liveRes(p), n);
    p.mth.resAt = this.c.now;
    p.mth.dirty = true;
  }

  /** Nhận `dmg` sát thương (đã trừ khiên): Hộ pháp tích Huyết khí. */
  resTaken(p: PlayerEnt, dmg: number): void {
    const def = resourceOf(p.char.meta);
    if (def) this.addRes(p, resFromTaken(def, dmg, p.char.mhp));
  }

  /** Một nhịp sát thương theo thời gian (mộc độc, thiêu đốt) của `p` vừa nổ: Đan sư tích Đan hỏa. */
  resDot(p: PlayerEnt): void {
    const g = resourceOf(p.char.meta)?.gain.dot;
    if (g) this.addRes(p, g);
  }

  /**
   * Hồi `n` khí huyết cho `o` và báo số hồi; trả phần hồi thật (không tính phần tràn).
   * `by`: người tạo ra lượng hồi, tích Đan hỏa theo phần hồi thật (hồi lên người đầy máu không cho gì).
   */
  healPlayer(o: PlayerEnt, n: number, by?: PlayerEnt | null): number {
    if (!(n > 0)) return 0;
    const real = Math.max(0, Math.min(o.char.mhp - o.char.hp, n));
    o.char.hp += real;
    this.c.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
    if (by && real > 0) {
      const def = resourceOf(by.char.meta);
      if (def) this.addRes(by, resFromHeal(def, real, o.char.mhp));
    }
    return real;
  }

  /**
   * Chiêu `skill` xả tài nguyên lúc áp: trả hệ số nhân hiệu quả (1 = không thưởng). Chiêu khai `res` đúng tài nguyên
   * của mình thì theo `res`; chiêu gây sát thương có hồi chiêu mà không khai thì theo luật `auto` của tài nguyên (Huyết khí).
   */
  spendRes(p: PlayerEnt, skill: SkillDef): { mul: number; spent: number } {
    const def = resourceOf(p.char.meta);
    if (!def) return { mul: 1, spent: 0 };
    const sp = resSpend(def, this.liveRes(p), skill.res, dealsDamage(skill) && skill.cd > 0);
    if (sp.spent <= 0) return { mul: 1, spent: 0 };
    p.mth.res = sp.left;
    // `sp.left` là lượng còn lại LÚC NÀY (đã trừ phần rụng): dời mốc để lần đọc sau không trừ phần rụng đó lần nữa.
    p.mth.resAt = resSpendAt(def, p.mth.resAt, this.c.now);
    p.mth.dirty = true;
    return { mul: sp.mul, spent: sp.spent };
  }

  /** Trả đúng `n` điểm tài nguyên nếu đủ (không đủ thì không trừ gì). */
  payRes(p: PlayerEnt, n: number): boolean {
    const cur = this.liveRes(p);
    const def = resourceOf(p.char.meta);
    if (!def || !(n > 0) || cur < n) return false;
    p.mth.res = cur - n;
    // Như `spendRes`: dời mốc để phần đã rụng không bị trừ lần nữa.
    p.mth.resAt = resSpendAt(def, p.mth.resAt, this.c.now);
    p.mth.dirty = true;
    return true;
  }

  // ---------- ấn trên mục tiêu (VS-2c) ----------

  /** Định nghĩa ấn `id` nếu `p` đặt/tiêu được: ấn có `method` thì chỉ người đang tu công pháp đó. */
  markFor(p: PlayerEnt, id: string): MarkDef | undefined {
    const def = MARK.get(id);
    return def && (!def.method || def.method === p.char.meta.method) ? def : undefined;
  }

  /** Đặt `n` tầng ấn của `p` lên quái. Không lên quái đã chết, bóng tâm ma của người khác hay quái đang miễn sát thương. */
  markMon(p: PlayerEnt, mon: MonEnt, id: string, n = 1, mul?: number): void {
    const def = this.markFor(p, id);
    if (!def || def.on !== 'mon') return;
    if (mon.state === MS_DEAD || (mon.owner && mon.owner !== p.sid) || this.c.now < mon.evadeUntil) return;
    markAdd(mon.marks, def, p.sid, n, this.c.now, { mul });
    mon.s.mk = packMarks(mon.marks, this.c.now);
    // Mất thế: quái thường choáng, thủ lĩnh cộng thanh phá thế (không choáng thủ lĩnh bằng ấn).
    if (def.onApply) {
      if (mon.def.boss) {
        if (def.onApply.posture) this.c.addPosture(mon, def.onApply.posture);
      } else if (def.onApply.stun) this.stunMonster(p, mon, def.onApply.stun);
    }
  }

  /** Tiêu ấn `id` của `p` trên quái; trả số tầng đã tiêu. */
  takeMonMark(p: PlayerEnt, mon: MonEnt, id: string): number {
    const def = this.markFor(p, id);
    if (!def || !mon.marks.length) return 0;
    const n = markTake(mon.marks, def.id, p.sid, this.c.now);
    mon.s.mk = packMarks(mon.marks, this.c.now);
    return n;
  }

  /** Đặt ấn của `p` lên đạo hữu `o` (kể cả chính mình). */
  markAlly(p: PlayerEnt, o: PlayerEnt, id: string, n = 1): void {
    const def = this.markFor(p, id);
    if (!def || def.on !== 'ally' || !this.canAssist(p, o)) return;
    markAdd(o.marks, def, p.sid, n, this.c.now);
    o.s.mk = packMarks(o.marks, this.c.now);
  }

  /** Tiêu ấn `id` của `p` trên đạo hữu `o`; trả số tầng đã tiêu. */
  takeAllyMark(p: PlayerEnt, o: PlayerEnt, id: string): number {
    const def = this.markFor(p, id);
    if (!def || !o.marks.length) return 0;
    const n = markTake(o.marks, def.id, p.sid, this.c.now);
    o.s.mk = packMarks(o.marks, this.c.now);
    return n;
  }

  /** Người (kể cả mình) trong `r` mét đang mang ấn `id` do `p` đặt và còn nhận hỗ trợ được. */
  allyBearers(p: PlayerEnt, id: string, r: number): PlayerEnt[] {
    const def = this.markFor(p, id);
    if (!def) return [];
    const out: PlayerEnt[] = [];
    for (const o of this.c.players.values()) {
      if (!o.marks.length || markCount(o.marks, def.id, p.sid, this.c.now) <= 0) continue;
      if (!this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
      out.push(o);
    }
    return out;
  }

  /** Đan Hỏa Phong Tràn: tiêu Mộc ấn của `p`, mỗi người mang ấn nổ một vòng quanh họ (sát thương của `p`). */
  burstAllyMarks(p: PlayerEnt, skill: SkillDef, cm: ConsumeMark, elemMul: number, tag: Partial<FxMsg>): void {
    if (!cm.burst) return;
    for (const o of this.allyBearers(p, cm.id, MARK_ALLY_RANGE)) {
      if (this.takeAllyMark(p, o, cm.id) <= 0) continue;
      this.c.fx({ t: skill.fx, src: p.sid, x: o.move.x, y: o.move.y, z: o.move.z, r: cm.burst.r, sd: visualSeed(), ...tag });
      for (const m of this.monstersNear(o.move.x, o.move.z, cm.burst.r)) this.c.hitMonster(p, m, cm.burst.mul, elemMul, skill.elem);
    }
  }

  /** Điểm `skill` tích cho tài nguyên của `p` mỗi lần áp (đòn thường theo `gain.basic`, chiêu khác theo `res.gain`). */
  resGainOf(p: PlayerEnt, skill: SkillDef): number {
    const def = resourceOf(p.char.meta);
    if (!def) return 0;
    return (skill.combo ? (def.gain.basic ?? 0) : 0) + (skill.res?.id === def.id ? (skill.res.gain ?? 0) : 0);
  }

  /** Đòn của chiêu `skill` lên `mon`: trúng đích thì tích tài nguyên theo chiêu. */
  strike(p: PlayerEnt, mon: MonEnt, skill: SkillDef, power: number, elemMul: number): void {
    if (this.c.hitMonster(p, mon, power, elemMul, skill.elem)) this.addRes(p, this.resGainOf(p, skill));
  }

  gainCharge(p: PlayerEnt, n: number): void {
    if (!p.char.meta.method || !(n > 0) || p.mth.charge >= CHARGE_MAX) return;
    p.mth.charge = addCharge(p.mth.charge, n);
    p.mth.dirty = true;
  }

  /** Đạo hữu ngã gần nhất trong `r` mét (không phải mình). */
  reviveTarget(p: PlayerEnt, r: number, except?: PlayerEnt): PlayerEnt | null {
    let best: PlayerEnt | null = null;
    let bd = r * r;
    for (const o of this.c.players.values()) {
      if (o === p || o === except || !this.c.isDead(o)) continue;
      const dx = o.move.x - p.move.x;
      const dz = o.move.z - p.move.z;
      const d = dx * dx + dz * dz;
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /**
   * Có được hỗ trợ (hồi, khiên, đan dược) lên `o` không: còn sống, và không đang độ kiếp hay thử thách tâm ma
   * (các thử thách này phải tự vượt, người khác không can thiệp). Chính mình luôn được.
   */
  canAssist(p: PlayerEnt, o: PlayerEnt): boolean {
    return o === p || (!this.c.isDead(o) && !o.trib && !o.trial && !this.c.duel.inDuel(o));
  }

  /** Đạo hữu còn sống gần nhất trong `r` mét (không phải mình). */
  nearestAlly(p: PlayerEnt, r: number): PlayerEnt | null {
    let best: PlayerEnt | null = null;
    let bd = r * r;
    for (const o of this.c.players.values()) {
      if (o === p || !this.canAssist(p, o)) continue;
      const dx = o.move.x - p.move.x;
      const dz = o.move.z - p.move.z;
      const d = dx * dx + dz * dz;
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** Quái sống thứ hai nằm phía sau mục tiêu trên đường từ người đánh (biến thức xuyên). */
  pierceTarget(p: PlayerEnt, mon: MonEnt): MonEnt | null {
    const dx = mon.s.x - p.move.x;
    const dz = mon.s.z - p.move.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    let best: MonEnt | null = null;
    let bd = 8 * 8;
    for (const o of this.c.monsters) {
      if (o === mon || o.state === MS_DEAD) continue;
      const ox = o.s.x - mon.s.x;
      const oz = o.s.z - mon.s.z;
      const along = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (along <= 0 || along > 8 || side > 2.5) continue;
      const d = ox * ox + oz * oz;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** Quái sống trong `r` mét quanh (x, z), trừ `except`, gần nhất trước. */
  monstersNear(x: number, z: number, r: number, except?: MonEnt): MonEnt[] {
    const out: { m: MonEnt; d: number }[] = [];
    for (const o of this.c.monsters) {
      if (o === except || o.state === MS_DEAD || o.owner) continue;
      const d = (o.s.x - x) ** 2 + (o.s.z - z) ** 2;
      if (d <= r * r) out.push({ m: o, d });
    }
    return out.sort((a, b) => a.d - b.d).map((e) => e.m);
  }

  /** Quái bị khiêu khích: vào trận ngay nếu đang rảnh. */
  aggroMonster(mon: MonEnt, p: PlayerEnt, assist = false): void {
    if (mon.state === MS_IDLE || (mon.state === MS_RETURN && this.c.homeDist(mon) < LEASH * 0.7)) {
      this.c.resetAi(mon);
      mon.target = p.sid;
      mon.state = MS_CHASE;
      mon.s.st = MS_CHASE;
      mon.unreachableSince = 0;
      // Cụm cùng đánh: đồng bọn đang rảnh trong 14 m cũng lao vào.
      if (mon.camp && !assist) {
        for (const o of [...mon.camp.melee, ...(mon.camp.ranged ? [mon.camp.ranged] : [])]) {
          if (o !== mon && o.state === MS_IDLE && Math.hypot(o.s.x - mon.s.x, o.s.z - mon.s.z) <= 14) this.aggroMonster(o, p, true);
        }
      }
    }
  }

  /** Choáng quái thường `sec` giây (tinh anh nửa, thủ lĩnh miễn; không lên bóng tâm ma của người khác, không khi quái đang miễn sát thương). */
  stunMonster(p: PlayerEnt, mon: MonEnt, sec: number): void {
    if (mon.def.boss || (mon.owner && mon.owner !== p.sid) || this.c.now < mon.evadeUntil) return;
    mon.stunUntil = Math.max(mon.stunUntil, this.c.now + sec * (mon.def.elite ? 500 : 1000));
    mon.cast = null;
    mon.windUntil = 0;
    mon.comboAt = 0;
    this.c.setMonFlags(mon, MF_STUN, mon.stunUntil);
  }

  /**
   * Đẩy quái ra xa (`dist` > 0) hoặc kéo tới điểm (fx, fz) (`dist` < 0), từng bước 1 m, dừng trước dốc đứng
   * (`DASH_MAX_SLOPE`, như lướt; vách mép bản đồ dựng cao nên cũng chặn). Thủ lĩnh miễn, tinh anh chỉ nửa quãng. Quái tự quay lại đánh nên không cần nối lại AI.
   */
  pushMonster(mon: MonEnt, fx: number, fz: number, dist: number): void {
    if (mon.state === MS_DEAD || mon.def.boss || mon.owner || this.c.now < mon.evadeUntil) return;
    let dx = mon.s.x - fx;
    let dz = mon.s.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const sign = dist < 0 ? -1 : 1;
    // Kéo thì dừng cách người ra chiêu 1,6 m + thân quái; đẩy thì đi đủ quãng (tinh anh một nửa).
    let left = Math.abs(dist) * (mon.def.elite ? 0.5 : 1);
    if (sign < 0) left = Math.min(left, Math.max(0, l - 1.6 - mon.def.scale));
    while (left > 1e-6) {
      const step = Math.min(1, left);
      const nx = mon.s.x + dx * sign * step;
      const nz = mon.s.z + dz * sign * step;
      const here = this.c.terrain.groundAt(mon.s.x, mon.s.z);
      const there = this.c.terrain.groundAt(nx, nz);
      if (Math.abs(there - here) > DASH_MAX_SLOPE * step) break;
      mon.s.x = nx;
      mon.s.z = nz;
      mon.s.y = there;
      left -= step;
    }
  }

  addHot(sid: string, perSec: number, sec: number, by?: PlayerEnt): void {
    // Mỗi người chỉ một dòng hồi theo thời gian từ cùng nguồn: dòng mới thay dòng cũ nếu mạnh hơn.
    const old = this.hots.find((h) => h.sid === sid);
    if (old && old.per > perSec && old.endAt > this.c.now + sec * 1000) return;
    if (old) this.hots.splice(this.hots.indexOf(old), 1);
    this.hots.push({ sid, nextAt: this.c.now + 1000, endAt: this.c.now + sec * 1000, per: perSec, by: by?.sid });
  }

  /**
   * Bộ Đan Tâm Y Bát (4 món): Hồi Nguyên Thuật hồi thêm cho đồng đội gần (`SET_HEAL_RADIUS` m), bằng tỉ lệ của lượng hồi bản thân.
   * `hotSec`: biến thức hồi dần thì đồng đội cũng nhận theo thời gian.
   */
  setHealShare(p: PlayerEnt, amount: number, hotSec = 0): void {
    const share = p.char.stats.setFx.healShare;
    if (!(share > 0) || amount <= 0) return;
    for (const o of this.c.players.values()) {
      if (o === p || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > SET_HEAL_RADIUS) continue;
      if (hotSec > 0) {
        this.addHot(o.sid, (amount * share) / hotSec, hotSec, p);
        continue;
      }
      this.healPlayer(o, Math.round(amount * share), p);
    }
  }

  executeSkill(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx = {}): void {
    this.commitSkill(p, skill, ctx);
    this.resolveSkill(p, skill, targetId, ctx);
  }

  /**
   * Trừ linh lực, đặt hồi chiêu, tiêu vòng sạc (chiêu tối thượng): tại lúc bấm (hoặc lúc niệm xong).
   * `ctx.mpMul`/`ctx.cdMul`: thưởng chuỗi chiêu (VS-2b). Trả linh lực đã trừ (để hoàn đúng khi đòn bị hủy).
   */
  commitSkill(p: PlayerEnt, skill: SkillDef, ctx: StrikeCtx = {}): number {
    const rs = resolveFor(p.char.meta, skill);
    const mp = Math.min(p.char.mp, Math.max(0, Math.ceil(skill.mp * (ctx.mpMul ?? 1))));
    p.char.mp -= mp;
    const cd = rs.cd * (ctx.cdMul ?? 1);
    if (cd > 0) p.cds.set(skill.id, this.c.now + cd * 1000);
    if (skill.ult) {
      p.mth.charge = 0;
      p.mth.lockCharge = true;
      p.mth.dirty = true;
    }
    p.lastCombatAt = this.c.now;
    return mp;
  }

  /** Áp hiệu quả của chiêu (sát thương, hồi, khiên...): tại `hitAt` hoặc ngay khi không có độ trễ. */
  resolveSkill(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx = {}): void {
    const c = p.char;
    this.c.clone.noteSkill(p, skill, targetId);
    const rs = resolveFor(c.meta, skill);
    const v = rs.variant;
    const pas = passiveOf(c.meta);
    const healMul = pas?.healMul;
    const tag = this.fxTag(p, rs);
    if (ctx.combo !== undefined) tag.n = ctx.combo;
    // Chiêu tối thượng nhiều mốc: giữ khóa vòng sạc tới đòn trễ cuối (không tự nạp lại vòng sạc của chính nó).
    let holdLock = 0;
    const elemMul = elemDamageMul(c.stats.elemDmg, skill.elem);
    // VS-2a: chiêu xả tài nguyên riêng lúc áp (Kiếm ý theo `res` của chiêu, Huyết khí theo luật `auto`, Đan hỏa cho chiêu hồi).
    const { mul: resMul, spent: resSpent } = this.spendRes(p, skill);
    let mul = dealsDamage(skill) ? resMul : 1;
    // VS-2c: ấn chiêu này đặt và tiêu (dữ liệu của chiêu; người không tu đúng công pháp của ấn thì `markFor` trả rỗng).
    const am = skill.applyMark;
    const cm = skill.consumeMark;
    // Chiêu không đánh (khiêu khích, hồi...) tích tài nguyên một lần lúc áp; chiêu `damage` tích theo từng nhát trúng (`strike`).
    if (skill.kind !== 'damage') this.addRes(p, this.resGainOf(p, skill));
    mul *= ctx.mul ?? 1;
    // Hệ số gốc (trước thưởng riêng của từng chiêu/bộ): kiếm ảnh dùng cái này để không nhân đôi thưởng của bộ trang bị.
    const mulBase = mul;
    if (needsTarget(skill) && targetId && !this.c.monById.has(targetId)) {
      const foe = this.c.players.get(targetId);
      if (foe && this.c.duel.foeOf(p) === foe) {
        this.c.fx({ t: skill.fx, src: p.sid, dst: foe.sid, x: foe.move.x, y: foe.move.y, z: foe.move.z, r: rs.radius ?? 0, ...tag });
        this.c.duelStrike(
          p,
          foe,
          rs.hits.map((h) => h * mul),
          elemMul,
        );
      }
      if (skill.ult) {
        p.mth.lockCharge = false;
        p.mth.charge = 0;
      }
      this.c.sendCd(p);
      return;
    }
    switch (skill.kind) {
      case 'damage': {
        const mon = this.c.monById.get(targetId);
        if (!mon) break;
        if (skill.blink) {
          // Không thuấn di tới bóng/phân thân của người khác hay quái đang bỏ chạy (evade): tránh dịch chuyển miễn phí.
          if (!(mon.owner && mon.owner !== p.sid) && this.c.now >= mon.evadeUntil)
            this.blinkNear(p, mon.s.x, mon.s.z, skill.blink.stop + mon.def.scale);
          // Bộ Trấn Khích bậc 5 (4 món): Thuấn Di Trảm gây thêm `thuanTramPower` sát thương.
          mul *= 1 + c.stats.setFx.thuanTramPower;
        }
        const extra: Partial<FxMsg> = { ...tag };
        const behind = v?.pierce ? this.pierceTarget(p, mon) : null;
        if (behind) {
          extra.x = behind.s.x;
          extra.z = behind.s.z;
        }
        this.c.fx(
          skill.fx === 'thunder'
            ? { t: skill.fx, src: p.sid, dst: mon.id, sd: visualSeed(), ...extra }
            : { t: skill.fx, src: p.sid, dst: mon.id, ...extra },
        );
        // VS-2c: tiêu ấn của mình trên mục tiêu trước (thưởng theo số tầng), rồi mới đặt ấn mới.
        const took = cm ? this.takeMonMark(p, mon, cm.id) : 0;
        if (cm && took > 0) {
          if (cm.perMark) mul *= 1 + cm.perMark * took;
          if (cm.res) this.addRes(p, cm.res);
          const extraHit = cm.extraHit;
          if (extraHit) {
            // Mỗi tầng bắn thêm một nhát, cách nhau 0,15 giây, không hưởng thưởng chuỗi/xả tài nguyên của nhát chính.
            for (let k = 1; k <= took; k++) {
              this.later(0.15 * k, () => {
                if (this.c.players.get(p.sid) !== p || this.c.isDead(p) || this.airborne(p) || mon.state === MS_DEAD) return;
                this.c.fx({ t: skill.fx, src: p.sid, dst: mon.id, ...tag });
                this.c.hitMonster(p, mon, rs.power * extraHit, elemMul, skill.elem);
              });
            }
            holdLock = Math.max(holdLock, 0.15 * took);
          }
        }
        if (am && !am.last) {
          // Phi Kiếm Truy Hồn: biến thức "ấn sâu" cộng vào hệ số của ấn, biến thức "lan" đặt thêm lên quái gần.
          const amp = MARK.get(am.id)?.amp;
          const mm = amp !== undefined && v?.markBonus ? amp + v.markBonus : undefined;
          this.markMon(p, mon, am.id, am.n, mm);
          if (v?.markSpread) {
            for (const o of this.monstersNear(mon.s.x, mon.s.z, 8, mon).slice(0, v.markSpread)) this.markMon(p, o, am.id, am.n, mm);
          }
        }
        // Đánh trước rồi mới phá chú: phần cộng sát thương khi choáng chỉ áp cho các đòn sau.
        const offs = hitOffsets(skill, rs.hits.length);
        rs.hits.forEach((h, i) => {
          const off = offs[i] ?? 0;
          const last = i === rs.hits.length - 1;
          if (off <= 0) {
            this.strike(p, mon, skill, h * mul, elemMul);
            if (last && am?.last) this.markMon(p, mon, am.id, am.n);
            if (last && v?.knock) this.pushMonster(mon, p.move.x, p.move.z, v.knock);
            return;
          }
          this.later(off, () => {
            // Người ra chiêu phải còn trong room, còn sống, chưa bay lên; quái chưa chết.
            if (this.c.players.get(p.sid) === p && !this.c.isDead(p) && !this.airborne(p) && mon.state !== MS_DEAD) {
              this.strike(p, mon, skill, h * mul, elemMul);
              if (last && am?.last) this.markMon(p, mon, am.id, am.n);
              if (last && v?.knock) this.pushMonster(mon, p.move.x, p.move.z, v.knock);
            }
          });
          holdLock = Math.max(holdLock, off);
        });
        // Bộ Lạc Kiếm Môn Phục (4 món): Phi Kiếm có xác suất bắn thêm một thanh (server roll, không tin client).
        if (skill.id === 'skl_phi_kiem' && c.stats.setFx.phiKiemExtra > 0 && Math.random() < c.stats.setFx.phiKiemExtra) {
          this.c.fx({ t: skill.fx, src: p.sid, dst: mon.id, ...tag });
          this.c.hitMonster(p, mon, rs.power * mul, elemMul, skill.elem);
        }
        if (behind && v?.pierce) this.c.hitMonster(p, behind, rs.power * v.pierce * mul, elemMul, skill.elem);
        // Thuấn Di Trảm A: đòn tức thời hạ được mục tiêu thì hoàn một phần hồi chiêu.
        if (skill.blink && v?.refund && mon.state === MS_DEAD && rs.cd > 0) p.cds.set(skill.id, this.c.now + rs.cd * 1000 * (1 - v.refund));
        if (v?.cleave) {
          for (const o of this.monstersNear(mon.s.x, mon.s.z, v.cleave.r, mon))
            this.c.hitMonster(p, o, rs.power * v.cleave.mul * mul, elemMul, skill.elem);
        }
        if (v?.trail) {
          this.trails.push({
            owner: p.sid,
            x: mon.s.x,
            z: mon.s.z,
            r: v.trail.r,
            nextAt: this.c.now + 1000,
            endAt: this.c.now + v.trail.dur * 1000,
            power: rs.power * v.trail.mul,
          });
        }
        if (skill.interrupt) this.c.tryInterrupt(p, mon, v?.stunOnInterrupt ?? 0);
        break;
      }
      case 'aoe': {
        const mon = this.c.monById.get(targetId);
        if (!mon && !skill.self) break;
        const r = rs.radius ?? 8;
        const cx = skill.self || !mon ? p.move.x : mon.s.x;
        const cz = skill.self || !mon ? p.move.z : mon.s.z;
        this.c.fx({
          t: skill.fx,
          src: p.sid,
          ...(skill.self || !mon ? {} : { dst: mon.id }),
          x: cx,
          y: skill.self || !mon ? p.move.y : mon.s.y,
          z: cz,
          r,
          sd: visualSeed(),
          ...tag,
        });
        const stun = v?.noStun ? 0 : (v?.stun ?? skill.stun ?? 0);
        const burn = skill.burn ? { per: Math.max(1, Math.round(c.atk * skill.burn.mul)), dur: skill.burn.dur * (v?.burnMul ?? 1) } : null;
        for (const o of this.c.monsters) {
          if (o.state === MS_DEAD || (o.owner && o.owner !== p.sid)) continue;
          const dx = o.s.x - cx;
          const dz = o.s.z - cz;
          if (dx * dx + dz * dz > r * r) continue;
          // VS-2c: tiêu ấn của mình trên từng con (Vạn Kiếm: mỗi Kiếm ấn tăng sát thương lên con đó).
          const tookA = cm ? this.takeMonMark(p, o, cm.id) : 0;
          this.c.hitMonster(p, o, rs.power * mul * (tookA && cm?.perMark ? 1 + cm.perMark * tookA : 1), elemMul, skill.elem);
          if (o.state === MS_DEAD) continue;
          // Thiết Quyền: con mang Trấn ấn mà chiêu vừa xả đủ Huyết khí thì mất thế.
          if (tookA && cm?.then && resSpent >= cm.then.resCost) this.markMon(p, o, cm.then.mark);
          if (am) this.markMon(p, o, am.id, am.n);
          if (stun > 0) this.stunMonster(p, o, stun);
          if (v?.slow && !o.def.boss) o.slow = { until: this.c.now + v.slow.dur * 1000, mul: v.slow.mul };
          if (burn) o.poison = { sid: p.sid, until: this.c.now + burn.dur * 1000, nextAt: this.c.now + 1000, per: burn.per };
        }
        // Đan Hỏa Phong Tràn: Mộc ấn trên đạo hữu nổ thành sát thương quanh họ.
        if (cm?.burst) this.burstAllyMarks(p, skill, cm, elemMul, tag);
        // Thiên Kiếm Hóa Hình B: dư chấn đánh lại vùng cũ.
        if (v?.aftershocks) {
          const as = v.aftershocks;
          for (let i = 1; i <= as.n; i++) {
            this.later(as.gap * i, () => {
              if (this.c.players.get(p.sid) !== p || this.c.isDead(p) || this.airborne(p)) return;
              for (const o of this.c.monsters) {
                if (o.state === MS_DEAD || (o.owner && o.owner !== p.sid)) continue;
                if ((o.s.x - cx) ** 2 + (o.s.z - cz) ** 2 <= r * r) this.c.hitMonster(p, o, rs.power * as.mul * mul, elemMul, skill.elem);
              }
            });
          }
          holdLock = Math.max(holdLock, as.gap * as.n);
        }
        break;
      }
      case 'line': {
        const mon = this.c.monById.get(targetId);
        if (!mon) break;
        const def = skill.line ?? { len: 12, width: 3 };
        const len = def.len * (v?.lenMul ?? 1) + c.stats.setFx.hoanhKiemReach;
        // Bộ Lạc Kiếm bậc 2 (4 món): sát thương thêm `hoanhKiemPower`.
        mul *= 1 + c.stats.setFx.hoanhKiemPower;
        const dx = mon.s.x - p.move.x;
        const dz = mon.s.z - p.move.z;
        const dl = Math.hypot(dx, dz) || 1;
        const ux = dx / dl;
        const uz = dz / dl;
        this.c.fx({
          t: skill.fx,
          src: p.sid,
          dst: mon.id,
          x: p.move.x + ux * len,
          y: mon.s.y,
          z: p.move.z + uz * len,
          r: len,
          d: def.width,
          sd: visualSeed(),
          ...tag,
        });
        // Chốt danh sách mục tiêu lúc áp (mốc `hitAt`); các đợt sau đánh đúng những con đó nếu còn sống.
        const hit = this.c.monsters.filter(
          (o) =>
            o.state !== MS_DEAD &&
            !(o.owner && o.owner !== p.sid) &&
            inLine(p.move.x, p.move.z, ux, uz, len, def.width, o.s.x, o.s.z, o.def.scale),
        );
        const offs = hitOffsets(skill, rs.hits.length);
        rs.hits.forEach((h, i) => {
          const off = offs[i] ?? 0;
          const run = () => {
            for (const o of hit) if (o.state !== MS_DEAD) this.c.hitMonster(p, o, h * mul, elemMul, skill.elem);
          };
          if (off <= 0) return run();
          this.later(off, () => {
            if (this.c.players.get(p.sid) === p && !this.c.isDead(p) && !this.airborne(p)) run();
          });
          holdLock = Math.max(holdLock, off);
        });
        break;
      }
      case 'summon': {
        const sm = skill.summon ?? { count: 1, every: 1, range: 18 };
        const sec = rs.duration ?? 10;
        // Mỗi người một bộ kiếm đan: bộ mới thay bộ cũ.
        this.summons = this.summons.filter((o) => o.sid !== p.sid);
        this.summons.push({
          sid: p.sid,
          until: this.c.now + sec * 1000,
          nextAt: this.c.now + sm.every * 1000,
          every: sm.every,
          count: v?.count ?? sm.count,
          range: sm.range,
          power: rs.power * mul,
          markFirst: !!v?.markFirst,
          elem: skill.elem,
        });
        this.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: sec, n: v?.count ?? sm.count, ...tag });
        break;
      }
      case 'buff': {
        const sec = rs.duration ?? 10;
        const b = skill.buff ?? {};
        const reduce = (b.reduce ?? 0) + (v?.buffReduce ?? 0);
        if (reduce) p.mth.setGuard(this.c.now, reduce, sec);
        if (b.echo)
          this.echoes.set(p.sid, {
            until: this.c.now + sec * 1000,
            delay: v?.echoDelay ?? 0.4,
            hits: rs.hits.map((h) => h * (1 + c.stats.setFx.phanAnhPower)),
            elem: skill.elem ?? '',
          });
        const regen = v?.buffRegen ?? b.regen ?? 0;
        if (regen > 0) this.addHot(p.sid, p.char.mhp * regen, sec, p);
        const st = v?.buffStomp ?? b.stomp;
        this.stomps = this.stomps.filter((o) => o.sid !== p.sid);
        if (st)
          this.stomps.push({
            sid: p.sid,
            until: this.c.now + sec * 1000,
            nextAt: this.c.now + st.every * 1000,
            every: st.every,
            r: st.r,
            power: st.mul * (rs.power > 0 ? rs.power : 1),
          });
        this.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: sec, ...tag });
        break;
      }
      case 'heal': {
        // Đan sư xả Đan hỏa (`res.cost`) thì lượng hồi nhân `resMul`; chuỗi chiêu nhân thêm `ctx.mul`.
        const base = c.mhp * rs.power * resMul * (ctx.mul ?? 1);
        const recv = 1 + c.stats.healRecv;
        if (v?.hot) {
          this.addHot(p.sid, healAmount(base * v.hot.totalMul, healMul) / v.hot.dur, v.hot.dur, p);
          this.setHealShare(p, Math.round(healAmount(base * v.hot.totalMul, healMul)), v.hot.dur);
        } else {
          const n = Math.round(healAmount(base, healMul) * recv);
          this.healPlayer(p, n, p);
          this.setHealShare(p, n);
        }
        this.c.fx({ t: skill.fx, src: p.sid, ...tag });
        // VS-2c: tiêu Mộc ấn của mình: mọi đạo hữu mang ấn trong tầm được hồi theo (ấn trên chính mình chỉ bị tiêu).
        const shareHeal = cm?.heal;
        if (cm && shareHeal) {
          for (const o of this.allyBearers(p, cm.id, MARK_ALLY_RANGE)) {
            if (this.takeAllyMark(p, o, cm.id) <= 0 || o === p) continue;
            this.healPlayer(o, Math.round(healAmount(base, healMul) * shareHeal * (1 + o.char.stats.healRecv)), p);
            this.c.fx({ t: skill.fx, src: o.sid, dst: p.sid, ...tag });
          }
        }
        break;
      }
      case 'shield': {
        const dur = rs.duration ?? 8;
        // Thuấn Di Hộ Thế: thuấn di tới đồng đội gần nhất rồi phủ khiên cho cả hai.
        const blinkTo = skill.blinkAlly ? this.nearestAlly(p, skill.blinkAlly.range) : null;
        if (blinkTo) this.blinkNear(p, blinkTo.move.x, blinkTo.move.z, 1.8);
        const give = (o: PlayerEnt) => {
          o.shield = {
            amount: Math.round(
              o.char.mhp *
                rs.power *
                (v?.amountMul ?? 1) *
                (o === p && skill.id === 'skl_linh_khi_ho_the' ? 1 + c.stats.setFx.shieldBoost : 1) *
                (skill.id === 'skl_ngung_dan_ho_the' ? 1 + c.stats.setFx.ngungDanBoost : 1) *
                (skill.id === 'skl_thuan_di_ho_the' ? 1 + c.stats.setFx.thuanHoBoost : 1),
            ),
            until: this.c.now + dur * 1000,
          };
          this.c.setFlag(o, PF_SHIELD, true);
        };
        give(p);
        this.c.fx({ t: skill.fx, src: p.sid, d: dur, ...tag });
        if (skill.party) {
          if (v?.regen) this.addHot(p.sid, p.char.mhp * v.regen, dur, p);
          for (const o of this.c.players.values()) {
            if (o === p || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > skill.party) continue;
            give(o);
            if (v?.regen) this.addHot(o.sid, o.char.mhp * v.regen, dur, p);
            this.c.fx({ t: skill.fx, src: o.sid, dst: p.sid, d: dur, ...tag });
          }
        }
        if (blinkTo) {
          give(blinkTo);
          this.c.fx({ t: skill.fx, src: blinkTo.sid, dst: p.sid, d: dur, ...tag });
        }
        if (v?.tauntAt) {
          for (const o of this.monstersNear(p.move.x, p.move.z, v.tauntAt.r)) {
            o.taunt = { sid: p.sid, until: this.c.now + v.tauntAt.dur * 1000 * (o.def.boss ? TAUNT_BOSS_MUL : 1) };
            this.aggroMonster(o, p);
          }
        }
        const ally = v?.ally ? this.nearestAlly(p, v.ally) : null;
        if (ally) {
          give(ally);
          // `dst` = người ra tay: client vẽ luồng sáng truyền khiên từ người ấy sang đồng đội (chỉ lớp hình).
          this.c.fx({ t: skill.fx, src: ally.sid, dst: p.sid, d: dur, ...tag });
        }
        break;
      }
      case 'taunt': {
        const r = rs.radius ?? 12;
        const sec = (rs.duration ?? 5) * (v?.tauntMul ?? 1);
        this.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
        for (const o of this.monstersNear(p.move.x, p.move.z, r)) {
          o.taunt = { sid: p.sid, until: this.c.now + sec * 1000 * (o.def.boss ? TAUNT_BOSS_MUL : 1) };
          this.aggroMonster(o, p);
          this.c.hitMonster(p, o, rs.power * mul);
          if (am) this.markMon(p, o, am.id, am.n);
        }
        if (v?.tauntGuard) p.mth.setGuard(this.c.now, v.tauntGuard, 3);
        break;
      }
      case 'guard': {
        p.mth.setGuard(this.c.now, skill.reduce ?? 0.6, rs.duration ?? 6);
        // Bộ Hộ Pháp bậc 2 (4 món): phản thêm `kimChungReflect`.
        const refl = (v?.reflect ?? skill.reflect ?? 0) + (skill.id === 'skl_kim_chung_tran' ? c.stats.setFx.kimChungReflect : 0);
        if (refl) p.mth.setReflect(this.c.now, refl, rs.duration ?? 6);
        this.c.fx({ t: skill.fx, src: p.sid, d: rs.duration ?? 6, ...tag });
        if (v?.guardAlly) {
          for (const o of this.c.players.values()) {
            if (o === p || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > v.guardAlly.r) continue;
            o.mth.setGuard(this.c.now, v.guardAlly.reduce, rs.duration ?? 6);
          }
        }
        // Bộ Cổ Thành bậc 4 (4 món): Anh Thiết Thân: đồng đội trong 10 m cũng giảm `anhThietShare` sát thương nhận (người mặc không gánh hộ phần nào).
        const share = skill.id === 'skl_anh_thiet_than' ? c.stats.setFx.anhThietShare : 0;
        if (share > 0) {
          for (const o of this.c.players.values()) {
            if (o === p || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > 10) continue;
            o.mth.setGuard(this.c.now, share, rs.duration ?? 6);
          }
        }
        if (v?.tauntGuard) p.mth.setGuard(this.c.now, v.tauntGuard, 3);
        break;
      }
      case 'hot': {
        const r = (skill.allyRadius ?? 10) * (v?.healRadiusMul ?? 1);
        // Bộ Đan Sư bậc 2 (4 món): Mộc Linh Trận kéo dài thêm `mocLinhDur`, giữ nguyên lượng hồi/độc mỗi giây (tổng tăng theo).
        const durMul = skill.id === 'skl_moc_linh_tran' ? 1 + c.stats.setFx.mocLinhDur : 1;
        // Bộ Thần Tàng bậc 4 (4 món): Anh Dược Hóa Thân hồi thêm `anhDuocBoost`.
        const healBoost = skill.id === 'skl_anh_duoc_hoa_than' ? 1 + c.stats.setFx.anhDuocBoost : 1;
        const sec = (rs.duration ?? 6) * durMul;
        this.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
        // Anh Dược Hóa Thân: chỉ chữa mình và `allyCount` đồng đội mất nhiều máu nhất (tỉ lệ) trong tầm.
        const nAlly = skill.allyCount === undefined ? Infinity : (v?.allyCount ?? skill.allyCount);
        const chosen = new Set<PlayerEnt>();
        if (nAlly !== Infinity) {
          const near = [...this.c.players.values()].filter(
            (o) => o !== p && this.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= r,
          );
          near.sort((a, b) => a.char.hp / a.char.mhp - b.char.hp / b.char.mhp);
          for (const o of near.slice(0, nAlly)) chosen.add(o);
        }
        for (const o of this.c.players.values()) {
          if (!this.canAssist(p, o)) continue;
          if (nAlly !== Infinity) {
            if (o !== p && !chosen.has(o)) continue;
          } else if (o !== p && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
          if (v?.partyBuff) {
            // Buff chiêu tách khỏi buff đan: không merge vào `meta.buffs`, tự hết sau `sec` giây.
            const cur = o.char.skillBuff[v.partyBuff.kind];
            o.char.skillBuff[v.partyBuff.kind] = {
              m: Math.max(cur && cur.until > Date.now() ? cur.m : 0, v.partyBuff.pct),
              until: Date.now() + sec * 1000,
            };
            o.char.recalc();
            o.mth.dirty = true;
          }
          const total = healAmount(
            o.char.mhp * rs.power * durMul * healBoost * (ctx.mul ?? 1) * (o === p ? (v?.selfHealMul ?? 1) : 1),
            healMul,
          );
          this.addHot(o.sid, total / sec, sec, p);
          if (am) this.markAlly(p, o, am.id, am.n);
          if (v?.selfShield) {
            const amount = Math.round(o.char.mhp * v.selfShield);
            if (!o.shield || o.shield.amount < amount) {
              o.shield = { amount, until: this.c.now + 6000 };
              this.c.setFlag(o, PF_SHIELD, true);
            }
          }
        }
        // Mộc độc (đan sư): quái trong vùng chịu sát thương theo thời gian.
        if (skill.poison) {
          for (const o of this.monstersNear(p.move.x, p.move.z, skill.poison.r)) {
            if (o.owner && o.owner !== p.sid) continue;
            o.poison = {
              sid: p.sid,
              until: this.c.now + skill.poison.dur * durMul * 1000,
              nextAt: this.c.now + 1000,
              per: Math.max(1, Math.round(c.atk * skill.poison.mul * (v?.poisonMul ?? 1))),
            };
            this.aggroMonster(o, p);
          }
        }
        break;
      }
      case 'revive': {
        const r = skill.allyRadius ?? 14;
        const dead = this.reviveTarget(p, r);
        // Thuấn Di Cứu Viện: thuấn di tới người ngã (tính khoảng cách từ chỗ cũ) rồi hồi sinh.
        const dead2 = dead && (v?.reviveN ?? 1) >= 2 ? this.reviveTarget(p, r, dead) : null;
        if (dead && skill.blinkAlly) this.blinkNear(p, dead.move.x, dead.move.z, 1.8);
        this.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, ...tag });
        for (const dead of [dead2].filter((x): x is PlayerEnt => !!x)) {
          dead.char.hp = Math.max(
            1,
            Math.round(dead.char.mhp * (rs.power + (skill.id === 'skl_thuan_di_cuu_vien' ? c.stats.setFx.cuuVienBoost : 0))),
          );
          dead.s.fl = 0;
          dead.lastCombatAt = this.c.now;
          dead.hazardWin = { until: 0, taken: 0 };
          this.c.sys(dead, 'sys.revived', { name: c.name }, 'good');
          this.c.fx({ t: 'respawn', src: dead.sid, v: 'revive' });
        }
        if (dead) {
          dead.char.hp = Math.max(
            1,
            Math.round(dead.char.mhp * (rs.power + (skill.id === 'skl_thuan_di_cuu_vien' ? c.stats.setFx.cuuVienBoost : 0))),
          );
          dead.s.fl = 0;
          dead.lastCombatAt = this.c.now;
          dead.hazardWin = { until: 0, taken: 0 };
          this.c.sys(dead, 'sys.revived', { name: c.name }, 'good');
          this.c.fx({ t: 'respawn', src: dead.sid, v: 'revive' });
        }
        for (const o of this.c.players.values()) {
          if (o === dead || o === dead2 || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
          this.healPlayer(o, healAmount(o.char.mhp * 0.2, healMul), p);
        }
        break;
      }
    }
    // Phân Anh Kiếm Ảnh: kiếm ảnh lặp lại chiêu có hồi chiêu vừa tung vào mục tiêu chính (không lặp chính nó, không đánh thường).
    const ec = this.echoes.get(p.sid);
    if (ec) {
      if (this.c.now >= ec.until) this.echoes.delete(p.sid);
      else if (dealsDamage(skill) && skill.cd > 0 && targetId) {
        const em = this.c.monById.get(targetId);
        if (em) {
          ec.hits.forEach((f, i) => {
            this.later(ec.delay + i * 0.25, () => {
              if (
                this.c.players.get(p.sid) !== p ||
                this.c.isDead(p) ||
                this.airborne(p) ||
                em.state === MS_DEAD ||
                !this.inRange(p, em, this.skillRange(p, skill))
              )
                return;
              this.c.fx({ t: 'kiemanh', src: p.sid, dst: em.id });
              this.c.hitMonster(p, em, rs.power * f * mulBase, elemMul, ec.elem);
            });
          });
        }
      }
    }
    if (skill.ult && holdLock > 0) {
      this.later(holdLock + 0.02, () => {
        p.mth.lockCharge = false;
        p.mth.charge = 0;
      });
    } else if (skill.ult) {
      p.mth.lockCharge = false;
      p.mth.charge = 0;
    }
    p.flow.opened.set(skill.id, this.c.now);
    this.c.sendCd(p);
  }

  /**
   * Thuấn di (E4-G) tới sát điểm (tx, tz), cách `stop` mét. Vẫn lập đường bằng `planDash` nên không xuyên vách/dốc đứng;
   * đứng nguyên nếu không đi được. Trả khoảng đã dịch.
   */
  blinkNear(p: PlayerEnt, tx: number, tz: number, stop: number): number {
    const dx = tx - p.move.x;
    const dz = tz - p.move.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop + 0.5) return 0;
    const dir = { x: dx / d, z: dz / d };
    const from = { x: p.move.x, z: p.move.z };
    const plan = planDash(
      p.move,
      dir,
      Math.min(d - stop, 30),
      { x: tx, z: tz, r: stop },
      { terrain: this.c.terrain, bound: caveBoundOf(this.c.level), collision: collisionOf(this.c.level) },
    );
    if (plan.dist < 0.5) return 0;
    p.move.x = plan.x;
    p.move.z = plan.z;
    p.move.y = this.c.terrain.groundAt(plan.x, plan.z);
    p.move.vy = 0;
    p.move.grounded = true;
    p.inputs.length = 0;
    p.s.yaw = Math.atan2(dir.x, dir.z);
    this.c.fx({ t: 'blink', src: p.sid, x: plan.x, y: p.move.y, z: plan.z, d: 0.35, ox: from.x, oz: from.z });
    return plan.dist;
  }

  /** Chạy `fn` sau `sec` giây (đòn thứ hai trở đi của chiêu nhiều mốc `hitAt`). */
  later(sec: number, fn: () => void): void {
    this.delayed.push({ at: this.c.now + sec * 1000, fn });
  }

  /** Mỗi tick: hồi theo thời gian, vệt kiếm khí, kiếm ý/thế rụng. */
  tickMethods(): void {
    const now = this.c.now;
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (now < at(this.delayed, i).at) continue;
      this.delayed.splice(i, 1)[0]?.fn();
    }
    for (let i = this.hots.length - 1; i >= 0; i--) {
      const h = at(this.hots, i);
      const o = this.c.players.get(h.sid);
      if (!o || this.c.isDead(o) || now >= h.endAt + 5) {
        this.hots.splice(i, 1);
        continue;
      }
      while (now >= h.nextAt && h.nextAt <= h.endAt) {
        h.nextAt += 1000;
        const n = Math.round(h.per * (1 + o.char.stats.healRecv));
        if (n > 0 && o.char.hp < o.char.mhp) this.healPlayer(o, n, h.by ? this.c.players.get(h.by) : null);
      }
      if (h.nextAt > h.endAt) this.hots.splice(i, 1);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = at(this.trails, i);
      const owner = this.c.players.get(tr.owner);
      if (!owner || now >= tr.endAt + 5) {
        this.trails.splice(i, 1);
        continue;
      }
      while (now >= tr.nextAt && tr.nextAt <= tr.endAt) {
        tr.nextAt += 1000;
        for (const o of this.monstersNear(tr.x, tr.z, tr.r)) this.c.hitMonster(owner, o, tr.power);
      }
      if (tr.nextAt > tr.endAt) this.trails.splice(i, 1);
    }
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const sm = at(this.summons, i);
      const owner = this.c.players.get(sm.sid);
      if (!owner || this.c.isDead(owner) || now >= sm.until) {
        this.summons.splice(i, 1);
        continue;
      }
      while (now >= sm.nextAt) {
        sm.nextAt += sm.every * 1000;
        const near = this.monstersNear(owner.move.x, owner.move.z, sm.range);
        const marked = (o: MonEnt) => markCount(o.marks, 'truy_hon', sm.sid, now) > 0;
        const pool = sm.markFirst ? [...near.filter(marked), ...near.filter((o) => !marked(o))] : near;
        const em = elemDamageMul(owner.char.stats.elemDmg, sm.elem);
        for (const o of pool.slice(0, sm.count)) {
          this.c.fx({ t: 'kiemdan_hit', src: owner.sid, dst: o.id });
          this.c.hitMonster(owner, o, sm.power, em, sm.elem);
        }
      }
    }
    for (let i = this.stomps.length - 1; i >= 0; i--) {
      const st = at(this.stomps, i);
      const owner = this.c.players.get(st.sid);
      if (!owner || this.c.isDead(owner) || now >= st.until) {
        this.stomps.splice(i, 1);
        continue;
      }
      while (now >= st.nextAt) {
        st.nextAt += st.every * 1000;
        this.c.fx({ t: 'sonnhac_stomp', src: owner.sid, x: owner.move.x, y: owner.move.y, z: owner.move.z, r: st.r });
        for (const o of this.monstersNear(owner.move.x, owner.move.z, st.r))
          this.c.hitMonster(owner, o, st.power, elemDamageMul(owner.char.stats.elemDmg, 'tho'), 'tho');
      }
    }
    for (const p of this.c.players.values()) {
      const m = p.mth;
      const sbk = p.char.skillBuff;
      const nowMs = Date.now();
      let sbExpired = false;
      for (const k of ['atk', 'def'] as const) if (sbk[k] && sbk[k]!.until <= nowMs) (delete sbk[k], (sbExpired = true));
      if (pruneBuffs(p.char.meta, nowMs) || sbExpired) {
        p.char.recalc();
        m.dirty = true;
      }
      // Ấn trên người (VS-2c) hết hạn: dọn và cập nhật gói bit đồng bộ.
      if (p.marks.length && marksPrune(p.marks, now)) p.s.mk = packMarks(p.marks, now);
      // Tài nguyên đã rụng hết: dọn về 0 (client tự tính phần rụng từ `res`/`resAt`, không cần gửi lại từng nhịp).
      if (m.res > 0 && this.liveRes(p) <= 0) {
        m.res = 0;
        m.dirty = true;
      }
      if (m.guardUntil && now >= m.guardUntil) {
        m.guardUntil = 0;
        m.guardReduce = 0;
        m.dirty = true;
      }
      if (m.reflectUntil && now >= m.reflectUntil) {
        m.reflectUntil = 0;
        m.reflectMul = 0;
      }
    }
  }
}
