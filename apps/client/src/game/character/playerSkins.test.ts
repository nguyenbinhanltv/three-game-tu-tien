import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { APPEARANCE, SKILLS } from '@dtl/content';
import { performOpts } from '../combat/skillPose';
import { AssetCache, type Manifest } from '../core/assets';
import { Humanoid } from '../core/models';
import { PLAYER_SKINS, PlayerSkins, SkinnedPlayer } from './playerSkins';
import type { AnimState } from './view';
import { nodeGltfLoader } from '../core/gltfTestLoader';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});
const MALE = { g: 'm', dye: APPEARANCE.defaultDye };

async function skins(fail = false, legacy = false) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      if (fail) throw new Error('mạng lỗi');
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  const s = new PlayerSkins(cache, legacy, false);
  s.preload();
  for (let i = 0; i < 100 && s.pending(MALE); i++) await new Promise((r) => setTimeout(r, 10));
  return s;
}

function run(m: SkinnedPlayer, a: AnimState, sec: number) {
  for (let t = 0; t < sec; t += 1 / 60) m.update(1 / 60, a);
}

function hipsY(m: SkinnedPlayer): number {
  let y = 0;
  m.rig.updateMatrixWorld(true);
  m.rig.traverse((o) => {
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

  it('nữ tu Lam Chi: model có xương riêng, cao 1,6–1,75 m, có kiếm và clip chung; giới tính lạ lùi về nam', async () => {
    const s = await skins();
    const FEMALE = { g: 'f', dye: APPEARANCE.defaultDye };
    const first = s.create(FEMALE); // lần đầu: nạp lười, tạm model khối
    expect(first).toBeInstanceOf(Humanoid);
    first.dispose();
    for (let i = 0; i < 300 && s.pending(FEMALE); i++) await new Promise((r) => setTimeout(r, 10));
    const f = s.create(FEMALE) as SkinnedPlayer;
    expect(f).toBeInstanceOf(SkinnedPlayer);
    expect(f.height).toBeGreaterThan(1.6);
    expect(f.height).toBeLessThan(1.75);
    expect(f.actionOf('idle')?.isRunning()).toBe(true);
    expect(f.hasSword).toBe(true);
    f.dispose();
    const odd = s.create({ g: 'zzz', dye: '#ff0000' });
    expect(odd).toBeInstanceOf(SkinnedPlayer);
    odd.dispose();
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
    expect(m.actionOf('run')!.timeScale).toBeCloseTo(PLAYER_SKINS.chr_kiem_tu_nam!.maxLocoScale, 5);
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
    expect(m.actionOf('pose_ngu_kiem')?.isRunning()).toBe(true);
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
    // Vừa ra đòn thì đứng thủ thế (K-4), hết thủ thế sau COMBAT_HOLD giây.
    expect(m.state).toBe('combatIdle');
    run(m, anim(), 5);
    expect(m.state).toBe('idle');
    run(m, anim({ dead: true }), 5);
    expect(m.state).toBe('death');
    expect((m as unknown as { inner: THREE.Object3D }).inner.position.y).toBe(0);
    run(m, anim(), 0.5);
    expect(m.state).toBe('idle');
    m.dispose();
    s.dispose();
  });

  it('M3-9: hết suất LOD0 thì LOD1 không bóng; ngoài khung nhìn mixer đứng; LOD2 bỏ hào quang phi kiếm', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const shown = () => {
      const out: { lod: number; shadow: boolean }[] = [];
      m.root.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.visible)
          out.push({ lod: o.userData.lod ?? 0, shadow: (o as THREE.Mesh).castShadow });
      });
      return out;
    };
    expect(shown()).toEqual([{ lod: 0, shadow: true }]);
    m.setView({ dist: 5, inView: true, allowLod0: false });
    expect(shown()).toEqual([{ lod: 1, shadow: false }]);
    m.setView({ dist: 5, inView: true, allowLod0: true });
    expect(shown()).toEqual([{ lod: 0, shadow: true }]);
    // Ngoài khung nhìn: animation không chạy, vào lại thì bắt kịp.
    const idle = m.actionOf('idle')!;
    m.setView({ dist: 5, inView: false, allowLod0: false });
    const t0 = idle.time;
    run(m, anim(), 0.5);
    expect(idle.time).toBe(t0);
    m.setView({ dist: 5, inView: true, allowLod0: true });
    m.update(1 / 60, anim());
    expect(idle.time).toBeGreaterThan(t0 + 0.4);
    // LOD2: thân phi kiếm còn, hào quang ẩn.
    m.setView({ dist: 200, inView: true, allowLod0: false });
    const fly = m.root.children.find((o) => o !== (m as unknown as { inner: THREE.Object3D }).inner)!;
    expect(fly.children[0]!.visible).toBe(true);
    expect(fly.children[1]!.visible).toBe(false);
    m.dispose();
    s.dispose();
  });

  it('M3-9: cây xương nằm ngoài cảnh; dời root không cần tính lại xương mà đỉnh vẫn theo đúng', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    let bonesInScene = 0;
    m.root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bonesInScene++;
    });
    expect(bonesInScene).toBe(0);
    let mesh!: THREE.SkinnedMesh;
    m.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && (o.userData.lod ?? 0) === 0) mesh = o as THREE.SkinnedMesh;
    });
    expect(mesh.bindMode).toBe(THREE.DetachedBindMode);
    run(m, anim(), 0.3);
    const vertexWorld = (i: number) => {
      m.root.updateMatrixWorld(true);
      mesh.skeleton.update();
      return mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    };
    const ids = [0, 1000, 5000, 9000];
    const before = ids.map(vertexWorld);
    // Đỉnh ở chỗ hợp lý (trong thân người cao 1,75 m quanh gốc).
    for (const v of before)
      (expect(v.y).toBeGreaterThan(-0.05), expect(v.y).toBeLessThan(1.95), expect(Math.hypot(v.x, v.z)).toBeLessThan(1));
    m.root.position.set(10, 2, -5);
    m.root.rotation.y = Math.PI / 2;
    const after = ids.map(vertexWorld);
    for (const [k, v] of before.entries()) {
      const want = v
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        .add(new THREE.Vector3(10, 2, -5));
      expect(after[k]!.distanceTo(want)).toBeLessThan(1e-4);
    }
    m.dispose();
    s.dispose();
  });
});

describe('máy trạng thái chiêu (K-4)', () => {
  const phi = SKILLS.find((x) => x.id === 'skl_phi_kiem')!;
  const events = (m: SkinnedPlayer) => {
    const out: { kind: string; index: number; t: number; combo: number }[] = [];
    m.onSkillEvent = (e) => out.push({ kind: e.kind, index: e.index, t: e.t, combo: e.combo });
    return out;
  };
  const opts = (combo = 0, gap?: number) => performOpts(phi, combo, gap);

  it('sự kiện hit phát đúng một lần tại hitAt (theo dữ liệu), windup trước, recovery sau, end khi hết', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const ev = events(m);
    m.perform(phi.pose!, opts());
    run(m, anim(), 0.1);
    expect(ev.map((e) => e.kind)).toEqual(['windup']);
    run(m, anim(), 0.3);
    const hits = ev.filter((e) => e.kind === 'hit');
    expect(hits).toHaveLength(1);
    // Sai số một khung (1/60 s) quanh mốc hitAt của dữ liệu.
    expect(hits[0]!.t).toBeGreaterThanOrEqual(phi.combo!.hits[0]!.hitAt);
    expect(hits[0]!.t).toBeLessThan(phi.combo!.hits[0]!.hitAt + 1 / 60 + 1e-6);
    run(m, anim(), 1);
    expect(ev.map((e) => e.kind)).toEqual(['windup', 'hit', 'recovery', 'end']);
    m.dispose();
    s.dispose();
  });

  it('đi lại hủy thu về chỉ sau cancel.move; trước đó đòn vẫn ra', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const ev = events(m);
    m.perform(phi.pose!, opts());
    // Đi lại ngay từ đầu: chưa tới mốc hủy nên chưa hủy, đòn vẫn ra.
    run(m, anim({ speed: 5 }), phi.cancel!.move - 0.05);
    expect(ev.some((e) => e.kind === 'cancel')).toBe(false);
    expect(ev.filter((e) => e.kind === 'hit')).toHaveLength(1);
    run(m, anim({ speed: 5 }), 0.1);
    expect(ev.some((e) => e.kind === 'cancel')).toBe(true);
    run(m, anim({ speed: 5 }), 0.2); // tắt dần trong PERFORM_CANCEL
    expect(m.performing(phi.pose!)).toBe(false);
    m.dispose();
    s.dispose();
  });

  it('đứng yên thì không bị hủy, chạy hết thu về', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const ev = events(m);
    m.perform(phi.pose!, opts());
    run(m, anim(), 1);
    expect(ev.some((e) => e.kind === 'cancel')).toBe(false);
    expect(ev.at(-1)?.kind).toBe('end');
    m.dispose();
    s.dispose();
  });

  it('lướt hủy thu về ngay sau đòn đầu, và hình trượt từ chỗ cũ về chỗ thật', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    const ev = events(m);
    m.perform(phi.pose!, opts());
    run(m, anim(), phi.hitAt![0]! + 0.05);
    m.root.position.set(0, 0, 8); // server đã đặt người chơi cách chỗ cũ 8 m
    m.dashFrom(0, 0, 0.3);
    expect(ev.some((e) => e.kind === 'cancel')).toBe(true);
    const inner = (m as unknown as { inner: THREE.Object3D }).inner;
    run(m, anim(), 1 / 60);
    // Ngay đầu: hình còn gần chỗ cũ (lùi 8 m trong hệ cục bộ của root nhìn +Z → z ≈ -8).
    expect(inner.position.z).toBeLessThan(-6);
    run(m, anim(), 0.4);
    expect(inner.position.z).toBeCloseTo(0, 5);
    m.dispose();
    s.dispose();
  });

  it('lao người đòn cuối chuỗi: tới đỉnh ở hitAt rồi về 0, không quá 1,5 m', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    m.perform(phi.pose!, opts(2, 8));
    let peak = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      m.update(1 / 60, anim());
      peak = Math.max(peak, m.lunge);
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(peak).toBeLessThanOrEqual(1.5);
    expect(m.lunge).toBe(0);
    m.dispose();
    s.dispose();
  });

  it('nối đòn liên hoàn: đòn kế vào thế từ độ mạnh của đòn trước (không tụt về nền giữa hai đòn)', async () => {
    const s = await skins();
    const m = s.create(MALE) as SkinnedPlayer;
    m.perform(phi.pose!, opts(0));
    run(m, anim(), 0.3);
    const before = (m as unknown as { lastEnv: number }).lastEnv;
    m.perform(phi.pose!, opts(1));
    expect((m as unknown as { perf: { lead: number } }).perf.lead).toBeCloseTo(before, 6);
    run(m, anim(), 1 / 60);
    expect((m as unknown as { lastEnv: number }).lastEnv).toBeGreaterThanOrEqual(before - 1e-6);
    m.dispose();
    s.dispose();
  });
});
