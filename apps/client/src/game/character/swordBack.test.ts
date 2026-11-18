import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../core/assets';
import { HUMAN_ANIM_LIB, HUMAN_K3_LIB, retargetClips } from './animLib';
import { nodeGltfLoader } from '../core/gltfTestLoader';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const cache = new AssetCache({
  base: '',
  fetchManifest: async () => MANIFEST,
  load: async (url) => {
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
    const loader = nodeGltfLoader();
    return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  },
});

/** Mỗi 0,1 s của clip: hướng vỏ kiếm lưng (xương dtl_sword) so với ngực (spine2) và độ cúi của ngực so với phương đứng. */
function trace(
  target: THREE.Object3D,
  clip: THREE.AnimationClip,
): { rel: number[]; swordFromUp: number[]; chestFromUp: number[]; geo: THREE.Vector3[]; hipsLean: number[] } {
  const root = target.clone(true);
  new THREE.Scene().add(root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const get = (n: string) => root.getObjectByName(n)!;
  const sword = get('dtl_sword');
  const chest = get('mixamorig_spine2');
  const neck = get('mixamorig_neck');
  const up = new THREE.Vector3(0, 1, 0);
  const rel: number[] = [];
  const swordFromUp: number[] = [];
  const chestFromUp: number[] = [];
  const geo: THREE.Vector3[] = [];
  const hipsLean: number[] = [];
  const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const hips = get('mixamorig_hips');
  const lUp = get('mixamorig_leftarm');
  const rUp = get('mixamorig_rightarm');
  const q = new THREE.Quaternion();
  const q0 = new THREE.Quaternion();
  let first: THREE.Quaternion | null = null;
  for (let t = 0; t < clip.duration; t += 0.1) {
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    // Hướng tương đối: quay thế giới của xương kiếm trong hệ ngực.
    q.copy(chest.getWorldQuaternion(q0)).invert().multiply(sword.getWorldQuaternion(new THREE.Quaternion()));
    first ??= q.clone();
    rel.push((q.angleTo(first) * 180) / Math.PI);
    // Khung hình học (không dùng quay của xương ngực): lên = cổ − hông, phải = vai phải − vai trái, trước = lên × phải.
    const gUp = pos(neck).sub(pos(hips)).normalize();
    const gRight = pos(rUp).sub(pos(lUp)).normalize();
    gRight.addScaledVector(gUp, -gRight.dot(gUp)).normalize();
    const gFwd = new THREE.Vector3().crossVectors(gUp, gRight).normalize();
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(sword.getWorldQuaternion(new THREE.Quaternion()));
    geo.push(new THREE.Vector3(axis.dot(gRight), axis.dot(gUp), axis.dot(gFwd)));
    hipsLean.push((gUp.angleTo(up) * 180) / Math.PI);
    const dirOf = (o: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    swordFromUp.push((dirOf(sword).angleTo(up) * 180) / Math.PI);
    const c = chest.getWorldPosition(new THREE.Vector3());
    chestFromUp.push((neck.getWorldPosition(new THREE.Vector3()).sub(c).angleTo(up) * 180) / Math.PI);
  }
  return { rel, swordFromUp, chestFromUp, geo, hipsLean };
}

/** Độ cúi tối đa của ngực (°) ở clip không phải ngã/chết: cúi sâu hơn thì vỏ kiếm lưng nằm ngang qua đầu. Lộn (dodge_*) cho phép sâu hơn ở đỉnh lộn. */
const LEAN_MAX: Record<string, number> = {
  heavy_chop: 60,
  hit_front_1: 50,
  hit_front_2: 50,
  hit_heavy: 50,
  hit_head: 50,
  hit_l: 50,
  hit_r: 50,
  getup: 56,
  dodge_f: 85,
  dodge_l: 85,
  dodge_r: 85,
  dodge_back: 95,
  combat_idle: 20,
  guard: 30,
};

describe('vỏ kiếm đeo lưng đi theo ngực trong mọi clip của thư viện', () => {
  it('hướng vỏ trong khung hình học (lên = cổ − hông, trước = lên × vai phải-trái) lệch dưới 40° so với lúc đứng ở mọi khung thân chưa nằm/lộn', async () => {
    const libs = [await cache.acquire(HUMAN_ANIM_LIB), await cache.acquire(HUMAN_K3_LIB)];
    for (const id of ['chr_kiem_tu_nam', 'chr_kiem_tu_nu']) {
      const h = await cache.acquire(id);
      const idle = retargetClips(libs[0].scene, libs[0].animations, h.scene).find((c) => c.name === 'idle')!;
      const ref = trace(h.scene, idle).geo[0];
      const bad: string[] = [];
      for (const lib of libs) {
        for (const clip of retargetClips(lib.scene, lib.animations, h.scene)) {
          const r = trace(h.scene, clip);
          r.geo.forEach((g, i) => {
            if (r.hipsLean[i] >= 60) return; // thân nằm hoặc đang lộn: vỏ theo thân là đúng
            const d = (g.angleTo(ref) * 180) / Math.PI;
            if (process.env.K3_SWORD_REPORT && d >= 40) console.log('GEO', id, clip.name, (i * 0.1).toFixed(1), Math.round(d));
            if (d >= 40) bad.push(`${id}/${clip.name}@${(i * 0.1).toFixed(1)}s ${Math.round(d)}°`);
          });
        }
      }
      expect(bad, `${id}: khung vỏ lệch ≥ 40° so với lúc đứng`).toEqual([]);
      h.release();
    }
    libs.forEach((l) => l.release());
  });

  it('hướng vỏ so với spine2 không đổi (< 0,5°) ở mọi clip, nam và nữ', async () => {
    const libs = [await cache.acquire(HUMAN_ANIM_LIB), await cache.acquire(HUMAN_K3_LIB)];
    for (const id of ['chr_kiem_tu_nam', 'chr_kiem_tu_nu']) {
      const h = await cache.acquire(id);
      for (const lib of libs) {
        for (const clip of retargetClips(lib.scene, lib.animations, h.scene)) {
          const r = trace(h.scene, clip);
          expect(Math.max(...r.rel), `${id}/${clip.name}`).toBeLessThan(0.5);
          if (LEAN_MAX[clip.name]) expect(Math.max(...r.chestFromUp), `${id}/${clip.name} cúi`).toBeLessThan(LEAN_MAX[clip.name]);
          if (process.env.K3_SWORD_REPORT) console.log(id, clip.name, r.chestFromUp.map((x) => Math.round(x)).join(' '));
        }
      }
      h.release();
    }
    libs.forEach((l) => l.release());
  });
});
