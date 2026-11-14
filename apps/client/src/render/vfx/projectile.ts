import * as THREE from 'three/webgpu';
import { BOLT_HEIGHT, boltXZ, boltY, type BoltMsg } from '@dtl/shared';
import type { FxKind, FxMesh } from '../materials/vfx';
import type { Particles } from './particles';

/**
 * Đạn đánh xa của quái (D1). Chỉ vẽ: server mô phỏng và phán định trúng; client nội suy bằng cùng
 * công thức `boltXZ`/`boltY` của packages/shared từ gói spawn (gốc, hướng, tốc độ, giờ server lúc bắn).
 *
 * Mỗi viên là vài lưới lấy từ FxPool (material TSL dùng chung theo kiểu, xem render/materials/vfx.ts)
 * nên phát không cấp phát material hay biên dịch shader; geometry dùng chung ở mức module. Vệt đuôi
 * là hạt GPU (`PARTICLES`, lớp glow) nên không thêm draw call.
 *
 * Hai dáng:
 * - `orb` (lửa, băng, sét): cầu lõi sáng + quầng mềm kéo dài về sau như sao chổi.
 * - `blade` (linh khí, Kiếm Linh): lưỡi phi kiếm mảnh dài xoay quanh trục bay, quầng hẹp.
 * Dưới đất có vòng mờ cùng màu đi theo đạn để đọc được đường bay và khoảng cách (né bằng bước ngang).
 * Ba lưới mỗi viên (lõi, quầng, vòng bóng) = 3 draw call; đuôi là hạt.
 */

/** Phần chung của Vfx mà đạn cần (tránh vòng import với game/vfx.ts). */
export interface BoltHost {
  fx(geo: THREE.BufferGeometry, color: number, opacity?: number, kind?: FxKind): FxMesh;
  drop(m: FxMesh): void;
  burst(pos: THREE.Vector3, color: number, size?: number, dur?: number): void;
  readonly group: THREE.Group;
  readonly particles: Particles;
}

export type BoltLook = 'orb' | 'blade';

export function boltLook(kind: string): BoltLook {
  return kind === 'spirit' ? 'blade' : 'orb';
}

/** Đạn mờ dần trong chừng này giây cuối đời (hết hạn mà không trúng). */
export const BOLT_FADE = 0.18;
/** Hạt đuôi mỗi giây mỗi viên. */
export const BOLT_TRAIL_RATE = 36;
/** Đạn ở xa hơn chừng này mét so với người chơi thì không vẽ (chưa có AOI nên cả kênh nhận). */
export const BOLT_VIEW_DIST = 90;

/**
 * Tuổi ban đầu (giây) của đạn khi client nhận: bù độ trễ mạng để thấy đạn đúng chỗ server đang tính.
 * Không âm, không vượt `life`.
 */
export function boltAge(msg: Pick<BoltMsg, 't' | 'life'>, serverNow: number): number {
  const a = (serverNow - msg.t) / 1000;
  return a > 0 ? Math.min(a, msg.life) : 0;
}

/** Độ trong theo tuổi: hiện nhanh lúc mới bắn, mờ dần cuối đời. */
export function boltAlpha(age: number, life: number): number {
  const fadeIn = Math.min(1, age / 0.08);
  const fadeOut = Math.min(1, Math.max(0, (life - age) / BOLT_FADE));
  return Math.min(fadeIn, fadeOut);
}

const SHADOW_GEO = new THREE.RingGeometry(0.55, 1, 24);
const ORB_GEO = new THREE.IcosahedronGeometry(1, 1);
const HALO_GEO = new THREE.SphereGeometry(1, 10, 8);
/** Lưỡi phi kiếm: bát diện, trục dài là z (scale theo z). */
const SPIKE_GEO = new THREE.OctahedronGeometry(1, 0);

interface Live {
  id: number;
  x0: number;
  z0: number;
  yaw: number;
  v: number;
  r: number;
  life: number;
  age: number;
  sd: number;
  color: number;
  look: BoltLook;
  core: FxMesh;
  halo: FxMesh;
  shadow: FxMesh;
  trailAcc: number;
}

const _p = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _w = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/** Màu lõi: màu loại đòn pha trắng (nóng, đọc rõ trên nền sương). */
export function coreColor(color: number): number {
  return _w.setHex(color).lerp(WHITE, 0.55).getHex();
}

export class BoltFx {
  private live: Live[] = [];
  /** Bản ghi đã dùng, giữ lại để phát không cấp phát object mới. */
  private spare: Live[] = [];

  constructor(private host: BoltHost) {}

  get count(): number {
    return this.live.length;
  }

  /** Thêm một viên từ tin `S.BOLT`. `age` từ `boltAge`. */
  spawn(m: BoltMsg, age: number, color: number): void {
    if (!(m.v > 0) || !(m.life > 0) || !(m.r > 0) || age >= m.life) return;
    const h = this.host;
    const look = boltLook(m.kind);
    const core = h.fx(look === 'blade' ? SPIKE_GEO : ORB_GEO, coreColor(color), 0.95, 'glow');
    const halo = h.fx(HALO_GEO, color, 0.32, 'glow');
    const shadow = h.fx(SHADOW_GEO, color, 0.3, 'flat');
    shadow.rotation.x = -Math.PI / 2;
    const b = this.spare.pop() ?? ({} as Live);
    b.id = m.id;
    b.x0 = m.x;
    b.z0 = m.z;
    b.yaw = m.yaw;
    b.v = m.v;
    b.r = m.r;
    b.life = m.life;
    b.age = age;
    b.sd = (m.sd % 1000) * 0.0063;
    b.color = color;
    b.look = look;
    b.core = core;
    b.halo = halo;
    b.shadow = shadow;
    b.trailAcc = 0;
    this.live.push(b);
    this.place(b, 0);
  }

  /** Tin `S.BOLT_END`: đạn vỡ tại (x, z) (trúng người hoặc chạm vật cản/bị hủy). */
  end(id: number, x: number, z: number, hit: boolean): void {
    const i = this.live.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = this.live[i];
    _v.set(x, boltY(x, z), z);
    this.host.burst(_v, b.color, hit ? 1.5 : 0.9, hit ? 0.32 : 0.24);
    // Tóe hạt theo hướng bay.
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const P = this.host.particles;
    for (let k = 0; k < (hit ? 14 : 8); k++) {
      const a = (k / 14) * Math.PI * 2;
      const s = 2 + (k % 3);
      P.emit('glow', _v.x, _v.y, _v.z, fx * 2 + Math.cos(a) * s, 1 + (k % 4) * 0.6, fz * 2 + Math.sin(a) * s, 0.4, b.r * 0.5, 0.05, b.color, 0.9, 4, 2.5);
    }
    this.remove(i);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.remove(i);
        continue;
      }
      this.place(b, dt);
    }
  }

  private place(b: Live, dt: number): void {
    boltXZ(b.x0, b.z0, b.yaw, b.v, b.age, _p);
    const by = boltY(_p.x, _p.z);
    const y = by + Math.sin(b.age * 9 + b.sd) * 0.06;
    const a = boltAlpha(b.age, b.life);
    const pulse = 1 + Math.sin(b.age * 22 + b.sd) * 0.08;
    const r = b.r;
    const { core, halo, shadow } = b;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    core.position.set(_p.x, y, _p.z);
    core.rotation.set(0, b.yaw, 0);
    halo.rotation.set(0, b.yaw, 0);
    if (b.look === 'blade') {
      // Lưỡi kiếm dài ~4r, mảnh, xoay quanh trục bay như phi kiếm; quầng hẹp kéo dọc lưỡi.
      core.scale.set(r * 0.32, r * 0.12, r * 2.1);
      core.rotation.z = b.age * 3 + b.sd;
      halo.scale.set(r * 0.8, r * 0.5, r * 3 * pulse);
      halo.position.set(_p.x - fx * r * 0.6, y, _p.z - fz * r * 0.6);
    } else {
      core.scale.setScalar(r * 0.62 * pulse);
      core.rotation.x = b.age * 4;
      // Quầng sao chổi: kéo dài và lùi về sau đạn.
      halo.scale.set(r * 1.35 * pulse, r * 1.35 * pulse, r * 2.6);
      halo.position.set(_p.x - fx * r * 1.1, y, _p.z - fz * r * 1.1);
    }
    core.fxOpacity = 0.95 * a;
    halo.fxOpacity = 0.32 * a;
    core.fxK = halo.fxK = Math.min(1, b.age * 2);
    shadow.position.set(_p.x, by - BOLT_HEIGHT + 0.06, _p.z);
    shadow.scale.setScalar(r * 1.6);
    shadow.fxOpacity = 0.3 * a;
    if (dt <= 0) return;
    // Vệt hạt: rơi lại sau đạn, tan nhanh.
    b.trailAcc += dt * BOLT_TRAIL_RATE;
    const P = this.host.particles;
    while (b.trailAcc >= 1) {
      b.trailAcc -= 1;
      const j = Math.sin(b.age * 131 + b.trailAcc * 7 + b.sd) * 0.5;
      const k = Math.cos(b.age * 97 + b.sd) * 0.5;
      P.emit('glow', _p.x - fx * r, y + k * r * 0.6, _p.z - fz * r, -fx * 0.8 + j, 0.3 + k * 0.4, -fz * 0.8 - j, 0.35, r * 0.55, 0.04, b.color, 0.75 * a, -0.5, 1.5);
    }
  }

  private remove(i: number): void {
    const b = this.live[i];
    const h = this.host;
    h.drop(b.core);
    h.drop(b.halo);
    h.drop(b.shadow);
    this.live[i] = this.live[this.live.length - 1];
    this.live.pop();
    this.spare.push(b);
  }

  clear(): void {
    while (this.live.length) this.remove(this.live.length - 1);
  }
}
