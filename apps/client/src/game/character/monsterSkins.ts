import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { color, dot, float, materialColor, mix, normalView, positionViewDirection, pow, saturate, smoothstep, texture, vec3, vec4 } from 'three/tsl';
import type { MonsterDef } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { MonsterModel } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { type BossMove, SkinnedMonster } from './skinned';
import type { ClipMap } from './states';
import { type BossMoveKind, legacyModelsRequested, type MonsterView } from './view';

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
  /**
   * Đổi hẳn bảng màu (thay cho `tint`): độ sáng texture màu ánh xạ sang dải `dark` → `light` (sRGB), giữ vân lông.
   * `glow`: màu phát sáng nhỏ ở mép nhìn nghiêng và vùng sáng nhất (ngực, chóp đuôi). Dùng cho biến thể cùng model
   * khác hẳn màu (Kiếm Linh dùng model Hỏa Vân Hồ).
   */
  palette?: { dark: string; light: string; glow?: string };
  /** Dáng đi để bám địa hình (P2-E3): hai chân → IK chân; bốn chân → nghiêng thân theo dốc. */
  legs: 'biped' | 'quad';
  /** Chỉ nạp khi quái xuất hiện lần đầu (boss trong bí cảnh), không nạp sẵn lúc vào thế giới. */
  lazy?: boolean;
  /** Đòn lớn có vùng báo trước (M5-5) → clip và thời điểm chạm. */
  moves?: Partial<Record<BossMoveKind, BossMove>>;
  /** Lõi phát sáng: phần ngả lam của texture màu phát sáng màu `accent`; số là cường độ. */
  coreGlow?: number;
}

const WOLF_CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };
/** Cáo có thêm clip đi bộ của Tripo (quái đi tuần chậm); thú khác lùi về clip chạy phát chậm. */
const FOX_CLIPS: ClipMap = { ...WOLF_CLIPS, walk: 'walk' };
/** Boss: thêm choáng/mất thế; boss có niệm chú (M5-3) thêm clip chant. Boss không niệm thì `cast` lùi về idle. */
const BOSS_CLIPS: ClipMap = { ...WOLF_CLIPS, stun: 'stun' };
const CHANT_BOSS_CLIPS: ClipMap = { ...BOSS_CLIPS, cast: 'chant' };
/**
 * Thời điểm chạm (giây trong clip ở 1×) của clip thủ tục: phải khớp tools/blender/anim_quadruped.py (thú bốn chân)
 * và tools/blender/anim_biped_extra.py (người/vượn).
 */
const QUAD_MOVES: MonsterSkin['moves'] = { slam: { clip: 'slam', impact: 1.0 }, sweep: { clip: 'sweep', impact: 0.9 } };
const BIPED_MOVES: MonsterSkin['moves'] = { slam: { clip: 'slam', impact: 1.0 }, sweep: { clip: 'sweep', impact: 0.85 } };

/**
 * Bảng quái → model mới. Quái không có ở đây vẫn dùng model khối (`MonsterModel`).
 * Kích thước lấy theo `scale` trong monsters.json (hitbox, va chạm vẫn theo dữ liệu server).
 */
export const MONSTER_SKINS: Record<string, MonsterSkin> = {
  // Sói núi xám: giữ nguyên màu asset.
  mon_soi_xam: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, legs: 'quad', tint: '#ffffff' },
  // Yêu Lang: lông ngả tím than, viền yêu khí tím.
  mon_yeu_lang: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, legs: 'quad', tint: '#b3a6dc', rim: 0.55 },
  // U Minh Lang: lông xanh u tối, viền lam lạnh.
  mon_u_minh_lang: { asset: 'mon_soi_xam', clips: WOLF_CLIPS, refSpeed: 2.5, legs: 'quad', tint: '#8a9fd0', roughness: -0.08, rim: 0.8 },
  // refSpeed của các thú dưới theo tỉ lệ tốc độ chân trụ đo trong Blender (anim_quadruped naturalSpeed) so với sói
  // (đo 3,14 ↔ 2,5 đã chỉnh trong game); vượn so với Thanh Phong cùng loại clip Tripo (đo 3,34 ↔ 3,0).
  // Thiết Bối Trư: clip đòn húc nanh (gore), chân ngắn nên bước nhanh.
  mon_thiet_boi_tru: { asset: 'mon_thiet_boi_tru', clips: WOLF_CLIPS, refSpeed: 1.3, legs: 'quad', tint: '#ffffff' },
  // Hỏa Vân Hồ: lông son của asset, viền ánh lửa nhẹ.
  mon_hoa_van_ho: { asset: 'mon_hoa_van_ho', clips: FOX_CLIPS, refSpeed: 2.0, legs: 'quad', tint: '#ffffff', rim: 0.3 },
  // Kiếm Linh: cùng model cáo, lông trắng sương → lam núi xa, phát sáng kiếm khí nhỏ (art: asset đợt 2).
  mon_kiem_linh: {
    asset: 'mon_hoa_van_ho',
    clips: FOX_CLIPS,
    refSpeed: 2.0, legs: 'quad',
    tint: '#ffffff',
    roughness: -0.1,
    palette: { dark: '#88ABAA', light: '#DCE6DF', glow: '#CFF3FF' },
  },
  // Thạch Viên: vượn đá hai chân, đòn nện hai tay (clip slash của Tripo đã cắt).
  mon_thach_vien: { asset: 'mon_thach_vien', clips: WOLF_CLIPS, refSpeed: 2.15, legs: 'biped', tint: '#ffffff' },
  // Boss Kiếm Trủng (M3-8). Sói chúa: naturalSpeed 3,378 theo cùng tỉ lệ với sói (→ 2,7); hai boss vượn đo chân trụ
  // clip run Tripo ở scale 1.
  boss_huyet_lang_vuong: { asset: 'boss_huyet_lang_vuong', clips: BOSS_CLIPS, refSpeed: 2.7, legs: 'quad', tint: '#ffffff', rim: 0.35, lazy: true, moves: QUAD_MOVES },
  boss_kiem_khoi: { asset: 'boss_kiem_khoi', clips: BOSS_CLIPS, refSpeed: 4.6, legs: 'biped', tint: '#ffffff', coreGlow: 1.6, lazy: true, moves: BIPED_MOVES },
  boss_thu_mo_tuong: { asset: 'boss_thu_mo_tuong', clips: CHANT_BOSS_CLIPS, refSpeed: 3.1, legs: 'biped', tint: '#ffffff', lazy: true, moves: BIPED_MOVES },
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
  /** Bóng tâm ma (P3-7) là bản sao model người chơi: EntityManager nối vào PlayerSkins (cùng giới/đạo bào của mình). */
  shadow: { create(def: MonsterDef): MonsterView | null; pending(): boolean } | null = null;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  /** Bắt đầu nạp mọi asset quái có trong bảng, trừ asset nạp lười (bỏ qua khi `?models=legacy`). */
  preload(): void {
    if (this.legacy) return;
    for (const s of Object.values(MONSTER_SKINS)) if (!s.lazy) this.load(s.asset);
  }

  /** Nạp trước các asset nạp lười (boss bí cảnh) để cảnh boss xuất hiện luôn có model thật, không đổi từ model khối giữa cảnh. */
  preloadLazy(): void {
    if (this.legacy) return;
    for (const s of Object.values(MONSTER_SKINS)) if (s.lazy) this.load(s.asset);
  }

  /** Quái này sẽ có model mới nhưng asset đang nạp (tạm dùng model khối, nạp xong thì đổi). Asset lười bắt đầu nạp ở đây. */
  pending(def: MonsterDef): boolean {
    if (def.id === 'mon_tam_ma' && this.shadow) return this.shadow.pending();
    const s = MONSTER_SKINS[def.id];
    if (this.legacy || !s) return false;
    if (s.lazy) this.load(s.asset);
    return this.templates.get(s.asset) === 'loading';
  }

  create(def: MonsterDef): MonsterView {
    if (def.id === 'mon_tam_ma') {
      const v = this.shadow?.create(def);
      if (v) return v;
    }
    const s = MONSTER_SKINS[def.id];
    const t = s && !this.legacy ? this.templates.get(s.asset) : undefined;
    if (!s || !t || typeof t === 'string') return new MonsterModel(def);
    const scene = cloneSkinned(t.handle.scene);
    const mat = this.material(def, s, t);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    return new SkinnedMonster(def, { scene, clips: t.handle.animations, clipMap: s.clips, height: t.height, refSpeed: s.refSpeed, bounds: t.bounds, moves: s.moves, ground: s.legs });
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
    // Cùng thang ưu tiên với prefetchWorldAssets (preload.ts): sau nhân vật mình và kiến trúc quanh chỗ hồi sinh.
    this.cache.acquire(id, { priority: 120 }).then(
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
    if (s.palette) applyPalette(m, s.palette);
    else if (s.rim) {
      // Viền sáng ở mép nhìn nghiêng: tách bóng sói tối khỏi nền cỏ/rừng, không cần texture.
      const facing = saturate(dot(normalView, positionViewDirection));
      m.emissiveNode = color(new THREE.Color(def.accent)).mul(pow(float(1).sub(facing), 3).mul(s.rim));
    } else if (s.coreGlow && m.map) {
      // Lõi linh thể: chỗ texture ngả lam (xanh dương trội hơn đỏ) tự sáng màu accent; giáp xám/đồng không đổi.
      const c = texture(m.map);
      m.emissiveNode = color(new THREE.Color(def.accent)).mul(smoothstep(0.08, 0.22, c.b.sub(c.r)).mul(c.b).mul(s.coreGlow));
    }
    this.mats.set(def.id, m);
    return m;
  }
}

/** Màu tuyến tính từ hex sRGB. */
function linear(hex: string): THREE.Vector3 {
  const c = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

/**
 * Đổi bảng màu theo độ sáng: texel tối (chân, viền mắt) → `dark`, sáng (ngực, chóp đuôi) → `light`. Độ sáng texture
 * lông cáo (tuyến tính) nằm khoảng 0,02–0,6 nên kéo giãn dải đó. Phát sáng: fresnel ở mép + vùng sáng nhất, nhỏ để
 * không lấn bloom của chiêu.
 */
export function applyPalette(m: THREE.MeshStandardNodeMaterial, p: NonNullable<MonsterSkin['palette']>): void {
  const lum = dot(materialColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  const t = smoothstep(0.02, 0.6, lum);
  const d = linear(p.dark);
  const l = linear(p.light);
  m.colorNode = vec4(mix(vec3(d.x, d.y, d.z), vec3(l.x, l.y, l.z), t), materialColor.a);
  if (p.glow) {
    const g = linear(p.glow);
    const facing = saturate(dot(normalView, positionViewDirection));
    const amount = pow(float(1).sub(facing), 3).mul(0.6).add(pow(t, 4).mul(0.25));
    m.emissiveNode = vec3(g.x, g.y, g.z).mul(amount);
  }
  m.needsUpdate = true;
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
