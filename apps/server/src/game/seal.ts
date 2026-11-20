// Đợt phong ấn của Thần Tàng Điện (E4-C): ba cửa đóng kín, mở bằng nguyên anh xuất khiếu chạm trận môn bên trong tường
// hoặc bằng Phá Ấn Phù dùng ngay trước cửa. Server phán định; người bằng xương thịt bị chặn ở ngoài hốc (`bar` m quanh trận môn).
// Hàm thuần: `nearestClosed`, `barrierPush`.

import { PF_DEAD, type WaveDef } from '@dtl/shared';
import type { PlayerEnt } from './entities';

import { at } from '@dtl/shared';
type SealsDef = NonNullable<WaveDef['seals']>;

/** Cửa đóng gần nhất (theo chỗ đứng của cửa, không phải trận môn) trong `r` m; -1 nếu không có. */
export function nearestClosed(def: SealsDef, open: readonly boolean[], x: number, z: number, r: number): number {
  let best = -1;
  let bd = r;
  def.doors.forEach((d, i) => {
    if (open[i]) return;
    const dd = Math.hypot(x - d.x, z - d.z);
    if (dd <= bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
}

/** Nếu (x, z) lọt vào vùng chặn quanh trận môn của cửa đóng, trả điểm đẩy ra (trước cửa, `bar`+1 m tính từ trận môn về phía cửa); không thì null. */
export function barrierPush(def: SealsDef, open: readonly boolean[], x: number, z: number): { x: number; z: number } | null {
  for (let i = 0; i < def.doors.length; i++) {
    if (open[i]) continue;
    const d = at(def.doors, i);
    const dist = Math.hypot(x - d.gx, z - d.gz);
    if (dist >= def.bar) continue;
    const dx = d.x - d.gx;
    const dz = d.z - d.gz;
    const len = Math.hypot(dx, dz) || 1;
    // Điểm đẩy nằm trên đường trận môn → cửa, cách trận môn `bar + 1` m (tức ngoài hốc, phía cửa).
    return { x: d.gx + (dx / len) * (def.bar + 1), z: d.gz + (dz / len) * (def.bar + 1) };
  }
  return null;
}

/** Quá chừng này (ms) không mở thêm được cửa nào thì tự lỏng một cửa (chống kẹt khi hết bùa). */
export const STALL_MS = 180_000;

interface SealHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  isGhost(p: PlayerEnt): boolean;
  teleport(p: PlayerEnt, x: number, z: number): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
  /** Mỗi cửa mở: kéo quái tiếp viện. */
  onOpen(index: number, count: number): void;
  /** Dấu hiệu cửa trên sàn (vòng sáng đỏ đang đóng, lục khi mở). */
  marker(x: number, z: number, r: number, dur: number, open: boolean): void;
}

export class SealSystem {
  private open: boolean[];
  private markAt = 0;
  private lastProgress: number;
  private warnAt = new Map<string, number>();

  constructor(
    private readonly h: SealHost,
    private readonly def: SealsDef,
  ) {
    this.open = def.doors.map(() => false);
    this.lastProgress = h.now();
  }

  get count(): number {
    return this.open.filter(Boolean).length;
  }

  get all(): boolean {
    return this.count === this.def.doors.length;
  }

  isOpen(i: number): boolean {
    return !!this.open[i];
  }

  private unlock(i: number): void {
    if (this.open[i]) return;
    this.open[i] = true;
    this.lastProgress = this.h.now();
    this.h.sysAll('sys.seal_open', { n: i + 1, m: this.count, t: this.def.doors.length }, 'good');
    const door = this.def.doors[i];
    if (door) this.h.marker(door.x, door.z, 4, 20, true);
    this.h.onOpen(i, this.count);
    if (this.all) this.h.sysAll('sys.seal_all', undefined, 'good');
  }

  /** Phá Ấn Phù, bước 1: cửa đóng gần nhất trong `phuR` m (-1 nếu không có). Chưa mở gì; sim trừ bùa xong mới gọi `unlockDoor`. */
  peekTalisman(p: PlayerEnt): number {
    return nearestClosed(this.def, this.open, p.move.x, p.move.z, this.def.phuR);
  }

  /** Phá Ấn Phù, bước 2 (sau khi tx trừ bùa thành công). */
  unlockDoor(i: number): void {
    this.unlock(i);
  }

  tick(): void {
    const now = this.h.now();
    if (now >= this.markAt) {
      this.markAt = now + 6000;
      this.def.doors.forEach((d, i) => {
        if (!this.open[i]) this.h.marker(d.x, d.z, 4, 7, false);
      });
    }
    // Chống kẹt cứng (hết bùa, X đang hồi): quá `STALL_MS` không mở thêm được cửa nào thì phong ấn tự lỏng ra một cửa.
    if (!this.all && now - this.lastProgress >= STALL_MS) {
      const i = this.open.findIndex((o) => !o);
      this.h.sysAll('sys.seal_loosen', undefined, 'info');
      this.unlock(i);
    }
    for (const p of this.h.players()) {
      if (this.h.isDead(p) || (p.s.fl & PF_DEAD) !== 0) continue;
      if (this.h.isGhost(p)) {
        // Nguyên anh chạm trận môn bên trong tường thì mở cửa.
        // Một lượt chạm mở tối đa một cửa.
        const hit = this.def.doors.findIndex((d, i) => !this.open[i] && Math.hypot(p.move.x - d.gx, p.move.z - d.gz) <= this.def.touch);
        if (hit >= 0) this.unlock(hit);
        continue;
      }
      const push = barrierPush(this.def, this.open, p.move.x, p.move.z);
      if (!push) continue;
      this.h.teleport(p, push.x, push.z);
      if (now >= (this.warnAt.get(p.sid) ?? 0)) {
        this.warnAt.set(p.sid, now + 4000);
        this.h.sys(p, 'sys.seal_barrier', undefined, 'bad');
        this.h.sys(p, 'sys.seal_need', undefined, 'info');
      }
    }
  }
}
