import { randomInt } from 'node:crypto';
import type { Client } from 'colyseus';
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
  pillPotency,
  PILL_TIERS,
  rollPillQuality,
  sealPosture,
  sealStun,
  shieldAmount,
  boltLift,
  chargeFromTaken,
  bottleneckReady,
  type CdMsg,
  CHAT_MAX_LEN,
  DUEL_DAMAGE_MUL,
  RESONANCE_DEF,
  COMBAT_REGEN_DELAY,
  computeDamage,
  DEATH_XP_LOSS,
  type DmgMsg,
  caveBoundOf,
  type DungeonReward,
  isWearSlot,
  wearableBy,
  type WearSlot,
  glowStage,
  lookSet,
  accessoryCode,
  healAmount,
  methodSwitchCost,
  METHOD_SWITCH_COOLDOWN_SEC,
  METHOD_UNLOCK_LEVEL,
  MAX_SKILL_LEVEL,
  reduceDamage,
  skillUpgradeCost,
  variantSwitchBlock,
  BIND_QUALITY,
  rollEquipDrops,
  sellPrice,
  type InvItem,
  type Quality,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  elemDamageMul,
  elemCounter,
  STAT_CAPS,
  counterMul,
  MAX_LEVEL,
  hazardHit,
  HP_REGEN_IDLE,
  HP_REGEN_MEDITATE,
  type HazardGeom,
  type HazardMsg,
  IN_FLY,
  IN_JUMP,
  type InitMsg,
  INV_SIZE,
  type InvMsg,
  type InvSlot,
  type LevelDef,
  meditateXpPerSec,
  MF_STUN,
  type MonsterCaster,
  type MonsterChant,
  type MonsterDef,
  type MoveInput,
  type MoveState,
  type PhaseRules,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  MS_RETURN,
  MP_REGEN_COMBAT,
  MP_REGEN_IDLE,
  MP_REGEN_MEDITATE,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
  PF_SHIELD,
  PF_TRIBULATION,
  PROTOCOL_VERSION,
  S,
  SKILL_MSG_PER_SEC,
  type SkillDef,
  SPAWN_POINT,
  canFlyAt,
  freeFlight,
  type SpawnDef,
  STEP,
  stepMove,
  type SysMsg,
  tribDef,
  tribForLevel,
  type TribDef,
  bottleneckBlocked,
  buffMag,
  TRUC_CO_FREE_FLY_ALT,
  SOUL_DEATH_HP,
  skyFlightUnlocked,
  vulnerableDamage,
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
import { TribSystem, type GuardCfg, type TribState } from './trib';
import { ARTIFACT, PILL_QUALITY, ITEM, ITEM_SYS, ITEMS, itemName, LEVELS, MONSTER, monsterName, nextMajorRealmName, NPC, QUEST, QUESTS, realmName, RECIPE, SETS, SKILL, t, METHOD, VARIANTS, skillName } from '@dtl/content';

import { PLACES } from '@dtl/content/places';
import { MonS, NodeS, PlayerS, type WorldState } from '../state';
import { type Character, isEquipSlot, sameSlot } from './character';

/** Quá số ô đổi này thì gửi ảnh túi đầy đủ thay vì delta. */
const INV_DELTA_MAX = 24;
import type { TestFlags } from '../testflags';
import { GmSystem } from './gm';
import { CombatSystem, type CombatCtx } from './combat';
import { MonsterSystem, type MonsterCtx } from './monsters';
import { TAUNT_BOSS_MUL, visualSeed } from './combat/consts';
import { MethodRt, passiveOf, resolveFor, setSkillLevel, skillLevelOf } from './method';

/** Bí Tịch Tàn Quyển: nguyên liệu nâng cấp chiêu. */
const SKILL_SCROLL = 'itm_bi_tich_tan_quyen';

/** Kiếm đan bản mệnh (E2-G): mỗi người một bộ, nhịp đánh theo `every`. */
export interface Summon { sid: string; until: number; nextAt: number; every: number; count: number; range: number; power: number; markFirst: boolean; elem?: string }
/** Giậm của Sơn Nhạc Hóa Thân (E2-G). */
export interface Stomp { sid: string; until: number; nextAt: number; every: number; r: number; power: number }
const METHOD_NPC = 'npc_chuong_mon';
/** Đan dược dùng lên đồng đội (Thanh Mộc Đan Kinh) trong tầm này (mét). */
const POTION_ALLY_RANGE = 12;
/** Gửi trạng thái công pháp tối đa chừng này ms một lần. */
const METHOD_SEND_MS = 250;
import { RealmSystem } from './realm';
import { MonSkills, type MonSkillRt } from './monskill';
import { MonZones } from './monzone';
import { CampSystem, type CampRt } from './camps';
import { empowerDeadlines, SkillFlow } from './skillflow';
import { DuelSystem } from './duel';
import { TeleportSystem } from './teleport';
import { QuestObjSystem } from './questobj';
import { SpiritSystem } from './spirit';
import { MirrorSystem, wardMul } from './mirror';
import { ThanTangSystem } from './thantang';
import { SoulSystem } from './soul';
import { CloneSystem } from './clone';
import { DomainSystem } from './domain';
import { parties } from './party';
import { InventorySystem } from './inventory';
import { UpgradeSystem } from './upgrade';
import { artifactMsg, buffsMsg, equippedArtifact, feedQi, progressOf } from './artifact';


const INTERACT_RANGE = 9;
const GATHER_RANGE = 5;
const INPUT_BUDGET_MAX = 0.3;
const FLY_MP_PER_SEC = 1.5;
const SAVE_INTERVAL = 30_000;

export interface PlayerEnt {
  sid: string;
  client: Client;
  char: Character;
  s: PlayerS;
  /** Tài khoản thử (đăng nhập thử khi server bật AUTH_DEV_BYPASS): được dùng lệnh GM và tham số kiểm thử. */
  dev: boolean;
  /** `?god` / `/gm god`: vẫn nhận đòn (số sát thương, khựng) nhưng không mất máu. Chỉ bật cho `dev`. */
  god: boolean;
  move: MoveState;
  inputs: MoveInput[];
  budget: number;
  lastInputAt: number;
  lastYaw: number;
  lastFlags: number;
  gcdAt: number;
  cds: Map<string, number>;
  itemCdAt: number;
  /** Mặc/tháo đồ: tối thiểu 200 ms giữa hai lần (mỗi lần là một giao dịch DB + dòng ledger). */
  equipCdAt: number;
  /** Ảnh túi client đang có (để gửi delta `S.INV`). */
  invSent?: InvSlot[];
  casting: { skill: SkillDef; target: string; endAt: number } | null;
  /** Đòn chờ `hitAt`, chuỗi đánh thường, cửa sổ cường hóa, lướt (K-2). */
  flow: SkillFlow;
  shield: { amount: number; until: number } | null;
  lastCombatAt: number;
  /** Lần đổi biến thức gần nhất (giờ server, ms): giãn các lần đổi. Không lưu DB. */
  variantAt: number;
  /** Cửa sổ miễn vùng nổ của quái: hết lúc `until` (ms), đã nhận `taken` (xem hazardHit). */
  hazardWin: { until: number; taken: number };
  meditating: boolean;
  xpAcc: number;
  /** Giây đả tọa tích lũy chưa báo cho nhiệm vụ `meditate` (dẫn khí nhập thể). */
  medAcc: number;
  /** `fin`: đã thả tia cuối (pha 3); `pills`: số đan hồi phục đã dùng trong kiếp này. */
  trib: TribState | null;
  /** Thử thách tâm ma đang chạy (P3-7): hết giờ `endAt`, bóng `monId`, chỗ bắt đầu (x, z). Xem `game/realm.ts`. */
  trial: { endAt: number; monId: string; x: number; z: number } | null;
  warnAt: number;
  chatAt: number;
  msgWindowAt: number;
  msgCount: number;
  /** Cửa sổ 1 giây đếm lệnh dùng skill (chống spam, riêng với giới hạn message chung). */
  skillWindowAt: number;
  skillCount: number;
  /** Trạng thái công pháp (kiếm ý/thế, vòng sạc, giảm sát thương). */
  mth: MethodRt;
  saveAt: number;
  /** Không nhận vật phẩm rơi (đã hết lượt thưởng bí cảnh hôm nay). */
  noLoot: boolean;
  /** Bị server đá (spam): không giữ chỗ chờ kết nối lại. */
  kicked: boolean;
  connected: boolean;
}

export interface MonEnt {
  id: string;
  def: MonsterDef;
  s: MonS;
  level: number;
  atk: number;
  defn: number;
  homeX: number;
  homeZ: number;
  spawn: SpawnDef | null;
  /** Cụm (bãi quái) mà con này thuộc về (M-2); hồi sinh do cụm quản. */
  camp?: CampRt;
  state: number;
  target: string;
  attackAt: number;
  respawnAt: number;
  removeAt: number;
  thinkAt: number;
  wanderAt: number;
  wx: number;
  wz: number;
  unreachableSince: number;
  /** Trước thời điểm này quái miễn sát thương (đang bỏ đuổi về chỗ). */
  evadeUntil: number;
  abilityAt: number;
  threat: Map<string, number>;
  /** sid chủ của quái riêng (bóng tâm ma): chỉ đánh và bị đánh bởi người này, không rơi đồ/tu vi. '' = quái thường. */
  owner: string;
  /** Ô cận chiến: giữ tới lúc này; không được giành lại trước `slotCdAt`. */
  slotUntil: number;
  slotCdAt: number;
  /** sid người chơi có ô cận chiến mà quái này đang giữ ('' = không giữ). */
  slotSid: string;
  /** Chiều đi vòng ngoài (±1). */
  orbitSign: number;
  /** Đòn thứ hai của chuỗi đòn đôi (0 = không có). */
  comboAt: number;
  comboTarget: string;
  /** Đang đọc chú (quái đánh xa). */
  cast: { endAt: number } | null;
  castReadyAt: number;
  /** Boss đang niệm chú (ngắt được sau đoạn hộ chú); `chantAt`: lúc được niệm lần tới (0 = chưa hẹn). */
  chant: { startAt: number; endAt: number; lastAt?: number } | null;
  chantAt: number;
  /** Bị ngắt chú hoặc mất thế: choáng tới lúc này, nhận thêm sát thương. */
  stunUntil: number;
  /** Pha boss (0 = pha đầu) và bộ chiêu/nhịp của pha đó (quái thường luôn ở pha 0). */
  phase: number;
  rules: PhaseRules;
  /** Thanh phá thế 0–1 và lúc trúng đòn gần nhất (ms). */
  posture: number;
  lastHitAt: number;
  /** Chiêu chém vùng: lúc được ra tiếp (0 = chưa hẹn); đang đứng yên khóa hướng tới `windUntil`. */
  sweepAt: number;
  windUntil: number;
  /** Nguyên tắc quái mở rộng (E1-E, game/monskill.ts). */
  mx: MonSkillRt;
  /** Đệ tử do quái `minionOf` gọi: không rơi đồ, không tu vi. */
  minionOf?: string;
  /** Dấu ấn của người chơi `sid` (Kiếm Ảnh Phân Quang): sát thương của người đó nhân (1 + mul) tới `until`. */
  mark?: { sid: string; until: number; mul: number };
  /** Bị khiêu khích: buộc nhắm người `sid` tới `until` (ms). */
  taunt?: { sid: string; until: number };
  /** Bị làm chậm (đòn bạo kích của bộ Hàn Giao Lân): tốc độ đuổi nhân `mul` tới `until`. */
  slow?: { until: number; mul: number };
  /** Mộc độc của Hồi Xuân Quyết (đan sư): mỗi giây gây `per` sát thương tới `until`. */
  poison?: { sid: string; until: number; nextAt: number; per: number };
}

interface NodeEnt {
  id: string;
  s: NodeS;
  respawn: number;
  respawnAt: number;
}

export interface Hazard extends HazardGeom {
  at: number;
  /**
   * Sát thương cố định, phần trăm khí huyết tối đa nếu pct = true,
   * hoặc hệ số nhân với `atk` qua computeDamage nếu atk > 0.
   */
  dmg: number;
  pct: boolean;
  atk: number;
  /** Quái thả vùng (null = thiên kiếp). */
  mon: MonEnt | null;
  /** Tia cuối độ kiếp: khóa mệnh (trúng chủ kiếp dù đứng ngoài vòng), đan phòng ngự giảm sát thương. */
  lock?: boolean;
  /** Nhóm vòng cùng một vạch lôi võng: một người chỉ trúng một lần mỗi nhóm trong cùng nhịp nổ. */
  grp?: number;
  /** Tia khóa mệnh có hộ pháp: người đứng trong `r` mét chắn thay `share` sát thương (chia đều, tối đa `max` người). */
  guard?: GuardCfg;
  /** Giảm sát thương của tia khóa mệnh theo mức buff phòng ngự (`final.defMul`/`defMaxCut` của kiếp). */
  cut?: { mul: number; max: number };
  /** Trận môn khắc chế (Thiên Nhân Kiếp): ai đứng trong vòng này lúc nổ giảm `cut` và nhận cờ `ke`. */
  seal?: { x: number; z: number; r: number; cut: number };
  /** Luôn trúng chủ kiếp dù đứng ngoài vòng (không né bằng cách rời sân); người khác vẫn xét vị trí. Khác `lock`: không có giảm sát thương theo đan. */
  reach?: boolean;
  /** Nguồn: id quái, hoặc sid người độ kiếp. Thiên kiếp trúng cả người ngoài đứng trong vòng, nhưng không giết họ (xem `tickHazards`). */
  src: string;
}

/** Đạn đánh xa của quái đang bay (D1). Vị trí tính lại từ gốc + thời gian, không tích lũy sai số. */
export interface Bolt {
  id: number;
  x0: number;
  z0: number;
  yaw: number;
  v: number;
  r: number;
  /** Độ nâng theo độ cao mục tiêu lúc bắn (boltLift). */
  lift: number;
  /** Giờ server (ms) lúc phát và lúc hết hạn. */
  t0: number;
  endAt: number;
  /** Vị trí ở tick trước (để quét đoạn). */
  px: number;
  pz: number;
  atk: number;
  mul: number;
  mon: MonEnt;
}


export interface SimHost {
  broadcast(type: string, msg: unknown): void;
  /** Gửi cho cả phòng trừ các phiên trong `except` (AOI: người ở xa không nhận). Không có thì lùi về `broadcast`. */
  broadcastExcept?(type: string, msg: unknown, except: ReadonlySet<string>): void;
  /** Bí cảnh: gọi khi một quái không hồi sinh bị hạ. */
  onMonsterKilled?(m: MonEnt): void;
  /**
   * Chuyển người chơi sang bản đồ khác (E1-B): room kiểm điều kiện, cấp vé một lần, lưu nhân vật rồi báo client vào room mới.
   * Trả false nếu bị chặn (đã báo lý do cho người chơi). Không có (test) thì từ chối.
   */
  transferLevel?(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o?: TransferOpts): boolean;
  /** Độ kiếp ở room riêng (E1-F): cấp vé cho người độ kiếp và đồng đội trong tầm, báo client đổi room. false = bị chặn. */
  enterTribulationRoom?(p: PlayerEnt, def: TribDef, force: boolean): boolean;
  /** Một lần độ kiếp vừa kết thúc (thành công hoặc không). Room độ kiếp dùng để đóng phòng. */
  onTribulationEnd?(p: PlayerEnt, def: TribDef, success: boolean): void;
}

export interface TransferOpts {
  /** Chặn khi đang giao chiến (Truyền Tống). */
  combat?: boolean;
  /** Người dẫn tổ đội kéo theo đồng đội cùng room, trong tầm. */
  party?: boolean;
  /** Bỏ qua kiểm điều kiện (lệnh GM / tham số kiểm thử của tài khoản thử). */
  force?: boolean;
}

export interface SimOptions {
  levelId: string;
  roomName: string;
  /** Điểm xuất hiện mặc định. */
  spawn: { x: number; z: number };
  /** Chết thì hồi sinh tại đây. */
  respawn: { x: number; z: number };
  /** Có lưu vị trí khi rời room không (bí cảnh thì không). */
  persistPosition: boolean;
}

/** Ngữ cảnh một lần áp chiêu: đòn thứ mấy của chuỗi đánh thường, hệ số nhân (combo, cường hóa). */
export interface StrikeCtx {
  combo?: number;
  mul?: number;
}

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
  private nextId = 1;
  tickMs = 0;
  tickSamples: number[] = [];
  /** Lõi nhịp độ kiếp theo dữ liệu (E1-F, game/trib.ts). */
  private readonly tribSys = new TribSystem({
    now: () => this.now,
    addHazard: (g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, hot, extra) => this.addHazard(g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, extra?.mv, hot, extra?.dur ?? 0, extra?.seal, extra?.reach),
    damage: (p, n, ke) => this.damagePlayer(p, n, p.sid, true, ke),
    fx: (m) => this.fx(m),
    isDead: (p) => this.isDead(p),
    nextGrp: () => this.nextHazardGrp(),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    spawnShadow: (p, st, o) => this.spawnShadow(p, st, o),
    aliveShadows: (p) => this.monsters.filter((m) => m.owner === p.sid && m.state !== MS_DEAD).length,
    shadowOf: (p) => this.monsters.find((m) => m.owner === p.sid && m.state !== MS_DEAD) ?? null,
    end: (p, ok) => this.endTribulation(p, ok, false),
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
    canStand: (x, z) => this.terrain.heightAt(x, z) > WATER_Y + 0.3 && this.terrain.playDist(x, z) < this.terrain.playWall - 4 && !this.terrain.colliders.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r),
    hazard: (g, delay, mul, kind, m, mv) => this.addHazard(g, delay, mul, false, kind, m.id, m.atk, false, 0, undefined, undefined, mv),
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
      const plan = planDash(e.move, { x: dx, z: dz }, dist, undefined, { terrain: this.terrain, bound: caveBoundOf(this.level) });
      if (plan.dist <= 0) return 0;
      if (e.meditating) this.setMeditating(e, false);
      if (e.casting) this.cancelCast(e);
      e.move.x = plan.x;
      e.move.z = plan.z;
      e.move.y = this.terrain.groundAt(plan.x, plan.z);
      e.move.vy = 0;
      e.move.grounded = true;
      e.inputs.length = 0;
      return plan.dist;
    },
    tooHigh: (p) => p.move.y - this.terrain.groundAt(p.move.x, p.move.z) > 8,
    telegraph: (x, z, r, delay, kind, src, mv, dur) => this.addHazard({ x, z, r }, delay, 0, false, kind as HazardMsg['kind'], src, 0, false, 0, undefined, undefined, mv, false, dur),
    poisonHit: (p, atk, mul, src) => this.damagePlayer(p as PlayerEnt, computeDamage(atk, mul, (p as PlayerEnt).char.def, Math.random(), 1).dmg, src, true),
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

  /** Quái (R-7): xem `game/monsters/`. */
  private readonly monSys = new MonsterSystem(((s: GameSim): MonsterCtx => ({
    addStack: (p, max, decay) => s.addStack(p, max, decay),
    get bolts() { return s.bolts; },
    get camps() { return s.camps; },
    damagePlayer: (p, dmg, src, hv, ke) => s.damagePlayer(p, dmg, src, hv, ke),
    get domain() { return s.domain; },
    emit: (type, payload) => s.emit(type, payload),
    feedArtifact: (p, mon) => s.feedArtifact(p, mon),
    fx: (m) => s.fx(m),
    gainCharge: (p, n) => s.gainCharge(p, n),
    giveXp: (p, n, announce) => s.giveXp(p, n, announce),
    get gmSys() { return s.gmSys; },
    get hazards() { return s.hazards; },
    get host() { return s.host; },
    isDead: (p) => s.isDead(p),
    liveStacks: (p) => s.liveStacks(p),
    lockCut: (h, p) => s.lockCut(h, p),
    get mirror() { return s.mirror; },
    get monById() { return s.monById; },
    get monSkills() { return s.monSkills; },
    get monsters() { return s.monsters; },
    get nextId() { return s.nextId; },
    set nextId(v) { s.nextId = v; },
    get now() { return s.now; },
    pickGuards: (h) => s.pickGuards(h),
    get players() { return s.players; },
    questEvent: (p, type, target, n) => s.questEvent(p, type, target, n),
    randomPoint: (cx, cz, radius, allowWater) => s.randomPoint(cx, cz, radius, allowWater),
    get realm() { return s.realm; },
    shareToGuards: (owner, n, h) => s.shareToGuards(owner, n, h),
    get soul() { return s.soul; },
    get state() { return s.state; },
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    sysAll: (k, params, type) => s.sysAll(k, params, type),
    get terrain() { return s.terrain; },
    get than() { return s.than; },
    get tribSys() { return s.tribSys; },
    warn: (p, k, params) => s.warn(p, k, params),
    get zones() { return s.zones; },
    rollLoot: (p, mon, part) => s.rollLoot(p, mon, part),
  }))(this));

  /** Chiêu và công pháp (R-7): xem `game/combat/`. */
  private readonly combat = new CombatSystem(((s: GameSim): CombatCtx => ({
    get clone() { return s.clone; },
    get duel() { return s.duel; },
    duelStrike: (p, o, powers, elemMul) => s.duelStrike(p, o, powers, elemMul),
    emit: (type, payload) => s.emit(type, payload),
    fx: (m) => s.fx(m),
    hitMonster: (p, mon, basePower, mul, elem) => s.hitMonster(p, mon, basePower, mul, elem),
    homeDist: (m) => s.homeDist(m),
    isDead: (p) => s.isDead(p),
    get level() { return s.level; },
    get mirror() { return s.mirror; },
    get monById() { return s.monById; },
    get monsters() { return s.monsters; },
    get now() { return s.now; },
    get players() { return s.players; },
    resetAi: (m) => s.resetAi(m),
    sendCd: (p) => s.sendCd(p),
    setFlag: (p, flag, on) => s.setFlag(p, flag, on),
    setMeditating: (p, on) => s.setMeditating(p, on),
    setMonFlags: (m, mf, ce) => s.setMonFlags(m, mf, ce),
    sys: (p, k, params, type, drop) => s.sys(p, k, params, type, drop),
    get terrain() { return s.terrain; },
    tryInterrupt: (p, mon, extraStun) => s.tryInterrupt(p, mon, extraStun),
    warn: (p, k, params) => s.warn(p, k, params),
  }))(this));

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
    onBreakthrough: (p, force) => this.onBreakthrough(p, force),
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
    marker: (x, z, r, dur, kind) => this.addHazard({ x, z, r }, 0.2, 0, false, kind, '', 0, false, 0, undefined, undefined, 'pool', false, dur),
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
    this.level = LEVELS[opts.levelId];
    this.terrain = terrainOf(this.level);
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
    const s = new PlayerS();
    s.name = char.name;
    s.g = char.appearance.g;
    s.dye = char.appearance.dye;
    s.hr = char.appearance.hair ?? '';
    let x = this.opts.spawn.x;
    let z = this.opts.spawn.z;
    let y = 0;
    if (this.opts.persistPosition && char.room === this.opts.levelId && char.x > 1 && char.z > 1) {
      x = char.x;
      z = char.z;
      y = char.y;
    }
    if (char.hp <= 0) {
      // Rời game lúc đang trọng thương: tỉnh lại ở điểm hồi sinh, không đứng dậy tại chỗ.
      x = this.opts.respawn.x;
      z = this.opts.respawn.z;
      y = 0;
      char.hp = Math.round(char.mhp * 0.5);
    }
    const g = this.terrain.groundAt(x, z);
    if (!(y >= g)) y = g;
    if (y > g + 3) y = g; // không lưu trạng thái đang bay
    char.room = this.opts.levelId;
    char.charDirty = char.invDirty = char.questDirty = true;
    const p: PlayerEnt = {
      sid: client.sessionId,
      client,
      char,
      s,
      dev,
      god: false,
      move: { x, y, z, vy: 0, grounded: true, flying: false },
      inputs: [],
      budget: 0,
      lastInputAt: this.now,
      lastYaw: 0,
      lastFlags: 0,
      gcdAt: 0,
      cds: new Map(),
      itemCdAt: 0,
      equipCdAt: 0,
      casting: null,
      flow: new SkillFlow(),
      shield: null,
      lastCombatAt: 0,
      variantAt: -1e9,
      hazardWin: { until: 0, taken: 0 },
      meditating: false,
      xpAcc: 0,
      trib: null,
      medAcc: 0,
      trial: null,
      warnAt: 0,
      chatAt: 0,
      msgWindowAt: this.now,
      msgCount: 0,
      skillWindowAt: this.now,
      skillCount: 0,
      mth: new MethodRt(),
      saveAt: this.now + SAVE_INTERVAL,
      noLoot,
      connected: true,
      kicked: false,
    };
    this.syncPublic(p);
    this.state.players.set(p.sid, s);
    this.players.set(p.sid, p);
    const init: InitMsg = {
      sid: p.sid,
      protocol: PROTOCOL_VERSION,
      room: this.opts.roomName,
      char: char.view(),
      inv: char.inv,
      equip: char.equip,
      quests: char.quests,
      serverTime: Date.now(),
      dev,
      session,
    };
    client.send(S.INIT, init);
    char.charDirty = char.invDirty = char.questDirty = false;
    this.sendCd(p);
    return p;
  }

  removePlayer(sid: string): void {
    this.combat.echoes.delete(sid);
    const p = this.players.get(sid);
    if (!p) return;
    if (p.trib) this.endTribulation(p, false, true);
    this.realm.onLeave(p);
    this.duel.onGone(p);
    this.questObj.drop(p);
    this.savePlayer(p);
    this.monSys.meleeSlot.delete(sid);
    this.monSys.slotWait.delete(sid);
    this.players.delete(sid);
    this.state.players.delete(sid);
  }

  savePlayer(p: PlayerEnt): void {
    const c = p.char;
    if (this.opts.persistPosition) {
      // Đang xuất khiếu thám thính: lưu chỗ thân xác, không phải chỗ nguyên anh (có thể trong tường/giữa không).
      const at = this.soul.bodyOf(p) ?? p.move;
      c.x = at.x;
      c.y = at.y;
      c.z = at.z;
      c.room = this.opts.levelId;
    }
    try {
      c.save();
    } catch (e) {
      console.error('[save] lỗi lưu nhân vật', c.name, e);
    }
  }

  saveAll(): void {
    for (const p of this.players.values()) this.savePlayer(p);
  }

  private syncPublic(p: PlayerEnt): void {
    const s = p.s;
    const c = p.char;
    const m = p.move;
    if (s.x !== m.x) s.x = m.x;
    if (s.y !== m.y) s.y = m.y;
    if (s.z !== m.z) s.z = m.z;
    if (s.vy !== m.vy) s.vy = m.vy;
    if (s.gr !== m.grounded) s.gr = m.grounded;
    const hp = Math.max(0, Math.ceil(c.hp));
    const mp = Math.max(0, Math.floor(c.mp));
    if (s.hp !== hp) s.hp = hp;
    if (s.mhp !== c.mhp) s.mhp = c.mhp;
    if (s.mp !== mp) s.mp = mp;
    if (s.mmp !== c.mmp) s.mmp = c.mmp;
    if (s.lv !== c.level) s.lv = c.level;
    const wp = c.equip.weapon?.id ?? '';
    if (s.wp !== wp) s.wp = wp;
    const wg = glowStage(c.equip.weapon?.plus ?? 0);
    if (s.wg !== wg) s.wg = wg;
    const sk = lookSet(c.stats.sets)?.id ?? '';
    if (s.sk !== sk) s.sk = sk;
    const sa = accessoryCode(SETS, c.equip);
    if (s.sa !== sa) s.sa = sa;
    // Skin sai giới (đổi giới tính bằng GM sau khi mặc) không được hiển thị; món vẫn nằm ở ô, tháo ra bình thường.
    const skinId = c.equip.skin?.id ?? '';
    const sn = skinId && wearableBy(ITEM.get(skinId), c.appearance.g) ? skinId : '';
    if (s.sn !== sn) s.sn = sn;
    const art = c.equip.artifact?.id ?? '';
    if (s.art !== art) s.art = art;
    const mt = c.meta.method ?? '';
    if (s.mt !== mt) s.mt = mt;
    this.setFlag(p, PF_FLYING, m.flying);
  }

  /** Giới hạn tần suất message. Trả về false nếu phải bỏ message này. */
  rateOk(p: PlayerEnt): boolean {
    if (this.now - p.msgWindowAt >= 1000) {
      p.msgWindowAt = this.now;
      p.msgCount = 0;
    }
    p.msgCount++;
    if (p.msgCount > 400) {
      p.kicked = true;
      p.client.leave(4002);
      return false;
    }
    return p.msgCount <= 90;
  }

  // ---------- vòng tick ----------

  tick(dtMs: number): void {
    const t0 = performance.now();
    this.now = Date.now();
    const dt = Math.min(dtMs, 250) / 1000;
    for (const p of this.players.values()) this.tickPlayer(p, dt);
    for (let i = this.monsters.length - 1; i >= 0; i--) this.tickMonster(this.monsters[i], dt);
    this.tickHazards();
    this.zones.tick();
    this.tickBolts();
    this.tickMethods();
    this.camps.tick();
    this.duel.tick();
    this.tele.tick();
    this.questObj.tick();
    this.spirit.tick();
    this.mirror.tick();
    this.than.tick();
    this.soul.tick();
    this.clone.tick();
    this.domain.tick();
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
      if (c.questDirty) {
        c.questDirty = false;
        p.client.send(S.QUESTS, c.quests);
      }
      if (p.mth.dirty && this.now - p.mth.sentAt >= METHOD_SEND_MS) {
        p.mth.dirty = false;
        p.mth.sentAt = this.now;
        p.client.send(S.METHOD, { ...p.mth.toMsg(c.meta, this.now), art: artifactMsg(c.equip, c.meta), buffs: buffsMsg(c.meta, Date.now()) });
      }
      if (this.now >= p.saveAt) {
        p.saveAt = this.now + SAVE_INTERVAL;
        this.savePlayer(p);
      }
    }
    const el = performance.now() - t0;
    this.tickMs = el;
    this.tickSamples.push(el);
    if (this.tickSamples.length > 1200) this.tickSamples.splice(0, 600);
  }

  tickP95(): number {
    if (!this.tickSamples.length) return 0;
    const a = [...this.tickSamples].sort((x, y) => x - y);
    return a[Math.floor(a.length * 0.95)];
  }

  // ---------- di chuyển ----------

  onInput(p: PlayerEnt, m: unknown): void {
    const i = m as Partial<MoveInput> | null;
    if (!i || typeof i !== 'object') return;
    const { s, mx, mz, yaw, f } = i;
    if (!Number.isInteger(s) || !Number.isFinite(mx) || !Number.isFinite(mz) || !Number.isFinite(yaw) || !Number.isInteger(f)) return;
    if ((s as number) <= p.s.seq && p.inputs.length === 0 && (s as number) !== 0) return;
    p.inputs.push({
      s: (s as number) >>> 0,
      mx: Math.max(-1, Math.min(1, mx as number)),
      mz: Math.max(-1, Math.min(1, mz as number)),
      yaw: yaw as number,
      f: (f as number) & 15,
    });
    p.lastInputAt = this.now;
  }

  private canFly(p: PlayerEnt): boolean {
    return !this.isDead(p) && !p.trib && (this.soul.isScouting(p) || canFlyAt(p.char.level, p.char.mp, p.move.x, p.move.y, p.move.z));
  }

  private applyInput(p: PlayerEnt, inp: MoveInput): void {
    const dead = this.isDead(p);
    const active = inp.mx !== 0 || inp.mz !== 0 || (inp.f & IN_JUMP) !== 0 || ((inp.f & IN_FLY) !== 0 && !p.move.flying);
    if (active && !dead) {
      if (p.meditating) this.setMeditating(p, false);
      if (p.casting && (inp.mx !== 0 || inp.mz !== 0)) this.cancelCast(p);
    }
    const canFly = this.canFly(p);
    const wasFlying = p.move.flying;
    const px = p.move.x;
    const pz = p.move.z;
    const ghost = this.soul.ghostOf(p);
    stepMove(p.move, inp, { canFly, frozen: dead || this.tribSys.soulFrozen(p), speedMul: 1, terrain: this.terrain, bound: caveBoundOf(this.level), sky: skyFlightUnlocked(p.char.level), ghost });
    if (p.move.flying && !wasFlying && !ghost) {
      this.questEvent(p, 'fly', undefined, 1);
    }
    if ((inp.f & IN_FLY) !== 0 && !canFly && !dead && !p.trib && !ghost) {
      if (p.char.level < FLY_UNLOCK_LEVEL) this.warn(p, 'sys.fly_locked', { realm: realmName(FLY_UNLOCK_LEVEL) });
      else if (wasFlying) this.sys(p, 'sys.fly_no_mp', undefined, 'bad');
    }
    const dx = p.move.x - px;
    const dz = p.move.z - pz;
    if (dx * dx + dz * dz > 1e-5 && !p.casting) p.s.yaw = Math.atan2(dx, dz);
    p.s.seq = inp.s;
    p.lastYaw = inp.yaw;
    p.lastFlags = inp.f;
  }

  private tickPlayer(p: PlayerEnt, dt: number): void {
    const c = p.char;
    p.budget = Math.min(p.budget + dt, INPUT_BUDGET_MAX);
    let applied = false;
    while (p.inputs.length > 0 && p.budget >= STEP - 1e-4) {
      this.applyInput(p, p.inputs.shift()!);
      p.budget -= STEP;
      applied = true;
    }
    if (p.inputs.length > 10) p.inputs.splice(0, p.inputs.length - 3);
    const falling = !p.move.grounded && !p.move.flying;
    if (!applied && p.budget >= STEP && (this.now - p.lastInputAt > 200 || (falling && p.budget >= STEP * 2))) {
      // Client im lặng (tab ẩn, mất mạng) hoặc cố gửi thưa lúc đang rơi: server tự chạy bước trung tính
      // để trọng lực luôn tác dụng theo giờ thật.
      this.applyInput(p, { s: p.s.seq, mx: 0, mz: 0, yaw: p.lastYaw, f: p.lastFlags & IN_FLY });
      p.budget -= STEP;
    }

    this.realm.tick(p);
    const dead = this.isDead(p);
    if (!dead) {
      if (p.move.flying && !this.soul.isScouting(p) && !freeFlight(c.level, p.move.x, p.move.y, p.move.z)) {
        c.mp -= FLY_MP_PER_SEC * dt;
        if (c.mp < 0) c.mp = 0;
      }
      const inCombat = this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000;
      const hpRate = p.meditating ? HP_REGEN_MEDITATE : inCombat ? 0 : HP_REGEN_IDLE;
      const mpRate = p.move.flying ? 0 : p.meditating ? MP_REGEN_MEDITATE : inCombat ? MP_REGEN_COMBAT : MP_REGEN_IDLE;
      if (c.hp < c.mhp && hpRate > 0) c.hp = Math.min(c.mhp, c.hp + c.mhp * hpRate * dt);
      if (c.mp < c.mmp && mpRate > 0) c.mp = Math.min(c.mmp, c.mp + c.mmp * mpRate * dt);
      if (p.meditating) {
        p.medAcc += dt;
        if (p.medAcc >= 1) {
          const k = Math.floor(p.medAcc);
          p.medAcc -= k;
          this.questEvent(p, 'meditate', undefined, k);
        }
        p.xpAcc += meditateXpPerSec(c.level) * dt;
        if (p.xpAcc >= 1) {
          const n = Math.floor(p.xpAcc);
          p.xpAcc -= n;
          this.giveXp(p, n, false);
        }
      }
      if (p.casting && this.now >= p.casting.endAt) this.finishCast(p);
      if (p.flow.pending && this.now >= p.flow.pending.at) this.resolvePending(p);
      if (p.shield && this.now >= p.shield.until) {
        p.shield = null;
        this.setFlag(p, PF_SHIELD, false);
      }
      if (p.trib) this.tickTribulation(p);
    }
    this.syncPublic(p);
  }

  // ---------- tu vi ----------

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
      console.log(`[level] ${c.name}: ${before} → ${c.level}`);
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
    const em = empowerDeadlines(p.flow, this.now);
    if (Object.keys(em).length) m.em = em;
    p.client.send(S.CD, m);
  }

  private abortStrike(p: PlayerEnt, refund: boolean, notify = true): void {
    return this.combat.abortStrike(p, refund, notify);
  }

  private addStack(p: PlayerEnt, max: number, decay: number): void {
    return this.combat.addStack(p, max, decay);
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

  private liveStacks(p: PlayerEnt): number {
    return this.combat.liveStacks(p);
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

  private onDash(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    return this.combat.onDash(p, skill, targetId);
  }

  // ---------- pháp bảo phụ và đan tăng sức (P3-8) ----------

  /** Hạ quái: nạp linh khí vào pháp bảo đang đeo. Lên cấp thì tính lại chỉ số (nội tại) và báo. */
  private feedArtifact(p: PlayerEnt, mon: MonEnt): void {
    const def = equippedArtifact(p.char.equip);
    if (!def) return;
    const n = artifactQiGain({ boss: !!mon.def.boss, elite: !!mon.def.elite, monLevel: mon.level, playerLevel: p.char.level });
    if (n <= 0) return;
    const lv = feedQi(p.char.meta, def.id, n);
    p.mth.dirty = true;
    if (lv !== null) {
      p.char.recalc();
      this.sys(p, 'sys.art_level', { item: itemName(def.id), lv }, 'good');
    }
  }

  /** Dùng đan tăng sức: đặt buff theo luật làm mới (không cộng dồn), lưu trong meta. */
  private applyPillBuff(p: PlayerEnt, def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number } } }, potency: number): void {
    const b = def.use?.buff;
    if (!b) return;
    const c = p.char;
    const now = Date.now();
    const m = b.pct * potency;
    c.meta.buffs ??= {};
    c.meta.buffs[b.kind] = mergeBuff(c.meta.buffs[b.kind], m, now + b.sec * 1000 * potency, now);
    c.recalc();
    p.mth.dirty = true;
    if (b.kind === 'ward') this.sys(p, 'sys.ward_buff', { item: itemName(def.id), n: Math.round(m * 100), s: Math.round(b.sec * potency) }, 'good');
    else this.sys(p, 'sys.pill_buff', { item: itemName(def.id), what: t('ui.pill.buff.' + b.kind), n: Math.round(m * 100), m: Math.round((b.sec * potency) / 60) }, 'good');
    this.fx({ t: 'potion', src: p.sid });
  }

  /** Kích hoạt pháp bảo phụ đang đeo. Server quyết định hết: hồi chiêu, linh lực, mục tiêu, hiệu ứng. */
  onArtifact(p: PlayerEnt): void {
    if (!this.artifactGate(p)) return;
    const def = equippedArtifact(p.char.equip);
    if (!def) return this.warn(p, 'sys.art_none');
    this.fireArtifact(p, def, progressOf(p.char.meta, def.id).lv);
  }

  /** Bản mệnh pháp bảo Ngưng Đan Lô (E2-E): có từ Kết Đan, không tháo, cấp theo cấp của chủ (không tốn vật phẩm, không đụng túi/ledger). */
  onBonded(p: PlayerEnt): void {
    if (!this.artifactGate(p)) return;
    const lv = bondedLevel(p.char.level);
    const def = ARTIFACT.get(BONDED_ARTIFACT_ID);
    if (lv < 1 || !def) return this.warn(p, 'sys.bonded_locked');
    this.fireArtifact(p, def, lv);
  }

  /** Giới hạn tần suất và điều kiện chung cho mọi pháp bảo (chết, tỉ thí, độ kiếp/tâm ma). */
  private artifactGate(p: PlayerEnt): boolean {
    if (this.now - p.skillWindowAt >= 1000) {
      p.skillWindowAt = this.now;
      p.skillCount = 0;
    }
    if (++p.skillCount > SKILL_MSG_PER_SEC) return false;
    if (this.isDead(p)) {
      this.warn(p, 'sys.dead');
      return false;
    }
    if (this.duel.inDuel(p)) {
      this.warn(p, 'duel.no_items');
      return false;
    }
    // Đang độ kiếp hoặc tâm ma: không dùng pháp bảo (cùng luật với đan/trang bị).
    if (p.trib || p.trial) {
      this.warn(p, 'sys.busy');
      return false;
    }
    return true;
  }

  private fireArtifact(p: PlayerEnt, def: ArtifactDef, lv: number): void {
    const c = p.char;
    if (this.airborne(p)) return this.warn(p, 'sys.cannot_while_flying');
    if ((p.cds.get(def.skill) ?? 0) > this.now) return this.warn(p, 'sys.cooldown');
    if (c.mp < def.mp) return this.warn(p, 'sys.not_enough_mp');
    const near = this.monstersNear(p.move.x, p.move.z, def.radius);
    const tag: Partial<FxMsg> = { s: def.id, c: def.color, lv };
    switch (def.kind) {
      case 'drain': {
        const targets = near.slice(0, DRAIN_MAX_TARGETS);
        if (!targets.length) return this.warn(p, 'sys.art_no_target');
        let got = 0;
        for (const mon of targets) {
          got += drainMp(def, lv, c.mmp, !!mon.def.elite);
          this.fx({ t: 'artdrain', src: mon.id, dst: p.sid, ...tag });
        }
        c.mp = Math.min(c.mmp, c.mp + got);
        this.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.2, ...tag });
        this.sys(p, 'sys.art_drain', { n: got }, 'good');
        break;
      }
      case 'seal': {
        // Chỉ ảnh hưởng quái đang giao chiến; quái đang rảnh không bị kéo vào trận.
        const engaged = near.filter((m) => m.state === MS_CHASE || m.state === MS_ATTACK);
        if (!engaged.length) return this.warn(p, 'sys.art_no_target');
        const stunSec = sealStun(def, lv);
        for (const mon of engaged) {
          if (this.now < mon.evadeUntil) continue;
          if (mon.def.boss) {
            // Boss không choáng thẳng: cộng mạnh thanh phá thế và ngắt chú nếu đúng cửa sổ.
            this.tryInterrupt(p, mon);
            this.addPosture(mon, sealPosture(def, lv));
          } else {
            mon.cast = null;
            mon.windUntil = 0;
            mon.comboAt = 0;
            mon.stunUntil = Math.max(mon.stunUntil, this.now + stunSec * 1000);
            this.setMonFlags(mon, MF_STUN, mon.stunUntil);
          }
          this.fx({ t: 'artseal', src: p.sid, dst: mon.id, ...tag });
        }
        this.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.2, ...tag });
        this.sys(p, 'sys.art_seal', { n: engaged.length }, 'good');
        break;
      }
      case 'shield': {
        const dur = def.duration ?? 4;
        const who = new Set<PlayerEnt>([p]);
        for (const o of parties.matesInRoom(c.id, this.host)) {
          if (o !== p && this.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= def.radius) who.add(o);
        }
        for (const o of who) {
          const amount = shieldAmount(def, lv, o.char.mhp);
          if (o.shield && o.shield.amount > amount && o.shield.until > this.now) continue;
          o.shield = { amount, until: this.now + dur * 1000 };
          this.setFlag(o, PF_SHIELD, true);
        }
        this.fx({ t: 'art', src: p.sid, r: def.radius, d: dur, ...tag });
        this.sys(p, 'sys.art_shield', { n: who.size }, 'good');
        break;
      }
      case 'heal': {
        // Ngưng Đan Lô: hồi khí huyết cho bản thân và đồng đội trong tầm (đồng đội cần cùng tổ đội, cùng room, còn sống).
        const who = new Set<PlayerEnt>([p]);
        for (const o of parties.matesInRoom(c.id, this.host)) {
          if (o !== p && !this.isDead(o) && this.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= def.radius) who.add(o);
        }
        for (const o of who) {
          const n = furnaceHeal(def, lv, o.char.mhp);
          o.char.hp = Math.min(o.char.mhp, o.char.hp + n);
          this.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
          this.fx({ t: 'artheal', src: o.sid, ...tag });
        }
        this.fx({ t: 'art', src: p.sid, r: def.radius, d: 1.4, ...tag });
        this.sys(p, 'sys.art_heal', { n: who.size }, 'good');
        break;
      }
    }
    c.mp -= def.mp;
    p.cds.set(def.skill, this.now + def.cd * 1000 * artifactLevelMods(lv).cdMul);
    p.lastCombatAt = this.now;
    this.sendCd(p);
  }

  /** Đòn đánh lên đối thủ tỉ thí: sát thương giảm (đấu tập), không xuống dưới 1 máu, không cho kiếm ý/sạc, không thưởng gì. */
  private duelStrike(p: PlayerEnt, o: PlayerEnt, powers: number[], elemMul: number): void {
    for (const power of powers) {
      if (this.duel.foeOf(p) !== o) return;
      const { dmg, crit } = computeDamage(p.char.atk, power * elemMul * DUEL_DAMAGE_MUL, o.char.def, Math.random(), Math.random(), p.char.stats.critRate, p.char.stats.critMul);
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

  addHazard(g: HazardGeom, delay: number, dmg: number, pct: boolean, kind: HazardMsg['kind'], src: string, atk = 0, lock = false, grp = 0, guard?: GuardCfg, cut?: { mul: number; max: number }, mv?: HazardMsg['mv'], hot = false, dur = 0, seal?: Hazard['seal'], reach = false): void {
    return this.monSys.addHazard(g, delay, dmg, pct, kind, src, atk, lock, grp, guard, cut, mv, hot, dur, seal, reach);
  }

  private addPosture(m: MonEnt, n: number): void {
    return this.monSys.addPosture(m, n);
  }

  bossTimers(): BossTimerMsg {
    return this.monSys.bossTimers();
  }

  private checkPhase(m: MonEnt): void {
    return this.monSys.checkPhase(m);
  }

  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null, crit = false, hv = false, heavy = hv, ke: 0 | 1 | -1 = 0, dot = false): void {
    return this.monSys.damageMonster(mon, dmg, p, crit, hv, heavy, ke, dot);
  }

  delayBosses(): void {
    return this.monSys.delayBosses();
  }

  private fireBolts(m: MonEnt, c: MonsterCaster, yaw: number, lift = 0): void {
    return this.monSys.fireBolts(m, c, yaw, lift);
  }

  private hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul = 1, elem?: string): void {
    return this.monSys.hitMonster(p, mon, basePower, mul, elem);
  }

  private homeDist(m: MonEnt): number {
    return this.monSys.homeDist(m);
  }

  private killMonster(mon: MonEnt): void {
    return this.monSys.killMonster(mon);
  }

  nextHazardGrp(): number {
    return this.monSys.nextHazardGrp();
  }

  private releaseChant(m: MonEnt, c: MonsterChant): void {
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

  private rollLoot(p: PlayerEnt, mon: MonEnt, part: 'all' | 'gold' = 'all'): void {
    return this.monSys.rollLoot(p, mon, part);
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

  /**
   * Thưởng hoàn thành phó bản (E2-C): một transaction (vàng, nguyên liệu, trang bị đã roll) với khóa idem `key`
   * (chứa id nhân vật và ngày) và ghi ledger; khóa đã dùng thì giao dịch bị từ chối và không phát gì (kể cả tu vi).
   * Tu vi `xpPct` của chặng hiện tại chỉ cộng sau khi giao dịch lưu thành công. Trả true nếu đã phát.
   */
  grantDungeonReward(p: PlayerEnt, r: DungeonReward, key: string, label: string): boolean {
    if (p.noLoot || this.isDead(p)) return false;
    const gold = r.gold[0] + Math.floor(Math.random() * (r.gold[1] - r.gold[0] + 1));
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
    this.giveXp(p, xp, false);
    this.sys(p, 'sys.dungeon_reward', { name: t('dungeon.' + label + '.name'), xp }, 'good');
    if (gold > 0) this.sys(p, 'sys.gold', { n: gold }, 'loot');
    for (const g of kept) this.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot', { i: g.id });
    for (const g of keptGear) this.sys(p, 'sys.loot_gear', { item: itemName(g.id), quality: t('ui.quality.' + g.q) }, 'loot', { i: g.id, q: g.q });
    if (full) this.warn(p, 'sys.inv_full');
    return true;
  }

  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv = false, ke?: 1 | -1): void {
    if (this.isDead(p) || this.soul.isScouting(p)) return;
    const c = p.char;
    let n = Math.max(1, Math.round(dmg));
    // Định Thần Phù (E3-M): giảm sát thương "gương" (quái `glass`, boss gương, bóng tâm ma trong cung).
    if (src) {
      const ward = buffMag(c.meta.buffs, 'ward', Date.now());
      if (ward > 0) {
        const a = this.monById.get(src);
        if (a && (a.def.glass || a.def.mirror || (a.owner && this.mirror.active()))) n = Math.max(1, Math.round(n * wardMul(ward)));
      }
    }
    if (src && this.bossDmgMul !== 1 && this.monById.get(src)?.def.boss) n = Math.max(1, Math.round(n * this.bossDmgMul));
    if (this.now < p.mth.guardUntil) n = reduceDamage(n, p.mth.guardReduce);
    // Lĩnh vực hộ pháp (E4-K) giảm sát thương; phân thân hộ pháp gánh một phần sát thương quái ở gần nó.
    const dRed = this.domain.reduce(p);
    if (dRed > 0) n = reduceDamage(n, dRed);
    n = Math.max(1, this.clone.absorb(p, n, src));
    // Kim Chung Trấn (E2-G): phản một phần sát thương (sau khi giảm) về quái đánh mình.
    if (this.now < p.mth.reflectUntil && src) {
      const attacker = this.monById.get(src);
      if (attacker && attacker.state !== MS_DEAD && !(attacker.owner && attacker.owner !== p.sid)) this.damageMonster(attacker, Math.max(1, Math.round(n * p.mth.reflectMul)), p);
    }
    if (parties.resonance(p)) n = Math.max(1, Math.round(n * (1 - RESONANCE_DEF)));
    if (p.shield) {
      const absorbed = Math.min(p.shield.amount, n);
      p.shield.amount -= absorbed;
      // Bộ Huyền Giáp Hộ Pháp (4 món): phản một phần sát thương khiên đã đỡ về quái đánh mình.
      const reflect = c.stats.setFx.shieldReflect;
      if (reflect > 0 && absorbed > 0 && src) {
        const attacker = this.monById.get(src);
        if (attacker && attacker.state !== MS_DEAD && !(attacker.owner && attacker.owner !== p.sid)) {
          this.damageMonster(attacker, Math.max(1, Math.round(absorbed * reflect)), p);
        }
      }
      n -= absorbed;
      if (p.shield.amount <= 0) {
        p.shield = null;
        this.setFlag(p, PF_SHIELD, false);
      }
    }
    p.lastCombatAt = this.now;
    if (p.meditating) this.setMeditating(p, false);
    if (n <= 0) {
      this.emit(S.DMG, { dst: p.sid, n: 0, src } satisfies DmgMsg);
      return;
    }
    if (!p.god) c.hp -= n;
    if (src && c.meta.method) {
      this.gainCharge(p, chargeFromTaken(n, c.mhp));
      const pas = passiveOf(c.meta);
      if (pas?.kind === 'the') this.addStack(p, pas.max ?? 5, pas.decay ?? 8);
    }
    const msg: DmgMsg = { dst: p.sid, n, src };
    if (hv) msg.hv = true;
    if (ke) msg.ke = ke;
    this.emit(S.DMG, msg);
    // Tâm cảnh (E3-L): bị Tâm Ma Ảnh của chính mình đánh trúng thì giảm.
    if (p.trib && src && this.monById.get(src)?.owner === p.sid) this.tribSys.noteHit(p, 'hurt');
    if (c.hp <= 0) this.killPlayer(p);
  }

  private killPlayer(p: PlayerEnt): void {
    this.duel.onGone(p, true);
    this.clone.drop(p);
    const c = p.char;
    c.hp = 0;
    p.casting = null;
    this.abortStrike(p, false, false);
    p.flow.reset();
    p.shield = null;
    p.meditating = false;
    p.s.fl = PF_DEAD;
    if (p.trib) {
      this.endTribulation(p, false, false);
    } else if (p.trial) {
      // Chết trong thử thách tâm ma: thua ngay, không mất tu vi (đúng lời hứa của UI), đợi 60 giây thử lại.
      this.realm.failTrial(p, 'dead');
    } else if (!this.soul.onDeath(p)) {
      const lost = c.loseXp(DEATH_XP_LOSS);
      this.sys(p, lost > 0 ? 'sys.died' : 'sys.died_free', { n: lost }, 'bad');
    }
    this.fx({ t: 'death', src: p.sid });
  }

  onRespawn(p: PlayerEnt): void {
    if (!this.isDead(p)) return;
    const c = p.char;
    const soulWake = this.soul.consumeDeath(p);
    const { x, z } = this.opts.respawn;
    p.move = { x, y: this.terrain.groundAt(x, z), z, vy: 0, grounded: true, flying: false };
    p.inputs.length = 0;
    c.hp = Math.round(c.mhp * (soulWake ? SOUL_DEATH_HP : 0.5));
    c.mp = Math.round(c.mmp * 0.5);
    p.s.fl = 0;
    p.lastCombatAt = 0;
    p.hazardWin = { until: 0, taken: 0 };
    this.sys(p, soulWake ? 'sys.respawned_soul' : 'sys.respawned', undefined, 'info');
    this.fx({ t: 'respawn', src: p.sid });
  }

  // ---------- quái ----------

  /**
   * Hộ pháp chắn thay một phần tia khóa mệnh (E1-F): trả phần đã chuyển đi. Hộ pháp không chết vì kiếp của người khác (dừng ở 1 khí huyết).
   * Chỉ người CÙNG TỔ ĐỘI với chủ kiếp mới làm hộ pháp (người lạ đứng gần không bị kéo vào chịu sát thương). Ở room độ kiếp riêng chỉ có người
   * vào bằng vé (cùng tổ đội), nên cùng luật.
   */
  private pickGuards(h: Hazard): PlayerEnt[] {
    const g = h.guard!;
    const owner = this.players.get(h.src);
    if (!owner || !owner.trib) return [];
    const d = (o: PlayerEnt) => Math.hypot(o.move.x - owner.move.x, o.move.z - owner.move.z);
    return [...this.players.values()]
      .filter((o) => o !== owner && !o.trib && !this.isDead(o) && d(o) <= g.r && parties.same(owner.char.id, o.char.id))
      .sort((a, b) => d(a) - d(b))
      .slice(0, g.max);
  }

  /** Giảm sát thương tia khóa mệnh: theo hazard, thiếu thì theo `final` của kiếp người trúng đang độ. */
  private lockCut(h: Hazard, p: PlayerEnt): { mul: number; max: number } {
    if (h.cut) return h.cut;
    const f = tribDef(p.trib?.id).phases.find((ph) => ph.final)?.final;
    return f ? { mul: f.defMul, max: f.defMaxCut } : { mul: 0, max: 0 };
  }

  private shareToGuards(owner: PlayerEnt, n: number, h: Hazard): number {
    const guards = this.pickGuards(h);
    if (guards.length === 0) return 0;
    const part = n * h.guard!.share;
    let moved = 0;
    for (const o of guards) {
      const each = Math.min(part / guards.length, o.char.hp - 1);
      if (each <= 0) continue;
      this.damagePlayer(o, each, h.src, true);
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
  onBreakthrough(p: PlayerEnt, force = false): void {
    const c = p.char;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.busy');
    if (this.isDead(p) || p.trib || this.level.dungeon) return this.warn(p, 'sys.trib_not_now');
    const def = tribForLevel(c.level);
    if (!def) return this.warn(p, c.level >= MAX_LEVEL ? 'sys.max_level' : 'sys.trib_need_xp');
    if (c.xp < xpNeed(c.level)) return this.warn(p, 'sys.trib_need_xp');
    // Bình cảnh đại viên mãn phải vượt (tâm ma hoặc Phá Cảnh Đan) trước khi độ kiếp.
    if (bottleneckBlocked(c.level, c.bk)) return this.warn(p, 'sys.bk_blocked');
    if (!def.enabled && !force) return this.warn(p, 'sys.trib_locked');
    const item = def.item;
    if (item && !force && !c.inv.some((it) => it?.id === item && !it.lk)) return this.warn(p, 'sys.trib_need_pill', { item: itemName(item) });
    if (def.room === 'tribulation') {
      // Room riêng: room thế giới chỉ kiểm điều kiện rồi cấp vé; vật phẩm bị tiêu khi vào tới nơi (beginTribulation).
      if (!this.host.enterTribulationRoom?.(p, def, force)) this.warn(p, 'sys.trib_not_now');
      return;
    }
    // GM (force) vẫn tiêu vật phẩm nếu đang có, để sổ cái giống đường người chơi thật.
    this.beginTribulation(p, def, !!item && c.inv.some((it) => it?.id === item && !it.lk));
  }

  /** Bắt đầu kiếp `def` cho `p` ngay trong room này. `consume`: tiêu vật phẩm đột phá. false nếu thiếu vật phẩm. */
  beginTribulation(p: PlayerEnt, def: TribDef, consume: boolean): boolean {
    const c = p.char;
    this.clone.drop(p);
    const item = def.item;
    if (consume && item && !c.tx('tribulation', null, (d) => d.remove(item, 1))) {
      this.warn(p, 'sys.trib_need_pill', { item: itemName(item) });
      return false;
    }
    if (p.meditating) this.setMeditating(p, false);
    p.trib = { id: def.id, endAt: this.now + def.duration * 1000, nextAt: this.now + def.firstDelay * 1000, n: 0, fin: false, pills: 0 };
    this.setFlag(p, PF_TRIBULATION, true);
    this.sysAll('sys.trib_start', { name: c.name }, 'info');
    this.fx({ t: 'tribstart', src: p.sid, d: def.duration, sd: visualSeed(), tb: def.id });
    return true;
  }

  // ---------- bình cảnh, linh căn (P3-7; phần luật ở game/realm.ts) ----------

  onBottleneck(p: PlayerEnt, msg: unknown): void {
    this.realm.onBottleneck(p, msg);
  }

  onChangeRoot(p: PlayerEnt, msg: unknown): void {
    this.realm.onChangeRoot(p, msg);
  }

  /** Bóng tâm ma của `p`: quái riêng, đứng trước mặt người chơi, đuổi đúng người đó. */
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o: { dyaw?: number; level?: number } = {}): MonEnt | null {
    const def = MONSTER.get('mon_tam_ma');
    if (!def) return null;
    const yaw = p.s.yaw + (o.dyaw ?? 0);
    const x = p.move.x + Math.sin(yaw) * 7;
    const z = p.move.z + Math.cos(yaw) * 7;
    const m = this.spawnMonster(def, o.level ?? p.char.level, x, z, null);
    m.owner = p.sid;
    m.atk = st.atk;
    m.defn = st.def;
    m.s.mhp = st.hp;
    m.s.hp = st.hp;
    m.target = p.sid;
    this.setMonState(m, MS_CHASE);
    return m;
  }

  /** Xuất khiếu trong Tam Trọng Kiếp (E3-L; E3-K nối phím X thật vào đây). */
  onTribSoul(p: PlayerEnt): void {
    if (p.trib) this.tribSys.soul(p);
  }

  /** Phân thân thần niệm trong Thiên Nhân Kiếp (E4-D): thế thân của kiếp, không phải phân thân của E4-K. */
  onTribClone(p: PlayerEnt): void {
    if (p.trib) this.tribSys.clone(p);
  }

  /** Phím G (E4-K): trong kiếp là thế thân của kiếp, ngoài kiếp là phân thân thần niệm. */
  onClone(p: PlayerEnt, msg: unknown): void {
    if (p.trib) this.tribSys.clone(p);
    else this.clone.command(p, msg);
  }

  /** Phân thân đánh quái bằng chỉ số của chủ: không cộng kiếm ý/vòng sạc, không đánh người (tỉ thí). */
  private cloneHit(p: PlayerEnt, mon: MonEnt, power: number, skill: SkillDef | undefined): void {
    if (mon.state === MS_DEAD || (mon.owner && mon.owner !== p.sid) || this.now < mon.evadeUntil) return;
    const elem = skill?.elem;
    const ke = elemCounter(elem, mon.def.elem);
    const mk = mon.mark;
    const pw = mk && mk.sid === p.sid && this.now < mk.until ? power * (1 + mk.mul) : power;
    const em = elemDamageMul(p.char.stats.elemDmg, elem);
    const crit0 = Math.min(STAT_CAPS.critRate, p.char.stats.critRate + this.domain.critAdd(p));
    const { dmg, crit } = computeDamage(p.char.atk, pw * em * counterMul(ke), mon.defn, Math.random(), Math.random(), crit0, p.char.stats.critMul);
    this.damageMonster(mon, vulnerableDamage(dmg, this.now < mon.stunUntil), p, crit, false, false, ke);
  }

  /** Hồi `n` khí huyết (kẹp theo tối đa, tính hồi phục nhận vào) và báo số. */
  private healPlayer(p: PlayerEnt, n: number): void {
    const amt = Math.max(1, Math.round(n * (1 + p.char.stats.healRecv)));
    p.char.hp = Math.min(p.char.mhp, p.char.hp + amt);
    this.emit(S.DMG, { dst: p.sid, n: amt, heal: true } satisfies DmgMsg);
  }

  private tickTribulation(p: PlayerEnt): void {
    this.tribSys.tick(p);
  }

  private endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void {
    const c = p.char;
    const def = tribDef(p.trib?.id);
    const elapsed = p.trib ? def.duration - (p.trib.endAt - this.now) / 1000 : 0;
    p.trib = null;
    this.setFlag(p, PF_TRIBULATION, false);
    if (success) {
      c.level = def.to;
      c.xp = 0;
      c.recalc();
      c.hp = c.mhp;
      c.mp = c.mmp;
      this.sysAll('sys.trib_ok', { name: c.name, realm: nextMajorRealmName(def.from) }, 'good');
      this.fx({ t: 'ascend', src: p.sid, tb: def.id });
      if (def.id === 'truc_co') this.sys(p, 'sys.tc_fly_hint', { n: TRUC_CO_FREE_FLY_ALT }, 'info');
      this.questEvent(p, 'breakthrough', def.id, 1);
      this.questEvent(p, 'level', undefined, c.level);
      this.savePlayer(p);
      console.log(`[trib] ${c.name} đạt ${realmName(c.level)} (kiếp ${def.id})`);
    } else {
      const lost = c.loseXp(def.failXpLoss);
      if (!silent) this.sys(p, lost > 0 ? 'sys.trib_fail' : 'sys.trib_fail_free', { n: lost }, 'bad');
      // Trụ qua nửa đầu: hoàn vật phẩm đột phá (chỉ khi chết trong lôi kiếp, không hoàn khi thoát game giữa chừng).
      const item = def.item;
      if (!silent && item && elapsed >= def.refundAfter && c.tx('tribulation:refund', null, (d) => d.add(item, 1))) this.sys(p, 'sys.trib_refund', { item: itemName(item) }, 'info');
    }
    this.host.onTribulationEnd?.(p, def, success);
  }

  // ---------- đả tọa, hái thuốc ----------

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

  onGather(p: PlayerEnt, msg: unknown): void {
    const id = (msg as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return;
    const n = this.nodes.get(id);
    if (!n || !n.s.on || this.isDead(p)) return;
    const dx = p.move.x - n.s.x;
    const dz = p.move.z - n.s.z;
    if (dx * dx + dz * dz > GATHER_RANGE * GATHER_RANGE || Math.abs(p.move.y - n.s.y) > 5) return this.warn(p, 'sys.gather_far');
    const qty = 1 + (Math.random() < 0.3 ? 1 : 0);
    if (!p.char.tx('gather', null, (d) => d.add(n.s.t, qty))) return this.warn(p, 'sys.inv_full');
    n.s.on = false;
    n.respawnAt = this.now + n.respawn * 1000;
    this.sys(p, 'sys.loot', { item: itemName(n.s.t), n: qty }, 'loot', { i: n.s.t, src: id });
    this.questEvent(p, 'gather', n.s.t, qty);
    this.fx({ t: 'gather', src: p.sid, x: n.s.x, y: n.s.y, z: n.s.z });
  }

  // ---------- vật phẩm ----------

  /**
   * Tin S.INV: gửi phần thay đổi (`d`) so với lần gửi trước khi ít ô đổi, còn lại gửi ảnh đầy đủ (lần đầu, hoặc đổi > INV_DELTA_MAX ô như sắp xếp).
   * `invSent` là ảnh client đang có (các tin S.INV trước; chưa có thì tin đầu tiên là ảnh đầy đủ).
   */
  private invMsg(p: PlayerEnt): InvMsg {
    const c = p.char;
    const prev = p.invSent;
    p.invSent = c.inv.slice();
    if (!prev) return { inv: c.inv, equip: c.equip };
    const d: [number, InvSlot][] = [];
    for (let i = 0; i < INV_SIZE; i++) if (!sameSlot(prev[i] ?? null, c.inv[i] ?? null)) d.push([i, c.inv[i] ?? null]);
    return d.length > INV_DELTA_MAX ? { inv: c.inv, equip: c.equip } : { d, equip: c.equip };
  }

  private idem(p: PlayerEnt, r: unknown): string | null | undefined {
    if (typeof r !== 'string' || r.length < 4 || r.length > 40) return undefined;
    return `${p.char.id}:${r}`;
  }

  onUse(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    if (!m || !Number.isInteger(m.slot)) return;
    const slot = m.slot as number;
    if (slot < 0 || slot >= INV_SIZE || this.isDead(p)) return;
    const idem = this.idem(p, m.r);
    if (idem === undefined) return;
    const c = p.char;
    const it = c.inv[slot];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def) return;
    if (isWearSlot(def.kind)) return this.onEquip(p, { slot, r: m.r });
    if (!def.use) return;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.no_items');
    if (this.now < p.itemCdAt) return this.warn(p, 'sys.item_cd');
    // Phá Ấn Phù (E4-C): chỉ dùng được khi đứng trước một cửa đóng; cửa chỉ mở SAU KHI tx trừ bùa thành công (idem lặp thì không mở).
    const sealIdx = def.use.seal ? (this.sealHook?.peek(p) ?? -1) : -1;
    if (def.use.seal && sealIdx < 0) return this.warn(p, 'sys.seal_need');
    // Độ kiếp: tối đa `pillMax` của kiếp đan hồi phục (đan độc tích tụ), để không thành cuộc thi uống thuốc.
    const healing = !!def.use.hpPct;
    if (p.trib && healing && p.trib.pills >= tribDef(p.trib.id).pillMax) return this.warn(p, 'sys.trib_pill_limit', { n: tribDef(p.trib.id).pillMax });
    let taken = null as InvItem | null;
    if (!c.tx('use:' + def.id, idem, (d) => !!(taken = d.removeAt(slot, 1)))) return;
    p.itemCdAt = this.now + def.use.cd * 1000;
    if (sealIdx >= 0) this.sealHook?.open(sealIdx);
    if (p.trib && healing) p.trib.pills++;
    // Thanh Mộc Đan Kinh: hồi phục +20%, và đan dược dùng được lên đạo hữu gần (`to` = sid).
    const healMul = passiveOf(c.meta)?.healMul;
    let who = p;
    const to = (msg as { to?: unknown }).to;
    if (healMul !== undefined && typeof to === 'string' && to !== p.sid) {
      const o = this.players.get(to);
      if (o && this.canAssist(p, o) && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) <= POTION_ALLY_RANGE) who = o;
    }
    const wc = who.char;
    // Phẩm đan (P3-8): Hạ/Trung/Thượng nhân hiệu lực hồi phục, tu vi và mức buff.
    const potency = pillPotency(PILL_QUALITY, taken?.plus);
    if (def.use.hpPct) {
      const n = Math.round(healAmount(Math.round(wc.mhp * def.use.hpPct * potency), healMul) * (1 + wc.stats.healRecv));
      wc.hp = Math.min(wc.mhp, wc.hp + n);
      this.emit(S.DMG, { dst: who.sid, n, heal: true } satisfies DmgMsg);
    }
    if (def.use.mpPct) wc.mp = Math.min(wc.mmp, wc.mp + wc.mmp * def.use.mpPct * potency * (1 + (healMul ?? 0)));
    // Tu vi chỉ cho chính người dùng (không chuyển tu vi qua đan dược).
    if (def.use.xp) this.giveXp(p, Math.round(def.use.xp * potency));
    if (def.use.buff) this.applyPillBuff(p, def, potency);
    if (who !== p) this.fx({ t: 'potion', src: who.sid });
    this.fx({ t: 'potion', src: p.sid });
  }

  onEquip(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    const slot = m?.slot;
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= INV_SIZE || this.isDead(p)) return;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.no_items');
    // Đang tâm ma: không đổi trang bị (bóng dựng theo chỉ số lúc bắt đầu).
    if (p.trial) return this.warn(p, 'sys.busy');
    const idem = this.idem(p, m?.r);
    if (idem === undefined || this.now < (p.equipCdAt ?? 0)) return;
    p.equipCdAt = this.now + 200;
    const c = p.char;
    const it = c.inv[slot as number];
    const def = it ? ITEM.get(it.id) : undefined;
    // Ô có chỉ số hoặc ô ngoại hình (skin): cùng một đường giao dịch. Sở hữu = món đang nằm trong túi của chính người chơi.
    if (!it || !def || !isWearSlot(def.kind)) return;
    if ((def.reqLevel ?? 1) > c.level) return this.warn(p, 'sys.equip_level');
    // Món giới hạn giới tính (skin dựng cho một dáng): sai giới thì từ chối, món vẫn nằm trong túi.
    if (!wearableBy(def, c.appearance.g)) return this.warn(p, 'sys.equip_gender');
    const es: WearSlot = def.kind;
    // Đổi đồ không sinh/mất vật phẩm nên ledger ghi một dòng 'noop' có khóa idem và lý do (món vào/ra) để truy vết.
    const prev0 = c.equip[es];
    const ok = c.tx(`equip:${es}:${it.id}${prev0 ? '<-' + prev0.id : ''}`, idem, (d) => {
      const prev = d.equip[es];
      const cur = d.inv[slot as number];
      // Bản nháp là bản sao của túi hiện tại; kiểm lại để món ở ô đó không đổi giữa lúc đọc và lúc ghi.
      if (!cur || cur.id !== it.id) return false;
      const next: InvItem = { ...cur };
      delete next.lk; // khóa chỉ có ở túi
      // Địa/Thiên phẩm ràng buộc khi mặc (không giao dịch được nữa).
      if (next.inst && next.inst.q >= BIND_QUALITY && !next.inst.bound) next.inst = { ...next.inst, bound: true };
      d.equip[es] = next;
      d.inv[slot as number] = prev ? { ...prev } : null;
      return true;
    });
    if (ok) {
      c.recalc();
      if (p.mth) p.mth.dirty = true;
    }
  }

  onUnequip(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; r?: unknown } | null;
    const es = m?.slot;
    if (!isWearSlot(es) || this.isDead(p)) return;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.no_items');
    if (p.trial) return this.warn(p, 'sys.busy');
    const idem = this.idem(p, m?.r);
    if (idem === undefined || this.now < (p.equipCdAt ?? 0)) return;
    p.equipCdAt = this.now + 200;
    const c = p.char;
    const worn = c.equip[es];
    if (!worn) return;
    const ok = c.tx(`unequip:${es}:${worn.id}`, idem, (d) => {
      const i = d.inv.findIndex((s) => !s);
      if (i < 0 || !d.equip[es]) return false;
      d.inv[i] = { ...d.equip[es]! };
      delete d.equip[es];
      return true;
    });
    if (!ok) {
      if (c.txFail === 'abort') this.warn(p, 'sys.inv_full');
      return;
    }
    c.recalc();
    if (p.mth) p.mth.dirty = true;
  }

  onMoveItem(p: PlayerEnt, msg: unknown): void {
    const m = msg as { a?: unknown; b?: unknown } | null;
    if (!m || !Number.isInteger(m.a) || !Number.isInteger(m.b)) return;
    const a = m.a as number;
    const b = m.b as number;
    if (a === b || a < 0 || b < 0 || a >= INV_SIZE || b >= INV_SIZE) return;
    p.char.tx('move', null, (d) => {
      const sa = d.inv[a];
      const sb = d.inv[b];
      if (!sa) return false;
      const def = ITEM.get(sa.id);
      if (sb && def && sb.id === sa.id && (sb.plus ?? 0) === (sa.plus ?? 0) && def.stack > 1 && !sa.lk && !sb.lk) {
        const put = Math.min(sa.n, def.stack - sb.n);
        if (put <= 0) {
          d.inv[a] = sb;
          d.inv[b] = sa;
        } else {
          sb.n += put;
          sa.n -= put;
          if (sa.n <= 0) d.inv[a] = null;
        }
      } else {
        d.inv[a] = sb;
        d.inv[b] = sa;
      }
      return true;
    });
  }

  onBuy(p: PlayerEnt, msg: unknown): void {
    const m = msg as { npc?: unknown; item?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || typeof m.item !== 'string' || !Number.isInteger(m.n)) return;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || n < 1 || n > 99 || this.isDead(p)) return;
    const npc = NPC.get(m.npc);
    const def = ITEM.get(m.item);
    if (!npc || !def || !npc.sells?.includes(def.id) || def.price <= 0) return;
    if (!this.nearNpc(p, npc.id)) return this.warn(p, 'sys.too_far');
    const cost = def.price * n;
    if (p.char.gold < cost) return this.warn(p, 'sys.not_enough_gold');
    const ok = p.char.tx('buy:' + def.id, idem, (d) => d.spendGold(cost) && d.add(def.id, n));
    if (!ok) {
      if (p.char.txFail === 'abort') this.warn(p, 'sys.inv_full');
      return;
    }
    this.sys(p, 'sys.bought', { item: itemName(def.id), n }, 'loot');
  }

  onSell(p: PlayerEnt, msg: unknown): void {
    const m = msg as { npc?: unknown; slot?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || !Number.isInteger(m.slot) || !Number.isInteger(m.n)) return;
    const slot = m.slot as number;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || slot < 0 || slot >= INV_SIZE || n < 1 || this.isDead(p)) return;
    const npc = NPC.get(m.npc);
    if (!npc || !npc.sells) return;
    if (!this.nearNpc(p, npc.id)) return this.warn(p, 'sys.too_far');
    const it = p.char.inv[slot];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def || it.n < n || def.sell <= 0) return;
    if (it.lk) return this.warn(p, 'sys.item_locked');
    if (it.inst?.bound) return this.warn(p, 'sys.item_bound');
    const gold = sellPrice(it, def) * n;
    const ok = p.char.tx('sell:' + def.id, idem, (d) => {
      if (d.inv[slot]?.lk || !d.removeAt(slot, n)) return false;
      d.addGold(gold);
      return true;
    });
    if (ok) this.sys(p, 'sys.sold', { item: itemName(def.id, it.plus), n, gold }, 'loot');
  }

  onCraft(p: PlayerEnt, msg: unknown): void {
    const m = msg as { id?: unknown; n?: unknown; r?: unknown } | null;
    if (!m || typeof m.id !== 'string' || !Number.isInteger(m.n)) return;
    const n = m.n as number;
    const idem = this.idem(p, m.r);
    if (idem === undefined || n < 1 || n > 20 || this.isDead(p)) return;
    const rcp = RECIPE.get(m.id);
    if (!rcp) return;
    if (!this.nearNpc(p, rcp.npc)) return this.warn(p, 'sys.too_far');
    const c = p.char;
    if (rcp.reqLevel && c.level < rcp.reqLevel) return this.warn(p, 'sys.craft_level');
    // Pháp bảo: mỗi người chỉ cần một món mỗi loại.
    const outDef = ITEM.get(rcp.output.id);
    if (outDef && isEquipSlot(outDef.kind) && (n !== 1 || c.inv.some((s) => s?.id === rcp.output.id) || c.equipCount(rcp.output.id) > 0)) return this.warn(p, 'sys.art_owned');
    if (c.gold < rcp.gold * n) return this.warn(p, 'sys.not_enough_gold');
    // Phẩm chất đan (P3-8): mỗi viên roll riêng ở server; công pháp đan sư (Thanh Mộc) ra phẩm cao dễ hơn.
    const support = passiveOf(c.meta)?.kind === 'dan_kinh';
    const tiers = new Array<number>(PILL_TIERS).fill(0);
    let missing = false;
    let full = false;
    const ok = c.tx('craft:' + rcp.id, idem, (d) => {
      for (const i of rcp.inputs) {
        if (!d.remove(i.id, i.n * n)) {
          missing = true;
          return false;
        }
      }
      if (!d.spendGold(rcp.gold * n)) return false;
      if (rcp.quality) {
        const rolls: number[] = [];
        for (let i = 0; i < rcp.output.n * n; i++) {
          const q = rollPillQuality(PILL_QUALITY, support, randomInt(1_000_000) / 1_000_000);
          tiers[q]++;
          rolls.push(q);
        }
        for (let q = 0; q < PILL_TIERS; q++) {
          if (tiers[q] > 0 && !d.add(rcp.output.id, tiers[q], q)) {
            full = true;
            return false;
          }
        }
        d.rollSeeds.push(`pill:${rolls.join('')}`);
      } else if (!d.add(rcp.output.id, rcp.output.n * n)) {
        full = true;
        return false;
      }
      return true;
    });
    if (!ok) {
      if (missing) this.warn(p, 'sys.not_enough_mat');
      else if (full) this.warn(p, 'sys.inv_full');
      return;
    }
    if (rcp.quality) {
      for (let q = PILL_TIERS - 1; q >= 0; q--) if (tiers[q] > 0) this.sys(p, 'sys.crafted_q', { item: itemName(rcp.output.id), q: t('ui.pill.q' + q), n: tiers[q] }, q > 0 ? 'good' : 'loot');
    } else this.sys(p, 'sys.crafted', { item: itemName(rcp.output.id), n: rcp.output.n * n }, 'loot');
    this.questEvent(p, 'craft', rcp.output.id, rcp.output.n * n);
    this.fx({ t: 'craft', src: p.sid });
  }

  onEnhance(p: PlayerEnt, msg: unknown): void {
    this.upgrade.onEnhance(p, msg);
  }

  onUpgrade(p: PlayerEnt, msg: unknown): void {
    this.upgrade.onUpgrade(p, msg);
  }

  // ---------- công pháp (Phase 3-5) ----------

  /** Chọn lần đầu (Ngưng Khí tầng 5 trở lên, ở đâu cũng được) hoặc đổi (phải ở chỗ Lạc Vân chân nhân, tốn linh thạch). */
  onMethod(p: PlayerEnt, msg: unknown): void {
    const m = msg as { method?: unknown; r?: unknown } | null;
    if (!m || typeof m.method !== 'string' || this.isDead(p) || p.casting) return;
    const def = METHOD.get(m.method);
    if (!def) return;
    const c = p.char;
    if (c.level < METHOD_UNLOCK_LEVEL) return this.warn(p, 'sys.method_low', { realm: realmName(METHOD_UNLOCK_LEVEL) });
    if (c.meta.method === def.id) return this.warn(p, 'sys.method_same');
    if (this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000) return this.warn(p, 'sys.method_combat');
    if (c.meta.method) {
      // Đổi công pháp: gặp người, tốn linh thạch, có chờ.
      if (!this.nearNpc(p, METHOD_NPC)) return this.warn(p, 'sys.method_far', { npc: t(`npc.${METHOD_NPC}.name`) });
      if (this.now - (c.meta.methodAt ?? 0) < METHOD_SWITCH_COOLDOWN_SEC * 1000) return this.warn(p, 'sys.method_cd');
      const idem = this.idem(p, m.r);
      if (idem === undefined) return;
      const cost = methodSwitchCost(c.level);
      if (c.gold < cost) return this.warn(p, 'sys.not_enough_gold');
      if (!c.tx('method:switch', idem, (d) => d.spendGold(cost))) return this.warn(p, 'sys.not_enough_gold');
    }
    c.meta.method = def.id;
    c.meta.methodAt = this.now;
    p.mth.reset();
    // Cooldown của chiêu công pháp cũ không mang sang.
    for (const id of [...p.cds.keys()]) if (SKILL.get(id)?.method) p.cds.delete(id);
    c.recalc();
    c.save();
    this.sys(p, 'sys.method_chosen', { method: t(`method.${def.id}.name`) }, 'good');
    this.fx({ t: 'levelup', src: p.sid });
    this.sendCd(p);
  }

  /** Chiêu mà người chơi này được phép nâng/chọn biến thức: đã mở khóa, và là chiêu chung hoặc của công pháp đang tu. */
  private ownedSkill(p: PlayerEnt, id: unknown): SkillDef | null {
    if (typeof id !== 'string') return null;
    const sk = SKILL.get(id);
    if (!sk) return null;
    if (sk.method && p.char.meta.method !== sk.method) return null;
    if (p.char.level < sk.unlock) return null;
    return sk;
  }

  /** Nâng cấp chiêu: tốn Bí Tịch Tàn Quyển và linh thạch trong một giao dịch có khóa chống trùng và ghi ledger. */
  onSkillUp(p: PlayerEnt, msg: unknown): void {
    const m = msg as { skill?: unknown; r?: unknown } | null;
    if (!m || this.isDead(p)) return;
    const idem = this.idem(p, m.r);
    if (idem === undefined) return;
    const sk = this.ownedSkill(p, m.skill);
    if (!sk) return this.warn(p, 'sys.skill_locked_up');
    const c = p.char;
    const lv = skillLevelOf(c.meta, sk.id);
    if (lv >= MAX_SKILL_LEVEL) return this.warn(p, 'sys.skill_max');
    const cost = skillUpgradeCost(lv + 1);
    if (!cost) return this.warn(p, 'sys.skill_max');
    if (c.gold < cost.gold) return this.warn(p, 'sys.skill_need');
    // Cấp chỉ tăng nếu giao dịch ghi DB thành công (trùng khóa hoặc thiếu nguyên liệu thì không đổi gì).
    if (!c.tx(`skillup:${sk.id}:${lv + 1}`, idem, (d) => d.remove(SKILL_SCROLL, cost.scrolls) && d.spendGold(cost.gold))) return this.warn(p, 'sys.skill_need');
    setSkillLevel(c.meta, sk.id, lv + 1);
    c.save();
    p.mth.dirty = true;
    this.sys(p, 'sys.skill_up_ok', { skill: skillName(sk.id), n: lv + 1 }, 'good');
    this.fx({ t: 'enhance', src: p.sid });
  }

  /** Chọn biến thức A/B (từ cấp 3), đổi miễn phí khi không giao chiến. */
  onSkillVar(p: PlayerEnt, msg: unknown): void {
    const m = msg as { skill?: unknown; v?: unknown } | null;
    if (!m || this.isDead(p) || p.casting || (m.v !== 'a' && m.v !== 'b')) return;
    const sk = this.ownedSkill(p, m.skill);
    const vars = sk ? VARIANTS[sk.id] : undefined;
    if (!sk || !vars) return this.warn(p, 'sys.skill_locked_up');
    const c = p.char;
    if (c.meta.skillVar?.[sk.id] === m.v) return;
    const block = variantSwitchBlock({
      skillLevel: skillLevelOf(c.meta, sk.id),
      inCombat: this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
      casting: !!p.casting,
      sinceLastSwitchMs: this.now - p.variantAt,
    });
    if (block) return this.warn(p, `sys.variant_${block === 'cooldown' || block === 'casting' ? 'wait' : block}`);
    p.variantAt = this.now;
    c.meta.skillVar ??= {};
    c.meta.skillVar[sk.id] = m.v;
    c.save();
    p.mth.dirty = true;
    this.sys(p, 'sys.variant_set', { skill: skillName(sk.id), name: t(`skill.${sk.id}.var.${m.v}.name`) }, 'info');
  }


  // ---------- NPC, nhiệm vụ ----------

  onTalk(p: PlayerEnt, msg: unknown): void {
    const npc = (msg as { npc?: unknown } | null)?.npc;
    if (typeof npc !== 'string' || !NPC.has(npc) || this.isDead(p)) return;
    if (!this.nearNpc(p, npc)) return;
    this.questEvent(p, 'talk', npc, 1);
  }

  onQuest(p: PlayerEnt, msg: unknown): void {
    const m = msg as { a?: unknown; id?: unknown } | null;
    if (!m || typeof m.id !== 'string' || this.isDead(p)) return;
    const q = QUEST.get(m.id);
    if (!q) return;
    const c = p.char;
    if (m.a === 'accept') {
      if (c.quests.active[q.id] || c.quests.done.includes(q.id)) return;
      if (q.requires && !c.quests.done.includes(q.requires)) return;
      if ((q.minLevel ?? 1) > c.level) return this.warn(p, 'sys.level_low');
      if (!this.nearNpc(p, q.giver)) return this.warn(p, 'sys.too_far');
      c.quests.active[q.id] = q.objectives.map((o) => {
        if (o.type === 'level') return Math.min(o.count, c.level);
        // Đã độ kiếp trước khi nhận nhiệm vụ thì tính là xong, không thì kẹt vĩnh viễn. `target` = id kiếp (`ket_dan`...);
        // không có thì là Trúc Cơ (q_truc_co). So với cấp ĐÍCH của đúng kiếp đó, không phải một mốc chung.
        if (o.type === 'breakthrough' && c.level >= tribDef(o.target ?? 'truc_co').to) return o.count;
        return 0;
      });
      c.questDirty = true;
      let teleNew = false;
      for (const id of q.unlockTele ?? []) if (c.unlockTele(id)) teleNew = true;
      if (teleNew) {
        for (const id of q.unlockTele ?? []) this.sys(p, 'sys.tele_unlock', { n: t(`tele.${id}`) }, 'good');
        this.tele.sendState(p);
      }
      this.sys(p, 'sys.quest_accept', { name: t(`quest.${q.id}.name`) }, 'info');
      // Mục tiêu "nói chuyện" với chính NPC đang đứng cạnh thì tính luôn.
      for (const o of q.objectives) if (o.type === 'talk' && o.target && this.nearNpc(p, o.target)) this.questEvent(p, 'talk', o.target, 1);
      return;
    }
    if (m.a === 'turnin') {
      if (!c.quests.active[q.id]) return;
      if (!this.nearNpc(p, q.turnin)) return this.warn(p, 'sys.too_far');
      // Đứng cạnh NPC trả nhiệm vụ cũng là đã "nói chuyện".
      this.questEvent(p, 'talk', q.turnin, 1);
      if (!c.questComplete(q.id)) return;
      const ok = c.tx('quest:' + q.id, `quest:${c.id}:${q.id}`, (d) => {
        if (q.rewards.gold > 0) d.addGold(q.rewards.gold);
        for (const it of q.rewards.items ?? []) if (!d.add(it.id, it.n)) return false;
        return true;
      });
      if (!ok && c.txFail !== 'dup') return this.warn(p, 'sys.inv_full');
      // txFail === 'dup': phần thưởng đã phát ở lần trước (server tắt giữa chừng) — chỉ đánh dấu hoàn thành.
      const rewarded = ok;
      delete c.quests.active[q.id];
      c.quests.done.push(q.id);
      c.questDirty = true;
      this.sys(p, 'sys.quest_done', { name: t(`quest.${q.id}.name`) }, 'good');
      if (rewarded) {
        if (q.rewards.gold > 0) this.sys(p, 'sys.gold', { n: q.rewards.gold }, 'loot');
        for (const it of q.rewards.items ?? []) this.sys(p, 'sys.loot', { item: itemName(it.id), n: it.n }, 'loot');
        if (q.rewards.xp > 0) this.giveXp(p, q.rewards.xp);
      }
      this.fx({ t: 'quest', src: p.sid });
      this.savePlayer(p);
    }
  }

  // ---------- chat & lệnh GM ----------

  onChat(p: PlayerEnt, msg: unknown): void {
    let text = (msg as { m?: unknown } | null)?.m;
    if (typeof text !== 'string') return;
    text = text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return;
    if (this.now - p.chatAt < 800) return this.warn(p, 'sys.chat_rate');
    p.chatAt = this.now;
    if (p.dev && (text as string).startsWith('/gm ')) return this.gmSys.run(p, (text as string).slice(4).trim().split(/\s+/));
    this.host.broadcast(S.CHAT, { from: p.char.name, c: 'say', m: text });
    // Kính Nguyệt Chân Quân lặp lại câu cuối của người đối diện (E3-M).
    const echo = this.mirror.echoLine(text as string);
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
    if (f.at && f.at.level !== this.level.id && !LEVELS[f.at.level]?.dungeon && this.host.transferLevel?.(p, f.at.level, { x: f.at.x, z: f.at.z }, { force: true })) this.sys(p, 'sys.gm', { m: `at ${f.at.id} → ${f.at.level}` }, 'info');
    else if (f.at && this.teleportTo(p, f.at.x, f.at.z, f.at.level)) this.sys(p, 'sys.gm', { m: `at ${f.at.id}` }, 'info');
    else if (!f.at && f.pos && this.teleportTo(p, f.pos.x, f.pos.z)) this.sys(p, 'sys.gm', { m: `at ${Math.round(f.pos.x)},${Math.round(f.pos.z)}` }, 'info');
    if (f.trib) this.sys(p, 'sys.gm', { m: this.gmSys.tribulation(p) }, 'info');
  }

}

export const DEFAULT_SPAWN = SPAWN_POINT;

