import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../core/assets';
import { nodeGltfLoader } from '../core/gltfTestLoader';
import { MannequinCharacter, mannequinTemplate, V3_LIB } from './mannequin';
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
const ANIM = {
  speed: 0,
  flying: false,
  sky: false,
  airborne: false,
  casting: false,
  meditating: false,
  dead: false,
  combat: false,
} as unknown as AnimState;
type Inner = { lods: THREE.SkinnedMesh[][]; rig: THREE.Object3D; inner: THREE.Object3D };

/** Vị trí thế giới của vài đỉnh sau skinning (đúng phép tính của shader: bindMatrix, ma trận xương, bindMatrixInverse, matrixWorld). */
function worldVerts(scene: THREE.Object3D, mesh: THREE.SkinnedMesh): THREE.Vector3[] {
  scene.updateMatrixWorld(true);
  mesh.skeleton.update();
  const n = mesh.geometry.getAttribute('position').count;
  return [0, 0.21, 0.47, 0.73, 0.99].map((f) =>
    mesh.getVertexPosition(Math.floor(f * (n - 1)), new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),
  );
}
const maxDiff = (a: THREE.Vector3[], b: THREE.Vector3[]) => Math.max(...a.map((v, i) => v.distanceTo(b[i]!)));

describe('MannequinCharacter: đỗ rig ở LOD2 (N-7)', { timeout: 60000 }, () => {
  for (const id of ['chr_v3_de_tu_nam', 'chr_v3_tinh_khuyet_nu']) {
    it(`${id}: lưới LOD2 vẽ đúng chỗ như khi rig còn trong cảnh; đi chuyển không cần mixer; trả rig về như cũ`, async () => {
      const [handle, lib] = await Promise.all([cache.acquire(id), cache.acquire(V3_LIB)]);
      const c = new MannequinCharacter(mannequinTemplate(handle, lib));
      const scene = new THREE.Scene();
      scene.add(c.root);
      c.root.position.set(12, 3, -7);
      c.root.rotation.y = 0.9;
      const x = c as unknown as Inner;
      expect(x.lods[2]).toHaveLength(1); // LOD2 đã gộp một lưới
      const mesh = x.lods[2]![0]!;
      c.setView({ dist: 5, inView: true, allowLod0: true });
      for (let i = 0; i < 20; i++) c.update(1 / 60, ANIM);
      expect(c.rigParked).toBe(false);
      const ref = worldVerts(scene, mesh);

      // Sang LOD2: rig rời cảnh, lưới LOD2 nằm dưới `inner`, vị trí đỉnh không đổi.
      c.setView({ dist: 200, inView: true, allowLod0: false });
      expect(c.rigParked).toBe(true);
      expect(x.rig.parent).toBeNull();
      expect(mesh.parent).toBe(x.inner);
      expect(mesh.bindMode).toBe(THREE.DetachedBindMode);
      const parked = worldVerts(scene, mesh);
      expect(maxDiff(ref, parked)).toBeLessThan(1e-4);

      // Nhân vật đi chuyển, mixer chưa chạy: lưới đi theo ngay (không đứng lại chờ lượt tính xương).
      const d = new THREE.Vector3(4, 0, 2);
      c.root.position.add(d);
      const moved = worldVerts(scene, mesh);
      expect(
        maxDiff(
          moved,
          parked.map((v) => v.clone().add(d)),
        ),
      ).toBeLessThan(1e-4);

      // Về gần: rig trở lại cảnh, lưới về chỗ cũ, chế độ bind cũ.
      c.setView({ dist: 5, inView: true, allowLod0: true });
      expect(c.rigParked).toBe(false);
      expect(x.rig.parent).toBe(x.inner);
      expect(mesh.parent).not.toBe(x.inner);
      expect(mesh.bindMode).toBe(THREE.AttachedBindMode);
      expect(maxDiff(worldVerts(scene, mesh), moved)).toBeLessThan(1e-4);

      // Mixer vẫn chạy khi đang đỗ (tư thế đổi) và dispose lúc đang đỗ không ném lỗi.
      c.setView({ dist: 200, inView: true, allowLod0: false });
      for (let i = 0; i < 60; i++) c.update(1 / 30, { ...ANIM, speed: 5 });
      expect(maxDiff(worldVerts(scene, mesh), moved)).toBeGreaterThan(1e-3);
      c.dispose();
      expect(x.rig.parent).toBe(x.inner);
      handle.release();
      lib.release();
    });
  }
});
