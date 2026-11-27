import {
  MF_BURN,
  MF_DAZED,
  MF_DISP_MASK,
  MF_POISON,
  MF_SLOW,
  computeDamage,
  postureDecay,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  WATER_Y,
  marksPrune,
  packMarks,
} from '@dtl/shared';
import { LEASH } from '../combat/consts';
import type { MonEnt, PlayerEnt } from '../entities';
import type { MonsterSystem } from './index';

/** Cờ chỉ-để-vẽ (làm chậm, độc, bỏng) suy ra từ trạng thái server; chỉ ghi khi đổi. Không ảnh hưởng gameplay. */
function syncDisplayFlags(sys: MonsterSystem, m: MonEnt): void {
  const now = sys.c.now;
  let want = 0;
  if (m.slow && now < m.slow.until) want |= MF_SLOW;
  // Choáng thật = còn `stunUntil` mà không phải khựng/ngã của đòn nặng (cùng điều kiện `stunned` ở hitMonster).
  if (now < m.stunUntil && !(now < m.staggerUntil && m.stunUntil === m.staggerUntil)) want |= MF_DAZED;
  if (m.poison && now < m.poison.until) want |= m.poison.kind === 'burn' ? MF_BURN : MF_POISON;
  if ((m.s.mf & MF_DISP_MASK) !== want) m.s.mf = (m.s.mf & ~MF_DISP_MASK) | want;
}

export function tickMonsterImpl(sys: MonsterSystem, m: MonEnt, dt: number): void {
  if (m.state === MS_DEAD) {
    if (m.camp) return;
    if (m.spawn) {
      if (sys.c.now >= m.respawnAt) sys.respawnMonster(m);
    } else if (sys.c.now >= m.removeAt) {
      sys.removeMonster(m);
    }
    return;
  }
  // `/gm freeze`: quái sống đứng yên, giữ nguyên trạng thái và cờ đang có (để soi viền, mood, hiệu ứng).
  if (sys.gmFreeze) return;
  const def = m.def;
  syncDisplayFlags(sys, m);
  if (m.poison) {
    if (sys.c.now >= m.poison.until) m.poison = undefined;
    else if (sys.c.now >= m.poison.nextAt) {
      m.poison.nextAt += 1000;
      const owner = sys.c.players.get(m.poison.sid) ?? null;
      sys.damageMonster(m, m.poison.per, owner, false, false, false, 0, true);
      if (owner) sys.c.resDot(owner);
      if (m.state === MS_DEAD) return;
    }
  }
  // Ấn hết hạn (VS-2c): dọn và cập nhật gói bit đồng bộ.
  if (m.marks.length && marksPrune(m.marks, sys.c.now)) m.s.mk = packMarks(m.marks, sys.c.now);
  // TN-2: ấn có sát thương theo thời gian (Hồn ấn). Mỗi nhịp: sát thương = `per` × số tầng, người đặt rút máu và tích tài nguyên.
  if (m.marks.length && sys.tickMarkDots(m)) return;
  if (m.state === MS_IDLE) {
    if (sys.c.now >= m.thinkAt) {
      m.thinkAt = sys.c.now + 400;
      let best: PlayerEnt | null = null;
      let bestD = def.aggro * def.aggro;
      for (const p of sys.c.players.values()) {
        if (sys.c.isDead(p) || sys.c.soul.isScouting(p) || (m.owner && p.sid !== m.owner)) continue;
        const dx = p.move.x - m.s.x;
        const dz = p.move.z - m.s.z;
        const dy = p.move.y - m.s.y;
        const d2 = dx * dx + dz * dz + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = p;
        }
      }
      if (best) {
        m.target = best.sid;
        m.unreachableSince = 0;
        sys.setMonState(m, MS_CHASE);
        return;
      }
    }
    if (sys.c.now >= m.wanderAt) {
      m.wanderAt = sys.c.now + 4000 + Math.random() * 7000;
      if (!def.boss) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        const wx = m.homeX + Math.cos(a) * r;
        const wz = m.homeZ + Math.sin(a) * r;
        if (sys.c.terrain.heightAt(wx, wz) > WATER_Y + 0.3) {
          m.wx = wx;
          m.wz = wz;
        }
      }
    }
    if (Math.abs(m.wx - m.s.x) > 0.3 || Math.abs(m.wz - m.s.z) > 0.3) sys.moveToward(m, m.wx, m.wz, def.speed * 0.35, dt);
    return;
  }
  if (m.state === MS_RETURN) {
    const left = sys.moveToward(m, m.homeX, m.homeZ, def.speed * 1.6, dt);
    if (m.s.hp < m.s.mhp) m.s.hp = Math.min(m.s.mhp, m.s.hp + Math.ceil(m.s.mhp * 0.25 * dt));
    // Hồi đầy máu thì trận mới bắt đầu lại từ pha đầu.
    if (m.s.hp >= m.s.mhp) sys.setPhase(m, 0);
    if (left < 0.5) {
      if (def.boss) {
        // Boss về tới chỗ: đầy máu, trận sau bắt đầu lại từ pha đầu (cả khi cả đội chết ngay cạnh chỗ sinh).
        m.s.hp = m.s.mhp;
        sys.setPhase(m, 0);
      }
      m.threat.clear();
      m.wx = m.homeX;
      m.wz = m.homeZ;
      sys.setMonState(m, MS_IDLE);
    }
    return;
  }
  // CHASE / ATTACK
  const ps = def.posture;
  if (ps && m.posture > 0) {
    m.posture = postureDecay(ps, m.posture, (sys.c.now - m.lastHitAt) / 1000, dt);
    sys.syncPosture(m);
  }
  if (m.stunUntil) {
    if (sys.c.now < m.stunUntil) return;
    // Khựng do đòn (S1) hết thì đánh lại ngay; chỉ choáng thật (ngắt chú, phá thế, choáng chiêu) mới chậm nhịp 600 ms.
    const onlyStagger = m.stunUntil === m.staggerUntil;
    m.stunUntil = 0;
    sys.setMonFlags(m, 0, 0);
    if (!onlyStagger) m.attackAt = Math.max(m.attackAt, sys.c.now + 600);
  }
  if (m.taunt) {
    const tp = sys.c.players.get(m.taunt.sid);
    if (sys.c.now >= m.taunt.until || !tp || sys.c.isDead(tp)) m.taunt = undefined;
    else if (m.target !== tp.sid) {
      m.target = tp.sid;
      sys.resetTargetAi(m);
    }
  }
  let target = sys.c.players.get(m.target);
  if (!target || sys.c.isDead(target) || sys.c.soul.isScouting(target)) {
    // Chuyển sang kẻ gây sát thương nhiều nhất còn sống.
    target = undefined;
    let top = 0;
    for (const [sid, v] of m.threat) {
      const q = sys.c.players.get(sid);
      if (q && !sys.c.isDead(q) && !sys.c.soul.isScouting(q) && v > top && Math.hypot(q.move.x - m.s.x, q.move.z - m.s.z) < 50) {
        top = v;
        target = q;
      }
    }
    if (!target) {
      m.target = '';
      sys.setMonState(m, MS_RETURN);
      return;
    }
    // Đổi mục tiêu: hủy chú đang đọc/đòn đôi đang dở, người mới phải được báo trước từ đầu.
    sys.resetTargetAi(m);
    m.target = target.sid;
  }
  const leash = def.boss ? 80 : LEASH;
  const dx = target.move.x - m.s.x;
  const dz = target.move.z - m.s.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const dy = target.move.y - m.s.y;
  if ((!m.owner && sys.homeDist(m) > leash) || d > 70) {
    m.target = '';
    sys.setMonState(m, MS_RETURN);
    return;
  }
  if (m.comboAt && sys.c.now >= m.comboAt) sys.resolveCombo(m);
  const reach = def.attackRange + 0.4;
  const stalled = sys.blockedStall(m, d, reach);
  const reachable = dy < 3.5 + def.scale * 1.5 && !stalled;
  if (!reachable) {
    if (!m.unreachableSince) m.unreachableSince = sys.c.now;
    if (stalled || sys.c.now - m.unreachableSince > 5000) {
      // Mục tiêu đứng ở chỗ không với tới: bỏ đuổi, hồi đầy và miễn sát thương một lúc.
      m.target = '';
      m.threat.clear();
      m.unreachableSince = 0;
      m.slideSince = 0;
      m.s.hp = m.s.mhp;
      sys.setPhase(m, 0);
      m.evadeUntil = sys.c.now + 6000;
      sys.setMonState(m, MS_RETURN);
      return;
    }
  } else {
    m.unreachableSince = 0;
  }
  const ai = m.rules.ai;
  sys.c.monSkills.face(m);
  sys.c.monSkills.armor(m);
  if (!m.windUntil && sys.c.monSkills.tick(m, target, d, reachable, dt)) return;
  if (m.windUntil) {
    // Đang vung chiêu chém vùng: đứng yên, giữ hướng đã khóa cho khớp vùng báo trước.
    if (sys.c.now < m.windUntil) {
      sys.setMonState(m, MS_ATTACK);
      return;
    }
    m.windUntil = 0;
  }
  const chant = ai.chant;
  if (chant && sys.tickChant(m, chant, target, d, reachable)) return;
  const sweep = ai.sweep;
  if (sweep && reachable && !m.comboAt) {
    if (!m.sweepAt) m.sweepAt = sys.c.now + sweep.cd * 500;
    else if (sys.c.now >= m.sweepAt && d <= sweep.r * 0.85) {
      sys.startSweep(m, target, sweep);
      return;
    }
  }
  const caster = ai.caster;
  if (caster) {
    sys.tickCaster(m, target, caster, d, reachable, dt);
  } else if (!def.boss && !sys.holdsMeleeSlot(m, target, d, reach)) {
    sys.orbit(m, target, d, reach, dt);
  } else if (d > reach) {
    sys.moveToward(m, target.move.x, target.move.z, def.speed * m.rules.speedMul, dt);
    sys.setMonState(m, MS_CHASE);
  } else {
    m.s.yaw = Math.atan2(dx, dz);
    sys.setMonState(m, MS_ATTACK);
    if (reachable && sys.c.now >= m.attackAt && !m.comboAt) {
      m.attackAt = sys.c.now + def.attackCd * m.rules.cdMul * 1000;
      const { dmg } = computeDamage(m.atk, 1, target.char.def, Math.random(), 1);
      sys.c.fx({ t: 'bite', src: m.id, dst: target.sid });
      sys.c.damagePlayer(target, dmg, m.id);
      const combo = ai.combo;
      if (combo && !sys.c.isDead(target) && Math.random() < combo.chance) {
        m.comboAt = sys.c.now + combo.delay * 1000;
        m.comboTarget = target.sid;
      }
    }
  }
  const slam = ai.slam;
  if (slam && sys.c.now >= m.abilityAt) {
    m.abilityAt = sys.c.now + slam.cd * 1000;
    // Chiêu diện rộng báo trước dưới chân từng người: né ra khỏi vòng.
    let n = 0;
    for (const p of sys.c.players.values()) {
      if (sys.c.isDead(p) || n >= slam.max) continue;
      if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) > 45) continue;
      sys.addHazard({ x: p.move.x, z: p.move.z, r: slam.r }, slam.delay, slam.mul, false, slam.kind, m.id, m.atk);
      n++;
    }
  }
}
