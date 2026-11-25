import * as THREE from 'three/webgpu';
import { float, mix, normalWorld, positionWorld, smoothstep, texture, uniform, vec3, vertexColor } from 'three/tsl';
import { DUNGEON_EXIT, fbm, hash01 } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createWorldMaterial } from '../../render/materials/world';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';
import { C, SEED, ktGroundColor } from './kiemTrungColor';

export { ktGroundColor };

/**
 * Vật liệu đất của GLB `arch_kiem_trung` (gò mộ, vết đất): màu đỉnh (Blender) nhân nhiễu hạt mịn + nhiễu mảng theo toạ độ thế giới (không còn một màu phẳng), mặt ngửa phủ
 * cỏ khô vàng úa theo nhiễu (đốm, không phủ kín), chân gò và mặt đứng sẫm hơn (đất ẩm), độ nhám cao. Vật liệu khác giữ nguyên.
 */
export function ktMaterialFor(name: string): THREE.Material | null {
  if (!name.endsWith('_earth')) return null;
  const nz = getCloudNoise();
  const wp = positionWorld;
  const fine = texture(nz, wp.xz.mul(1.9).add(wp.y.mul(1.3))).g;
  const clump = texture(nz, wp.xz.mul(0.45).add(wp.y.mul(0.5))).a;
  const speck = texture(nz, wp.xy.mul(7.0).add(wp.z.mul(4.0))).b;
  const up = smoothstep(0.45, 0.9, normalWorld.y);
  const grass = smoothstep(0.5, 0.75, clump).mul(up);
  const base = vertexColor().mul(float(0.6).add(fine.mul(0.55)).add(speck.mul(0.2)));
  const dry = vec3(0.5, 0.45, 0.24).mul(float(0.7).add(speck.mul(0.6)));
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0, name });
  m.colorNode = mix(base, dry, grass.mul(0.8)).mul(float(1).sub(float(1).sub(up).mul(0.25)));
  return m;
}

/**
 * Cảnh Kiếm Trủng (DUN-1, bí cảnh đầu tiên; chỉ để nhìn, KHÔNG va chạm, không đổi vùng boss/đợt quái/cổng):
 * nghĩa địa kiếm cổ. Ngàn thanh kiếm gãy cắm đất (hai `InstancedMesh`: kiếm nguyên cắm lưỡi xuống, lưỡi gãy lởm chởm), mười tám thanh cự kiếm
 * cao 14–60 m ở rìa lòng chảo (vật liệu PBR, vân rỉ, mạch khí xanh phát sáng vào bloom), kiếm trận khắc sàn đài chiến, tất cả bám địa hình
 * theo `heightAt`, vị trí tất định theo hạt giống. Kiếm nhỏ chừa khu giữa (đánh quái/boss), đường từ cổng vào, và đệm quanh điểm đợt.
 * Draw call: 2 (kiếm nhỏ) + 1 (cự kiếm) + 1 (kiếm trận) = 4.
 */


function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- hình học kiếm ----------

interface Part {
  pos: number[];
  col: number[];
  glow: number[];
}

/** Khối thon (đáy chữ nhật w0×t0 ở y0, đỉnh w1×t1 ở y1; có thể lệch đỉnh `tilt` theo x), màu đáy → đỉnh, có thể phát sáng. Phẳng (mỗi mặt đỉnh riêng). */
function prism(
  p: Part,
  w0: number,
  t0: number,
  w1: number,
  t1: number,
  y0: number,
  y1: number,
  c0: [number, number, number],
  c1: [number, number, number],
  glow = 0,
  tilt = 0,
  capSlant = 0,
): void {
  const lo = [
    [-w0 / 2, y0, -t0 / 2],
    [w0 / 2, y0, -t0 / 2],
    [w0 / 2, y0, t0 / 2],
    [-w0 / 2, y0, t0 / 2],
  ] as const;
  const hi = [
    [-w1 / 2 + tilt, y1, -t1 / 2],
    [w1 / 2 + tilt, y1 + capSlant, -t1 / 2],
    [w1 / 2 + tilt, y1 + capSlant, t1 / 2],
    [-w1 / 2 + tilt, y1, t1 / 2],
  ] as const;
  const tri = (
    a: readonly number[],
    ca: [number, number, number],
    b: readonly number[],
    cb: [number, number, number],
    c: readonly number[],
    cc: [number, number, number],
  ) => {
    p.pos.push(...a, ...b, ...c);
    p.col.push(...ca, ...cb, ...cc);
    p.glow.push(glow, glow, glow);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(lo[i]!, c0, lo[j]!, c0, hi[j]!, c1);
    tri(lo[i]!, c0, hi[j]!, c1, hi[i]!, c1);
  }
  tri(hi[0]!, c1, hi[2]!, c1, hi[1]!, c1);
  tri(hi[0]!, c1, hi[3]!, c1, hi[2]!, c1);
}

function toGeometry(p: Part): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(p.glow, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const STEEL: [number, number, number] = [0.55, 0.6, 0.68];
const STEEL_DK: [number, number, number] = [0.3, 0.33, 0.39];
const RUST: [number, number, number] = [0.46, 0.27, 0.17];
const BRONZE: [number, number, number] = [0.4, 0.31, 0.18];
const LEATHER: [number, number, number] = [0.22, 0.17, 0.15];

/** Kiếm nguyên cắm lưỡi xuống đất: chỉ thấy phần lưỡi sát chuôi, tấm chắn, chuôi và đầu chuôi. Cao 1 đơn vị, gốc ở mặt đất. */
function plantedSword(): THREE.BufferGeometry {
  const p: Part = { pos: [], col: [], glow: [] };
  prism(p, 0.07, 0.018, 0.075, 0.02, -0.05, 0.42, RUST, STEEL);
  prism(p, 0.075, 0.02, 0.1, 0.026, 0.4, 0.46, STEEL, STEEL_DK); // gờ chân chắn
  prism(p, 0.3, 0.04, 0.3, 0.04, 0.44, 0.475, BRONZE, BRONZE); // tấm chắn
  prism(p, 0.04, 0.04, 0.034, 0.034, 0.475, 0.75, LEATHER, LEATHER); // chuôi
  prism(p, 0.07, 0.07, 0.05, 0.05, 0.75, 0.8, BRONZE, STEEL_DK); // đầu chuôi
  return toGeometry(p);
}

/** Lưỡi gãy: thân thon, đỉnh vát lởm chởm (hai tầng lệch), vệt rỉ ở chân. Cao 1 đơn vị. */
function brokenBlade(): THREE.BufferGeometry {
  const p: Part = { pos: [], col: [], glow: [] };
  prism(p, 0.12, 0.024, 0.1, 0.022, -0.05, 0.62, RUST, STEEL);
  prism(p, 0.1, 0.022, 0.06, 0.018, 0.62, 0.88, STEEL, STEEL_DK, 0, 0.02, 0.1);
  prism(p, 0.04, 0.016, 0.0, 0.012, 0.88, 1.0, STEEL_DK, STEEL, 0, -0.03, 0.04);
  return toGeometry(p);
}

// ---------- rải ----------

/** Chỗ cấm cắm kiếm (đệm theo m): khu giữa đài chiến, lối từ cổng vào. Hàm thuần để test. */
export function swordKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - C.x;
  const dz = z - C.z;
  const d = Math.hypot(dx, dz);
  if (d < minR) return true;
  // Lối từ điểm vào (1520, 1352) / lối ra (1520, 1370) lên đài: dải rộng 9 m phía nam.
  if (Math.abs(dx) < 9 && dz > 0) return true;
  return false;
}

interface KtSword {
  x: number;
  z: number;
  /** Độ cao cắm so với mặt đất (m, thân kiếm hiển thị). */
  h: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  kind: 'whole' | 'broken';
}

/** Ngàn kiếm nhỏ cắm quanh lòng chảo: thưa ở sát đài chiến, dày dần ra vành, thành bụi theo nhiễu; tất định. */
export function planSmallSwords(countWhole = 640, countBroken = 520): KtSword[] {
  const rand = rng(SEED);
  const out: KtSword[] = [];
  const want = countWhole + countBroken;
  let tries = 0;
  while (out.length < want && tries < want * 40) {
    tries++;
    const a = rand() * Math.PI * 2;
    const r = 26 + Math.pow(rand(), 0.72) * 118;
    const x = C.x + Math.cos(a) * r;
    const z = C.z + Math.sin(a) * r;
    if (swordKeepOut(x, z, 26)) continue;
    // Bụi: kiếm tụ thành đám (nhiễu thấp tần số cao thì bỏ), dày hơn khi xa tâm.
    const cl = fbm(x * 0.03, z * 0.03, 2, SEED + 911);
    const keep = 0.2 + Math.min(0.8, (r - 26) / 80) * 0.5 + Math.max(0, cl) * 0.9;
    if (rand() > keep) continue;
    const kind = out.length < countWhole ? 'whole' : 'broken';
    const near = r < 70;
    const hs = kind === 'whole' ? 1.7 + rand() * 2.4 : 0.9 + rand() * 1.8;
    const tilt = 0.12 + rand() * 0.34;
    out.push({
      x,
      z,
      h: near ? hs * 0.82 : hs * 1.15,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 2 * tilt,
      tiltZ: (rand() - 0.5) * 2 * tilt,
      kind,
    });
  }
  return out;
}

// ---------- kiếm trận ----------

/** Kiếm trận khắc sàn đài chiến: ba vòng, tám thanh kiếm tỏa ra, nét xanh nhạt (vẽ canvas, một draw call, rất nhẹ để không che vạch báo). */
function sigilTexture(): THREE.CanvasTexture {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const h = N / 2;
  g.clearRect(0, 0, N, N);
  g.lineCap = 'round';
  const ring = (r: number, w: number, a: number) => {
    g.strokeStyle = `rgba(140,225,255,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(h * 0.97, 5, 0.5);
  ring(h * 0.9, 2, 0.35);
  ring(h * 0.62, 3, 0.4);
  ring(h * 0.28, 2, 0.3);
  // Tám thanh kiếm tỏa ra từ vòng trong (hình thoi dài), xen tám chấm trên vòng ngoài.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pt = (r: number, off: number) => [h + ca * r - sa * off, h + sa * r + ca * off] as const;
    g.fillStyle = 'rgba(140,225,255,0.2)';
    g.strokeStyle = 'rgba(190,240,255,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    const pts = [pt(h * 0.3, 0), pt(h * 0.42, 9), pt(h * 0.6, 0), pt(h * 0.42, -9)];
    g.moveTo(...pts[0]!);
    for (const q of pts.slice(1)) g.lineTo(...q);
    g.closePath();
    g.fill();
    g.stroke();
    const dp = pt(h * 0.76, 0);
    g.fillStyle = 'rgba(200,245,255,0.55)';
    g.beginPath();
    g.arc(dp[0], dp[1], 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(140,225,255,0.22)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(...pt(h * 0.62, 0));
    g.lineTo(...pt(h * 0.9, 0));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- lớp cảnh ----------

export class KiemTrungArt {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly pulse = uniform(1);
  private readonly fx: DungeonFx;
  private t = 0;

  constructor(opts: { reduced?: boolean } = {}) {
    this.group.name = 'kiem-trung-art';
    const small = planSmallSwords(opts.reduced ? 320 : 640, opts.reduced ? 260 : 520);
    this.addSmall(
      small.filter((s) => s.kind === 'whole'),
      plantedSword(),
      'kt-swords',
    );
    this.addSmall(
      small.filter((s) => s.kind === 'broken'),
      brokenBlade(),
      'kt-blades',
    );
    this.addSigil();
    this.addSteps();
    // khe nứt lõm có gờ đá + ánh lam mềm, sương thấp, vòng trận cổng ra có hạt (dùng chung các bí cảnh DUN-1)
    this.fx = new DungeonFx({
      cx: C.x,
      cz: C.z,
      exit: DUNGEON_EXIT,
      seed: SEED,
      keepOut: swordKeepOut,
      cracks: {
        count: 40,
        rMin: 24,
        rMax: 114,
        floor: [0.06, 0.22, 0.52],
        core: [0.6, 0.85, 1.0],
        lip: 3.0,
        halo: [0.08, 0.3, 0.6],
        rock: [0.2, 0.23, 0.28],
        w0: 0.28,
        w1: 0.6,
        glowW: 0.3,
        fade: [22, 50],
      },
      mist: { a: [0.46, 0.55, 0.66], b: [0.74, 0.82, 0.9], innerR: 34, outerR: 160, opacity: 0.42 },
      ring: { rgb: '170,225,255', mote: 0xbfe6ff },
    });
    this.group.add(this.fx.group);
  }

  private addSmall(list: KtSword[], geo: THREE.BufferGeometry, name: string): void {
    const mat = createWorldMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.count = list.length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach((w, i) => {
      e.set(w.tiltX, w.yaw, w.tiltZ, 'YXZ');
      q.setFromEuler(e);
      const w3 = 0.9 + hash01(i, 3, 5501) * 0.5;
      s.set(w.h * w3, w.h, w.h * w3);
      m.compose(new THREE.Vector3(w.x, heightAt(w.x, w.z) - 0.05, w.z), q, s);
      mesh.setMatrixAt(i, m);
      // Màu theo từng thanh: sắc thép đều → rỉ đậm (nhân với màu đỉnh).
      const k = hash01(i, 9, 5501);
      c.setRGB(0.7 + k * 0.5, 0.68 + k * 0.4, 0.64 + k * 0.36);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
    this.disposables.push(geo, mat);
  }

  private addSigil(): void {
    const tex = sigilTexture();
    const R = 66;
    const geo = new THREE.RingGeometry(0.01, R, 96, 36).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(C.x + p.getX(i), C.z + p.getZ(i)) + 0.09);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.34,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(C.x, 0, C.z);
    mesh.name = 'kt-sigil';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  /**
   * Bậc thềm viền vòng trận (r ≈ 57): ba bậc đá rất thấp xếp lên dần ra phía ngoài (0,035 / 0,07 / 0,105 m), đá phiến có vệt rêu. CHỈ ĐỂ NHÌN, không
   * va chạm (nhân vật/quái đứng theo `heightAt`), nên bậc gần như phẳng (≤ ~0,1 m, chân lún không đáng kể) và chừa khe ở lối vào phía nam
   * (dải |dx| < 9, dz > 0 như `swordKeepOut`, cung ~±0,2 rad quanh +z), nơi mọi người chơi đi từ cổng lên đài. Nằm ngoài vùng đánh giữa đài. Một lưới xoay tròn bám địa hình, màu theo đỉnh.
   */
  private addSteps(): void {
    /** Nửa góc khe phía nam (phi = 0 ứng +z): asin(9 / 57) ≈ 0,16 rad, nới thành 0,2. */
    const GAP = 0.2;
    const prof: [number, number][] = [];
    const R0 = 57;
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const r = R0 + i * 1.5;
      const y = 0.035 * (i + 1);
      prof.push([r, i === 0 ? -0.05 : 0.035 * i], [r, y], [r + 1.5, y]);
    }
    prof.push([R0 + tiers * 1.5, -0.05]);
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 192, GAP, Math.PI * 2 - 2 * GAP);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, p.getY(i) + heightAt(C.x + x, C.z + z));
      const n = fbm(x * 0.2, z * 0.2, 2, SEED + 61);
      c.setRGB(0.3, 0.33, 0.38).multiplyScalar(0.75 + n * 0.4);
      if (n > 0.1 && p.getY(i) > 0) c.lerp(new THREE.Color(0x4e6a44), Math.min(0.7, (n - 0.1) * 2.5));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = createWorldMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(C.x, 0, C.z);
    mesh.name = 'kt-steps';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    this.pulse.value = 1.05 + 0.35 * Math.sin(this.t * 0.9);
  }

  dispose(): void {
    this.fx.dispose();
    for (const m of this.meshes) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.meshes.length = 0;
    this.disposables.length = 0;
  }
}
