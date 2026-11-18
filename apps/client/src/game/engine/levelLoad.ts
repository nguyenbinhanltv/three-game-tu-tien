// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import * as THREE from 'three/webgpu';
import { terrainOf, propsOf, SECT, tribDef } from '@dtl/shared';
import { heightAt, levelAssets, levelId, levelTerrain } from '../../base/levelCtx';
import { LEVELS } from '@dtl/content';
import { get } from '../../ui/store';
import { Butterflies, BUTTERFLY_LEVELS } from '../world/butterflies';
import { Grass } from '../world/grass';
import { applyAtmosphere, createLanternHalos, setHeightFog, tuneAtmosphere } from '../../render/atmosphere';
import { buildRiftVeil } from '../../render/riftVeil';
import { skyTopOf } from '../../render/sky';
import { DeadTrees } from '../world/deadTrees';
import { deadTreeSpots, KIEP_BH, riftBlend, riftPath } from '../world/bacHoangArt';
import { buildEclipseSun } from '../../render/eclipse';
import { XICH_LEVEL, xichCracks, type XichAccent } from '../world/xichArt';
import { bhCtx } from '../world/propScatter';
import { Beacons } from '../../render/beacons';
import { applyGrading, markBloom } from '../../render/post';
import { adoptGltfMaterials } from '../../render/materials/world';
import { GRADING, GRADING_DEFAULT, mixHex, mixPreset, moodVariant, URL_MOOD, type GradingName } from '../../render/grading';
import { withOccluderFade } from '../world/occlusion';
import { LanternLights } from '../../render/lanternLights';
import { buildMoonGate, buildPortalDisc, buildSect, moonMirrorTexture, SECT_LANTERNS } from '../world/sect';
import { gatesToDraw } from '../world/gates';
import { buildCaveShell, buildCrystalGlow, buildMirrorFloor, buildPalaceHall } from '../world/caveShell';
import { PropLayer } from '../world/props';
import { allProps } from '../world/propScatter';
import { assets } from '../core/assets';
import { Terrain } from '../world/terrain';
import { loadGroundTextures } from '../../base/groundTextures';
import { FLAGS } from '../../base/flags';
import { LANTERN_LIGHT, QUALITY, isWebGPU, isWorldRoom } from './common';
import type { Game } from '../engine';

/** Nạp texture mặt đất ngoài đường găng: terrain dùng màu đỉnh tới khi xong rồi mới đổi sang shader PBR. */
export async function loadGround(eng: Game): Promise<void> {
  const t0 = performance.now();
  try {
    const self = eng;
    const g0 = levelAssets(levelId()).ground;
    const tex = await loadGroundTextures(import.meta.env.BASE_URL, { get aborted() { return self.disposed; } }, g0 ? g0.mask : 'manifest', g0 ? g0.set : 'terrain');
    if (eng.disposed) {
      tex.dispose();
      return;
    }
    eng.ground = tex;
    eng.loadStats.groundLoad = Math.round(performance.now() - t0);
    eng.loadStats.groundAt = Math.round(performance.now());
    applyGround(eng);
  } catch (e) {
    console.warn('[ground] không nạp được texture mặt đất, dùng màu đỉnh:', e);
  }
}

/** Dựng lớp riêng của Bắc Hoang: vệt nứt Giới Khích (3 draw call), cây chết (≤ 3 draw call). `?bhart=0` tắt để so ảnh. */
export function buildBacHoang(eng: Game): void {
  if (!FLAGS.bhArt) return;
  const T = levelTerrain();
  eng.riftMood = true;
  eng.riftMoodT = -1;
  eng.rift = buildRiftVeil(riftPath(T.def), (x, z) => heightAt(x, z));
  eng.scene.add(eng.rift.group);
  eng.deadTrees = new DeadTrees(deadTreeSpots(bhCtx(propsOf('bac_hoang')), 700), (x, z) => heightAt(x, z));
  eng.scene.add(eng.deadTrees.group);
  if (levelId() === KIEP_BH) {
    // Nhật thực: đĩa đen vành lửa treo trên khe Giới Khích, phía bắc-đông sân (chỗ camera mặc định ngẩng lên thấy được, không dưới khung HUD).
    const c = LEVELS[KIEP_BH].dungeon!.center;
    eng.eclipseSun = buildEclipseSun(c.x + 55, heightAt(c.x, c.z) + 12, c.z - 120, 15);
    eng.scene.add(eng.eclipseSun.group);
  }
}

export function buildXich(eng: Game, id: string, q: (typeof QUALITY)[string]): void {
  if (!FLAGS.xichArt) return;
  const T = levelTerrain();
  const paths = xichCracks(T.def, (x, z) => heightAt(x, z));
  for (const p of paths) {
    const v = buildRiftVeil(p, (x, z) => heightAt(x, z), { height: 7, ribs: false, floorHalf: 3, strength: 0.22, floorStrength: 0.6, endFade: true });
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
  const jadeGlow = buildCrystalGlow(jade);
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

/** Mood Bắc Hoang theo vị trí: 0 ở nửa nam (`ash_dawn`) → 1 ở ba vùng bắc (`rift`), đổi dần quanh Khích Giai. Chỉnh uniform, không biên dịch lại. */
export function updateRiftMood(eng: Game, dt: number, z: number): void {
  eng.riftMoodAcc += dt;
  if (eng.riftMoodAcc < 0.2 && eng.riftMoodT >= 0) return;
  eng.riftMoodAcc = 0;
  const t = riftBlend(z - levelTerrain().def.size / 2);
  if (Math.abs(t - eng.riftMoodT) < 0.01) return;
  eng.riftMoodT = t;
  const p = mixPreset(GRADING.ash_dawn, GRADING.rift, t);
  if (levelId() === KIEP_BH) {
    // Sân Nhật Thực Kiếp: sương mỏng hơn, tương phản và tối hơn để thấy rõ bia, boss và đĩa nhật thực (lần quay đầu bị sương hồng làm đục).
    p.fogDensity *= 0.4;
    if (p.fogHaze !== undefined) p.fogHaze *= 0.35;
    p.heightFogBoost *= 0.6;
    p.contrast *= 1.12;
    p.exposure *= 0.88;
  }
  tuneAtmosphere(eng.scene, eng.env, p, t > 0.5 ? 'rift' : 'ash_dawn', mixHex(skyTopOf('ash_dawn'), skyTopOf('rift'), t));
  applyGrading(p);
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
      if (disc) { disc.position.y -= 3.6; disc.position.y += 5.0; disc.position.z += 0.32; disc.scale.set(0.9, 1.12, 1); disc.userData.still = true; disc.userData.op = 0.82; const tex = moonMirrorTexture(); if (tex) { const dm = disc.material as THREE.MeshBasicMaterial; dm.map = tex; dm.color.set(0xffffff); dm.needsUpdate = true; disc.userData.mirrorTex = tex; }
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
    const pts = id === 'van_lam' || id === 'kiem_trung' ? SECT_LANTERNS : propsOf(id).filter((p) => p.id === 'prop_den_da').map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 2.1 * p.s, z: p.z }));
    // Cung gương: quầng đèn nhỏ, màu lạnh, không vào bloom (đèn đá không cháy trắng).
    const halos = levelAssets(id).palace ? createLanternHalos(pts, 1.3, levelAssets(id).palace === 'gilt' ? 0xd8a64a : 0xb8cdee) : createLanternHalos(pts);
    eng.scene.add(halos);
    eng.levelObjs.push(halos);
    eng.lanterns = new LanternLights(eng.scene, pts);
    eng.lanterns.setEnabled(q.lights && isWebGPU(eng.renderer)); // T6: đèn lồng point light thật chỉ ở WebGPU
    eng.lanterns.setIntensityScale((LANTERN_LIGHT[mood] ?? 1) * (levelAssets(id).palace ? 0.35 : 1));
  }
  const cave = levelAssets(id).cave;
  if (cave) {
    // Phó bản hang (E2-C): vách + trần tối che chân trời, tinh thể mạch phát sáng lam lục (hai draw call).
    const palaceAsset = levelAssets(id).palace;
    const palace: false | 'moon' | 'gilt' = palaceAsset ? (palaceAsset === 'gilt' ? 'gilt' : 'moon') : false;
    const shell = buildCaveShell(cave, heightAt(cave.x, cave.z), palace);
    const glow = buildCrystalGlow(propsOf(id).filter((p) => p.id === 'prop_mach_tinh_tru').map((p) => ({ x: p.x, y: heightAt(p.x, p.z) + 1.8, z: p.z })));
    eng.scene.add(shell, glow);
    eng.levelObjs.push(shell, glow);
    if (palace) {
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
    eng.props = new PropLayer(undefined, allProps(levelId()));
    eng.props.setQuality(get().quality, q.shadows);
    eng.scene.add(eng.props.group);
  }
  const pois = LEVELS[id]?.pois ?? [];
  if (F.beacons && pois.length) {
    // Giới Khích (Bắc Hoang) tự có vệt sáng riêng (render/riftVeil.ts), không thêm cột linh quang nón.
    eng.beacons = new Beacons(pois.filter((p) => p.beamH && !(id === 'bac_hoang' && p.id === 'gioi_khich')).map((p) => ({ x: p.x, z: p.z, h: p.beamH ?? 0 })));
    eng.beacons.mesh.visible = isWorldRoom(get().room);
    eng.scene.add(eng.beacons.mesh);
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
  eng.terrain.setGround(g ? eng.ground : null, (QUALITY[get().quality] ?? QUALITY.medium).ground);
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
    console.warn('[asset] không tải được arch_sect, dùng kiến trúc dựng bằng code:', e);
  }
}

/** Biên dịch trước mọi material trong cảnh theo đích của pass cảnh; lỗi thì để renderer biên dịch khi vẽ. */
export async function precompile(eng: Game): Promise<void> {
  if (!eng.post || eng.disposed) return;
  eng.compiling++;
  try {
    await eng.post.compileScene();
  } catch (e) {
    console.warn('[load] biên dịch trước lỗi, biên dịch khi vẽ:', e);
  } finally {
    eng.compiling--;
  }
}
