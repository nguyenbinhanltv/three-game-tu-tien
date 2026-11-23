// Thiên Y (NV3-B): lưới vải tham số + bộ giải vải verlet dùng chung cho client (mô phỏng thời gian thực) và công cụ bake texture (hình học tư thế nghỉ).
// Toạ độ glTF: x ngang, y lên, z ra trước. Mọi vị trí nghỉ nằm trong không gian lưới nhân vật (tư thế A, trước khi skin).
// Không phụ thuộc three.js: chỉ mảng có kiểu, để chạy được trong Node (bake, test) và trong trình duyệt.

export type V3 = readonly [number, number, number];

/** Lưới vải: `nu` cột × `nv` hàng, hàng 0 ở trên (chỗ ghim). `wrap`: cột cuối nối cột đầu (ống/váy). */
export interface ClothGrid {
  id: string;
  nu: number;
  nv: number;
  wrap: boolean;
  /** Vị trí nghỉ, 3 số mỗi đỉnh, chỉ số đỉnh = row * nu + col. */
  rest: Float32Array;
  /** UV 2 số mỗi đỉnh: u theo cột (0..1), v theo hàng (0 trên, 1 dưới). */
  uv: Float32Array;
  /** Tam giác một mặt (vật liệu hai mặt tự lo mặt sau). */
  index: Uint32Array;
  /** Xương mà đỉnh được ghim theo (skin tại vị trí nghỉ) và hệ số ghim 0..1 (0 = tự do). */
  pinBone: string[];
  pinW: Float32Array;
}

export const vIndex = (g: { nu: number }, row: number, col: number): number => row * g.nu + col;

/** Dựng chỉ số tam giác và UV cho lưới (dùng chung các mẫu). */
function gridTopology(nu: number, nv: number, wrap: boolean): { uv: Float32Array; index: Uint32Array } {
  const uv = new Float32Array(nu * nv * 2);
  const cols = wrap ? nu : nu - 1;
  for (let r = 0; r < nv; r++)
    for (let c = 0; c < nu; c++) {
      const i = r * nu + c;
      uv[2 * i]! = c / cols;
      uv[2 * i + 1]! = r / (nv - 1);
    }
  const idx: number[] = [];
  for (let r = 0; r < nv - 1; r++)
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % nu;
      const a = r * nu + c,
        b = r * nu + c1,
        d = (r + 1) * nu + c,
        e = (r + 1) * nu + c1;
      idx.push(a, b, d, b, e, d); // CCW nhìn từ ngoài (mặt ngoài của ống/váy là mặt trước)
    }
  return { uv, index: Uint32Array.from(idx) };
}

export interface RowPin {
  bone: string;
  /** Hệ số ghim theo hàng (độ dài ≤ nv; hàng ngoài danh sách = 0). */
  w: number[];
}

function makeGrid(
  id: string,
  nu: number,
  nv: number,
  wrap: boolean,
  rest: Float32Array,
  pin: RowPin,
  boneAt?: (r: number, c: number) => string,
): ClothGrid {
  const { uv, index } = gridTopology(nu, nv, wrap);
  const pinW = new Float32Array(nu * nv);
  for (let r = 0; r < nv; r++) for (let c = 0; c < nu; c++) pinW[r * nu + c]! = pin.w[r] ?? 0;
  const pinBone = new Array<string>(nu * nv).fill(pin.bone);
  if (boneAt) for (let r = 0; r < nv; r++) for (let c = 0; c < nu; c++) pinBone[r * nu + c] = boneAt(r, c);
  return { id, nu, nv, wrap, rest, uv, index, pinBone, pinW };
}

/** Một hàng vòng elip của váy: tâm (cx, cz), nửa trục x `a`, nửa trục z `b`, ở độ cao `y`. */
export interface SkirtRing {
  y: number;
  cx: number;
  cz: number;
  a: number;
  b: number;
}

/**
 * Váy xòe: ống nhiều hàng từ eo xuống gấu; hàng đầu ghim vào hông. `rings` từ trên xuống dưới (đo từ lưới Tripo hoặc đặt tay).
 * `fullness` làm gấu loe thêm (nhân bán trục theo hàng, 1 = giữ nguyên).
 */
export function skirtGrid(id: string, rings: readonly SkirtRing[], nu: number, pin: RowPin, fullness = 1): ClothGrid {
  const nv = rings.length;
  const rest = new Float32Array(nu * nv * 3);
  for (let r = 0; r < nv; r++) {
    const k = 1 + (fullness - 1) * (r / Math.max(nv - 1, 1));
    const R = rings[r]!;
    for (let c = 0; c < nu; c++) {
      const t = (c / nu) * Math.PI * 2;
      const i = (r * nu + c) * 3;
      rest[i]! = R.cx + R.a * k * Math.cos(t);
      rest[i + 1]! = R.y;
      rest[i + 2]! = R.cz + R.b * k * Math.sin(t);
    }
  }
  return makeGrid(id, nu, nv, true, rest, pin);
}

/**
 * Tay áo rộng: ống quanh trục tay từ `start` (khuỷu) tới `end` (cổ tay), kéo dài thêm `extend` (đơn vị chiều dài đoạn) theo hướng trục rồi buông
 * theo trọng lực khi mô phỏng. `radius(t)`: bán kính theo t ∈ [0, 1 + extend].
 */
export function sleeveGrid(
  id: string,
  start: V3,
  end: V3,
  radius: (t: number) => number,
  nu: number,
  nv: number,
  extend: number,
  pin: RowPin,
  up: V3 = [0, 1, 0],
): ClothGrid {
  const ax: [number, number, number] = [end[0]! - start[0]!, end[1]! - start[1]!, end[2]! - start[2]!];
  const len = Math.hypot(ax[0]!, ax[1]!, ax[2]!) || 1;
  const d: [number, number, number] = [ax[0]! / len, ax[1]! / len, ax[2]! / len];
  // hai vector vuông góc trục (n1 hướng ra trước-ngoài ổn định theo `up`)
  let n1: [number, number, number] = [d[1]! * up[2]! - d[2]! * up[1]!, d[2]! * up[0]! - d[0]! * up[2]!, d[0]! * up[1]! - d[1]! * up[0]!];
  const l1 = Math.hypot(n1[0]!, n1[1]!, n1[2]!);
  if (l1 < 1e-5) n1 = [1, 0, 0];
  else n1 = [n1[0]! / l1, n1[1]! / l1, n1[2]! / l1];
  const n2: [number, number, number] = [d[1]! * n1[2]! - d[2]! * n1[1]!, d[2]! * n1[0]! - d[0]! * n1[2]!, d[0]! * n1[1]! - d[1]! * n1[0]!];
  const rest = new Float32Array(nu * nv * 3);
  for (let r = 0; r < nv; r++) {
    const t = (r / (nv - 1)) * (1 + extend);
    const rad = radius(t);
    // Dọc cánh tay tới cổ tay (t ≤ 1), sau đó phần mút rủ THẲNG XUỐNG theo trọng lực (không kéo chéo theo hướng tay).
    const tt = Math.min(t, 1),
      dropT = Math.max(t - 1, 0);
    const cx = start[0]! + d[0]! * len * tt,
      cy = start[1]! + d[1]! * len * tt - len * dropT,
      cz = start[2]! + d[2]! * len * tt;
    for (let c = 0; c < nu; c++) {
      const a = (c / nu) * Math.PI * 2;
      const i = (r * nu + c) * 3;
      rest[i]! = cx + (n1[0]! * Math.cos(a) + n2[0]! * Math.sin(a)) * rad;
      rest[i + 1]! = cy + (n1[1]! * Math.cos(a) + n2[1]! * Math.sin(a)) * rad;
      rest[i + 2]! = cz + (n1[2]! * Math.cos(a) + n2[2]! * Math.sin(a)) * rad;
    }
  }
  return makeGrid(id, nu, nv, true, rest, pin);
}

/**
 * Tấm phẳng treo (voan, dải lụa, vạt áo ngoài): `top` là hàng ghim nối từ `p0` tới `p1`, rủ xuống `drop` theo `dir` (mặc định thẳng xuống),
 * rộng dần `widen` lần ở gấu. Hai mặt do vật liệu lo.
 */
export function panelGrid(
  id: string,
  p0: V3,
  p1: V3,
  drop: number,
  nu: number,
  nv: number,
  pin: RowPin,
  widen = 1,
  dir: V3 = [0, -1, 0],
  boneAt?: (r: number, c: number) => string,
  /** Độ phồng (m) vuông góc tấm (có dấu): giữa bề ngang phồng nhiều nhất, tăng dần về gấu; hai tấm phồng ngược dấu tạo ống hai lớp. */
  bow = 0,
): ClothGrid {
  const rest = new Float32Array(nu * nv * 3);
  const ax: V3 = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!];
  // pháp tuyến tấm = trục ngang × hướng rủ
  const nrm: V3 = [ax[1]! * dir[2]! - ax[2]! * dir[1]!, ax[2]! * dir[0]! - ax[0]! * dir[2]!, ax[0]! * dir[1]! - ax[1]! * dir[0]!];
  const nl = Math.hypot(nrm[0]!, nrm[1]!, nrm[2]!) || 1;
  const mid: [number, number, number] = [(p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2, (p0[2]! + p1[2]!) / 2];
  for (let r = 0; r < nv; r++) {
    const t = r / (nv - 1);
    const k = 1 + (widen - 1) * t;
    for (let c = 0; c < nu; c++) {
      const s = c / (nu - 1);
      const i = (r * nu + c) * 3;
      for (let a = 0; a < 3; a++) {
        const base = p0[a]! + (p1[a]! - p0[a]!) * s;
        rest[i + a]! =
          mid[a]! + (base - mid[a]!) * k + dir[a]! * drop * t + (nrm[a]! / nl) * bow * Math.sin(Math.PI * s) * (0.35 + 0.65 * t);
      }
    }
  }
  return makeGrid(id, nu, nv, false, rest, pin, boneAt);
}

/** Viên nang va chạm (hệ thế giới): đoạn a→b bán kính r. */
export interface Capsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r: number;
}

export interface ClothParams {
  /** Trọng lực (m/s²), dương = xuống. */
  gravity: number;
  /** Giữ vận tốc mỗi bước (0..1): gần 1 = bay lâu, nhỏ = nhớt. */
  damping: number;
  /** Số lần lặp ràng buộc. */
  iterations: number;
  /** Độ cứng ràng buộc cạnh (0..1). */
  stretch: number;
  /** Độ cứng ràng buộc uốn (0..1), 0 = tắt. */
  bend: number;
  /** Giới hạn dãn so với chiều dài nghỉ (tỉ lệ) để voan không kéo thành mảng. */
  maxStretch: number;
  /** Dây neo: bán kính tối đa (m) mà đỉnh hàng cuối được lệch khỏi vị trí skin theo xương (0 = tắt); hàng giữa lệch tối đa theo `(row/(nv-1))^tetherPow`. */
  tether: number;
  tetherPow: number;
}

export const CLOTH_DEFAULT: ClothParams = {
  gravity: 9.8,
  damping: 0.985,
  iterations: 3,
  stretch: 0.9,
  bend: 0.12,
  maxStretch: 1.12,
  tether: 0,
  tetherPow: 1,
};

/** Bộ giải verlet cho một lưới. Mọi mảng đều cấp phát một lần. */
export class ClothSim {
  readonly n: number;
  readonly pos: Float32Array;
  private prev: Float32Array;
  private ca: Uint32Array;
  private cb: Uint32Array;
  private cl: Float32Array;
  private cw: Float32Array;
  private nc = 0;

  constructor(
    readonly grid: ClothGrid,
    readonly params: ClothParams = CLOTH_DEFAULT,
  ) {
    this.n = grid.nu * grid.nv;
    this.pos = grid.rest.slice();
    this.prev = grid.rest.slice();
    const cap = this.n * 6;
    this.ca = new Uint32Array(cap);
    this.cb = new Uint32Array(cap);
    this.cl = new Float32Array(cap);
    this.cw = new Float32Array(cap);
    const { nu, nv, wrap } = grid;
    const add = (i: number, j: number, w: number) => {
      const dx = grid.rest[3 * i]! - grid.rest[3 * j]!,
        dy = grid.rest[3 * i + 1]! - grid.rest[3 * j + 1]!,
        dz = grid.rest[3 * i + 2]! - grid.rest[3 * j + 2]!;
      this.ca[this.nc]! = i;
      this.cb[this.nc]! = j;
      this.cl[this.nc]! = Math.hypot(dx, dy, dz);
      this.cw[this.nc]! = w;
      this.nc++;
    };
    const cols = wrap ? nu : nu - 1;
    for (let r = 0; r < nv; r++)
      for (let c = 0; c < nu; c++) {
        const i = r * nu + c;
        if (c < cols) add(i, r * nu + ((c + 1) % nu), 1); // ngang
        if (r < nv - 1) add(i, (r + 1) * nu + c, 1); // dọc
        if (r < nv - 1 && c < cols) {
          add(i, (r + 1) * nu + ((c + 1) % nu), 0.6); // chéo
          add(r * nu + ((c + 1) % nu), (r + 1) * nu + c, 0.6);
        }
        if (params.bend > 0 && r < nv - 2) add(i, (r + 2) * nu + c, -1); // uốn dọc (w<0: ràng buộc mềm)
      }
  }

  /** Đặt lại về tư thế nghỉ đã skin (`target`, 3 số mỗi đỉnh, đủ mọi đỉnh): dùng khi xuất hiện hoặc teleport. */
  reset(target: Float32Array): void {
    this.pos.set(target);
    this.prev.set(target);
  }

  /**
   * Một bước. `target`: vị trí skin của vị trí nghỉ theo xương (chỉ đọc ở đỉnh có pinW > 0). `caps`: viên nang (hệ thế giới).
   * `wind`: gia tốc gió (m/s²) cộng thêm.
   */
  step(dt: number, target: Float32Array, caps: readonly Capsule[], wind: V3 = [0, 0, 0], floorY = -1e9): void {
    const { pos, prev, grid, params } = this;
    const pinW = grid.pinW;
    const g = params.gravity * dt * dt;
    const damp = Math.pow(params.damping, dt * 60);
    const wx = wind[0]! * dt * dt,
      wy = wind[1]! * dt * dt,
      wz = wind[2]! * dt * dt;
    for (let i = 0; i < this.n; i++) {
      const k = 3 * i;
      const pw = pinW[i]!;
      if (pw >= 1) {
        prev[k]! = pos[k]! = target[k]!;
        prev[k + 1]! = pos[k + 1]! = target[k + 1]!;
        prev[k + 2]! = pos[k + 2]! = target[k + 2]!;
        continue;
      }
      const x = pos[k]!,
        y = pos[k + 1]!,
        z = pos[k + 2]!;
      let nx = x + (x - prev[k]!) * damp + wx;
      let ny = y + (y - prev[k + 1]!) * damp - g + wy;
      let nz = z + (z - prev[k + 2]!) * damp + wz;
      if (pw > 0) {
        nx += (target[k]! - nx) * pw;
        ny += (target[k + 1]! - ny) * pw;
        nz += (target[k + 2]! - nz) * pw;
      }
      prev[k]! = x;
      prev[k + 1]! = y;
      prev[k + 2]! = z;
      pos[k]! = nx;
      pos[k + 1]! = ny;
      pos[k + 2]! = nz;
    }
    const maxS = params.maxStretch;
    for (let it = 0; it < params.iterations; it++) {
      for (let c = 0; c < this.nc; c++) {
        const i = this.ca[c]!,
          j = this.cb[c]!;
        const w = this.cw[c]!;
        const ki = 3 * i,
          kj = 3 * j;
        const dx = pos[kj]! - pos[ki]!,
          dy = pos[kj + 1]! - pos[ki + 1]!,
          dz = pos[kj + 2]! - pos[ki + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const L = this.cl[c]!;
        let diff: number;
        if (w < 0) {
          // uốn: chỉ kéo về khi hai điểm cách nhau ngắn hơn chiều nghỉ (không chống dãn)
          if (d >= L) continue;
          diff = ((d - L) / d) * params.bend;
        } else {
          let target2 = L;
          if (d > L * maxS) target2 = L * maxS;
          diff = ((d - target2) / d) * params.stretch * w;
        }
        const wi = pinW[i]! >= 1 ? 0 : 1,
          wj = pinW[j]! >= 1 ? 0 : 1;
        const sw = wi + wj;
        if (sw === 0) continue;
        const ci = (diff * wi) / sw,
          cj = (diff * wj) / sw;
        pos[ki]! += dx * ci;
        pos[ki + 1]! += dy * ci;
        pos[ki + 2]! += dz * ci;
        pos[kj]! -= dx * cj;
        pos[kj + 1]! -= dy * cj;
        pos[kj + 2]! -= dz * cj;
      }
      if (it === params.iterations - 1 && params.tether > 0) this.applyTether(target);
      if (it === params.iterations - 1) this.collide(caps);
    }
    if (floorY > -1e8) for (let i = 0; i < this.n; i++) if (pos[3 * i + 1]! < floorY) pos[3 * i + 1] = floorY;
  }

  /** Kéo đỉnh về trong bán kính neo quanh vị trí skin theo xương (`target` cho MỌI đỉnh). */
  private applyTether(target: Float32Array): void {
    const { nu, nv } = this.grid;
    const pos = this.pos;
    const { tether, tetherPow } = this.params;
    for (let r = 1; r < nv; r++) {
      const R = tether * Math.pow(r / (nv - 1), tetherPow);
      const R2 = R * R;
      for (let c = 0; c < nu; c++) {
        const k = 3 * (r * nu + c);
        const dx = pos[k]! - target[k]!,
          dy = pos[k + 1]! - target[k + 1]!,
          dz = pos[k + 2]! - target[k + 2]!;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) {
          const f = R / Math.sqrt(d2);
          pos[k] = target[k]! + dx * f;
          pos[k + 1] = target[k + 1]! + dy * f;
          pos[k + 2] = target[k + 2]! + dz * f;
        }
      }
    }
  }

  private collide(caps: readonly Capsule[]): void {
    const pos = this.pos;
    for (let i = 0; i < this.n; i++) {
      if (this.grid.pinW[i]! >= 1) continue;
      const k = 3 * i;
      const px = pos[k]!,
        py = pos[k + 1]!,
        pz = pos[k + 2]!;
      for (let c = 0; c < caps.length; c++) {
        const cp = caps[c]!;
        const abx = cp.bx - cp.ax,
          aby = cp.by - cp.ay,
          abz = cp.bz - cp.az;
        const l2 = abx * abx + aby * aby + abz * abz;
        let t = l2 > 1e-12 ? ((px - cp.ax) * abx + (py - cp.ay) * aby + (pz - cp.az) * abz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = cp.ax + abx * t,
          qy = cp.ay + aby * t,
          qz = cp.az + abz * t;
        const dx = px - qx,
          dy = py - qy,
          dz = pz - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < cp.r * cp.r) {
          const d = Math.sqrt(d2) || 1e-9;
          const push = (cp.r - d) / d;
          pos[k]! += dx * push;
          pos[k + 1]! += dy * push;
          pos[k + 2]! += dz * push;
        }
      }
    }
  }

  /** Pháp tuyến mượt theo lưới (trung bình pháp tuyến bốn ô quanh đỉnh), ghi vào `out` (3 số mỗi đỉnh). */
  normals(out: Float32Array, outward = true): void {
    const { nu, nv, wrap } = this.grid;
    const pos = this.pos;
    for (let r = 0; r < nv; r++) {
      let mx = 0,
        my = 0,
        mz = 0;
      if (wrap && outward) {
        for (let c = 0; c < nu; c++) {
          mx += pos[3 * (r * nu + c)]!;
          my += pos[3 * (r * nu + c) + 1]!;
          mz += pos[3 * (r * nu + c) + 2]!;
        }
        mx /= nu;
        my /= nu;
        mz /= nu;
      }
      const r0 = Math.max(r - 1, 0),
        r1 = Math.min(r + 1, nv - 1);
      for (let c = 0; c < nu; c++) {
        let c0 = c - 1,
          c1 = c + 1;
        if (wrap) {
          c0 = (c0 + nu) % nu;
          c1 = c1 % nu;
        } else {
          c0 = Math.max(c0, 0);
          c1 = Math.min(c1, nu - 1);
        }
        const a = 3 * (r * nu + c1),
          b = 3 * (r * nu + c0),
          u = 3 * (r0 * nu + c),
          d = 3 * (r1 * nu + c);
        const tx = pos[a]! - pos[b]!,
          ty = pos[a + 1]! - pos[b + 1]!,
          tz = pos[a + 2]! - pos[b + 2]!;
        const sx = pos[d]! - pos[u]!,
          sy = pos[d + 1]! - pos[u + 1]!,
          sz = pos[d + 2]! - pos[u + 2]!;
        let nx = ty * sz - tz * sy,
          ny = tz * sx - tx * sz,
          nz = tx * sy - ty * sx;
        if (wrap && outward) {
          // ống/váy: pháp tuyến hướng ra xa tâm vòng (không để tối vì quay vào trong)
          const k0 = 3 * (r * nu + c);
          if (nx * (pos[k0]! - mx) + ny * (pos[k0 + 1]! - my) + nz * (pos[k0 + 2]! - mz) < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        const o = 3 * (r * nu + c);
        out[o]! = nx;
        out[o + 1]! = ny;
        out[o + 2]! = nz;
      }
    }
  }
}
