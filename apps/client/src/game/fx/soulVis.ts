// Hình ảnh Nguyên Anh (E3-K): nguyên anh là bản thu nhỏ của chính nhân vật (vật liệu linh thể, rìa fresnel vàng nhạt, hạt linh khí,
// linh tuyến nối về thân xác đang ngồi đả tọa, mờ đi), vệt bay về nơi an toàn khi tử vong, nháy thuấn di.
// Chỉ là lớp trình diễn; luật do server giữ (`soul.ts`). Theo art bible v3: tông trầm, cộng sáng độ đục thấp, không lóa che nhân vật.

import * as THREE from 'three/webgpu';
import { SOUL_RANGE } from '@dtl/shared';
import { groundAt } from '../core/levelCtx';
import type { CharacterView } from '../character/view';

const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

const SOUL_COLOR = 0xcfe6dc;
const FIG_ALPHA = 0.45;
const MAX_FIGS = 6;
const MAX_PULSES = 12;
/** Nguyên anh nhỏ bằng chừng này so với người thật. */
const SOUL_SCALE = 0.56;
const TETHER_PTS = 22;
const MOTES = 20;

/** Dựng bản thu nhỏ của nhân vật `sid` (null nếu asset chưa nạp hoặc model dự phòng: dùng hình giọt nước). */
type SoulMaker = (sid: string, kind: 'soul' | 'husk') => CharacterView | null;

/** Hình dự phòng (khi chưa có model xương): đầu tròn, thân giọt nước; cao khoảng 1,1 m. */
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
  speed?: number;
}

export class SoulVis {
  private group = new THREE.Group();
  private geo = {
    head: new THREE.SphereGeometry(0.17, 14, 10),
    body: new THREE.ConeGeometry(0.26, 0.95, 14, 1, true),
    ring: new THREE.RingGeometry(0.9, 1, 48),
    pillar: new THREE.CylinderGeometry(0.5, 0.5, 5, 16, 1, true),
  };
  private mat = additive(SOUL_COLOR, FIG_ALPHA);
  private halo = additive(0x9fd0c0, 0.1);
  private ringMat = additive(SOUL_COLOR, 0.4);
  /** Hình dự phòng theo người. */
  private figs = new Map<string, THREE.Group>();
  /** Bản thu nhỏ của người thật (linh thể). */
  private views = new Map<string, CharacterView>();
  private huskView: { sid: string; view: CharacterView } | null = null;
  private pulses: Pulse[] = [];
  private flees: Flee[] = [];
  /** Thân xác bỏ lại: cột sáng mảnh, vòng chân và vòng giới hạn `SOUL_RANGE`. */
  private husk = new THREE.Group();
  private huskPillar: THREE.Mesh;
  private tether: THREE.Line;
  private tetherPos = new Float32Array(TETHER_PTS * 3);
  private motes: THREE.Points;
  private motePos = new Float32Array(MOTES * 3);
  private moteSeed = Array.from({ length: MOTES }, (_, i) => ({ a: (i / MOTES) * Math.PI * 2, h: (i * 0.37) % 1, r: 0.3 + ((i * 0.61) % 1) * 0.35, s: 0.25 + ((i * 0.43) % 1) * 0.3 }));
  private time = 0;

  constructor(
    parent: THREE.Object3D,
    private make: SoulMaker = () => null,
  ) {
    this.group.name = 'soulVis';
    parent.add(this.group);
    this.huskPillar = new THREE.Mesh(this.geo.pillar, this.halo);
    this.huskPillar.position.y = 2.5;
    const foot = new THREE.Mesh(this.geo.ring, this.ringMat);
    foot.rotation.x = -Math.PI / 2;
    foot.scale.setScalar(0.9);
    const range = new THREE.Mesh(this.geo.ring, additive(0x9fd0c0, 0.08));
    range.rotation.x = -Math.PI / 2;
    range.scale.setScalar(SOUL_RANGE);
    this.husk.add(this.huskPillar, foot, range);
    this.husk.visible = false;
    this.group.add(this.husk);
    // Linh tuyến mảnh nối thân xác với nguyên anh; vài hạt linh khí rất nhẹ quanh nguyên anh.
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tetherPos, 3));
    this.tether = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xd9cc94, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.tether.frustumCulled = false;
    this.tether.visible = false;
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xeedfa8, size: 0.06, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.motes.frustumCulled = false;
    this.motes.visible = false;
    this.group.add(this.tether, this.motes);
  }

  /** Số nguyên anh đang vẽ (bản thu nhỏ hoặc hình dự phòng; test/ảnh chụp). */
  get figureCount(): number {
    return this.figs.size + this.views.size;
  }

  /** Có dựng được bản thu nhỏ của người thật không (test/ảnh chụp). */
  get miniCount(): number {
    return this.views.size;
  }

  get fleeCount(): number {
    return this.flees.length;
  }

  /** Vòng sáng nở ra tại một điểm (xuất khiếu, nhập lại, thuấn di). */
  pulse(x: number, y: number, z: number, now: number, opts: { r0?: number; r1?: number; dur?: number; alpha?: number; upright?: boolean } = {}): void {
    if (this.pulses.length >= MAX_PULSES) this.drop(this.pulses.shift()!);
    const mesh = new THREE.Mesh(this.geo.ring, additive(SOUL_COLOR, opts.alpha ?? 0.45));
    mesh.position.set(x, y, z);
    mesh.rotation.x = opts.upright ? 0 : -Math.PI / 2;
    this.group.add(mesh);
    this.pulses.push({ mesh, at: now, dur: opts.dur ?? 0.5, r0: opts.r0 ?? 0.4, r1: opts.r1 ?? 2.2, alpha: opts.alpha ?? 0.45 });
  }

  /** Thuấn di: vòng đứng ở điểm đi và điểm đến, cộng một vệt nối hai điểm. */
  blink(ox: number, oz: number, x: number, z: number, now: number): void {
    const oy = groundAt(ox, oz) + 1;
    const y = groundAt(x, z) + 1;
    this.pulse(ox, oy, oz, now, { r0: 1.4, r1: 0.2, dur: 0.35, upright: true });
    this.pulse(x, y, z, now, { r0: 0.2, r1: 1.4, dur: 0.4, upright: true });
    const len = Math.hypot(x - ox, z - oz);
    if (len < 0.5) return;
    const streak = new THREE.Mesh(this.geo.pillar, additive(SOUL_COLOR, 0.26));
    streak.scale.set(0.1, len / 5, 0.1);
    streak.position.set((ox + x) / 2, (oy + y) / 2, (oz + z) / 2);
    streak.rotation.order = 'YXZ';
    streak.rotation.set(Math.PI / 2, Math.atan2(x - ox, z - oz), 0);
    this.group.add(streak);
    this.pulses.push({ mesh: streak, at: now, dur: 0.3, r0: 0, r1: 0, alpha: 0.26 });
  }

  /** Ngự không: gợn linh khí dưới chân (hai vòng nở chậm, nhạt) cho thấy đang đứng trên không. */
  skyRipple(x: number, y: number, z: number, now: number): void {
    this.pulse(x, y, z, now, { r0: 0.4, r1: 1.6, dur: 1.1, alpha: 0.22 });
  }

  /** Tử vong: nguyên anh thoát khỏi thân xác rồi bay (vòng cung) về nơi an toàn trong `dur` giây. */
  flee(from: THREE.Vector3, to: THREE.Vector3, dur: number, now: number, sid = ''): void {
    if (this.flees.length >= MAX_FIGS) this.dropFlee(this.flees.shift()!);
    const mini = sid ? this.make(sid, 'soul') : null;
    let group: THREE.Group;
    if (mini) {
      mini.root.scale.setScalar(SOUL_SCALE);
      group = mini.root;
      this.fleeViews.set(group, mini);
    } else group = makeFigure(this.mat, this.geo);
    this.group.add(group);
    this.flees.push({ group, at: now, dur: Math.max(0.5, dur), from: from.clone(), to: to.clone() });
    this.pulse(from.x, from.y + 0.2, from.z, now, { r0: 0.4, r1: 3, dur: 0.8 });
  }

  private fleeViews = new Map<THREE.Group, CharacterView>();

  private drop(p: Pulse): void {
    this.group.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
  }

  private dropFlee(f: Flee): void {
    this.group.remove(f.group);
    this.fleeViews.get(f.group)?.dispose();
    this.fleeViews.delete(f.group);
  }

  /**
   * Mỗi khung. `scouts`: người đang thám thính (vị trí đã nội suy); `body`: thân xác của mình nếu đang thám thính,
   * `bodySid`/`bodyYaw`: ai và hướng ngồi.
   */
  update(dt: number, scouts: readonly SoulScout[], body: { x: number; y: number; z: number } | null, now: number, bodySid = '', bodyYaw = 0): void {
    this.time += dt;
    const live = new Set<string>();
    let lead: { x: number; y: number; z: number } | null = null;
    // Nguyên anh của mình luôn được vẽ trước khi cắt theo MAX_FIGS.
    const ordered = bodySid ? [...scouts].sort((a, b) => Number(b.sid === bodySid) - Number(a.sid === bodySid)) : scouts;
    for (const s of ordered.slice(0, MAX_FIGS)) {
      live.add(s.sid);
      const bob = Math.sin(this.time * 2.4 + s.x) * 0.06;
      let view = this.views.get(s.sid);
      if (!view) {
        const v = this.make(s.sid, 'soul');
        if (v) {
          v.root.scale.setScalar(SOUL_SCALE);
          this.group.add(v.root);
          this.views.set(s.sid, v);
          view = v;
        }
      }
      if (view) {
        // Hình dự phòng nhường chỗ khi bản thu nhỏ đã dựng xong.
        const f = this.figs.get(s.sid);
        if (f) {
          this.group.remove(f);
          this.figs.delete(s.sid);
        }
        view.root.position.set(s.x, s.y + 0.3 + bob, s.z);
        view.root.rotation.y = s.yaw;
        view.update(dt, { speed: s.speed ?? 0, flying: true, sky: true, meditating: false, dead: false, casting: false, airborne: false });
      } else {
        let g = this.figs.get(s.sid);
        if (!g) {
          g = makeFigure(this.mat, this.geo);
          this.group.add(g);
          this.figs.set(s.sid, g);
        }
        g.position.set(s.x, s.y + 0.35 + bob, s.z);
        g.rotation.y = s.yaw;
      }
      if (body && s.sid === bodySid) lead = { x: s.x, y: s.y + 0.55 + bob, z: s.z };
    }
    for (const [sid, g] of this.figs) {
      if (live.has(sid)) continue;
      this.group.remove(g);
      this.figs.delete(sid);
    }
    for (const [sid, v] of this.views) {
      if (live.has(sid)) continue;
      this.group.remove(v.root);
      v.dispose();
      this.views.delete(sid);
    }
    this.husk.visible = !!body;
    if (body) {
      const gy = groundAt(body.x, body.z);
      this.husk.position.set(body.x, gy + 0.08, body.z);
      this.halo.opacity = 0.09 * (0.85 + 0.15 * Math.sin(this.time * 2));
      // Thân xác bỏ lại: ngồi đả tọa, mờ đi.
      if (!this.huskView && bodySid) {
        const v = this.make(bodySid, 'husk');
        if (v) {
          this.group.add(v.root);
          this.huskView = { sid: bodySid, view: v };
        }
      }
      if (this.huskView) {
        const hv = this.huskView.view;
        hv.root.position.set(body.x, body.y, body.z);
        hv.root.rotation.y = bodyYaw;
        hv.update(dt, { speed: 0, flying: false, meditating: true, dead: false, casting: false, airborne: false });
      }
    } else if (this.huskView) {
      this.group.remove(this.huskView.view.root);
      this.huskView.view.dispose();
      this.huskView = null;
    }
    this.updateTether(body, lead);
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
      this.fleeViews.get(f.group)?.update(dt, { speed: 6, flying: true, sky: true, meditating: false, dead: false, casting: false, airborne: false });
    }
  }

  /** Linh tuyến võng nhẹ từ ngực thân xác tới nguyên anh, cùng vài hạt linh khí bay lên quanh nguyên anh. */
  private updateTether(body: { x: number; y: number; z: number } | null, lead: { x: number; y: number; z: number } | null): void {
    this.tether.visible = !!body && !!lead;
    this.motes.visible = !!lead;
    if (body && lead) {
      const ax = body.x;
      const ay = groundAt(body.x, body.z) + 0.8;
      const az = body.z;
      const len = Math.hypot(lead.x - ax, lead.z - az);
      for (let i = 0; i < TETHER_PTS; i++) {
        const k = i / (TETHER_PTS - 1);
        const sag = Math.sin(Math.PI * k) * Math.min(2.5, len * 0.06);
        const wob = Math.sin(this.time * 2.2 + k * 9) * 0.08 * Math.sin(Math.PI * k);
        this.tetherPos[i * 3] = ax + (lead.x - ax) * k + wob;
        this.tetherPos[i * 3 + 1] = ay + (lead.y - ay) * k - sag + wob;
        this.tetherPos[i * 3 + 2] = az + (lead.z - az) * k - wob;
      }
      (this.tether.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.tether.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(this.time * 3);
    }
    if (lead) {
      for (let i = 0; i < MOTES; i++) {
        const m = this.moteSeed[i];
        const h = (m.h + this.time * m.s * 0.4) % 1;
        const a = m.a + this.time * 0.8;
        this.motePos[i * 3] = lead.x + Math.cos(a) * m.r * (1 - h * 0.4);
        this.motePos[i * 3 + 1] = lead.y - 0.3 + h * 1.4;
        this.motePos[i * 3 + 2] = lead.z + Math.sin(a) * m.r * (1 - h * 0.4);
      }
      (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    for (const p of this.pulses) this.drop(p);
    this.pulses = [];
    for (const f of this.flees) this.dropFlee(f);
    this.flees = [];
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.huskView?.view.dispose();
    this.huskView = null;
    this.tether.geometry.dispose();
    (this.tether.material as THREE.Material).dispose();
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    this.group.parent?.remove(this.group);
    this.mat.dispose();
    this.halo.dispose();
    this.ringMat.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
  }
}
