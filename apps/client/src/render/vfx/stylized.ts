import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
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
  normalView,
  positionView,
  pow,
  select,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { hash21, vnoise, type FxUniforms, type N } from './common';
import { cardTexture } from './cards';
import { artAtlas, ART_COUNT } from './art';

/**
 * Thư viện shader TSL "vẽ tay, 2D trong 3D" (VFX-V0). Mọi hiệu ứng chiêu mới ghép từ các mảnh này:
 * - `ramp3`: ramp ba tầng màu cứng mép (lõi đậm, thân, viền sáng), đổi màu theo nhánh công pháp (bảng màu ở palette.ts).
 * - `jaggedCut`: mép rách lởm chởm (ngưỡng nhiễu theo chiều dài), thay cho mép mịn của lưới.
 * - `dissolve`: mask xói mòn theo nhiễu, tan từ đuôi/mép trong.
 * - `flowNoise`: nhiễu chảy theo thời gian (flow map thủ tục: không cần texture).
 * - `fresnelRim`: viền fresnel (gai/mũi tinh thể).
 * - lớp bóng sẫm: cùng hình với lớp sáng, màu sẫm, hòa trộn thường, vẽ trước (xem `mode` của `toonNodes`).
 *
 * Quy ước kiểu (xem render/materials/vfx.ts): `toon`, `crystal`, `burst`, `decal`, hòa trộn thường (đọc được trên nền sáng),
 * đỉnh HDR chặn ở `maxHdr`; bloom chỉ bắt phần viền sáng. Shader không đọc `positionLocal` (lưới gộp instanced).
 *
 * Tham số theo lưới: `fxColor` = màu thân; `fxB.xyz` = màu viền (tuyến tính), `fxB.w` = độ rách mép 0..1;
 * `fxA` = (đầu quét 0..1, ngưỡng tan 0..1,1, seed, bóng 0|1) cho `toon`; (đầu quét, tan, seed, —) cho `crystal`/`burst`;
 * (mọc 0..1, mờ 0..1, seed, kiểu decal) cho `decal`.
 */

/** Ramp ba tầng: `s` 0..1 → lõi dưới `t1`, thân tới `t2`, viền trên `t2`; `soft` là độ mềm mép giữa các tầng. */
function ramp3(s: N, core: N, body: N, rim: N, t1 = 0.52, t2 = 0.86, soft = 0.04): N {
  return mix(
    mix(core, body, smoothstep(float(t1).sub(soft), float(t1).add(soft), s)),
    rim,
    smoothstep(float(t2).sub(soft), float(t2).add(soft), s),
  );
}

/** Ngưỡng rách mép theo chiều dài `u`: mép trong của hình bị cắt lởm chởm (0 = mịn). Trả 0..1 (1 = còn). */
function jaggedCut(u: N, v: N, seed: N, amount: N): N {
  const th = amount.mul(float(0.14).add(vnoise(vec2(u.mul(17).add(seed.mul(7)), seed)).mul(0.5)));
  return smoothstep(th.sub(0.025), th.add(0.025), v);
}

/** Mask xói mòn: 1 còn, 0 tan. `e` thường là nhiễu trộn với vị trí (đuôi tan trước); `erode` 0 còn nguyên, ≥ 1,05 tan hết. */
function dissolve(e: N, erode: N, width = 0.06): N {
  return smoothstep(erode.sub(width), erode, e);
}

/** Nhiễu giá trị chảy theo `dir` mỗi giây (flow map thủ tục). */
function flowNoise(p: N, dir: N, speed = 1): N {
  return vnoise(p.add(dir.mul(time).mul(speed)));
}

/** Viền fresnel 0 (nhìn thẳng) → 1 (lướt). */
function fresnelRim(power = 2.4): N {
  return pow(float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))), power);
}

/** Màu lõi suy từ màu thân: sẫm hơn và bão hòa hơn (bình phương trong không gian tuyến tính). */
const coreOf = (body: N) => body.mul(body).mul(0.42);

/**
 * `toon`: lưỡi liềm, vòng, dải xoắn... UV: `u` dọc hình (chiều quét), `v` từ mép trong (0) ra mép ngoài (1).
 * Lõi đậm ở trong, thân, viền sáng ngoài cùng; mép trong rách; mọc theo đầu quét; tan theo nhiễu.
 * `fxA.w` ≥ 0,5: lớp bóng (một màu `fxColor`, mờ 0,7), cùng hình.
 */
export function toonNodes(U: FxUniforms): { color: N; opacity: N } {
  const st = uv();
  const u = st.x;
  const v = st.y;
  const head = U.a.x;
  const erode = U.a.y;
  const seed = U.a.z;
  const shadow = step(0.5, U.a.w);
  const rag = U.b.w;
  const one = float(1);
  const body = U.color;
  const rim = U.b.xyz;

  const reveal = one.sub(smoothstep(head.sub(0.05), head, u));
  const trail = smoothstep(head.sub(0.9), head, u);
  const ends = smoothstep(0, 0.04, u).mul(one.sub(smoothstep(0.96, 1, u)));
  const flow = flowNoise(vec2(u.mul(8).add(seed.mul(13)), v.mul(3)), vec2(-3, 0.2));
  const cut = jaggedCut(u, v, seed, rag);
  const alive = dissolve(flow.mul(0.65).add(one.sub(trail).mul(0.3)).add(one.sub(v).mul(0.2)), erode);

  // Tầng màu theo v (có xô lệch nhiễu nhẹ để ranh giữa các tầng không thẳng như thước).
  const s = v.add(flow.sub(0.5).mul(0.14));
  const lit = ramp3(s, coreOf(body), body, rim);
  const hot = one.sub(U.k).pow(2).mul(0.3).add(1);
  const color = select(shadow.greaterThan(0.5), body, min(lit.mul(hot), U.maxHdr));
  const a = reveal.mul(alive).mul(ends).mul(cut).mul(trail.mul(0.35).add(0.65));
  return { color, opacity: U.opacity.mul(a).mul(select(shadow.greaterThan(0.5), float(0.7), one)) };
}

/**
 * `crystal`: gai/mũi tinh thể phẳng mặt. Lưới không chỉ mục, mỗi mặt có UV riêng: `u` 0..1 ngang mặt, `v` 0 (đáy) → 1 (đỉnh).
 * Ba tầng theo hướng sáng (mỗi mặt một tông), viền fresnel ngả trắng, đường gân vàng ở mép mặt, đáy sẫm → đỉnh sáng.
 * `fxA.x` = độ cao đã mọc 0..1 (cắt theo v), `fxA.y` = tan.
 */
export function crystalNodes(U: FxUniforms): { color: N; opacity: N } {
  const st = uv();
  const u = st.x;
  const v = st.y;
  const grow = U.a.x;
  const erode = U.a.y;
  const seed = U.a.z;
  const body = U.color;
  const rim = U.b.xyz;
  const one = float(1);
  const n = normalize(normalView);
  const light = dot(n, normalize(vec3(0.35, 0.8, 0.45)))
    .mul(0.5)
    .add(0.5);
  // Mỗi mặt một tông rõ (xô lệch theo hướng pháp tuyến), thêm dốc sáng dần lên đỉnh.
  const facet = light.mul(0.55).add(v.mul(0.45));
  const lit = ramp3(facet, coreOf(body), body, rim, 0.4, 0.78, 0.03);
  const fres = fresnelRim(2.2);
  const gold = vec3(1.0, 0.78, 0.32);
  const edge = smoothstep(0.86, 0.97, abs(u.mul(2).sub(1)));
  const tinted = mix(lit, rim, fres.mul(0.55));
  const color = min(mix(tinted, gold.mul(1.5), edge.mul(0.85)), U.maxHdr);
  const rise = one.sub(smoothstep(grow.sub(0.03), grow, v));
  const gone = dissolve(
    hash21(vec2(floor(u.mul(6)), seed))
      .mul(0.3)
      .add(v.mul(0.5))
      .add(0.1),
    erode,
    0.08,
  );
  return { color, opacity: U.opacity.mul(rise).mul(gone) };
}

/**
 * `burst`: tấm quay mặt về camera, chớp va chạm: lõi trắng nóng tắt rất nhanh + vạch tốc độ tỏa tròn.
 * UV 0..1 tâm ở giữa. `fxA.y` = độ mờ theo thời gian (0 hiện → 1 tắt), `fxA.x` = bán kính vạch đã bung 0..1, `fxA.z` = seed.
 */
export function burstNodes(U: FxUniforms): { color: N; opacity: N } {
  const p = uv().sub(0.5).mul(2);
  const r = length(p);
  const ang = atan(p.y, p.x);
  const seed = U.a.z;
  const spread = U.a.x;
  const fade = U.a.y;
  const one = float(1);
  const body = U.color;
  const rim = U.b.xyz;
  // Vạch: 26 nan hoa, mỗi nan có độ dài riêng; nan thon dần ra ngoài.
  const N_SPOKE = 26;
  const t = ang
    .div(Math.PI * 2)
    .add(0.5)
    .mul(N_SPOKE);
  const id = floor(t);
  const fr = abs(fract(t).sub(0.5)); // 0 ở giữa nan
  const len = hash21(vec2(id, seed)).mul(0.5).add(0.5);
  const reach = spread.mul(len);
  const width = one.sub(r.div(max(reach, 0.05))).mul(0.34);
  const spoke = one
    .sub(smoothstep(0, max(width, 0.001), fr))
    .mul(smoothstep(0.1, 0.22, r))
    .mul(one.sub(smoothstep(reach.sub(0.12), reach, r)));
  // Lõi chớp: tròn trắng nóng nhỏ.
  const core = exp(r.mul(r).mul(-9)).mul(one.sub(fade));
  const ring = smoothstep(0.03, 0.0, abs(r.sub(spread.mul(0.62)))).mul(0.6);
  // Vạch chéo va chạm (kỹ thuật "clash cross" của EdgeFlux, MIT): vệt ngang dài + vệt dọc ngắn, xoay theo seed; bật bằng `fxA.w` > 0,5.
  const cs = seed.mul(2.399);
  const q = vec2(p.x.mul(cos(cs)).add(p.y.mul(sin(cs))), p.y.mul(cos(cs)).sub(p.x.mul(sin(cs))));
  const hs = exp(abs(q.y).mul(-38)).mul(pow(max(one.sub(abs(q.x)), 0), 1.5));
  const vs = exp(abs(q.x).mul(-30))
    .mul(pow(max(one.sub(abs(q.y)), 0), 3))
    .mul(0.6);
  const cross = hs
    .add(vs)
    .mul(step(0.5, U.a.w))
    .mul(one.sub(smoothstep(0.55, 1, fade)))
    .mul(smoothstep(0, 0.12, spread));
  const col = min(
    mix(body, rim, clamp(core.add(spoke.mul(0.7)).add(cross.mul(0.8)), 0, 1)).mul(float(1).add(core.mul(0.9)).add(cross.mul(0.5))),
    U.maxHdr,
  );
  const a = clamp(
    spoke
      .add(core)
      .add(cross)
      .add(ring.mul(spoke.add(0.3))),
    0,
    1,
  ).mul(one.sub(fade));
  return { color: col, opacity: U.opacity.mul(a) };
}

/** Kiểu decal (fxA.w). */
export const DECAL_CRACK = 0;
export const DECAL_RUNE = 1;
export const DECAL_SCORCH = 2;
export const DECAL_SMOKE = 3;
/** Chỗ sét đánh xuống đất: vũng sáng, tia nứt, vòng xung kích (Storm & Wind, CC BY 4.0, xem credits.json). */
export const DECAL_STRIKE = 4;

/** Texture vòng triện văn (canvas thủ tục, nạp lười). */
let runeTex: THREE.Texture | null = null;
function runeTexture(): THREE.Texture {
  if (runeTex) return runeTex;
  const tex = drawRuneRing();
  runeTex = tex;
  return tex;
}

/**
 * Vẽ vòng triện văn: 20 ký tự tự thiết kế (mỗi ký tự là vài nét thẳng/cong trên lưới 4×6, đối xứng dọc nhẹ, KHÔNG phải chữ thật)
 * xếp quanh vòng, hai vòng tròn kẹp và vạch chia. Trắng trên nền trong suốt; shader nhân màu.
 */
function drawRuneRing(): THREE.Texture {
  const S = 1024;
  if (typeof document === 'undefined') {
    const data = new Uint8Array(4 * 4).fill(0);
    const t = new THREE.DataTexture(data, 4, 4);
    t.needsUpdate = true;
    return t;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const C = S / 2;
  const ring = (r: number, w: number, dash?: number[]) => {
    g.lineWidth = w;
    g.setLineDash(dash ?? []);
    g.beginPath();
    g.arc(C, C, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(486, 7);
  ring(468, 3);
  ring(352, 7);
  ring(338, 2, [3, 11]);
  ring(236, 4);
  g.setLineDash([]);
  // Dãy ký tự: rng cố định để mỗi lần dựng ra cùng một bảng.
  let seed = 20260117;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const N_GLYPH = 20;
  const glyph = (cx: number, cy: number, ang: number, size: number) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.lineWidth = 6;
    const gw = size * 0.55;
    const gh = size;
    const px = (i: number) => (i / 3 - 0.5) * gw;
    const py = (j: number) => (j / 5 - 0.5) * gh;
    const strokes = 3 + Math.floor(rnd() * 3);
    g.beginPath();
    for (let k = 0; k < strokes; k++) {
      const a = [Math.floor(rnd() * 4), Math.floor(rnd() * 6)];
      const b = [Math.floor(rnd() * 4), Math.floor(rnd() * 6)];
      const kind = rnd();
      g.moveTo(px(a[0]!), py(a[1]!));
      if (kind < 0.55) g.lineTo(px(b[0]!), py(b[1]!));
      else g.quadraticCurveTo(px(a[0]!) + (rnd() - 0.5) * gw, py(b[1]!), px(b[0]!), py(b[1]!));
    }
    // Một nét dọc trục xương sống cho mọi ký tự, để nhìn ra "chữ".
    g.moveTo(0, py(0));
    g.lineTo(0, py(5));
    g.stroke();
    // Chấm.
    g.beginPath();
    g.arc(px(1 + Math.floor(rnd() * 2)), py(Math.floor(rnd() * 6)), 5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < N_GLYPH; i++) {
    const a = (i / N_GLYPH) * Math.PI * 2;
    glyph(C + Math.cos(a) * 412, C + Math.sin(a) * 412, a + Math.PI / 2, 92);
  }
  // Vạch chia giữa hai vòng trong.
  g.lineWidth = 4;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * 244, C + Math.sin(a) * 244);
    g.lineTo(C + Math.cos(a) * 262, C + Math.sin(a) * 262);
    g.stroke();
  }
  // Hình sao tám cánh ở giữa.
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? 78 : 168;
    const x = C + Math.cos(a) * rr;
    const y = C + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * `decal`: tấm phẳng trên mặt đất. UV 0..1 tâm ở giữa. `fxA` = (mọc 0..1, mờ 0..1, seed, kiểu).
 * `fxK` = độ nóng 1 → 0: vết nứt phát sáng ban đầu rồi nguội dần thành vết sẫm.
 */
export function decalNodes(U: FxUniforms): { color: N; opacity: N } {
  const p = uv().sub(0.5).mul(2);
  const r = length(p);
  const ang = atan(p.y, p.x);
  const grow = U.a.x;
  const fade = U.a.y;
  const seed = U.a.z;
  const kind = U.a.w;
  const one = float(1);
  const body = U.color;
  const rim = U.b.xyz;
  const edgeMask = one.sub(smoothstep(0.86, 1, r));

  // Vết nứt: nan hoa gãy khúc theo nhiễu, mỗi nan một độ dài; một lớp nan ngắn thứ hai (nhánh phụ).
  const spokes = (n: number, wMul: number, reachMul: number, sd: number) => {
    const t = ang
      .div(Math.PI * 2)
      .add(0.5)
      .mul(n)
      .add(
        vnoise(vec2(r.mul(5), seed.add(sd)))
          .sub(0.5)
          .mul(0.9),
      );
    const id = floor(t);
    const f = abs(fract(t).sub(0.5));
    const len = hash21(vec2(id, seed.add(sd)))
      .mul(0.55)
      .add(0.45)
      .mul(reachMul);
    const reach = grow.mul(len);
    const w = float(0.09)
      .mul(wMul)
      .mul(one.sub(r.div(max(reach, 0.05)).mul(0.8)));
    return one
      .sub(smoothstep(0, max(w, 0.002), f))
      .mul(one.sub(smoothstep(reach.sub(0.05), reach, r)))
      .mul(smoothstep(0.03, 0.08, r));
  };
  const crack = max(spokes(7, 1, 1, 0), spokes(15, 0.7, 0.55, 3.1));
  const crackHalo = max(spokes(7, 3.2, 1, 0), spokes(15, 2.4, 0.55, 3.1)).mul(0.55);
  const heat = U.k;
  const crackCol = mix(
    vec3(0.02, 0.03, 0.035),
    min(mix(body, rim, heat.mul(heat)).mul(heat.mul(1.1).add(0.25)), U.maxHdr),
    crack.mul(heat.mul(0.9).add(0.1)),
  );
  const crackA = max(crack, crackHalo).mul(edgeMask);

  // Vòng triện văn: nhân texture (trắng) với màu; quay chậm, mọc theo bán kính; mép ngoài tắt mềm.
  const q = uv();
  const rune = texture(runeTexture(), q).a;
  const runeGrow = one.sub(smoothstep(grow.sub(0.06), grow, r));
  const runeCol = min(mix(body, rim, heat.mul(0.6)).mul(heat.mul(0.9).add(0.55)), U.maxHdr);
  const runeA = rune.mul(runeGrow).mul(edgeMask);

  // Vết cháy: mảng sẫm rách mép bằng nhiễu, mọc nhanh rồi giữ.
  const scorchN = vnoise(p.mul(3.2).add(seed.mul(9)));
  const scorchEdge = grow.mul(0.85).add(scorchN.sub(0.5).mul(0.35));
  const scorchA = one
    .sub(smoothstep(scorchEdge.sub(0.12), scorchEdge, r))
    .mul(float(0.7).sub(r.mul(0.35)).max(0))
    .mul(edgeMask);
  const scorchCol = mix(vec3(0.02, 0.02, 0.025), body.mul(0.12), heat.mul(0.4));

  // Tấm khói toon: mảng trắng ngả lam, hai tông (sáng/tối) cắt cứng, nở ra rồi tan theo nhiễu.
  const sn = vnoise(p.mul(2.6).add(vec2(seed.mul(5), seed.mul(3))));
  const sn2 = vnoise(p.mul(5.1).sub(vec2(seed.mul(2), 0)));
  const smokeEdge = grow.mul(0.95).add(sn.sub(0.5).mul(0.45));
  const smokeMask = one.sub(smoothstep(smokeEdge.sub(0.05), smokeEdge, r));
  const smokeLive = dissolve(sn2.mul(0.55).add(r.mul(0.35)).add(0.05), fade.mul(1.15), 0.06);
  const tone = step(0.52, sn2.add(p.y.mul(0.12)));
  const smokeCol = mix(mix(body, vec3(0.04, 0.09, 0.12), 0.6), mix(body, vec3(0.5, 0.6, 0.66), 0.45), tone);
  const smokeA = smokeMask.mul(smokeLive);

  // Chỗ sét đánh (kỹ thuật `strike` của Storm & Wind, viết lại): vũng sáng gắt ở tâm, tia chớp tỏa (nhiễu theo góc, lũy thừa 4), vòng xung kích mở ra rồi tắt; tắt theo độ nóng `U.k` (decal: 1 → 0).
  const flash = pow(max(U.k, 0), 1.6);
  const turn = ang.div(Math.PI * 2).add(0.5);
  const pool = exp(r.mul(r).mul(-10)).mul(flash);
  const rays = pow(vnoise(vec2(turn.mul(20), seed.mul(13).add(r.mul(3)))), 4)
    .mul(exp(r.mul(-2.2)))
    .mul(smoothstep(0.02, 0.1, r))
    .mul(flash)
    .mul(2.4);
  const ring = smoothstep(0.07, 0, abs(r.sub(grow.min(1).mul(0.95))))
    .mul(one.sub(grow.min(1)))
    .mul(0.9);
  const strikeGlow = clamp(pool.add(rays).add(ring), 0, 1).mul(smoothstep(1, 0.75, r));
  const strikeCol = min(mix(rim, body, clamp(pool.add(rays.mul(0.5)), 0, 1)).mul(1.1), U.maxHdr);

  const isStrike = step(3.5, kind);
  const isCrack = step(-0.5, kind).mul(step(kind, 0.5));
  const isRune = step(0.5, kind).mul(step(kind, 1.5));
  const isScorch = step(1.5, kind).mul(step(kind, 2.5));
  const color = select(
    isStrike.greaterThan(0.5),
    strikeCol,
    select(
      isCrack.greaterThan(0.5),
      crackCol,
      select(isRune.greaterThan(0.5), runeCol, select(isScorch.greaterThan(0.5), scorchCol, smokeCol)),
    ),
  );
  const a = select(
    isStrike.greaterThan(0.5),
    strikeGlow,
    select(isCrack.greaterThan(0.5), crackA, select(isRune.greaterThan(0.5), runeA, select(isScorch.greaterThan(0.5), scorchA, smokeA))),
  );
  // Smoke và strike tự quản lý mờ (xói mòn / theo k); các kiểu khác mờ theo `fade` trực tiếp.
  const fadeMul = select(step(2.5, kind).greaterThan(0.5), one, one.sub(fade));
  return { color, opacity: U.opacity.mul(a).mul(fadeMul) };
}

/**
 * `card`: thẻ pháp tướng vẽ 2D quay mặt về camera (render/vfx/cards.ts). Texture mã hóa R = tầng màu, G = điểm nhấn, A = hình.
 * Ba tầng màu theo bảng nhánh (lõi sẫm / thân / viền sáng); phần điểm nhấn dùng vàng (La Hán) hoặc đỏ son (Phượng).
 * `fxA` = (mọc từ dưới lên 0..1,1, tan 0..1,1, seed, thẻ 0 La Hán | 1 Phượng). Mép tan bừng sáng.
 */
export function cardNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  const reveal0 = U.a.x;
  const erode = U.a.y;
  const seed = U.a.z;
  const which = U.a.w;
  const one = float(1);
  const body = U.color;
  const rim = U.b.xyz;
  const ta = texture(cardTexture('arhat'), q);
  const tp = texture(cardTexture('phoenix'), q);
  const tg = texture(cardTexture('ghost'), q);
  const base012 = select(which.greaterThan(1.5), tg, mix(ta, tp, step(0.5, which)));
  const ti = texture(cardTexture('infant'), q);
  const t = select(which.greaterThan(4.5), ti, base012);
  const tier = t.r;
  const acc = t.g;
  const accent012 = select(
    which.greaterThan(1.5),
    vec3(0.62, 0.92, 1.0),
    mix(vec3(1.0, 0.78, 0.3), vec3(0.92, 0.2, 0.1), step(0.5, which)),
  );
  const accent = select(which.greaterThan(4.5), vec3(0.5, 0.95, 0.75), accent012);
  const base = ramp3(tier, body.mul(body).mul(0.42), body, rim, 0.3, 0.72, 0.05);
  const accCol = ramp3(tier, accent.mul(0.35), accent, mix(accent, vec3(1, 1, 1), 0.35), 0.3, 0.72, 0.05);
  const lit = mix(base, accCol, acc);
  // `uv.y` của PlaneGeometry: 0 ở đáy, 1 ở đỉnh, nên q.y chính là độ cao tính từ đáy thẻ.
  const fromBottom = q.y;
  const reveal = one.sub(smoothstep(reveal0.sub(0.08), reveal0, fromBottom));
  const n = vnoise(q.mul(vec2(9, 12)).add(seed.mul(7)));
  const e = n.mul(0.7).add(fromBottom.mul(0.3));
  const alive = dissolve(e, erode, 0.07);
  const edge = one.sub(smoothstep(erode, erode.add(0.1), e)).mul(step(0.02, erode));
  // Pháp tướng Hóa Thần (thẻ 3, 4): `fxK` là giờ (giây), gợn sóng sáng chạy từ chân lên đầu (RFX-1).
  const isPhantom = step(4.5, which);
  const wave = sin(q.y.mul(34).sub(U.k.mul(7)))
    .mul(0.5)
    .add(0.5);
  const waveMul = one.sub(isPhantom.mul(0.22)).add(isPhantom.mul(wave).mul(0.22));
  const color = min(lit.add(rim.mul(edge.mul(0.9))).add(rim.mul(isPhantom.mul(wave).mul(0.16))), U.maxHdr);
  return { color, opacity: U.opacity.mul(t.a).mul(reveal).mul(alive).mul(waveMul) };
}

/**
 * `art` (RFX-1 v3): tranh pháp tướng vẽ tay (Kiếm long ngọc / Huyền vũ / Chu tước, `public/hoa-truc/`) lấy từ một atlas, quay mặt về camera.
 * `fxA` = (mọc từ dưới lên 0..1,2, -, seed, tranh 0|1|2), `fxB.xyz` = màu viền, `fxK` = giờ (giây). Mờ dần ở viền (vignette), gợn sóng sáng chạy
 * từ chân lên đầu, ánh viền theo độ trong (fresnel giả: nét mảnh sáng hơn), phát sáng nhẹ; màu gốc của tranh giữ nguyên.
 */
export function artNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  const idx = U.a.w;
  const reveal0 = U.a.x;
  const one = float(1);
  const t = texture(artAtlas(), vec2(q.x.add(idx).div(ART_COUNT), q.y));
  const p = q.sub(0.5).mul(2);
  const edge = one.sub(smoothstep(0.6, 1.0, max(abs(p.x), abs(p.y))));
  const wave = sin(q.y.mul(26).sub(U.k.mul(5)))
    .mul(0.5)
    .add(0.5);
  const thin = one.sub(smoothstep(0.35, 0.95, t.a));
  const rim = U.b.xyz;
  const lit = t.rgb
    .mul(U.color)
    .mul(float(0.88).add(wave.mul(0.3)))
    .add(rim.mul(wave.mul(0.1).add(thin.mul(0.35))));
  const color = min(lit.mul(1.12), U.maxHdr);
  const reveal = one.sub(smoothstep(reveal0.sub(0.12), reveal0, q.y));
  // Ngưỡng alpha: bỏ lớp sương alpha thấp của ảnh gốc (nếu không lớp bóng sẫm lộ thành hình chữ nhật).
  const alpha = smoothstep(0.1, 0.45, t.a);
  return { color, opacity: U.opacity.mul(alpha).mul(edge).mul(reveal) };
}
