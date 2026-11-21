// Pháp bảo phụ và đan tăng sức (P3-8): kích hoạt, nạp linh khí, nội tại, Ngưng Đan Lô
import {
  artifactLevelMods,
  BONDED_ARTIFACT_ID,
  bondedLevel,
  furnaceHeal,
  type ArtifactDef,
  artifactQiGain,
  drainMp,
  DRAIN_MAX_TARGETS,
  mergeBuff,
  sealPosture,
  sealStun,
  shieldAmount,
  type DmgMsg,
  type FxMsg,
  MF_STUN,
  MS_ATTACK,
  MS_CHASE,
  PF_SHIELD,
  REAP_MAX_TARGETS,
  S,
  SKILL_MSG_PER_SEC,
  type SysMsg,
} from '@dtl/shared';
import { ARTIFACT, itemName, MARK, t } from '@dtl/content';
import type { PlayerEnt, MonEnt, SimHost } from '../entities';
import { DuelSystem } from '../duel';
import { parties } from '../party';
import { equippedArtifact, feedQi, progressOf } from '../artifact';

/** Phần GameSim mà hệ pháp bảo cần. */
export interface ArtifactCtx {
  addPosture(m: MonEnt, n: number): void;
  /** TN-2 (hồn phiên): đặt ấn của `p` lên quái và tích tài nguyên riêng; cả hai tự bỏ qua nếu `p` không tu đúng công pháp. */
  markMon(p: PlayerEnt, mon: MonEnt, id: string, n?: number): void;
  addRes(p: PlayerEnt, n: number): void;
  airborne(p: PlayerEnt): boolean;
  canAssist(p: PlayerEnt, o: PlayerEnt): boolean;
  readonly duel: DuelSystem;
  emit(type: string, payload: object): void;
  fx(m: FxMsg): void;
  readonly host: SimHost;
  isDead(p: PlayerEnt): boolean;
  monstersNear(x: number, z: number, r: number, except?: MonEnt): MonEnt[];
  readonly now: number;
  sendCd(p: PlayerEnt): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  setMonFlags(m: MonEnt, mf: number, ce: number): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun?: number): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

export class ArtifactSystem {
  constructor(private readonly c: ArtifactCtx) {}

  /** Hạ quái: nạp linh khí vào pháp bảo đang đeo. Lên cấp thì tính lại chỉ số (nội tại) và báo. */
  feedArtifact(p: PlayerEnt, mon: MonEnt): void {
    const def = equippedArtifact(p.char.equip);
    if (!def) return;
    const n = artifactQiGain({ boss: !!mon.def.boss, elite: !!mon.def.elite, monLevel: mon.level, playerLevel: p.char.level });
    if (n <= 0) return;
    const lv = feedQi(p.char.meta, def.id, n);
    p.mth.dirty = true;
    if (lv !== null) {
      p.char.recalc();
      this.c.sys(p, 'sys.art_level', { item: itemName(def.id), lv }, 'good');
    }
  }

  /** Dùng đan tăng sức: đặt buff theo luật làm mới (không cộng dồn), lưu trong meta. */
  applyPillBuff(
    p: PlayerEnt,
    def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number } } },
    potency: number,
  ): void {
    const b = def.use?.buff;
    if (!b) return;
    const c = p.char;
    const now = Date.now();
    const m = b.pct * potency;
    c.meta.buffs ??= {};
    c.meta.buffs[b.kind] = mergeBuff(c.meta.buffs[b.kind], m, now + b.sec * 1000 * potency, now);
    c.recalc();
    p.mth.dirty = true;
    if (b.kind === 'ward')
      this.c.sys(p, 'sys.ward_buff', { item: itemName(def.id), n: Math.round(m * 100), s: Math.round(b.sec * potency) }, 'good');
    else
      this.c.sys(
        p,
        'sys.pill_buff',
        { item: itemName(def.id), what: t('ui.pill.buff.' + b.kind), n: Math.round(m * 100), m: Math.round((b.sec * potency) / 60) },
        'good',
      );
    this.c.fx({ t: 'potion', src: p.sid });
  }

  /** Kích hoạt pháp bảo phụ đang đeo. Server quyết định hết: hồi chiêu, linh lực, mục tiêu, hiệu ứng. */
  onArtifact(p: PlayerEnt): void {
    if (!this.artifactGate(p)) return;
    const def = equippedArtifact(p.char.equip);
    if (!def) return this.c.warn(p, 'sys.art_none');
    this.fireArtifact(p, def, progressOf(p.char.meta, def.id).lv);
  }

  /** Bản mệnh pháp bảo Ngưng Đan Lô (E2-E): có từ Kết Đan, không tháo, cấp theo cấp của chủ (không tốn vật phẩm, không đụng túi/ledger). */
  onBonded(p: PlayerEnt): void {
    if (!this.artifactGate(p)) return;
    const lv = bondedLevel(p.char.level);
    const def = ARTIFACT.get(BONDED_ARTIFACT_ID);
    if (lv < 1 || !def) return this.c.warn(p, 'sys.bonded_locked');
    this.fireArtifact(p, def, lv);
  }

  /** Giới hạn tần suất và điều kiện chung cho mọi pháp bảo (chết, tỉ thí, độ kiếp/tâm ma). */
  artifactGate(p: PlayerEnt): boolean {
    if (this.c.now - p.skillWindowAt >= 1000) {
      p.skillWindowAt = this.c.now;
      p.skillCount = 0;
    }
    if (++p.skillCount > SKILL_MSG_PER_SEC) return false;
    if (this.c.isDead(p)) {
      this.c.warn(p, 'sys.dead');
      return false;
    }
    if (this.c.duel.inDuel(p)) {
      this.c.warn(p, 'duel.no_items');
      return false;
    }
    // Đang độ kiếp hoặc tâm ma: không dùng pháp bảo (cùng luật với đan/trang bị).
    if (p.trib || p.trial) {
      this.c.warn(p, 'sys.busy');
      return false;
    }
    return true;
  }

  fireArtifact(p: PlayerEnt, def: ArtifactDef, lv: number): void {
    const c = p.char;
    if (this.c.airborne(p)) return this.c.warn(p, 'sys.cannot_while_flying');
    if ((p.cds.get(def.skill) ?? 0) > this.c.now) return this.c.warn(p, 'sys.cooldown');
    if (c.mp < def.mp) return this.c.warn(p, 'sys.not_enough_mp');
    const near = this.c.monstersNear(p.move.x, p.move.z, def.radius);
    const tag: Partial<FxMsg> = { s: def.id, c: def.color, lv };
    switch (def.kind) {
      case 'drain': {
        const targets = near.slice(0, DRAIN_MAX_TARGETS);
        if (!targets.length) return this.c.warn(p, 'sys.art_no_target');
        let got = 0;
        for (const mon of targets) {
          got += drainMp(def, lv, c.mmp, !!mon.def.elite);
          this.c.fx({ t: 'artdrain', src: mon.id, dst: p.sid, ...tag });
        }
        c.mp = Math.min(c.mmp, c.mp + got);
        this.c.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.2, ...tag });
        this.c.sys(p, 'sys.art_drain', { n: got }, 'good');
        break;
      }
      case 'seal': {
        // Chỉ ảnh hưởng quái đang giao chiến; quái đang rảnh không bị kéo vào trận.
        const engaged = near.filter((m) => m.state === MS_CHASE || m.state === MS_ATTACK);
        if (!engaged.length) return this.c.warn(p, 'sys.art_no_target');
        const stunSec = sealStun(def, lv);
        for (const mon of engaged) {
          if (this.c.now < mon.evadeUntil) continue;
          if (mon.def.boss) {
            // Boss không choáng thẳng: cộng mạnh thanh phá thế và ngắt chú nếu đúng cửa sổ.
            this.c.tryInterrupt(p, mon);
            this.c.addPosture(mon, sealPosture(def, lv));
          } else {
            mon.cast = null;
            mon.windUntil = 0;
            mon.comboAt = 0;
            mon.stunUntil = Math.max(mon.stunUntil, this.c.now + stunSec * 1000);
            this.c.setMonFlags(mon, MF_STUN, mon.stunUntil);
          }
          this.c.fx({ t: 'artseal', src: p.sid, dst: mon.id, ...tag });
        }
        this.c.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.2, ...tag });
        this.c.sys(p, 'sys.art_seal', { n: engaged.length }, 'good');
        break;
      }
      case 'shield': {
        const dur = def.duration ?? 4;
        const who = new Set<PlayerEnt>([p]);
        for (const o of parties.matesInRoom(c.id, this.c.host)) {
          if (o !== p && this.c.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= def.radius) who.add(o);
        }
        for (const o of who) {
          const amount = shieldAmount(def, lv, o.char.mhp);
          if (o.shield && o.shield.amount > amount && o.shield.until > this.c.now) continue;
          o.shield = { amount, until: this.c.now + dur * 1000 };
          this.c.setFlag(o, PF_SHIELD, true);
        }
        this.c.fx({ t: 'art', src: p.sid, r: def.radius, d: dur, ...tag });
        this.c.sys(p, 'sys.art_shield', { n: who.size }, 'good');
        break;
      }
      case 'reap': {
        // Hồn phiên (TN-2): nhiếp hồn quái đang giao chiến quanh mình. Ấn và Hồn lực chỉ có tác dụng với người tu công pháp của ấn.
        const rp = def.reap;
        const mk = rp ? MARK.get(rp.mark) : undefined;
        if (!rp || !mk || (mk.method && mk.method !== c.meta.method)) return this.c.warn(p, 'sys.art_reap_none');
        const targets = near
          .filter((m) => (m.state === MS_CHASE || m.state === MS_ATTACK) && this.c.now >= m.evadeUntil)
          .slice(0, REAP_MAX_TARGETS);
        if (!targets.length) return this.c.warn(p, 'sys.art_no_target');
        for (const mon of targets) {
          this.c.markMon(p, mon, rp.mark);
          this.c.addRes(p, rp.res);
          this.c.fx({ t: 'artreap', src: mon.id, dst: p.sid, ...tag });
        }
        this.c.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.2, ...tag });
        this.c.sys(p, 'sys.art_reap', { n: targets.length }, 'good');
        break;
      }
      case 'heal': {
        // Ngưng Đan Lô: hồi khí huyết cho bản thân và đồng đội trong tầm (đồng đội cần cùng tổ đội, cùng room, còn sống).
        const who = new Set<PlayerEnt>([p]);
        for (const o of parties.matesInRoom(c.id, this.c.host)) {
          if (o !== p && !this.c.isDead(o) && this.c.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= def.radius)
            who.add(o);
        }
        for (const o of who) {
          const n = furnaceHeal(def, lv, o.char.mhp);
          o.char.hp = Math.min(o.char.mhp, o.char.hp + n);
          this.c.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
          this.c.fx({ t: 'artheal', src: o.sid, ...tag });
        }
        this.c.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.4, ...tag });
        this.c.sys(p, 'sys.art_heal', { n: who.size }, 'good');
        break;
      }
    }
    c.mp -= def.mp;
    p.cds.set(def.skill, this.c.now + def.cd * 1000 * artifactLevelMods(lv).cdMul);
    p.lastCombatAt = this.c.now;
    this.c.sendCd(p);
  }
}
