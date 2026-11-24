// Thân Pháp T5 cho quái thường: nối `RagLite` (lò xo khớp lỏng, hàm thuần) vào bộ xương UE5 Mannequin của một model bất kỳ (`SkinnedCharacter`/`SkinnedMonster`).
// Chỉ hình ở client. Model không có các xương người (thú bốn chân, chim, rắn...) thì không làm gì. Boss tắt (`enabled = false`): thân to, giật nhẹ là đủ.
import * as THREE from 'three/webgpu';
import { flinchDirOf } from './mannequinAnim';
import { impulseOfTier, RAG_JOINTS, RagLite } from './ragdollLite';

const _pw = new THREE.Quaternion();
const _w = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

/** Xoay xương quanh trục thế giới (cùng cách `rotateWorld` của MannequinCharacter): q_local' = inv(parentW) · R · parentW · q_local. */
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, ang: number): void {
  if (!bone.parent || Math.abs(ang) < 1e-5) return;
  bone.parent.getWorldQuaternion(_pw);
  _w.setFromAxisAngle(axis, ang);
  bone.quaternion.premultiply(_pw).premultiply(_w).premultiply(_pw.invert());
}

export class RagRig {
  readonly rag = new RagLite();
  /** Tắt hẳn (boss). */
  enabled = true;
  private bones: (THREE.Object3D | null)[] | null = null;
  /** Tư thế clip (gốc) và tư thế ta ghi lần trước của từng xương: mixer không ghi lại xương có giá trị hằng (clip kẹp cuối, tư thế giữ), nên cộng dồn lên quaternion hiện tại sẽ trôi mãi. */
  private base: THREE.Quaternion[] = [];
  private written: THREE.Quaternion[] = [];
  private has: boolean[] = [];
  private side = 1;

  constructor(private readonly rig: THREE.Object3D) {}

  /** Có đủ xương để chạy (tra lần đầu, nhớ kết quả). */
  get usable(): boolean {
    if (!this.bones) {
      this.bones = RAG_JOINTS.map((j) => this.rig.getObjectByName(j) ?? null);
      const th = this.rig.getObjectByName('thigh_l');
      if (th) {
        this.rig.updateMatrixWorld(true);
        this.side = Math.sign(th.getWorldPosition(_tmp).sub(this.rig.getWorldPosition(_tmp2)).x) || 1;
      }
    }
    return this.bones.filter(Boolean).length >= 3;
  }

  /** Xung từ một đòn: `yaw` hướng nhìn của người bị đánh, (dx, dz) hướng giật (hệ thế giới). */
  hit(yaw: number, dx: number, dz: number, tier: number | undefined, heavy: boolean, crit: boolean): void {
    if (!this.enabled || !this.usable) return;
    const d = flinchDirOf(yaw, dx, dz);
    this.rag.impulse(d.pitch, d.roll, impulseOfTier(tier, heavy, crit));
  }

  /** Ngã hoặc chết: xung mạnh theo hướng đòn cuối, khớp mềm hẳn (`loose` do `apply` giữ khi `down`). */
  down(yaw: number, dx: number, dz: number): void {
    if (!this.enabled || !this.usable) return;
    const d = flinchDirOf(yaw, dx, dz);
    this.rag.impulse(d.pitch, d.roll, impulseOfTier(3, true, false));
    this.rag.loose = 1;
  }

  /** Mỗi khung, SAU mixer: bước lò xo rồi cộng góc lên xương. `down` = đang ngã/chết (giữ lỏng); `near` = đủ gần/LOD0 mới chạy. */
  apply(dt: number, yaw: number, down: boolean, near: boolean): void {
    if (!this.enabled || !this.bones) return;
    const rg = this.rag;
    if (!near) {
      this.restore();
      if (rg.active) rg.reset();
      return;
    }
    rg.loose = down ? 1 : Math.max(0, rg.loose - dt * 0.8);
    if (!rg.active) {
      this.restore();
      return;
    }
    rg.update(dt);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    _fwd.set(sin, 0, cos);
    _rgt.set(cos, 0, -sin);
    for (let i = 0; i < RAG_JOINTS.length; i++) {
      const bone = this.bones[i];
      if (!bone) continue;
      // Gốc = quaternion hiện tại nếu mixer vừa ghi đè (khác lần ta ghi), còn không thì giữ gốc cũ.
      if (!this.has[i] || !bone.quaternion.equals(this.written[i]!)) (this.base[i] ??= new THREE.Quaternion()).copy(bone.quaternion);
      else bone.quaternion.copy(this.base[i]!);
      const a = rg.ang[RAG_JOINTS[i]!];
      rotateWorld(bone, _rgt, a[0]);
      rotateWorld(bone, _fwd, a[1] * this.side);
      (this.written[i] ??= new THREE.Quaternion()).copy(bone.quaternion);
      this.has[i] = true;
    }
  }

  /** Trả các xương về tư thế gốc đã nhớ (khi ragdoll tắt/xa), rồi quên: không để lại góc cuối. */
  private restore(): void {
    if (!this.bones) return;
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      if (bone && this.has[i] && bone.quaternion.equals(this.written[i]!)) bone.quaternion.copy(this.base[i]!);
      this.has[i] = false;
    }
  }
}
