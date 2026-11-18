import fs from 'node:fs';
import { cpuBudget, fastest } from './cpuBudget';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { groundAt } from '@dtl/shared';
import { AssetCache, type Manifest } from '../core/assets';
import { withPoses } from './poseLib';
import { SkinnedCharacter } from './skinned';
import type { AnimState } from './view';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// Chân bám đất (P2-E3) trên model thật: Thanh Phong (hai chân), sói (bốn chân, nghiêng thân), Thạch Viên (vượn hai chân).
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
const BASE = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };

async function load(id: string) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  return cache.acquire(id);
}

/** Điểm dốc nhất (gradient < 0,9) trên lưới thô quanh bản đồ và hướng lên dốc (yaw nhìn lên dốc). */
function steepSpot(): { x: number; z: number; slope: number; uphill: number } {
  let best = { x: 0, z: 0, slope: 0, uphill: 0 };
  for (let x = -300; x <= 300; x += 8)
    for (let z = -300; z <= 300; z += 8) {
      const gx = groundAt(x + 0.5, z) - groundAt(x - 0.5, z);
      const gz = groundAt(x, z + 0.5) - groundAt(x, z - 0.5);
      const s = Math.hypot(gx, gz);
      if (s > best.slope && s < 0.9) best = { x, z, slope: s, uphill: Math.atan2(gx, gz) };
    }
  return best;
}

function placeAt(c: SkinnedCharacter, x: number, z: number, yaw: number) {
  c.root.position.set(x, groundAt(x, z), z);
  c.root.rotation.y = yaw;
  c.root.updateMatrixWorld(true);
}

/** Độ cao cổ chân so với mặt đất dưới nó (m), theo từng chân. */
function footClearance(c: SkinnedCharacter): number[] {
  const out: number[] = [];
  c.root.updateMatrixWorld(true);
  c.rig.traverse((o) => {
    const n = o.name.replace(/^mixamorig\d*[:_]?/i, '').toLowerCase();
    if (!(o as THREE.Bone).isBone || (n !== 'leftfoot' && n !== 'rightfoot')) return;
    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(c.root.matrixWorld);
    out.push(p.y - groundAt(p.x, p.z));
  });
  return out;
}

const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

describe('chân bám đất trên dốc', () => {
  const spot = steepSpot();

  it('có điểm dốc để thử', () => {
    expect(spot.slope).toBeGreaterThan(0.25);
  });

  it('Thanh Phong: đứng ngang dốc, hai chân cùng cách đất sau khi bám', async () => {
    const handle = await load('chr_kiem_tu_nam');
    const extra = withPoses(handle.scene, BASE);
    const make = (ground?: 'biped') =>
      new SkinnedCharacter({ scene: cloneSkinned(handle.scene), clips: handle.animations, height: 1.75, refSpeed: 3, ground, ...extra });
    const yaw = spot.uphill + Math.PI / 2;
    const flat = make();
    const grounded = make('biped');
    for (const c of [flat, grounded]) {
      placeAt(c, spot.x, spot.z, yaw);
      for (let t = 0; t < 1; t += 1 / 60) c.update(1 / 60, anim());
    }
    expect(grounded.footIkActive).toBe(true);
    expect(flat.footIkActive).toBe(false);
    const a = spread(footClearance(flat));
    const b = spread(footClearance(grounded));
    console.info(`[ground] dốc ${spot.slope.toFixed(2)}: chênh cách đất giữa hai chân ${a.toFixed(3)} m → ${b.toFixed(3)} m`);
    expect(b).toBeLessThan(a * 0.35 + 0.01);
  });

  it('Thanh Phong: bay thì tắt', async () => {
    const handle = await load('chr_kiem_tu_nam');
    const extra = withPoses(handle.scene, BASE);
    const c = new SkinnedCharacter({
      scene: cloneSkinned(handle.scene),
      clips: handle.animations,
      height: 1.75,
      refSpeed: 3,
      ground: 'biped',
      ...extra,
    });
    placeAt(c, spot.x, spot.z, spot.uphill);
    for (let t = 0; t < 0.5; t += 1 / 60) c.update(1 / 60, anim());
    expect(c.footIkActive).toBe(true);
    for (let t = 0; t < 0.5; t += 1 / 60) c.update(1 / 60, anim({ flying: true }));
    expect(c.footIkActive).toBe(false);
  });

  it('12 thể LOD0 trên dốc: CPU thêm ≤ 0,5 ms mỗi khung', async () => {
    const handle = await load('chr_kiem_tu_nam');
    const extra = withPoses(handle.scene, BASE);
    const build = (ground?: 'biped') =>
      Array.from({ length: 12 }, (_, i) => {
        const c = new SkinnedCharacter({
          scene: cloneSkinned(handle.scene),
          clips: handle.animations,
          height: 1.75,
          refSpeed: 3,
          ground,
          ...extra,
        });
        placeAt(c, spot.x + i, spot.z + (i % 3), i);
        return c;
      });
    const measure = (cs: SkinnedCharacter[]) => {
      for (let t = 0; t < 30; t++) for (const c of cs) c.update(1 / 60, anim({ speed: 3 }));
      const t0 = performance.now();
      const N = 120;
      for (let t = 0; t < N; t++) for (const c of cs) c.update(1 / 60, anim({ speed: 3 }));
      return (performance.now() - t0) / N;
    };
    // Lấy lần nhanh nhất trong 3 lượt cho mỗi bên: hiệu hai số đo nhỏ rất nhạy với nhiễu (GC, tiến trình khác).
    const plain = build();
    const grounded = build('biped');
    const a = fastest(3, () => measure(plain));
    const b = fastest(3, () => measure(grounded));
    console.info(`[perf] 12 thể LOD0: ${a.toFixed(3)} ms → ${b.toFixed(3)} ms mỗi khung (thêm ${(b - a).toFixed(3)} ms)`);
    expect(b - a).toBeLessThan(cpuBudget(0.5));
  });

  it('sói: nghiêng thân theo dốc dọc', async () => {
    const handle = await load('mon_soi_xam');
    const c = new SkinnedCharacter({
      scene: cloneSkinned(handle.scene),
      clips: handle.animations,
      height: 0.9,
      refSpeed: 2.5,
      clipMap: { idle: 'idle', run: 'run' },
      ground: 'quad',
    });
    placeAt(c, spot.x, spot.z, spot.uphill);
    for (let t = 0; t < 1; t += 1 / 60) c.update(1 / 60, anim());
    const inner = c.root.children[0]!;
    // Mặt hướng lên dốc: mũi ngẩng lên (xoay quanh X âm); quay ngược xuống dốc thì cúi.
    expect(inner.rotation.x).toBeLessThan(-0.1);
    placeAt(c, spot.x, spot.z, spot.uphill + Math.PI);
    for (let t = 0; t < 1.5; t += 1 / 60) c.update(1 / 60, anim());
    expect(inner.rotation.x).toBeGreaterThan(0.1);
  });

  it('Thạch Viên (vượn hai chân): dựng được rig IK chân', async () => {
    const handle = await load('mon_thach_vien');
    const c = new SkinnedCharacter({
      scene: cloneSkinned(handle.scene),
      clips: handle.animations,
      height: 1.8,
      refSpeed: 2.15,
      clipMap: { idle: 'idle', run: 'run' },
      ground: 'biped',
      scale: 1.5,
    });
    placeAt(c, spot.x, spot.z, spot.uphill + Math.PI / 2);
    for (let t = 0; t < 1; t += 1 / 60) c.update(1 / 60, anim());
    expect(c.footIkActive).toBe(true);
  });
});
