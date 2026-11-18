import * as THREE from 'three/webgpu';

/**
 * Vệt kiếm bám mũi kiếm (K-6). Dải 12–16 đoạn, mỗi đoạn là một cặp điểm (gốc lưỡi, mũi lưỡi) lấy từ xương
 * `dtl_sword` mỗi khung trong cửa sổ quanh `hitAt`; mỗi cặp sống 0,18–0,25 s. Vẽ bằng kiểu `trail` có sẵn
 * (`uv.x` 0 ở mẫu mới nhất → 1 ở mẫu cũ nhất; `uv.y` 0 ở gốc → 1 ở mũi, nên lõi sáng dày giữa lưỡi, thon hai đầu).
 *
 * Làm mượt (kỹ thuật dải Catmull-Rom của EdgeFlux, MIT, xem assets/LICENSES.md): các mẫu theo khung được nội suy
 * Catmull-Rom `BLADE_SUB` lần mỗi đoạn cho cả gốc lưỡi lẫn mũi lưỡi, nên nhát vung nhanh vẫn tròn ở mọi tốc độ khung
 * hình thay vì gãy khúc. Số điểm vẽ cố định `BLADE_PTS`, lưới cấp sẵn (không cấp phát khi phát).
 */

/** Số đoạn (cặp điểm) tối đa của một dải. */
export const BLADE_SEG = 14;
/** Số điểm chia thêm giữa hai mẫu (nội suy Catmull-Rom). */
export const BLADE_SUB = 3;
/** Số điểm vẽ của một dải (mỗi điểm hai đỉnh: gốc, mũi). */
export const BLADE_PTS = (BLADE_SEG - 1) * BLADE_SUB + 1;
/** Tuổi tối đa của một mẫu (giây). */
export const BLADE_LIFE = 0.22;
/** Cửa sổ lấy mẫu quanh `hitAt` (giây). */
const BLADE_BEFORE = 0.1;
const BLADE_AFTER = 0.08;
/** Người khác chỉ vẽ vệt kiếm trong khoảng này (m). */
const BLADE_NEAR_OTHERS = 25;

/** Cửa sổ lấy mẫu [bắt đầu, kết thúc] (giây từ lúc bấm) của một mốc trúng. */
export function bladeWindow(hitAt: number): [number, number] {
  return [Math.max(0, hitAt - BLADE_BEFORE), hitAt + BLADE_AFTER];
}

/** Có vẽ vệt kiếm của người này không. */
export function bladeVisible(mine: boolean, dist: number): boolean {
  return mine || dist <= BLADE_NEAR_OTHERS;
}

/** Catmull-Rom đều một chiều: nội suy giữa p1 và p2 tại t ∈ [0,1]. */
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t);
}

export class BladeRibbon {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos = new THREE.BufferAttribute(new Float32Array(BLADE_PTS * 2 * 3), 3);
  private readonly uvA = new THREE.BufferAttribute(new Float32Array(BLADE_PTS * 2 * 2), 2);
  /** Mẫu: [bx,by,bz,tx,ty,tz] và tuổi; [0] mới nhất. */
  private readonly pts = new Float32Array(BLADE_SEG * 6);
  private readonly age = new Float32Array(BLADE_SEG);
  n = 0;
  /** Chủ vệt (sid) và còn đang lấy mẫu. */
  owner = '';
  sampling = false;

  constructor() {
    const idx: number[] = [];
    for (let i = 0; i < BLADE_PTS - 1; i++) {
      const v = i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', this.uvA);
    this.geo.setAttribute(
      'normal',
      new THREE.BufferAttribute(
        new Float32Array(BLADE_PTS * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
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
      this.age[i]! += dt;
      if (this.age[i]! <= BLADE_LIFE) n = i + 1;
    }
    this.n = n;
    return n;
  }

  /** Dựng lưới từ các mẫu còn sống (nội suy Catmull-Rom). Trả 1 nếu có gì để vẽ (cần ≥ 2 mẫu), không thì 0. */
  build(): number {
    const P = this.pos.array as Float32Array;
    const UV = this.uvA.array as Float32Array;
    const n = this.n;
    // Chưa đủ hai mẫu: giữ nguyên bộ đệm (ghi chỉ số −1 ra NaN làm hỏng hình).
    if (n < 2) return 0;
    const pt = this.pts;
    const at = (i: number) => Math.min(n - 1, Math.max(0, i)) * 6;
    const segs = n - 1;
    const total = segs * BLADE_SUB + 1;
    for (let q = 0; q < BLADE_PTS; q++) {
      // Điểm vượt phần có dữ liệu: lặp điểm cuối (tam giác suy biến, không vẽ gì).
      const qq = Math.min(q, total - 1);
      const seg = Math.min(segs - 1, Math.floor(qq / BLADE_SUB));
      const f = qq - seg * BLADE_SUB === BLADE_SUB ? 1 : (qq - seg * BLADE_SUB) / BLADE_SUB;
      const a = at(seg - 1);
      const b = at(seg);
      const c = at(seg + 1);
      const d = at(seg + 2);
      for (let k = 0; k < 6; k++) P[q * 6 + k] = catmull(pt[a + k]!, pt[b + k]!, pt[c + k]!, pt[d + k]!, f);
      // u theo tuổi nội suy: mẫu mới nhất u≈0 (sáng), sắp hết hạn u→1 (tắt hẳn); v: gốc 0 → mũi 1.
      const age = this.age[seg]! + (this.age[Math.min(n - 1, seg + 1)]! - this.age[seg]!) * f;
      const u = Math.min(1, Math.max(0, age / BLADE_LIFE));
      UV[q * 4] = u;
      UV[q * 4 + 1] = 0;
      UV[q * 4 + 2] = u;
      UV[q * 4 + 3] = 1;
    }
    this.pos.needsUpdate = true;
    this.uvA.needsUpdate = true;
    return 1;
  }
}
