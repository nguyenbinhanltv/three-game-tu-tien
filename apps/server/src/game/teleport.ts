// Truyền Tống Trận (M-4). Server quyết định tất cả: mở khóa khi đứng sát trận, niệm 3 s, hủy khi di chuyển/bị đánh/giao chiến,
// không dùng khi chết, độ kiếp, tâm ma, tỉ thí, đang ra chiêu, ngoài thế giới chính; hồi chiêu 30 s. Sim chỉ nối (xem GameSim.tele).

import {
  PF_DEAD,
  S,
  SECT,
  TELE_ARRIVE_OFFSET,
  TELE_CAST_LEVEL_MS,
  TELE_CAST_MS,
  TELE_CD_MS,
  TELE_CMD_GAP_MS,
  TELE_MOVE_CANCEL,
  TELE_PAD,
  TELE_PADS,
  TELE_TOUCH_R,
  type TeleCmd,
  type TeleMsg,
} from '@dtl/shared';
import { t } from '@dtl/content';
import type { PlayerEnt } from './sim';

export interface TeleHost {
  now(): number;
  /** Chỉ bản đồ thế giới có trận (bí cảnh thì không). */
  inWorld(): boolean;
  /** Id level của room này. */
  level(): string;
  /** Truyền tống sang level khác (room cấp vé, kiểm điều kiện, báo client đổi room). false = bị chặn. */
  transfer(p: PlayerEnt, level: string, x: number, z: number): boolean;
  players(): Iterable<PlayerEnt>;
  inCombat(p: PlayerEnt): boolean;
  inDuel(p: PlayerEnt): boolean;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  teleportTo(p: PlayerEnt, x: number, z: number): boolean;
  stopMeditate(p: PlayerEnt): void;
}

interface Cast {
  id: string;
  until: number;
  x: number;
  z: number;
  /** `lastCombatAt` lúc bắt đầu: đổi tức là vừa trúng đòn/ra đòn. */
  combatAt: number;
}

/** Nhịp kiểm tra chạm trận và tiến độ niệm (ms). */
const STEP_MS = 200;

/** Hồi chiêu theo nhân vật, sống ở cấp tiến trình để chuyển room không xóa được hồi chiêu. */
const cdUntil = new Map<number, number>();

// Truyền tống liên level (E1-B): niệm 5 s; sang level khác thì đi qua `transfer` (vé một lần + đổi room), cùng hồi chiêu 30 s.
export class TeleportSystem {
  private casts = new Map<string, Cast>();
  private cmdAt = new Map<string, number>();
  private stepAt = 0;

  constructor(private h: TeleHost) {}

  /** Gửi trạng thái mới nhất cho người chơi (khi vào room, mở khóa, bắt đầu/hết niệm). */
  sendState(p: PlayerEnt): void {
    if (!p.connected) return;
    const now = this.h.now();
    const c = this.casts.get(p.sid);
    const msg: TeleMsg = {
      open: p.char.teleOpen(),
      cast: c ? { id: c.id, ms: Math.max(0, c.until - now) } : null,
      cd: Math.max(0, (cdUntil.get(p.char.id) ?? 0) - now),
    };
    p.client.send(S.TELE, msg);
  }

  drop(p: PlayerEnt): void {
    this.casts.delete(p.sid);
    this.cmdAt.delete(p.sid);
  }

  /** Lý do chưa dùng được (khóa i18n `sys.tele_*`), '' nếu được. Dùng cả lúc bắt đầu niệm lẫn lúc kết thúc. */
  private blocker(p: PlayerEnt): string {
    if (!this.h.inWorld()) return 'sys.tele_here';
    if ((p.s.fl & PF_DEAD) !== 0) return 'sys.tele_dead';
    if (p.trib || p.trial || this.h.inDuel(p) || p.casting) return 'sys.tele_busy';
    if (this.h.inCombat(p)) return 'sys.tele_combat';
    return '';
  }

  command(p: PlayerEnt, msg: unknown): void {
    const m = (msg ?? {}) as Partial<TeleCmd>;
    const now = this.h.now();
    // Giãn lệnh: spam không tạo thêm việc cho server ngoài một phép so sánh.
    if (now - (this.cmdAt.get(p.sid) ?? 0) < TELE_CMD_GAP_MS) return;
    this.cmdAt.set(p.sid, now);
    if (m.id === undefined || m.id === '') {
      if (this.casts.delete(p.sid)) {
        this.h.sys(p, 'sys.tele_cancel', undefined, 'info');
        this.sendState(p);
      }
      return;
    }
    if (typeof m.id !== 'string') return;
    const pad = TELE_PAD.get(m.id);
    if (!pad || !p.char.teleOpen().includes(pad.id)) return this.h.warn(p, 'sys.tele_locked');
    const why = this.blocker(p);
    if (why) return this.h.warn(p, why);
    if (this.casts.has(p.sid)) return this.h.warn(p, 'sys.tele_busy');
    const left = (cdUntil.get(p.char.id) ?? 0) - now;
    if (left > 0) return this.h.warn(p, 'sys.tele_cd', { s: Math.ceil(left / 1000) });
    this.h.stopMeditate(p);
    const ms = pad.level === this.h.level() ? TELE_CAST_MS : TELE_CAST_LEVEL_MS;
    this.casts.set(p.sid, { id: pad.id, until: now + ms, x: p.move.x, z: p.move.z, combatAt: p.lastCombatAt });
    this.h.sys(p, 'sys.tele_start', { n: t(`tele.${pad.id}`) }, 'info');
    this.sendState(p);
  }

  /** Gọi mỗi tick của sim; tự giãn còn mỗi `STEP_MS`. */
  tick(): void {
    const now = this.h.now();
    if (now - this.stepAt < STEP_MS) return;
    this.stepAt = now;
    if (!this.h.inWorld()) return;
    for (const p of this.h.players()) {
      if (!p.connected || (p.s.fl & PF_DEAD) !== 0) {
        if (this.casts.delete(p.sid)) this.sendState(p);
        continue;
      }
      this.touch(p);
      const c = this.casts.get(p.sid);
      if (!c) continue;
      const moved = Math.hypot(p.move.x - c.x, p.move.z - c.z) > TELE_MOVE_CANCEL;
      const hit = p.lastCombatAt !== c.combatAt || this.blocker(p) !== '';
      if (moved || hit) {
        this.casts.delete(p.sid);
        this.h.sys(p, moved ? 'sys.tele_moved' : 'sys.tele_broken', undefined, 'bad');
        this.sendState(p);
        continue;
      }
      if (now >= c.until) this.arrive(p, c);
    }
  }

  /** Đứng sát trận chưa mở thì mở khóa (lần đầu), lưu DB ngay. */
  private touch(p: PlayerEnt): void {
    const level = this.h.level();
    for (const pad of TELE_PADS) {
      if (pad.level !== level) continue;
      if (Math.hypot(p.move.x - pad.x, p.move.z - pad.z) > TELE_TOUCH_R) continue;
      if (p.char.unlockTele(pad.id)) {
        this.h.sys(p, 'sys.tele_unlock', { n: t(`tele.${pad.id}`) }, 'good');
        this.sendState(p);
      }
    }
  }

  private arrive(p: PlayerEnt, c: Cast): void {
    this.casts.delete(p.sid);
    const pad = TELE_PAD.get(c.id);
    if (!pad || !p.char.teleOpen().includes(pad.id)) return this.sendState(p);
    // Đích: lệch vài mét về phía tông môn để không đứng đè lên mô hình trận.
    const face = pad.face ?? SECT;
    let dx = face.x - pad.x;
    let dz = face.z - pad.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const x = pad.x + dx * TELE_ARRIVE_OFFSET;
    const z = pad.z + dz * TELE_ARRIVE_OFFSET;
    const ok = pad.level === this.h.level() ? this.h.teleportTo(p, x, z) : this.h.transfer(p, pad.level, x, z);
    if (!ok) return this.sendState(p);
    cdUntil.set(p.char.id, this.h.now() + TELE_CD_MS);
    this.h.sys(p, 'sys.tele_done', { n: t(`tele.${pad.id}`) }, 'good');
    this.sendState(p);
  }

  /** Lệnh GM `tele all|none|<id>`: mở khóa để thử (chỉ tài khoản thử). Trả câu trả lời. */
  gm(p: PlayerEnt, arg: string | undefined): string {
    if (arg === 'cd') {
      cdUntil.delete(p.char.id);
      this.sendState(p);
      return 'tele cd = 0';
    }
    if (arg === 'none') {
      p.char.tele = [];
      p.char.save();
    } else if (arg === 'all') for (const pad of TELE_PADS) p.char.unlockTele(pad.id);
    else if (arg && TELE_PAD.has(arg)) p.char.unlockTele(arg);
    else return 'tele all | none | cd | ' + TELE_PADS.map((x) => x.id).join(' | ');
    this.sendState(p);
    return 'đã mở: ' + p.char.teleOpen().join(', ');
  }

  /** Cho test. */
  static resetCooldowns(): void {
    cdUntil.clear();
  }
}
