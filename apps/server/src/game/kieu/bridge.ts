// Phòng cầu Cửu Kiều (TN-7): phần luật của một lượt qua cầu mà room không nên tự giữ. Room (rooms/kieu.ts) chỉ nối dây.
//  - Bộ đếm đóng góp do SERVER giữ: `SimHost.onPlayerHitMonster` báo mỗi lần người chơi gây sát thương lên quái; chưa ra đòn nào thì không được ghi cầu.
//  - Đợt Kiếm Ảnh: mỗi người sống gặp bóng của chính mình; bóng định kỳ giáng vùng nổ xuống chỗ chủ đang đứng.
//  - Xong cầu: với từng người CÓ MẶT trong room, gọi `KieuSystem.onClear` (nơi kiểm thời gian tối thiểu, lần đầu/luyện lại, ghi bằng transaction).
// Không có tin nào từ client quyết định cầu đã qua hay chưa.
import { MS_DEAD, playerBaseStats, shadowStats, type WaveDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from '../entities';
import type { KieuClearResult } from './index';

export interface BridgeCtx {
  now(): number;
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o?: { level?: number }): MonEnt | null;
  /** Vùng nổ báo trước `delay` giây tại (x, z), sát thương = `mul` × `atk` của nguồn. */
  strike(x: number, z: number, r: number, delay: number, mul: number, src: string, atk: number): void;
  sys(p: PlayerEnt, key: string, params?: Record<string, string | number>, type?: 'good' | 'bad' | 'info' | 'xp'): void;
  clear(p: PlayerEnt, n: number, o: { present: boolean; contributed: boolean; elapsedSec: number }): KieuClearResult;
}

interface ShadowRt {
  mon: MonEnt;
  owner: string;
  nextAt: number;
}

export class KieuBridge {
  /** Lúc đợt quái đầu bắt đầu (ms); 0 = chưa bắt đầu. Thời gian qua cầu tính từ đây. */
  startedAt = 0;
  readonly contributed = new Set<number>();
  private shadows: ShadowRt[] = [];
  private cfg: NonNullable<WaveDef['shadow']> | null = null;

  constructor(
    readonly n: number,
    private readonly c: BridgeCtx,
  ) {}

  /** Đợt đầu bắt đầu: mốc tính thời gian tối thiểu. */
  begin(): void {
    if (!this.startedAt) this.startedAt = this.c.now();
  }

  /** Người chơi vừa gây sát thương lên một quái trong phòng: ghi đóng góp. */
  noteHit(p: PlayerEnt): void {
    this.contributed.add(p.char.id);
  }

  /** Đợt Kiếm Ảnh: sinh bóng cho từng người sống. Trả số bóng. */
  startShadowWave(cfg: NonNullable<WaveDef['shadow']>): number {
    this.cfg = cfg;
    this.shadows = [];
    const now = this.c.now();
    for (const p of this.c.players()) {
      if (this.c.isDead(p)) continue;
      const ch = p.char;
      // Sàn gear-độc lập: tháo đồ rồi mặc lại trong phòng không làm bóng yếu đi (bóng không thể yếu hơn chỉ số nền theo cấp).
      const floor = playerBaseStats(ch.level);
      const base = shadowStats(ch.level, Math.max(ch.atk, floor.atk), Math.max(ch.def, floor.def));
      const mon = this.c.spawnShadow(
        p,
        {
          hp: Math.max(1, Math.round(Math.max(ch.mhp, floor.hp) * cfg.hpMul)),
          atk: Math.max(1, Math.round(base.atk * cfg.atkMul)),
          def: base.def,
        },
        { level: ch.level },
      );
      if (!mon) continue;
      this.shadows.push({ mon, owner: p.sid, nextAt: now + cfg.strikeEvery * 1000 });
      this.c.sys(p, 'sys.kieu_shadow', undefined, 'bad');
    }
    return this.shadows.length;
  }

  /** Định kỳ (~500 ms): bóng còn sống giáng vùng nổ xuống chỗ chủ; bóng của người đã chết/rời room không giáng. */
  tick(): void {
    const cfg = this.cfg;
    if (!cfg || this.shadows.length === 0) return;
    const now = this.c.now();
    const byId = new Map<string, PlayerEnt>();
    for (const p of this.c.players()) byId.set(p.sid, p);
    for (const sh of this.shadows) {
      if (sh.mon.state === MS_DEAD || now < sh.nextAt) continue;
      sh.nextAt = now + cfg.strikeEvery * 1000;
      const p = byId.get(sh.owner);
      if (!p || this.c.isDead(p)) continue;
      this.c.strike(p.move.x, p.move.z, cfg.r, 1.2, cfg.mul, sh.mon.id, sh.mon.atk);
    }
  }

  /** Cầu đã qua: ghi cho mọi người có mặt. Trả số người được ghi (`ok` hoặc `dup`). */
  finish(): number {
    const elapsedSec = this.startedAt ? (this.c.now() - this.startedAt) / 1000 : 0;
    let ok = 0;
    for (const p of this.c.players()) {
      const r = this.c.clear(p, this.n, { present: true, contributed: this.contributed.has(p.char.id), elapsedSec });
      if (r === 'ok' || r === 'dup') ok++;
    }
    return ok;
  }
}
