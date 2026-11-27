// Lớp vẽ VÙNG TRÚNG THẬT (Diễn Võ Trường, sân boss): viền mảnh trên sàn cho từng vùng sát thương, vẽ đè lên vạch báo để so khớp bằng mắt
// và bằng kịch bản đo (`tools/perf/src/scenarios/zonecheck.ts`). Chỉ có ở bản dev (nạp từ `boot.ts`).
//
// Nguồn dữ liệu là các tin server VỐN ĐÃ gửi cho mọi client (`S.HAZARD`, `S.FX`): không thêm tin, lệnh GM hay quyền gì, nên không mở
// đường nào để biết trước hay né đòn ngoài những gì client thường đã thấy. Hình dựng ở `zoneShapes.ts` (khớp `inHazard` của server).
import * as THREE from 'three/webgpu';
import { pathBasicOf, SKILL } from '@dtl/content';
import { S, type FxMsg, type HazardMsg } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import type { Game } from '../engine';
import { zoneDistOutside, zoneOfArc, zoneOfHazard, zoneOfLine, zoneOutline, type Zone } from './zoneShapes';

export interface ZoneEntry {
  zone: Zone;
  /** `mon`: đòn vùng của quái/boss (chính xác); `skill`: chiêu vùng/đường thẳng của người chơi; `arc`: đòn chém quét (hướng lấy theo vị trí lúc tin tới). */
  from: 'mon' | 'skill' | 'arc';
  /** id quái hoặc sid người chơi. */
  src: string;
  /** Loại chiêu mở rộng của quái (`mv` của tin) hoặc loại fx của chiêu người chơi. */
  tag: string;
  /** Giờ máy (ms) lúc tin tới và lúc server phán định (tin tới + `delay`). */
  t0: number;
  at: number;
}

const COLOR = { mon: 0xdaf4ff, skill: 0xc8ff9a, arc: 0xc8ff9a };
/** Bề dày viền (m) và độ nâng khỏi sàn. */
const WIDTH = 0.07;
const LIFT = 0.16;
/** Viền còn hiện bao lâu sau lúc phán định (ms), và hệ số sáng để vượt lớp ánh đêm của Dạ Họa. */
const LINGER = 700;
const GLOW = 2.6;
const LOG_MAX = 40;

/** Loại fx của các chiêu đường thẳng / chiêu vùng của người chơi (đọc từ dữ liệu chiêu). */
const LINE_FX = new Set<string>();
const AOE_FX = new Set<string>();
for (const s of SKILL.values()) {
  if (s.kind === 'line') LINE_FX.add(s.fx);
  else if (s.kind === 'aoe') AOE_FX.add(s.fx);
}

/** Dải viền mảnh nằm trên sàn dọc theo một đa giác khép kín. */
function ribbon(pts: [number, number][]): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i]!;
    const a = pts[(i + n - 1) % n]!;
    const b = pts[(i + 1) % n]!;
    // Pháp tuyến trung bình của hai cạnh kề (trên mặt sàn).
    let nx = b[1] - a[1];
    let nz = -(b[0] - a[0]);
    const l = Math.hypot(nx, nz) || 1;
    nx = (nx / l) * (WIDTH / 2);
    nz = (nz / l) * (WIDTH / 2);
    const y = heightAt(x, z) + LIFT;
    pos.set([x - nx, y, z - nz, x + nx, y, z + nz], i * 6);
    const j = ((i + 1) % n) * 2;
    idx.push(i * 2, i * 2 + 1, j, i * 2 + 1, j + 1, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class ZoneOverlay {
  private on = false;
  private group = new THREE.Group();
  private live: { e: ZoneEntry; mesh: THREE.Mesh; until: number }[] = [];
  private bound: unknown = null;
  private unbind: (() => void)[] = [];
  private raf = 0;
  /** Đang giữ nguyên các viền (kịch bản đo dừng hình để chụp): không mờ, không dọn. */
  private held = false;
  private subs = new Set<() => void>();
  /** Các vùng gần nhất (mới nhất ở cuối), cho kịch bản đo và bảng. */
  readonly log: ZoneEntry[] = [];

  constructor(private eng: Game) {
    this.group.name = 'lab-zone-overlay';
  }

  isOn = (): boolean => this.on;
  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  };

  enable(): void {
    if (this.on) return;
    this.on = true;
    this.eng.scene.add(this.group);
    const tick = () => {
      if (!this.on) return;
      this.rebind();
      if (!this.held) this.prune(performance.now());
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    for (const cb of this.subs) cb();
  }

  disable(): void {
    if (!this.on) return;
    this.on = false;
    cancelAnimationFrame(this.raf);
    for (const f of this.unbind.splice(0)) f();
    this.bound = null;
    for (const l of this.live.splice(0)) this.drop(l.mesh);
    this.group.removeFromParent();
    for (const cb of this.subs) cb();
  }

  toggle(): boolean {
    if (this.on) this.disable();
    else this.enable();
    return this.on;
  }

  /** Room đổi (qua bản đồ, vào phòng tập) thì nghe lại trên room mới. */
  private rebind(): void {
    const rm = this.eng.room;
    if (rm === this.bound || this.eng.disposed) return;
    for (const f of this.unbind.splice(0)) f();
    this.bound = rm;
    const add = (type: string, fn: (m: never) => void) => {
      const off = rm.onMessage(type, fn as (m: unknown) => void) as unknown;
      if (typeof off === 'function') this.unbind.push(off as () => void);
    };
    add(S.HAZARD, (m: HazardMsg) => this.onHazard(m));
    add(S.FX, (m: FxMsg) => this.onFx(m));
  }

  private onHazard(m: HazardMsg): void {
    const now = performance.now();
    // Vũng/vệt lửa còn gây sát thương suốt `dur` giây sau lúc nổ.
    this.push({ zone: zoneOfHazard(m), from: 'mon', src: m.src ?? '', tag: m.mv ?? m.kind, t0: now, at: now + m.delay * 1000 }, (m.dur ?? 0) * 1000);
  }

  private onFx(m: FxMsg): void {
    if (!m.src) return;
    const p = this.eng.view.players?.get(m.src);
    if (!p) return;
    const now = performance.now();
    const base = { src: m.src, tag: m.t, t0: now, at: now };
    if (LINE_FX.has(m.t) && m.x !== undefined && m.z !== undefined && m.d) {
      this.push({ ...base, zone: zoneOfLine(p.x, p.z, m.x, m.z, m.d), from: 'skill' });
    } else if (AOE_FX.has(m.t) && m.x !== undefined && m.z !== undefined && m.r) {
      this.push({ ...base, zone: { kind: 'circle', x: m.x, z: m.z, r: m.r }, from: 'skill' });
    } else if (m.n !== undefined && m.dst) {
      // Đòn thường của hướng cận chiến: cung trước mặt, hướng người đánh → mục tiêu (server tính lúc trúng; ở đây lấy vị trí lúc tin tới).
      const arc = pathBasicOf({ combo: true }, this.eng.methodOfPlayer(m.src))?.arc;
      const t = this.eng.view.monsters?.get(m.dst);
      if (arc && t) this.push({ ...base, zone: zoneOfArc(p.x, p.z, t.x, t.z, arc.r, arc.deg), from: 'arc' });
    }
  }

  private push(e: ZoneEntry, extra = 0): void {
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.shift();
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    mat.color.setHex(COLOR[e.from]).multiplyScalar(GLOW);
    const mesh = new THREE.Mesh(ribbon(zoneOutline(e.zone)), mat);
    mesh.renderOrder = 45;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.live.push({ e, mesh, until: e.at + extra + LINGER });
  }

  private prune(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      // Trước lúc phán định: viền mờ; đúng lúc phán định: sáng hẳn rồi tan dần.
      mat.opacity = now < l.e.at ? 0.55 : Math.max(0, Math.min(1, (l.until - now) / LINGER));
      if (now >= l.until) {
        this.drop(l.mesh);
        this.live.splice(i, 1);
      }
    }
  }

  private drop(mesh: THREE.Mesh): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  /**
   * Mặt nạ màn hình của một vùng (cho kịch bản đo so với vạch báo): chia khung hình thành ô `cell` × `cell` điểm ảnh, mỗi ô chiếu tâm ô
   * xuống mặt sàn (độ cao `y`) rồi trả khoảng cách tới vùng: 0 = trong vùng, > 0 = cách viền bấy nhiêu mét, -1 = tia không chạm sàn.
   */
  screenMask(zone: Zone, cell: number, y: number): { w: number; h: number; dist: number[] } {
    const cam = this.eng.camera;
    const cv = this.eng.canvas.getBoundingClientRect();
    const w = Math.floor(cv.width / cell);
    const h = Math.floor(cv.height / cell);
    const dist = new Array<number>(w * h);
    const o = cam.position;
    const v = new THREE.Vector3();
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        v.set((((i + 0.5) * cell) / cv.width) * 2 - 1, 1 - (((j + 0.5) * cell) / cv.height) * 2, 0.5).unproject(cam).sub(o);
        const t = v.y < -1e-6 ? (y - o.y) / v.y : -1;
        dist[j * w + i] = t > 0 ? Math.round(zoneDistOutside(zone, o.x + v.x * t, o.z + v.z * t) * 100) / 100 : -1;
      }
    return { w, h, dist };
  }

  /** Giữ nguyên các viền đang hiện (không mờ dần, không dọn) trong lúc kịch bản đo dừng hình; `false` thì chạy tiếp và dọn như thường. */
  hold(on: boolean): void {
    this.held = on;
    if (on) for (const l of this.live) (l.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  /** Ẩn/hiện viền mà không tắt việc ghi nhật ký (kịch bản đo chụp ảnh KHÔNG có viền). */
  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.disable();
    this.subs.clear();
  }
}
