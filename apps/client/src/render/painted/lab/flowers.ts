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
import { paintedNight } from '../frame';
import { themeU } from '../theme';
import { TAU, type N, type RefField } from './field';

/**
 * Hoa: dựa trên painted-valley/src/lib/flowers.js (MIT, © 2026 Patch; xem assets/LICENSES.md), dịch từng dòng sang TSL. Cảnh thử cô lập:
 * bỏ `tState`/`tFire` (không giẫm, không cắt, không cháy: bend = 0, cutH = 1 m, charred = 0 → `sCut` giữ nguyên công thức).
 */
export const FLOWER_RING = { cell: 0.4, tile: 12, tiles: 6, fade: [27, 35] as [number, number] };
const PETALS = 8;

function flowerGeometry(subs = 2): THREE.InstancedBufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let sub = 0; sub < subs; sub++) {
    const z = sub * 16;
    // the stem: a strip of four rows
    let first = positions.length / 3;
    for (let j = 0; j < 4; j++) {
      positions.push(-1, j / 3, z, 1, j / 3, z);
      if (j < 3) indices.push(first + j * 2, first + j * 2 + 1, first + j * 2 + 3, first + j * 2, first + j * 2 + 3, first + j * 2 + 2);
    }
    // the petals: foot, two shoulders, two further out, the tip
    for (let k = 0; k < PETALS; k++) {
      first = positions.length / 3;
      const part = z + 1 + k;
      positions.push(0, 0, part, -1, 0.4, part, 1, 0.4, part, -1, 0.75, part, 1, 0.75, part, 0, 1, part);
      indices.push(
        first,
        first + 2,
        first + 1,
        first + 1,
        first + 2,
        first + 4,
        first + 1,
        first + 4,
        first + 3,
        first + 3,
        first + 4,
        first + 5,
      );
    }
    // the middle: a six-sided disc
    first = positions.length / 3;
    positions.push(0, 0, z + 9);
    for (let k = 0; k < 6; k++) positions.push(Math.cos((k / 6) * Math.PI * 2), Math.sin((k / 6) * Math.PI * 2), z + 9);
    for (let k = 0; k < 6; k++) indices.push(first, first + 1 + k, first + 1 + ((k + 1) % 6));
  }
  const n = Math.round(FLOWER_RING.tile / FLOWER_RING.cell);
  const cells = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      cells[(i + j * n) * 2] = i;
      cells[(i + j * n) * 2 + 1] = j;
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geometry.instanceCount = n * n;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(FLOWER_RING.tile / 2, 0.3, FLOWER_RING.tile / 2),
    FLOWER_RING.tile * 0.75 + 2.5,
  );
  return geometry;
}

export function createFlowers(F: RefField, { height, seed }: { height: number; seed: number }, heightAt: (x: number, z: number) => number) {
  const group = new THREE.Group();
  const geometry = flowerGeometry();
  const material = flowerMaterial(F, geometry, height, 400 + seed);
  const tiles: { mesh: THREE.Mesh; i: number; j: number }[] = [];
  for (let j = 0; j < FLOWER_RING.tiles; j++) {
    for (let i = 0; i < FLOWER_RING.tiles; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      tiles.push({ mesh, i: i - FLOWER_RING.tiles / 2, j: j - FLOWER_RING.tiles / 2 });
      group.add(mesh);
    }
  }
  let at: [number, number] = [NaN, NaN];
  return {
    group,
    /** Giải phóng geometry và material (đổi level tạo lại cả bộ hoa). */
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
    follow(x: number, z: number): void {
      const sx = Math.floor(x / FLOWER_RING.tile);
      const sz = Math.floor(z / FLOWER_RING.tile);
      if (sx === at[0] && sz === at[1]) return;
      at = [sx, sz];
      for (const tile of tiles) {
        const ox = (sx + tile.i) * FLOWER_RING.tile;
        const oz = (sz + tile.j) * FLOWER_RING.tile;
        tile.mesh.position.set(ox, heightAt(ox + FLOWER_RING.tile / 2, oz + FLOWER_RING.tile / 2), oz);
        tile.mesh.updateMatrix();
        tile.mesh.updateMatrixWorld(true);
      }
    },
  };
}

function flowerMaterial(F: RefField, geometry: THREE.InstancedBufferGeometry, uHeight: number, uSalt: number): THREE.MeshBasicNodeMaterial {
  const aCell = instancedBufferAttribute(geometry.getAttribute('aCell') as THREE.InstancedBufferAttribute);
  // xem ghi chú ở blades.ts: dựng trong Fn để `.toVar()` được phát theo thứ tự, kết quả sang fragment qua varyingProperty
  const pAlbedo = varyingProperty('vec3');
  const pNormal = varyingProperty('vec3');
  const pLightX = varyingProperty('float');
  const pLightZ = varyingProperty('float');
  const vertexMain = Fn(() => {
    const position: N = positionGeometry;
    let part: N = position.z;
    part = part.toVar(); // 0 stem, 1..8 a petal, 9 the middle
    let sub: N = floor(part.div(16));
    sub = sub.toVar();
    part = part.sub(sub.mul(16));
    let origin: N = modelPosition.xz;
    origin = origin.toVar();
    let cell: N = floor(origin.div(FLOWER_RING.cell).add(0.5)).add(aCell);
    cell = cell.toVar();
    let r: N = cellRand(cell, float(uSalt).add(sub.mul(5)));
    r = r.toVar();
    let q: N = cellRand(cell, float(uSalt + 53).add(sub.mul(5)));
    q = q.toVar();
    let xz: N = cell.add(r.xy).mul(FLOWER_RING.cell);
    xz = xz.toVar();
    let dist: N = distance(xz, cameraPosition.xz);
    dist = dist.toVar();
    let m: N = F.map(F.extentUv(xz), true);
    m = m.toVar();
    // they grow in drifts
    let drift: N = smoothstep(0.42, 0.7, F.noise(xz.div(23), true).g);
    drift = drift.toVar();
    let chance: N = m.a.mul(drift.mul(0.84).add(0.16)).mul(step(0.5, m.g));
    chance = chance.toVar();
    let live: N = step(q.x, chance).mul(float(1).sub(smoothstep(FLOWER_RING.fade[0], FLOWER_RING.fade[1], dist.add(q.y.mul(3)))));
    live = live.toVar();
    let alive: N = step(0.0000001, live);
    alive = alive.toVar();

    // tState: no bend, cutH = 1 m; tFire: 0
    const stB = float(1);
    const charred = float(0);
    const flat_ = float(0);

    // one kind to a drift, with a few strays
    let kindN: N = F.s(F.tex.tWhite, xz.div(7 * 256), true).r;
    kindN = kindN.toVar();
    kindN = select(q.z.greaterThan(0.8), q.w, kindN);
    let kind: N = floor(kindN.mul(3.999));
    kind = kind.toVar();
    let petal: N = vec3(0.8, 0.8, 0.74);
    let middle: N = vec3(0.75, 0.5, 0.03);
    let count: N = float(8);
    let pl: N = float(0.024);
    let pw: N = float(0.0075);
    let cup: N = float(0.12);
    let mid: N = float(0.0095);
    let tall: N = float(1.0);
    const set = (
      k: number,
      p: number[],
      mi: number[],
      c: number,
      plv: number,
      pwv: number,
      cupv: number,
      midv: number,
      tallv: number,
    ): void => {
      const on: N = kind.equal(k);
      petal = select(on, vec3(p[0]!, p[1]!, p[2]!), petal);
      middle = select(on, vec3(mi[0]!, mi[1]!, mi[2]!), middle);
      count = select(on, float(c), count);
      pl = select(on, float(plv), pl);
      pw = select(on, float(pwv), pw);
      cup = select(on, float(cupv), cup);
      mid = select(on, float(midv), mid);
      tall = select(on, float(tallv), tall);
    };
    set(1, [0.85, 0.62, 0.02], [0.6, 0.45, 0.02], 5, 0.012, 0.011, 0.6, 0.004, 0.85);
    set(2, [0.86, 0.34, 0.55], [0.7, 0.5, 0.08], 8, 0.019, 0.005, 0.55, 0.007, 1.1);
    set(3, [0.93, 0.88, 0.8], [0.8, 0.55, 0.06], 4, 0.03, 0.03, 0.75, 0.006, 1.05);
    let size: N = mix(2.0, 2.7, r.z);
    size = size.toVar();

    let gy: N = F.groundAt(xz);
    gy = gy.toVar();
    let h: N = float(uHeight)
      .mul(tall)
      .mul(mix(0.98, 1.32, r.w))
      .mul(float(1).sub(charred.mul(0.7)))
      .mul(F.tallAt(xz, true));
    h = h.toVar();
    let yaw: N = q.w.mul(TAU);
    yaw = yaw.toVar();
    let L: N = vec2(cos(yaw), sin(yaw)).mul(0.18);
    L = L.toVar();
    let gust: N = F.gustAt(xz, true);
    gust = gust.toVar();
    let U: N = F.uWind.z;
    U = U.toVar();
    let nod: N = sin(r.w.mul(40).add(F.uTime.mul(r.z.mul(2).add(2.4)))).mul(U.mul(0.012).add(0.03));
    nod = nod.toVar();
    L = L.add(F.uWind.xy.mul(U.mul(mix(0.02, 0.07, gust)).add(nod)));
    // (no pushers, no bend)
    L = L.mul(float(1).sub(flat_.mul(0.8)));
    let lean0: N = length(L);
    lean0 = lean0.toVar();
    let dir: N = L.div(max(lean0, 1e-4));
    dir = dir.toVar();
    let lean: N = min(lean0, 1.5);
    lean = lean.toVar();
    let theta0: N = lean.mul(mix(0.3, 0.85, flat_));
    theta0 = theta0.toVar();
    let A: N = lean.sub(theta0);
    A = A.toVar();
    let Asafe: N = max(A, 1e-3);
    Asafe = Asafe.toVar();
    let aBig: N = A.greaterThan(1e-3);
    aBig = aBig.toVar();
    let top: N = select(aBig, h.mul(sin(theta0.add(A)).sub(sin(theta0))).div(Asafe), h.mul(cos(theta0)));
    top = top.toVar();
    let sCut: N = clamp(stB.div(max(top, 1e-3)), 0, 1);
    sCut = sCut.toVar();
    let headless: N = sCut.lessThan(0.97).or(charred.greaterThan(0.5));
    headless = headless.toVar();

    let s: N = select(part.lessThan(0.5), position.y, float(1)).mul(sCut);
    s = s.toVar();
    let phi: N = theta0.add(A.mul(s));
    phi = phi.toVar();
    let along: N = select(aBig, h.mul(cos(theta0).sub(cos(phi))).div(Asafe), h.mul(s).mul(sin(theta0)));
    along = along.toVar();
    let rise: N = select(aBig, h.mul(sin(phi).sub(sin(theta0))).div(Asafe), h.mul(s).mul(cos(theta0)));
    rise = rise.toVar();
    let tangent: N = vec3(dir.x.mul(sin(phi)), cos(phi), dir.y.mul(sin(phi)));
    tangent = tangent.toVar();
    let at: N = vec3(xz.x.add(dir.x.mul(along)), gy.add(rise), xz.y.add(dir.y.mul(along)));
    at = at.toVar();

    // stem
    let acrossS: N = normalize(cross(tangent, cameraPosition.sub(at)));
    acrossS = acrossS.toVar();
    let worldStem: N = at.add(acrossS.mul(position.x).mul(0.0016));
    worldStem = worldStem.toVar();
    let NStem: N = cross(acrossS, tangent);
    NStem = NStem.toVar();
    let colStem: N = mix(vec3(0.16, 0.4, 0.1), vec3(0.24, 0.52, 0.13), s);
    colStem = colStem.toVar();

    // the head looks up and a little towards the sun
    let axis: N = normalize(
      tangent
        .mul(0.6)
        .add(vec3(0, 0.5, 0))
        .add(F.uSunDir.mul(0.25)),
    );
    axis = axis.toVar();
    let u: N = normalize(cross(axis, vec3(0.31, 0, 0.95)));
    u = u.toVar();
    let v: N = cross(axis, u);
    v = v.toVar();
    // the middle
    let worldMid: N = at.add(u.mul(position.x).add(v.mul(position.y)).mul(mid).mul(size)).add(axis.mul(0.002));
    worldMid = worldMid.toVar();
    let NMid: N = normalize(axis.add(u.mul(position.x).add(v.mul(position.y)).mul(0.6)));
    NMid = NMid.toVar();
    // a petal
    let k: N = part.sub(1);
    k = k.toVar();
    let a: N = k.add(r.x).div(count).mul(TAU);
    a = a.toVar();
    let out_: N = cos(a).mul(u).add(sin(a).mul(v));
    out_ = out_.toVar();
    let sideV: N = sin(a).negate().mul(u).add(cos(a).mul(v));
    sideV = sideV.toVar();
    let t: N = position.y;
    t = t.toVar();
    let wide: N = sin(clamp(t.mul(0.85).add(0.12), 0, 1).mul(3.14159));
    wide = wide.toVar();
    let droop: N = cup.sub(t.mul(t).mul(float(1).sub(cup)).mul(0.5));
    droop = droop.toVar();
    let worldPetal: N = at
      .add(
        out_
          .mul(cos(droop))
          .add(axis.mul(sin(droop)))
          .mul(t)
          .mul(pl)
          .mul(size),
      )
      .add(sideV.mul(position.x).mul(pw).mul(size).mul(wide));
    worldPetal = select(k.greaterThanEqual(count), at, worldPetal);
    let NPetal: N = normalize(axis.mul(cos(droop)).sub(out_.mul(sin(droop))));
    NPetal = NPetal.toVar();
    let colPetal: N = petal.mul(mix(0.8, 1.05, t));
    colPetal = colPetal.toVar();

    let isStem: N = part.lessThan(0.5);
    isStem = isStem.toVar();
    let isMid: N = part.greaterThan(8.5);
    isMid = isMid.toVar();
    let world: N = select(isStem, worldStem, select(headless, at, select(isMid, worldMid, worldPetal)));
    const Nrm: N = select(isStem, NStem, select(headless, axis, select(isMid, NMid, NPetal)));
    let col: N = select(isStem, colStem, select(headless, vec3(0, 0, 0), select(isMid, middle, colPetal)));
    col = mix(col, vec3(0.011, 0.01, 0.009), charred);
    world = select(alive.greaterThan(0.5), world, at);

    pAlbedo.assign(col);
    pNormal.assign(Nrm);
    pLightX.assign(F.cloudAt(xz, true));
    pLightZ.assign(clamp(rise.div(uHeight * 0.85), 0, 1));
    return world;
  });

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.fog = false;
  material.name = 'ref-flowers';
  material.positionNode = vertexMain().sub(modelPosition);
  // fragment: petals are matt and a little see-through: lit like a leaf, but they never dazzle
  const V: N = normalize(cameraPosition.sub(positionWorld));
  let Nn: N = normalize(pNormal.add(vec3(0, 1e-4, 0)));
  Nn = select(dot(Nn, V).lessThan(0), Nn.negate(), Nn);
  const c: N = min(F.leafLight(pAlbedo, Nn, V, pLightZ, float(0.04), pLightX).mul(0.62), vec3(1.25, 1.25, 1.25));
  // đêm (theme.nightSplit): cánh hoa tối xuống để không thành chấm trắng như sao trên nền đất
  const cN: N = c.mul(float(1).sub(paintedNight.mul(themeU.nightSplit).mul(0.5)));
  material.colorNode = F.applyFog(cN, positionWorld);
  void dot;
  return material;
}
