import { TickProf } from './tickprof';
import type { Client } from 'colyseus';
import {
  blockedAt,
  STEP_UP,
  bottleneckReady,
  collisionOf,
  type CollisionSet,
  type CdMsg,
  CHAT_MAX_LEN,
  DUEL_DAMAGE_MUL,
  COMBAT_REGEN_DELAY,
  computeDamage,
  type DmgMsg,
  type MoveInput,
  caveBoundOf,
  type DungeonReward,
  reduceDamage,
  type FxMsg,
  type HazardGeom,
  type HazardMsg,
  type InvMsg,
  type LevelDef,
  type MonsterCaster,
  type MonsterChant,
  type MonsterDef,
  MS_ATTACK,
  MS_DEAD,
  MS_RETURN,
  PF_DEAD,
  PF_MEDITATING,
  PF_SHIELD,
  S,
  type SkillDef,
  type SpawnDef,
  type SysMsg,
  type TribDef,
  WATER_Y,
  xpNeed,
  planDash,
  AOI_BOSS_OUT,
  AOI_OUT,
  zoneAt,
  type BossTimerMsg,
  HOME_LEVEL,
  terrainOf,
  type Terrain,
} from '@dtl/shared';
import { TribSystem, type GuardCfg } from './trib';
import { LEVELS, MONSTER, monsterName, NPC, realmName, t } from '@dtl/content';

import { PLACES } from '@dtl/content/places';
import { NodeS, type WorldState } from '../state';
import { type Character } from './character';

import type { TestFlags } from '../testflags';
import type { PlayerEnt, MonEnt, Hazard, Bolt, SimHost, SimOptions, NodeEnt } from './entities';
export type { Bolt, Hazard, MonEnt, NodeEnt, PlayerEnt, SimHost, SimOptions, Stomp, StrikeCtx, Summon, TransferOpts } from './entities';
import { ArtifactSystem, type ArtifactCtx } from './artifacts';
import { DeathSystem, type DeathCtx } from './death';
import { TribulationSystem, type TribulationCtx } from './tribulation';
import { PlayerSystem, type PlayerCtx, SAVE_INTERVAL } from './players';
import { GmSystem } from './gm';
import { CombatSystem, type CombatCtx } from './combat';
import { MonsterSystem, type MonsterCtx } from './monsters';
import { EconomySystem, type EconomyCtx } from './economy';
import { WardrobeSystem, type WardrobeCtx } from './wardrobe';
import { TAUNT_BOSS_MUL } from './combat/consts';
import { resolveFor, branchModsOf, picksOf } from './method';

/** Gửi trạng thái công pháp tối đa chừng này ms một lần. */
const METHOD_SEND_MS = 250;
import { RealmSystem } from './realm';
import { MonSkills } from './monskill';
import { MonZones } from './monzone';
import { CampSystem } from './camps';
import { chainDeadlines } from './skillflow';
import { DuelSystem } from './duel';
import { TeleportSystem } from './teleport';
import { QuestObjSystem } from './questobj';
import { SpiritSystem } from './spirit';
import { MirrorSystem } from './mirror';
import { ThanTangSystem } from './thantang';
import { SoulSystem } from './soul';
import { CloneSystem } from './clone';
import { DomainSystem } from './domain';
import { parties } from './party';
import { InventorySystem } from './inventory';
import { UpgradeSystem } from './upgrade';
import { artifactMsg, buffsMsg } from './artifact';
import { log } from '../log';

import { at, type TribId } from '@dtl/shared';
const INTERACT_RANGE = 9;

export class GameSim {
  now = Date.now();
  players = new Map<string, PlayerEnt>();
  monsters: MonEnt[] = [];
  monById = new Map<string, MonEnt>();
  nodes = new Map<string, NodeEnt>();
  hazards: Hazard[] = [];
  bolts: Bolt[] = [];
  level: LevelDef;
  /** Địa hình của level (E1-A); Vân Lam giống hệt `groundAt`/`heightAt` toàn cục. */
  readonly terrain: Terrain;
  /** Hình va chạm 3D của level này (`collisionOf(levelId)`). */
  readonly collision: CollisionSet;
  private nextId = 1;
  tickMs = 0;
  /** Profiler theo hệ (TICK_PROF=1), xem game/tickprof.ts. */
  readonly prof = new TickProf();
  tickSamples: number[] = [];
  /** Lõi nhịp độ kiếp theo dữ liệu (E1-F, game/trib.ts). */
  private readonly tribSys = new TribSystem({
    now: () => this.now,
    addHazard: (g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, hot, extra) =>
      this.addHazard(g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, extra?.mv, hot, extra?.dur ?? 0, extra?.seal, extra?.reach),
    damage: (p, n, ke) => this.damagePlayer(p, n, p.sid, true, ke),
    fx: (m) => this.fx(m),
    isDead: (p) => this.isDead(p),
    nextGrp: () => this.nextHazardGrp(),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    spawnShadow: (p, st, o) => this.spawnShadow(p, st, o),
    aliveShadows: (p) => this.monsters.filter((m) => m.owner === p.sid && m.state !== MS_DEAD).length,
    shadowOf: (p) => this.monsters.find((m) => m.owner === p.sid && m.state !== MS_DEAD) ?? null,
    end: (p, ok) => this.endTribulation(p, ok, false),
    spawnBoss: (p, id, dist) => this.tribHub.spawnTribBoss(p, id, dist),
    removeMonster: (m) => this.removeMonster(m),
    stunMonster: (m, sec) => this.monSys.stun(m, sec),
    heal: (p, n) => this.healPlayer(p, n),
    drainMp: (p, n) => {
      p.char.mp = Math.max(0, p.char.mp - Math.max(0, n));
    },
    sap: (p, n) => {
      if (n > 0) this.damagePlayer(p, n, p.sid, false);
    },
    refill: (p) => {
      p.char.hp = p.char.mhp;
      p.char.mp = p.char.mmp;
    },
    suyCleared: (p, idx) => this.tribHub.suyCleared(p, idx),
  });
  /** Bình cảnh, tâm ma, linh căn (P3-7). */
  readonly realm = new RealmSystem({
    now: () => this.now,
    inWorld: () => !this.level.dungeon,
    isDead: (p) => this.isDead(p),
    nearNpc: (p, id) => this.nearNpc(p, id),
    idem: (p, r) => this.idem(p, r),
    warn: (p, k, params) => this.warn(p, k, params),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    fx: (m) => this.fx(m),
    spawnShadow: (p, st) => this.spawnShadow(p, st),
    dismissShadow: (id) => {
      const m = this.monById.get(id);
      if (m) this.removeMonster(m);
    },
    stopMeditate: (p) => this.setMeditating(p, false),
    savePlayer: (p) => this.savePlayer(p),
    questEvent: (p, type, target, n) => this.questEvent(p, type, target, n),
    inCombat: (p) => this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
    inDuel: (p) => this.duel.inDuel(p),
    player: (sid) => this.players.get(sid),
  });

  /** Nguyên tắc quái mở rộng (E1-E): đường thẳng, lao tới, nhảy đập, chui đất, phản đòn, gọi đệ tử, lộ yếu điểm. */
  readonly monSkills: MonSkills = new MonSkills({
    now: () => this.now,
    mon: (id) => this.monById.get(id),
    isDead: (m) => m.state === MS_DEAD,
    groundAt: (x, z) => this.terrain.groundAt(x, z),
    canStand: (x, z) =>
      this.terrain.heightAt(x, z) > WATER_Y + 0.3 &&
      this.terrain.playDist(x, z) < this.terrain.playWall - 4 &&
      !this.terrain.colliders.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r) &&
      !blockedAt(this.collision, x, z, this.terrain.groundAt(x, z), 0.8),
    hazard: (g, delay, mul, kind, m, mv) => this.addHazard(g, delay, mul, false, kind, m.id, m.atk, false, 0, undefined, undefined, mv),
    trail: (m, x, z, yaw, len, cfg, delay) => this.zones.addTrail(m as MonEnt, x, z, yaw, len, cfg, delay),
    damagePlayer: (p, n, src) => this.damagePlayer(p as PlayerEnt, n, src, true),
    setFlags: (m, low, ce) => this.setMonFlags(m as MonEnt, low, ce),
    setAttack: (m) => this.setMonState(m as MonEnt, MS_ATTACK),
    spawnMinion: (def, level, x, z, owner) => {
      const e = this.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    removeMinion: (m) => this.removeMonster(m as MonEnt),
    addPosture: (m, n) => this.addPosture(m as MonEnt, n),
    minionsAlive: () => this.monsters.reduce((n, o) => n + (o.minionOf && o.state !== MS_DEAD ? 1 : 0), 0),
    monsterDef: (id) => MONSTER.get(id),
  });

  /** Nuốt kéo người và vũng độc khi chết (E3-G). */
  readonly zones: MonZones = new MonZones({
    now: () => this.now,
    players: () => this.players.values(),
    isDead: (p) => this.isDead(p as PlayerEnt),
    resists: (p) => {
      const e = p as PlayerEnt;
      return this.airborne(e) || !!e.trib || this.soul.isScouting(e) || !!this.soul.ghostOf(e);
    },
    active: (m) => {
      const e = m as MonEnt;
      return e.state !== MS_DEAD && e.state !== MS_RETURN && this.monById.has(e.id) && e.stunUntil <= this.now;
    },
    drag: (p, dx, dz, dist) => {
      const e = p as PlayerEnt;
      const plan = planDash(e.move, { x: dx, z: dz }, dist, undefined, {
        terrain: this.terrain,
        bound: caveBoundOf(this.level),
        collision: this.collision,
      });
      if (plan.dist <= 0) return 0;
      if (e.meditating) this.setMeditating(e, false);
      if (e.casting) this.cancelCast(e);
      e.move.x = plan.x;
      e.move.z = plan.z;
      // Mặt đứng hiệu dụng (gồm bậc/phiến đá đi được), không chỉ heightmap: khỏi đặt người vào trong hộp rồi giật khi `push` đẩy ra.
      e.move.y = Math.max(this.terrain.groundAt(plan.x, plan.z), this.collision.standY(plan.x, plan.z, e.move.y + STEP_UP));
      e.move.vy = 0;
      e.move.grounded = true;
      e.inputs.length = 0;
      return plan.dist;
    },
    tooHigh: (p) => p.move.y - this.terrain.groundAt(p.move.x, p.move.z) > 8,
    telegraph: (x, z, r, delay, kind, src, mv, dur) =>
      this.addHazard({ x, z, r }, delay, 0, false, kind as HazardMsg['kind'], src, 0, false, 0, undefined, undefined, mv, false, dur),
    poisonHit: (p, atk, mul, src) =>
      this.damagePlayer(p as PlayerEnt, computeDamage(atk, mul, (p as PlayerEnt).char.def, Math.random(), 1).dmg, src, true),
    notify: (p, key) => this.sys(p as PlayerEnt, key, undefined, key === 'sys.pull_resist' ? 'good' : 'bad'),
  });

  /** Bãi quái theo cụm (M-2): đội hình, tái sinh cả cụm, hồi sinh theo số người trong vùng. */
  readonly camps = new CampSystem({
    now: () => this.now,
    spawn: (monId, level, x, z, sp) => {
      const def = MONSTER.get(monId);
      return def ? this.spawnMonster(def, level, x, z, sp) : null;
    },
    revive: (m, x, z) => this.respawnMonster(m, { x, z }),
    remove: (m) => this.removeMonster(m),
    snap: (x, z) => this.randomPoint(x, z, 1.5, false),
    playersIn: (zone) => {
      let n = 0;
      // Chỉ người đang kết nối và còn hoạt động (có input hoặc giao chiến trong 30 s): người "ma" hay treo máy không kéo số con/tốc độ hồi sinh.
      for (const p of this.players.values()) {
        if (!p.connected || this.isDead(p) || (this.now - p.lastInputAt > 30_000 && this.now - p.lastCombatAt > 30_000)) continue;
        if (zoneAt(this.level.zones, p.move.x, p.move.z)?.id === zone) n++;
      }
      return n;
    },
  });

  /** Tỉ thí 1v1 ở võ đài (P3-9). */
  readonly duel = new DuelSystem({
    now: () => this.now,
    // Võ đài chỉ có ở Vân Lam (toạ độ đài là hằng số của bản đồ đó).
    inWorld: () => this.opts.levelId === HOME_LEVEL && !this.level.dungeon,
    players: () => this.players.values(),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    warn: (p, k, params) => this.warn(p, k, params),
    setFlag: (p, f, on) => this.setFlag(p, f, on),
    cancelCast: (p) => this.cancelCast(p),
    stopMeditate: (p) => this.setMeditating(p, false),
    questEvent: (p, type, target, n) => this.questEvent(p, type, target, n),
  });

  /** Truyền Tống Trận (M-4): mở khóa, niệm, dịch chuyển. */
  readonly tele = new TeleportSystem({
    now: () => this.now,
    inWorld: () => !this.level.dungeon,
    level: () => this.level.id,
    transfer: (p, level, x, z) => this.host.transferLevel?.(p, level, { x, z }, { combat: true, party: true }) ?? false,
    players: () => this.players.values(),
    inCombat: (p) => this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
    inDuel: (p) => this.duel.inDuel(p),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    warn: (p, k, params) => this.warn(p, k, params),
    teleportTo: (p, x, z) => this.teleportTo(p, x, z),
    stopMeditate: (p) => this.setMeditating(p, false),
  });

  /** Kinh tế và nhiệm vụ (R-7): xem `game/economy/`. */
  private readonly ecoSys = new EconomySystem(
    ((s: GameSim): EconomyCtx => ({
      applyPillBuff: (p, def, potency) => s.applyPillBuff(p, def, potency),
      canAssist: (p, o) => s.canAssist(p, o),
      get duel() {
        return s.duel;
      },
      emit: (type, payload) => s.emit(type, payload),
      fx: (m) => s.fx(m),
      giveXp: (p, n, announce) => s.giveXp(p, n, announce),
      isDead: (p) => s.isDead(p),
      nearNpc: (p, npcId) => s.nearNpc(p, npcId),
      get nodes() {
        return s.nodes;
      },
      get now() {
        return s.now;
      },
      get players() {
        return s.players;
      },
      questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
      savePlayer: (p) => s.savePlayer(p),
      get sealHook() {
        return s.sealHook;
      },
      sendCd: (p) => s.sendCd(p),
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      get tele() {
        return s.tele;
      },
      get upgrade() {
        return s.upgrade;
      },
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Tủ ngoại trang (P4): xem `game/wardrobe/`. */
  readonly wardrobe = new WardrobeSystem(
    ((s: GameSim): WardrobeCtx => ({
      get duel() {
        return s.duel;
      },
      idem: (p, r) => s.ecoSys.idem(p, r),
      isDead: (p) => s.isDead(p),
      get now() {
        return s.now;
      },
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Quái (R-7): xem `game/monsters/`. */
  private readonly monSys = new MonsterSystem(
    ((s: GameSim): MonsterCtx => ({
      get bolts() {
        return s.bolts;
      },
      get camps() {
        return s.camps;
      },
      damagePlayer: (p, dmg, src, hv, ke) => s.damagePlayer(p, dmg, src, hv, ke),
      get domain() {
        return s.domain;
      },
      emit: (type, payload) => s.emit(type, payload),
      feedArtifact: (p, mon) => s.feedArtifact(p, mon),
      fx: (m) => s.fx(m),
      gainCharge: (p, n) => s.gainCharge(p, n),
      giveXp: (p, n, announce) => s.giveXp(p, n, announce),
      get gmSys() {
        return s.gmSys;
      },
      get hazards() {
        return s.hazards;
      },
      get host() {
        return s.host;
      },
      isDead: (p) => s.isDead(p),
      jointFinish: (p) => s.combat.jointFinish(p),
      resDot: (p) => s.combat.resDot(p),
      resFull: (p) => s.combat.resFull(p),
      lockCut: (h, p) => s.lockCut(h, p),
      get mirror() {
        return s.mirror;
      },
      get monById() {
        return s.monById;
      },
      get monSkills() {
        return s.monSkills;
      },
      get monsters() {
        return s.monsters;
      },
      get nextId() {
        return s.nextId;
      },
      set nextId(v) {
        s.nextId = v;
      },
      get now() {
        return s.now;
      },
      pickGuards: (h) => s.pickGuards(h),
      get players() {
        return s.players;
      },
      questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
      randomPoint: (cx, cz, radius, allowWater) => s.randomPoint(cx, cz, radius, allowWater),
      get realm() {
        return s.realm;
      },
      shareToGuards: (owner, n, h) => s.shareToGuards(owner, n, h),
      get soul() {
        return s.soul;
      },
      get state() {
        return s.state;
      },
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      sysAll: (k, params, type) => s.sysAll(k, params, type),
      get collision() {
        return s.collision;
      },
      get terrain() {
        return s.terrain;
      },
      get than() {
        return s.than;
      },
      get tribSys() {
        return s.tribSys;
      },
      warn: (p, k, params) => s.warn(p, k, params),
      get zones() {
        return s.zones;
      },
    }))(this),
  );

  /** Chiêu và công pháp (R-7): xem `game/combat/`. */
  private readonly combat = new CombatSystem(
    ((s: GameSim): CombatCtx => ({
      get room() {
        return s.host;
      },
      addPosture: (m, n) => s.addPosture(m, n),
      get clone() {
        return s.clone;
      },
      get duel() {
        return s.duel;
      },
      duelStrike: (p, o, powers, elemMul) => s.duelStrike(p, o, powers, elemMul),
      emit: (type, payload) => s.emit(type, payload),
      fx: (m) => s.fx(m),
      hitMonster: (p, mon, basePower, mul, elem) => s.hitMonster(p, mon, basePower, mul, elem),
      homeDist: (m) => s.homeDist(m),
      isDead: (p) => s.isDead(p),
      get level() {
        return s.level;
      },
      get mirror() {
        return s.mirror;
      },
      get monById() {
        return s.monById;
      },
      get monsters() {
        return s.monsters;
      },
      get now() {
        return s.now;
      },
      get players() {
        return s.players;
      },
      resetAi: (m) => s.resetAi(m),
      sendCd: (p) => s.sendCd(p),
      setFlag: (p, flag, on) => s.setFlag(p, flag, on),
      setMeditating: (p, on) => s.setMeditating(p, on),
      setMonFlags: (m, mf, ce) => s.setMonFlags(m, mf, ce),
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      get terrain() {
        return s.terrain;
      },
      tryInterrupt: (p, mon, extraStun) => s.tryInterrupt(p, mon, extraStun),
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Pháp bảo phụ và đan tăng sức (P3-8) (R-7): xem `game/artifacts/`. */
  private readonly artSys = new ArtifactSystem(
    ((s: GameSim): ArtifactCtx => ({
      addPosture: (m, n) => s.addPosture(m, n),
      airborne: (p) => s.airborne(p),
      canAssist: (p, o) => s.canAssist(p, o),
      get duel() {
        return s.duel;
      },
      emit: (type, payload) => s.emit(type, payload),
      fx: (m) => s.fx(m),
      get host() {
        return s.host;
      },
      isDead: (p) => s.isDead(p),
      monstersNear: (x, z, r, except) => s.monstersNear(x, z, r, except),
      get now() {
        return s.now;
      },
      sendCd: (p) => s.sendCd(p),
      setFlag: (p, flag, on) => s.setFlag(p, flag, on),
      setMonFlags: (m, mf, ce) => s.setMonFlags(m, mf, ce),
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      tryInterrupt: (p, mon, extraStun) => s.tryInterrupt(p, mon, extraStun),
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Chết và hồi sinh của người chơi (R-7) (R-7): xem `game/death/`. */
  private readonly deathSys = new DeathSystem(
    ((s: GameSim): DeathCtx => ({
      abortStrike: (p, refund, notify) => s.abortStrike(p, refund, notify),
      resTaken: (p, n) => s.combat.resTaken(p, n),
      get bossDmgMul() {
        return s.bossDmgMul;
      },
      get clone() {
        return s.clone;
      },
      damageMonster: (mon, dmg, p, crit, hv, heavy, ke, dot) => s.damageMonster(mon, dmg, p, crit, hv, heavy, ke, dot),
      get domain() {
        return s.domain;
      },
      get duel() {
        return s.duel;
      },
      emit: (type, payload) => s.emit(type, payload),
      endTribulation: (p, success, silent) => s.endTribulation(p, success, silent),
      fx: (m) => s.fx(m),
      gainCharge: (p, n) => s.gainCharge(p, n),
      giveXp: (p, n, announce) => s.giveXp(p, n, announce),
      isDead: (p) => s.isDead(p),
      get mirror() {
        return s.mirror;
      },
      get monById() {
        return s.monById;
      },
      get now() {
        return s.now;
      },
      get opts() {
        return s.opts;
      },
      get realm() {
        return s.realm;
      },
      setFlag: (p, flag, on) => s.setFlag(p, flag, on),
      setMeditating: (p, on) => s.setMeditating(p, on),
      get soul() {
        return s.soul;
      },
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      get terrain() {
        return s.terrain;
      },
      get tribSys() {
        return s.tribSys;
      },
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Độ kiếp phía sim (R-7) (R-7): xem `game/tribulation/`. */
  private readonly tribHub = new TribulationSystem(
    ((s: GameSim): TribulationCtx => ({
      get clone() {
        return s.clone;
      },
      damageMonster: (mon, dmg, p, crit, hv, heavy, ke, dot) => s.damageMonster(mon, dmg, p, crit, hv, heavy, ke, dot),
      damagePlayer: (p, dmg, src, hv, ke) => s.damagePlayer(p, dmg, src, hv, ke),
      get domain() {
        return s.domain;
      },
      get duel() {
        return s.duel;
      },
      emit: (type, payload) => s.emit(type, payload),
      fx: (m) => s.fx(m),
      get host() {
        return s.host;
      },
      isDead: (p) => s.isDead(p),
      get level() {
        return s.level;
      },
      get now() {
        return s.now;
      },
      get players() {
        return s.players;
      },
      questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
      get realm() {
        return s.realm;
      },
      savePlayer: (p) => s.savePlayer(p),
      setFlag: (p, flag, on) => s.setFlag(p, flag, on),
      setMeditating: (p, on) => s.setMeditating(p, on),
      setMonState: (m, st) => s.setMonState(m, st),
      spawnMonster: (def, level, x, z, spawn) => s.spawnMonster(def, level, x, z, spawn),
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      sysAll: (k, params, type) => s.sysAll(k, params, type),
      get tribSys() {
        return s.tribSys;
      },
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Vòng đời và tick người chơi (R-7) (R-7): xem `game/players/`. */
  private readonly plSys = new PlayerSystem(
    ((s: GameSim): PlayerCtx => ({
      cancelCast: (p) => s.cancelCast(p),
      get combat() {
        return s.combat;
      },
      get duel() {
        return s.duel;
      },
      endTribulation: (p, success, silent) => s.endTribulation(p, success, silent),
      finishCast: (p) => s.finishCast(p),
      giveXp: (p, n, announce) => s.giveXp(p, n, announce),
      isDead: (p) => s.isDead(p),
      get level() {
        return s.level;
      },
      get monSys() {
        return s.monSys;
      },
      get now() {
        return s.now;
      },
      get opts() {
        return s.opts;
      },
      get players() {
        return s.players;
      },
      questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
      get questObj() {
        return s.questObj;
      },
      get realm() {
        return s.realm;
      },
      resolvePending: (p) => s.resolvePending(p),
      sendCd: (p) => s.sendCd(p),
      setFlag: (p, flag, on) => s.setFlag(p, flag, on),
      setMeditating: (p, on) => s.setMeditating(p, on),
      get soul() {
        return s.soul;
      },
      get state() {
        return s.state;
      },
      sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
      get terrain() {
        return s.terrain;
      },
      tickTribulation: (p) => s.tickTribulation(p),
      get tribSys() {
        return s.tribSys;
      },
      warn: (p, k, params) => s.warn(p, k, params),
    }))(this),
  );

  /** Lệnh GM (R-7): xem `game/gm/`. */
  readonly gmSys = new GmSystem({
    level: () => this.level,
    monsters: () => this.monsters,
    playerCount: () => this.players.size,
    tickP95: () => this.tickP95(),
    inDuel: (p) => this.duel.inDuel(p),
    isDead: (p) => this.isDead(p),
    transferLevel: (p, level, spawn, o) => this.host.transferLevel?.(p, level, spawn, o) ?? false,
    teleportTo: (p, x, z, level) => this.teleportTo(p, x, z, level),
    teleGm: (p, arg) => this.tele.gm(p, arg),
    placeIds: () => this.placeIds(),
    questEvent: (p, type, target, n) => this.questEvent(p, type, target, n),
    damageMonster: (m, dmg, p) => this.damageMonster(m, dmg, p),
    spawnMonster: (def, lv, x, z, spawn) => this.spawnMonster(def, lv, x, z, spawn),
    removeMonster: (m) => this.removeMonster(m),
    damagePlayer: (p, dmg, src) => this.damagePlayer(p, dmg, src),
    heal: (p) => this.heal(p),
    giveXp: (p, n) => this.giveXp(p, n),
    sendCd: (p) => this.sendCd(p),
    resetCooldowns: (p) => {
      this.spirit.resetCooldown(p);
      this.soul.resetCooldown(p);
      this.clone.resetCooldown(p);
    },
    onBreakthrough: (p, force, id) => this.onBreakthrough(p, force, id),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
  });

  /** Mục tiêu nhiệm vụ `touch`/`scan`/`escort` (E2-H). */
  readonly questObj = new QuestObjSystem({
    now: () => this.now,
    level: () => this.level,
    players: () => this.players.values(),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    warn: (p, k, params) => this.warn(p, k, params),
    questEvent: (p, type, target, n) => this.questEvent(p, type, target, n),
  });

  /** Thần thức (E2-E, phím V): quét vùng quanh người, server quyết định kết quả. */
  readonly spirit = new SpiritSystem({
    now: () => this.now,
    players: () => this.players.values(),
    monsters: () => this.monsters,
    nodes: () => this.nodes.values(),
    pois: () => this.level.pois ?? [],
    isMate: (a, b) => parties.matesInRoom(a.char.id, this.host).includes(b),
    inDuel: (p) => this.duel.inDuel(p),
    warn: (p, k, params) => this.warn(p, k, params),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    stopMeditate: (p) => this.setMeditating(p, false),
    onScanned: (p, hits) => {
      this.questObj.onSpiritScan(p, hits);
      this.mirror.onScan(p, hits);
    },
  });

  /** Cung gương (E3-M): bóng giả, lặp lại, đĩa gương, nguyệt phản của Kính Nguyệt Chân Quân. Chỉ chạy khi room có boss `mirror`. */
  readonly mirror = new MirrorSystem({
    now: () => this.now,
    players: () => this.players.values(),
    monsters: () => this.monsters,
    isDead: (p) => this.isDead(p),
    monsterDef: (id) => MONSTER.get(id),
    spawnMinion: (def, level, x, z, owner) => {
      const e = this.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    addHazard: (g, delay, mul, kind, src, atk) => this.addHazard(g, delay, mul, false, kind, src, atk),
    damagePlayer: (p, n, src) => this.damagePlayer(p, n, src, true),
    fx: (m) => this.fx(m),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    sysAll: (k, params, type) => this.sysAll(k, params, type),
    spawnShadow: (p, st, o) => this.spawnShadow(p, st, o),
    sense: (m, until) => this.monSkills.sense(m, until),
    markReal: (m) => this.monSkills.markReal(m),
    groundAt: (x, z) => this.terrain.groundAt(x, z),
  });

  /** Thần Tàng Điện (E4-C): sáu tay, ngũ hành, phân thân, vòng đá của Vô Diện Thần Quân. Chỉ chạy khi room có boss `than`. */
  readonly than = new ThanTangSystem({
    now: () => this.now,
    players: () => this.players.values(),
    monsters: () => this.monsters,
    isDead: (p) => this.isDead(p),
    monsterDef: (id) => MONSTER.get(id),
    spawnMinion: (def, level, x, z, owner) => {
      const e = this.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    telegraph: (g, delay, kind, src) => this.addHazard(g, delay, 0, false, kind, src, 0),
    marker: (x, z, r, dur, kind) =>
      this.addHazard({ x, z, r }, 0.2, 0, false, kind, '', 0, false, 0, undefined, undefined, 'pool', false, dur),
    damagePlayer: (p, n, src, hv, ke) => this.damagePlayer(p, n, src, hv, ke),
    stagger: (m, sec) => this.stagger(m, sec),
    heal: (m, n) => {
      m.s.hp = Math.min(m.s.mhp, m.s.hp + n);
    },
    kill: (m) => {
      if (m.state === MS_DEAD) return;
      m.minionOf = undefined;
      m.s.hp = 0;
      m.state = MS_DEAD;
      m.s.st = MS_DEAD;
      m.removeAt = this.now + 800;
    },
    fx: (m) => this.fx(m),
    sysAll: (k, params, type) => this.sysAll(k, params, type),
    groundAt: (x, z) => this.terrain.groundAt(x, z),
    isGhost: (p) => this.soul.isScouting(p),
    elemName: (e) => t('elem.' + e),
  });

  /** Phá Ấn Phù (E4-C): do room phó bản nối vào; trả true nếu mở được một cửa phong ấn. */
  sealHook: { peek(p: PlayerEnt): number; open(i: number): void } | null = null;

  /** Nguyên anh xuất khiếu (E3-K, phím X; cứu mạng khi chết ở Nguyên Anh trở lên). */
  readonly soul = new SoulSystem({
    now: () => this.now,
    players: () => this.players.values(),
    warn: (p, k, params) => this.warn(p, k, params),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    fx: (m) => this.fx(m),
    groundAt: (x, z) => this.terrain.groundAt(x, z),
    inDuel: (p) => this.duel.inDuel(p),
    stopMeditate: (p) => this.setMeditating(p, false),
    respawnPoint: () => this.opts.respawn,
    allowDeathEscape: () => this.level.dungeon?.maxRevives === undefined,
    respawn: (p) => this.onRespawn(p),
  });

  /** Phân thân thần niệm (E4-K, phím G, Hóa Thần). */
  readonly clone: CloneSystem = new CloneSystem({
    now: () => this.now,
    players: () => this.players.values(),
    warn: (p, k, params) => this.warn(p, k, params),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    fx: (m) => this.fx(m),
    groundAt: (x, z) => this.terrain.groundAt(x, z),
    isDead: (p) => this.isDead(p),
    inDuel: (p) => this.duel.inDuel(p),
    idle: (p) => !p.connected || this.airborne(p) || p.move.flying || this.soul.isScouting(p) || !!this.soul.ghostOf(p),
    stopMeditate: (p) => this.setMeditating(p, false),
    monsterById: (id) => this.monById.get(id),
    monstersNear: (x, z, r) => this.monstersNear(x, z, r),
    powers: (p, skill) => {
      const rs = resolveFor(p.char.meta, skill);
      return { hits: rs.hits, radius: rs.radius ?? 0 };
    },
    hit: (owner, mon, power, skill) => this.cloneHit(owner, mon, power, skill),
    taunt: (owner, mon, sec) => {
      mon.taunt = { sid: owner.sid, until: this.now + sec * 1000 * (mon.def.boss ? TAUNT_BOSS_MUL : 1) };
      this.aggroMonster(mon, owner);
    },
    heal: (p, n) => this.healPlayer(p, n),
    canAssist: (owner, o) => this.canAssist(owner, o),
    onCreated: (p) => this.questEvent(p, 'clone', undefined, 1),
    spendMp: (p, n) => {
      if (p.char.mp < n) return false;
      p.char.mp -= n;
      return true;
    },
  });

  /** Lĩnh vực (E4-K): bạo kích kiếm tu, giảm sát thương hộ pháp, hồi đan sư. */
  readonly domain: DomainSystem = new DomainSystem({
    now: () => this.now,
    players: () => this.players.values(),
    canAssist: (owner, o) => this.canAssist(owner, o),
    heal: (p, n) => this.healPlayer(p, n),
    isDead: (p) => this.isDead(p),
    inDuel: (p) => this.duel.inDuel(p),
  });

  /** Sắp xếp, khóa ô, tách chồng (TD-A). */
  readonly inventory = new InventorySystem({
    now: () => this.now,
    isDead: (p) => this.isDead(p),
    idem: (p, r) => this.idem(p, r),
    warn: (p, k, params) => this.warn(p, k, params),
  });

  /** Cường hóa, khảm ngọc, tẩy luyện, phân giải (P3-3). */
  readonly upgrade = new UpgradeSystem({
    now: () => this.now,
    isDead: (p) => this.isDead(p),
    nearNpc: (p, id) => this.nearNpc(p, id),
    idem: (p, r) => this.idem(p, r),
    warn: (p, k, params) => this.warn(p, k, params),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    fx: (m) => this.fx(m),
    questEvent: (p, type, target, n) => this.questEvent(p, type, target, n),
  });

  constructor(
    public state: WorldState,
    public host: SimHost,
    public opts: SimOptions,
  ) {
    const level = LEVELS[opts.levelId];
    if (!level) throw new Error(`level không tồn tại: ${opts.levelId}`);
    this.level = level;
    this.terrain = terrainOf(this.level);
    this.collision = collisionOf(this.level);
    state.level = opts.levelId;
    // Quái đứng lẻ (tinh anh, boss): từng con hồi sinh riêng. Bãi quái: theo cụm (M-2).
    for (const sp of this.level.spawns) {
      for (let i = 0; i < sp.count; i++) this.spawnFromDef(sp);
    }
    this.camps.init(this.level.camps ?? []);
    for (const nd of this.level.nodes) {
      for (let i = 0; i < nd.count; i++) {
        const pos = this.randomPoint(nd.x, nd.z, nd.radius, false);
        const s = new NodeS();
        s.t = nd.item;
        s.x = pos.x;
        s.z = pos.z;
        s.y = this.terrain.groundAt(pos.x, pos.z);
        s.on = true;
        const id = 'n' + this.nextId++;
        state.nodes.set(id, s);
        this.nodes.set(id, { id, s, respawn: nd.respawn, respawnAt: 0 });
      }
    }
  }

  // ---------- tiện ích ----------

  private randomPoint(cx: number, cz: number, radius: number, allowWater: boolean): { x: number; z: number } {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (blockedAt(this.collision, x, z, this.terrain.groundAt(x, z), 0.8)) continue; // không đặt quái trong cây/đá/tường (COL-1)
      if (allowWater || this.terrain.heightAt(x, z) > WATER_Y + 0.5) return { x, z };
    }
    return { x: cx, z: cz };
  }

  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src' | 'q'>): void {
    const m: SysMsg = { k };
    if (params) m.p = params;
    if (type) m.t = type;
    // Đồ rơi (M4-6): chỉ là thứ đã vào túi (sau transaction), để client vẽ đồ nảy ra từ xác quái.
    if (drop?.i) m.i = drop.i;
    if (drop?.src) m.src = drop.src;
    if (drop?.q !== undefined) m.q = drop.q;
    p.client.send(S.SYS, m);
  }

  sysAll(k: string, params?: Record<string, string | number>, type?: string): void {
    const m: SysMsg = { k };
    if (params) m.p = params;
    if (type) m.t = type;
    this.host.broadcast(S.SYS, m);
  }

  private warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void {
    if (this.now - p.warnAt < 700) return;
    p.warnAt = this.now;
    this.sys(p, k, params, 'bad');
  }

  /** Vị trí (x, z) của một thực thể theo id (người chơi hoặc quái), undefined nếu không biết. */
  private posOf(id?: string): { x: number; z: number } | undefined {
    if (!id) return undefined;
    const p = this.players.get(id);
    if (p) return { x: p.move.x, z: p.move.z };
    const m = this.monById.get(id);
    return m ? { x: m.s.x, z: m.s.z } : undefined;
  }

  /**
   * Gửi tin hiệu ứng/sát thương chỉ cho người trong tầm AOI quanh điểm xảy ra (cộng người có tên trong tin). Không xác định được điểm
   * thì gửi cả phòng. Giảm băng thông và không lộ sự kiện ở xa (M-2).
   */
  private emit(type: string, payload: object): void {
    const msg = payload as { src?: string; dst?: string; x?: number; z?: number };
    const at = msg.x !== undefined && msg.z !== undefined ? { x: msg.x, z: msg.z } : (this.posOf(msg.src) ?? this.posOf(msg.dst));
    if (!at || !this.host.broadcastExcept) return this.host.broadcast(type, payload);
    // Boss thấy được tới AOI_BOSS_IN: tin có boss tham gia dùng tầm rộng hơn.
    const boss = !!(this.monById.get(msg.src ?? '')?.def.boss || this.monById.get(msg.dst ?? '')?.def.boss);
    const rr = boss ? AOI_BOSS_OUT : AOI_OUT;
    const r2 = rr * rr;
    let far: Set<string> | undefined;
    for (const p of this.players.values()) {
      const dx = p.move.x - at.x;
      const dz = p.move.z - at.z;
      if (dx * dx + dz * dz > r2 && p.sid !== msg.src && p.sid !== msg.dst) (far ??= new Set()).add(p.sid);
    }
    if (far) this.host.broadcastExcept(type, payload, far);
    else this.host.broadcast(type, payload);
  }

  fx(m: FxMsg): void {
    this.emit(S.FX, m);
  }

  private setFlag(p: PlayerEnt, flag: number, on: boolean): void {
    const fl = on ? p.s.fl | flag : p.s.fl & ~flag;
    if (fl !== p.s.fl) p.s.fl = fl;
  }

  private isDead(p: PlayerEnt): boolean {
    return (p.s.fl & PF_DEAD) !== 0;
  }

  private nearNpc(p: PlayerEnt, npcId: string): boolean {
    const n = NPC.get(npcId);
    if (!n || (n.level ?? HOME_LEVEL) !== this.level.id) return false;
    const dx = p.move.x - n.x;
    const dz = p.move.z - n.z;
    return dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE;
  }

  // ---------- người chơi vào/ra ----------

  addPlayer(client: Client, char: Character, dev: boolean, session: string, noLoot = false): PlayerEnt {
    return this.plSys.addPlayer(client, char, dev, session, noLoot);
  }
  onInput(p: PlayerEnt, m: unknown): void {
    return this.plSys.onInput(p, m);
  }
  rateOk(p: PlayerEnt): boolean {
    return this.plSys.rateOk(p);
  }
  removePlayer(sid: string): void {
    return this.plSys.removePlayer(sid);
  }
  saveAll(): void {
    return this.plSys.saveAll();
  }
  savePlayer(p: PlayerEnt): void {
    return this.plSys.savePlayer(p);
  }
  private tickPlayer(p: PlayerEnt, dt: number): void {
    return this.plSys.tickPlayer(p, dt);
  }
  syncPublic(p: PlayerEnt): void {
    return this.plSys.syncPublic(p);
  }
  applyInput(p: PlayerEnt, inp: MoveInput): void {
    return this.plSys.applyInput(p, inp);
  }
  tick(dtMs: number): void {
    const t0 = performance.now();
    this.now = Date.now();
    const dt = Math.min(dtMs, 250) / 1000;
    const prof = this.prof;
    prof.begin();
    for (const p of this.players.values()) this.tickPlayer(p, dt);
    prof.lap('players');
    for (let i = this.monsters.length - 1; i >= 0; i--) this.tickMonster(at(this.monsters, i), dt);
    prof.lap('monsters');
    this.tickHazards();
    prof.lap('hazards');
    this.zones.tick();
    prof.lap('zones');
    this.tickBolts();
    prof.lap('bolts');
    this.tickMethods();
    prof.lap('methods');
    this.camps.tick();
    prof.lap('camps');
    this.duel.tick();
    this.tele.tick();
    this.questObj.tick();
    prof.lap('duel_tele_quest');
    this.spirit.tick();
    prof.lap('spirit');
    this.mirror.tick();
    this.than.tick();
    prof.lap('mirror_than');
    this.soul.tick();
    this.clone.tick();
    this.domain.tick();
    prof.lap('soul_clone_domain');
    for (const n of this.nodes.values()) {
      if (!n.s.on && this.now >= n.respawnAt) n.s.on = true;
    }
    for (const p of this.players.values()) {
      const c = p.char;
      if (c.charDirty) {
        c.charDirty = false;
        p.client.send(S.CHAR, c.view());
      }
      if (c.invDirty && p.connected) {
        c.invDirty = false;
        p.client.send(S.INV, this.invMsg(p));
      }
      this.wardrobe.flush(p);
      if (c.questDirty) {
        c.questDirty = false;
        p.client.send(S.QUESTS, c.quests);
      }
      if (p.mth.dirty && this.now - p.mth.sentAt >= METHOD_SEND_MS) {
        p.mth.dirty = false;
        p.mth.sentAt = this.now;
        p.client.send(S.METHOD, {
          ...p.mth.toMsg(c.meta, this.now),
          br: { ...(picksOf(c) ?? {}) },
          resMods: branchModsOf(c).res,
          art: artifactMsg(c.equip, c.meta),
          buffs: buffsMsg(c.meta, Date.now()),
        });
      }
      if (this.now >= p.saveAt) {
        p.saveAt = this.now + SAVE_INTERVAL;
        this.savePlayer(p);
      }
    }
    prof.lap('send_save');
    prof.end();
    const el = performance.now() - t0;
    prof.add('tick_wall', el);
    this.tickMs = el;
    this.tickSamples.push(el);
    if (this.tickSamples.length > 1200) this.tickSamples.splice(0, 600);
  }

  tickP95(): number {
    if (!this.tickSamples.length) return 0;
    const a = [...this.tickSamples].sort((x, y) => x - y);
    return a[Math.floor(a.length * 0.95)] ?? 0;
  }

  // ---------- di chuyển ----------

  giveXp(p: PlayerEnt, n: number, announce = true): void {
    if (n <= 0) return;
    const c = p.char;
    const before = c.level;
    const wasReady = bottleneckReady(c.level, c.bk, c.xp, xpNeed(c.level));
    const ups = c.gainXp(n);
    // Vừa đầy tu vi ở tầng 5/10/15 chưa vượt: báo một lần rằng đang kẹt bình cảnh.
    if (!wasReady && bottleneckReady(c.level, c.bk, c.xp, xpNeed(c.level))) this.sys(p, 'sys.bk_blocked', undefined, 'info');
    if (announce) this.sys(p, 'sys.xp', { n }, 'xp');
    if (ups > 0) {
      this.sys(p, 'sys.levelup', { realm: realmName(c.level) }, 'good');
      this.fx({ t: 'levelup', src: p.sid });
      this.spirit.sendState(p);
      this.soul.sendState(p);
      this.clone.sendState(p);
      this.questEvent(p, 'level', undefined, c.level);
      log.info(`[level] ${c.name}: ${before} → ${c.level}`);
    }
  }

  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void {
    const ready = p.char.questEvent(type, target, n);
    for (const id of ready) {
      this.sys(p, id === 'q_dan_khi' ? 'sys.dan_khi_ok' : 'sys.quest_ready', { name: t(`quest.${id}.name`) }, 'good');
    }
  }

  // ---------- chiến đấu ----------

  private sendCd(p: PlayerEnt): void {
    const cds: Record<string, number> = {};
    for (const [k, v] of p.cds) if (v > this.now) cds[k] = v;
    const m: CdMsg = { cds, gcd: p.gcdAt, now: Date.now() };
    const em = chainDeadlines(p.flow, this.now);
    if (Object.keys(em).length) m.em = em;
    p.client.send(S.CD, m);
  }

  private abortStrike(p: PlayerEnt, refund: boolean, notify = true): void {
    return this.combat.abortStrike(p, refund, notify);
  }
  private aggroMonster(mon: MonEnt, p: PlayerEnt, assist = false): void {
    return this.combat.aggroMonster(mon, p, assist);
  }
  private airborne(p: PlayerEnt): boolean {
    return this.combat.airborne(p);
  }
  private canAssist(p: PlayerEnt, o: PlayerEnt): boolean {
    return this.combat.canAssist(p, o);
  }
  private cancelCast(p: PlayerEnt): void {
    return this.combat.cancelCast(p);
  }
  private finishCast(p: PlayerEnt): void {
    return this.combat.finishCast(p);
  }
  private gainCharge(p: PlayerEnt, n: number): void {
    return this.combat.gainCharge(p, n);
  }
  private monstersNear(x: number, z: number, r: number, except?: MonEnt): MonEnt[] {
    return this.combat.monstersNear(x, z, r, except);
  }
  private resolvePending(p: PlayerEnt): void {
    return this.combat.resolvePending(p);
  }
  private tickMethods(): void {
    return this.combat.tickMethods();
  }
  onSkill(p: PlayerEnt, msg: unknown): void {
    return this.combat.onSkill(p, msg);
  }
  onDash(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    return this.combat.onDash(p, skill, targetId);
  }
  // ---------- pháp bảo phụ và đan tăng sức (P3-8) ----------

  private applyPillBuff(
    p: PlayerEnt,
    def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number } } },
    potency: number,
  ): void {
    return this.artSys.applyPillBuff(p, def, potency);
  }
  private feedArtifact(p: PlayerEnt, mon: MonEnt): void {
    return this.artSys.feedArtifact(p, mon);
  }
  onArtifact(p: PlayerEnt): void {
    return this.artSys.onArtifact(p);
  }
  onBonded(p: PlayerEnt): void {
    return this.artSys.onBonded(p);
  }
  /** Đòn đánh lên đối thủ tỉ thí: sát thương giảm (đấu tập), không xuống dưới 1 máu, không cho kiếm ý/sạc, không thưởng gì. */
  private duelStrike(p: PlayerEnt, o: PlayerEnt, powers: number[], elemMul: number): void {
    for (const power of powers) {
      if (this.duel.foeOf(p) !== o) return;
      const { dmg, crit } = computeDamage(
        p.char.atk,
        power * elemMul * DUEL_DAMAGE_MUL,
        o.char.def,
        Math.random(),
        Math.random(),
        p.char.stats.critRate,
        p.char.stats.critMul,
      );
      let n = Math.max(1, Math.round(dmg));
      if (this.now < o.mth.guardUntil) n = reduceDamage(n, o.mth.guardReduce);
      if (o.shield) {
        const absorbed = Math.min(o.shield.amount, n);
        o.shield.amount -= absorbed;
        n -= absorbed;
        if (o.shield.amount <= 0) {
          o.shield = null;
          this.setFlag(o, PF_SHIELD, false);
        }
      }
      p.lastCombatAt = o.lastCombatAt = this.now;
      if (n > 0) o.char.hp = Math.max(1, o.char.hp - n);
      const msg: DmgMsg = { dst: o.sid, n, src: p.sid };
      if (crit) msg.crit = true;
      this.emit(S.DMG, msg);
      if (this.duel.afterHit(p, o)) return;
    }
  }

  addHazard(
    g: HazardGeom,
    delay: number,
    dmg: number,
    pct: boolean,
    kind: HazardMsg['kind'],
    src: string,
    atk = 0,
    lock = false,
    grp = 0,
    guard?: GuardCfg,
    cut?: { mul: number; max: number },
    mv?: HazardMsg['mv'],
    hot = false,
    dur = 0,
    seal?: Hazard['seal'],
    reach = false,
  ): void {
    return this.monSys.addHazard(g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, mv, hot, dur, seal, reach);
  }
  private addPosture(m: MonEnt, n: number): void {
    return this.monSys.addPosture(m, n);
  }
  bossTimers(): BossTimerMsg {
    return this.monSys.bossTimers();
  }
  checkPhase(m: MonEnt): void {
    return this.monSys.checkPhase(m);
  }
  damageMonster(
    mon: MonEnt,
    dmg: number,
    p: PlayerEnt | null,
    crit = false,
    hv = false,
    heavy = hv,
    ke: 0 | 1 | -1 = 0,
    dot = false,
  ): void {
    return this.monSys.damageMonster(mon, dmg, p, crit, hv, heavy, ke, dot);
  }
  delayBosses(): void {
    return this.monSys.delayBosses();
  }
  fireBolts(m: MonEnt, c: MonsterCaster, yaw: number, lift = 0): void {
    return this.monSys.fireBolts(m, c, yaw, lift);
  }
  private hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul = 1, elem?: string): boolean {
    return this.monSys.hitMonster(p, mon, basePower, mul, elem);
  }
  private homeDist(m: MonEnt): number {
    return this.monSys.homeDist(m);
  }
  /** Gột xong (DV-3D, Xích Tẫn Khích): hủy vùng boss đã thả rồi hạ boss qua đường giết chung (cùng tu vi, rơi đồ, nhiệm vụ như bị đánh chết). */
  purifyMonster(mon: MonEnt): void {
    if (mon.state === MS_DEAD) return;
    this.hazards = this.hazards.filter((h) => h.mon !== mon);
    mon.s.hp = 0;
    this.killMonster(mon);
  }

  private killMonster(mon: MonEnt): void {
    return this.monSys.killMonster(mon);
  }
  nextHazardGrp(): number {
    return this.monSys.nextHazardGrp();
  }
  releaseChant(m: MonEnt, c: MonsterChant): void {
    return this.monSys.releaseChant(m, c);
  }
  private removeMonster(m: MonEnt): void {
    return this.monSys.removeMonster(m);
  }
  private resetAi(m: MonEnt): void {
    return this.monSys.resetAi(m);
  }
  private respawnMonster(m: MonEnt, at?: { x: number; z: number }): void {
    return this.monSys.respawnMonster(m, at);
  }
  sendBossTimers(p?: PlayerEnt): void {
    return this.monSys.sendBossTimers(p);
  }
  private setMonFlags(m: MonEnt, mf: number, ce: number): void {
    return this.monSys.setMonFlags(m, mf, ce);
  }
  private setMonState(m: MonEnt, st: number): void {
    return this.monSys.setMonState(m, st);
  }
  private spawnFromDef(sp: SpawnDef): MonEnt | null {
    return this.monSys.spawnFromDef(sp);
  }
  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: SpawnDef | null): MonEnt {
    return this.monSys.spawnMonster(def, level, x, z, spawn);
  }
  stagger(m: MonEnt, sec: number): void {
    return this.monSys.stagger(m, sec);
  }
  private tickBolts(): void {
    return this.monSys.tickBolts();
  }
  private tickHazards(): void {
    return this.monSys.tickHazards();
  }
  private tickMonster(m: MonEnt, dt: number): void {
    return this.monSys.tickMonster(m, dt);
  }
  private tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun = 0): void {
    return this.monSys.tryInterrupt(p, mon, extraStun);
  }
  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv = false, ke?: 1 | -1): void {
    // Đánh dấu "đang chịu đòn": sát thương phản lại quái trong lúc này (Kim Chung Trấn, bộ Huyền Giáp) là thụ động, không phải ra tay (ải Đạo Tâm Suy).
    this.tribSys.hurting++;
    try {
      return this.deathSys.damagePlayer(p, dmg, src, hv, ke);
    } finally {
      this.tribSys.hurting--;
    }
  }
  grantDungeonReward(p: PlayerEnt, r: DungeonReward, key: string, label: string): boolean {
    return this.deathSys.grantDungeonReward(p, r, key, label);
  }
  onRespawn(p: PlayerEnt): void {
    return this.deathSys.onRespawn(p);
  }
  beginTribulation(p: PlayerEnt, def: TribDef, consume: boolean): boolean {
    return this.tribHub.beginTribulation(p, def, consume);
  }
  private cloneHit(p: PlayerEnt, mon: MonEnt, power: number, skill: SkillDef | undefined): void {
    return this.tribHub.cloneHit(p, mon, power, skill);
  }
  private endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void {
    return this.tribHub.endTribulation(p, success, silent);
  }
  private healPlayer(p: PlayerEnt, n: number): void {
    return this.tribHub.healPlayer(p, n);
  }
  private lockCut(h: Hazard, p: PlayerEnt): { mul: number; max: number } {
    return this.tribHub.lockCut(h, p);
  }
  onBottleneck(p: PlayerEnt, msg: unknown): void {
    return this.tribHub.onBottleneck(p, msg);
  }
  onBreakthrough(p: PlayerEnt, force = false, id?: TribId): void {
    return this.tribHub.onBreakthrough(p, force, id);
  }
  onChangeRoot(p: PlayerEnt, msg: unknown): void {
    return this.tribHub.onChangeRoot(p, msg);
  }
  onClone(p: PlayerEnt, msg: unknown): void {
    return this.tribHub.onClone(p, msg);
  }
  onTribClone(p: PlayerEnt): void {
    return this.tribHub.onTribClone(p);
  }
  onTribSoul(p: PlayerEnt): void {
    return this.tribHub.onTribSoul(p);
  }
  private pickGuards(h: Hazard): PlayerEnt[] {
    return this.tribHub.pickGuards(h);
  }
  private shareToGuards(owner: PlayerEnt, n: number, h: Hazard): number {
    return this.tribHub.shareToGuards(owner, n, h);
  }
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o: { dyaw?: number; level?: number } = {}): MonEnt | null {
    return this.tribHub.spawnShadow(p, st, o);
  }
  private tickTribulation(p: PlayerEnt): void {
    return this.tribHub.tickTribulation(p);
  }
  private setMeditating(p: PlayerEnt, on: boolean): void {
    p.meditating = on;
    this.setFlag(p, PF_MEDITATING, on);
  }

  onMeditate(p: PlayerEnt, msg: unknown): void {
    const on = !!(msg as { on?: unknown } | null)?.on;
    if (!on) return this.setMeditating(p, false);
    if (this.isDead(p) || p.move.flying || !p.move.grounded || p.casting || p.trib || this.clone.has(p)) return this.warn(p, 'sys.busy');
    if (this.now - p.lastCombatAt < 5000) return this.warn(p, 'sys.busy');
    this.setMeditating(p, true);
    if (p.char.quests.active.q_dan_khi && !p.char.questComplete('q_dan_khi')) this.sys(p, 'sys.dan_khi_start', undefined, 'info');
  }

  private idem(p: PlayerEnt, r: unknown): string | null | undefined {
    return this.ecoSys.idem(p, r);
  }
  private invMsg(p: PlayerEnt): InvMsg {
    return this.ecoSys.invMsg(p);
  }
  onBuy(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onBuy(p, msg);
  }
  onCraft(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onCraft(p, msg);
  }
  onEnhance(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onEnhance(p, msg);
  }
  onEquip(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onEquip(p, msg);
  }
  onGather(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onGather(p, msg);
  }
  onMethod(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onMethod(p, msg);
  }
  onMoveItem(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onMoveItem(p, msg);
  }
  onQuest(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onQuest(p, msg);
  }
  onSell(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onSell(p, msg);
  }
  onSkillUp(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onSkillUp(p, msg);
  }
  onSkillVar(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onSkillVar(p, msg);
  }
  onBranch(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onBranch(p, msg);
  }
  onTalk(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onTalk(p, msg);
  }
  onUnequip(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onUnequip(p, msg);
  }
  onUpgrade(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onUpgrade(p, msg);
  }
  onUse(p: PlayerEnt, msg: unknown): void {
    return this.ecoSys.onUse(p, msg);
  }
  onChat(p: PlayerEnt, msg: unknown): void {
    let text = (msg as { m?: unknown } | null)?.m;
    if (typeof text !== 'string') return;
    text = text
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, CHAT_MAX_LEN);
    if (!text) return;
    if (this.now - p.chatAt < 800) return this.warn(p, 'sys.chat_rate');
    p.chatAt = this.now;
    if (p.dev && (text as string).startsWith('/gm ')) return this.gmSys.run(p, (text as string).slice(4).trim().split(/\s+/));
    this.host.broadcast(S.CHAT, { from: p.char.name, c: 'say', m: text });
    // Kính Nguyệt Chân Quân lặp lại câu cuối của người đối diện (E3-M).
    const echo = this.mirror.echoLine(text as string, p);
    if (echo && this.now - this.mirrorChatAt > 6000) {
      this.mirrorChatAt = this.now;
      this.host.broadcast(S.CHAT, { from: monsterName(echo.boss.def.id), c: 'say', m: echo.line });
    }
  }
  private mirrorChatAt = 0;
  /** Hệ số sát thương boss lên người chơi (E3-M: giải đố ba gương đúng thì < 1). */
  bossDmgMul = 1;

  /** Id địa điểm thuộc level của room này. */
  placeIds(): string[] {
    return PLACES.filter((pl) => pl.level === this.opts.levelId).map((pl) => pl.id);
  }

  /**
   * Lý do chưa rời bản đồ được (khóa i18n), '' nếu được (E1-B): không chết, không độ kiếp/tâm ma, không tỉ thí,
   * không niệm dở hay đang ra chiêu; `combat` thêm điều kiện không giao chiến (Truyền Tống).
   */
  leaveBlocker(p: PlayerEnt, combat = false): string {
    if (this.isDead(p)) return 'sys.tele_dead';
    if (p.trib || p.trial || this.duel.inDuel(p) || p.casting || p.flow.pending) return 'sys.tele_busy';
    if (combat && this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000) return 'sys.tele_combat';
    return '';
  }

  /** Dịch chuyển tức thì (chỉ gọi từ lệnh GM / tham số kiểm thử). Điểm không thuộc level của room thì từ chối. */
  teleportTo(p: PlayerEnt, x: number, z: number, level = this.opts.levelId): boolean {
    if (level !== this.opts.levelId || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    p.move = { x, y: this.terrain.groundAt(x, z), z, vy: 0, grounded: true, flying: false };
    p.inputs.length = 0;
    return true;
  }

  private heal(p: PlayerEnt): void {
    p.char.hp = p.char.mhp;
    p.char.mp = p.char.mmp;
  }

  /**
   * Tham số kiểm thử lúc vào room (`?god`, `?at=`), đã qua `readTestFlags` ở room.
   * `at` chỉ áp khi điểm thuộc level của room này (ví dụ `tong_mon` không áp trong bí cảnh).
   */
  applyTestFlags(p: PlayerEnt, f: TestFlags): void {
    if (!p.dev) return;
    if (f.realm) {
      this.gmSys.setLevel(p, f.realm);
      this.sys(p, 'sys.gm', { m: 'level = ' + p.char.level }, 'info');
    }
    if (f.god) {
      p.god = true;
      this.heal(p);
      this.sys(p, 'sys.gm', { m: 'god on' }, 'info');
    }
    if (
      f.at &&
      f.at.level !== this.level.id &&
      !LEVELS[f.at.level]?.dungeon &&
      this.host.transferLevel?.(p, f.at.level, { x: f.at.x, z: f.at.z }, { force: true })
    )
      this.sys(p, 'sys.gm', { m: `at ${f.at.id} → ${f.at.level}` }, 'info');
    else if (f.at && this.teleportTo(p, f.at.x, f.at.z, f.at.level)) this.sys(p, 'sys.gm', { m: `at ${f.at.id}` }, 'info');
    else if (!f.at && f.pos && this.teleportTo(p, f.pos.x, f.pos.z))
      this.sys(p, 'sys.gm', { m: `at ${Math.round(f.pos.x)},${Math.round(f.pos.z)}` }, 'info');
    if (f.trib) this.sys(p, 'sys.gm', { m: this.gmSys.tribulation(p) }, 'info');
  }
}
