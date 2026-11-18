import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { SETS } from '@dtl/content';
import { accessoryCode, parseAccessoryCode } from '@dtl/shared';
import { AssetCache, type Manifest } from '../core/assets';
import { acquireWithHumanLib, mergeClips, retargetClips } from './animLib';
import { type BodyFit, fitBody } from './bodyFit';
import { accessorySlots, attachAccessories, buildAccessories, createAccessoryMaterials, disposeAccessories } from './setAccessories';
import { stripPartTracks } from './sword';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// Phụ kiện đồ bộ trên model thật (nam + nữ): số đo thân hợp lý, đủ phụ kiện theo ô, gắn được vào bản sao, không chui vào thân.
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const ASSETS: [string, number][] = [
  ['chr_kiem_tu_nam', 1.75],
  ['chr_kiem_tu_nu', 1.68],
];
const HAS = ASSETS.every(([id]) => JSON.stringify(MANIFEST).includes(`"${id}"`));

const cache = new AssetCache({
  base: '',
  fetchManifest: async () => MANIFEST,
  load: async (url) => {
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
    const loader = nodeGltfLoader();
    return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  },
});

async function setup(id: string, height: number) {
  const [h, lib] = await acquireWithHumanLib(cache, id);
  const own = mergeClips(h.animations.map(stripPartTracks), retargetClips(lib.scene, lib.animations, h.scene));
  const fit = fitBody(
    h.scene,
    own.find((c) => c.name === 'idle'),
    height,
  ) as BodyFit;
  return { h, fit };
}

const slotsOf = (setId: string) => Object.fromEntries(accessorySlots(setId).map((sl) => [sl, setId]));

describe('phụ kiện đồ bộ', () => {
  it('mỗi bộ có 2–4 loại phụ kiện theo ô', () => {
    for (const s of SETS) {
      const n = accessorySlots(s.id).length;
      expect(n, s.id).toBeGreaterThanOrEqual(2);
      expect(n, s.id).toBeLessThanOrEqual(4);
    }
  });

  it('mã phụ kiện khớp bảng bộ', () => {
    const code = accessoryCode(SETS, { robe: { id: SETS[0].pieces[0] } });
    expect(parseAccessoryCode(SETS, code).robe).toBe(SETS[0].id);
  });

  it.skipIf(!HAS).each(ASSETS)(
    '%s: số đo thân, dựng đủ phụ kiện, gắn xương',
    async (id, height) => {
      const { h, fit } = await setup(id, height);
      expect(fit).toBeTruthy();
      expect(fit.waist.rx).toBeGreaterThan(0.08);
      expect(fit.waist.rx).toBeLessThan(0.25);
      expect(fit.forearm[1].radius).toBeGreaterThan(0.03);
      expect(fit.forearm[1].radius).toBeLessThan(0.09);
      expect(fit.shin[1].radius).toBeGreaterThan(0.04);

      const mats = createAccessoryMaterials(() => new THREE.MeshBasicMaterial());
      for (const s of SETS) {
        for (const slot of accessorySlots(s.id)) {
          const built = buildAccessories(fit, { [slot]: s.id });
          expect(built.parts.length + built.ribbons.length, `${s.id}/${slot}`).toBeGreaterThan(0);
          for (const p of built.parts) {
            const a = p.geo.getAttribute('position');
            for (let i = 0; i < a.array.length; i++) expect(Number.isFinite(a.array[i])).toBe(true);
            expect(p.geo.getAttribute('color')).toBeTruthy();
          }
          // Gắn vào bản sao: một SkinnedMesh cho mỗi loại vật liệu, trọng số 1 vào đúng xương.
          const { meshes } = attachAccessories(cloneSkinned(h.scene), fit, built, mats);
          expect(meshes.length, `${s.id}/${slot}`).toBe(new Set(built.parts.map((p) => p.kind)).size);
          for (const m of meshes) expect(m.geometry.getAttribute('skinIndex').count).toBe(m.geometry.getAttribute('position').count);
        }
        // Ngân sách: đủ mọi ô của một bộ dưới 3000 tam giác.
        const built = buildAccessories(fit, slotsOf(s.id));
        const tris = [...built.parts.map((p) => p.geo), ...built.ribbons.map((r) => r.geo)].reduce(
          (a, g) => a + (g.index ? g.index.count : g.getAttribute('position').count) / 3,
          0,
        );
        expect(tris, s.id).toBeLessThan(3000);
        expect(built.ribbons.length, s.id).toBeLessThanOrEqual(2);
      }
    },
    60_000,
  );

  it.skipIf(!HAS).each(ASSETS)(
    '%s: hình học gộp dùng chung giữa người chơi, dispose giải phóng',
    async (id, height) => {
      const { h, fit } = await setup(id, height);
      const mats = createAccessoryMaterials(() => new THREE.MeshBasicMaterial());
      const built = buildAccessories(fit, slotsOf(SETS[1].id));
      const a = attachAccessories(cloneSkinned(h.scene), fit, built, mats).meshes;
      const b = attachAccessories(cloneSkinned(h.scene), fit, built, mats).meshes;
      expect(a.length).toBeGreaterThan(0);
      // Hai người chơi cùng đồ: cùng một geometry (không tạo thêm bộ đệm GPU cho mỗi người).
      a.forEach((m, i) => expect(m.geometry).toBe(b[i].geometry));
      let freed = 0;
      for (const g of [...built.parts.map((p) => p.geo), ...built.ribbons.map((r) => r.geo), ...Object.values(built.merged ?? {})])
        g.addEventListener('dispose', () => freed++);
      const total = built.parts.length + built.ribbons.length + Object.keys(built.merged ?? {}).length;
      disposeAccessories(built);
      expect(freed).toBe(total);
    },
    60_000,
  );

  it.skipIf(!HAS).each(ASSETS)(
    '%s: phần gắn xương không chui vào thân (tư thế nghỉ)',
    async (id, height) => {
      const { h, fit } = await setup(id, height);
      const root = cloneSkinned(h.scene);
      let found: THREE.SkinnedMesh | null = null;
      root.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh && !found && !(o.userData.lod > 0)) found = m;
      });
      const body = found as unknown as THREE.SkinnedMesh;
      root.updateMatrixWorld(true);
      body.skeleton.update();
      const tmp = new THREE.Vector3();
      const cell = 0.03;
      const grid = new Map<string, THREE.Vector3[]>();
      const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
      for (let i = 0; i < body.geometry.getAttribute('position').count; i++) {
        body.getVertexPosition(i, tmp);
        const v = tmp.clone().applyMatrix4(body.matrixWorld);
        const k = cellKey(Math.floor(v.x / cell), Math.floor(v.y / cell), Math.floor(v.z / cell));
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(v);
      }
      const nearest = (p: THREE.Vector3): number => {
        let best = Infinity;
        const [cx, cy, cz] = [Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell)];
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++)
              for (const v of grid.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) best = Math.min(best, v.distanceTo(p));
        return best;
      };
      const mats = createAccessoryMaterials(() => new THREE.MeshBasicMaterial());
      for (const s of SETS) {
        const built = buildAccessories(fit, slotsOf(s.id));
        const { meshes } = attachAccessories(root, fit, built, mats);
        // Thân đang ở T-pose, phụ kiện cũng đã đưa về T-pose qua skin. Chỉ xét đỉnh có thân trong 3 cm; hầu hết phải cách ≥ 2 mm.
        let close = 0;
        let total = 0;
        for (const m of meshes) {
          m.updateMatrixWorld(true);
          m.skeleton.update();
          for (let i = 0; i < m.geometry.getAttribute('position').count; i++) {
            m.getVertexPosition(i, tmp);
            const d = nearest(tmp.applyMatrix4(m.matrixWorld));
            if (d < cell) {
              total++;
              if (d < 0.002) close++;
            }
          }
          m.removeFromParent();
        }
        if (total) expect(close / total, `${s.id} ${id}`).toBeLessThan(0.1);
      }
    },
    60_000,
  );
});
