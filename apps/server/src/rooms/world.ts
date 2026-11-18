// Room bản đồ thế giới (R-7, tách từ rooms.ts).
import { Room, ServerError } from 'colyseus';
import { C, HOME_LEVEL, PF_DEAD, SPAWN_POINT, TELE_PARTY_R, worldRoomName } from '@dtl/shared';
import { LEVELS, realmName, t } from '@dtl/content';
import { ERR_NO_TICKET } from '../auth';
import { parties } from '../game/party';
import type { PlayerEnt, SimOptions } from '../game/entities';
import { tickets } from '../transfer';
import { randomUUID } from 'node:crypto';
import { GameRoom, type JoinAuth } from './base';

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
    const name = t('dungeon.' + portal.to + '.name');
    if ((p.s.fl & PF_DEAD) !== 0 || p.trib || p.trial) return this.sim.sys(p, 'sys.busy', undefined, 'bad');
    if (p.char.level < d.minLevel) return this.sim.sys(p, 'sys.dungeon_level', { realm: realmName(d.minLevel), name }, 'bad');
    // Mỗi lượt vào là một room riêng (khóa `dgKey` chia sẻ cho đồng đội đi cùng); đồng đội cùng tổ đội trong tầm được kéo theo
    // nếu đủ cấp và rảnh, người khác không lọt vào room này.
    const opts: Record<string, string> = d.private ? { dgKey: randomUUID() } : {};
    const mates: PlayerEnt[] = [];
    if (d.private && parties.partyOf(p.char.id)) {
      for (const m of parties.matesInRoom(p.char.id, this)) {
        if (m === p || m.char.id === p.char.id || m.char.level < d.minLevel || this.sim.leaveBlocker(m)) continue;
        if (Math.hypot(m.move.x - p.move.x, m.move.z - p.move.z) <= TELE_PARTY_R) mates.push(m);
      }
    }
    tickets.issue(p.char.id, portal.to, null, undefined, opts.dgKey);
    this.sendTransfer(p, portal.to, opts);
    for (const m of mates.slice(0, 4)) {
      tickets.issue(m.char.id, portal.to, null, undefined, opts.dgKey);
      this.sendTransfer(m, portal.to, opts);
    }
  }
}

async function worldAuth(cls: { levelId: string }, token: string, options: unknown): Promise<JoinAuth> {
  const auth = await GameRoom.onAuth(token, options);
  const t = tickets.take(auth.charId, cls.levelId);
  if (!t && cls.levelId !== HOME_LEVEL) throw new ServerError(ERR_NO_TICKET, 'no_ticket');
  return { ...auth, spawn: t?.spawn ?? null, ticket: !!t };
}

/** Lớp room cho một bản đồ thế giới (E1-B): `world` cho Vân Lam, `world-<id>` cho level khác. */
export function defineWorld(levelId: string): typeof WorldRoom {
  if (!LEVELS[levelId] || LEVELS[levelId].dungeon) throw new Error(`defineWorld: ${levelId} không phải bản đồ thế giới`);
  if (levelId === HOME_LEVEL) return WorldRoom;
  return class extends WorldRoom {
    static levelId = levelId;
  };
}

/** Bí cảnh: mỗi room là một lượt của tối đa 5 người, đánh qua các đợt trong `levels/<id>.json` (E1-B, E2-C). */
