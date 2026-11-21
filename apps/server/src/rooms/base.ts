// Nền chung của mọi room game (R-7): xác thực vé, giữ chỗ, vòng đời, cầu nối GameSim ↔ client; helper dùng chung.
import { type Client, Room, ServerError } from 'colyseus';
import { installViewPatchFix } from '../viewSerializer';
import { StateView } from '@colyseus/schema';
import {
  C,
  S,
  TELE_PARTY_R,
  tribLevelOf,
  tribRoomNameOf,
  type TribDef,
  type TransferMsg,
  dungeonRoomName,
  isRootId,
  parseAppearance,
  terrainOf,
  validName,
  worldRoomName,
  AOI_PERIOD_MS,
  at,
} from '@dtl/shared';
import { APPEARANCE, LEVELS, realmName, t } from '@dtl/content';
import { Aoi } from '../aoi';
import { authenticate, type AuthResult, ERR_NAME_TAKEN, ERR_NEED_NAME, issueSession, sessionAuth } from '../auth';
import { config } from '../config';
import { Character } from '../game/character';
import { MarkerSystem } from '../game/marker';
import { parties } from '../game/party';
import { GameSim } from '../game/sim';
import type { MonEnt, PlayerEnt, SimHost, SimOptions, TransferOpts } from '../game/entities';
import { WorldState } from '../state';
import { readTestFlags, testAccess } from '../testflags';
import { tickets, type Ticket } from '../transfer';
import { randomUUID } from 'node:crypto';
import { log } from '../log';

export interface JoinAuth extends AuthResult {
  charId: number;
  session: string;
  /** Điểm xuất hiện do vé chỉ định (E1-B); null = vị trí đã lưu / điểm mặc định của room. */
  spawn?: { x: number; z: number } | null;
  /** Vào bằng vé tới đúng level của room (đã tiêu thụ ở onAuth): nhân vật còn ghi level nguồn, không được dẫn ngược về đó. */
  ticket?: boolean;
  /** Vé vào room độ kiếp: khóa room và kiếp cần bắt đầu (E1-F). */
  trib?: Ticket['trib'];
}

/** Tên room của một level (thế giới hoặc bí cảnh). */
export function roomNameOf(levelId: string): string {
  if (LEVELS[levelId]?.tribulation) return tribRoomNameOf(levelId);
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

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

installViewPatchFix();

type Corkable = { cork(): void; uncork(): void; destroyed?: boolean };

/**
 * `ws` gửi mỗi tin bằng một lần cork/uncork riêng, tức một syscall `writev` cho mỗi (tin × client). Với 100 người đánh nhau
 * chung một chỗ, tick phát hàng trăm tin FX/sát thương mỗi giây tới từng client và phần ghi socket chiếm ~85% thời gian tick.
 * Cork thêm một lớp ngoài cả tick (cork có đếm lồng nhau) thì các tin của tick dồn thành một lần ghi mỗi client; thứ tự và
 * nội dung tin không đổi, chỉ trễ tối đa đến hết tick.
 */
function corkClients(clients: Iterable<{ ref?: unknown }>): Corkable[] {
  const out: Corkable[] = [];
  for (const c of clients) {
    const sock = (c.ref as { _socket?: Corkable } | undefined)?._socket;
    if (sock && typeof sock.cork === 'function' && !sock.destroyed) {
      sock.cork();
      out.push(sock);
    }
  }
  return out;
}

function uncorkAll(socks: Corkable[]): void {
  for (const s of socks) {
    try {
      s.uncork();
    } catch {
      /* socket đã đóng */
    }
  }
}

/** Lệnh còn dùng được khi nguyên anh đang xuất khiếu (E3-K). */
const SOUL_ALLOWED: ReadonlySet<string> = new Set([C.INPUT, C.SOUL, C.CHAT, C.SPIRIT, C.MARK, C.PARTY]);

export abstract class GameRoom extends Room<WorldState> implements SimHost {
  sim!: GameSim;
  markers!: MarkerSystem;
  /** Vùng quan tâm của từng client (chỉ nhận state quái/người trong tầm). */
  aoi!: Aoi;
  abstract simOptions(options: unknown): SimOptions;

  override onCreate(options: unknown): void {
    this.maxClients = config.maxClients;
    this.setState(new WorldState());
    this.sim = new GameSim(this.state, this, this.simOptions(options));
    this.setPatchRate(50);
    this.aoi = new Aoi(this.sim);
    let aoiAt = 0;
    this.setSimulationInterval((dt) => {
      // Gom mọi tin FX/sát thương của tick vào một lần ghi socket mỗi client (xem corkClients).
      const corked = corkClients(this.clients);
      try {
        this.sim.tick(dt);
      } finally {
        uncorkAll(corked);
      }
      if (this.sim.now - aoiAt >= AOI_PERIOD_MS) {
        aoiAt = this.sim.now;
        const a0 = this.sim.prof.enabled ? performance.now() : 0;
        this.aoi.update((sid) => this.clients.getById(sid)?.view);
        if (a0) this.sim.prof.add('aoi_update', performance.now() - a0);
      }
    }, 50);
    activeRooms.add(this);
    this.markers = new MarkerSystem(this, () => this.sim.players.values(), Date.now, terrainOf(this.sim.level).playBounds);
    this.clock.setInterval(() => this.markers.sync(), 1000);

    const on = (type: string, handler: (p: PlayerEnt, msg: unknown) => void) => {
      this.onMessage(type, (client, msg) => {
        const p = this.sim.players.get(client.sessionId);
        if (!p || !this.sim.rateOk(p)) return;
        // Nguyên anh đang xuất khiếu (E3-K): chỉ di chuyển, nhập lại, trò chuyện, thần thức, đánh dấu; mọi thao tác khác của thân xác bị chặn.
        if (!SOUL_ALLOWED.has(type) && this.sim.soul.isScouting(p)) return;
        try {
          handler(p, msg);
        } catch (e) {
          log.error(`[room] lỗi xử lý message "${type}" của ${p.char.name}:`, e);
        }
      });
    };
    on(C.INPUT, (p, m) => this.sim.onInput(p, m));
    on(C.SKILL, (p, m) => this.sim.onSkill(p, m));
    on(C.ARTIFACT, (p) => this.sim.onArtifact(p));
    on(C.BONDED, (p) => this.sim.onBonded(p));
    on(C.SPIRIT, (p, m) => this.sim.spirit.command(p, m));
    on(C.SOUL, (p, m) => this.sim.soul.command(p, m));
    on(C.MEDITATE, (p, m) => this.sim.onMeditate(p, m));
    on(C.GATHER, (p, m) => this.sim.onGather(p, m));
    on(C.USE, (p, m) => this.sim.onUse(p, m));
    on(C.EQUIP, (p, m) => this.sim.onEquip(p, m));
    on(C.UNEQUIP, (p, m) => this.sim.onUnequip(p, m));
    on(C.LOOK_SET, (p, m) => this.sim.wardrobe.onLookSet(p, m));
    on(C.LOOK_DYE, (p, m) => this.sim.wardrobe.onLookDye(p, m));
    on(C.LOOK_RESET, (p, m) => this.sim.wardrobe.onLookReset(p, m));
    on(C.MOVE_ITEM, (p, m) => this.sim.onMoveItem(p, m));
    on(C.INV_SORT, (p, m) => this.sim.inventory.onSort(p, m));
    on(C.INV_LOCK, (p, m) => this.sim.inventory.onLock(p, m));
    on(C.INV_SPLIT, (p, m) => this.sim.inventory.onSplit(p, m));
    on(C.BUY, (p, m) => this.sim.onBuy(p, m));
    on(C.SELL, (p, m) => this.sim.onSell(p, m));
    on(C.CRAFT, (p, m) => this.sim.onCraft(p, m));
    on(C.ENHANCE, (p, m) => this.sim.onEnhance(p, m));
    on(C.UPGRADE, (p, m) => this.sim.onUpgrade(p, m));
    on(C.METHOD, (p, m) => this.sim.onMethod(p, m));
    on(C.SKILL_UP, (p, m) => this.sim.onSkillUp(p, m));
    on(C.SKILL_VAR, (p, m) => this.sim.onSkillVar(p, m));
    on(C.BRANCH, (p, m) => this.sim.onBranch(p, m));
    on(C.STAR, (p, m) => this.sim.onStar(p, m));
    on(C.TALK, (p, m) => this.sim.onTalk(p, m));
    on(C.QUEST, (p, m) => this.sim.onQuest(p, m));
    on(C.CHAT, (p, m) => this.sim.onChat(p, m));
    on(C.RESPAWN, (p) => this.onRespawn(p));
    on(C.BREAKTHROUGH, (p) => this.sim.onBreakthrough(p));
    on(C.TRIB_SOUL, (p) => this.sim.onTribSoul(p));
    on(C.TRIB_CLONE, (p) => this.sim.onTribClone(p));
    on(C.CLONE, (p, m) => this.sim.onClone(p, m));
    on(C.BOTTLENECK, (p, m) => this.sim.onBottleneck(p, m));
    on(C.ROOT, (p, m) => this.sim.onChangeRoot(p, m));
    on(C.DAO, (p, m) => this.sim.onChooseDao(p, m));
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
  /** Phó bản ghi đè để giới hạn số lần hồi sinh. */
  onRespawn(p: PlayerEnt): void {
    this.sim.onRespawn(p);
  }
  onMonsterKilled(_m: MonEnt): void {}

  /**
   * Xác thực ở mức class: Colyseus gọi trước khi giữ chỗ hay tạo room,
   * nên request matchmake không có thông tin đăng nhập hợp lệ không dựng được room nào.
   */
  static override async onAuth(_token: string, options: unknown): Promise<JoinAuth> {
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
      log.info(`[auth] tạo nhân vật mới: ${name}`);
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

  override onJoin(client: Client, options: unknown, auth: JoinAuth): void {
    // Đăng nhập trùng: đá phiên cũ (và lưu) trước khi nạp nhân vật.
    const prev = online.get(auth.charId);
    if (prev) {
      const old = prev.room.clients.getById(prev.sid);
      const oldP = prev.room.sim.players.get(prev.sid);
      if (oldP) parties.detach(oldP);
      prev.room.beforeRemove(prev.sid);
      if (oldP) {
        prev.room.sim.tele.drop(oldP);
        prev.room.sim.spirit.drop(oldP);
        prev.room.sim.soul.drop(oldP);
        prev.room.sim.clone.drop(oldP);
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
    if (!auth.ticket && resume && resume.level !== this.levelId) {
      tickets.issue(char.id, resume.level, resume.spawn);
      client.send(S.TRANSFER, { room: roomNameOf(resume.level), level: resume.level, options: {} } satisfies TransferMsg);
      // Client đúng sẽ tự rời ngay; client cố ở lại (không có người chơi nào trong room) bị ngắt để không chiếm chỗ.
      this.clock.setTimeout(() => client.leave(), 3000);
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
    this.sim.spirit.sendState(p);
    this.sim.soul.sendState(p);
    this.sim.clone.sendState(p);
    ensurePartyTick();
    log.info(`[join] ${char.name} vào ${this.roomName} (${this.sim.players.size} người)`);
    this.afterJoin(p);
    // M1-10: ?god / ?at=<địa điểm>. Server kiểm quyền; tài khoản thật bị từ chối và được báo.
    const tf = readTestFlags(options, auth.dev, config.devBypass);
    if (tf.kind === 'denied') {
      log.warn(`[join] ${char.name} xin tham số kiểm thử (?god/?at/?realm/?tribulation) nhưng không phải tài khoản thử: từ chối`);
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

  override async onLeave(client: Client, consented: boolean): Promise<void> {
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
          cur.invSent = undefined; // client mới chưa có túi: tin S.INV kế tiếp phải là ảnh đầy đủ
          cur.char.charDirty = cur.char.invDirty = cur.char.questDirty = cur.char.wardrobeDirty = true; // client mới chưa có tủ ngoại trang
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
    this.sim.spirit.drop(p);
    this.sim.soul.drop(p);
    this.sim.clone.drop(p);
    this.markers.drop(p);
    this.aoi.detach(sid);
    this.sim.removePlayer(sid);
    log.info(`[leave] ${p.char.name} rời ${this.roomName}`);
  }

  beforeRemove(_sid: string): void {}

  /** Lưu nhân vật rồi bảo client sang room của `level` (vé phải được cấp trước). */
  protected sendTransfer(p: PlayerEnt, level: string, options: Record<string, string> = {}): void {
    this.sim.soul.drop(p);
    this.sim.clone.drop(p);
    this.sim.savePlayer(p);
    p.client.send(S.TRANSFER, { room: roomNameOf(level), level, options } satisfies TransferMsg);
  }

  /**
   * Độ kiếp ở room riêng (E1-F, Nguyên Anh và Hóa Thần): room này chỉ kiểm điều kiện rồi cấp vé một lần; mỗi lần độ kiếp một room (khóa `tribRoom`).
   * Đồng đội cùng tổ đội trong tầm (`def.guard.r`) vào cùng làm hộ pháp (vé không mang kiếp: chỉ xem, chắn, diệt tâm ma).
   * Một mình vẫn độ được. Vật phẩm đột phá bị tiêu khi tới nơi (`GameSim.beginTribulation`), không phải lúc rời.
   */
  enterTribulationRoom(p: PlayerEnt, def: TribDef, force: boolean): boolean {
    if (!force) {
      const why = this.sim.leaveBlocker(p);
      if (why) {
        this.sim.sys(p, why, undefined, 'bad');
        return false;
      }
    }
    const level = tribLevelOf(def);
    const key = randomUUID();
    const opts = { tribRoom: key };
    const mates: PlayerEnt[] = [];
    if (parties.partyOf(p.char.id)) {
      const r = def.guard?.r ?? 20;
      for (const m of parties.matesInRoom(p.char.id, this)) {
        if (m === p || m.char.id === p.char.id || m.trib || this.sim.leaveBlocker(m)) continue;
        // Sân kiếp trả mọi người về `returnLevel`: hộ pháp chưa đủ cấp vào level đó thì không kéo theo (nếu không sẽ bị đưa tới bản đồ quá cấp).
        if (m.char.level < (LEVELS[at(LEVELS, level).dungeon?.returnLevel ?? '']?.minLevel ?? 0)) continue;
        if (Math.hypot(m.move.x - p.move.x, m.move.z - p.move.z) <= r) mates.push(m);
      }
    }
    tickets.issue(p.char.id, level, null, { key, id: def.id });
    this.sendTransfer(p, level, opts);
    for (const m of mates) {
      tickets.issue(m.char.id, level, null, { key });
      this.sendTransfer(m, level, opts);
    }
    return true;
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
    if (lv.minLevel && p.char.level < lv.minLevel) {
      this.sim.sys(p, 'sys.dungeon_level', { realm: realmName(lv.minLevel), name: t('map.' + level) }, 'bad');
      return false;
    }
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
        if (lv.minLevel && m.char.level < lv.minLevel) continue;
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
  private validSpawn(level: string, pos: { x: number; z: number }): boolean {
    const b = terrainOf(at(LEVELS, level)).playBounds;
    return Number.isFinite(pos.x) && Number.isFinite(pos.z) && pos.x >= b.x0 && pos.x <= b.x1 && pos.z >= b.z0 && pos.z <= b.z1;
  }

  override onDispose(): void {
    this.sim.saveAll();
    for (const p of this.sim.players.values()) {
      parties.detach(p);
      const cur = online.get(p.char.id);
      if (cur && cur.room === this) online.delete(p.char.id);
    }
    activeRooms.delete(this);
  }
}
