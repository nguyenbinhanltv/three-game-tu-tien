// Thân Pháp T5: "ragdoll nhẹ" chỉ ở client. Không mô phỏng vật lý thân cứng: vài khớp chính (thân trên, đầu, hai tay) là lò xo góc lỏng (tắt dần, vung quá đà)
// nhận xung theo hướng đòn rồi cộng thêm lên tư thế clip (additive, hòa với clip, không thay clip). Khi ngã/chết các khớp mềm hơn nên tay đầu rũ theo.
// Hàm thuần (không đụng three) để test trong Node. Server vẫn quyết vị trí cuối; module này không đụng vị trí.

/** Tên khớp được điều khiển (trùng tên xương Mannequin, chữ thường như `bones` của MannequinCharacter). */
export type RagJoint = 'spine_02' | 'spine_03' | 'head' | 'upperarm_l' | 'upperarm_r';
export const RAG_JOINTS: readonly RagJoint[] = ['spine_02', 'spine_03', 'head', 'upperarm_l', 'upperarm_r'];

interface JointCfg {
  /** Độ cứng và cản của lò xo (cản thấp = nảy nhiều). */
  k: number;
  c: number;
  /** Hệ số xung: dấu âm = ngả ngược chiều thân (đầu hất ngược). */
  pitch: number;
  roll: number;
  /** Góc tối đa (rad). */
  max: number;
}

export const RAG_CFG: Readonly<Record<RagJoint, JointCfg>> = {
  spine_02: { k: 110, c: 7, pitch: 0.45, roll: 0.4, max: 0.5 },
  spine_03: { k: 90, c: 6, pitch: 0.6, roll: 0.5, max: 0.6 },
  head: { k: 140, c: 6, pitch: -0.9, roll: -0.6, max: 0.7 },
  upperarm_l: { k: 60, c: 4, pitch: 0.7, roll: 0.9, max: 0.8 },
  upperarm_r: { k: 60, c: 4, pitch: 0.7, roll: -0.9, max: 0.8 },
};

/** Hệ số xung theo cấp đòn S1 (0 nhẹ … 3 chiêu cuối): nhẹ chỉ rung, nặng vung mạnh. */
export function impulseOfTier(tier: number | undefined, heavy: boolean, crit: boolean): number {
  const t = tier ?? (heavy ? 2 : crit ? 1 : 0);
  return [0.35, 0.6, 1.0, 1.4][Math.max(0, Math.min(3, Math.round(t)))]!;
}

export class RagLite {
  /** Góc hiện tại mỗi khớp: [pitch (cúi về trước +), roll (nghiêng sang trái người +)]. */
  readonly ang: Record<RagJoint, [number, number]> = {
    spine_02: [0, 0],
    spine_03: [0, 0],
    head: [0, 0],
    upperarm_l: [0, 0],
    upperarm_r: [0, 0],
  };
  private readonly vel: Record<RagJoint, [number, number]> = {
    spine_02: [0, 0],
    spine_03: [0, 0],
    head: [0, 0],
    upperarm_l: [0, 0],
    upperarm_r: [0, 0],
  };
  /** Độ lỏng 0..1 (1 = mềm hẳn khi ngã/chết): giảm độ cứng, cản. */
  loose = 0;

  /**
   * Đẩy xung. `pitch`/`roll` ∈ [−1, 1] là hướng đòn theo người bị đánh (`flinchDirOf`: +pitch = bị đẩy về trước, +roll = bị đẩy sang trái),
   * `mag` là độ mạnh (`impulseOfTier`). Vận tốc ban đầu (rad/s) = hệ số khớp × hướng × `mag` × 9.
   */
  impulse(pitch: number, roll: number, mag: number): void {
    for (const j of RAG_JOINTS) {
      const c = RAG_CFG[j];
      this.vel[j][0] += c.pitch * pitch * mag * 9;
      this.vel[j][1] += c.roll * roll * mag * 9;
    }
  }

  /** Một bước; `dt` ≤ 1/20 giây là ổn định (bước con nếu lớn hơn). */
  update(dt: number): void {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / n;
    const soft = 1 - 0.65 * this.loose;
    for (let s = 0; s < n; s++) {
      for (const j of RAG_JOINTS) {
        const c = RAG_CFG[j];
        const k = c.k * soft;
        const d = c.c * (1 - 0.5 * this.loose);
        for (let a = 0; a < 2; a++) {
          const v = this.vel[j][a]! + (-k * this.ang[j][a]! - d * this.vel[j][a]!) * h;
          this.vel[j][a] = v;
          this.ang[j][a] = Math.max(-c.max, Math.min(c.max, this.ang[j][a]! + v * h));
        }
      }
    }
  }

  /** Còn dao động đáng kể (để bỏ qua việc áp xương khi đã yên). */
  get active(): boolean {
    for (const j of RAG_JOINTS) {
      if (Math.abs(this.ang[j][0]) > 1e-3 || Math.abs(this.ang[j][1]) > 1e-3) return true;
      if (Math.abs(this.vel[j][0]) > 1e-2 || Math.abs(this.vel[j][1]) > 1e-2) return true;
    }
    return false;
  }

  reset(): void {
    for (const j of RAG_JOINTS) {
      this.ang[j][0] = this.ang[j][1] = this.vel[j][0] = this.vel[j][1] = 0;
    }
    this.loose = 0;
  }
}
