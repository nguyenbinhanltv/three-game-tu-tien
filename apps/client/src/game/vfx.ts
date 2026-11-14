import * as THREE from 'three/webgpu';
import { groundAt } from '@dtl/shared';
import { G } from './geo';

interface Fx {
  t: number;
  dur: number;
  /** k = tiến độ 0..1. */
  update(k: number, dt: number): void;
  end(): void;
}

type PosFn = (out: THREE.Vector3) => boolean;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function glow(color: number, opacity = 0.9, additive = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

const RING_GEO = new THREE.RingGeometry(0.82, 1, 48);
const DISC_GEO = new THREE.CircleGeometry(1, 40);
const TUBE_GEO = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
const BOLT_GEO = new THREE.BoxGeometry(1, 1, 1);

/** Hệ hiệu ứng: mỗi hiệu ứng là vài lưới phát sáng sống trong thời gian ngắn. */
export class Vfx {
  group = new THREE.Group();
  private items: Fx[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private add(dur: number, update: (k: number, dt: number) => void, end: () => void): void {
    this.items.push({ t: 0, dur, update, end });
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  private drop(m: THREE.Mesh): void {
    this.group.remove(m);
    (m.material as THREE.Material).dispose();
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update(k, dt);
      if (k >= 1) {
        f.end();
        this.items.splice(i, 1);
      }
    }
  }

  /** Vụ nổ sáng nhỏ tại một điểm. */
  burst(pos: THREE.Vector3, color: number, size = 1.2, dur = 0.28): void {
    const m = this.mesh(G.ico1, glow(color, 0.9));
    m.position.copy(pos);
    const ring = this.mesh(RING_GEO, glow(color, 0.8));
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.add(
      dur,
      (k) => {
        const s = size * (0.3 + k * 1.1);
        m.scale.setScalar(s);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        ring.scale.setScalar(size * (0.5 + k * 2.2));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      },
      () => {
        this.drop(m);
        this.drop(ring);
      },
    );
  }

  /** Phi kiếm bay từ nguồn tới đích rồi nổ. */
  swordShot(from: THREE.Vector3, to: PosFn, color: number, size = 1, dur = 0.2): void {
    const m = this.mesh(G.octa, glow(color, 0.95));
    const start = from.clone();
    const target = from.clone();
    const dir = new THREE.Vector3();
    this.add(
      dur,
      (k) => {
        to(target);
        m.position.lerpVectors(start, target, k);
        dir.subVectors(target, start);
        if (dir.lengthSq() > 1e-4) m.quaternion.setFromUnitVectors(UP, dir.normalize());
        m.scale.set(0.09 * size, 1.1 * size, 0.09 * size);
      },
      () => {
        this.drop(m);
        this.burst(target, color, 0.9 * size);
      },
    );
  }

  /** Kiếm khí hình lưỡi liềm lao tới. */
  slash(from: THREE.Vector3, to: PosFn, color: number): void {
    const m = this.mesh(G.octa, glow(color, 0.9));
    const start = from.clone();
    const target = from.clone();
    const dir = new THREE.Vector3();
    this.add(
      0.26,
      (k) => {
        to(target);
        m.position.lerpVectors(start, target, k);
        dir.subVectors(target, start).setY(0);
        m.rotation.set(0, Math.atan2(dir.x, dir.z), 0.35);
        m.scale.set(2.4 + k, 1.5, 0.16);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 - k * 0.3;
      },
      () => {
        this.drop(m);
        this.burst(target, color, 2.0, 0.35);
      },
    );
  }

  /** Mưa kiếm rơi trong một vùng tròn. */
  swordRain(cx: number, cy: number, cz: number, r: number, color: number): void {
    const ring = this.mesh(RING_GEO, glow(color, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, cy + 0.2, cz);
    this.add(
      0.9,
      (k) => {
        ring.scale.setScalar(r * Math.min(1, 0.3 + k * 2));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k * k);
      },
      () => this.drop(ring),
    );
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r * 0.9;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const gy = groundAt(x, z);
      const delay = Math.random() * 0.35;
      const m = this.mesh(G.octa, glow(color, 0.95));
      m.scale.set(0.12, 1.6, 0.12);
      m.visible = false;
      let done = false;
      // Bắt đầu với thời gian âm để mỗi thanh kiếm rơi lệch nhịp nhau.
      const fx: Fx = {
        t: -delay,
        dur: 0.3,
        update: (k) => {
          if (fx.t < 0) return;
          m.visible = true;
          m.position.set(x, gy + 16 * (1 - k) + 0.8, z);
        },
        end: () => {
          if (done) return;
          done = true;
          this.drop(m);
          _a.set(x, gy + 0.4, z);
          this.burst(_a, color, 0.9, 0.22);
        },
      };
      this.items.push(fx);
    }
  }

  /** Tia sét gấp khúc đánh xuống một điểm. */
  lightning(x: number, y: number, z: number, color = 0xd6c4ff, scale = 1): void {
    const segs: THREE.Mesh[] = [];
    const mat = glow(color, 1);
    let px = x + (Math.random() - 0.5) * 14;
    let pz = z + (Math.random() - 0.5) * 14;
    let py = y + 60;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const nx = i === n - 1 ? x : x + (Math.random() - 0.5) * 9 * (1 - k);
      const nz = i === n - 1 ? z : z + (Math.random() - 0.5) * 9 * (1 - k);
      const ny = y + 60 * (1 - k);
      _a.set(px, py, pz);
      _b.set(nx, ny, nz);
      const len = _a.distanceTo(_b);
      const m = new THREE.Mesh(BOLT_GEO, mat);
      m.frustumCulled = false;
      m.position.lerpVectors(_a, _b, 0.5);
      m.quaternion.setFromUnitVectors(UP, _b.clone().sub(_a).normalize());
      m.scale.set(0.16 * scale, len, 0.16 * scale);
      this.group.add(m);
      segs.push(m);
      px = nx;
      py = ny;
      pz = nz;
    }
    const flash = this.mesh(G.ico1, glow(color, 0.55));
    flash.position.set(x, y + 0.6, z);
    const ring = this.mesh(RING_GEO, glow(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.3, z);
    this.add(
      0.42,
      (k) => {
        const on = k < 0.22 || (k > 0.36 && k < 0.55);
        mat.opacity = on ? 1 : 0.2 * (1 - k);
        flash.scale.set(scale * (1 + k * 2.2), scale * (0.6 + k * 1.2), scale * (1 + k * 2.2));
        (flash.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
        ring.scale.setScalar(scale * (1 + k * 4));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      },
      () => {
        for (const m of segs) this.group.remove(m);
        mat.dispose();
        this.drop(flash);
        this.drop(ring);
      },
    );
  }

  /** Cột sáng dâng lên quanh một thực thể (lên cấp, hồi phục, hồi sinh). */
  pillar(pos: PosFn, color: number, dur = 1.1, radius = 1.1, height = 7): void {
    const m = this.mesh(TUBE_GEO, glow(color, 0.55));
    const ring = this.mesh(RING_GEO, glow(color, 0.8));
    ring.rotation.x = -Math.PI / 2;
    this.add(
      dur,
      (k) => {
        if (!pos(_a)) return;
        const h = height * Math.min(1, k * 2.5);
        m.position.set(_a.x, _a.y - 1.1 + h / 2, _a.z);
        m.scale.set(radius * (1 - k * 0.4), h, radius * (1 - k * 0.4));
        (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k * k);
        ring.position.set(_a.x, _a.y - 1.0, _a.z);
        ring.scale.setScalar(radius * (1 + k * 2.5));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      },
      () => {
        this.drop(m);
        this.drop(ring);
      },
    );
  }

  /** Lớp linh khí hộ thể bao quanh người. */
  shield(pos: PosFn, dur: number, stillOn: () => boolean): void {
    const m = this.mesh(G.ico1, glow(0x7fd8ff, 0.28));
    let t = 0;
    this.add(
      dur,
      (_k, dt) => {
        t += dt;
        if (!pos(_a) || !stillOn()) {
          m.visible = false;
          return;
        }
        m.visible = true;
        m.position.copy(_a).setY(_a.y - 0.2);
        m.scale.set(1.25, 1.5, 1.25);
        m.rotation.y = t * 1.5;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 6) * 0.06;
      },
      () => this.drop(m),
    );
  }

  /** Quả cầu tụ lực trước ngực khi niệm chú. */
  charge(pos: PosFn, dur: number, color: number, stillOn: () => boolean): void {
    const m = this.mesh(G.ico1, glow(color, 0.8));
    this.add(
      dur,
      (k) => {
        if (!pos(_a) || !stillOn()) {
          m.visible = false;
          return;
        }
        m.position.set(_a.x, _a.y + 0.9, _a.z);
        m.scale.setScalar(0.15 + k * 0.5 + Math.random() * 0.05);
      },
      () => this.drop(m),
    );
  }

  /** Vùng nguy hiểm báo trước trên mặt đất, rồi đánh xuống. */
  hazard(x: number, z: number, r: number, delay: number, kind: 'lightning' | 'frost'): void {
    const y = groundAt(x, z);
    const color = kind === 'lightning' ? 0xb48cff : 0x7fd8ff;
    const ring = this.mesh(RING_GEO, glow(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.25, z);
    ring.scale.setScalar(r);
    const disc = this.mesh(DISC_GEO, glow(kind === 'lightning' ? 0x6a3fd0 : 0x2f8fd0, 0.2));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, y + 0.2, z);
    this.add(
      delay,
      (k) => {
        disc.scale.setScalar(r * k);
        (disc.material as THREE.MeshBasicMaterial).opacity = 0.18 + k * 0.3;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(k * 40) * 0.3;
      },
      () => {
        this.drop(ring);
        this.drop(disc);
        if (kind === 'lightning') {
          this.lightning(x, y, z, 0xe2d4ff, 1.2);
        } else {
          _a.set(x, y + 0.5, z);
          this.burst(_a, 0xaee8ff, r * 0.9, 0.5);
          // Gai băng trồi lên.
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = i === 0 ? 0 : r * 0.55;
            const spike = this.mesh(G.cone6, glow(0xcdf3ff, 0.85, false));
            const sx = x + Math.cos(a) * rr;
            const sz = z + Math.sin(a) * rr;
            const sy = groundAt(sx, sz);
            const hgt = 2.2 + Math.random() * 2;
            this.add(
              0.7,
              (k) => {
                const up = Math.min(1, k * 5);
                spike.position.set(sx, sy + (hgt * up) / 2 - 0.2, sz);
                spike.scale.set(0.5, hgt * up, 0.5);
                (spike.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - Math.max(0, k - 0.5) * 2);
              },
              () => this.drop(spike),
            );
          }
        }
      },
    );
  }

  /** Mây kiếp xoáy trên đầu người độ kiếp. */
  tribulationCloud(pos: PosFn, dur: number, stillOn: () => boolean): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x241a38, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const cloud = this.mesh(G.ico1, mat);
    const ringMat = glow(0x9a6cff, 0.5);
    const ring = this.mesh(G.torus, ringMat);
    let t = 0;
    this.add(
      dur + 1.5,
      (_k, dt) => {
        t += dt;
        if (!pos(_a)) return;
        const fade = stillOn() ? Math.min(1, t / 2) : Math.max(0, mat.opacity - dt);
        cloud.position.set(_a.x, _a.y + 70, _a.z);
        cloud.scale.set(70, 5, 70);
        cloud.rotation.y = t * 0.3;
        mat.opacity = Math.min(0.85, fade * 0.85);
        ring.position.set(_a.x, _a.y + 64, _a.z);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = -t * 0.8;
        ring.scale.setScalar(26 + Math.sin(t * 2) * 2);
        ringMat.opacity = 0.5 * (mat.opacity / 0.85);
      },
      () => {
        this.drop(cloud);
        this.drop(ring);
      },
    );
  }

  dispose(): void {
    for (const f of this.items) f.end();
    this.items.length = 0;
    this.group.removeFromParent();
  }
}

/** Số sát thương bay lên, vẽ bằng DOM. */
export class DamageNumbers {
  private items: { el: HTMLDivElement; pos: THREE.Vector3; t: number; dx: number }[] = [];
  private pool: HTMLDivElement[] = [];
  constructor(private layer: HTMLElement) {}

  spawn(text: string, pos: THREE.Vector3, cls: string): void {
    if (this.items.length > 40) return;
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 40 });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / 0.95;
      if (k >= 1) {
        it.el.remove();
        this.pool.push(it.el);
        this.items.splice(i, 1);
        continue;
      }
      _a.copy(it.pos).project(camera);
      if (_a.z > 1) {
        it.el.style.opacity = '0';
        continue;
      }
      const x = (_a.x * 0.5 + 0.5) * w + it.dx * k;
      const y = (-_a.y * 0.5 + 0.5) * h - k * 60;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - k * 0.3).toFixed(2)})`;
      it.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }

  clear(): void {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}
