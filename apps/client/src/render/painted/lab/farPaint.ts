import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  atan,
  bool,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Texture } from 'three/webgpu';
import { FAR_SPAN, farmAt, fieldOf, hash, noise, treesAt, voro } from './farHeight';
import type { N } from './field';

/**
 * Pass "bức tranh" của vùng xa (P3b): dịch từng dòng từ painted-valley/src/valley/backdrop.js (`paintFragment`: `hash3`, `voro3`, `bankAt`,
 * `normalAt`, `main`; MIT, © 2026 Patch; xem assets/LICENSES.md) sang TSL. Với mỗi điểm của dải ảnh quấn quanh chân trời (góc phương vị `az`,
 * góc ngẩng `el`) đi tia qua bản đồ độ cao (P3a) rồi lưu ba thứ: màu lúc sáng, màu lúc tối + độ sáng, và độ phủ không khí + sương
 * (ba đầu ra RGBA). Nướng MỘT lần; vòm trời trộn chúng theo ánh sáng của giờ nên đổi giờ không phải nướng lại.
 * Đơn vị km. Màu lưu dưới dạng căn bậc hai (vừa 8 bit), như nguồn.
 */
export interface FarPaintUniforms {
  /** Bản đồ độ cao (km) phủ FAR_SPAN km, người đi bộ ở giữa; lọc song tuyến. */
  tHeight: Texture;
  /** Một texel của bản đồ độ cao, km. */
  uTexel: N;
  /** Hướng (nằm ngang) phía có nắng chiều. */
  uSide: N;
  /** Hướng thung lũng. */
  uHero: N;
  /** Góc ngẩng thấp nhất và cao nhất của dải (radian). */
  uEl: N;
  /** Độ cao mắt (km). */
  uEye: N;
  /** Đầu ra cần vẽ: 0..2 RGB (sáng, tối, không khí), 3..5 alpha tương ứng. */
  uOut: N;
}

const TAU = 6.28318531;

const hash3 = Fn(([q]: [N]) => {
  const p: N = fract(q.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  const s: N = p.add(dot(p, p.yxz.add(33.33))).toVar();
  return fract(s.x.add(s.y).mul(s.z));
});

/** Ô Voronoi trong không gian 3D: x = khoảng cách tới mép ô, yzw = ba số riêng của ô. */
const voro3 = Fn(([x]: [N]) => {
  const n: N = floor(x).toVar();
  const f: N = x.sub(n).toVar();
  let d1: N = float(8).toVar();
  let d2: N = float(8).toVar();
  let id: N = n.toVar();
  for (let k = -1; k <= 1; k++) {
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const g: N = vec3(i, j, k);
        const c: N = n.add(g).toVar();
        const r: N = g
          .add(vec3(hash3(c), hash3(c.add(17.3)), hash3(c.add(41.7))))
          .sub(f)
          .toVar();
        const d: N = dot(r, r).toVar();
        const nearer: N = d.lessThan(d1);
        const between: N = d.lessThan(d2).and(nearer.not());
        d2 = select(nearer, d1, select(between, d, d2)).toVar();
        id = select(nearer, c, id).toVar();
        d1 = select(nearer, d, d1).toVar();
      }
    }
  }
  return vec4(sqrt(d2).sub(sqrt(d1)), hash3(id.add(3.1)), hash3(id.add(7.7)), hash3(id.add(12.9)));
});

/** Dải mây nằm dưới chân dãy núi: (độ phủ, phần đỉnh sáng). `hero` là hướng thung lũng. */
const bankAt = (az: N, el: N, hero: N): N => {
  const rd: N = vec2(cos(az), sin(az)).toVar();
  let top: N = noise(rd.mul(2.3).add(3)).sub(0.5).mul(0.04).add(0.158).toVar();
  const h1: N = sqrt(abs(noise(rd.mul(9).add(1.7)).mul(2).sub(1)));
  const h2: N = sqrt(abs(noise(rd.mul(27).add(5.1)).mul(2).sub(1)));
  const h3: N = sqrt(abs(noise(rd.mul(71).add(9.4)).mul(2).sub(1)));
  top = top.add(h1.mul(0.022)).add(h2.mul(0.014)).add(h3.mul(0.006)).toVar();
  const s: N = atan(dot(rd, vec2(hero.y.negate(), hero.x)), dot(rd, hero)).toVar();
  let here: N = max(float(1).sub(smoothstep(0.2, 0.46, abs(s.sub(0.44)))), float(1).sub(smoothstep(0.14, 0.34, abs(s.add(0.98))))).toVar();
  const peak: N = float(1).sub(smoothstep(0.14, 0.38, abs(s.add(0.2))));
  here = max(here, peak).toVar();
  top = top.add(peak.mul(0.014)).toVar();
  here = max(here, smoothstep(0.5, 0.64, noise(rd.mul(1.4).add(5))).mul(smoothstep(1.5, 1.9, abs(s)))).toVar();
  top = top.sub(float(1).sub(here).mul(0.26)).toVar();
  const rx2: N = rd.x.mul(rd.x);
  const billow: N = mix(noise(vec2(rd.x.mul(38), el.mul(70))), noise(vec2(rd.y.mul(38).add(7), el.mul(70))), rx2);
  const heap: N = mix(noise(vec2(rd.x.mul(15).add(2), el.mul(34))), noise(vec2(rd.y.mul(15).add(9), el.mul(34))), rx2);
  const h4: N = sqrt(
    abs(
      mix(noise(vec2(rd.x.mul(21).add(4), el.mul(46))), noise(vec2(rd.y.mul(21).add(8), el.mul(46))), rx2)
        .mul(2)
        .sub(1),
    ),
  );
  const down: N = top.sub(el);
  const lit: N = clamp(
    step(down.sub(h4.mul(0.034)).sub(billow.sub(0.5).mul(0.02)), 0.026).add(
      step(0.6, h4.mul(heap.mul(0.45).add(0.55))).mul(step(down, 0.09)),
    ),
    0,
    1,
  );
  const cover: N = smoothstep(0, 0.0018, top.sub(el).add(billow.sub(0.5).mul(0.008)));
  return vec2(cover, lit);
};

/**
 * Ba đầu ra của pass vẽ tại một điểm của dải: `uvx`, `uvy` ∈ [0,1] (uvy = 0 ở góc ngẩng thấp nhất). Trả về một vec4: đầu ra do `u.uOut` chọn (0..2 = RGB của: màu sáng, màu tối, không khí; 3..5 = alpha của ba cái đó, đặt ở RGB); nướng bằng sáu lần vẽ.
 * Lưu ý số học: hàm băm của nguồn mất chính xác float32 nên chi tiết mịn khác nhau giữa backend (xem farHeight.ts).
 */
export function farPaint(uvx: N, uvy: N, u: FarPaintUniforms): N {
  const out = Fn(() => {
    const height = (p: N): N => texture(u.tHeight, p.div(FAR_SPAN).add(0.5)).level(float(0)).r;
    const normalAt = (p: N, e: N): N =>
      normalize(
        vec3(height(p.sub(vec2(e, 0))).sub(height(p.add(vec2(e, 0)))), e.mul(2), height(p.sub(vec2(0, e))).sub(height(p.add(vec2(0, e))))),
      );

    const az: N = uvx.mul(TAU).sub(3.14159265).toVar();
    const el: N = mix(u.uEl.x, u.uEl.y, uvy).toVar();
    const rd: N = vec3(cos(az).mul(cos(el)), sin(el), sin(az).mul(cos(el))).toVar();
    const ro: N = vec3(0, u.uEye, 0);
    const flat_: N = length(rd.xz).toVar();
    const t: N = float(5).div(flat_).toVar();
    const tMax: N = float(41.5).div(flat_);
    const before: N = t.toVar();
    const hit: N = bool(false).toVar();
    Loop(520, () => {
      const p: N = ro.add(rd.mul(t));
      const dy: N = p.y.sub(height(p.xz));
      If(dy.lessThan(0), () => {
        hit.assign(true);
        Break();
      });
      If(t.greaterThan(tMax).or(rd.y.greaterThan(0).and(p.y.greaterThan(7.8))), () => {
        Break();
      });
      before.assign(t);
      t.addAssign(max(t.mul(0.0045), dy.mul(0.4)));
    });
    const bankV: N = bankAt(az, el, u.uHero).toVar();
    const bank: N = bankV.x;
    const bankLit: N = bankV.y;

    // tìm điểm chạm chính xác bằng chia đôi
    const lo: N = before.toVar();
    const hi: N = t.toVar();
    for (let k = 0; k < 9; k++) {
      const mid: N = lo.add(hi).mul(0.5);
      const q: N = ro.add(rd.mul(mid));
      const above: N = q.y.sub(height(q.xz)).greaterThan(0);
      lo.assign(select(above, mid, lo));
      hi.assign(select(above, hi, mid));
    }
    const tt: N = hi.toVar();
    const p: N = ro.add(rd.mul(tt)).toVar();
    const alt: N = p.y.toVar();
    const r: N = length(p.xz).toVar();
    const N0: N = normalAt(p.xz, max(tt.mul(0.0022).add(0.014), u.uTexel.mul(2))).toVar();
    const crag: N = float(1).sub(normalAt(p.xz, u.uTexel).y).toVar();

    // ánh sáng từ một bên, thấp (họa sĩ chiếu sáng núi xa từ bên để hình khối xoay)
    const vh: N = rd.xz.div(flat_);
    const rt: N = vec2(vh.y.negate(), vh.x);
    const side: N = clamp(dot(rt, u.uSide).mul(3), -1, 1);
    const lh: N = normalize(rt.mul(side).mul(0.9).add(u.uSide.mul(0.45)));
    const L: N = normalize(vec3(lh.x, 0.45, lh.y)).toVar();

    // bóng một sống núi đổ lên sống kế
    const sh: N = float(1).toVar();
    const ts: N = float(0.05).toVar();
    Loop(40, () => {
      const q: N = p.add(L.mul(ts));
      const dq: N = q.y.sub(height(q.xz));
      sh.assign(min(sh, dq.mul(14).div(ts)));
      If(sh.lessThan(0).or(q.y.greaterThan(7.8)), () => {
        Break();
      });
      ts.addAssign(max(0.04, ts.mul(0.09)));
    });
    sh.assign(clamp(sh, 0, 1));

    // rãnh theo đường dốc: nơi tuyết nằm, đá lộ
    const fall: N = N0.xz.div(max(length(N0.xz), 1e-3));
    const contour: N = vec2(fall.y.negate(), fall.x);
    const wx: N = fall.x.mul(fall.x);
    const streak: N = mix(noise(vec2(p.x.mul(11), alt.mul(1.3).add(4))), noise(vec2(p.z.mul(11), alt.mul(1.3).add(4))), wx)
      .mul(0.6)
      .add(mix(noise(vec2(p.x.mul(3.7).add(9), alt.mul(0.6))), noise(vec2(p.z.mul(3.7).add(9), alt.mul(0.6))), wx).mul(0.4))
      .toVar();
    const brush: N = noise(p.xz.mul(2.3).add(7));

    // cái gì mọc ở đâu
    const treeline: N = brush.mul(0.3).add(1.5);
    const Nb: N = normalAt(p.xz, float(0.09)).toVar();
    const hillLit: N = smoothstep(0, 0.22, dot(Nb, L)).mul(smoothstep(0.25, 0.5, sh));
    const belowLine: N = float(1)
      .sub(smoothstep(treeline.sub(0.1), treeline.add(0.06), alt.add(crag.mul(0.3))))
      .mul(float(1).sub(smoothstep(0.5, 0.72, crag)))
      .toVar();
    const wooded: N = treesAt(p.xz).x.mul(belowLine).toVar();
    const thrown: N = treesAt(p.xz.add(L.xz.mul(0.07)))
      .x.mul(belowLine)
      .mul(float(1).sub(wooded));
    const meadow: N = float(1)
      .sub(smoothstep(1.9, 2.3, alt.add(streak.sub(0.5).mul(0.5))))
      .mul(float(1).sub(smoothstep(0.3, 0.55, crag)))
      .toVar();
    const rocky: N = float(1)
      .sub(wooded)
      .mul(float(1).sub(meadow.mul(0.9)))
      .toVar();

    // đá như được vẽ: các mặt vỡ lớn nhỏ, mỗi mặt xoay riêng về phía sáng, khe giữa chúng tối
    const fq: N = vec3(p.x, alt.mul(1.6), p.z);
    const f1: N = voro3(fq.mul(2.6)).toVar();
    const f2: N = voro3(fq.mul(7.5).add(5)).toVar();
    const f3: N = voro3(fq.mul(19).add(11)).toVar();
    const t1: N = f1.yz.sub(0.5);
    const t2: N = f2.yz.sub(0.5);
    const t3: N = f3.yz.sub(0.5);
    const Nf: N = normalize(
      N0.add(
        vec3(contour.x, 0, contour.y)
          .mul(t1.x.add(t2.x.mul(0.75)).add(t3.x.mul(0.4)))
          .add(vec3(0, t1.y.mul(0.8).add(t2.y.mul(0.6)).add(t3.y.mul(0.35)), 0))
          .mul(rocky),
      ),
    ).toVar();
    const joint: N = float(1)
      .sub(smoothstep(0, 0.05, f1.x))
      .mul(0.8)
      .add(
        float(1)
          .sub(smoothstep(0, 0.08, f2.x))
          .mul(0.36),
      )
      .add(
        float(1)
          .sub(smoothstep(0, 0.1, f3.x))
          .mul(0.1),
      )
      .mul(rocky)
      .toVar();
    const tone: N = f1.w.mul(0.4).add(f2.w.mul(0.35)).add(f3.w.mul(0.25)).toVar();

    // đá và tuyết chuyển từ sáng sang tối dọc một mép; đồi có cây chuyển chậm
    const ndl: N = dot(Nf, L).toVar();
    const crownTurn: N = dot(normalAt(p.xz, u.uTexel.mul(1.5)), L);
    const lobe: N = voro(p.xz.mul(26).add(2)).toVar();
    const tscore: N = crownTurn
      .mul(0.9)
      .add(hash(lobe.yz.add(6)).sub(0.5).mul(0.5))
      .add(lobe.x.sub(0.14).mul(0.9))
      .toVar();
    const hillTone: N = mix(
      hillLit.mul(float(1).sub(thrown.mul(0.9))),
      smoothstep(-0.02, 0.05, tscore).mul(smoothstep(0.3, 0.4, sh)),
      wooded,
    );
    const lit: N = mix(smoothstep(0, 0.12, ndl).mul(smoothstep(0.1, 0.5, sh)), hillTone, max(wooded, meadow)).toVar();

    // tuyết: nguyên vẹn chỉ trên đỉnh cao nhất; thấp hơn nằm trên gờ, mảng này mảng kia
    const deep: N = smoothstep(2.6, 5.4, alt.add(streak.sub(0.5).mul(0.9)).add(noise(p.xz.mul(0.45).add(2)).mul(0.3))).toVar();
    let snow: N = max(
      step(fract(f1.y.mul(7.31).add(f1.w.mul(3.7))), deep.mul(0.62)).mul(float(1).sub(smoothstep(0.5, 0.78, crag).mul(0.85))),
      smoothstep(0.93, 1, deep),
    );
    snow = max(snow, step(fract(f2.z.mul(5.17).add(f2.w.mul(2.3))), deep.mul(0.12)))
      .mul(float(1).sub(wooded))
      .mul(step(0.02, deep))
      .toVar();

    // đá: kem và xám ấm khi sáng; xám lục khi tối
    let light: N = mix(vec3(0.38, 0.34, 0.26), vec3(0.68, 0.62, 0.47), tone).toVar();
    let shade: N = mix(vec3(0.25, 0.27, 0.23), vec3(0.43, 0.43, 0.36), tone).toVar();
    const stain: N = smoothstep(
      0.4,
      0.64,
      noise(p.xz.mul(1.7).add(11))
        .mul(0.6)
        .add(fract(f2.z.mul(9.1).add(f2.w.mul(3.3))).mul(0.4)),
    ).mul(float(1).sub(smoothstep(2.3, 3.9, alt)));
    light = mix(light, vec3(0.4, 0.4, 0.17), stain.mul(0.8)).toVar();
    shade = mix(shade, vec3(0.2, 0.26, 0.15), stain.mul(0.7)).toVar();
    light = light.mul(float(1).sub(joint.mul(0.55))).toVar();
    shade = shade.mul(float(1).sub(joint.mul(0.5))).toVar();

    // đồng cỏ cao: không đâu là một màu
    const v1: N = noise(p.xz.mul(0.9).add(1));
    const v2: N = noise(p.xz.mul(2.7).add(4));
    const s1: N = noise(vec2(dot(p.xz, vec2(0.8, 0.6)).mul(1.6), dot(p.xz, vec2(-0.6, 0.8)).mul(11)));
    const s2: N = noise(vec2(dot(p.xz, vec2(0.96, -0.28)).mul(2.2), dot(p.xz, vec2(0.28, 0.96)).mul(17)).add(5));
    const round2: N = noise(vec2(alt.add(v1.mul(0.08)).mul(24), v2.mul(2)));
    const v: N = v1.mul(0.34).add(v2.mul(0.2)).add(s1.mul(0.2)).add(s2.mul(0.12)).add(round2.mul(0.14)).toVar();
    let grassL: N = mix(vec3(0.17, 0.46, 0.14), vec3(0.27, 0.57, 0.13), smoothstep(0.36, 0.5, v)).toVar();
    grassL = mix(grassL, vec3(0.42, 0.66, 0.15), smoothstep(0.54, 0.66, v)).toVar();
    let grassS: N = mix(vec3(0.08, 0.31, 0.16), vec3(0.13, 0.42, 0.17), smoothstep(0.36, 0.6, v)).toVar();
    // ruộng: mỗi thửa một tông, dải tối dưới hàng rào dọc phần lớn mép
    const farmed: N = farmAt(p.xz)
      .mul(float(1).sub(smoothstep(0.2, 0.4, float(1).sub(Nb.y))))
      .toVar();
    const fld: N = fieldOf(p.xz).toVar();
    const kind: N = hash(fld.yz.add(1.7));
    const tint: N = select(
      kind.lessThan(0.25),
      vec3(1.3, 1.12, 0.9),
      select(kind.lessThan(0.5), vec3(0.8, 0.92, 1), select(kind.lessThan(0.62), vec3(1.75, 1.2, 1.1), vec3(1))),
    );
    grassL = mix(grassL, grassL.mul(tint), farmed).toVar();
    grassS = mix(grassS, grassS.mul(mix(vec3(1), tint, 0.6)), farmed).toVar();
    const hedge: N = float(1)
      .sub(smoothstep(0.02, 0.05, fld.x))
      .mul(step(0.3, hash(fld.yz.add(8.2))))
      .mul(farmed);
    grassL = mix(grassL, vec3(0.07, 0.27, 0.11), hedge.mul(0.8)).toVar();
    grassS = mix(grassS, vec3(0.04, 0.17, 0.11), hedge.mul(0.8)).toVar();
    // đường mòn: nhạt, quanh co, lúc có lúc không
    let way: N = float(1).sub(smoothstep(0.004, 0.008, abs(noise(p.xz.mul(0.5).add(7)).sub(0.5))));
    way = max(
      way,
      float(1)
        .sub(smoothstep(0.004, 0.0075, abs(noise(p.xz.mul(0.9).add(13)).sub(0.46))))
        .mul(step(0.45, v1)),
    ).toVar();
    grassL = mix(grassL, vec3(0.62, 0.71, 0.3), way.mul(0.75)).toVar();
    grassS = mix(grassS, vec3(0.3, 0.5, 0.3), way.mul(0.6)).toVar();
    // chấm: búi tối, đốm nắng, vài bông hoa
    const d1: N = voro(p.xz.mul(38)).toVar();
    const dh: N = hash(d1.yz.add(9));
    const dab: N = step(0.2, d1.x);
    grassL = mix(grassL, grassL.mul(vec3(0.72, 0.84, 0.9)), dab.mul(step(0.8, dh))).toVar();
    grassL = mix(grassL, grassL.mul(vec3(1.25, 1.12, 0.85)), dab.mul(step(dh, 0.14))).toVar();
    grassL = mix(grassL, vec3(0.86, 0.82, 0.46), step(0.3, d1.x).mul(step(0.955, fract(dh.mul(7.13))))).toVar();
    grassS = grassS.mul(float(1).sub(dab.mul(0.2).mul(step(0.8, dh)))).toVar();
    light = mix(light, grassL, meadow.mul(0.96)).toVar();
    shade = mix(shade, grassS, meadow.mul(0.96)).toVar();
    // cây: sáng, nửa sáng và tối theo thùy lá, chút vàng chỗ nắng gắt, tối giữa các tán
    const cr: N = voro(p.xz.mul(9)).toVar();
    const gap: N = float(1)
      .sub(smoothstep(0, 0.05, cr.x))
      .mul(0.6);
    let treeL: N = mix(vec3(0.055, 0.27, 0.12), vec3(0.11, 0.37, 0.13), smoothstep(0.3, 0.36, tscore)).toVar();
    treeL = mix(treeL, vec3(0.24, 0.5, 0.15), smoothstep(0.62, 0.68, tscore)).toVar();
    const treeS: N = mix(vec3(0.022, 0.11, 0.095), vec3(0.045, 0.19, 0.115), smoothstep(-0.4, -0.3, tscore));
    light = mix(light, mix(treeL, vec3(0.03, 0.14, 0.09), gap), wooded).toVar();
    shade = mix(shade, mix(treeS, vec3(0.018, 0.085, 0.085), gap), wooded).toVar();
    // tuyết: trắng, và xám lam nơi ánh sáng không tới
    light = mix(light, vec3(1.07, 1.06, 1.03).mul(tone.mul(0.08).add(0.94)), snow).toVar();
    shade = mix(shade, mix(vec3(0.6, 0.65, 0.72), vec3(0.7, 0.74, 0.8), tone), snow).toVar();

    // dưới nắng, mặt đối diện thẳng sáng hơn một tông so với mặt lướt qua
    light = light.mul(mix(float(1), mix(0.72, 1.05, smoothstep(0.25, 0.6, ndl)), rocky)).toVar();
    // khi tối, mặt vẫn xoay: sáng hơn nơi nhìn lên trời, sẫm hơn nơi quay đi
    shade = shade
      .mul(mix(float(1), mix(0.78, 1.16, smoothstep(0.1, 0.5, dot(Nf, normalize(vec3(L.x.negate(), 1.1, L.z.negate()))))), rocky))
      .toVar();

    // họa sĩ giữ màu của vùng xa nhiều hơn không khí sẽ giữ
    const thin: N = mix(float(1), float(0.3), smoothstep(0.25, 2.6, alt));
    // sương nằm dưới chân mỗi dãy núi để dãy này nổi lên khỏi dãy sau
    const lie: N = noise(vec2(az.mul(9), 1)).sub(0.5);
    let mist: N = smoothstep(10.5, 14.5, r)
      .mul(float(1).sub(smoothstep(0.2, 0.85, alt.add(lie.mul(0.4)))))
      .mul(0.2)
      .toVar();
    mist = max(
      mist,
      smoothstep(25, 29, r)
        .mul(float(1).sub(smoothstep(0.6, 1.9, alt.add(lie.mul(0.6)))))
        .mul(0.6),
    ).toVar();
    // dải mây nằm sau chân đồi và trước mọi thứ khác
    const front: N = bank.mul(smoothstep(14, 15, r));
    const land: N = float(1).sub(front);
    const airThick: N = float(1).sub(
      exp(
        tt
          .mul(1000)
          .mul(thin)
          .mul(0.3)
          .mul(mix(mix(0.85, 3, smoothstep(7.4, 12, r)), float(1), rocky))
          .mul(0.00015)
          .negate(),
      ),
    );
    const hitLight: N = vec4(sqrt(min(light, 1)).mul(land), 1);
    const hitShade: N = vec4(sqrt(min(shade, 1)).mul(land), lit.mul(land));
    const hitAir: N = vec4(airThick.mul(land), mist.mul(land), front, front.mul(bankLit));

    const plain: N = sqrt(vec3(0.2, 0.3, 0.15));
    const below: N = rd.y.lessThan(0);
    const missLight: N = select(below, vec4(plain, 1), vec4(0, 0, 0, bank));
    const missShade: N = select(below, vec4(plain, 1), vec4(0));
    const missAir: N = select(below, vec4(1, 0, 0, 0), vec4(0, 0, bank, bank.mul(bankLit)));
    const oLight: N = select(hit, hitLight, missLight);
    const oShade: N = select(hit, hitShade, missShade);
    const oAir: N = select(hit, hitAir, missAir);
    // vật liệu có alpha < 1 sẽ bị bỏ điểm ảnh có alpha = 0 và mất màu: nên chỉ xuất RGB (alpha = 1) hoặc chỉ xuất alpha (ở RGB).
    const k: N = select(u.uOut.lessThan(2.5), u.uOut, u.uOut.sub(3));
    const o: N = select(k.lessThan(0.5), oLight, select(k.lessThan(1.5), oShade, oAir));
    return select(u.uOut.lessThan(2.5), vec4(o.rgb, 1), vec4(vec3(o.a), 1));
  });
  return out();
}
