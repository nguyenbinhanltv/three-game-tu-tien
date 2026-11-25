/**
 * Bản đồ độ cao vùng xa tính trên CPU bằng float32 chính xác (`Math.fround` ở mọi toán hạng và kết quả): cùng công thức với `farHeight.ts` (dịch từ
 * painted-valley/src/valley/backdrop.js, MIT, © 2026 Patch; xem assets/LICENSES.md) nhưng cho CÙNG một kết quả trên mọi máy và mọi backend.
 *
 * Vì sao: hàm băm của nguồn (`50*fract(...)`, tích tới ~2,5e5) và nhiễu tần số cao ở toạ độ lớn (dãy núi xa) hỗn loạn theo từng ulp của float32, nên
 * GPU/trình biên dịch khác nhau (WebGPU so với WebGL2) cho địa hình khác nhau ở chi tiết mịn (SSIM 0,83 trên độ cao). Nướng MỘT lần ở đây, đưa vào
 * texture nửa-float (như nguồn), rồi pass bức tranh (`farPaint.ts`) chỉ đọc texture, nên mọi máy ra cùng một vùng xa.
 * Thứ tự phép tính bám từng dòng GLSL (trái sang phải, không gộp fma); hằng số cũng được làm tròn về float32.
 */
const f = Math.fround;
const m = (x: number, y: number): number => f(f(x) * f(y));
const a = (x: number, y: number): number => f(f(x) + f(y));
const s = (x: number, y: number): number => f(f(x) - f(y));
const d = (x: number, y: number): number => f(f(x) / f(y));
/** x*y+z làm tròn một lần (mad/fma): trình biên dịch GLSL của ANGLE/D3D gộp `a*b + c` như vậy. */
const fm = (x: number, y: number, z: number): number => f(f(x) * f(y) + f(z));

const fract = (x: number): number => f(x - Math.floor(x));
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01(d(s(x, e0), s(e1, e0)));
  return m(m(t, t), s(3, m(2, t)));
};
const step = (e: number, x: number): number => (x < f(e) ? 0 : 1);
const sqrt = (x: number): number => f(Math.sqrt(x));
const exp = (x: number): number => f(Math.exp(x));
const pow = (x: number, y: number): number => f(Math.pow(x, f(y)));

function hash(px: number, py: number): number {
  const x = m(50, fract(fm(px, 0.3183099, 0.71)));
  const y = m(50, fract(fm(py, 0.3183099, 0.113)));
  return fract(m(m(x, y), a(x, y)));
}

function noise(xx: number, xy: number): number {
  const px = Math.floor(xx);
  const py = Math.floor(xy);
  const fx = s(xx, px);
  const fy = s(xy, py);
  const smooth = (v: number): number => m(m(m(v, v), v), fm(v, fm(v, 6, -15), 10));
  const ux = smooth(fx);
  const uy = smooth(fy);
  const h00 = hash(px, py);
  const h10 = hash(px + 1, py);
  const h01 = hash(px, py + 1);
  const h11 = hash(px + 1, py + 1);
  const t1 = fm(s(h10, h00), ux, h00);
  const t2 = fm(s(h01, h00), uy, t1);
  const k = m(a(s(s(h00, h10), h01), h11), ux);
  return fm(k, uy, t2);
}

// Voronoi: [khoảng cách tới mép, id.x, id.y]
function voro(xx: number, xy: number): [number, number, number] {
  const nx = Math.floor(xx);
  const ny = Math.floor(xy);
  const fx = s(xx, nx);
  const fy = s(xy, ny);
  let d1 = 8;
  let d2 = 8;
  let idx = nx;
  let idy = ny;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = nx + i;
      const gy = ny + j;
      const hx = hash(gx, gy);
      const hy = hash(a(gx, 17.3), a(gy, 17.3));
      const rx = s(a(i, hx), fx);
      const ry = s(a(j, hy), fy);
      const dd = fm(ry, ry, m(rx, rx));
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
        idx = gx;
        idy = gy;
      } else if (dd < d2) d2 = dd;
    }
  }
  return [s(sqrt(d2), sqrt(d1)), idx, idy];
}

const farmAt = (qx: number, qy: number): number => smoothstep(0.42, 0.52, noise(fm(qx, 0.42, 11), fm(qy, 0.42, 11)));

function fieldOf(qx: number, qy: number): [number, number, number] {
  const nx = noise(m(qx, 0.7), m(qy, 0.7));
  const ny = noise(fm(qx, 0.7, 5), fm(qy, 0.7, 5));
  return voro(fm(0.6, nx, m(qx, 1.9)), fm(0.6, ny, m(qy, 1.9)));
}

// cây trên đồi xa: [có cây (0/1), tán cao (0..1)]
function treesAt(qx: number, qy: number): [number, number] {
  const mm = a(
    fm(noise(fm(qx, 4.3, 9), fm(qy, 4.3, 9)), 0.4, m(noise(fm(qx, 1.3, 3), fm(qy, 1.3, 3)), 0.6)),
    m(0.07, smoothstep(9.5, 12.5, sqrt(fm(qy, qy, m(qx, qx))))),
  );
  const c = voro(m(qx, 9), m(qy, 9));
  const mass = Math.max(step(0.66, mm), step(0.61, fm(s(hash(a(c[1], 2), a(c[2], 2)), 0.5), 0.12, mm)) * step(0.1, c[0]));
  const fl = fieldOf(qx, qy);
  const b = voro(fm(qx, 12, 3), fm(qy, 12, 3));
  const row =
    step(fl[0], 0.05) *
    step(0.3, hash(a(fl[1], 8.2), a(fl[2], 8.2))) *
    farmAt(qx, qy) *
    step(0.12, b[0]) *
    step(0.3, hash(a(b[1], 1), a(b[2], 1)));
  const one = voro(fm(qx, 4.5, 7), fm(qy, 4.5, 7));
  const alone = step(0.8, hash(a(one[1], 5), a(one[2], 5))) * step(0.3, one[0]) * step(0.36, mm);
  const bu = voro(fm(qx, 15, 1), fm(qy, 15, 1));
  const bush = step(0.95, hash(a(bu[1], 3), a(bu[2], 3))) * step(0.22, bu[0]);
  const sq = (x: number): number => sqrt(clamp01(x));
  let dome = Math.max(m(mass, fm(0.6, sq(m(c[0], 2.2)), 0.4)), m(alone, sq(m(s(one[0], 0.3), 4))));
  dome = Math.max(dome, m(m(row, 0.75), sq(m(s(b[0], 0.12), 3.5))));
  dome = Math.max(dome, m(m(bush, 0.4), sq(m(s(bu[0], 0.22), 4))));
  return [Math.max(Math.max(mass, alone), Math.max(row, bush)), dome];
}

function ridged(px0: number, py0: number, oct: number): number {
  let px = px0;
  let py = py0;
  let acc = 0;
  let amp = 0.5;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let r = s(1, Math.abs(s(m(2, noise(px, py)), 1)));
    r = m(r, r);
    acc = fm(m(r, amp), w, acc);
    w = clamp01(m(r, 1.7));
    amp = m(amp, 0.5);
    const nx = fm(0.6, py, m(0.8, px));
    const ny = fm(0.8, py, m(-0.6, px));
    px = fm(nx, 2.07, 3.7);
    py = fm(ny, 2.07, 3.7);
  }
  return acc;
}

/** Độ cao (km) tại p (km). `hero` = hướng thung lũng, `detail` = số bát độ của dãy núi. */
export function farHeightCpu(px: number, py: number, hero: readonly [number, number], detail = 9): number {
  const hx = f(hero[0]);
  const hy = f(hero[1]);
  const r = sqrt(fm(py, py, m(px, px)));
  const rr = Math.max(r, f(1e-3));
  const dx = d(px, rr);
  const dy = d(py, rr);
  const ahead = fm(0.5, smoothstep(-0.6, 0.7, fm(dy, hy, m(dx, hx))), 0.5);
  let h = 0;
  for (let k = 0; k < 3; k++) {
    const at = a(
      fm(1.3, s(noise(fm(px, 0.19, fm(9, k, 3.1)), fm(py, 0.19, 7.7)), 0.5), fm(2.2, k, 7.4)),
      m(0.8, s(noise(fm(5, k, m(px, 0.62)), fm(py, 0.62, 2)), 0.5)),
    );
    const off = d(s(r, at), fm(0.35, k, 1));
    const sc0 = s(0.42, m(0.07, k));
    const lump = smoothstep(0.2, 0.75, noise(fm(px, sc0, 1.9), fm(py, sc0, fm(5, k, 4.3))));
    const sc1 = s(1.05, m(0.15, k));
    const crest = a(
      m(s(noise(fm(px, sc1, fm(4, k, 7.3)), fm(py, sc1, 1.1)), 0.5), 0.34),
      m(s(noise(fm(px, 2.3, 2), fm(9, k, m(py, 2.3))), 0.5), 0.08),
    );
    const amp = fm(0.62, k, 0.42);
    const val = Math.max(fm(amp, fm(0.58, lump, 0.42), crest), 0);
    h = Math.max(h, m(val, exp(-m(off, off))));
  }
  const wood = treesAt(px, py);
  let tr = m(0.055, wood[0]);
  tr = m(tr, wood[1]);
  tr = m(tr, s(1, smoothstep(1.45, 1.75, h)));
  tr = m(tr, smoothstep(5.6, 7, r));
  tr = m(tr, s(1, smoothstep(13.5, 15, r)));
  h = a(h, tr);
  const qx = fm(1.6, noise(fm(px, 0.11, 3), fm(py, 0.11, 3)), px);
  const qy = fm(1.6, noise(fm(px, 0.11, 9), fm(py, 0.11, 9)), py);
  const mass = smoothstep(0.34, 0.6, noise(fm(px, 0.052, 9.3), fm(py, 0.052, 9.3)));
  const band = m(smoothstep(12, 17.5, r), s(1, m(0.65, smoothstep(21, 26, r))));
  const mr = ridged(fm(qx, 0.095, 11.3), fm(qy, 0.095, 1.9), detail);
  h = fm(m(m(m(pow(mr, 1.25), 4.4), fm(0.78, mass, 0.22)), band), ahead, h);
  const perpx = -hy;
  const perpy = hx;
  const d1 = f(Math.hypot(s(px, s(m(hx, 18.5), m(perpx, 4.2))), s(py, s(m(hy, 18.5), m(perpy, 4.2)))));
  const d2 = f(Math.hypot(s(px, fm(perpx, 11.5, m(hx, 17))), s(py, fm(perpy, 11.5, m(hy, 17)))));
  h = fm(exp(d(-m(d1, d1), 7.5)), fm(1.6, mr, 0.7), h);
  h = fm(exp(d(-m(d2, d2), 8)), fm(1.4, mr, 0.5), h);
  h = fm(m(pow(ridged(fm(px, 0.07, 31), fm(py, 0.07, 17), 7), 1.2), 3.6), smoothstep(25.5, 31, r), h);
  return h;
}

/** Dựng bản đồ n×n (km), phủ `span` km; hàng j ứng với vUv.y = (j+0.5)/n (hàng 0 là điểm thấp nhất khi đọc bằng readPixels GL). */
export function bakeFarHeightCpu(
  n: number,
  span: number,
  hero: readonly [number, number],
  detail = 9,
  rows?: [number, number],
): Float32Array {
  const [r0, r1] = rows ?? [0, n];
  const out = new Float32Array((r1 - r0) * n);
  for (let j = r0; j < r1; j++) {
    const py = m(s(d(a(j, 0.5), n), 0.5), span);
    for (let i = 0; i < n; i++) {
      const px = m(s(d(a(i, 0.5), n), 0.5), span);
      out[(j - r0) * n + i] = farHeightCpu(px, py, hero, detail);
    }
  }
  return out;
}
