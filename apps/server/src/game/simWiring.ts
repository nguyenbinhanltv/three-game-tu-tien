// Nối các hệ của GameSim (Đợt E): mỗi hàm dựng giao diện hẹp `*Ctx` (hoặc tham số dựng) cho một `*System`, chỉ chuyển từ s.ts.
// Thành viên private của GameSim đi qua `SimPrivates` (cầu nối `px` do lớp tự dựng), phần public qua `s`.
import {
  blockedAt,
  standingY,
  COMBAT_REGEN_DELAY,
  computeDamage,
  caveBoundOf,
  type HazardMsg,
  type InvMsg,
  MS_ATTACK,
  MS_DEAD,
  MS_RETURN,
  S,
  type SkillDef,
  type SpawnDef,
  WATER_Y,
  planDash,
  zoneAt,
  HOME_LEVEL,
} from '@dtl/shared';
import { TribSystem } from './trib';
import { MONSTER, t } from '@dtl/content';
import type { PlayerEnt, MonEnt, Hazard } from './entities';
import { ArtifactSystem, type ArtifactCtx } from './artifacts';
import { DeathSystem, type DeathCtx } from './death';
import { TribulationSystem, type TribulationCtx } from './tribulation';
import { PlayerSystem, type PlayerCtx } from './players';
import { GmSystem } from './gm';
import { CombatSystem, type CombatCtx } from './combat';
import { MonsterSystem, type MonsterCtx } from './monsters';
import { EconomySystem, type EconomyCtx } from './economy';
import { type WardrobeCtx } from './wardrobe';
import { TAUNT_BOSS_MUL } from './combat/consts';
import { resolveFor } from './method';
import { RealmSystem } from './realm';
import { KieuSystem } from './kieu';
import { MonSkills } from './monskill';
import { MonZones } from './monzone';
import { CampSystem } from './camps';
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
import { type HitTier } from '@dtl/shared';
import type { GameSim } from './sim';

/** Thành viên private của `GameSim` mà các hàm nối hệ cần dùng; do lớp tự dựng (`px`). */
export interface SimPrivates {
  readonly tribSys: TribSystem;
  readonly ecoSys: EconomySystem;
  readonly monSys: MonsterSystem;
  readonly combat: CombatSystem;
  readonly artSys: ArtifactSystem;
  readonly deathSys: DeathSystem;
  readonly tribHub: TribulationSystem;
  readonly plSys: PlayerSystem;
  nextId: number;
  randomPoint(cx: number, cz: number, radius: number, allowWater: boolean): { x: number; z: number };
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  posOf(id?: string): { x: number; z: number } | undefined;
  emit(type: string, payload: object): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  isDead(p: PlayerEnt): boolean;
  nearNpc(p: PlayerEnt, npcId: string): boolean;
  tickPlayer(p: PlayerEnt, dt: number): void;
  sendCd(p: PlayerEnt): void;
  abortStrike(p: PlayerEnt, refund: boolean, notify?: boolean): void;
  aggroMonster(mon: MonEnt, p: PlayerEnt, assist?: boolean): void;
  airborne(p: PlayerEnt): boolean;
  canAssist(p: PlayerEnt, o: PlayerEnt): boolean;
  cancelCast(p: PlayerEnt): void;
  finishCast(p: PlayerEnt): void;
  gainCharge(p: PlayerEnt, n: number): void;
  monstersNear(x: number, z: number, r: number, except?: MonEnt): MonEnt[];
  resolvePending(p: PlayerEnt): void;
  tickMethods(): void;
  applyPillBuff(
    p: PlayerEnt,
    def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number } } },
    potency: number,
  ): void;
  feedArtifact(p: PlayerEnt, mon: MonEnt): void;
  duelStrike(p: PlayerEnt, o: PlayerEnt, powers: number[], elemMul: number): void;
  addPosture(m: MonEnt, n: number): void;
  hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul?: number, elem?: string, tier?: HitTier, defScale?: number): boolean;
  homeDist(m: MonEnt): number;
  killMonster(mon: MonEnt): void;
  removeMonster(m: MonEnt): void;
  resetAi(m: MonEnt): void;
  respawnMonster(m: MonEnt, at?: { x: number; z: number }): void;
  setMonFlags(m: MonEnt, mf: number, ce: number): void;
  setMonState(m: MonEnt, st: number): void;
  spawnFromDef(sp: SpawnDef): MonEnt | null;
  tickBolts(): void;
  tickHazards(): void;
  tickMonster(m: MonEnt, dt: number): void;
  tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun?: number): void;
  cloneHit(p: PlayerEnt, mon: MonEnt, power: number, skill: SkillDef | undefined): void;
  endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void;
  healPlayer(p: PlayerEnt, n: number): void;
  lockCut(h: Hazard, p: PlayerEnt): { mul: number; max: number };
  pickGuards(h: Hazard): PlayerEnt[];
  shareToGuards(owner: PlayerEnt, n: number, h: Hazard): number;
  tickTribulation(p: PlayerEnt): void;
  setMeditating(p: PlayerEnt, on: boolean): void;
  idem(p: PlayerEnt, r: unknown): string | null | undefined;
  invMsg(p: PlayerEnt): InvMsg;
  heal(p: PlayerEnt): void;
}

export function wireTribSys(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof TribSystem>[0] {
  return {
    now: () => s.now,
    addHazard: (g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, hot, extra) =>
      s.addHazard(g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, extra?.mv, hot, extra?.dur ?? 0, extra?.seal, extra?.reach),
    damage: (p, n, ke) => s.damagePlayer(p, n, p.sid, true, ke),
    fx: (m) => s.fx(m),
    isDead: (p) => priv.isDead(p),
    nextGrp: () => s.nextHazardGrp(),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    spawnShadow: (p, st, o) => s.spawnShadow(p, st, o),
    aliveShadows: (p) => s.monsters.filter((m) => m.owner === p.sid && m.state !== MS_DEAD).length,
    shadowOf: (p) => s.monsters.find((m) => m.owner === p.sid && m.state !== MS_DEAD) ?? null,
    end: (p, ok) => priv.endTribulation(p, ok, false),
    spawnBoss: (p, id, dist) => priv.tribHub.spawnTribBoss(p, id, dist),
    removeMonster: (m) => priv.removeMonster(m),
    stunMonster: (m, sec) => priv.monSys.stun(m, sec),
    heal: (p, n) => priv.healPlayer(p, n),
    drainMp: (p, n) => {
      p.char.mp = Math.max(0, p.char.mp - Math.max(0, n));
    },
    // Nguồn sát thương là chính chủ kiếp (không phải id quái): `damagePlayer` không tìm thấy quái nào để phản đòn hay tính "bị bóng đánh trúng".
    sap: (p, n) => {
      if (n > 0) s.damagePlayer(p, n, p.sid, false);
    },
    refill: (p) => {
      p.char.hp = p.char.mhp;
      p.char.mp = p.char.mmp;
    },
    suyCleared: (p, idx) => priv.tribHub.suyCleared(p, idx),
  };
}

export function wireRealm(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof RealmSystem>[0] {
  return {
    now: () => s.now,
    inWorld: () => !s.level.dungeon,
    isDead: (p) => priv.isDead(p),
    nearNpc: (p, id) => priv.nearNpc(p, id),
    idem: (p, r) => priv.idem(p, r),
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    fx: (m) => s.fx(m),
    spawnShadow: (p, st) => s.spawnShadow(p, st),
    dismissShadow: (id) => {
      const m = s.monById.get(id);
      if (m) priv.removeMonster(m);
    },
    stopMeditate: (p) => priv.setMeditating(p, false),
    savePlayer: (p) => s.savePlayer(p),
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
    inCombat: (p) => s.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
    inDuel: (p) => s.duel.inDuel(p),
    player: (sid) => s.players.get(sid),
  };
}

export function wireMonSkills(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof MonSkills>[0] {
  return {
    now: () => s.now,
    mon: (id) => s.monById.get(id),
    isDead: (m) => m.state === MS_DEAD,
    groundAt: (x, z) => s.terrain.groundAt(x, z),
    canStand: (x, z) =>
      s.terrain.heightAt(x, z) > WATER_Y + 0.3 &&
      s.terrain.playDist(x, z) < s.terrain.playWall - 4 &&
      !s.terrain.colliders.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r) &&
      !blockedAt(s.collision, x, z, s.terrain.groundAt(x, z), 0.8),
    hazard: (g, delay, mul, kind, m, mv) => s.addHazard(g, delay, mul, false, kind, m.id, m.atk, false, 0, undefined, undefined, mv),
    trail: (m, x, z, yaw, len, cfg, delay) => s.zones.addTrail(m as MonEnt, x, z, yaw, len, cfg, delay),
    damagePlayer: (p, n, src) => s.damagePlayer(p as PlayerEnt, n, src, true),
    setFlags: (m, low, ce) => priv.setMonFlags(m as MonEnt, low, ce),
    setAttack: (m) => priv.setMonState(m as MonEnt, MS_ATTACK),
    spawnMinion: (def, level, x, z, owner) => {
      const e = s.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    removeMinion: (m) => priv.removeMonster(m as MonEnt),
    addPosture: (m, n) => priv.addPosture(m as MonEnt, n),
    minionsAlive: () => s.monsters.reduce((n, o) => n + (o.minionOf && o.state !== MS_DEAD ? 1 : 0), 0),
    monsterDef: (id) => MONSTER.get(id),
    fx: (m) => priv.emit(S.FX, m),
    notifyNear: (m, range, key) => {
      for (const p of s.players.values())
        if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) <= range) s.sys(p, key, undefined, key === 'sys.face_duong' ? 'good' : 'info');
    },
  };
}

export function wireZones(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof MonZones>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    isDead: (p) => priv.isDead(p as PlayerEnt),
    resists: (p) => {
      const e = p as PlayerEnt;
      return priv.airborne(e) || !!e.trib || s.soul.isScouting(e) || !!s.soul.ghostOf(e);
    },
    active: (m) => {
      const e = m as MonEnt;
      return e.state !== MS_DEAD && e.state !== MS_RETURN && s.monById.has(e.id) && e.stunUntil <= s.now;
    },
    drag: (p, dx, dz, dist) => {
      const e = p as PlayerEnt;
      const plan = planDash(e.move, { x: dx, z: dz }, dist, undefined, {
        terrain: s.terrain,
        bound: caveBoundOf(s.level),
        collision: s.collision,
      });
      if (plan.dist <= 0) return 0;
      if (e.meditating) priv.setMeditating(e, false);
      if (e.casting) priv.cancelCast(e);
      e.move.x = plan.x;
      e.move.z = plan.z;
      // Mặt đứng hiệu dụng (gồm bậc/phiến đá đi được), không chỉ heightmap: khỏi đặt người vào trong hộp rồi giật khi `push` đẩy ra.
      e.move.y = standingY(s.terrain, s.collision, plan.x, plan.z, plan.y);
      e.move.vy = 0;
      e.move.grounded = true;
      e.inputs.length = 0;
      return plan.dist;
    },
    tooHigh: (p) => p.move.y - s.terrain.groundAt(p.move.x, p.move.z) > 8,
    telegraph: (x, z, r, delay, kind, src, mv, dur) =>
      s.addHazard({ x, z, r }, delay, 0, false, kind as HazardMsg['kind'], src, 0, false, 0, undefined, undefined, mv, false, dur),
    poisonHit: (p, atk, mul, src) =>
      s.damagePlayer(p as PlayerEnt, computeDamage(atk, mul, (p as PlayerEnt).char.def, Math.random(), 1).dmg, src, true),
    notify: (p, key) => s.sys(p as PlayerEnt, key, undefined, key === 'sys.pull_resist' ? 'good' : 'bad'),
  };
}

export function wireCamps(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof CampSystem>[0] {
  return {
    now: () => s.now,
    spawn: (monId, level, x, z, sp) => {
      const def = MONSTER.get(monId);
      return def ? s.spawnMonster(def, level, x, z, sp) : null;
    },
    revive: (m, x, z) => priv.respawnMonster(m, { x, z }),
    remove: (m) => priv.removeMonster(m),
    snap: (x, z) => priv.randomPoint(x, z, 1.5, false),
    playersIn: (zone) => {
      let n = 0;
      // Chỉ người đang kết nối và còn hoạt động (có input hoặc giao chiến trong 30 s): người "ma" hay treo máy không kéo số con/tốc độ hồi sinh.
      for (const p of s.players.values()) {
        if (!p.connected || priv.isDead(p) || (s.now - p.lastInputAt > 30_000 && s.now - p.lastCombatAt > 30_000)) continue;
        if (zoneAt(s.level.zones, p.move.x, p.move.z)?.id === zone) n++;
      }
      return n;
    },
  };
}

export function wireDuel(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof DuelSystem>[0] {
  return {
    now: () => s.now,
    // Võ đài chỉ có ở Vân Lam (toạ độ đài là hằng số của bản đồ đó).
    inWorld: () => s.opts.levelId === HOME_LEVEL && !s.level.dungeon,
    players: () => s.players.values(),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    warn: (p, k, params) => priv.warn(p, k, params),
    setFlag: (p, f, on) => priv.setFlag(p, f, on),
    cancelCast: (p) => priv.cancelCast(p),
    stopMeditate: (p) => priv.setMeditating(p, false),
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
  };
}

export function wireTele(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof TeleportSystem>[0] {
  return {
    now: () => s.now,
    inWorld: () => !s.level.dungeon,
    level: () => s.level.id,
    transfer: (p, level, x, z) => s.host.transferLevel?.(p, level, { x, z }, { combat: true, party: true }) ?? false,
    players: () => s.players.values(),
    inCombat: (p) => s.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
    inDuel: (p) => s.duel.inDuel(p),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    warn: (p, k, params) => priv.warn(p, k, params),
    teleportTo: (p, x, z) => s.teleportTo(p, x, z),
    stopMeditate: (p) => priv.setMeditating(p, false),
  };
}

export function wireEcoSys(s: GameSim, priv: SimPrivates): EconomyCtx {
  return {
    applyPillBuff: (p, def, potency) => priv.applyPillBuff(p, def, potency),
    canAssist: (p, o) => priv.canAssist(p, o),
    get duel() {
      return s.duel;
    },
    emit: (type, payload) => priv.emit(type, payload),
    fx: (m) => s.fx(m),
    giveXp: (p, n, announce) => s.giveXp(p, n, announce),
    isDead: (p) => priv.isDead(p),
    nearNpc: (p, npcId) => priv.nearNpc(p, npcId),
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
    sendCd: (p) => priv.sendCd(p),
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    get tele() {
      return s.tele;
    },
    get upgrade() {
      return s.upgrade;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireWardrobe(s: GameSim, priv: SimPrivates): WardrobeCtx {
  return {
    get duel() {
      return s.duel;
    },
    idem: (p, r) => priv.ecoSys.idem(p, r),
    isDead: (p) => priv.isDead(p),
    get now() {
      return s.now;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireMonSys(s: GameSim, priv: SimPrivates): MonsterCtx {
  return {
    get bolts() {
      return s.bolts;
    },
    get camps() {
      return s.camps;
    },
    damagePlayer: (p, dmg, src, hv, ke) => s.damagePlayer(p, dmg, src, hv, ke),
    pushMonster: (mon, fx, fz, dist) => priv.combat.pushMonster(mon, fx, fz, dist),
    get domain() {
      return s.domain;
    },
    emit: (type, payload) => priv.emit(type, payload),
    feedArtifact: (p, mon) => priv.feedArtifact(p, mon),
    fx: (m) => s.fx(m),
    gainCharge: (p, n) => priv.gainCharge(p, n),
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
    isDead: (p) => priv.isDead(p),
    jointFinish: (p) => priv.combat.jointFinish(p),
    resDot: (p) => priv.combat.resDot(p),
    healPlayer: (o, n) => priv.combat.healPlayer(o, n),
    resFull: (p) => priv.combat.resFull(p),
    lockCut: (h, p) => priv.lockCut(h, p),
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
      return priv.nextId;
    },
    set nextId(v) {
      priv.nextId = v;
    },
    get now() {
      return s.now;
    },
    pickGuards: (h) => priv.pickGuards(h),
    get players() {
      return s.players;
    },
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
    randomPoint: (cx, cz, radius, allowWater) => priv.randomPoint(cx, cz, radius, allowWater),
    get realm() {
      return s.realm;
    },
    shareToGuards: (owner, n, h) => priv.shareToGuards(owner, n, h),
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
      return priv.tribSys;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
    get zones() {
      return s.zones;
    },
  };
}

export function wireCombat(s: GameSim, priv: SimPrivates): CombatCtx {
  return {
    get room() {
      return s.host;
    },
    addPosture: (m, n) => priv.addPosture(m, n),
    get clone() {
      return s.clone;
    },
    get duel() {
      return s.duel;
    },
    duelStrike: (p, o, powers, elemMul) => priv.duelStrike(p, o, powers, elemMul),
    emit: (type, payload) => priv.emit(type, payload),
    fx: (m) => s.fx(m),
    hitMonster: (p, mon, basePower, mul, elem, tier, defScale) => priv.hitMonster(p, mon, basePower, mul, elem, tier, defScale),
    homeDist: (m) => priv.homeDist(m),
    isDead: (p) => priv.isDead(p),
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
    resetAi: (m) => priv.resetAi(m),
    tribSkill: (p) => priv.tribSys.noteSkill(p),
    sendCd: (p) => priv.sendCd(p),
    setFlag: (p, flag, on) => priv.setFlag(p, flag, on),
    setMeditating: (p, on) => priv.setMeditating(p, on),
    setMonFlags: (m, mf, ce) => priv.setMonFlags(m, mf, ce),
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    get terrain() {
      return s.terrain;
    },
    tryInterrupt: (p, mon, extraStun) => priv.tryInterrupt(p, mon, extraStun),
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireArtSys(s: GameSim, priv: SimPrivates): ArtifactCtx {
  return {
    addPosture: (m, n) => priv.addPosture(m, n),
    markMon: (p, mon, id, n) => priv.combat.markMon(p, mon, id, n),
    addRes: (p, n) => priv.combat.addRes(p, n),
    airborne: (p) => priv.airborne(p),
    canAssist: (p, o) => priv.canAssist(p, o),
    get duel() {
      return s.duel;
    },
    emit: (type, payload) => priv.emit(type, payload),
    fx: (m) => s.fx(m),
    get host() {
      return s.host;
    },
    isDead: (p) => priv.isDead(p),
    monstersNear: (x, z, r, except) => priv.monstersNear(x, z, r, except),
    get now() {
      return s.now;
    },
    sendCd: (p) => priv.sendCd(p),
    setFlag: (p, flag, on) => priv.setFlag(p, flag, on),
    setMonFlags: (m, mf, ce) => priv.setMonFlags(m, mf, ce),
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    tryInterrupt: (p, mon, extraStun) => priv.tryInterrupt(p, mon, extraStun),
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireDeathSys(s: GameSim, priv: SimPrivates): DeathCtx {
  return {
    hitReact: (p, tier, fx, fz) => priv.plSys.hitReact(p, tier, fx, fz),
    abortStrike: (p, refund, notify) => priv.abortStrike(p, refund, notify),
    resTaken: (p, n) => priv.combat.resTaken(p, n),
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
    emit: (type, payload) => priv.emit(type, payload),
    endTribulation: (p, success, silent) => priv.endTribulation(p, success, silent),
    fx: (m) => s.fx(m),
    gainCharge: (p, n) => priv.gainCharge(p, n),
    giveXp: (p, n, announce) => s.giveXp(p, n, announce),
    isDead: (p) => priv.isDead(p),
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
    setFlag: (p, flag, on) => priv.setFlag(p, flag, on),
    setMeditating: (p, on) => priv.setMeditating(p, on),
    get soul() {
      return s.soul;
    },
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    get terrain() {
      return s.terrain;
    },
    get tribSys() {
      return priv.tribSys;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireTribHub(s: GameSim, priv: SimPrivates): TribulationCtx {
  return {
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
    emit: (type, payload) => priv.emit(type, payload),
    fx: (m) => s.fx(m),
    get host() {
      return s.host;
    },
    isDead: (p) => priv.isDead(p),
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
    setFlag: (p, flag, on) => priv.setFlag(p, flag, on),
    setMeditating: (p, on) => priv.setMeditating(p, on),
    setMonState: (m, st) => priv.setMonState(m, st),
    spawnMonster: (def, level, x, z, spawn) => s.spawnMonster(def, level, x, z, spawn),
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    sysAll: (k, params, type) => s.sysAll(k, params, type),
    get tribSys() {
      return priv.tribSys;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wirePlSys(s: GameSim, priv: SimPrivates): PlayerCtx {
  return {
    cancelCast: (p) => priv.cancelCast(p),
    get combat() {
      return priv.combat;
    },
    get duel() {
      return s.duel;
    },
    endTribulation: (p, success, silent) => priv.endTribulation(p, success, silent),
    finishCast: (p) => priv.finishCast(p),
    giveXp: (p, n, announce) => s.giveXp(p, n, announce),
    isDead: (p) => priv.isDead(p),
    get level() {
      return s.level;
    },
    get monSys() {
      return priv.monSys;
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
    resolvePending: (p) => priv.resolvePending(p),
    sendCd: (p) => priv.sendCd(p),
    setFlag: (p, flag, on) => priv.setFlag(p, flag, on),
    setMeditating: (p, on) => priv.setMeditating(p, on),
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
    tickTribulation: (p) => priv.tickTribulation(p),
    get tribSys() {
      return priv.tribSys;
    },
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireGmSys(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof GmSystem>[0] {
  return {
    level: () => s.level,
    monsters: () => s.monsters,
    playerCount: () => s.players.size,
    tickP95: () => s.tickP95(),
    inDuel: (p) => s.duel.inDuel(p),
    isDead: (p) => priv.isDead(p),
    transferLevel: (p, level, spawn, o) => s.host.transferLevel?.(p, level, spawn, o) ?? false,
    practice: (p) => s.host.leavePractice?.(p) || s.host.enterPractice?.(p) || false,
    teleportTo: (p, x, z, level) => s.teleportTo(p, x, z, level),
    teleGm: (p, arg) => s.tele.gm(p, arg),
    players: () => s.players.values(),
    lab: () => priv.monSys,
    placeIds: () => s.placeIds(),
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
    damageMonster: (m, dmg, p) => s.damageMonster(m, dmg, p),
    spawnMonster: (def, lv, x, z, spawn) => s.spawnMonster(def, lv, x, z, spawn),
    removeMonster: (m) => priv.removeMonster(m),
    damagePlayer: (p, dmg, src) => s.damagePlayer(p, dmg, src),
    heal: (p) => priv.heal(p),
    giveXp: (p, n) => s.giveXp(p, n),
    sendCd: (p) => priv.sendCd(p),
    resetCooldowns: (p) => {
      s.spirit.resetCooldown(p);
      s.soul.resetCooldown(p);
      s.clone.resetCooldown(p);
    },
    onBreakthrough: (p, force, id) => s.onBreakthrough(p, force, id),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
  };
}

export function wireQuestObj(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof QuestObjSystem>[0] {
  return {
    now: () => s.now,
    level: () => s.level,
    players: () => s.players.values(),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    warn: (p, k, params) => priv.warn(p, k, params),
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
  };
}

export function wireSpirit(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof SpiritSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    monsters: () => s.monsters,
    nodes: () => s.nodes.values(),
    pois: () => s.level.pois ?? [],
    isMate: (a, b) => parties.matesInRoom(a.char.id, s.host).includes(b),
    inDuel: (p) => s.duel.inDuel(p),
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    stopMeditate: (p) => priv.setMeditating(p, false),
    onScanned: (p, hits) => {
      s.questObj.onSpiritScan(p, hits);
      s.mirror.onScan(p, hits);
    },
  };
}

export function wireMirror(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof MirrorSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    monsters: () => s.monsters,
    isDead: (p) => priv.isDead(p),
    monsterDef: (id) => MONSTER.get(id),
    spawnMinion: (def, level, x, z, owner) => {
      const e = s.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    addHazard: (g, delay, mul, kind, src, atk) => s.addHazard(g, delay, mul, false, kind, src, atk),
    damagePlayer: (p, n, src) => s.damagePlayer(p, n, src, true),
    fx: (m) => s.fx(m),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    sysAll: (k, params, type) => s.sysAll(k, params, type),
    spawnShadow: (p, st, o) => s.spawnShadow(p, st, o),
    sense: (m, until) => s.monSkills.sense(m, until),
    markReal: (m) => s.monSkills.markReal(m),
    groundAt: (x, z) => s.terrain.groundAt(x, z),
  };
}

export function wireThan(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof ThanTangSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    monsters: () => s.monsters,
    isDead: (p) => priv.isDead(p),
    monsterDef: (id) => MONSTER.get(id),
    spawnMinion: (def, level, x, z, owner) => {
      const e = s.spawnMonster(def, level, x, z, null);
      e.minionOf = owner.id;
      return e;
    },
    telegraph: (g, delay, kind, src) => s.addHazard(g, delay, 0, false, kind, src, 0),
    marker: (x, z, r, dur, kind) =>
      s.addHazard({ x, z, r }, 0.2, 0, false, kind, '', 0, false, 0, undefined, undefined, 'pool', false, dur),
    damagePlayer: (p, n, src, hv, ke) => s.damagePlayer(p, n, src, hv, ke),
    stagger: (m, sec) => s.stagger(m, sec),
    heal: (m, n) => {
      m.s.hp = Math.min(m.s.mhp, m.s.hp + n);
    },
    kill: (m) => {
      if (m.state === MS_DEAD) return;
      m.minionOf = undefined;
      m.s.hp = 0;
      m.state = MS_DEAD;
      m.s.st = MS_DEAD;
      m.removeAt = s.now + 800;
    },
    fx: (m) => s.fx(m),
    sysAll: (k, params, type) => s.sysAll(k, params, type),
    groundAt: (x, z) => s.terrain.groundAt(x, z),
    isGhost: (p) => s.soul.isScouting(p),
    elemName: (e) => t('elem.' + e),
  };
}

export function wireSoul(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof SoulSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    fx: (m) => s.fx(m),
    groundAt: (x, z) => s.terrain.groundAt(x, z),
    standY: (x, z, y) => standingY(s.terrain, s.collision, x, z, y),
    inDuel: (p) => s.duel.inDuel(p),
    stopMeditate: (p) => priv.setMeditating(p, false),
    respawnPoint: () => s.opts.respawn,
    allowDeathEscape: () => s.level.dungeon?.maxRevives === undefined,
    respawn: (p) => s.onRespawn(p),
  };
}

export function wireClone(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof CloneSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    fx: (m) => s.fx(m),
    groundAt: (x, z) => s.terrain.groundAt(x, z),
    isDead: (p) => priv.isDead(p),
    inDuel: (p) => s.duel.inDuel(p),
    idle: (p) => !p.connected || priv.airborne(p) || p.move.flying || s.soul.isScouting(p) || !!s.soul.ghostOf(p),
    stopMeditate: (p) => priv.setMeditating(p, false),
    monsterById: (id) => s.monById.get(id),
    monstersNear: (x, z, r) => priv.monstersNear(x, z, r),
    powers: (p, skill) => {
      const rs = resolveFor(p.char.meta, skill);
      return { hits: rs.hits, radius: rs.radius ?? 0 };
    },
    hit: (owner, mon, power, skill) => priv.cloneHit(owner, mon, power, skill),
    taunt: (owner, mon, sec) => {
      mon.taunt = { sid: owner.sid, until: s.now + sec * 1000 * (mon.def.boss ? TAUNT_BOSS_MUL : 1) };
      priv.aggroMonster(mon, owner);
    },
    heal: (p, n) => priv.healPlayer(p, n),
    canAssist: (owner, o) => priv.canAssist(owner, o),
    onCreated: (p) => s.questEvent(p, 'clone', undefined, 1),
    spendMp: (p, n) => {
      if (p.char.mp < n) return false;
      p.char.mp -= n;
      return true;
    },
  };
}

export function wireDomain(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof DomainSystem>[0] {
  return {
    now: () => s.now,
    players: () => s.players.values(),
    canAssist: (owner, o) => priv.canAssist(owner, o),
    heal: (p, n) => priv.healPlayer(p, n),
    isDead: (p) => priv.isDead(p),
    inDuel: (p) => s.duel.inDuel(p),
  };
}

export function wireInventory(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof InventorySystem>[0] {
  return {
    now: () => s.now,
    isDead: (p) => priv.isDead(p),
    idem: (p, r) => priv.idem(p, r),
    warn: (p, k, params) => priv.warn(p, k, params),
  };
}

export function wireKieu(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof KieuSystem>[0] {
  return {
    get now() {
      return Date.now();
    },
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    nearNpc: (p, id) => priv.nearNpc(p, id),
    leaveBlocker: (p) => s.leaveBlocker(p),
    isDead: (p) => priv.isDead(p),
    giveXp: (p, n, announce) => s.giveXp(p, n, announce),
    savePlayer: (p) => s.savePlayer(p),
  };
}

export function wireUpgrade(s: GameSim, priv: SimPrivates): ConstructorParameters<typeof UpgradeSystem>[0] {
  return {
    now: () => s.now,
    isDead: (p) => priv.isDead(p),
    nearNpc: (p, id) => priv.nearNpc(p, id),
    idem: (p, r) => priv.idem(p, r),
    warn: (p, k, params) => priv.warn(p, k, params),
    sys: (p, k, params, type) => s.sys(p, k, params, type),
    fx: (m) => s.fx(m),
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
  };
}
