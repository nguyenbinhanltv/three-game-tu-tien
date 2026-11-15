import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { HUMAN_CLIP_NAMES } from './humanClips';
import { acquireWithHumanLib, HUMAN_ANIM_LIB, mergeClips, retargetClips } from './animLib';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const CHARACTERS = ['chr_kiem_tu_nam', 'chr_npc_chuong_mon', 'chr_npc_duoc_su', 'chr_npc_thiet_lao'];
const CLIPS = HUMAN_CLIP_NAMES;

const cache = new AssetCache({
  base: '',
  fetchManifest: async () => MANIFEST,
  load: async (url) => {
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
    const loader = createGltfLoader(createKtx2Loader());
    loader.register(() => ({ name: 'test_stub_texture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  },
});

/** Xương theo tên. Thư viện không mesh/skin nên three dựng xương thành Object3D thường: lấy theo tiền tố tên. */
function bones(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const m = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone || o.name.startsWith('mixamorig_')) m.set(o.name, o);
  });
  return m;
}

/** Cao độ thế giới thấp nhất của hai bàn chân (xương *foot) ở thời điểm t của clip, trên bản sao mới. */
function footTrace(target: THREE.Object3D, clip: THREE.AnimationClip, steps: number): { low: number[]; hipsY: number[] } {
  const root = target.clone(true);
  const sc = new THREE.Scene();
  sc.add(root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const b = bones(root);
  const feet = [b.get('mixamorig_leftfoot')!, b.get('mixamorig_rightfoot')!];
  const hips = b.get('mixamorig_hips')!;
  const p = new THREE.Vector3();
  const low: number[] = [];
  const hipsY: number[] = [];
  for (let i = 0; i < steps; i++) {
    mixer.setTime((clip.duration * i) / steps);
    root.updateMatrixWorld(true);
    low.push(Math.min(...feet.map((f) => f.getWorldPosition(p).y)));
    hipsY.push(hips.getWorldPosition(p).y);
  }
  return { low, hipsY };
}

describe('thư viện clip chung anim_human_base (M2-3)', () => {
  it('có đủ clip theo bảng humanClips, không mesh, chỉ xương mixamorig', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    expect(lib.animations.map((c) => c.name).sort()).toEqual([...CLIPS].sort());
    let meshes = 0;
    lib.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(0);
    expect(bones(lib.scene).size).toBe(54);
    lib.release();
  });

  it('tư thế nghỉ 4 nhân vật cùng bộ xương nhưng hướng xương thân/tay/chân lệch thư viện dưới 45° (Tripo auto-rig: cần retarget)', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    lib.scene.updateMatrixWorld(true);
    const lb = bones(lib.scene);
    const dir = (o: THREE.Object3D) => {
      const c = o.children.find((x) => x.name.startsWith('mixamorig_'));
      return c ? c.getWorldPosition(new THREE.Vector3()).sub(o.getWorldPosition(new THREE.Vector3())).normalize() : null;
    };
    for (const id of CHARACTERS) {
      const h = await cache.acquire(id);
      h.scene.updateMatrixWorld(true);
      let worst = 0;
      let compared = 0;
      for (const [name, b] of bones(h.scene)) {
        const l = lb.get(name);
        if (!l) continue;
        compared++;
        if (/hand(index|middle|ring|pinky|thumb)/.test(name)) continue; // ngón tay: không dùng cho chuyển động chính
        const d1 = dir(b);
        const d2 = dir(l);
        if (d1 && d2) worst = Math.max(worst, (d1.angleTo(d2) * 180) / Math.PI);
      }
      expect(compared, id).toBeGreaterThanOrEqual(54);
      expect(worst, id).toBeLessThan(45);
      h.release();
    }
    lib.release();
  });

  it('asset người không còn mang clip riêng; retarget cho đủ clip, kênh theo tên xương, kênh vị trí scale theo tỉ lệ xương', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    const lb = bones(lib.scene);
    for (const id of CHARACTERS) {
      const h = await cache.acquire(id);
      expect(h.animations.length, `${id} không mang clip`).toBe(0);
      const out = retargetClips(lib.scene, lib.animations, h.scene);
      expect(out.map((c) => c.name).sort()).toEqual([...CLIPS].sort());
      const db = bones(h.scene);
      const hipsRatio = db.get('mixamorig_hips')!.position.length() / lb.get('mixamorig_hips')!.position.length();
      for (const c of out) {
        for (const t of c.tracks) {
          const [bone, prop] = t.name.split('.');
          expect(db.has(bone), `${id}/${c.name}/${bone}`).toBe(true);
          expect(['quaternion', 'position']).toContain(prop);
          if (prop === 'position') expect(bone).toBe('mixamorig_hips');
        }
        const src = lib.animations.find((x) => x.name === c.name)!;
        const a = c.tracks.find((t) => t.name === 'mixamorig_hips.position')!;
        const b = src.tracks.find((t) => t.name === 'mixamorig_hips.position')!;
        // Vị trí hông = nghỉ đích + k · (nguồn − nghỉ nguồn): độ cao hông khung 0 theo tỉ lệ chiều cao hông.
        const ry = lb.get('mixamorig_hips')!.position.y;
        expect(a.values[1]).toBeCloseTo(db.get('mixamorig_hips')!.position.y + hipsRatio * (b.values[1] - ry), 2);
      }
      h.release();
    }
    lib.release();
  });

  it('chân bám đất khi chạy/đứng: bàn chân thấp nhất quanh mặt đất và độ cao hông không lệch giữa các nhân vật', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    for (const id of CHARACTERS) {
      const h = await cache.acquire(id);
      const out = retargetClips(lib.scene, lib.animations, h.scene);
      const rest = footTrace(h.scene, new THREE.AnimationClip('rest', 1, []), 1).low[0];
      for (const name of ['run', 'idle']) {
        const { low } = footTrace(h.scene, out.find((c) => c.name === name)!, 40);
        // Chân trụ chạm đất (±6 cm quanh tư thế nghỉ): không lơ lửng, không lún.
        expect(Math.min(...low) - rest, `${id}/${name} lún`).toBeGreaterThan(-0.06);
        expect(Math.min(...low) - rest, `${id}/${name} lơ lửng`).toBeLessThan(0.06);
      }
      // Độ cao hông khi idle so với hông ở tư thế nghỉ của chính nhân vật: lệch quá 10% nghĩa là scale hông sai tỉ lệ.
      const restHips = footTrace(h.scene, new THREE.AnimationClip('rest', 1, []), 1).hipsY[0];
      const idleHips = footTrace(h.scene, out.find((c) => c.name === 'idle')!, 1).hipsY[0];
      expect(idleHips / restHips, `${id} độ cao hông`).toBeGreaterThan(0.9);
      expect(idleHips / restHips, `${id} độ cao hông`).toBeLessThan(1.1);
      h.release();
    }
    lib.release();
  });

  it('hướng xương trong không gian thế giới theo đúng chuyển động nguồn (độ lệch so với tư thế nghỉ bằng nhau)', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    const lb = bones(lib.scene);
    lib.scene.updateMatrixWorld(true);
    const srcRest = new Map([...lb].map(([n, o]) => [n, o.getWorldQuaternion(new THREE.Quaternion())]));
    const sample = (root: THREE.Object3D, clip: THREE.AnimationClip, t: number) => {
      const r = root.clone(true);
      new THREE.Scene().add(r);
      const mx = new THREE.AnimationMixer(r);
      mx.clipAction(clip).play();
      mx.setTime(t);
      r.updateMatrixWorld(true);
      return bones(r);
    };
    for (const id of CHARACTERS) {
      const h = await cache.acquire(id);
      h.scene.updateMatrixWorld(true);
      const dstRest = new Map([...bones(h.scene)].map(([n, o]) => [n, o.getWorldQuaternion(new THREE.Quaternion())]));
      const out = retargetClips(lib.scene, lib.animations, h.scene);
      for (const name of ['run', 'heavy_chop']) {
        const clip = out.find((c) => c.name === name)!;
        const t = clip.duration * 0.4;
        const sb = sample(lib.scene, lib.animations.find((c) => c.name === name)!, t);
        const db = sample(h.scene, clip, t);
        let worst = 0;
        for (const [n, o] of db) {
          const so = sb.get(n);
          if (!so || !srcRest.has(n)) continue;
          const ds = so.getWorldQuaternion(new THREE.Quaternion()).multiply(srcRest.get(n)!.clone().invert());
          const dd = o.getWorldQuaternion(new THREE.Quaternion()).multiply(dstRest.get(n)!.clone().invert());
          worst = Math.max(worst, (ds.angleTo(dd) * 180) / Math.PI);
        }
        expect(worst, `${id}/${name}`).toBeLessThan(1.5);
      }
      h.release();
    }
    lib.release();
  });

  it('clip riêng của asset (nếu có) thắng clip chung cùng tên', () => {
    const own = new THREE.AnimationClip('idle', 1, []);
    const shared = [new THREE.AnimationClip('idle', 2, []), new THREE.AnimationClip('run', 1, [])];
    const m = mergeClips([own], shared);
    expect(m.map((c) => c.name)).toEqual(['idle', 'run']);
    expect(m[0].duration).toBe(1);
  });
});

describe('acquireWithHumanLib', () => {
  it('một bên lỗi thì nhả handle bên đã nạp, không để ref treo', async () => {
    let released = 0;
    const fake = {
      acquire: async (id: string) => {
        if (id === HUMAN_ANIM_LIB) throw new Error('thư viện lỗi');
        return { release: () => released++ };
      },
    } as unknown as AssetCache;
    await expect(acquireWithHumanLib(fake, 'chr_kiem_tu_nam')).rejects.toThrow('thư viện lỗi');
    expect(released).toBe(1);
  });
});
