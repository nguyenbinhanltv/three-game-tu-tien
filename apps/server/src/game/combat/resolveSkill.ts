// Thân `CombatSystem.resolveSkill` (áp hiệu quả chiêu), tách khỏi index.ts ở Đợt E tối ưu mã nguồn; hành vi giữ nguyên.
import {
  formationAdd,
  mergeSlow,
  formationMarks,
  formationSpot,
  healAmount,
  type FxMsg,
  skillDamageMul,
  MS_DEAD,
  PF_SHIELD,
  type SkillDef,
  needsTarget,
  dealsDamage,
  inLine,
  hitOffsets,
  comboDefScale,
  inArc,
} from '@dtl/shared';
import { MARK, pathBasicOf } from '@dtl/content';
import { passiveOf, resolveFor } from '../method';
import type { PlayerEnt, StrikeCtx } from '../entities';
import { MARK_ALLY_RANGE, TAUNT_BOSS_MUL, visualSeed } from './consts';

import type { CombatSystem } from './index';

/** Áp hiệu quả của chiêu (sát thương, hồi, khiên...): tại `hitAt` hoặc ngay khi không có độ trễ. */
export function resolveSkillImpl(sys: CombatSystem, p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx = {}): void {
  const c = p.char;
  sys.c.clone.noteSkill(p, skill, targetId);
  const rs = resolveFor(c.meta, skill);
  const v = rs.variant;
  const pas = passiveOf(c.meta);
  const healMul = pas?.healMul;
  const tag = sys.fxTag(p, rs);
  if (ctx.combo !== undefined) tag.n = ctx.combo;
  // Chiêu tối thượng nhiều mốc: giữ khóa vòng sạc tới đòn trễ cuối (không tự nạp lại vòng sạc của chính nó).
  let holdLock = 0;
  const elemMul = skillDamageMul(c.stats, skill.elem);
  // VS-2a: chiêu xả tài nguyên riêng lúc áp (Kiếm ý theo `res` của chiêu, Huyết khí theo luật `auto`, Đan hỏa cho chiêu hồi).
  const { mul: resMul, spent: resSpent } = sys.spendRes(p, skill);
  // Chiêu gọi (`summon`) xả tài nguyên thì mỗi nhịp của vật gọi mạnh theo (Tát Đậu Thành Binh xả Hồn lực).
  let mul = dealsDamage(skill) || skill.kind === 'summon' || skill.kind === 'formation' ? resMul : 1;
  // VS-2c: ấn chiêu này đặt và tiêu (dữ liệu của chiêu; người không tu đúng công pháp của ấn thì `markFor` trả rỗng).
  const am = skill.applyMark;
  const cm = skill.consumeMark;
  // Chiêu không đánh (khiêu khích, hồi...) tích tài nguyên một lần lúc áp; chiêu `damage` tích theo từng nhát trúng (`strike`).
  if (skill.kind !== 'damage') sys.addRes(p, sys.resGainOf(p, skill));
  mul *= ctx.mul ?? 1;
  // Hệ số gốc (trước thưởng riêng của từng chiêu/bộ): kiếm ảnh dùng cái này để không nhân đôi thưởng của bộ trang bị.
  const mulBase = mul;
  if (needsTarget(skill) && targetId && !sys.c.monById.has(targetId)) {
    const foe = sys.c.players.get(targetId);
    if (foe && sys.c.duel.foeOf(p) === foe) {
      sys.c.fx({ t: skill.fx, src: p.sid, dst: foe.sid, x: foe.move.x, y: foe.move.y, z: foe.move.z, r: rs.radius ?? 0, ...tag });
      sys.c.duelStrike(
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
    sys.c.sendCd(p);
    return;
  }
  switch (skill.kind) {
    case 'damage': {
      const mon = sys.c.monById.get(targetId);
      if (!mon) break;
      if (skill.blink) {
        // Không thuấn di tới bóng/phân thân của người khác hay quái đang bỏ chạy (evade): tránh dịch chuyển miễn phí.
        if (!(mon.owner && mon.owner !== p.sid) && sys.c.now >= mon.evadeUntil)
          sys.blinkNear(p, mon.s.x, mon.s.z, skill.blink.stop + mon.def.scale);
        // Bộ Trấn Khích bậc 5 (4 món): Thuấn Di Trảm gây thêm `thuanTramPower` sát thương.
        mul *= 1 + c.stats.setFx.thuanTramPower;
      }
      const extra: Partial<FxMsg> = { ...tag };
      const behind = v?.pierce ? sys.pierceTarget(p, mon) : null;
      if (behind) {
        extra.x = behind.s.x;
        extra.z = behind.s.z;
      }
      sys.c.fx(
        skill.fx === 'thunder'
          ? { t: skill.fx, src: p.sid, dst: mon.id, sd: visualSeed(), ...extra }
          : { t: skill.fx, src: p.sid, dst: mon.id, ...extra },
      );
      // VS-2f: hợp kích Phá Thế Trảm (mục tiêu mang Mất thế của đồng đội, chiêu này vừa xả tài nguyên).
      mul *= sys.jointHit(p, mon, resSpent);
      // VS-2c: tiêu ấn của mình trên mục tiêu trước (thưởng theo số tầng), rồi mới đặt ấn mới.
      const took = cm ? sys.takeMonMark(p, mon, cm.id) : 0;
      if (cm && took > 0) {
        if (cm.perMark) mul *= 1 + cm.perMark * took;
        if (cm.res) sys.addRes(p, cm.res);
        const extraHit = cm.extraHit;
        if (extraHit) {
          // Mỗi tầng bắn thêm một nhát, cách nhau 0,15 giây, không hưởng thưởng chuỗi/xả tài nguyên của nhát chính.
          for (let k = 1; k <= took; k++) {
            sys.later(0.15 * k, () => {
              if (sys.c.players.get(p.sid) !== p || sys.c.isDead(p) || sys.airborne(p) || mon.state === MS_DEAD) return;
              sys.c.fx({ t: skill.fx, src: p.sid, dst: mon.id, ...tag });
              sys.c.hitMonster(p, mon, rs.power * extraHit, elemMul, skill.elem);
            });
          }
          holdLock = Math.max(holdLock, 0.15 * took);
        }
      }
      if (am && !am.last) {
        // Phi Kiếm Truy Hồn: biến thức "ấn sâu" cộng vào hệ số của ấn, biến thức "lan" đặt thêm lên quái gần.
        const amp = MARK.get(am.id)?.amp;
        const mm = amp !== undefined && v?.markBonus ? amp + v.markBonus : undefined;
        sys.markMon(p, mon, am.id, am.n, mm);
        if (v?.markSpread) {
          for (const o of sys.monstersNear(mon.s.x, mon.s.z, 8, mon).slice(0, v.markSpread)) sys.markMon(p, o, am.id, am.n, mm);
        }
      }
      // Đòn thường chém quét của hướng cận chiến: quái khác trong cung trước mặt (hướng người đánh → mục tiêu LÚC TRÚNG, do server tính) nhận
      // `arc.mul` lần đòn chính. Phòng ngự nhân cùng tỉ lệ đòn chuỗi (`comboDefScale`); không tích tài nguyên, không đẩy lùi riêng.
      const arc = pathBasicOf(skill, c.meta.method)?.arc;
      if (arc) {
        const fx = mon.s.x - p.move.x;
        const fz = mon.s.z - p.move.z;
        const base = (rs.hits[0] ?? rs.power) * mul * arc.mul;
        for (const o of [...sys.c.monsters]) {
          if (o === mon || o.state === MS_DEAD) continue;
          if (!inArc(p.move.x, p.move.z, fx, fz, o.s.x, o.s.z, arc.r, arc.deg, o.def.scale)) continue;
          sys.c.hitMonster(p, o, base, elemMul, skill.elem, undefined, comboDefScale(skill, ctx.combo));
        }
      }
      // Đánh trước rồi mới phá chú: phần cộng sát thương khi choáng chỉ áp cho các đòn sau.
      const offs = hitOffsets(skill, rs.hits.length);
      rs.hits.forEach((h, i) => {
        const off = offs[i] ?? 0;
        const last = i === rs.hits.length - 1;
        if (off <= 0) {
          sys.strike(p, mon, skill, h * mul, elemMul, ctx.combo);
          if (last && am?.last) sys.markMon(p, mon, am.id, am.n);
          if (last && v?.knock) sys.pushMonster(mon, p.move.x, p.move.z, v.knock);
          return;
        }
        sys.later(off, () => {
          // Người ra chiêu phải còn trong room, còn sống, chưa bay lên; quái chưa chết.
          if (sys.c.players.get(p.sid) === p && !sys.c.isDead(p) && !sys.airborne(p) && mon.state !== MS_DEAD) {
            sys.strike(p, mon, skill, h * mul, elemMul, ctx.combo);
            if (last && am?.last) sys.markMon(p, mon, am.id, am.n);
            if (last && v?.knock) sys.pushMonster(mon, p.move.x, p.move.z, v.knock);
          }
        });
        holdLock = Math.max(holdLock, off);
      });
      // Bộ Lạc Kiếm Môn Phục (4 món): Phi Kiếm có xác suất bắn thêm một thanh (server roll, không tin client).
      if (skill.id === 'skl_phi_kiem' && c.stats.setFx.phiKiemExtra > 0 && Math.random() < c.stats.setFx.phiKiemExtra) {
        sys.c.fx({ t: skill.fx, src: p.sid, dst: mon.id, ...tag });
        sys.c.hitMonster(p, mon, rs.power * mul, elemMul, skill.elem);
      }
      if (behind && v?.pierce) sys.c.hitMonster(p, behind, rs.power * v.pierce * mul, elemMul, skill.elem);
      // Thuấn Di Trảm A: đòn tức thời hạ được mục tiêu thì hoàn một phần hồi chiêu.
      if (skill.blink && v?.refund && mon.state === MS_DEAD && rs.cd > 0) p.cds.set(skill.id, sys.c.now + rs.cd * 1000 * (1 - v.refund));
      if (v?.cleave) {
        for (const o of sys.monstersNear(mon.s.x, mon.s.z, v.cleave.r, mon))
          sys.c.hitMonster(p, o, rs.power * v.cleave.mul * mul, elemMul, skill.elem);
      }
      if (v?.trail) {
        sys.trails.push({
          owner: p.sid,
          x: mon.s.x,
          z: mon.s.z,
          r: v.trail.r,
          nextAt: sys.c.now + 1000,
          endAt: sys.c.now + v.trail.dur * 1000,
          power: rs.power * v.trail.mul,
        });
      }
      if (skill.interrupt) sys.c.tryInterrupt(p, mon, v?.stunOnInterrupt ?? 0);
      // VS-2e: chiêu đánh đơn có `stun` (Chấn Sơn Quyền) làm choáng quái thường; tinh anh nửa thời gian, thủ lĩnh miễn.
      if (skill.stun && mon.state !== MS_DEAD) sys.stunMonster(p, mon, skill.stun);
      break;
    }
    case 'aoe': {
      const mon = sys.c.monById.get(targetId);
      if (!mon && !skill.self) break;
      const r = rs.radius ?? 8;
      const cx = skill.self || !mon ? p.move.x : mon.s.x;
      const cz = skill.self || !mon ? p.move.z : mon.s.z;
      sys.c.fx({
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
      for (const o of sys.c.monsters) {
        if (o.state === MS_DEAD || (o.owner && o.owner !== p.sid)) continue;
        const dx = o.s.x - cx;
        const dz = o.s.z - cz;
        if (dx * dx + dz * dz > r * r) continue;
        // VS-2c: tiêu ấn của mình trên từng con (Vạn Kiếm: mỗi Kiếm ấn tăng sát thương lên con đó).
        const tookA = cm ? sys.takeMonMark(p, o, cm.id) : 0;
        const jm = sys.jointHit(p, o, resSpent);
        sys.c.hitMonster(p, o, rs.power * mul * jm * (tookA && cm?.perMark ? 1 + cm.perMark * tookA : 1), elemMul, skill.elem);
        if (o.state === MS_DEAD) continue;
        // Thiết Quyền: con mang Trấn ấn mà chiêu vừa xả đủ Huyết khí thì mất thế.
        if (tookA && cm?.then && resSpent >= cm.then.resCost) sys.markMon(p, o, cm.then.mark);
        if (am) sys.markMon(p, o, am.id, am.n);
        if (stun > 0) sys.stunMonster(p, o, stun);
        if (v?.slow && !o.def.boss) o.slow = mergeSlow(o.slow, { until: sys.c.now + v.slow.dur * 1000, mul: v.slow.mul }, sys.c.now);
        if (burn) o.poison = { sid: p.sid, until: sys.c.now + burn.dur * 1000, nextAt: sys.c.now + 1000, per: burn.per, kind: 'burn' };
      }
      // Đan Hỏa Phong Tràn: Mộc ấn trên đạo hữu nổ thành sát thương quanh họ.
      if (cm?.burst) sys.burstAllyMarks(p, skill, cm, elemMul, tag);
      // Thiên Kiếm Hóa Hình B: dư chấn đánh lại vùng cũ.
      if (v?.aftershocks) {
        const as = v.aftershocks;
        for (let i = 1; i <= as.n; i++) {
          sys.later(as.gap * i, () => {
            if (sys.c.players.get(p.sid) !== p || sys.c.isDead(p) || sys.airborne(p)) return;
            for (const o of sys.c.monsters) {
              if (o.state === MS_DEAD || (o.owner && o.owner !== p.sid)) continue;
              if ((o.s.x - cx) ** 2 + (o.s.z - cz) ** 2 <= r * r) sys.c.hitMonster(p, o, rs.power * as.mul * mul, elemMul, skill.elem);
            }
          });
        }
        holdLock = Math.max(holdLock, as.gap * as.n);
      }
      break;
    }
    case 'line': {
      const mon = sys.c.monById.get(targetId);
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
      sys.c.fx({
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
      const hit = sys.c.monsters.filter(
        (o) =>
          o.state !== MS_DEAD &&
          !(o.owner && o.owner !== p.sid) &&
          inLine(p.move.x, p.move.z, ux, uz, len, def.width, o.s.x, o.s.z, o.def.scale),
      );
      const offs = hitOffsets(skill, rs.hits.length);
      // VS-2f: hợp kích tính một lần cho mỗi con trong vệt, áp cho mọi đợt của chiêu.
      const jm = new Map(hit.map((o) => [o, sys.jointHit(p, o, resSpent)]));
      rs.hits.forEach((h, i) => {
        const off = offs[i] ?? 0;
        const run = () => {
          for (const o of hit) if (o.state !== MS_DEAD) sys.c.hitMonster(p, o, h * mul * (jm.get(o) ?? 1), elemMul, skill.elem);
        };
        if (off <= 0) return run();
        sys.later(off, () => {
          if (sys.c.players.get(p.sid) === p && !sys.c.isDead(p) && !sys.airborne(p)) run();
        });
        holdLock = Math.max(holdLock, off);
      });
      // TN-2 (Âm Hồn Triều): chiêu quét đường đặt ấn lên mọi con trong vệt còn sống sau đợt đầu.
      if (am) for (const o of hit) if (o.state !== MS_DEAD) sys.markMon(p, o, am.id, am.n);
      break;
    }
    case 'stance': {
      // VS-2e: vào tư thế. Thanh chiêu đổi ô ở client theo tin `mth`; server chỉ giữ id và hạn, và kiểm ở `onSkill`.
      const st = skill.stance;
      if (!st) break;
      p.mth.stance = { id: skill.id, until: sys.c.now + st.dur * 1000 };
      if (st.reduce) p.mth.setGuard(sys.c.now, st.reduce, st.dur);
      p.mth.dirty = true;
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: st.dur, ...tag });
      break;
    }
    case 'formation': {
      // TN-8: đặt một thực thể trận lên đất. Server tính chỗ đặt (không nhận tọa độ từ client); mỗi người tối đa FORMATION_MAX trận.
      const fd = skill.formation;
      if (!fd) break;
      const spot = formationSpot(fd, p.move.x, p.move.z, p.s.yaw);
      const id = ++sys.formationSeq;
      const before = sys.formations;
      sys.formations = formationAdd(before, {
        id,
        sid: p.sid,
        skill: skill.id,
        mode: fd.mode,
        x: spot.x,
        z: spot.z,
        r: fd.r,
        armAt: sys.c.now + fd.arm * 1000,
        until: sys.c.now + fd.dur * 1000,
        nextAt: sys.c.now + (fd.arm + fd.every) * 1000,
        every: fd.every,
        power: rs.power * mul,
        slow: fd.slow,
        heal: fd.heal,
        mark: formationMarks(fd),
      });
      // Trận cũ nhất bị đẩy ra (đặt quá FORMATION_MAX): báo client dừng hình của nó.
      for (const old of before) if (!sys.formations.some((f) => f.id === old.id)) sys.endFormationFx(old);
      sys.c.fx({ t: skill.fx, src: p.sid, x: spot.x, y: p.move.y, z: spot.z, r: fd.r, d: fd.dur, ...tag });
      // Hình trận đứng trên đất: loại riêng theo kiểu trận (chiêu tư thế mượn `fx` của chiêu nền nên không dùng `skill.fx` để phân biệt).
      sys.c.fx({ t: `tran_${fd.mode}`, src: p.sid, x: spot.x, y: p.move.y, z: spot.z, r: fd.r, d: fd.dur, fid: id });
      break;
    }
    case 'summon': {
      const sm = skill.summon ?? { count: 1, every: 1, range: 18 };
      const sec = rs.duration ?? 10;
      // Mỗi người một bộ cho mỗi chiêu gọi: gọi lại đúng chiêu đó thì bộ mới thay bộ cũ, chiêu gọi khác (Cổ Triều rồi Hóa Cổ Vương) tồn tại song song.
      sys.summons = sys.summons.filter((o) => !(o.sid === p.sid && o.skill === skill.id));
      sys.summons.push({
        sid: p.sid,
        skill: skill.id,
        until: sys.c.now + sec * 1000,
        nextAt: sys.c.now + sm.every * 1000,
        every: sm.every,
        count: v?.count ?? sm.count,
        range: sm.range,
        power: rs.power * mul,
        markFirst: !!v?.markFirst,
        hitFx: `${skill.fx}_hit`,
        elem: skill.elem,
      });
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: sec, n: v?.count ?? sm.count, ...tag });
      break;
    }
    case 'buff': {
      const sec = rs.duration ?? 10;
      const b = skill.buff ?? {};
      const reduce = (b.reduce ?? 0) + (v?.buffReduce ?? 0);
      if (reduce) p.mth.setGuard(sys.c.now, reduce, sec);
      if (b.echo)
        sys.echoes.set(p.sid, {
          until: sys.c.now + sec * 1000,
          delay: v?.echoDelay ?? 0.4,
          hits: rs.hits.map((h) => h * (1 + c.stats.setFx.phanAnhPower)),
          elem: skill.elem ?? '',
        });
      const regen = v?.buffRegen ?? b.regen ?? 0;
      if (regen > 0) sys.addHot(p.sid, p.char.mhp * regen, sec, p);
      const st = v?.buffStomp ?? b.stomp;
      sys.stomps = sys.stomps.filter((o) => o.sid !== p.sid);
      if (st)
        sys.stomps.push({
          sid: p.sid,
          until: sys.c.now + sec * 1000,
          nextAt: sys.c.now + st.every * 1000,
          every: st.every,
          r: st.r,
          power: st.mul * (rs.power > 0 ? rs.power : 1),
        });
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: sec, ...tag });
      break;
    }
    case 'heal': {
      // Đan sư xả Đan hỏa (`res.cost`) thì lượng hồi nhân `resMul`; chuỗi chiêu nhân thêm `ctx.mul`.
      const base = c.mhp * rs.power * resMul * (ctx.mul ?? 1);
      const recv = 1 + c.stats.healRecv;
      if (v?.hot) {
        sys.addHot(p.sid, healAmount(base * v.hot.totalMul, healMul) / v.hot.dur, v.hot.dur, p);
        sys.setHealShare(p, Math.round(healAmount(base * v.hot.totalMul, healMul)), v.hot.dur);
      } else {
        const n = Math.round(healAmount(base, healMul) * recv);
        sys.healPlayer(p, n, p);
        sys.setHealShare(p, n);
      }
      sys.c.fx({ t: skill.fx, src: p.sid, ...tag });
      // VS-2c: tiêu Mộc ấn của mình: mọi đạo hữu mang ấn trong tầm được hồi theo (ấn trên chính mình chỉ bị tiêu).
      const shareHeal = cm?.heal;
      if (cm && shareHeal) {
        for (const o of sys.allyBearers(p, cm.id, MARK_ALLY_RANGE)) {
          if (sys.takeAllyMark(p, o, cm.id) <= 0 || o === p) continue;
          sys.healPlayer(o, Math.round(healAmount(base, healMul) * shareHeal * (1 + o.char.stats.healRecv)), p);
          sys.c.fx({ t: skill.fx, src: o.sid, dst: p.sid, ...tag });
        }
      }
      break;
    }
    case 'shield': {
      const dur = rs.duration ?? 8;
      // Thuấn Di Hộ Thế: thuấn di tới đồng đội gần nhất rồi phủ khiên cho cả hai.
      const blinkTo = skill.blinkAlly ? sys.nearestAlly(p, skill.blinkAlly.range) : null;
      if (blinkTo) sys.blinkNear(p, blinkTo.move.x, blinkTo.move.z, 1.8);
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
          until: sys.c.now + dur * 1000,
        };
        sys.c.setFlag(o, PF_SHIELD, true);
      };
      give(p);
      sys.c.fx({ t: skill.fx, src: p.sid, d: dur, ...tag });
      if (skill.party) {
        if (v?.regen) sys.addHot(p.sid, p.char.mhp * v.regen, dur, p);
        for (const o of sys.c.players.values()) {
          if (o === p || !sys.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > skill.party) continue;
          give(o);
          if (v?.regen) sys.addHot(o.sid, o.char.mhp * v.regen, dur, p);
          sys.c.fx({ t: skill.fx, src: o.sid, dst: p.sid, d: dur, ...tag });
        }
      }
      if (blinkTo) {
        give(blinkTo);
        sys.c.fx({ t: skill.fx, src: blinkTo.sid, dst: p.sid, d: dur, ...tag });
      }
      if (v?.tauntAt) {
        for (const o of sys.monstersNear(p.move.x, p.move.z, v.tauntAt.r)) {
          o.taunt = { sid: p.sid, until: sys.c.now + v.tauntAt.dur * 1000 * (o.def.boss ? TAUNT_BOSS_MUL : 1) };
          sys.aggroMonster(o, p);
        }
      }
      const ally = v?.ally ? sys.nearestAlly(p, v.ally) : null;
      if (ally) {
        give(ally);
        // `dst` = người ra tay: client vẽ luồng sáng truyền khiên từ người ấy sang đồng đội (chỉ lớp hình).
        sys.c.fx({ t: skill.fx, src: ally.sid, dst: p.sid, d: dur, ...tag });
      }
      break;
    }
    case 'taunt': {
      const r = rs.radius ?? 12;
      const sec = (rs.duration ?? 5) * (v?.tauntMul ?? 1);
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
      for (const o of sys.monstersNear(p.move.x, p.move.z, r)) {
        o.taunt = { sid: p.sid, until: sys.c.now + sec * 1000 * (o.def.boss ? TAUNT_BOSS_MUL : 1) };
        sys.aggroMonster(o, p);
        sys.c.hitMonster(p, o, rs.power * mul);
        if (am) sys.markMon(p, o, am.id, am.n);
      }
      if (v?.tauntGuard) p.mth.setGuard(sys.c.now, v.tauntGuard, 3);
      break;
    }
    case 'guard': {
      p.mth.setGuard(sys.c.now, skill.reduce ?? 0.6, rs.duration ?? 6);
      // Bộ Hộ Pháp bậc 2 (4 món): phản thêm `kimChungReflect`.
      const refl = (v?.reflect ?? skill.reflect ?? 0) + (skill.id === 'skl_kim_chung_tran' ? c.stats.setFx.kimChungReflect : 0);
      if (refl) p.mth.setReflect(sys.c.now, refl, rs.duration ?? 6);
      sys.c.fx({ t: skill.fx, src: p.sid, d: rs.duration ?? 6, ...tag });
      if (v?.guardAlly) {
        for (const o of sys.c.players.values()) {
          if (o === p || !sys.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > v.guardAlly.r) continue;
          o.mth.setGuard(sys.c.now, v.guardAlly.reduce, rs.duration ?? 6);
        }
      }
      // Bộ Cổ Thành bậc 4 (4 món): Anh Thiết Thân: đồng đội trong 10 m cũng giảm `anhThietShare` sát thương nhận (người mặc không gánh hộ phần nào).
      const share = skill.id === 'skl_anh_thiet_than' ? c.stats.setFx.anhThietShare : 0;
      if (share > 0) {
        for (const o of sys.c.players.values()) {
          if (o === p || !sys.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > 10) continue;
          o.mth.setGuard(sys.c.now, share, rs.duration ?? 6);
        }
      }
      if (v?.tauntGuard) p.mth.setGuard(sys.c.now, v.tauntGuard, 3);
      break;
    }
    case 'hot': {
      const r = (skill.allyRadius ?? 10) * (v?.healRadiusMul ?? 1);
      // Bộ Đan Sư bậc 2 (4 món): Mộc Linh Trận kéo dài thêm `mocLinhDur`, giữ nguyên lượng hồi/độc mỗi giây (tổng tăng theo).
      const durMul = skill.id === 'skl_moc_linh_tran' ? 1 + c.stats.setFx.mocLinhDur : 1;
      // Bộ Thần Tàng bậc 4 (4 món): Anh Dược Hóa Thân hồi thêm `anhDuocBoost`.
      const healBoost = skill.id === 'skl_anh_duoc_hoa_than' ? 1 + c.stats.setFx.anhDuocBoost : 1;
      const sec = (rs.duration ?? 6) * durMul;
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
      // Anh Dược Hóa Thân: chỉ chữa mình và `allyCount` đồng đội mất nhiều máu nhất (tỉ lệ) trong tầm.
      const nAlly = skill.allyCount === undefined ? Infinity : (v?.allyCount ?? skill.allyCount);
      const chosen = new Set<PlayerEnt>();
      if (nAlly !== Infinity) {
        const near = [...sys.c.players.values()].filter(
          (o) => o !== p && sys.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= r,
        );
        near.sort((a, b) => a.char.hp / a.char.mhp - b.char.hp / b.char.mhp);
        for (const o of near.slice(0, nAlly)) chosen.add(o);
      }
      for (const o of sys.c.players.values()) {
        if (!sys.canAssist(p, o)) continue;
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
        sys.addHot(o.sid, total / sec, sec, p);
        if (am) sys.markAlly(p, o, am.id, am.n);
        if (v?.selfShield) {
          const amount = Math.round(o.char.mhp * v.selfShield);
          if (!o.shield || o.shield.amount < amount) {
            o.shield = { amount, until: sys.c.now + 6000 };
            sys.c.setFlag(o, PF_SHIELD, true);
          }
        }
      }
      // Mộc độc (đan sư): quái trong vùng chịu sát thương theo thời gian.
      if (skill.poison) {
        for (const o of sys.monstersNear(p.move.x, p.move.z, skill.poison.r)) {
          if (o.owner && o.owner !== p.sid) continue;
          o.poison = {
            sid: p.sid,
            until: sys.c.now + skill.poison.dur * durMul * 1000,
            nextAt: sys.c.now + 1000,
            per: Math.max(1, Math.round(c.atk * skill.poison.mul * (v?.poisonMul ?? 1))),
            kind: 'poison',
          };
          sys.aggroMonster(o, p);
        }
      }
      break;
    }
    case 'revive': {
      const r = skill.allyRadius ?? 14;
      const dead = sys.reviveTarget(p, r);
      // Thuấn Di Cứu Viện: thuấn di tới người ngã (tính khoảng cách từ chỗ cũ) rồi hồi sinh.
      const dead2 = dead && (v?.reviveN ?? 1) >= 2 ? sys.reviveTarget(p, r, dead) : null;
      if (dead && skill.blinkAlly) sys.blinkNear(p, dead.move.x, dead.move.z, 1.8);
      sys.c.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, ...tag });
      for (const dead of [dead2].filter((x): x is PlayerEnt => !!x)) {
        dead.char.hp = Math.max(
          1,
          Math.round(dead.char.mhp * (rs.power + (skill.id === 'skl_thuan_di_cuu_vien' ? c.stats.setFx.cuuVienBoost : 0))),
        );
        dead.s.fl = 0;
        dead.lastCombatAt = sys.c.now;
        dead.hazardWin = { until: 0, taken: 0 };
        sys.c.sys(dead, 'sys.revived', { name: c.name }, 'good');
        sys.c.fx({ t: 'respawn', src: dead.sid, v: 'revive' });
      }
      if (dead) {
        dead.char.hp = Math.max(
          1,
          Math.round(dead.char.mhp * (rs.power + (skill.id === 'skl_thuan_di_cuu_vien' ? c.stats.setFx.cuuVienBoost : 0))),
        );
        dead.s.fl = 0;
        dead.lastCombatAt = sys.c.now;
        dead.hazardWin = { until: 0, taken: 0 };
        sys.c.sys(dead, 'sys.revived', { name: c.name }, 'good');
        sys.c.fx({ t: 'respawn', src: dead.sid, v: 'revive' });
      }
      for (const o of sys.c.players.values()) {
        if (o === dead || o === dead2 || !sys.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
        sys.healPlayer(o, healAmount(o.char.mhp * 0.2, healMul), p);
      }
      break;
    }
  }
  // Phân Anh Kiếm Ảnh: kiếm ảnh lặp lại chiêu có hồi chiêu vừa tung vào mục tiêu chính (không lặp chính nó, không đánh thường).
  const ec = sys.echoes.get(p.sid);
  if (ec) {
    if (sys.c.now >= ec.until) sys.echoes.delete(p.sid);
    else if (dealsDamage(skill) && skill.cd > 0 && targetId) {
      const em = sys.c.monById.get(targetId);
      if (em) {
        ec.hits.forEach((f, i) => {
          sys.later(ec.delay + i * 0.25, () => {
            if (
              sys.c.players.get(p.sid) !== p ||
              sys.c.isDead(p) ||
              sys.airborne(p) ||
              em.state === MS_DEAD ||
              !sys.inRange(p, em, sys.skillRange(p, skill))
            )
              return;
            sys.c.fx({ t: 'kiemanh', src: p.sid, dst: em.id });
            sys.c.hitMonster(p, em, rs.power * f * mulBase, elemMul, ec.elem);
          });
        });
      }
    }
  }
  if (skill.ult && holdLock > 0) {
    sys.later(holdLock + 0.02, () => {
      p.mth.lockCharge = false;
      p.mth.charge = 0;
    });
  } else if (skill.ult) {
    p.mth.lockCharge = false;
    p.mth.charge = 0;
  }
  // VS-2f: tung chiêu tối thượng khi đang mang Mộc ấn của đồng đội thì ấn kết.
  if (skill.ult) sys.jointFinish(p);
  p.flow.opened.set(skill.id, sys.c.now);
  sys.c.sendCd(p);
}
