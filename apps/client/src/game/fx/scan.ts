// Hình ảnh thần thức (E2-E): vòng hội tụ dưới chân lúc đang vận, vòng sóng nở ra theo phạm vi khi quét xong, cột sáng mảnh tại
// tinh anh, thủ lĩnh, điểm hái, người chơi và điểm đáng chú ý lộ ra (tối đa `MAX_BEAMS`, hiện tới hết `ttl`). Chỉ là lớp
// trình diễn: kết quả quét do server quyết định (`SpiritScanMsg`). Vật phát sáng dùng cộng sáng với độ đục thấp, không lóa cảnh.

import * as THREE from 'three/webgpu';
import type { SpiritKind } from '@dtl/shared';
import { groundAt } from '../core/levelCtx';
import type { SpiritScan, SpiritState } from '../../ui/store';

/** Màu theo loại điểm (cũng dùng cho biểu tượng minimap). */
const SPIRIT_COLOR: Record<SpiritKind, number> = { boss: 0xff6a4a, elite: 0xffb84a, mon: 0xd8d2c0, node: 0x7dffa0, player: 0x5cb8ff, poi: 0xe8c46a };

/** Các loại có cột sáng trong thế giới (quái thường chỉ hiện trên minimap cho khỏi rối). */
const BEAM_KINDS: ReadonlySet<SpiritKind> = new Set(['boss', 'elite', 'node', 'player', 'poi']);
const MAX_BEAMS = 28;
const BEAM_H = 46;
const WAVE_MS = 1100;
const BEAM_ALPHA = 0.5;

const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

export class SpiritVis {
  private group = new THREE.Group();
  private geo = { ring: new THREE.RingGeometry(0.985, 1, 128), focus: new THREE.RingGeometry(0.985, 1, 96), beam: new THREE.CylinderGeometry(0.4, 0.4, BEAM_H, 10, 1, true), foot: new THREE.RingGeometry(0.55, 0.8, 24) };
  private mats = new Map<number, THREE.MeshBasicMaterial>();
  private wave: THREE.Mesh;
  private focus: THREE.Mesh;
  private beams: THREE.Group[] = [];
  private scanAt = -1;
  private waveAt = -1;
  private scan: SpiritScan | null = null;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'spiritVis';
    parent.add(this.group);
    this.wave = new THREE.Mesh(this.geo.ring, additive(0x7fc8e8, 0));
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.visible = false;
    this.focus = new THREE.Mesh(this.geo.focus, additive(0x9fe8ff, 0));
    this.focus.rotation.x = -Math.PI / 2;
    this.focus.visible = false;
    this.group.add(this.wave, this.focus);
  }

  private mat(color: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = additive(color, BEAM_ALPHA);
      this.mats.set(color, m);
    }
    return m;
  }

  /** Số cột sáng đang dựng (để test/ảnh chụp). */
  get beamCount(): number {
    return this.beams.length;
  }

  private rebuild(scan: SpiritScan | null): void {
    for (const b of this.beams) this.group.remove(b);
    this.beams = [];
    if (!scan) return;
    // Gần mình trước, boss và tinh anh luôn được giữ chỗ.
    const order = scan.hits.filter((h) => BEAM_KINDS.has(h.k)).sort((a, b) => (a.k === 'boss' ? 0 : a.k === 'elite' ? 1 : 2) - (b.k === 'boss' ? 0 : b.k === 'elite' ? 1 : 2));
    for (const h of order.slice(0, MAX_BEAMS)) {
      const color = SPIRIT_COLOR[h.k];
      const g = new THREE.Group();
      const beam = new THREE.Mesh(this.geo.beam, this.mat(color));
      beam.position.y = BEAM_H / 2;
      const foot = new THREE.Mesh(this.geo.foot, this.mat(color));
      foot.rotation.x = -Math.PI / 2;
      foot.position.y = 0.12;
      g.add(beam, foot);
      g.position.set(h.x, groundAt(h.x, h.z), h.z);
      this.group.add(g);
      this.beams.push(g);
    }
  }

  /** Mỗi khung. `me`: vị trí người chơi đã nội suy; `now` = performance.now(). */
  update(me: THREE.Vector3, state: SpiritState, scan: SpiritScan | null, now: number): void {
    // Đang vận: vòng hội tụ về chân, sáng dần.
    const channeling = state.chUntil > now;
    this.focus.visible = channeling;
    if (channeling) {
      const left = Math.max(0, state.chUntil - now);
      const k = 1 - Math.min(1, left / 2500);
      this.focus.position.set(me.x, groundAt(me.x, me.z) + 0.13, me.z);
      this.focus.scale.setScalar(Math.max(1.2, state.r * (1 - k) * 0.4));
      this.focus.rotation.z = now * 0.002 * (1 + k * 4);
      (this.focus.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.14 * k;
    }
    // Kết quả mới: một lần sóng nở và dựng cột sáng.
    if (scan !== this.scan) {
      this.scan = scan;
      this.rebuild(scan);
      if (scan && scan.at !== this.scanAt) {
        this.scanAt = scan.at;
        this.waveAt = now;
      }
    }
    if (this.waveAt >= 0 && this.scan) {
      const k = (now - this.waveAt) / WAVE_MS;
      if (k >= 1) {
        this.waveAt = -1;
        this.wave.visible = false;
      } else {
        this.wave.visible = true;
        this.wave.position.set(this.scan.x, groundAt(this.scan.x, this.scan.z) + 0.15, this.scan.z);
        this.wave.scale.setScalar(Math.max(1, this.scan.r * (1 - (1 - k) ** 2)));
        (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k) ** 1.5;
      }
    }
    if (this.beams.length && this.scan) {
      const left = this.scan.until - now;
      const fade = Math.max(0, Math.min(1, left / 800));
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.006);
      for (const m of this.mats.values()) m.opacity = BEAM_ALPHA * fade * pulse;
      if (left <= 0) this.rebuild(null);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    (this.wave.material as THREE.Material).dispose();
    (this.focus.material as THREE.Material).dispose();
  }
}
