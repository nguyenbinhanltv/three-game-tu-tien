import type { Client } from 'colyseus';
import {
  type CdMsg,
  CHAT_MAX_LEN,
  computeDamage,
  DEATH_XP_LOSS,
  type DmgMsg,
  enhanceChance,
  enhanceCost,
  type EquipSlot,
  FLY_UNLOCK_LEVEL,
  type FxMsg,
  GCD,
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
  type MonsterCaster,
  type MonsterDef,
  monsterStats,
  monsterXp,
  type MoveInput,
  type MoveState,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  MS_IDLE,
  MS_RETURN,
  NGUNG_KHI_MAX,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
  PF_SHIELD,
  PF_TRIBULATION,
  PROTOCOL_VERSION,
  S,
  type SkillDef,
  SPAWN_POINT,
  type SpawnDef,
  STEP,
  stepMove,
  type SysMsg,
  TRIBULATION_DURATION,
  TRIBULATION_FAIL_XP_LOSS,
  TRUC_CO_LEVEL,
  WATER_Y,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { ENHANCE_ORE, ITEM, itemName, LEVELS, MONSTER, monsterName, NPC, QUEST, realmName, RECIPE, SKILL, t, TRUC_CO_PILL } from '@dtl/content';
import { MonS, NodeS, PlayerS, type WorldState } from '../state';
import { type Character, isEquipSlot } from './character';

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
  meditating: boolean;
  xpAcc: number;
  trib: { endAt: number; nextAt: number; n: number } | null;
  warnAt: number;
  chatAt: number;
  msgWindowAt: number;
  msgCount: number;
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

  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void {
    const m: SysMsg = { k };
    if (params) m.p = params;
    if (type) m.t = type;
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
      meditating: false,
      xpAcc: 0,
      trib: null,
      warnAt: 0,
      chatAt: 0,
      msgWindowAt: this.now,
      msgCount: 0,
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
      const inCombat = this.now - p.lastCombatAt < 6000;
      const hpRate = p.meditating ? 0.05 : inCombat ? 0 : 0.02;
      const mpRate = p.move.flying ? 0 : p.meditating ? 0.08 : inCombat ? 0.012 : 0.03;
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
      this.fx({ t: 'cast', src: p.sid, dst: targetId, d: skill.cast });
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
        this.fx({ t: skill.fx, src: p.sid, dst: mon.id });
        this.hitMonster(p, mon, skill.power);
        break;
      }
      case 'aoe': {
        const mon = this.monById.get(targetId);
        if (!mon) break;
        const r = skill.radius ?? 8;
        const cx = mon.s.x;
        const cz = mon.s.z;
        this.fx({ t: skill.fx, src: p.sid, dst: mon.id, x: cx, y: mon.s.y, z: cz, r });
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
    this.damageMonster(mon, dmg, p, crit, isHeavyHit(power));
  }

  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null, crit = false, hv = false): void {
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
    if (mon.def.boss) this.sysAll('sys.boss_dead', { boss: monsterName(mon.def.id) }, 'good');
    this.host.onMonsterKilled?.(mon);
  }

  private rollLoot(p: PlayerEnt, mon: MonEnt): void {
    const [g0, g1] = mon.def.gold;
    const gold = p.noLoot ? 0 : g0 + Math.floor(Math.random() * (g1 - g0 + 1));
    const got: { id: string; n: number }[] = [];
    if (p.noLoot) return;
    if (!p.noLoot) {
      for (const d of mon.def.drops) {
        if (Math.random() < d.chance) got.push({ id: d.item, n: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
      }
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
    if (gold > 0) this.sys(p, 'sys.gold', { n: gold }, 'loot');
    for (const g of kept) this.sys(p, 'sys.loot', { item: itemName(g.id), n: g.n }, 'loot');
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
    const combo = m.def.ai?.combo;
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
      m.cast = { endAt: this.now + c.cast * 1000 };
      this.fx({ t: 'mcast', src: m.id, dst: target.sid, d: c.cast });
    }
  }

  private releaseCast(m: MonEnt, target: PlayerEnt, c: MonsterCaster, d: number, reachable: boolean): void {
    m.cast = null;
    m.castReadyAt = this.now + c.cd * 1000;
    // Mục tiêu đã chạy xa hoặc lên chỗ không với tới: chiêu xịt.
    if (!reachable || d > c.range * 1.4) return;
    const yaw = Math.atan2(target.move.x - m.s.x, target.move.z - m.s.z);
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
      if (left < 0.5) {
        m.threat.clear();
        m.wx = m.homeX;
        m.wz = m.homeZ;
        this.setMonState(m, MS_IDLE);
      }
      return;
    }
    // CHASE / ATTACK
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
      this.resetAi(m);
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
        m.evadeUntil = this.now + 6000;
        this.setMonState(m, MS_RETURN);
        return;
      }
    } else {
      m.unreachableSince = 0;
    }
    const caster = def.ai?.caster;
    if (caster) {
      this.tickCaster(m, target, caster, d, reachable, dt);
    } else if (!def.boss && !this.holdsMeleeSlot(m, target, d, reach)) {
      this.orbit(m, target, d, reach, dt);
    } else if (d > reach) {
      this.moveToward(m, target.move.x, target.move.z, def.speed, dt);
      this.setMonState(m, MS_CHASE);
    } else {
      m.s.yaw = Math.atan2(dx, dz);
      this.setMonState(m, MS_ATTACK);
      if (reachable && this.now >= m.attackAt && !m.comboAt) {
        m.attackAt = this.now + def.attackCd * 1000;
        const { dmg } = computeDamage(m.atk, 1, target.char.def, Math.random(), 1);
        this.fx({ t: 'bite', src: m.id, dst: target.sid });
        this.damagePlayer(target, dmg, m.id);
        const combo = def.ai?.combo;
        if (combo && !this.isDead(target) && Math.random() < combo.chance) {
          m.comboAt = this.now + combo.delay * 1000;
          m.comboTarget = target.sid;
        }
      }
    }
    if (def.boss && this.now >= m.abilityAt) {
      m.abilityAt = this.now + 8000;
      // Chiêu diện rộng báo trước: né ra khỏi vòng.
      let n = 0;
      for (const p of this.players.values()) {
        if (this.isDead(p) || n >= 4) continue;
        if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) > 45) continue;
        this.addHazard({ x: p.move.x, z: p.move.z, r: 5.5 }, 1.7, m.atk * 1.5, false, def.id === 'boss_thu_mo_tuong' ? 'lightning' : 'frost', m.id);
        n++;
      }
    }
  }

  // ---------- vùng nguy hiểm (thiên lôi, chiêu boss) ----------

  /** `atk` > 0: `dmg` là hệ số, sát thương tính bằng computeDamage theo phòng thủ từng người lúc nổ. */
  addHazard(g: HazardGeom, delay: number, dmg: number, pct: boolean, kind: HazardMsg['kind'], src: string, atk = 0): void {
    const mon = this.monById.get(src) ?? null;
    this.hazards.push({ x: g.x, z: g.z, r: g.r, sh: g.sh, yaw: g.yaw, w: g.w, at: this.now + delay * 1000, dmg, pct, atk, src, mon });
    const msg: HazardMsg = { x: g.x, z: g.z, r: g.r, delay, kind };
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
        const n =
          h.atk > 0
            ? computeDamage(h.atk, h.dmg, p.char.def, Math.random(), 1).dmg
            : h.pct
              ? p.char.mhp * h.dmg
              : Math.max(1, h.dmg - p.char.def * 0.6);
        this.damagePlayer(p, n, h.src, true);
      }
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
    this.fx({ t: 'tribstart', src: p.sid, d: TRIBULATION_DURATION });
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
    this.sys(p, 'sys.loot', { item: itemName(n.s.t), n: qty }, 'loot');
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
