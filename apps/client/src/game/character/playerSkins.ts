import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { POSE_CAST, POSE_FLY } from '@dtl/shared';
import { POSES } from '@dtl/content';
import { type AssetCache, assets } from '../assets';
import { G } from '../geo';
import { GLOW_MAT, MODEL_MAT, SWORD_GEO } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { type Template, templateOf } from './monsterSkins';
import { poseClipName } from './ikpose';
import { bakePoseLibrary, type PoseLibrary } from './poseLib';
import { SkinnedCharacter, type SkinnedOpts } from './skinned';
import type { ClipMap } from './states';
import type { AnimState, CharacterView } from './view';

/** Model người chơi có xương (Thanh Phong, rig Mixamo). */
export const PLAYER_ASSET = 'chr_kiem_tu_nam';
/**
 * Clip trong GLB + clip nướng từ pose: bay đứng trên kiếm, niệm chú. `attack` 1,2s của Tripo chỉ còn là dự phòng,
 * ra chiêu dùng động tác riêng của chiêu (`SkillDef.pose`).
 */
export const PLAYER_CLIPS: ClipMap = {
  idle: 'idle',
  run: 'run',
  attack: 'attack',
  hit: 'hit_light',
  death: 'death',
  fly: poseClipName(POSE_FLY),
  cast: poseClipName(POSE_CAST),
};
/** Tốc độ (m/s) mà clip chạy của Tripo phát 1× không trượt chân. */
const PLAYER_REF_SPEED = 4.6;

/**
 * `?models=skinned`: người chơi dùng model có xương. Mặc định vẫn là model khối cho tới khi có phối màu áo (M3-5),
 * để 8 màu áo phân biệt người chơi không mất.
 */
export function skinnedPlayersRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('models') === 'skinned';
}

/** Người chơi có xương: thêm phi kiếm dưới chân khi ngự kiếm (giống model khối). */
export class SkinnedPlayer extends SkinnedCharacter {
  private flySword = new THREE.Group();
  private auraMat = GLOW_MAT(0x8fe4ff, 0.42);

  constructor(o: SkinnedOpts) {
    super(o);
    const fs = new THREE.Mesh(SWORD_GEO, MODEL_MAT);
    fs.rotation.x = Math.PI / 2;
    fs.position.set(0, 0, -1.0);
    fs.scale.setScalar(2.0);
    const aura = new THREE.Mesh(G.octa, this.auraMat);
    aura.scale.set(0.34, 0.07, 1.7);
    this.flySword.add(fs, aura);
    this.flySword.position.y = -0.1;
    this.flySword.visible = false;
    this.root.add(this.flySword);
  }

  update(dt: number, a: AnimState): void {
    this.flySword.visible = a.flying && !a.dead;
    super.update(dt, a);
  }

  dispose(): void {
    this.auraMat.dispose();
    super.dispose();
  }
}

interface PlayerTemplate extends Template {
  poses: PoseLibrary | null;
}

/**
 * Nạp model người chơi và nướng thư viện pose một lần (clip theo tên xương, dùng chung cho mọi bản sao).
 * Chưa nạp xong hoặc lỗi thì `create` trả null (dùng model khối).
 */
export class PlayerSkins {
  private template: PlayerTemplate | 'loading' | 'failed' | null = null;
  /** Material glTF gốc → material node dùng chung cho mọi bản sao (texture vẫn của bản gốc). */
  private mats: Map<THREE.Material, THREE.Material> | null = null;
  private disposed = false;

  constructor(
    private cache: AssetCache = assets,
    readonly enabled = skinnedPlayersRequested(),
  ) {}

  preload(): void {
    if (!this.enabled || this.template) return;
    this.template = 'loading';
    this.cache.acquire(PLAYER_ASSET, { priority: 0 }).then(
      (handle) => {
        if (this.disposed) {
          handle.release();
          return;
        }
        const t = templateOf(handle);
        const t0 = performance.now();
        const poses = bakePoseLibrary(handle.scene, POSES);
        console.info(`[models] ${PLAYER_ASSET}: nướng ${poses?.size ?? 0} pose trong ${(performance.now() - t0).toFixed(1)}ms`);
        this.template = { ...t, poses };
      },
      (err) => {
        if (this.disposed) return;
        console.warn(`[models] không nạp được ${PLAYER_ASSET}, dùng model khối`, err);
        this.template = 'failed';
      },
    );
  }

  /** Đang nạp: người chơi tạm dùng model khối, nạp xong thì đổi. */
  get pending(): boolean {
    return this.template === 'loading';
  }

  create(): CharacterView | null {
    const t = this.template;
    if (!t || typeof t === 'string') return null;
    const scene = cloneSkinned(t.handle.scene);
    const mats = this.materials(t);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) m.material = mats.get(m.material) ?? m.material;
    });
    return new SkinnedPlayer({
      scene,
      clips: t.handle.animations,
      clipMap: PLAYER_CLIPS,
      height: t.height,
      refSpeed: PLAYER_REF_SPEED,
      bounds: t.bounds,
      poses: t.poses ?? undefined,
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.template && typeof this.template !== 'string') this.template.handle.release();
    this.template = null;
    for (const m of this.mats?.values() ?? []) m.dispose();
    this.mats = null;
  }

  private materials(t: PlayerTemplate): Map<THREE.Material, THREE.Material> {
    if (this.mats) return this.mats;
    const srcs = new Set<THREE.Material>();
    t.handle.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) srcs.add(m.material);
    });
    const list = [...srcs];
    const holder = new THREE.Group();
    for (const src of list) holder.add(new THREE.Mesh(undefined, src));
    adoptGltfMaterials(holder);
    this.mats = new Map(list.map((src, i) => [src, (holder.children[i] as THREE.Mesh).material as THREE.Material]));
    return this.mats;
  }
}
