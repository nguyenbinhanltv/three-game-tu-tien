import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { Humanoid } from '../models';
import { adoptGltfMaterials, rimLight } from '../../render/materials/world';
import { acquireWithHumanLib, HUMAN_K3_LIB, HUMAN_UAL_LIB, mergeClips, retargetClips } from './animLib';
import { UAL_NPC_IDLES } from './humanClips';
import { UAL_ENABLED } from './ualClips';
import { HUMAN_CLIPS } from './humanClips';
import { SkinnedCharacter } from './skinned';
import type { CharState, ClipMap } from './states';
import { type CharacterView, legacyModelsRequested } from './view';

/** NPC dùng model có xương: asset và tốc độ phát riêng. */
export interface NpcSkin {
  asset: string;
  rates?: Partial<Record<CharState, number>>;
  /** Nhân màu lên vật liệu (0xRRGGBB) để NPC dùng chung asset không giống hệt nhau (E2-H). */
  tint?: number;
  /**
   * NPC dựng từ model người chơi nam/nữ (có texture mặt, tóc, áo) và chỉ nhuộm kênh vải: `g` giới tính, `hex` màu áo, `accent` màu viền (E3-H).
   * Có `look` thì `entities.ts` dựng qua `PlayerSkins.createNpc`, `asset`/`tint` không dùng.
   */
  look?: { g: string; hex: string; accent?: string };
}

/** Bộ clip của rig Mixamo từ Tripo (M3-6): idle/run/attack/death từ preset, hit_light thủ tục (anim_biped_extra.py). */
const NPC_CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' };

/**
 * Bảng id NPC (npcs.json) → asset. NPC không có ở đây vẫn dùng model khối. NPC chỉ đứng tại chỗ nên chỉ phát idle
 * (15,3 s, cử động chậm, phát 1×); các clip khác để dự phòng. Chiều cao lấy từ asset (Tố Tâm 1,65 m, Thiết lão
 * 1,70 m, Lạc Vân 1,75 m); chọn/tương tác vẫn theo vị trí trong dữ liệu.
 */
export const NPC_SKINS: Record<string, NpcSkin> = {
  npc_chuong_mon: { asset: 'chr_npc_chuong_mon' },
  npc_duoc_su: { asset: 'chr_npc_duoc_su' },
  npc_thiet_lao: { asset: 'chr_npc_thiet_lao' },
  // M-5: ba người giao nhiệm vụ ở các điểm đáng chú ý dùng lại model có sẵn (không tạo asset mới).
  npc_mieu_cong: { asset: 'chr_npc_thiet_lao' },
  npc_hai_duoc: { asset: 'chr_npc_duoc_su' },
  npc_tieu_khe: { asset: 'chr_npc_chuong_mon' },
  // E2-H: NPC Hạ Khuyết Trạm và Cựu Mỏ Khu dùng lại model sẵn có, đổi màu (không dựng model mới).
  npc_hua_lao: { asset: 'chr_npc_thiet_lao', tint: 0xe3c58a },
  npc_to_van_ngu: { asset: 'chr_npc_duoc_su', tint: 0x6fb4ee },
  npc_khieu_han_son: { asset: 'chr_npc_chuong_mon', tint: 0xb4ad9c },
  // E3-H: Phù Đảo Các (Vân Hải) cũng dùng lại model sẵn có, đổi màu.
  // Lâm Chiếu Dung: nữ, áo ngà điểm hổ phách. Tô Vãn Ngư (bản Phù Đảo Các): nữ, áo lam đậm của tông.
  npc_lam_chieu_dung: { asset: 'chr_kiem_tu_nu', look: { g: 'f', hex: '#E6DDCB', accent: '#E0962C' } },
  npc_to_van_ngu_hai: { asset: 'chr_kiem_tu_nu', look: { g: 'f', hex: '#3B6584', accent: '#22364E' } },
  // Người đồng hành của nhiệm vụ hộ tống (không phải NPC đứng thật, xem `LevelDef.escorts`).
  npc_lam_chieu_dung_do: { asset: 'chr_kiem_tu_nu', look: { g: 'f', hex: '#E6DDCB', accent: '#E0962C' } },
  npc_thuong_nhan: { asset: 'chr_npc_thiet_lao', tint: 0xb89a6a },
};

/** Model khối cũ của NPC (dự phòng khi asset chưa nạp/lỗi, và `?models=legacy`). */
export function legacyNpc(id: string, robe: string): Humanoid {
  return new Humanoid({
    robe,
    trim: id === 'npc_chuong_mon' ? 0x3b6ea8 : 0x4a3a2a,
    hair: id === 'npc_duoc_su' ? 0x2a2026 : 0xb9bcc2,
    elder: id !== 'npc_duoc_su',
    sword: id === 'npc_chuong_mon',
    scale: 1.06,
  });
}

interface Template {
  handle: AssetHandle;
  lib: AssetHandle;
  clips: THREE.AnimationClip[];
  height: number;
  bounds: THREE.Sphere;
  mat: THREE.MeshStandardNodeMaterial;
  /** Clip idle phụ của UAL (khoanh tay, nói chuyện...) đã retarget sang asset này; null = chưa nạp xong. */
  ual: THREE.AnimationClip[] | null;
  /** Đã bắt đầu nạp UAL cho mẫu này; NPC dựng trong lúc chờ nằm ở `ualWait`. */
  ualLoading: boolean;
  ualWait: WeakRef<SkinnedCharacter>[];
}

/**
 * Dựng model NPC: có xương nếu asset đã nạp, nếu không thì model khối. Giữ handle mẫu suốt đời đối tượng này
 * (giống `MonsterSkins`); `dispose()` trả handle và material.
 */
export class NpcSkins {
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  private disposed = false;
  /** Vật liệu nhân màu theo NPC (bản sao của vật liệu asset), trả khi `dispose`. */
  private tinted = new Map<string, THREE.MeshStandardNodeMaterial>();

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  preload(): void {
    if (this.legacy) return;
    for (const s of Object.values(NPC_SKINS)) if (!s.look) this.load(s.asset);
  }

  /** NPC này sẽ có model mới nhưng asset đang nạp (tạm model khối, nạp xong thì đổi). */
  pending(id: string): boolean {
    const s = NPC_SKINS[id];
    return !this.legacy && !!s && this.templates.get(s.asset) === 'loading';
  }

  create(id: string, robe: string): CharacterView {
    const s = NPC_SKINS[id];
    const t = s && !this.legacy ? this.templates.get(s.asset) : undefined;
    if (!s || !t || typeof t === 'string') return legacyNpc(id, robe);
    const scene = cloneSkinned(t.handle.scene);
    const mat = s.tint === undefined ? t.mat : this.tintedMat(id, t.mat, s.tint);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    const m = new SkinnedCharacter({
      scene,
      clips: t.clips,
      clipMap: NPC_CLIPS,
      height: t.height,
      refSpeed: 3,
      bounds: t.bounds,
      rates: s.rates,
      sink: false,
      ground: 'biped',
    });
    // Lệch pha idle để các NPC không thở cùng nhịp.
    const idle = m.actionOf('idle');
    if (idle) idle.time = Math.random() * idle.getClip().duration;
    this.attachIdles(t, m);
    return m;
  }

  /**
   * Idle đa dạng cho NPC (UAL): nạp lười thư viện UAL một lần cho mỗi asset, retarget từng clip một lượt `setTimeout`, rồi gắn cho mọi
   * NPC cùng asset (đã dựng và dựng sau). Lỗi thì NPC giữ idle cũ.
   */
  private attachIdles(t: Template, m: SkinnedCharacter): void {
    const give = (c: SkinnedCharacter, clips: THREE.AnimationClip[]) => {
      c.addClips(clips, {});
      c.setIdleVariants(UAL_NPC_IDLES);
    };
    if (!UAL_ENABLED) return;
    if (t.ual) return give(m, t.ual);
    t.ualWait.push(new WeakRef(m));
    if (t.ualLoading) return;
    t.ualLoading = true;
    setTimeout(() => {
      if (this.disposed) return;
      this.cache.acquire(HUMAN_UAL_LIB, { priority: 30 }).then(
        (lib) => {
          const out: THREE.AnimationClip[] = [];
          const todo = lib.animations.filter((c) => UAL_NPC_IDLES.includes(c.name));
          const step = () => {
            if (this.disposed) return lib.release();
            const c = todo.shift();
            if (c) {
              out.push(...retargetClips(lib.scene, [c], t.handle.scene));
              setTimeout(step, 0);
              return;
            }
            lib.release();
            t.ual = out;
            for (const w of t.ualWait) {
              const c2 = w.deref();
              if (c2) give(c2, out);
            }
            t.ualWait = [];
          };
          step();
        },
        (err) => console.warn('[models] không nạp được clip UAL cho NPC', err),
      );
    }, 2500);
  }

  /**
   * NPC phải đi bộ (người hộ tống): nạp clip `walk` của thư viện K-3 và gắn vào model. Clip `run` của rig này là dáng chạy nước rút
   * (cúi rạp) nên không dùng để đi; chưa nạp xong thì model đứng yên (idle), không bò.
   */
  addWalk(model: CharacterView, id: string): void {
    const s = NPC_SKINS[id];
    const t = s ? this.templates.get(s.asset) : undefined;
    const m = model as SkinnedCharacter;
    if (!t || typeof t === 'string' || !(m instanceof SkinnedCharacter)) return;
    this.cache.acquire(HUMAN_K3_LIB, { priority: 30 }).then(
      (lib) => {
        try {
          if (this.disposed) return;
          const clips = retargetClips(lib.scene, lib.animations.filter((c) => c.name === 'walk'), t.handle.scene);
          const ref = (HUMAN_CLIPS.walk.refSpeed ?? 0.978) * (3 / (HUMAN_CLIPS.run.refSpeed ?? 3.09));
          m.addClips(clips, { walk: 'walk' }, { walk: ref });
        } finally {
          lib.release();
        }
      },
      (err) => console.warn('[models] không nạp được clip đi bộ cho NPC', err),
    );
  }

  private tintedMat(id: string, base: THREE.MeshStandardNodeMaterial, tint: number): THREE.MeshStandardNodeMaterial {
    let m = this.tinted.get(id);
    if (!m) {
      m = base.clone();
      m.color.multiply(new THREE.Color(tint));
      this.tinted.set(id, m);
    }
    return m;
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.tinted.values()) m.dispose();
    this.tinted.clear();
    for (const t of this.templates.values()) {
      if (typeof t === 'string') continue;
      t.handle.release();
      t.lib.release();
      t.mat.dispose();
    }
    this.templates.clear();
  }

  private load(asset: string): void {
    if (this.templates.has(asset)) return;
    this.templates.set(asset, 'loading');
    // Thư viện clip chung thiếu thì model khối (không để T-pose đứng giữa sân).
    acquireWithHumanLib(this.cache, asset).then(
      ([handle, lib]) => {
        if (this.disposed) {
          handle.release();
          lib.release();
          return;
        }
        try {
          this.templates.set(asset, templateOf(handle, lib));
        } catch (err) {
          console.warn(`[models] không dựng được ${asset}, dùng model khối`, err);
          handle.release();
          lib.release();
          this.templates.set(asset, 'failed');
        }
      },
      (err) => {
        if (this.disposed) return;
        console.warn(`[models] không nạp được ${asset}, dùng model khối`, err);
        this.templates.set(asset, 'failed');
      },
    );
  }
}

/** Chiều cao, khung cầu (đủ cho mọi clip, như người chơi) và material của asset NPC. */
function templateOf(handle: AssetHandle, lib: AssetHandle): Template {
  const box = new THREE.Box3();
  let src: THREE.Material | null = null;
  handle.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!src) src = Array.isArray(m.material) ? m.material[0] : m.material;
    if ((o.userData.lod ?? 0) > 0) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.4, 0, -0.3), new THREE.Vector3(0.4, 1.7, 0.3));
  const height = box.max.y;
  const bounds = new THREE.Sphere(new THREE.Vector3(0, height * 0.5, 0), height * 1.15);
  const mat = rimLight(adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0]);
  const clips = mergeClips(handle.animations, retargetClips(lib.scene, lib.animations, handle.scene));
  return { handle, lib, clips, height, bounds, mat, ual: null, ualLoading: false, ualWait: [] };
}
