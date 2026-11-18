// Kiếm phát sáng theo cường hóa (P3-3): +7 ánh ngọc lục nhẹ, +10 vàng rực kèm vệt kiếm khí kéo dài quá mũi.
// Chỉ là lớp hình (server gửi bậc `wg` qua state): 1 mesh cộng sáng ở +7, 2 mesh ở +10, chỉ cho người có kiếm ≥ +7
// trong tầm nhìn. Không thêm đèn, không đổ bóng; bloom chọn lọc giữ viền mềm.
import * as THREE from 'three/webgpu';
import { markBloom } from '../../render/post';
import { G } from '../core/geo';

/** Chiều dài lưỡi ước lượng (m, hệ của asset) khi chưa biết model kiếm. */
const BLADE_LEN = 0.95;
/** Chuôi → gốc lưỡi (m). */
const BLADE_START = 0.12;

/** Số đo lưỡi tính từ tâm chuôi dọc mũi (m): gốc lưỡi và chiều dài lưỡi, theo model kiếm đang cầm. */
interface BladeDims {
  start: number;
  len: number;
}

interface Stage {
  color: number;
  opacity: number;
  /** Biên độ nhịp thở của độ sáng. */
  pulse: number;
  /** Nửa bề rộng / bề dày của vỏ sáng quanh lưỡi. */
  w: number;
  t: number;
}
const STAGES: Record<1 | 2, Stage> = {
  1: { color: 0x6dffc4, opacity: 0.5, pulse: 0.14, w: 0.06, t: 0.028 },
  2: { color: 0xffc23a, opacity: 0.75, pulse: 0.18, w: 0.1, t: 0.045 },
};

function glowMat(color: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  markBloom(m, 1.8);
  return m;
}

export class SwordGlow {
  readonly group = new THREE.Group();
  private sheath: THREE.Mesh;
  private streak: THREE.Mesh;
  private sheathMat = glowMat(STAGES[1].color);
  private streakMat = glowMat(STAGES[2].color);
  private stage = 0;
  /** Màu theo bộ trang bị (P3-4); null = màu theo bậc cường hóa. */
  private tint: number | null = null;
  private time = Math.random() * 6;
  private local: THREE.Matrix4;
  private tmp = new THREE.Matrix4();

  /** `local`: khung chuôi (X = lưỡi, Z = mũi) trong hệ xương kiếm (`SwordSocketDef.glowLocal`). */
  constructor(
    local: THREE.Matrix4,
    private dims: BladeDims = { start: BLADE_START, len: BLADE_LEN },
  ) {
    this.local = local;
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.sheath = new THREE.Mesh(G.octa, this.sheathMat);
    this.streak = new THREE.Mesh(G.octa, this.streakMat);
    this.sheath.frustumCulled = false;
    this.streak.frustumCulled = false;
    this.group.add(this.sheath, this.streak);
  }

  get active(): boolean {
    return this.stage > 0;
  }

  /** Đổi màu ánh kiếm theo bộ (null = trả về màu theo bậc). Gọi `setStage` sau đó để áp lại. */
  setTint(hex: number | null): void {
    if (hex === this.tint) return;
    this.tint = hex;
    const was = this.stage;
    this.stage = -1;
    this.setStage(was);
  }

  setStage(stage: number): void {
    const s = stage >= 2 ? 2 : stage >= 1 ? 1 : 0;
    if (s === this.stage) return;
    this.stage = s;
    this.group.visible = s > 0;
    if (!s) return;
    const st = STAGES[s as 1 | 2];
    this.sheathMat.color.setHex(this.tint ?? st.color);
    // Vệt kiếm khí luôn đặt lại màu (về màu +10 khi bỏ tint) để không giữ màu bộ cũ.
    this.streakMat.color.setHex(this.tint ?? STAGES[2].color);
    this.sheath.position.set(0, 0, this.dims.start + this.dims.len / 2);
    this.sheath.scale.set(st.w, st.t, this.dims.len / 2 + 0.05);
    // Vệt kiếm khí chỉ có ở +10: dải mảnh kéo dài quá mũi, nhạt dần.
    this.streak.visible = s === 2;
    this.streak.position.set(0, 0, this.dims.start + this.dims.len + this.dims.len * 0.45);
    this.streak.scale.set(st.w * 0.5, st.t * 0.5, this.dims.len * 0.6);
  }

  /** `boneWorld`: ma trận thế giới (hệ model) của xương kiếm; gọi mỗi khung khi `active`. */
  update(dt: number, boneWorld: THREE.Matrix4): void {
    if (!this.stage) return;
    this.time += dt;
    const st = STAGES[this.stage as 1 | 2];
    const k = 0.5 + 0.5 * Math.sin(this.time * (this.stage === 2 ? 5.5 : 3.2));
    this.sheathMat.opacity = st.opacity + (k - 0.5) * 2 * st.pulse;
    this.streakMat.opacity = 0.3 + 0.15 * k;
    this.group.matrix.copy(boneWorld).multiply(this.tmp.copy(this.local));
    this.group.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.sheathMat.dispose();
    this.streakMat.dispose();
  }
}
