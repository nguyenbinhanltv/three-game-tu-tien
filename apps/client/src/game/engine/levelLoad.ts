// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import * as THREE from 'three/webgpu';
import { KIEM_TRUNG, terrainOf, propsOf, SECT, tribDef } from '@dtl/shared';
import { heightAt, levelAssets, levelId, levelTerrain } from '../../base/levelCtx';
import { LEVELS } from '@dtl/content';
import { get } from '../../ui/store';
import { Butterflies, BUTTERFLY_LEVELS } from '../world/butterflies';
import { Grass } from '../world/grass';
import { applyAtmosphere, createLanternHalos, setHeightFog, tuneAtmosphere } from '../../render/atmosphere';
import { buildRiftVeil } from '../../render/riftVeil';
import { Aurora, AURORA_BY_TOD } from '../../render/aurora';
import { BhWonders } from '../world/bhWonders';
import { skyTopOf } from '../../render/sky';
import { DeadTrees } from '../world/deadTrees';
import { deadTreeSpots, KIEP_BH, riftBlend, riftPath } from '../world/bacHoangArt';
import { buildEclipseSun } from '../../render/eclipse';
import { XICH_LEVEL, xichCracks, type XichAccent } from '../world/xichArt';
import { bhCtx } from '../world/propScatter';
import { Beacons } from '../../render/beacons';
import { GodRays } from '../../render/godRays';
import { CARD_TREE_IDS, CardForest } from '../world/cardForest';
import { loadSkyTextures } from '../world/skyAssets';
import { LacKiemGarden } from '../world/lacKiemGarden';
import { DoanMachArt } from '../world/doanMachArt';
import { KiemTrungArt, ktMaterialFor } from '../world/kiemTrungArt';
import { PhucMachArt, PM_DOME, PM_OCULI, pmMaterialFor } from '../world/phucMachArt';
import { buildMoonDomeShell, KN_DOME, knMaterialFor, KinhNguyetArt } from '../world/kinhNguyetArt';
import { buildVaultDome, ThanTangArt, TT_DOME, ttMaterialFor } from '../world/thanTangArt';
import { XichTanArt, xkMaterialFor } from '../world/xichTanArt';
import { DoKiepArt, dkMaterialFor } from '../world/doKiepArt';
import { LacKiemFar } from '../world/lacKiemFar';
import { buildGildedSky, KD_DOME, KimDaArt } from '../world/kimDaArt';
import { LacKiemSkyScene } from '../world/lacKiemSky';
import { ThienKhuyetSkyScene, TK_ORIGIN } from '../world/thienKhuyetSky';
import { VanHaiWow } from '../world/vanHaiWow';
import { VanHaiGarden } from '../world/vanHaiGarden';
import { applyGrading, markBloom } from '../../render/post';
import { adoptGltfMaterials } from '../../render/materials/world';
import { bhTod, GRADING, GRADING_DEFAULT, mixHex, mixPreset, moodVariant, URL_MOOD, type GradingName } from '../../render/grading';
import { withOccluderFade } from '../world/occlusion';
import { LanternLights } from '../../render/lanternLights';
import { buildMoonGate, buildPortalDisc, buildSect, moonMirrorTexture, SECT_LANTERNS } from '../world/sect';
import { gatesToDraw } from '../world/gates';
import {
  buildCaveShell,
  buildCrystalGlow,
  buildMirrorFloor,
  buildMineCaveShell,
  buildPalaceHall,
  buildSwordCaveShell,
} from '../world/caveShell';
import { PropLayer } from '../world/props';
import { allProps } from '../world/propScatter';
import { assets } from '../core/assets';
import { Terrain } from '../world/terrain';
import { loadGroundTextures, resolveGroundSet } from '../../base/groundTextures';
import { FLAGS } from '../../base/flags';
import { LANTERN_LIGHT, QUALITY, isWebGPU, isWorldRoom } from './common';
import type { Game } from '../engine';
import { logger } from '../../base/log';

const groundLog = logger('ground');
const assetLog = logger('asset');
const loadLog = logger('load');

/** Nạp texture mặt đất ngoài đường găng: terrain dùng màu đỉnh tới khi xong rồi mới đổi sang shader PBR. */
export async function loadGround(eng: Game): Promise<void> {
  const t0 = performance.now();
  try {
    const self = eng;
    const g0 = levelAssets(levelId()).ground;
    const tex = await loadGroundTextures(
      import.meta.env.BASE_URL,
      {
        get aborted() {
          return self.disposed;
        },
      },
      g0 ? g0.mask : 'manifest',
      g0 ? resolveGroundSet(g0.set, get().quality) : 'terrain',
    );
    if (eng.disposed) {
      tex.dispose();
      return;
    }
    eng.ground = tex;
    eng.loadStats.groundLoad = Math.round(performance.now() - t0);
    eng.loadStats.groundAt = Math.round(performance.now());
    applyGround(eng);
  } catch (e) {
    groundLog.warn('không nạp được texture mặt đất, dùng màu đỉnh:', e);
  }
}

/** Dựng lớp riêng của Bắc Hoang: vệt nứt Giới Khích (3 draw call), cây chết (≤ 3 draw call). `?bhart=0` tắt để so ảnh. */
export function buildBacHoang(eng: Game): void {
  if (!FLAGS.bhArt) return;
  const T = levelTerrain();
  eng.riftMood = true;
  eng.riftMoodT = -1;
  eng.rift = buildRiftVeil(riftPath(T.def), (x, z) => heightAt(x, z), { violet: true });
  eng.scene.add(eng.rift.group);
  eng.deadTrees = new DeadTrees(deadTreeSpots(bhCtx(propsOf('bac_hoang')), 700), (x, z) => heightAt(x, z));
  eng.scene.add(eng.deadTrees.group);
  if (levelId() === 'bac_hoang') {
    eng.bhWonders = new BhWonders(riftPath(T.def), (x, z) => heightAt(x, z), { detail: get().quality !== 'low' });
    eng.scene.add(eng.bhWonders.group);
    if (get().quality !== 'low') {
      eng.aurora = new Aurora();
      eng.scene.add(eng.aurora.mesh);
    }
  }
  if (levelId() === KIEP_BH) {
    // Nhật thực: đĩa đen vành lửa treo trên khe Giới Khích, phía bắc-đông sân (chỗ camera mặc định ngẩng lên thấy được, không dưới khung HUD).
    const c = LEVELS[KIEP_BH]!.dungeon!.center;
    eng.eclipseSun = buildEclipseSun(c.x + 55, heightAt(c.x, c.z) + 12, c.z - 120, 15);
    eng.scene.add(eng.eclipseSun.group);
  }
}

export function buildXich(eng: Game, id: string, q: (typeof QUALITY)[string]): void {
  if (!FLAGS.xichArt) return;
  const T = levelTerrain();
  const paths = xichCracks(T.def, (x, z) => heightAt(x, z));
  // DUN-1 PR6: màn đỏ dày của `riftVeil` được thay bằng vết nứt dung nham lõm có gờ đá (`XichTanArt`); khe mạch ngọc lam và quầng giữ nguyên.
  for (const p of levelAssets(id).xichTanArt ? [] : paths) {
    const v = buildRiftVeil(p, (x, z) => heightAt(x, z), {
      height: 7,
      ribs: false,
      floorHalf: 3,
      strength: 0.22,
      floorStrength: 0.6,
      endFade: true,
    });
    eng.scene.add(v.group);
    eng.xichRifts.push(v);
  }
  const lv = LEVELS[id]?.dungeon;
  const c = lv?.center ?? { x: T.def.canyon?.cx ?? 0, z: T.def.canyon?.cz ?? 0 };
  // Bia giữ ở tâm: than hồng; ba khe mạch (đúng chỗ khe của boss cuối): ngọc lam, đối màu với than hồng.
  const acc: XichAccent[] = [
    { x: c.x, z: c.z, color: 0xff6a35, k: 1.4 },
    { x: c.x + 19, z: c.z + 11, color: 0x4fc9d0, k: 1.3 },
    { x: c.x - 19, z: c.z + 11, color: 0x4fc9d0, k: 1.3 },
    { x: c.x, z: c.z - 22, color: 0x4fc9d0, k: 1.3 },
  ];
  const pts = acc.map((a) => ({ x: a.x, y: heightAt(a.x, a.z) + 4.5, z: a.z, color: a.color, k: a.k }));
  // Quầng giả: bia giữ than hồng; khe mạch ngọc lam lớn hơn, hai tầng (sát đất và lơ lửng) để điểm nhấn lạnh đọc được từ xa.
  const halos = createLanternHalos(pts.slice(0, 1), 6, 0xff7a45);
  const jade = acc.slice(1).flatMap((a2) => [1.6, 5.5].map((dy) => ({ x: a2.x, y: heightAt(a2.x, a2.z) + dy, z: a2.z })));
  // DUN-1 PR6: cầu ngọc lam to chói đổi thành lửa xanh nhạt nhỏ (đối màu than hồng vẫn đọc được là khe mạch của boss cuối), chỉ tầng sát đất.
  const jadeGlow = levelAssets(id).xichTanArt
    ? createLanternHalos(
        jade.filter((_, i) => i % 2 === 0),
        2.4,
        0x8fc4de,
      )
    : buildCrystalGlow(jade);
  // Ngọn lửa than hồng trên các trụ đá dọc chân vách (cách một trụ), thay đèn lồng kiểu Vân Lam.
  const flames = propsOf(id)
    .filter((q) => q.id === 'prop_tru_da_khac_van')
    .filter((_, i) => i % 2 === 0)
    .map((q) => ({ x: q.x, y: heightAt(q.x, q.z) + 3.4 * q.s, z: q.z }));
  const flameHalos = createLanternHalos(flames, 3.2, 0xff5a28);
  eng.scene.add(halos, jadeGlow, flameHalos);
  eng.levelObjs.push(halos, jadeGlow, flameHalos);
  eng.lanterns = new LanternLights(eng.scene, pts, 4, 34);
  eng.lanterns.setEnabled(q.lights && isWebGPU(eng.renderer));
  eng.lanterns.setIntensityScale(LANTERN_LIGHT[eng.levelMood] ?? 1);
}

export function disposeXich(eng: Game): void {
  for (const v of eng.xichRifts) {
    eng.scene.remove(v.group);
    v.dispose();
  }
  eng.xichRifts = [];
}

/** Mood Bắc Hoang theo vị trí: 0 ở nửa nam (`bh_<giờ>`) → 1 ở ba vùng bắc (`bhr_<giờ>`), đổi dần quanh Khích Giai. Chỉnh uniform, không biên dịch lại. */
export function updateRiftMood(eng: Game, dt: number, z: number): void {
  eng.riftMoodAcc += dt;
  if (eng.riftMoodAcc < 0.2 && eng.riftMoodT >= 0) return;
  eng.riftMoodAcc = 0;
  const t = riftBlend(z - levelTerrain().def.size / 2);
  if (Math.abs(t - eng.riftMoodT) < 0.01) return;
  eng.riftMoodT = t;
  const tod = bhTod(moodOf(eng, levelId()));
  const near: GradingName = `bh_${tod}`;
  const far: GradingName = `bhr_${tod}`;
  const p = mixPreset(GRADING[near], GRADING[far], t);
  if (levelId() === KIEP_BH) {
    // Sân Nhật Thực Kiếp: sương mỏng hơn, tương phản và tối hơn để thấy rõ bia, boss và đĩa nhật thực (lần quay đầu bị sương hồng làm đục).
    p.fogDensity *= 0.4;
    if (p.fogHaze !== undefined) p.fogHaze *= 0.35;
    p.heightFogBoost *= 0.6;
    p.contrast *= 1.12;
    p.exposure *= 0.88;
  }
  tuneAtmosphere(eng.scene, eng.env, p, t > 0.5 ? far : near, mixHex(skyTopOf(near), skyTopOf(far), t));
  applyGrading(p);
  eng.aurora?.setIntensity(AURORA_BY_TOD[tod], t);
}

/** Nhật thực của Nhật Thực Kiếp: từ pha Nhật thực (25 s) trời tối đen có vành lửa; trước đó chỉ là quầng mờ. Ngoài sân kiếp thì tắt. */
export function updateEclipse(eng: Game, dt: number): void {
  const inArena = levelId() === KIEP_BH;
  const elapsed = eng.tribId === 'anh_bien' && eng.tribUntil > 0 ? tribDef('anh_bien').duration - (eng.tribUntil - Date.now()) / 1000 : -1;
  const target = !inArena ? 0 : elapsed >= 25 && elapsed < 91 ? 1 : 0.45;
  if (Math.abs(target - eng.eclipse) >= 0.001) {
    eng.eclipse += (target - eng.eclipse) * Math.min(1, dt * 1.2);
    eng.eclipseSun?.set(eng.eclipse);
  }
  if (eng.camera) eng.eclipseSun?.update(eng.camera);
}

export function disposeBacHoang(eng: Game): void {
  if (eng.bhWonders) {
    eng.scene.remove(eng.bhWonders.group);
    eng.bhWonders.dispose();
    eng.bhWonders = null;
  }
  if (eng.aurora) {
    eng.scene.remove(eng.aurora.mesh);
    eng.aurora.dispose();
    eng.aurora = null;
  }
  if (eng.rift) {
    eng.scene.remove(eng.rift.group);
    eng.rift.dispose();
    eng.rift = null;
  }
  if (eng.deadTrees) {
    eng.scene.remove(eng.deadTrees.group);
    eng.deadTrees.dispose();
    eng.deadTrees = null;
  }
  if (eng.eclipseSun) {
    eng.scene.remove(eng.eclipseSun.group);
    eng.eclipseSun.dispose();
    eng.eclipseSun = null;
  }
  eng.eclipse = 0;
  eng.riftMood = false;
}

/** Mood của level; `?mood=` trên URL thắng (chụp ảnh so sánh). */
export function moodOf(_eng: Game, id: string): GradingName {
  const m = levelAssets(id).mood;
  if (m === 'default' || !(m in GRADING)) return GRADING_DEFAULT;
  // `?mood=dawn|day|night` thắng; level có bộ mood riêng (ochre) lấy biến thể cùng thời điểm.
  if (URL_MOOD) return moodVariant(m as GradingName, URL_MOOD);
  return m as GradingName;
}

/** Dựng phần level cần có trước hậu kỳ: địa hình, kiến trúc tông môn, cổng, đèn lồng, môi trường, bầu không khí. */
export function buildLevelA(eng: Game, id: string, q: (typeof QUALITY)[string]): void {
  const F = levelAssets(id).features;
  eng.terrain = new Terrain();
  eng.terrain.shadows = q.shadows;
  eng.scene.add(eng.terrain.group);
  applyGround(eng);
  if (F.sect) {
    eng.sectMesh = new THREE.Mesh(buildSect(), eng.sectMat);
    eng.sectMesh.castShadow = q.shadows;
    eng.sectMesh.receiveShadow = q.shadows;
    eng.sectMesh.frustumCulled = false;
    eng.scene.add(eng.sectMesh);
  }
  if (F.portals || (LEVELS[id]?.portals?.length ?? 0) > 0) {
    eng.gateDiscs = gatesToDraw(id).map((g) => {
      const d = buildPortalDisc(g.x, g.z, g.color, g.flat);
      d.userData.op = g.opacity ?? 0.55;
      return d;
    });
    // Cổng vào Kính Nguyệt Cung: thêm vành gương nguyệt quanh đĩa để thấy rõ cổng.
    for (const g of gatesToDraw(id)) {
      if (g.id !== 'portal' || g.to !== 'kinh_nguyet') continue;
      eng.gateDiscs.push(buildMoonGate(g.x, g.z));
      // Đĩa sáng nằm ngay trước mặt gương (tâm vòm cao 5 m trên nền, lùi 0,3 m ra phía trước).
      const disc = eng.gateDiscs.find((d) => d.position.x === g.x && d.position.z === g.z && d.name !== 'moon-gate');
      if (disc) {
        disc.position.y -= 3.6;
        disc.position.y += 5.0;
        disc.position.z += 0.32;
        disc.scale.set(0.9, 1.12, 1);
        disc.userData.still = true;
        disc.userData.op = 0.82;
        const tex = moonMirrorTexture();
        if (tex) {
          const dm = disc.material as THREE.MeshBasicMaterial;
          dm.map = tex;
          dm.color.set(0xffffff);
          dm.needsUpdate = true;
          disc.userData.mirrorTex = tex;
        }
        // Mặt sau cổng cũng có gương (người chơi vào từ phía nào cũng thấy): đĩa thứ hai dùng chung lưới và vật liệu.
        const back = new THREE.Mesh(disc.geometry, disc.material);
        back.position.set(disc.position.x, disc.position.y, disc.position.z - 0.64);
        back.scale.copy(disc.scale);
        back.userData.still = true;
        back.userData.op = disc.userData.op;
        eng.gateDiscs.push(back);
      }
    }
    eng.scene.add(...eng.gateDiscs);
    for (const disc of eng.gateDiscs) if (disc.name !== 'moon-gate') markBloom(disc.material as THREE.Material, 0.8);
    // Cung gương: vòng ra nằm trên sàn gương (cao hơn 0,08 m của sàn), không bị sàn cắt thành bán nguyệt.
    if (levelAssets(id).palace) for (const disc of eng.gateDiscs) disc.position.y += 0.2;
  }
  const mood = moodOf(eng, id);
  eng.levelMood = mood;
  eng.env.setLevel(terrainOf(id).id, { clouds: F.clouds, lake: F.lake });
  eng.env.setQuality(get().quality);
  applyAtmosphere(eng.scene, eng.env, GRADING[mood], mood);
  applyGrading(GRADING[mood]);
  setHeightFog(q.heightFog);
  if (F.lanterns) {
    // Vân Lam: đèn lồng tông môn; level khác: đèn đá bày trong `propsOf` (E2-C).
    const pts =
      id === 'van_lam' || id === 'kiem_trung'
        ? SECT_LANTERNS
        : propsOf(id)
            .filter((p) => p.id === 'prop_den_da')
            .map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 2.1 * p.s, z: p.z }));
    // Cung gương: quầng đèn nhỏ, màu lạnh, không vào bloom (đèn đá không cháy trắng).
    const halos = levelAssets(id).palace
      ? createLanternHalos(
          pts,
          levelAssets(id).kinhNguyetArt ? 3.6 : 1.3,
          levelAssets(id).palace === 'gilt' ? 0xd8a64a : levelAssets(id).kinhNguyetArt ? 0xffc47a : 0xb8cdee,
        )
      : createLanternHalos(pts);
    eng.scene.add(halos);
    eng.levelObjs.push(halos);
    eng.lanterns = new LanternLights(eng.scene, pts);
    eng.lanterns.setEnabled(q.lights && isWebGPU(eng.renderer)); // T6: đèn lồng point light thật chỉ ở WebGPU
    eng.lanterns.setIntensityScale(
      (LANTERN_LIGHT[mood] ?? 1) * (levelAssets(id).palace ? (levelAssets(id).kinhNguyetArt ? 0.9 : 0.35) : 1),
    );
  }
  const cave = levelAssets(id).cave;
  if (cave) {
    // Phó bản hang (E2-C): vách + trần tối che chân trời, tinh thể mạch phát sáng lam lục (hai draw call).
    const palaceAsset = levelAssets(id).palace;
    const palace: false | 'moon' | 'gilt' = palaceAsset ? (palaceAsset === 'gilt' ? 'gilt' : 'moon') : false;
    // Kiếm Trủng (DUN-1): huyệt kiếm cao, có ô trời mở; level khác giữ vỏ hang cũ.
    const shell = levelAssets(id).kiemTrungArt
      ? buildSwordCaveShell(cave, heightAt(cave.x, cave.z))
      : levelAssets(id).kimDaArt
        ? buildGildedSky(cave, heightAt(cave.x, cave.z))
        : levelAssets(id).thanTangArt
          ? buildVaultDome(cave, heightAt(cave.x, cave.z))
          : levelAssets(id).kinhNguyetArt
            ? buildMoonDomeShell(cave, heightAt(cave.x, cave.z))
            : levelAssets(id).phucMachArt
              ? buildMineCaveShell(cave, heightAt(cave.x, cave.z), PM_OCULI)
              : buildCaveShell(cave, heightAt(cave.x, cave.z), palace);
    const glow = buildCrystalGlow(
      propsOf(id)
        .filter((p) => p.id === 'prop_mach_tinh_tru')
        .map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 1.8, z: p.z })),
    );
    eng.scene.add(shell, glow);
    eng.levelObjs.push(shell, glow);
    if (palace && !levelAssets(id).kinhNguyetArt && !levelAssets(id).thanTangArt && !levelAssets(id).kimDaArt) {
      // Cung gương (E3-M): sàn gương giả phủ lòng chảo (một draw call, không phản chiếu thật).
      const floor = buildMirrorFloor({ ...cave, r: cave.r - 2 }, heightAt, palace);
      const hall = buildPalaceHall(cave, heightAt, palace);
      eng.scene.add(floor, hall);
      eng.levelObjs.push(floor, hall);
    }
  }
  if (id === 'bac_hoang' || id === KIEP_BH) buildBacHoang(eng);
  if (id === XICH_LEVEL) buildXich(eng, id, q);
  if (F.sect) void loadSectModel(eng, q.shadows);
}

/** Phần dựng sau VFX: cây/prop, cột linh quang, cỏ. */
export function buildLevelB(eng: Game, id: string, q: (typeof QUALITY)[string]): void {
  const F = levelAssets(id).features;
  // P2-A4: prop Tripo (đèn đá, cổ thụ, đá, trúc…), nạp lười theo khoảng cách.
  if (F.trees === 'scatter') {
    const all = allProps(levelId());
    // Lạc Kiếm (MAP-1 bản B): cây Tripo (tán đĩa phẳng) thay bằng cây thẻ alpha (cardForest.ts); PropLayer giữ phần còn lại (đèn, bia, đá…).
    const cardTrees = !!levelAssets(id).lacKiemSky;
    // Kính Nguyệt (DUN-1 PR3): đá trôi xám đen lạc tông với điện ngọc trắng, bỏ khỏi cảnh (prop chỉ để nhìn, không va chạm).
    // Thần Tàng (DUN-1 PR4): vòng cột đá khắc vân cũ (r 76–80) đè lên ba cửa phong ấn mới, bỏ.
    // Kim Dạ (DUN-1 PR5): hàng cột đá khắc vân cũ (r 70–74) đè lên nhịp tường mới, bỏ.
    const dropIds = levelAssets(id).kinhNguyetArt
      ? new Set(['prop_da_troi'])
      : levelAssets(id).kimDaArt
        ? new Set(['prop_tru_da_khac_van', 'prop_tuong_da_vo_si'])
        : levelAssets(id).thanTangArt
          ? new Set(['prop_tru_da_khac_van'])
          : null;
    const shown = dropIds ? all.filter((p) => !dropIds.has(p.id)) : all;
    eng.props = new PropLayer(undefined, cardTrees ? shown.filter((p) => !CARD_TREE_IDS.has(p.id)) : shown);
    if (cardTrees) {
      void loadSkyTextures().then((tex) => {
        if (!tex || eng.disposed || eng.cardForest || levelId() !== id) return;
        eng.cardForest = new CardForest(
          all.filter((p) => CARD_TREE_IDS.has(p.id)),
          tex,
        );
        eng.scene.add(eng.cardForest.group);
      });
    }
    eng.props.setQuality(get().quality, q.shadows);
    eng.scene.add(eng.props.group);
  }
  const pois = LEVELS[id]?.pois ?? [];
  if (F.beacons && pois.length) {
    // Giới Khích (Bắc Hoang) tự có vệt sáng riêng (render/riftVeil.ts), không thêm cột linh quang nón.
    eng.beacons = new Beacons(
      pois.filter((p) => p.beamH && !(id === 'bac_hoang' && p.id === 'gioi_khich')).map((p) => ({ x: p.x, z: p.z, h: p.beamH ?? 0 })),
    );
    eng.beacons.mesh.visible = isWorldRoom(get().room);
    eng.scene.add(eng.beacons.mesh);
  }
  const sky = levelAssets(id).lacKiemSky;
  if (sky) {
    eng.lacKiemSky = new LacKiemSkyScene(sky);
    eng.scene.add(eng.lacKiemSky.group);
    eng.lacKiemGarden = new LacKiemGarden();
    eng.scene.add(eng.lacKiemGarden.group);
  }
  const tkSky = levelAssets(id).thienKhuyetSky;
  if (tkSky) {
    eng.thienKhuyetSky = new ThienKhuyetSkyScene(tkSky, heightAt);
    eng.scene.add(eng.thienKhuyetSky.group);
    void loadTkModel(eng, q.shadows);
  }
  if (id === 'van_hai') {
    eng.vanHaiWow = new VanHaiWow(terrainOf(id).def);
    eng.scene.add(eng.vanHaiWow.group);
    eng.vanHaiGarden = new VanHaiGarden(terrainOf(id));
    eng.scene.add(eng.vanHaiGarden.group);
  }
  if (levelAssets(id).doanMachArt) {
    eng.doanMachArt = new DoanMachArt();
    eng.scene.add(eng.doanMachArt.group);
  }
  if (levelAssets(id).kiemTrungArt) {
    eng.kiemTrungArt = new KiemTrungArt({ reduced: q.heightFog === false });
    eng.scene.add(eng.kiemTrungArt.group);
    void loadKtModel(eng, q.shadows);
  }
  if (levelAssets(id).phucMachArt) {
    eng.phucMachArt = new PhucMachArt();
    eng.scene.add(eng.phucMachArt.group);
    void loadPmModel(eng, q.shadows);
  }
  if (levelAssets(id).xichTanArt) {
    eng.xichTanArt = new XichTanArt();
    eng.scene.add(eng.xichTanArt.group);
    void loadXkModel(eng, q.shadows);
  }
  if (levelAssets(id).lacKiemFar) {
    eng.lacKiemFar = new LacKiemFar(() => (eng.scene.fog as THREE.Fog | null)?.color ?? null);
    eng.scene.add(eng.lacKiemFar.group);
  }
  if (levelAssets(id).doKiepArt) {
    eng.doKiepArt = new DoKiepArt({ lights: q.lights && isWebGPU(eng.renderer), hazardActive: () => eng.vfx.hazards.length > 0 });
    eng.scene.add(eng.doKiepArt.group);
    void loadDkModel(eng, q.shadows);
  }
  if (levelAssets(id).kimDaArt) {
    eng.kimDaArt = new KimDaArt();
    eng.scene.add(eng.kimDaArt.group);
    void loadKdModel(eng, q.shadows);
  }
  if (levelAssets(id).thanTangArt) {
    eng.thanTangArt = new ThanTangArt();
    eng.scene.add(eng.thanTangArt.group);
    void loadTtModel(eng, q.shadows);
  }
  if (levelAssets(id).kinhNguyetArt) {
    eng.kinhNguyetArt = new KinhNguyetArt({ reflect: q.lights && isWebGPU(eng.renderer), hideInReflection: eng.vfx.group });
    eng.scene.add(eng.kinhNguyetArt.group);
    void loadKnModel(eng, q.shadows);
  }
  const gr = levelAssets(id).godRays;
  if (gr) {
    eng.godRays = new GodRays(gr);
    eng.scene.add(eng.godRays.mesh);
  }
  eng.grass = new Grass(levelAssets(id).grassCards);
  eng.grass.setQuality(get().quality, q.shadows);
  eng.grass.setEnabled(F.grass);
  eng.grass.mesh.visible = F.grass;
  eng.scene.add(eng.grass.mesh);
  const bf = BUTTERFLY_LEVELS[id];
  if (bf && FLAGS.butterflies) {
    eng.butterflies = new Butterflies(bf);
    eng.butterflies.setQuality(get().quality);
    eng.scene.add(eng.butterflies.mesh);
  }
}

/** Gắn bộ texture mặt đất (nếu đã nạp) vào địa hình hiện tại theo khai báo của level. */
export function applyGround(eng: Game): void {
  if (!eng.ground || !eng.terrain) return;
  const g = levelAssets(levelId()).ground;
  eng.terrain.setGround(g ? eng.ground : null, (QUALITY[get().quality] ?? QUALITY.medium!).ground);
}

/** Gỡ và giải phóng mọi thứ gắn với level hiện tại (địa hình, kiến trúc + GLB, cổng, đèn, cây, cột sáng, cỏ). Không để rò sau nhiều lần đổi. */
export function unloadLevel(eng: Game): void {
  eng.cloneVis?.clear();
  disposeBacHoang(eng);
  disposeXich(eng);
  const drop = (o: THREE.Object3D | null | undefined) => o && eng.scene.remove(o);
  if (eng.terrain) {
    drop(eng.terrain.group);
    eng.terrain.dispose();
  }
  if (eng.sectMesh) {
    drop(eng.sectMesh);
    eng.sectMesh.geometry.dispose();
    eng.sectMesh = null;
  }
  if (eng.sectAsset) {
    drop(eng.sectAsset.handle.scene);
    eng.sectAsset.handle.release();
    for (const m of eng.sectAsset.mats) m.dispose();
    eng.sectAsset = null;
  }
  for (const d of eng.gateDiscs) {
    drop(d);
    d.geometry.dispose();
    (d.userData.mirrorTex as THREE.Texture | undefined)?.dispose();
    (d.material as THREE.Material).dispose();
  }
  eng.gateDiscs = [];
  for (const o of eng.levelObjs) {
    drop(o);
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.MeshBasicMaterial | undefined)?.map?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  }
  eng.levelObjs.length = 0;
  eng.lanterns?.dispose();
  eng.lanterns = null;
  if (eng.props) {
    drop(eng.props.group);
    eng.props.dispose();
    eng.props = null;
  }
  if (eng.beacons) {
    drop(eng.beacons.mesh);
    eng.beacons.dispose();
    eng.beacons = null;
  }
  if (eng.tkAsset) {
    drop(eng.tkAsset.handle.scene);
    eng.tkAsset.handle.release();
    for (const m of eng.tkAsset.mats) m.dispose();
    eng.tkAsset = null;
  }
  if (eng.xichTanArt) {
    drop(eng.xichTanArt.group);
    eng.xichTanArt.dispose();
    eng.xichTanArt = null;
  }
  if (eng.lacKiemFar) {
    drop(eng.lacKiemFar.group);
    eng.lacKiemFar.dispose();
    eng.lacKiemFar = null;
  }
  if (eng.doKiepArt) {
    drop(eng.doKiepArt.group);
    eng.doKiepArt.dispose();
    eng.doKiepArt = null;
  }
  if (eng.kimDaArt) {
    drop(eng.kimDaArt.group);
    eng.kimDaArt.dispose();
    eng.kimDaArt = null;
  }
  if (eng.thanTangArt) {
    drop(eng.thanTangArt.group);
    eng.thanTangArt.dispose();
    eng.thanTangArt = null;
  }
  if (eng.kinhNguyetArt) {
    drop(eng.kinhNguyetArt.group);
    eng.kinhNguyetArt.dispose();
    eng.kinhNguyetArt = null;
  }
  if (eng.phucMachArt) {
    drop(eng.phucMachArt.group);
    eng.phucMachArt.dispose();
    eng.phucMachArt = null;
  }
  if (eng.ktAsset) {
    drop(eng.ktAsset.handle.scene);
    eng.ktAsset.handle.release();
    for (const m of eng.ktAsset.mats) m.dispose();
    eng.ktAsset = null;
  }
  if (eng.thienKhuyetSky) {
    drop(eng.thienKhuyetSky.group);
    eng.thienKhuyetSky.dispose();
    eng.thienKhuyetSky = null;
  }
  if (eng.cardForest) {
    drop(eng.cardForest.group);
    eng.cardForest.dispose();
    eng.cardForest = null;
  }
  if (eng.doanMachArt) {
    drop(eng.doanMachArt.group);
    eng.doanMachArt.dispose();
    eng.doanMachArt = null;
  }
  if (eng.kiemTrungArt) {
    drop(eng.kiemTrungArt.group);
    eng.kiemTrungArt.dispose();
    eng.kiemTrungArt = null;
  }
  if (eng.lacKiemGarden) {
    drop(eng.lacKiemGarden.group);
    eng.lacKiemGarden.dispose();
    eng.lacKiemGarden = null;
  }
  if (eng.vanHaiGarden) {
    drop(eng.vanHaiGarden.group);
    eng.vanHaiGarden.dispose();
    eng.vanHaiGarden = null;
  }
  if (eng.vanHaiWow) {
    drop(eng.vanHaiWow.group);
    eng.vanHaiWow.dispose();
    eng.vanHaiWow = null;
  }
  if (eng.lacKiemSky) {
    drop(eng.lacKiemSky.group);
    eng.lacKiemSky.dispose();
    eng.lacKiemSky = null;
  }
  if (eng.godRays) {
    drop(eng.godRays.mesh);
    eng.godRays.dispose();
    eng.godRays = null;
  }
  if (eng.butterflies) {
    drop(eng.butterflies.mesh);
    eng.butterflies.dispose();
    eng.butterflies = null;
  }
  if (eng.grass) {
    drop(eng.grass.mesh);
    eng.grass.dispose();
  }
}

/** Nạp kiến trúc tông môn dựng bằng Blender (asset `arch_sect` qua AssetCache); lỗi thì giữ bản dựng bằng code. */
export async function loadSectModel(eng: Game, shadows: boolean): Promise<void> {
  try {
    await assets.attach(eng.renderer);
    const handle = await assets.acquire('arch_sect', { pos: { x: SECT.x, z: SECT.z } });
    if (eng.disposed || !levelAssets(levelId()).features.sect || eng.sectAsset) {
      handle.release();
      return;
    }
    const root = handle.scene;
    // Giữ vật liệu PBR của GLB (mỗi chất liệu một material), chỉ gắn thêm làm mờ vật che.
    eng.sectAsset = { handle, mats: adoptGltfMaterials(root, withOccluderFade) };
    root.position.set(SECT.x, SECT.y, SECT.z);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.frustumCulled = false;
    });
    eng.scene.add(root);
    if (eng.sectMesh) {
      const old = eng.sectMesh.geometry;
      eng.sectMesh.geometry = buildSect(false);
      old.dispose();
    }
    // Còn ở màn tải, WebGL2 (M6-1): biên dịch song song thay vì biên dịch + link đồng bộ trong một khung vẽ
    // (xem `start`). Đã vào game thì dừng vẽ để chờ cũng là khựng, để renderer tự làm.
    if (!eng.started && !isWebGPU(eng.renderer)) await precompile(eng);
  } catch (e) {
    assetLog.warn('không tải được arch_sect, dùng kiến trúc dựng bằng code:', e);
  }
}

/**
 * Nạp kiến trúc Thiên Khuyết dựng bằng Blender (asset `arch_thien_khuyet`: bậc thang xoắn, Cổng Tiên Vỡ, tiên cung, cột, tượng thần).
 * Gốc GLB = tâm quảng trường; object `tk_statue` hạ theo độ cao đất tại chỗ tượng. Lỗi thì chỉ thiếu phần kiến trúc.
 */
export async function loadTkModel(eng: Game, shadows: boolean): Promise<void> {
  try {
    await assets.attach(eng.renderer);
    const handle = await assets.acquire('arch_thien_khuyet', { pos: { x: TK_ORIGIN.x, z: TK_ORIGIN.z } });
    const sky = levelAssets(levelId()).thienKhuyetSky;
    if (eng.disposed || !sky || eng.tkAsset) {
      handle.release();
      return;
    }
    const root = handle.scene;
    eng.tkAsset = { handle, mats: adoptGltfMaterials(root, withOccluderFade) };
    root.position.set(TK_ORIGIN.x, TK_ORIGIN.y, TK_ORIGIN.z);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.frustumCulled = false;
    });
    // Tượng đổ vỡ ba khúc (`tk_statue0..2`): mỗi khúc nằm sát đất theo heightAt tại chỗ nó nằm, lún 0,8 m (cộng dồn: node đã có phép dịch lượng tử hóa).
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const mid = new THREE.Vector3();
    for (let q = 0; q < 3; q++) {
      const piece = root.getObjectByName(`tk_statue${q}`);
      if (!piece) continue;
      box.setFromObject(piece).getCenter(mid);
      piece.position.y += heightAt(mid.x, mid.z) - TK_ORIGIN.y - 0.8;
    }
    eng.scene.add(root);
  } catch (e) {
    assetLog.warn('không tải được arch_thien_khuyet:', e);
  }
}

/**
 * Nạp cảnh Kiếm Trủng dựng bằng Blender (asset `arch_kiem_trung`: cự kiếm, vành núi đá, mộ, bia, cột gãy, bậc đá, xương, giáp vụn, vòng kiếm trận).
 * Gốc GLB = tâm đài chiến; mỗi object `kt_*` có gốc ở chân vật nên hạ y theo `heightAt` tại chỗ vật (cộng dồn). Lỗi thì chỉ thiếu phần trang trí.
 */
export async function loadKtModel(eng: Game, shadows: boolean): Promise<void> {
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_kiem_trung',
    enabled: () => !!levelAssets(levelId()).kiemTrungArt,
    origin: { x: KIEM_TRUNG.x, y: KIEM_TRUNG.y, z: KIEM_TRUNG.z },
    prefix: 'kt',
    material: ktMaterialFor,
  });
}

/**
 * Nạp cảnh Xích Tẫn Khích dựng bằng Blender (asset `arch_xich_tan`): cụm cột bazan, obsidian, vỏ dung nham, miệng phun, cây cháy, cột cờ, xương, lò sắt.
 * Mỗi vật đặt theo `heightAt` tại chỗ (hẻm có vách dốc, không `flat`). Vật liệu glTF giữ nguyên (than hồng là emissive trong GLB).
 */
export async function loadXkModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.xich_tan_khich!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_xich_tan',
    enabled: () => !!levelAssets(levelId()).xichTanArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'xk',
    material: xkMaterialFor,
  });
}

/**
 * Nạp cảnh Độ Kiếp dựng bằng Blender (asset `arch_do_kiep`): đài lát đá khảm bát quái, tám lôi trụ, đỉnh đồng, vết sét cháy, tảng đá nung, tùng cháy.
 * Mỗi vật đặt theo `heightAt` tại chỗ (sân phẳng tới r 78, xa hơn là sườn núi).
 */
export async function loadDkModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.do_kiep!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_do_kiep',
    enabled: () => !!levelAssets(levelId()).doKiepArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'dk',
    material: dkMaterialFor,
  });
}

/**
 * Nạp cảnh Kim Dạ Cung dựng bằng Blender (asset `arch_kim_da`): nhịp tường, ngai vàng, cột đèn + dây đèn lồng (`kd_string_*` đặt y 9 m trong GLB), đỉnh đồng, cây vàng chết.
 * Vàng dùng chung vật liệu PBR cổ của Thần Tàng (`ttMaterialFor`). Sàn bám `heightAt` (phẳng ±3 m tới r 110): vật đặt theo mặt bằng tâm (`flat`).
 */
export async function loadKdModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.kim_da_cung!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_kim_da',
    enabled: () => !!levelAssets(levelId()).kimDaArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'kd',
    ceiling: KD_DOME,
    flat: [
      'kd_bay',
      'kd_throne',
      'kd_post',
      'kd_censer',
      'kd_tree',
      'kd_string',
      'kd_pondrim',
      'kd_bridge',
      'kd_altar',
      'kd_osman',
      'kd_lowlantern',
      'kd_statue',
    ],
    flatDy: 0.05,
    material: ttMaterialFor,
    noShadow: /bay|throne|string/,
  });
}

/**
 * Nạp cảnh Thần Tàng Điện dựng bằng Blender (asset `arch_than_tang`): tường hốc vòm + phướn, ba cửa phong ấn, tượng võ sĩ, đống kim ngân, mặt nạ, đèn chùm (`tt_ceil_*` treo trần).
 * Sàn bám `heightAt` (phẳng ±3 m tới r 110): vật đặt theo mặt bằng tâm (`flat`).
 */
export async function loadTtModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.than_tang!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_than_tang',
    enabled: () => !!levelAssets(levelId()).thanTangArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'tt',
    ceiling: TT_DOME,
    flat: ['tt_bay', 'tt_gate', 'tt_statue', 'tt_hoard', 'tt_mask', 'tt_brazier'],
    flatDy: 0.05,
    material: ttMaterialFor,
    noShadow: /bay|mask|chandelier/,
  });
}

/**
 * Nạp cảnh Kính Nguyệt Cung dựng bằng Blender (asset `arch_kinh_nguyet`): hàng cột + vòm gương, vòng gương trăng, mảnh gương, dây chuông treo trần (`kn_ceil_*`).
 * Sàn sảnh phẳng ±3 m tới r 110 nên mọi vật đặt theo mặt bằng tâm (`flat`), không theo `heightAt` từng chỗ. Gương thay vật liệu emissive (`knMaterialFor`).
 */
export async function loadKnModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.kinh_nguyet!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_kinh_nguyet',
    enabled: () => !!levelAssets(levelId()).kinhNguyetArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'kn',
    ceiling: KN_DOME,
    flat: ['kn_bay', 'kn_ring', 'kn_basin', 'kn_shard', 'kn_float', 'kn_frag'],
    flatDy: 0.05,
    material: knMaterialFor,
    noShadow: /bay|ring|chime|float/,
  });
}

/**
 * Nạp cảnh Phục Mạch Quật dựng bằng Blender (asset `arch_phuc_mach`): cụm mạch tinh, cột đá, khung chống gỗ, cửa hầm + ray + xe, nhũ đá và mạch tinh treo
 * trần (object `pm_ceil_*` đặt y theo độ cao vòm hang). Gốc GLB = tâm hầm.
 */
export async function loadPmModel(eng: Game, shadows: boolean): Promise<void> {
  const c = LEVELS.phuc_mach!.dungeon!.center;
  await loadDungeonModel(eng, shadows, {
    asset: 'arch_phuc_mach',
    enabled: () => !!levelAssets(levelId()).phucMachArt,
    origin: { x: c.x, y: heightAt(c.x, c.z), z: c.z },
    prefix: 'pm',
    ceiling: PM_DOME,
    flat: ['pm_wall_'],
    noShadow: /wall|slab|stalac|ceil|pillar/,
    material: pmMaterialFor,
  });
}

interface DungeonModelOpts {
  asset: string;
  enabled: () => boolean;
  /** Gốc GLB trong thế giới (tâm bí cảnh). */
  origin: { x: number; y: number; z: number };
  /** Tiền tố tên object (`<prefix>_...`). */
  prefix: string;
  /** Vòm hang: object `<prefix>_ceil_*` treo trần (y = cao độ vòm tại chỗ). */
  ceiling?: { r: number; h: number };
  /** Tiền tố tên object đặt ở mặt bằng tâm (y = gốc − 4 m, chân vách chìm dưới địa hình dốc), không theo `heightAt` tại chỗ. */
  flat?: string[];
  /** Độ dời y của vật `flat` so với gốc GLB (mặc định −4 m cho vách chìm; ~0 cho vật đặt trên sàn phẳng). */
  flatDy?: number;
  /** Tên lưới không đổ bóng (vách/trần hang chặn nắng của đèn trời: nếu đổ bóng thì cả sàn tối đen). */
  noShadow?: RegExp;
  /** Thay vật liệu glTF theo tên (trả null = giữ nguyên). Vật liệu mới được giải phóng cùng asset. */
  material?: (name: string) => THREE.Material | null;
}

/**
 * Nạp GLB cảnh bí cảnh (mỗi vật một object có gốc ở chân): hạ y theo `heightAt` (hoặc treo trần), rồi gộp mọi vật dùng chung lưới + vật liệu thành một
 * `InstancedMesh` (hàng trăm object × vài primitive sẽ là hàng nghìn draw call nếu để nguyên). Lỗi thì chỉ thiếu phần trang trí.
 */
async function loadDungeonModel(eng: Game, shadows: boolean, o: DungeonModelOpts): Promise<void> {
  try {
    await assets.attach(eng.renderer);
    const handle = await assets.acquire(o.asset, { pos: { x: o.origin.x, z: o.origin.z } });
    if (eng.disposed || !o.enabled() || eng.ktAsset) {
      handle.release();
      return;
    }
    const root = handle.scene;
    eng.ktAsset = { handle, mats: adoptGltfMaterials(root) };
    root.position.set(o.origin.x, o.origin.y, o.origin.z);
    if (o.material) {
      const made = new Map<THREE.Material, THREE.Material>();
      root.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.Material;
        let rep = made.get(src);
        if (!rep) {
          const r = o.material!(src.name);
          if (!r) return;
          rep = r;
          made.set(src, r);
          eng.ktAsset!.mats.push(r);
        }
        m.material = rep;
      });
    }
    // Object nằm trực tiếp dưới gốc; GLTF đổi hệ trục (x, -z → z) nên lấy toạ độ thế giới từ vị trí đã nạp.
    for (const ch of root.children) {
      const wx = o.origin.x + ch.position.x;
      const wz = o.origin.z + ch.position.z;
      if (o.flat?.some((f) => ch.name.startsWith(f))) {
        ch.position.y += o.flatDy ?? -4;
      } else if (o.ceiling && ch.name.startsWith(`${o.prefix}_ceil_`)) {
        const r = Math.hypot(ch.position.x, ch.position.z);
        const dome = o.ceiling.h * Math.sqrt(Math.max(0, 1 - (r / o.ceiling.r) ** 2));
        ch.position.y += dome - 1.5;
      } else {
        ch.position.y += heightAt(wx, wz) - o.origin.y - 0.15;
      }
    }
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map<string, { mesh: THREE.Mesh; mats: THREE.Matrix4[] }>();
    root.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      const key = `${m.geometry.uuid}|${(m.material as THREE.Material).uuid}`;
      const g = groups.get(key) ?? { mesh: m, mats: [] };
      g.mats.push(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      groups.set(key, g);
    });
    root.clear();
    for (const { mesh, mats } of groups.values()) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
      mats.forEach((mt, i) => im.setMatrixAt(i, mt));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = shadows && !o.noShadow?.test(mesh.name);
      im.receiveShadow = shadows;
      im.frustumCulled = false;
      im.name = `${o.prefix}-${mesh.name || 'part'}`;
      root.add(im);
    }
    eng.scene.add(root);
  } catch (e) {
    assetLog.warn(`không tải được ${o.asset}:`, e);
  }
}

/** Biên dịch trước mọi material trong cảnh theo đích của pass cảnh; lỗi thì để renderer biên dịch khi vẽ. */
export async function precompile(eng: Game): Promise<void> {
  if (!eng.post || eng.disposed) return;
  eng.compiling++;
  try {
    await eng.post.compileScene();
  } catch (e) {
    loadLog.warn('biên dịch trước lỗi, biên dịch khi vẽ:', e);
  } finally {
    eng.compiling--;
  }
}
