// VFX theo nhịp ba pha của chiêu (K-6), gắn vào `Game.onSkillEvent` (K-4): tụ lực lúc `windup`, bùng nổ đúng khung `hit`,
// tan (vòng chấn động + vệt mực nền sống lâu hơn lớp sáng 0,3 s). Vệt kiếm bám mũi kiếm lấy mẫu từ xương `dtl_sword`.
// Chỉ là lớp hình: server vẫn quyết định chiêu, mục tiêu và sát thương; các hiệu ứng riêng của từng chiêu (methodFx.ts,
// vfx.ts) vẫn phát theo S.FX như cũ, phần này thêm nhịp và vệt kiếm lên trên và chạy theo ngân sách mỗi chiêu.

import * as THREE from 'three/webgpu';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { PF_DEAD, skillTiming } from '@dtl/shared';
import type { SkillDef } from '@dtl/shared';
import type { FxMesh } from '../../render/materials/vfx';
import { SIGIL_CIRCLE } from '../../render/vfx/sigil';
import { BladeRibbon, bladeVisible, bladeWindow } from '../../render/vfx/bladeTrail';
import type { InkTiming } from '../../render/vfx/ink';
import {
  BURST_DUR,
  BURST_LEAD,
  capsFor,
  fadeFor,
  hdrGain,
  HDR_BURST,
  HDR_FADE,
  HDR_GATHER,
  INK_EXTRA,
  maxRadiusFor,
  tintOfMethod,
} from '../../render/vfx/phases';
import { OTHERS_FX_DIST, OTHERS_FX_LIVE_MAX } from './fxBudget';
import { G } from '../core/geo';
import type { SkillEvent } from '../character/view';
import { FxRunner, type FxRunnerEnv } from './fxTimeline';
import type { Vfx } from './vfx';

/** Cấp từ đó có linh quang hộ thể (Trúc Cơ). */
export const TRUC_CO_LEVEL = 16;
/** Bán kính, độ mờ tối đa của linh quang hộ thể (m, alpha). */
const AURA_RADIUS = 0.9;
const AURA_ALPHA = 0.25;
/** Giây không giao chiến thì linh quang hiện lên. */
const AURA_CALM = 4;

const RING_GEO = new THREE.RingGeometry(0.82, 1, 40);
const _p = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Người chơi như `SkillFx` cần đọc (khớp `PlayerVis`). */
interface SkillFxActor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  fl: number;
  lv: number;
  speed: number;
  model: {
    bladePoints?(b: THREE.Vector3, t: THREE.Vector3): boolean;
    performClock?(): { t: number; skill: string } | null;
    hit?: { hitStop(sec: number, delay?: number): void };
  };
}

interface SkillFxEnv {
  player(sid: string): SkillFxActor | undefined;
  mySid(): string;
  myMethod(): string | undefined;
  camera(): THREE.PerspectiveCamera;
  /** Phần của môi trường cho bộ chạy timeline (VFX-V0): mục tiêu, rung, chớp, âm thanh, cài đặt chất lượng. */
  fx: Omit<FxRunnerEnv, 'camera'>;
}

/** Loại `S.FX` kiểu cũ bị timeline thay thế cho chiêu có timeline (engine bỏ hình cũ). */
export function replacedFx(kind: string): boolean {
  for (const tl of FX_TIMELINE.values()) if (tl.replaces?.includes(kind)) return true;
  return false;
}

/** Timeline kích hoạt theo `S.FX` loại `kind` (đúng công pháp nếu timeline ghi `method`). */
export function fxTriggered(kind: string, method: string | undefined, variant?: string) {
  let fallback;
  for (const tl of FX_TIMELINE.values()) {
    if (tl.trigger !== 'fx' || tl.fxKind !== kind || (tl.method && tl.method !== method)) continue;
    if (tl.when === undefined) fallback ??= tl;
    else if (tl.when === variant) return tl;
  }
  return fallback;
}

/** Bùng nổ hẹn giờ: bắt đầu `BURST_LEAD` trước `hitAt` để đỉnh sáng rơi đúng hitAt (±0,05 s). */
interface PendingBurst {
  sid: string;
  index: number;
  def: SkillDef;
  mine: boolean;
  ult: boolean;
  color: number;
  /** Mốc nổ theo đồng hồ animation của model (giây từ lúc bấm) = hitAt − BURST_LEAD. */
  at: number;
  /** Dự phòng khi model không có đồng hồ animation: còn bao nhiêu giây (đồng hồ Vfx). */
  left: number;
}

interface BladeJob {
  sid: string;
  actor: SkillFxActor;
  color: number;
  t: number;
  start: number;
  end: number;
  rib: BladeRibbon | null;
}

/** Màu `def` theo công pháp: của mình theo công pháp đang chọn; người khác theo công pháp của chiêu (chiêu chung = kiếm tu). */
function tintFor(def: SkillDef, mine: boolean, myMethod: string | undefined): number {
  return tintOfMethod(mine ? (def.method ?? myMethod) : def.method);
}

/** Cho phép phát hiệu ứng của chiêu này không. Chiêu lướt không có mốc trúng nên bỏ. */
function wantsPhaseFx(def: SkillDef | undefined): def is SkillDef {
  return !!def && def.kind !== 'dash';
}

/** Người khác chỉ được vẽ khi gần và pool chưa đông (cùng quy tắc `skipOthersFx`, nhưng không đụng chiêu liên quan tới mình). */
function othersAllowed(dist: number, live: number): boolean {
  return dist <= OTHERS_FX_DIST && live < OTHERS_FX_LIVE_MAX;
}

export class SkillFx {
  private jobs: BladeJob[] = [];
  private pending: PendingBurst[] = [];
  /** Mốc đã nổ theo hẹn giờ (`sid:index`), để sự kiện hit đến sau không nổ lần hai. */
  private fired = new Set<string>();
  private aura: FxMesh | null = null;
  private combatUntil = 0;
  private clock = 0;
  /** Bộ chạy dòng thời gian hiệu ứng (VFX-V0). */
  readonly runner: FxRunner;
  /** Nhật ký dev (chỉ khi `import.meta.env.DEV`). */
  readonly log: { kind: string; skill: string; combo: number; t: number; at: number }[] = [];

  constructor(
    private v: Vfx,
    private env: SkillFxEnv,
  ) {
    this.runner = new FxRunner(v, { ...env.fx, camera: () => env.camera() });
  }

  /** Nghe sự kiện chiêu của `sid`. */
  handle(sid: string, e: SkillEvent): void {
    const actor = this.env.player(sid);
    if (!actor) return;
    const mine = sid === this.env.mySid();
    if (mine) this.combatUntil = this.clock + AURA_CALM;
    const def = SKILL.get(e.skill);
    if (!wantsPhaseFx(def)) return;
    const cam = this.env.camera();
    const dist = Math.hypot(actor.x - cam.position.x, actor.z - cam.position.z);
    if (!mine && !othersAllowed(dist, this.v.pool.live)) return;
    const color = tintFor(def, mine, this.env.myMethod());
    const ult = !!def.ult;
    const tl = FX_TIMELINE.get(def.id);
    if (tl) {
      if (e.kind === 'windup') this.runner.start(sid, actor, def, tl, e, mine, dist, this.env.myMethod());
      else if (e.kind === 'end') this.runner.drop(sid);
      else if (e.kind === 'cancel') this.runner.cancel(sid, e.t);
      return;
    }
    if (import.meta.env.DEV) {
      // Nhật ký dev: VFX phát đồng bộ trong cùng lời gọi với sự kiện chiêu (`__game.skillFx.log`).
      this.log.push({ kind: e.kind, skill: e.skill, combo: e.combo, t: e.t, at: performance.now() });
      if (this.log.length > 200) this.log.shift();
    }
    if (e.kind === 'windup') this.onWindup(sid, actor, def, e, mine, ult, color, dist);
    else if (e.kind === 'hit') {
      // Đã hẹn giờ thì nổ ngay (nếu chưa nổ); không có hẹn giờ (bỏ lỡ windup) thì nổ tại hit.
      const key = sid + ':' + e.index;
      if (this.fired.delete(key)) return;
      const i = this.pending.findIndex((p) => p.sid === sid && p.index === e.index);
      if (i >= 0) this.pending.splice(i, 1);
      this.onHit(actor, def, mine, ult, color);
    } else if (e.kind === 'cancel' || e.kind === 'end') this.dropPending(sid);
  }

  /** Phát timeline kích hoạt theo S.FX (lướt...) cho `sid`. */
  startFromFx(sid: string, tl: import('@dtl/shared').FxTimeline): void {
    const actor = this.env.player(sid);
    if (!actor) return;
    const mine = sid === this.env.mySid();
    const cam = this.env.camera();
    const dist = Math.hypot(actor.x - cam.position.x, actor.z - cam.position.z);
    if (!mine && !othersAllowed(dist, this.v.pool.live)) return;
    this.runner.startFx(sid, actor, SKILL.get(tl.skill), tl, mine, dist, this.env.myMethod());
  }

  private dropPending(sid: string): void {
    this.pending = this.pending.filter((p) => p.sid !== sid);
    for (const k of this.fired) if (k.startsWith(sid + ':')) this.fired.delete(k);
  }

  /** Điểm trước ngực người ra chiêu (gốc của tụ lực và bùng nổ). */
  private front(a: SkillFxActor, ahead: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(a.x + Math.sin(a.yaw) * ahead, a.y + 1.15, a.z + Math.cos(a.yaw) * ahead);
  }

  private onWindup(
    sid: string,
    a: SkillFxActor,
    def: SkillDef,
    e: SkillEvent,
    mine: boolean,
    ult: boolean,
    color: number,
    dist: number,
  ): void {
    const tm = skillTiming(def, e.combo >= 0 ? e.combo : undefined);
    const toHit = tm.hitAt[0]! - e.t;
    const caps = capsFor(mine, ult);
    // Hẹn bùng nổ cho từng mốc trúng: bắt đầu trước hitAt một `BURST_LEAD` để đỉnh sáng khớp hitAt.
    this.dropPending(sid);
    tm.hitAt.forEach((h, index) =>
      this.pending.push({ sid, index, def, mine, ult, color, at: h - BURST_LEAD, left: h - e.t - BURST_LEAD }),
    );
    // Vệt kiếm bám mũi kiếm: một cửa sổ cho mỗi mốc trúng (chiêu liên hoàn nhiều mốc có nhiều vệt nối nhau).
    if (
      a.model.bladePoints &&
      bladeVisible(mine, dist) &&
      def.kind !== 'heal' &&
      def.kind !== 'guard' &&
      def.kind !== 'taunt' &&
      def.kind !== 'buff' &&
      def.kind !== 'summon'
    ) {
      for (const h of tm.hitAt) {
        const [s, en] = bladeWindow(h - e.t);
        if (en > 0) this.jobs.push({ sid, actor: a, color, t: 0, start: s, end: en, rib: null });
      }
    }
    // Tụ lực: hạt hút vào ngực/kiếm + vòng nhỏ dưới chân thu vào. Chiêu quá nhanh (đòn thường) không cần.
    const dur = toHit - BURST_LEAD;
    if (dur < 0.08) return;
    const nParticles = Math.min(caps.particles, mine ? (ult ? 120 : 22) : ult ? 60 : 10);
    const c = this.front(a, 0.35, _p);
    for (let i = 0; i < nParticles; i++) {
      const ang = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.3) * 1.2;
      const r = (ult ? 1.5 : 0.9) * (0.6 + Math.random() * 0.5);
      const ox = Math.cos(ang) * Math.cos(el) * r;
      const oy = Math.sin(el) * r;
      const oz = Math.sin(ang) * Math.cos(el) * r;
      const life = dur * (0.7 + Math.random() * 0.3);
      this.v.particles.emit(
        'glow',
        c.x + ox,
        c.y + oy,
        c.z + oz,
        (-ox / life) * 0.95,
        (-oy / life) * 0.95,
        (-oz / life) * 0.95,
        life,
        0.07,
        0.02,
        color,
        0.75,
      );
    }
    if (mine) {
      const ring = this.v.fx(RING_GEO, color, 0.5, 'glow');
      ring.fxColor.multiplyScalar(hdrGain(color, HDR_GATHER));
      ring.rotation.x = -Math.PI / 2;
      const base = ult ? 1.8 : 0.95;
      this.v.track(
        dur,
        (k) => {
          const act = this.env.player(sid);
          if (!act) return;
          ring.position.set(act.x, act.y + 0.12, act.z);
          ring.scale.setScalar(base * (1 - k * 0.8));
          ring.fxOpacity = 0.4 * Math.min(1, k * 6);
        },
        () => this.v.drop(ring),
      );
    }
  }

  private onHit(a: SkillFxActor, def: SkillDef, mine: boolean, ult: boolean, color: number): void {
    const cam = this.env.camera();
    const caps = capsFor(mine, ult);
    const at = this.front(a, def.range > 6 ? 0.6 : 1.2, _b);
    const power = def.power ?? 1;
    const fade = fadeFor(power);
    const d = cam.position.distanceTo(at);
    // Không che quá 25% màn hình: bán kính vòng chấn động tối đa theo khoảng cách camera.
    const rMax = maxRadiusFor(d, cam.fov, cam.aspect);
    const size = Math.min(rMax / 2.4, ult ? 1.5 : 0.8 + Math.min(power, 3) * 0.12);
    const pos = at.clone();

    // Bùng nổ: lõi nhỏ HDR 2,0–2,4 (đúng trần) tắt trong ~0,13 s. Lõi nhỏ, không phủ thân mục tiêu.
    const core = this.v.fx(G.ico1, color, 1, 'glow');
    core.fxColor.multiplyScalar(hdrGain(color, HDR_BURST));
    core.position.copy(pos);
    core.scale.setScalar(size * 0.12);
    // Vòng chấn động: nằm ngang dưới tầm ngực, lớp sáng mờ dần (≤ 0,8), nở trong thời gian tan.
    let ringT = 0;
    let ring: FxMesh | null = null;
    if (caps.meshes >= 2) {
      ring = this.v.fx(RING_GEO, color, 0.7, 'glow');
      ring.fxColor.multiplyScalar(hdrGain(color, HDR_FADE));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, a.y + 0.2, pos.z);
    }
    this.v.track(
      Math.max(BURST_DUR, fade),
      (_k, dt) => {
        ringT += dt;
        const kb = Math.min(1, ringT / BURST_DUR);
        // Lõi nhỏ (bán kính 0,13–0,31 m ở chiêu thường): chói nhưng không che thân.
        core.scale.setScalar(size * 0.2 * (0.6 + kb * 0.9));
        core.fxOpacity = Math.max(0, 1 - kb);
        core.fxK = kb;
        if (ring) {
          const kf = Math.min(1, ringT / fade);
          ring.scale.setScalar(size * (0.6 + kf * 1.8));
          ring.fxOpacity = 0.7 * (1 - kf) * (1 - kf);
        }
      },
      () => {
        this.v.drop(core);
        if (ring) this.v.drop(ring);
      },
    );
    // Tia lửa bắn ra từ điểm trúng (tối đa theo ngân sách).
    const n = Math.min(caps.particles, mine ? (ult ? 160 : 16) : ult ? 80 : 8);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * (ult ? 6 : 3);
      this.v.particles.emit(
        'glow',
        pos.x,
        pos.y,
        pos.z,
        Math.cos(ang) * sp,
        0.5 + Math.random() * 2,
        Math.sin(ang) * sp,
        0.25 + Math.random() * 0.3,
        0.07,
        0.015,
        i & 1 ? 0xffffff : color,
        0.9,
        6,
        2,
      );
    }
    // Lớp mực nền sống lâu hơn lớp sáng 0,3 s (chỉ của mình: người khác bị giới hạn 2 lưới).
    if (mine && caps.meshes >= 3) {
      const T: InkTiming = { spread: 0.12, fadeAt: fade * 0.5, dur: fade + INK_EXTRA };
      this.v.inkSplat(pos.x, pos.z, 0.55 + size * 0.5, T, a.yaw, 1.3, 0.38, 0.8);
    }
  }

  /** Mỗi khung: lấy mẫu vệt kiếm, linh quang hộ thể. */
  update(dt: number): void {
    this.clock += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      const a0 = this.env.player(p.sid);
      const clock = a0?.model.performClock?.();
      if (clock && clock.skill === p.def.id) {
        if (clock.t < p.at) continue;
      } else {
        p.left -= dt;
        if (p.left > 0) continue;
      }
      this.pending.splice(i, 1);
      this.fired.add(p.sid + ':' + p.index);
      if (import.meta.env.DEV) {
        // Độ lệch của bùng nổ so với hitAt theo đồng hồ animation của model (giây; spec: trong ±0,05).
        const hitAt = p.at + BURST_LEAD;
        this.log.push({
          kind: 'burst',
          skill: p.def.id,
          combo: p.index,
          t: clock && clock.skill === p.def.id ? clock.t - hitAt : NaN,
          at: performance.now(),
        });
      }
      const a = this.env.player(p.sid);
      if (a && (a.fl & PF_DEAD) === 0) this.onHit(a, p.def, p.mine, p.ult, p.color);
    }
    const trails = this.v.trails;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]!;
      j.t += dt;
      if (j.t < j.start) continue;
      const alive = this.env.player(j.sid) === j.actor && (j.actor.fl & PF_DEAD) === 0;
      if (j.t > j.end || !alive) {
        if (j.rib) j.rib.sampling = false;
        this.jobs.splice(i, 1);
        continue;
      }
      if (!j.rib) {
        j.rib = trails.openBlade(j.sid, j.color);
        if (!j.rib) {
          this.jobs.splice(i, 1);
          continue;
        }
      }
      if (j.actor.model.bladePoints?.(_p, _t)) j.rib.push(_p, _t);
    }
    this.runner.update(dt);
    this.updateAura(dt);
  }

  /** Linh quang hộ thể Trúc Cơ: sigil 0,9 m dưới chân, chỉ khi đứng yên ngoài giao chiến, độ mờ ≤ 0,25. */
  private updateAura(dt: number): void {
    const me = this.env.player(this.env.mySid());
    const on = !!me && me.lv >= TRUC_CO_LEVEL && (me.fl & PF_DEAD) === 0 && me.speed < 0.3 && this.clock >= this.combatUntil;
    if (on && !this.aura) {
      this.aura = this.v.sigil(SIGIL_CIRCLE, 0, 0, 0, AURA_RADIUS, 0, 0xcff3ff, 0);
      this.aura.fxOpacity = 0;
      this.aura.fxA.x = 1;
    }
    const m = this.aura;
    if (!m) return;
    const target = on ? AURA_ALPHA : 0;
    m.fxOpacity += (target - m.fxOpacity) * Math.min(1, dt * 3);
    if (me) m.position.set(me.x, me.y + 0.12, me.z);
    if (!on && m.fxOpacity < 0.005) {
      this.v.drop(m);
      this.aura = null;
    }
  }

  dispose(): void {
    for (const j of this.jobs) if (j.rib) j.rib.sampling = false;
    this.jobs.length = 0;
    this.pending.length = 0;
    this.runner.dispose();
    this.fired.clear();
    if (this.aura) {
      this.v.drop(this.aura);
      this.aura = null;
    }
  }
}

// Bản dev: công cụ đo sân đông (`pnpm shots:vfx --crowd N`) lấy timeline/chiêu để cho người giả ra chiêu.
if (import.meta.env.DEV && typeof window !== 'undefined')
  (window as unknown as { __fxTimelines: unknown }).__fxTimelines = {
    get: (id: string) => FX_TIMELINE.get(id),
    skill: (id: string) => SKILL.get(id),
  };
