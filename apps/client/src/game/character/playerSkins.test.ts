import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { Humanoid } from '../models';
import { PLAYER_SKINS, PlayerSkins, SkinnedPlayer } from './playerSkins';
import type { AnimState } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });
const MALE = { g: 'm', dye: APPEARANCE.defaultDye };

async function skins(fail = false, legacy = false) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      if (fail) throw new Error('mạng lỗi');
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = createGltfLoader(createKtx2Loader());
      loader.register(() => ({ name: 'test_stub_texture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  const s = new PlayerSkins(cache, legacy);
  s.preload();
  for (let i = 0; i < 100 && s.pending(MALE); i++) await new Promise((r) => setTimeout(r, 10));
  return s;
}

function run(m: SkinnedPlayer, a: AnimState, sec: number) {
  for (let t = 0; t < sec; t += 1 / 60) m.update(1 / 60, a);
}

function hipsY(m: SkinnedPlayer): number {
  let y = 0;
  m.root.updateMatrixWorld(true);
  m.root.traverse((o) => {
    if ((o as THREE.Bone).isBone && /hips$/i.test(o.name)) y = o.getWorldPosition(new THREE.Vector3()).y;
  });
  return y;
}

describe('model người chơi (Thanh Phong)', () => {
  it('nạp xong thì dựng model có xương, cao ~1,75 m, luôn có clip phát (không T-pose)', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    expect(m).toBeInstanceOf(SkinnedPlayer);
    expect(m.height).toBeGreaterThan(1.6);
    expect(m.height).toBeLessThan(1.9);
    expect(m.state).toBe('idle');
    expect(m.actionOf('idle')?.isRunning()).toBe(true);
    expect(hipsY(m)).toBeGreaterThan(0.8);
    m.dispose();
    s.dispose();
  });

  it('đang nạp, nạp lỗi hoặc ?models=legacy thì dùng model khối', async () => {
    const failed = await skins(true);
    expect(failed.pending(MALE)).toBe(false);
    expect(failed.create(MALE)).toBeInstanceOf(Humanoid);
    const legacy = await skins(false, true);
    expect(legacy.create(MALE)).toBeInstanceOf(Humanoid);
    failed.dispose();
    legacy.dispose();
  });

  it('giới tính chưa có model (nữ) và màu lạ thì lùi về mặc định, không lỗi', async () => {
    const s = await skins();
    const f = s.create({ g: 'f', dye: '#ff0000' });
    expect(f).toBeInstanceOf(SkinnedPlayer);
    f.dispose();
    s.dispose();
  });

  it('material dùng chung theo màu áo; màu khác tông vải gốc thì có colorNode nhuộm', async () => {
    const s = await skins();
    const mat = (m: SkinnedPlayer) => {
      let x: THREE.Material | null = null;
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !x && (o as THREE.SkinnedMesh).isSkinnedMesh) x = (o as THREE.Mesh).material as THREE.Material;
      });
      return x as unknown as THREE.MeshStandardNodeMaterial;
    };
    const a = s.create({ g: 'm', dye: 'wood_cinnabar' }) as SkinnedPlayer;
    const b = s.create({ g: 'm', dye: 'wood_cinnabar' }) as SkinnedPlayer;
    const c = s.create(MALE) as SkinnedPlayer;
    expect(mat(a)).toBe(mat(b));
    expect(mat(a)).not.toBe(mat(c));
    expect(mat(a).colorNode).toBeTruthy();
    // Màu mặc định trùng tông vải sau recolor của pipeline: giữ nguyên texture.
    expect(mat(c).colorNode).toBeFalsy();
    for (const m of [a, b, c]) m.dispose();
    s.dispose();
  });

  it('chạy: hệ số phát theo tốc độ có trần, đếm bước chân', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    run(m, anim({ speed: 7 }), 1.5);
    expect(m.state).toBe('run');
    expect(m.actionOf('run')!.timeScale).toBeCloseTo(PLAYER_SKINS.chr_kiem_tu_nam.maxLocoScale, 5);
    // 1,5 s × 1,8 × (4 bước / 1,23 s) ≈ 8–9 bước.
    expect(m.steps).toBeGreaterThanOrEqual(6);
    expect(m.steps).toBeLessThanOrEqual(11);
    run(m, anim({ speed: 3 }), 0.5);
    expect(m.actionOf('run')!.timeScale).toBeCloseTo(1, 1);
    m.dispose();
    s.dispose();
  });

  it('ngự kiếm, thiền, nhảy dùng tư thế IK tạm; phi kiếm dưới chân chỉ hiện khi bay', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const sword = m.root.children.find((o) => o !== (m as unknown as { inner: THREE.Object3D }).inner)!;
    run(m, anim({ flying: true, speed: 10 }), 0.6);
    expect(m.state).toBe('fly');
    expect(m.actionOf('pose_tam_ngu_kiem')?.isRunning()).toBe(true);
    expect(sword.visible).toBe(true);
    expect(m.grounded).toBe(false);
    run(m, anim({ meditating: true }), 0.6);
    expect(m.state).toBe('meditate');
    expect(sword.visible).toBe(false);
    // Ngồi: hông hạ thấp hẳn so với đứng (~0,9 m).
    expect(hipsY(m)).toBeLessThan(0.45);
    run(m, anim({ airborne: true }), 0.3);
    expect(m.state).toBe('jump');
    m.dispose();
    s.dispose();
  });

  it('ra đòn rút cho vừa GCD, đếm số đòn; chết nằm yên không chìm, hồi sinh về idle', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    m.attack();
    expect(m.attacks).toBe(1);
    expect(m.state).toBe('attack');
    run(m, anim(), 1.0);
    expect(m.state).toBe('idle');
    run(m, anim({ dead: true }), 5);
    expect(m.state).toBe('death');
    expect((m as unknown as { inner: THREE.Object3D }).inner.position.y).toBe(0);
    run(m, anim(), 0.5);
    expect(m.state).toBe('idle');
    m.dispose();
    s.dispose();
  });
});
