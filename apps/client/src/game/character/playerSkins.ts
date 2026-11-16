import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { APPEARANCE, DYE, SET, SETS, SWORD_MODEL_DEFAULT } from '@dtl/content';
import { type Gender, type MonsterDef, parseAccessoryCode, POSE_SWORD_DRAW, POSE_SWORD_SHEATHE, POSE_SWORD_SWAP } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../assets';
import { buildFlySword, Humanoid } from '../models';
import { adoptGltfMaterials, createWorldMaterial, rimLight } from '../../render/materials/world';
import { type BodyFit, FIT_BONES, type FitBone, fitBody } from './bodyFit';
import { type AttachedRibbons, attachAccessories, type AccessoryMaterials, type BuiltAccessories, buildAccessories, disposeAccessories } from './setAccessories';
import { boneKey } from './ikpose';
import { acquireWithHumanLib, HUMAN_K3_LIB, mergeClips, retargetClips } from './animLib';
import { HUMAN_CLIPS } from './humanClips';
import { applyDye } from './dye';
import { applyPalette } from './monsterSkins';
import { poseClipName } from './ikpose';
import { libraryClips, type PoseLibrary, withPoses } from './poseLib';
import { type HitOpts } from '../hitreact';
import { SkinnedCharacter, type SkinnedOpts } from './skinned';
import { type SpringDef, springDefs } from './spring';
import { SwordGlow } from '../swordGlow';
import { partExtras, stripPartTracks, SwordSocket, type SwordSocketDef, swordSocketDef } from './sword';
import { type BladeMount, bladeLocal, cutOldSword, glowDims, type OldSwordSpan, SWORD_METALNESS, SWORD_ROUGHNESS, SWORD_TINT, type SwordTemplate, swordTemplateOf } from './swordModel';
import type { CharState, ClipMap } from './states';
import { type AnimState, type CharacterView, legacyModelsRequested, legacySwordsRequested, type MonsterView, type PerformOpts } from './view';

/** Ngoại hình hiển thị của một người chơi (từ schema server: `g`, `dye`). */
export interface PlayerLook {
  g: string;
  dye: string;
  /** Bộ trang bị đang quyết định màu áo/ánh kiếm (id trong sets.json; undefined = màu đã chọn). */
  set?: string;
  /** Asset model kiếm đang cầm (prop_kiem_*, `swordModelOf`); thiếu = kiếm mặc định. */
  w?: string;
  /** Mã phụ kiện hình dáng của đồ bộ (`accessoryCode`): hiện theo từng món đã mặc, không cần đủ 2 món. */
  acc?: string;
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
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 3.0,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
  /** Lam Chi (chr_kiem_tu_nu): cùng bộ xương Mixamo 65 khớp và thư viện clip chung; cao 1,68 m nên bước ngắn hơn một chút. */
  chr_kiem_tu_nu: {
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
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
  /** Đoạn kiếm cũ đã cắt khỏi lưới (kiếm riêng theo trang bị thay vào); null = kiếm cũ còn nguyên, không thay. */
  oldSword: OldSwordSpan | null;
  /** Clip K-3 (đi lùi/ngang, thủ thế, trúng đòn có hướng, ngã/đứng dậy) đã retarget sang asset này; null = chưa nạp xong hoặc lỗi. */
  k3: K3Extra | null;
  /** Bản sao đã dựng chờ clip K-3 (nạp lười sau khung đầu). */
  waiting: WeakRef<SkinnedPlayer>[];
  /** Số đo thân để đặt phụ kiện đồ bộ: đo lười lần đầu có người mặc đồ bộ; null = rig không đo được. */
  fit?: BodyFit | null;
}

/** Phần thêm vào model người khi thư viện K-3 nạp xong: clip, bảng trạng thái → clip, tốc độ nền clip đi lại (m/s, scale 1). */
interface K3Extra {
  clips: THREE.AnimationClip[];
  map: ClipMap;
  locoRef: Partial<Record<CharState, number>>;
}

/** Trạng thái nền → clip K-3. Đứng thủ thế khi giao chiến, đi bộ chậm, đi lùi/ngang khi nhìn mục tiêu. */
const K3_STATES: Partial<Record<CharState, string>> = { walk: 'walk', back: 'back', strafeL: 'strafe_l', strafeR: 'strafe_r', combatIdle: 'combat_idle' };
/** Chờ bao lâu sau khi dựng mẫu rồi mới nạp K-3 (ms): không chen vào đường tải trước khung game đầu. */
const K3_DELAY = 1500;

/** Model asset của giới tính; giới tính lạ hoặc chưa có model thì dùng model của giới tính mặc định. */
function modelOf(g: string): string | null {
  const own = APPEARANCE.genders.find((x) => x.id === (g as Gender))?.model;
  return own ?? APPEARANCE.genders.find((x) => x.id === APPEARANCE.defaultGender)?.model ?? null;
}

function dyeOf(id: string, set?: string) {
  const look = set ? SET.get(set)?.look : undefined;
  // Bộ trang bị nhuộm áo bằng chính cơ chế `applyDye` (tham số material), id riêng để không đụng cache màu thường.
  if (look) return { id: `set:${set}`, hex: look.hex, trim: look.trim, accent: look.trim };
  return DYE.get(id) ?? DYE.get(APPEARANCE.defaultDye)!;
}

/**
 * Dựng model người chơi: model có xương theo giới tính nếu asset đã nạp, nếu không (đang nạp, lỗi, `?models=legacy`)
 * thì model khối `Humanoid` cùng màu áo. Giữ handle mẫu suốt đời đối tượng này (giống `MonsterSkins`).
 */
const _bpM = new THREE.Matrix4();
export class PlayerSkins {
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  /** Model kiếm theo asset (prop_kiem_*), nạp lười; kiếm mặc định nạp cùng nhân vật. */
  private swords = new Map<string, SwordTemplate | 'loading' | 'failed'>();
  private swordLoads = new Map<string, Promise<SwordTemplate | null>>();
  /** Material theo asset + màu áo (dùng chung giữa mọi người chơi cùng màu). */
  private mats = new Map<string, THREE.MeshStandardNodeMaterial>();
  private disposed = false;
  /** Hình học phụ kiện đã dựng theo asset + mã phụ kiện (dùng chung giữa người chơi cùng đồ). */
  private accBuilt = new Map<string, BuiltAccessories | null>();
  private accMats: AccessoryMaterials | null = null;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
    private legacySwords = legacySwordsRequested(),
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
    if (this.legacy || !id) return false;
    // Kiếm riêng còn nạp: tạm cầm kiếm mặc định, nạp xong thì entities dựng lại (cùng cơ chế với asset nhân vật).
    return this.templates.get(id) === 'loading' || this.swords.get(look.w ?? SWORD_MODEL_DEFAULT) === 'loading';
  }

  create(look: PlayerLook): CharacterView {
    const dye = dyeOf(look.dye, look.set);
    const id = modelOf(look.g);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (id && skin && !this.legacy) this.load(id);
    const t = id && skin && !this.legacy ? this.templates.get(id) : undefined;
    if (!id || !skin || !t || typeof t === 'string') return new Humanoid({ robe: dye.hex, trim: dye.trim, sword: true });
    if (t.oldSword && look.w) this.loadSword(look.w);
    return this.build(id, skin, t, this.material(id, skin, t, dye.id, dye.hex, 'accent' in dye ? dye.accent : undefined), look.acc, look.w);
  }

  /** Asset người của `look` chưa nạp xong (bóng tâm ma tạm dùng model khối của quái). */
  shadowPending(look: PlayerLook): boolean {
    return this.pending(look);
  }

  /**
   * Bóng tâm ma (P3-7): bản sao model người chơi (cùng giới), nhuộm đen-tím mờ, viền khói tím ở mép.
   * Trả null nếu asset chưa nạp hoặc đang `?models=legacy` (bên gọi dùng model quái dự phòng).
   */
  createShadow(look: PlayerLook, def: MonsterDef): MonsterView | null {
    const id = modelOf(look.g);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (!id || !skin || this.legacy) return null;
    this.load(id);
    const t = this.templates.get(id);
    if (!t || typeof t === 'string') return null;
    const view = this.build(id, skin, t, this.shadowMaterial(id, t), undefined, undefined, true);
    return Object.assign(view, { def }) as unknown as MonsterView;
  }

  /** Kiếm của một bản sao: model của `want` nếu đã nạp, không thì kiếm mặc định; null nếu mẫu không thay được kiếm. */
  private bladeFor(t: Template, want: string | undefined, shadowMat?: THREE.Material): BladeMount | null {
    if (!t.oldSword) return null;
    const pick = (id: string) => {
      const s = this.swords.get(id);
      return typeof s === 'object' ? s : null;
    };
    const tpl = pick(want ?? SWORD_MODEL_DEFAULT) ?? pick(SWORD_MODEL_DEFAULT);
    if (!tpl) return null;
    const mesh = tpl.mesh.clone();
    // Bóng tâm ma dùng chung material mờ của bóng; thân kiếm thật dùng chung material của model (không dispose theo bản sao).
    if (shadowMat) mesh.material = shadowMat;
    return { mesh, info: tpl.info, old: t.oldSword };
  }

  /** Phụ kiện đồ bộ hiển thị theo `acc` (lỗi dựng thì bỏ qua, nhân vật vẫn đẹp bằng áo nhuộm). */
  private accessories(id: string, t: Template, scene: THREE.Object3D, acc: string | undefined): AttachedRibbons | null {
    if (!acc) return null;
    try {
      if (t.fit === undefined) t.fit = fitBody(t.handle.scene, t.clips.find((c) => c.name === 'idle'), t.height);
      const fit = t.fit;
      if (!fit) return null;
      const key = `${id}|${acc}`;
      let built = this.accBuilt.get(key);
      if (built === undefined) {
        built = buildAccessories(fit, parseAccessoryCode(SETS, acc));
        this.accBuilt.set(key, built);
      }
      if (!built || (!built.parts.length && !built.ribbons.length)) return null;
      this.accMats ??= {
        cloth: createWorldMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
        hard: createWorldMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.6, side: THREE.DoubleSide }),
      };
      return attachAccessories(scene, fit, built, this.accMats).ribbons;
    } catch (err) {
      console.warn('[models] không dựng được phụ kiện đồ bộ', err);
      return null;
    }
  }

  private build(id: string, skin: PlayerSkin, t: Template, mat: THREE.MeshStandardNodeMaterial, acc?: string, want?: string, shadow = false): SkinnedPlayer {
    const scene = cloneSkinned(t.handle.scene);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    // Phụ kiện thêm sau khi đã gán material thân (mesh phụ kiện có material riêng).
    const ribbons = this.accessories(id, t, scene, acc);
    const player = new SkinnedPlayer(
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
      ribbons,
      this.bladeFor(t, want, shadow ? mat : undefined),
    );
    if (t.k3) player.addClips(t.k3.clips, t.k3.map, t.k3.locoRef);
    else t.waiting.push(new WeakRef(player));
    return player;
  }

  /**
   * Nạp lười thư viện K-3 cho một asset rồi retarget từng clip (mỗi clip một lượt `setTimeout` để không khựng khung), xong thì
   * đưa vào mọi bản sao đã dựng và các bản sau. Lỗi thì giữ máy trạng thái cũ (chạy/idle/hit_light), không ném.
   */
  private loadK3(id: string, skin: PlayerSkin): void {
    const t = this.templates.get(id);
    if (!t || typeof t === 'string' || t.k3 || this.disposed) return;
    this.cache.acquire(HUMAN_K3_LIB, { priority: 40 }).then(
      (lib) => {
        if (this.disposed) {
          lib.release();
          return;
        }
        const tpl = this.templates.get(id);
        if (!tpl || typeof tpl === 'string') {
          lib.release();
          return;
        }
        const out: THREE.AnimationClip[] = [];
        const have = new Set(tpl.clips.map((c) => c.name));
        const todo = lib.animations.filter((c) => !have.has(c.name));
        const step = () => {
          if (this.disposed) {
            lib.release();
            return;
          }
          const c = todo.shift();
          if (c) {
            out.push(...retargetClips(lib.scene, [c], tpl.handle.scene));
            setTimeout(step, 0);
            return;
          }
          lib.release();
          // Tốc độ nền của clip K-3 đo trên Thanh Phong; nhân vật khác theo tỉ lệ tốc độ chạy.
          const f = skin.refSpeed / (HUMAN_CLIPS.run.refSpeed ?? 3.09);
          const map: ClipMap = {};
          const locoRef: Partial<Record<CharState, number>> = {};
          for (const [state, clip] of Object.entries(K3_STATES) as [CharState, string][]) {
            if (!out.some((x) => x.name === clip)) continue;
            map[state] = clip;
            const ref = HUMAN_CLIPS[clip]?.refSpeed;
            if (ref) locoRef[state] = ref * f;
          }
          tpl.k3 = { clips: out, map, locoRef };
          for (const w of tpl.waiting) w.deref()?.addClips(out, map, locoRef);
          tpl.waiting = [];
        };
        step();
      },
      (err) => console.warn('[models] không nạp được thư viện clip K-3, giữ bộ clip cũ', err),
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
    for (const s of this.swords.values()) if (typeof s === 'object') s.release();
    this.swords.clear();
    this.swordLoads.clear();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    for (const b of this.accBuilt.values()) disposeAccessories(b);
    this.accBuilt.clear();
    this.accMats?.cloth.dispose();
    this.accMats?.hard.dispose();
    this.accMats = null;
  }

  private load(id: string): void {
    if (this.templates.has(id)) return;
    this.templates.set(id, 'loading');
    // Nhân vật + thư viện clip chung (anim_human_base): thiếu thư viện thì dùng model khối, không để T-pose đứng giữa sân.
    // Cùng lúc nạp kiếm mặc định: có nó rồi mới cắt kiếm cũ khỏi lưới (lỗi nạp kiếm thì giữ kiếm cũ).
    Promise.all([acquireWithHumanLib(this.cache, id), this.legacySwords ? Promise.resolve(null) : this.loadSword(SWORD_MODEL_DEFAULT)]).then(
      ([[handle, lib], sword]) => {
        if (this.disposed) {
          handle.release();
          lib.release();
          return;
        }
        try {
          this.templates.set(id, templateOf(handle, lib, PLAYER_SKINS[id], !!sword));
          setTimeout(() => this.loadK3(id, PLAYER_SKINS[id]), K3_DELAY);
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

  /** Nạp model kiếm (một lần mỗi asset). Lỗi chỉ cảnh báo và trả null: nhân vật dùng kiếm mặc định hoặc kiếm cũ. */
  private loadSword(id: string): Promise<SwordTemplate | null> {
    let p = this.swordLoads.get(id);
    if (p) return p;
    this.swords.set(id, 'loading');
    p = this.cache.acquire(id, { priority: 20 }).then(
      (h) => {
        if (this.disposed) {
          h.release();
          return null;
        }
        const tpl = swordTemplateOf(h.scene, partExtras(h.scene), () => h.release());
        if (!tpl) {
          console.warn(`[models] ${id} thiếu số đo kiếm (extras dtl.blade), bỏ qua`);
          h.release();
          this.swords.set(id, 'failed');
          return null;
        }
        for (const m of adoptGltfMaterials(h.scene)) {
          m.metalness = SWORD_METALNESS;
          m.roughness = SWORD_ROUGHNESS;
          const tint = SWORD_TINT[id];
          if (tint) m.color.setRGB(tint[0], tint[1], tint[2]);
        }
        // Dev: chỉnh vật liệu kiếm lúc chạy (tools/perf/src/shots-kiem.ts --tune).
        if (import.meta.env.DEV && typeof window !== 'undefined') ((window as unknown as { __swordMats?: Record<string, THREE.Material> }).__swordMats ??= {})[id] = tpl.mesh.material as THREE.Material;
        this.swords.set(id, tpl);
        return tpl;
      },
      (err) => {
        console.warn(`[models] không nạp được ${id}`, err);
        this.swords.set(id, 'failed');
        return null;
      },
    );
    this.swordLoads.set(id, p);
    return p;
  }

  private shadowMaterial(id: string, t: Template): THREE.MeshStandardNodeMaterial {
    const key = `${id}/shadow`;
    let m = this.mats.get(key);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    m = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0];
    applyPalette(m, { dark: '#0d0916', light: '#4a3566', glow: '#b04bff' });
    m.transparent = true;
    m.opacity = 0.78;
    m.depthWrite = false;
    this.mats.set(key, m);
    return m;
  }

  private material(id: string, skin: PlayerSkin, t: Template, dyeId: string, hex: string, accent?: string): THREE.MeshStandardNodeMaterial {
    const key = `${id}/${dyeId}`;
    let m = this.mats.get(key);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    m = rimLight(adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined), (x) => applyDye(x, skin.clothRef, hex, accent))[0]);
    this.mats.set(key, m);
    return m;
  }
}

/** Chiều cao, khung cầu, clip (gồm tư thế tạm đã nướng) của asset người chơi. */
function templateOf(handle: AssetHandle, lib: AssetHandle, skin: PlayerSkin, swordReady: boolean): Template {
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
  // Kiếm riêng theo trang bị: cắt kiếm cũ khỏi lưới khi đã có kiếm mới để thay (nếu không cắt được thì giữ kiếm cũ).
  const oldSword = sword && parts.sword && swordReady ? cutOldSword(handle.scene, parts.sword) : null;
  return { handle, lib, height, bounds, clips, clipMap, poses, sword, springs, oldSword, k3: null, waiting: [] };
}

/** Rảnh bao lâu (giây: không ra chiêu, không trúng đòn, không niệm chú) thì tra kiếm (M3-2). */
export const SHEATHE_AFTER = 5;
/** Còn thủ thế bao lâu (giây) sau lần giao chiến cuối khi đứng yên. */
export const COMBAT_HOLD = 4;

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
  /** Vỏ sáng cường hóa của kiếm (tạo lười khi có kiếm ≥ +7). */
  private glow: SwordGlow | null = null;
  private glowStage = 0;
  /** Kiếm riêng (prop_kiem_*): mesh, chỗ gắn so với xương kiếm, số đo lưỡi cho vỏ sáng. */
  private blade: THREE.Mesh | null = null;
  private bladeHolder = new THREE.Group();
  private bladeLocal = new THREE.Matrix4();
  private glowDims: { start: number; len: number } | undefined;
  private tintHex = '';
  /** Xương để đặt dải lụa phụ kiện (theo tên chuẩn hóa). */
  private fitBones = new Map<FitBone, THREE.Object3D>();
  /** Động tác rút/tra đang phát: đổi chỗ kiếm khi tới `at` (giây trong clip) hoặc khi động tác bị thay/hủy. */
  private swap: { id: string; at: number; drawn: boolean } | null = null;

  constructor(
    o: SkinnedOpts,
    private runSteps: number,
    sword: SwordSocketDef | null = null,
    private ribbons: AttachedRibbons | null = null,
    blade: BladeMount | null = null,
  ) {
    super(o);
    if (ribbons) {
      for (const m of ribbons.objects) this.inner.add(m);
      const rig = this.rig;
      rig.traverse((b) => {
        const k = boneKey(b.name) as FitBone;
        if ((b as THREE.Bone).isBone && (FIT_BONES as readonly string[]).includes(k)) this.fitBones.set(k, b);
      });
      ribbons.setNear(this.lod === 0);
    }
    const fly = buildFlySword();
    this.flySword = fly.group;
    this.flyAura = fly.aura;
    this.root.add(this.flySword);
    this.sword = sword ? SwordSocket.create(this.rig, sword, () => this.rigChanged()) : null;
    if (this.sword && blade) {
      // Kiếm riêng theo trang bị: mesh không xương bám xương kiếm như vỏ sáng (cùng hệ `inner`).
      this.blade = blade.mesh;
      this.bladeLocal = bladeLocal(this.sword.glowLocal, blade.info, blade.old);
      this.glowDims = glowDims(blade.info, blade.old);
      this.bladeHolder.matrixAutoUpdate = false;
      this.bladeHolder.add(blade.mesh);
      this.inner.add(this.bladeHolder);
      this.bladeHolder.matrix.copy(this.sword.boneWorld).multiply(this.bladeLocal);
    }
  }

  /** Bậc phát sáng của kiếm (0/1/2). Cần model có xương kiếm tách riêng; LOD xa tắt. */
  setWeaponGlow(stage: number): void {
    if (stage === this.glowStage) return;
    this.glowStage = stage;
    this.applyGlow();
  }

  /** Ánh kiếm theo bộ trang bị: bậc tối thiểu 1 với màu của bộ ('' = bỏ). */
  setWeaponTint(hex: string): void {
    if (hex === this.tintHex) return;
    this.tintHex = hex;
    this.applyGlow();
  }

  private applyGlow(): void {
    if (!this.sword) return;
    const stage = Math.max(this.glowStage, this.tintHex ? 1 : 0);
    if (!this.glow && stage > 0) {
      this.glow = new SwordGlow(this.sword.glowLocal, this.glowDims);
      // Cùng hệ với cây xương (rig nằm ngoài cảnh nhưng trùng hệ của `inner`).
      this.inner.add(this.glow.group);
    }
    this.glow?.setTint(this.tintHex ? new THREE.Color(this.tintHex).getHex() : null);
    this.glow?.setStage(this.lod >= 2 ? 0 : stage);
  }

  /** Kiếm đang ở tay (đã rút xong). */
  /**
   * Gốc và mũi lưỡi kiếm trong tọa độ thế giới (từ xương `dtl_sword`, K-6: vệt kiếm bám mũi kiếm).
   * False nếu không có xương kiếm hoặc kiếm đang trên lưng.
   */
  bladePoints(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    const s = this.sword;
    if (!s || !s.drawn) return false;
    const d = this.glowDims ?? { start: 0.18, len: 0.8 };
    // Không gọi updateWorldMatrix ở đây: engine cập nhật ma trận một lần trước khi vẽ (matrixWorldAutoUpdate = false); dùng ma trận khung trước (lệch ≤ 1 khung).
    _bpM.copy(s.boneWorld).multiply(s.glowLocal);
    base.set(0, 0, d.start).applyMatrix4(_bpM).applyMatrix4(this.inner.matrixWorld);
    tip.set(0, 0, d.start + d.len).applyMatrix4(_bpM).applyMatrix4(this.inner.matrixWorld);
    return true;
  }

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
    this.ribbons?.setNear(level === 0);
    const aura = this.flySword?.children[1];
    if (aura) aura.visible = level < 2;
    this.glow?.setStage(level >= 2 ? 0 : Math.max(this.glowStage, this.tintHex ? 1 : 0));
    // Kiếm riêng chỉ ở LOD0 (LOD1/2 còn kiếm cũ trong lưới): chặn số draw call thêm ở mức `LOD0_MAX` người.
    // (onLod chạy trong constructor cha, trước khi trường của lớp này được khởi tạo.)
    if (this.bladeHolder) this.bladeHolder.visible = level < 1;
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
    if (a.dead) {
      this.calm = Infinity;
      return;
    }
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
    // Vừa ra chiêu/trúng đòn/niệm chú trong khoảng gần thì đứng thủ thế (clip `combat_idle` của K-3).
    this.combatBias = this.calm < COMBAT_HOLD && !!this.sword?.drawn;
    super.update(dt, a);
    this.updateSword(dt, a);
    if (this.blade && this.sword) {
      this.bladeHolder.matrix.copy(this.sword.boneWorld).multiply(this.bladeLocal);
      this.bladeHolder.matrixWorldNeedsUpdate = true;
    }
    if (this.glow?.active && this.sword) this.glow.update(dt, this.sword.boneWorld);
    if (this.ribbons && this.lod === 0 && this.inner.visible) this.ribbons.update(dt, a.speed, (b) => this.fitBones.get(b)?.matrixWorld ?? null);
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
    this.glow?.dispose();
  }
}
