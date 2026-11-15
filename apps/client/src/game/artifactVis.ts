// Pháp bảo phụ trên người chơi (P3-8): model Tripo + animation thủ tục. Không xương, không clip: mỗi khung đặt
// vị trí/xoay/cỡ theo thời gian. Lúc thường treo/đeo sát người (hồ lô bên hông trái, linh bên hông phải, ấn sau lưng);
// khi kích hoạt (FX `art` từ server) bay lên: hồ lô xoay quanh người, linh lơ lửng trước mặt và rung, ấn nâng lên trên đầu.
// Chỉ là lớp hình: không đọc luật, không có đèn, không đổ bóng, không cộng sáng (không lóa che nhân vật).
import * as THREE from 'three/webgpu';
import type { ArtifactKind } from '@dtl/shared';
import { ARTIFACT } from '@dtl/content';
import { assets, type AssetHandle } from './assets';
import { adoptGltfMaterials } from '../render/materials/world';

/** Tư thế trong khung nhân vật: x = bên trái, y = lên, z = phía trước (trùng quy ước import Tripo). */
export interface ArtPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

const blank = (): ArtPose => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 });
const smooth = (a: number) => a * a * (3 - 2 * a);

/** Tư thế lúc thường (nghỉ): treo ở đai, đung đưa nhẹ theo `t` và tốc độ chạy `speed`. */
export function idlePose(kind: ArtifactKind, t: number, speed: number, out: ArtPose = blank()): ArtPose {
  const sway = Math.sin(t * 2.1) * 0.05 + Math.min(1, speed / 6) * Math.sin(t * 9) * 0.07;
  switch (kind) {
    case 'drain':
      Object.assign(out, { x: 0.33, y: 0.95, z: -0.06, rx: 0, ry: 0.4, rz: 0.12 + sway, s: 1.6 });
      break;
    case 'seal':
      Object.assign(out, { x: -0.34, y: 0.88, z: 0.02, rx: 0.1, ry: 0, rz: sway * 1.4, s: 1.7 });
      break;
    case 'shield':
      Object.assign(out, { x: 0, y: 1.22, z: -0.38, rx: -0.3, ry: 0, rz: 0, s: 1.2 });
      break;
  }
  return out;
}

/** Tư thế lúc kích hoạt, `t` là thời gian tuyệt đối (giây). */
export function activePose(kind: ArtifactKind, t: number, out: ArtPose = blank()): ArtPose {
  switch (kind) {
    case 'drain': {
      const a = t * 5.5;
      Object.assign(out, { x: Math.cos(a) * 0.95, y: 1.25 + Math.sin(a * 2) * 0.1, z: Math.sin(a) * 0.95, rx: 0.25, ry: -a + Math.PI / 2, rz: 0.2, s: 2.1 });
      break;
    }
    case 'seal':
      Object.assign(out, { x: 0, y: 1.42, z: 1.0 + Math.sin(t * 30) * 0.03, rx: 0.5, ry: 0, rz: Math.sin(t * 38) * 0.28, s: 2.3 });
      break;
    case 'shield':
      Object.assign(out, { x: 0, y: 2.6 + Math.sin(t * 3) * 0.06, z: 0, rx: 0, ry: t * 1.2, rz: 0, s: 3.3 });
      break;
  }
  return out;
}

/** Trộn hai tư thế theo `a` (0 = `from`, 1 = `to`). */
export function blendPose(from: ArtPose, to: ArtPose, a: number, out: ArtPose): ArtPose {
  const k = smooth(Math.max(0, Math.min(1, a)));
  out.x = from.x + (to.x - from.x) * k;
  out.y = from.y + (to.y - from.y) * k;
  out.z = from.z + (to.z - from.z) * k;
  out.rx = from.rx + (to.rx - from.rx) * k;
  out.ry = from.ry + (to.ry - from.ry) * k;
  out.rz = from.rz + (to.rz - from.rz) * k;
  out.s = from.s + (to.s - from.s) * k;
  return out;
}

const _a = blank();
const _b = blank();
const _c = blank();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _ctr = new THREE.Vector3();

export class ArtifactVis {
  /** Gắn vào cảnh (cùng nhóm với model người chơi); vị trí thế giới do `update` đặt. */
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private handle: AssetHandle | null = null;
  private itemId = '';
  private token = 0;
  private disposed = false;
  private t = Math.random() * 10;
  /** Mức hòa trộn nghỉ → kích hoạt, 0..1. */
  private act = 0;
  private until = 0;
  private seeded = false;

  constructor() {
    this.root.add(this.pivot);
    this.root.visible = false;
  }

  get id(): string {
    return this.itemId;
  }

  /** Đang chạy hiệu ứng kích hoạt (để test/ảnh chụp). */
  get active(): boolean {
    return this.t < this.until;
  }

  /** Đã nạp model xong. */
  get ready(): boolean {
    return !!this.handle;
  }

  /** Đổi pháp bảo đang đeo ('' = tháo). Nạp lười, lỗi thì không hiện gì (không ảnh hưởng chơi). */
  setItem(itemId: string): void {
    if (itemId === this.itemId) return;
    this.itemId = itemId;
    const my = ++this.token;
    this.unload();
    const def = ARTIFACT.get(itemId);
    if (!def) return;
    assets
      .acquire(def.asset, { priority: 20 })
      .then((h) => {
        if (this.disposed || my !== this.token) {
          h.release();
          return;
        }
        this.handle = h;
        adoptGltfMaterials(h.scene);
        h.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = false;
            m.receiveShadow = false;
          }
        });
        // Đặt tâm vật thể ở gốc để xoay quanh tâm: asset Tripo có gốc ở đáy.
        h.scene.updateMatrixWorld(true);
        _box.setFromObject(h.scene);
        h.scene.position.sub(_box.getCenter(_ctr));
        this.pivot.add(h.scene);
        this.seeded = false;
      })
      .catch((e) => console.warn(`[artifact] không nạp được ${def.asset}`, e));
  }

  /** Kích hoạt: bay quanh người trong `sec` giây. */
  trigger(sec: number): void {
    this.until = this.t + Math.max(0.4, sec);
  }

  /** Mỗi khung. `x,y,z,yaw`: chân và hướng người; `speed`: tốc độ chạy (đung đưa); `hidden`: đã chết/ẩn model. */
  update(dt: number, x: number, y: number, z: number, yaw: number, speed: number, hidden: boolean): void {
    const def = ARTIFACT.get(this.itemId);
    const show = !!def && !!this.handle && !hidden;
    this.root.visible = show;
    if (!show || !def) return;
    this.t += dt;
    const on = this.t < this.until;
    this.act += ((on ? 1 : 0) - this.act) * Math.min(1, dt * (on ? 7 : 4));
    if (this.act < 0.002 && !on) this.act = 0;
    const idle = idlePose(def.kind, this.t, speed, _a);
    const pose = this.act > 0 ? blendPose(idle, activePose(def.kind, this.t, _b), this.act, _c) : idle;
    // Khung nhân vật → thế giới: xoay quanh Y theo yaw (mặt nhìn về +Z khi yaw = 0, +X là bên trái).
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const wx = x + pose.x * cy + pose.z * sy;
    const wz = z - pose.x * sy + pose.z * cy;
    const wy = y + pose.y;
    if (!this.seeded) {
      this.root.position.set(wx, wy, wz);
      this.seeded = true;
    } else {
      // Bám theo có độ trễ nhẹ (nhìn như treo trên dây), nhanh hơn khi kích hoạt.
      const k = 1 - Math.exp(-dt * (this.act > 0.5 ? 22 : 16));
      this.root.position.x += (wx - this.root.position.x) * k;
      this.root.position.y += (wy - this.root.position.y) * k;
      this.root.position.z += (wz - this.root.position.z) * k;
      // Nhảy xa (dịch chuyển): bắt kịp ngay.
      if (Math.hypot(wx - this.root.position.x, wz - this.root.position.z) > 6) this.root.position.set(wx, wy, wz);
    }
    _e.set(pose.rx, pose.ry, pose.rz, 'YXZ');
    _q.setFromEuler(_e);
    _qy.setFromAxisAngle(_up, yaw);
    this.pivot.quaternion.copy(_qy).multiply(_q);
    this.pivot.scale.setScalar(pose.s);
  }

  private unload(): void {
    if (this.handle) {
      this.pivot.clear();
      this.handle.release();
      this.handle = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.unload();
    this.root.removeFromParent();
  }
}
