import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  length,
  max,
  mix,
  normalize,
  normalView,
  normalWorld,
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
} from 'three/tsl';
import { LEVELS } from '@dtl/content';
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
 * Bầu trời đêm trăng bạc (hàm TSL dùng chung cho vòm, sàn gương, mặt nước và gương): `dir` là hướng nhìn (đơn vị, y lên). Chân trời bạc xám sáng → thiên đỉnh
 * chàm sâu; trăng tròn lớn (đĩa ngà + quầng) ở phía bắc cao ~50°; mây mỏng trôi chậm ngả bạc về phía trăng; sao li ti. Không có ánh sáng thật,
 * chỉ là màu theo hướng nên dùng được cho cả phản chiếu (lấy hướng phản xạ thay hướng nhìn).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function skyColor(dir: any): any {
  const nz = getCloudNoise();
  const h = clamp(dir.y, 0, 1);
  const base = mix(vec3(0.3, 0.37, 0.52), vec3(0.025, 0.04, 0.13), pow(h, 0.4));
  const moonDir = normalize(vec3(0.0, 0.68, -0.73));
  const md = max(dot(dir, moonDir), 0);
  const disc = smoothstep(0.9915, 0.9935, md);
  const halo = pow(md, 28).mul(0.55).add(pow(md, 5).mul(0.14));
  const proj = vec2(dir.x, dir.z).div(h.add(0.32));
  const wind = vec2(time.mul(0.0025), time.mul(0.001));
  const c1 = texture(nz, proj.mul(0.45).add(wind)).a;
  const c2 = texture(nz, proj.mul(1.3).add(wind.mul(1.7))).g;
  const cloud = smoothstep(0.55, 0.88, c1.mul(0.7).add(c2.mul(0.3)))
    .mul(smoothstep(0.04, 0.3, h))
    .mul(0.5);
  const lit = mix(vec3(0.5, 0.56, 0.7), vec3(0.95, 0.96, 1.0), pow(md, 3));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any = mix(base, lit, cloud);
  col = col.add(vec3(0.7, 0.78, 1.0).mul(halo)).add(vec3(1.0, 0.98, 0.9).mul(disc).mul(1.6));
  const st = texture(nz, proj.mul(6.5)).g;
  const stars = smoothstep(0.93, 0.985, st)
    .mul(smoothstep(0.2, 0.6, h))
    .mul(float(1).sub(cloud))
    .mul(0.8);
  return col.add(vec3(0.85, 0.9, 1.0).mul(stars));
}

/**
 * Vật liệu gương thay cho `arch_sect_glass`: mặt gương PHẢN CHIẾU bầu trời (lấy `skyColor` theo hướng phản xạ, pháp tuyến lắc nhẹ theo nhiễu như gương đồng
 * mài tay) ngả bạc; vệt sáng chéo từ màu đỉnh (Blender) làm điểm nhấn; fresnel viền sáng. Các vật liệu khác giữ nguyên.
 */
export function knMaterialFor(name: string): THREE.Material | null {
  if (!name.endsWith('_glass')) return null;
  const nz = getCloudNoise();
  const jitter = texture(nz, positionWorld.xy.mul(0.09).add(positionWorld.z.mul(0.05)))
    .rgb.sub(0.5)
    .mul(0.42);
  const n = normalize(normalWorld.add(jitter));
  const v = normalize(positionWorld.sub(cameraPosition));
  const r = v.sub(n.mul(dot(n, v).mul(2)));
  const refl = skyColor(vec3(r.x, abs(r.y), r.z));
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.2);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.55, name });
  m.colorNode = vec3(0.04, 0.05, 0.07);
  // vệt sáng chéo bắt trăng chạy qua mặt gương (theo toạ độ thế giới → mỗi gương một vệt khác nhau) + gradient sáng dần lên cao
  const streak = smoothstep(0.55, 0.95, sin(positionWorld.x.add(positionWorld.z).mul(0.21).add(positionWorld.y.mul(0.13))));
  const glint = vec3(0.85, 0.92, 1.0).mul(streak).mul(0.9);
  m.emissiveNode = refl
    .mul(vec3(0.85, 0.9, 1.0))
    .mul(0.75)
    .add(glint)
    .add(vec3(0.6, 0.72, 1.0).mul(fres).mul(0.5))
    .add(vertexColorStreak());
  return m;
}

/** Vệt sáng chéo bake trong màu đỉnh (Blender) → thêm nhẹ vào phát sáng của gương. */
function vertexColorStreak() {
  return vec3(0.75, 0.85, 1.0).mul(1.1).mul(vertexColor().r.pow(2.0));
}

/** Vỏ vòm: sương trời đêm bạc từ `skyColor` (shader theo hướng, vòm dẹt h/r nên đổi hướng về cầu đơn vị). Một draw call. */
export function buildMoonDomeShell(def: { x: number; z: number; r: number; h: number }, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, def.x + pos.getX(i) * def.r, groundY + pos.getY(i) * def.h, def.z + pos.getZ(i) * def.r);
  geo.computeBoundingSphere();
  const d = positionWorld.sub(vec3(def.x, groundY, def.z));
  const dir = normalize(vec3(d.x.div(def.r), d.y.div(def.h), d.z.div(def.r)));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  mat.colorNode = skyColor(dir);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'moon-dome-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Sàn/mặt nước phản chiếu bầu trời (shader TSL, không phản chiếu vật thể): `marble` = cẩm thạch trắng xám có vân (nhám thấp, phản chiếu theo Fresnel: nhìn
 * lướt thì soi trời); `water` = mặt nước tĩnh tối, soi mạnh, gợn nhẹ. Hướng phản xạ lấy từ hướng nhìn lật qua mặt phẳng ngang, đưa vào `skyColor`.
 * Marble: vành bạc mảnh phát sáng (hai vòng quanh đài chiến r 57/59,5, vòng r 20, 72 vạch chia nhỏ, 9 cánh hoa mảnh), vũng sáng trăng dưới hai khe hở,
 * tối dần ra góc điện (tương phản sáng/tối).
 */
function reflectiveSurface(
  kind: 'marble' | 'water',
  _radius: number,
  geo: THREE.BufferGeometry,
  centerX: number,
  centerZ: number,
): THREE.Mesh {
  const nz = getCloudNoise();
  const w = positionWorld.xz.sub(vec2(centerX, centerZ));
  const r = length(w);
  const rip = texture(nz, w.mul(1 / 11).add(vec2(time.mul(0.008), time.mul(0.006)))).g.sub(0.5);
  const rip2 = texture(nz, w.mul(1 / 3.4).sub(vec2(time.mul(0.012), 0))).b.sub(0.5);
  const v0 = normalize(positionWorld.sub(cameraPosition));
  const tilt = kind === 'water' ? vec3(rip.mul(0.05), 0, rip2.mul(0.05)) : vec3(rip.mul(0.012), 0, rip2.mul(0.012));
  const v = normalize(v0.add(tilt));
  const cosT = clamp(v.y.negate(), 0, 1);
  const fres = pow(float(1).sub(cosT), 3.0);
  const refl = skyColor(vec3(v.x, v.y.negate().add(0.02), v.z));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any;
  const edgeDark = float(1).sub(smoothstep(40.0, 100.0, r).mul(0.8));
  if (kind === 'marble') {
    const vein = abs(texture(nz, w.mul(1 / 8.5)).a.sub(0.5));
    const vein2 = abs(texture(nz, w.mul(1 / 3.1).add(0.37)).g.sub(0.5));
    const veins = smoothstep(0.03, 0.0, vein)
      .mul(0.5)
      .add(smoothstep(0.02, 0.0, vein2).mul(0.25));
    const tone = texture(nz, w.mul(1 / 23)).b;
    const stone = mix(vec3(0.24, 0.26, 0.32), vec3(0.46, 0.46, 0.5), tone).mul(float(1).sub(veins.mul(0.5)));
    const ang = atan(w.y, w.x);
    const soft = (rad: number, wd: number) => exp(abs(r.sub(rad)).div(wd).pow(2).negate());
    const thin = (rad: number, wd: number) => smoothstep(wd, 0.0, abs(r.sub(rad)));
    // vạch trận mảnh phát sáng bạc mềm + hoa văn: vạch chia (72) và chấm cánh hoa (9)
    const ticks = smoothstep(0.7, 0.9, abs(sin(ang.mul(36)))).mul(thin(58.3, 1.1));
    const petals = smoothstep(0.035, 0.0, abs(sin(ang.mul(4.5))))
      .mul(smoothstep(21, 26, r))
      .mul(smoothstep(56, 50, r));
    const line = thin(57, 0.16).add(thin(59.6, 0.1)).add(thin(20, 0.14)).add(thin(40, 0.08)).add(ticks.mul(0.7)).add(petals.mul(0.5));
    const glow = soft(57, 2.4).add(soft(59.6, 1.6)).add(soft(20, 1.6)).mul(0.18);
    const silver = vec3(0.78, 0.86, 1.0)
      .mul(line)
      .add(vec3(0.55, 0.68, 1.0).mul(glow));
    // vũng sáng trăng: dưới hai khe hở và một vệt lớn ở bắc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pools: any = float(0);
    for (const o of KN_OCULI)
      pools = pools.add(
        exp(
          length(positionWorld.xz.sub(vec2(o.x, o.z)))
            .div(15)
            .pow(2)
            .negate(),
        ),
      );
    pools = pools.add(
      exp(
        length(w.sub(vec2(0, -48)))
          .div(26)
          .pow(2)
          .negate(),
      ).mul(0.6),
    );
    const lightMul = float(0.28).add(pools.mul(1.0));
    col = stone
      .mul(lightMul)
      .mul(edgeDark)
      .add(refl.mul(fres.mul(0.95).add(0.05)).mul(edgeDark))
      .add(silver);
  } else {
    const base = vec3(0.025, 0.04, 0.075);
    col = base.add(refl.mul(fres.mul(0.75).add(0.22)));
  }
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(centerX, 0, centerZ);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Sàn cẩm thạch phản chiếu (đĩa r 112 bám `heightAt` + 0,08 m). */
export function buildMirrorFloorKn(): THREE.Mesh {
  const R = 112;
  const geo = new THREE.RingGeometry(0.01, R, 128, 48).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  // bám đúng địa hình (+0,08 m) như sàn cũ: người chơi/quái đứng theo `heightAt` nên sàn không được cao hơn mặt đất thật
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(CENTER.x + p.getX(i), CENTER.z + p.getZ(i)) + 0.08);
  geo.computeBoundingSphere();
  const mesh = reflectiveSurface('marble', R, geo, CENTER.x, CENTER.z);
  mesh.name = 'kn-mirror-floor';
  return mesh;
}

/** Hồ nước tĩnh soi trăng (đĩa r `rad`, cao hơn sàn 0,14 m): ba hồ ở phía bắc và hai bên, ngoài khu đánh. */
export function buildPond(x: number, z: number, rad: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(rad, 48).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(x + p.getX(i), z + p.getZ(i)) + 0.14);
  geo.computeBoundingSphere();
  const mesh = reflectiveSurface('water', 200, geo, x, z);
  mesh.name = 'kn-pond';
  mesh.renderOrder = 0;
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
    // ba hồ nước tĩnh (r 9–12): bắc (trước vòng gương trăng) và hai bên, tránh khu giữa và lối vào
    for (const [dx, dz, rad] of [
      [0, -80, 11],
      [-62, -50, 9],
      [62, -50, 9],
    ] as const) {
      const pond = buildPond(CENTER.x + dx, CENTER.z + dz, rad);
      this.group.add(pond);
      this.disposables.push(pond.geometry, pond.material as THREE.Material);
    }
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
