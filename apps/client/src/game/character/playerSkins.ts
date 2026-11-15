import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { APPEARANCE, DYE } from '@dtl/content';
import { type Gender, POSE_SWORD_DRAW, POSE_SWORD_SHEATHE, POSE_SWORD_SWAP } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { buildFlySword, Humanoid } from '../models';
import { adoptGltfMaterials } from '../../render/materials/world';
import { acquireWithHumanLib, mergeClips, retargetClips } from './animLib';
import { applyDye } from './dye';
import { poseClipName } from './ikpose';
import { libraryClips, type PoseLibrary, withPoses } from './poseLib';
import { type HitOpts } from '../hitreact';
import { SkinnedCharacter, type SkinnedOpts } from './skinned';
import { type SpringDef, springDefs } from './spring';
import { partExtras, stripPartTracks, SwordSocket, type SwordSocketDef, swordSocketDef } from './sword';
import type { CharState, ClipMap } from './states';
import { type AnimState, type CharacterView, legacyModelsRequested, type PerformOpts } from './view';

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
  /** Lam Chi (chr_kiem_tu_nu): cùng bộ xương Mixamo 65 khớp và thư viện clip chung; cao 1,68 m nên bước ngắn hơn một chút. */
  chr_kiem_tu_nu: {
    clips: { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 2.9,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
};

interface Template {
  handle: AssetHandle;
  /** Thư viện clip chung (anim_human_base), retarget sang asset này lúc dựng mẫu. */
  lib: AssetHandle;
  height: number;
  bounds: THREE.Sphere;
  clips: THREE.AnimationClip[];
  clipMap: ClipMap;
  /** Động tác chiêu và clip nền bay/niệm chú (M3-4); null nếu rig không phải người Mixamo. */
  poses: PoseLibrary | null;
  /** Kiếm tách sang xương riêng (M3-2); null nếu asset chưa có. */
  sword: SwordSocketDef | null;
  /** Xương lò xo vạt áo (M3-10). */
  springs: SpringDef[];
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
    // Giới tính mặc định nạp sớm; giới tính khác nạp khi có người chơi đó xuất hiện (`create`), khỏi tải thừa ~2,5 MB.
    const id = modelOf(APPEARANCE.defaultGender);
    if (id && PLAYER_SKINS[id]) this.load(id);
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
    if (id && skin && !this.legacy) this.load(id);
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
        springs: t.springs,
        ground: 'biped',
      },
      skin.runSteps,
      t.sword,
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.templates.values()) {
      if (typeof t === 'string') continue;
      t.handle.release();
      t.lib.release();
    }
    this.templates.clear();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }

  private load(id: string): void {
    if (this.templates.has(id)) return;
    this.templates.set(id, 'loading');
    // Nhân vật + thư viện clip chung (anim_human_base): thiếu thư viện thì dùng model khối, không để T-pose đứng giữa sân.
    acquireWithHumanLib(this.cache, id).then(
      ([handle, lib]) => {
        if (this.disposed) {
          handle.release();
          lib.release();
          return;
        }
        try {
          this.templates.set(id, templateOf(handle, lib, PLAYER_SKINS[id]));
        } catch (err) {
          console.warn(`[models] không dựng được ${id}, dùng model khối`, err);
          handle.release();
          lib.release();
          this.templates.set(id, 'failed');
        }
      },
      (err) => {
        if (this.disposed) return;
        console.warn(`[models] không nạp được ${id} hoặc thư viện clip, dùng model khối`, err);
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
function templateOf(handle: AssetHandle, lib: AssetHandle, skin: PlayerSkin): Template {
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
  // Xương phụ của pipeline (kiếm, lò xo) do client điều khiển: bỏ kênh lấy mẫu ở tư thế nghỉ của exporter.
  // Clip riêng của asset (nếu còn) thắng clip chung cùng tên; clip chung retarget theo tên xương và tỉ lệ độ dài xương.
  const own = mergeClips(handle.animations.map(stripPartTracks), retargetClips(lib.scene, lib.animations, handle.scene));
  const clips = poses ? [...own, ...libraryClips(poses)] : own;
  const clipMap: ClipMap = { ...extra.clipMap };
  if (poses) {
    for (const [state, pid] of Object.entries(skin.poses) as [CharState, string][]) {
      if (!clipMap[state] && poses.has(pid)) clipMap[state] = poseClipName(pid);
    }
  } else {
    console.warn('[models] asset người chơi thiếu xương Mixamo, không có động tác chiêu/tư thế tạm');
  }
  const parts = partExtras(handle.scene);
  const sword = parts.sword ? swordSocketDef(handle.scene, parts.sword) : null;
  if (parts.sword && !sword) console.warn('[models] asset người chơi có extras kiếm nhưng thiếu xương, kiếm giữ trên lưng');
  const springs = parts.springs ? springDefs(handle.scene, parts.springs) : [];
  return { handle, lib, height, bounds, clips, clipMap, poses, sword, springs };
}

/** Rảnh bao lâu (giây: không ra chiêu, không trúng đòn, không niệm chú) thì tra kiếm (M3-2). */
export const SHEATHE_AFTER = 5;

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
  /** Kiếm trên lưng / trong tay (null nếu asset chưa tách kiếm: kiếm dính lưng như cũ). */
  private sword: SwordSocket | null;
  /** Giây kể từ lần giao chiến cuối (ra chiêu, trúng đòn, niệm chú). */
  private calm = Infinity;
  /** Động tác rút/tra đang phát: đổi chỗ kiếm khi tới `at` (giây trong clip) hoặc khi động tác bị thay/hủy. */
  private swap: { id: string; at: number; drawn: boolean } | null = null;

  constructor(
    o: SkinnedOpts,
    private runSteps: number,
    sword: SwordSocketDef | null = null,
  ) {
    super(o);
    const fly = buildFlySword();
    this.flySword = fly.group;
    this.flyAura = fly.aura;
    this.root.add(this.flySword);
    this.sword = sword ? SwordSocket.create(this.rig, sword, () => this.rigChanged()) : null;
  }

  /** Kiếm đang ở tay (đã rút xong). */
  get swordDrawn(): boolean {
    return this.sword?.drawn ?? false;
  }

  /** Ra chiêu: kiếm vào tay nếu động tác thật sự phát (bay, trên không, chết thì server không cho ra chiêu). */
  perform(id: string, o?: PerformOpts): boolean {
    const ok = super.perform(id, o);
    if (this.performing(id)) this.engage(true);
    return ok;
  }

  hitReact(o: HitOpts): void {
    super.hitReact(o);
    this.engage(false);
  }

  /** LOD xa: bỏ hào quang phi kiếm (một draw call trong suốt), giữ thân kiếm. */
  protected onLod(level: number): void {
    const aura = this.flySword?.children[1];
    if (aura) aura.visible = level < 2;
  }

  /** Đòn không có động tác riêng (clip `attack` của asset); động tác chiêu tự đếm trong `perform`. */
  attack(): void {
    this.engage(true);
    super.attack();
    this.attacks++;
  }

  /**
   * Vào giao chiến: ra chiêu thì kiếm vào tay ngay (động tác chiêu bắt đầu ngay khi bấm phím, M3-4, nên không chen
   * động tác rút); trúng đòn thì rút bằng động tác ngắn của tay phải (`rut_kiem`), không phát được thì cầm ngay.
   */
  private engage(skill: boolean): void {
    this.calm = 0;
    const s = this.sword;
    if (!s) return;
    if (this.swap?.drawn) {
      if (skill) {
        this.swap = null;
        s.set(true);
      }
      return;
    }
    this.swap = null;
    if (s.drawn) return;
    if (!skill && this.gesture(POSE_SWORD_DRAW)) this.swap = { id: POSE_SWORD_DRAW, at: POSE_SWORD_SWAP[POSE_SWORD_DRAW], drawn: true };
    else s.set(true);
  }

  /** Đổi chỗ kiếm theo động tác đang phát; rảnh đủ lâu thì tra kiếm (ngự kiếm, thiền: tra ngay, không động tác). */
  private updateSword(dt: number, a: AnimState): void {
    const s = this.sword;
    if (!s) return;
    if (this.swap) {
      const t = this.performTime(this.swap.id);
      if (t === null || t >= this.swap.at) {
        s.set(this.swap.drawn);
        this.swap = null;
      }
    }
    if (a.dead) return;
    this.calm = a.casting ? 0 : this.calm + dt;
    if (!s.drawn || this.swap) return;
    if (a.flying || a.meditating) {
      s.set(false);
      return;
    }
    if (this.calm < SHEATHE_AFTER || a.airborne) return;
    if (this.gesture(POSE_SWORD_SHEATHE)) this.swap = { id: POSE_SWORD_SHEATHE, at: POSE_SWORD_SWAP[POSE_SWORD_SHEATHE], drawn: false };
    else if (!this.performing(POSE_SWORD_SHEATHE)) s.set(false);
  }

  update(dt: number, a: AnimState): void {
    super.update(dt, a);
    this.updateSword(dt, a);
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
