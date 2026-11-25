import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../core/assets';
import { PATCH_PHASE } from './patchLoop';

/**
 * Đo pha chân trụ trên file clip THẬT: bước chạm đất của chân trái (chân hạ xuống dưới ymin + 5 cm sau đoạn bay) của `Jog_Fwd_Loop` (clip tham chiếu của
 * dải chạy, chung pha với bản lùi/ngang) và của `PM_Run`/`PM_Sprint` + độ lệch pha trong `PATCH_PHASE` phải trùng nhau. Đổi clip/độ lệch mà lệch pha là test này đỏ.
 */
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
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

/** Pha (0–1) chân `side` bắt đầu chạm đất (chuyển từ bay sang trụ, vòng tròn). */
function touchdownPhase(scene: THREE.Object3D, clip: THREE.AnimationClip, side: 'l' | 'r'): number {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const foot = scene.getObjectByName(`foot_${side}`)!;
  const N = 240;
  const y: number[] = [];
  for (let i = 0; i < N; i++) {
    mixer.setTime((i / N) * clip.duration);
    scene.updateMatrixWorld(true);
    y.push(foot.getWorldPosition(new THREE.Vector3()).y);
  }
  mixer.stopAllAction();
  const thr = Math.min(...y) + 0.05;
  const on = y.map((v) => v < thr);
  let start = -1;
  for (let i = 0; i < N; i++) if (on[i] && !on[(i + N - 1) % N]) start = i;
  return start / N;
}

describe('clip chạy Patch: pha chạm đất khớp Jog_Fwd_Loop sau độ lệch', () => {
  it('chân trái và chân phải của PM_Run, PM_Sprint lệch ≤ 0,02 chu kỳ so với UAL jog', async () => {
    const ual = await cache.acquire('anim_ual_native');
    const pm = await cache.acquire('anim_patch_move');
    const jog = ual.animations.find((c) => c.name === 'Jog_Fwd_Loop')!;
    for (const name of ['PM_Run', 'PM_Sprint'] as const) {
      const clip = pm.animations.find((c) => c.name === name)!;
      for (const side of ['l', 'r'] as const) {
        const ref = touchdownPhase(ual.scene, jog, side);
        const mine = touchdownPhase(pm.scene, clip, side);
        // đọc clip tại (pha chung + lệch): chạm đất xảy ra ở pha chung p thỏa p + lệch = mine
        const shared = (((mine - PATCH_PHASE[name]!) % 1) + 1) % 1;
        const d = Math.abs(((shared - ref + 1.5) % 1) - 0.5);
        expect(d, `${name} ${side}: chung ${shared.toFixed(3)} vs jog ${ref.toFixed(3)}`).toBeLessThanOrEqual(0.02);
      }
    }
  }, 60_000);
});
