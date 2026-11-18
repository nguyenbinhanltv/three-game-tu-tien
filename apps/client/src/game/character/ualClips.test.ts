import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../core/assets';
import { HUMAN_UAL_LIB, retargetClips } from './animLib';
import { clipNamesOf, HUMAN_CLIPS } from './humanClips';

/** Thư viện UAL (Quaternius CC0, anim_human_ual): clip retarget lên cả hai đời nhân vật (v1 Tripo, v2 MakeHuman), nam và nữ. */

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const CHARACTERS = ['chr_kiem_tu_nam', 'chr_kiem_tu_nu', 'chr_v2_nam', 'chr_v2_nu'];

// Áo/thân v2 dùng texture WebP: GLTFLoader cần `self` (môi trường node không có) và không cần ảnh thật để đo xương.
(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= () => Promise.resolve(new THREE.Texture().image ?? {});

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

const FPS = 30;
const pinned = (name: string) => !['ual_combat_idle', 'ual_idle_fold', 'ual_idle_talk', 'ual_yes', 'ual_no'].includes(name);

interface Measure {
  /** Độ cao thế giới thấp nhất của hai cổ chân (m; đất = 0, cổ chân lúc nằm cao ~5–10 cm). */
  footLow: number;
  hipsMin: number;
  hipsMax: number;
  /** Độ lệch ngang lớn nhất của hông so với khung đầu (m). */
  drift: number;
  /** Khoảng cách nhỏ nhất từ hai bàn tay tới trục thân (hông → cổ) (m). */
  handToTorso: number;
  /** Khoảng cách nhỏ nhất từ bàn tay tới đoạn kiếm lưng `dtl_sword` (m); Infinity nếu nhân vật không có. */
  handToSword: number;
}

function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function measure(target: THREE.Object3D, clip: THREE.AnimationClip): Measure {
  const root = target.clone(true);
  new THREE.Scene().add(root);
  const find = (n: string) => {
    let r: THREE.Object3D | null = null;
    root.traverse((o) => o.name === n && (r = o));
    return r as THREE.Object3D | null;
  };
  const feet = ['mixamorig_leftfoot', 'mixamorig_rightfoot'].map(find) as THREE.Object3D[];
  const hips = find('mixamorig_hips')!;
  const neck = find('mixamorig_neck')!;
  const hands = ['mixamorig_lefthand', 'mixamorig_righthand'].map(find) as THREE.Object3D[];
  const sword = find('dtl_sword');
  root.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const m: Measure = { footLow: Infinity, hipsMin: Infinity, hipsMax: -Infinity, drift: 0, handToTorso: Infinity, handToSword: Infinity };
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let h0: THREE.Vector3 | null = null;
  const n = Math.round(clip.duration * FPS);
  for (let i = 0; i <= n; i++) {
    mixer.setTime(Math.min(clip.duration, i / FPS));
    root.updateMatrixWorld(true);
    for (const f of feet) m.footLow = Math.min(m.footLow, f.getWorldPosition(p).y);
    hips.getWorldPosition(a);
    m.hipsMin = Math.min(m.hipsMin, a.y);
    m.hipsMax = Math.max(m.hipsMax, a.y);
    h0 ??= a.clone();
    m.drift = Math.max(m.drift, Math.hypot(a.x - h0.x, a.z - h0.z));
    neck.getWorldPosition(b);
    for (const h of hands) {
      h.getWorldPosition(p);
      m.handToTorso = Math.min(m.handToTorso, segDist(p, a, b));
      if (sword) {
        const s0 = sword.getWorldPosition(new THREE.Vector3());
        const s1 = sword.localToWorld(new THREE.Vector3(0, 0.9, 0));
        m.handToSword = Math.min(m.handToSword, segDist(p, s0, s1));
      }
    }
  }
  return m;
}

describe('UAL: thư viện anim_human_ual', () => {
  it('đúng các clip trong bảng humanClips, độ dài hợp lý, không NaN, clip lặp khép vòng', async () => {
    const lib = await cache.acquire(HUMAN_UAL_LIB);
    expect(lib.animations.map((c) => c.name).sort()).toEqual(clipNamesOf('ual').sort());
    for (const c of lib.animations) {
      expect(c.duration, c.name).toBeGreaterThan(0.25);
      expect(c.duration, c.name).toBeLessThan(4);
      for (const t of c.tracks) expect(t.values.every(Number.isFinite), `${c.name}/${t.name}`).toBe(true);
      if (HUMAN_CLIPS[c.name]!.loop) {
        let worst = 0;
        for (const t of c.tracks) {
          if (!t.name.endsWith('.quaternion')) continue;
          const k = t.times.length;
          worst = Math.max(
            worst,
            new THREE.Quaternion().fromArray(t.values, 0).angleTo(new THREE.Quaternion().fromArray(t.values, (k - 1) * 4)),
          );
        }
        expect((worst * 180) / Math.PI, c.name).toBeLessThan(6);
      }
    }
    lib.release();
  });

  for (const id of CHARACTERS) {
    it(`${id}: clip UAL không lún đất, không trôi hông, không xuyên thân/kiếm lưng`, async () => {
      const lib = await cache.acquire(HUMAN_UAL_LIB);
      const h = await cache.acquire(id);
      let restHips = 0;
      h.scene.traverse((o) => o.name === 'mixamorig_hips' && (restHips = o.getWorldPosition(new THREE.Vector3()).y));
      const out = retargetClips(lib.scene, lib.animations, h.scene);
      expect(out.length).toBe(lib.animations.length);
      const rows: Record<string, Measure> = {};
      for (const c of out) {
        const m = (rows[c.name] = measure(h.scene, c));
        // Hông co theo chiều cao chân (k) nên không bay lên (lỗi Z-up cũ: hông 1,7 m, chết 11 m).
        expect.soft(m.hipsMax, `${id}/${c.name} hông quá cao`).toBeLessThan(restHips * 1.25);
        expect.soft(m.hipsMin, `${id}/${c.name} hông chìm`).toBeGreaterThan(-0.05);
        // Cổ chân không chìm dưới đất (dung sai 7 cm: khớp cổ chân của rig Tripo v1 nằm thấp, lúc ngã/dậy lún tối đa ~6 cm trong vài khung).
        expect.soft(m.footLow, `${id}/${c.name} chân lún`).toBeGreaterThan(-0.07);
        // Ghim hông ngang: không lệch quá 25 cm (chỉ còn phần dịch do chênh tỉ lệ thân).
        if (pinned(c.name)) expect.soft(m.drift, `${id}/${c.name} trôi ngang`).toBeLessThan(0.25);
        // Hai bàn tay không chui vào thân (trục hông → cổ) và không xuyên vỏ kiếm lưng.
        expect.soft(m.handToTorso, `${id}/${c.name} tay xuyên thân`).toBeGreaterThan(0.05);
        expect.soft(m.handToSword, `${id}/${c.name} tay xuyên kiếm lưng`).toBeGreaterThan(0.03);
      }
      if (process.env.UAL_DUMP) fs.writeFileSync(path.join(process.env.UAL_DUMP, `ual-measure-${id}.json`), JSON.stringify(rows, null, 1));
      lib.release();
      h.release();
    });
  }
});
