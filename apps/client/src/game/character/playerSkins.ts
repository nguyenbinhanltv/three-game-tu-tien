import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, vec3 } from 'three/tsl';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { APPEARANCE, DYE, OUTFIT_COVERS, OUTFITS, scabbardOf, SET, SETS, SWORD_GLOW_TINT, SWORD_MODEL_DEFAULT } from '@dtl/content';
import { type Gender, type MonsterDef, parseAccessoryCode, POSE_SWORD_DRAW, POSE_SWORD_SHEATHE, POSE_SWORD_SWAP } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../core/assets';
import { buildFlySword, Humanoid } from '../core/models';
import { adoptGltfMaterials, createWorldMaterial, rimLight } from '../../render/materials/world';
import { createOutfitMaterial, hasOutfitMask, type OutfitMode } from '../../render/materials/outfit';
import { type BodyFit, FIT_BONES, type FitBone, fitBody } from './bodyFit';
import {
  type AttachedRibbons,
  attachAccessories,
  type AccessoryMaterials,
  type BuiltAccessories,
  buildAccessories,
  disposeAccessories,
} from './setAccessories';
import { boneKey } from './ikpose';
import { coveredIndex, coverUnion } from './bodyRegions';
import { dressedIndex, extendSkeleton, outfitAssetId, remapSkin, skinKeep, withIndex } from './outfit';
import { acquireWithHumanLib, HUMAN_K3_LIB, HUMAN_UAL_LIB, mergeClips, retargetClips } from './animLib';
import { UAL_ENABLED, UAL_REPLACE, ualAliases, ualMap } from './ualClips';
import { HUMAN_CLIPS } from './humanClips';
import { applyDye } from './dye';
import { applyPalette } from './monsterSkins';
import { poseClipName } from './ikpose';
import { libraryClips, type PoseLibrary, withPoses } from './poseLib';
import { type HitOpts } from '../combat/hitreact';
import { SkinnedCharacter, type SkinnedOpts } from './skinned';
import { type SpringDef, springDefs } from './spring';
import { SwordGlow } from '../fx/swordGlow';
import { partExtras, stripPartTracks, SwordSocket, type SwordSocketDef, swordSocketDef } from './sword';
import {
  type BladeMount,
  bladeLocal,
  cutOldSword,
  glowDims,
  type OldSwordSpan,
  SWORD_METALNESS,
  SWORD_ROUGHNESS,
  SWORD_TINT,
  type SwordTemplate,
  swordTemplateOf,
} from './swordModel';
import type { CharState, ClipMap } from './states';
import { CHR_V3, MannequinPlayers, V3_ONLY_SKINS } from './mannequin';
import { type AnimState, type CharacterView, legacyModelsRequested, type MonsterView, type PerformOpts } from './view';
import { FLAGS } from '../../base/flags';

/** Ngoại hình hiển thị của một người chơi (từ schema server: `g`, `dye`). */
export interface PlayerLook {
  g: string;
  dye: string;
  /** Kiểu tóc nhân vật nền v2 ('a' | 'b'); thiếu = 'a'. */
  hair?: string;
  /** Bộ trang bị đang quyết định màu áo/ánh kiếm (id trong sets.json; undefined = màu đã chọn). */
  set?: string;
  /** Asset model kiếm đang cầm (prop_kiem_*, `swordModelOf`); thiếu = kiếm mặc định. */
  w?: string;
  /** Mã phụ kiện hình dáng của đồ bộ (`accessoryCode`): hiện theo từng món đã mặc, không cần đủ 2 món. */
  acc?: string;
  /** Skin đang mặc ở ô ngoại hình (`ItemDef.skin`, vd. `set_skin_varkessa`): lưới phủ toàn thân, đè mọi trang phục. */
  skin?: string;
}

/** Cấu hình model người chơi có xương theo asset. */
interface PlayerSkin {
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
  /** CHR-PROTO: thân nền MakeHuman (docs/chr-v2), cùng bộ xương Mixamo và thư viện clip chung. */
  chr_v2_nam: {
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 3.0,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
  chr_v2_nu: {
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 2.9,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
  chr_v2_hb_nam: {
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 3.0,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
  chr_v2_hb_nu: {
    clips: { idle: 'idle', run: 'run', attack: 'heavy_chop', hit: 'hit_light', death: 'death' },
    poses: { jump: 'ngu_kiem', meditate: 'tam_thien' },
    refSpeed: 2.9,
    runSteps: 4,
    maxLocoScale: 1.8,
    rates: { idle: 1.3, attack: 1.25 },
    clothRef: '#3B6584',
  },
};

/** Áo bộ trang bị đã nạp (retarget_set.py): các lưới skin theo LOD, dùng chung giữa mọi người mặc. */
interface OutfitTemplate {
  handle: AssetHandle;
  meshes: THREE.SkinnedMesh[];
  /** Xương lò xo của áo (`dtl.springs`: tay áo, vạt), tính từ file áo; đuôi xương trong hệ xương. */
  springs: SpringDef[];
}

/** Vỏ kiếm đeo lưng (prop_vo_kiem_*: miệng vỏ ở Y = 0, đỉnh vỏ ở Y = len), dùng chung cho mọi kiếm khi mặc áo bộ mô-đun. */
interface ScabbardTemplate {
  mesh: THREE.Mesh;
  len: number;
  release: () => void;
}

/** Vỏ kiếm gắn cho một bản sao: mesh, độ dài model vỏ. */
interface ScabbardMount {
  mesh: THREE.Mesh;
  len: number;
}

/** Các mảnh áo đã sẵn sàng của một người mặc (theo thứ tự trong outfits.json). */
interface Outfit {
  parts: { id: string; tpl: OutfitTemplate }[];
  /** Màu đạo bào để nhuộm áo tân thủ (set_de_tu_*: màu vải tham chiếu `#3B6584`). */
  dye?: { id: string; hex: string };
  /** Skin toàn thân: ẩn cả đầu, cổ, tay của thân nền (áo thường vẫn giữ các phần đó). */
  full?: boolean;
}

/** Bộ đồ đệ tử thủ tục của nhân vật nền v2 (tools/blender/chr_v2_starter.py): mặc khi không có bộ nào có áo v2. */
const STARTER = 'set_de_tu';

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
  /** Tên clip cũ bị clip UAL thay (có khi UAL đã nạp xong). */
  replace: readonly string[];
}

/** Trạng thái nền → clip K-3. Đứng thủ thế khi giao chiến, đi bộ chậm, đi lùi/ngang khi nhìn mục tiêu. */
const K3_STATES: Partial<Record<CharState, string>> = {
  walk: 'walk',
  back: 'back',
  strafeL: 'strafe_l',
  strafeR: 'strafe_r',
  combatIdle: 'combat_idle',
};
/** Chờ bao lâu sau khi dựng mẫu rồi mới nạp K-3 (ms): không chen vào đường tải trước khung game đầu. */
const K3_DELAY = 1500;

/** v1 (hai model Tripo cũ) là mặc định; `?chr=v2` bật nhân vật nền v2 (MakeHuman + đầu/tóc Tripo). */
const CHR_V2 = FLAGS.chr === 'v2'; // Không có location (test node): v1
/** Nhân vật nền v2 đang bật (chỉ khi `?chr=v2`): UI chọn kiểu tóc A/B chỉ hiện khi true. */
export const CHR_V2_ON = CHR_V2;
/** `?hair=b` ép kiểu tóc B khi không có lựa chọn của người chơi (thử, chụp ảnh). */
const CHR_V2_HAIR = FLAGS.hair;

/** Id asset model người chơi của giới tính (và kiểu tóc): v1 mặc định, `?chr=v2` model nền v2. Dùng cho prefetch lúc vào game. */
export function playerModelId(g: string, hair?: string): string | null {
  return modelOf(g, hair);
}

/** Id asset bộ đồ đệ tử tân thủ của model v2 (null nếu đang dùng model cũ). */
export function starterOutfitId(g: string, hair?: string): string | null {
  const m = CHR_V2 ? modelOf(g, hair) : null;
  return m ? outfitAssetId(STARTER, m) : null;
}

/** Model asset của giới tính; giới tính lạ hoặc chưa có model thì dùng model của giới tính mặc định. */
function modelOf(g: string, hair?: string): string | null {
  // Mặc định hai model Tripo cũ (`appearance.json`); `?chr=v2` bật nhân vật nền v2 (MakeHuman + đầu/tóc Tripo, `chr_v2_*`; kiểu tóc B: `chr_v2_hb_*`).
  if (CHR_V2) return `chr_v2_${(hair ?? CHR_V2_HAIR) === 'b' ? 'hb_' : ''}${g === 'f' ? 'nu' : 'nam'}`;
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
  /** Áo bộ trang bị theo asset (set_*_nam|nu), nạp lười khi có người mặc bộ. */
  private outfits = new Map<string, OutfitTemplate | 'loading' | 'failed'>();
  private outMats = new Map<string, THREE.MeshStandardNodeMaterial>();
  /** Vỏ kiếm đeo lưng dùng chung (nạp lười khi có người mặc áo mô-đun). */
  private scabbards = new Map<string, ScabbardTemplate | 'loading' | 'failed'>();
  /** Lưới nhân vật đã cắt phần áo che (theo hình học gốc) và lưới áo đã đổi chỉ số xương (theo asset áo + LOD). */
  private dressed = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>();
  private dressedV2 = new Map<string, THREE.BufferGeometry | null>();
  private remapped = new Map<string, THREE.BufferGeometry | null>();

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {
    this.v3 = CHR_V3 ? new MannequinPlayers(cache) : null;
  }

  /** `?chr=v3` (N-0): nhân vật Mannequin nguyên khối, null khi tắt. */
  private v3: MannequinPlayers | null;

  preload(): void {
    if (this.legacy) return;
    if (this.v3) this.v3.create(APPEARANCE.defaultGender);
    // Giới tính mặc định nạp sớm; giới tính khác nạp khi có người chơi đó xuất hiện (`create`), khỏi tải thừa ~2,5 MB.
    const id = modelOf(APPEARANCE.defaultGender);
    if (id && PLAYER_SKINS[id]) this.load(id);
  }

  /** Người chơi này sẽ có model mới nhưng asset đang nạp (tạm model khối, nạp xong thì đổi). */
  pending(look: PlayerLook): boolean {
    if (this.v3 && !this.legacy) return this.v3.pending(look.g, look.skin, look.w, look.set);
    const id = modelOf(look.g, look.hair);
    if (this.legacy || !id) return false;
    // Kiếm riêng còn nạp: tạm cầm kiếm mặc định, nạp xong thì entities dựng lại (cùng cơ chế với asset nhân vật).
    const oids = this.outfitIds(look);
    if (
      this.templates.get(id) !== 'failed' &&
      (oids.some((o) => this.outfits.get(o) === 'loading') || (oids.length > 0 && this.scabbards.get(scabbardOf(look.w)) === 'loading'))
    )
      return true;
    return this.templates.get(id) === 'loading' || this.swords.get(look.w ?? SWORD_MODEL_DEFAULT) === 'loading';
  }

  /** NPC dựng từ model người chơi (E3-H): giống `pending` nhưng theo giới tính của NPC. */
  npcPending(g: string): boolean {
    return this.pending({ g, dye: '' });
  }

  /**
   * NPC dùng model nhân vật nền (có mặt, tóc, áo thật) nhuộm kênh vải bằng `applyDye` như người chơi: `hex` màu áo, `accent` màu viền/điểm nhấn.
   * Không nhân màu cả mesh (làm mất mặt, tóc). Chưa nạp xong thì model khối, `npcPending` báo để dựng lại.
   */
  createNpc(look: { g: string; hex: string; accent?: string }): CharacterView {
    const id = modelOf(look.g);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (id && skin && !this.legacy) this.load(id);
    const t = id && skin && !this.legacy ? this.templates.get(id) : undefined;
    if (!id || !skin || !t || typeof t === 'string') return new Humanoid({ robe: look.hex, trim: look.accent ?? look.hex, sword: false });
    const mat = this.material(id, skin, t, `npc:${look.hex}:${look.accent ?? ''}`, look.hex, look.accent);
    if (!CHR_V2) return this.build(id, skin, t, mat);
    // Nhân vật nền v2 không có áo: mặc bộ đồ đệ tử nhuộm màu NPC; chưa nạp xong thì model khối, `npcPending` báo để dựng lại.
    const oid = outfitAssetId(STARTER, id);
    const tpl = oid ? this.loadOutfit(oid) : null;
    if (!oid || !tpl) return new Humanoid({ robe: look.hex, trim: look.accent ?? look.hex, sword: false });
    return this.build(id, skin, t, mat, undefined, undefined, false, {
      parts: [{ id: oid, tpl }],
      dye: { id: `npc:${look.hex}`, hex: look.hex },
    });
  }

  /** Các asset mảnh áo của bộ đang mặc (rỗng nếu bộ chưa có áo riêng cho giới này hoặc đang `?models=legacy`). */
  private outfitIds(look: PlayerLook): string[] {
    if (this.legacy) return [];
    const model = modelOf(look.g, look.hair);
    // Skin đè mọi trang phục. Mới dựng cho thân v1 (`<skin>_nam|nu`); thân v2 chưa có nên bỏ qua, mặc trang phục như thường.
    const skin = this.skinAsset(look);
    if (skin) return [skin];
    if (CHR_V2) {
      // Thân v2 không có áo: bộ chưa có áo dựng cho thân v2 (không khai ở outfit_covers.json) thì mặc bộ đồ đệ tử tân thủ.
      const own = look.set ? (OUTFITS[look.set] ?? []) : [];
      const parts = own.length && own.every((p) => p in OUTFIT_COVERS) ? own : [STARTER];
      return parts.flatMap((p) => outfitAssetId(p, model) ?? []);
    }
    if (!look.set) return [];
    const parts = OUTFITS[look.set] ?? [];
    return parts.flatMap((p) => outfitAssetId(p, model) ?? []);
  }

  /**
   * Asset skin toàn thân của `look` (thân v1: `<skin>_nam|nu`); null = không mặc skin hoặc thân này chưa có bản skin (v2).
   * Asset nạp lỗi thì `loadOutfit` đánh dấu `failed` và nhân vật về hình thường (không có áo skin, thân nền hiện nguyên).
   */
  private skinAsset(look: PlayerLook): string | null {
    if (!look.skin || CHR_V2 || this.legacy) return null;
    // v3 dựng skin ở MannequinPlayers (asset `chr_v3_*`); skin chỉ có bản v3 thì v1 bỏ qua.
    if (this.v3 || V3_ONLY_SKINS.has(look.skin)) return null;
    return outfitAssetId(look.skin, modelOf(look.g, look.hair));
  }

  create(look: PlayerLook): CharacterView {
    if (this.v3 && !this.legacy) {
      const v = this.v3.create(look.g, look.skin, look.w, look.set);
      if (v) return v;
    }
    const dye = dyeOf(look.dye, look.set);
    const id = modelOf(look.g, look.hair);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (id && skin && !this.legacy) this.load(id);
    const t = id && skin && !this.legacy ? this.templates.get(id) : undefined;
    if (!id || !skin || !t || typeof t === 'string') return new Humanoid({ robe: dye.hex, trim: dye.trim, sword: true });
    if (t.oldSword && look.w) this.loadSword(look.w);
    // Áo riêng của bộ: có thì thay lưới áo của nhân vật (bỏ phụ kiện thủ tục: áo đã có vai giáp, đai...); chưa nạp xong/lỗi thì giữ đường recolor + phụ kiện.
    const parts = this.outfitIds(look).map((o) => ({ id: o, tpl: this.loadOutfit(o) }));
    if (parts.length) this.loadScabbard(scabbardOf(look.w));
    const full = !!this.skinAsset(look);
    const outfit: Outfit | undefined =
      parts.length && parts.every((p) => p.tpl) ? { parts: parts as Outfit['parts'], dye: { id: dye.id, hex: dye.hex }, full } : undefined;
    return this.build(
      id,
      skin,
      t,
      this.material(id, skin, t, dye.id, dye.hex, 'accent' in dye ? dye.accent : undefined),
      outfit && !outfit.parts.every((p) => p.id.startsWith(STARTER)) ? undefined : look.acc,
      look.w,
      false,
      outfit,
    ); // đồ tân thủ vẫn mang phụ kiện của bộ (giáp vai, đai...); áo mô-đun đã có sẵn
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
    if (this.v3 && !this.legacy) {
      const v = this.v3.createShadow(look.g, def, look.skin, look.set);
      if (v) return v;
    }
    const id = modelOf(look.g, look.hair);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (!id || !skin || this.legacy) return null;
    this.load(id);
    const t = this.templates.get(id);
    if (!t || typeof t === 'string') return null;
    const view = this.build(id, skin, t, this.shadowMaterial(id, t), undefined, undefined, true);
    return Object.assign(view, { def }) as unknown as MonsterView;
  }

  /**
   * Nguyên anh (E3-K): bản thu nhỏ của chính nhân vật (cùng giới, cùng model), vật liệu linh thể.
   * `soul`: trong mờ ánh ngọc, rìa vàng nhạt kiểu fresnel; `husk`: thân xác bỏ lại, xám ngọc mờ hơn nhiều.
   * Trả null nếu asset chưa nạp hoặc `?models=legacy` (bên gọi dùng hình dự phòng).
   */
  createSoul(look: PlayerLook, kind: 'soul' | 'husk'): CharacterView | null {
    const id = modelOf(look.g, look.hair);
    const skin = id ? PLAYER_SKINS[id] : undefined;
    if (!id || !skin || this.legacy) return null;
    this.load(id);
    const t = this.templates.get(id);
    if (!t || typeof t === 'string') return null;
    return this.build(id, skin, t, this.soulMaterial(id, t, kind), undefined, undefined, true);
  }

  private soulMaterial(id: string, t: Template, kind: 'soul' | 'husk'): THREE.MeshStandardNodeMaterial {
    const key = `${id}/${kind}`;
    let m = this.mats.get(key);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    m = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0];
    const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(2.2);
    if (kind === 'soul') {
      applyPalette(m, { dark: '#8fb7aa', light: '#eaf6ee', glow: '#f0dc9c' });
      // Cộng sáng: thân ngọc trong mờ, rìa fresnel vàng nhạt đậm dần (đỉnh dưới ngưỡng bloom, không lóa).
      m.emissiveNode = vec3(0.62, 0.78, 0.66)
        .mul(0.16)
        .add(vec3(0.94, 0.82, 0.5).mul(fres.mul(0.85)));
      m.opacityNode = fres.mul(0.45).add(0.42);
      m.blending = THREE.AdditiveBlending;
    } else {
      applyPalette(m, { dark: '#3a4a46', light: '#b4c7bf', glow: '#6d8a7a' });
      m.opacityNode = fres.mul(0.2).add(0.34);
    }
    m.transparent = true;
    m.depthWrite = false;
    m.needsUpdate = true;
    this.mats.set(key, m);
    return m;
  }

  /** Kiếm của một bản sao: model của `want` nếu đã nạp, không thì kiếm mặc định; null nếu mẫu không thay được kiếm. */
  private bladeFor(t: Template, want: string | undefined, shadowMat?: THREE.Material): BladeMount | null {
    if (!t.oldSword) return null;
    const pick = (id: string) => {
      const s = this.swords.get(id);
      return typeof s === 'object' ? s : null;
    };
    const id = pick(want ?? SWORD_MODEL_DEFAULT) ? (want ?? SWORD_MODEL_DEFAULT) : SWORD_MODEL_DEFAULT;
    const tpl = pick(id);
    if (!tpl) return null;
    const mesh = tpl.mesh.clone();
    // Bóng tâm ma dùng chung material mờ của bóng; thân kiếm thật dùng chung material của model (không dispose theo bản sao).
    if (shadowMat) mesh.material = shadowMat;
    return { mesh, info: tpl.info, old: t.oldSword, tint: SWORD_GLOW_TINT[id] };
  }

  /** Phụ kiện đồ bộ hiển thị theo `acc` (lỗi dựng thì bỏ qua, nhân vật vẫn đẹp bằng áo nhuộm). */
  private accessories(id: string, t: Template, scene: THREE.Object3D, acc: string | undefined): AttachedRibbons | null {
    if (!acc) return null;
    try {
      if (t.fit === undefined)
        t.fit = fitBody(
          t.handle.scene,
          t.clips.find((c) => c.name === 'idle'),
          t.height,
        );
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

  /**
   * Mặc áo: lưới nhân vật chỉ còn đầu/cổ/tay (hình học cắt dùng chung theo mẫu), thêm các lưới mảnh áo cùng LOD gắn vào xương
   * nhân vật (một draw call mỗi mảnh mỗi LOD hiển thị). Xương phụ của áo (tay áo, vạt) được nối vào bộ xương bản sao; trả
   * định nghĩa lò xo của chúng. Material mỗi mảnh dùng chung toàn bộ người mặc.
   */
  private dress(scene: THREE.Object3D, outfit: Outfit): SpringDef[] {
    const bodies: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) bodies.push(o as THREE.SkinnedMesh);
    });
    if (!bodies.length) return [];
    const springs: SpringDef[] = [];
    for (const p of outfit.parts) springs.push(...p.tpl.springs);
    const sk = extendSkeleton(
      bodies[0].skeleton,
      outfit.parts.map((p) => p.tpl.meshes[0].skeleton),
    );
    for (const pm of bodies) {
      if (sk) pm.bind(sk, pm.bindMatrix);
      const lod = typeof pm.userData.lod === 'number' ? pm.userData.lod : 0;
      // Nhân vật nền v2: ẩn theo vùng áo khai báo (`outfit_covers.json`); model cũ: chỉ giữ đầu/cổ/tay.
      const covered =
        CHR_V2 && !outfit.full
          ? coverUnion(
              outfit.parts.map((p) => p.id),
              OUTFIT_COVERS,
            )
          : null;
      // Skin toàn thân dùng chung bộ nhớ đệm theo khóa (uuid|full) với nhân vật v2.
      const ck = outfit.full ? `${pm.geometry.uuid}|full` : covered ? `${pm.geometry.uuid}|${[...covered].sort().join(',')}` : null;
      let cut = ck ? this.dressedV2.get(ck) : this.dressed.get(pm.geometry);
      if (cut === undefined) {
        const idx = outfit.full ? dressedIndex(pm, skinKeep) : covered ? coveredIndex(pm, covered) : dressedIndex(pm);
        cut = idx ? withIndex(pm.geometry, idx) : null;
        if (ck) this.dressedV2.set(ck, cut);
        else this.dressed.set(pm.geometry, cut);
      }
      if (cut) pm.geometry = cut;
      // Thân nền không còn tam giác nào (skin che hết, kiếm nướng đã cắt ở LOD0): ẩn hẳn, khỏi tốn một draw call rỗng.
      if (cut && (cut.index?.count ?? 0) === 0) pm.visible = false;
      pm.userData.noShadow = true; // lưới thân chỉ còn đầu/tay: bóng do lưới áo lo, khỏi thêm một lượt vẽ bóng
      if (!pm.parent) continue;
      for (const part of outfit.parts) {
        const src = part.tpl.meshes.find((m) => (m.userData.lod ?? 0) === lod) ?? part.tpl.meshes[part.tpl.meshes.length - 1];
        const rk = `${part.id}|${lod}|${pm.skeleton.bones.length}`;
        let geo = this.remapped.get(rk);
        if (geo === undefined) {
          geo = remapSkin(src, pm.skeleton.bones);
          this.remapped.set(rk, geo);
        }
        if (!geo) continue;
        // Mảnh có voan (extras dtl_outfitAlpha): LOD0 vẽ hai lượt cùng hình học (phần đặc `cutout` + voan blend thật), LOD xa vẽ voan như vải đặc.
        const veilPart = lod === 0 && (part.tpl.meshes[0].material as THREE.MeshStandardMaterial).userData?.dtl_outfitAlpha === 1;
        const g = new THREE.SkinnedMesh(geo, this.outfitMaterial(part.id, part.tpl, veilPart ? 'cutout' : 'solid', outfit.dye));
        g.name = `${part.id}_${lod}`;
        g.userData.outfit = true;
        g.userData.lod = lod;
        g.matrix.copy(pm.matrix);
        g.matrix.decompose(g.position, g.quaternion, g.scale);
        g.castShadow = pm.castShadow;
        g.receiveShadow = pm.receiveShadow;
        pm.parent.add(g);
        g.bind(pm.skeleton, pm.bindMatrix);
        if (veilPart) {
          const v = new THREE.SkinnedMesh(geo, this.outfitMaterial(part.id, part.tpl, 'veil', outfit.dye));
          v.name = `${part.id}_${lod}_veil`;
          v.userData.outfit = true;
          v.userData.lod = lod;
          v.matrix.copy(g.matrix);
          v.matrix.decompose(v.position, v.quaternion, v.scale);
          v.castShadow = false; // voan không đổ bóng (phần đặc đã đổ)
          v.receiveShadow = pm.receiveShadow;
          v.renderOrder = 2; // sau thân và áo đặc
          pm.parent.add(v);
          v.bind(pm.skeleton, pm.bindMatrix);
        }
      }
    }
    return springs;
  }

  private outfitMaterial(
    id: string,
    tpl: OutfitTemplate,
    mode: OutfitMode = 'solid',
    dye?: { id: string; hex: string },
  ): THREE.MeshStandardNodeMaterial {
    const starter = id.startsWith(STARTER) && !!dye;
    const base = mode === 'solid' ? id : `${id}|${mode}`;
    const key = starter ? `${base}|${dye!.id}` : base;
    let m = this.outMats.get(key);
    if (m) return m;
    const src = tpl.meshes[0].material as THREE.MeshStandardMaterial;
    if (hasOutfitMask(src))
      m = createOutfitMaterial(src, undefined, mode); // bộ mô-đun T-5: nhuộm 3 kênh, vải/kim loại, vân sáng
    else {
      // Bộ đồ đệ tử tân thủ (màu phẳng): nhuộm vải tham chiếu theo màu đạo bào đã chọn như thân.
      m = rimLight(adoptGltfMaterials(new THREE.Mesh(undefined, src), starter ? (x) => applyDye(x, '#3B6584', dye!.hex) : undefined)[0]);
      m.side = THREE.DoubleSide; // bản tạm #119: các tấm vỏ mỏng (vạt, tay áo): không cull mặt sau
    }
    this.outMats.set(key, m);
    return m;
  }

  /** Bản sao mesh vỏ kiếm nếu đã nạp (null: chưa nạp hoặc lỗi; kiếm cũ giữ vỏ nướng sẵn). */
  private scabbardMount(asset: string): ScabbardMount | null {
    const s = this.scabbards.get(asset);
    return s && typeof s === 'object' ? { mesh: s.mesh.clone(), len: s.len } : null;
  }

  private loadScabbard(asset: string): void {
    if (this.scabbards.has(asset)) return;
    this.scabbards.set(asset, 'loading');
    this.cache.acquire(asset, { priority: 18 }).then(
      (h) => {
        if (this.disposed) {
          h.release();
          return;
        }
        let mesh: THREE.Mesh | null = null;
        h.scene.traverse((o) => {
          if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
        });
        const len = (partExtras(h.scene) as { scabbard?: { len?: number } }).scabbard?.len;
        if (!mesh || !len) {
          console.warn(`[models] ${asset} thiếu số đo vỏ (extras dtl.scabbard), bỏ qua`);
          h.release();
          this.scabbards.set(asset, 'failed');
          return;
        }
        for (const m of adoptGltfMaterials(h.scene)) {
          m.metalness = 0;
          m.roughness = 0.65;
        }
        this.scabbards.set(asset, { mesh, len, release: () => h.release() });
      },
      (err) => {
        console.warn(`[models] không nạp được ${asset}`, err);
        if (!this.disposed) this.scabbards.set(asset, 'failed');
      },
    );
  }

  /** Nạp lười asset áo; trả mẫu nếu đã sẵn sàng (chưa nạp xong → null, `pending` báo để entities dựng lại). */
  private loadOutfit(id: string): OutfitTemplate | null {
    const cur = this.outfits.get(id);
    if (cur) return typeof cur === 'string' ? null : cur;
    this.outfits.set(id, 'loading');
    this.cache.acquire(id, { priority: 15 }).then(
      (h) => {
        if (this.disposed) {
          h.release();
          return;
        }
        const meshes: THREE.SkinnedMesh[] = [];
        h.scene.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
        });
        meshes.sort((a, b) => (a.userData.lod ?? 0) - (b.userData.lod ?? 0));
        if (!meshes.length) {
          console.warn(`[models] ${id} không có lưới skin, giữ áo recolor`);
          h.release();
          this.outfits.set(id, 'failed');
          return;
        }
        this.outfits.set(id, { handle: h, meshes, springs: springDefs(h.scene, partExtras(h.scene).springs ?? []) });
      },
      (err) => {
        console.warn(`[models] không nạp được áo ${id}, giữ áo recolor + phụ kiện`, err);
        if (!this.disposed) this.outfits.set(id, 'failed');
      },
    );
    return null;
  }

  private build(
    id: string,
    skin: PlayerSkin,
    t: Template,
    mat: THREE.MeshStandardNodeMaterial,
    acc?: string,
    want?: string,
    shadow = false,
    outfit?: Outfit,
  ): SkinnedPlayer {
    const scene = cloneSkinned(t.handle.scene);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    const outfitSprings = outfit ? this.dress(scene, outfit) : [];
    const blade = this.bladeFor(t, want, shadow ? mat : undefined);
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
        springs: outfitSprings.length ? [...t.springs, ...outfitSprings] : t.springs,
        ground: 'biped',
      },
      skin.runSteps,
      t.sword,
      ribbons,
      blade,
      outfit && blade && !shadow ? this.scabbardMount(scabbardOf(want)) : null,
    );
    if (t.k3) player.addClips(t.k3.clips, t.k3.map, t.k3.locoRef, t.k3.replace);
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
    // UAL (thay chết/trúng đòn/ngã/thủ thế, thêm lướt/nhảy) nạp cùng K-3; lỗi UAL thì chỉ mất phần UAL.
    const ualP = (UAL_ENABLED ? this.cache.acquire(HUMAN_UAL_LIB, { priority: 40 }) : Promise.resolve(null)).catch((err) => {
      console.warn('[models] không nạp được thư viện clip UAL, giữ clip cũ', err);
      return null;
    });
    this.cache.acquire(HUMAN_K3_LIB, { priority: 40 }).then(
      async (lib) => {
        const ual = await ualP;
        const releaseAll = () => (lib.release(), ual?.release());
        if (this.disposed) {
          releaseAll();
          return;
        }
        const tpl = this.templates.get(id);
        if (!tpl || typeof tpl === 'string') {
          releaseAll();
          return;
        }
        const out: THREE.AnimationClip[] = [];
        const have = new Set(tpl.clips.map((c) => c.name));
        const todo: { src: THREE.Object3D; clip: THREE.AnimationClip; ual: boolean }[] = [
          ...lib.animations.filter((c) => !have.has(c.name)).map((clip) => ({ src: lib.scene, clip, ual: false })),
          ...(ual?.animations ?? []).map((clip) => ({ src: ual!.scene, clip, ual: true })),
        ];
        const step = () => {
          if (this.disposed) {
            releaseAll();
            return;
          }
          const c = todo.shift();
          if (c) {
            const r = retargetClips(c.src, [c.clip], tpl.handle.scene);
            out.push(...(c.ual ? r.flatMap(ualAliases) : r));
            setTimeout(step, 0);
            return;
          }
          releaseAll();
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
          Object.assign(
            map,
            ualMap((n) => out.some((x) => x.name === n)),
          );
          const replace = out.some((x) => x.name.startsWith('ual_')) ? UAL_REPLACE : [];
          tpl.k3 = { clips: out, map, locoRef, replace };
          for (const w of tpl.waiting) w.deref()?.addClips(out, map, locoRef, replace);
          tpl.waiting = [];
        };
        step();
      },
      (err) => {
        void ualP.then((u) => u?.release());
        console.warn('[models] không nạp được thư viện clip K-3, giữ bộ clip cũ', err);
      },
    );
  }

  dispose(): void {
    this.disposed = true;
    this.v3?.dispose();
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
    for (const sc of this.scabbards.values()) if (typeof sc === 'object') sc.release();
    this.scabbards.clear();
    for (const o of this.outfits.values()) if (typeof o === 'object') o.handle.release();
    this.outfits.clear();
    for (const m of this.outMats.values()) m.dispose();
    this.outMats.clear();
    for (const g of this.dressed.values()) g?.dispose();
    this.dressed.clear();
    for (const g of this.dressedV2.values()) g?.dispose();
    this.dressedV2.clear();
    for (const g of this.remapped.values()) g?.dispose();
    this.remapped.clear();
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
    Promise.all([acquireWithHumanLib(this.cache, id), this.loadSword(SWORD_MODEL_DEFAULT)]).then(
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
        if (import.meta.env.DEV && typeof window !== 'undefined')
          ((window as unknown as { __swordMats?: Record<string, THREE.Material> }).__swordMats ??= {})[id] = tpl.mesh
            .material as THREE.Material;
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
    applyPalette(m, { dark: '#0d0916', light: '#5a4080', glow: '#c24a7a' });
    m.transparent = true;
    m.opacity = 0.86;
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
const COMBAT_HOLD = 4;

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
  /** Vỏ kiếm đeo lưng (chỉ khi mặc áo mô-đun và có kiếm riêng): luôn ở lưng, kiếm rút ra thì lưng chỉ còn vỏ. */
  private scabbardHolder = new THREE.Group();
  private scabbardLocal = new THREE.Matrix4();
  private hasScabbard = false;
  private glowDims: { start: number; len: number } | undefined;
  private tintHex = '';
  /** Màu hào quang riêng của kiếm đang cầm (thắng màu theo bộ); '' = dùng màu bộ/mặc định. */
  private swordTint = '';
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
    scabbard: ScabbardMount | null = null,
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
      this.swordTint = blade.tint ?? '';
      this.bladeLocal = bladeLocal(this.sword.glowLocal, blade.info, blade.old);
      this.glowDims = glowDims(blade.info, blade.old);
      this.bladeHolder.matrixAutoUpdate = false;
      this.bladeHolder.add(blade.mesh);
      this.inner.add(this.bladeHolder);
      this.bladeHolder.matrix.copy(this.sword.boneWorld).multiply(this.bladeLocal);
      if (scabbard) {
        // Miệng vỏ ở gốc lưỡi kiếm, đỉnh vỏ về phía mũi, dài hơn lưỡi 3%: cùng hệ phóng của kiếm (bladeScale).
        const f = ((blade.info.len - blade.info.bladeStart) * 1.03) / scabbard.len;
        this.scabbardLocal
          .copy(this.bladeLocal)
          .multiply(new THREE.Matrix4().makeTranslation(0, blade.info.bladeStart, 0))
          .multiply(new THREE.Matrix4().makeScale(f, f, f));
        this.scabbardHolder.matrixAutoUpdate = false;
        this.scabbardHolder.add(scabbard.mesh);
        this.inner.add(this.scabbardHolder);
        this.hasScabbard = true;
      }
    }
  }

  /** Đang mặc áo bộ mô-đun: mỗi người ở LOD0 tốn ~5 draw call (thân, áo, kiếm, vỏ, bóng áo), nên `applyLodBudget` tính hai suất LOD0. */
  get dressed(): boolean {
    return this.hasOutfitMesh();
  }

  private hasOutfitMesh(): boolean {
    let has = false;
    this.scene.traverse((o) => {
      if (o.userData.outfit) has = true;
    });
    return has;
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
    const tint = this.swordTint || this.tintHex;
    this.glow?.setTint(tint ? new THREE.Color(tint).getHex() : null);
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
    tip
      .set(0, 0, d.start + d.len)
      .applyMatrix4(_bpM)
      .applyMatrix4(this.inner.matrixWorld);
    return true;
  }

  get swordDrawn(): boolean {
    return this.sword?.drawn ?? false;
  }

  /** Ra chiêu: kiếm vào tay nếu động tác thật sự phát (bay, trên không, chết thì server không cho ra chiêu). */
  override perform(id: string, o?: PerformOpts): boolean {
    const ok = super.perform(id, o);
    if (this.performing(id)) this.engage(true);
    return ok;
  }

  override hitReact(o: HitOpts): void {
    super.hitReact(o);
    this.engage(false);
  }

  /** LOD xa: bỏ hào quang phi kiếm (một draw call trong suốt), giữ thân kiếm. */
  protected override onLod(level: number): void {
    this.ribbons?.setNear(level === 0);
    const aura = this.flySword?.children[1];
    if (aura) aura.visible = level < 2;
    this.glow?.setStage(level >= 2 ? 0 : Math.max(this.glowStage, this.tintHex ? 1 : 0));
    // Kiếm riêng chỉ ở LOD0 (LOD1/2 còn kiếm cũ trong lưới): chặn số draw call thêm ở mức `LOD0_MAX` người.
    // (onLod chạy trong constructor cha, trước khi trường của lớp này được khởi tạo.)
    if (this.bladeHolder) this.bladeHolder.visible = level < 1;
    if (this.scabbardHolder) this.scabbardHolder.visible = level < 1;
    // Mặc áo: ≥ LOD2 (xa > 55 m) bỏ nốt lưới thân (chỉ còn đầu/tay, vài điểm ảnh): bớt một draw call mỗi người đứng xa.
    if (level >= 2 && this.hasOutfitMesh()) {
      this.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh && !m.userData.outfit) m.visible = false;
      });
    }
  }

  /** Đòn không có động tác riêng (clip `attack` của asset); động tác chiêu tự đếm trong `perform`. */
  override attack(): void {
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

  override update(dt: number, a: AnimState): void {
    // Vừa ra chiêu/trúng đòn/niệm chú trong khoảng gần thì đứng thủ thế (clip `combat_idle` của K-3).
    this.combatBias = this.calm < COMBAT_HOLD && !!this.sword?.drawn;
    super.update(dt, a);
    this.updateSword(dt, a);
    if (this.blade && this.sword) {
      this.bladeHolder.matrix.copy(this.sword.boneWorld).multiply(this.bladeLocal);
      this.bladeHolder.matrixWorldNeedsUpdate = true;
    }
    if (this.hasScabbard && this.sword) {
      this.scabbardHolder.matrix.copy(this.sword.backWorld).multiply(this.sword.backLocal).multiply(this.scabbardLocal);
      this.scabbardHolder.matrixWorldNeedsUpdate = true;
    }
    if (this.glow?.active && this.sword) this.glow.update(dt, this.sword.boneWorld);
    if (this.ribbons && this.lod === 0 && this.inner.visible)
      this.ribbons.update(dt, a.speed, (b) => this.fitBones.get(b)?.matrixWorld ?? null);
    this.grounded = !a.flying && !a.airborne;
    this.flySword.visible = a.flying && !a.sky && !a.dead;
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

  override dispose(): void {
    super.dispose();
    this.flyAura.dispose();
    this.glow?.dispose();
  }
}
