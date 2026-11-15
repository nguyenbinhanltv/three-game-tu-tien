import * as THREE from 'three/webgpu';

/**
 * Vệt kiếm bám mũi kiếm (K-6). Dải 12–16 đoạn, mỗi đoạn là một cặp điểm (gốc lưỡi, mũi lưỡi) lấy từ xương
 * `dtl_sword` mỗi khung trong cửa sổ quanh `hitAt`; mỗi cặp sống 0,18–0,25 s. Vẽ bằng kiểu `trail` có sẵn
 * (`uv.x` 0 ở mẫu mới nhất → 1 ở mẫu cũ nhất; `uv.y` 0 ở gốc → 1 ở mũi, nên lõi sáng dày giữa lưỡi, thon hai đầu).
 */

/** Số đoạn (cặp điểm) tối đa của một dải. */
export const BLADE_SEG = 14;
/** Tuổi tối đa của một mẫu (giây). */
export const BLADE_LIFE = 0.22;
/** Cửa sổ lấy mẫu quanh `hitAt` (giây). */
export const BLADE_BEFORE = 0.1;
export const BLADE_AFTER = 0.08;
/** Người khác chỉ vẽ vệt kiếm trong khoảng này (m). */
export const BLADE_NEAR_OTHERS = 25;

/** Cửa sổ lấy mẫu [bắt đầu, kết thúc] (giây từ lúc bấm) của một mốc trúng. */
export function bladeWindow(hitAt: number): [number, number] {
  return [Math.max(0, hitAt - BLADE_BEFORE), hitAt + BLADE_AFTER];
}

/** Có vẽ vệt kiếm của người này không. */
export function bladeVisible(mine: boolean, dist: number): boolean {
  return mine || dist <= BLADE_NEAR_OTHERS;
}

export class BladeRibbon {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos = new THREE.BufferAttribute(new Float32Array(BLADE_SEG * 2 * 3), 3);
  private readonly uvA = new THREE.BufferAttribute(new Float32Array(BLADE_SEG * 2 * 2), 2);
  /** Mẫu: [bx,by,bz,tx,ty,tz] và tuổi; [0] mới nhất. */
  private readonly pts = new Float32Array(BLADE_SEG * 6);
  private readonly age = new Float32Array(BLADE_SEG);
  n = 0;
  /** Chủ vệt (sid) và còn đang lấy mẫu. */
  owner = '';
  sampling = false;

  constructor() {
    const idx: number[] = [];
    for (let i = 0; i < BLADE_SEG - 1; i++) {
      const v = i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', this.uvA);
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(BLADE_SEG * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  }

  reset(owner: string): void {
    this.owner = owner;
    this.n = 0;
    this.sampling = true;
  }

  /** Thêm một mẫu mới nhất (đẩy các mẫu cũ lùi một chỗ). */
  push(b: THREE.Vector3, t: THREE.Vector3): void {
    this.pts.copyWithin(6, 0, (BLADE_SEG - 1) * 6);
    this.age.copyWithin(1, 0, BLADE_SEG - 1);
    this.pts[0] = b.x;
    this.pts[1] = b.y;
    this.pts[2] = b.z;
    this.pts[3] = t.x;
    this.pts[4] = t.y;
    this.pts[5] = t.z;
    this.age[0] = 0;
    if (this.n < BLADE_SEG) this.n++;
  }

  /** Già đi `dt`; trả số mẫu còn sống. Mẫu quá `BLADE_LIFE` bị bỏ. */
  step(dt: number): number {
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] <= BLADE_LIFE) n = i + 1;
    }
    this.n = n;
    return n;
  }

  /** Dựng lưới từ các mẫu còn sống. Trả độ mờ chung (mẫu mới nhất càng cũ càng mờ). */
  build(): number {
    const P = this.pos.array as Float32Array;
    const UV = this.uvA.array as Float32Array;
    const n = this.n;
    // Chưa có mẫu nào: giữ nguyên bộ đệm (ghi chỉ số −1 ra NaN làm hỏng hình).
    if (n < 1) return 0;
    for (let i = 0; i < BLADE_SEG; i++) {
      const j = Math.min(i, n - 1);
      const o = j * 6;
      P.set([this.pts[o], this.pts[o + 1], this.pts[o + 2], this.pts[o + 3], this.pts[o + 4], this.pts[o + 5]], i * 6);
      // u theo tuổi: mẫu mới nhất u≈0 (sáng), sắp hết hạn u→1 (tắt hẳn); v: gốc 0 → mũi 1.
      const u = Math.min(1, this.age[j] / BLADE_LIFE);
      UV.set([u, 0, u, 1], i * 4);
    }
    this.pos.needsUpdate = true;
    this.uvA.needsUpdate = true;
    return n > 1 ? 1 : 0;
  }
}
