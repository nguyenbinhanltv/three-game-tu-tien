import * as THREE from 'three/webgpu';
import {
  atan,
  float,
  exp,
  length,
  mix,
  normalView,
  positionViewDirection,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vertexColor,
  abs,
} from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { hash01 } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';

/**
 * Cảnh Kính Nguyệt Cung (DUN-1 PR3; chỉ để nhìn, KHÔNG va chạm, không đổi vùng boss/đợt quái/đố ba gương/cổng): điện gương trăng bạc.
 * GLB Blender `arch_kinh_nguyet` (hàng cột ngọc + vòm nhọn + gương treo, vòng gương trăng khổng lồ phía bắc, mảnh gương lơ lửng/cắm nghiêng, dây chuông gương
 * treo trần, mảnh gương vỡ, chậu sen) nạp ở `engine/levelLoad.ts` `loadKnModel`. File này dựng phần thủ tục: sàn gương (shader: phản chiếu trăng kéo dài,
 * gợn, vành bạc khảm hoa), vòm trời có trăng và sao (`buildMoonDomeShell`), sương bạc thấp, tia trăng rọi qua khe hở và vũng sáng trên sàn.
 */

const SEED = 20261119;
const CENTER = LEVELS.kinh_nguyet!.dungeon!.center;

/** Vòm điện (khớp `DOME_R/DOME_H` của `tools/blender/kinh_nguyet_arch.py`). */
export const KN_DOME = { r: 135, h: 80 };

/** Hai khe hở trên trần cho tia trăng (toạ độ thế giới, r 46 quanh tâm). */
export const KN_OCULI: readonly { x: number; z: number }[] = [1.1, 4.3].map((a) => ({
  x: CENTER.x + Math.cos(a) * 46,
  z: CENTER.z + Math.sin(a) * 46,
}));

/** Vùng cấm: khu giữa đài chiến và lối vào phía nam. */
export function knKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 10 && dz > 0);
}

/**
 * Vật liệu gương thay cho `arch_sect_glass`: màu đỉnh (Blender: vệt sáng chéo, tối dần về chân) làm phát sáng, thêm viền fresnel lam bạc; hơi kim loại
 * nên bắt thêm ánh. Các vật liệu khác giữ nguyên.
 */
export function knMaterialFor(name: string): THREE.Material | null {
  if (!name.endsWith('_glass')) return null;
  const vc = vertexColor();
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.2);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.4, name });
  m.colorNode = vc.mul(0.25);
  m.emissiveNode = vc.mul(0.5).add(vec3(0.3, 0.45, 0.8).mul(fres).mul(0.9));
  return m;
}

/** Vỏ vòm: chàm đậm dần lên cao, sao li ti, trăng sáng (đĩa + quầng) ở phía bắc cao ~50°, quầng sáng quanh ba khe hở. Một lưới màu theo đỉnh. */
export function buildMoonDomeShell(def: { x: number; z: number; r: number; h: number }, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 160, 48, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const low = new THREE.Color(0x1a2542);
  const top = new THREE.Color(0x05081a);
  const moon = new THREE.Color(0xf2f6ff);
  const halo = new THREE.Color(0x7d96d0);
  // hướng tới trăng trên cầu đơn vị (x, y, z): bắc = −z, cao ~50°
  const md = new THREE.Vector3(0, Math.sin(0.87), -Math.cos(0.87)).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    v.set(nx, ny, nz).normalize();
    pos.setXYZ(i, def.x + nx * def.r, groundY + ny * def.h, def.z + nz * def.r);
    c.copy(low).lerp(top, Math.min(1, ny * 1.15));
    // gờ ngang mờ (khung mái) để vòm không phẳng
    c.multiplyScalar(0.85 + 0.15 * Math.sin(Math.atan2(nz, nx) * 24) * Math.exp(-ny * 3));
    const ang = v.angleTo(md);
    c.lerp(halo, Math.max(0, 1 - ang / 0.55) ** 2 * 0.55);
    c.lerp(moon, smooth(0.075, 0.06, ang));
    for (const o of KN_OCULI) {
      const dd = Math.hypot(def.x + nx * def.r - o.x, def.z + nz * def.r - o.z);
      if (ny > 0.85 && dd < 14) c.lerp(halo, (1 - dd / 14) ** 1.5 * 0.7);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  mesh.name = 'moon-dome-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** smoothstep ngược (1 khi `a` ≤ e1, 0 khi ≥ e0). */
function smooth(e0: number, e1: number, a: number): number {
  const t = Math.min(1, Math.max(0, (e0 - a) / (e0 - e1)));
  return t * t * (3 - 2 * t);
}

/**
 * Sàn gương (shader TSL, không phản chiếu thật): nền chàm đen bóng; vệt phản chiếu trăng kéo dài về phía camera (dải sáng hẹp, ngả theo gợn); gợn nước
 * nhẹ từ nhiễu trôi; vành bạc khảm: hai vòng quanh đài chiến (r 57–59), vòng trong r 20, 9 cánh hoa mảnh; mép ngoài tối dần.
 * Đĩa r 112, cao hơn đất ≥ 0,08 m theo `heightAt`.
 */
export function buildMirrorFloorKn(): THREE.Mesh {
  const R = 112;
  const geo = new THREE.RingGeometry(0.01, R, 128, 48).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const cy = heightAt(CENTER.x, CENTER.z);
  for (let i = 0; i < p.count; i++) p.setY(i, Math.max(cy + 0.08, heightAt(CENTER.x + p.getX(i), CENTER.z + p.getZ(i)) + 0.08));
  geo.computeBoundingSphere();
  const w = positionWorld.xz.sub(vec2(CENTER.x, CENTER.z));
  const r = length(w);
  const nz = getCloudNoise();
  const rip = texture(nz, w.mul(1 / 17).add(vec2(time.mul(0.01), time.mul(0.007)))).g.sub(0.5);
  const rip2 = texture(nz, w.mul(1 / 5.3).sub(vec2(time.mul(0.016), 0))).b.sub(0.5);
  const base = mix(vec3(0.008, 0.012, 0.035), vec3(0.025, 0.04, 0.09), smoothstep(0.0, 100.0, r));
  // phản chiếu trăng: elip dài theo z (về phía camera mặc định), dịch lệch bởi gợn
  const mw = w.add(vec2(rip.mul(5.0), rip2.mul(3.0))).sub(vec2(0, -34));
  const streak = exp(mw.x.mul(mw.x).div(60.0).add(mw.y.mul(mw.y).div(1500.0)).negate());
  const moonRefl = vec3(0.5, 0.62, 0.95)
    .mul(streak)
    .mul(float(0.45).add(rip2.abs().mul(0.9)));
  // khảm bạc
  const ang = atan(w.y, w.x);
  const ringLine = (rad: number, wd: number) => smoothstep(wd, 0.0, abs(r.sub(rad)));
  const petals = smoothstep(0.045, 0.0, abs(sin(ang.mul(9))))
    .mul(smoothstep(20, 24, r))
    .mul(smoothstep(57, 53, r));
  const inlay = ringLine(57, 0.45).add(ringLine(59.5, 0.18)).add(ringLine(20, 0.3)).add(ringLine(40, 0.14)).add(petals.mul(0.7));
  const silver = vec3(0.4, 0.5, 0.72).mul(inlay).mul(0.7);
  const edge = smoothstep(112, 88, r);
  const sheen = vec3(0.03, 0.05, 0.1).mul(rip.add(0.5)).mul(0.22);
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = base.add(sheen).add(moonRefl).add(silver).mul(edge);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(CENTER.x, 0, CENTER.z);
  mesh.name = 'kn-mirror-floor';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export class KinhNguyetArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'kinh-nguyet-art';
    const floor = buildMirrorFloorKn();
    this.group.add(floor);
    this.disposables.push(floor.geometry, floor.material as THREE.Material);
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: LEVELS.kinh_nguyet!.dungeon!.exit,
      seed: SEED,
      keepOut: knKeepOut,
      mist: { a: [0.3, 0.38, 0.55], b: [0.55, 0.64, 0.82], innerR: 30, outerR: 130, opacity: 0.3 },
    });
    this.group.add(this.fx.group);
    this.addMoonbeams();
    this.addStars();
  }

  /** Sao: 500 điểm sáng nhỏ trên vòm (cộng sáng, một draw call), lấp lánh nhẹ theo thời gian ở shader mặc định của Points không có nên giữ tĩnh. */
  private addStars(): void {
    const n = 520;
    const arr = new Float32Array(n * 3);
    const groundY = heightAt(CENTER.x, CENTER.z);
    for (let i = 0; i < n; i++) {
      const a = hash01(i, 1, 9101) * Math.PI * 2;
      const e = Math.asin(0.2 + 0.8 * hash01(i, 2, 9101));
      arr[i * 3] = CENTER.x + Math.cos(a) * Math.cos(e) * (KN_DOME.r - 3);
      arr[i * 3 + 1] = groundY + Math.sin(e) * (KN_DOME.h - 2);
      arr[i * 3 + 2] = CENTER.z + Math.sin(a) * Math.cos(e) * (KN_DOME.r - 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER.x, groundY, CENTER.z), KN_DOME.r + 5);
    const m = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 0.9,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'kn-stars';
    pts.frustumCulled = false;
    pts.renderOrder = 0;
    this.group.add(pts);
    this.disposables.push(g, m);
  }

  /** Tia trăng qua khe hở trên trần (nón cộng sáng, mờ dần xuống nền) + vũng sáng bạc dưới chân tia. Không che tầm nhìn: mép mềm theo góc nhìn. */
  private addMoonbeams(): void {
    const groundY = heightAt(CENTER.x, CENTER.z);
    for (const o of KN_OCULI) {
      const r = Math.hypot(o.x - CENTER.x, o.z - CENTER.z);
      const top = groundY + KN_DOME.h * Math.sqrt(1 - (r / KN_DOME.r) ** 2) - 0.5;
      const bot = groundY + 0.3;
      const h = top - bot;
      const cg = new THREE.CylinderGeometry(3.5, 8, h, 28, 1, true);
      const cm = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const edge = pow(normalView.dot(positionViewDirection).abs(), 1.4);
      cm.colorNode = mix(vec3(0.55, 0.68, 1.0), vec3(0.85, 0.92, 1.0), smoothstep(0.2, 1.0, uv().y));
      cm.opacityNode = pow(uv().y, 1.3).mul(0.1).add(0.012).mul(edge);
      const cone = new THREE.Mesh(cg, cm);
      cone.position.set(o.x, bot + h / 2, o.z);
      cone.name = 'kn-moonbeam';
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
