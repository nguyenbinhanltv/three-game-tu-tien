// Hình ảnh phân thân thần niệm (E4-K): bản sao cỡ người thật của chính nhân vật, vật liệu linh thể (cùng loại với nguyên anh),
// vòng sao nhạt dưới chân, bước theo đoạn đường server báo (`clone_mv`), vung tay khi ra chiêu (`clone_act`), gợn vòng khi khiêu khích/hồi,
// tan thành chớp khi hết giờ hoặc vỡ. Chỉ là lớp trình diễn; luật do server giữ (`apps/server/src/game/clone.ts`).
// Theo art bible v3: tông trầm, cộng sáng độ đục thấp, dưới trần HDR.

import * as THREE from 'three/webgpu';
import { CLONE_SPEED } from '@dtl/shared';
import { groundAt } from './levelCtx';
import type { CharacterView } from './character/view';

const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

/** Dựng bản sao của người chơi `sid` (null nếu asset chưa nạp hoặc model khối: dùng hình dự phòng). */
export type CloneMaker = (sid: string) => CharacterView | null;

const ROLE_COLOR: Record<string, number> = { dps: 0x9fd8ff, tank: 0xffc95a, support: 0x7dffa0 };
const MAX_PULSES = 10;

interface Pulse {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  at: number;
  dur: number;
  r: number;
}

interface Fig {
  sid: string;
  role: string;
  view: CharacterView | null;
  fallback: THREE.Group | null;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  /** Đích đang đi tới (nội suy tuyến tính). */
  gx: number;
  gz: number;
  yaw: number;
  born: number;
  dur: number;
  /** Đang tan: 1 → 0 trong `FADE` giây. */
  fade: number;
  ending: boolean;
  speed: number;
}

const FADE = 0.5;

export class CloneVis {
  private group = new THREE.Group();
  private figs = new Map<string, Fig>();
  private pulses: Pulse[] = [];
  private ringGeo = new THREE.RingGeometry(0.9, 1, 48);
  private headGeo = new THREE.SphereGeometry(0.17, 12, 8);
  private bodyGeo = new THREE.ConeGeometry(0.26, 0.95, 12, 1, true);
  private time = 0;
  /** Vòng lĩnh vực quanh chủ (rất nhạt). */
  private domainMat = additive(0xcfe6dc, 0.1);
  private domainRing: THREE.Mesh;
  private domainR = 0;

  constructor(
    parent: THREE.Object3D,
    private make: CloneMaker = () => null,
  ) {
    this.group.name = 'cloneVis';
    parent.add(this.group);
    this.domainRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), this.domainMat);
    this.domainRing.rotation.x = -Math.PI / 2;
    this.domainRing.visible = false;
    this.group.add(this.domainRing);
  }

  /** Lĩnh vực (Nguyên Anh trung kỳ trở lên): vòng mảnh bán kính `r` quanh (x, z); null = tắt. Chỉ là lớp hình. */
  setDomain(at: { x: number; z: number; r: number } | null): void {
    this.domainRing.visible = !!at;
    if (!at) return;
    this.domainR = at.r;
    this.domainRing.position.set(at.x, groundAt(at.x, at.z) + 0.07, at.z);
  }

  get count(): number {
    return this.figs.size;
  }

  /** Có bản sao dựng từ model thật (test/ảnh chụp). */
  get modelCount(): number {
    let n = 0;
    for (const f of this.figs.values()) if (f.view) n++;
    return n;
  }

  spawn(sid: string, x: number, z: number, dur: number, role: string, yaw: number): void {
    this.remove(sid);
    const color = ROLE_COLOR[role] ?? 0xcfe6dc;
    const ringMat = additive(color, 0.42);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    const fig: Fig = { sid, role, view: null, fallback: null, ring, ringMat, x, z, gx: x, gz: z, yaw, born: this.time, dur, fade: 1, ending: false, speed: 0 };
    this.figs.set(sid, fig);
    this.pulse(x, z, 1.8, 0.7, color);
  }

  /** Server báo đích mới: bước từ vị trí hiện tại tới (x, z). */
  move(sid: string, x: number, z: number): void {
    const f = this.figs.get(sid);
    if (f) {
      f.gx = x;
      f.gz = z;
    }
  }

  /** Ra chiêu: vung tay về phía mục tiêu (`tx`, `tz`) và gợn vòng nếu chiêu vùng. */
  act(sid: string, tx: number | null, tz: number | null, r: number): void {
    const f = this.figs.get(sid);
    if (!f) return;
    if (tx !== null && tz !== null) f.yaw = Math.atan2(tx - f.x, tz - f.z);
    f.view?.attack();
    if (r > 0) this.pulse(f.x, f.z, r, 0.5, ROLE_COLOR[f.role] ?? 0xcfe6dc);
  }

  /** Gánh đòn: gợn một vòng nhỏ quanh chân. */
  hit(sid: string): void {
    const f = this.figs.get(sid);
    if (f) this.pulse(f.x, f.z, 1.4, 0.3, 0xfff0b8);
  }

  /** Thu lại; `boom` = vỡ (nổ một chớp). */
  end(sid: string, boom: boolean): void {
    const f = this.figs.get(sid);
    if (!f || f.ending) return;
    f.ending = true;
    this.pulse(f.x, f.z, boom ? 3 : 2.2, boom ? 0.4 : 0.8, boom ? 0xfff0b8 : (ROLE_COLOR[f.role] ?? 0xcfe6dc));
  }

  /** Vòng sáng nở ra tại (x, z). */
  pulse(x: number, z: number, r: number, dur: number, color: number): void {
    if (this.pulses.length >= MAX_PULSES) this.dropPulse(this.pulses.shift()!);
    const mat = additive(color, 0.4);
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, groundAt(x, z) + 0.1, z);
    this.group.add(mesh);
    this.pulses.push({ mesh, mat, at: this.time, dur, r });
  }

  private dropPulse(p: Pulse): void {
    this.group.remove(p.mesh);
    p.mat.dispose();
  }

  private remove(sid: string): void {
    const f = this.figs.get(sid);
    if (!f) return;
    if (f.view) {
      this.group.remove(f.view.root);
      f.view.dispose();
    }
    if (f.fallback) this.group.remove(f.fallback);
    this.group.remove(f.ring);
    f.ringMat.dispose();
    this.figs.delete(sid);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.domainRing.visible) {
      this.domainRing.scale.setScalar(this.domainR * (1 + Math.sin(this.time * 1.2) * 0.006));
      this.domainMat.opacity = 0.09 + Math.sin(this.time * 1.2) * 0.02;
    }
    for (const f of [...this.figs.values()]) {
      const age = this.time - f.born;
      if (!f.ending && age >= f.dur + 0.5) f.ending = true;
      f.fade = f.ending ? Math.max(0, f.fade - dt / FADE) : Math.min(1, f.fade + dt * 3);
      if (f.ending && f.fade <= 0) {
        this.remove(f.sid);
        continue;
      }
      // Bước theo đoạn đường server báo.
      const dx = f.gx - f.x;
      const dz = f.gz - f.z;
      const d = Math.hypot(dx, dz);
      f.speed = 0;
      if (d > 0.05 && !f.ending) {
        const step = Math.min(d, CLONE_SPEED * dt);
        f.x += (dx / d) * step;
        f.z += (dz / d) * step;
        f.yaw = Math.atan2(dx, dz);
        f.speed = CLONE_SPEED;
      }
      const gy = groundAt(f.x, f.z);
      if (!f.view) {
        const v = this.make(f.sid);
        if (v) {
          f.view = v;
          this.group.add(v.root);
          if (f.fallback) {
            this.group.remove(f.fallback);
            f.fallback = null;
          }
        } else if (!f.fallback) {
          f.fallback = this.makeFallback(ROLE_COLOR[f.role] ?? 0xcfe6dc);
          this.group.add(f.fallback);
        }
      }
      const bob = Math.sin(this.time * 1.8) * 0.04;
      if (f.view) {
        f.view.root.position.set(f.x, gy + bob, f.z);
        f.view.root.rotation.y = f.yaw;
        f.view.root.visible = f.fade > 0.02;
        f.view.update(dt, { speed: f.speed, flying: false, meditating: false, dead: false, casting: false, airborne: false, combat: true });
      } else if (f.fallback) {
        f.fallback.position.set(f.x, gy + bob + 0.1, f.z);
        f.fallback.rotation.y = f.yaw;
        f.fallback.scale.setScalar(Math.max(0.01, f.fade));
      }
      f.ring.position.set(f.x, gy + 0.08, f.z);
      f.ring.scale.setScalar(1.3 + Math.sin(this.time * 2) * 0.08);
      f.ringMat.opacity = 0.4 * f.fade;
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const k = (this.time - p.at) / p.dur;
      if (k >= 1) {
        this.dropPulse(p);
        this.pulses.splice(i, 1);
        continue;
      }
      p.mesh.scale.setScalar(Math.max(0.1, p.r * (0.25 + 0.75 * k)));
      p.mat.opacity = 0.4 * (1 - k);
    }
  }

  private makeFallback(color: number): THREE.Group {
    const mat = additive(color, 0.4);
    const g = new THREE.Group();
    const head = new THREE.Mesh(this.headGeo, mat);
    head.position.y = 1.6;
    const body = new THREE.Mesh(this.bodyGeo, mat);
    body.scale.setScalar(1.7);
    body.position.y = 0.8;
    g.add(head, body);
    return g;
  }

  dispose(): void {
    for (const sid of [...this.figs.keys()]) this.remove(sid);
    for (const p of this.pulses) this.dropPulse(p);
    this.pulses.length = 0;
    this.group.parent?.remove(this.group);
    this.ringGeo.dispose();
    this.domainRing.geometry.dispose();
    this.domainMat.dispose();
    this.headGeo.dispose();
    this.bodyGeo.dispose();
  }
}
