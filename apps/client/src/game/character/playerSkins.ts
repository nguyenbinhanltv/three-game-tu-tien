import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { APPEARANCE, DYE } from '@dtl/content';
import type { Gender } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { buildFlySword, Humanoid } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { applyDye } from './dye';
import { poseClipName } from './ikpose';
import { libraryClips, type PoseLibrary, withPoses } from './poseLib';
import { SkinnedCharacter, type SkinnedOpts } from './skinned';
import type { CharState, ClipMap } from './states';
import { type AnimState, type CharacterView, legacyModelsRequested } from './view';

/** Ngoại hình hiển thị của một người chơi (từ schema server: `g`, `dye`). */
export interface PlayerLook {
  g: string;
  dye: string;
}

/** Cấu hình model người chơi có xương theo asset. */
export interface PlayerSkin {
  clips: ClipMap;
  /**
   * Trạng thái chưa có clip thật → pose IK (packages/content/data/poses). Bay và niệm chú đã có sẵn từ M3-4
   * (`withPoses`: `ngu_kiem`, `niem_chu`); ở đây thêm thiền (`tam_thien`, tạm) và nhảy (mượn tư thế ngự kiếm).
   */
  poses: Partial<Record<CharState, string>>;
  /** Tốc độ (m/s, scale 1) mà clip chạy phát 1× thì chân không trượt (đo bằng chân trụ). */
  refSpeed: number;
  /** Số lần chân chạm đất trong một vòng clip chạy (cho bụi chân, render/vfx/trail.ts). */
  runSteps: number;
  maxLocoScale: number;
  rates: Partial<Record<CharState, number>>;
  /** Màu vải trong texture sau bước recolor của pipeline (meta.json `import.recolor[0].to`). */
  clothRef: string;
}

/**
 * Thanh Phong (chr_kiem_tu_nam, PR #36): rig Mixamo, 5 clip idle/run/attack/hit_light/death.
 *
 * - `run` chứa 2 chu kỳ bước (4 lần chạm đất) trong 1,23 s; chân trụ lùi ≈ 3,0 m/s ở 1× (đo bằng cách lấy mẫu xương
 *   chân 240 khung). Tốc độ chạy trong game 7 m/s → đúng tỉ lệ là 2,3×, trông giật; giới hạn 1,8× (chân trượt ~20%).
 * - `idle` dài 15,3 s, cử động chậm: phát 1,3×.
 * - `attack` dài 1,2 s, dài hơn GCD 1 s: phát 1,25× (0,96 s).
 * - Ra chiêu dùng động tác pose của M3-4 (`perform`); clip `attack` của asset chỉ còn cho đòn không có động tác riêng.
 * - Chưa có clip bay/niệm chú/thiền/nhảy: bay `ngu_kiem` và niệm chú `niem_chu` (M3-4), thiền `tam_thien` (tạm),
 *   nhảy mượn `ngu_kiem`.
 */
export const PLAYER_SKINS: Record<string, PlayerSkin> = {
  chr_kiem_tu_nam: {
    clips: { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 3.0,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
};

interface Template {
  handle: AssetHandle;
  height: number;
  bounds: THREE.Sphere;
  clips: THREE.AnimationClip[];
  clipMap: ClipMap;
  /** Động tác chiêu và clip nền bay/niệm chú (M3-4); null nếu rig không phải người Mixamo. */
  poses: PoseLibrary | null;
}

/** Model asset của giới tính; giới tính lạ hoặc chưa có model thì dùng model của giới tính mặc định. */
function modelOf(g: string): string | null {
  const own = APPEARANCE.genders.find((x) => x.id === (g as Gender))?.model;
  return own ?? APPEARANCE.genders.find((x) => x.id === APPEARANCE.defaultGender)?.model ?? null;
}

function dyeOf(id: string) {
  return DYE.get(id) ?? DYE.get(APPEARANCE.defaultDye)!;
}

/**
 * Dựng model người chơi: model có xương theo giới tính nếu asset đã nạp, nếu không (đang nạp, lỗi, `?models=legacy`)
 * thì model khối `Humanoid` cùng màu áo. Giữ handle mẫu suốt đời đối tượng này (giống `MonsterSkins`).
 */
export class PlayerSkins {
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  /** Material theo asset + màu áo (dùng chung giữa mọi người chơi cùng màu). */
  private mats = new Map<string, THREE.MeshStandardNodeMaterial>();
  private disposed = false;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  preload(): void {
    if (this.legacy) return;
    for (const g of APPEARANCE.genders) if (g.model && PLAYER_SKINS[g.model]) this.load(g.model);
  }

  /** Người chơi này sẽ có model mới nhưng asset đang nạp (tạm model khối, nạp xong thì đổi). */
  pending(look: PlayerLook): boolean {
    const id = modelOf(look.g);
    return !this.legacy && !!id && this.templates.get(id) === 'loading';
  }

  create(look: PlayerLook): CharacterView {
    const dye = dyeOf(look.dye);
    const id = modelOf(look.g);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    const t = id && skin && !this.legacy ? this.templates.get(id) : undefined;
    if (!id || !skin || !t || typeof t === 'string') return new Humanoid({ robe: dye.hex, trim: dye.trim, sword: true });
    const scene = cloneSkinned(t.handle.scene);
    const mat = this.material(id, skin, t, dye.id, dye.hex);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    return new SkinnedPlayer(
      {
        scene,
        clips: t.clips,
        clipMap: t.clipMap,
        height: t.height,
        refSpeed: skin.refSpeed,
        bounds: t.bounds,
        rates: skin.rates,
        poses: t.poses ?? undefined,
        maxLocoScale: skin.maxLocoScale,
        sink: false,
      },
      skin.runSteps,
    );
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
        try {
          this.templates.set(id, templateOf(handle, PLAYER_SKINS[id]));
        } catch (err) {
          console.warn(`[models] không dựng được ${id}, dùng model khối`, err);
          handle.release();
          this.templates.set(id, 'failed');
        }
      },
      (err) => {
        if (this.disposed) return;
        console.warn(`[models] không nạp được ${id}, dùng model khối`, err);
        this.templates.set(id, 'failed');
      },
    );
  }

  private material(id: string, skin: PlayerSkin, t: Template, dyeId: string, hex: string): THREE.MeshStandardNodeMaterial {
    const key = `${id}/${dyeId}`;
    let m = this.mats.get(key);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    m = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined), (x) => applyDye(x, skin.clothRef, hex))[0];
    this.mats.set(key, m);
    return m;
  }
}

/** Chiều cao, khung cầu, clip (gồm tư thế tạm đã nướng) của asset người chơi. */
function templateOf(handle: AssetHandle, skin: PlayerSkin): Template {
  const box = new THREE.Box3();
  handle.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o.userData.lod ?? 0) > 0) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.4, 0, -0.3), new THREE.Vector3(0.4, 1.75, 0.3));
  const height = box.max.y;
  // Đủ rộng cho mọi tư thế: chết nằm dài ~1 thân người về một phía, chém giơ tay qua đầu.
  const bounds = new THREE.Sphere(new THREE.Vector3(0, height * 0.5, 0), height * 1.15);

  // Nướng mọi pose một lần trên bản gốc (rig trả về tư thế nghỉ sau khi nướng); clip theo tên xương nên dùng chung.
  const extra = withPoses(handle.scene, { ...skin.clips });
  const poses = extra.poses ?? null;
  const clips = poses ? [...handle.animations, ...libraryClips(poses)] : [...handle.animations];
  const clipMap: ClipMap = { ...extra.clipMap };
  if (poses) {
    for (const [state, pid] of Object.entries(skin.poses) as [CharState, string][]) {
      if (!clipMap[state] && poses.has(pid)) clipMap[state] = poseClipName(pid);
    }
  } else {
    console.warn('[models] asset người chơi thiếu xương Mixamo, không có động tác chiêu/tư thế tạm');
  }
  return { handle, height, bounds, clips, clipMap, poses };
}

/**
 * Người chơi dùng model có xương: thêm phi kiếm dưới chân khi ngự kiếm và các bộ đếm cho vệt/hạt theo nhân vật
 * (`steps`, `attacks`, `grounded`, `hasSword`) như model khối.
 */
export class SkinnedPlayer extends SkinnedCharacter {
  readonly hasSword = true;
  steps = 0;
  grounded = true;
  private flySword: THREE.Group;
  private flyAura: THREE.Material;
  private stepPhase = -1;

  constructor(
    o: SkinnedOpts,
    private runSteps: number,
  ) {
    super(o);
    const fly = buildFlySword();
    this.flySword = fly.group;
    this.flyAura = fly.aura;
    this.root.add(this.flySword);
  }

  /** LOD xa: bỏ hào quang phi kiếm (một draw call trong suốt), giữ thân kiếm. */
  protected onLod(level: number): void {
    const aura = this.flySword?.children[1];
    if (aura) aura.visible = level < 2;
  }

  /** Đòn không có động tác riêng (clip `attack` của asset); động tác chiêu tự đếm trong `perform`. */
  attack(): void {
    super.attack();
    this.attacks++;
  }

  update(dt: number, a: AnimState): void {
    super.update(dt, a);
    this.grounded = !a.flying && !a.airborne;
    this.flySword.visible = a.flying && !a.dead;
    // Bước chân theo pha clip chạy: mỗi `1 / runSteps` vòng là một lần chân chạm đất.
    const run = this.state === 'run' ? this.actionOf('run') : null;
    if (run) {
      const phase = Math.floor((run.time / run.getClip().duration) * this.runSteps) % this.runSteps;
      if (this.stepPhase >= 0 && phase !== this.stepPhase) this.steps++;
      this.stepPhase = phase;
    } else {
      this.stepPhase = -1;
    }
  }

  dispose(): void {
    super.dispose();
    this.flyAura.dispose();
  }
}
