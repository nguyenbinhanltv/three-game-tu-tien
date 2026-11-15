import * as THREE from 'three/webgpu';
import { attribute, texture, uv, vec2 } from 'three/tsl';
import { createWorldMaterial } from '../render/materials/world';
import { withSightFade } from './occlusion';
import { assetBaseUrl } from './assets';
import atlas from './impostors.json';
import type { PropInstance } from './propScatter';

/**
 * Impostor cho cây xa (P2-A4b): hai tấm cắt chéo (góc nhìn bake từ +Z và +X) lấy từ một atlas chung (cả 5 loài, bake bằng
 * `pnpm assets:impostor`), nên mọi loài trong một ô đi chung một InstancedMesh = một draw call. Cây ở xa hơn `start` do ô
 * 128 m quyết định (cùng lưới với `PropLayer`: ô nào PropLayer ẩn mesh 3D thì ô đó hiện impostor, không chồng, không hở).
 * Để ít draw call, vùng hoàn toàn ở xa gộp thành siêu ô 512 m (một mesh); ô biên giữa gần/xa vẽ từng ô 128 m.
 */
export const CHUNK = 128;
const SUPER = 4; // ô/cạnh siêu ô
const SUPER_SIZE = CHUNK * SUPER;

interface Group {
  items: PropInstance[];
  mesh: THREE.InstancedMesh | null;
  /** Hộp bao theo mặt phẳng XZ (để tính khoảng cách tới camera). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface Species {
  row: number;
  frame: number;
  height: number;
}
const SPECIES = atlas.species as Record<string, Species>;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Hai tấm đơn vị (gốc ở đáy giữa), uv nửa trái cho tấm nhìn từ +Z, nửa phải cho tấm nhìn từ +X; pháp tuyến hướng lên để sáng đều. */
function crossQuads(): THREE.BufferGeometry {
  const pos = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5];
  const uvs = [0, 0, 0.5, 0, 0.5, 1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0.5, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

export class ImpostorLayer {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Group>();
  private supers = new Map<string, Group>();
  private material: THREE.MeshStandardNodeMaterial | null = null;
  private tex: THREE.Texture | null = null;
  private geometry = crossQuads();
  private disposed = false;
  /** Số mesh đang hiện. */
  visible = 0;

  constructor(instances: readonly PropInstance[]) {
    this.group.name = 'tree-impostors';
    for (const p of instances) {
      if (!(p.id in SPECIES)) continue;
      const cx = Math.floor(p.x / CHUNK);
      const cz = Math.floor(p.z / CHUNK);
      this.add(this.chunks, `${cx}|${cz}`, p, cx * CHUNK, cz * CHUNK, CHUNK);
      const sx = Math.floor(p.x / SUPER_SIZE);
      const sz = Math.floor(p.z / SUPER_SIZE);
      this.add(this.supers, `${sx}|${sz}`, p, sx * SUPER_SIZE, sz * SUPER_SIZE, SUPER_SIZE);
    }
  }

  private add(map: Map<string, Group>, key: string, p: PropInstance, x0: number, z0: number, size: number): void {
    let g = map.get(key);
    if (!g) map.set(key, (g = { items: [], mesh: null, x0, z0, x1: x0 + size, z1: z0 + size }));
    g.items.push(p);
  }

  private loading = false;

  /** Nạp lười lúc cần lần đầu (sau khung đầu, không nằm trong tải đầu). */
  private loadTexture(): void {
    this.loading = true;
    new THREE.TextureLoader().load(
      `${assetBaseUrl()}impostor/${atlas.file}`,
      (t) => {
        if (this.disposed) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        this.tex = t;
        const row = attribute('aRow', 'float');
        const m = createWorldMaterial({ side: THREE.DoubleSide, alphaTest: 0.42, roughness: 1 });
        m.colorNode = texture(t, vec2(uv().x, uv().y.add(row).div(atlas.rows)));
        this.material = withSightFade(m);
      },
      undefined,
      (e) => console.warn('[trees] không nạp được atlas impostor, bỏ qua', e),
    );
  }

  /** Atlas đã nạp, impostor dùng được. */
  get ready(): boolean {
    return this.material !== null;
  }

  private build(g: Group): void {
    const n = Math.max(2, g.items.length);
    const mat = new Float32Array(n * 16);
    const col = new Float32Array(n * 3);
    const row = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = g.items[Math.min(i, g.items.length - 1)];
      const sp = SPECIES[p.id];
      const sy = p.sy ?? 1;
      _q.setFromAxisAngle(_up, p.yaw);
      // Khung bake vuông V, tâm ở nửa chiều cao cây: đáy khung lệch (cao − V)/2 so với gốc cây.
      _m.compose(_p.set(p.x, p.y + ((sp.height - sp.frame) / 2) * p.s * sy, p.z), _q, _s.set(sp.frame * p.s, sp.frame * p.s * sy, sp.frame * p.s));
      _m.toArray(mat, i * 16);
      const t = p.tint ?? [1, 1, 1];
      col[i * 3] = t[0];
      col[i * 3 + 1] = t[1];
      col[i * 3 + 2] = t[2];
      row[i] = atlas.rows - 1 - sp.row;
    }
    const geo = this.geometry.clone();
    geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(row, 1));
    const im = new THREE.InstancedMesh(geo, this.material as THREE.Material, n);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16);
    im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    im.matrixAutoUpdate = false;
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    im.visible = false;
    this.group.add(im);
    g.mesh = im;
  }

  private show(g: Group, on: boolean): void {
    if (on) {
      if (!g.mesh) this.build(g);
      (g.mesh as THREE.InstancedMesh).visible = true;
      this.visible++;
    } else if (g.mesh) g.mesh.visible = false;
  }

  /** Khoảng cách từ camera tới hộp XZ. */
  private static dist(g: Group, x: number, z: number): number {
    const dx = Math.max(g.x0 - x, 0, x - g.x1);
    const dz = Math.max(g.z0 - z, 0, z - g.z1);
    return Math.hypot(dx, dz);
  }

  /**
   * `start`: ô 128 m có tâm cách camera < start là ô 3D (không hiện impostor); `range`: xa hơn thì bỏ. `forceNear`: mesh 3D
   * chưa nạp xong thì hiện impostor cả ở gần để không hở cây.
   */
  update(camX: number, camZ: number, start: number, range: number, forceNear: boolean): void {
    if (!this.loading) this.loadTexture();
    if (!this.material) return;
    this.visible = 0;
    const near = forceNear ? -1 : start;
    for (const sg of this.supers.values()) {
      const d = ImpostorLayer.dist(sg, camX, camZ);
      if (d >= range) {
        this.show(sg, false);
        this.eachChild(sg, (c) => this.show(c, false));
      } else if (d >= near) {
        // Cả siêu ô ở xa: một mesh, tắt mọi ô con (tâm ô con ≥ khoảng cách hộp ≥ near).
        this.show(sg, true);
        this.eachChild(sg, (c) => this.show(c, false));
      } else {
        this.show(sg, false);
        this.eachChild(sg, (c) => {
          const dc = Math.hypot(c.x0 + CHUNK / 2 - camX, c.z0 + CHUNK / 2 - camZ);
          this.show(c, dc >= near && dc < range);
        });
      }
    }
  }

  private eachChild(sg: Group, fn: (c: Group) => void): void {
    const sx = Math.floor(sg.x0 / SUPER_SIZE) * SUPER;
    const sz = Math.floor(sg.z0 / SUPER_SIZE) * SUPER;
    for (let j = 0; j < SUPER; j++) {
      for (let i = 0; i < SUPER; i++) {
        const c = this.chunks.get(`${sx + i}|${sz + j}`);
        if (c) fn(c);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    for (const g of [...this.chunks.values(), ...this.supers.values()]) {
      if (g.mesh) {
        g.mesh.geometry.dispose();
        g.mesh.dispose();
      }
    }
    this.geometry.dispose();
    this.material?.dispose();
    this.tex?.dispose();
    this.chunks.clear();
    this.supers.clear();
  }
}
