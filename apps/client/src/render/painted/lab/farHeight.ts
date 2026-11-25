import { Fn, abs, clamp, dot, exp, float, floor, fract, length, max, pow, select, smoothstep, sqrt, step, vec2, vec3 } from 'three/tsl';
import type { N } from './field';

/**
 * Bản đồ độ cao của vùng xa (P3a): dịch từng dòng từ painted-valley/src/valley/backdrop.js (`NOISE`, `treesAt`, `heightFragment`; MIT, © 2026
 * Patch; xem assets/LICENSES.md) sang TSL. Mỗi hàm bọc trong `Fn` để biên dịch thành một hàm WGSL (không bị nội tuyến lặp), kết quả giữ bằng
 * `.toVar()`. Đơn vị là km; `SPAN` là cạnh của hình vuông vùng xa, người đi bộ ở giữa. Bản đồ này chỉ được dựng MỘT lần (nướng), xem farBake (P3b).
 */
export const FAR_SPAN = 86;

/**
 * Hàm băm của nguồn, giữ nguyên. Lưu ý (đo bằng far-compare): tích `p.x*p.y*(p.x+p.y)` tới ~2,5e5 nên float32 chỉ còn ~2^-5 độ chính xác; trên
 * WebGL2 (ANGLE) khớp GLSL gốc (SSIM 0,999998) nhưng trên WebGPU (WGSL) trình biên dịch cho giá trị khác ở tần số cao (SSIM 0,86 trên độ cao).
 */
const hash = Fn(([p0]: [N]) => {
  const p: N = vec2(p0).mul(0.3183099).add(vec2(0.71, 0.113)).fract().mul(50).toVar();
  return fract(p.x.mul(p.y).mul(p.x.add(p.y)));
});

const noise = Fn(([x]: [N]) => {
  const p: N = floor(x).toVar();
  const f: N = fract(x).toVar();
  const u: N = f
    .mul(f)
    .mul(f)
    .mul(f.mul(f.mul(6).sub(15)).add(10))
    .toVar();
  const a: N = hash(p).toVar();
  const b: N = hash(p.add(vec2(1, 0))).toVar();
  const c: N = hash(p.add(vec2(0, 1))).toVar();
  const d: N = hash(p.add(vec2(1, 1))).toVar();
  return a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(a.sub(b).sub(c).add(d).mul(u.x).mul(u.y));
});

/** Ô Voronoi: khoảng cách tới mép ô điểm đang ở (x) và tên ô (yz). */
const voro = Fn(([x]: [N]) => {
  const n: N = floor(x).toVar();
  const f: N = x.sub(n).toVar();
  let d1: N = float(8).toVar();
  let d2: N = float(8).toVar();
  let id: N = n.toVar();
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const g: N = vec2(i, j);
      const r: N = g
        .add(vec2(hash(n.add(g)), hash(n.add(g).add(17.3))))
        .sub(f)
        .toVar();
      const d: N = dot(r, r).toVar();
      const nearer: N = d.lessThan(d1);
      const between: N = d.lessThan(d2).and(nearer.not());
      d2 = select(nearer, d1, select(between, d, d2)).toVar();
      id = select(nearer, n.add(g), id).toVar();
      d1 = select(nearer, d, d1).toVar();
    }
  }
  return vec3(sqrt(d2).sub(sqrt(d1)), id);
});

const farmAt = Fn(([q]: [N]) => smoothstep(0.42, 0.52, noise(q.mul(0.42).add(11))));

const fieldOf = Fn(([q]: [N]) => voro(q.mul(1.9).add(vec2(noise(q.mul(0.7)), noise(q.mul(0.7).add(5))).mul(0.6))));

/** Cây trên đồi xa như nét vẽ. x: 1 nơi có cây. y: tán cao bao nhiêu (0..1). */
const treesAt = Fn(([q]: [N]) => {
  const m: N = noise(q.mul(1.3).add(3))
    .mul(0.6)
    .add(noise(q.mul(4.3).add(9)).mul(0.4))
    .add(smoothstep(9.5, 12.5, length(q)).mul(0.07))
    .toVar();
  const c: N = voro(q.mul(9)).toVar();
  const mass: N = max(step(0.66, m), step(0.61, m.add(hash(c.yz.add(2)).sub(0.5).mul(0.12))).mul(step(0.1, c.x))).toVar();
  const f: N = fieldOf(q).toVar();
  const b: N = voro(q.mul(12).add(3)).toVar();
  const row: N = step(f.x, 0.05)
    .mul(step(0.3, hash(f.yz.add(8.2))))
    .mul(farmAt(q))
    .mul(step(0.12, b.x))
    .mul(step(0.3, hash(b.yz.add(1))))
    .toVar();
  const one: N = voro(q.mul(4.5).add(7)).toVar();
  const alone: N = step(0.8, hash(one.yz.add(5)))
    .mul(step(0.3, one.x))
    .mul(step(0.36, m))
    .toVar();
  const bu: N = voro(q.mul(15).add(1)).toVar();
  const bush: N = step(0.95, hash(bu.yz.add(3)))
    .mul(step(0.22, bu.x))
    .toVar();
  let dome: N = max(
    mass.mul(
      sqrt(clamp(c.x.mul(2.2), 0, 1))
        .mul(0.6)
        .add(0.4),
    ),
    alone.mul(sqrt(clamp(one.x.sub(0.3).mul(4), 0, 1))),
  );
  dome = max(dome, row.mul(0.75).mul(sqrt(clamp(b.x.sub(0.12).mul(3.5), 0, 1))));
  dome = max(dome, bush.mul(0.4).mul(sqrt(clamp(bu.x.sub(0.22).mul(4), 0, 1)))).toVar();
  return vec2(max(max(mass, alone), max(row, bush)), dome);
});

/** Núi sắc đỉnh, sườn rộng sạch: các nếp mịn chỉ dọc đường sống (M2 = ma trận xoay GLSL cột-chính: (0,8x + 0,6y, −0,6x + 0,8y)). */
function ridged(p0: N, oct: number): N {
  let p: N = p0;
  let a: N = float(0);
  let amp = 0.5;
  let w: N = float(1);
  for (let i = 0; i < oct; i++) {
    let r: N = float(1).sub(abs(noise(p).mul(2).sub(1)));
    r = r.mul(r);
    a = a.add(r.mul(amp).mul(w));
    w = clamp(r.mul(1.7), 0, 1);
    amp *= 0.5;
    p = vec2(p.x.mul(0.8).add(p.y.mul(0.6)), p.x.mul(-0.6).add(p.y.mul(0.8)))
      .mul(2.07)
      .add(3.7);
  }
  return a;
}

/**
 * Độ cao (km) của vùng xa tại điểm p (km, tâm = người đi bộ). `hero` = hướng thung lũng (vector đơn vị), `detail` = số bát độ của dãy núi
 * (nguồn: 9 cho bản đồ 2048, 10 cho 4096).
 */
export function farHeightAt(p: N, hero: readonly [number, number], detail = 9, stop = 0): N {
  if (stop === 9) return hash(floor(p.mul(37)));
  if (stop === 8) return noise(p.mul(3));
  if (stop === 7) return voro(p.mul(2)).x;
  if (stop === 6) return ridged(p.mul(0.095), detail);
  if (stop === 5) return treesAt(p).x;
  const H: N = vec2(hero[0], hero[1]);
  const r: N = length(p).toVar();
  const dir: N = p.div(max(r, 1e-3));
  const ahead: N = smoothstep(-0.6, 0.7, dot(dir, H)).mul(0.5).add(0.5);
  // đồi có rừng, từng hàng: ba hàng đồi tròn, hàng sau cao hơn hàng trước
  let h: N = float(0);
  for (let k = 0; k < 3; k++) {
    const at: N = noise(p.mul(0.19).add(vec2(3.1 + 9 * k, 7.7)))
      .sub(0.5)
      .mul(1.3)
      .add(7.4 + 2.2 * k)
      .add(
        noise(p.mul(0.62).add(vec2(5 * k, 2)))
          .sub(0.5)
          .mul(0.8),
      );
    const off: N = r.sub(at).div(1 + 0.35 * k);
    const lump: N = smoothstep(0.2, 0.75, noise(p.mul(0.42 - 0.07 * k).add(vec2(1.9, 4.3 + 5 * k))));
    const crest: N = noise(p.mul(1.05 - 0.15 * k).add(vec2(7.3 + 4 * k, 1.1)))
      .sub(0.5)
      .mul(0.34)
      .add(
        noise(p.mul(2.3).add(vec2(2, 9 * k)))
          .sub(0.5)
          .mul(0.08),
      );
    h = max(
      h,
      max(
        lump
          .mul(0.58)
          .add(0.42)
          .mul(0.42 + 0.62 * k)
          .add(crest),
        0,
      ).mul(exp(off.mul(off).negate())),
    ).toVar();
  }
  if (stop === 1) return h;
  // cây mọc lên khỏi đồi: tán là một phần hình khối nên có viền và che phía sau
  const wood: N = treesAt(p).toVar();
  h = h
    .add(
      wood.x
        .mul(wood.y)
        .mul(0.055)
        .mul(float(1).sub(smoothstep(1.45, 1.75, h)))
        .mul(smoothstep(5.6, 7, r))
        .mul(float(1).sub(smoothstep(13.5, 15, r))),
    )
    .toVar();
  if (stop === 2) return h;
  // dãy núi: các khối với đèo giữa chúng
  const q: N = p.add(vec2(noise(p.mul(0.11).add(3)), noise(p.mul(0.11).add(9))).mul(1.6));
  const mass: N = smoothstep(0.34, 0.6, noise(p.mul(0.052).add(9.3)));
  const band: N = smoothstep(12, 17.5, r).mul(float(1).sub(smoothstep(21, 26, r).mul(0.65)));
  const m: N = ridged(q.mul(0.095).add(vec2(11.3, 1.9)), detail).toVar();
  h = h.add(pow(m, float(1.25)).mul(4.4).mul(mass.mul(0.78).add(0.22)).mul(band).mul(ahead)).toVar();
  if (stop === 3) return h;
  // hai đỉnh lớn, nơi mắt dừng lại
  const perp: N = vec2(-hero[1], hero[0]);
  const d1: N = length(p.sub(H.mul(18.5).sub(perp.mul(4.2))));
  const d2: N = length(p.sub(H.mul(17).add(perp.mul(11.5))));
  h = h
    .add(exp(d1.mul(d1).div(-7.5)).mul(m.mul(1.6).add(0.7)))
    .add(exp(d2.mul(d2).div(-8)).mul(m.mul(1.4).add(0.5)))
    .toVar();
  // và một dãy xa hơn, thấy qua các đèo
  h = h
    .add(
      pow(ridged(p.mul(0.07).add(vec2(31, 17)), 7), float(1.2))
        .mul(3.6)
        .mul(smoothstep(25.5, 31, r)),
    )
    .toVar();
  return h;
}
