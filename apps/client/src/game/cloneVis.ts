// Hình ảnh phân thân thần niệm (E4-K): bản sao cỡ người thật của chính nhân vật (vật liệu linh thể dùng chung với nguyên anh),
// vòng chân + vòng gợn + vòng lĩnh vực đều lấy từ FxPool (`vfx.fx` / `vfx.drop`, không tạo material), màu theo bảng nhánh ở
// `render/vfx/palette.ts`, có lớp bóng sẫm dưới vòng sáng để đọc được trên nền đá sáng. Bước theo đoạn đường server báo (`clone_mv`),
// vung tay khi ra chiêu (`clone_act`), tan dần (chìm xuống + vòng mờ) khi hết giờ hoặc vỡ.
// Phân thân của người khác: mờ hơn một bậc, bỏ vòng gợn khi pool đông, ẩn khi xa quá `OTHERS_FX_DIST` (xem fxBudget.ts).
// Chỉ là lớp trình diễn; luật do server giữ (`apps/server/src/game/clone.ts`).

import * as THREE from 'three/webgpu';
import { CLONE_SPEED } from '@dtl/shared';
import { groundAt } from './levelCtx';
import { OTHERS_FX_DIST, OTHERS_FX_LIVE_MAX } from './fxBudget';
import { paletteOf } from '../render/vfx/palette';
import type { FxMesh } from '../render/materials/vfx';
import type { Vfx } from './vfx';
import type { CharacterView } from './character/view';

/** Dựng bản sao của người chơi `sid` (null nếu asset chưa nạp hoặc model khối: dùng hình dự phòng). */
type CloneMaker = (sid: string) => CharacterView | null;

/** Vai trò → id công pháp để lấy bảng màu nhánh. */
const ROLE_METHOD: Record<string, string> = { dps: 'lac_kiem_quyet', tank: 'bat_dong_kim_than', support: 'thanh_moc_dan_kinh' };
const MAX_PULSES = 10;
const FADE = 0.7;
const OTHERS_MUL = 0.6;

// Hình học dùng chung toàn game (pool giữ theo hình), không dispose.
const RING = new THREE.RingGeometry(0.9, 1, 48);
const DISC = new THREE.CircleGeometry(1, 32);
const DOMAIN_RING = new THREE.RingGeometry(0.985, 1, 96);
const FB_HEAD = new THREE.SphereGeometry(0.17, 12, 8);
const FB_BODY = new THREE.ConeGeometry(0.26, 0.95, 12, 1, true);

interface Pulse {
  mesh: FxMesh;
  at: number;
  dur: number;
  r: number;
  a: number;
}

interface Fig {
  sid: string;
  mine: boolean;
  view: CharacterView | null;
  /** Hình dự phòng (đầu + thân) khi model chưa nạp: lưới của pool, trả khi có model hoặc khi gỡ. */
  fb: FxMesh[] | null;
  ring: FxMesh;
  shade: FxMesh;
  x: number;
  z: number;
  gx: number;
  gz: number;
  yaw: number;
  born: number;
  dur: number;
  fade: number;
  ending: boolean;
  speed: number;
  body: number;
  rim: number;
  shadow: number;
}

export class CloneVis {
  private figs = new Map<string, Fig>();
  private pulses: Pulse[] = [];
  private time = 0;
  private cam = { x: 0, z: 0 };
  private domain: FxMesh | null = null;
  private domainR = 0;
  private group = new THREE.Group();

  constructor(
    private parent: THREE.Object3D,
    private vfx: Vfx,
    private mySid: string,
    private make: CloneMaker = () => null,
  ) {
    this.group.name = 'cloneVis';
    parent.add(this.group);
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

  /** Vòng lĩnh vực quanh (x, z) bán kính `r`; null = tắt. Chỉ là lớp hình. */
  setDomain(at: { x: number; z: number; r: number } | null): void {
    if (!at) {
      if (this.domain) {
        this.vfx.drop(this.domain);
        this.domain = null;
      }
      return;
    }
    if (!this.domain) {
      this.domain = this.vfx.fx(DOMAIN_RING, 0xcfe6dc, 0.1, 'flat');
      this.domain.rotation.x = -Math.PI / 2;
    }
    this.domainR = at.r;
    this.domain.position.set(at.x, groundAt(at.x, at.z) + 0.07, at.z);
  }

  private crowded(mine: boolean, x: number, z: number): boolean {
    if (mine) return false;
    return Math.hypot(x - this.cam.x, z - this.cam.z) > OTHERS_FX_DIST || this.vfx.pool.live >= OTHERS_FX_LIVE_MAX;
  }

  spawn(sid: string, x: number, z: number, dur: number, role: string, yaw: number): void {
    this.remove(sid);
    const pal = paletteOf(ROLE_METHOD[role]);
    const mine = sid === this.mySid;
    const k = mine ? 1 : OTHERS_MUL;
    const shade = this.vfx.fx(DISC, pal.shadow, 0.4 * k, 'shade');
    shade.rotation.x = -Math.PI / 2;
    const ring = this.vfx.fx(RING, pal.body, 0.5 * k, 'flat');
    ring.rotation.x = -Math.PI / 2;
    this.figs.set(sid, { sid, mine, view: null, fb: null, ring, shade, x, z, gx: x, gz: z, yaw, born: this.time, dur, fade: 0, ending: false, speed: 0, body: pal.body, rim: pal.rim, shadow: pal.shadow });
    this.pulse(x, z, 1.8, 0.7, pal.rim, mine);
  }

  move(sid: string, x: number, z: number): void {
    const f = this.figs.get(sid);
    if (f) {
      f.gx = x;
      f.gz = z;
    }
  }

  /** Ra chiêu: quay về mục tiêu và gợn vòng nếu chiêu vùng. */
  act(sid: string, tx: number | null, tz: number | null, r: number): void {
    const f = this.figs.get(sid);
    if (!f) return;
    if (tx !== null && tz !== null) f.yaw = Math.atan2(tx - f.x, tz - f.z);
    f.view?.attack();
    if (r > 0) this.pulse(f.x, f.z, r, 0.5, f.body, f.mine);
  }

  hit(sid: string): void {
    const f = this.figs.get(sid);
    if (f) this.pulse(f.x, f.z, 1.4, 0.3, 0xfff0b8, f.mine);
  }

  /** Thu lại; `boom` = vỡ (gợn rộng hơn, màu vàng nhạt). */
  end(sid: string, boom: boolean): void {
    const f = this.figs.get(sid);
    if (!f || f.ending) return;
    f.ending = true;
    this.pulse(f.x, f.z, boom ? 3 : 2.2, boom ? 0.4 : 0.8, boom ? 0xfff0b8 : f.rim, f.mine);
  }

  /** Gỡ hết phân thân đang vẽ (đổi level, nối lại). */
  clear(): void {
    for (const sid of [...this.figs.keys()]) this.remove(sid);
    for (const p of this.pulses) this.vfx.drop(p.mesh);
    this.pulses.length = 0;
    this.setDomain(null);
  }

  pulse(x: number, z: number, r: number, dur: number, color: number, mine = true): void {
    if (this.crowded(mine, x, z)) return;
    if (this.pulses.length >= MAX_PULSES) this.vfx.drop(this.pulses.shift()!.mesh);
    const a = mine ? 0.4 : 0.4 * OTHERS_MUL;
    const mesh = this.vfx.fx(RING, color, a, 'flat');
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, groundAt(x, z) + 0.1, z);
    this.pulses.push({ mesh, at: this.time, dur, r, a });
  }

  private dropFallback(f: Fig): void {
    if (!f.fb) return;
    for (const m of f.fb) this.vfx.drop(m);
    f.fb = null;
  }

  private remove(sid: string): void {
    const f = this.figs.get(sid);
    if (!f) return;
    if (f.view) {
      this.group.remove(f.view.root);
      f.view.dispose();
    }
    this.dropFallback(f);
    this.vfx.drop(f.ring);
    this.vfx.drop(f.shade);
    this.figs.delete(sid);
  }

  /** `cx, cz`: vị trí người xem (cắt theo khoảng cách cho phân thân của người khác). */
  update(dt: number, cx = this.cam.x, cz = this.cam.z): void {
    this.time += dt;
    this.cam.x = cx;
    this.cam.z = cz;
    if (this.domain) {
      this.domain.scale.setScalar(this.domainR * (1 + Math.sin(this.time * 1.2) * 0.006));
      this.domain.fxOpacity = 0.09 + Math.sin(this.time * 1.2) * 0.02;
    }
    for (const f of [...this.figs.values()]) {
      if (!f.ending && this.time - f.born >= f.dur + 0.5) f.ending = true;
      f.fade = f.ending ? Math.max(0, f.fade - dt / FADE) : Math.min(1, f.fade + dt * 3);
      if (f.ending && f.fade <= 0) {
        this.remove(f.sid);
        continue;
      }
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
      const far = !f.mine && Math.hypot(f.x - cx, f.z - cz) > OTHERS_FX_DIST;
      const gy = groundAt(f.x, f.z);
      const k = f.mine ? 1 : OTHERS_MUL;
      // Chìm xuống rồi mất khi tan (không tắt cái rụp): thân co theo chiều cao, vòng mờ theo fade.
      const ease = f.fade * f.fade * (3 - 2 * f.fade);
      f.ring.position.set(f.x, gy + 0.08, f.z);
      f.ring.scale.setScalar((1.3 + Math.sin(this.time * 2) * 0.08) * (0.7 + 0.3 * ease));
      f.ring.fxOpacity = (far ? 0 : 0.5 * k) * ease;
      f.shade.position.set(f.x, gy + 0.05, f.z);
      f.shade.scale.setScalar(1.5 * (0.7 + 0.3 * ease));
      f.shade.fxOpacity = (far ? 0 : 0.4 * k) * ease;
      if (!f.view) {
        const v = far ? null : this.make(f.sid);
        if (v) {
          f.view = v;
          this.group.add(v.root);
          this.dropFallback(f);
        } else if (!f.fb && !far) {
          const head = this.vfx.fx(FB_HEAD, f.body, 0.4 * k, 'glow');
          const body = this.vfx.fx(FB_BODY, f.body, 0.4 * k, 'glow');
          f.fb = [head, body];
        }
      }
      const bob = Math.sin(this.time * 1.8) * 0.04;
      if (f.view) {
        f.view.root.visible = !far && ease > 0.02;
        f.view.root.position.set(f.x, gy + bob, f.z);
        f.view.root.rotation.y = f.yaw;
        f.view.root.scale.set(1, Math.max(0.02, ease), 1);
        if (f.view.root.visible) f.view.update(dt, { speed: f.speed, flying: false, meditating: false, dead: false, casting: false, airborne: false, combat: true });
      } else if (f.fb) {
        const [head, body] = f.fb;
        const s = Math.max(0.02, ease);
        head.position.set(f.x, gy + bob + 0.1 + 1.6 * s, f.z);
        head.scale.setScalar(s);
        head.fxOpacity = 0.4 * k * ease;
        body.position.set(f.x, gy + bob + 0.1 + 0.8 * s, f.z);
        body.scale.setScalar(1.7 * s);
        body.fxOpacity = 0.4 * k * ease;
      }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const k = (this.time - p.at) / p.dur;
      if (k >= 1) {
        this.vfx.drop(p.mesh);
        this.pulses.splice(i, 1);
        continue;
      }
      p.mesh.scale.setScalar(Math.max(0.1, p.r * (0.25 + 0.75 * k)));
      p.mesh.fxOpacity = p.a * (1 - k);
    }
  }

  dispose(): void {
    this.clear();
    this.parent.remove(this.group);
  }
}
