import * as THREE from 'three/webgpu';
import { addUpNormals } from '../../render/geoNormal';
import {
  atan,
  dot,
  float,
  fract,
  length,
  mix,
  normalWorld,
  positionLocal,
  positionWorld,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { hash01 } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';
import { postParams } from '../../render/post';
import { DungeonFx } from './dungeonFx';
import { withSightFade } from './occlusion';

/**
 * Cảnh Độ Kiếp (DUN-1 PR7; chỉ để nhìn, không đổi kịch bản kiếp/vòng trận môn/điểm đứng): Thiên Lôi Đài trên đỉnh núi, giữa biển mây giông.
 * GLB Blender `arch_do_kiep` (đài lát đá cháy xém khảm bát quái và nứt điện, tám lôi trụ khắc phù văn + xích nối về đài, bốn đỉnh đồng, đá vỡ cháy bị sét, cột đá nhọn xa)
 * nạp ở `engine/levelLoad.ts` `loadDkModel`. File này dựng phần động: chớp sét theo nhịp (uniform dùng chung cho vật liệu + một đèn điểm), xoáy mây giông đen tím ngay trên đài,
 * biển mây phủ ngoài vành đài, mưa, hồ quang giữa các đầu trụ, đá vụn bay lơ lửng quanh đài, sương thấp, vòng cổng ra, quầng đỉnh đồng.
 */

const SEED = 20261120;
const DG = LEVELS.do_kiep!.dungeon!;
const CENTER = DG.center;

/** Bốn đỉnh đồng (khớp `put('cauldron', …)` ở `tools/blender/do_kiep_arch.py`, đã nhân 1,02), toạ độ tương đối tâm sân; cao 3,5 m. */
const CAULDRONS: readonly [number, number][] = [
  [-20.4, -20.4],
  [20.4, -20.4],
  [-20.4, 20.4],
  [20.4, 20.4],
];

/** Tám lôi trụ (khớp vòng lặp trụ ở Blender: r 36 từ góc 0,2 rad; trụ chắn lối vào dời sang (±12, 40)); `broken` = trụ gãy, không có đầu thu lôi. */
const PILLARS: readonly { x: number; z: number; broken: boolean }[] = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2 + 0.2;
  let x = Math.cos(a) * 36;
  let z = Math.sin(a) * 36;
  if (Math.abs(x) < 11 && z > 24) {
    x = Math.sign(x) * 12;
    z = 40;
  }
  return { x, z, broken: k === 2 || k === 5 };
});
/** Cao đầu thu lôi (m trên mặt sân): 9,2 + 3,45. */
const TIP_Y = 12.65;

/** Chớp của tia sét THẬT (`postParams.flash`, 0..~1,2): vật liệu `_rune`/`_volt`/đá vụn đọc giá trị này, không bao giờ do chớp trang trí. */
const flashU = uniform(0);
/** Chớp trên cao (xoáy mây, biển mây, tia trong mây): gồm chớp trang trí; sàn đấu và vật liệu dưới đất KHÔNG đọc cái này. */
const skyU = uniform(0);

/** Vùng cấm đặt hiệu ứng ngẫu nhiên: quanh đài và lối vào phía nam. */
function dkKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 24);
}

/**
 * Vật liệu thay cho glTF của GLB `arch_do_kiep`:
 *  - `_rune` (khảm vàng bát quái, than hồng trong đỉnh): phát sáng nhấp nhô chậm, bừng theo chớp;
 *  - `_volt` (vết nứt/phù văn điện tím-trắng): sáng yếu, bừng mạnh theo chớp (HDR để bloom bắt);
 *  - `_jade` (đá cháy xém): thớ nhiễu theo toạ độ thế giới, mặt ngửa phủ muội đen.
 */
/** Nhiễu dither khung hình (interleaved gradient) cho maskNode: bằng cách của `occlusion.ts`. */
const ignDither = () => fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));

export function dkMaterialFor(name: string): THREE.Material | null {
  if (name.endsWith('_rune')) {
    const m = withSightFade(new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.2, name }));
    const n = texture(getCloudNoise(), positionWorld.xz.mul(0.05).add(time.mul(0.02))).g;
    const slow = float(0.5).add(sin(time.mul(0.9).add(n.mul(6))).mul(0.12));
    m.colorNode = vec3(0.04, 0.035, 0.03);
    // camera chéo nhìn từ trên: tám tia/vòng vàng dài dịu lại (đỡ cắt khung như lỗi hình), vẫn bừng theo chớp
    m.emissiveNode = vertexColor().mul(slow.mul(0.95).add(flashU.mul(1.4)));
    return m;
  }
  if (name.endsWith('_volt')) {
    const m = withSightFade(new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0, name }));
    const n = texture(getCloudNoise(), positionWorld.xz.mul(0.4).add(time.mul(0.15))).g;
    const crawl = float(0.55).add(sin(time.mul(3.0).add(n.mul(10))).mul(0.3));
    m.colorNode = vec3(0.05, 0.04, 0.08);
    m.emissiveNode = vertexColor().mul(crawl.mul(1.5).add(flashU.mul(4.5)));
    return m;
  }
  if (name.endsWith('_jade')) {
    const nz = getCloudNoise();
    const wp = positionWorld;
    const fine = texture(nz, wp.xz.mul(1.7).add(wp.y.mul(1.1))).g;
    const speck = texture(nz, wp.xy.mul(6.0).add(wp.z.mul(2.6))).b;
    const soot = smoothstep(0.55, 0.95, normalWorld.y).mul(smoothstep(0.35, 0.7, texture(nz, wp.xz.mul(0.3)).a));
    const base = vertexColor().mul(float(0.7).add(fine.mul(0.38)).add(speck.mul(0.16)));
    const m = withSightFade(new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.02, name }));
    m.colorNode = mix(base, base.mul(0.35), soot.mul(0.7));
    return m;
  }
  if (name.endsWith('_char')) {
    // Vết cháy sét/muội: tấm phẳng sát đất (đĩa, tia cháy, mảng muội của lát đá) từ trên cao thành hình chữ nhật đen đặc. Không đo theo bán kính của
    // mesh (gốc là gốc cả đài, không phải tâm từng vết): thay bằng nhiễu theo toạ độ thế giới + dither (maskNode, không cần pass trong suốt),
    // áp cho mọi mảnh mỏng sát đất kể cả mép bên 3 cm. Phần có khối (gốc cây cháy, tảng) giữ đặc.
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0, name });
    const thin = step(positionLocal.y, 0.12);
    const n = texture(getCloudNoise(), positionWorld.xz.mul(0.35)).g;
    const cover = float(0.3).add(smoothstep(0.35, 0.75, n).mul(0.4));
    m.colorNode = vertexColor().mul(0.8);
    m.maskNode = mix(float(1), step(ignDither(), cover), thin).greaterThan(0.5);
    return m;
  }
  return null;
}

const MOTE_N = 120;
const RAIN_N = 420;
const DEBRIS_N = 28;
const ARCS = (() => {
  const tips = PILLARS.filter((p) => !p.broken);
  return tips.map((p, i) => [p, tips[(i + 1) % tips.length]!] as const);
})();
const ARC_SEG = 10;

export class DoKiepArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];
  private motes: THREE.Points | null = null;
  private readonly seeds: number[] = [];
  private t = 0;
  private readonly y0: number;
  private readonly hazardActive: () => boolean;
  private nextStrike = 4;
  private strikeAt = -10;
  private rain: THREE.LineSegments;
  private readonly rainSeed: number[] = [];
  private arcs: THREE.LineSegments;
  private arcClock = 0;
  private debris: THREE.InstancedMesh;
  private readonly debrisSeed: number[] = [];
  private readonly tmp = new THREE.Object3D();

  /**
   * `lights`: bật đèn điểm ấm ở lò lửa (chỉ khi preset có đèn và đang chạy WebGPU, như `LanternLights`).
   * `hazardActive`: true khi có vùng báo của kiếp đang đếm ngược; lúc đó chớp trang trí tạm dừng để không lẫn với sét thật.
   */
  constructor(opts: { lights: boolean; hazardActive: () => boolean }) {
    this.hazardActive = opts.hazardActive;
    this.group.name = 'do-kiep-art';
    this.y0 = heightAt(CENTER.x, CENTER.z);
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: dkKeepOut,
      mist: { a: [0.07, 0.07, 0.11], b: [0.22, 0.2, 0.32], innerR: 30, outerR: 90, opacity: 0.2 },
      ring: { rgb: '188,170,255', mote: 0xbcaaff },
    });
    this.group.add(this.fx.group);
    const pts = CAULDRONS.map(([dx, dz]) => ({ x: CENTER.x + dx, y: heightAt(CENTER.x + dx, CENTER.z + dz) + 3.6, z: CENTER.z + dz }));
    const halos = createLanternHalos(pts, 9, 0xff7a30);
    this.group.add(halos);
    this.disposables.push(halos.geometry, halos.material as THREE.Material);

    // đầu thu lôi phát sáng trắng-tím
    const tipPts = PILLARS.filter((p) => !p.broken).map((p) => ({ x: CENTER.x + p.x, y: this.y0 + TIP_Y - 0.2, z: CENTER.z + p.z }));
    const tipHalos = createLanternHalos(tipPts, 8, 0xc8b4ff);
    this.group.add(tipHalos);
    this.disposables.push(tipHalos.geometry, tipHalos.material as THREE.Material);
    // lò lửa ấm: bốn đèn điểm cam rọi sàn và chân trụ (chỉ khi đủ điều kiện, như đèn lồng)
    for (const [dx, dz] of opts.lights ? CAULDRONS : []) {
      const wl = new THREE.PointLight(0xff8a3c, 420, 26, 2);
      wl.position.set(CENTER.x + dx, this.y0 + 4.2, CENTER.z + dz);
      this.group.add(wl);
    }

    this.buildVortex();
    this.buildCloudSea();

    for (let i = 0; i < MOTE_N; i++) this.seeds.push(hash01(i, 1, 9901), hash01(i, 2, 9901), hash01(i, 3, 9901), hash01(i, 4, 9901));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_N * 3), 3));
    addUpNormals(g);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, this.y0 + 10, CENTER.z), 90);
    const m = new THREE.PointsMaterial({
      color: 0xcdbfff,
      size: 0.34,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(g, m);
    this.motes.name = 'dk-motes';
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.disposables.push(g, m);

    // mưa: các vệt dài 1,6 m rơi nghiêng trong trụ r 62 quanh đài
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3));
    addUpNormals(rg);
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, this.y0 + 20, CENTER.z), 90);
    for (let i = 0; i < RAIN_N; i++) this.rainSeed.push(hash01(i, 1, 5501), hash01(i, 2, 5501), hash01(i, 3, 5501));
    const rm = new THREE.LineBasicMaterial({
      color: 0xaab4e8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rain = new THREE.LineSegments(rg, rm);
    this.rain.frustumCulled = false;
    this.rain.name = 'dk-rain';
    this.group.add(this.rain);
    this.disposables.push(rg, rm);

    // hồ quang giữa các đầu thu lôi kề nhau
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARCS.length * ARC_SEG * 6), 3));
    addUpNormals(ag);
    ag.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, this.y0 + 12, CENTER.z), 60);
    const am = new THREE.LineBasicMaterial({
      color: 0xd8ccff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.arcs = new THREE.LineSegments(ag, am);
    this.arcs.frustumCulled = false;
    this.arcs.name = 'dk-arcs';
    this.group.add(this.arcs);
    this.disposables.push(ag, am);

    // đá vụn bay lơ lửng quanh đài, xoay chậm và nhích lên xuống
    const dgeo = new THREE.IcosahedronGeometry(1, 0);
    const dmat = withSightFade(new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 }));
    const dn = texture(getCloudNoise(), positionWorld.xz.mul(0.9).add(positionWorld.y.mul(0.6))).g;
    dmat.colorNode = vec3(0.16, 0.15, 0.2).mul(float(0.7).add(dn.mul(0.6)));
    const crack = smoothstep(0.58, 0.62, dn).mul(smoothstep(0.66, 0.62, dn));
    dmat.emissiveNode = vec3(0.62, 0.45, 1.0).mul(crack.mul(float(0.6).add(flashU.mul(1.6))));
    this.debris = new THREE.InstancedMesh(dgeo, dmat, DEBRIS_N);
    this.debris.name = 'dk-debris';
    this.debris.frustumCulled = false;
    for (let i = 0; i < DEBRIS_N; i++) this.debrisSeed.push(hash01(i, 1, 3301), hash01(i, 2, 3301), hash01(i, 3, 3301), hash01(i, 4, 3301));
    this.group.add(this.debris);
    this.disposables.push(dgeo, dmat);

    this.updateAll(0);
  }

  /** Xoáy mây giông đen tím trên đài: hai lớp đĩa quay ngược chiều, mắt bão ở giữa bừng theo chớp. */
  private buildVortex(): void {
    const mk = (radius: number, y: number, spin: number, density: number, opacity: number) => {
      const geo = new THREE.CircleGeometry(radius, 64);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const p = positionLocal.xz;
      const r = length(p).div(radius);
      const ang = atan(p.y, p.x).div(Math.PI * 2);
      const uv = vec2(ang.mul(3).add(r.mul(1.6)).add(time.mul(spin)), r.mul(1.3).sub(time.mul(0.012)));
      const nz = getCloudNoise();
      const n = texture(nz, uv)
        .g.mul(0.6)
        .add(texture(nz, uv.mul(2.3).add(vec2(0.37, time.mul(-0.01)))).b.mul(0.4));
      const body = smoothstep(density, density + 0.3, n)
        .mul(smoothstep(1.0, 0.55, r))
        .mul(smoothstep(0.03, 0.2, r));
      const col = mix(vec3(0.015, 0.012, 0.035), vec3(0.2, 0.14, 0.34), n.mul(n));
      const eye = smoothstep(0.32, 0.0, r);
      const baseCol = col
        .add(vec3(0.55, 0.42, 1.0).mul(eye.mul(float(0.25).add(skyU.mul(1.6)))))
        .add(vec3(0.5, 0.45, 0.8).mul(skyU.mul(0.35)).mul(n));
      // tia chớp chạy trong mây: đường vân sáng mảnh (đỉnh nhiễu) chỉ hiện lúc chớp
      const ridge = float(1).sub(
        smoothstep(
          0.0,
          0.03,
          texture(nz, uv.mul(1.7).add(vec2(0.11, 0.53)))
            .r.sub(0.5)
            .abs(),
        ),
      );
      m.colorNode = baseCol.add(vec3(0.85, 0.75, 1.0).mul(ridge.mul(skyU).mul(3.0)));
      m.opacityNode = body.add(ridge.mul(skyU).mul(0.9)).clamp(0, 1).mul(opacity);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(CENTER.x, y, CENTER.z);
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.disposables.push(geo, m);
    };
    mk(230, this.y0 + 72, 0.012, 0.3, 0.95);
    mk(150, this.y0 + 50, -0.02, 0.38, 0.85);
  }

  /** Biển mây phủ ngoài vành đài (che sườn dốc, chỉ đỉnh núi xa nhô lên): nền tím-xám tối, sáng loé theo chớp. */
  private buildCloudSea(): void {
    const geo = new THREE.RingGeometry(78, 520, 96, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const wp = positionWorld;
    const nz = getCloudNoise();
    const a = texture(nz, wp.xz.mul(0.006).add(vec2(time.mul(0.004), 0))).g;
    const b = texture(nz, wp.xz.mul(0.017).add(vec2(0, time.mul(-0.006)))).b;
    const n = a.mul(0.6).add(b.mul(0.4));
    const rr = length(wp.xz.sub(vec2(CENTER.x, CENTER.z)));
    const col = mix(vec3(0.035, 0.04, 0.08), vec3(0.2, 0.2, 0.3), smoothstep(0.35, 0.8, n));
    m.colorNode = col.add(vec3(0.5, 0.45, 0.8).mul(skyU.mul(0.4)).mul(float(0.4).add(n)));
    m.opacityNode = smoothstep(78.0, 100.0, rr).mul(0.96);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(CENTER.x, this.y0 + 0.35, CENTER.z);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geo, m);
  }

  private updateAll(dt: number): void {
    const t = this.t;
    // chớp trang trí (chỉ trên cao): thưa, 7–15 s một lần, loé kép; tạm dừng khi có vùng báo sét của kiếp
    if (t >= this.nextStrike) {
      if (this.hazardActive()) this.nextStrike = t + 1;
      else {
        this.strikeAt = t;
        this.nextStrike = t + 7 + hash01(Math.floor(t * 10), 7, 8801) * 8;
      }
    }
    const s = t - this.strikeAt;
    const f = s < 0 ? 0 : Math.max(Math.exp(-s / 0.09), s > 0.2 ? 0.75 * Math.exp(-(s - 0.2) / 0.13) : 0);
    // sàn: chỉ chớp do tia sét thật của kiếp; trời: thêm chớp trang trí
    const real = postParams.flash.value * 1.2;
    flashU.value = real;
    skyU.value = Math.max(f, real);

    // hạt điện bốc dọc tám lôi trụ
    if (this.motes) {
      const a = this.motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MOTE_N; i++) {
        const s0 = this.seeds[i * 4]!;
        const s1 = this.seeds[i * 4 + 1]!;
        const s2 = this.seeds[i * 4 + 2]!;
        const s3 = this.seeds[i * 4 + 3]!;
        const pl = PILLARS[Math.floor(s0 * 8)]!;
        const life = (t * (0.09 + 0.07 * s1) + s2) % 1;
        a.setXYZ(
          i,
          CENTER.x + pl.x + (s1 - 0.5) * 3 + Math.sin(t * 0.7 + s3 * 6) * 0.9,
          this.y0 + 1 + life * 11,
          CENTER.z + pl.z + (s3 - 0.5) * 3 + Math.cos(t * 0.6 + s1 * 6) * 0.9,
        );
      }
      a.needsUpdate = true;
    }

    // mưa
    const ra = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < RAIN_N; i++) {
      const ang = this.rainSeed[i * 3]! * Math.PI * 2;
      const rad = Math.sqrt(this.rainSeed[i * 3 + 1]!) * 62;
      const y = 44 - ((t * (30 + 12 * this.rainSeed[i * 3 + 2]!) + this.rainSeed[i * 3 + 2]! * 44) % 44);
      const x = CENTER.x + Math.cos(ang) * rad + y * 0.12;
      const z = CENTER.z + Math.sin(ang) * rad;
      ra.setXYZ(i * 2, x, this.y0 + y, z);
      ra.setXYZ(i * 2 + 1, x + 0.2, this.y0 + y + 1.6, z);
    }
    ra.needsUpdate = true;

    // hồ quang: dựng lại ~14 lần/giây, chỉ hiện quanh lúc chớp và thỉnh thoảng
    this.arcClock += dt;
    const arcsOn = f > 0.15 || Math.sin(t * 1.7) > 0.35;
    this.arcs.visible = arcsOn;
    if (arcsOn && this.arcClock > 0.07) {
      this.arcClock = 0;
      const aa = this.arcs.geometry.attributes.position as THREE.BufferAttribute;
      let w = 0;
      for (const [p, q] of ARCS) {
        let px = CENTER.x + p.x;
        let py = this.y0 + TIP_Y;
        let pz = CENTER.z + p.z;
        for (let k = 1; k <= ARC_SEG; k++) {
          const u = k / ARC_SEG;
          const jit = k === ARC_SEG ? 0 : 1.6;
          const nx = CENTER.x + p.x + (q.x - p.x) * u + (Math.random() - 0.5) * jit;
          const ny = this.y0 + TIP_Y + Math.sin(u * Math.PI) * 3.2 + (Math.random() - 0.5) * jit;
          const nz = CENTER.z + p.z + (q.z - p.z) * u + (Math.random() - 0.5) * jit;
          aa.setXYZ(w++, px, py, pz);
          aa.setXYZ(w++, nx, ny, nz);
          px = nx;
          py = ny;
          pz = nz;
        }
      }
      aa.needsUpdate = true;
    }

    // đá vụn lơ lửng
    for (let i = 0; i < DEBRIS_N; i++) {
      const s0 = this.debrisSeed[i * 4]!;
      const s1 = this.debrisSeed[i * 4 + 1]!;
      const s2 = this.debrisSeed[i * 4 + 2]!;
      const s3 = this.debrisSeed[i * 4 + 3]!;
      const ang = s0 * Math.PI * 2 + t * 0.03 * (0.5 + s3);
      // camera chéo: đá thấp và nhỏ, không bay tới ngang tầm camera (từ trên thành tấm đen đặc che người)
      const rad = 14 + s1 * 32;
      const y = this.y0 + 1.2 + s2 * 4 + Math.sin(t * 0.4 + s3 * 9) * 0.4;
      this.tmp.position.set(CENTER.x + Math.cos(ang) * rad, y, CENTER.z + Math.sin(ang) * rad);
      this.tmp.rotation.set(t * 0.15 * s0 + s3 * 6, t * 0.12 * s1 + s2 * 6, s0 * 2);
      const sc = 0.25 + s3 * s3 * 0.55;
      this.tmp.scale.set(sc * (0.8 + s0 * 0.5), sc, sc * (0.7 + s1 * 0.6));
      this.tmp.updateMatrix();
      this.debris.setMatrixAt(i, this.tmp.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  /** Gọi một tia chớp ngay (kịch bản chụp ảnh, và có thể nối vào tia sét kiếp). */
  strike(): void {
    this.strikeAt = this.t;
    this.nextStrike = Math.max(this.nextStrike, this.t + 2.5);
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    this.updateAll(dt);
  }

  dispose(): void {
    this.fx.dispose();
    this.debris.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
