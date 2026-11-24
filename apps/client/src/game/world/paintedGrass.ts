import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  cameraViewMatrix,
  clamp,
  cos,
  cross,
  distance,
  dot,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  int,
  length,
  max,
  mix,
  mod,
  modelPosition,
  normalize,
  positionGeometry,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uniformArray,
  vec2,
  vec3,
} from 'three/tsl';
import { baseOf } from '../../base/quality';
import { heightAt } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';
import { getBrushTexture } from '../../render/painted/brush';
import { hash42, meadowGreen, meadowTint, slopeRel, tallAt, type Node } from '../../render/painted/meadow';
import { skyParams } from '../../render/sky';
import { paintedGroundParams } from '../../render/painted/ground';
import { grassBlockedByCollider, grassDensityAt, GRASS_PUSH_SLOTS, setGrassColliders, type GrassLayer, type Pusher } from './grass';

/**
 * Cỏ lá mảnh của Họa Cảnh (`?style=painted`): port SÁT từ painted-valley (src/lib/blades.js + flowers.js + glsl.js; MIT, © 2026 Patch, xem
 * assets/LICENSES.md) sang TSL. Không lưu gì cho từng lá: chỗ đứng, chiều cao, hướng nghiêng, màu đều suy ra từ SỐ Ô của thế giới nơi nó
 * mọc, nên lá vẫn ở đó khi quay lại. Hai vòng lá bám theo người chơi (`mid`: lá dày ở gần; `wide`: lá to hơn ở xa hơn), mờ qua nhau theo
 * khoảng cách TỚI CAMERA trên mặt phẳng ngang (như nguồn), trên một khoảng cách ngẫu nhiên riêng của từng lá nên không nhảy hình. Hoa
 * trắng/vàng/hồng/be rải thành đám.
 *
 * Khác nguồn: (1) độ cao đất và mật độ cỏ đọc từ một texture lưới 1 m dựng bằng CPU (cuộn quanh người chơi) thay cho `tHeight/tMap`; mật độ
 * theo đúng luật cỏ thường (`grassDensityAt`: nước, dốc, sân đá, công trình...); (2) bỏ lửa/cắt/giẫm (chỉ rạp theo người/quái như cỏ
 * thường); (3) nhiễu `tNoiseHi` thay bằng nhiễu của ta; (4) ánh sáng đi qua đèn PBR của cảnh (có bóng, theo mood) thay cho `meadowLight`.
 */

const REGION = 128; // texel mỗi cạnh = mét (lưới 1 m, cuộn)
const CT = 16; // texel mỗi ô dựng
const SLOTS = REGION / CT;
const WINDOW = 3; // ô mỗi phía quanh người chơi
const WIND = new THREE.Vector2(0.82, 0.57).normalize();
const WIND_SPEED = 4.5;
const BLADE_HEIGHT = 0.52;
const TAU = 6.28318531;

interface Ring {
  cell: number;
  tile: number;
  tiles: number;
  rows: number;
  /** Khoảng cách tới camera: vào từ → đến, ra từ → đến. */
  fade: [number, number, number, number];
  width: number;
  tops: number;
}
/** `mid` và `wide` của nguồn (`near` không bao giờ hiện ở camera chéo cách 20 m; `far` là mảng đất vẽ sẵn). */
const RINGS: Ring[] = [
  { cell: 0.11, tile: 6.6, tiles: 7, rows: 3, fade: [2.8, 6, 13, 21.6], width: 2.4, tops: 0.05 },
  { cell: 0.22, tile: 17.6, tiles: 5, rows: 3, fade: [13, 21.6, 34, 48], width: 5.0, tops: 0.22 },
];
const FLOWER = { cell: 0.4, tile: 12, tiles: 4, fade: [24, 32] as const };

export const paintedGrassParams = {
  /** Nhân sáng của lá cỏ và hoa sau đèn PBR (chỉnh theo ảnh đối chiếu cùng góc). */
  gain: uniform(0.92),
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ô của một vòng, xáo trộn để giảm mật độ thì thưa đều. */
function shuffledCells(n: number, rnd: () => number): Float32Array {
  const cells = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      cells[(i + j * n) * 2] = i;
      cells[(i + j * n) * 2 + 1] = j;
    }
  for (let i = n * n - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    for (let c = 0; c < 2; c++) {
      const tmp = cells[i * 2 + c]!;
      cells[i * 2 + c] = cells[k * 2 + c]!;
      cells[k * 2 + c] = tmp;
    }
  }
  return cells;
}

function instancedGeo(pos: number[], idx: number[], cells: Float32Array, tile: number, up: number): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geo.instanceCount = cells.length / 2;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(tile / 2, up, tile / 2), tile * 0.72 + 1);
  return geo;
}

/** Dải lá `rows` hàng (position = (cạnh -1/1, dọc 0..1, 0)), mỗi instance một ô. */
function bladeGeometry(ring: Ring, rnd: () => number): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < ring.rows; j++) {
    const t = j / (ring.rows - 1);
    pos.push(-1, t, 0, 1, t, 0);
    if (j < ring.rows - 1) {
      const a = j * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  return instancedGeo(pos, idx, shuffledCells(Math.round(ring.tile / ring.cell), rnd), ring.tile, 0.3);
}

/** Hoa: hình lục giác (tâm + 6 đỉnh); tâm vàng, cánh theo loài. */
function flowerGeometry(rnd: () => number): THREE.InstancedBufferGeometry {
  const pos: number[] = [0, 0, 0];
  for (let k = 0; k < 6; k++) pos.push(Math.cos((k / 6) * TAU), Math.sin((k / 6) * TAU), 0);
  const idx: number[] = [];
  for (let k = 0; k < 6; k++) idx.push(0, 1 + k, 1 + ((k + 1) % 6));
  return instancedGeo(pos, idx, shuffledCells(Math.round(FLOWER.tile / FLOWER.cell), rnd), FLOWER.tile, 0.4);
}

interface TileSet {
  geo: THREE.InstancedBufferGeometry;
  n: number;
  tile: number;
  tiles: { mesh: THREE.Mesh; i: number; j: number }[];
  at: [number, number];
  material: THREE.MeshStandardNodeMaterial;
}

export class PaintedGrass implements GrassLayer {
  readonly mesh = new THREE.Group();
  count = 0;
  private enabled = true;
  private density = 1;
  private t = 0;
  private readonly uTime = uniform(0);
  private readonly pushVec = Array.from({ length: GRASS_PUSH_SLOTS }, () => new THREE.Vector4());
  private readonly uPush = uniformArray(this.pushVec, 'vec4');
  // lưới độ cao + mật độ cuộn: R,G = độ cao 16 bit (-64..448 m), B = mật độ/2, A = độ dốc/2,6
  private readonly latData = new Uint8Array(REGION * REGION * 4);
  private readonly lat: THREE.DataTexture;
  private readonly slotKey = new Int32Array(SLOTS * SLOTS * 2).fill(-2147483648);
  private filled = 0;
  private readonly sets: TileSet[] = [];

  constructor() {
    this.lat = new THREE.DataTexture(this.latData, REGION, REGION, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.lat.magFilter = this.lat.minFilter = THREE.NearestFilter;
    this.lat.wrapS = this.lat.wrapT = THREE.RepeatWrapping;
    this.lat.generateMipmaps = false;
    this.lat.colorSpace = THREE.NoColorSpace;
    this.lat.needsUpdate = true;
    this.mesh.name = 'env-grass-painted';
    this.mesh.visible = false;
    const rnd = mulberry(977 * 7 + 3);
    RINGS.forEach((ring, index) => {
      const geo = bladeGeometry(ring, rnd);
      this.addSet(geo, ring.tile, ring.tiles, this.bladeMaterial(ring, index, geo));
    });
    const fg = flowerGeometry(rnd);
    this.addSet(fg, FLOWER.tile, FLOWER.tiles, this.flowerMaterial(fg));
  }

  private addSet(geo: THREE.InstancedBufferGeometry, tile: number, tiles: number, material: THREE.MeshStandardNodeMaterial): void {
    const list: TileSet['tiles'] = [];
    for (let j = 0; j < tiles; j++)
      for (let i = 0; i < tiles; i++) {
        const mesh = new THREE.Mesh(geo, material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false;
        mesh.frustumCulled = true;
        list.push({ mesh, i: i - tiles / 2, j: j - tiles / 2 });
        this.mesh.add(mesh);
      }
    this.sets.push({ geo, n: geo.instanceCount, tile, tiles: list, at: [NaN, NaN], material });
  }

  // ---------- TSL: đọc lưới độ cao/mật độ, nhiễu ----------
  private tap(ix: Node, iz: Node): Node {
    return texture(this.lat, vec2(mod(ix, REGION).add(0.5).div(REGION), mod(iz, REGION).add(0.5).div(REGION))).level(float(0));
  }

  private ground(xz: Node): { h: Node; growth: Node; N: Node } {
    const i = floor(xz);
    const f = fract(xz);
    const a = this.tap(i.x, i.y);
    const b = this.tap(i.x.add(1), i.y);
    const c = this.tap(i.x, i.y.add(1));
    const d = this.tap(i.x.add(1), i.y.add(1));
    const hOf = (t: Node): Node =>
      t.r
        .mul(255 * 256)
        .add(t.g.mul(255))
        .div(65535)
        .mul(512)
        .sub(64);
    const hA = hOf(a);
    const hB = hOf(b);
    const hC = hOf(c);
    const hD = hOf(d);
    const h = mix(mix(hA, hB, f.x), mix(hC, hD, f.x), f.y);
    const growth = mix(mix(a.b, b.b, f.x), mix(c.b, d.b, f.x), f.y).mul(2);
    const gx = mix(hB.sub(hA), hD.sub(hC), f.y);
    const gz = mix(hC.sub(hA), hD.sub(hB), f.x);
    return { h, growth, N: normalize(vec3(gx.negate(), 1, gz.negate())) };
  }

  private noise(uv: Node): Node {
    return texture(getCloudNoise(), uv).level(float(0));
  }

  private strokes(uv: Node): Node {
    return texture(getBrushTexture(), uv).level(float(0));
  }

  /** 0 trong lúc lặng, 1 trong cơn gió: hai trường trôi theo gió, trường rộng nhanh hơn. */
  private gustAt(xz: Node): Node {
    const scroll = vec2(WIND.x, WIND.y).mul(this.uTime.mul(WIND_SPEED));
    const a = xz.sub(scroll).div(61);
    const b = xz.sub(scroll.mul(0.62)).div(17);
    return smoothstep(
      0.26,
      0.78,
      this.noise(a)
        .r.mul(0.68)
        .add(this.noise(b.add(0.37)).g.mul(0.32)),
    );
  }

  /** Rạp theo người/quái đứng gần (như cỏ thường). */
  private pushL(xz: Node, gy: Node, h: Node): Node {
    let L: Node = vec2(0, 0);
    for (let i = 0; i < GRASS_PUSH_SLOTS; i++) {
      const p: Node = this.uPush.element(int(i));
      const r: Node = max(p.w, 0.05);
      const d: Node = xz.sub(p.xz);
      const dd: Node = max(length(d), 0.001);
      const k: Node = float(1)
        .sub(smoothstep(r.mul(0.7), r.mul(1.9), dd))
        .mul(float(1).sub(smoothstep(gy.add(h.mul(0.5)), gy.add(h).add(0.12), p.y.sub(r))))
        .mul(step(0.01, p.w));
      L = L.add(d.div(dd).mul(k.mul(0.95)));
    }
    return L;
  }

  /** Số ô, băm 4 số của ô, và chỗ lá/hoa đứng (mét). */
  private cellAt(geo: THREE.InstancedBufferGeometry, cellSize: number, salt: number): { r: Node; q: Node; xz: Node } {
    const aCell = instancedBufferAttribute(geo.getAttribute('aCell') as THREE.InstancedBufferAttribute);
    const cellRaw: Node = floor(modelPosition.xz.div(cellSize).add(0.5)).add(aCell);
    const cell: Node = mod(cellRaw, 2048);
    const r: Node = hash42(cell.add(vec2(salt * 0.7, salt * 1.3)));
    const q: Node = hash42(cell.add(vec2(salt * 0.7 + 31, salt * 1.3 + 17)));
    return { r, q, xz: cellRaw.add(r.xy).mul(cellSize) };
  }

  // ---------- lá ----------
  private bladeMaterial(ring: Ring, index: number, geo: THREE.InstancedBufferGeometry): THREE.MeshStandardNodeMaterial {
    const { r, q, xz } = this.cellAt(geo, ring.cell, index * 101 + 1);
    const dist: Node = distance(xz, cameraPosition.xz);
    const keep: Node = smoothstep(ring.fade[0], ring.fade[1], dist).mul(float(1).sub(smoothstep(ring.fade[2], ring.fade[3], dist)));
    let live: Node = smoothstep(0, 0.18, keep.sub(q.x.mul(0.82)));
    const { h: gy, growth, N } = this.ground(xz);
    live = live.mul(smoothstep(0, 0.22, growth.sub(q.y.mul(0.78))));
    const alive: Node = step(0.0001, live);

    // hàng xóm chung một dáng: khóm là một ô nhiễu trắng, mép khóm bị phá từng lá
    const cl: Node = hash42(floor(xz.add(r.zw.sub(0.5).mul(0.34)).div(0.44)).add(91));
    const patchT: Node = this.strokes(vec2(xz.y, xz.x).div(27).add(0.37))
      .r.sub(0.5)
      .mul(0.7)
      .add(this.strokes(xz.div(95).add(0.11)).r.sub(0.5).mul(0.9));
    const h: Node = float(BLADE_HEIGHT * (1 + 0.3 * ring.tops))
      .mul(mix(0.5, 1.0, cl.x))
      .mul(mix(0.7, 1.22, r.z))
      .mul(mix(0.7, 1.0, clamp(growth, 0, 1)))
      .mul(mix(0.55, 1.0, live))
      .mul(tallAt(xz, { lod0: true }))
      .mul(mix(1.32, 0.78, clamp(float(0.5).add(patchT.mul(1.5)), 0, 1)))
      .mul(alive);

    const base: Node = vec3(xz.x, gy.sub(0.02), xz.y);
    // hướng và độ nghiêng: góc từ phương thẳng đứng
    const yaw: Node = cl.z.mul(0.45).add(r.w.mul(0.55)).mul(TAU);
    let L: Node = vec2(cos(yaw), sin(yaw)).mul(mix(0.22, 0.85, q.z));
    const gust: Node = this.gustAt(xz);
    const U = WIND_SPEED;
    const flutter: Node = sin(r.w.mul(40).add(this.uTime.mul(r.z.mul(4).add(5)))).mul(0.028 + 0.013 * U);
    const wind = vec2(WIND.x, WIND.y);
    L = L.add(wind.mul(mix(0.028, 0.105, gust).mul(U).add(flutter.mul(0.6)))).add(vec2(wind.y.negate(), wind.x).mul(flutter.mul(0.5)));
    L = L.add(vec2(sin(this.uTime.mul(0.7).add(r.x.mul(30))), cos(this.uTime.mul(0.6).add(r.y.mul(30)))).mul(0.03));
    L = L.add(this.pushL(xz, gy, h));
    const lean: Node = length(L).min(1.5);
    const dir: Node = L.div(max(length(L), 1e-4));
    const theta0: Node = lean.mul(0.25);
    const A: Node = lean.sub(theta0);
    const Asafe: Node = max(A, 1e-3);
    const s: Node = positionGeometry.y;
    const phi: Node = theta0.add(A.mul(s));
    const along: Node = select(A.greaterThan(1e-3), h.mul(cos(theta0).sub(cos(phi))).div(Asafe), h.mul(s).mul(sin(theta0)));
    const rise: Node = select(A.greaterThan(1e-3), h.mul(sin(phi).sub(sin(theta0))).div(Asafe), h.mul(s).mul(cos(theta0)));
    const tangent: Node = vec3(dir.x.mul(sin(phi)), cos(phi), dir.y.mul(sin(phi)));
    const across0: Node = vec3(dir.y.negate(), 0, dir.x);
    // quay một phần về phía camera để lá nhìn ngang không biến mất
    const toCam: Node = normalize(cameraPosition.sub(base));
    const facing: Node = cross(tangent, toCam);
    const fl: Node = length(facing);
    const facingDir: Node = facing.div(max(fl, 1e-3)).mul(select(dot(facing, across0).lessThan(0), float(-1), float(1)));
    const across: Node = select(fl.greaterThan(1e-3), normalize(mix(across0, facingDir, 0.68)), across0);

    const wMul = ring.width < 1.5 ? 2.1 : ring.width < 3 ? 1.45 : 1.0;
    const w: Node = float(ring.width * 0.0115 * wMul)
      .mul(mix(0.72, 1.3, r.x))
      .mul(float(1).sub(s).mul(3.2).min(1))
      .mul(float(0.72).add(float(1).sub(s).mul(0.28)))
      .mul(mix(0.5, 1.0, live))
      .mul(alive);
    const world: Node = base.add(vec3(dir.x.mul(along), rise, dir.y.mul(along))).add(across.mul(positionGeometry.x).mul(w).mul(0.5));

    // màu: mỗi lá là một nét cọ, nhận tông của mảng cọ nó đứng trong (mảng sáng ngả vàng, mảng tối ngả lam)
    const sc: Node = mix(s, float(1), ring.tops);
    const dab: Node = this.strokes(xz.div(6)).r.sub(0.5).mul(0.5).add(patchT);
    let tone: Node = float(0.58)
      .add(dab.mul(0.7))
      .add(cl.w.sub(0.5).mul(0.08))
      .add(sc.sub(0.6).mul(0.1))
      .add(gust.mul(0.1 * Math.min(U / 6, 1)));
    // chỉ vài lá được vẽ: một trong hai chục là nét sẫm hơn, một trong ba chục hứng nắng
    tone = tone.add(select(q.z.lessThan(0.12), float(-0.3), select(q.z.greaterThan(0.9), float(0.2), float(0))));
    // khóm cỏ đậm rải không đều: một phần ô ~44 cm là khóm sẫm; thêm mảng đậm/nhạt vài mét
    tone = tone.sub(step(0.8, cl.x).mul(0.24)).add(this.noise(xz.div(4.5)).g.sub(0.5).mul(0.5));
    tone = tone.add(slopeRel(N).sub(0.5).mul(0.6));
    const albedo: Node = meadowGreen(tone)
      .mul(mix(vec3(1), meadowTint(xz, { lod0: true }), 0.5))
      .toVarying();
    const up: Node = max(clamp(rise.div(BLADE_HEIGHT * 0.85), 0, 1), float(ring.tops * 1.2)).toVarying();

    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
    m.name = `env-grass-painted-${index}`;
    m.positionNode = world.sub(modelPosition);
    m.colorNode = albedo
      .mul(paintedGrassParams.gain)
      .mul(paintedGroundParams.tint)
      .mul(mix(0.84, 1.0, up));
    m.normalNode = cameraViewMatrix.transformDirection(vec3(0, 1, 0));
    return m;
  }

  // ---------- hoa ----------
  private flowerMaterial(geo: THREE.InstancedBufferGeometry): THREE.MeshStandardNodeMaterial {
    const { r, q, xz } = this.cellAt(geo, FLOWER.cell, 777);
    const dist: Node = distance(xz, cameraPosition.xz);
    const { h: gy, growth } = this.ground(xz);
    // hoa mọc thành đám
    const drift: Node = smoothstep(0.42, 0.7, this.noise(xz.div(23)).g);
    const chance: Node = drift
      .mul(0.84)
      .add(0.16)
      .mul(1.0)
      .mul(step(0.5, clamp(growth, 0, 1)));
    const live: Node = step(q.x, chance).mul(float(1).sub(smoothstep(FLOWER.fade[0], FLOWER.fade[1], dist.add(q.y.mul(3)))));
    // một loài mỗi đám, thỉnh thoảng một cây lạc
    const kindN: Node = select(q.z.greaterThan(0.8), q.w, hash42(floor(xz.div(7))).x);
    const kind: Node = floor(kindN.mul(3.999));
    const isK = (k: number): Node => step(k - 0.5, kind).mul(step(kind, k + 0.5));
    const petal: Node = vec3(0.8, 0.8, 0.74)
      .mul(isK(0))
      .add(vec3(0.85, 0.62, 0.02).mul(isK(1)))
      .add(vec3(0.86, 0.34, 0.55).mul(isK(2)))
      .add(vec3(0.93, 0.88, 0.8).mul(isK(3)));
    const radius: Node = float(0.045)
      .mul(isK(0))
      .add(float(0.026).mul(isK(1)))
      .add(float(0.038).mul(isK(2)))
      .add(float(0.055).mul(isK(3)));
    const tall: Node = float(1)
      .mul(isK(0))
      .add(float(0.85).mul(isK(1)))
      .add(float(1.1).mul(isK(2)))
      .add(float(1.05).mul(isK(3)));
    const h: Node = tall
      .mul(BLADE_HEIGHT)
      .mul(mix(0.98, 1.32, r.w))
      .mul(tallAt(xz, { lod0: true }));
    const yaw: Node = q.w.mul(TAU);
    const U = WIND_SPEED;
    const gust: Node = this.gustAt(xz);
    const nod: Node = sin(r.w.mul(40).add(this.uTime.mul(r.z.mul(2).add(2.4)))).mul(0.03 + 0.012 * U);
    let L: Node = vec2(cos(yaw), sin(yaw)).mul(0.18);
    L = L.add(vec2(WIND.x, WIND.y).mul(mix(0.02, 0.07, gust).mul(U).add(nod)));
    L = L.add(this.pushL(xz, gy, h));
    const at: Node = vec3(
      xz.x.add(L.x.mul(h).mul(0.55)),
      gy.add(h.mul(float(1).sub(length(L).mul(0.15).min(0.4)))),
      xz.y.add(L.y.mul(h).mul(0.55)),
    );
    // đầu hoa nhìn lên và hơi về phía mặt trời
    const sd: Node = skyParams.sunDir;
    const axis: Node = normalize(vec3(L.x.mul(0.5).add(sd.x.mul(0.25)), sd.y.mul(0.25).add(1.1), L.y.mul(0.5).add(sd.z.mul(0.25))));
    const u: Node = normalize(cross(axis, vec3(0.31, 0, 0.95)));
    const v: Node = cross(axis, u);
    const size: Node = radius.mul(mix(0.95, 1.3, r.z)).mul(live);
    const world: Node = at.add(u.mul(positionGeometry.x).add(v.mul(positionGeometry.y)).mul(size));
    const rad: Node = length(positionGeometry.xy).toVarying();
    const petalV: Node = petal.toVarying();

    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
    m.name = 'env-grass-painted-flowers';
    m.positionNode = world.sub(modelPosition);
    m.colorNode = mix(vec3(0.75, 0.5, 0.03), petalV, smoothstep(0.12, 0.4, rad)).mul(1.7);
    m.normalNode = cameraViewMatrix.transformDirection(vec3(0, 1, 0));
    return m;
  }

  // ---------- lưới độ cao + mật độ ----------
  /** Dựng một ô 16×16 m của lưới (độ cao, mật độ theo luật cỏ thường, độ dốc) vào chỗ cuộn của nó. */
  private fillChunk(cx: number, cz: number): void {
    const x0 = cx * CT;
    const z0 = cz * CT;
    setGrassColliders(x0, z0, CT);
    const n = CT + 1;
    const hs = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = heightAt(x0 + i, z0 + j);
    for (let j = 0; j < CT; j++) {
      for (let i = 0; i < CT; i++) {
        const x = x0 + i;
        const z = z0 + j;
        const h = hs[j * n + i]!;
        const slope = (Math.abs(hs[j * n + i + 1]! - h) + Math.abs(hs[(j + 1) * n + i]! - h)) * 1.5;
        let dens = grassDensityAt(x + 0.5, z + 0.5, h, slope);
        if (dens > 0 && grassBlockedByCollider(x + 0.5, z + 0.5)) dens = 0;
        const tx = ((x % REGION) + REGION) % REGION;
        const tz = ((z % REGION) + REGION) % REGION;
        const o = (tz * REGION + tx) * 4;
        const hv = Math.round(Math.min(1, Math.max(0, (h + 64) / 512)) * 65535);
        this.latData[o] = hv >> 8;
        this.latData[o + 1] = hv & 255;
        this.latData[o + 2] = Math.round(Math.min(1, Math.max(0, dens / 2)) * 255);
        this.latData[o + 3] = Math.round(Math.min(1, slope / 2.6) * 255);
      }
    }
    const s = (((cx % SLOTS) + SLOTS) % SLOTS) + SLOTS * (((cz % SLOTS) + SLOTS) % SLOTS);
    this.slotKey[s * 2] = cx;
    this.slotKey[s * 2 + 1] = cz;
    this.filled++;
    this.lat.needsUpdate = true;
  }

  private chunkReady(cx: number, cz: number): boolean {
    const s = (((cx % SLOTS) + SLOTS) % SLOTS) + SLOTS * (((cz % SLOTS) + SLOTS) % SLOTS);
    return this.slotKey[s * 2] === cx && this.slotKey[s * 2 + 1] === cz;
  }

  setQuality(q: string, shadows = false): void {
    const b = baseOf(q);
    this.density = q === 'low' || b === 'low' ? 0 : b === 'medium' ? 0.6 : 1;
    for (const s of this.sets) {
      s.geo.instanceCount = Math.max(1, Math.round(s.n * (this.density || 1)));
      for (const t of s.tiles) t.mesh.receiveShadow = shadows;
    }
    this.mesh.visible = this.enabled && this.density > 0 && this.filled > 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on && this.density > 0 && this.filled > 0;
  }

  update(dt: number, center: { x: number; y: number; z: number }, pushers: Pusher[], budget = 1): void {
    this.t += dt;
    this.uTime.value = this.t;
    if (!this.enabled || this.density <= 0) return;
    for (let i = 0; i < GRASS_PUSH_SLOTS; i++) {
      const p = pushers[i];
      if (p) this.pushVec[i]!.set(p.x, p.y, p.z, p.r);
      else this.pushVec[i]!.set(0, -1e4, 0, 0);
    }
    const cx = Math.floor(center.x / CT);
    const cz = Math.floor(center.z / CT);
    const need: [number, number][] = [];
    for (let dz = -WINDOW; dz <= WINDOW; dz++)
      for (let dx = -WINDOW; dx <= WINDOW; dx++) if (!this.chunkReady(cx + dx, cz + dz)) need.push([cx + dx, cz + dz]);
    if (need.length) {
      need.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cz) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2));
      // nhảy xa (dịch chuyển, vào level): dựng hết một lần để lá không đứng trên độ cao cũ; còn lại dựng dần
      const take = need.length > 8 ? need.length : Math.max(1, budget);
      for (let k = 0; k < take && k < need.length; k++) this.fillChunk(need[k]![0], need[k]![1]);
    }
    let blades = 0;
    for (const s of this.sets) {
      const sx = Math.floor(center.x / s.tile);
      const sz = Math.floor(center.z / s.tile);
      if (sx !== s.at[0] || sz !== s.at[1]) {
        s.at = [sx, sz];
        for (const t of s.tiles) {
          const ox = (sx + t.i) * s.tile;
          const oz = (sz + t.j) * s.tile;
          t.mesh.position.set(ox, heightAt(ox + s.tile / 2, oz + s.tile / 2), oz);
          t.mesh.updateMatrix();
          t.mesh.updateMatrixWorld(true);
        }
      }
      blades += s.geo.instanceCount * s.tiles.length;
    }
    this.count = blades;
    this.mesh.visible = this.filled > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    for (const s of this.sets) {
      s.geo.dispose();
      s.material.dispose();
    }
    this.lat.dispose();
  }
}
