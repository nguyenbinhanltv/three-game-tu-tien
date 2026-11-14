import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { color, dot, float, normalView, positionViewDirection, pow, saturate } from 'three/tsl';
import type { MonsterDef } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { MonsterModel } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { SkinnedMonster } from './skinned';
import type { ClipMap } from './states';
import { legacyModelsRequested, type MonsterView } from './view';

/** Quái dùng model có xương: asset, bảng clip, tông màu (nhân vào texture màu, không thêm texture). */
export interface MonsterSkin {
  asset: string;
  clips: ClipMap;
  /** Tốc độ (m/s, scale 1) mà clip chạy phát 1× khớp bước chân. */
  refSpeed: number;
  /** Màu nhân vào base color của asset (sRGB). Trắng = giữ nguyên. */
  tint: string;
  /** Độ nhám cộng thêm (lông ướt/khô), mặc định 0. */
  roughness?: number;
  /** Viền sáng yêu khí (fresnel) lấy màu `accent` của quái; số là cường độ. Bỏ trống = không có. */
  rim?: number;
}

const WOLF_CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };

/**
 * Bảng quái → model mới. Quái không có ở đây vẫn dùng model khối (`MonsterModel`).
 * Kích thước lấy theo `scale` trong monsters.json (hitbox, va chạm vẫn theo dữ liệu server).
 */
export const MONSTER_SKINS: Record<string, MonsterSkin> = {
  // Sói núi xám: giữ nguyên màu asset.
  mon_soi_xam: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, tint: '#ffffff' },
  // Yêu Lang: lông ngả tím than, viền yêu khí tím.
  mon_yeu_lang: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, tint: '#b3a6dc', rim: 0.55 },
  // U Minh Lang: lông xanh u tối, viền lam lạnh.
  mon_u_minh_lang: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, tint: '#8a9fd0', roughness: -0.08, rim: 0.8 },
};

interface Template {
  handle: AssetHandle;
  height: number;
  bounds: THREE.Sphere;
}

/**
 * Dựng model quái: model có xương nếu có trong `MONSTER_SKINS` và asset đã nạp, nếu không thì model khối.
 * Giữ một handle mẫu cho mỗi asset suốt đời đối tượng này nên tạo bản sao đồng bộ được và quái
 * ra/vào tầm nhìn không làm nạp lại; `dispose()` trả handle, AssetCache giải phóng bản gốc.
 */
export class MonsterSkins {
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  private mats = new Map<string, THREE.MeshStandardNodeMaterial>();
  private disposed = false;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  /** Bắt đầu nạp mọi asset quái có trong bảng (bỏ qua khi `?models=legacy`). */
  preload(): void {
    if (this.legacy) return;
    for (const s of Object.values(MONSTER_SKINS)) this.load(s.asset);
  }

  /** Quái này sẽ có model mới nhưng asset đang nạp (tạm dùng model khối, nạp xong thì đổi). */
  pending(def: MonsterDef): boolean {
    const s = MONSTER_SKINS[def.id];
    return !this.legacy && !!s && this.templates.get(s.asset) === 'loading';
  }

  create(def: MonsterDef): MonsterView {
    const s = MONSTER_SKINS[def.id];
    const t = s && !this.legacy ? this.templates.get(s.asset) : undefined;
    if (!s || !t || typeof t === 'string') return new MonsterModel(def);
    const scene = cloneSkinned(t.handle.scene);
    const mat = this.material(def, s, t);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    return new SkinnedMonster(def, { scene, clips: t.handle.animations, clipMap: s.clips, height: t.height, refSpeed: s.refSpeed, bounds: t.bounds });
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.templates.values()) if (typeof t !== 'string') t.handle.release();
    this.templates.clear();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }

  private load(id: string): void {
    if (this.templates.has(id)) return;
    this.templates.set(id, 'loading');
    this.cache.acquire(id, { priority: 1 }).then(
      (handle) => {
        if (this.disposed) {
          handle.release();
          return;
        }
        this.templates.set(id, templateOf(handle));
      },
      (err) => {
        if (this.disposed) return;
        console.warn(`[models] không nạp được ${id}, dùng model khối`, err);
        this.templates.set(id, 'failed');
      },
    );
  }

  /** Material riêng cho mỗi loại quái (cùng texture của asset, khác màu nhân). */
  private material(def: MonsterDef, s: MonsterSkin, t: Template): THREE.MeshStandardNodeMaterial {
    let m = this.mats.get(def.id);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    m = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0];
    m.color.multiply(new THREE.Color(s.tint));
    if (s.roughness) m.roughness = Math.min(1, Math.max(0, m.roughness + s.roughness));
    if (s.rim) {
      // Viền sáng ở mép nhìn nghiêng: tách bóng sói tối khỏi nền cỏ/rừng, không cần texture.
      const facing = saturate(dot(normalView, positionViewDirection));
      m.emissiveNode = color(new THREE.Color(def.accent)).mul(pow(float(1).sub(facing), 3).mul(s.rim));
    }
    this.mats.set(def.id, m);
    return m;
  }
}

/** Chiều cao và khung cầu từ hình học LOD0 ở tư thế gốc (asset đặt chân ở y = 0, node không biến đổi). */
function templateOf(handle: AssetHandle): Template {
  const box = new THREE.Box3();
  handle.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o.userData.lod ?? 0) > 0) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Rộng hơn khung tư thế gốc: chạy duỗi chân, cắn vươn cổ, chết nằm nghiêng.
  const radius = (Math.max(size.x, size.y, size.z) / 2) * 1.4;
  return { handle, height: box.max.y, bounds: new THREE.Sphere(center, radius) };
}
