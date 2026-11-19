import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  dot,
  normalWorld,
  normalView,
  positionViewDirection,
  uv,
  vertexColor,
  cameraPosition,
  clamp,
  exp,
  float,
  length,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { heightAt } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';

/**
 * Cảnh Thần Tàng Điện (DUN-1 PR4; chỉ để nhìn, không đổi vùng boss/đợt quái/ba cửa phong ấn/cổng): điện tàng cổ của chủ điện Thiên Khuyết, đen tím nạm vàng.
 * GLB Blender `arch_than_tang` (hàng cột + tường hốc vòm + phướn, ba cửa phong ấn khổng lồ đúng ba hướng `seals.doors`, tượng võ sĩ không mặt, đống kim ngân,
 * đèn chùm treo trần, mặt nạ vô diện phía bắc) nạp ở `engine/levelLoad.ts` `loadTtModel`. File này dựng phần thủ tục: vòm nan vàng (`buildVaultDome`), sàn
 * obsidian khảm vàng (`buildVaultFloor`), sương tím vàng và vòng trận cổng ra (`DungeonFx`).
 */

const SEED = 20261119;
const DG = LEVELS.than_tang!.dungeon!;
const CENTER = DG.center;

/** Vòm điện (khớp `DOME_R/DOME_H` của `tools/blender/than_tang_arch.py`). */
export const TT_DOME = { r: 135, h: 80 };

/** Ba hướng cửa phong ấn (độ, atan2(z, x)): khớp `seals.doors` ở `levels/than_tang.json` và `props.thantang.ts`. */
export const TT_DOOR_DEG = [200, 270, 340] as const;

/** Điểm đứng chạm cửa (toạ độ thế giới) của ba cửa: vũng sáng vàng trên sàn. */
const DOOR_POINTS = (DG.waves.find((w) => w.seals)?.seals?.doors ?? []).map((d) => ({ x: d.x, z: d.z }));

/** Vùng cấm: khu giữa đài chiến và lối vào phía nam. */
export function ttKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 10 && dz > 0);
}

/**
 * Vòm điện nan vàng (shader TSL, MỘT draw call): tím đen dần lên cao; 16 nan vàng toả từ tâm, bốn vành vàng ngang, các ô hộp tối giữa nan, giếng sáng vàng ở đỉnh;
 * bóng tối ở chân vòm (góc tối) để tương phản. Hướng tính trên cầu đơn vị (vòm dẹt h/r).
 */
export function buildVaultDome(def: { x: number; z: number; r: number; h: number }, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 128, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, def.x + pos.getX(i) * def.r, groundY + pos.getY(i) * def.h, def.z + pos.getZ(i) * def.r);
  geo.computeBoundingSphere();
  const d = positionWorld.sub(vec3(def.x, groundY, def.z));
  const dir = normalize(vec3(d.x.div(def.r), d.y.div(def.h), d.z.div(def.r)));
  const ang = atan(dir.z, dir.x);
  const h = clamp(dir.y, 0, 1);
  const nz = getCloudNoise();
  const grain = texture(nz, vec2(ang.mul(2.2), h.mul(5))).g;
  const base = mix(vec3(0.07, 0.05, 0.13), vec3(0.02, 0.015, 0.05), pow(h, 0.6)).mul(float(0.8).add(grain.mul(0.4)));
  const rib = smoothstep(0.05, 0.0, abs(sin(ang.mul(8)))).mul(smoothstep(0.05, 0.2, h));
  const ring = (y: number, w: number) => smoothstep(w, 0.0, abs(h.sub(y)));
  const rings = ring(0.28, 0.012).add(ring(0.52, 0.012)).add(ring(0.74, 0.014)).add(ring(0.9, 0.012));
  const coffer = smoothstep(0.15, 0.6, abs(sin(ang.mul(8))))
    .mul(smoothstep(0.2, 0.8, h))
    .mul(0.5);
  const gold = vec3(0.9, 0.7, 0.3);
  const lowGlow = vec3(0.3, 0.2, 0.08)
    .mul(exp(h.mul(6).negate()))
    .mul(0.7);
  const eye = smoothstep(0.965, 0.995, h);
  const col = base
    .mul(float(1).sub(coffer))
    .add(gold.mul(rib.mul(0.7).add(rings.mul(0.9))))
    .add(lowGlow)
    .add(vec3(1.0, 0.82, 0.45).mul(eye).mul(1.2));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'vault-dome-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Vị trí lư lửa vòng quanh điện (r 90, chừa cửa nam): khớp `BRAZIERS`/`BRAZIER_R` trong `tools/blender/than_tang_arch.py`. */
export function brazierSpots(): { x: number; z: number }[] {
  const n = 14;
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.2) continue;
    out.push({ x: CENTER.x + Math.cos(a) * 90, z: CENTER.z + Math.sin(a) * 90 });
  }
  return out;
}

/**
 * Vật liệu vàng cổ thay cho `arch_sect_gold`: PBR kim loại (metalness 1, roughness 0,3), albedo vàng nhạt có loang theo vị trí, khắc chìm (đường hoa văn sâu hơn nền,
 * tối và nhám hơn), mòn ở mép (sáng hơn theo Fresnel); không có env map nên thêm phát sáng "phản chiếu môi trường" (hướng phản xạ → tím sẫm ↔ vàng ấm). Các vật liệu khác giữ nguyên.
 */
export function ttMaterialFor(name: string): THREE.Material | null {
  if (!name.endsWith('_gold')) return null;
  const nz = getCloudNoise();
  const wp = positionWorld;
  const patina = texture(nz, wp.xz.mul(0.35).add(wp.y.mul(0.2))).g;
  // khắc chìm: hai họ đường sin vuông góc theo toạ độ thế giới (hoa văn mây-lưới) → rãnh tối
  const grooveA = smoothstep(0.84, 0.97, sin(wp.x.add(wp.z).mul(2.4).add(wp.y.mul(1.1))).abs());
  const grooveB = smoothstep(0.9, 0.99, sin(wp.x.sub(wp.z).mul(2.4).sub(wp.y.mul(1.7))).abs());
  const groove = clamp(grooveA.add(grooveB.mul(0.7)), 0, 1);
  const albedo = mix(vec3(0.78, 0.55, 0.2), vec3(0.95, 0.78, 0.38), patina);
  const n = normalize(normalWorld);
  const v = normalize(wp.sub(cameraPosition));
  const r = v.sub(n.mul(dot(n, v).mul(2)));
  const env = mix(vec3(0.05, 0.03, 0.09), vec3(1.0, 0.68, 0.25), smoothstep(-0.3, 0.9, r.y)).mul(0.5);
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.5);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 1.0, name });
  m.colorNode = albedo.mul(float(1).sub(groove.mul(0.55)));
  m.roughnessNode = float(0.3).add(groove.mul(0.4)).add(patina.mul(0.12));
  m.emissiveNode = env
    .mul(albedo)
    .mul(float(1).sub(groove.mul(0.7)))
    .add(vec3(1.0, 0.8, 0.45).mul(fres).mul(0.18))
    .add(vertexColor().mul(0.0));
  return m;
}

/**
 * Sàn đá đen bóng (shader TSL, không phản chiếu vật thể): nền obsidian gần đen, vân tím và vàng (hai họ vân), vết mòn (xước dài, mảng nhám), phản chiếu ấm vàng từ các lư lửa
 * và đèn chùm theo Fresnel (thêm sheen quanh vũng sáng), tối dần ra góc. Khảm vàng MẢNH phát sáng mềm có hoa văn: vòng r 20/46/64/90 (vạch chia nhỏ, chấm, cánh sen),
 * sao tám cánh trong r 20, ba đường toả ra ba cửa phong ấn có chấm dọc đường. Vũng sáng vàng ấm dưới mỗi lư lửa, ở tâm và trước ba điểm chạm cửa.
 * Đĩa r 112 bám `heightAt` + 0,08 m.
 */
export function buildVaultFloor(): THREE.Mesh {
  const R = 112;
  const geo = new THREE.RingGeometry(0.01, R, 128, 48).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(CENTER.x + p.getX(i), CENTER.z + p.getZ(i)) + 0.08);
  geo.computeBoundingSphere();
  const nz = getCloudNoise();
  const w = positionWorld.xz.sub(vec2(CENTER.x, CENTER.z));
  const r = length(w);
  const ang = atan(w.y, w.x);
  const v = normalize(positionWorld.sub(cameraPosition));
  const cosT = clamp(v.y.negate(), 0, 1);
  const fres = pow(float(1).sub(cosT), 3.0);
  // vân đá: tím (lớn) và vàng (mảnh), hai họ
  const vein = abs(texture(nz, w.mul(1 / 9)).a.sub(0.5));
  const vein2 = abs(texture(nz, w.mul(1 / 3.6).add(0.4)).g.sub(0.5));
  const vein3 = abs(texture(nz, w.mul(1 / 5.2).add(0.7)).b.sub(0.5));
  const purpleV = smoothstep(0.035, 0.0, vein)
    .mul(0.8)
    .add(smoothstep(0.02, 0.0, vein2).mul(0.4));
  const goldV = smoothstep(0.012, 0.0, vein3).mul(0.9);
  const tone = texture(nz, w.mul(1 / 21)).b;
  // mòn: xước dài (nhiễu kéo giãn theo hướng) + mảng nhám
  const scratch = smoothstep(0.62, 0.8, texture(nz, vec2(w.x.mul(0.9), w.y.mul(0.04)).add(0.3)).g)
    .mul(0.5)
    .add(smoothstep(0.62, 0.8, texture(nz, vec2(w.x.mul(0.05), w.y.mul(0.8)).add(0.1)).b).mul(0.4));
  const wear = smoothstep(0.55, 0.85, texture(nz, w.mul(1 / 6.5)).a);
  // Vùng đánh (r < ~64): đá xám đen ánh vàng ấm, sáng hơn, gần như không vân tím (vạch báo của game là thông tin né đòn, phải đọc rõ nhất trên sàn);
  // vành ngoài giữ đen tím. `inner` = 1 trong vùng đánh, về 0 quanh r 70.
  const inner = float(1).sub(smoothstep(58.0, 72.0, r));
  const outerStone = mix(vec3(0.008, 0.007, 0.016), vec3(0.026, 0.02, 0.042), tone)
    .add(vec3(0.22, 0.1, 0.36).mul(purpleV).mul(0.16))
    .add(vec3(0.85, 0.6, 0.22).mul(goldV).mul(0.22));
  const innerStone = mix(vec3(0.075, 0.068, 0.07), vec3(0.15, 0.135, 0.12), tone)
    .add(vec3(0.5, 0.36, 0.16).mul(goldV).mul(0.16))
    .add(vec3(0.22, 0.14, 0.3).mul(purpleV).mul(0.03));
  const stone = mix(outerStone, innerStone, inner);
  // vũng sáng
  const spots = [
    { x: CENTER.x, z: CENTER.z, rr: 18, k: 0.55 },
    ...DOOR_POINTS.map((d) => ({ ...d, rr: 11, k: 0.9 })),
    ...brazierSpots().map((b2) => ({ ...b2, rr: 13, k: 0.8 })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pools: any = float(0);
  for (const sp of spots)
    pools = pools.add(
      exp(
        length(positionWorld.xz.sub(vec2(sp.x, sp.z)))
          .div(sp.rr)
          .pow(2)
          .negate(),
      ).mul(sp.k),
    );
  const edgeDark = float(1).sub(smoothstep(26.0, 100.0, r).mul(0.88));
  const lit = float(0.32).add(inner.mul(0.5)).add(pools.mul(1.1));
  const warm = vec3(1.0, 0.66, 0.26);
  const cold = vec3(0.14, 0.08, 0.24);
  // phản chiếu: ấm vàng quanh vũng sáng, lạnh tím ở xa; giảm bởi mòn
  const gloss = float(1).sub(wear.mul(0.55)).sub(scratch.mul(0.35));
  const refl = mix(cold, warm, clamp(pools.mul(0.9), 0, 1))
    .mul(fres.mul(0.7).add(0.035))
    .mul(gloss);
  const sheen = warm.mul(pools).mul(0.05).mul(gloss);
  // khảm vàng mảnh + hoa văn
  const thin = (rad: number, wd: number) => smoothstep(wd, 0.0, abs(r.sub(rad)));
  const soft = (rad: number, wd: number) => exp(abs(r.sub(rad)).div(wd).pow(2).negate());
  const ticks = (rad: number, n: number, len: number) =>
    smoothstep(0.85, 0.95, abs(sin(ang.mul(n)))).mul(smoothstep(len, 0.0, abs(r.sub(rad))));
  const dots = (rad: number, n: number) =>
    smoothstep(0.5, 0.0, length(vec2(r.sub(rad), sin(ang.mul(n / 2)).mul(rad * 0.04)))).mul(
      smoothstep(0.7, 0.95, abs(sin(ang.mul(n / 2)))),
    );
  const star = smoothstep(0.05, 0.0, abs(sin(ang.mul(4)))).mul(smoothstep(20, 6, r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paths: any = float(0);
  for (const deg of TT_DOOR_DEG) {
    const a = (deg * Math.PI) / 180;
    const across = abs(w.x.mul(Math.sin(a)).sub(w.y.mul(Math.cos(a))));
    const along = w.x.mul(Math.cos(a)).add(w.y.mul(Math.sin(a)));
    const beads = smoothstep(0.55, 0.0, abs(sin(along.mul(1.1)).mul(0.5))).mul(0.5);
    paths = paths.add(
      smoothstep(0.1, 0.0, across)
        .mul(smoothstep(21, 24, along))
        .mul(smoothstep(78, 70, along))
        .mul(float(0.7).add(beads)),
    );
  }
  const line = thin(20, 0.07)
    .add(thin(46, 0.06))
    .add(thin(64, 0.1))
    .add(thin(90, 0.06))
    .add(ticks(64, 72, 0.9).mul(0.28))
    .add(ticks(46, 48, 0.7).mul(0.25))
    .add(dots(90, 90).mul(0.6))
    .add(star.mul(0.7))
    .add(paths.mul(0.8));
  const glow = soft(20, 1.2).add(soft(46, 1.1)).add(soft(64, 1.6)).add(soft(90, 1.2)).mul(0.1);
  const gold = vec3(0.98, 0.78, 0.38)
    .mul(line)
    .mul(0.9)
    .add(vec3(0.7, 0.42, 0.12).mul(glow));
  const col = stone
    .mul(lit)
    .mul(edgeDark)
    .add(refl.mul(edgeDark))
    .add(sheen.mul(edgeDark))
    .add(gold.mul(float(0.55).add(edgeDark.mul(0.45))));
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(CENTER.x, 0, CENTER.z);
  mesh.name = 'tt-floor';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export class ThanTangArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'than-tang-art';
    const floor = buildVaultFloor();
    this.group.add(floor);
    this.disposables.push(floor.geometry, floor.material as THREE.Material);
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: ttKeepOut,
      mist: { a: [0.12, 0.1, 0.14], b: [0.38, 0.32, 0.4], innerR: 30, outerR: 128, opacity: 0.34 },
    });
    this.group.add(this.fx.group);
    this.addBeams();
  }

  /** Ba tia sáng vàng nhạt từ giếng sáng trên vòm xuống sàn (nón hở cộng sáng, mờ dần xuống đáy, mép mềm theo góc nhìn), đặt lệch tâm để không cắt cạnh vùng đánh. */
  private addBeams(): void {
    const groundY = heightAt(CENTER.x, CENTER.z);
    for (const a of [0.7, 2.6, 4.7]) {
      const bx = CENTER.x + Math.cos(a) * 44;
      const bz = CENTER.z + Math.sin(a) * 44;
      const r = Math.hypot(bx - CENTER.x, bz - CENTER.z);
      const top = groundY + TT_DOME.h * Math.sqrt(1 - (r / TT_DOME.r) ** 2) - 0.5;
      const bot = heightAt(bx, bz) + 0.3;
      const h = top - bot;
      const cg = new THREE.CylinderGeometry(3.2, 7.5, h, 32, 1, true);
      const cm = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const edge = pow(normalView.dot(positionViewDirection).abs(), 1.4);
      cm.colorNode = mix(vec3(0.95, 0.7, 0.3), vec3(1.0, 0.88, 0.55), smoothstep(0.2, 1.0, uv().y));
      cm.opacityNode = pow(uv().y, 1.4).mul(0.09).add(0.01).mul(pow(edge, 1.6));
      const cone = new THREE.Mesh(cg, cm);
      cone.position.set(bx, bot + h / 2, bz);
      cone.name = 'tt-beam';
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
