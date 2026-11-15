import * as THREE from 'three/webgpu';

/**
 * Ánh sáng điểm thật cho đèn lồng (P2-A6, chỉ preset Cao): một nhóm `max` PointLight cố định trong cảnh,
 * mỗi khung gán cho `max` đèn gần người chơi nhất (còn lại không có đèn thật, chỉ có quầng giả của
 * createLanternHalos). Số đèn trong cảnh không đổi nên shader không biên dịch lại khi đi qua đèn; tắt bằng
 * `visible=false` (preset Vừa/Thấp) thì ra khỏi danh sách đèn của cảnh, không tốn chi phí tô.
 * Không đổ bóng. Mỗi đèn tắt dần khi xa người chơi hơn FADE_FAR.
 */
const FADE_NEAR = 38;
const FADE_FAR = 70;

export class LanternLights {
  readonly lights: THREE.PointLight[] = [];
  private enabled = false;
  private k = 1;

  constructor(
    scene: THREE.Scene,
    private points: readonly { x: number; y: number; z: number }[],
    max = 8,
    readonly baseIntensity = 22,
  ) {
    for (let i = 0; i < Math.min(max, points.length); i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 17, 2);
      l.castShadow = false;
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const l of this.lights) l.visible = on;
  }

  /** Hệ số theo thời điểm trong ngày (sáng sớm nhẹ, đêm đậm). */
  setIntensityScale(k: number): void {
    this.k = k;
  }

  update(focus: THREE.Vector3): void {
    if (!this.enabled) return;
    const n = this.lights.length;
    // Chọn n đèn gần nhất bằng lựa chọn đơn giản (danh sách nhỏ, không cấp phát).
    const used = new Set<number>();
    for (let li = 0; li < n; li++) {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < this.points.length; i++) {
        if (used.has(i)) continue;
        const p = this.points[i];
        const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const l = this.lights[li];
      if (best < 0) {
        l.intensity = 0;
        continue;
      }
      used.add(best);
      const p = this.points[best];
      l.position.set(p.x, p.y, p.z);
      const fade = 1 - THREE.MathUtils.smoothstep(Math.sqrt(bd), FADE_NEAR, FADE_FAR);
      l.intensity = this.baseIntensity * this.k * fade;
    }
  }

  dispose(): void {
    for (const l of this.lights) {
      l.removeFromParent();
      l.dispose();
    }
    this.lights.length = 0;
  }
}
