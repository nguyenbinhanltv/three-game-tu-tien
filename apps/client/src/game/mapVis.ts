// Hình ảnh của Truyền Tống Trận và điểm đánh dấu trong thế giới (M-4). Chỉ là lớp trình diễn: trạng thái mở khóa/niệm/điểm đánh dấu
// đến từ server (S.TELE, S.MARK), không đổi luật. Mô hình trận dựng thủ tục: bệ đá + bốn trụ gộp một mesh, hai vòng rune quay
// ngược chiều, cột sáng mảnh khi đã mở. Ngân sách: trận chỉ hiện trong 260 m (≤ 4 draw call mỗi trận); mọi vật phát sáng
// dưới `FX_MAX_HDR` nên bloom chỉ bắt nét rune, không cháy cảnh.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type MarkInfo, TELE_PADS, type TelePad } from '@dtl/shared';
import { groundAt } from './levelCtx';

const PAD_SHOW = 260;
const OPEN_COLOR = 0x8fe8ff;
const LOCKED_COLOR = 0x7a7f86;
const OWN_COLOR = 0xffd54a;
const MATE_COLOR = 0x5cb8ff;
const MARK_BEAM_H = 150;

const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

interface PadVis {
  pad: TelePad;
  root: THREE.Group;
  runeA: THREE.Mesh;
  runeB: THREE.Mesh;
  beam: THREE.Mesh;
  open: boolean;
}

interface MarkVisItem {
  root: THREE.Group;
  own: boolean;
}

export class MapVis {
  readonly group = new THREE.Group();
  private pads: PadVis[] = [];
  private marks = new Map<number, MarkVisItem>();
  private lastMarks: readonly MarkInfo[] | null = null;
  private lastOpen: readonly string[] | null = null;
  private castRing: THREE.Mesh;
  private pulse: THREE.Mesh;
  private pulseAt = -1;
  private castWas = false;
  private castFrom = new THREE.Vector3();

  private geo = {
    stone: this.stoneGeometry(),
    runeA: new THREE.RingGeometry(1.7, 2.05, 56, 1, 0, Math.PI * 1.55),
    runeB: new THREE.RingGeometry(2.3, 2.45, 56),
    beam: new THREE.CylinderGeometry(0.22, 0.42, 26, 12, 1, true),
    markBeam: new THREE.CylinderGeometry(0.3, 0.3, MARK_BEAM_H, 10, 1, true),
    markRing: new THREE.RingGeometry(0.9, 1.15, 28),
    cast: new THREE.RingGeometry(0.72, 1, 40),
  };
  private mat = {
    stone: new THREE.MeshStandardMaterial({ color: 0x7b7f78, roughness: 0.92, metalness: 0.02 }),
    open: additive(OPEN_COLOR, 0.8),
    locked: additive(LOCKED_COLOR, 0.35),
    beam: additive(OPEN_COLOR, 0.09),
    markOwn: additive(OWN_COLOR, 0.62),
    markMate: additive(MATE_COLOR, 0.62),
    markRingOwn: additive(OWN_COLOR, 0.8),
    markRingMate: additive(MATE_COLOR, 0.8),
    cast: additive(OPEN_COLOR, 1),
  };

  constructor(scene: THREE.Scene, withPads: boolean) {
    this.group.name = 'mapVis';
    if (withPads) for (const pad of TELE_PADS) this.pads.push(this.buildPad(pad));
    this.castRing = new THREE.Mesh(this.geo.cast, this.mat.cast);
    this.castRing.rotation.x = -Math.PI / 2;
    this.castRing.visible = false;
    this.pulse = new THREE.Mesh(this.geo.cast, this.mat.cast.clone());
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.visible = false;
    this.group.add(this.castRing, this.pulse);
    scene.add(this.group);
  }

  /** Bệ đá tròn và bốn trụ ngắn, gộp một geometry (một draw call). */
  private stoneGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.CylinderGeometry(2.9, 3.2, 0.34, 24);
    base.translate(0, 0.17, 0);
    parts.push(base);
    const inner = new THREE.CylinderGeometry(2.1, 2.1, 0.1, 24);
    inner.translate(0, 0.38, 0);
    parts.push(inner);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pillar = new THREE.CylinderGeometry(0.17, 0.24, 1.7, 7);
      pillar.translate(Math.cos(a) * 2.6, 1.0, Math.sin(a) * 2.6);
      parts.push(pillar);
      const cap = new THREE.SphereGeometry(0.25, 8, 6);
      cap.translate(Math.cos(a) * 2.6, 1.95, Math.sin(a) * 2.6);
      parts.push(cap);
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    return merged ?? new THREE.CylinderGeometry(2.9, 3.2, 0.34, 24);
  }

  private buildPad(pad: TelePad): PadVis {
    const root = new THREE.Group();
    root.position.set(pad.x, groundAt(pad.x, pad.z), pad.z);
    const stone = new THREE.Mesh(this.geo.stone, this.mat.stone);
    stone.castShadow = false;
    stone.receiveShadow = true;
    const runeA = new THREE.Mesh(this.geo.runeA, this.mat.locked);
    const runeB = new THREE.Mesh(this.geo.runeB, this.mat.locked);
    for (const r of [runeA, runeB]) {
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.45;
    }
    const beam = new THREE.Mesh(this.geo.beam, this.mat.beam);
    beam.position.y = 13.4;
    beam.visible = false;
    root.add(stone, runeA, runeB, beam);
    this.group.add(root);
    return { pad, root, runeA, runeB, beam, open: false };
  }

  /** Cập nhật trạng thái mở khóa của từng trận khi danh sách đổi. */
  setOpen(open: readonly string[]): void {
    if (open === this.lastOpen) return;
    this.lastOpen = open;
    const set = new Set(open);
    for (const p of this.pads) {
      p.open = set.has(p.pad.id);
      const m = p.open ? this.mat.open : this.mat.locked;
      p.runeA.material = m;
      p.runeB.material = m;
      p.beam.visible = p.open;
    }
  }

  /** Dựng lại cột sáng điểm đánh dấu khi danh sách đổi (tối đa 4 người, mỗi người một điểm). */
  setMarks(marks: readonly MarkInfo[]): void {
    if (marks === this.lastMarks) return;
    this.lastMarks = marks;
    const keep = new Set<number>();
    for (const m of marks) {
      keep.add(m.id);
      let it = this.marks.get(m.id);
      if (!it || it.own !== m.own) {
        if (it) this.removeMark(m.id);
        const root = new THREE.Group();
        const beam = new THREE.Mesh(this.geo.markBeam, m.own ? this.mat.markOwn : this.mat.markMate);
        beam.position.y = MARK_BEAM_H / 2;
        const ring = new THREE.Mesh(this.geo.markRing, m.own ? this.mat.markRingOwn : this.mat.markRingMate);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;
        root.add(beam, ring);
        this.group.add(root);
        it = { root, own: m.own };
        this.marks.set(m.id, it);
      }
      it.root.position.set(m.x, groundAt(m.x, m.z), m.z);
    }
    for (const id of [...this.marks.keys()]) if (!keep.has(id)) this.removeMark(id);
  }

  private removeMark(id: number): void {
    const it = this.marks.get(id);
    if (!it) return;
    this.group.remove(it.root);
    this.marks.delete(id);
  }

  /**
   * Mỗi khung. `me` là vị trí người chơi (đã nội suy), `cast` là lượt niệm đang chạy (`until` theo performance.now),
   * `now` = performance.now() (ms).
   */
  update(me: THREE.Vector3, cast: { until: number } | null, now: number, castMs: number): void {
    const t = now * 0.001;
    for (const p of this.pads) {
      const d = Math.hypot(p.root.position.x - me.x, p.root.position.z - me.z);
      p.root.visible = d < PAD_SHOW;
      if (!p.root.visible) continue;
      p.runeA.rotation.z = t * 0.5;
      p.runeB.rotation.z = -t * 0.3;
      if (p.open) p.beam.scale.set(1, 1, 1);
    }
    for (const it of this.marks.values()) {
      const ring = it.root.children[1];
      ring.rotation.z = t * 0.8;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.1);
    }
    // Vòng niệm quanh chân người chơi: thu nhỏ dần và quay nhanh dần theo tiến độ.
    if (cast) {
      const k = 1 - Math.min(1, Math.max(0, (cast.until - now) / castMs));
      this.castRing.visible = true;
      this.castRing.position.set(me.x, groundAt(me.x, me.z) + 0.12, me.z);
      this.castRing.scale.setScalar(2.4 - k * 1.4);
      this.castRing.rotation.z = t * (2 + k * 8);
      (this.castRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.5 * k;
      if (!this.castWas) this.castFrom.copy(me);
      this.castWas = true;
    } else {
      this.castRing.visible = false;
      // Hết niệm mà đã nhảy xa khỏi chỗ bắt đầu: nở một vòng sáng ở chỗ đến.
      if (this.castWas && Math.hypot(me.x - this.castFrom.x, me.z - this.castFrom.z) > 25) this.pulseAt = now;
      this.castWas = false;
    }
    if (this.pulseAt >= 0) {
      const k = (now - this.pulseAt) / 700;
      if (k >= 1) {
        this.pulseAt = -1;
        this.pulse.visible = false;
      } else {
        this.pulse.visible = true;
        this.pulse.position.set(me.x, groundAt(me.x, me.z) + 0.14, me.z);
        this.pulse.scale.setScalar(1 + k * 6);
        (this.pulse.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    (this.pulse.material as THREE.Material).dispose();
  }
}
