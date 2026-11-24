import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  distance,
  dot,
  float,
  fwidth,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  select,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { N, RefField } from './field';

/**
 * Đất dưới cỏ: dựa trên painted-valley/src/lib/ground.js (MIT, © 2026 Patch; xem assets/LICENSES.md), dịch từng dòng sang TSL. Cảnh thử
 * cô lập: bỏ `tState`/`tFire` (không cắt, không cháy: standing = m.g, mown = 0, charred = 0). Đất tro/than/đốm lửa luôn nhân 0 nên bỏ.
 */

/** A square grid whose cells are 1 m near the middle and grow outwards, so one mesh reaches the horizon. */
function warpedGrid(inner = 80, outer = 60, growth = 1.06): THREE.BufferGeometry {
  const line = [0];
  for (let i = 1; i <= inner; i++) line.push(i);
  let step = 1;
  for (let i = 0; i < outer; i++) {
    step *= growth;
    line.push(line[line.length - 1]! + step);
  }
  const coords = [
    ...line
      .slice(1)
      .reverse()
      .map((v) => -v),
    ...line,
  ];
  const n = coords.length;
  const positions = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions[(i + j * n) * 3] = coords[i]!;
      positions[(i + j * n) * 3 + 2] = coords[j]!;
    }
  }
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = i + j * n;
      indices[k++] = a;
      indices[k++] = a + n;
      indices[k++] = a + 1;
      indices[k++] = a + 1;
      indices[k++] = a + n;
      indices[k++] = a + n + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export interface GroundTextures {
  soil: THREE.Texture;
  soilNormal: THREE.Texture;
  dirt: THREE.Texture;
  dirtNormal: THREE.Texture;
}

/** Plain soil and dirt, for a field made before its pictures have loaded or without any. */
export function flatTextures(): GroundTextures {
  const one = (r: number, g: number, b: number, srgb = false): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { soil: one(70, 48, 34, true), soilNormal: one(128, 128, 255), dirt: one(120, 100, 72, true), dirtNormal: one(128, 128, 255) };
}

/**
 * Màu đất đồng cỏ (phần fragment của ground.js, `farK` = meadow vẽ). Dùng chung cho cảnh thử (lưới `warpedGrid`) và cho địa hình của game
 * khi `?style=painted`. Trong `Fn` để `.toVar()` được phát theo thứ tự (xem skill tsl-shaders-vfx). `opts.m` thay ô bản đồ (dry, growth,
 * wet, flowers) và `opts.landNormal` thay pháp tuyến "thế đất" khi dữ liệu không đến từ texture của cánh đồng (game).
 */
export function groundColor(F: RefField, textures: GroundTextures, vWorld: N, vNormal: N, opts: { m?: N; landNormal?: N } = {}): N {
  return Fn(() => {
    let xz: N = vWorld.xz;
    xz = xz.toVar();
    let uvE: N = F.extentUv(xz);
    uvE = uvE.toVar();
    let m: N = opts.m ?? F.map(uvE, false);
    m = m.toVar();
    let dist: N = distance(vWorld, cameraPosition);
    dist = dist.toVar();

    // two sizes of the same soil, mixed by a slow noise, so no repeat shows
    let u1: N = xz.div(1.9);
    u1 = u1.toVar();
    let u2: N = vec2(xz.y, xz.x).div(5.7).add(0.37);
    u2 = u2.toVar();
    let blend: N = smoothstep(0.3, 0.7, F.noise(xz.div(11), false).a);
    blend = blend.toVar();
    let soil: N = mix(texture(textures.soil, u1).rgb, texture(textures.soil, u2).rgb, blend.mul(0.4).add(0.3)).mul(0.85);
    soil = soil.toVar();
    let bare: N = float(1).sub(smoothstep(0.12, 0.5, m.g.add(F.noise(xz.div(2.3), false).r.sub(0.5).mul(0.2))));
    bare = bare.toVar();
    let albedo: N = mix(soil, vec3(0.5, 0.43, 0.27).mul(F.strokes(xz.div(9), false).r.mul(0.3).add(0.85)), bare);
    albedo = albedo.toVar();
    let nt: N = mix(texture(textures.soilNormal, u1).xyz, texture(textures.dirtNormal, u1.mul(0.8)).xyz, bare)
      .mul(2)
      .sub(1);
    nt = nt.toVar();
    let detail: N = float(1).sub(smoothstep(12, 40, dist));
    detail = detail.toVar();
    let Nn: N = normalize(vNormal.add(vec3(nt.x, 0, nt.y).mul(0.2).mul(detail)));
    Nn = Nn.toVar();
    albedo = albedo.mul(mix(1.0, 0.5, m.b));
    albedo = albedo.toVar();

    // (tState: uncut, charred = 0)
    let standing: N = m.g;
    standing = standing.toVar();
    // under the grass the soil is mostly hidden: last year's dead blades lie on it, and low green things grow between
    let under: N = F.noise(xz.div(0.37), false).r;
    under = under.toVar();
    let low: N = F.noise(xz.div(1.1).add(0.6), false).b;
    low = low.toVar();
    let litter: N = mix(vec3(0.026, 0.085, 0.03), vec3(0.018, 0.06, 0.034), smoothstep(0.4, 0.62, low)).mul(under.mul(0.6).add(0.7));
    litter = litter.toVar();
    albedo = mix(albedo, litter, m.g.mul(float(1).sub(bare)));
    albedo = albedo.toVar();

    let cloud: N = F.cloudAt(xz, false);
    cloud = cloud.toVar();
    let shade: N = mix(1.0, 0.3, standing);
    shade = shade.toVar();
    let c: N = albedo.mul(
      F.uSunColor
        .mul(cloud)
        .mul(max(dot(Nn, F.uSunDir), 0))
        .mul(shade)
        .add(mix(F.uBounceColor, F.uSkyColor, Nn.y.mul(0.5).add(0.5)).mul(mix(1.0, 0.4, standing))),
    );
    c = c.toVar();

    // beyond the last blades the ground is the grass
    let farK: N = max(m.g, smoothstep(50, 200, dist).mul(0.88));
    farK = farK.toVar();
    {
      let gust: N = F.gustAt(xz, false);
      gust = gust.toVar();
      const U: N = F.uWind.z;
      let dry: N = smoothstep(0.3, 0.7, m.r).mul(float(1).sub(m.b.mul(0.5)));
      dry = dry.toVar();
      let rel: N = F.slopeRel(opts.landNormal ?? F.landNormal(xz, false));
      rel = rel.toVar();
      let g: N = F.meadowGreen(
        float(0.6)
          .add(gust.mul(0.1).mul(min(U.div(6), 1)))
          .add(rel.sub(0.5).mul(mix(0.6, 0.4, smoothstep(150, 450, dist)))),
      ).mul(mix(vec3(1), F.meadowTint(xz, false), float(0.5).mul(float(1).sub(smoothstep(40, 110, dist)))));
      g = g.toVar();
      g = mix(g, vec3(0.44, 0.47, 0.17), dry.mul(0.45));
      g = g.toVar();
      // seen from off, a meadow is not one green: darker tufts stand in it, and where flowers grow it is dusted with their colour
      let tuft: N = F.noise(xz.div(3.1), false)
        .g.mul(0.6)
        .add(F.noise(xz.div(0.83).add(0.2), false).r.mul(0.4));
      tuft = tuft.toVar();
      g = g.mul(
        mix(
          1.0,
          0.76,
          smoothstep(0.52, 0.62, tuft)
            .mul(smoothstep(9, 30, dist))
            .mul(float(1).sub(smoothstep(50, 130, dist))),
        ),
      );
      g = g.toVar();
      let drift: N = smoothstep(0.42, 0.7, F.noise(xz.div(23), false).g);
      drift = drift.toVar();
      let away: N = smoothstep(30, 110, dist);
      away = away.toVar();
      let dust: N = m.a
        .mul(drift.mul(0.84).add(0.16))
        .mul(smoothstep(0.5, 0.62, mix(F.noise(xz.div(0.6), false).a, float(0.54), away).add(drift.mul(0.2))));
      dust = dust.toVar();
      let kn: N = F.s(F.tex.tWhite, xz.div(7 * 256), false).r.mul(3.999);
      kn = kn.toVar();
      let heads: N = select(
        kn.lessThan(1),
        vec3(0.8, 0.8, 0.74),
        select(kn.lessThan(2), vec3(0.85, 0.62, 0.02), select(kn.lessThan(3), vec3(0.86, 0.34, 0.55), vec3(0.93, 0.88, 0.8))),
      );
      heads = heads.toVar();
      // (one kind to a drift near by; far off, where a drift is a few pixels, the colour of them all together)
      heads = mix(heads, vec3(0.88, 0.76, 0.7), smoothstep(60, 180, dist));
      heads = heads.toVar();
      g = mix(
        g,
        heads,
        dust
          .mul(0.5)
          .mul(smoothstep(20, 34, dist))
          .mul(float(1).sub(smoothstep(80, 170, dist))),
      );
      g = g.toVar();
      // past the meadow it is farmland, as it is painted
      let fl: N = F.floorAt(xz);
      fl = fl.toVar();
      g = mix(g, fl.rgb, fl.a);
      g = g.toVar();
      g = F.paintGround(g, xz, dist);
      g = g.toVar();
      let sx: N = F.strokeCoord(vWorld);
      sx = sx.toVar();
      g = F.landStrokes(g, xz, dist, sx, fwidth(sx));
      g = g.toVar();
      let sy: N = F.strokeCoord2(xz);
      sy = sy.toVar();
      g = F.landStrokes(g, xz, dist, sy, fwidth(sy));
      g = g.toVar();
      let hq: N = F.heroAngle(vWorld);
      hq = hq.toVar();
      g = F.heroPaint(g, vWorld, hq, fwidth(hq), dist);
      g = g.toVar();
      let lit: N = g.mul(F.meadowLight(cloud.mul(F.slopeSun(rel))));
      lit = lit.toVar();
      // nearer, between the blades that are drawn, it is the dim green under them
      c = mix(c, lit.mul(mix(0.78, 1.0, smoothstep(8, 60, dist))), farK);
      c = c.toVar();
    }
    return F.applyFog(c, vWorld);
  })();
}

export function createGround(F: RefField, textures: GroundTextures, { extentMin, texel }: { extentMin: [number, number]; texel: number }) {
  const uGroundOrigin = uniform(new THREE.Vector2());
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.fog = false;
  material.name = 'ref-ground';

  // vertex
  const xzV: N = uGroundOrigin.add(positionGeometry.xz);
  const hV: N = F.groundAt(xzV);
  const vNormal: N = normalize(
    vec3(
      F.groundAt(xzV.sub(vec2(1, 0))).sub(F.groundAt(xzV.add(vec2(1, 0)))),
      2,
      F.groundAt(xzV.sub(vec2(0, 1))).sub(F.groundAt(xzV.add(vec2(0, 1)))),
    ),
  ).toVarying();
  material.positionNode = vec3(xzV.x, hV, xzV.y);

  // fragment
  material.colorNode = groundColor(F, textures, positionWorld, vNormal);
  material.opacityNode = mix(1.0, 0.4, smoothstep(120, 200, distance(positionWorld, cameraPosition)));

  const mesh = new THREE.Mesh(warpedGrid(), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    /** Keeps the fine middle of the grid under the camera, its vertices on the height map's texel centres. */
    follow(x: number, z: number): void {
      uGroundOrigin.value.set(
        extentMin[0] + (Math.floor((x - extentMin[0]) / texel) + 0.5) * texel,
        extentMin[1] + (Math.floor((z - extentMin[1]) / texel) + 0.5) * texel,
      );
    },
  };
}
