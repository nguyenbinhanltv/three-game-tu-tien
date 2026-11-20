import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  cameraPosition,
  clamp,
  exp,
  float,
  length,
  max,
  mix,
  normalize,
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
  dot,
  floor,
  fract,
} from 'three/tsl';
import { LEVELS } from '@dtl/content';
import { heightAt } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';
import { DungeonFx } from './dungeonFx';

/**
 * Cảnh Kim Dạ Cung (DUN-1 PR5; chỉ để nhìn, không đổi vùng boss/đợt quái/đố bốn đèn/hai Trấn Giới Bia/cổng): cung dát vàng của một triều đã chết, đêm lồng đèn.
 * GLB Blender `arch_kim_da` (nhịp tường cột sơn đen đai vàng + cửa sổ hoa cách phát sáng + mái cong + đèn lồng treo hiên + rèm son, ngai vàng ở bắc, 20 cột đèn nhiều tầng
 * có dây đèn lồng giăng, đỉnh đồng, cây vàng chết) nạp ở `engine/levelLoad.ts` `loadKdModel`. File này dựng phần thủ tục: trời đêm vàng (`buildGildedSky`: trăng vàng lớn,
 * mây hổ phách), sàn đá đen bóng khảm vàng mảnh (`buildGildedFloor`), quầng đèn lồng, tia trăng, sương hổ phách thấp (`DungeonFx`).
 */

const SEED = 20261119;
const DG = LEVELS.kim_da_cung!.dungeon!;
const CENTER = DG.center;

/** Vòm cung (khớp `DOME_R/DOME_H` của `tools/blender/kim_da_arch.py`). */
export const KD_DOME = { r: 135, h: 80 };

/** Cột đèn quanh sảnh: 22 vị trí r 84, chừa cửa nam (khớp `POSTS/POST_R` của kim_da_arch.py). Đèn ở cao ~6,6 m. */
function lanternPosts(): { x: number; z: number }[] {
  const n = 22;
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.2) continue;
    out.push({ x: CENTER.x + Math.cos(a) * 84, z: CENTER.z + Math.sin(a) * 84 });
  }
  return out;
}

/** Hai hồ nước trong sân (x, z, bán kính): khớp `PONDS` trong `tools/blender/kim_da_arch.py`; vành đá và cầu nằm trong GLB, mặt nước ở `buildPond`. */
const PONDS = [
  { x: CENTER.x - 58, z: CENTER.z - 4, r: 9.2 },
  { x: CENTER.x + 58, z: CENTER.z - 4, r: 9.2 },
];

/** Bốn đèn đố (cùng chỗ với `puzzle.points`): vũng sáng ấm trên sàn. */
const PUZZLE = (DG.waves.find((w) => w.puzzle)?.puzzle?.points ?? []).map((p) => ({ x: p.x, z: p.z }));

/** Vùng cấm: khu giữa đài chiến và lối vào phía nam. */
function kdKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 10 && dz > 0);
}

/**
 * Trời đêm vàng (hàm TSL dùng chung cho vòm): chân trời hổ phách tối (ánh lồng đèn hắt lên) → thiên đỉnh đen than; trăng vàng nhạt tròn rất lớn + quầng ở phía bắc cao ~35°;
 * mây mỏng hổ phách trôi chậm, ngả sáng về phía trăng; sao li ti.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function goldenSky(dir: any): any {
  const nz = getCloudNoise();
  const h = clamp(dir.y, 0, 1);
  const base = mix(vec3(0.26, 0.15, 0.08), vec3(0.015, 0.012, 0.02), pow(h, 0.42));
  const moonDir = normalize(vec3(0.0, 0.58, -0.81));
  const md = max(dot(dir, moonDir), 0);
  const disc = smoothstep(0.9935, 0.9955, md);
  const halo = pow(md, 24).mul(0.5).add(pow(md, 5).mul(0.12));
  const proj = vec2(dir.x, dir.z).div(h.add(0.32));
  const wind = vec2(time.mul(0.0025), time.mul(0.001));
  const c1 = texture(nz, proj.mul(0.45).add(wind)).a;
  const c2 = texture(nz, proj.mul(1.3).add(wind.mul(1.7))).g;
  const cloud = smoothstep(0.55, 0.88, c1.mul(0.7).add(c2.mul(0.3)))
    .mul(smoothstep(0.04, 0.3, h))
    .mul(0.55);
  const lit = mix(vec3(0.3, 0.2, 0.12), vec3(0.95, 0.78, 0.45), pow(md, 3));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any = mix(base, lit, cloud);
  col = col.add(vec3(1.0, 0.8, 0.45).mul(halo)).add(vec3(1.0, 0.9, 0.62).mul(disc).mul(0.85));
  const st = texture(nz, proj.mul(6.5)).g;
  const stars = smoothstep(0.93, 0.985, st)
    .mul(smoothstep(0.2, 0.6, h))
    .mul(float(1).sub(cloud))
    .mul(0.75);
  return col.add(vec3(1.0, 0.92, 0.75).mul(stars));
}

/** Vỏ vòm: trời đêm vàng, một draw call. */
export function buildGildedSky(def: { x: number; z: number; r: number; h: number }, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, def.x + pos.getX(i) * def.r, groundY + pos.getY(i) * def.h, def.z + pos.getZ(i) * def.r);
  geo.computeBoundingSphere();
  const d = positionWorld.sub(vec3(def.x, groundY, def.z));
  const dir = normalize(vec3(d.x.div(def.r), d.y.div(def.h), d.z.div(def.r)));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
  mat.colorNode = goldenSky(dir);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gilded-sky-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Hash 2D → 0..1 theo ô (không dùng texture, ổn định theo toạ độ thế giới). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hash2 = (c: any): any => fract(sin(dot(c, vec2(12.9898, 78.233))).mul(43758.5453));

/**
 * Sân lát đá (shader TSL, không phản chiếu vật thể): phiến bazan đen ấm 3,2 m xếp so le, MẠCH đá tối mảnh giữa phiến, mỗi phiến một sắc riêng (sáng/tối, ngả nâu), vân nâu
 * vàng mảnh, xước + mảng mòn; vùng đánh (r < ~64) sáng hơn và xám ấm để vạch báo của game đọc rõ. VŨNG NƯỚC MƯA: mảng không đều (nhiễu) đen bóng, soi trời hổ phách + ánh
 * các đèn lồng (phản chiếu ấm mạnh theo Fresnel). CÁNH HOA/LÁ VÀNG RƠI: chấm vàng nhỏ rải theo ô 1,3 m, dày ở vành ngoài. THẢM ĐỎ viền vàng dẫn từ cửa nam tới thềm ngai
 * (chỉ hiện ngoài vùng đánh để không lẫn vạch báo; mờ dần vào trong r 46). Vòng trận chỉ còn hai vòng liền MẢNH vàng mềm (r 46, r 64) + hoa sen 16 cánh trong r 18; vũng sáng ấm
 * dưới cột đèn, bốn đèn đố, ngai. Đĩa r 112 bám `heightAt` + 0,08 m.
 */
function buildGildedFloor(): THREE.Mesh {
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
  const fres = pow(float(1).sub(clamp(v.y.negate(), 0, 1)), 3.0);
  // phiến lát so le: hàng theo z, lệch nửa phiến mỗi hàng chẵn/lẻ
  const S = 3.2;
  const rowId = floor(w.y.div(S));
  const off = fract(rowId.mul(0.5))
    .mul(2)
    .mul(S * 0.5);
  const cx = w.x.add(off);
  const cellId = vec2(floor(cx.div(S)), rowId);
  const lx = fract(cx.div(S)).sub(0.5).abs().mul(S);
  const lz = fract(w.y.div(S)).sub(0.5).abs().mul(S);
  const edgeD = float(S * 0.5).sub(max(lx, lz));
  const joint = smoothstep(0.1, 0.0, edgeD);
  const slabTone = hash2(cellId);
  const goldV = smoothstep(0.014, 0.0, abs(texture(nz, w.mul(1 / 5.2).add(0.7)).b.sub(0.5)));
  const brownV = smoothstep(0.035, 0.0, abs(texture(nz, w.mul(1 / 9)).a.sub(0.5))).mul(0.7);
  const tone = texture(nz, w.mul(1 / 21)).b;
  const scratch = smoothstep(0.62, 0.8, texture(nz, vec2(w.x.mul(0.9), w.y.mul(0.04)).add(0.3)).g)
    .mul(0.5)
    .add(smoothstep(0.62, 0.8, texture(nz, vec2(w.x.mul(0.05), w.y.mul(0.8)).add(0.1)).b).mul(0.4));
  const wear = smoothstep(0.55, 0.85, texture(nz, w.mul(1 / 6.5)).a);
  const inner = float(1).sub(smoothstep(58.0, 72.0, r));
  const slab = float(0.75).add(slabTone.mul(0.5));
  const outerStone = mix(vec3(0.012, 0.01, 0.009), vec3(0.034, 0.028, 0.024), tone)
    .mul(slab)
    .add(vec3(0.9, 0.62, 0.22).mul(goldV).mul(0.1));
  const innerStone = mix(vec3(0.05, 0.044, 0.04), vec3(0.095, 0.083, 0.072), tone)
    .mul(slab)
    .add(vec3(0.5, 0.36, 0.16).mul(goldV).mul(0.12))
    .add(vec3(0.4, 0.3, 0.2).mul(brownV).mul(0.04));
  const stoneBase = mix(outerStone, innerStone, inner).mul(float(1).sub(joint.mul(0.65)));
  // vũng nước mưa
  const puddleN = texture(nz, w.mul(1 / 15).add(0.21))
    .g.mul(0.6)
    .add(texture(nz, w.mul(1 / 6).add(0.6)).b.mul(0.4));
  const puddle = smoothstep(0.57, 0.63, puddleN).mul(smoothstep(24, 34, r));
  const spots = [
    { x: CENTER.x, z: CENTER.z, rr: 18, k: 0.4 },
    { x: CENTER.x, z: CENTER.z - 50, rr: 16, k: 0.9 },
    ...PUZZLE.map((q) => ({ ...q, rr: 9, k: 0.9 })),
    ...lanternPosts().map((q) => ({ ...q, rr: 12, k: 0.85 })),
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
  const edgeDark = float(1).sub(smoothstep(30.0, 104.0, r).mul(0.88));
  const lit = float(0.3).add(inner.mul(0.3)).add(pools.mul(1.1));
  const gloss = float(1).sub(wear.mul(0.55)).sub(scratch.mul(0.35)).add(puddle.mul(0.9));
  const warm = vec3(1.0, 0.62, 0.24);
  const refl = warm
    .mul(clamp(pools.mul(0.9).add(0.1), 0, 1))
    .mul(fres.mul(0.55).add(0.015))
    .mul(gloss);
  // vũng: tối hơn + soi trời hổ phách và ánh đèn mạnh (nhìn lướt thấy ánh lồng đèn kéo dài)
  const puddleRefl = mix(vec3(0.04, 0.025, 0.014), warm.mul(0.7), clamp(pools.mul(0.7), 0, 1))
    .mul(fres.mul(0.8).add(0.05))
    .mul(puddle);
  const stone = mix(stoneBase, stoneBase.mul(0.3), puddle);
  // cánh hoa/lá vàng rơi
  const pc = floor(w.div(1.3));
  const ph = hash2(pc);
  const jx = hash2(pc.add(vec2(7.3, 1.1)))
    .sub(0.5)
    .mul(0.8);
  const jz = hash2(pc.add(vec2(2.9, 5.7)))
    .sub(0.5)
    .mul(0.8);
  const pd = length(fract(w.div(1.3)).sub(0.5).sub(vec2(jx, jz)).mul(1.3));
  const petalMask = smoothstep(0.13, 0.07, pd).mul(smoothstep(float(0.9).sub(smoothstep(30.0, 100.0, r).mul(0.1)), float(0.97), ph));
  const petal = mix(vec3(0.85, 0.55, 0.15), vec3(1.0, 0.82, 0.38), hash2(pc.add(3.3)))
    .mul(petalMask)
    .mul(0.4)
    .mul(float(0.5).add(edgeDark.mul(0.5)));
  // thảm đỏ viền vàng (ngoài vùng đánh)
  const carpetOn = smoothstep(46.0, 58.0, r)
    .mul(smoothstep(66.0, 56.0, w.y.negate()))
    .mul(smoothstep(-100.0, 60.0, w.y));
  const across = abs(w.x);
  const carpetW = smoothstep(2.7, 2.5, across);
  const carpetEdge = smoothstep(0.22, 0.0, abs(across.sub(2.35)));
  const carpetPat = smoothstep(0.55, 0.7, abs(sin(w.y.mul(0.9)).mul(sin(w.x.mul(2.4)))));
  const carpetCol = mix(vec3(0.17, 0.02, 0.015), vec3(0.3, 0.05, 0.03), carpetPat).mul(float(0.45).add(pools.mul(0.7)));
  const carpet = carpetW.mul(carpetOn);
  // vòng trận mảnh + hoa sen
  const thin = (rad: number, wd: number) => smoothstep(wd, 0.0, abs(r.sub(rad)));
  const soft = (rad: number, wd: number) => exp(abs(r.sub(rad)).div(wd).pow(2).negate());
  const lotus = smoothstep(0.05, 0.0, abs(sin(ang.mul(8))))
    .mul(smoothstep(12, 6, r))
    .mul(smoothstep(2, 6, r));
  const line = thin(18, 0.06).add(thin(46, 0.05)).add(thin(64, 0.07)).add(lotus.mul(0.35));
  const glow = soft(18, 1.0).add(soft(46, 1.0)).add(soft(64, 1.3)).mul(0.08);
  const gold = vec3(1.0, 0.78, 0.4)
    .mul(line)
    .mul(0.8)
    .add(vec3(0.7, 0.42, 0.12).mul(glow))
    .add(vec3(1.0, 0.8, 0.4).mul(carpetEdge.mul(carpet)).mul(0.35));
  let col = stone.mul(lit).mul(edgeDark).add(refl.mul(edgeDark)).add(puddleRefl.mul(edgeDark));
  col = mix(col, carpetCol, carpet.mul(0.92))
    .add(gold.mul(float(0.55).add(edgeDark.mul(0.45))))
    .add(petal);
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(CENTER.x, 0, CENTER.z);
  mesh.name = 'kd-floor';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Mặt nước hồ (đĩa phẳng cao hơn đất 0,2 m): tối, soi trời hổ phách + ánh đèn lồng theo Fresnel, gợn nhẹ. */
function buildPond(x: number, z: number, rad: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(rad, 40).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(x + p.getX(i), z + p.getZ(i)) + 0.2);
  geo.computeBoundingSphere();
  const nz = getCloudNoise();
  const w = positionWorld.xz;
  const rip = texture(nz, w.mul(1 / 3.2).add(vec2(time.mul(0.012), time.mul(0.008)))).g.sub(0.5);
  const rip2 = texture(nz, w.mul(1 / 1.3).sub(vec2(time.mul(0.02), 0))).b.sub(0.5);
  const v0 = normalize(positionWorld.sub(cameraPosition));
  const v = normalize(v0.add(vec3(rip.mul(0.06), 0, rip2.mul(0.05))));
  const fres = pow(float(1).sub(clamp(v.y.negate(), 0, 1)), 3.0);
  const refl = goldenSky(vec3(v.x, v.y.negate().add(0.02), v.z));
  const warm = vec3(1.0, 0.6, 0.22).mul(smoothstep(0.35, 0.8, rip2.add(0.5)).mul(0.5).add(0.15));
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = vec3(0.012, 0.01, 0.01)
    .add(refl.mul(fres.mul(0.8).add(0.2)))
    .add(warm.mul(fres.mul(0.7).add(0.15)).mul(0.5));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 0);
  mesh.name = 'kd-pond';
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

export class KimDaArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'kim-da-art';
    const floor = buildGildedFloor();
    this.group.add(floor);
    this.disposables.push(floor.geometry, floor.material as THREE.Material);
    for (const pd of PONDS) {
      const pond = buildPond(pd.x, pd.z, pd.r);
      this.group.add(pond);
      this.disposables.push(pond.geometry, pond.material as THREE.Material);
    }
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: kdKeepOut,
      mist: { a: [0.2, 0.12, 0.06], b: [0.5, 0.34, 0.18], innerR: 30, outerR: 128, opacity: 0.3 },
    });
    this.group.add(this.fx.group);
    // quầng đèn lồng: một draw call cho mọi cột đèn + bốn đèn đố (đèn ở cao ~6,6 m)
    const pts = [
      ...lanternPosts().map((q) => ({ x: q.x, y: heightAt(q.x, q.z) + 6.6, z: q.z })),
      ...PUZZLE.map((q) => ({ x: q.x, y: heightAt(q.x, q.z) + 2.6, z: q.z })),
    ];
    const halos = createLanternHalos(pts, 2.2, 0xffa24a);
    this.group.add(halos);
    this.disposables.push(halos.geometry, halos.material as THREE.Material);
    this.addBeams();
  }

  /** Hai tia trăng vàng nhạt từ trời xuống sàn (nón hở cộng sáng, mờ dần xuống đáy, mép mềm theo góc nhìn), lệch tâm để không cắt cạnh vùng đánh. */
  private addBeams(): void {
    const groundY = heightAt(CENTER.x, CENTER.z);
    for (const a of [2.5, 4.9]) {
      const bx = CENTER.x + Math.cos(a) * 46;
      const bz = CENTER.z + Math.sin(a) * 46;
      const r = Math.hypot(bx - CENTER.x, bz - CENTER.z);
      const top = groundY + KD_DOME.h * Math.sqrt(1 - (r / KD_DOME.r) ** 2) - 0.5;
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
      cm.opacityNode = pow(uv().y, 1.4).mul(0.08).add(0.008).mul(pow(edge, 1.6));
      const cone = new THREE.Mesh(cg, cm);
      cone.position.set(bx, bot + h / 2, bz);
      cone.name = 'kd-beam';
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
