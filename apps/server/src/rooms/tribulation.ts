// Room độ kiếp (R-7, tách từ rooms.ts).
import { type Client, ServerError } from 'colyseus';
import {
  PF_DEAD,
  ROOM_DUNGEON,
  ROOM_TRIBULATION,
  ROOM_WORLD,
  TRIB_LEVEL,
  tribDef,
  tribRoomNameOf,
  type TribId,
  type DungeonDef,
  type TribDef,
  at,
  chainCleared,
  kieuEntryDeny,
  kieuOfLevel,
} from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { ERR_NO_TICKET } from '../auth';
import { Character } from '../game/character';
import { DUNGEON_QUEST_TARGET } from '../game/dungeonquest';
import { log } from '../log';
import type { PlayerEnt, SimOptions } from '../game/entities';
import { tickets } from '../transfer';
import { GameRoom, type JoinAuth } from './base';

/**
 * Room độ kiếp (E1-F): một lần độ kiếp Nguyên Anh / Hóa Thần, tối đa 5 người (người độ kiếp + hộ pháp). Chỉ vào bằng vé có khóa room
 * (`tribRoom`, xem `enterTribulationRoom`); `filterBy(['tribRoom'])` ở index.ts để mỗi lần độ kiếp có phòng riêng.
 * Vòng đời: bắt đầu kiếp ngay sau khi người độ kiếp tới nơi; hết mọi kiếp (thành công, chết hay rời) thì sau `LINGER_MS` đưa mọi người về
 * `returnLevel`; chưa ai bắt đầu kiếp sau `WAIT_MS` cũng đưa về (vé hỏng, mất vật phẩm giữa đường).
 */
const tribArrivals = new Map<number, TribId | undefined>();
/** Nơi xuất phát của người vào bằng vé `returnOrigin` (theo nhân vật); xong kiếp về đó. */
const tribOrigins = new Map<number, { level: string; x: number; z: number }>();

/** Lớp room độ kiếp cho một level kiếp: `tribulation` (do_kiep) hoặc `tribulation-<id>` (sân riêng, ví dụ Nhật Thực Kiếp). */
export function defineTribulation(levelId: string): typeof TribulationRoom {
  if (!LEVELS[levelId]?.tribulation) throw new Error(`defineTribulation: ${levelId} không phải sân độ kiếp`);
  if (levelId === TribulationRoom.levelId) return TribulationRoom;
  return class extends TribulationRoom {
    static override levelId = levelId;
  };
}

export class TribulationRoom extends GameRoom {
  static levelId: string = TRIB_LEVEL;
  /** Sau khi tới, đợi chừng này (ms) cho client dựng xong cảnh rồi mới bắt đầu kiếp. */
  static START_DELAY_MS = 3500;
  static LINGER_MS = 6000;
  static WAIT_MS = 25_000;
  private startedAny = false;
  /** Số lần bắt đầu kiếp đã hẹn giờ mà chưa chạy: trong lúc đó không đóng phòng vì quá `WAIT_MS`. */
  private startPending = 0;
  private idleSince = 0;
  private createdAt = Date.now();
  private sentBack = new Map<string, number>();

  private get def(): DungeonDef {
    return at(LEVELS, this.levelId).dungeon!;
  }

  simOptions(): SimOptions {
    const d = this.def;
    return { levelId: this.levelId, roomName: tribRoomNameOf(this.levelId), spawn: d.spawn, respawn: d.spawn, persistPosition: false };
  }

  override onCreate(options: unknown): void {
    super.onCreate(options);
    this.maxClients = 5;
    this.clock.setInterval(() => this.director(), 500);
  }

  static override async onAuth(token: string, options: unknown): Promise<JoinAuth> {
    const auth = await GameRoom.onAuth(token, options);
    const key = (options as { tribRoom?: unknown } | null)?.tribRoom;
    // Cầu kiếp chuỗi của Cửu Kiều (TN-7): kiểm lại điều kiện vào ngay lúc vào room (cấp, đúng cầu kế tiếp hoặc luyện lại).
    const kn = kieuOfLevel(this.levelId);
    if (kn !== null) {
      const c = Character.load(auth.charId);
      const deny = kieuEntryDeny(c.level, c.meta.kieu, kn);
      if (deny) {
        log.warn(`[kieu] ${c.name} vào cầu ${kn} bị từ chối ở onAuth (${deny})`);
        throw new ServerError(ERR_NO_TICKET, 'no_ticket');
      }
    }
    const t = tickets.take(auth.charId, this.levelId);
    if (!t?.trib || typeof key !== 'string' || t.trib.key !== key) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
    return { ...auth, ticket: true, spawn: t.spawn, trib: t.trib };
  }

  /** Lưu id kiếp theo nhân vật để `afterJoin` (không nhận `auth`) biết có phải người độ kiếp không. */
  override onJoin(client: Client, options: unknown, auth: JoinAuth): void {
    tribArrivals.set(auth.charId, auth.trib?.id ? (auth.trib.id as TribId) : undefined);
    if (auth.trib?.from) tribOrigins.set(auth.charId, auth.trib.from);
    else tribOrigins.delete(auth.charId);
    super.onJoin(client, options, auth);
  }

  /** Cầu kiếp chuỗi: số ải đã qua lúc vào (để biết lượt này là tiếp tục dở dang) và giờ vào, theo nhân vật. */
  private kieuStart = new Map<number, { stage: number; at: number }>();

  override afterJoin(p: PlayerEnt): void {
    const id = tribArrivals.get(p.char.id);
    tribArrivals.delete(p.char.id);
    if (kieuOfLevel(this.levelId) !== null) {
      // Hook nhiệm vụ `dungeon` của chương 7 (q7_cau_n), cùng đường với phó bản thường.
      this.sim.questEvent(p, 'dungeon', DUNGEON_QUEST_TARGET[this.levelId], 1);
      if (id) this.kieuStart.set(p.char.id, { stage: chainCleared(p.char.meta, tribDef(id)), at: Date.now() });
    }
    if (!id) {
      this.sim.sys(p, 'sys.trib_guard', undefined, 'info');
      return;
    }
    const def = tribDef(id);
    this.startPending++;
    this.clock.setTimeout(() => {
      this.startPending--;
      const cur = this.sim.players.get(p.sid);
      // Đã bị gửi về (đóng phòng lúc chờ) thì không bắt đầu: kẻo tiêu vật phẩm rồi mất tu vi khi client rời.
      if (!cur || cur.trib || this.sentBack.has(cur.sid)) return;
      if (!this.sim.beginTribulation(cur, def, !!def.item)) this.sendAllBack(true);
    }, TribulationRoom.START_DELAY_MS);
  }

  /**
   * Kiếp xong (gọi từ `endTribulation`). Ở sân cầu Cửu Kiều: chuỗi kiếp qua trọn vẹn do SERVER thấy (success của kiếp chuỗi chỉ phát ở ải cuối) mới ghi cầu.
   * Ải đã qua được lưu giữa các lượt nên lượt tiếp tục dở dang ngắn hơn giờ tối thiểu một cách hợp lệ: khi đó không áp giờ tối thiểu.
   */
  onTribulationEnd(p?: PlayerEnt, def?: TribDef, success?: boolean): void {
    this.startedAny = true;
    const n = kieuOfLevel(this.levelId);
    if (n === null || !p || !def?.chain || !success) return;
    const st = this.kieuStart.get(p.char.id);
    this.kieuStart.delete(p.char.id);
    const elapsedSec = !st || st.stage > 0 ? Number.MAX_SAFE_INTEGER : (Date.now() - st.at) / 1000;
    this.sim.kieu.onClear(p, n, { present: true, contributed: true, elapsedSec });
  }

  /** Đưa mọi người về nơi cũ (người chết được hồi sinh tại sân trước). */
  private sendAllBack(all = false): void {
    const d = this.def;
    const now = Date.now();
    for (const p of this.sim.players.values()) {
      if (!p.connected || (!all && p.trib)) continue;
      // Đã gửi gần đây mà client chưa rời (mất tin): thử lại sau 8 giây.
      if (now - (this.sentBack.get(p.sid) ?? 0) < 8000) continue;
      this.sentBack.set(p.sid, now);
      if ((p.s.fl & PF_DEAD) !== 0) this.sim.onRespawn(p);
      const o = tribOrigins.get(p.char.id);
      if (o && LEVELS[o.level] && !LEVELS[o.level]!.dungeon) {
        tickets.issue(p.char.id, o.level, { x: o.x, z: o.z });
        this.sendTransfer(p, o.level);
      } else {
        tickets.issue(p.char.id, d.returnLevel, d.returnSpawn);
        this.sendTransfer(p, d.returnLevel);
      }
    }
  }

  private director(): void {
    const now = Date.now();
    if (this.sim.players.size === 0) return;
    const active = [...this.sim.players.values()].some((p) => p.trib);
    if (active) {
      this.startedAny = true;
      this.idleSince = 0;
      return;
    }
    if (!this.startedAny) {
      if (this.startPending > 0) return;
      if (now - this.createdAt > TribulationRoom.WAIT_MS) this.sendAllBack(true);
      return;
    }
    if (!this.idleSince) this.idleSince = now;
    if (now - this.idleSince >= TribulationRoom.LINGER_MS) this.sendAllBack(true);
  }
}

export { ROOM_DUNGEON, ROOM_TRIBULATION, ROOM_WORLD };
