// Hình ảnh Nguyên Anh (E3-K): bóng anh khi xuất khiếu, vết bay về nơi an toàn khi tử vong, nháy thuấn di, vòng gió ngự không.
// Chỉ là lớp trình diễn; luật do server giữ (`soul.ts`). Theo art bible v3: vật phát sáng cộng sáng, độ đục thấp, không lóa che nhân vật.

import * as THREE from 'three/webgpu';
import { SOUL_RANGE } from '@dtl/shared';
import { groundAt } from './levelCtx';

const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

const SOUL_COLOR = 0xbfe6ff;
const FIG_ALPHA = 0.5;
const MAX_FIGS = 6;
const MAX_PULSES = 12;

/** Một nguyên anh: đầu tròn, thân giọt nước kéo đuôi xuống; cao khoảng 1,1 m (nhỏ hơn người). */
function makeFigure(mat: THREE.Material, geo: { head: THREE.BufferGeometry; body: THREE.BufferGeometry }): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(geo.head, mat);
  head.position.y = 0.95;
  const body = new THREE.Mesh(geo.body, mat);
  body.position.y = 0.45;
  g.add(head, body);
  return g;
}

interface Pulse {
  mesh: THREE.Mesh;
  at: number;
  dur: number;
  r0: number;
  r1: number;
  alpha: number;
}

interface Flee {
  group: THREE.Group;
  at: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

export interface SoulScout {
  sid: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class SoulVis {
  private group = new THREE.Group();
  private geo = {
    head: new THREE.SphereGeometry(0.17, 14, 10),
    body: new THREE.ConeGeometry(0.26, 0.95, 14, 1, true),
    ring: new THREE.RingGeometry(0.9, 1, 48),
    pillar: new THREE.CylinderGeometry(0.5, 0.5, 5, 16, 1, true),
    orb: new THREE.SphereGeometry(0.22, 12, 8),
  };
  private mat = additive(SOUL_COLOR, FIG_ALPHA);
  private halo = additive(0x9fd8ff, 0.12);
  private ringMat = additive(0xbfe6ff, 0.5);
  private figs = new Map<string, THREE.Group>();
  private pulses: Pulse[] = [];
  private flees: Flee[] = [];
  /** Thân xác bỏ lại: cột sáng mảnh, vòng chân và vòng giới hạn `SOUL_RANGE`. */
  private husk = new THREE.Group();
  private huskRange: THREE.Mesh;
  private huskPillar: THREE.Mesh;
  private huskFoot: THREE.Mesh;
  private time = 0;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'soulVis';
    parent.add(this.group);
    this.huskPillar = new THREE.Mesh(this.geo.pillar, this.halo);
    this.huskPillar.position.y = 2.5;
    this.huskFoot = new THREE.Mesh(this.geo.ring, this.ringMat);
    this.huskFoot.rotation.x = -Math.PI / 2;
    this.huskFoot.scale.setScalar(0.9);
    this.huskRange = new THREE.Mesh(this.geo.ring, additive(0x9fd8ff, 0.1));
    this.huskRange.rotation.x = -Math.PI / 2;
    this.huskRange.scale.setScalar(SOUL_RANGE);
    this.husk.add(this.huskPillar, this.huskFoot, this.huskRange);
    this.husk.visible = false;
    this.group.add(this.husk);
  }

  /** Số bóng anh đang vẽ (test/ảnh chụp). */
  get figureCount(): number {
    return this.figs.size;
  }

  get fleeCount(): number {
    return this.flees.length;
  }

  /** Vòng sáng nở ra tại một điểm (xuất khiếu, nhập lại, thuấn di). */
  pulse(x: number, y: number, z: number, now: number, opts: { r0?: number; r1?: number; dur?: number; alpha?: number; upright?: boolean } = {}): void {
    if (this.pulses.length >= MAX_PULSES) this.drop(this.pulses.shift()!);
    const mesh = new THREE.Mesh(this.geo.ring, additive(SOUL_COLOR, opts.alpha ?? 0.5));
    mesh.position.set(x, y, z);
    if (!opts.upright) mesh.rotation.x = -Math.PI / 2;
    else mesh.rotation.x = 0;
    this.group.add(mesh);
    this.pulses.push({ mesh, at: now, dur: opts.dur ?? 0.5, r0: opts.r0 ?? 0.4, r1: opts.r1 ?? 2.2, alpha: opts.alpha ?? 0.5 });
  }

  /** Thuấn di: vòng đứng ở điểm đi và điểm đến, cộng một vệt sáng nối hai điểm. */
  blink(ox: number, oz: number, x: number, z: number, now: number): void {
    const oy = groundAt(ox, oz) + 1;
    const y = groundAt(x, z) + 1;
    this.pulse(ox, oy, oz, now, { r0: 1.4, r1: 0.2, dur: 0.35, upright: true });
    this.pulse(x, y, z, now, { r0: 0.2, r1: 1.4, dur: 0.4, upright: true });
    const len = Math.hypot(x - ox, z - oz);
    if (len < 0.5) return;
    const streak = new THREE.Mesh(this.geo.pillar, additive(SOUL_COLOR, 0.28));
    streak.scale.set(0.1, len / 5, 0.1);
    streak.position.set((ox + x) / 2, (oy + y) / 2, (oz + z) / 2);
    streak.rotation.order = 'YXZ';
    streak.rotation.set(Math.PI / 2, Math.atan2(x - ox, z - oz), 0);
    this.group.add(streak);
    this.pulses.push({ mesh: streak, at: now, dur: 0.3, r0: 0, r1: 0, alpha: 0.28 });
  }

  /** Tử vong: nguyên anh thoát khỏi thân xác rồi bay (vòng cung) về nơi an toàn trong `dur` giây. */
  flee(from: THREE.Vector3, to: THREE.Vector3, dur: number, now: number): void {
    if (this.flees.length >= MAX_FIGS) this.dropFlee(this.flees.shift()!);
    const group = makeFigure(this.mat, this.geo);
    this.group.add(group);
    this.flees.push({ group, at: now, dur: Math.max(0.5, dur), from: from.clone(), to: to.clone() });
    this.pulse(from.x, from.y + 0.2, from.z, now, { r0: 0.4, r1: 3, dur: 0.8 });
  }

  private drop(p: Pulse): void {
    this.group.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
  }

  private dropFlee(f: Flee): void {
    this.group.remove(f.group);
  }

  /** Mỗi khung. `scouts`: người đang thám thính (vị trí đã nội suy); `body`: thân xác của mình nếu đang thám thính. */
  update(dt: number, scouts: readonly SoulScout[], body: { x: number; y: number; z: number } | null, now: number): void {
    this.time += dt;
    const live = new Set<string>();
    for (const s of scouts.slice(0, MAX_FIGS)) {
      live.add(s.sid);
      let g = this.figs.get(s.sid);
      if (!g) {
        g = makeFigure(this.mat, this.geo);
        this.group.add(g);
        this.figs.set(s.sid, g);
      }
      g.position.set(s.x, s.y + 0.35 + Math.sin(this.time * 2.4) * 0.07, s.z);
      g.rotation.y = s.yaw;
    }
    for (const [sid, g] of this.figs) {
      if (live.has(sid)) continue;
      this.group.remove(g);
      this.figs.delete(sid);
    }
    this.husk.visible = !!body;
    if (body) {
      const gy = groundAt(body.x, body.z);
      this.husk.position.set(body.x, gy + 0.08, body.z);
      this.huskPillar.position.y = 2.5;
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 2);
      this.halo.opacity = 0.12 * pulse;
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const k = (now - p.at) / (p.dur * 1000);
      if (k >= 1) {
        this.drop(p);
        this.pulses.splice(i, 1);
        continue;
      }
      if (p.r1 > 0) p.mesh.scale.setScalar(p.r0 + (p.r1 - p.r0) * (1 - (1 - k) ** 2));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.alpha * (1 - k) ** 1.4;
    }
    for (let i = this.flees.length - 1; i >= 0; i--) {
      const f = this.flees[i];
      const k = (now - f.at) / (f.dur * 1000);
      if (k >= 1) {
        this.dropFlee(f);
        this.flees.splice(i, 1);
        continue;
      }
      const e = k * k * (3 - 2 * k);
      // Bay vòng cung: lên cao ở giữa chặng, hạ xuống ở nơi an toàn.
      f.group.position.set(f.from.x + (f.to.x - f.from.x) * e, f.from.y + (f.to.y - f.from.y) * e + 1.2 + Math.sin(Math.PI * k) * 5, f.from.z + (f.to.z - f.from.z) * e);
      f.group.rotation.y = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
      const s = 0.8 + 0.2 * Math.sin(this.time * 5);
      f.group.scale.setScalar(s);
    }
  }

  dispose(): void {
    for (const p of this.pulses) this.drop(p);
    this.pulses = [];
    this.group.parent?.remove(this.group);
    this.mat.dispose();
    this.halo.dispose();
    this.ringMat.dispose();
    (this.huskRange.material as THREE.Material).dispose();
    for (const g of Object.values(this.geo)) g.dispose();
  }
}
