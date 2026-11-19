import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
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
  time,
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

/**
 * Sàn obsidian đen tím khảm vàng (shader TSL, không phản chiếu vật thể): vân đá, nhám thấp ngả phản chiếu tím vàng của vòm theo Fresnel; khảm vàng mảnh: bốn vòng
 * (r 20/46/64/90), sao tám cánh trong r 20, ba đường tỏa từ tâm ra ba cửa phong ấn; vũng sáng vàng ấm ở tâm và trước ba cửa; tối dần ra góc điện (tương phản).
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
  const rip = texture(nz, w.mul(1 / 13).add(vec2(time.mul(0.004), 0))).g.sub(0.5);
  const v0 = normalize(positionWorld.sub(cameraPosition));
  const v = normalize(v0.add(vec3(rip.mul(0.01), 0, rip.mul(0.01))));
  const cosT = clamp(v.y.negate(), 0, 1);
  const fres = pow(float(1).sub(cosT), 3.0);
  const vein = abs(texture(nz, w.mul(1 / 9)).a.sub(0.5));
  const vein2 = abs(texture(nz, w.mul(1 / 3.3).add(0.4)).g.sub(0.5));
  const veins = smoothstep(0.03, 0.0, vein)
    .mul(0.5)
    .add(smoothstep(0.02, 0.0, vein2).mul(0.25));
  const tone = texture(nz, w.mul(1 / 21)).b;
  const stone = mix(vec3(0.03, 0.025, 0.06), vec3(0.075, 0.06, 0.12), tone).add(vec3(0.3, 0.22, 0.4).mul(veins).mul(0.28));
  const refl = mix(vec3(0.16, 0.1, 0.22), vec3(0.55, 0.38, 0.16), smoothstep(0.0, 0.6, v.y.negate().mul(-1).add(0.35)));
  const thin = (rad: number, wd: number) => smoothstep(wd, 0.0, abs(r.sub(rad)));
  const soft = (rad: number, wd: number) => exp(abs(r.sub(rad)).div(wd).pow(2).negate());
  const star = smoothstep(0.05, 0.0, abs(sin(ang.mul(4)))).mul(smoothstep(20, 6, r));
  // ba đường vàng toả ra ba cửa (góc theo độ, rộng ~0,1 m)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paths: any = float(0);
  for (const deg of TT_DOOR_DEG) {
    const a = (deg * Math.PI) / 180;
    const across = abs(w.x.mul(Math.sin(a)).sub(w.y.mul(Math.cos(a))));
    const along = w.x.mul(Math.cos(a)).add(w.y.mul(Math.sin(a)));
    paths = paths.add(
      smoothstep(0.22, 0.0, across)
        .mul(smoothstep(21, 24, along))
        .mul(smoothstep(78, 70, along)),
    );
  }
  const line = thin(20, 0.16).add(thin(46, 0.14)).add(thin(64, 0.2)).add(thin(90, 0.14)).add(star.mul(0.8)).add(paths.mul(0.9));
  const glow = soft(20, 1.6).add(soft(46, 1.6)).add(soft(64, 2.0)).mul(0.12);
  const gold = vec3(0.95, 0.74, 0.34)
    .mul(line)
    .add(vec3(0.6, 0.38, 0.12).mul(glow));
  // vũng sáng vàng ấm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pools: any = exp(length(w).div(16).pow(2).negate()).mul(0.6);
  for (const dp of DOOR_POINTS)
    pools = pools.add(
      exp(
        length(positionWorld.xz.sub(vec2(dp.x, dp.z)))
          .div(9)
          .pow(2)
          .negate(),
      ).mul(0.9),
    );
  const edgeDark = float(1).sub(smoothstep(30.0, 100.0, r).mul(0.9));
  const lit = float(0.4).add(pools.mul(1.1));
  const col = stone
    .mul(lit)
    .mul(edgeDark)
    .add(refl.mul(fres.mul(0.55).add(0.03)).mul(edgeDark))
    .add(gold)
    .add(vec3(0.5, 0.32, 0.1).mul(pools).mul(0.22));
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
      mist: { a: [0.16, 0.1, 0.24], b: [0.42, 0.3, 0.5], innerR: 34, outerR: 128, opacity: 0.22 },
    });
    this.group.add(this.fx.group);
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
