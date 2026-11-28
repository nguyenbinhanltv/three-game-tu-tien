import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../core/assets';
import { revClipOf } from './mannequin';
import { LOCO } from './mannequinAnim';
import { clipTimeAt, diagStrideGain, PATCH_TABLE } from './patchLoop';

/**
 * Đo SẢI HIỆU DỤNG của hỗn hợp clip đi/chạy trên file clip THẬT (đọc mọi clip ở cùng pha chung qua `clipTimeAt`, như game): sải = phần vận tốc lùi lớn
 * nhất của mũi bàn chân dọc hướng đi (lúc chân trụ), m mỗi chu kỳ. Giữ cho hướng chéo không quay lại cảnh hai clip triệt tiêu nhau (28/11).
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

/** Sải hiệu dụng (m/chu kỳ) của hỗn hợp `mix` dọc hướng đi (ux, uz) trong hệ model (tới = +z, trái = +x), trung bình hai chân. */
function stride(scene: THREE.Object3D, mix: [THREE.AnimationClip, number][], ux: number, uz: number): number {
  const mixer = new THREE.AnimationMixer(scene);
  const acts = mix.map(([clip, w]) => {
    const a = mixer.clipAction(clip);
    a.setEffectiveWeight(w);
    a.timeScale = 0;
    a.play();
    return a;
  });
  const N = 160;
  const len = Math.hypot(ux, uz) || 1;
  let sum = 0;
  for (const side of ['l', 'r']) {
    const foot = scene.getObjectByName(`ball_${side}`)!;
    const p: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      for (const a of acts) a.time = clipTimeAt(a.getClip().name, a.getClip().duration, i / N);
      mixer.update(0);
      scene.updateMatrixWorld(true);
      p.push(foot.getWorldPosition(new THREE.Vector3()));
    }
    const v = p.map((a, i) => {
      const b = p[(i + 1) % N]!;
      return -(((b.x - a.x) * ux + (b.z - a.z) * uz) / len) * N;
    });
    v.sort((x, y) => x - y);
    const lo = Math.floor(N * 0.85);
    const hi = Math.floor(N * 0.97);
    sum += v.slice(lo, hi).reduce((x, y) => x + y, 0) / (hi - lo);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  return sum / 2;
}

describe('hướng chéo của bộ đi/chạy: sải của hỗn hợp trên file clip thật', () => {
  it('chéo-lùi: clip lùi + clip ngang đối diện đọc ngược giữ sải; clip lùi + clip ngang đọc xuôi thì triệt tiêu (lý do có bản đọc ngược)', async () => {
    const ual = await cache.acquire('anim_ual_native');
    const clip = (n: string) => ual.animations.find((c) => c.name === n)!;
    for (const [band, ref] of [
      ['Jog', LOCO.jog.stride],
      ['Sprint', LOCO.sprint.stride],
    ] as const) {
      const bwd = clip(`${band}_Bwd_Loop`);
      const L = clip(`${band}_StrafeL_Loop`);
      const R = clip(`${band}_StrafeR_Loop`);
      for (const w of [0.25, 0.5, 0.75]) {
        // lùi-trái: lùi + (ngang phải đọc ngược); lùi-phải: lùi + (ngang trái đọc ngược)
        const bl = stride(ual.scene, [[bwd, w], [revClipOf(R), 1 - w]], 1 - w, -w);
        const br = stride(ual.scene, [[bwd, w], [revClipOf(L), 1 - w]], -(1 - w), -w);
        expect(bl / ref, `${band} lùi-trái ${w}`).toBeGreaterThan(0.85);
        expect(bl / ref, `${band} lùi-trái ${w}`).toBeLessThan(1.15);
        expect(br / ref, `${band} lùi-phải ${w}`).toBeGreaterThan(0.85);
        expect(br / ref, `${band} lùi-phải ${w}`).toBeLessThan(1.15);
      }
      expect(stride(ual.scene, [[bwd, 0.5], [L, 0.5]], 1, -1) / ref, `${band} lùi + ngang đọc xuôi`).toBeLessThan(0.2);
    }
  }, 60_000);

  it('chéo-tới: sải thật của (clip chạy Patch + clip ngang) khớp công thức của locoMix sau khi nhân diagStrideGain, lệch dưới 8%', async () => {
    const ual = await cache.acquire('anim_ual_native');
    const pm = await cache.acquire('anim_patch_move');
    for (const [fwdName, band, tbl] of [
      ['PM_Run', 'Jog', PATCH_TABLE.jog.stride],
      ['PM_Sprint', 'Sprint', PATCH_TABLE.sprint.stride],
    ] as const) {
      const fwd = pm.animations.find((c) => c.name === fwdName)!;
      const side = ual.animations.find((c) => c.name === `${band}_StrafeL_Loop`)!;
      const ref = band === 'Jog' ? LOCO.jog.stride : LOCO.sprint.stride;
      for (const f of [0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const real = stride(ual.scene, [[fwd, f], [side, 1 - f]], 1 - f, f);
        const model = (f * tbl + (1 - f) * ref) * diagStrideGain(f, 1);
        expect(Math.abs(real / model - 1), `${fwdName} f=${f}: thật ${real.toFixed(2)} vs mô hình ${model.toFixed(2)}`).toBeLessThan(0.08);
      }
    }
  }, 60_000);
});
