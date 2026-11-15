import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { Humanoid } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { acquireHumanLib, mergeClips, retargetClips } from './animLib';
import { SkinnedCharacter } from './skinned';
import type { CharState, ClipMap } from './states';
import { type CharacterView, legacyModelsRequested } from './view';

/** NPC dùng model có xương: asset và tốc độ phát riêng. */
export interface NpcSkin {
  asset: string;
  rates?: Partial<Record<CharState, number>>;
}

/** Bộ clip của rig Mixamo từ Tripo (M3-6): idle/run/attack/death từ preset, hit_light thủ tục (anim_biped_extra.py). */
const NPC_CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };

/**
 * Bảng id NPC (npcs.json) → asset. NPC không có ở đây vẫn dùng model khối. NPC chỉ đứng tại chỗ nên chỉ phát idle
 * (15,3 s, cử động chậm, phát 1×); các clip khác để dự phòng. Chiều cao lấy từ asset (Tố Tâm 1,65 m, Thiết lão
 * 1,70 m, Lạc Vân 1,75 m); chọn/tương tác vẫn theo vị trí trong dữ liệu.
 */
export const NPC_SKINS: Record<string, NpcSkin> = {
  npc_chuong_mon: { asset: 'chr_npc_chuong_mon' },
  npc_duoc_su: { asset: 'chr_npc_duoc_su' },
  npc_thiet_lao: { asset: 'chr_npc_thiet_lao' },
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
}

/**
 * Dựng model NPC: có xương nếu asset đã nạp, nếu không thì model khối. Giữ handle mẫu suốt đời đối tượng này
 * (giống `MonsterSkins`); `dispose()` trả handle và material.
 */
export class NpcSkins {
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  private disposed = false;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  preload(): void {
    if (this.legacy) return;
    for (const s of Object.values(NPC_SKINS)) this.load(s.asset);
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
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = t.mat;
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
    });
    // Lệch pha idle để các NPC không thở cùng nhịp.
    const idle = m.actionOf('idle');
    if (idle) idle.time = Math.random() * idle.getClip().duration;
    return m;
  }

  dispose(): void {
    this.disposed = true;
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
    Promise.all([this.cache.acquire(asset, { priority: 1 }), acquireHumanLib(this.cache)]).then(
      ([handle, lib]) => {
        if (this.disposed) {
          handle.release();
          lib.release();
          return;
        }
        this.templates.set(asset, templateOf(handle, lib));
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
  const mat = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0];
  const clips = mergeClips(handle.animations, retargetClips(lib.scene, lib.animations, handle.scene));
  return { handle, lib, clips, height, bounds, mat };
}
