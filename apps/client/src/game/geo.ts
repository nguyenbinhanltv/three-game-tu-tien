import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Gộp nhiều hình khối low-poly (đã tô màu theo đỉnh) vào một BufferGeometry duy nhất
 * để vẽ bằng một draw call.
 */
export class GeoBuilder {
  private pos = new Float32Array(3 * 4096);
  private nor = new Float32Array(3 * 4096);
  private col = new Float32Array(3 * 4096);
  count = 0;

  private ensure(extra: number) {
    const need = (this.count + extra) * 3;
    if (need <= this.pos.length) return;
    let cap = this.pos.length;
    while (cap < need) cap *= 2;
    const grow = (a: Float32Array) => {
      const b = new Float32Array(cap);
      b.set(a.subarray(0, this.count * 3));
      return b;
    };
    this.pos = grow(this.pos);
    this.nor = grow(this.nor);
    this.col = grow(this.col);
  }

  /** Thêm một hình (không index, đã có normal) với ma trận biến đổi và màu. */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, shade = 0): void {
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const n = geo.getAttribute('normal') as THREE.BufferAttribute;
    const c = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    const cnt = p.count;
    this.ensure(cnt);
    _nm.getNormalMatrix(m);
    let o = this.count * 3;
    for (let i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.pos[o] = _v.x;
      this.pos[o + 1] = _v.y;
      this.pos[o + 2] = _v.z;
      this.nor[o] = _n.x;
      this.nor[o + 1] = _n.y;
      this.nor[o + 2] = _n.z;
      // Tô sáng tối nhẹ theo độ cao trong hình để khối có chiều sâu.
      const k = shade ? 1 + shade * (p.getY(i) > 0 ? 1 : -1) : 1;
      if (c) {
        this.col[o] = c.getX(i) * color.r * k;
        this.col[o + 1] = c.getY(i) * color.g * k;
        this.col[o + 2] = c.getZ(i) * color.b * k;
      } else {
        this.col[o] = color.r * k;
        this.col[o + 1] = color.g * k;
        this.col[o + 2] = color.b * k;
      }
      o += 3;
    }
    this.count += cnt;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.count * 3;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Chuyển hình primitive thành dạng không index, normal phẳng (kiểu low-poly). */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Tạo ma trận từ vị trí, góc Euler và tỉ lệ. */
export function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s).clone();
}

export const col = (hex: number | string) => new THREE.Color(hex);

export const G = {
  box: flat(new THREE.BoxGeometry(1, 1, 1)),
  cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6)),
  cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cyl12: flat(new THREE.CylinderGeometry(1, 1, 1, 12)),
  cone5: flat(new THREE.ConeGeometry(1, 1, 5)),
  cone6: flat(new THREE.ConeGeometry(1, 1, 6)),
  cone7: flat(new THREE.ConeGeometry(1, 1, 7)),
  /** Chóp 4 mặt (mái nhà). */
  pyramid: flat(new THREE.ConeGeometry(1, 1, 4, 1, false, Math.PI / 4)),
  /** Chóp cụt 4 mặt: mái dốc có nóc bằng. */
  frustum4: flat(new THREE.CylinderGeometry(0.42, 1, 1, 4, 1, false, Math.PI / 4)),
  frustum6: flat(new THREE.CylinderGeometry(0.3, 1, 1, 6)),
  taper8: flat(new THREE.CylinderGeometry(0.6, 1, 1, 8)),
  ico0: flat(new THREE.IcosahedronGeometry(1, 0)),
  ico1: flat(new THREE.IcosahedronGeometry(1, 1)),
  /** Cầu mịn (giữ normal trơn), đã bỏ index để gộp được. */
  sphere: new THREE.SphereGeometry(1, 12, 9).toNonIndexed(),
  octa: flat(new THREE.OctahedronGeometry(1, 0)),
  torus: flat(new THREE.TorusGeometry(1, 0.12, 6, 20)),
};
