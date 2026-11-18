import fs from 'node:fs';
import { cpuBudget } from './cpuBudget';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it, vi } from 'vitest';
import { APPEARANCE, SKILLS } from '@dtl/content';
import { POSE_SWORD_SWAP } from '@dtl/shared';
import { AssetCache, type Manifest } from '../core/assets';
import { PlayerSkins, SHEATHE_AFTER, SkinnedPlayer } from './playerSkins';
import { SKIRT_SPRING, SpringBones, springDefs } from './spring';
import { partExtras } from './sword';
import type { AnimState } from './view';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// M3-2 (rút/tra kiếm) và M3-10 (lò xo vạt áo) trên model thật Thanh Phong.
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });
const MALE = { g: 'm', dye: APPEARANCE.defaultDye };
const DT = 1 / 60;

function cache() {
  return new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
}

async function player(): Promise<{ m: SkinnedPlayer; s: PlayerSkins }> {
  const s = new PlayerSkins(cache());
  s.preload();
  for (let i = 0; i < 100 && s.pending(MALE); i++) await new Promise((r) => setTimeout(r, 10));
  const m = s.create(MALE) as SkinnedPlayer;
  expect(m).toBeInstanceOf(SkinnedPlayer);
  m.setViewDistance(0);
  return { m, s };
}

function run(m: SkinnedPlayer, a: AnimState, sec: number) {
  for (let t = 0; t < sec - 1e-9; t += DT) m.update(DT, a);
}

function bone(m: SkinnedPlayer, re: RegExp): THREE.Bone {
  let b: THREE.Bone | null = null;
  m.rig.traverse((o) => {
    if (!b && (o as THREE.Bone).isBone && re.test(o.name)) b = o as THREE.Bone;
  });
  return b!;
}

const pos = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

describe('rút / tra kiếm (M3-2)', () => {
  it('asset có xương kiếm và extras; clip không còn kênh xương phụ dtl_*', async () => {
    const { m, s } = await player();
    const sword = bone(m, /^dtl_sword$/);
    expect(sword).toBeTruthy();
    expect(sword.parent?.name).toMatch(/spine2$/i);
    expect(m.swordDrawn).toBe(false);
    const names = m.actionOf('idle')?.getClip().tracks.map((t) => t.name) ?? [];
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((n) => n.startsWith('dtl_'))).toBe(false);
    m.dispose();
    s.dispose();
  });

  it('trúng đòn: rút bằng động tác tay phải, đổi sang tay đúng lúc nắm chuôi; chuôi nằm trong lòng bàn tay', async () => {
    const { m, s } = await player();
    run(m, anim(), 0.5);
    const sword = bone(m, /^dtl_sword$/);
    const hand = bone(m, /righthand$/i);
    const backGrip = pos(sword);
    m.hitReact({});
    expect(m.performing('rut_kiem')).toBe(true);
    // Trúng đòn có hit-stop (dt hoạt ảnh = 0 vài khung) nên đếm theo thời gian trong clip, không theo đồng hồ.
    let jump = -1;
    let at = 0;
    for (let i = 0; i < 120 && jump < 0; i++) {
      const before = pos(sword);
      m.update(DT, anim());
      if (m.swordDrawn) {
        jump = before.distanceTo(pos(sword));
        at = i * DT;
      }
    }
    expect(m.swordDrawn).toBe(true);
    // Đổi đúng lúc tay tới chuôi, không phải ngay khi bị đánh.
    expect(at).toBeGreaterThanOrEqual(POSE_SWORD_SWAP.rut_kiem - 2 * DT);
    // Lúc đổi, chuôi trong tay gần chỗ chuôi trên lưng (bàn tay đã tới chuôi): không nhảy xa.
    console.info(`[M3-2] rút: chuôi nhảy ${(jump * 100).toFixed(1)} cm lúc đổi socket; chuôi trên lưng ${backGrip.toArray().map((x) => x.toFixed(2))}`);
    expect(jump).toBeLessThan(0.15);
    run(m, anim(), 0.5);
    // Tâm chuôi cách cổ tay ~8 cm (lòng bàn tay).
    expect(pos(sword).distanceTo(pos(hand))).toBeLessThan(0.14);
    expect(m.swordDrawn).toBe(true);
    m.dispose();
    s.dispose();
  });

  it('ra chiêu: kiếm vào tay ngay; rảnh 5 giây thì tra bằng động tác, về đúng chỗ trên lưng', async () => {
    const { m, s } = await player();
    run(m, anim(), 0.3);
    const sword = bone(m, /^dtl_sword$/);
    const spine = sword.parent!;
    const rest = sword.matrix.clone();
    const skill = SKILLS.find((k) => k.pose && k.cast === 0)!;
    m.perform(skill.pose!);
    expect(m.swordDrawn).toBe(true);
    expect(sword.parent).not.toBe(spine);
    run(m, anim(), SHEATHE_AFTER - 0.2);
    expect(m.swordDrawn).toBe(true);
    run(m, anim(), 0.4);
    expect(m.performing('tra_kiem')).toBe(true);
    run(m, anim(), 0.7);
    expect(m.swordDrawn).toBe(false);
    expect(sword.parent).toBe(spine);
    for (let i = 0; i < 16; i++) expect(sword.matrix.elements[i]).toBeCloseTo(rest.elements[i], 5);
    m.dispose();
    s.dispose();
  });

  it('đang niệm chú thì không tra; ngự kiếm thì tra ngay không cần động tác', async () => {
    const { m, s } = await player();
    m.hitReact({});
    run(m, anim(), 0.6);
    expect(m.swordDrawn).toBe(true);
    run(m, anim({ casting: true }), SHEATHE_AFTER + 1);
    expect(m.swordDrawn).toBe(true);
    run(m, anim({ flying: true }), DT);
    expect(m.swordDrawn).toBe(false);
    m.dispose();
    s.dispose();
  });

  it('đang bay mà nhận FX chiêu (server không cho, chỉ là trễ mạng) thì kiếm vẫn trên lưng', async () => {
    const { m, s } = await player();
    run(m, anim({ flying: true }), 0.2);
    const skill = SKILLS.find((k) => k.pose)!;
    m.perform(skill.pose!);
    expect(m.swordDrawn).toBe(false);
    m.dispose();
    s.dispose();
  });
});

describe('lò xo vạt áo (M3-10)', () => {
  it('có 4 xương vạt áo; đứng yên giữ gần tư thế nghỉ; chạy thì vạt áo bay ra sau; LOD xa trả về nghỉ', async () => {
    const { m, s } = await player();
    const back = bone(m, /^dtl_hem_bl$/);
    const restQ = back.quaternion.clone();
    run(m, anim(), 1);
    expect(m.springCount).toBe(4);
    expect(back.quaternion.angleTo(restQ)).toBeLessThan((3 * Math.PI) / 180);
    const tail = () => new THREE.Vector3(0, 0.3, 0).applyMatrix4(back.matrixWorld);
    // Đuôi lúc đứng (hệ nhân vật) để so khi chạy.
    const still = tail();
    for (let t = 0; t < 1; t += DT) {
      m.root.position.z += 7 * DT;
      m.update(DT, anim({ speed: 7 }));
    }
    const moving = tail();
    console.info(`[M3-10] chạy 7 m/s: đuôi vạt sau lệch ${((still.z - moving.z) * 100).toFixed(1)} cm về sau (hệ nhân vật)`);
    expect(moving.z).toBeLessThan(still.z - 0.02);
    expect(back.quaternion.angleTo(restQ)).toBeLessThan(((SKIRT_SPRING.maxAngle + 2) * Math.PI) / 180);
    m.setView({ dist: 40, inView: true, allowLod0: true });
    m.update(DT, anim({ speed: 7 }));
    expect(m.springCount).toBe(0);
    expect(back.quaternion.angleTo(restQ)).toBeLessThan(1e-3);
    m.dispose();
    s.dispose();
  });

  it('CPU: 12 thể × 4 xương dưới 0,5 ms mỗi khung', async () => {
    const handle = await cache().acquire('chr_kiem_tu_nam');
    const defs = springDefs(handle.scene, partExtras(handle.scene).springs ?? []);
    expect(defs.length).toBe(4);
    const bodies = Array.from({ length: 12 }, () => {
      const scene = cloneSkinned(handle.scene);
      scene.updateMatrixWorld(true);
      return new SpringBones(scene, defs);
    });
    const world = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const step = (i: number) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.05);
      world.compose(new THREE.Vector3(Math.sin(i * 0.02) * 5, 0, i * 0.1), q, new THREE.Vector3(1, 1, 1));
      for (const b of bodies) b.update(DT, world);
    };
    for (let i = 0; i < 120; i++) step(i);
    const N = 600;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) step(120 + i);
    const ms = (performance.now() - t0) / N;
    console.info(`[M3-10] lò xo 12 thể × 4 xương: ${(ms * 1000).toFixed(1)} µs/khung`);
    expect(ms).toBeLessThan(cpuBudget(0.5));
    handle.release();
  });
});

describe('ma trận xương khi đổi ngoài mixer (M6-3)', () => {
  it('kiếm đổi socket và lò xo vạt áo làm skeleton tính lại dù mixer chưa chạy', async () => {
    const { m, s } = await player();
    run(m, anim(), 0.2);
    let sk: THREE.Skeleton | undefined;
    m.root.traverse((o) => (sk ??= (o as THREE.SkinnedMesh).skeleton));
    const spy = vi.spyOn(THREE.Skeleton.prototype, 'update');
    // Người khác ở LOD0: mixer 60 Hz; bước 1/240 giây thì mixer chưa chạy nhưng lò xo chạy.
    m.setView({ dist: 5, inView: true, allowLod0: true, self: false });
    m.update(1 / 60, anim({ speed: 7 }));
    sk!.update();
    const n0 = spy.mock.calls.length;
    sk!.update();
    expect(spy.mock.calls.length).toBe(n0);
    m.update(1 / 240, anim({ speed: 7 }));
    sk!.update();
    expect(spy.mock.calls.length).toBe(n0 + 1);
    // LOD1 (mixer 12 Hz): ra chiêu thì kiếm vào tay ngay, ma trận xương phải theo.
    m.setView({ dist: 40, inView: true, allowLod0: false, self: false });
    m.update(1 / 240, anim());
    sk!.update();
    const n1 = spy.mock.calls.length;
    m.perform(SKILLS.find((k) => k.pose && k.cast === 0)!.pose!);
    expect(m.swordDrawn).toBe(true);
    sk!.update();
    expect(spy.mock.calls.length).toBe(n1 + 1);
    spy.mockRestore();
    m.dispose();
    s.dispose();
  });
});
