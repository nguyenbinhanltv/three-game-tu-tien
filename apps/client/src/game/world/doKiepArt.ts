import * as THREE from 'three/webgpu';
import { float, mix, normalWorld, positionWorld, smoothstep, sin, texture, time, vec3, vertexColor } from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { hash01 } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';

/**
 * Cảnh Độ Kiếp (DUN-1 PR7; chỉ để nhìn, không đổi kịch bản kiếp/vòng trận môn/điểm đứng): Thiên Lôi Đài trên đỉnh núi dưới mây bão.
 * GLB Blender `arch_do_kiep` (đài lát đá khảm bát quái sát mặt sân, tám lôi trụ đỉnh thu lôi đồng, bốn đỉnh đồng than hồng, vết sét cháy, tảng đá nung, tùng cháy)
 * nạp ở `engine/levelLoad.ts` `loadDkModel`. File này dựng phần động: vật liệu đá/khảm vàng, sương thấp, vòng cổng ra, quầng đỉnh đồng, hạt điện bốc quanh lôi trụ,
 * và nhịp "chớp" chậm làm khảm vàng sáng bừng như bị trời lay.
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

/** Vùng cấm đặt hiệu ứng ngẫu nhiên: quanh đài và lối vào phía nam. */
export function dkKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 24);
}

/**
 * Vật liệu thay cho glTF của GLB `arch_do_kiep`:
 *  - `_rune` (khảm vàng bát quái, than hồng trong đỉnh, cầu điện): phát sáng theo màu đỉnh, nhấp nhô chậm rồi "chớp" mạnh ngắn theo chu kỳ ~9 s;
 *  - `_jade` (hoa cương): thớ đá nhiễu theo toạ độ thế giới, mặt hướng lên đậm lạnh hơn (mưa ẩm), chân tối.
 */
export function dkMaterialFor(name: string): THREE.Material | null {
  if (name.endsWith('_rune')) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.2, name });
    const wp = positionWorld;
    const n = texture(getCloudNoise(), wp.xz.mul(0.05).add(time.mul(0.02))).g;
    const slow = float(0.75).add(sin(time.mul(0.9).add(n.mul(6))).mul(0.18));
    // chớp: cạnh sắc, rơi nhanh (chu kỳ 9 s)
    const ph = time.mul(0.111).fract();
    const flash = smoothstep(0.0, 0.03, ph)
      .mul(smoothstep(0.16, 0.03, ph))
      .mul(1.4);
    m.colorNode = vec3(0.04, 0.035, 0.03);
    m.emissiveNode = vertexColor().mul(slow.add(flash).mul(0.55));
    return m;
  }
  if (name.endsWith('_jade')) {
    const nz = getCloudNoise();
    const wp = positionWorld;
    const fine = texture(nz, wp.xz.mul(1.7).add(wp.y.mul(1.1))).g;
    const speck = texture(nz, wp.xy.mul(6.0).add(wp.z.mul(2.6))).b;
    const up = smoothstep(0.55, 0.95, normalWorld.y);
    const base = vertexColor().mul(float(0.72).add(fine.mul(0.36)).add(speck.mul(0.14)));
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0.02, name });
    m.colorNode = mix(base, base.mul(vec3(0.84, 0.9, 1.05)), up.mul(0.6));
    return m;
  }
  return null;
}

const MOTE_N = 140;

export class DoKiepArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];
  private motes: THREE.Points | null = null;
  private readonly seeds: number[] = [];
  private t = 0;

  constructor() {
    this.group.name = 'do-kiep-art';
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: dkKeepOut,
      mist: { a: [0.12, 0.14, 0.2], b: [0.34, 0.4, 0.55], innerR: 30, outerR: 90, opacity: 0.22 },
      ring: { rgb: '188,212,255', mote: 0xbcd4ff },
    });
    this.group.add(this.fx.group);
    const pts = CAULDRONS.map(([dx, dz]) => ({ x: CENTER.x + dx, y: heightAt(CENTER.x + dx, CENTER.z + dz) + 3.6, z: CENTER.z + dz }));
    const halos = createLanternHalos(pts, 9, 0xff8a3a);
    this.group.add(halos);
    this.disposables.push(halos.geometry, halos.material as THREE.Material);
    for (let i = 0; i < MOTE_N; i++) this.seeds.push(hash01(i, 1, 9901), hash01(i, 2, 9901), hash01(i, 3, 9901), hash01(i, 4, 9901));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_N * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, heightAt(CENTER.x, CENTER.z) + 10, CENTER.z), 90);
    const m = new THREE.PointsMaterial({
      color: 0xbcd8ff,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(g, m);
    this.motes.name = 'dk-motes';
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.disposables.push(g, m);
    this.updateMotes();
  }

  /** Hạt điện lơ lửng bốc dọc tám lôi trụ (r 36) rồi tan; cập nhật trên CPU. */
  private updateMotes(): void {
    if (!this.motes) return;
    const a = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < MOTE_N; i++) {
      const s0 = this.seeds[i * 4]!;
      const s1 = this.seeds[i * 4 + 1]!;
      const s2 = this.seeds[i * 4 + 2]!;
      const s3 = this.seeds[i * 4 + 3]!;
      const ang = Math.floor(s0 * 8) * (Math.PI / 4) + 0.2;
      const life = (this.t * (0.09 + 0.07 * s1) + s2) % 1;
      const x = CENTER.x + Math.cos(ang) * 36 + (s1 - 0.5) * 3 + Math.sin(this.t * 0.7 + s3 * 6) * 0.9;
      const z = CENTER.z + Math.sin(ang) * 36 + (s3 - 0.5) * 3 + Math.cos(this.t * 0.6 + s1 * 6) * 0.9;
      a.setXYZ(i, x, heightAt(CENTER.x, CENTER.z) + 1 + life * 11, z);
    }
    a.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    this.updateMotes();
  }

  dispose(): void {
    this.fx.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
