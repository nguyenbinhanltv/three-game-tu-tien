// Hình MÔI TRƯỜNG (Họa Pháp Lô 2, PR3): xoáy nước/khe nứt trên cổng, đốm linh khí trên điểm hái (linh thảo), lá bung khi hái, cánh hạc khi hồi sinh.
// Timeline `fx_env_*` (sinh bởi `tools/vfx-forge/trung-don.mjs`) phát lại theo chu kỳ khi ở gần, qua `FxRunner.startAt` (dùng chung hồ vật liệu `FxPool`).
// Chỉ là lớp hình: cổng, điểm hái, hồi sinh do server quyết định. Không thêm vật thể (không bia, không rương).
// Ngân sách: tối đa `ENV_MAX_HERBS` điểm hái gần nhất có đốm, cổng chỉ vẽ khi ≤ `ENV_GATE_DIST`; bỏ khi đông FX.

import { FX_TIMELINE } from '@dtl/content';
import type { FxCaster, FxRunner } from './fxTimeline';
import { OTHERS_FX_LIVE_MAX } from './fxBudget';

export const ENV_GATE_DIST = 60;
export const ENV_HERB_DIST = 28;
export const ENV_MAX_HERBS = 6;
export const ENV_GATE_PERIOD = 1.4;
export const ENV_HERB_PERIOD = 1.6;
/** Nhịp quét (giây). */
const SCAN_EVERY = 0.25;

export interface EnvGate {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Cổng phẳng trên nền (hang, cổng ra) hay cổng đứng. */
  flat: boolean;
  /** Cao tới tâm cổng đứng (m). */
  center: number;
}

export interface EnvHerb {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface EnvPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Cao tới ngực (m). */
  chest: number;
}

interface EnvEnv {
  camera(): { position: { x: number; z: number } };
  live(): number;
  /** Điểm hái đang có cây (đã lọc `on`). */
  herbs(): Iterable<EnvHerb>;
  /** Cổng của level đang chơi. */
  gates(): Iterable<EnvGate>;
}

const NO_ACTOR: FxCaster = { x: 0, y: 0, z: 0, yaw: 0, model: {} };

export class EnvFx {
  private next = new Map<string, number>();
  private acc = 0;
  private clock = 0;
  /** Phòng thử: bỏ quét theo cảnh, chỉ `labPlay`. */
  lab = false;
  readonly log: { key: string; id: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: EnvEnv,
  ) {}

  private start(key: string, p: EnvPoint, mine: boolean, palette: string): boolean {
    const tl = FX_TIMELINE.get(key);
    if (!tl) return false;
    this.runner.startAt(tl, {
      actor: { ...NO_ACTOR, x: p.x, y: p.y, z: p.z },
      palette,
      tgt: { x: p.x, y: p.y, z: p.z, chest: p.chest },
      mine,
    });
    if (import.meta.env.DEV) {
      this.log.push({ key, id: p.id, at: performance.now() });
      if (this.log.length > 200) this.log.shift();
    }
    return true;
  }

  private due(k: string, period: number): boolean {
    if (this.clock < (this.next.get(k) ?? 0)) return false;
    this.next.set(k, this.clock + period);
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    this.acc += dt;
    if (this.acc < SCAN_EVERY) return;
    this.acc = 0;
    if (this.lab) return;
    const c = this.env.camera().position;
    const crowded = this.env.live() >= OTHERS_FX_LIVE_MAX;
    for (const g of this.env.gates()) {
      if (Math.hypot(g.x - c.x, g.z - c.z) > ENV_GATE_DIST || !this.due('g:' + g.id, ENV_GATE_PERIOD)) continue;
      this.start(
        g.flat ? 'fx_env_gate_flat' : 'fx_env_gate',
        { id: g.id, x: g.x, y: g.y, z: g.z, chest: g.flat ? 1.15 : g.center },
        false,
        'env_gate',
      );
    }
    if (crowded) return;
    const near: { h: EnvHerb; d: number }[] = [];
    for (const h of this.env.herbs()) {
      const d = Math.hypot(h.x - c.x, h.z - c.z);
      if (d <= ENV_HERB_DIST) near.push({ h, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { h } of near.slice(0, ENV_MAX_HERBS)) {
      if (this.due('h:' + h.id, ENV_HERB_PERIOD))
        this.start('fx_env_herb', { id: h.id, x: h.x, y: h.y, z: h.z, chest: 0.4 }, false, 'hit_heal');
    }
    if (this.next.size > 96) for (const [k, at] of this.next) if (this.clock - at > 6) this.next.delete(k);
  }

  /** Vừa hái một điểm: lá bung + mầm. */
  gather(p: EnvPoint, mine: boolean): void {
    this.start('fx_env_gather', p, mine, 'hit_heal');
  }

  /** Người vừa hồi sinh (mình hoặc người khác): cánh hạc + lông vũ + gợn nước, không cột sáng. */
  revive(p: EnvPoint, mine: boolean, force = false): void {
    if (!force && !mine && this.env.live() >= OTHERS_FX_LIVE_MAX) return;
    this.start('fx_env_revive', p, mine, 'env_revive');
  }

  /** Phòng thử: phát thẳng một timeline môi trường. */
  labPlay(key: string, p: EnvPoint): boolean {
    const pal = key === 'fx_env_revive' ? 'env_revive' : key.startsWith('fx_env_gate') ? 'env_gate' : 'hit_heal';
    return this.start(key, p, true, pal);
  }
}
