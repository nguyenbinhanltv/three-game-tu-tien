import { randomInt } from 'node:crypto';
import type { Client } from 'colyseus';
import {
  ARTIFACT_MAX_LEVEL,
  artifactLevelMods,
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
  addCharge,
  BOLT_MAX_LIFE,
  BOLT_MAX_LIVE,
  boltBlockedAt,
  boltLift,
  type BoltEndMsg,
  boltHits,
  type BoltMsg,
  boltXZ,
  boltYaws,
  CHARGE_MAX,
  chargeFromDealt,
  chargeFromTaken,
  bottleneckReady,
  bossPhaseAt,
  fxSeed,
  parseAppearance,
  type CdMsg,
  chantInterrupt,
  CHAT_MAX_LEN,
  DUEL_DAMAGE_MUL,
  nextTurn,
  PARTY_SHARE_RANGE,
  RESONANCE_DEF,
  RESONANCE_DMG,
  RESONANCE_XP,
  splitXp,
  xpShareWeight,
  COMBAT_REGEN_DELAY,
  computeDamage,
  DEATH_XP_LOSS,
  type DmgMsg,
  EQUIP_SLOTS,
  glowStage,
  lookSet,
  accessoryCode,
  MAX_ENHANCE,
  healAmount,
  methodSwitchCost,
  METHOD_SWITCH_COOLDOWN_SEC,
  METHOD_UNLOCK_LEVEL,
  MAX_SKILL_LEVEL,
  reduceDamage,
  skillUpgradeCost,
  stackMul,
  stacksAlive,
  variantSwitchBlock,
  VARIANT_MIN_LEVEL,
  BIND_QUALITY,
  rollEquipDrops,
  sellPrice,
  type EquipSlot,
  type InvItem,
  type Quality,
  QUALITY_COUNT,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  AIRBORNE_HEIGHT,
  elemDamageMul,
  elemCounter,
  STAT_CAPS,
  counterMul,
  GCD,
  initialBottleneck,
  MAX_LEVEL,
  parseRealmCode,
  hazardHit,
  HP_REGEN_IDLE,
  HP_REGEN_MEDITATE,
  type HazardGeom,
  groundAt,
  type HazardMsg,
  heightAt,
  IN_FLY,
  inHazard,
  isHeavyHit,
  IN_JUMP,
  type InitMsg,
  INV_SIZE,
  type LevelDef,
  levelSpawns,
  meditateXpPerSec,
  MF_BROKEN,
  MF_CHANT,
  MF_STUN,
  type MonsterCaster,
  type MonsterChant,
  type MonsterDef,
  type MonsterSweep,
  monsterStats,
  monsterXp,
  type MoveInput,
  type MoveState,
  type PhaseRules,
  phaseRules,
  postureDecay,
  postureGain,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  MP_REGEN_COMBAT,
  MP_REGEN_IDLE,
  MP_REGEN_MEDITATE,
  NGUNG_KHI_MAX,
  PF_CASTING,
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
  type SpawnDef,
  STEP,
  stepMove,
  type SysMsg,
  TRIBULATION_DURATION,
  TRIBULATION_REFUND_AFTER,
  TRIB_AIM,
  TRIB_EXTRA,
  TRIB_FIRST_DELAY,
  TRIB_GAP_END,
  TRIB_GAP_START,
  TRIBULATION_FAIL_XP_LOSS,
  TRUC_CO_LEVEL,
  vulnerableDamage,
  WATER_Y,
  xpLevelFactor,
  xpNeed,
  comboNext,
  dashDir,
  DASH_MIN_GAP_MS,
  hitOffsets,
  planDash,
  strikeDelay,
  AOI_BOSS_OUT,
  AOI_OUT,
  zoneAt,
  type BossTimerMsg,
} from '@dtl/shared';
import { ARTIFACT, PILL_QUALITY, APPEARANCE, ENHANCE_ORE, ITEM, ITEM_SYS, ITEMS, itemName, LEVELS, MONSTER, monsterName, NPC, QUEST, realmName, RECIPE, SET, SETS, SKILL, t, TRUC_CO_PILL, METHOD, VARIANTS, skillName } from '@dtl/content';
import { lootOf } from '@dtl/content/loot';
import { PLACE, PLACES } from '@dtl/content/places';
import { MonS, NodeS, PlayerS, type WorldState } from '../state';
import { type Character, isEquipSlot } from './character';
import type { TestFlags } from '../testflags';
import { type Hot, MethodRt, methodOf, passiveOf, resolveFor, setSkillLevel, skillLevelOf, type Trail } from './method';

/** Bí Tịch Tàn Quyển: nguyên liệu nâng cấp chiêu. */
const SKILL_SCROLL = 'itm_bi_tich_tan_quyen';
/** Chiêu khiêu khích với boss chỉ giữ chừng này thời gian (tỉ lệ). */
const TAUNT_BOSS_MUL = 0.5;
/** Bộ trang bị (P3-4): bán kính hồi cho đồng đội, hệ số tốc độ của quái bị làm chậm (thường / boss). */
const SET_HEAL_RADIUS = 14;
const SET_SLOW_MUL = 0.5;
const SET_SLOW_BOSS = 0.8;
const METHOD_NPC = 'npc_chuong_mon';
/** Đan dược dùng lên đồng đội (Thanh Mộc Đan Kinh) trong tầm này (mét). */
const POTION_ALLY_RANGE = 12;
/** Gửi trạng thái công pháp tối đa chừng này ms một lần. */
const METHOD_SEND_MS = 250;
import { RealmSystem } from './realm';
import { CampSystem, type CampRt } from './camps';
import { empowerDeadlines, isEmpowered, SkillFlow } from './skillflow';
import { DuelSystem } from './duel';
import { TeleportSystem } from './teleport';
import { parties } from './party';
import { UpgradeSystem } from './upgrade';
import { artifactMsg, buffsMsg, equippedArtifact, feedQi, passiveValue, progressOf, pruneBuffs } from './artifact';

/**
 * Seed hình cho FX (tia sét, mưa kiếm, mây kiếp). Lấy từ `crypto`, KHÔNG từ `Math.random`: seed gửi
 * cho cả kênh, nếu dùng chung RNG với luật (chí mạng, rơi đồ, cường hóa) thì lộ thêm đầu ra để đoán
 * trạng thái RNG.
 */
const visualSeed = () => fxSeed(() => randomInt(0x7fffffff) / 0x7fffffff);

const INTERACT_RANGE = 9;
const GATHER_RANGE = 5;
const LEASH = 48;
const INPUT_BUDGET_MAX = 0.3;
const FLY_MP_PER_SEC = 1.5;
const SAVE_INTERVAL = 30_000;
/** Một quái giữ ô cận chiến của một người chơi tối đa chừng này rồi nhường nếu có quái khác chờ. */
const SLOT_HOLD_MS = 5000;
/** Sau khi nhường ô, quái nghỉ chừng này mới được giành lại. */
const SLOT_REST_MS = 1500;
/** Quái chỉ giành ô khi đã ở gần mục tiêu trong khoảng này (mét, ngoài tầm đánh). */
const SLOT_CLAIM_DIST = 4;

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
  trib: { endAt: number; nextAt: number; n: number } | null;
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
  chant: { startAt: number; endAt: number } | null;
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

interface Hazard extends HazardGeom {
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
  /** Nguồn: id quái, hoặc sid người độ kiếp. Thiên kiếp trúng cả người ngoài đứng trong vòng, nhưng không giết họ (xem `tickHazards`). */
  src: string;
}

/** Đạn đánh xa của quái đang bay (D1). Vị trí tính lại từ gốc + thời gian, không tích lũy sai số. */
interface Bolt {
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

const _bp = { x: 0, z: 0 };
const boltCount = (c: MonsterCaster) => Math.max(1, Math.min(5, c.n ?? 1));

export interface SimHost {
  broadcast(type: string, msg: unknown): void;
  /** Gửi cho cả phòng trừ các phiên trong `except` (AOI: người ở xa không nhận). Không có thì lùi về `broadcast`. */
  broadcastExcept?(type: string, msg: unknown, except: ReadonlySet<string>): void;
  /** Bí cảnh: gọi khi một quái không hồi sinh bị hạ. */
  onMonsterKilled?(m: MonEnt): void;
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
interface StrikeCtx {
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
  /** Việc hẹn giờ của chiêu nhiều mốc `hitAt`. */
  private delayed: { at: number; fn: () => void }[] = [];
  private hots: Hot[] = [];
  private trails: Trail[] = [];
  bolts: Bolt[] = [];
  private nextBoltId = 1;
  /** sid người chơi → id quái đang giữ ô cận chiến của người đó. */
  private meleeSlot = new Map<string, string>();
  /** sid người chơi → lần cuối có quái cận chiến phải chờ ở vòng ngoài. */
  private slotWait = new Map<string, number>();
  level: LevelDef;
  private nextId = 1;
  tickMs = 0;
  tickSamples: number[] = [];
  /** Bình cảnh, tâm ma, linh căn (P3-7). */
  readonly realm = new RealmSystem({
    now: () => this.now,
    inWorld: () => this.opts.levelId === 'van_lam',
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
    inWorld: () => this.opts.levelId === 'van_lam' && this.opts.roomName === 'world',
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
    inWorld: () => this.opts.levelId === 'van_lam' && this.opts.roomName === 'world',
    players: () => this.players.values(),
    inCombat: (p) => this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000,
    inDuel: (p) => this.duel.inDuel(p),
    sys: (p, k, params, type) => this.sys(p, k, params, type),
    warn: (p, k, params) => this.warn(p, k, params),
    teleportTo: (p, x, z) => this.teleportTo(p, x, z),
    stopMeditate: (p) => this.setMeditating(p, false),
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
        s.y = groundAt(pos.x, pos.z);
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
      if (allowWater || heightAt(x, z) > WATER_Y + 0.5) return { x, z };
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
    if (!n || this.opts.levelId !== 'van_lam') return false;
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
    const g = groundAt(x, z);
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
    const p = this.players.get(sid);
    if (!p) return;
    if (p.trib) this.endTribulation(p, false, true);
    this.realm.onLeave(p);
    this.duel.onGone(p);
    this.savePlayer(p);
    this.meleeSlot.delete(sid);
    this.slotWait.delete(sid);
    this.players.delete(sid);
    this.state.players.delete(sid);
  }

  savePlayer(p: PlayerEnt): void {
    const c = p.char;
    if (this.opts.persistPosition) {
      c.x = p.move.x;
      c.y = p.move.y;
      c.z = p.move.z;
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
    this.tickBolts();
    this.tickMethods();
    this.camps.tick();
    this.duel.tick();
    this.tele.tick();
    for (const n of this.nodes.values()) {
      if (!n.s.on && this.now >= n.respawnAt) n.s.on = true;
    }
    for (const p of this.players.values()) {
      const c = p.char;
      if (c.charDirty) {
        c.charDirty = false;
        p.client.send(S.CHAR, c.view());
      }
      if (c.invDirty) {
        c.invDirty = false;
        p.client.send(S.INV, { inv: c.inv, equip: c.equip });
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
    return !this.isDead(p) && !p.trib && p.char.level >= FLY_UNLOCK_LEVEL && p.char.mp >= 1;
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
    stepMove(p.move, inp, { canFly, frozen: dead, speedMul: 1 });
    if (p.move.flying && !wasFlying) {
      this.questEvent(p, 'fly', undefined, 1);
    }
    if ((inp.f & IN_FLY) !== 0 && !canFly && !dead && !p.trib) {
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
      if (p.move.flying) {
        c.mp -= FLY_MP_PER_SEC * dt;
        if (c.mp < 0) c.mp = 0;
      }
      const inCombat = this.now - p.lastCombatAt < COMBAT_REGEN_DELAY * 1000;
      const hpRate = p.meditating ? HP_REGEN_MEDITATE : inCombat ? 0 : HP_REGEN_IDLE;
      const mpRate = p.move.flying ? 0 : p.meditating ? MP_REGEN_MEDITATE : inCombat ? MP_REGEN_COMBAT : MP_REGEN_IDLE;
      if (c.hp < c.mhp && hpRate > 0) c.hp = Math.min(c.mhp, c.hp + c.mhp * hpRate * dt);
      if (c.mp < c.mmp && mpRate > 0) c.mp = Math.min(c.mmp, c.mp + c.mmp * mpRate * dt);
      if (p.meditating) {
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
      this.questEvent(p, 'level', undefined, c.level);
      console.log(`[level] ${c.name}: ${before} → ${c.level}`);
    }
  }

  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void {
    const ready = p.char.questEvent(type, target, n);
    for (const id of ready) this.sys(p, 'sys.quest_ready', { name: t(`quest.${id}.name`) }, 'good');
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

  onSkill(p: PlayerEnt, msg: unknown): void {
    // Giới hạn riêng cho lệnh skill: GCD đã chặn ra chiêu, cái này chặn dội lệnh để dò cửa sổ ngắt chú.
    if (this.now - p.skillWindowAt >= 1000) {
      p.skillWindowAt = this.now;
      p.skillCount = 0;
    }
    if (++p.skillCount > SKILL_MSG_PER_SEC) return;
    const m = msg as { id?: unknown; t?: unknown } | null;
    if (!m || typeof m.id !== 'string') return;
    const skill = SKILL.get(m.id);
    if (!skill) return;
    const c = p.char;
    if (this.isDead(p)) return this.warn(p, 'sys.dead');
    if (c.level < skill.unlock) return this.warn(p, 'sys.level_low');
    if (skill.method && c.meta.method !== skill.method) return this.warn(p, 'sys.no_method');
    if (this.airborne(p)) return this.warn(p, 'sys.cannot_while_flying');
    if (skill.dash) return this.onDash(p, skill, typeof m.t === 'string' ? m.t : '');
    if (p.casting || p.flow.pending) return;
    if (this.now < p.gcdAt - 60) return;
    if ((p.cds.get(skill.id) ?? 0) > this.now) return this.warn(p, 'sys.cooldown');
    if (c.mp < skill.mp) return this.warn(p, 'sys.not_enough_mp');
    if (skill.ult && p.mth.charge < CHARGE_MAX) return this.warn(p, 'sys.ult_not_ready');
    if (skill.kind === 'revive' && !this.reviveTarget(p, skill.allyRadius ?? 14)) return this.warn(p, 'sys.no_ally_dead');
    const rs = resolveFor(c.meta, skill);
    let targetId = '';
    if (skill.kind === 'damage' || skill.kind === 'aoe') {
      if (typeof m.t !== 'string') return this.warn(p, 'sys.no_target');
      const mon = this.monById.get(m.t);
      if (!mon && this.players.has(m.t)) {
        // Người chơi chỉ là mục tiêu hợp lệ của đúng đối thủ tỉ thí, và chỉ sau khi hết đếm ngược.
        const foe = this.duel.anyFoe(p);
        if (!foe || foe.sid !== m.t) return this.warn(p, 'sys.no_target');
        if (!this.duel.foeOf(p)) return this.warn(p, 'duel.not_started');
        if (!this.inRangeP(p, foe, skill.range)) return this.warn(p, 'sys.out_of_range');
        targetId = foe.sid;
        p.s.yaw = Math.atan2(foe.move.x - p.move.x, foe.move.z - p.move.z);
      } else {
      if (!mon || mon.state === MS_DEAD) return this.warn(p, 'sys.no_target');
      if (!this.inRange(p, mon, this.skillRange(p, skill))) return this.warn(p, 'sys.out_of_range');
      targetId = mon.id;
      p.s.yaw = Math.atan2(mon.s.x - p.move.x, mon.s.z - p.move.z);
      }
    }
    if (p.meditating) this.setMeditating(p, false);
    p.gcdAt = this.now + GCD * 1000;
    if (rs.cast > 0) {
      p.casting = { skill, target: targetId, endAt: this.now + rs.cast * 1000 };
      this.setFlag(p, PF_CASTING, true);
      this.fx({ t: 'cast', src: p.sid, dst: targetId, d: rs.cast, s: skill.id, ...this.fxTag(p, rs) });
      this.sendCd(p);
      return;
    }
    this.beginSkill(p, skill, targetId);
  }

  /**
   * Chiêu không niệm (K-2): chuỗi đánh thường, cường hóa, rồi áp ngay hoặc chờ `hitAt` (hình và sát thương cùng nhịp).
   * Linh lực, hồi chiêu, vòng sạc trừ lúc bấm; đòn bị hủy vì mục tiêu thì hoàn lại.
   */
  private beginSkill(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    const f = p.flow;
    let combo = -1;
    let mul = 1;
    if (skill.combo) {
      combo = comboNext(skill.combo, f.comboIdx, f.comboAt, this.now);
      f.comboIdx = combo;
      f.comboAt = this.now;
      mul *= skill.combo.hits[combo].power / Math.max(0.01, skill.power);
      // Kiếm tu: đòn cuối chuỗi hoàn lại một phần GCD (đánh nhanh hơn).
      const refund = passiveOf(p.char.meta)?.gcdRefund;
      if (refund && combo === skill.combo.hits.length - 1) p.gcdAt -= refund * 1000;
    }
    if (isEmpowered(f, skill, this.now)) {
      mul *= skill.empower!.powerMul;
      f.opened.delete(skill.empower!.by);
    }
    const delay = strikeDelay(skill, combo >= 0 ? combo : undefined) * 1000;
    if (delay <= 0) return this.resolveWith(p, skill, targetId, { combo: combo >= 0 ? combo : undefined, mul });
    const prevCd = p.cds.get(skill.id);
    const prevCharge = p.mth.charge;
    this.commitSkill(p, skill);
    f.pending = { skill, target: targetId, at: this.now + delay, combo, mul, prevCd, prevCharge };
    this.sendCd(p);
  }

  private resolveWith(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx): void {
    this.executeSkill(p, skill, targetId, ctx);
  }

  /** Hủy đòn đang chờ. `refund`: hoàn linh lực, hồi chiêu, vòng sạc (chỉ khi mục tiêu mất, không phải do người chơi tự hủy). */
  private abortStrike(p: PlayerEnt, refund: boolean, notify = true): void {
    const st = p.flow.pending;
    if (!st) return;
    p.flow.pending = null;
    if (st.skill.ult) {
      p.mth.lockCharge = false;
      if (refund) p.mth.charge = st.prevCharge;
      p.mth.dirty = true;
    }
    if (refund) {
      p.char.mp = Math.min(p.char.mmp, p.char.mp + st.skill.mp);
      if (st.prevCd === undefined) p.cds.delete(st.skill.id);
      else p.cds.set(st.skill.id, st.prevCd);
    }
    if (notify) {
      this.fx({ t: 'castend', src: p.sid });
      this.sendCd(p);
    }
  }

  /** Tới `hitAt`: kiểm lại điều kiện rồi áp. Mục tiêu chết/ra tầm: hủy và hoàn; người ra chiêu chết/bay lên: hủy, không hoàn. */
  private resolvePending(p: PlayerEnt): void {
    const st = p.flow.pending;
    if (!st) return;
    if (this.isDead(p) || this.airborne(p)) return this.abortStrike(p, false);
    const sk = st.skill;
    if (st.target && (sk.kind === 'damage' || sk.kind === 'aoe')) {
      const mon = this.monById.get(st.target);
      let ok: boolean;
      if (mon) ok = mon.state !== MS_DEAD && this.inRange(p, mon, this.skillRange(p, sk) * 1.3);
      else {
        const foe = this.duel.foeOf(p);
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
  private onDash(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    const def = skill.dash;
    if (!def) return;
    const c = p.char;
    if (p.trib || p.trial) return this.warn(p, 'sys.busy');
    if (this.now - p.flow.lastDashAt < DASH_MIN_GAP_MS) return;
    if ((p.cds.get(skill.id) ?? 0) > this.now) return this.warn(p, 'sys.cooldown');
    if (c.mp < skill.mp) return this.warn(p, 'sys.not_enough_mp');
    const mon = targetId ? this.monById.get(targetId) : undefined;
    const tgt = mon && mon.state !== MS_DEAD && this.inRange(p, mon, skill.range) ? mon : undefined;
    // Đặt mốc ngay khi lệnh hợp lệ tới đây (kể cả khi bị chặn): lệnh bị chặn không thể dội để ép tính đường liên tục.
    p.flow.lastDashAt = this.now;
    const dir = dashDir(def, p.s.yaw, tgt ? { dx: tgt.s.x - p.move.x, dz: tgt.s.z - p.move.z } : null);
    if (!dir) return;
    const stop = tgt && def.dir === 'target' ? { x: tgt.s.x, z: tgt.s.z, r: (def.stop ?? 1.6) + tgt.def.scale } : undefined;
    // Đã sát mục tiêu: không cần lướt; chiêu có sát thương (Thiết Bích Xung) vẫn húc, chiêu thuần di chuyển thì bỏ.
    const close = !!stop && Math.hypot(stop.x - p.move.x, stop.z - p.move.z) <= stop.r + 1;
    const plan = close ? { x: p.move.x, z: p.move.z, dist: 0, blocked: true } : planDash(p.move, dir, def.dist, stop);
    if (plan.dist < 1 && !(close && skill.power > 0)) return this.warn(p, close ? 'sys.dash_close' : 'sys.dash_blocked');
    const rs = resolveFor(c.meta, skill);
    if (p.meditating) this.setMeditating(p, false);
    if (p.casting) this.cancelCast(p);
    this.abortStrike(p, false);
    c.mp -= skill.mp;
    if (rs.cd > 0) p.cds.set(skill.id, this.now + rs.cd * 1000);
    p.flow.lastDashAt = this.now;
    p.lastCombatAt = this.now;
    p.move.x = plan.x;
    p.move.z = plan.z;
    p.move.y = groundAt(plan.x, plan.z);
    p.move.vy = 0;
    p.move.grounded = true;
    p.inputs.length = 0;
    p.s.yaw = Math.atan2(dir.x, dir.z);
    this.fx({ t: skill.fx, src: p.sid, x: plan.x, y: p.move.y, z: plan.z, d: 0.3, ...this.fxTag(p, rs) });
    // Lướt có sát thương (Thiết Bích Xung): húc mục tiêu nếu đã sát người.
    if (skill.power > 0 && tgt && this.inRange(p, tgt, 3)) {
      let mul = 1;
      if (isEmpowered(p.flow, skill, this.now)) {
        mul = skill.empower!.powerMul;
        p.flow.opened.delete(skill.empower!.by);
      }
      this.hitMonster(p, tgt, rs.power * mul, elemDamageMul(c.stats.elemDmg, skill.elem), skill.elem);
      // Húc choáng quái thường (hộ pháp): tinh anh nửa thời gian, boss miễn.
      if (skill.stun && tgt.state !== MS_DEAD && !tgt.def.boss && !(tgt.owner && tgt.owner !== p.sid) && this.now >= tgt.evadeUntil) {
        tgt.stunUntil = Math.max(tgt.stunUntil, this.now + skill.stun * (tgt.def.elite ? 500 : 1000));
        tgt.cast = null;
        tgt.windUntil = 0;
        tgt.comboAt = 0;
        this.setMonFlags(tgt, MF_STUN, tgt.stunUntil);
      }
    }
    p.flow.opened.set(skill.id, this.now);
    this.sendCd(p);
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
  private applyPillBuff(p: PlayerEnt, def: { id: string; use?: { buff?: { kind: 'atk' | 'def' | 'crit'; pct: number; sec: number } } }, potency: number): void {
    const b = def.use?.buff;
    if (!b) return;
    const c = p.char;
    const now = Date.now();
    const m = b.pct * potency;
    c.meta.buffs ??= {};
    c.meta.buffs[b.kind] = mergeBuff(c.meta.buffs[b.kind], m, now + b.sec * 1000 * potency, now);
    c.recalc();
    p.mth.dirty = true;
    this.sys(p, 'sys.pill_buff', { item: itemName(def.id), what: t('ui.pill.buff.' + b.kind), n: Math.round(m * 100), m: Math.round((b.sec * potency) / 60) }, 'good');
    this.fx({ t: 'potion', src: p.sid });
  }

  /** Kích hoạt pháp bảo phụ đang đeo. Server quyết định hết: hồi chiêu, linh lực, mục tiêu, hiệu ứng. */
  onArtifact(p: PlayerEnt): void {
    if (this.now - p.skillWindowAt >= 1000) {
      p.skillWindowAt = this.now;
      p.skillCount = 0;
    }
    if (++p.skillCount > SKILL_MSG_PER_SEC) return;
    const c = p.char;
    if (this.isDead(p)) return this.warn(p, 'sys.dead');
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.no_items');
    // Đang độ kiếp hoặc tâm ma: không dùng pháp bảo (cùng luật với đan/trang bị).
    if (p.trib || p.trial) return this.warn(p, 'sys.busy');
    const def = equippedArtifact(c.equip);
    if (!def) return this.warn(p, 'sys.art_none');
    if (this.airborne(p)) return this.warn(p, 'sys.cannot_while_flying');
    if ((p.cds.get(def.skill) ?? 0) > this.now) return this.warn(p, 'sys.cooldown');
    if (c.mp < def.mp) return this.warn(p, 'sys.not_enough_mp');
    const lv = progressOf(c.meta, def.id).lv;
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
    }
    c.mp -= def.mp;
    p.cds.set(def.skill, this.now + def.cd * 1000 * artifactLevelMods(lv).cdMul);
    p.lastCombatAt = this.now;
    this.sendCd(p);
  }

  /** Đang ngự kiếm hoặc lơ lửng cao hơn mặt đất (vừa tắt ngự kiếm, đang rơi): không được ra chiêu. */
  private airborne(p: PlayerEnt): boolean {
    return p.move.flying || p.move.y - groundAt(p.move.x, p.move.z) > AIRBORNE_HEIGHT;
  }

  /** Tầm chiêu của người chơi: đan sư xa hơn (nội tại `rangeBonus`), chỉ chiêu đánh. */
  private skillRange(p: PlayerEnt, skill: SkillDef): number {
    const b = passiveOf(p.char.meta)?.rangeBonus ?? 0;
    return skill.range > 0 && (skill.kind === 'damage' || skill.kind === 'aoe') ? skill.range + b : skill.range;
  }

  private inRange(p: PlayerEnt, mon: MonEnt, range: number): boolean {
    const dx = mon.s.x - p.move.x;
    const dz = mon.s.z - p.move.z;
    const dy = mon.s.y - p.move.y;
    const r = range + 1.5 + mon.def.scale;
    return dx * dx + dz * dz + dy * dy * 0.25 <= r * r;
  }

  private inRangeP(p: PlayerEnt, o: PlayerEnt, range: number): boolean {
    const dx = o.move.x - p.move.x;
    const dz = o.move.z - p.move.z;
    const dy = o.move.y - p.move.y;
    const r = range + 2;
    return dx * dx + dz * dz + dy * dy * 0.25 <= r * r;
  }

  private cancelCast(p: PlayerEnt): void {
    if (!p.casting) return;
    p.casting = null;
    this.setFlag(p, PF_CASTING, false);
    this.fx({ t: 'castend', src: p.sid });
    this.sys(p, 'sys.cast_cancel', undefined, 'bad');
  }

  private finishCast(p: PlayerEnt): void {
    const cast = p.casting;
    if (!cast) return;
    p.casting = null;
    this.setFlag(p, PF_CASTING, false);
    const mon = this.monById.get(cast.target);
    if (!mon && cast.target) {
      // Đang niệm lên đối thủ tỉ thí: trận phải còn và đối thủ còn trong tầm.
      const foe = this.duel.foeOf(p);
      if (this.airborne(p) || !foe || foe.sid !== cast.target || !this.inRangeP(p, foe, cast.skill.range * 1.3)) {
        this.fx({ t: 'castend', src: p.sid });
        return;
      }
      if (p.char.mp < cast.skill.mp) return;
      return this.executeSkill(p, cast.skill, cast.target);
    }
    if (this.airborne(p) || (cast.target && (!mon || mon.state === MS_DEAD || !this.inRange(p, mon, cast.skill.range * 1.3)))) {
      this.fx({ t: 'castend', src: p.sid });
      return;
    }
    if (p.char.mp < cast.skill.mp) return;
    this.executeSkill(p, cast.skill, cast.target);
  }

  /** Thông tin hình cho FX chiêu: biến thức, cấp chiêu, màu công pháp. Chỉ là lớp hình. */
  private fxTag(p: PlayerEnt, rs: ReturnType<typeof resolveFor>): Partial<FxMsg> {
    const o: Partial<FxMsg> = {};
    if (rs.variant) o.v = rs.variant.fx;
    if (rs.level > 1) o.lv = rs.level;
    const m = methodOf(p.char.meta);
    if (m) o.c = m.color;
    return o;
  }

  private liveStacks(p: PlayerEnt): number {
    const pas = passiveOf(p.char.meta);
    if (!pas || (pas.kind !== 'kiem_y' && pas.kind !== 'the')) return 0;
    return stacksAlive(p.mth.stacks, p.mth.stackAt, this.now, pas.decay ?? 10);
  }

  private addStack(p: PlayerEnt, max: number, decay: number): void {
    const cur = stacksAlive(p.mth.stacks, p.mth.stackAt, this.now, decay);
    p.mth.stacks = Math.min(max, cur + 1);
    p.mth.stackAt = this.now;
    p.mth.dirty = true;
  }

  private gainCharge(p: PlayerEnt, n: number): void {
    if (!p.char.meta.method || !(n > 0) || p.mth.charge >= CHARGE_MAX) return;
    p.mth.charge = addCharge(p.mth.charge, n);
    p.mth.dirty = true;
  }

  /** Đạo hữu ngã gần nhất trong `r` mét (không phải mình). */
  private reviveTarget(p: PlayerEnt, r: number): PlayerEnt | null {
    let best: PlayerEnt | null = null;
    let bd = r * r;
    for (const o of this.players.values()) {
      if (o === p || !this.isDead(o)) continue;
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
  private canAssist(p: PlayerEnt, o: PlayerEnt): boolean {
    return o === p || (!this.isDead(o) && !o.trib && !o.trial && !this.duel.inDuel(o));
  }

  /** Đạo hữu còn sống gần nhất trong `r` mét (không phải mình). */
  private nearestAlly(p: PlayerEnt, r: number): PlayerEnt | null {
    let best: PlayerEnt | null = null;
    let bd = r * r;
    for (const o of this.players.values()) {
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
  private pierceTarget(p: PlayerEnt, mon: MonEnt): MonEnt | null {
    const dx = mon.s.x - p.move.x;
    const dz = mon.s.z - p.move.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    let best: MonEnt | null = null;
    let bd = 8 * 8;
    for (const o of this.monsters) {
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
  private monstersNear(x: number, z: number, r: number, except?: MonEnt): MonEnt[] {
    const out: { m: MonEnt; d: number }[] = [];
    for (const o of this.monsters) {
      if (o === except || o.state === MS_DEAD || o.owner) continue;
      const d = (o.s.x - x) ** 2 + (o.s.z - z) ** 2;
      if (d <= r * r) out.push({ m: o, d });
    }
    return out.sort((a, b) => a.d - b.d).map((e) => e.m);
  }

  /** Quái bị khiêu khích: vào trận ngay nếu đang rảnh. */
  private aggroMonster(mon: MonEnt, p: PlayerEnt, assist = false): void {
    if (mon.state === MS_IDLE || (mon.state === MS_RETURN && this.homeDist(mon) < LEASH * 0.7)) {
      this.resetAi(mon);
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

  private addHot(sid: string, perSec: number, sec: number): void {
    // Mỗi người chỉ một dòng hồi theo thời gian từ cùng nguồn: dòng mới thay dòng cũ nếu mạnh hơn.
    const old = this.hots.find((h) => h.sid === sid);
    if (old && old.per > perSec && old.endAt > this.now + sec * 1000) return;
    if (old) this.hots.splice(this.hots.indexOf(old), 1);
    this.hots.push({ sid, nextAt: this.now + 1000, endAt: this.now + sec * 1000, per: perSec });
  }

  /**
   * Bộ Đan Tâm Y Bát (4 món): Hồi Nguyên Thuật hồi thêm cho đồng đội gần (`SET_HEAL_RADIUS` m), bằng tỉ lệ của lượng hồi bản thân.
   * `hotSec`: biến thức hồi dần thì đồng đội cũng nhận theo thời gian.
   */
  private setHealShare(p: PlayerEnt, amount: number, hotSec = 0): void {
    const share = p.char.stats.setFx.healShare;
    if (!(share > 0) || amount <= 0) return;
    for (const o of this.players.values()) {
      if (o === p || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > SET_HEAL_RADIUS) continue;
      if (hotSec > 0) {
        this.addHot(o.sid, (amount * share) / hotSec, hotSec);
        continue;
      }
      const n = Math.round(amount * share);
      o.char.hp = Math.min(o.char.mhp, o.char.hp + n);
      this.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
    }
  }

  private executeSkill(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx = {}): void {
    this.commitSkill(p, skill);
    this.resolveSkill(p, skill, targetId, ctx);
  }

  /** Trừ linh lực, đặt hồi chiêu, tiêu vòng sạc (chiêu tối thượng): tại lúc bấm (hoặc lúc niệm xong). */
  private commitSkill(p: PlayerEnt, skill: SkillDef): void {
    const rs = resolveFor(p.char.meta, skill);
    p.char.mp -= skill.mp;
    if (rs.cd > 0) p.cds.set(skill.id, this.now + rs.cd * 1000);
    if (skill.ult) {
      p.mth.charge = 0;
      p.mth.lockCharge = true;
      p.mth.dirty = true;
    }
    p.lastCombatAt = this.now;
  }

  /** Áp hiệu quả của chiêu (sát thương, hồi, khiên...): tại `hitAt` hoặc ngay khi không có độ trễ. */
  private resolveSkill(p: PlayerEnt, skill: SkillDef, targetId: string, ctx: StrikeCtx = {}): void {
    const c = p.char;
    const rs = resolveFor(c.meta, skill);
    const v = rs.variant;
    const pas = passiveOf(c.meta);
    const healMul = pas?.healMul;
    const tag = this.fxTag(p, rs);
    if (ctx.combo !== undefined) tag.n = ctx.combo;
    // Chiêu tối thượng nhiều mốc: giữ khóa vòng sạc tới đòn trễ cuối (không tự nạp lại vòng sạc của chính nó).
    let holdLock = 0;
    const elemMul = elemDamageMul(c.stats.elemDmg, skill.elem);
    // Chiêu gây sát thương tiêu thụ tầng: Lôi Đình tiêu kiếm ý; chiêu có hồi chiêu tiêu thế (đòn đánh thường thì không).
    let mul = 1;
    if (skill.kind === 'damage' || skill.kind === 'aoe') {
      const eat = (pas?.kind === 'kiem_y' && skill.id === 'skl_loi_dinh_nhat_kiem') || (pas?.kind === 'the' && skill.cd > 0);
      if (eat && pas) {
        mul = stackMul(this.liveStacks(p), pas.perStack ?? 0, pas.max ?? 5);
        p.mth.stacks = 0;
        p.mth.dirty = true;
      }
    }
    mul *= ctx.mul ?? 1;
    if ((skill.kind === 'damage' || skill.kind === 'aoe') && targetId && !this.monById.has(targetId)) {
      const foe = this.players.get(targetId);
      if (foe && this.duel.foeOf(p) === foe) {
        this.fx({ t: skill.fx, src: p.sid, dst: foe.sid, x: foe.move.x, y: foe.move.y, z: foe.move.z, r: rs.radius ?? 0, ...tag });
        this.duelStrike(p, foe, rs.hits.map((h) => h * mul), elemMul);
      }
      if (skill.ult) {
        p.mth.lockCharge = false;
        p.mth.charge = 0;
      }
      this.sendCd(p);
      return;
    }
    switch (skill.kind) {
      case 'damage': {
        const mon = this.monById.get(targetId);
        if (!mon) break;
        const extra: Partial<FxMsg> = { ...tag };
        const behind = v?.pierce ? this.pierceTarget(p, mon) : null;
        if (behind) {
          extra.x = behind.s.x;
          extra.z = behind.s.z;
        }
        this.fx(skill.fx === 'thunder' ? { t: skill.fx, src: p.sid, dst: mon.id, sd: visualSeed(), ...extra } : { t: skill.fx, src: p.sid, dst: mon.id, ...extra });
        if (skill.mark) {
          const mm = skill.mark.mul + (v?.markBonus ?? 0);
          mon.mark = { sid: p.sid, until: this.now + skill.mark.dur * 1000, mul: mm };
          if (v?.markSpread) {
            for (const o of this.monstersNear(mon.s.x, mon.s.z, 8, mon).slice(0, v.markSpread)) o.mark = { sid: p.sid, until: this.now + skill.mark.dur * 1000, mul: mm };
          }
        }
        // Đánh trước rồi mới phá chú: phần cộng sát thương khi choáng chỉ áp cho các đòn sau.
        const offs = hitOffsets(skill, rs.hits.length);
        rs.hits.forEach((h, i) => {
          if (offs[i] <= 0) return this.hitMonster(p, mon, h * mul, elemMul, skill.elem);
          this.later(offs[i], () => {
            // Người ra chiêu phải còn trong room, còn sống, chưa bay lên; quái chưa chết.
            if (this.players.get(p.sid) === p && !this.isDead(p) && !this.airborne(p) && mon.state !== MS_DEAD) this.hitMonster(p, mon, h * mul, elemMul, skill.elem);
          });
          holdLock = Math.max(holdLock, offs[i]);
        });
        // Bộ Lạc Kiếm Môn Phục (4 món): Phi Kiếm có xác suất bắn thêm một thanh (server roll, không tin client).
        if (skill.id === 'skl_phi_kiem' && c.stats.setFx.phiKiemExtra > 0 && Math.random() < c.stats.setFx.phiKiemExtra) {
          this.fx({ t: skill.fx, src: p.sid, dst: mon.id, ...tag });
          this.hitMonster(p, mon, rs.power * mul, elemMul, skill.elem);
        }
        if (behind && v?.pierce) this.hitMonster(p, behind, rs.power * v.pierce * mul, elemMul, skill.elem);
        if (v?.cleave) {
          for (const o of this.monstersNear(mon.s.x, mon.s.z, v.cleave.r, mon)) this.hitMonster(p, o, rs.power * v.cleave.mul * mul, elemMul, skill.elem);
        }
        if (v?.trail) {
          this.trails.push({ owner: p.sid, x: mon.s.x, z: mon.s.z, r: v.trail.r, nextAt: this.now + 1000, endAt: this.now + v.trail.dur * 1000, power: rs.power * v.trail.mul });
        }
        if (skill.interrupt) this.tryInterrupt(p, mon, v?.stunOnInterrupt ?? 0);
        break;
      }
      case 'aoe': {
        const mon = this.monById.get(targetId);
        if (!mon) break;
        const r = rs.radius ?? 8;
        const cx = mon.s.x;
        const cz = mon.s.z;
        this.fx({ t: skill.fx, src: p.sid, dst: mon.id, x: cx, y: mon.s.y, z: cz, r, sd: visualSeed(), ...tag });
        for (const o of this.monsters) {
          if (o.state === MS_DEAD) continue;
          const dx = o.s.x - cx;
          const dz = o.s.z - cz;
          if (dx * dx + dz * dz <= r * r) this.hitMonster(p, o, rs.power * mul, elemMul, skill.elem);
        }
        break;
      }
      case 'heal': {
        const base = c.mhp * rs.power;
        const recv = 1 + c.stats.healRecv;
        if (v?.hot) {
          this.addHot(p.sid, healAmount(base * v.hot.totalMul, healMul) / v.hot.dur, v.hot.dur);
          this.setHealShare(p, Math.round(healAmount(base * v.hot.totalMul, healMul)), v.hot.dur);
        } else {
          const n = Math.round(healAmount(base, healMul) * recv);
          c.hp = Math.min(c.mhp, c.hp + n);
          this.emit(S.DMG, { dst: p.sid, n, heal: true } satisfies DmgMsg);
          this.setHealShare(p, n);
        }
        this.fx({ t: skill.fx, src: p.sid, ...tag });
        break;
      }
      case 'shield': {
        const dur = rs.duration ?? 8;
        const give = (o: PlayerEnt) => {
          o.shield = { amount: Math.round(o.char.mhp * rs.power * (v?.amountMul ?? 1) * (o === p && skill.id === 'skl_linh_khi_ho_the' ? 1 + c.stats.setFx.shieldBoost : 1)), until: this.now + dur * 1000 };
          this.setFlag(o, PF_SHIELD, true);
        };
        give(p);
        this.fx({ t: skill.fx, src: p.sid, d: dur, ...tag });
        const ally = v?.ally ? this.nearestAlly(p, v.ally) : null;
        if (ally) {
          give(ally);
          // `dst` = người ra tay: client vẽ luồng sáng truyền khiên từ người ấy sang đồng đội (chỉ lớp hình).
          this.fx({ t: skill.fx, src: ally.sid, dst: p.sid, d: dur, ...tag });
        }
        break;
      }
      case 'taunt': {
        const r = rs.radius ?? 12;
        const sec = (rs.duration ?? 5) * (v?.tauntMul ?? 1);
        this.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
        for (const o of this.monstersNear(p.move.x, p.move.z, r)) {
          o.taunt = { sid: p.sid, until: this.now + sec * 1000 * (o.def.boss ? TAUNT_BOSS_MUL : 1) };
          this.aggroMonster(o, p);
          this.hitMonster(p, o, rs.power * mul);
        }
        if (v?.tauntGuard) p.mth.setGuard(this.now, v.tauntGuard, 3);
        break;
      }
      case 'guard': {
        p.mth.setGuard(this.now, skill.reduce ?? 0.6, rs.duration ?? 6);
        this.fx({ t: skill.fx, src: p.sid, d: rs.duration ?? 6, ...tag });
        break;
      }
      case 'hot': {
        const r = (skill.allyRadius ?? 10) * (v?.healRadiusMul ?? 1);
        const sec = rs.duration ?? 6;
        this.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, d: sec, ...tag });
        for (const o of this.players.values()) {
          if (!this.canAssist(p, o)) continue;
          if (o !== p && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
          const total = healAmount(o.char.mhp * rs.power * (o === p ? (v?.selfHealMul ?? 1) : 1), healMul);
          this.addHot(o.sid, total / sec, sec);
        }
        // Mộc độc (đan sư): quái trong vùng chịu sát thương theo thời gian.
        if (skill.poison) {
          for (const o of this.monstersNear(p.move.x, p.move.z, skill.poison.r)) {
            if (o.owner && o.owner !== p.sid) continue;
            o.poison = { sid: p.sid, until: this.now + skill.poison.dur * 1000, nextAt: this.now + 1000, per: Math.max(1, Math.round(c.atk * skill.poison.mul)) };
            this.aggroMonster(o, p);
          }
        }
        break;
      }
      case 'revive': {
        const r = skill.allyRadius ?? 14;
        const dead = this.reviveTarget(p, r);
        this.fx({ t: skill.fx, src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, r, ...tag });
        if (dead) {
          dead.char.hp = Math.max(1, Math.round(dead.char.mhp * rs.power));
          dead.s.fl = 0;
          dead.lastCombatAt = this.now;
          dead.hazardWin = { until: 0, taken: 0 };
          this.sys(dead, 'sys.revived', { name: c.name }, 'good');
          this.fx({ t: 'respawn', src: dead.sid, v: 'revive' });
        }
        for (const o of this.players.values()) {
          if (o === dead || !this.canAssist(p, o) || Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > r) continue;
          const n = healAmount(o.char.mhp * 0.2, healMul);
          o.char.hp = Math.min(o.char.mhp, o.char.hp + n);
          this.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
        }
        break;
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
    p.flow.opened.set(skill.id, this.now);
    this.sendCd(p);
  }

  /** Chạy `fn` sau `sec` giây (đòn thứ hai trở đi của chiêu nhiều mốc `hitAt`). */
  private later(sec: number, fn: () => void): void {
    this.delayed.push({ at: this.now + sec * 1000, fn });
  }

  /** Mỗi tick: hồi theo thời gian, vệt kiếm khí, kiếm ý/thế rụng. */
  private tickMethods(): void {
    const now = this.now;
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (now < this.delayed[i].at) continue;
      const [d] = this.delayed.splice(i, 1);
      d.fn();
    }
    for (let i = this.hots.length - 1; i >= 0; i--) {
      const h = this.hots[i];
      const o = this.players.get(h.sid);
      if (!o || this.isDead(o) || now >= h.endAt + 5) {
        this.hots.splice(i, 1);
        continue;
      }
      while (now >= h.nextAt && h.nextAt <= h.endAt) {
        h.nextAt += 1000;
        const n = Math.round(h.per * (1 + o.char.stats.healRecv));
        if (n > 0 && o.char.hp < o.char.mhp) {
          o.char.hp = Math.min(o.char.mhp, o.char.hp + n);
          this.emit(S.DMG, { dst: o.sid, n, heal: true } satisfies DmgMsg);
        }
      }
      if (h.nextAt > h.endAt) this.hots.splice(i, 1);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      const owner = this.players.get(tr.owner);
      if (!owner || now >= tr.endAt + 5) {
        this.trails.splice(i, 1);
        continue;
      }
      while (now >= tr.nextAt && tr.nextAt <= tr.endAt) {
        tr.nextAt += 1000;
        for (const o of this.monstersNear(tr.x, tr.z, tr.r)) this.hitMonster(owner, o, tr.power);
      }
      if (tr.nextAt > tr.endAt) this.trails.splice(i, 1);
    }
    for (const p of this.players.values()) {
      const m = p.mth;
      if (pruneBuffs(p.char.meta, Date.now())) {
        p.char.recalc();
        m.dirty = true;
      }
      if (m.stacks > 0 && this.liveStacks(p) === 0) {
        m.stacks = 0;
        m.dirty = true;
      }
      if (m.guardUntil && now >= m.guardUntil) {
        m.guardUntil = 0;
        m.guardReduce = 0;
        m.dirty = true;
      }
    }
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

  /** `mul`: hệ số sát thương hệ (linh căn, dòng phụ); không đổi việc đòn có nặng hay không (theo `power` gốc). */
  private hitMonster(p: PlayerEnt, mon: MonEnt, basePower: number, mul = 1, elem?: string): void {
    // Dấu ấn của chính người đánh: sát thương nhân thêm (Kiếm Ảnh Phân Quang).
    const mk = mon.mark;
    const power0 = mk && mk.sid === p.sid && this.now < mk.until ? basePower * (1 + mk.mul) : basePower;
    // Cộng hưởng vai trò (tổ đội đủ Kiếm tu/Hộ pháp/Đan sư đứng gần nhau): đánh mạnh hơn một chút.
    const power = parties.resonance(p) ? power0 * (1 + RESONANCE_DMG) : power0;
    // Khắc chế ngũ hành (3-10): server tính, client chỉ nhận cờ `ke` để hiển thị.
    const ke = elemCounter(elem, mon.def.elem);
    // Nội tại công pháp (3-10): kiếm tu đủ kiếm ý thì bạo kích cao hơn; hộ pháp đánh cận chiến mạnh hơn.
    const pas0 = passiveOf(p.char.meta);
    let critRate = p.char.stats.critRate;
    if (pas0?.kind === 'kiem_y' && pas0.critAtMax && this.liveStacks(p) >= (pas0.max ?? 5)) critRate = Math.min(STAT_CAPS.critRate, critRate + pas0.critAtMax);
    let meleeMul = 1;
    if (pas0?.melee && Math.hypot(mon.s.x - p.move.x, mon.s.z - p.move.z) <= pas0.melee.r + mon.def.scale) meleeMul += pas0.melee.mul;
    const { dmg, crit } = computeDamage(p.char.atk, power * mul * counterMul(ke) * meleeMul, mon.defn, Math.random(), Math.random(), critRate, p.char.stats.critMul);
    const stunned = this.now < mon.stunUntil;
    const heavy = isHeavyHit(power);
    // `hv` (lớp hình) tính cả lúc choáng; phá thế chỉ cộng phần đòn nặng cho chiêu hệ số cao thật.
    // Đòn không có hiệu lực (quái đã chết, đang miễn sát thương, bóng tâm ma của người khác) không cho kiếm ý/sạc.
    const lands = mon.state !== MS_DEAD && !(mon.owner && mon.owner !== p.sid) && this.now >= mon.evadeUntil;
    this.damageMonster(mon, vulnerableDamage(dmg, stunned), p, crit, stunned || heavy, heavy, ke);
    if (!lands) return;
    // Bộ Hàn Giao Lân (3 món): đòn bạo kích làm chậm mục tiêu (boss chỉ chậm nhẹ).
    const slowSec = p.char.stats.setFx.critSlowSec;
    if (crit && slowSec > 0 && mon.state !== MS_DEAD) mon.slow = { until: this.now + slowSec * 1000, mul: mon.def.boss ? SET_SLOW_BOSS : SET_SLOW_MUL };
    const pas = passiveOf(p.char.meta);
    if (pas?.kind === 'kiem_y') this.addStack(p, pas.max ?? 5, pas.decay ?? 10);
    // Chiêu tối thượng đang ra không tự nạp lại vòng sạc của chính nó.
    if (!p.mth.lockCharge) this.gainCharge(p, chargeFromDealt(dmg, p.char.atk));
  }

  /** Chiêu ngắt trúng boss: phá chú nếu đúng cửa sổ. Mục tiêu, tầm, GCD, hồi chiêu đã kiểm ở onSkill. */
  private tryInterrupt(p: PlayerEnt, mon: MonEnt, extraStun = 0): void {
    const ch = mon.rules.ai.chant;
    if (!ch || !mon.chant || mon.state === MS_DEAD || this.now < mon.evadeUntil) return;
    const r = chantInterrupt(mon.chant.startAt, mon.chant.endAt, ch.open, this.now);
    if (r === 'guarded') return this.sys(p, 'sys.chant_guarded', { boss: monsterName(mon.def.id) }, 'bad');
    if (r !== 'ok') return;
    mon.chant = null;
    mon.chantAt = this.now + ch.cd * 1000;
    mon.stunUntil = this.now + (ch.stun + extraStun) * 1000;
    mon.comboAt = 0;
    mon.comboTarget = '';
    this.setMonFlags(mon, MF_STUN, mon.stunUntil);
    this.fx({ t: 'interrupt', src: p.sid, dst: mon.id, d: ch.stun + extraStun });
    this.sysAll('sys.chant_broken', { name: p.char.name, boss: monsterName(mon.def.id) }, 'good');
    // Ngắt đúng lúc là nguồn lấp thanh phá thế lớn nhất.
    const ps = mon.def.posture;
    if (ps) this.addPosture(mon, ps.interrupt);
  }

  /** Cộng phá thế; đầy thì boss mất thế. Không lấp khi đang quỵ vì mất thế. */
  private addPosture(m: MonEnt, n: number): void {
    const ps = m.def.posture;
    if (!ps || !(n > 0) || (m.state !== MS_CHASE && m.state !== MS_ATTACK)) return;
    if (m.s.mf & MF_BROKEN && this.now < m.stunUntil) return;
    m.lastHitAt = this.now;
    m.posture = Math.min(1, m.posture + n);
    if (m.posture >= 1) this.breakPosture(m);
    else this.syncPosture(m);
  }

  private syncPosture(m: MonEnt): void {
    const pz = Math.floor(m.posture * 100);
    if (m.s.pz !== pz) m.s.pz = pz;
  }

  /**
   * Đầy thanh phá thế: boss quỵ `brk` giây (đứng yên, nhận thêm sát thương), mất chú đang niệm.
   * Vùng chém đã thả trước đó vẫn nổ đúng như báo trước (thấy gì thì trúng nấy).
   */
  private breakPosture(m: MonEnt): void {
    const ps = m.def.posture!;
    m.posture = 0;
    this.syncPosture(m);
    const ch = m.rules.ai.chant;
    if (m.chant && ch) m.chantAt = this.now + ch.cd * 1000;
    m.chant = null;
    m.windUntil = 0;
    m.comboAt = 0;
    m.comboTarget = '';
    m.cast = null;
    m.stunUntil = Math.max(m.stunUntil, this.now + ps.brk * 1000);
    this.setMonFlags(m, MF_STUN | MF_BROKEN, m.stunUntil);
    this.fx({ t: 'break', src: m.id, d: ps.brk });
    this.sysAll('sys.posture_broken', { boss: monsterName(m.def.id) }, 'good');
  }

  /** Đổi pha boss: thay bộ chiêu/nhịp; `ph` lên state để client vẽ thanh niệm chú đúng thời lượng. */
  private setPhase(m: MonEnt, ph: number): void {
    if (m.phase === ph) return;
    m.phase = ph;
    m.rules = phaseRules(m.def, ph);
    if (m.s.ph !== ph) m.s.ph = ph;
  }

  /** Máu xuống dưới ngưỡng pha: đổi pha, báo client (câu thoại chọn ở client qua i18n), chiêu mới ra sớm. */
  private checkPhase(m: MonEnt): void {
    const phases = m.def.phases;
    if (!phases || m.s.hp <= 0) return;
    const ph = bossPhaseAt(m.s.hp / m.s.mhp, phases, m.phase);
    if (ph === m.phase) return;
    this.setPhase(m, ph);
    // Pha mới bỏ chú/đọc chú thì hủy cái đang dở, không để kẹt cờ niệm chú.
    if (m.chant && !m.rules.ai.chant) {
      m.chant = null;
      m.chantAt = 0;
      if (m.s.mf & MF_CHANT) this.setMonFlags(m, 0, 0);
    }
    if (m.cast && !m.rules.ai.caster) m.cast = null;
    m.comboAt = 0;
    m.comboTarget = '';
    if (m.rules.ai.sweep && !m.chant) m.sweepAt = this.now + 2500;
    this.fx({ t: 'phase', src: m.id, d: ph });
  }

  private setMonFlags(m: MonEnt, mf: number, ce: number): void {
    if (m.s.mf !== mf) m.s.mf = mf;
    if (m.s.ce !== ce) m.s.ce = ce;
  }

  /** Boss niệm chú. Trả về true nếu tick này boss bận niệm (không đi, không đánh). */
  private tickChant(m: MonEnt, c: MonsterChant, target: PlayerEnt, d: number, reachable: boolean): boolean {
    if (m.chant) {
      m.s.yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
      this.setMonState(m, MS_ATTACK);
      if (this.now >= m.chant.endAt) this.releaseChant(m, c);
      return true;
    }
    if (!m.chantAt) {
      // Vừa vào trận: lần niệm đầu sau nửa chu kỳ.
      m.chantAt = this.now + c.cd * 500;
      return false;
    }
    if (this.now < m.chantAt || m.comboAt || !reachable || d > c.r + 12) return false;
    m.chant = { startAt: this.now, endAt: this.now + c.cast * 1000 };
    this.setMonFlags(m, MF_CHANT, m.chant.endAt);
    this.setMonState(m, MS_ATTACK);
    this.fx({ t: 'chant', src: m.id, d: c.cast });
    return true;
  }

  /** Niệm xong: thả vùng tròn quanh boss, chạy ra khỏi vòng để né. */
  private releaseChant(m: MonEnt, c: MonsterChant): void {
    m.chant = null;
    m.chantAt = this.now + c.cd * 1000;
    m.abilityAt = Math.max(m.abilityAt, this.now + (c.delay + 2) * 1000);
    this.setMonFlags(m, 0, 0);
    this.addHazard({ x: m.s.x, z: m.s.z, r: c.r }, c.delay, c.mul, false, c.kind, m.id, m.atk);
  }

  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null, crit = false, hv = false, heavy = hv, ke: 0 | 1 | -1 = 0): void {
    if (mon.state === MS_DEAD) return;
    // Bóng tâm ma chỉ bị chủ đánh: người khác (kể cả vùng nổ lan sang) không làm gì được.
    if (mon.owner && p?.sid !== mon.owner) return;
    if (this.now < mon.evadeUntil) {
      this.emit(S.DMG, { dst: mon.id, n: 0 } satisfies DmgMsg);
      return;
    }
    const hp = Math.max(0, mon.s.hp - dmg);
    mon.s.hp = hp;
    const msg: DmgMsg = { dst: mon.id, n: dmg };
    if (crit) msg.crit = true;
    if (hv) msg.hv = true;
    if (ke) msg.ke = ke;
    if (p) msg.src = p.sid;
    this.emit(S.DMG, msg);
    if (p) {
      mon.threat.set(p.sid, (mon.threat.get(p.sid) ?? 0) + dmg);
      if (mon.state === MS_IDLE || (mon.state === MS_RETURN && this.homeDist(mon) < LEASH * 0.7)) {
        this.resetAi(mon);
        mon.target = p.sid;
        mon.state = MS_CHASE;
        mon.s.st = MS_CHASE;
        mon.unreachableSince = 0;
      }
    }
    // Sau khi AI đã vào trận (resetAi ở trên xóa phá thế/choáng). Boss đang bỏ đuổi về nhà thì không đổi pha,
    // không lấp phá thế: đuổi theo đánh boss đang chạy về không được lợi gì.
    if (mon.def.boss && hp > 0 && (mon.state === MS_CHASE || mon.state === MS_ATTACK)) {
      this.checkPhase(mon);
      const ps = mon.def.posture;
      if (ps && p) this.addPosture(mon, postureGain(ps, dmg, mon.s.mhp, heavy) * (1 + passiveValue(p.char.equip, p.char.meta, 'posture')));
    }
    if (hp <= 0) this.killMonster(mon);
  }

  /** Kênh mới mở không có boss ngay: boss bắt đầu ở trạng thái chờ hồi sinh. */
  delayBosses(): void {
    for (const m of this.monsters) {
      if (!m.def.boss || !m.spawn) continue;
      m.state = MS_DEAD;
      m.s.st = MS_DEAD;
      m.s.hp = 0;
      m.target = '';
      m.respawnAt = this.now + m.spawn.respawn * 1000;
    }
  }

  private homeDist(m: MonEnt): number {
    return Math.hypot(m.s.x - m.homeX, m.s.z - m.homeZ);
  }

  private killMonster(mon: MonEnt): void {
    mon.mark = undefined;
    mon.taunt = undefined;
    mon.state = MS_DEAD;
    mon.s.st = MS_DEAD;
    mon.target = '';
    this.resetAi(mon);
    if (mon.camp) this.camps.onKill(mon);
    else if (mon.spawn) mon.respawnAt = this.now + mon.spawn.respawn * 1000;
    else mon.removeAt = this.now + 4000;
    if (this.isTimed(mon)) this.sendBossTimers();
    if (mon.owner) {
      // Bóng tâm ma: không tu vi, không rơi đồ, không tính nhiệm vụ; chỉ báo cho hệ bình cảnh.
      mon.threat.clear();
      this.realm.onShadowDown(mon);
      return;
    }
    const xp = monsterXp(mon.level, mon.def.xpMul);
    const minShare = mon.s.mhp * 0.05;
    const dealers = new Set<PlayerEnt>();
    for (const [sid, dealt] of mon.threat) {
      const p = this.players.get(sid);
      if (!p || dealt < minShare) continue;
      if (Math.hypot(p.move.x - mon.s.x, p.move.z - mon.s.z) > 90) continue;
      dealers.add(p);
    }
    const done = new Set<PlayerEnt>();
    const dist = (o: PlayerEnt) => Math.hypot(o.move.x - mon.s.x, o.move.z - mon.s.z);
    // Tổ đội (P3-9): đồng đội còn sống trong tầm cùng chia tu vi, cùng được tính diệt quái và chia đồ,
    // kể cả khi không ra đòn (Hộ pháp, Đan sư). Người đánh mà ở xa/đã ngã thì tính riêng như người đơn.
    const groups = new Map<NonNullable<ReturnType<typeof parties.partyOf>>, PlayerEnt[]>();
    for (const p of dealers) {
      const party = parties.partyOf(p.char.id);
      if (!party || groups.has(party)) continue;
      groups.set(
        party,
        parties.matesInRoom(p.char.id, this.host).filter((o) => !this.isDead(o) && !o.trib && !o.trial && dist(o) <= PARTY_SHARE_RANGE),
      );
    }
    for (const [party, pool] of groups) {
      const raw = splitXp(xp, pool.map((o) => xpShareWeight(dist(o))));
      pool.forEach((o, i) => {
        const res = parties.resonance(o) ? 1 + RESONANCE_XP : 1;
        this.giveXp(o, Math.max(1, Math.round(raw[i] * xpLevelFactor(o.char.level, mon.level) * (o.noLoot ? 0.3 : 1) * res)));
        this.questEvent(o, 'kill', mon.def.id, 1);
        this.feedArtifact(o, mon);
        done.add(o);
      });
      // Chia đồ: boss hoặc chế độ tự do thì ai cũng có phần riêng; theo lượt thì một người nhận đồ, mọi người nhận linh thạch.
      const turn = party.loot === 'turn' && !mon.def.boss;
      let pick = -1;
      if (turn) {
        pick = nextTurn(party.members.length, party.lastTurn, (i) => pool.some((o) => o.char.id === party.members[i] && !o.noLoot));
        if (pick >= 0) party.lastTurn = pick;
      }
      for (const o of pool) this.rollLoot(o, mon, !turn || party.members[pick] === o.char.id ? 'all' : 'gold');
    }
    for (const p of dealers) {
      if (done.has(p)) continue;
      // Người trong tổ đội đã ra đòn nhưng đứng quá xa/đã ngã lúc quái chết: không né được phần chia để nhận trọn như người đơn;
      // chỉ được tính nhiệm vụ diệt quái (tu vi và đồ thuộc phần chia của tổ).
      if (parties.partyOf(p.char.id)) {
        this.questEvent(p, 'kill', mon.def.id, 1);
        this.feedArtifact(p, mon);
        continue;
      }
      if (!this.isDead(p)) this.giveXp(p, Math.max(1, Math.round(xp * xpLevelFactor(p.char.level, mon.level) * (p.noLoot ? 0.3 : 1))));
      this.rollLoot(p, mon);
      this.questEvent(p, 'kill', mon.def.id, 1);
      this.feedArtifact(p, mon);
    }
    mon.threat.clear();
    if (mon.def.boss) {
      this.sysAll('sys.boss_dead', { boss: monsterName(mon.def.id) }, 'good');
      // Boss gục: client hiện câu cuối (nếu có) cho người đứng gần.
      this.fx({ t: 'bfall', src: mon.id });
    }
    this.host.onMonsterKilled?.(mon);
  }

  private rollLoot(p: PlayerEnt, mon: MonEnt, part: 'all' | 'gold' = 'all'): void {
    if (p.noLoot) return;
    const loot = lootOf(mon.def.id);
    const [g0, g1] = loot.gold;
    const gold = g0 + Math.floor(Math.random() * (g1 - g0 + 1));
    const got: { id: string; n: number }[] = [];
    for (const d of part === 'gold' ? [] : loot.drops) {
      if (Math.random() < d.chance) got.push({ id: d.item, n: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
    }
    // Trang bị đã roll (Phase 3-2): phẩm, ô, ilvl chọn ở server; dòng chính/phụ roll trong addRolled (seed vào ledger).
    const gear = part === 'gold' ? [] : rollEquipDrops(loot.equip, ITEM_SYS, ITEMS, mon.level, Math.random);
    // Vàng luôn vào túi; vật phẩm nào không còn chỗ thì bỏ.
    const kept: { id: string; n: number }[] = [];
    const keptGear: { id: string; q: Quality; ilvl: number }[] = [];
    let full = false;
    const saved = p.char.tx('loot:' + mon.def.id, null, (d) => {
      d.addGold(gold);
      for (const g of gear) {
        // addRolled chỉ đụng túi khi còn chỗ; hết chỗ thì món đó bỏ, bản nháp vẫn dùng được.
        if (d.freeSlots() > 0 && d.addRolled(g.id, g.ilvl, g.q)) keptGear.push(g);
        else full = true;
      }
      for (const g of got) {
        const def = ITEM.get(g.id)!;
        // Kiểm tra trước để một món không vừa không làm hỏng cả bản nháp.
        const room = d.roomFor(g.id);
        if (room >= g.n && d.add(g.id, g.n)) kept.push(g);
        else full = true;
      }
      return true;
    });
    // Ghi DB lỗi: túi/ví không đổi nên không báo gì (tránh báo Thiên phẩm giả cho cả phòng).
    if (!saved) return;
    if (gold > 0) this.sys(p, 'sys.gold', { n: gold }, 'loot', { src: mon.id });
    for (const g of kept) this.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot', { i: g.id, src: mon.id });
    for (const g of keptGear) {
      this.sys(p, 'sys.loot_gear', { item: itemName(g.id), quality: t('ui.quality.' + g.q) }, 'loot', { i: g.id, src: mon.id, q: g.q });
      if (g.q >= 4) this.sysAll('sys.loot_heaven', { name: p.char.name, item: itemName(g.id) }, 'good');
    }
    if (full) this.warn(p, 'sys.inv_full');
  }

  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv = false): void {
    if (this.isDead(p)) return;
    const c = p.char;
    let n = Math.max(1, Math.round(dmg));
    if (this.now < p.mth.guardUntil) n = reduceDamage(n, p.mth.guardReduce);
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
    this.emit(S.DMG, msg);
    if (c.hp <= 0) this.killPlayer(p);
  }

  private killPlayer(p: PlayerEnt): void {
    this.duel.onGone(p, true);
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
    } else {
      const lost = c.loseXp(DEATH_XP_LOSS);
      this.sys(p, lost > 0 ? 'sys.died' : 'sys.died_free', { n: lost }, 'bad');
    }
    this.fx({ t: 'death', src: p.sid });
  }

  onRespawn(p: PlayerEnt): void {
    if (!this.isDead(p)) return;
    const c = p.char;
    const { x, z } = this.opts.respawn;
    p.move = { x, y: groundAt(x, z), z, vy: 0, grounded: true, flying: false };
    p.inputs.length = 0;
    c.hp = Math.round(c.mhp * 0.5);
    c.mp = Math.round(c.mmp * 0.5);
    p.s.fl = 0;
    p.lastCombatAt = 0;
    p.hazardWin = { until: 0, taken: 0 };
    this.sys(p, 'sys.respawned', undefined, 'info');
    this.fx({ t: 'respawn', src: p.sid });
  }

  // ---------- quái ----------

  private spawnFromDef(sp: SpawnDef): MonEnt | null {
    const def = MONSTER.get(sp.mon);
    if (!def) return null;
    const pos = this.randomPoint(sp.x, sp.z, sp.radius, !!def.boss);
    const level = sp.levelMin + Math.floor(Math.random() * (sp.levelMax - sp.levelMin + 1));
    return this.spawnMonster(def, level, pos.x, pos.z, sp);
  }

  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: SpawnDef | null): MonEnt {
    const st = monsterStats(level, def.hpMul, def.atkMul);
    const s = new MonS();
    s.t = def.id;
    s.x = x;
    s.z = z;
    s.y = groundAt(x, z);
    s.yaw = Math.random() * Math.PI * 2;
    s.hp = st.hp;
    s.mhp = st.hp;
    s.lv = level;
    s.st = MS_IDLE;
    const id = 'm' + this.nextId++;
    const m: MonEnt = {
      id,
      def,
      s,
      level,
      atk: st.atk,
      defn: st.def,
      homeX: x,
      homeZ: z,
      spawn,
      state: MS_IDLE,
      target: '',
      attackAt: 0,
      respawnAt: 0,
      removeAt: 0,
      thinkAt: this.now + Math.random() * 400,
      wanderAt: this.now + 2000 + Math.random() * 6000,
      wx: x,
      wz: z,
      unreachableSince: 0,
      evadeUntil: 0,
      abilityAt: 0,
      threat: new Map(),
      owner: '',
      slotUntil: 0,
      slotCdAt: 0,
      slotSid: '',
      orbitSign: Math.random() < 0.5 ? -1 : 1,
      comboAt: 0,
      comboTarget: '',
      cast: null,
      castReadyAt: 0,
      chant: null,
      chantAt: 0,
      stunUntil: 0,
      phase: 0,
      rules: phaseRules(def, 0),
      posture: 0,
      lastHitAt: 0,
      sweepAt: 0,
      windUntil: 0,
    };
    this.monsters.push(m);
    this.monById.set(id, m);
    this.state.monsters.set(id, s);
    return m;
  }

  private respawnMonster(m: MonEnt, at?: { x: number; z: number }): void {
    const sp = m.spawn!;
    const pos = at ?? this.randomPoint(sp.x, sp.z, sp.radius, !!m.def.boss);
    m.level = sp.levelMin + Math.floor(Math.random() * (sp.levelMax - sp.levelMin + 1));
    const st = monsterStats(m.level, m.def.hpMul, m.def.atkMul);
    m.atk = st.atk;
    m.defn = st.def;
    m.homeX = m.wx = pos.x;
    m.homeZ = m.wz = pos.z;
    m.s.x = pos.x;
    m.s.z = pos.z;
    m.s.y = groundAt(pos.x, pos.z);
    m.s.lv = m.level;
    m.s.mhp = st.hp;
    m.s.hp = st.hp;
    m.state = MS_IDLE;
    m.s.st = MS_IDLE;
    m.target = '';
    m.threat.clear();
    this.resetAi(m);
    this.setPhase(m, 0);
    if (m.def.boss) this.sysAll('sys.boss_spawn', { boss: monsterName(m.def.id) }, 'info');
    if (this.isTimed(m)) this.sendBossTimers();
  }

  /** Tinh anh/boss đứng lẻ (không thuộc bãi): có giờ hồi sinh gửi xuống client (BossTimerMsg). */
  private isTimed(m: MonEnt): boolean {
    return !m.camp && !!m.spawn && !m.owner && (!!m.def.boss || !!m.def.elite);
  }

  /** Giờ hồi sinh mọi tinh anh/boss của bản đồ; `at` = 0 khi đang sống. Không phụ thuộc AOI. */
  bossTimers(): BossTimerMsg {
    const list: BossTimerMsg['list'] = [];
    for (const m of this.monsters) {
      if (!this.isTimed(m)) continue;
      list.push({ id: m.id, t: m.def.id, x: Math.round(m.homeX), z: Math.round(m.homeZ), lv: m.level, at: m.state === MS_DEAD ? Math.round(m.respawnAt) : 0 });
    }
    return { now: this.now, list };
  }

  /** Gửi giờ hồi sinh cho một người (lúc vào) hoặc cả phòng (khi một con đổi trạng thái). */
  sendBossTimers(p?: PlayerEnt): void {
    const msg = this.bossTimers();
    if (!msg.list.length) return;
    if (p) p.client.send(S.BOSS_TIMERS, msg);
    else this.host.broadcast(S.BOSS_TIMERS, msg);
  }

  private removeMonster(m: MonEnt): void {
    this.resetAi(m);
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
    this.monById.delete(m.id);
    this.state.monsters.delete(m.id);
  }

  private moveToward(m: MonEnt, tx: number, tz: number, speed: number, dt: number): number {
    const dx = tx - m.s.x;
    const dz = tz - m.s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) return d;
    const slowed = m.slow && this.now < m.slow.until ? m.slow.mul : 1;
    const step = Math.min(d, speed * slowed * dt);
    const nx = m.s.x + (dx / d) * step;
    const nz = m.s.z + (dz / d) * step;
    m.s.x = nx;
    m.s.z = nz;
    m.s.y = groundAt(nx, nz);
    m.s.yaw = Math.atan2(dx, dz);
    return d - step;
  }

  private setMonState(m: MonEnt, st: number): void {
    m.state = st;
    if (m.s.st !== st) m.s.st = st;
    if (st === MS_RETURN || st === MS_DEAD || st === MS_IDLE) this.resetAi(m);
  }

  /** Hủy chuỗi đòn/niệm chú đang dở và nhả ô cận chiến (bỏ đuổi, chết, hồi sinh). */
  private resetAi(m: MonEnt): void {
    m.chant = null;
    m.chantAt = 0;
    m.stunUntil = 0;
    m.posture = 0;
    m.sweepAt = 0;
    m.windUntil = 0;
    this.syncPosture(m);
    this.setMonFlags(m, 0, 0);
    this.resetTargetAi(m);
  }

  /**
   * Đổi mục tiêu: chỉ hủy phần nhắm người cũ (đòn đôi, chú đánh xa, ô cận chiến). Chú của boss là vòng quanh
   * chính nó nên giữ nguyên, kể cả lịch niệm, để không né được chú bằng cách đổi người giữ thù hận.
   */
  private resetTargetAi(m: MonEnt): void {
    m.comboAt = 0;
    m.comboTarget = '';
    m.cast = null;
    m.slotUntil = 0;
    if (m.slotSid && this.meleeSlot.get(m.slotSid) === m.id) this.meleeSlot.delete(m.slotSid);
    m.slotSid = '';
  }

  /**
   * Mỗi người chơi chỉ một quái cận chiến được đánh cùng lúc. Trả về true nếu `m` đang giữ
   * (hoặc vừa giành được) ô của `target`; false thì `m` phải đi vòng ngoài.
   */
  private holdsMeleeSlot(m: MonEnt, target: PlayerEnt, d: number, reach: number): boolean {
    const sid = target.sid;
    const hid = this.meleeSlot.get(sid);
    if (hid === m.id) {
      if (this.now < m.slotUntil) return true;
      // Hết lượt: có quái khác đang chờ thì nhường, không thì giữ tiếp.
      if (this.now - (this.slotWait.get(sid) ?? 0) > 400) {
        m.slotUntil = this.now + SLOT_HOLD_MS;
        return true;
      }
      this.meleeSlot.delete(sid);
      m.slotUntil = 0;
      m.slotSid = '';
      m.slotCdAt = this.now + SLOT_REST_MS;
      return false;
    }
    if (hid) {
      const h = this.monById.get(hid);
      if (h && h.target === sid && this.now < h.slotUntil && (h.state === MS_CHASE || h.state === MS_ATTACK)) {
        if (d <= reach + SLOT_CLAIM_DIST * 2) this.slotWait.set(sid, this.now);
        return false;
      }
    }
    if (d > reach + SLOT_CLAIM_DIST || this.now < m.slotCdAt) return false;
    if (m.slotSid && m.slotSid !== sid && this.meleeSlot.get(m.slotSid) === m.id) this.meleeSlot.delete(m.slotSid);
    this.meleeSlot.set(sid, m.id);
    m.slotSid = sid;
    m.slotUntil = this.now + SLOT_HOLD_MS;
    return true;
  }

  /** Đi vòng ngoài quanh mục tiêu, mặt hướng vào, chờ tới lượt. */
  private orbit(m: MonEnt, target: PlayerEnt, d: number, reach: number, dt: number): void {
    const R = reach + 2.2 + m.def.scale;
    const px = target.move.x;
    const pz = target.move.z;
    const a = Math.atan2(m.s.x - px, m.s.z - pz) + m.orbitSign * 0.5;
    const far = d > R + 1.5;
    this.moveToward(m, px + Math.sin(a) * R, pz + Math.cos(a) * R, m.def.speed * (far ? 1 : 0.45), dt);
    if (!far) m.s.yaw = Math.atan2(px - m.s.x, pz - m.s.z);
    this.setMonState(m, MS_CHASE);
  }

  /** Đòn thứ hai của chuỗi: né được nếu đã ra khỏi tầm. */
  private resolveCombo(m: MonEnt): void {
    const combo = m.rules.ai.combo;
    const p = this.players.get(m.comboTarget);
    m.comboAt = 0;
    m.comboTarget = '';
    if (!combo || !p || this.isDead(p)) return;
    const dx = p.move.x - m.s.x;
    const dz = p.move.z - m.s.z;
    const reach = m.def.attackRange + 0.8;
    const hit = dx * dx + dz * dz <= reach * reach && p.move.y - m.s.y < 3.5 + m.def.scale * 1.5;
    m.s.yaw = Math.atan2(dx, dz);
    this.fx(hit ? { t: 'bite', src: m.id, dst: p.sid } : { t: 'bite', src: m.id });
    if (!hit) return;
    const { dmg } = computeDamage(m.atk, combo.mul, p.char.def, Math.random(), 1);
    this.damagePlayer(p, dmg, m.id, true);
  }

  /** Quái đánh xa: giữ khoảng cách, đọc chú, rồi thả vùng báo trước đúng hình chiêu. */
  private tickCaster(m: MonEnt, target: PlayerEnt, c: MonsterCaster, d: number, reachable: boolean, dt: number): void {
    const dx = target.move.x - m.s.x;
    const dz = target.move.z - m.s.z;
    if (m.cast) {
      m.s.yaw = Math.atan2(dx, dz);
      this.setMonState(m, MS_ATTACK);
      if (this.now >= m.cast.endAt) this.releaseCast(m, target, c, d, reachable);
      return;
    }
    if (d > c.range) {
      this.moveToward(m, target.move.x, target.move.z, m.def.speed, dt);
      this.setMonState(m, MS_CHASE);
      return;
    }
    if (d < c.range * 0.35 && d > 0.01) {
      // Bị áp sát: lùi ra cho đủ khoảng cách.
      this.moveToward(m, m.s.x - (dx / d) * 3, m.s.z - (dz / d) * 3, m.def.speed * 0.6, dt);
      this.setMonState(m, MS_CHASE);
    } else this.setMonState(m, MS_ATTACK);
    m.s.yaw = Math.atan2(dx, dz);
    if (reachable && this.now >= m.castReadyAt) {
      // Room gần trần số đạn: hoãn đọc chú thay vì tụ lực rồi xịt.
      if (c.shape === 'bolt' && this.bolts.length + boltCount(c) > BOLT_MAX_LIVE) {
        m.castReadyAt = this.now + 500;
        return;
      }
      m.cast = { endAt: this.now + c.cast * 1000 };
      this.fx({ t: 'mcast', src: m.id, dst: target.sid, d: c.cast });
    }
  }

  /**
   * Boss chém vùng: khóa hướng về mục tiêu, vùng báo trước (quạt/chữ nhật từ boss) hiện ngay, nổ sau `delay` giây.
   * Boss đứng yên tới lúc nổ để hình vùng và tư thế khớp nhau; ai đứng trong vùng lúc nổ mới trúng.
   */
  private startSweep(m: MonEnt, target: PlayerEnt, sw: MonsterSweep): void {
    const yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
    m.s.yaw = yaw;
    const g: HazardGeom =
      sw.shape === 'rect'
        ? { x: m.s.x, z: m.s.z, r: sw.r, sh: 'rect', yaw, w: sw.w }
        : { x: m.s.x, z: m.s.z, r: sw.r, sh: 'cone', yaw, w: (sw.w * Math.PI) / 180 };
    this.addHazard(g, sw.delay, sw.mul, false, sw.kind, m.id, m.atk);
    this.fx({ t: 'mcast', src: m.id, dst: target.sid, d: sw.delay });
    m.sweepAt = this.now + sw.cd * 1000;
    m.windUntil = this.now + sw.delay * 1000 + 250;
    m.attackAt = Math.max(m.attackAt, m.windUntil + 400);
    this.setMonState(m, MS_ATTACK);
  }

  private releaseCast(m: MonEnt, target: PlayerEnt, c: MonsterCaster, d: number, reachable: boolean): void {
    m.cast = null;
    m.castReadyAt = this.now + c.cd * 1000;
    // Mục tiêu đã chạy xa hoặc lên chỗ không với tới: chiêu xịt.
    if (!reachable || d > c.range * 1.4) return;
    const yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
    if (c.shape === 'bolt') return this.fireBolts(m, c, yaw, boltLift(target.move.y, groundAt(target.move.x, target.move.z)));
    let g: HazardGeom;
    if (c.shape === 'circle') g = { x: target.move.x, z: target.move.z, r: c.r };
    else if (c.shape === 'rect') g = { x: m.s.x, z: m.s.z, r: c.r, sh: 'rect', yaw, w: c.w ?? 2 };
    else g = { x: m.s.x, z: m.s.z, r: c.r, sh: 'cone', yaw, w: ((c.w ?? 30) * Math.PI) / 180 };
    this.addHazard(g, c.delay, c.mul, false, c.kind, m.id, m.atk);
  }

  private tickMonster(m: MonEnt, dt: number): void {
    if (m.state === MS_DEAD) {
      if (m.camp) return;
      if (m.spawn) {
        if (this.now >= m.respawnAt) this.respawnMonster(m);
      } else if (this.now >= m.removeAt) {
        this.removeMonster(m);
      }
      return;
    }
    const def = m.def;
    if (m.poison) {
      if (this.now >= m.poison.until) m.poison = undefined;
      else if (this.now >= m.poison.nextAt) {
        m.poison.nextAt += 1000;
        const owner = this.players.get(m.poison.sid) ?? null;
        this.damageMonster(m, m.poison.per, owner);
        if (m.state === MS_DEAD) return;
      }
    }
    if (m.state === MS_IDLE) {
      if (this.now >= m.thinkAt) {
        m.thinkAt = this.now + 400;
        let best: PlayerEnt | null = null;
        let bestD = def.aggro * def.aggro;
        for (const p of this.players.values()) {
          if (this.isDead(p) || (m.owner && p.sid !== m.owner)) continue;
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
          this.setMonState(m, MS_CHASE);
          return;
        }
      }
      if (this.now >= m.wanderAt) {
        m.wanderAt = this.now + 4000 + Math.random() * 7000;
        if (!def.boss) {
          const a = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 7;
          const wx = m.homeX + Math.cos(a) * r;
          const wz = m.homeZ + Math.sin(a) * r;
          if (heightAt(wx, wz) > WATER_Y + 0.3) {
            m.wx = wx;
            m.wz = wz;
          }
        }
      }
      if (Math.abs(m.wx - m.s.x) > 0.3 || Math.abs(m.wz - m.s.z) > 0.3) this.moveToward(m, m.wx, m.wz, def.speed * 0.35, dt);
      return;
    }
    if (m.state === MS_RETURN) {
      const left = this.moveToward(m, m.homeX, m.homeZ, def.speed * 1.6, dt);
      if (m.s.hp < m.s.mhp) m.s.hp = Math.min(m.s.mhp, m.s.hp + Math.ceil(m.s.mhp * 0.25 * dt));
      // Hồi đầy máu thì trận mới bắt đầu lại từ pha đầu.
      if (m.s.hp >= m.s.mhp) this.setPhase(m, 0);
      if (left < 0.5) {
        if (def.boss) {
          // Boss về tới chỗ: đầy máu, trận sau bắt đầu lại từ pha đầu (cả khi cả đội chết ngay cạnh chỗ sinh).
          m.s.hp = m.s.mhp;
          this.setPhase(m, 0);
        }
        m.threat.clear();
        m.wx = m.homeX;
        m.wz = m.homeZ;
        this.setMonState(m, MS_IDLE);
      }
      return;
    }
    // CHASE / ATTACK
    const ps = def.posture;
    if (ps && m.posture > 0) {
      m.posture = postureDecay(ps, m.posture, (this.now - m.lastHitAt) / 1000, dt);
      this.syncPosture(m);
    }
    if (m.stunUntil) {
      if (this.now < m.stunUntil) return;
      m.stunUntil = 0;
      this.setMonFlags(m, 0, 0);
      m.attackAt = Math.max(m.attackAt, this.now + 600);
    }
    if (m.taunt) {
      const tp = this.players.get(m.taunt.sid);
      if (this.now >= m.taunt.until || !tp || this.isDead(tp)) m.taunt = undefined;
      else if (m.target !== tp.sid) {
        m.target = tp.sid;
        this.resetTargetAi(m);
      }
    }
    let target = this.players.get(m.target);
    if (!target || this.isDead(target)) {
      // Chuyển sang kẻ gây sát thương nhiều nhất còn sống.
      target = undefined;
      let top = 0;
      for (const [sid, v] of m.threat) {
        const q = this.players.get(sid);
        if (q && !this.isDead(q) && v > top && Math.hypot(q.move.x - m.s.x, q.move.z - m.s.z) < 50) {
          top = v;
          target = q;
        }
      }
      if (!target) {
        m.target = '';
        this.setMonState(m, MS_RETURN);
        return;
      }
      // Đổi mục tiêu: hủy chú đang đọc/đòn đôi đang dở, người mới phải được báo trước từ đầu.
      this.resetTargetAi(m);
      m.target = target.sid;
    }
    const leash = def.boss ? 80 : LEASH;
    const dx = target.move.x - m.s.x;
    const dz = target.move.z - m.s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const dy = target.move.y - m.s.y;
    if ((!m.owner && this.homeDist(m) > leash) || d > 70) {
      m.target = '';
      this.setMonState(m, MS_RETURN);
      return;
    }
    if (m.comboAt && this.now >= m.comboAt) this.resolveCombo(m);
    const reach = def.attackRange + 0.4;
    const reachable = dy < 3.5 + def.scale * 1.5;
    if (!reachable) {
      if (!m.unreachableSince) m.unreachableSince = this.now;
      if (this.now - m.unreachableSince > 5000) {
        // Mục tiêu đứng ở chỗ không với tới: bỏ đuổi, hồi đầy và miễn sát thương một lúc.
        m.target = '';
        m.threat.clear();
        m.unreachableSince = 0;
        m.s.hp = m.s.mhp;
        this.setPhase(m, 0);
        m.evadeUntil = this.now + 6000;
        this.setMonState(m, MS_RETURN);
        return;
      }
    } else {
      m.unreachableSince = 0;
    }
    const ai = m.rules.ai;
    if (m.windUntil) {
      // Đang vung chiêu chém vùng: đứng yên, giữ hướng đã khóa cho khớp vùng báo trước.
      if (this.now < m.windUntil) {
        this.setMonState(m, MS_ATTACK);
        return;
      }
      m.windUntil = 0;
    }
    const chant = ai.chant;
    if (chant && this.tickChant(m, chant, target, d, reachable)) return;
    const sweep = ai.sweep;
    if (sweep && reachable && !m.comboAt) {
      if (!m.sweepAt) m.sweepAt = this.now + sweep.cd * 500;
      else if (this.now >= m.sweepAt && d <= sweep.r * 0.85) {
        this.startSweep(m, target, sweep);
        return;
      }
    }
    const caster = ai.caster;
    if (caster) {
      this.tickCaster(m, target, caster, d, reachable, dt);
    } else if (!def.boss && !this.holdsMeleeSlot(m, target, d, reach)) {
      this.orbit(m, target, d, reach, dt);
    } else if (d > reach) {
      this.moveToward(m, target.move.x, target.move.z, def.speed * m.rules.speedMul, dt);
      this.setMonState(m, MS_CHASE);
    } else {
      m.s.yaw = Math.atan2(dx, dz);
      this.setMonState(m, MS_ATTACK);
      if (reachable && this.now >= m.attackAt && !m.comboAt) {
        m.attackAt = this.now + def.attackCd * m.rules.cdMul * 1000;
        const { dmg } = computeDamage(m.atk, 1, target.char.def, Math.random(), 1);
        this.fx({ t: 'bite', src: m.id, dst: target.sid });
        this.damagePlayer(target, dmg, m.id);
        const combo = ai.combo;
        if (combo && !this.isDead(target) && Math.random() < combo.chance) {
          m.comboAt = this.now + combo.delay * 1000;
          m.comboTarget = target.sid;
        }
      }
    }
    const slam = ai.slam;
    if (slam && this.now >= m.abilityAt) {
      m.abilityAt = this.now + slam.cd * 1000;
      // Chiêu diện rộng báo trước dưới chân từng người: né ra khỏi vòng.
      let n = 0;
      for (const p of this.players.values()) {
        if (this.isDead(p) || n >= slam.max) continue;
        if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) > 45) continue;
        this.addHazard({ x: p.move.x, z: p.move.z, r: slam.r }, slam.delay, slam.mul, false, slam.kind, m.id, m.atk);
        n++;
      }
    }
  }

  // ---------- vùng nguy hiểm (thiên lôi, chiêu boss) ----------

  /** `atk` > 0: `dmg` là hệ số, sát thương tính bằng computeDamage theo phòng thủ từng người lúc nổ. */
  addHazard(g: HazardGeom, delay: number, dmg: number, pct: boolean, kind: HazardMsg['kind'], src: string, atk = 0): void {
    const mon = this.monById.get(src) ?? null;
    this.hazards.push({ x: g.x, z: g.z, r: g.r, sh: g.sh, yaw: g.yaw, w: g.w, at: this.now + delay * 1000, dmg, pct, atk, src, mon });
    const msg: HazardMsg = { x: g.x, z: g.z, r: g.r, delay, kind, src };
    // Tia sét có hình theo seed để mọi client thấy cùng một tia (chỉ là lớp hình).
    if (kind === 'lightning') msg.sd = visualSeed();
    if (g.sh) {
      msg.sh = g.sh;
      msg.yaw = g.yaw ?? 0;
      msg.w = g.w;
    }
    this.emit(S.HAZARD, msg);
  }

  private tickHazards(): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (this.now < h.at) continue;
      this.hazards.splice(i, 1);
      // Quái thả vùng đã chết hoặc đang bỏ đuổi (miễn sát thương) thì vùng không gây sát thương.
      if (h.mon && (h.mon.state === MS_DEAD || h.mon.state === MS_RETURN || !this.monById.has(h.mon.id))) continue;
      for (const p of this.players.values()) {
        if (this.isDead(p)) continue;
        if (!inHazard(h, p.move.x, p.move.z)) continue;
        if (p.move.y - groundAt(p.move.x, p.move.z) > 8) continue;
        let n =
          h.atk > 0
            ? computeDamage(h.atk, h.dmg, p.char.def, Math.random(), 1).dmg
            : h.pct
              ? p.char.mhp * h.dmg
              : Math.max(1, h.dmg - p.char.def * 0.6);
        if (h.mon) {
          // Vùng của quái: trong cửa sổ HAZARD_IFRAME chỉ chịu vùng mạnh nhất (chống dồn đòn).
          const r = hazardHit(Math.max(1, Math.round(n)), p.hazardWin.until, p.hazardWin.taken, this.now);
          p.hazardWin.until = r.until;
          p.hazardWin.taken = r.taken;
          if (r.dmg <= 0) {
            this.emit(S.DMG, { dst: p.sid, n: 0, src: h.src } satisfies DmgMsg);
            continue;
          }
          n = r.dmg;
        }
        // Thiên kiếp của người khác: đứng trong vòng vẫn trúng đòn, nhưng không chết vì kiếp của người khác (dừng ở 1 khí huyết).
        // Nếu không, độ kiếp ở sân tông môn giết oan người mới và người treo máy (mất tu vi), kể cả khi chủ kiếp đã rớt mạng.
        if (!h.mon && h.src !== p.sid) {
          n = Math.min(n, p.char.hp - 1);
          if (n <= 0) continue;
        }
        this.damagePlayer(p, n, h.src, true);
      }
    }
  }

  // ---------- đạn đánh xa (D1) ----------

  /**
   * Bắn một loạt đạn về hướng `yaw` (nhắm chỗ mục tiêu đứng lúc bắn, không đón đầu: bước ngang là né).
   * Đạn bay thẳng, bám địa hình; server phán định trúng theo vị trí người chơi server giữ.
   */
  private fireBolts(m: MonEnt, c: MonsterCaster, yaw: number, lift = 0): void {
    const v = c.speed ?? 9;
    const life = Math.min(BOLT_MAX_LIFE, (c.range * 1.6) / v);
    // Đầu nòng: trước mặt quái một chút để đạn không mọc ra từ giữa thân.
    const off = 0.6 + m.def.scale * 0.5;
    const ox = m.s.x + Math.sin(yaw) * off;
    const oz = m.s.z + Math.cos(yaw) * off;
    const spread = ((c.spread ?? 0) * Math.PI) / 180;
    for (const a of boltYaws(yaw, boltCount(c), spread)) {
      if (this.bolts.length >= BOLT_MAX_LIVE) return;
      const b: Bolt = {
        id: this.nextBoltId++,
        x0: ox,
        z0: oz,
        yaw: a,
        v,
        r: c.r,
        lift,
        t0: this.now,
        endAt: this.now + life * 1000,
        px: ox,
        pz: oz,
        atk: m.atk,
        mul: c.mul,
        mon: m,
      };
      this.bolts.push(b);
      const msg: BoltMsg = { id: b.id, x: ox, z: oz, yaw: a, v, r: c.r, life, t: this.now, kind: c.kind, src: m.id, sd: visualSeed() };
      if (lift > 0) msg.h = Math.round(lift * 100) / 100;
      this.emit(S.BOLT, msg);
    }
  }

  private endBolt(i: number, x: number, z: number, hit?: string): void {
    const b = this.bolts[i];
    this.bolts.splice(i, 1);
    const msg: BoltEndMsg = { id: b.id, x, z };
    if (hit) msg.hit = hit;
    this.emit(S.BOLT_END, msg);
  }

  private tickBolts(): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const m = b.mon;
      // Quái bắn đã chết, đã bị gỡ, hoặc đang bỏ đuổi (hồi đầy + miễn sát thương): đạn tan, không gây sát thương.
      if (m.state === MS_DEAD || m.state === MS_RETURN || !this.monById.has(m.id)) {
        this.endBolt(i, b.px, b.pz);
        continue;
      }
      const t = Math.min(this.now, b.endAt);
      boltXZ(b.x0, b.z0, b.yaw, b.v, (t - b.t0) / 1000, _bp);
      // Vật cản trên đường quét: rút ngắn đoạn tới chỗ chạm trước khi xét người (không trúng người sau tường).
      const bt = boltBlockedAt(b.px, b.pz, _bp.x, _bp.z, b.r);
      if (bt >= 0) {
        _bp.x = b.px + (_bp.x - b.px) * bt;
        _bp.z = b.pz + (_bp.z - b.pz) * bt;
      }
      let hit: PlayerEnt | null = null;
      let best = Infinity;
      for (const p of this.players.values()) {
        if (this.isDead(p)) continue;
        if (!boltHits(b.px, b.pz, _bp.x, _bp.z, b.r, b.lift, p.move.x, p.move.y, p.move.z)) continue;
        // Nhiều người trên đường bay: trúng người gần điểm xuất phát tick này nhất.
        const dd = (p.move.x - b.px) ** 2 + (p.move.z - b.pz) ** 2;
        if (dd < best) {
          best = dd;
          hit = p;
        }
      }
      if (hit) {
        this.endBolt(i, hit.move.x, hit.move.z, hit.sid);
        const n = computeDamage(b.atk, b.mul, hit.char.def, Math.random(), 1).dmg;
        // Chung cửa sổ miễn với vùng nổ của quái: nhiều quái bắn trúng cùng lúc chỉ tính đòn mạnh nhất
        // (giữ cân bằng cũ khi đổi Kiếm Linh từ vùng chữ nhật sang đạn).
        const r = hazardHit(Math.max(1, Math.round(n)), hit.hazardWin.until, hit.hazardWin.taken, this.now);
        hit.hazardWin.until = r.until;
        hit.hazardWin.taken = r.taken;
        if (r.dmg <= 0) this.emit(S.DMG, { dst: hit.sid, n: 0, src: m.id } satisfies DmgMsg);
        else this.damagePlayer(hit, r.dmg, m.id, true);
        continue;
      }
      if (bt >= 0) {
        this.endBolt(i, _bp.x, _bp.z);
        continue;
      }
      b.px = _bp.x;
      b.pz = _bp.z;
      // Hết hạn: client tự tắt theo `life`, không cần gửi tin.
      if (this.now >= b.endAt) this.bolts.splice(i, 1);
    }
  }

  // ---------- độ kiếp ----------

  onBreakthrough(p: PlayerEnt): void {
    const c = p.char;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.busy');
    if (this.isDead(p) || p.trib || this.opts.levelId !== 'van_lam') return this.warn(p, 'sys.trib_not_now');
    if (c.level !== NGUNG_KHI_MAX) return this.warn(p, c.level > NGUNG_KHI_MAX ? 'sys.max_level' : 'sys.trib_need_xp');
    if (c.xp < xpNeed(c.level)) return this.warn(p, 'sys.trib_need_xp');
    // Bình cảnh tầng 15 phải vượt (tâm ma hoặc Phá Cảnh Đan) trước khi độ kiếp.
    if (c.bk < NGUNG_KHI_MAX) return this.warn(p, 'sys.bk_blocked');
    if (!c.tx('tribulation', null, (d) => d.remove(TRUC_CO_PILL, 1))) return this.warn(p, 'sys.trib_need_pill');
    if (p.meditating) this.setMeditating(p, false);
    p.trib = { endAt: this.now + TRIBULATION_DURATION * 1000, nextAt: this.now + TRIB_FIRST_DELAY * 1000, n: 0 };
    this.setFlag(p, PF_TRIBULATION, true);
    this.sysAll('sys.trib_start', { name: c.name }, 'info');
    this.fx({ t: 'tribstart', src: p.sid, d: TRIBULATION_DURATION, sd: visualSeed() });
  }

  // ---------- bình cảnh, linh căn (P3-7; phần luật ở game/realm.ts) ----------

  onBottleneck(p: PlayerEnt, msg: unknown): void {
    this.realm.onBottleneck(p, msg);
  }

  onChangeRoot(p: PlayerEnt, msg: unknown): void {
    this.realm.onChangeRoot(p, msg);
  }

  /** Bóng tâm ma của `p`: quái riêng, đứng trước mặt người chơi, đuổi đúng người đó. */
  private spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }): MonEnt | null {
    const def = MONSTER.get('mon_tam_ma');
    if (!def) return null;
    const x = p.move.x + Math.sin(p.s.yaw) * 7;
    const z = p.move.z + Math.cos(p.s.yaw) * 7;
    const m = this.spawnMonster(def, p.char.level, x, z, null);
    m.owner = p.sid;
    m.atk = st.atk;
    m.defn = st.def;
    m.s.mhp = st.hp;
    m.s.hp = st.hp;
    m.target = p.sid;
    this.setMonState(m, MS_CHASE);
    return m;
  }

  private tickTribulation(p: PlayerEnt): void {
    const tr = p.trib!;
    if (this.now >= tr.endAt) {
      this.endTribulation(p, true, false);
      return;
    }
    if (this.now < tr.nextAt) return;
    tr.n++;
    const progress = 1 - (tr.endAt - this.now) / (TRIBULATION_DURATION * 1000);
    tr.nextAt = this.now + (TRIB_GAP_START - progress * (TRIB_GAP_START - TRIB_GAP_END)) * 1000;
    // Một tia nhắm thẳng vào người độ kiếp, vài tia rơi quanh.
    this.addHazard({ x: p.move.x, z: p.move.z, r: TRIB_AIM.r }, TRIB_AIM.delay, TRIB_AIM.pct, true, 'lightning', p.sid);
    const extra = Math.min(TRIB_EXTRA.maxCount, 1 + Math.floor(progress * 3));
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = TRIB_EXTRA.distMin + Math.random() * (TRIB_EXTRA.distMax - TRIB_EXTRA.distMin);
      this.addHazard({ x: p.move.x + Math.cos(a) * r, z: p.move.z + Math.sin(a) * r, r: TRIB_EXTRA.r }, TRIB_EXTRA.delayMin + Math.random() * (TRIB_EXTRA.delayMax - TRIB_EXTRA.delayMin), TRIB_EXTRA.pct, true, 'lightning', p.sid);
    }
  }

  private endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void {
    const c = p.char;
    const elapsed = p.trib ? TRIBULATION_DURATION - (p.trib.endAt - this.now) / 1000 : 0;
    p.trib = null;
    this.setFlag(p, PF_TRIBULATION, false);
    if (success) {
      c.level = TRUC_CO_LEVEL;
      c.xp = 0;
      c.recalc();
      c.hp = c.mhp;
      c.mp = c.mmp;
      this.sysAll('sys.trib_ok', { name: c.name }, 'good');
      this.fx({ t: 'ascend', src: p.sid });
      this.questEvent(p, 'breakthrough', undefined, 1);
      this.questEvent(p, 'level', undefined, c.level);
      this.savePlayer(p);
      console.log(`[trib] ${c.name} đạt Trúc Cơ`);
    } else {
      const lost = c.loseXp(TRIBULATION_FAIL_XP_LOSS);
      if (!silent) this.sys(p, lost > 0 ? 'sys.trib_fail' : 'sys.trib_fail_free', { n: lost }, 'bad');
      // Trụ qua nửa đầu: hoàn Trúc Cơ Đan (chỉ khi chết trong lôi kiếp, không hoàn khi thoát game giữa chừng).
      if (!silent && elapsed >= TRIBULATION_REFUND_AFTER && c.tx('tribulation:refund', null, (d) => d.add(TRUC_CO_PILL, 1))) this.sys(p, 'sys.trib_refund', undefined, 'info');
    }
  }

  // ---------- đả tọa, hái thuốc ----------

  private setMeditating(p: PlayerEnt, on: boolean): void {
    p.meditating = on;
    this.setFlag(p, PF_MEDITATING, on);
  }

  onMeditate(p: PlayerEnt, msg: unknown): void {
    const on = !!(msg as { on?: unknown } | null)?.on;
    if (!on) return this.setMeditating(p, false);
    if (this.isDead(p) || p.move.flying || !p.move.grounded || p.casting || p.trib) return this.warn(p, 'sys.busy');
    if (this.now - p.lastCombatAt < 5000) return this.warn(p, 'sys.busy');
    this.setMeditating(p, true);
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
    if (isEquipSlot(def.kind)) return this.onEquip(p, { slot, r: m.r });
    if (!def.use) return;
    if (this.duel.inDuel(p)) return this.warn(p, 'duel.no_items');
    if (this.now < p.itemCdAt) return this.warn(p, 'sys.item_cd');
    let taken = null as InvItem | null;
    if (!c.tx('use:' + def.id, idem, (d) => !!(taken = d.removeAt(slot, 1)))) return;
    p.itemCdAt = this.now + def.use.cd * 1000;
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
    if (!it || !def || !isEquipSlot(def.kind)) return;
    if ((def.reqLevel ?? 1) > c.level) return this.warn(p, 'sys.equip_level');
    const es = def.kind as EquipSlot;
    // Đổi đồ không sinh/mất vật phẩm nên ledger ghi một dòng 'noop' có khóa idem và lý do (món vào/ra) để truy vết.
    const prev0 = c.equip[es];
    const ok = c.tx(`equip:${es}:${it.id}${prev0 ? '<-' + prev0.id : ''}`, idem, (d) => {
      const prev = d.equip[es];
      const cur = d.inv[slot as number];
      // Bản nháp là bản sao của túi hiện tại; kiểm lại để món ở ô đó không đổi giữa lúc đọc và lúc ghi.
      if (!cur || cur.id !== it.id) return false;
      const next: InvItem = { ...cur };
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
    if (!isEquipSlot(es) || this.isDead(p)) return;
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
      if (sb && def && sb.id === sa.id && (sb.plus ?? 0) === (sa.plus ?? 0) && def.stack > 1) {
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
    if (it.inst?.bound) return this.warn(p, 'sys.item_bound');
    const gold = sellPrice(it, def) * n;
    const ok = p.char.tx('sell:' + def.id, idem, (d) => {
      if (!d.removeAt(slot, n)) return false;
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
        // Đã độ kiếp trước khi nhận nhiệm vụ thì tính là xong, không thì kẹt vĩnh viễn.
        if (o.type === 'breakthrough' && c.level >= TRUC_CO_LEVEL) return o.count;
        return 0;
      });
      c.questDirty = true;
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
    if (p.dev && (text as string).startsWith('/gm ')) return this.gm(p, (text as string).slice(4).trim().split(/\s+/));
    this.host.broadcast(S.CHAT, { from: p.char.name, c: 'say', m: text });
  }

  /** Id địa điểm thuộc level của room này. */
  placeIds(): string[] {
    return PLACES.filter((pl) => pl.level === this.opts.levelId).map((pl) => pl.id);
  }

  /** Dịch chuyển tức thì (chỉ gọi từ lệnh GM / tham số kiểm thử). Điểm không thuộc level của room thì từ chối. */
  teleportTo(p: PlayerEnt, x: number, z: number, level = this.opts.levelId): boolean {
    if (level !== this.opts.levelId || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    p.move = { x, y: groundAt(x, z), z, vy: 0, grounded: true, flying: false };
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
      this.gmSetLevel(p, f.realm);
      this.sys(p, 'sys.gm', { m: 'level = ' + p.char.level }, 'info');
    }
    if (f.god) {
      p.god = true;
      this.heal(p);
      this.sys(p, 'sys.gm', { m: 'god on' }, 'info');
    }
    if (f.at && this.teleportTo(p, f.at.x, f.at.z, f.at.level)) this.sys(p, 'sys.gm', { m: `at ${f.at.id}` }, 'info');
    else if (!f.at && f.pos && this.teleportTo(p, f.pos.x, f.pos.z)) this.sys(p, 'sys.gm', { m: `at ${Math.round(f.pos.x)},${Math.round(f.pos.z)}` }, 'info');
    if (f.trib) this.sys(p, 'sys.gm', { m: this.gmTribulation(p) }, 'info');
  }

  /** Đặt cấp cho tài khoản thử (`/gm level`, `/gm realm`, `?realm=`): bình cảnh các mốc thấp hơn coi như đã vượt, hồi đầy. */
  private gmSetLevel(p: PlayerEnt, level: number): void {
    const c = p.char;
    const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    c.level = lv;
    c.bk = initialBottleneck(lv);
    c.xp = 0;
    c.recalc();
    c.hp = c.mhp;
    c.mp = c.mmp;
    this.questEvent(p, 'level', undefined, lv);
  }

  /**
   * Kích độ kiếp ngay cho tài khoản thử (`/gm trib`, `?tribulation=1`): đưa về Ngưng Khí tầng 15 viên mãn đã vượt bình cảnh,
   * cấp một viên Trúc Cơ Đan nếu thiếu (qua tx + sổ cái), rồi đi đúng đường `onBreakthrough` như người chơi thật.
   * Trả dòng báo cho người gọi.
   */
  private gmTribulation(p: PlayerEnt): string {
    const c = p.char;
    if (this.opts.levelId !== 'van_lam' || this.isDead(p) || p.trib || p.trial || this.duel.inDuel(p)) return 'trib: không độ kiếp được lúc này';
    if (c.level !== NGUNG_KHI_MAX) this.gmSetLevel(p, NGUNG_KHI_MAX);
    c.bk = NGUNG_KHI_MAX;
    c.xp = xpNeed(NGUNG_KHI_MAX);
    if (!c.inv.some((it) => it?.id === TRUC_CO_PILL) && !c.tx('gm', null, (d) => d.add(TRUC_CO_PILL, 1))) return 'trib: túi đầy, không thêm được Trúc Cơ Đan';
    this.onBreakthrough(p);
    return p.trib ? 'trib: bắt đầu độ kiếp' : 'trib: không bắt đầu được';
  }

  /** Lệnh GM, chỉ dành cho tài khoản dev khi AUTH_DEV_BYPASS bật. */
  private gm(p: PlayerEnt, a: string[]): void {
    const c = p.char;
    const say = (m: string) => this.sys(p, 'sys.gm', { m }, 'info');
    switch (a[0]) {
      case 'level':
      case 'realm': {
        // `level N` hoặc `realm nk1…nk15 | tc | tc1…tc3`: cùng một đường đặt cấp.
        const lv = a[0] === 'realm' ? parseRealmCode(a[1] ?? '') : Math.max(1, Math.min(MAX_LEVEL, Number(a[1]) | 0));
        if (lv === null) return say('realm nk1…nk15 | tc | tc1…tc3');
        this.gmSetLevel(p, lv);
        return say('level = ' + c.level);
      }
      case 'trib':
        // /gm trib: kích độ kiếp Trúc Cơ ngay (đặt Ngưng Khí 15 viên mãn + Trúc Cơ Đan nếu thiếu).
        return say(this.gmTribulation(p));
      case 'xp':
        this.giveXp(p, Math.max(0, Number(a[1]) | 0));
        return;
      case 'gold':
        c.tx('gm', null, (d) => (d.addGold(Math.max(1, Number(a[1]) | 0)), true));
        return say('gold = ' + c.gold);
      case 'roll': {
        // /gm roll <mẫu trang bị> [phẩm 0-4] [ilvl]: roll một món (kiểm thử hệ trang bị 8 ô).
        const q = Math.min(QUALITY_COUNT - 1, Math.max(0, Number(a[2] ?? 0) | 0));
        const il = Math.max(1, Number(a[3] ?? c.level) | 0);
        const ok = c.tx('gm', null, (d) => d.addRolled(a[1], il, q as Quality));
        return say(ok ? `đã roll ${a[1]} phẩm ${q} ilvl ${il}` : 'roll <mẫu trang bị> [phẩm 0-4] [ilvl]');
      }
      case 'plus': {
        // Đặt cấp cường hóa của món đang mặc ở ô `a[2]` (mặc định pháp kiếm) để thử VFX +7/+10 và rớt cấp.
        const slot = isEquipSlot(a[2]) ? a[2] : 'weapon';
        const n = Math.max(0, Math.min(MAX_ENHANCE, Number(a[1]) | 0));
        const ok = c.tx('gm:plus', null, (d) => {
          const w = d.equip[slot];
          if (!w) return false;
          d.equip[slot] = n > 0 ? { ...w, plus: n } : { ...w, plus: undefined };
          if (n === 0) delete d.equip[slot]!.plus;
          return true;
        });
        if (ok) c.recalc();
        return say(ok ? `${slot} +${n}` : 'plus <0-10> [ô]: ô chưa mặc đồ');
      }
      case 'art': {
        // /gm art <id pháp bảo> [cấp 1-5]: có và đeo luôn (không cần chế); `art off` cất vào túi. Chỉ để thử.
        if (a[1] === 'off') {
          const ok = c.tx('gm:art', null, (d) => {
            const it = d.equip.artifact;
            if (!it) return true;
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = it;
            delete d.equip.artifact;
            return true;
          });
          if (ok) c.recalc();
          return say(ok ? 'đã cất pháp bảo' : 'túi đầy');
        }
        if (!ARTIFACT.has(a[1])) return say('art ' + [...ARTIFACT.keys()].join(' | ') + ' | off');
        const ok = c.tx('gm:art', null, (d) => {
          const prev = d.equip.artifact;
          if (prev) {
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = prev;
          }
          d.equip.artifact = { id: a[1], n: 1 };
          d.bump(a[1], 1);
          return true;
        });
        if (!ok) return say('không đeo được');
        const lv = Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, Number(a[2] ?? 1) | 0));
        c.meta.art ??= {};
        c.meta.art[a[1]] = { lv, qi: 0 };
        c.recalc();
        p.mth.dirty = true;
        return say('art = ' + a[1] + ' cấp ' + lv);
      }
      case 'give': {
        const ok = c.tx('gm', null, (d) => d.add(a[1], Math.max(1, Number(a[2] ?? 1) | 0)));
        return say(ok ? 'đã thêm ' + a[1] : 'không thêm được');
      }
      case 'set': {
        // `set <id bộ> [số món]`: roll rồi mặc luôn các món của bộ (Địa phẩm) để thử hiệu ứng 2/4 món và màu áo; `set off` cởi hết.
        if (a[1] === 'off') {
          // Cất đồ vào túi (không xóa) để sổ cái vẫn khớp.
          const ok = c.tx('gm:set', null, (d) => {
            for (const k of EQUIP_SLOTS) {
              const it = d.equip[k];
              if (!it) continue;
              const i = d.inv.findIndex((x) => !x);
              if (i < 0) return false;
              d.inv[i] = it;
              delete d.equip[k];
            }
            return true;
          });
          if (ok) c.recalc();
          return say(ok ? 'đã cởi hết' : 'túi đầy');
        }
        const st = SET.get(a[1] ?? '');
        if (!st) return say('set off | ' + SETS.map((x) => x.id).join(' | ') + ' [số món]');
        const n = Math.max(1, Math.min(st.pieces.length, Number(a[2] ?? st.pieces.length) | 0));
        const ok = c.tx('gm:set', null, (d) => {
          for (const pid of st.pieces.slice(0, n)) {
            if (!d.addRolled(pid, c.level, 3)) return false;
            const i = d.inv.findIndex((s) => s?.id === pid && s.inst);
            const slot = ITEM.get(pid)!.kind as EquipSlot;
            const old = d.equip[slot];
            d.equip[slot] = d.inv[i]!;
            d.inv[i] = old ?? null;
          }
          return true;
        });
        if (ok) c.recalc();
        return say(ok ? `mặc ${n}/${st.pieces.length} món ${st.id}` : 'túi đầy');
      }
      case 'tp': {
        // `tp x z` hoặc `tp <địa điểm>` (bảng packages/content/data/places.json, cùng bảng với ?at=).
        if (a.length === 2) {
          const pl = PLACE.get(a[1]);
          if (!pl) return say('tp ' + this.placeIds().join(' | '));
          if (!this.teleportTo(p, pl.x, pl.z, pl.level)) return say(`${pl.id} thuộc ${pl.level}, không ở room này`);
          return say(`tp ${pl.id} (${pl.x}, ${pl.z})`);
        }
        const x = Number(a[1]);
        const z = Number(a[2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return say('tp x z | tp <địa điểm>');
        this.teleportTo(p, x, z);
        return say(`tp ${x} ${z}`);
      }
      case 'tele':
        return say(this.tele.gm(p, a[1]));
      case 'god': {
        p.god = a[1] === 'off' ? false : a[1] === 'on' ? true : !p.god;
        if (p.god) this.heal(p);
        return say('god ' + (p.god ? 'on' : 'off'));
      }
      case 'heal':
        c.hp = c.mhp;
        c.mp = c.mmp;
        return say('đã hồi đầy');
      case 'charge': {
        // /gm charge [0-100]: đặt vòng sạc chiêu tối thượng (mặc định đầy).
        p.mth.charge = Math.max(0, Math.min(CHARGE_MAX, a[1] === undefined ? CHARGE_MAX : Number(a[1]) | 0));
        p.mth.dirty = true;
        return say('sạc = ' + p.mth.charge);
      }
      case 'cd':
        // /gm cd: xóa hồi chiêu và GCD (chụp ảnh nhiều chiêu liên tiếp).
        p.cds.clear();
        p.gcdAt = 0;
        this.sendCd(p);
        return say('đã xóa hồi chiêu');
      case 'variant': {
        // /gm variant <id chiêu> <a|b>: chọn biến thức ngay (không cần cấp 3, ngoài combat, hồi chờ) để chụp ảnh/thử.
        const sk = SKILL.get(a[1]);
        if (!sk || !VARIANTS[sk.id] || (a[2] !== 'a' && a[2] !== 'b')) return say('variant <skill> a|b — skill: ' + Object.keys(VARIANTS).join(' | '));
        if (skillLevelOf(c.meta, sk.id) < VARIANT_MIN_LEVEL) setSkillLevel(c.meta, sk.id, VARIANT_MIN_LEVEL);
        c.meta.skillVar ??= {};
        c.meta.skillVar[sk.id] = a[2];
        p.mth.dirty = true;
        return say('variant ' + sk.id + ' = ' + a[2]);
      }
      case 'method': {
        // /gm method <id> [cấp chiêu]: chọn công pháp ngay (không cần tầng/NPC/linh thạch); cấp chiêu áp cho mọi chiêu mở.
        if (!METHOD.has(a[1])) return say('method ' + [...METHOD.keys()].join(' | '));
        c.meta.method = a[1];
        const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, Number(a[2] ?? 1) | 0));
        for (const sk of SKILL.values()) if (!sk.method || sk.method === a[1]) setSkillLevel(c.meta, sk.id, lv);
        p.mth.reset();
        c.recalc();
        return say('method = ' + a[1] + ' cấp chiêu ' + lv);
      }

      case 'dye': {
        // Thử đổi màu áo lúc đang chơi (người khác thấy qua schema); vẫn kiểm như lúc tạo nhân vật.
        const ap = parseAppearance(APPEARANCE, { g: c.appearance.g, dye: a[1] });
        if (!ap) return say('dye ' + APPEARANCE.dyes.map((d) => d.id).join(' | '));
        c.setAppearance(ap);
        p.s.g = ap.g;
        p.s.dye = ap.dye;
        return say('dye = ' + ap.dye);
      }
      case 'die': {
        const god = p.god;
        p.god = false;
        this.damagePlayer(p, 999999, '');
        p.god = god;
        return;
      }
      case 'killall': {
        let n = 0;
        for (const m of this.monsters) {
          if (m.state !== MS_DEAD && Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) < 40) {
            this.damageMonster(m, m.s.hp, p);
            n++;
          }
        }
        return say('hạ ' + n + ' quái');
      }
      case 'hurt': {
        // Thử pha boss: hạ máu quái quanh mình về `pct`% (qua damageMonster nên pha/phá thế chạy như thật).
        const pct = Math.max(1, Math.min(100, Number(a[1]) | 0 || 50));
        let n = 0;
        for (const m of this.monsters) {
          if (m.state === MS_DEAD || Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) >= 40) continue;
          const want = Math.ceil((m.s.mhp * pct) / 100);
          if (m.s.hp > want) {
            this.damageMonster(m, m.s.hp - want, p);
            n++;
          }
        }
        return say('hạ máu ' + n + ' quái về ' + pct + '%');
      }
      case 'spawn': {
        // Gọi quái thử ngay cạnh mình (không hồi sinh, tự dọn sau khi chết).
        const def = MONSTER.get(a[1] ?? '');
        if (!def) return say('không có quái ' + (a[1] ?? ''));
        const n = Math.max(1, Math.min(6, Math.floor(Number(a[2]) || 1)));
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          this.spawnMonster(def, Math.max(1, p.char.level - 1), p.move.x + Math.sin(ang) * 10, p.move.z + Math.cos(ang) * 10, null);
        }
        return say(`gọi ${n} ${def.id}`);
      }
      case 'tick':
        return say(`tick p95 ${this.tickP95().toFixed(2)}ms, ${this.players.size} người, ${this.monsters.length} quái`);
      default:
        return say('level N | realm nk1…tc3 | trib | xp N | gold N | give id n | tp x z | tp <địa điểm> | god [on|off] | heal | die | killall | hurt pct | spawn id [n] | tick | dye id | cd | variant skill a|b | method id [cấp] | set id [n]');
    }
  }
}

export const DEFAULT_SPAWN = SPAWN_POINT;
