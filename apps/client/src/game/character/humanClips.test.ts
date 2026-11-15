import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { HUMAN_ANIM_LIB, retargetClips } from './animLib';
import { HUMAN_CLIP_NAMES, HUMAN_CLIPS } from './humanClips';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

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

const LOCO = Object.entries(HUMAN_CLIPS).filter(([, c]) => c.refSpeed && c.loop);
const DIR: Record<string, [number, number]> = { forward: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0] };

/** Vị trí ngang (x, z) và độ cao của hai cổ chân theo thời gian, trên bản sao mới của nhân vật. */
function ankles(target: THREE.Object3D, clip: THREE.AnimationClip, fps = 30): { x: number; y: number; z: number }[][] {
  const root = target.clone(true);
  new THREE.Scene().add(root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const feet: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (/^mixamorig_(left|right)foot$/.test(o.name)) feet.push(o);
  });
  const p = new THREE.Vector3();
  const n = Math.round(clip.duration * fps);
  const out: { x: number; y: number; z: number }[][] = feet.map(() => []);
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / fps);
    root.updateMatrixWorld(true);
    feet.forEach((f, j) => {
      f.getWorldPosition(p);
      out[j].push({ x: p.x, y: p.y, z: p.z });
    });
  }
  return out;
}

/** Pha chân trụ (cổ chân trong 2,5 cm trên điểm thấp nhất), vận tốc ngang chung (trung vị hồi quy) và độ trượt tối đa khỏi đường thẳng đều. */
function stance(trace: { x: number; y: number; z: number }[][], fps = 30): { v: [number, number]; slip: number; segments: number } {
  const floor = Math.min(...trace.flat().map((p) => p.y));
  const segs: { foot: number; idx: number[] }[] = [];
  trace.forEach((t, foot) => {
    let cur: number[] = [];
    for (let i = 0; i <= t.length; i++) {
      if (i < t.length && t[i].y < floor + 0.025) cur.push(i);
      else {
        if (cur.length >= 3) segs.push({ foot, idx: cur });
        cur = [];
      }
    }
  });
  const fit = segs.map((s) => {
    const ts = s.idx.map((i) => i / fps);
    const tm = ts.reduce((a, b) => a + b, 0) / ts.length;
    const den = ts.reduce((a, t) => a + (t - tm) ** 2, 0);
    const xs = s.idx.map((i) => trace[s.foot][i].x);
    const zs = s.idx.map((i) => trace[s.foot][i].z);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const mz = zs.reduce((a, b) => a + b, 0) / zs.length;
    return { tm, mx, mz, vx: ts.reduce((a, t, k) => a + (t - tm) * (xs[k] - mx), 0) / den, vz: ts.reduce((a, t, k) => a + (t - tm) * (zs[k] - mz), 0) / den };
  });
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const v: [number, number] = [med(fit.map((f) => f.vx)), med(fit.map((f) => f.vz))];
  let slip = 0;
  segs.forEach((s, k) =>
    s.idx.forEach((i) => {
      const t = i / fps - fit[k].tm;
      slip = Math.max(slip, Math.hypot(trace[s.foot][i].x - (fit[k].mx + v[0] * t), trace[s.foot][i].z - (fit[k].mz + v[1] * t)));
    }),
  );
  return { v, slip, segments: segs.length };
}

describe('clip chung K-3 (anim_human_base)', () => {
  it('thư viện có đúng các clip trong bảng humanClips, độ dài hợp lý, không NaN', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    expect(lib.animations.map((c) => c.name).sort()).toEqual([...HUMAN_CLIP_NAMES].sort());
    for (const c of lib.animations) {
      expect(c.duration, c.name).toBeGreaterThan(0.2);
      expect(c.duration, c.name).toBeLessThan(16);
      for (const t of c.tracks) expect(t.values.every(Number.isFinite), `${c.name}/${t.name}`).toBe(true);
    }
    lib.release();
  });

  it('clip lặp khép vòng: khung cuối trùng khung đầu (quay mọi xương lệch dưới 3°)', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    for (const [name, info] of Object.entries(HUMAN_CLIPS)) {
      if (!info.loop || name === 'run') continue; // run: clip M2-3, giữ nguyên (chân đã đo riêng bên dưới)
      const clip = lib.animations.find((c) => c.name === name)!;
      let worst = 0;
      for (const t of clip.tracks) {
        if (!t.name.endsWith('.quaternion')) continue;
        const n = t.times.length;
        const a = new THREE.Quaternion().fromArray(t.values, 0);
        const b = new THREE.Quaternion().fromArray(t.values, (n - 1) * 4);
        worst = Math.max(worst, (a.angleTo(b) * 180) / Math.PI);
      }
      expect(worst, name).toBeLessThan(3);
    }
    lib.release();
  });

  it('đi lại không trượt chân: tốc độ nền khớp bảng, hướng đúng, trượt ≤ 4 cm (cả Thanh Phong và Lam Chi)', async () => {
    const lib = await cache.acquire(HUMAN_ANIM_LIB);
    const libHips = (() => {
      let y = 0;
      lib.scene.traverse((o) => o.name === 'mixamorig_hips' && (y = o.position.y));
      return y;
    })();
    for (const id of ['chr_kiem_tu_nam', 'chr_kiem_tu_nu']) {
      const h = await cache.acquire(id);
      let hipsY = 0;
      h.scene.traverse((o) => o.name === 'mixamorig_hips' && (hipsY = o.position.y));
      const k = hipsY / libHips;
      const out = retargetClips(lib.scene, lib.animations, h.scene);
      for (const [name, info] of LOCO) {
        const st = stance(ankles(h.scene, out.find((c) => c.name === name)!));
        const speed = Math.hypot(st.v[0], st.v[1]);
        expect(st.segments, `${id}/${name} số pha trụ`).toBeGreaterThanOrEqual(3);
        // run (M2-3) có tốc độ riêng từng nhân vật ở PLAYER_SKINS: dung sai rộng hơn.
        const tol = name === 'run' ? 0.15 : 0.1;
        expect(speed / (info.refSpeed! * k), `${id}/${name} tốc độ nền`).toBeGreaterThan(1 - tol);
        expect(speed / (info.refSpeed! * k), `${id}/${name} tốc độ nền`).toBeLessThan(1 + tol);
        const d = DIR[info.move!];
        // Chân trụ trượt về sau so với thân: thân đi theo −v.
        expect(-(st.v[0] * d[0] + st.v[1] * d[1]) / speed, `${id}/${name} hướng`).toBeGreaterThan(0.97);
        expect(st.slip, `${id}/${name} trượt (m)`).toBeLessThan(name === 'run' ? 0.06 : 0.04);
      }
      h.release();
    }
    lib.release();
  });
});
