import { randomInt } from 'node:crypto';
import type { Client } from 'colyseus';
import {
  BOLT_MAX_LIFE,
  BOLT_MAX_LIVE,
  boltBlockedAt,
  boltLift,
  type BoltEndMsg,
  boltHits,
  type BoltMsg,
  boltXZ,
  boltYaws,
  bossPhaseAt,
  fxSeed,
  type CdMsg,
  chantInterrupt,
  CHAT_MAX_LEN,
  COMBAT_REGEN_DELAY,
  computeDamage,
  DEATH_XP_LOSS,
  type DmgMsg,
  enhanceChance,
  enhanceCost,
  type EquipSlot,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  GCD,
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
  MAX_ENHANCE,
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
  TRIBULATION_FAIL_XP_LOSS,
  TRUC_CO_LEVEL,
  vulnerableDamage,
  WATER_Y,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { ENHANCE_ORE, ITEM, itemName, LEVELS, MONSTER, monsterName, NPC, QUEST, realmName, RECIPE, SKILL, t, TRUC_CO_PILL } from '@dtl/content';
import { lootOf } from '@dtl/content/loot';
import { MonS, NodeS, PlayerS, type WorldState } from '../state';
import { type Character, isEquipSlot } from './character';

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
  dev: boolean;
  move: MoveState;
  inputs: MoveInput[];
  budget: number;
  lastInputAt: number;
  lastYaw: number;
  lastFlags: number;
  gcdAt: number;
  cds: Map<string, number>;
  itemCdAt: number;
  casting: { skill: SkillDef; target: string; endAt: number } | null;
  shield: { amount: number; until: number } | null;
  lastCombatAt: number;
  /** Cửa sổ miễn vùng nổ của quái: hết lúc `until` (ms), đã nhận `taken` (xem hazardHit). */
  hazardWin: { until: number; taken: number };
  meditating: boolean;
  xpAcc: number;
  trib: { endAt: number; nextAt: number; n: number } | null;
  warnAt: number;
  chatAt: number;
  msgWindowAt: number;
  msgCount: number;
  /** Cửa sổ 1 giây đếm lệnh dùng skill (chống spam, riêng với giới hạn message chung). */
  skillWindowAt: number;
  skillCount: number;
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
  /** Chỉ đánh người chơi này (thiên kiếp không hại người ngoài)… trừ khi họ đứng trong vòng. */
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

export class GameSim {
  now = Date.now();
  players = new Map<string, PlayerEnt>();
  monsters: MonEnt[] = [];
  monById = new Map<string, MonEnt>();
  nodes = new Map<string, NodeEnt>();
  hazards: Hazard[] = [];
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

  constructor(
    public state: WorldState,
    public host: SimHost,
    public opts: SimOptions,
  ) {
    this.level = LEVELS[opts.levelId];
    state.level = opts.levelId;
    for (const sp of this.level.spawns) {
      for (let i = 0; i < sp.count; i++) this.spawnFromDef(sp);
    }
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

  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string, drop?: Pick<SysMsg, 'i' | 'src'>): void {
    const m: SysMsg = { k };
    if (params) m.p = params;
    if (type) m.t = type;
    // Đồ rơi (M4-6): chỉ là thứ đã vào túi (sau transaction), để client vẽ đồ nảy ra từ xác quái.
    if (drop?.i) m.i = drop.i;
    if (drop?.src) m.src = drop.src;
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

  fx(m: FxMsg): void {
    this.host.broadcast(S.FX, m);
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
      move: { x, y, z, vy: 0, grounded: true, flying: false },
      inputs: [],
      budget: 0,
      lastInputAt: this.now,
      lastYaw: 0,
      lastFlags: 0,
      gcdAt: 0,
      cds: new Map(),
      itemCdAt: 0,
      casting: null,
      shield: null,
      lastCombatAt: 0,
      hazardWin: { until: 0, taken: 0 },
      meditating: false,
      xpAcc: 0,
      trib: null,
      warnAt: 0,
      chatAt: 0,
      msgWindowAt: this.now,
      msgCount: 0,
      skillWindowAt: this.now,
      skillCount: 0,
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
    const ups = c.gainXp(n);
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
    if (this.airborne(p)) return this.warn(p, 'sys.cannot_while_flying');
    if (p.casting) return;
    if (this.now < p.gcdAt - 60) return;
    if ((p.cds.get(skill.id) ?? 0) > this.now) return this.warn(p, 'sys.cooldown');
    if (c.mp < skill.mp) return this.warn(p, 'sys.not_enough_mp');
    let targetId = '';
    if (skill.kind === 'damage' || skill.kind === 'aoe') {
      if (typeof m.t !== 'string') return this.warn(p, 'sys.no_target');
      const mon = this.monById.get(m.t);
      if (!mon || mon.state === MS_DEAD) return this.warn(p, 'sys.no_target');
      if (!this.inRange(p, mon, skill.range)) return this.warn(p, 'sys.out_of_range');
      targetId = mon.id;
      p.s.yaw = Math.atan2(mon.s.x - p.move.x, mon.s.z - p.move.z);
    }
    if (p.meditating) this.setMeditating(p, false);
    p.gcdAt = this.now + GCD * 1000;
    if (skill.cast > 0) {
      p.casting = { skill, target: targetId, endAt: this.now + skill.cast * 1000 };
      this.setFlag(p, PF_CASTING, true);
      this.fx({ t: 'cast', src: p.sid, dst: targetId, d: skill.cast, s: skill.id });
      this.sendCd(p);
      return;
    }
    this.executeSkill(p, skill, targetId);
  }

  /** Đang ngự kiếm hoặc lơ lửng cao hơn mặt đất (vừa tắt ngự kiếm, đang rơi): không được ra chiêu. */
  private airborne(p: PlayerEnt): boolean {
    return p.move.flying || p.move.y - groundAt(p.move.x, p.move.z) > 2.5;
  }

  private inRange(p: PlayerEnt, mon: MonEnt, range: number): boolean {
    const dx = mon.s.x - p.move.x;
    const dz = mon.s.z - p.move.z;
    const dy = mon.s.y - p.move.y;
    const r = range + 1.5 + mon.def.scale;
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
    if (this.airborne(p) || (cast.target && (!mon || mon.state === MS_DEAD || !this.inRange(p, mon, cast.skill.range * 1.3)))) {
      this.fx({ t: 'castend', src: p.sid });
      return;
    }
    if (p.char.mp < cast.skill.mp) return;
    this.executeSkill(p, cast.skill, cast.target);
  }

  private executeSkill(p: PlayerEnt, skill: SkillDef, targetId: string): void {
    const c = p.char;
    c.mp -= skill.mp;
    if (skill.cd > 0) p.cds.set(skill.id, this.now + skill.cd * 1000);
    p.lastCombatAt = this.now;
    switch (skill.kind) {
      case 'damage': {
        const mon = this.monById.get(targetId);
        if (!mon) break;
        this.fx(skill.fx === 'thunder' ? { t: skill.fx, src: p.sid, dst: mon.id, sd: visualSeed() } : { t: skill.fx, src: p.sid, dst: mon.id });
        // Đánh trước rồi mới phá chú: phần cộng sát thương khi choáng chỉ áp cho các đòn sau.
        this.hitMonster(p, mon, skill.power);
        if (skill.interrupt) this.tryInterrupt(p, mon);
        break;
      }
      case 'aoe': {
        const mon = this.monById.get(targetId);
        if (!mon) break;
        const r = skill.radius ?? 8;
        const cx = mon.s.x;
        const cz = mon.s.z;
        this.fx({ t: skill.fx, src: p.sid, dst: mon.id, x: cx, y: mon.s.y, z: cz, r, sd: visualSeed() });
        for (const o of this.monsters) {
          if (o.state === MS_DEAD) continue;
          const dx = o.s.x - cx;
          const dz = o.s.z - cz;
          if (dx * dx + dz * dz <= r * r) this.hitMonster(p, o, skill.power);
        }
        break;
      }
      case 'heal': {
        const n = Math.round(c.mhp * skill.power);
        c.hp = Math.min(c.mhp, c.hp + n);
        this.fx({ t: skill.fx, src: p.sid });
        this.host.broadcast(S.DMG, { dst: p.sid, n, heal: true } satisfies DmgMsg);
        break;
      }
      case 'shield': {
        p.shield = { amount: Math.round(c.mhp * skill.power), until: this.now + (skill.duration ?? 8) * 1000 };
        this.setFlag(p, PF_SHIELD, true);
        this.fx({ t: skill.fx, src: p.sid, d: skill.duration ?? 8 });
        break;
      }
    }
    this.sendCd(p);
  }

  private hitMonster(p: PlayerEnt, mon: MonEnt, power: number): void {
    const { dmg, crit } = computeDamage(p.char.atk, power, mon.defn, Math.random(), Math.random());
    const stunned = this.now < mon.stunUntil;
    const heavy = isHeavyHit(power);
    // `hv` (lớp hình) tính cả lúc choáng; phá thế chỉ cộng phần đòn nặng cho chiêu hệ số cao thật.
    this.damageMonster(mon, vulnerableDamage(dmg, stunned), p, crit, stunned || heavy, heavy);
  }

  /** Chiêu ngắt trúng boss: phá chú nếu đúng cửa sổ. Mục tiêu, tầm, GCD, hồi chiêu đã kiểm ở onSkill. */
  private tryInterrupt(p: PlayerEnt, mon: MonEnt): void {
    const ch = mon.rules.ai.chant;
    if (!ch || !mon.chant || mon.state === MS_DEAD || this.now < mon.evadeUntil) return;
    const r = chantInterrupt(mon.chant.startAt, mon.chant.endAt, ch.open, this.now);
    if (r === 'guarded') return this.sys(p, 'sys.chant_guarded', { boss: monsterName(mon.def.id) }, 'bad');
    if (r !== 'ok') return;
    mon.chant = null;
    mon.chantAt = this.now + ch.cd * 1000;
    mon.stunUntil = this.now + ch.stun * 1000;
    mon.comboAt = 0;
    mon.comboTarget = '';
    this.setMonFlags(mon, MF_STUN, mon.stunUntil);
    this.fx({ t: 'interrupt', src: p.sid, dst: mon.id, d: ch.stun });
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

  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null, crit = false, hv = false, heavy = hv): void {
    if (mon.state === MS_DEAD) return;
    if (this.now < mon.evadeUntil) {
      this.host.broadcast(S.DMG, { dst: mon.id, n: 0 } satisfies DmgMsg);
      return;
    }
    const hp = Math.max(0, mon.s.hp - dmg);
    mon.s.hp = hp;
    const msg: DmgMsg = { dst: mon.id, n: dmg };
    if (crit) msg.crit = true;
    if (hv) msg.hv = true;
    if (p) msg.src = p.sid;
    this.host.broadcast(S.DMG, msg);
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
      if (ps && p) this.addPosture(mon, postureGain(ps, dmg, mon.s.mhp, heavy));
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
    mon.state = MS_DEAD;
    mon.s.st = MS_DEAD;
    mon.target = '';
    this.resetAi(mon);
    if (mon.spawn) mon.respawnAt = this.now + mon.spawn.respawn * 1000;
    else mon.removeAt = this.now + 4000;
    const xp = monsterXp(mon.level, mon.def.xpMul);
    const minShare = mon.s.mhp * 0.05;
    for (const [sid, dealt] of mon.threat) {
      const p = this.players.get(sid);
      if (!p || dealt < minShare) continue;
      if (Math.hypot(p.move.x - mon.s.x, p.move.z - mon.s.z) > 90) continue;
      if (!this.isDead(p)) this.giveXp(p, Math.max(1, Math.round(xp * xpLevelFactor(p.char.level, mon.level) * (p.noLoot ? 0.3 : 1))));
      this.rollLoot(p, mon);
      this.questEvent(p, 'kill', mon.def.id, 1);
    }
    mon.threat.clear();
    if (mon.def.boss) {
      this.sysAll('sys.boss_dead', { boss: monsterName(mon.def.id) }, 'good');
      // Boss gục: client hiện câu cuối (nếu có) cho người đứng gần.
      this.fx({ t: 'bfall', src: mon.id });
    }
    this.host.onMonsterKilled?.(mon);
  }

  private rollLoot(p: PlayerEnt, mon: MonEnt): void {
    if (p.noLoot) return;
    const loot = lootOf(mon.def.id);
    const [g0, g1] = loot.gold;
    const gold = g0 + Math.floor(Math.random() * (g1 - g0 + 1));
    const got: { id: string; n: number }[] = [];
    for (const d of loot.drops) {
      if (Math.random() < d.chance) got.push({ id: d.item, n: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
    }
    // Vàng luôn vào túi; vật phẩm nào không còn chỗ thì bỏ.
    const kept: { id: string; n: number }[] = [];
    let full = false;
    p.char.tx('loot:' + mon.def.id, null, (d) => {
      d.addGold(gold);
      for (const g of got) {
        const def = ITEM.get(g.id)!;
        // Kiểm tra trước để một món không vừa không làm hỏng cả bản nháp.
        const room = d.freeSlots() * def.stack + (def.stack > 1 ? d.inv.reduce((s, x) => s + (x && x.id === g.id ? def.stack - x.n : 0), 0) : 0);
        if (room >= g.n && d.add(g.id, g.n)) kept.push(g);
        else full = true;
      }
      return true;
    });
    if (gold > 0) this.sys(p, 'sys.gold', { n: gold }, 'loot', { src: mon.id });
    for (const g of kept) this.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot', { i: g.id, src: mon.id });
    if (full) this.warn(p, 'sys.inv_full');
  }

  damagePlayer(p: PlayerEnt, dmg: number, src: string, hv = false): void {
    if (this.isDead(p)) return;
    const c = p.char;
    let n = Math.max(1, Math.round(dmg));
    if (p.shield) {
      const absorbed = Math.min(p.shield.amount, n);
      p.shield.amount -= absorbed;
      n -= absorbed;
      if (p.shield.amount <= 0) {
        p.shield = null;
        this.setFlag(p, PF_SHIELD, false);
      }
    }
    p.lastCombatAt = this.now;
    if (p.meditating) this.setMeditating(p, false);
    if (n <= 0) {
      this.host.broadcast(S.DMG, { dst: p.sid, n: 0, src } satisfies DmgMsg);
      return;
    }
    c.hp -= n;
    const msg: DmgMsg = { dst: p.sid, n, src };
    if (hv) msg.hv = true;
    this.host.broadcast(S.DMG, msg);
    if (c.hp <= 0) this.killPlayer(p);
  }

  private killPlayer(p: PlayerEnt): void {
    const c = p.char;
    c.hp = 0;
    p.casting = null;
    p.shield = null;
    p.meditating = false;
    p.s.fl = PF_DEAD;
    if (p.trib) {
      this.endTribulation(p, false, false);
    } else {
      const lost = c.loseXp(DEATH_XP_LOSS);
      this.sys(p, 'sys.died', { n: lost }, 'bad');
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

  private respawnMonster(m: MonEnt): void {
    const sp = m.spawn!;
    const pos = this.randomPoint(sp.x, sp.z, sp.radius, !!m.def.boss);
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
    const step = Math.min(d, speed * dt);
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
      if (m.spawn) {
        if (this.now >= m.respawnAt) this.respawnMonster(m);
      } else if (this.now >= m.removeAt) {
        this.removeMonster(m);
      }
      return;
    }
    const def = m.def;
    if (m.state === MS_IDLE) {
      if (this.now >= m.thinkAt) {
        m.thinkAt = this.now + 400;
        let best: PlayerEnt | null = null;
        let bestD = def.aggro * def.aggro;
        for (const p of this.players.values()) {
          if (this.isDead(p)) continue;
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
    if (this.homeDist(m) > leash || d > 70) {
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
    this.host.broadcast(S.HAZARD, msg);
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
            this.host.broadcast(S.DMG, { dst: p.sid, n: 0, src: h.src } satisfies DmgMsg);
            continue;
          }
          n = r.dmg;
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
      this.host.broadcast(S.BOLT, msg);
    }
  }

  private endBolt(i: number, x: number, z: number, hit?: string): void {
    const b = this.bolts[i];
    this.bolts.splice(i, 1);
    const msg: BoltEndMsg = { id: b.id, x, z };
    if (hit) msg.hit = hit;
    this.host.broadcast(S.BOLT_END, msg);
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
        if (r.dmg <= 0) this.host.broadcast(S.DMG, { dst: hit.sid, n: 0, src: m.id } satisfies DmgMsg);
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
    if (this.isDead(p) || p.trib || this.opts.levelId !== 'van_lam') return this.warn(p, 'sys.trib_not_now');
    if (c.level !== NGUNG_KHI_MAX) return this.warn(p, c.level > NGUNG_KHI_MAX ? 'sys.max_level' : 'sys.trib_need_xp');
    if (c.xp < xpNeed(c.level)) return this.warn(p, 'sys.trib_need_xp');
    if (!c.tx('tribulation', null, (d) => d.remove(TRUC_CO_PILL, 1))) return this.warn(p, 'sys.trib_need_pill');
    if (p.meditating) this.setMeditating(p, false);
    p.trib = { endAt: this.now + TRIBULATION_DURATION * 1000, nextAt: this.now + 3000, n: 0 };
    this.setFlag(p, PF_TRIBULATION, true);
    this.sysAll('sys.trib_start', { name: c.name }, 'info');
    this.fx({ t: 'tribstart', src: p.sid, d: TRIBULATION_DURATION, sd: visualSeed() });
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
    tr.nextAt = this.now + 2600 - progress * 1200;
    // Một tia nhắm thẳng vào người độ kiếp, vài tia rơi quanh.
    this.addHazard({ x: p.move.x, z: p.move.z, r: 4.2 }, 1.25, 0.24, true, 'lightning', p.sid);
    const extra = 1 + Math.floor(progress * 3);
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 9;
      this.addHazard({ x: p.move.x + Math.cos(a) * r, z: p.move.z + Math.sin(a) * r, r: 3.6 }, 1.25 + Math.random() * 0.6, 0.2, true, 'lightning', p.sid);
    }
  }

  private endTribulation(p: PlayerEnt, success: boolean, silent: boolean): void {
    const c = p.char;
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
      if (!silent) this.sys(p, 'sys.trib_fail', { n: lost }, 'bad');
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
    if (def.kind === 'weapon' || def.kind === 'robe' || def.kind === 'accessory') return this.onEquip(p, { slot });
    if (!def.use) return;
    if (this.now < p.itemCdAt) return this.warn(p, 'sys.item_cd');
    if (!c.tx('use:' + def.id, idem, (d) => !!d.removeAt(slot, 1))) return;
    p.itemCdAt = this.now + def.use.cd * 1000;
    if (def.use.hpPct) {
      const n = Math.round(c.mhp * def.use.hpPct);
      c.hp = Math.min(c.mhp, c.hp + n);
      this.host.broadcast(S.DMG, { dst: p.sid, n, heal: true } satisfies DmgMsg);
    }
    if (def.use.mpPct) c.mp = Math.min(c.mmp, c.mp + c.mmp * def.use.mpPct);
    if (def.use.xp) this.giveXp(p, def.use.xp);
    this.fx({ t: 'potion', src: p.sid });
  }

  onEquip(p: PlayerEnt, msg: unknown): void {
    const slot = (msg as { slot?: unknown } | null)?.slot;
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= INV_SIZE || this.isDead(p)) return;
    const c = p.char;
    const it = c.inv[slot as number];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def || !isEquipSlot(def.kind)) return;
    if ((def.reqLevel ?? 1) > c.level) return this.warn(p, 'sys.equip_level');
    const es = def.kind as EquipSlot;
    const ok = c.tx('equip', null, (d) => {
      const prev = d.equip[es];
      d.equip[es] = { ...d.inv[slot as number]! };
      d.inv[slot as number] = prev ? { ...prev } : null;
      return true;
    });
    if (ok) c.recalc();
  }

  onUnequip(p: PlayerEnt, msg: unknown): void {
    const es = (msg as { slot?: unknown } | null)?.slot;
    if (!isEquipSlot(es) || this.isDead(p)) return;
    const c = p.char;
    if (!c.equip[es]) return;
    const ok = c.tx('unequip', null, (d) => {
      const i = d.inv.findIndex((s) => !s);
      if (i < 0) return false;
      d.inv[i] = { ...d.equip[es]! };
      delete d.equip[es];
      return true;
    });
    if (!ok) return this.warn(p, 'sys.inv_full');
    c.recalc();
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
      if (sb && def && sb.id === sa.id && def.stack > 1) {
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
    const gold = def.sell * n;
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
    if (c.gold < rcp.gold * n) return this.warn(p, 'sys.not_enough_gold');
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
      if (!d.add(rcp.output.id, rcp.output.n * n)) {
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
    this.sys(p, 'sys.crafted', { item: itemName(rcp.output.id), n: rcp.output.n * n }, 'loot');
    this.questEvent(p, 'craft', rcp.output.id, rcp.output.n * n);
    this.fx({ t: 'craft', src: p.sid });
  }

  onEnhance(p: PlayerEnt, msg: unknown): void {
    const m = msg as { npc?: unknown; slot?: unknown; r?: unknown } | null;
    if (!m || typeof m.npc !== 'string' || !isEquipSlot(m.slot)) return;
    const es = m.slot;
    const idem = this.idem(p, m.r);
    if (idem === undefined || this.isDead(p)) return;
    const npc = NPC.get(m.npc);
    if (!npc || !npc.enhance) return;
    if (!this.nearNpc(p, npc.id)) return this.warn(p, 'sys.too_far');
    const c = p.char;
    const it = c.equip[es];
    const def = it ? ITEM.get(it.id) : undefined;
    if (!it || !def) return;
    const plus = it.plus ?? 0;
    if (plus >= MAX_ENHANCE) return this.warn(p, 'sys.enh_max');
    const cost = enhanceCost(plus, Math.max(def.price, def.sell * 3));
    if (c.gold < cost.gold) return this.warn(p, 'sys.not_enough_gold');
    const success = Math.random() < enhanceChance(plus);
    const ok = c.tx(success ? 'enhance:ok' : 'enhance:fail', idem, (d) => {
      if (!d.remove(ENHANCE_ORE, cost.ore) || !d.spendGold(cost.gold)) return false;
      if (success) d.equip[es] = { ...d.equip[es]!, plus: plus + 1 };
      return true;
    });
    if (!ok) return this.warn(p, 'sys.not_enough_mat');
    if (success) {
      c.recalc();
      this.sys(p, 'sys.enh_ok', { item: t(`item.${def.id}.name`), n: plus + 1 }, 'good');
      this.fx({ t: 'enhance', src: p.sid });
    } else {
      this.sys(p, 'sys.enh_fail', undefined, 'bad');
    }
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

  /** Lệnh GM, chỉ dành cho tài khoản dev khi AUTH_DEV_BYPASS bật. */
  private gm(p: PlayerEnt, a: string[]): void {
    const c = p.char;
    const say = (m: string) => this.sys(p, 'sys.gm', { m }, 'info');
    switch (a[0]) {
      case 'level': {
        const lv = Math.max(1, Math.min(18, Number(a[1]) | 0));
        c.level = lv;
        c.xp = 0;
        c.recalc();
        c.hp = c.mhp;
        c.mp = c.mmp;
        this.questEvent(p, 'level', undefined, lv);
        return say('level = ' + lv);
      }
      case 'xp':
        this.giveXp(p, Math.max(0, Number(a[1]) | 0));
        return;
      case 'gold':
        c.tx('gm', null, (d) => (d.addGold(Math.max(1, Number(a[1]) | 0)), true));
        return say('gold = ' + c.gold);
      case 'give': {
        const ok = c.tx('gm', null, (d) => d.add(a[1], Math.max(1, Number(a[2] ?? 1) | 0)));
        return say(ok ? 'đã thêm ' + a[1] : 'không thêm được');
      }
      case 'tp': {
        const x = Number(a[1]);
        const z = Number(a[2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return say('tp x z');
        p.move = { x, y: groundAt(x, z), z, vy: 0, grounded: true, flying: false };
        p.inputs.length = 0;
        return say(`tp ${x} ${z}`);
      }
      case 'heal':
        c.hp = c.mhp;
        c.mp = c.mmp;
        return say('đã hồi đầy');
      case 'die':
        this.damagePlayer(p, 999999, '');
        return;
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
        return say('level N | xp N | gold N | give id n | tp x z | heal | die | killall | tick');
    }
  }
}

export const DEFAULT_SPAWN = SPAWN_POINT;
