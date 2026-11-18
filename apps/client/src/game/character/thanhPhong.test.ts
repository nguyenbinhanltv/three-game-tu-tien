import fs from 'node:fs';
import { cpuBudget } from './cpuBudget';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { POSE, SKILLS } from '@dtl/content';
import { POSE_CAST, POSE_FLY } from '@dtl/shared';
import { type AssetHandle, AssetCache, type Manifest } from '../core/assets';
import { IkRig, poseClipName, probeClip } from './ikpose';
import { POSE_BASE_CLIPS, withPoses } from './poseLib';
import { SkinnedCharacter } from './skinned';
import type { AnimState } from './view';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// Động tác chiêu trên model thật Thanh Phong (chr_kiem_tu_nam, rig Mixamo, #36). Chỉ dựng SkinnedCharacter bằng
// điểm nối `withPoses`; phần nạp model người chơi trong game là của M3-5.
const ASSET = 'chr_kiem_tu_nam';
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const HAS_ASSET = JSON.stringify(MANIFEST).includes(`"${ASSET}"`);

const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});

async function load(): Promise<AssetHandle> {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  return cache.acquire(ASSET);
}

const BASE = { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' };

async function setup() {
  const handle = await load();
  const t0 = performance.now();
  const extra = withPoses(handle.scene, BASE);
  const bakeMs = performance.now() - t0;
  const make = () =>
    new SkinnedCharacter({ scene: cloneSkinned(handle.scene), clips: handle.animations, height: 1.75, refSpeed: 4.6, ...extra });
  return { handle, extra, make, bakeMs };
}

describe('Thanh Phong + động tác chiêu', () => {
  it('withPoses: rig không phải người thì không có pose, giữ nguyên clipMap', () => {
    const r = withPoses(new THREE.Group(), BASE);
    expect(r.poses).toBeUndefined();
    expect(r.clipMap).toBe(BASE);
  });

  it.skipIf(!HAS_ASSET)('nướng đủ pose; ra chiêu dùng động tác riêng thay clip attack 1,2s; bay/niệm chú dùng pose', async () => {
    const { handle, extra, make, bakeMs } = await setup();
    console.info(`[perf] ${ASSET}: nướng ${extra.poses?.size} pose trong ${bakeMs.toFixed(1)}ms`);
    expect(extra.poses?.size).toBeGreaterThanOrEqual(8);
    expect(extra.clipMap).toMatchObject(POSE_BASE_CLIPS);
    const p = make();
    p.update(1 / 60, anim());
    for (const s of SKILLS) {
      expect(p.perform(s.pose!)).toBe(true);
      for (let t = 0; t < 0.2; t += 1 / 60) p.update(1 / 60, anim());
      expect(p.performing(s.pose!)).toBe(true);
      expect(p.state).not.toBe('attack');
      for (let t = 0; t < 1.1; t += 1 / 60) p.update(1 / 60, anim());
      expect(p.performing(s.pose!)).toBe(false);
    }
    p.update(0.3, anim({ flying: true }));
    expect(p.actionOf(poseClipName(POSE_FLY))?.isRunning()).toBe(true);
    p.update(0.3, anim({ casting: true }));
    expect(p.actionOf(poseClipName(POSE_CAST))?.isRunning()).toBe(true);
    p.dispose();
    handle.release();
  });

  it.skipIf(!HAS_ASSET)('đầu dò lúc ra đòn: tay trước vai, chân chạm đất', async () => {
    const { handle, extra } = await setup();
    // Rig của bản gốc (tư thế nghỉ; nướng xong đã trả về).
    const rig = IkRig.from(handle.scene)!;
    const lines: string[] = [`tỉ lệ rig ${rig.scale.toFixed(3)}`];
    for (const s of SKILLS) {
      const def = POSE.get(s.pose!)!;
      const r = probeClip(rig, extra.poses!.get(def.id)!.full, def.hit![0] + 0.04);
      lines.push(
        `${def.id}: tay phải z ${r.handRFromShoulder[2].toFixed(2)}, tay trái z ${r.handLFromShoulder[2].toFixed(2)}, chân ${r.footR[1].toFixed(3)}/${r.footL[1].toFixed(3)}`,
      );
      expect(Math.max(r.handRFromShoulder[2], r.handLFromShoulder[2]), def.id).toBeGreaterThan(0.08);
      expect(Math.abs(r.footR[1]), def.id).toBeLessThan(0.02);
      expect(Math.abs(r.footL[1]), def.id).toBeLessThan(0.02);
    }
    console.info(lines.join('\n'));
    handle.release();
  });

  it.skipIf(!HAS_ASSET)('CPU mixer: 12 nhân vật chạy + ra chiêu', async () => {
    const { handle, make } = await setup();
    const ps = Array.from({ length: 12 }, make);
    const scene = new THREE.Scene();
    for (const p of ps) scene.add(p.root);
    const measure = (attack: boolean) => {
      const a = anim({ speed: 6 });
      for (let f = 0; f < 60; f++) for (const p of ps) p.update(1 / 60, a);
      const t0 = performance.now();
      const frames = 300;
      for (let f = 0; f < frames; f++) {
        for (const [i, p] of ps.entries()) {
          if (attack && (f + i * 5) % 60 === 0) p.perform(SKILLS[((f / 60 + i) % SKILLS.length) | 0].pose!);
          p.update(1 / 60, a);
        }
        scene.updateMatrixWorld(true);
      }
      return (performance.now() - t0) / frames;
    };
    const base = measure(false);
    const withPose = measure(true);
    console.info(
      `[perf] 12 nhân vật, mỗi khung (mixer + ma trận): chỉ chạy ${base.toFixed(3)}ms, chạy + ra chiêu liên tục ${withPose.toFixed(3)}ms`,
    );
    expect(withPose).toBeLessThan(cpuBudget(4));
    for (const p of ps) p.dispose();
    handle.release();
  });
});
