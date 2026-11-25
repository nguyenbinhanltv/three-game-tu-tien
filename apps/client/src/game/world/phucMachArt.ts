import * as THREE from 'three/webgpu';
import { propsOf } from '@dtl/shared';
import { float, mix, normalView, positionViewDirection, pow, smoothstep, uv, vec3, vertexColor } from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { heightAt } from '../../base/levelCtx';
import { DungeonFx } from './dungeonFx';
import { CENTER, SEED, pmGroundColor } from './phucMachColor';

export { pmGroundColor };

/**
 * Cảnh Phục Mạch Quật (DUN-1 PR2; chỉ để nhìn, KHÔNG va chạm, không đổi vùng boss/đợt quái/cổng): hầm mỏ cũ của Tàng Mạch Hội.
 * Phần dựng bằng Blender (`arch_phuc_mach`: cụm mạch tinh khổng lồ, cột đá sa thạch, khung chống gỗ, cửa hầm + ray + xe quặng, nhũ đá, mạch tinh treo trần)
 * nạp ở `engine/levelLoad.ts` `loadPmModel`. File này dựng phần thủ tục: màu đất, mạng mạch tinh khắc sàn đài chiến, khe nứt lõm có ánh lục, bụi hầm
 * (`DungeonFx`) và vòng trận cổng ra.
 */


/** Tâm vòm hang và kích thước (khớp `cave` trong `phuc_mach.assets.json` và `DOME_R/DOME_H` của `phuc_mach_arch.py`). */
export const PM_DOME = { r: 135, h: 75 };

/** Ba khe hở trên trần (rọi tia sáng xuống): toạ độ thế giới, khớp `OCULI` trong `tools/blender/phuc_mach_arch.py` (r 55 quanh tâm hầm). */
export const PM_OCULI: readonly { x: number; z: number }[] = [0.9, 2.9, 5.0].map((a) => ({
  x: CENTER.x + Math.cos(a) * 55,
  z: CENTER.z + Math.sin(a) * 55,
}));

/**
 * Vật liệu tinh thể thay cho vật liệu glTF của mạch tinh (`arch_sect_vein`, `arch_sect_crystal`): màu đỉnh là gradient chân tối → lõi sáng ở mũi
 * (Blender), dùng làm phát sáng; thêm fresnel viền sáng, mặt giữa sẫm như có chiều sâu. `crystal` (kính sẫm) chỉ bắt viền sáng. Trả null nếu không phải vật liệu tinh thể.
 */
export function pmMaterialFor(name: string): THREE.Material | null {
  const isVein = name.endsWith('_vein');
  if (!isVein && !name.endsWith('_crystal')) return null;
  const vc = vertexColor();
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.2);
  // Như PROP-1 (`propCrystal`): màu đỉnh là gradient chân tối → lõi sáng ở mũi (Blender, 14 vòng); lõi nóng ở mũi (pha cùng sắc), fresnel viền cùng sắc màu đỉnh,
  // mặt giữa sẫm nên có chiều sâu thay vì mảng trắng phẳng.
  const lum = vc
    .dot(vec3(0.3, 0.5, 0.2))
    .mul(2.2)
    .clamp(0, 1);
  const core = vc.mul(float(1).add(lum.mul(lum).mul(0.9)));
  const rim = vc
    .normalize()
    .mul(fres)
    .mul(isVein ? 0.7 : 0.55);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: isVein ? 0.12 : 0.08, metalness: isVein ? 0.05 : 0.3, name });
  m.colorNode = vc.mul(isVein ? 0.3 : 0.55);
  m.emissiveNode = isVein ? core.mul(0.8).add(rim) : vc.mul(0.45).add(rim);
  return m;
}

/** Vùng cấm đặt vật: khu giữa đài chiến và lối vào phía nam (dải 9 m). */
export function pmKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 0);
}

/** Mạng mạch tinh khắc sàn đài chiến: thân mạch chính tỏa tám hướng, phân nhánh nhỏ, vòng tròn mảnh; vẽ canvas, cộng sáng mờ (một draw call). */
function veinTexture(): THREE.CanvasTexture {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const h = N / 2;
  g.lineCap = 'round';
  let s = SEED >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    if (len < 12 || depth > 3) return;
    g.strokeStyle = `rgba(70,200,165,${0.22 + 0.12 * (3 - depth)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    let cx = x;
    let cy = y;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.5) * 0.7;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      g.lineTo(cx, cy);
    }
    g.stroke();
    if (rnd() < 0.8) branch(cx, cy, a + 0.7 + rnd() * 0.4, len * 0.55, w * 0.65, depth + 1);
    if (rnd() < 0.8) branch(cx, cy, a - 0.7 - rnd() * 0.4, len * 0.55, w * 0.65, depth + 1);
    if (rnd() < 0.5) branch(x + (cx - x) * 0.5, y + (cy - y) * 0.5, a + 1.0, len * 0.4, w * 0.6, depth + 1);
  };
  for (let i = 0; i < 8; i++) branch(h, h, (i / 8) * Math.PI * 2 + 0.2, h * 0.5, 2, 0);
  g.strokeStyle = 'rgba(80,200,170,0.3)';
  g.lineWidth = 3;
  for (const r of [h * 0.34, h * 0.66, h * 0.96]) {
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class PhucMachArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'phuc-mach-art';
    this.addVeins();
    this.addLight();
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: LEVELS.phuc_mach!.dungeon!.exit,
      seed: SEED,
      keepOut: pmKeepOut,
      cracks: {
        count: 22,
        rMin: 60,
        rMax: 104,
        floor: [0.16, 0.7, 0.54],
        halo: [0.08, 0.4, 0.32],
        rock: [0.34, 0.25, 0.18],
        w0: 0.14,
        w1: 0.3,
        glowW: 0.4,
      },
      mist: { a: [0.42, 0.32, 0.24], b: [0.62, 0.5, 0.36], innerR: 36, outerR: 140, opacity: 0.3 },
      ring: { rgb: '150,240,210', mote: 0xb5f7de },
    });
    this.group.add(this.fx.group);
  }

  private addVeins(): void {
    const tex = veinTexture();
    const R = 66;
    const geo = new THREE.RingGeometry(0.01, R, 96, 36).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, heightAt(CENTER.x + p.getX(i), CENTER.z + p.getZ(i)) + 0.09);
      uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
    }
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(CENTER.x, 0, CENTER.z);
    mesh.name = 'pm-veins';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  /**
   * Ánh sáng trong hang: ba tia sáng ấm rọi qua khe hở trên trần xuống vũng sáng trên nền, và vũng sáng ấm dưới mỗi đèn đá (đèn mỏ). Cộng sáng, một draw call
   * cho mọi vũng (lưới gộp, bám địa hình, cao hơn đất 0,12 m), ba draw call cho tia sáng. Không che tầm nhìn của camera (nằm dưới/xa mặt nhìn).
   */
  private addLight(): void {
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, 'rgba(255,214,150,0.9)');
    gr.addColorStop(0.45, 'rgba(255,190,110,0.35)');
    gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pools: { x: number; z: number; r: number }[] = [];
    for (const o of PM_OCULI) pools.push({ x: o.x, z: o.z, r: 12 });
    for (const p of propsOf('phuc_mach')) if (p.id === 'prop_den_da') pools.push({ x: p.x, z: p.z, r: 6 });
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const G = 8;
    for (const p of pools) {
      const base = pos.length / 3;
      for (let j = 0; j <= G; j++) {
        for (let i = 0; i <= G; i++) {
          const x = p.x + ((i / G) * 2 - 1) * p.r;
          const z = p.z + ((j / G) * 2 - 1) * p.r;
          pos.push(x, heightAt(x, z) + 0.12, z);
          uvs.push(i / G, j / G);
        }
      }
      for (let j = 0; j < G; j++) {
        for (let i = 0; i < G; i++) {
          const a = base + j * (G + 1) + i;
          idx.push(a, a + G + 1, a + 1, a + 1, a + G + 1, a + G + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'pm-pools';
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
    // tia sáng qua khe hở: hình nón cụt hở hai đầu, mờ dần xuống đáy, mép mềm theo góc nhìn
    const groundY = heightAt(CENTER.x, CENTER.z);
    for (const o of PM_OCULI) {
      const r = Math.hypot(o.x - CENTER.x, o.z - CENTER.z);
      const top = groundY + PM_DOME.h * Math.sqrt(1 - (r / PM_DOME.r) ** 2) - 0.5;
      const bot = heightAt(o.x, o.z) + 0.3;
      const h = top - bot;
      const cg = new THREE.CylinderGeometry(3.2, 7.5, h, 28, 1, true);
      const cm = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const edge = pow(normalView.dot(positionViewDirection).abs(), 1.4);
      cm.colorNode = mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.88, 0.6), smoothstep(0.2, 1.0, uv().y));
      cm.opacityNode = pow(uv().y, 1.3).mul(0.1).add(0.012).mul(edge);
      const cone = new THREE.Mesh(cg, cm);
      cone.position.set(o.x, bot + h / 2, o.z);
      cone.name = 'pm-shaft';
      cone.frustumCulled = false;
      cone.renderOrder = 3;
      this.group.add(cone);
      this.disposables.push(cg, cm);
    }
  }

  update(dt: number): void {
    this.fx.update(dt);
  }

  dispose(): void {
    this.fx.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
