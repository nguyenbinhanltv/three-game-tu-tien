// Độ kiếp phía sim (R-7): onBreakthrough, bắt đầu/kết thúc kiếp, hộ pháp, bóng tâm ma, thế thân
import { noteHeal } from '../matchstats';
import {
  computeDamage,
  type DmgMsg,
  type FxMsg,
  skillDamageMul,
  elemCounter,
  STAT_CAPS,
  counterMul,
  MAX_LEVEL,
  type LevelDef,
  type MonsterDef,
  MS_CHASE,
  MS_DEAD,
  PF_TRIBULATION,
  S,
  type SkillDef,
  type SpawnDef,
  type SysMsg,
  tribDef,
  tribForLevel,
  chainBlockedBy,
  chainCleared,
  chainDone,
  setChainCleared,
  suyRemaining,
  type TribDef,
  type TribId,
  bottleneckBlocked,
  TRUC_CO_FREE_FLY_ALT,
  vulnerableDamage,
  xpNeed,
  markAmp,
} from '@dtl/shared';
import { TribSystem } from '../trib';
import { itemName, MARK, MONSTER, nextMajorRealmName, realmName, t } from '@dtl/content';
import { type Character } from '../character';
import type { PlayerEnt, MonEnt, Hazard, SimHost } from '../entities';
import { visualSeed } from '../combat/consts';
import { RealmSystem } from '../realm';
import { DuelSystem } from '../duel';
import { CloneSystem } from '../clone';
import { DomainSystem } from '../domain';
import { parties } from '../party';
import { log } from '../../log';

/** Phần GameSim mà hệ độ kiếp cần. */
export interface TribulationCtx {
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
  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv?: boolean, ke?: 1 | -1): void;
  readonly domain: DomainSystem;
  readonly duel: DuelSystem;
  emit(type: string, payload: object): void;
  fx(m: FxMsg): void;
  readonly host: SimHost;
  isDead(p: PlayerEnt): boolean;
  readonly level: LevelDef;
  readonly now: number;
  readonly players: Map<string, PlayerEnt>;
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  readonly realm: RealmSystem;
  savePlayer(p: PlayerEnt): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  setMeditating(p: PlayerEnt, on: boolean): void;
  setMonState(m: MonEnt, st: number): void;
  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: SpawnDef | null): MonEnt;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
  readonly tribSys: TribSystem;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

/** Khóa thông báo của kiếp chuỗi: Ngũ Suy dùng `sys.suy_*`, Huyền Kiếp dùng `sys.hk_*`. */
function chainKey(def: TribDef, k: string): string {
  return `sys.${def.id === 'ngu_suy' ? 'suy' : 'hk'}_${k}`;
}

export class TribulationSystem {
  constructor(private readonly c: TribulationCtx) {}

  /**
   * Hộ pháp chắn thay một phần tia khóa mệnh (E1-F): trả phần đã chuyển đi. Hộ pháp không chết vì kiếp của người khác (dừng ở 1 khí huyết).
   * Chỉ người CÙNG TỔ ĐỘI với chủ kiếp mới làm hộ pháp (người lạ đứng gần không bị kéo vào chịu sát thương). Ở room độ kiếp riêng chỉ có người
   * vào bằng vé (cùng tổ đội), nên cùng luật.
   */
  pickGuards(h: Hazard): PlayerEnt[] {
    const g = h.guard!;
    const owner = this.c.players.get(h.src);
    if (!owner || !owner.trib) return [];
    const d = (o: PlayerEnt) => Math.hypot(o.move.x - owner.move.x, o.move.z - owner.move.z);
    return [...this.c.players.values()]
      .filter((o) => o !== owner && !o.trib && !this.c.isDead(o) && d(o) <= g.r && parties.same(owner.char.id, o.char.id))
      .sort((a, b) => d(a) - d(b))
      .slice(0, g.max);
  }

  /** Giảm sát thương tia khóa mệnh: theo hazard, thiếu thì theo `final` của kiếp người trúng đang độ. */
  lockCut(h: Hazard, p: PlayerEnt): { mul: number; max: number } {
    if (h.cut) return h.cut;
    const f = tribDef(p.trib?.id).phases.find((ph) => ph.final)?.final;
    return f ? { mul: f.defMul, max: f.defMaxCut } : { mul: 0, max: 0 };
  }

  shareToGuards(_owner: PlayerEnt, n: number, h: Hazard): number {
    const guards = this.pickGuards(h);
    if (guards.length === 0) return 0;
    const part = n * h.guard!.share;
    let moved = 0;
    for (const o of guards) {
      const each = Math.min(part / guards.length, o.char.hp - 1);
      if (each <= 0) continue;
      this.c.damagePlayer(o, each, h.src, true);
      moved += each;
    }
    return moved;
  }

  // ---------- đạn đánh xa (D1) ----------

  /**
   * Độ kiếp từ đại viên mãn (15 Ngưng Khí, 19 Trúc Cơ, 23 Kết Đan, 27 Nguyên Anh): kiếp theo `tribulations.json` (E1-F).
   * Kiếp chạy ở room thế giới (Trúc Cơ, Kết Đan) hoặc room riêng (Nguyên Anh, Hóa Thần; tổ đội vào cùng).
   * `force` (lệnh GM / tham số kiểm thử) bỏ qua cờ `enabled` và vật phẩm đột phá.
   */
  onBreakthrough(p: PlayerEnt, force = false, id?: TribId): void {
    const c = p.char;
    if (this.c.duel.inDuel(p)) return this.c.warn(p, 'duel.busy');
    if (this.c.isDead(p) || p.trib || this.c.level.dungeon) return this.c.warn(p, 'sys.trib_not_now');
    // `id` chỉ đến từ lệnh GM (tin C.BREAKTHROUGH của client không mang tham số): kiếp chuỗi chưa gắn vào thang cấp chỉ mở bằng id.
    const def = id ? tribDef(id) : tribForLevel(c.level);
    if (!def) return this.c.warn(p, c.level >= MAX_LEVEL ? 'sys.max_level' : 'sys.trib_need_xp');
    if (c.level !== def.from) return this.c.warn(p, 'sys.trib_need_xp');
    const levelUp = def.to > def.from;
    if (levelUp && c.xp < xpNeed(c.level)) return this.c.warn(p, 'sys.trib_need_xp');
    // Bình cảnh đại viên mãn phải vượt (tâm ma hoặc Phá Cảnh Đan) trước khi độ kiếp.
    if (levelUp && bottleneckBlocked(c.level, c.bk)) return this.c.warn(p, 'sys.bk_blocked');
    if (!def.enabled && !force) return this.c.warn(p, 'sys.trib_locked');
    if (def.chain && chainDone(c.meta, def)) return this.c.warn(p, chainKey(def, 'done'));
    // Chuỗi có điều kiện trước (Huyền Kiếp: Ngoại → Nội → Hồn); GM (`force`) bỏ qua để thử từng chuỗi.
    const prev = def.chain && !force ? chainBlockedBy(c.meta, def) : null;
    if (prev) return this.c.warn(p, 'sys.hk_need_prev', { name: t(`ui.trib.${prev.id}.title`) });
    const item = def.item;
    if (item && !force && !c.inv.some((it) => it?.id === item && !it.lk))
      return this.c.warn(p, 'sys.trib_need_pill', { item: itemName(item) });
    if (def.room === 'tribulation') {
      // Room riêng: room thế giới chỉ kiểm điều kiện rồi cấp vé; vật phẩm bị tiêu khi vào tới nơi (beginTribulation).
      if (!this.c.host.enterTribulationRoom?.(p, def, force)) this.c.warn(p, 'sys.trib_not_now');
      return;
    }
    // GM (force) vẫn tiêu vật phẩm nếu đang có, để sổ cái giống đường người chơi thật.
    this.beginTribulation(p, def, !!item && c.inv.some((it) => it?.id === item && !it.lk));
  }

  /** Bắt đầu kiếp `def` cho `p` ngay trong room này. `consume`: tiêu vật phẩm đột phá. false nếu thiếu vật phẩm. */
  beginTribulation(p: PlayerEnt, def: TribDef, consume: boolean): boolean {
    const c = p.char;
    this.c.clone.drop(p);
    const item = def.item;
    if (consume && item && !c.tx('tribulation', `trib:${def.id}:${c.id}:${this.c.now}`, (d) => d.remove(item, 1))) {
      this.c.warn(p, 'sys.trib_need_pill', { item: itemName(item) });
      return false;
    }
    if (p.meditating) this.c.setMeditating(p, false);
    // Kiếp chuỗi (TN-4): vào tiếp từ ải chưa qua, đồng hồ kiếp bắt đầu ở đầu ải đó.
    const stage = def.chain ? Math.min(def.phases.length - 1, chainCleared(c.meta, def)) : 0;
    const dur = def.chain ? suyRemaining(def, stage) : def.duration;
    p.trib = {
      id: def.id,
      endAt: this.c.now + dur * 1000,
      nextAt: this.c.now + def.firstDelay * 1000,
      n: 0,
      fin: false,
      pills: 0,
    };
    this.c.setFlag(p, PF_TRIBULATION, true);
    this.c.sysAll('sys.trib_start', { name: c.name }, 'info');
    this.c.fx({ t: 'tribstart', src: p.sid, d: dur, sd: visualSeed(), tb: def.id });
    return true;
  }

  // ---------- bình cảnh, linh căn (P3-7; phần luật ở game/realm.ts) ----------

  onBottleneck(p: PlayerEnt, msg: unknown): void {
    this.c.realm.onBottleneck(p, msg);
  }

  onChangeRoot(p: PlayerEnt, msg: unknown): void {
    this.c.realm.onChangeRoot(p, msg);
  }
  onChooseDao(p: PlayerEnt, msg: unknown): void {
    this.c.realm.onChooseDao(p, msg);
  }

  /** Bóng tâm ma của `p`: quái riêng, đứng trước mặt người chơi, đuổi đúng người đó. */
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o: { dyaw?: number; level?: number } = {}): MonEnt | null {
    const def = MONSTER.get('mon_tam_ma');
    if (!def) return null;
    const yaw = p.s.yaw + (o.dyaw ?? 0);
    const x = p.move.x + Math.sin(yaw) * 7;
    const z = p.move.z + Math.cos(yaw) * 7;
    const m = this.c.spawnMonster(def, o.level ?? p.char.level, x, z, null);
    m.owner = p.sid;
    m.atk = st.atk;
    m.defn = st.def;
    m.s.mhp = st.hp;
    m.s.hp = st.hp;
    m.target = p.sid;
    this.c.setMonState(m, MS_CHASE);
    return m;
  }

  /** Quái của kiếp (Nhật Thực Dực Chủ, DV-3K): đứng `dist` mét trước mặt người độ kiếp, đuổi đúng người đó, không rơi đồ (`minionOf`). */
  spawnTribBoss(p: PlayerEnt, id: string, dist: number): MonEnt | null {
    const def = MONSTER.get(id);
    if (!def) return null;
    const x = p.move.x + Math.sin(p.s.yaw) * dist;
    const z = p.move.z + Math.cos(p.s.yaw) * dist;
    const m = this.c.spawnMonster(def, p.char.level, x, z, null);
    m.minionOf = 'trib';
    m.target = p.sid;
    this.c.setMonState(m, MS_CHASE);
    return m;
  }

  /** Xuất khiếu trong Tam Trọng Kiếp (E3-L; E3-K nối phím X thật vào đây). */
  onTribSoul(p: PlayerEnt): void {
    if (p.trib) this.c.tribSys.soul(p);
  }

  /** Phân thân thần niệm trong Thiên Nhân Kiếp (E4-D): thế thân của kiếp, không phải phân thân của E4-K. */
  onTribClone(p: PlayerEnt): void {
    if (p.trib) this.c.tribSys.clone(p);
  }

  /** Phím G (E4-K): trong kiếp là thế thân của kiếp, ngoài kiếp là phân thân thần niệm. */
  onClone(p: PlayerEnt, msg: unknown): void {
    if (p.trib) this.c.tribSys.clone(p);
    else this.c.clone.command(p, msg);
  }

  /** Phân thân đánh quái bằng chỉ số của chủ: không cộng kiếm ý/vòng sạc, không đánh người (tỉ thí). */
  cloneHit(p: PlayerEnt, mon: MonEnt, power: number, skill: SkillDef | undefined): void {
    if (mon.state === MS_DEAD || (mon.owner && mon.owner !== p.sid) || this.c.now < mon.evadeUntil) return;
    const elem = skill?.elem;
    const ke = elemCounter(elem, mon.def.elem);
    const pw = power * (1 + markAmp(mon.marks, MARK, p.sid, this.c.now));
    const em = skillDamageMul(p.char.stats, elem);
    const crit0 = Math.min(STAT_CAPS.critRate, p.char.stats.critRate + this.c.domain.critAdd(p));
    const { dmg, crit } = computeDamage(
      p.char.atk,
      pw * em * counterMul(ke),
      mon.defn,
      Math.random(),
      Math.random(),
      crit0,
      p.char.stats.critMul,
    );
    this.c.damageMonster(mon, vulnerableDamage(dmg, this.c.now < mon.stunUntil), p, crit, false, false, ke);
  }

  /** Hồi `n` khí huyết (kẹp theo tối đa, tính hồi phục nhận vào) và báo số. */
  healPlayer(p: PlayerEnt, n: number): void {
    const amt = Math.max(1, Math.round(n * (1 + p.char.stats.healRecv)));
    const before = p.char.hp;
    p.char.hp = Math.min(p.char.mhp, p.char.hp + amt);
    noteHeal(p, p.char.hp - before);
    this.c.emit(S.DMG, { dst: p.sid, n: amt, heal: true } satisfies DmgMsg);
  }

  /**
   * Ải `idx` (0-based) của kiếp chuỗi đã qua (TN-4). Chỉ tiến đúng một ải kế tiếp (không nhảy cóc, không lùi). Linh thạch thưởng ghi trong một
   * transaction có khóa chống trùng `suy:<kiếp>:<nhân vật>:<ải>` (mỗi ải thưởng đúng một lần trong đời nhân vật, kể cả khi tiến độ bị đặt lại);
   * tiến độ (`meta.suy`) chỉ tăng sau khi transaction xong hoặc đã từng xong (`dup`). Qua ải cuối thì nội tại pháp tắc có hiệu lực (`recalc`).
   */
  suyCleared(p: PlayerEnt, idx: number, id: TribId | undefined = p.trib?.id): void {
    const c = p.char;
    const def = id ? tribDef(id) : null;
    if (!def?.chain) return;
    const have = chainCleared(c.meta, def);
    const ph = def.phases[idx];
    if (idx !== have || !ph) return;
    const gold = Math.max(0, Math.floor(def.stageGold?.[idx] ?? 0));
    const ok = c.tx('suy:stage', `suy:${def.id}:${c.id}:${idx + 1}`, (d) => {
      if (gold > 0) d.addGold(gold);
      return true;
    });
    if (!ok && c.txFail !== 'dup') {
      log.error(`[trib] không ghi được thưởng ải ${idx + 1} của ${def.id} cho ${c.name}: ${c.txFail}`);
      return;
    }
    setChainCleared(c.meta, def, have + 1);
    if (ok && gold > 0) this.c.sys(p, chainKey(def, 'stage_gold'), { n: idx + 1, max: def.phases.length, gold }, 'good');
    else this.c.sys(p, chainKey(def, 'stage'), { n: idx + 1, max: def.phases.length }, 'good');
    if (chainDone(c.meta, def)) {
      // Qua đủ một chuỗi: pháp tắc (TN-4) hoặc bậc Bản Nguyên (TN-1, chuỗi Huyền Kiếp) đổi chỉ số nên tính lại ngay.
      c.recalc();
      if (def.law) {
        c.hp = c.mhp;
        c.mp = c.mmp;
        this.c.sys(p, 'sys.suy_law', undefined, 'good');
      } else {
        c.hp = Math.min(c.hp, c.mhp);
        c.mp = Math.min(c.mp, c.mmp);
      }
    }
    this.c.fx({ t: 'suyok', src: p.sid, n: idx, s: ph.id });
    this.c.savePlayer(p);
    log.info(`[trib] ${c.name} qua ải ${idx + 1}/${def.phases.length} của ${def.id}`);
  }

  tickTribulation(p: PlayerEnt): void {
    this.c.tribSys.tick(p);
  }

  endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void {
    const c = p.char;
    const def = tribDef(p.trib?.id);
    const elapsed = p.trib ? def.duration - (p.trib.endAt - this.c.now) / 1000 : 0;
    this.c.tribSys.cleanup(p);
    const chainId = def.chain ? def.id : undefined;
    p.trib = null;
    this.c.setFlag(p, PF_TRIBULATION, false);
    if (success && chainId && def.to <= def.from) {
      // Kiếp chuỗi chưa gắn vào thang cấp: qua ải cuối là xong chuỗi, không đổi cấp (ải cuối không có `exit` nên lưu ở đây).
      this.suyCleared(p, def.phases.length - 1, chainId);
      this.c.sysAll(chainKey(def, 'ok'), { name: c.name, kiep: t(`ui.trib.${def.id}.title`) }, 'good');
      this.c.fx({ t: 'ascend', src: p.sid, tb: def.id });
      this.c.questEvent(p, 'breakthrough', def.id, 1);
      log.info(`[trib] ${c.name} qua đủ chuỗi ${def.id}`);
    } else if (success) {
      if (chainId) this.suyCleared(p, def.phases.length - 1, chainId);
      c.level = def.to;
      c.xp = 0;
      c.recalc();
      c.hp = c.mhp;
      c.mp = c.mmp;
      this.c.sysAll('sys.trib_ok', { name: c.name, realm: nextMajorRealmName(def.from) }, 'good');
      this.c.fx({ t: 'ascend', src: p.sid, tb: def.id });
      if (def.id === 'truc_co') this.c.sys(p, 'sys.tc_fly_hint', { n: TRUC_CO_FREE_FLY_ALT }, 'info');
      this.c.questEvent(p, 'breakthrough', def.id, 1);
      this.c.questEvent(p, 'level', undefined, c.level);
      this.c.savePlayer(p);
      log.info(`[trib] ${c.name} đạt ${realmName(c.level)} (kiếp ${def.id})`);
    } else if (chainId && def.failXpLoss <= 0) {
      // Ngũ Suy không phạt tu vi: ải đã qua vẫn giữ, lần sau vào tiếp.
      if (!silent) this.c.sys(p, chainKey(def, 'keep'), { n: chainCleared(c.meta, def), max: def.phases.length }, 'info');
    } else {
      const lost = c.loseXp(def.failXpLoss);
      if (!silent) this.c.sys(p, lost > 0 ? 'sys.trib_fail' : 'sys.trib_fail_free', { n: lost }, 'bad');
      // Trụ qua nửa đầu: hoàn vật phẩm đột phá (chỉ khi chết trong lôi kiếp, không hoàn khi thoát game giữa chừng).
      const item = def.item;
      if (
        !silent &&
        item &&
        elapsed >= def.refundAfter &&
        c.tx('tribulation:refund', `trib-refund:${def.id}:${c.id}:${this.c.now}`, (d) => d.add(item, 1))
      )
        this.c.sys(p, 'sys.trib_refund', { item: itemName(item) }, 'info');
    }
    this.c.host.onTribulationEnd?.(p, def, success);
  }

  // ---------- đả tọa, hái thuốc ----------
}
