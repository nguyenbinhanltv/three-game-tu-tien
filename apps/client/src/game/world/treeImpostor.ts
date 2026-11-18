import * as THREE from 'three/webgpu';
import { attribute, length, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { createWorldMaterial } from '../../render/materials/world';
import { withSightFade } from './occlusion';
import { assetBaseUrl } from '../core/assets';
import atlas from '../core/impostors.json';
import type { PropInstance } from './propScatter';
import { logger } from '../../base/log';

const treesLog = logger('trees');

/**
 * Impostor cho cây xa (P2-A4b): hai tấm cắt chéo (góc nhìn bake từ +Z và +X) lấy từ một atlas chung (cả 5 loài, bake bằng
 * `pnpm assets:impostor`), nên mọi loài trong một ô đi chung một InstancedMesh = một draw call. Cây ở xa hơn `start` do ô
 * 128 m quyết định (cùng lưới với `PropLayer`: ô nào PropLayer ẩn mesh 3D thì ô đó hiện impostor, không chồng, không hở).
 * Để ít draw call, vùng hoàn toàn ở xa gộp thành siêu ô 512 m (một mesh); ô biên giữa gần/xa vẽ từng ô 128 m.
 */
const SUPER_SIZE = 512;

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
  private uCam = uniform(new THREE.Vector2());
  private uStart = uniform(0);
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
        const tex = texture(t, vec2(uv().x, uv().y.add(row).div(atlas.rows)));
        const dist = length(attribute('aPos', 'vec2').sub(this.uCam));
        m.colorNode = vec4(tex.rgb, tex.a.mul(step(this.uStart, dist)));
        this.material = withSightFade(m);
      },
      undefined,
      (e) => treesLog.warn('không nạp được atlas impostor, bỏ qua', e),
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
    const pos = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = g.items[Math.min(i, g.items.length - 1)];
      const sp = SPECIES[p.id];
      const sy = p.sy ?? 1;
      _q.setFromAxisAngle(_up, p.yaw);
      // Khung bake vuông V, tâm ở nửa chiều cao cây: đáy khung lệch (cao − V)/2 so với gốc cây.
      _m.compose(
        _p.set(p.x, p.y + ((sp.height - sp.frame) / 2) * p.s * sy, p.z),
        _q,
        _s.set(sp.frame * p.s, sp.frame * p.s * sy, sp.frame * p.s),
      );
      _m.toArray(mat, i * 16);
      const t = p.tint ?? [1, 1, 1];
      col[i * 3] = t[0];
      col[i * 3 + 1] = t[1];
      col[i * 3 + 2] = t[2];
      row[i] = atlas.rows - 1 - sp.row;
      pos[i * 2] = p.x;
      pos[i * 2 + 1] = p.z;
    }
    const geo = this.geometry.clone();
    geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(row, 1));
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 2));
    const im = new THREE.InstancedMesh(geo, this.material as THREE.Material, n);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16);
    im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    im.matrixAutoUpdate = false;
    // Cắt theo khung nhìn (CPU/draw call của three là chi phí chính khi đông): bounding sphere tính từ đúng các instance.
    im.computeBoundingSphere();
    im.frustumCulled = true;
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
   * Mỗi siêu ô là một mesh; cây gần hơn `start` (khoảng cách của chính cây, tính trong shader) bị bỏ ở mức điểm ảnh, khớp
   * quy tắc chọn cây 3D của `PropLayer` nên không chồng, không hở. `range`: siêu ô xa hơn thì không vẽ. `forceNear`: mesh 3D
   * chưa nạp xong thì hiện impostor cả ở gần để không hở cây.
   */
  update(camX: number, camZ: number, start: number, range: number, forceNear: boolean): void {
    if (!this.loading) this.loadTexture();
    if (!this.material) return;
    this.visible = 0;
    this.uCam.value.set(camX, camZ);
    this.uStart.value = forceNear ? 0 : start;
    for (const sg of this.supers.values()) {
      const d = ImpostorLayer.dist(sg, camX, camZ);
      // Xa quá tầm, hoặc nằm trọn trong vùng 3D (góc xa nhất vẫn gần hơn `start`): không có điểm ảnh nào cần vẽ.
      const far = Math.hypot(Math.max(camX - sg.x0, sg.x1 - camX), Math.max(camZ - sg.z0, sg.z1 - camZ));
      this.show(sg, d < range && (forceNear || far >= start));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    for (const g of this.supers.values()) {
      if (g.mesh) {
        g.mesh.geometry.dispose();
        g.mesh.dispose();
      }
    }
    this.geometry.dispose();
    this.material?.dispose();
    this.tex?.dispose();
    this.supers.clear();
  }
}
