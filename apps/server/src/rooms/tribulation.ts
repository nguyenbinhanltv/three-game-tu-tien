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
  KIEU_BOSS_ID,
  MS_DEAD,
} from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { ERR_NO_TICKET } from '../auth';
import { Character } from '../game/character';
import { DUNGEON_QUEST_TARGET } from '../game/dungeonquest';
import { log } from '../log';
import type { MonEnt, PlayerEnt, SimOptions } from '../game/entities';
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

/** Khoảng cách (m) boss Lộ Linh hiện trước người chơi. */
const KIEU_BOSS_DIST = 14;

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
  /** Pha boss Lộ Linh (cầu 9) tối đa chừng này (ms) kể từ lúc boss hiện. */
  static BOSS_MAX_MS = 900_000;
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
    // Cầu 9: chỗ cắm boss Lộ Linh (PR boss): nếu có pha boss thì pha đó tự ghi cầu khi boss gục, không ghi ngay ở đây.
    if (n === 9 && this.kieuBossPhase(p, elapsedSec)) return;
    this.sim.kieu.onClear(p, n, { present: true, contributed: true, elapsedSec });
  }

  /**
   * Chỗ cắm boss Lộ Linh (`KIEU_BOSS_ID` = `boss_lo_linh`) của cầu 9 (TN-7). Gọi sau khi Hồn kiếp (`huyen_hon`) qua trọn vẹn, `elapsedSec` là giờ đã trôi
   * (đủ để pha boss tự gọi `onClear`); trả true nếu một pha boss đã tiếp quản (khi đó pha đó phải gọi `this.sim.kieu.onClear(p, 9, …)` khi boss gục,
   * dùng `spawnTribBoss(p, KIEU_BOSS_ID, dist)`). Hiện chưa có boss: trả false, cầu ghi ngay khi Hồn kiếp xong. Room kiếp chứa được thực thể boss
   * (`GameSim.spawnTribBoss`, như Nhật Thực Dực Chủ), nên không cần tách room riêng cho boss.
   */
  protected kieuBossPhase(p: PlayerEnt, elapsedSec: number): boolean {
    const mon = this.sim.spawnTribBoss(p, KIEU_BOSS_ID, KIEU_BOSS_DIST);
    if (!mon) return false;
    this.kieuBoss = { mon, sid: p.sid, base: elapsedSec, at: Date.now() };
    this.idleSince = 0;
    this.sim.sys(p, 'sys.kieu_lo_linh', undefined, 'info');
    return true;
  }

  /** Pha boss Lộ Linh đang chạy (cầu 9): boss, người đánh, giờ đã trôi trước pha (Hồn kiếp) và lúc bắt đầu pha. */
  private kieuBoss: { mon: MonEnt; sid: string; base: number; at: number } | null = null;

  /**
   * Nhịp kiểm pha boss: boss gục → SERVER ghi cầu (`onClear`, giờ = Hồn kiếp + pha boss, người còn trong room); người đánh chết/rời hoặc quá `BOSS_MAX_MS`
   * thì bỏ pha (không ghi, vé cấp lại như mọi lần thua), room về nếp cũ (đóng sau `LINGER_MS`). Trả true nếu pha còn chạy (giữ phòng, không đưa ai về).
   */
  private tickKieuBoss(): boolean {
    const b = this.kieuBoss;
    if (!b) return false;
    const p = this.sim.players.get(b.sid);
    if (b.mon.state === MS_DEAD) {
      this.kieuBoss = null;
      if (p && p.connected && (p.s.fl & PF_DEAD) === 0) {
        const r = this.sim.kieu.onClear(p, 9, { present: true, contributed: true, elapsedSec: b.base + (Date.now() - b.at) / 1000 });
        // Không ghi được (quá nhanh bất thường, lỗi DB): báo người chơi, đừng để mất kết quả trong im lặng.
        if (r === 'anomaly' || r === 'db') this.sim.sys(p, 'sys.kieu_clear_fail', undefined, 'bad');
      }
      return false;
    }
    if (!p || !p.connected || (p.s.fl & PF_DEAD) !== 0 || Date.now() - b.at > TribulationRoom.BOSS_MAX_MS) {
      this.kieuBoss = null;
      return false;
    }
    return true;
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
    const active = [...this.sim.players.values()].some((p) => p.trib) || this.tickKieuBoss();
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
