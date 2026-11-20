import * as THREE from 'three/webgpu';
import { float, fract, mix, normalWorld, positionLocal, positionWorld, smoothstep, texture, time, vec3, vertexColor } from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';
import { xichCracks } from './xichArt';

/**
 * Cảnh Xích Tẫn Khích (DUN-1 PR6; chỉ để nhìn, không đổi vùng boss/đợt quái/bia giữ/ba khe mạch/cổng): hẻm núi lửa tàn đỏ-đen.
 * Địa hình và màu đất ở `xichArt.ts` (đen than núi lửa, không tím); GLB Blender `arch_xich_tan` (cụm cột bazan lục giác có khe than hồng, mảnh obsidian, vỏ dung nham
 * nguội nứt, miệng phun, cây cháy xém, cột cờ gãy, xương + mũ giáp, lò sắt) nạp ở `engine/levelLoad.ts` `loadXkModel`. File này dựng phần động: vết nứt dung nham LÕM có gờ đá
 * (thay màn đỏ dày của `riftVeil`; ba đường chính + khe nhánh, đáy than hồng nhấp nháy mềm), sương tro thấp, quầng lò sắt than hồng.
 */

const SEED = 20261119;
const DG = LEVELS.xich_tan_khich!.dungeon!;
const CENTER = DG.center;

/** Tám lò sắt (khớp `put('brazier', …)` ở `tools/blender/xich_tan_arch.py`): toạ độ tương đối tâm hẻm. */
const BRAZIERS: readonly [number, number][] = [
  [-24, -50],
  [24, -50],
  [-26, 30],
  [26, 30],
  [-14, -68],
  [14, -68],
  [-28, -10],
  [28, -10],
];

/** Vùng cấm đặt vết nứt ngẫu nhiên: quanh bia giữ và lối vào phía nam. */
function xkKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 34);
}

/**
 * Vật liệu thay cho glTF của GLB `arch_xich_tan`:
 *  - `_obs` (cột bazan): đá đen nhám có thớ (nhiễu theo toạ độ thế giới kéo dọc), vết nứt mảnh phát sáng đỏ than ở chân cột (theo độ cao cục bộ), tro xám phủ mặt hướng lên (pháp tuyến);
 *  - `_ember` (dung nham trong khe/phiến/miệng phun): phát sáng theo màu đỉnh (gradient vàng cam → đỏ thẫm bake trong Blender), nhấp nháy rất chậm.
 * Vật liệu khác giữ nguyên.
 */
export function xkMaterialFor(name: string): THREE.Material | null {
  if (name.endsWith('_ember')) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, name });
    const wp = positionWorld;
    const flick = float(0.9).add(
      texture(getCloudNoise(), wp.xz.mul(0.08).add(time.mul(0.03)))
        .g.sub(0.5)
        .mul(0.3),
    );
    m.colorNode = vec3(0.02, 0.01, 0.008);
    m.emissiveNode = vertexColor().mul(1.15).mul(flick);
    return m;
  }
  if (name.endsWith('_obs')) {
    // Đá bazan đen nhám: hạt mịn đẳng hướng (không kéo dọc nên không ra thớ gỗ), vết nứt THẲNG/GÓC CẠNH: hai họ đường thẳng chéo nhau theo toạ độ thế giới (|fract| tam giác,
    // chỉ hiện ở vài ô), ánh đỏ chỉ nằm trong khe nứt và chân cột; mặt hướng lên và đỉnh gãy phủ tro xám.
    const nz = getCloudNoise();
    const wp = positionWorld;
    const fine = texture(nz, wp.xz.mul(2.2).add(wp.y.mul(1.3))).g;
    const speck = texture(nz, wp.xy.mul(7.0).add(wp.z.mul(3.0))).b;
    const lineA = fract(wp.y.mul(0.9).add(wp.x.mul(0.45)))
      .sub(0.5)
      .abs();
    const lineB = fract(wp.y.mul(0.7).sub(wp.z.mul(0.6)).add(0.31))
      .sub(0.5)
      .abs();
    const cell = texture(nz, wp.xz.mul(0.35).add(wp.y.mul(0.22))).a;
    const crackMask = smoothstep(0.62, 0.78, cell);
    const crack = smoothstep(0.018, 0.0, lineA.min(lineB)).mul(crackMask);
    const ash = smoothstep(0.5, 0.85, normalWorld.y);
    const base = vertexColor().mul(float(0.7).add(fine.mul(0.35)).add(speck.mul(0.15)));
    const withAsh = mix(base, vec3(0.4, 0.39, 0.38).mul(float(0.75).add(speck.mul(0.45))), ash.mul(0.9));
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0.04, name });
    m.colorNode = withAsh.mul(float(1).sub(crack.mul(0.7)));
    const low = smoothstep(6.0, 0.0, positionLocal.y);
    m.emissiveNode = vec3(1.0, 0.34, 0.08)
      .mul(crack)
      .mul(float(0.35).add(low.mul(0.9)))
      .mul(float(1).sub(ash));
    return m;
  }
  return null;
}

const EMBER_N = 150;

export class XichTanArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];
  private embers: THREE.Points | null = null;
  private readonly emberSeed: number[] = [];
  private readonly emberSrc: { x: number; z: number }[] = [];
  private t = 0;

  constructor() {
    this.group.name = 'xich-tan-art';
    const def = levelTerrain().def;
    const paths = xichCracks(def, (x, z) => heightAt(x, z));
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: xkKeepOut,
      cracks: {
        count: 16,
        rMin: 24,
        rMax: 72,
        floor: [0.55, 0.1, 0.03],
        core: [1.0, 0.62, 0.2],
        lip: 2.2,
        halo: [0.5, 0.16, 0.04],
        rock: [0.1, 0.08, 0.07],
        w0: 0.32,
        w1: 0.6,
        glowW: 0.62,
        paths,
        pathW: 1.05,
        fade: [24, 52],
      },
      mist: { a: [0.1, 0.075, 0.065], b: [0.3, 0.22, 0.18], innerR: 24, outerR: 80, opacity: 0.3 },
    });
    this.group.add(this.fx.group);
    const pts = BRAZIERS.map(([dx, dz]) => ({ x: CENTER.x + dx, y: heightAt(CENTER.x + dx, CENTER.z + dz) + 2.6, z: CENTER.z + dz }));
    const halos = createLanternHalos(pts, 4.5, 0xff6a2a);
    this.group.add(halos);
    this.disposables.push(halos.geometry, halos.material as THREE.Material);
    // hạt than/tro bốc lên từ các khe (lấy mẫu dọc ba đường chính), cộng sáng, cập nhật trên CPU
    for (const path of paths) for (let i = 0; i < path.length; i += 1) this.emberSrc.push({ x: path[i]!.x, z: path[i]!.z });
    for (let i = 0; i < EMBER_N; i++) this.emberSeed.push(hash01(i, 1, 7701), hash01(i, 2, 7701), hash01(i, 3, 7701), hash01(i, 4, 7701));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBER_N * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, heightAt(CENTER.x, CENTER.z) + 8, CENTER.z), 120);
    const m = new THREE.PointsMaterial({
      color: 0xff9a50,
      size: 0.34,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.embers = new THREE.Points(g, m);
    this.embers.name = 'xk-embers';
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
    this.disposables.push(g, m);
    this.updateEmbers();
  }

  private updateEmbers(): void {
    if (!this.embers || !this.emberSrc.length) return;
    const a = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < EMBER_N; i++) {
      const s0 = this.emberSeed[i * 4]!;
      const s1 = this.emberSeed[i * 4 + 1]!;
      const s2 = this.emberSeed[i * 4 + 2]!;
      const s3 = this.emberSeed[i * 4 + 3]!;
      const src = this.emberSrc[Math.floor(s0 * this.emberSrc.length) % this.emberSrc.length]!;
      const life = (this.t * (0.07 + 0.08 * s1) + s2) % 1;
      const x = src.x + (s1 - 0.5) * 3 + Math.sin(this.t * 0.6 + s3 * 6) * 0.8 * life;
      const z = src.z + (s3 - 0.5) * 3 + Math.cos(this.t * 0.5 + s1 * 6) * 0.8 * life;
      a.setXYZ(i, x, heightAt(src.x, src.z) + 0.4 + life * (3 + 6 * s2), z);
    }
    a.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    this.updateEmbers();
  }

  dispose(): void {
    this.fx.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
