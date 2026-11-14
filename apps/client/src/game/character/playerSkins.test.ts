import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { POSE, SKILLS } from '@dtl/content';
import { POSE_CAST, POSE_FLY } from '@dtl/shared';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { IkRig, poseClipName, probeClip } from './ikpose';
import { PLAYER_ASSET, PlayerSkins, SkinnedPlayer, skinnedPlayersRequested } from './playerSkins';
import type { AnimState } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
/** Model Thanh Phong có trong manifest chưa (PR #36). Chưa có thì bỏ qua các test dùng model thật. */
const HAS_PLAYER = JSON.stringify(MANIFEST).includes(`"${PLAYER_ASSET}"`);

const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

async function playerSkins() {
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
  const skins = new PlayerSkins(cache, true);
  skins.preload();
  for (let i = 0; i < 200 && skins.pending; i++) await new Promise((r) => setTimeout(r, 10));
  return skins;
}

describe('người chơi có xương', () => {
  it('?models=skinned mới bật (mặc định giữ model khối tới M3-5)', () => {
    expect(skinnedPlayersRequested('?models=skinned')).toBe(true);
    expect(skinnedPlayersRequested('')).toBe(false);
    expect(skinnedPlayersRequested('?models=legacy')).toBe(false);
  });

  it('tắt thì không tạo model có xương', async () => {
    const skins = new PlayerSkins(undefined, false);
    skins.preload();
    expect(skins.pending).toBe(false);
    expect(skins.create()).toBeNull();
  });

  it.skipIf(!HAS_PLAYER)('Thanh Phong: nướng đủ pose, ra chiêu dùng động tác riêng thay clip attack 1,2s', async () => {
    const skins = await playerSkins();
    const p = skins.create() as SkinnedPlayer;
    expect(p).toBeInstanceOf(SkinnedPlayer);
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
    skins.dispose();
  });

  it.skipIf(!HAS_PLAYER)('Thanh Phong: đầu dò lúc ra đòn (tay trước vai, chân chạm đất)', async () => {
    const skins = await playerSkins();
    const p = skins.create() as SkinnedPlayer;
    // Rig của bản gốc (ở tư thế nghỉ; bản sao đã chạy mixer nên không còn tư thế T).
    const tpl = (skins as unknown as { template: { handle: { scene: THREE.Object3D } } }).template.handle.scene;
    const rig = IkRig.from(tpl)!;
    expect(rig).not.toBeNull();
    const lines: string[] = [`tỉ lệ rig ${rig.scale.toFixed(3)}`];
    for (const s of SKILLS) {
      const def = POSE.get(s.pose!)!;
      const clip = (p as unknown as { clips: Map<string, THREE.AnimationClip> }).clips.get(poseClipName(def.id))!;
      const r = probeClip(rig, clip, def.hit![0] + 0.04);
      lines.push(`${def.id}: tay phải z ${r.handRFromShoulder[2].toFixed(2)}, tay trái z ${r.handLFromShoulder[2].toFixed(2)}, chân ${r.footR[1].toFixed(3)}/${r.footL[1].toFixed(3)}`);
      expect(Math.max(r.handRFromShoulder[2], r.handLFromShoulder[2]), def.id).toBeGreaterThan(0.08);
      expect(Math.abs(r.footR[1]), def.id).toBeLessThan(0.02);
      expect(Math.abs(r.footL[1]), def.id).toBeLessThan(0.02);
    }
    console.info(lines.join('\n'));
    p.dispose();
    skins.dispose();
  });

  it.skipIf(!HAS_PLAYER)('CPU mixer: 12 người chơi chạy + ra chiêu', async () => {
    const skins = await playerSkins();
    const ps = Array.from({ length: 12 }, () => skins.create() as SkinnedPlayer);
    const scene = new THREE.Scene();
    for (const p of ps) scene.add(p.root);
    const measure = (attack: boolean) => {
      const a = anim({ speed: 6 });
      for (let f = 0; f < 60; f++) for (const p of ps) p.update(1 / 60, a);
      const t0 = performance.now();
      const frames = 300;
      for (let f = 0; f < frames; f++) {
        for (const [i, p] of ps.entries()) {
          if (attack && (f + i * 5) % 60 === 0) p.perform(SKILLS[(f / 60 + i) % SKILLS.length | 0].pose!);
          p.update(1 / 60, a);
        }
        scene.updateMatrixWorld(true);
      }
      return (performance.now() - t0) / frames;
    };
    const base = measure(false);
    const withPose = measure(true);
    console.info(`[perf] 12 người chơi, mỗi khung (mixer + ma trận): chỉ chạy ${base.toFixed(3)}ms, chạy + ra chiêu liên tục ${withPose.toFixed(3)}ms`);
    // Ngân sách CPU cả khung 8ms: phần animation người chơi phải nhỏ.
    expect(withPose).toBeLessThan(4);
    for (const p of ps) p.dispose();
    skins.dispose();
  });
});
