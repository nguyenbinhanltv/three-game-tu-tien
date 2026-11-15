import { type Client, Room, ServerError } from 'colyseus';
import {
  C,
  DUNGEON_EXIT,
  DUNGEON_MIN_LEVEL,
  DUNGEON_SPAWN,
  KIEM_TRUNG,
  MS_DEAD,
  PF_DEAD,
  PORTAL_POS,
  ROOM_DUNGEON,
  ROOM_WORLD,
  S,
  SPAWN_POINT,
  type TransferMsg,
  isRootId,
  parseAppearance,
  validName,
} from '@dtl/shared';
import { APPEARANCE, MONSTER, monsterName, realmName } from '@dtl/content';
import { authenticate, type AuthResult, ERR_NAME_TAKEN, ERR_NEED_NAME, ERR_NO_TICKET, issueSession, sessionAuth } from './auth';
import { config } from './config';
import { Character } from './game/character';
import { parties } from './game/party';
import { GameSim, type MonEnt, type PlayerEnt, type SimHost, type SimOptions } from './game/sim';
import { WorldState } from './state';
import { readTestFlags, testAccess } from './testflags';

interface JoinAuth extends AuthResult {
  charId: number;
  session: string;
}

/** Nhân vật đang online ở room nào — để một nhân vật chỉ có mặt ở một nơi. */
const online = new Map<number, { room: GameRoom; sid: string }>();

export function onlineCount(): number {
  return online.size;
}

export const activeRooms = new Set<GameRoom>();

/** Vé vào bí cảnh dùng một lần: cấp ở cổng Kiếm Trủng (đã kiểm khoảng cách, cảnh giới, trạng thái). */
const dungeonTickets = new Map<number, number>();
const TICKET_TTL = 20_000;

function takeTicket(charId: number): boolean {
  const exp = dungeonTickets.get(charId);
  dungeonTickets.delete(charId);
  return exp !== undefined && exp >= Date.now();
}

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

export abstract class GameRoom extends Room<WorldState> implements SimHost {
  sim!: GameSim;
  abstract simOptions(options: unknown): SimOptions;

  onCreate(options: unknown): void {
    this.maxClients = config.maxClients;
    this.setState(new WorldState());
    this.sim = new GameSim(this.state, this, this.simOptions(options));
    this.setPatchRate(50);
    this.setSimulationInterval((dt) => this.sim.tick(dt), 50);
    activeRooms.add(this);

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
    // Bỏ qua message lạ thay vì báo lỗi.
    this.onMessage('*', () => {});
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

  /** Chỉnh nhân vật trước khi đưa vào thế giới (ví dụ: vị trí khi vừa rời bí cảnh). */
  prepareChar(_char: Character): void {}

  onJoin(client: Client, options: unknown, auth: JoinAuth): void {
    // Đăng nhập trùng: đá phiên cũ (và lưu) trước khi nạp nhân vật.
    const prev = online.get(auth.charId);
    if (prev) {
      const old = prev.room.clients.getById(prev.sid);
      const oldP = prev.room.sim.players.get(prev.sid);
      if (oldP) parties.detach(oldP);
      prev.room.beforeRemove(prev.sid);
      prev.room.sim.removePlayer(prev.sid);
      online.delete(auth.charId);
      if (old) {
        old.send(S.KICK, { k: 'sys.kicked_dup' });
        old.leave(4001);
      }
    }
    const char = Character.load(auth.charId);
    this.prepareChar(char);
    const dev = testAccess(auth.dev, config.devBypass);
    const p = this.sim.addPlayer(client, char, dev, auth.session, this.noLootFor(char));
    online.set(auth.charId, { room: this, sid: client.sessionId });
    parties.attach(p, this);
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
    this.sim.removePlayer(sid);
    console.log(`[leave] ${p.char.name} rời ${this.roomName}`);
  }

  beforeRemove(_sid: string): void {}

  protected transfer(p: PlayerEnt, room: string): void {
    this.sim.savePlayer(p);
    p.client.send(S.TRANSFER, { room, options: {} } satisfies TransferMsg);
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

let worldRooms = 0;

export class WorldRoom extends GameRoom {
  onCreate(options: unknown): void {
    super.onCreate(options);
    // Kênh đầu tiên sống mãi (giữ boss thế giới và nhịp hồi sinh); kênh mở thêm tự đóng khi vắng.
    const extra = worldRooms++ > 0;
    this.autoDispose = extra;
    if (extra) this.sim.delayBosses();
  }

  onDispose(): void {
    super.onDispose();
    worldRooms = Math.max(1, worldRooms - 1);
  }

  simOptions(): SimOptions {
    return { levelId: 'van_lam', roomName: ROOM_WORLD, spawn: SPAWN_POINT, respawn: SPAWN_POINT, persistPosition: true };
  }

  prepareChar(char: Character): void {
    // Vừa rời bí cảnh: xuất hiện trước cổng Kiếm Trủng.
    if (char.room === 'kiem_trung') {
      char.room = 'van_lam';
      char.x = PORTAL_POS.x;
      char.z = PORTAL_POS.z + 9;
      char.y = 0;
    }
  }

  onPortal(p: PlayerEnt): void {
    const dx = p.move.x - PORTAL_POS.x;
    const dz = p.move.z - PORTAL_POS.z;
    if (dx * dx + dz * dz > 14 * 14) return this.sim.sys(p, 'sys.too_far', undefined, 'bad');
    if ((p.s.fl & PF_DEAD) !== 0 || p.trib || p.trial) return this.sim.sys(p, 'sys.busy', undefined, 'bad');
    if (p.char.level < DUNGEON_MIN_LEVEL) return this.sim.sys(p, 'sys.dungeon_level', { realm: realmName(DUNGEON_MIN_LEVEL) }, 'bad');
    dungeonTickets.set(p.char.id, Date.now() + TICKET_TTL);
    this.transfer(p, ROOM_DUNGEON);
  }
}

interface Wave {
  mons: { id: string; level: number; n: number }[];
}

const WAVES: Wave[] = [
  { mons: [{ id: 'mon_kiem_linh', level: 11, n: 6 }] },
  { mons: [{ id: 'boss_kiem_khoi', level: 12, n: 1 }, { id: 'mon_kiem_linh', level: 11, n: 3 }] },
  { mons: [{ id: 'boss_huyet_lang_vuong', level: 13, n: 1 }, { id: 'mon_kiem_linh', level: 12, n: 2 }] },
  { mons: [{ id: 'boss_thu_mo_tuong', level: 15, n: 1 }] },
];

/** Bí cảnh Kiếm Trủng: mỗi room là một lượt của tối đa 5 người, đánh qua 4 đợt. */
export class DungeonRoom extends GameRoom {
  private wave = 0;
  private nextWaveAt = 0;
  private clearedAt = 0;

  simOptions(): SimOptions {
    return { levelId: 'kiem_trung', roomName: ROOM_DUNGEON, spawn: DUNGEON_SPAWN, respawn: DUNGEON_SPAWN, persistPosition: false };
  }

  onCreate(options: unknown): void {
    super.onCreate(options);
    this.maxClients = 5;
    this.nextWaveAt = Date.now() + 8000;
    this.clock.setInterval(() => this.director(), 500);
  }

  /** Chỉ vào được bằng vé cấp ở cổng Kiếm Trủng; gọi thẳng joinOrCreate('dungeon') sẽ bị từ chối. */
  static async onAuth(token: string, options: unknown): Promise<JoinAuth> {
    const auth = await GameRoom.onAuth(token, options);
    if (!takeTicket(auth.charId)) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
    return auth;
  }

  noLootFor(char: Character): boolean {
    return char.meta.dungeonDay === today();
  }

  afterJoin(p: PlayerEnt): void {
    this.sim.sys(p, 'sys.dungeon_enter', undefined, 'info');
    if (p.noLoot) this.sim.sys(p, 'sys.dungeon_no_reward', undefined, 'bad');
  }

  onPortal(p: PlayerEnt): void {
    const dx = p.move.x - DUNGEON_EXIT.x;
    const dz = p.move.z - DUNGEON_EXIT.z;
    if (dx * dx + dz * dz > 14 * 14) return this.sim.sys(p, 'sys.too_far', undefined, 'bad');
    this.transfer(p, ROOM_WORLD);
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
        for (const p of this.sim.players.values()) this.transfer(p, ROOM_WORLD);
      }
      return;
    }
    if (this.sim.players.size === 0) return;
    if (this.sim.monsters.some((m) => m.state !== MS_DEAD)) return;
    if (!this.nextWaveAt) this.nextWaveAt = now + 6000;
    if (now < this.nextWaveAt) return;
    this.nextWaveAt = 0;
    this.wave++;
    if (this.wave > WAVES.length) {
      this.clearedAt = now;
      this.sim.sysAll('sys.dungeon_clear', undefined, 'good');
      return;
    }
    if (this.wave === 2) this.lock();
    const w = WAVES[this.wave - 1];
    let lead = '';
    let i = 0;
    for (const g of w.mons) {
      const def = MONSTER.get(g.id);
      if (!def) continue;
      if (!lead || def.boss) lead = monsterName(def.id);
      for (let k = 0; k < g.n; k++) {
        const a = (i++ / 7) * Math.PI * 2 + this.wave;
        const r = def.boss ? 14 : 24 + (k % 2) * 8;
        this.sim.spawnMonster(def, g.level, KIEM_TRUNG.x + Math.cos(a) * r, KIEM_TRUNG.z - 12 + Math.sin(a) * r, null);
      }
    }
    this.sim.sysAll('sys.dungeon_wave', { n: this.wave, boss: lead }, 'info');
  }
}

export { ROOM_DUNGEON, ROOM_WORLD };
