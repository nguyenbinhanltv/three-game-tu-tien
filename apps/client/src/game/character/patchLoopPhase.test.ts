import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../core/assets';
import { PATCH_LOCO, PATCH_PHASE } from './patchLoop';

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

describe('hướng chéo: clip ngang UAL chung pha với PM_Run sau độ lệch', () => {
  // Jog_Bwd_Loop lệch ~0,23 chu kỳ so với Jog_Fwd_Loop sẵn có (đo cùng cách) nên không đưa vào ngưỡng tuyệt đối; PM_Run căn theo Jog_Fwd_Loop nên không làm tệ thêm.
  it('chân trái/phải chạm đất của Jog_StrafeL/StrafeR lệch ≤ 0,06 chu kỳ so với PM_Run (đọc tại pha chung + lệch)', async () => {
    const ual = await cache.acquire('anim_ual_native');
    const pm = await cache.acquire('anim_patch_move');
    const run = pm.animations.find((c) => c.name === 'PM_Run')!;
    const rows: string[] = [];
    for (const name of ['Jog_StrafeL_Loop', 'Jog_StrafeR_Loop']) {
      const clip = ual.animations.find((c) => c.name === name)!;
      for (const side of ['l', 'r'] as const) {
        const mine = touchdownPhase(ual.scene, clip, side);
        // chạm đất của PM_Run (chân cùng bên) quy về pha chung
        const ref = (((touchdownPhase(pm.scene, run, side) - PATCH_PHASE.PM_Run!) % 1) + 1) % 1;
        const d = Math.abs(((mine - ref + 1.5) % 1) - 0.5);
        rows.push(`${name} ${side}: ${mine.toFixed(3)} vs ${ref.toFixed(3)} (lệch ${d.toFixed(3)})`);
        expect(d, rows[rows.length - 1]).toBeLessThanOrEqual(0.06);
      }
    }
  }, 60_000);
});

/**
 * Tốc độ chân trụ (m/s, chiều tiến) của clip: hồi quy vị trí chân (thế giới của clip, thân không dịch) theo thời gian trên đoạn tiếp đất dài nhất (cổ chân
 * trong 3 cm trên điểm thấp nhất), bỏ 20% đầu/cuối đoạn (lăn gót/mũi). Thân phải chạy đúng tốc độ này thì chân dính đất.
 */
function stanceSpeed(scene: THREE.Object3D, clip: THREE.AnimationClip, side: 'l' | 'r'): number {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const foot = scene.getObjectByName(`foot_${side}`)!;
  const N = 960;
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < N; i++) {
    mixer.setTime((i / N) * clip.duration);
    scene.updateMatrixWorld(true);
    const p = foot.getWorldPosition(new THREE.Vector3());
    y.push(p.y);
    z.push(p.z);
  }
  mixer.stopAllAction();
  const on = y.map((v) => v < Math.min(...y) + 0.03);
  let best: number[] = [];
  let cur: number[] = [];
  for (let i = 0; i < 2 * N; i++) {
    if (on[i % N]) cur.push(i);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  }
  if (cur.length > best.length) best = cur;
  const m = Math.floor(best.length * 0.2);
  const seg = best.slice(m, best.length - m);
  const xs = seg.map((i) => (i / N) * clip.duration);
  const ys = seg.map((i) => z[i % N]!);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, k) => {
    num += (x - mx) * (ys[k]! - my);
    den += (x - mx) ** 2;
  });
  return Math.abs(num / den);
}

describe('clip chạy Patch: tốc độ chân trụ khớp bảng PATCH_LOCO', () => {
  it('PM_Run và PM_Sprint: chân trụ đi đúng tốc độ gốc ghi trong bảng (±5%), nên cycles = tốc độ / chu kỳ làm chân dính đất ở mọi tốc độ', async () => {
    const pm = await cache.acquire('anim_patch_move');
    for (const [key, def] of Object.entries(PATCH_LOCO)) {
      const clip = pm.animations.find((c) => c.name === def.clip)!;
      for (const side of ['l', 'r'] as const) {
        const v = stanceSpeed(pm.scene, clip, side);
        expect(Math.abs(v - def.speed) / def.speed, `${key} ${side}: chân ${v.toFixed(2)} m/s vs bảng ${def.speed}`).toBeLessThanOrEqual(
          0.05,
        );
      }
      // chu kỳ = tốc độ × thời lượng clip
      expect(def.stride).toBeCloseTo(def.speed * clip.duration, 1);
    }
  }, 60_000);
});
