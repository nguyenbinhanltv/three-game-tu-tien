import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  cameraPosition,
  clamp,
  distance,
  dot,
  float,
  floor,
  fract,
  ivec2,
  length,
  max,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  sqrt,
  step,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { hash42 as hash42f } from '../meadow';

/**
 * Dựa trên painted-valley/src/lib/glsl.js (COMMON, LEAF_LIGHT) và lib/index.js (createField: các uniform dùng chung), MIT, © 2026 Patch
 * (xem assets/LICENSES.md). Dịch từng hàm sang TSL, giữ nguyên tên, thứ tự và hằng số. Cảnh thử đối chiếu `?paintedlab=1`.
 *
 * Quy ước: `v = true` là ngữ cảnh vertex (GLSL `texture()` ở vertex shader đọc tầng 0, nên TSL phải `.level(0)`).
 * Bỏ các phần luôn bằng 0 trong cảnh thử (lửa, đèn cầm tay, người đi bộ, bóng cây: `uFireColor`, `uLamp`, `uWalker`, `tShade` rỗng,
 * `tState` mặc định = không rạp, không cắt) và ghi rõ ở chỗ bỏ.
 */
/** Node TSL: dùng any cho gọn (giống materials/ground.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type N = any;

export const TAU = 6.28318531;

export interface FieldTextures {
  /** R32F, mét, texel (i, j) = độ cao tại (extentMin + (i + 0,5) · texel). */
  tHeight: THREE.DataTexture;
  /** RGBA8: dry, growth, wet, flowers. */
  tMap: THREE.DataTexture;
  tNoise: THREE.Texture;
  tNoiseHi: THREE.Texture;
  tWhite: THREE.Texture;
  tStrokes: THREE.Texture;
  /** RG8: độ dốc đông/nam, 0,5 = bằng. */
  tSlope: THREE.Texture;
  /** Bóng cây (1×1 rỗng trong cảnh thử). */
  tShade: THREE.Texture;
  /** Đất canh tác vẽ từ trên (1×1 trong suốt trong cảnh thử). */
  tFloor: THREE.Texture;
}

export class RefField {
  readonly uTime = uniform(0);
  readonly uWind = uniform(new THREE.Vector4(1, 0, 3, 1));
  readonly uWindScroll = uniform(new THREE.Vector2());
  readonly uExtentMin = uniform(new THREE.Vector2());
  readonly uExtentInv = uniform(1);
  readonly uHeightRes = uniform(1);
  readonly uSunDir = uniform(new THREE.Vector3(0.6, 0.25, 0.3).normalize());
  readonly uSunColor = uniform(new THREE.Vector3(3.2, 2.5, 1.6));
  readonly uSkyColor = uniform(new THREE.Vector3(0.34, 0.42, 0.6));
  readonly uBounceColor = uniform(new THREE.Vector3(0.1, 0.09, 0.05));
  readonly uFogColor = uniform(new THREE.Vector3(0.55, 0.6, 0.7));
  readonly uFogSunColor = uniform(new THREE.Vector3(1.0, 0.75, 0.45));
  readonly uFogDensity = uniform(0.0016);
  readonly uCloudShade = uniform(0.55);
  readonly uHeroEye = uniform(new THREE.Vector3(0, 60, 0));
  readonly uFloor = uniform(new THREE.Vector4(1, 0, 0, 0));
  readonly uFloorInv = uniform(0);
  /** Đẩy lá: 6 vec4 (xyz, bán kính). Cảnh thử không có. */
  readonly uPushers = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));

  constructor(readonly tex: FieldTextures) {}

  // ---- đọc texture (vertex: tầng 0) ----
  s(t: THREE.Texture, uv: N, v: boolean): N {
    const n = texture(t, uv);
    return v ? n.level(float(0)) : n;
  }
  noise(uv: N, v: boolean): N {
    return this.s(this.tex.tNoise, uv, v);
  }
  noiseHi(uv: N, v: boolean): N {
    return this.s(this.tex.tNoiseHi, uv, v);
  }
  strokes(uv: N, v: boolean): N {
    return this.s(this.tex.tStrokes, uv, v);
  }
  map(uv: N, v: boolean): N {
    return this.s(this.tex.tMap, uv, v);
  }

  // ---- bản đồ ----
  extentUv(xz: N): N {
    return xz.sub(this.uExtentMin).mul(this.uExtentInv);
  }

  /** Độ cao đất, đọc đúng như CPU (`field.heightAt`): song tuyến giữa tâm các texel. */
  groundAt(xz: N): N {
    const p = this.extentUv(xz).mul(this.uHeightRes).sub(0.5);
    const i = floor(p);
    const f = p.sub(i);
    const hi = this.uHeightRes.sub(1);
    const a = vec2(clamp(i.x, 0, hi), clamp(i.y, 0, hi));
    const b = vec2(clamp(i.x.add(1), 0, hi), clamp(i.y.add(1), 0, hi));
    const at = (x: N, y: N): N => textureLoad(this.tex.tHeight, ivec2(x, y)).r;
    const h00 = at(a.x, a.y);
    const h10 = at(b.x, a.y);
    const h01 = at(a.x, b.y);
    const h11 = at(b.x, b.y);
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  }

  /** 0 trong lúc lặng đến 1 trong cơn gió: hai trường trôi theo gió, trường rộng nhanh hơn. */
  gustAt(xz: N, v: boolean): N {
    const a = xz.sub(this.uWindScroll).div(61);
    const b = xz.sub(this.uWindScroll.mul(0.62)).div(17);
    const g = this.noiseHi(a, v)
      .r.mul(0.68)
      .add(this.noiseHi(b.add(0.37), v).g.mul(0.32));
    return smoothstep(0.26, 0.78, g);
  }

  /** 1 ngoài trời, ít hơn dưới mây (hoặc cây: tShade rỗng nên bỏ nhánh cây). Mây trôi theo gió, chậm. */
  openAt(xz: N, v: boolean): N {
    const p = xz.sub(this.uWindScroll.mul(2.6)).div(3400);
    const c = this.noiseHi(p, v)
      .b.mul(0.7)
      .add(this.noiseHi(p.mul(2.7).add(0.19), v).a.mul(0.3));
    return float(1).sub(this.uCloudShade.mul(smoothstep(0.47, 0.6, c)));
  }

  /** Mặt trời tới đất bao nhiêu: trời quang, trừ bóng người đi bộ (`uWalker.w` = 0 trong cảnh thử nên hệ số 1). */
  cloudAt(xz: N, v: boolean): N {
    return this.openAt(xz, v);
  }

  /** Sương theo khoảng cách, ấm về phía mặt trời. */
  applyFog(c: N, world: N): N {
    const d = world.sub(cameraPosition);
    const dist = length(d);
    // the haze lies in the valleys: what stands above it is seen through less of it
    const thin = mix(1.0, 0.3, smoothstep(250, 2400, world.y));
    const f = float(1).sub(this.uFogDensity.mul(dist).mul(thin).negate().exp());
    const toSun = pow(max(dot(d.div(max(dist, 1e-3)), this.uSunDir), 0), 6);
    return mix(c, mix(this.uFogColor, this.uFogSunColor, toSun), clamp(f, 0, 1));
  }

  /** Cỏ là gì, theo màu: xanh nơi tươi, rơm nơi khô. s = 0 ở gốc, 1 ở ngọn. */
  grassColor(dry: N, s: N): N {
    const green = mix(vec3(0.035, 0.135, 0.05), vec3(0.25, 0.43, 0.085), s);
    const straw = mix(vec3(0.085, 0.09, 0.03), vec3(0.42, 0.4, 0.15), s);
    return mix(green, straw, dry);
  }

  /** Mảng xanh ngả vàng/ngả lam rộng, như người vẽ trải đồng cỏ: giống nhau ở mọi nơi vẽ cỏ. */
  meadowTint(xz: N, v: boolean): N {
    const a = this.noiseHi(xz.div(520), v).a;
    const b = this.noiseHi(xz.div(37).add(0.23), v).r;
    const w = smoothstep(0.3, 0.7, a.mul(0.6).add(b.mul(0.4)));
    let t: N = mix(vec3(0.8, 0.96, 1.1), vec3(1.2, 1.06, 0.76), w);
    t = t.toVar();
    // here and there a patch of something darker and bluer: clover, sedge
    const c = this.noiseHi(xz.div(13).add(0.61), v).g;
    return t.mul(mix(vec3(1), vec3(0.72, 0.87, 0.96), smoothstep(0.6, 0.72, c)));
  }

  /** Cỏ cao ở chỗ này, thấp ở chỗ kia: 1 là chiều cao thường. */
  tallAt(xz: N, v: boolean): N {
    const a = this.noiseHi(xz.div(23).add(0.47), v).b;
    const b = this.noiseHi(xz.div(7).add(0.11), v).r;
    return mix(0.72, 1.5, smoothstep(0.34, 0.68, a.mul(0.7).add(b.mul(0.3))));
  }

  /** Mặt đất quay hướng nào tại một chỗ trên cánh đồng. */
  landNormal(xz: N, v: boolean): N {
    const s = this.s(this.tex.tSlope, this.extentUv(xz), v).rg.sub(0.5).mul(0.5);
    return normalize(vec3(s.x.negate(), 1, s.y.negate()));
  }

  /**
   * Sườn dốc so với mặt trời, như người vẽ: 0,5 cho đất bằng; hơn nếu quay về phía sáng, kém nếu quay đi. Dốc bị nhân 3,2
   * vì đất thoải gần như không hiện gì.
   */
  slopeRel(N_: N): N {
    const n = normalize(vec3(N_.x.mul(3.2), N_.y, N_.z.mul(3.2)));
    const L = normalize(vec3(this.uSunDir.x, max(this.uSunDir.y, 0.3), this.uSunDir.z));
    return clamp(float(0.5).add(dot(n, L).sub(L.y).mul(1.5)), 0, 1);
  }

  /** Mặt trời tới bao nhiêu chỗ dốc như vậy: chỗ trũng được bầu trời chiếu. */
  slopeSun(rel: N): N {
    return mix(0.3, 1.0, smoothstep(0.04, 0.5, rel));
  }

  /** Đồng cỏ như được vẽ: ba màu xanh chọn theo tông (0 trong bóng sâu, 1 nơi sáng đầy). */
  meadowGreen(tone: N): N {
    const c = mix(vec3(0.05, 0.25, 0.07), vec3(0.15, 0.46, 0.085), smoothstep(0.2, 0.5, tone));
    return mix(c, vec3(0.3, 0.57, 0.12), smoothstep(0.56, 0.9, tone));
  }

  /** Ánh sáng trên đồng cỏ giờ này. `shade` là mức thoáng nắng (đo bằng cloudAt). */
  meadowLight(shade: N): N {
    const gray = dot(this.uSunColor, vec3(0.333));
    const sun = mix(this.uSunColor, vec3(gray, gray, gray), 0.3)
      .mul(0.42)
      .add(this.uSkyColor.mul(0.35));
    const lum = dot(this.uSkyColor, vec3(0.333));
    const sky = mix(vec3(0.4, 0.74, 0.95), this.uSkyColor.div(max(lum, 0.01)).mul(0.62), 0.35).mul(lum.mul(1.9).add(0.06));
    return mix(sky.mul(0.85), sun, smoothstep(0.25, 0.95, shade));
  }

  /** Điểm trên đất nằm ở đâu trong bức tranh nhìn từ chỗ xuất phát: radian bên phải trục thung lũng và radian dưới tầm mắt. */
  heroAngle(world: N): N {
    const d = world.xz.sub(this.uHeroEye.xz);
    return vec2(
      atan(dot(d, vec2(this.uFloor.y.negate(), this.uFloor.x)), dot(d, this.uFloor.xy)),
      atan(this.uHeroEye.y.sub(world.y), length(d)),
    );
  }

  /** Ô: khoảng cách từ điểm tới mép ô chứa nó, và hai số riêng của ô. */
  paintCells(x: N): N {
    const n = floor(x);
    const f = x.sub(n);
    let d1: N = float(8).toVar();
    let d2: N = float(8).toVar();
    let id: N = n.toVar();
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const c = vec2(i, j);
        const r = c.add(hash42f(n.add(c)).xy).sub(f);
        const d = dot(r, r).toVar();
        const lt1 = d.lessThan(d1).toVar();
        const lt2 = d.lessThan(d2).toVar();
        const nd2 = select(lt1, d1, select(lt2, d, d2));
        id = select(lt1, n.add(c), id).toVar();
        d1 = select(lt1, d, d1).toVar();
        d2 = nd2.toVar();
      }
    }
    const h = hash42f(id.add(0.37));
    return vec3(sqrt(d2).sub(sqrt(d1)), h.z, h.w);
  }

  /**
   * Công thức đồi xa của nguồn (backdrop.js) áp trên đồng cỏ. q = heroAngle tại đó, w = độ đổi của q qua một điểm ảnh (fwidth),
   * dist = khoảng cách tới camera.
   */
  heroPaint(g: N, world: N, q: N, w: N, dist: N): N {
    const r = distance(world.xz, this.uHeroEye.xz);
    // not at your feet, where the blades are the brushwork; not past the plain; not behind the start, where the
    // picture's two edges meet
    let k: N = smoothstep(70, 150, dist)
      .mul(float(1).sub(smoothstep(2200, 3600, r)))
      .mul(float(1).sub(smoothstep(2.1, 2.8, abs(q.x))));
    k = k.toVar();
    let px: N = max(w.x, w.y);
    px = px.toVar();
    // soft patches of three greens at two sizes, and long strokes of them lying level
    let soft: N = k.mul(float(1).sub(smoothstep(0.0015, 0.005, px)));
    soft = soft.toVar();
    let vv: N = this.noiseHi(q.div(0.42).add(0.2), false)
      .r.mul(0.4)
      .add(this.noiseHi(q.div(0.15).add(0.6), false).g.mul(0.3))
      .add(this.noiseHi(vec2(q.x.div(0.5), q.y.div(0.07)).add(0.4), false).b.mul(0.3));
    vv = vv.toVar();
    let out: N = g.mul(
      mix(
        vec3(1),
        vec3(0.7, 0.87, 1.0),
        float(1)
          .sub(smoothstep(0.42, 0.48, vv))
          .mul(soft)
          .mul(0.9),
      ),
    );
    out = out.toVar();
    out = out.mul(mix(vec3(1), vec3(1.34, 1.15, 0.8), smoothstep(0.53, 0.59, vv).mul(soft).mul(0.9)));
    out = out.toVar();
    // clumps of rough grass, gathered into masses as the woods on the hills are
    let coarse: N = k.mul(float(1).sub(smoothstep(0.3, 0.7, px.mul(70)))).mul(smoothstep(0.016, 0.03, px.mul(70)));
    coarse = coarse.toVar();
    let t: N = this.paintCells(q.mul(70));
    t = t.toVar();
    let mass: N = smoothstep(0.48, 0.56, this.noiseHi(q.div(0.3).add(0.7), false).a);
    mass = mass.toVar();
    out = out.mul(
      mix(
        vec3(1),
        vec3(0.62, 0.82, 0.9),
        smoothstep(0.1, 0.2, t.x)
          .mul(step(t.y, mass.mul(0.34).add(0.04)))
          .mul(coarse),
      ),
    );
    out = out.toVar();
    // dabs: a darker tuft, a fleck of sun, a few flowers
    let fine: N = k.mul(float(1).sub(smoothstep(0.3, 0.7, px.mul(220)))).mul(smoothstep(0.05, 0.09, px.mul(220)));
    fine = fine.toVar();
    const c = this.paintCells(q.mul(220));
    let dab: N = smoothstep(0.1, 0.22, c.x).mul(fine);
    dab = dab.toVar();
    out = out.mul(mix(vec3(1), vec3(0.72, 0.85, 0.92), dab.mul(step(0.8, c.y))));
    out = out.toVar();
    out = out.mul(mix(vec3(1), vec3(1.26, 1.13, 0.84), dab.mul(step(c.y, 0.15))));
    out = out.toVar();
    const petal = select(c.z.greaterThan(0.985), vec3(0.88, 0.86, 0.78), vec3(0.86, 0.8, 0.4));
    return mix(out, petal, smoothstep(0.3, 0.42, c.x).mul(fine).mul(step(0.965, c.z)).mul(0.6));
  }

  /** Nơi các nét dài trên đất nằm: đường đồng mức, uốn nhẹ cho không giống bản đồ. */
  strokeCoord(world: N): N {
    return world.y.add(this.noiseHi(world.xz.div(270).add(0.4), false).g.mul(7)).div(5.5);
  }

  /** Trên đất bằng không có đường đồng mức để theo, nên một bộ nét thứ hai nằm ngang thung lũng, uốn lượn. */
  strokeCoord2(xz: N): N {
    return dot(xz, this.uFloor.xy)
      .add(this.noiseHi(xz.div(430).add(0.7), false).a.mul(70))
      .div(31)
      .add(57);
  }

  /** Vài nét mảnh dài theo đường đồng mức, vài nét sáng hơn cỏ, vài nét đậm hơn. x = strokeCoord, w = fwidth(x). */
  landStrokes(g: N, xz: N, dist: N, x: N, w: N): N {
    let far: N = smoothstep(70, 170, dist).mul(float(1).sub(smoothstep(2600, 4600, dist)));
    far = far.toVar();
    let line: N = float(1).sub(smoothstep(1.5, 3.2, abs(fract(x).sub(0.5)).div(max(w, 1e-5))));
    line = line.toVar();
    const id = floor(x);
    // only here and there, and each for a different length
    let here: N = smoothstep(0.45, 0.53, this.noiseHi(xz.div(340).add(id.mul(0.37)), false).b);
    here = here.toVar();
    let k: N = line.mul(here).mul(far);
    k = k.toVar();
    // most are pale, as a track or a line of sunlit grass is; some are a deeper green
    return select(
      fract(id.mul(0.618)).lessThan(0.62),
      mix(g, vec3(0.5, 0.64, 0.22), k.mul(0.6)),
      g.mul(mix(vec3(1), vec3(0.62, 0.8, 0.86), k)),
    );
  }

  /** Nét cọ của đồng cỏ gần và xa (paintGround của nguồn). */
  paintGround(g: N, xz: N, dist: N): N {
    // at your feet, the brush's dabs, the same the blades take their tone from; gone by a hundred metres
    const nearK = float(1).sub(smoothstep(40, 110, dist));
    let t0: N = this.strokes(xz.div(6), false)
      .r.sub(0.5)
      .mul(0.5)
      .add(this.strokes(vec2(xz.y, xz.x).div(27).add(0.37), false).r.sub(0.5).mul(0.7))
      .add(this.strokes(xz.div(95).add(0.11), false).r.sub(0.5).mul(0.9))
      .mul(0.7)
      .mul(nearK);
    t0 = t0.toVar();
    const farK = float(1).sub(nearK);
    // beyond, one slow change of green across the land,
    let t: N = t0.add(this.noiseHi(xz.div(1100).add(0.2), false).r.sub(0.5).mul(0.5).mul(farK));
    t = t.toVar();
    let out: N = g
      .mul(float(1).add(t.mul(0.5)))
      .mul(mix(vec3(0.9, 1.0, 1.1), vec3(1.1, 1.03, 0.84), clamp(float(0.5).add(t.mul(1.4)), 0, 1)));
    out = out.toVar();
    // and on it, as on the far hills, soft patches at two sizes
    let v: N = this.noiseHi(xz.div(520).add(0.2), false)
      .g.mul(0.58)
      .add(this.noiseHi(xz.div(170).add(0.61), false).b.mul(0.42));
    v = v.toVar();
    out = out.mul(mix(vec3(1), vec3(1.26, 1.13, 0.76), smoothstep(0.5, 0.62, v).mul(farK).mul(0.4)));
    out = out.toVar();
    out = out.mul(
      mix(
        vec3(1),
        vec3(0.76, 0.92, 1.06),
        float(1)
          .sub(smoothstep(0.36, 0.48, v))
          .mul(farK)
          .mul(0.4),
      ),
    );
    out = out.toVar();
    // a few tufts of longer grass standing darker in it: short dashes lying across the view, on the nearer ground only
    const q = vec2(dot(xz, vec2(this.uFloor.y.negate(), this.uFloor.x)).div(130), dot(xz, this.uFloor.xy).div(64));
    let tuft: N = float(1).sub(smoothstep(0.13, 0.2, this.strokes(q, false).r));
    tuft = tuft.toVar();
    out = out.mul(
      mix(
        vec3(1),
        vec3(0.7, 0.86, 0.9),
        tuft
          .mul(farK)
          .mul(float(1).sub(smoothstep(350, 800, dist)))
          .mul(0.6),
      ),
    );
    out = out.toVar();
    // (a far meadow in the sun is a lighter, yellower green than the grass at your feet, which you see into)
    return out.mul(mix(vec3(1), vec3(1.16, 1.1, 0.9), farK));
  }

  /** Nét của đất canh tác ở một chỗ, và alpha = bao nhiêu đất là canh tác. */
  floorAt(xz: N): N {
    const uv = vec2(dot(xz, this.uFloor.xy), dot(xz, vec2(this.uFloor.y.negate(), this.uFloor.x)))
      .sub(this.uFloor.zw)
      .mul(this.uFloorInv);
    return texture(this.tex.tFloor, clamp(uv, 0, 1));
  }

  /**
   * Ánh sáng trên một lá mảnh. N hướng về người xem; ánh sáng từ sau xuyên qua, ngả vàng hơn. (LEAF_LIGHT; bỏ `uFireColor * glow`,
   * luôn 0 trong cảnh thử.)
   */
  leafLight(albedo: N, Nn: N, V: N, up: N, gloss: N, shade: N): N {
    const ndl = dot(Nn, this.uSunDir);
    // low sun reaches the tips and little else: the blades in front stand in the way
    const reach = pow(clamp(up, 0, 1), mix(3.0, 0.55, clamp(this.uSunDir.y.mul(2.2), 0, 1)));
    const sun = shade.mul(mix(0.05, 1.0, reach));
    const through = albedo.mul(vec3(1.0, 1.16, 0.36)).add(vec3(0.012, 0.02, 0.0));
    let c: N = albedo.mul(this.uSunColor).mul(max(ndl, 0)).mul(sun);
    c = c.add(through.mul(this.uSunColor).mul(max(ndl.negate(), 0)).mul(0.72).mul(sun));
    const H = normalize(this.uSunDir.add(V));
    c = c.add(
      this.uSunColor
        .mul(pow(abs(dot(Nn, H)), 42))
        .mul(gloss)
        .mul(sun),
    );
    const ao = mix(0.22, 1.0, clamp(up, 0, 1));
    c = c.add(albedo.mul(mix(this.uBounceColor, this.uSkyColor, Nn.y.mul(0.5).add(0.5))).mul(ao));
    return c;
  }

  /** Cảnh thử: áp một bản dump uniform (JSON từ `ref-capture.mjs`). */
  applyDump(d: RefDump): void {
    this.uTime.value = d.uTime;
    this.uWind.value.fromArray(d.uWind);
    this.uWindScroll.value.fromArray(d.uWindScroll);
    this.uSunDir.value.fromArray(d.uSunDir);
    this.uSunColor.value.fromArray(d.uSunColor);
    this.uSkyColor.value.fromArray(d.uSkyColor);
    this.uBounceColor.value.fromArray(d.uBounceColor);
    this.uFogColor.value.fromArray(d.uFogColor);
    this.uFogSunColor.value.fromArray(d.uFogSunColor);
    this.uFogDensity.value = d.uFogDensity;
    this.uCloudShade.value = d.uCloudShade;
    this.uHeroEye.value.fromArray(d.uHeroEye);
    this.uFloor.value.fromArray(d.uFloor);
    this.uFloorInv.value = d.uFloorInv;
  }
}

/** Bản dump uniform của painted-valley (xem tools/painted-compare/ref-capture.mjs). */
export interface RefDump {
  hour: number;
  at: [number, number];
  target: [number, number, number];
  camera: { position: number[]; rotation: number[]; fov: number; aspect: number; near: number; far: number };
  uTime: number;
  uWind: number[];
  uWindScroll: number[];
  uSunDir: number[];
  uSunColor: number[];
  uSkyColor: number[];
  uBounceColor: number[];
  uFogColor: number[];
  uFogSunColor: number[];
  uFogDensity: number;
  uCloudShade: number;
  uHeroEye: number[];
  uFloor: number[];
  uFloorInv: number;
  exposure: number;
  bloom: number;
  paint: number;
}
