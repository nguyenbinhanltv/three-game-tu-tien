// Chết và hồi sinh của người chơi (R-7): sát thương lên người, killPlayer, onRespawn, thưởng phó bản
import {
  chargeFromTaken,
  RESONANCE_DEF,
  DEATH_XP_LOSS,
  type DmgMsg,
  type DungeonReward,
  reduceDamage,
  rollEquipDrops,
  type Quality,
  type FxMsg,
  MS_DEAD,
  PF_DEAD,
  PF_SHIELD,
  S,
  type SysMsg,
  buffMag,
  SOUL_DEATH_HP,
  xpNeed,
  type Terrain,
} from '@dtl/shared';
import { TribSystem } from '../trib';
import { ITEM_SYS, ITEMS, itemName, STARS, t } from '@dtl/content';
import type { PlayerEnt, MonEnt, SimOptions } from '../entities';
import { RealmSystem } from '../realm';
import { DuelSystem } from '../duel';
import { MirrorSystem, wardMul } from '../mirror';
import { SoulSystem } from '../soul';
import { CloneSystem } from '../clone';
import { DomainSystem } from '../domain';
import { parties } from '../party';

import { at, COTHAN_METHOD, sanitizeStars, starBonus } from '@dtl/shared';
/** Phần GameSim mà hệ chết/hồi sinh cần. */
export interface DeathCtx {
  abortStrike(p: PlayerEnt, refund: boolean, notify?: boolean): void;
  readonly bossDmgMul: number;
  readonly clone: CloneSystem;
  damageMonster(
    mon: MonEnt,
    dmg: number,
    p: PlayerEnt | null,
    crit?: boolean,
    hv?: boolean,
    heavy?: boolean,
    ke?: 0 | 1 | -1,
    dot?: boolean,
  ): void;
  readonly domain: DomainSystem;
  readonly duel: DuelSystem;
  emit(type: string, payload: object): void;
  endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void;
  fx(m: FxMsg): void;
  gainCharge(p: PlayerEnt, n: number): void;
  /** Nhận `dmg` sát thương (đã trừ khiên): tích tài nguyên riêng (Huyết khí). */
  resTaken(p: PlayerEnt, dmg: number): void;
  giveXp(p: PlayerEnt, n: number, announce?: boolean): void;
  isDead(p: PlayerEnt): boolean;
  readonly mirror: MirrorSystem;
  readonly monById: Map<string, MonEnt>;
  readonly now: number;
  readonly opts: SimOptions;
  readonly realm: RealmSystem;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  setMeditating(p: PlayerEnt, on: boolean): void;
  readonly soul: SoulSystem;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  readonly terrain: Terrain;
  readonly tribSys: TribSystem;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

export class DeathSystem {
  constructor(private readonly c: DeathCtx) {}

  /**
   * Thưởng hoàn thành phó bản (E2-C): một transaction (vàng, nguyên liệu, trang bị đã roll) với khóa idem `key`
   * (chứa id nhân vật và ngày) và ghi ledger; khóa đã dùng thì giao dịch bị từ chối và không phát gì (kể cả tu vi).
   * Tu vi `xpPct` của chặng hiện tại chỉ cộng sau khi giao dịch lưu thành công. Trả true nếu đã phát.
   */
  grantDungeonReward(p: PlayerEnt, r: DungeonReward, key: string, label: string): boolean {
    if (p.noLoot || this.c.isDead(p)) return false;
    const gold = at(r.gold, 0) + Math.floor(Math.random() * (at(r.gold, 1) - at(r.gold, 0) + 1));
    const gear = rollEquipDrops(r.equip as unknown as Parameters<typeof rollEquipDrops>[0], ITEM_SYS, ITEMS, r.level, Math.random);
    const got: { id: string; n: number }[] = [];
    for (const d of r.items) {
      if (Math.random() < d.chance) got.push({ id: d.item, n: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
    }
    const kept: { id: string; n: number }[] = [];
    const keptGear: { id: string; q: Quality; ilvl: number }[] = [];
    let full = false;
    const saved = p.char.tx('dungeon:' + label, key, (d) => {
      d.addGold(gold);
      for (const g of gear) {
        if (d.freeSlots() > 0 && d.addRolled(g.id, g.ilvl, g.q)) keptGear.push(g);
        else full = true;
      }
      for (const g of got) {
        if (d.roomFor(g.id) >= g.n && d.add(g.id, g.n)) kept.push(g);
        else full = true;
      }
      return true;
    });
    if (!saved) return false;
    const xp = Math.max(1, Math.round(xpNeed(p.char.level) * r.xpPct));
    this.c.giveXp(p, xp, false);
    this.c.sys(p, 'sys.dungeon_reward', { name: t('dungeon.' + label + '.name'), xp }, 'good');
    if (gold > 0) this.c.sys(p, 'sys.gold', { n: gold }, 'loot');
    for (const g of kept) this.c.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot', { i: g.id });
    for (const g of keptGear)
      this.c.sys(p, 'sys.loot_gear', { item: itemName(g.id), quality: t('ui.quality.' + g.q) }, 'loot', { i: g.id, q: g.q });
    if (full) this.c.warn(p, 'sys.inv_full');
    return true;
  }

  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv = false, ke?: 1 | -1): void {
    if (this.c.isDead(p) || this.c.soul.isScouting(p)) return;
    const c = p.char;
    let n = Math.max(1, Math.round(dmg));
    // Định Thần Phù (E3-M): giảm sát thương "gương" (quái `glass`, boss gương, bóng tâm ma trong cung).
    if (src) {
      const ward = buffMag(c.meta.buffs, 'ward', Date.now());
      if (ward > 0) {
        const a = this.c.monById.get(src);
        if (a && (a.def.glass || a.def.mirror || (a.owner && this.c.mirror.active()))) n = Math.max(1, Math.round(n * wardMul(ward)));
      }
    }
    if (src && this.c.bossDmgMul !== 1 && this.c.monById.get(src)?.def.boss) n = Math.max(1, Math.round(n * this.c.bossDmgMul));
    if (this.c.now < p.mth.guardUntil) n = reduceDamage(n, p.mth.guardReduce);
    // Sao Cổ Thần (TN-5): giảm sát thương nhận khi đang giữ Cổ Thần Quyết.
    if (c.meta.method === COTHAN_METHOD) {
      const sr = starBonus(STARS, sanitizeStars(c.meta.stars)).reduce;
      if (sr > 0) n = reduceDamage(n, sr);
    }
    // Lĩnh vực hộ pháp (E4-K) giảm sát thương; phân thân hộ pháp gánh một phần sát thương quái ở gần nó.
    const dRed = this.c.domain.reduce(p);
    if (dRed > 0) n = reduceDamage(n, dRed);
    n = Math.max(1, this.c.clone.absorb(p, n, src));
    // Kim Chung Trấn (E2-G): phản một phần sát thương (sau khi giảm) về quái đánh mình.
    if (this.c.now < p.mth.reflectUntil && src) {
      const attacker = this.c.monById.get(src);
      if (attacker && attacker.state !== MS_DEAD && !(attacker.owner && attacker.owner !== p.sid))
        this.c.damageMonster(attacker, Math.max(1, Math.round(n * p.mth.reflectMul)), p);
    }
    if (parties.resonance(p)) n = Math.max(1, Math.round(n * (1 - RESONANCE_DEF)));
    if (p.shield) {
      const absorbed = Math.min(p.shield.amount, n);
      p.shield.amount -= absorbed;
      // Bộ Huyền Giáp Hộ Pháp (4 món): phản một phần sát thương khiên đã đỡ về quái đánh mình.
      const reflect = c.stats.setFx.shieldReflect;
      if (reflect > 0 && absorbed > 0 && src) {
        const attacker = this.c.monById.get(src);
        if (attacker && attacker.state !== MS_DEAD && !(attacker.owner && attacker.owner !== p.sid)) {
          this.c.damageMonster(attacker, Math.max(1, Math.round(absorbed * reflect)), p);
        }
      }
      n -= absorbed;
      if (p.shield.amount <= 0) {
        p.shield = null;
        this.c.setFlag(p, PF_SHIELD, false);
      }
    }
    p.lastCombatAt = this.c.now;
    if (p.meditating) this.c.setMeditating(p, false);
    if (n <= 0) {
      this.c.emit(S.DMG, { dst: p.sid, n: 0, src } satisfies DmgMsg);
      return;
    }
    if (!p.god) c.hp -= n;
    if (src && c.meta.method) {
      this.c.gainCharge(p, chargeFromTaken(n, c.mhp));
      this.c.resTaken(p, n);
    }
    const msg: DmgMsg = { dst: p.sid, n, src };
    if (hv) msg.hv = true;
    if (ke) msg.ke = ke;
    this.c.emit(S.DMG, msg);
    // Tâm cảnh (E3-L): bị Tâm Ma Ảnh của chính mình đánh trúng thì giảm.
    if (p.trib && src && this.c.monById.get(src)?.owner === p.sid) this.c.tribSys.noteHit(p, 'hurt');
    if (c.hp <= 0) this.killPlayer(p);
  }

  killPlayer(p: PlayerEnt): void {
    this.c.duel.onGone(p, true);
    this.c.clone.drop(p);
    const c = p.char;
    c.hp = 0;
    p.casting = null;
    this.c.abortStrike(p, false, false);
    p.flow.reset();
    p.shield = null;
    p.meditating = false;
    p.s.fl = PF_DEAD;
    if (p.trib) {
      this.c.endTribulation(p, false, false);
    } else if (p.trial) {
      // Chết trong thử thách tâm ma: thua ngay, không mất tu vi (đúng lời hứa của UI), đợi 60 giây thử lại.
      this.c.realm.failTrial(p, 'dead');
    } else if (!this.c.soul.onDeath(p)) {
      const lost = c.loseXp(DEATH_XP_LOSS);
      this.c.sys(p, lost > 0 ? 'sys.died' : 'sys.died_free', { n: lost }, 'bad');
    }
    this.c.fx({ t: 'death', src: p.sid });
  }

  onRespawn(p: PlayerEnt): void {
    if (!this.c.isDead(p)) return;
    const c = p.char;
    const soulWake = this.c.soul.consumeDeath(p);
    const { x, z } = this.c.opts.respawn;
    p.move = { x, y: this.c.terrain.groundAt(x, z), z, vy: 0, grounded: true, flying: false };
    p.inputs.length = 0;
    c.hp = Math.round(c.mhp * (soulWake ? SOUL_DEATH_HP : 0.5));
    c.mp = Math.round(c.mmp * 0.5);
    p.s.fl = 0;
    p.lastCombatAt = 0;
    p.hazardWin = { until: 0, taken: 0 };
    this.c.sys(p, soulWake ? 'sys.respawned_soul' : 'sys.respawned', undefined, 'info');
    this.c.fx({ t: 'respawn', src: p.sid });
  }

  // ---------- quái ----------
}
