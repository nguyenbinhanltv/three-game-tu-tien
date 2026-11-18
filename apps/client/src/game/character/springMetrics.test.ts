import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../core/assets';
import { nodeGltfLoader } from '../core/gltfTestLoader';
import { ARM_FIT, MannequinCharacter, mannequinTemplate, SPRING2, V3_LIB, V3_SKIRT_SPRING2 } from './mannequin';
import {
  diagnose,
  geometryRegions,
  meshInfo,
  overlapCount,
  pose,
  regionsFor,
  robeMask,
  score,
  capInside,
  triTri,
  type PoseScore,
} from './springMetrics';
import type { AnimState } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const cache = new AssetCache({
  base: '',
  fetchManifest: async () => MANIFEST,
  load: async (url) => {
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
    return nodeGltfLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  },
});

const POSES: [string, number][] = [
  ['Idle_Loop', 0],
  ['Jog_Fwd_Loop', 0.25],
  ['Jog_Fwd_Loop', 0.75],
  ['Sword_Attack', 0.35],
  ['Sword_Attack', 0.6],
  ['Sitting_Idle_Loop', 0],
  ['Death01', 1],
  ['Roll', 0.4],
  ['Jump_Loop', 0.5],
  ['Spell_Simple_Idle_Loop', 0.5],
  ['Hit_Chest', 0.3],
  ['Crouch_Fwd_Loop', 0.5],
];

function lod0(root: THREE.Object3D): THREE.SkinnedMesh {
  let best: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && (!best || m.geometry.getAttribute('position').count > best.geometry.getAttribute('position').count)) best = m;
  });
  return best!;
}

describe('triTri', () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  it('hai tam giác cắt nhau / không cắt', () => {
    expect(triTri([v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], [v(0.2, 0.2, -1), v(0.2, 0.2, 1), v(0.8, 0.2, 0)])).toBe(true);
    expect(triTri([v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], [v(0, 0, 1), v(1, 0, 1), v(0, 1, 1)])).toBe(false);
  });
});

// Bật bằng SPRING_METRICS=<file json ra>; SPRING_ASSETS=id,id (mặc định v3b nam+nữ); chạy mô phỏng lò xo thật trong client rồi đo. Chạy lâu (vài phút).
const OUT = process.env.SPRING_METRICS;
describe.skipIf(!OUT)('đo xuyên thân của vạt với lò xo mô phỏng thật (12 tư thế)', () => {
  it('ghi điểm từng tư thế', async () => {
    // Quét tham số (chỉ thử nghiệm): SPRING_TUNE='{"hemStiff":1,"arms":false,"sitScale":1,"stiffness":130,"drag":8,"maxAngle":30,"maxInward":8}'
    const tune = JSON.parse(process.env.SPRING_TUNE ?? '{}') as Record<string, number | boolean>;
    for (const k of ['hemStiff', 'sitScale', 'arms', 'rMul'] as const)
      if (tune[k] !== undefined) (SPRING2 as Record<string, unknown>)[k] = tune[k];
    for (const k of ['stiffness', 'drag', 'maxAngle', 'maxInward'] as const)
      if (tune[k] !== undefined) V3_SKIRT_SPRING2[k] = tune[k] as number;
    const armFitDeg = typeof tune.armFit === 'number' ? tune.armFit : null; // quét góc ARM_FIT (độ) cho mọi asset đo
    const ids = (process.env.SPRING_ASSETS ?? 'chr_v3b_lac_kiem_nam,chr_v3b_lac_kiem_nu').split(',');
    const result: Record<string, { poses: PoseScore[]; pen: number; cap: number }> = {};
    const lib = await cache.acquire(V3_LIB);
    for (const id of ids) {
      const restHandle = await cache.acquire(id);
      restHandle.scene.updateMatrixWorld(true);
      const restMesh = lod0(restHandle.scene);
      const info = meshInfo(restMesh);
      const rest = pose(restMesh);
      const { mask, height } = robeMask(rest, info);
      // Chia vùng theo hình học (mặc định, so được giữa các asset); SPRING_PART=weights dùng xương trội như `chr_v3.py`.
      if (process.env.SPRING_PART !== 'weights') info.regionBase = geometryRegions(rest, height);
      const regions = regionsFor(rest, info, mask);
      const restPen = overlapCount(rest, info, regions);
      const restCap = capInside(rest, height);
      const poses: PoseScore[] = [];
      for (const [clip, t] of POSES) {
        const handle = await cache.acquire(id);
        if (armFitDeg !== null) ARM_FIT[id] = (armFitDeg * Math.PI) / 180;
        const m = new MannequinCharacter(mannequinTemplate(handle, lib));
        const mm = m as unknown as { baseFor: () => string; base: THREE.AnimationAction; lods: THREE.SkinnedMesh[][] };
        mm.baseFor = () => clip;
        const loop = /Loop$|Idle$/.test(clip);
        const anim: AnimState = {
          speed: clip === 'Jog_Fwd_Loop' ? 5.4 : 0,
          flying: false,
          meditating: false,
          dead: false,
          casting: false,
          airborne: false,
        };
        m.update(1 / 60, anim);
        const dur = mm.base.getClip().duration;
        const total = (loop ? 2 * dur : 0) + t * dur + (t >= 1 ? 0.25 : 0);
        for (let s = 0; s < Math.round(total * 60); s++) m.update(1 / 60, anim);
        m.root.updateMatrixWorld(true);
        const posed = pose(mm.lods[0][0]);
        if (
          process.env.SPRING_DIAG &&
          /Idle_Loop|Sitting|Sword_Attack|Roll|Jog_Fwd_Loop@?/.test(clip) &&
          [0, 0.35, 0.25, 0.4].includes(t)
        ) {
          console.log(`[diag] ${id} ${clip}@${t}: ` + diagnose(posed, rest, info, regions, mask, height).join(' || '));
        }
        if (process.env.SPRING_PAIRS) {
          const bp: Record<string, number> = {};
          const rp: Record<string, number> = {};
          overlapCount(posed, info, regions, bp);
          overlapCount(rest, info, regions, rp);
          console.log(
            `[pairs] ${id} ${clip}@${t}: ` +
              Object.keys(bp)
                .map((k) => `${k}=${bp[k]}(nghỉ ${rp[k] ?? 0})`)
                .join(' '),
          );
        }
        poses.push(score(`${clip}@${t}`, restPen, restCap, posed, info, regions, height));
        m.dispose();
        handle.release();
      }
      result[id] = { poses, pen: poses.reduce((a, p) => a + p.pen, 0), cap: poses.reduce((a, p) => a + p.cap, 0) };
      console.log(
        `[springMetrics] ${id}: cặp mặt chồng ${result[id].pen}, đỉnh trong viên nang ${result[id].cap}; ` +
          poses.map((p) => `${p.pose}=${p.pen}/${p.cap}`).join(', '),
      );
      restHandle.release();
    }
    fs.writeFileSync(OUT!, JSON.stringify(result, null, 1));
    expect(Object.keys(result).length).toBe(ids.length);
  }, 1_800_000);
});

// Vi đo CPU (SPRING_CPU=1): 50 nhân vật cùng asset, chạy Jog + đổi trạng thái, đo ms mỗi khung cho `update` (mixer + lò xo); so asset cũ/mới trong cùng một tiến trình.
describe.skipIf(!process.env.SPRING_CPU)('CPU 50 nhân vật: lò xo cũ so với mới', () => {
  it('đo ms mỗi khung', async () => {
    const lib = await cache.acquire(V3_LIB);
    const ids = (process.env.SPRING_ASSETS ?? 'chr_v3b_lac_kiem_nam,chr_v3b2_lac_kiem_nam').split(',');
    const res: Record<string, number[]> = {};

    for (let round = 0; round < 3; round++) {
      for (const id of ids) {
        if (process.env.SPRING_CPU_ARM === 'off') ARM_FIT[id] = 0;
        const chars: MannequinCharacter[] = [];
        for (let i = 0; i < 50; i++) chars.push(new MannequinCharacter(mannequinTemplate(await cache.acquire(id), lib)));
        const anim: AnimState = { speed: 5.4, flying: false, meditating: false, dead: false, casting: false, airborne: false };
        for (let f = 0; f < 120; f++) for (const c of chars) c.update(1 / 60, anim);
        const t0 = performance.now();
        const N = 300;
        for (let f = 0; f < N; f++) for (const c of chars) c.update(1 / 60, anim);
        (res[id] ??= []).push((performance.now() - t0) / N);
        for (const c of chars) c.dispose();
      }
    }
    for (const id of ids)
      console.log(
        `[springCpu] ${id}: ${res[id].map((x) => x.toFixed(2)).join(' / ')} ms/khung (50 nhân vật, 3 vòng, trung vị ${[...res[id]].sort((a, b) => a - b)[1].toFixed(2)})`,
      );
    expect(Object.keys(res).length).toBe(ids.length);
  }, 900_000);
});
