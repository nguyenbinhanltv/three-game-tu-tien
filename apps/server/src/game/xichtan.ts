// Xích Tẫn Khích (DV-3D): hai cơ chế riêng của phó bản chương 5. Server phán định mọi thứ; client chỉ vẽ vạch (hazard `pool`) và đọc thông báo hệ thống.
//  - Giữ bia (đợt 4): Trấn Giới Bia, cần người còn sống đứng trong vòng đủ `secs` giây cộng dồn. Trống người quá `grace` giây thì bia tắt:
//    giới áp (mỗi giây mọi người mất `press` × khí huyết tối đa), tiến độ không tăng. Quái tiếp viện kéo tới theo tiến độ.
//  - Khe mạch (đợt 6, pha 3 của Tử Quang Dực Chủ): kéo boss đang niệm chú đứng lên khe thì chú bị phản lại (mất thế, mất một tầng "cháy");
//    hết tầng thì boss dừng ở 1 máu, thành Tịnh Quang (không có cảnh giết).
// Cấu hình: `WaveDef.steles` (levels/xich_tan_khich.json), `MonsterDef.rift` (monsters.json). Hàm thuần có test ở xichtan.test.ts.

import { MS_DEAD, type MonsterRift, type WaveDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './entities';

import { at } from '@dtl/shared';
type SteleDef = NonNullable<WaveDef['steles']>;

/** Có người còn sống (không phải nguyên anh xuất khiếu) trong vòng bán kính `r` quanh (x, z) không. */
export function occupied(pts: readonly { x: number; z: number }[], x: number, z: number, r: number): boolean {
  return pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= r * r);
}

export interface SteleStep {
  held: number;
  empty: number;
  /** Bia đang tắt (trống quá `grace` giây): có giới áp. */
  off: boolean;
}

/** Bước `dt` giây: có người thì cộng tiến độ và xóa đếm trống; trống thì đếm, quá `grace` thì tắt (không cộng). */
export function stepStele(held: number, empty: number, dt: number, has: boolean, grace: number, secs: number): SteleStep {
  if (has) return { held: Math.min(secs, held + dt), empty: 0, off: false };
  const e = empty + dt;
  return { held, empty: e, off: e > grace };
}

/** Các mốc tiếp viện `at` mà tiến độ vừa vượt qua (chưa phát: `done`). */
export function dueReinforce(held: number, done: number, list: readonly { at: number }[]): number[] {
  const out: number[] = [];
  for (let i = done; i < list.length; i++) if (held >= at(list, i).at) out.push(i);
  return out;
}

/** Boss có đang đứng trên một khe mạch không (trả chỉ số khe, hoặc -1). */
export function veinUnder(rift: MonsterRift, x: number, z: number): number {
  return rift.veins.findIndex((v) => (v.x - x) ** 2 + (v.z - z) ** 2 <= v.r * v.r);
}

export interface XichTanHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  isGhost(p: PlayerEnt): boolean;
  damagePlayer(p: PlayerEnt, n: number, src: string): void;
  marker(x: number, z: number, r: number, dur: number, kind: 'fire' | 'frost'): void;
  spawn(mon: string, level: number, x: number, z: number): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
}

/** Đợt giữ bia đang chạy. */
export class SteleHold {
  held = 0;
  private empty = 0;
  private done = 0;
  private last: number;
  private markAt = 0;
  private offNoted = false;
  private wasOn = false;

  constructor(
    private readonly h: XichTanHost,
    readonly def: SteleDef,
  ) {
    this.last = h.now();
  }

  get complete(): boolean {
    return this.held >= this.def.secs;
  }

  tick(): void {
    const d = this.def;
    const now = this.h.now();
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    if (this.complete) return;
    const pts: { x: number; z: number }[] = [];
    for (const p of this.h.players()) if (!this.h.isDead(p) && !this.h.isGhost(p)) pts.push({ x: p.move.x, z: p.move.z });
    const has = occupied(pts, d.x, d.z, d.r);
    const st = stepStele(this.held, this.empty, dt, has, d.grace, d.secs);
    this.held = st.held;
    this.empty = st.empty;
    if (has && !this.wasOn) this.h.sysAll('sys.xt_stele_on', undefined, 'good');
    this.wasOn = has;
    if (st.off) {
      if (!this.offNoted) {
        this.offNoted = true;
        this.h.sysAll('sys.xt_stele_off', undefined, 'bad');
      }
      for (const p of this.h.players())
        if (!this.h.isDead(p) && !this.h.isGhost(p)) this.h.damagePlayer(p, Math.max(1, Math.round(p.s.mhp * d.press * dt)), 'xt_press');
    } else this.offNoted = false;
    for (const i of dueReinforce(this.held, this.done, d.reinforce)) {
      const g = d.reinforce[i];
      if (!g) continue;
      this.done = i + 1;
      for (let k = 0; k < g.n; k++) {
        const a = (k / Math.max(1, g.n)) * Math.PI * 2;
        this.h.spawn(g.mon, g.level, d.x + Math.cos(a) * (d.r + 6), d.z + Math.sin(a) * (d.r + 6));
      }
      this.h.sysAll('sys.xt_stele_wave', undefined, 'info');
    }
    if (this.complete) {
      this.h.sysAll('sys.xt_stele_done', undefined, 'good');
      return;
    }
    if (now >= this.markAt) {
      this.markAt = now + 2500;
      this.h.marker(d.x, d.z, d.r, 3, st.off ? 'fire' : 'frost');
    }
  }
}

export interface RiftHost {
  now(): number;
  monsters(): readonly MonEnt[];
  /** Boss mất thế `sec` giây (cắt chú đang niệm). */
  stagger(m: MonEnt, sec: number): void;
  /** Gột xong: boss (đang ở 1 máu) hạ qua đường giết chung; hủy vùng đã thả. */
  purify(m: MonEnt): void;
  marker(x: number, z: number, r: number, dur: number, kind: 'frost'): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
}

/** Khe mạch của một boss `rift`; tạo khi boss xuất hiện (đợt cuối), `tick` mỗi 250 ms. */
export class RiftVeins {
  /** Số tầng cháy còn lại (-1 khi chưa thấy boss). */
  burn = -1;
  private markAt = 0;
  private lastChant = 0;
  private said = false;

  constructor(private readonly h: RiftHost) {}

  tick(): void {
    const m = this.h.monsters().find((x) => x.def.rift && x.state !== MS_DEAD && x.s.hp > 0);
    const rift = m?.def.rift;
    if (!m || !rift) return;
    if (this.burn < 0) this.burn = rift.burn;
    if (m.phase < rift.phase) return;
    const now = this.h.now();
    if (!this.said) {
      this.said = true;
      this.h.sysAll('sys.xt_veins', { n: rift.burn }, 'info');
    }
    if (now >= this.markAt) {
      this.markAt = now + 4000;
      for (const v of rift.veins) this.h.marker(v.x, v.z, v.r, 5, 'frost');
    }
    if (!m.chant || m.chant.startAt === this.lastChant) return;
    if (veinUnder(rift, m.s.x, m.s.z) < 0) return;
    this.lastChant = m.chant.startAt;
    this.burn--;
    if (this.burn <= 0) {
      this.h.sysAll('sys.xt_purified', undefined, 'good');
      this.h.purify(m);
      return;
    }
    this.h.stagger(m, rift.weak);
    this.h.sysAll('sys.xt_vein_hit', { n: this.burn }, 'good');
  }
}
