// VFX theo nhịp ba pha của chiêu (K-6), gắn vào `Game.onSkillEvent` (K-4): tụ lực lúc `windup`, bùng nổ đúng khung `hit`,
// tan (vòng chấn động + vệt mực nền sống lâu hơn lớp sáng 0,3 s). Vệt kiếm bám mũi kiếm lấy mẫu từ xương `dtl_sword`.
// Chỉ là lớp hình: server vẫn quyết định chiêu, mục tiêu và sát thương; các hiệu ứng riêng của từng chiêu (methodFx.ts,
// vfx.ts) vẫn phát theo S.FX như cũ, phần này thêm nhịp và vệt kiếm lên trên và chạy theo ngân sách mỗi chiêu.

import * as THREE from 'three/webgpu';
import { SKILL } from '@dtl/content';
import { PF_DEAD, skillTiming } from '@dtl/shared';
import type { SkillDef } from '@dtl/shared';
import type { FxMesh } from '../render/materials/vfx';
import { SIGIL_CIRCLE } from '../render/vfx/sigil';
import { BladeRibbon, bladeVisible, bladeWindow } from '../render/vfx/bladeTrail';
import type { InkTiming } from '../render/vfx/ink';
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
} from '../render/vfx/phases';
import { OTHERS_FX_DIST, OTHERS_FX_LIVE_MAX } from './fxBudget';
import { G } from './geo';
import type { SkillEvent } from './character/view';
import type { Vfx } from './vfx';

/** `?k6=0` tắt VFX ba pha, vệt kiếm và linh quang hộ thể để so ảnh trước/sau. */
export const K6_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('k6') !== '0';

/** Cấp từ đó có linh quang hộ thể (Trúc Cơ). */
export const TRUC_CO_LEVEL = 16;
/** Bán kính, độ mờ tối đa của linh quang hộ thể (m, alpha). */
export const AURA_RADIUS = 0.9;
export const AURA_ALPHA = 0.25;
/** Giây không giao chiến thì linh quang hiện lên. */
export const AURA_CALM = 4;

const RING_GEO = new THREE.RingGeometry(0.82, 1, 40);
const _p = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Người chơi như `SkillFx` cần đọc (khớp `PlayerVis`). */
export interface SkillFxActor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  fl: number;
  lv: number;
  speed: number;
  model: { bladePoints?(b: THREE.Vector3, t: THREE.Vector3): boolean };
}

export interface SkillFxEnv {
  player(sid: string): SkillFxActor | undefined;
  mySid(): string;
  myMethod(): string | undefined;
  camera(): THREE.PerspectiveCamera;
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
export function tintFor(def: SkillDef, mine: boolean, myMethod: string | undefined): number {
  return tintOfMethod(mine ? (def.method ?? myMethod) : def.method);
}

/** Cho phép phát hiệu ứng của chiêu này không. Chiêu lướt không có mốc trúng nên bỏ. */
export function wantsPhaseFx(def: SkillDef | undefined): def is SkillDef {
  return !!def && def.kind !== 'dash';
}

/** Người khác chỉ được vẽ khi gần và pool chưa đông (cùng quy tắc `skipOthersFx`, nhưng không đụng chiêu liên quan tới mình). */
export function othersAllowed(dist: number, live: number): boolean {
  return dist <= OTHERS_FX_DIST && live < OTHERS_FX_LIVE_MAX;
}

export class SkillFx {
  private jobs: BladeJob[] = [];
  private aura: FxMesh | null = null;
  private combatUntil = 0;
  private clock = 0;

  constructor(
    private v: Vfx,
    private env: SkillFxEnv,
  ) {}

  /** Nghe sự kiện chiêu của `sid`. */
  handle(sid: string, e: SkillEvent): void {
    if (!K6_ON) return;
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
    if (e.kind === 'windup') this.onWindup(sid, actor, def, e, mine, ult, color, dist);
    else if (e.kind === 'hit') this.onHit(actor, def, mine, ult, color);
  }

  /** Điểm trước ngực người ra chiêu (gốc của tụ lực và bùng nổ). */
  private front(a: SkillFxActor, ahead: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(a.x + Math.sin(a.yaw) * ahead, a.y + 1.15, a.z + Math.cos(a.yaw) * ahead);
  }

  private onWindup(sid: string, a: SkillFxActor, def: SkillDef, e: SkillEvent, mine: boolean, ult: boolean, color: number, dist: number): void {
    const tm = skillTiming(def, e.combo >= 0 ? e.combo : undefined);
    const toHit = tm.hitAt[0] - e.t;
    const caps = capsFor(mine, ult);
    // Vệt kiếm bám mũi kiếm: một cửa sổ cho mỗi mốc trúng (chiêu liên hoàn nhiều mốc có nhiều vệt nối nhau).
    if (a.model.bladePoints && bladeVisible(mine, dist) && def.kind !== 'heal' && def.kind !== 'guard' && def.kind !== 'taunt') {
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
      this.v.particles.emit('glow', c.x + ox, c.y + oy, c.z + oz, (-ox / life) * 0.95, (-oy / life) * 0.95, (-oz / life) * 0.95, life, 0.07, 0.02, color, 0.75);
    }
    if (mine) {
      const ring = this.v.fx(RING_GEO, color, 0.5, 'glow');
      ring.fxColor.multiplyScalar(hdrGain(color, HDR_GATHER));
      ring.rotation.x = -Math.PI / 2;
      const base = ult ? 2.4 : 1.3;
      this.v.track(
        dur,
        (k) => {
          const act = this.env.player(sid);
          if (!act) return;
          ring.position.set(act.x, act.y + 0.12, act.z);
          ring.scale.setScalar(base * (1 - k * 0.8));
          ring.fxOpacity = 0.5 * Math.min(1, k * 6);
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
        core.scale.setScalar(size * 0.5 * (0.6 + kb * 0.9));
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
      this.v.particles.emit('glow', pos.x, pos.y, pos.z, Math.cos(ang) * sp, 0.5 + Math.random() * 2, Math.sin(ang) * sp, 0.25 + Math.random() * 0.3, 0.07, 0.015, i & 1 ? 0xffffff : color, 0.9, 6, 2);
    }
    // Lớp mực nền sống lâu hơn lớp sáng 0,3 s (chỉ của mình: người khác bị giới hạn 2 lưới).
    if (mine && caps.meshes >= 3) {
      const T: InkTiming = { spread: 0.12, fadeAt: fade * 0.5, dur: fade + INK_EXTRA };
      this.v.inkSplat(pos.x, pos.z, 0.55 + size * 0.5, T, a.yaw, 1.3, 0.38, 0.8);
    }
  }

  /** Mỗi khung: lấy mẫu vệt kiếm, linh quang hộ thể. */
  update(dt: number): void {
    if (!K6_ON) return;
    this.clock += dt;
    const trails = this.v.trails;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
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
    if (this.aura) {
      this.v.drop(this.aura);
      this.aura = null;
    }
  }
}
