import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  cos,
  cross,
  distance,
  dot,
  float,
  floor,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelPosition,
  normalize,
  positionGeometry,
  positionWorld,
  select,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  Fn,
  varyingProperty,
} from 'three/tsl';
import { cellRand } from './hash';
import { TAU, type N, type RefField } from './field';
import { mulberry } from './ref/textures';

/**
 * Lá cỏ: dựa trên painted-valley/src/lib/blades.js (MIT, © 2026 Patch; xem assets/LICENSES.md), dịch từng dòng sang TSL. Chỉ hai vòng
 * `mid` và `wide` (`near` và `far` không bao giờ có lá sống ở camera chéo cách 20 m: khoảng nhìn thấy 6,4–21,7 m tính theo mặt phẳng ngang
 * từ camera, `near` tắt ở 6 m, `far` mở từ 34 m). Cảnh thử cô lập: bỏ `tState` (không rạp, không cắt: bend = 0, cutH = 1 m),
 * `tFire`/`tGlow` (0), đẩy lá (6 vec4 rỗng).
 */

export interface Ring {
  name: string;
  cell: number;
  tile: number;
  tiles: number;
  rows: number;
  sub: number;
  fade: [number, number, number, number];
  width: number;
  tops: number;
}

/** cell: metres between blades. tile × tiles: the square of ground a ring covers. fade: in from, to; out from, to. */
export const RINGS: Ring[] = [
  { name: 'near', cell: 0.05, tile: 3, tiles: 6, rows: 8, sub: 1, fade: [-2, -1, 2.8, 6], width: 1, tops: 0 },
  { name: 'mid', cell: 0.09, tile: 7.2, tiles: 8, rows: 4, sub: 1, fade: [2.8, 6, 13, 21.6], width: 2.0, tops: 0.05 },
  { name: 'wide', cell: 0.2, tile: 16, tiles: 8, rows: 3, sub: 1, fade: [13, 21.6, 34, 48], width: 4.6, tops: 0.22 },
  { name: 'far', cell: 0.625, tile: 40, tiles: 8, rows: 3, sub: 3, fade: [34, 48, 96, 120], width: 10, tops: 0.4 },
];

function ringGeometry(ring: Ring, random: () => number): { geometry: THREE.InstancedBufferGeometry; count: number } {
  const { rows, sub, tile, cell } = ring;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < sub; b++) {
    const first = positions.length / 3;
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      positions.push(-1, t, b, 1, t, b);
      if (j < rows - 1) {
        const a = first + j * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
  }
  const n = Math.round(tile / cell);
  const cells = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      cells[(i + j * n) * 2] = i;
      cells[(i + j * n) * 2 + 1] = j;
    }
  }
  // shuffled, so drawing fewer instances thins the grass evenly
  for (let i = n * n - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    for (let c = 0; c < 2; c++) {
      const tmp = cells[i * 2 + c]!;
      cells[i * 2 + c] = cells[k * 2 + c]!;
      cells[k * 2 + c] = tmp;
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geometry.instanceCount = n * n;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(tile / 2, 0.3, tile / 2), tile * 0.75 + 2.5);
  return { geometry, count: n * n };
}

/** where a seed stalk's rows sit: most of them in the head. */
function stalkRow(t: N, rows: number): N {
  const k = t.mul(rows - 1);
  if (rows > 6.5) {
    const r = [0.0, 0.3, 0.55, 0.74, 0.8, 0.87, 0.94, 1.0];
    let out: N = float(r[7]!);
    for (let i = 6; i >= 0; i--) out = select(k.lessThan(i + 0.5), float(r[i]!), out);
    return out;
  }
  if (rows > 3.5) {
    const r = [0.0, 0.76, 0.88, 1.0];
    let out: N = float(r[3]!);
    for (let i = 2; i >= 0; i--) out = select(k.lessThan(i + 0.5), float(r[i]!), out);
    return out;
  }
  return t;
}

export interface BladeOpts {
  height: number;
  seed: number;
  density: number;
}

export function createBlades(F: RefField, { height, seed, density }: BladeOpts, heightAt: (x: number, z: number) => number) {
  const group = new THREE.Group();
  const random = mulberry(seed * 977 + 3);
  const rings = RINGS.map((ring, index) => {
    const { geometry, count } = ringGeometry(ring, random);
    const material = bladeMaterial(F, ring, index, seed, height, geometry);
    const tiles: { mesh: THREE.Mesh; i: number; j: number }[] = [];
    for (let j = 0; j < ring.tiles; j++) {
      for (let i = 0; i < ring.tiles; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        tiles.push({ mesh, i: i - ring.tiles / 2, j: j - ring.tiles / 2 });
        if (ring.name === 'mid' || ring.name === 'wide') group.add(mesh);
      }
    }
    return { ring, geometry, material, tiles, count, at: [NaN, NaN] as [number, number] };
  });
  return {
    group,
    rings,
    /** Fewer blades, evenly: 1 is all of them. */
    setDensity(d: number): void {
      for (const r of rings) r.geometry.instanceCount = Math.max(1, Math.round(r.count * Math.min(1, Math.max(0.05, d))));
    },
    /** Keeps each ring's tiles under the camera. Only does anything when the camera crosses into a new tile. */
    follow(x: number, z: number): void {
      for (const r of rings) {
        const sx = Math.floor(x / r.ring.tile);
        const sz = Math.floor(z / r.ring.tile);
        if (sx === r.at[0] && sz === r.at[1]) continue;
        r.at = [sx, sz];
        for (const tile of r.tiles) {
          const ox = (sx + tile.i) * r.ring.tile;
          const oz = (sz + tile.j) * r.ring.tile;
          tile.mesh.position.set(ox, heightAt(ox + r.ring.tile / 2, oz + r.ring.tile / 2), oz);
          tile.mesh.updateMatrix();
          tile.mesh.updateMatrixWorld(true);
        }
      }
    },
    init(): void {
      this.setDensity(density);
    },
  };
}

function bladeMaterial(
  F: RefField,
  ring: Ring,
  index: number,
  seed: number,
  uHeight: number,
  geometry: THREE.InstancedBufferGeometry,
): THREE.MeshBasicNodeMaterial {
  const uSalt = index * 101 + seed;
  const uCell = ring.cell;
  const uWidth = ring.width;
  const uRows = ring.rows;
  const uTops = ring.tops;
  const aCell = instancedBufferAttribute(geometry.getAttribute('aCell') as THREE.InstancedBufferAttribute);

  // Mọi phép tính vertex nằm trong Fn: `.toVar()` ngoài Fn chỉ được phát ra ở lần dùng đầu tiên (có thể nằm trong một nhánh if của
  // select), khiến biến chưa được tính ở nhánh kia. Trong Fn chúng được phát theo đúng thứ tự. Kết quả sang fragment qua varyingProperty.
  const pAlbedo = varyingProperty('vec3');
  const pLightX = varyingProperty('float');
  const pUp = varyingProperty('float');
  const pLive = varyingProperty('float');
  const pKeep = varyingProperty('float');
  const pGrowth = varyingProperty('float');
  const vertexMain = Fn(() => {
    const side: N = positionGeometry.x;
    const t: N = positionGeometry.y;
    const sub: N = positionGeometry.z;
    let origin: N = modelPosition.xz;
    origin = origin.toVar();
    let cell: N = floor(origin.div(uCell).add(0.5)).add(aCell);
    cell = cell.toVar();
    let r: N = cellRand(cell, float(uSalt).add(sub.mul(7)));
    r = r.toVar();
    let q: N = cellRand(cell, float(uSalt + 31).add(sub.mul(7)));
    q = q.toVar();
    let xz: N = cell.add(r.xy).mul(uCell);
    xz = xz.toVar();
    let dist: N = distance(xz, cameraPosition.xz);
    dist = dist.toVar();
    let keep: N = (ring.fade[1] < 0 ? float(1) : smoothstep(ring.fade[0], ring.fade[1], dist)).mul(
      float(1).sub(smoothstep(ring.fade[2], ring.fade[3], dist)),
    );
    keep = keep.toVar();
    let live: N = smoothstep(0, 0.18, keep.sub(q.x.mul(0.82)));
    live = live.toVar();
    let m: N = F.map(F.extentUv(xz), true);
    m = m.toVar();
    let growth: N = m.g;
    growth = growth.toVar();
    live = live.mul(smoothstep(0, 0.22, growth.sub(q.y.mul(0.78))));
    live = live.toVar();
    // (the source moves a dead blade out of the clip volume; here it collapses to its root: the same, nothing drawn)
    // ?dbg=bladelive: vẽ mọi lá (dày gấp 8) tô màu (live, keep, growth) tính Ở VERTEX, để so với bản tính ở fragment
    const dbgMode = new URLSearchParams(location.search).get('dbg') ?? '';
    // bladelive: màu live/keep/growth; bladepos: bỏ uốn/nghiêng, dải đứng cố định tại gốc; nostalk/allstalk: ép nhánh lá thường / lá hạt
    const DBG = ['bladelive', 'bladepos', 'nostalk', 'allstalk'].includes(dbgMode);
    let alive: N = DBG ? float(1) : step(0.0000001, live);
    alive = alive.toVar();

    // tState: 128 = no bend; cut height 255 = uncut; tFire: 0
    const stB = float(1);
    let cutH: N = stB.add(q.y.sub(0.5).mul(0.024));
    cutH = cutH.toVar();
    let charred: N = smoothstep(0.12, 0.7, q.x.sub(0.5).mul(0.3));
    charred = charred.toVar();
    const flat_ = float(0);

    // neighbours share a look: a clump is one texel of white noise, its edge broken up blade by blade
    let cl: N = F.s(F.tex.tWhite, xz.add(r.zw.sub(0.5).mul(0.34)).div(0.44 * 256), true);
    cl = cl.toVar();
    let dry: N = smoothstep(0.3, 0.7, m.r.add(q.z.sub(0.5).mul(0.5)).add(cl.g.sub(0.5).mul(0.26)));
    dry = dry.toVar();
    let stalk: N = uRows > 3.5 ? q.w.lessThan(m.r.mul(0.045).add(0.012)) : float(0).greaterThan(1);
    if (dbgMode === 'nostalk') stalk = float(0).greaterThan(1);
    if (dbgMode === 'allstalk') stalk = float(1).greaterThan(0);
    stalk = stalk.toVar();
    let h: N = float(uHeight)
      .mul(mix(0.5, 1.0, cl.r))
      .mul(mix(0.7, 1.22, r.z))
      .mul(mix(0.7, 1.0, growth))
      .mul(float(1).add(m.b.mul(0.7)))
      .mul(mix(0.55, 1.0, live));
    h = h.toVar();
    h = select(stalk, h.mul(1.5), h);
    h = h.toVar();
    // (broad patches: long, deeper grass in some, short sunlit grass in others)
    let patchT: N = F.strokes(vec2(xz.y, xz.x).div(27).add(0.37), true)
      .r.sub(0.5)
      .mul(0.7)
      .add(F.strokes(xz.div(95).add(0.11), true).r.sub(0.5).mul(0.9));
    patchT = patchT.toVar();
    h = h.mul(F.tallAt(xz, true)).mul(mix(1.32, 0.78, clamp(float(0.5).add(patchT.mul(1.5)), 0, 1)));
    h = h.toVar();
    h = h.mul(1 + 0.3 * uTops);
    h = h.toVar();
    h = h.mul(float(1).sub(charred.mul(0.8)));
    h = h.toVar();
    h = h.mul(alive);
    h = h.toVar();

    let gy: N = F.groundAt(xz);
    gy = gy.toVar();
    let base: N = vec3(xz.x, gy, xz.y);
    base = base.toVar();

    // which way it leans, and how far, as an angle from upright
    let yaw: N = cl.b.mul(0.45).add(r.w.mul(0.55)).mul(TAU);
    yaw = yaw.toVar();
    let L: N = vec2(cos(yaw), sin(yaw))
      .mul(mix(0.22, 0.85, q.z))
      .mul(select(stalk, float(0.3), float(1)));
    L = L.toVar();
    let gust: N = F.gustAt(xz, true);
    gust = gust.toVar();
    let U: N = F.uWind.z;
    U = U.toVar();
    let flutter: N = sin(r.w.mul(40).add(F.uTime.mul(r.z.mul(4).add(5)))).mul(U.mul(0.013).add(0.028));
    flutter = flutter.toVar();
    L = L.add(F.uWind.xy.mul(U.mul(mix(0.028, 0.105, gust)).add(flutter.mul(0.6)))).add(
      vec2(F.uWind.y.negate(), F.uWind.x).mul(flutter.mul(0.5)),
    );
    L = L.toVar();
    L = L.add(vec2(sin(F.uTime.mul(0.7).add(r.x.mul(30))), cos(F.uTime.mul(0.6).add(r.y.mul(30)))).mul(0.03));
    L = L.toVar();
    // (no pushers, no bend)
    L = L.mul(float(1).add(charred.mul(0.9)));
    L = L.toVar();
    let lean: N = length(L);
    lean = lean.toVar();
    let dir: N = L.div(max(lean, 1e-4));
    dir = dir.toVar();
    lean = min(lean, 1.5);
    lean = lean.toVar();
    let theta0: N = lean.mul(mix(0.25, 0.82, flat_));
    theta0 = theta0.toVar();
    let A: N = lean.sub(theta0);
    A = A.toVar();
    let Asafe: N = max(A, 1e-3);
    Asafe = Asafe.toVar();
    let aBig: N = A.greaterThan(1e-3);
    aBig = aBig.toVar();

    // cut: the blade stops where the edge went through it
    let top: N = select(aBig, h.mul(sin(theta0.add(A)).sub(sin(theta0))).div(Asafe), h.mul(cos(theta0)));
    top = top.toVar();
    let sCut: N = clamp(cutH.div(max(top, 1e-3)), 0, 1);
    sCut = sCut.toVar();
    let isCut: N = sCut.lessThan(0.995);
    isCut = isCut.toVar();
    let sBase: N = uRows > 3.5 ? select(stalk, stalkRow(t, uRows), t) : t;
    sBase = sBase.toVar();
    let s: N = sBase.mul(sCut);
    s = s.toVar();

    const wMul = uWidth < 1.5 ? 2.1 : uWidth < 3.0 ? 1.45 : 1.0;
    let w: N = float(uWidth * 0.0115 * wMul).mul(mix(0.72, 1.3, r.x));
    w = w.toVar();
    let wStalk: N = select(s.lessThan(0.78), float(0.22), sin(s.sub(0.78).mul(3.14159).div(0.22)).mul(0.62).add(0.22));
    wStalk = wStalk.toVar();
    let wBlade: N = min(float(1).sub(s).mul(3.2), 1).mul(float(0.72).add(float(1).sub(s).mul(0.28)));
    wBlade = wBlade.toVar();
    w = w.mul(select(stalk, wStalk, wBlade));
    w = w.toVar();
    w = w.mul(float(1).sub(charred.mul(0.45))).mul(mix(0.5, 1.0, live));
    w = w.toVar();
    // stubble is the thick foot of the blade
    w = select(isCut, w.mul(float(1).add(float(1).sub(sCut).mul(0.7))), w);
    w = w.toVar();
    w = w.mul(alive).mul(DBG ? 8 : 1);
    w = w.toVar();

    let phi: N = theta0.add(A.mul(s));
    phi = phi.toVar();
    let along: N = select(aBig, h.mul(cos(theta0).sub(cos(phi))).div(Asafe), h.mul(s).mul(sin(theta0)));
    along = along.toVar();
    let rise: N = select(aBig, h.mul(sin(phi).sub(sin(theta0))).div(Asafe), h.mul(s).mul(cos(theta0)));
    rise = rise.toVar();
    let tangent: N = vec3(dir.x.mul(sin(phi)), cos(phi), dir.y.mul(sin(phi)));
    tangent = tangent.toVar();
    let across0: N = vec3(dir.y.negate(), 0, dir.x);
    across0 = across0.toVar();
    // turned partly to face the camera, so a blade seen edge on doesn't vanish
    let toCam: N = normalize(cameraPosition.sub(base));
    toCam = toCam.toVar();
    let facing0: N = cross(tangent, toCam);
    facing0 = facing0.toVar();
    let fl: N = length(facing0);
    fl = fl.toVar();
    let facing: N = facing0.div(max(fl, 1e-3));
    facing = facing.toVar();
    let facingS: N = facing.mul(select(dot(facing, across0).lessThan(0), float(-1), float(1)));
    facingS = facingS.toVar();
    let across: N = select(fl.greaterThan(1e-3), normalize(mix(across0, facingS, 0.68)), across0);
    across = across.toVar();
    let world: N = base.add(vec3(dir.x.mul(along), rise, dir.y.mul(along))).add(across.mul(side).mul(w).mul(0.5));
    world = world.toVar();

    let open: N = max(float(1).sub(smoothstep(0.1, 0.4, stB)), charred);
    open = open.toVar();
    let up: N = mix(clamp(rise.div(uHeight * 0.85), 0, 1), float(0.8), open.mul(0.8));
    up = up.toVar();
    // a tuft stands for many blades, and of those you mostly see the tops
    let sc: N = mix(s, float(1), uTops);
    sc = sc.toVar();
    up = max(up, float(uTops * 1.2));
    up = up.toVar();
    // each blade is a stroke of the brush and takes the tone of the dab it stands in: light dabs yellower, dark bluer
    let dab: N = F.strokes(xz.div(6), true).r.sub(0.5).mul(0.5).add(patchT);
    dab = dab.toVar();
    // only some blades are drawn: one in a dozen is a darker stroke, one in fifteen catches the light
    let tone: N = float(0.58)
      .add(dab.mul(0.7))
      .add(cl.a.sub(0.5).mul(0.08))
      .add(sc.sub(0.6).mul(0.1))
      .add(gust.mul(0.1).mul(min(U.div(6), 1)));
    tone = tone.toVar();
    tone = tone.add(select(q.z.lessThan(0.045), float(-0.26), select(q.z.greaterThan(0.965), float(0.18), float(0))));
    tone = tone.toVar();
    let rel: N = F.slopeRel(F.landNormal(xz, true));
    rel = rel.toVar();
    tone = tone.add(rel.sub(0.5).mul(0.6));
    tone = tone.toVar();
    // the grass nearest you is the picture's foreground, and a tone deeper
    tone = tone.sub(
      float(1)
        .sub(smoothstep(1.5, 9, dist))
        .mul(0.2),
    );
    tone = tone.toVar();
    let col: N = F.meadowGreen(tone).mul(mix(vec3(1), F.meadowTint(xz, true), 0.5));
    col = col.toVar();
    col = mix(col, vec3(0.44, 0.47, 0.17), dry.mul(0.45));
    col = col.toVar();
    if (uRows > 3.5)
      col = select(stalk, mix(col, mix(vec3(0.46, 0.52, 0.18), vec3(0.4, 0.46, 0.2), step(0.72, cl.g)), smoothstep(0.75, 0.82, s)), col);
    col = col.toVar();
    // far off, a few tufts carry the colour of the flowers among them
    if (uTops > 0.35) {
      col = select(
        q.w.lessThan(m.a.mul(0.1)),
        mix(col, mix(vec3(0.75, 0.72, 0.6), vec3(0.7, 0.5, 0.05), step(0.5, q.z)), smoothstep(0.4, 1.0, s)),
        col,
      );
      col = col.toVar();
    }
    col = select(isCut, mix(col, col.mul(1.35).add(vec3(0.025, 0.028, 0.008)), smoothstep(0.7, 1.0, t).mul(0.7)), col);
    col = col.toVar();
    col = mix(col, vec3(0.011, 0.01, 0.009), charred);
    col = col.toVar();
    pAlbedo.assign(col);
    // a low sun lights the tall clumps and leaves the short ones behind them in shade
    let among: N = mix(mix(0.45, 1.0, smoothstep(0.15, 0.75, cl.r)), float(1), clamp(F.uSunDir.y.mul(2.5), 0, 1));
    among = among.toVar();
    pLightX.assign(
      F.cloudAt(xz, true)
        .mul(mix(among, float(1), open))
        .mul(F.slopeSun(rel)),
    );
    pUp.assign(up);
    pLive.assign(live);
    pKeep.assign(keep);
    pGrowth.assign(growth);
    return dbgMode === 'bladepos' ? base.add(vec3(side.mul(0.3), t.mul(0.8), 0)) : world;
  });

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.fog = false;
  material.name = `ref-blades-${ring.name}`;
  material.positionNode = vertexMain().sub(modelPosition);
  // fragment: c = vAlbedo * meadowLight(vLight.x) * mix(0.84, 1.0, vMisc.y), then the haze (no fire: it is 0 here)
  const c: N = pAlbedo.mul(F.meadowLight(pLightX)).mul(mix(0.84, 1.0, pUp));
  material.colorNode = DBG ? vec3(pLive, pKeep, pGrowth) : F.applyFog(c, positionWorld);
  return material;
}
