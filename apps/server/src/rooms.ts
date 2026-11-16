import { type Client, Room, ServerError } from 'colyseus';
import { installViewPatchFix } from './viewSerializer';
import { StateView } from '@colyseus/schema';
import {
  C,
  HOME_LEVEL,
  MS_DEAD,
  PF_DEAD,
  ROOM_DUNGEON,
  ROOM_WORLD,
  S,
  SPAWN_POINT,
  TELE_PARTY_R,
  type DungeonDef,
  type TransferMsg,
  dungeonRoomName,
  isRootId,
  parseAppearance,
  terrainOf,
  validName,
  worldRoomName,
  AOI_PERIOD_MS,
} from '@dtl/shared';
import { APPEARANCE, LEVELS, MONSTER, monsterName, realmName } from '@dtl/content';
import { Aoi } from './aoi';
import { authenticate, type AuthResult, ERR_NAME_TAKEN, ERR_NEED_NAME, ERR_NO_TICKET, issueSession, sessionAuth } from './auth';
import { config } from './config';
import { Character } from './game/character';
import { MarkerSystem } from './game/marker';
import { parties } from './game/party';
import { GameSim, type MonEnt, type PlayerEnt, type SimHost, type SimOptions, type TransferOpts } from './game/sim';
import { WorldState } from './state';
import { readTestFlags, testAccess } from './testflags';
import { tickets } from './transfer';

interface JoinAuth extends AuthResult {
  charId: number;
  session: string;
  /** Điểm xuất hiện do vé chỉ định (E1-B); null = vị trí đã lưu / điểm mặc định của room. */
  spawn?: { x: number; z: number } | null;
}

/** Tên room của một level (thế giới hoặc bí cảnh). */
export function roomNameOf(levelId: string): string {
  return LEVELS[levelId]?.dungeon ? dungeonRoomName(levelId) : worldRoomName(levelId);
}

/** Nhân vật đang online ở room nào — để một nhân vật chỉ có mặt ở một nơi. */
const online = new Map<number, { room: GameRoom; sid: string }>();

export function onlineCount(): number {
  return online.size;
}

export const activeRooms = new Set<GameRoom>();

let partyTimer: ReturnType<typeof setInterval> | null = null;
/** Đẩy trạng thái tổ đội (máu, linh lực) mỗi 500 ms, hết hạn lời mời, dọn người ngoại tuyến. */
function ensurePartyTick(): void {
  if (partyTimer) return;
  partyTimer = setInterval(() => parties.tick(), 500);
  partyTimer.unref();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

installViewPatchFix();

export abstract class GameRoom extends Room<WorldState> implements SimHost {
  sim!: GameSim;
  markers!: MarkerSystem;
  /** Vùng quan tâm của từng client (chỉ nhận state quái/người trong tầm). */
  aoi!: Aoi;
  abstract simOptions(options: unknown): SimOptions;

  onCreate(options: unknown): void {
    this.maxClients = config.maxClients;
    this.setState(new WorldState());
    this.sim = new GameSim(this.state, this, this.simOptions(options));
    this.setPatchRate(50);
    this.aoi = new Aoi(this.sim);
    let aoiAt = 0;
    this.setSimulationInterval((dt) => {
      this.sim.tick(dt);
      if (this.sim.now - aoiAt >= AOI_PERIOD_MS) {
        aoiAt = this.sim.now;
        this.aoi.update((sid) => this.clients.getById(sid)?.view);
      }
    }, 50);
    activeRooms.add(this);
    this.markers = new MarkerSystem(this, () => this.sim.players.values(), Date.now, terrainOf(this.sim.level).playBounds);
    this.clock.setInterval(() => this.markers.sync(), 1000);

    const on = (type: string, handler: (p: PlayerEnt, msg: unknown) => void) => {
      this.onMessage(type, (client, msg) => {
        const p = this.sim.players.get(client.sessionId);
        if (!p || !this.sim.rateOk(p)) return;
        try {
          handler(p, msg);
        } catch (e) {
          console.error(`[room] lỗi xử lý message "${type}" của ${p.char.name}:`, e);
        }
      });
    };
    on(C.INPUT, (p, m) => this.sim.onInput(p, m));
    on(C.SKILL, (p, m) => this.sim.onSkill(p, m));
    on(C.ARTIFACT, (p) => this.sim.onArtifact(p));
    on(C.MEDITATE, (p, m) => this.sim.onMeditate(p, m));
    on(C.GATHER, (p, m) => this.sim.onGather(p, m));
    on(C.USE, (p, m) => this.sim.onUse(p, m));
    on(C.EQUIP, (p, m) => this.sim.onEquip(p, m));
    on(C.UNEQUIP, (p, m) => this.sim.onUnequip(p, m));
    on(C.MOVE_ITEM, (p, m) => this.sim.onMoveItem(p, m));
    on(C.BUY, (p, m) => this.sim.onBuy(p, m));
    on(C.SELL, (p, m) => this.sim.onSell(p, m));
    on(C.CRAFT, (p, m) => this.sim.onCraft(p, m));
    on(C.ENHANCE, (p, m) => this.sim.onEnhance(p, m));
    on(C.UPGRADE, (p, m) => this.sim.onUpgrade(p, m));
    on(C.METHOD, (p, m) => this.sim.onMethod(p, m));
    on(C.SKILL_UP, (p, m) => this.sim.onSkillUp(p, m));
    on(C.SKILL_VAR, (p, m) => this.sim.onSkillVar(p, m));
    on(C.TALK, (p, m) => this.sim.onTalk(p, m));
    on(C.QUEST, (p, m) => this.sim.onQuest(p, m));
    on(C.CHAT, (p, m) => this.sim.onChat(p, m));
    on(C.RESPAWN, (p) => this.sim.onRespawn(p));
    on(C.BREAKTHROUGH, (p) => this.sim.onBreakthrough(p));
    on(C.BOTTLENECK, (p, m) => this.sim.onBottleneck(p, m));
    on(C.ROOT, (p, m) => this.sim.onChangeRoot(p, m));
    on(C.PARTY, (p, m) => parties.command(p, m));
    on(C.DUEL, (p, m) => this.sim.duel.command(p, m));
    on(C.PORTAL, (p) => this.onPortal(p));
    on(C.TELE, (p, m) => this.sim.tele.command(p, m));
    on(C.MARK, (p, m) => this.markers.command(p, m));
    // Bỏ qua message lạ thay vì báo lỗi.
    this.onMessage('*', () => {});
  }

  /** Cả phòng trừ các phiên ở xa (AOI): mã hóa một lần, bỏ qua `except`. */
  broadcastExcept(type: string, msg: unknown, except: ReadonlySet<string>): void {
    const skip: Client[] = [];
    for (const c of this.clients) if (except.has(c.sessionId)) skip.push(c);
    this.broadcast(type, msg, skip.length ? { except: skip } : undefined);
  }

  onPortal(_p: PlayerEnt): void {}
  onMonsterKilled(_m: MonEnt): void {}

  /**
   * Xác thực ở mức class: Colyseus gọi trước khi giữ chỗ hay tạo room,
   * nên request matchmake không có thông tin đăng nhập hợp lệ không dựng được room nào.
   */
  static async onAuth(_token: string, options: unknown): Promise<JoinAuth> {
    const auth = await authenticate(options);
    const o = (options ?? {}) as { name?: unknown; dev?: unknown; session?: unknown; ap?: unknown; rt?: unknown };
    let charId = Character.findByAccount(auth.accountId);
    if (charId === null) {
      const wanted = auth.dev && !validName(o.name) ? o.dev : o.name;
      if (!validName(wanted)) throw new ServerError(ERR_NEED_NAME, 'need_name');
      const name = wanted.trim();
      if (Character.nameTaken(name)) throw new ServerError(ERR_NAME_TAKEN, 'name_taken');
      // Ngoại hình chỉ nhận lúc tạo nhân vật; id lạ / giới tính chưa mở thì dùng mặc định (không báo lỗi).
      charId = Character.create(auth.accountId, name, parseAppearance(APPEARANCE, o.ap), isRootId(o.rt) ? o.rt : null).id;
      console.log(`[auth] tạo nhân vật mới: ${name}`);
    }
    const session = sessionAuth(o.session) ? (o.session as string) : issueSession(auth);
    return { ...auth, charId, session };
  }

  /** Bí cảnh ghi đè để quyết định có rơi đồ không. */
  noLootFor(_char: Character): boolean {
    return false;
  }

  /** Level của room này (do lớp con của `defineWorld`/`defineDungeon` đặt). */
  get levelId(): string {
    return (this.constructor as unknown as { levelId: string }).levelId;
  }

  /**
   * Nhân vật đang lưu ở level khác (đăng nhập lại sau khi thoát giữa bản đồ khác, hoặc giữa bí cảnh): trả đích cần tới,
   * hoặc null nếu không cần dời. Bí cảnh không giữ người qua lần đăng nhập: về `returnLevel` tại `returnSpawn`.
   */
  resumeTarget(char: Character): { level: string; spawn: { x: number; z: number } | null } | null {
    // Bí cảnh chỉ vào bằng vé (đã kiểm ở onAuth): người vào luôn được đặt ở điểm vào, không dẫn về level đang lưu.
    if (LEVELS[this.levelId]?.dungeon) return null;
    const lv = LEVELS[char.room];
    if (!lv) return null;
    const d = lv.dungeon;
    if (d) return { level: d.returnLevel, spawn: d.returnSpawn };
    return lv.id === this.levelId ? null : { level: lv.id, spawn: null };
  }

  /** Chỉnh nhân vật trước khi đưa vào (vé chỉ định điểm; vừa rời bí cảnh thì về chỗ `returnSpawn`). */
  prepareChar(char: Character, spawn: { x: number; z: number } | null = null): void {
    const back = this.resumeTarget(char);
    const at = spawn ?? (back && back.level === this.levelId ? back.spawn : null);
    if (!at) return;
    char.room = this.levelId;
    char.x = at.x;
    char.z = at.z;
    char.y = 0;
  }

  onJoin(client: Client, options: unknown, auth: JoinAuth): void {
    // Đăng nhập trùng: đá phiên cũ (và lưu) trước khi nạp nhân vật.
    const prev = online.get(auth.charId);
    if (prev) {
      const old = prev.room.clients.getById(prev.sid);
      const oldP = prev.room.sim.players.get(prev.sid);
      if (oldP) parties.detach(oldP);
      prev.room.beforeRemove(prev.sid);
      if (oldP) {
        prev.room.sim.tele.drop(oldP);
        prev.room.markers.drop(oldP);
      }
      prev.room.sim.removePlayer(prev.sid);
      online.delete(auth.charId);
      if (old) {
        old.send(S.KICK, { k: 'sys.kicked_dup' });
        old.leave(4001);
      }
    }
    const char = Character.load(auth.charId);
    // Lưu ở bản đồ khác (không phải room này): cấp vé, bảo client sang đúng room. Không dựng người ở đây
    // (savePlayer sẽ ghi đè vị trí đã lưu bằng toạ độ của level này).
    const resume = this.resumeTarget(char);
    if (resume && resume.level !== this.levelId) {
      tickets.issue(char.id, resume.level, resume.spawn);
      client.send(S.TRANSFER, { room: roomNameOf(resume.level), level: resume.level, options: {} } satisfies TransferMsg);
      return;
    }
    this.prepareChar(char, auth.spawn ?? null);
    const dev = testAccess(auth.dev, config.devBypass);
    const p = this.sim.addPlayer(client, char, dev, auth.session, this.noLootFor(char));
    // AOI: client mới chỉ thấy mình cho tới lần cập nhật kế (tối đa 200 ms); StateView phải có trước khi gửi state đầy đủ.
    client.view = new StateView();
    this.aoi.attach(client.view, p.s);
    this.aoi.update((sid) => (sid === p.sid ? client.view : this.clients.getById(sid)?.view));
    this.sim.sendBossTimers(p);
    online.set(auth.charId, { room: this, sid: client.sessionId });
    parties.attach(p, this);
    this.sim.tele.sendState(p);
    ensurePartyTick();
    console.log(`[join] ${char.name} vào ${this.roomName} (${this.sim.players.size} người)`);
    this.afterJoin(p);
    // M1-10: ?god / ?at=<địa điểm>. Server kiểm quyền; tài khoản thật bị từ chối và được báo.
    const tf = readTestFlags(options, auth.dev, config.devBypass);
    if (tf.kind === 'denied') {
      console.warn(`[join] ${char.name} xin tham số kiểm thử (?god/?at/?realm/?tribulation) nhưng không phải tài khoản thử: từ chối`);
      this.sim.sys(p, 'sys.test_denied', undefined, 'bad');
    } else if (tf.kind === 'bad_place') {
      this.sim.sys(p, 'sys.gm', { m: `at ${tf.id}? ${this.sim.placeIds().join(' | ')}` }, 'info');
    } else if (tf.kind === 'bad_realm') {
      this.sim.sys(p, 'sys.gm', { m: `realm ${tf.id}? nk1…nk15 | tc | tc1…tc3` }, 'info');
    } else if (tf.kind === 'ok') {
      this.sim.applyTestFlags(p, tf.flags);
    }
  }

  afterJoin(_p: PlayerEnt): void {}

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.sim.players.get(client.sessionId);
    if (!p) return;
    if (!consented && !p.kicked) {
      p.connected = false;
      try {
        // Giữ nhân vật trong thế giới 60 giây chờ kết nối lại.
        const again = await this.allowReconnection(client, 60);
        const cur = this.sim.players.get(client.sessionId);
        if (cur) {
          cur.client = again;
          cur.connected = true;
          cur.char.charDirty = cur.char.invDirty = cur.char.questDirty = true;
        } else {
          // Nhân vật đã bị phiên đăng nhập khác thay thế trong lúc chờ: không để client cũ ở lại nghe lén.
          again.send(S.KICK, { k: 'sys.kicked_dup' });
          again.leave(4001);
        }
        return;
      } catch {
        /* hết hạn chờ */
      }
    }
    this.dropPlayer(client.sessionId);
  }

  private dropPlayer(sid: string): void {
    const p = this.sim.players.get(sid);
    if (!p) return;
    const cur = online.get(p.char.id);
    if (cur && cur.room === this && cur.sid === sid) online.delete(p.char.id);
    this.beforeRemove(sid);
    parties.detach(p);
    this.sim.tele.drop(p);
    this.markers.drop(p);
    this.aoi.detach(sid);
    this.sim.removePlayer(sid);
    console.log(`[leave] ${p.char.name} rời ${this.roomName}`);
  }

  beforeRemove(_sid: string): void {}

  /** Lưu nhân vật rồi bảo client sang room của `level` (vé phải được cấp trước). */
  protected sendTransfer(p: PlayerEnt, level: string): void {
    this.sim.savePlayer(p);
    p.client.send(S.TRANSFER, { room: roomNameOf(level), level, options: {} } satisfies TransferMsg);
  }

  /**
   * Chuyển người chơi sang bản đồ thế giới khác (E1-B). Kiểm ở room đi: level đích có thật và là bản đồ thế giới,
   * người chơi không chết/độ kiếp/tâm ma/tỉ thí/niệm dở (`o.combat`: cả giao chiến); rồi cấp vé một lần (15 s),
   * lưu ngay, báo client. Người dẫn tổ đội (`o.party`) kéo theo đồng đội cùng room trong tầm nếu họ cũng qua được kiểm.
   */
  requestLevel(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o: TransferOpts = {}): boolean {
    const lv = LEVELS[level];
    if (!lv || lv.dungeon || level === this.levelId) return false;
    if (spawn && !this.validSpawn(level, spawn)) return false;
    if (!o.force) {
      const why = this.sim.leaveBlocker(p, o.combat);
      if (why) {
        this.sim.sys(p, why, undefined, 'bad');
        return false;
      }
    }
    tickets.issue(p.char.id, level, spawn);
    this.sendTransfer(p, level);
    if (o.party && parties.partyOf(p.char.id)?.leader === p.char.id) {
      for (const m of parties.matesInRoom(p.char.id, this)) {
        if (m === p || m.char.id === p.char.id) continue;
        if (Math.hypot(m.move.x - p.move.x, m.move.z - p.move.z) > TELE_PARTY_R || this.sim.leaveBlocker(m, o.combat)) continue;
        tickets.issue(m.char.id, level, spawn);
        this.sendTransfer(m, level);
      }
    }
    return true;
  }

  transferLevel(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o?: TransferOpts): boolean {
    return this.requestLevel(p, level, spawn, o);
  }

  /** Điểm xuất hiện nằm trong vùng chơi của level đích (dữ liệu server; kiểm để phòng bảng sai, không phải đầu vào client). */
  private validSpawn(level: string, at: { x: number; z: number }): boolean {
    const b = terrainOf(LEVELS[level]).playBounds;
    return Number.isFinite(at.x) && Number.isFinite(at.z) && at.x >= b.x0 && at.x <= b.x1 && at.z >= b.z0 && at.z <= b.z1;
  }

  onDispose(): void {
    this.sim.saveAll();
    for (const p of this.sim.players.values()) {
      parties.detach(p);
      const cur = online.get(p.char.id);
      if (cur && cur.room === this) online.delete(p.char.id);
    }
    activeRooms.delete(this);
  }
}

/** Số room thế giới đã dựng của từng level: kênh đầu tiên sống mãi, kênh thêm tự đóng khi vắng. */
const worldRooms = new Map<string, number>();

/** Room bản đồ thế giới. Lớp gốc dùng cho Vân Lam; level khác tạo qua `defineWorld`. */
export class WorldRoom extends GameRoom {
  static levelId: string = HOME_LEVEL;

  /**
   * Vào room thế giới: level gốc (Vân Lam) nhận đăng nhập thường; level khác chỉ nhận người có vé tới level đó
   * (cấp ở room đi, hoặc ngay sau đăng nhập khi nhân vật đang lưu ở đó). Điểm xuất hiện đi theo vé.
   */
  static async onAuth(token: string, options: unknown): Promise<JoinAuth> {
    return worldAuth(this as unknown as { levelId: string }, token, options);
  }

  onCreate(options: unknown): void {
    super.onCreate(options);
    const n = worldRooms.get(this.levelId) ?? 0;
    worldRooms.set(this.levelId, n + 1);
    const extra = n > 0;
    this.autoDispose = extra;
    if (extra) this.sim.delayBosses();
  }

  onDispose(): void {
    super.onDispose();
    worldRooms.set(this.levelId, Math.max(1, (worldRooms.get(this.levelId) ?? 1) - 1));
  }

  simOptions(): SimOptions {
    const spawn = LEVELS[this.levelId].spawn ?? SPAWN_POINT;
    return { levelId: this.levelId, roomName: worldRoomName(this.levelId), spawn, respawn: spawn, persistPosition: true };
  }

  onPortal(p: PlayerEnt): void {
    const portal = (LEVELS[this.levelId].portals ?? []).find((q) => (p.move.x - q.x) ** 2 + (p.move.z - q.z) ** 2 <= q.r * q.r);
    if (!portal) return this.sim.sys(p, 'sys.too_far', undefined, 'bad');
    const d = LEVELS[portal.to]?.dungeon;
    if (!d) return;
    if ((p.s.fl & PF_DEAD) !== 0 || p.trib || p.trial) return this.sim.sys(p, 'sys.busy', undefined, 'bad');
    if (p.char.level < d.minLevel) return this.sim.sys(p, 'sys.dungeon_level', { realm: realmName(d.minLevel) }, 'bad');
    tickets.issue(p.char.id, portal.to);
    this.sendTransfer(p, portal.to);
  }
}

async function worldAuth(cls: { levelId: string }, token: string, options: unknown): Promise<JoinAuth> {
  const auth = await GameRoom.onAuth(token, options);
  const t = tickets.take(auth.charId, cls.levelId);
  if (!t && cls.levelId !== HOME_LEVEL) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
  return { ...auth, spawn: t?.spawn ?? null };
}

/** Lớp room cho một bản đồ thế giới (E1-B): `world` cho Vân Lam, `world-<id>` cho level khác. */
export function defineWorld(levelId: string): typeof WorldRoom {
  if (!LEVELS[levelId] || LEVELS[levelId].dungeon) throw new Error(`defineWorld: ${levelId} không phải bản đồ thế giới`);
  if (levelId === HOME_LEVEL) return WorldRoom;
  return class extends WorldRoom {
    static levelId = levelId;
  };
}

/** Bí cảnh: mỗi room là một lượt của tối đa 5 người, đánh qua các đợt trong `levels/<id>.json`. */
export class DungeonRoom extends GameRoom {
  static levelId: string = 'kiem_trung';
  private wave = 0;
  private nextWaveAt = 0;
  private clearedAt = 0;

  private get def(): DungeonDef {
    return LEVELS[this.levelId].dungeon!;
  }

  simOptions(): SimOptions {
    const d = this.def;
    return { levelId: this.levelId, roomName: dungeonRoomName(this.levelId), spawn: d.spawn, respawn: d.spawn, persistPosition: false };
  }

  onCreate(options: unknown): void {
    super.onCreate(options);
    this.maxClients = 5;
    this.nextWaveAt = Date.now() + 8000;
    this.clock.setInterval(() => this.director(), 500);
  }

  /** Chỉ vào được bằng vé cấp ở cổng; gọi thẳng joinOrCreate('dungeon') sẽ bị từ chối. */
  static async onAuth(token: string, options: unknown): Promise<JoinAuth> {
    const auth = await GameRoom.onAuth(token, options);
    if (!tickets.take(auth.charId, (this as unknown as { levelId: string }).levelId)) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
    return auth;
  }

  noLootFor(char: Character): boolean {
    return char.meta.dungeonDay === today();
  }

  afterJoin(p: PlayerEnt): void {
    this.sim.sys(p, 'sys.dungeon_enter', undefined, 'info');
    this.sim.questEvent(p, 'dungeon', undefined, 1);
    if (p.noLoot) this.sim.sys(p, 'sys.dungeon_no_reward', undefined, 'bad');
  }

  /** Về bản đồ thế giới `returnLevel` tại `returnSpawn`, bằng vé (cùng đường với mọi lần chuyển bản đồ). */
  private leave(p: PlayerEnt): void {
    const d = this.def;
    tickets.issue(p.char.id, d.returnLevel, d.returnSpawn);
    this.sendTransfer(p, d.returnLevel);
  }

  onPortal(p: PlayerEnt): void {
    const ex = this.def.exit;
    if ((p.move.x - ex.x) ** 2 + (p.move.z - ex.z) ** 2 > 14 * 14) return this.sim.sys(p, 'sys.too_far', undefined, 'bad');
    this.leave(p);
  }

  onMonsterKilled(m: MonEnt): void {
    // Hạ con quái đầu tiên là đã dùng lượt thưởng hôm nay; trong lượt này vẫn nhận đủ.
    void m;
    for (const p of this.sim.players.values()) {
      if (!p.noLoot && p.char.meta.dungeonDay !== today()) {
        p.char.meta.dungeonDay = today();
        this.sim.savePlayer(p);
      }
    }
  }

  private director(): void {
    const now = Date.now();
    if (this.clearedAt) {
      if (now >= this.clearedAt + 20000) {
        this.clearedAt = now + 3600_000;
        for (const p of this.sim.players.values()) this.leave(p);
      }
      return;
    }
    if (this.sim.players.size === 0) return;
    if (this.sim.monsters.some((m) => m.state !== MS_DEAD)) return;
    if (!this.nextWaveAt) this.nextWaveAt = now + 6000;
    if (now < this.nextWaveAt) return;
    this.nextWaveAt = 0;
    this.wave++;
    const waves = this.def.waves;
    if (this.wave > waves.length) {
      this.clearedAt = now;
      this.sim.sysAll('sys.dungeon_clear', undefined, 'good');
      return;
    }
    if (this.wave === 2) this.lock();
    const w = waves[this.wave - 1];
    const c = this.def.center;
    let lead = '';
    let i = 0;
    for (const g of w.mons) {
      const def = MONSTER.get(g.id);
      if (!def) continue;
      if (!lead || def.boss) lead = monsterName(def.id);
      for (let k = 0; k < g.n; k++) {
        const a = (i++ / 7) * Math.PI * 2 + this.wave;
        const r = def.boss ? 14 : 24 + (k % 2) * 8;
        this.sim.spawnMonster(def, g.level, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, null);
      }
    }
    this.sim.sysAll('sys.dungeon_wave', { n: this.wave, boss: lead }, 'info');
  }
}

/** Lớp room cho một bí cảnh (E1-B): `dungeon` cho Kiếm Trủng, `dungeon-<id>` cho bí cảnh khác. */
export function defineDungeon(levelId: string): typeof DungeonRoom {
  if (!LEVELS[levelId]?.dungeon) throw new Error(`defineDungeon: ${levelId} không phải bí cảnh`);
  if (levelId === DungeonRoom.levelId) return DungeonRoom;
  return class extends DungeonRoom {
    static levelId = levelId;
  };
}

export { ROOM_DUNGEON, ROOM_WORLD };
