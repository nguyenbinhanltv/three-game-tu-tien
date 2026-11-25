// Nhân vật v3 (N-0 → N-7): model nguyên khối có bộ xương UE5 Mannequin (`chr_v3_*`, tools/blender/chr_v3.py) phát
// clip UAL TRỰC TIẾP (`anim_ual_native`, cùng tên xương và tư thế nghỉ), không retarget lúc chạy. Bóng dùng chính bộ xương này.
// Từ N-7 đây là nhân vật MẶC ĐỊNH của người chơi; `?chr=v1` quay về model Tripo cũ (dự phòng một bản). NPC giữ rig cũ.
import { BladeSmear, smearWindow } from '../fx/bladeSmear';
import { PatchMove, PATCH_LIB, type PatchEventKind } from './patchMove';
import { RagRig } from './ragdollRig';
import {
  accelLean,
  ANIM_FX,
  bobOf,
  exagGain,
  EXAG_GAIN,
  glideDip,
  glideLean,
  IDLE_DRAWN_AFTER,
  idleDue,
  idlePoseFor,
  leanBoost,
  LOCO_CLAMP,
  LocoImpulse,
  SPRING_TP,
} from './animFx';
import { DEATH_DIR_TTL, DEATH_TURN_S, dashClipOf, holdHipsInPlace, deathYawOffset, flinchAmpOf, hitClipOf, hitSideOf } from './hitDir';
import { boneKey } from './ikpose';
import { applyProportions, proportionBones, type BoneScale } from './hero';
import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraViewMatrix,
  diffuseColor,
  dot,
  float,
  fract,
  max,
  mix,
  normalView,
  normalize,
  positionViewDirection,
  pow,
  saturate,
  screenCoordinate,
  smoothstep,
  sqrt,
  texture,
  transformDirection,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { skyParams } from '../../render/sky';
import { ClothRig } from './thienY';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SWORD_MODEL_DEFAULT } from '@dtl/content';
import { canCancel, POSE_CAST, POSE_FLY, POSE_SKY, silkTier, v3SilkOf, type MonsterDef, type V3Silk } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assetKey, assets } from '../core/assets';
import { HitReact, type HitOpts } from '../combat/hitreact';
import { adoptGltfMaterials, cloneWorldMaterial } from '../../render/materials/world';
import { lodLevel, mixerDue, mixerInterval, mixerPhase } from './skinned';
import { SpringBones, type SpringCollider, type SpringDef, type SpringParams } from './spring';
import { attachBrawlerGear, gearShown, snapshotBind, type BindSnapshot, type BrawlerGear } from './brawlerGear';
import { attachCoGear, fluteMesh } from './coGear';
import { tranKyMesh } from './tranGear';
import { greatbladeMesh } from './greatblade';
import { SwordArc } from '../fx/swordArc';
import { partExtras } from './sword';
import { SWORD_METALNESS, SWORD_ROUGHNESS, SWORD_TINT, swordTemplateOf, type SwordTemplate } from './swordModel';
import { applySkinLook, SKIN_LOOKS } from './skinLook';
import { applySoulLook, type SoulKind } from './soulLook';
import { applyV3Palette } from './v3Palette';
import { storedQuality, type TexCap, V3TextureBudget, v3TexturePolicy } from './v3Detail';
import { addDyeMask, applyV3Dye, v3DyeRefOf, type V3DyeColors } from './v3Dye';
import {
  breathOf,
  dirMix,
  type DirMix,
  flinchDirOf,
  flinchOf,
  leanOf,
  LOCO,
  locoClipName,
  type LocoTable,
  type LocoBand,
  type LocoDirKey,
  locoMix,
  lookAngles,
  swingRate,
  swingSeconds,
  turnLagOf,
  xfade,
} from './mannequinAnim';
import { clipTimeAt, PATCH_TABLE, scaledTable } from './patchLoop';
import { feetSlot, MqFeet } from './mannequinFeet';
import { lodOf, mergeLodMeshes } from './mannequinLod';
import { lowerBodyOf, upperBodyOf, MannequinPoseBank, type MqPose, PoseSource, POSE_SOURCE_ASSET, poseClipName } from './mannequinPoses';
import UAL_HIT from './ualHit.json';
import type { AnimState, AttackOpts, CharacterView, MonsterView, PerformOpts, SkillEvent } from './view';
import { FLAGS } from '../../base/flags';
import { logger } from '../../base/log';
import { ASSET_BASE } from '../../base/assetBase';

const modelsLog = logger('models');
const thienYLog = logger('thienY');

/** Nhân vật Mannequin v3 là mặc định của người chơi (N-7); chỉ tắt khi `?chr=v1` (dự phòng một bản). */
export const CHR_V3 = FLAGS.chr !== 'v1';
/** `?v3anim=0` về hệ animation cũ (một clip chạy, crossfade 0,16 s, không lớp phụ) để so video trước/sau. */
export const V3_ANIM = FLAGS.v3Anim;
export const V3_LIB = 'anim_ual_native';
/** Asset theo giới tính: Lạc Kiếm Môn Phục v3 (N-3), model Tripo toàn thân đặt lên xương Mannequin (chr_v3.py). */
export const V3_MODELS_A = { m: 'chr_v3_lac_kiem_nam', f: 'chr_v3_lac_kiem_nu' } as const;
/** Bản v3b: vạt xẻ hai bên đối xứng (concept v3b), là bản mặc định của `?chr=v3`; `?v3model=a` về bản v3 cũ để so ảnh. */
export const V3_MODELS_B = { m: 'chr_v3b_lac_kiem_nam', f: 'chr_v3b_lac_kiem_nu' } as const;
/** Bản v3b2: cùng model v3b, vạt 12 chuỗi lò xo; cùng với cải tiến lò xo ở client (gấu cứng hơn, viên nang tay, vạt nằm lên đùi khi ngồi) là mặc định của `?chr=v3`; `?v3model=b` về v3b để so. */
export const V3_MODELS_B2 = { m: 'chr_v3b2_lac_kiem_nam', f: 'chr_v3b2_lac_kiem_nu' } as const;
const V3_PICK = FLAGS.v3Model;
/** Bản v3b3: v3b2 + chuỗi lò xo dải đai/ngọc bội (`tassel`, Thân Pháp T6); MẶC ĐỊNH cho bộ Lạc Kiếm và nhánh của nó (Hàn Giao, Trấn Khích, Vô Danh Kiếm). `?v3model=b2|b|a` về bản cũ để so ảnh. */
export const V3_MODELS_B3 = { m: 'chr_v3b3_lac_kiem_nam', f: 'chr_v3b3_lac_kiem_nu' } as const;
export const V3_MODELS = V3_PICK === 'a' ? V3_MODELS_A : V3_PICK === 'b' ? V3_MODELS_B : V3_PICK === 'b2' ? V3_MODELS_B2 : V3_MODELS_B3;
/** Asset dùng lò xo v2 (`chr_v3b2_*` và các bộ dựng hàng loạt `chr_v3_<bộ>_*`): hệ số cứng gấu vạt, viên nang tay, phình viên nang khi ngồi. */
export const isSpring2 = (assetId: string | undefined): boolean =>
  !!assetId &&
  (assetId.startsWith('chr_v3b2_') ||
    assetId.startsWith('chr_v3b3_') ||
    Object.values(V3_OWN_SETS).some((k) => assetId.startsWith(`chr_v3_${k}_`)));
/** Độ cứng của xương gấu vạt (khớp thứ hai của chuỗi `dtl_o_skirt_<k>_<l>`) so với khớp gốc. */
export const HEM_STIFF = 1.7;
/** Hệ số phình viên nang thân khi ngồi/đả tọa: vạt nằm lên trên đùi thay vì lún xuống. */
export const SIT_COLLIDER_SCALE = 1.3;
/** Hệ số buông tay tăng từ 0 (cẳng tay hướng xuống ≤ 0,5) đến 1 (≥ 0,9, tay buông thẳng). */
const ARM_DOWN_LO = 0.5;
const ARM_DOWN_HI = 0.9;
const _a0 = new THREE.Vector3();
const _a1 = new THREE.Vector3();
/** Thông số lò xo v2 (sửa được lúc chạy chỉ để quét tham số trong `springMetrics.test.ts`). */
export const SPRING2 = { hemStiff: HEM_STIFF, sitScale: SIT_COLLIDER_SCALE, arms: true, rMul: 1.3 };
/** Chỉnh riêng vạt theo bộ (khóa = tiền tố id asset): bộ có vạt dài/rộng hơn Lạc Kiếm cần góc lệch hẹp hơn, gấu cứng hơn, viên nang đùi lớn hơn. */
export interface SkirtTune {
  spring?: Partial<SpringParams>;
  /** Có khóa này thì chuỗi lò xo tay áo (`dtl_o_sleeve_*`) tách ra nhóm riêng với thông số hẹp/cứng hơn (voan tay áo rộng không văng thành mảng khi giơ tay). */
  sleeve?: Partial<SpringParams>;
  hemStiff?: number;
  rMul?: number;
}
/** Kiếm tu bậc cao (NV3-B, bản thử `tinh_khuyet_nu`): tay áo voan rộng + vạt dài. Tay áo: cứng hơn, cản mạnh, góc hẹp; viên nang đùi lớn hơn để vạt không sụp khi ngồi. */
const KIEM_TU_TUNE: SkirtTune = { rMul: 1.7, hemStiff: 2.0, sleeve: { stiffness: 260, drag: 14, maxAngle: 12, maxInward: 5 } };
export const SKIRT_TUNE: Record<string, SkirtTune> = {
  chr_v3_dan_tam_: { rMul: 1.5 },
  chr_v3_tinh_khuyet_nu: KIEM_TU_TUNE, // bản thử bind A-pose
  chr_v3_tinh_khuyet_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 1
  chr_v3_kinh_quang_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 1
  chr_v3_kinh_quang_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 1
  chr_v3_liet_mach_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 1
  chr_v3_liet_mach_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 1
  chr_v3_co_thanh_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_co_thanh_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_dia_long_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_dia_long_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_van_kinh_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_van_kinh_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 2 (Hộ pháp)
  chr_v3_luu_ly_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
  chr_v3_luu_ly_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
  chr_v3_phuc_mach_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
  chr_v3_phuc_mach_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
  chr_v3_than_tang_nam: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
  chr_v3_than_tang_nu: KIEM_TU_TUNE, // NV3-ROLL đợt 3 (Đan sư)
};
const skirtTuneOf = (id: string): SkirtTune | undefined => Object.entries(SKIRT_TUNE).find(([k]) => id.startsWith(k))?.[1];
/** Thông số riêng của vạt ở lò xo v2: góc lệch tối đa hẹp (12°) vì vạt nay do lò xo + va chạm điều khiển phần lớn (share 0,8): lệch rộng làm hai nửa vạt chéo nhau khi chạy. Tóc và tay áo giữ `V3_SPRING`. */
export const V3_SKIRT_SPRING2: SpringParams = { stiffness: 130, drag: 8, maxAngle: 12, maxInward: 8 };
/** Skin toàn thân đã có bản v3 (`ItemDef.skin` = `set_skin_<tên>`): asset `chr_v3_<tên>_<nu|nam>`. */
export const V3_SKINS: Readonly<Record<string, string>> = {
  set_skin_varkessa: 'chr_v3_varkessa_nu',
  set_skin_duskrella: 'chr_v3_duskrella_nu',
  set_skin_crimson: 'chr_v3_crimson_nam',
  set_skin_kings_demon: 'chr_v3_kings_demon_nu',
  set_skin_noxavyra: 'chr_v3_noxavyra_nu',
  set_skin_korvaden: 'chr_v3_korvaden_nam',
  set_skin_shadow_wolf: 'chr_v3_shadow_wolf_nam',
};
/**
 * Model v3 theo bộ trang bị đang mặc (`PlayerLook.set`, id trong sets.json): bộ có model riêng dùng `chr_v3_<bộ>_<nam|nu>`.
 * Bộ chưa có model riêng (bậc 1 trở lên) tạm dùng model cùng nhánh: kiếm tu → Lạc Kiếm, hộ pháp → Huyền Giáp, đan sư → Đan Tâm.
 * Không mặc bộ nào → Đồ Đệ Tử (đồ khởi đầu). Thêm bộ mới: thêm id vào `V3_OWN_SETS` (asset `chr_v3_<tên>_<giới>` phải có trong manifest).
 */
export const V3_OWN_SETS: Readonly<Record<string, string>> = {
  set_de_tu: 'de_tu',
  set_huyen_giap: 'huyen_giap',
  set_dan_tam: 'dan_tam',
  set_kinh_quang: 'kinh_quang',
  set_liet_mach: 'liet_mach',
  set_tinh_khuyet: 'tinh_khuyet',
  set_co_thanh: 'co_thanh',
  set_dia_giap: 'dia_long',
  set_van_kinh: 'van_kinh',
  set_luu_ly: 'luu_ly',
  set_phuc_mach: 'phuc_mach',
  set_than_tang: 'than_tang',
};
const V3_BRANCH_FALLBACK: Readonly<Record<string, string>> = {
  set_lac_kiem: 'lac_kiem',
  set_han_giao: 'lac_kiem',
  set_tran_khich: 'lac_kiem',
  set_tan_thiet: 'huyen_giap',
  set_tinh_dan_bao: 'dan_tam',
  set_vo_danh_kiem: 'lac_kiem',
  set_dong_dinh: 'huyen_giap',
  set_gioi_tri_dan: 'dan_tam',
};
/**
 * Khóa hiển thị v3 của một nhân vật (giới `g`, skin đang mặc nếu có, bộ trang bị `set`): MỘT nguồn cho cả model (`v3AssetOf`) và tranh cut-in (`v3SetKeyOf`).
 * Skin hợp lệ (đúng giới) → `skin:<tên skin>`; không mặc bộ → `de_tu`; bộ riêng → khóa của nó; bộ nhánh hoặc bộ lạ không có trong bảng → `lac_kiem` (model Lạc Kiếm).
 */
export function v3SetKeyOf(g: string, skin?: string, set?: string): string {
  const id = skin ? V3_SKINS[skin] : undefined;
  if (skin && id && id.endsWith(g === 'f' ? '_nu' : '_nam')) return `skin:${skin}`;
  if (!set) return 'de_tu';
  return V3_OWN_SETS[set] ?? V3_BRANCH_FALLBACK[set] ?? 'lac_kiem';
}
/** Asset v3 của một nhân vật (giới `g`, skin đang mặc nếu có, bộ trang bị `set`). Skin sai giới (server không cho mặc) bị bỏ qua. */
export function v3AssetOf(g: string, skin?: string, set?: string): string {
  const f = g === 'f';
  const key = v3SetKeyOf(g, skin, set);
  if (key.startsWith('skin:')) return V3_SKINS[key.slice(5)]!;
  if (key === 'lac_kiem') return f ? V3_MODELS.f : V3_MODELS.m;
  return `chr_v3_${key}_${f ? 'nu' : 'nam'}`;
}
/**
 * Tốc độ phát clip chạy: timeScale = tốc độ thật / JOG_SPEED. 5,4 m/s là giá trị đo trong game cho ÍT TRƯỢT CHÂN nhất (`pnpm shots chrv3 --slide`,
 * quét `?jog=`: 4,8 → trượt trung vị 1,4 m/s; 5,36 → 0,8; 6,0 → 1,1; 6,8 → 1,9, cả nam lẫn nữ). Số ước tính theo độ dài chân (4,3–4,7 m/s) KHÔNG khớp
 * thực tế nên không dùng.
 */
export const JOG_SPEED = 5.4;
const FADE = 0.16;
const COMBAT_HOLD = 4;
const SWING = ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C'];

/** Tốc độ phát clip chạy để chân trụ không trượt (kẹp [0,4; 2]). */
/** `?jog=<m/s>` ghi đè tốc độ chân trụ (chỉ để quét tham số khi đo trượt chân). */
const JOG_OVERRIDE = FLAGS.jog;
export function jogRate(speed: number): number {
  return Math.min(2, Math.max(0.4, speed / (JOG_OVERRIDE || JOG_SPEED)));
}

/** Clip nền theo trạng thái (hàm thuần, có test). */
export function baseClipOf(a: AnimState): string {
  if (a.dead) return 'Death01';
  if (a.meditating) return 'Sitting_Idle_Loop';
  if (a.flying || a.sky || a.airborne) return a.flying || a.sky ? 'NinjaJump_Idle_Loop' : 'Jump_Loop';
  if (a.casting) return 'Spell_Simple_Idle_Loop';
  if (a.speed > 0.3) return 'Jog_Fwd_Loop';
  return a.combat ? 'Sword_Idle' : 'Idle_Loop';
}

/** Kẹp trọng số < 1e-3 về 0 rồi chuẩn hóa tổng về 1 (tại chỗ). */
function snapMix<T extends object>(w: T): void {
  const r = w as Record<string, number>;
  let sum = 0;
  for (const k of Object.keys(r)) {
    if (r[k]! < 1e-3) r[k] = 0;
    sum += r[k]!;
  }
  if (sum > 0) for (const k of Object.keys(r)) r[k] = r[k]! / sum;
}

export interface MannequinTemplate {
  /** Pose chiêu K-5 retarget sang model này (null tới khi nguồn pose nạp xong). */
  bank: MannequinPoseBank | null;
  handle: AssetHandle;
  lib: AssetHandle;
  height: number;
  /** Clip UAL đã chỉnh độ cao hông theo nhân vật này. */
  clips: Map<string, THREE.AnimationClip>;
  /** Hình học do mẫu tự tạo (lưới LOD đã gộp): `dispose` khi bỏ mẫu. */
  owned: THREE.BufferGeometry[];
}

function restPos(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  return o ? o.position.clone() : null;
}

/** Asset dựng bằng `chr_v3.py --keep-original` (lưới/texture gốc Tripo): vật liệu cần chỉnh cho hợp ánh sáng game. */
export const KEEP_ORIGINAL_ASSETS: ReadonlySet<string> = new Set([
  'chr_v3_tinh_khuyet_nu',
  'chr_v3_tinh_khuyet_nam',
  'chr_v3_kinh_quang_nam',
  'chr_v3_kinh_quang_nu',
  'chr_v3_liet_mach_nam',
  'chr_v3_liet_mach_nu',
  'chr_v3_co_thanh_nam',
  'chr_v3_co_thanh_nu',
  'chr_v3_dia_long_nam',
  'chr_v3_dia_long_nu',
  'chr_v3_van_kinh_nam',
  'chr_v3_van_kinh_nu',
  'chr_v3_luu_ly_nam',
  'chr_v3_luu_ly_nu',
  'chr_v3_phuc_mach_nam',
  'chr_v3_phuc_mach_nu',
  'chr_v3_than_tang_nam',
  'chr_v3_than_tang_nu',
]);

/**
 * Tripo gán roughness thấp cho tóc (≈0,24) và metallic mặc định 1 (glTF khi thiếu hệ số): dưới nắng + env của game, da/tóc bóng như nhựa/cao su.
 * Nâng sàn roughness lên 0,55 (map G × 0,45 + 0,55, giữ vi biến thiên), giảm metalness hệ số về 0,5 (vàng trang sức vẫn kim loại), giảm env.
 * Màu (baseColor) giữ nguyên, đã là sRGB do GLTFLoader/KTX2Loader.
 */
function tuneTripoMaterial(m: THREE.MeshStandardNodeMaterial): void {
  if (m.roughnessMap) m.roughnessNode = texture(m.roughnessMap).g.mul(0.45).add(0.55);
  else m.roughness = Math.max(m.roughness, 0.6);
  m.metalness = 0.5;
  m.envMapIntensity = 0.55;
  // Da nhợt của Tripo (baseColor sáng ~0,8) bị nắng + env game thổi trắng/xám: hạ phản xạ khuếch tán một chút cho còn sắc hồng.
  // Ánh sáng game hơi lạnh (đo má: R−B từ 56 còn 29): bù ấm nhẹ (R giữ, G −15%, B −20%).
  m.color.setRGB(0.96, 0.82, 0.76);
  if (FLAGS.v3Side === 'double') m.side = THREE.DoubleSide;
  else if (FLAGS.v3Side === 'front') m.side = THREE.FrontSide;
  m.needsUpdate = true;
}

/**
 * Voan/mép vải hở của model giữ gốc có đỉnh COLOR_0 từ `chr_v3_c2.py`: R = mặt nạ voan, A = độ phủ (`c2.veilAlpha`, `c2.borderFade`).
 * - Độ phủ vẽ bằng dither màn hình (interleaved gradient noise, ổn định theo điểm ảnh, FXAA/pixelRatio 2 làm mịn): không sắp xếp tam giác trong một mesh,
 *   ghi độ sâu, không vỡ lỗ; mép răng cưa tan dần. Ít hạt hơn alpha hash theo vị trí.
 * - Voan sáng và không kim loại như tranh gốc: vật liệu Tripo chung dùng metalness 0,5 và tint ấm cho da/tóc, làm voan tối; mặt nạ gỡ cả hai.
 * - Tấm vải mỏng hai mặt. `?v3side=front|double` ghi đè mặt vẽ để so sánh.
 */
export const VEIL_LOOK = { gain: 1.4, lift: 0.07, sat: 0.85, metalness: 0.0 } as const;

/**
 * Độ bóng lụa cho voan (`V3Silk`, dữ liệu ở `packages/shared/src/v3silk.ts`): ánh viền fresnel pha màu vải ĐÃ NHUỘM (đọc `diffuseColor` sau `colorNode`,
 * nên nhuộm 3 kênh tự theo), vệt dị hướng Kajiya-Kay (sợi chạy dọc, +Y theo khung nhìn) theo hướng nắng, ánh xuyên khi ngược sáng, và độ trong nhẹ khi nhìn thẳng.
 * Tất cả nằm trong shader của vật liệu có sẵn (phát sáng cộng thêm + độ phủ), nhân mặt nạ voan: không thêm draw call hay texture.
 * `tier` 1 = chỉ ánh viền + độ trong; 2 = thêm vệt dị hướng và ánh xuyên. Thấp (0) không gọi hàm này.
 */
function silkNodes(silk: V3Silk, mask: ReturnType<typeof float>, tier: 1 | 2) {
  const n = normalView;
  const v = positionViewDirection;
  const nv = saturate(dot(n, v));
  const rim = pow(float(1).sub(nv), silk.sheenPow);
  const c = new THREE.Color(silk.sheenColor);
  const tintCol = mix(vec3(c.r, c.g, c.b), diffuseColor.rgb.mul(1.6), silk.tint);
  let glow = tintCol.mul(rim.mul(silk.sheen));
  if (tier === 2) {
    const l = normalize(transformDirection(skyParams.sunDir, cameraViewMatrix));
    const up = transformDirection(vec3(0, 1, 0), cameraViewMatrix);
    const t = normalize(up.sub(n.mul(dot(up, n))).add(vec3(1e-4, 0, 0)));
    const h = normalize(l.add(v));
    const th = dot(t, h);
    const kk = pow(sqrt(max(float(1).sub(th.mul(th)), float(0))), float(silk.anisoPow));
    const lit = smoothstep(-0.05, 0.35, dot(n, l));
    const streak = kk.mul(lit).mul(silk.aniso);
    // Ngược sáng: nắng xuyên qua lụa về phía mắt, mạnh ở mép (nv thấp).
    const back = pow(saturate(dot(v, l.negate())), float(3))
      .mul(float(0.35).add(rim.mul(0.65)))
      .mul(silk.back);
    glow = glow.add(skyParams.sunColor.mul(streak)).add(tintCol.mul(skyParams.sunColor).mul(back));
  }
  return { emissive: glow.mul(mask), clear: float(1).sub(nv.mul(nv).mul(silk.clear).mul(mask)) };
}

function applyVeilAlpha(root: THREE.Object3D, silk?: V3Silk, tier: 0 | 1 | 2 = 0): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.hasAttribute('color')) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const nm = m as THREE.MeshStandardNodeMaterial;
      const vc = attribute('color', 'vec4');
      const mask = vc.r;
      const base = nm.map ? texture(nm.map).rgb : vec3(1, 1, 1);
      const warm = vec3(nm.color.r, nm.color.g, nm.color.b);
      const tint = mix(warm, vec3(1, 1, 1), mask);
      const bright = base
        .mul(tint)
        .mul(mix(float(1), float(VEIL_LOOK.gain), mask))
        .add(mask.mul(VEIL_LOOK.lift));
      const luma = dot(bright, vec3(0.299, 0.587, 0.114));
      const lit = mix(bright, vec3(luma, luma, luma), mask.mul(1 - VEIL_LOOK.sat)); // voan nhạt màu như tranh gốc (texture Tripo sẫm hơn)
      nm.vertexColors = false; // màu đỉnh đọc tay (không nhân vào albedo)
      nm.colorNode = vec4(lit, 1);
      nm.metalnessNode = mix(float(nm.metalness), float(VEIL_LOOK.metalness), mask);
      nm.opacityNode = vc.a;
      if (silk && tier !== 0) {
        const sn = silkNodes(silk, mask, tier);
        const baseRough = nm.roughnessNode ?? float(nm.roughness);
        nm.roughnessNode = mix(baseRough, float(silk.roughness), mask);
        nm.emissiveNode = sn.emissive;
        nm.opacityNode = vc.a.mul(sn.clear);
      }
      const ign = fract(fract(dot(screenCoordinate, vec2(0.06711056, 0.00583715))).mul(52.9829189));
      nm.alphaTestNode = ign; // bỏ điểm ảnh khi độ phủ <= nhiễu (độ phủ 1 giữ nguyên)
      nm.alphaHash = false;
      nm.transparent = false;
      nm.depthWrite = true;
      if (FLAGS.v3Side !== 'front') nm.side = THREE.DoubleSide;
      nm.needsUpdate = true;
    }
  });
}

/** Clip riêng cho áo bào rộng (`tools/blender/anim_robe.py`): ghi đè clip cùng tên của thư viện UAL cho asset giữ gốc. */
export const ROBE_LIB = 'anim_robe';

export function mannequinTemplate(handle: AssetHandle, lib: AssetHandle, robe?: AssetHandle, patch?: AssetHandle): MannequinTemplate {
  const mats = adoptGltfMaterials(handle.scene);
  if (/^chr_v3b[23]?_lac_kiem/.test(handle.id)) for (const m of mats) applyV3Palette(m);
  if (KEEP_ORIGINAL_ASSETS.has(handle.id)) for (const m of mats) tuneTripoMaterial(m);
  if (KEEP_ORIGINAL_ASSETS.has(handle.id) && FLAGS.v3Veil) {
    const silk = FLAGS.v3Silk ? v3SilkOf(handle.id) : undefined;
    applyVeilAlpha(handle.scene, silk, silk ? silkTier(storedQuality()) : 0);
  }
  const look = SKIN_LOOKS[handle.id];
  if (look) for (const m of mats) applySkinLook(m, look);
  // Mặt nạ nhuộm theo xương (đầu/tay/tóc không nhuộm): thêm trước khi gộp lưới để mọi lưới cùng bộ thuộc tính.
  if (v3DyeRefOf(handle.id)) addDyeMask(handle.scene);
  // Sau khi đã đổi vật liệu: các lưới cùng LOD dùng chung một vật liệu thì gộp làm một (1 draw call mỗi người ở LOD1/LOD2).
  const owned = mergeLodMeshes(handle.scene);
  const box = new THREE.Box3().setFromObject(handle.scene);
  // Độ cao hông của nhân vật so với bộ xương mẫu của thư viện: chỉ kênh vị trí của pelvis bị nhân theo tỉ lệ.
  const a = restPos(handle.scene, 'pelvis');
  const b = restPos(lib.scene, 'pelvis');
  const k = a && b && b.length() > 1e-6 ? a.length() / b.length() : 1;
  const clips = new Map<string, THREE.AnimationClip>();
  const over = new Map<string, THREE.AnimationClip>();
  if (robe && KEEP_ORIGINAL_ASSETS.has(handle.id) && !FLAGS.noRobeAnim) for (const c of robe.animations) over.set(c.name, c);
  for (const c of lib.animations) {
    const cl = (over.get(c.name) ?? c).clone();
    for (const t of cl.tracks) {
      if (t.name === 'pelvis.position') {
        for (let i = 0; i < t.values.length; i++) t.values[i]! *= k;
        if (c.name === 'Sword_Dash') holdHipsInPlace(t.values);
      }
    }
    clips.set(c.name, cl);
  }
  // Clip Patch (`PM_*`, CC0): cùng bộ xương, đã bỏ root.translation; chỉ kênh vị trí của pelvis nhân theo tỉ lệ như clip UAL.
  if (patch)
    for (const c of patch.animations) {
      const cl = c.clone();
      for (const t of cl.tracks) if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i]! *= k;
      clips.set(c.name, cl);
    }
  const height = box.max.y - Math.max(box.min.y, 0);
  return { handle, lib, height, bank: null, clips, owned };
}

/** Bù góc dang vai/tay (rad) theo model khi áp clip UAL: tay áo rộng của Tripo bị tay clip ép xuyên; đo/chỉnh bằng `chrv3 --pen`. `?armfit=<độ>` ghi đè. */
/** Lạc Kiếm v3b2: tay áo rộng đâm vào thân nên cần dang nhiều hơn mặc định (góc tổng đã đo bằng `springMetrics`, docs/chr-v3-arm/README.md). */
export const ARM_FIT: Record<string, number> = {
  chr_v3b2_lac_kiem_nam: (16 * Math.PI) / 180,
  chr_v3b2_lac_kiem_nu: (16 * Math.PI) / 180,
  chr_v3b3_lac_kiem_nam: (16 * Math.PI) / 180,
  chr_v3b3_lac_kiem_nu: (16 * Math.PI) / 180,
  // Bộ dựng hàng loạt (đo `springMetrics` quét 5/12/16/22°, docs/chr-v3/README.md): Đồ Đệ Tử tay áo vừa nên ít phụ thuộc; Huyền Giáp là giáp (vai + hộ uyển nổi) cần dang nhiều hơn; Đan Tâm như Lạc Kiếm.
  chr_v3_de_tu_nam: (10 * Math.PI) / 180,
  chr_v3_de_tu_nu: (10 * Math.PI) / 180,
  chr_v3_huyen_giap_nam: (20 * Math.PI) / 180,
  chr_v3_huyen_giap_nu: (20 * Math.PI) / 180,
  chr_v3_dan_tam_nam: (16 * Math.PI) / 180,
  chr_v3_dan_tam_nu: (16 * Math.PI) / 180,
  // Kiếm tu bậc cao (NV3-B, bind A-pose `--bind-a`): lưới không bị ép sang T nên không cần bù góc dang (0); chỉnh lại sau khi đo `springMetrics`.
  chr_v3_kinh_quang_nam: 0,
  chr_v3_kinh_quang_nu: 0,
  chr_v3_liet_mach_nam: 0,
  chr_v3_liet_mach_nu: 0,
  chr_v3_tinh_khuyet_nam: 0,
  chr_v3_tinh_khuyet_nu: 0,
  chr_v3_co_thanh_nam: 0,
  chr_v3_co_thanh_nu: 0,
  chr_v3_dia_long_nam: 0,
  chr_v3_dia_long_nu: 0,
  chr_v3_van_kinh_nam: 0,
  chr_v3_van_kinh_nu: 0,
  chr_v3_luu_ly_nam: 0,
  chr_v3_luu_ly_nu: 0,
  chr_v3_phuc_mach_nam: 0,
  chr_v3_phuc_mach_nu: 0,
  chr_v3_than_tang_nam: 0,
  chr_v3_than_tang_nu: 0,
};
export const ARM_FIT_DEFAULT = ((FLAGS.armFit ?? 5) * Math.PI) / 180;

/** `?v3off=proc,feet,twist,cloth` tắt từng hệ phụ của v3 để cô lập lỗi hình (chẩn đoán). */
const V3_OFF = new Set(FLAGS.v3Off);
/** Số suất LOD0 theo tổng tam giác: mỗi 34.000 tam giác một suất (99.518 → 3, 24.000 → 1). */
export function lod0Slots(tris: number): number {
  return Math.max(1, Math.ceil(tris / 34000));
}
let phaseSeq = 0;
const IDENT = new THREE.Matrix4();
const _w = new THREE.Quaternion();
const _pw = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Xoay xương quanh trục THẾ GIỚI `axis` một góc `ang` (cộng thêm lên tư thế mixer vừa đặt). Cần ma trận thế giới của cha mới. */
function rotateWorld(bone: THREE.Object3D | null, axis: THREE.Vector3, ang: number): void {
  if (!bone || !bone.parent || Math.abs(ang) < 1e-5) return;
  bone.parent.getWorldQuaternion(_pw);
  _w.setFromAxisAngle(axis, ang);
  // q_local' = inv(parentW) · R · parentW · q_local
  bone.quaternion.premultiply(_pw).premultiply(_w).premultiply(_pw.invert());
}
const _sm0 = new THREE.Vector3();
const _sm1 = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _tq2 = new THREE.Quaternion();
/** Lò xo v3 (vạt dài + tóc): cứng vừa, cản nhiều, góc lệch hẹp để vạt không xé/xuyên khi ngồi, lăn, chém (N-4). */
/** góc lệch tối đa (độ) mỗi đốt của chuỗi `tassel`: 20° cho biên độ đỉnh ≈ 0,7 rad khi chạy→dừng (đo: 42° chung nhóm tóc 1,04; 28° 0,94 rad). */
export const TASSEL_MAX_ANGLE = 20;
export const V3_SPRING: SpringParams = { stiffness: 130, drag: 8, maxAngle: 30, maxInward: 8 };

/**
 * Viên nang va chạm cho vạt/tay áo (N-6): hông (pelvis → spine_01), đùi (thigh → calf), cẳng (calf → foot), bán kính theo chiều cao.
 * Khi ngồi/đả tọa đùi nằm ngang nên vạt trước bị đẩy lên phủ trên đùi thay vì xuyên xuống.
 */
export function colliderDefs(rig: THREE.Object3D, height: number, arms = false, rMul = 1): SpringCollider[] {
  const k = height / 1.8;
  const spec: [string, string, number][] = [['pelvis', 'spine_01', 0.11]];
  for (const sd of ['l', 'r']) spec.push([`thigh_${sd}`, `calf_${sd}`, 0.085], [`calf_${sd}`, `foot_${sd}`, 0.06]);
  const out: SpringCollider[] = [];
  for (const [a, b, r] of spec) {
    const na = rig.getObjectByName(a);
    const nb = rig.getObjectByName(b);
    if (na && nb) out.push({ a: na, b: nb, r: r * k * rMul });
  }
  if (arms) {
    // Tay (cánh tay, cẳng tay): vạt không xuyên tay khi chém/xoay; không phình khi ngồi.
    for (const sd of ['l', 'r']) {
      for (const [a, b, r] of [
        [`upperarm_${sd}`, `lowerarm_${sd}`, 0.05],
        [`lowerarm_${sd}`, `hand_${sd}`, 0.04],
      ] as [string, string, number][]) {
        const na = rig.getObjectByName(a);
        const nb = rig.getObjectByName(b);
        if (na && nb) out.push({ a: na, b: nb, r: r * k, fixed: true });
      }
    }
  }
  return out;
}

/** Xương twist (chr_v3.py): `<limb>_twist_<l|r>` là con của `<limb>_<l|r>`; trục xoắn = hướng tới xương con chính của limb. */
const TWIST_NEXT: Record<string, string> = { upperarm: 'lowerarm', lowerarm: 'hand', thigh: 'calf' };
/** Hệ số xoay ngược của xương twist so với góc xoắn của xương cha (đỉnh gần đầu xương chỉ xoắn ~1/3, gần cuối xoắn đủ). */
export const TWIST_COUNTER = -0.8;

interface Twist {
  limb: THREE.Object3D;
  tw: THREE.Object3D;
  axis: THREE.Vector3;
  restLimb: THREE.Quaternion;
  restTw: THREE.Quaternion;
}

/** Góc xoắn (rad, [-π, π]) của `q` quanh trục đơn vị `axis` (tách swing-twist). */
export function twistAngle(q: THREE.Quaternion, axis: THREE.Vector3): number {
  const a = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
  return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;
}
let shadowMat: THREE.MeshStandardNodeMaterial | null = null;
function shadowMaterial(): THREE.MeshStandardNodeMaterial {
  if (!shadowMat) {
    shadowMat = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color('#2a1d3a'),
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
  }
  return shadowMat;
}

export class MannequinCharacter implements CharacterView {
  /** Bật tỉ lệ đọc từ trên (C2): phóng vai, tay, đầu, bàn tay cầm kiếm bằng scale xương, không sửa model. Chỉ gọi cho người chơi. */
  enableProportions(): void {
    this.proportions = proportionBones(this.rig, boneKey);
  }

  readonly root = new THREE.Group();
  readonly hit: HitReact;
  readonly height: number;
  /** Cờ nhận diện cho kịch bản quay video (tools/perf/src/scenarios/chrv3.ts). */
  readonly v3 = true;
  get hasSword(): boolean {
    return !!this.blade;
  }
  grounded = true;
  steps = 0;
  /** Tỉ lệ đọc từ trên (C2): xương cần scale mỗi khung sau mixer (chỉ người chơi, xem `enableProportions`). */
  private proportions: BoneScale[] = [];
  attacks = 0;
  private inner = new THREE.Group();
  private rig: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private lods: THREE.Mesh[][] = [];
  private lodDist: [number, number] = [22, 55];
  private interval = 0;
  private acc = mixerPhase(++phaseSeq, 1 / 12);
  private base: THREE.AnimationAction | null = null;
  private baseName = '';
  private shot: THREE.AnimationAction | null = null;
  private combatT = 0;
  private swing = 0;
  private lastPhase = 0;
  private dead = false;
  /** Động tác chiêu K-5 đang phát (nửa trên chồng lên nền, nửa dưới theo pose khi đứng yên hoặc theo clip chạy khi đang đi). */
  private perf: {
    id: string;
    pose: MqPose;
    upper: THREE.AnimationAction;
    lower: THREE.AnimationAction;
    lowerBase: THREE.AnimationAction | null;
    t: number;
    end: number;
    timing?: PerformOpts['timing'];
    skill: string;
    combo: number;
    fired: number;
    env: number;
    recovered?: boolean;
    /** Đã hủy (phá niệm/lướt/di chuyển): không phát thêm `hit`, tắt dần nhanh. */
    cancelled?: boolean;
  } | null = null;
  /** Đòn UAL dự phòng đang phát và mốc chém của nó (sự kiện `hitAt`, NV3-A3). */
  private atk: {
    act: THREE.AnimationAction;
    hit: number;
    dur: number;
    t: number;
    fired: boolean;
    rec: boolean;
    skill: string;
    combo: number;
    kb: boolean;
  } | null = null;
  private pendingPerform: { id: string; left: number; o: PerformOpts } | null = null;
  /** Nghe sự kiện chiêu (VFX, âm, rung camera theo `hitAt`), engine gắn vào. */
  onSkillEvent: ((e: SkillEvent) => void) | null = null;
  private springs: SpringBones | null = null;
  private spring2 = false;
  /** Lò xo vạt riêng của asset v2 (null với v3/v3b: vạt nằm chung trong `springs`). */
  private skirtSprings: SpringBones | null = null;
  private sleeveSprings: SpringBones | null = null;
  /** Dải đai/ngọc bội (`dtl_o_tassel_*`, chr_v3b3): nhóm riêng, góc hẹp hơn tóc (đo b3: 1,0 rad khi chung nhóm tóc, đích ~0,7 như tóc). */
  private tasselSprings: SpringBones | null = null;
  /** Số suất LOD0 mà nhân vật này chiếm (entities.applyLodBudget): LOD0 gốc Tripo ~100k tam giác (gồm cả mesh `_oldsleeve`) tính 3 suất (`lod0Slots`: ≤4 người LOD0 trong ngân sách 12). */
  get lod0Cost(): number {
    let tris = 0;
    for (const m of this.lods[0] ?? []) {
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
    return lod0Slots(tris);
  }
  /** Số suất LOD1 (entities.applyLodBudget, N-7): mỗi 12.000 tam giác LOD1 một suất (model bậc cao ~24k = 2, cơ bản 12k = 1). */
  get lod1Cost(): number {
    let tris = 0;
    for (const m of this.lods[1] ?? []) {
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
    return Math.max(1, Math.round(tris / 12000));
  }
  /**
   * "Đỗ rig" ở LOD2 (N-7): cả cây `rig` (xương + mọi lưới) rời khỏi cảnh, riêng lưới LOD2 gắn thẳng vào `inner` ở `DetachedBindMode`.
   * three không còn duyệt ~120 xương mỗi khung để tính ma trận thế giới, và `skeleton.update()` chỉ chạy khi mixer vừa chạy (8 Hz ở LOD2).
   * Xương khi đỗ nằm trong hệ tọa độ của model (rig không có cha), nên mọi thứ đọc vị trí thế giới của xương (kiếm, IK chân, lò xo: chỉ
   * LOD0/LOD1) không dùng được trong lúc đỗ. Cùng ý với `detachRig` + `skipUnchangedSkeletons` của `SkinnedCharacter`.
   */
  private parkedLevel = 0;
  /** Kiếm đang được `inner` giữ (không còn là con của xương) khi đỗ ở LOD1: vị trí tính từ ma trận xương mỗi lần mixer chạy. */
  private bladeHomed = false;
  private parked:
    { m: THREE.SkinnedMesh; home: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }[] | null = null;
  /** Tăng mỗi lần tư thế xương đổi lúc đang đỗ; `skeleton.update()` của lưới đỗ bỏ qua khi phiên bản chưa đổi. */
  private parkVersion = 0;
  /** Vải mô phỏng Thiên Y (null nếu tắt hoặc model không có vải cũ tách riêng). */
  cloth: ClothRig | null = null;
  private clothSit = 0;
  private colScale = 1;
  private twists: Twist[] = [];
  private lodLevel = 0;
  /** Khoảng cách camera và cờ nhân vật của mình từ lần `setView` gần nhất (chọn suất IK chân theo gần camera). */
  private viewDist = 0;
  private viewSelf = true;
  /** Kiếm: vỏ trên lưng (`dtl_scabbard`) khi nghỉ, nắm tay (`dtl_sword`) khi giao chiến. */
  private blade: THREE.Mesh | null = null;
  private bladeLen = 0;
  /** Vũ khí thủ tục thay kiếm theo hướng tu (đao lớn Đao tu, sáo Cổ tu), dựng khi cần; kiếm gốc để trả lại khi đổi hướng. */
  private held = new Map<string, { mesh: THREE.Mesh; len: number }>();
  private heldKey = '';
  /** Cổ tu: hũ cổ treo hông (SkinnedMesh) và trạng thái bật riêng (chỉ vẽ ở LOD0). */
  private coGear: BrawlerGear | null = null;
  private coOn = false;
  private origBlade: { mesh: THREE.Mesh; len: number } | null = null;
  /** Lôi tu: tia điện dọc kiếm (con của mesh kiếm), dựng lười khi bật lần đầu. */
  private arc: SwordArc | null = null;
  /** Thân Pháp T4: nét kéo lưỡi kiếm ở đường chém của pose `_tp` (tạo lười). */
  private smear: BladeSmear | null = null;
  private arcOn = false;
  private scabbard: THREE.Object3D | null = null;
  private hand: THREE.Object3D | null = null;
  private qScab = new THREE.Quaternion();
  /** Dịch kiếm đeo lưng (không gian xương vỏ): hạ chuôi xuống ngang vai thay vì lên tới đỉnh đầu với model cao/tóc búi cao. */
  private posScab = new THREE.Vector3();
  private qHand = new THREE.Quaternion();
  private drawn = false;
  /** Đòn nối tiếp sau đòn hiện tại (ngã → đứng dậy). */
  private chain: string | null = null;
  private frozenMix = new Map<THREE.AnimationAction, number>();
  private swingBase = 0;
  private locoCycles = 1;
  private shadow = false;
  private weights = new Map<THREE.AnimationAction, number>();
  /** Thời gian crossfade của cặp clip nền hiện tại (xfade). */
  private fadeDur = FADE;
  /** Clip đi bộ/chạy nhanh chạy cùng clip chạy (trộn theo tốc độ, chung pha). */
  private companions: THREE.AnimationAction[] = [];
  private loco = false;
  private locoPhase = 0;
  /** Bảng dải tốc độ đang dùng (UAL hoặc clip Patch, `patchLoop.ts`): chốt lúc vào chế độ chạy. */
  private locoTable: LocoTable = LOCO;
  private mix = { walk: 0, jog: 1, sprint: 0 };
  /** Trọng số bốn hướng đi (làm mượt) và dải/hướng của từng action đi-chạy (A1: đi lùi, đi ngang, chéo). */
  private dir: DirMix = { f: 1, b: 0, l: 0, r: 0 };
  /** Chân bám đất + bước chân khi xoay tại chỗ (A2); null với bóng hoặc asset thiếu xương chân. */
  private feet: MqFeet | null = null;
  private lowerPick: THREE.AnimationAction | null = null;
  private locoKey = new Map<THREE.AnimationAction, { band: LocoBand; dir: LocoDirKey }>();
  /** Đòn UAL dự phòng chỉ nửa trên khi đang chạy; chân theo clip nền (nửa dưới). */
  private shotUpper = false;
  private shotLower: THREE.AnimationAction | null = null;
  private shotLowerSrc: THREE.AnimationAction | null = null;
  private shotLowerW = 0;
  // Lớp phụ sau mixer (A/C): nghiêng khi rẽ, xoay tại chỗ, thở, nhìn mục tiêu, giật khi trúng đòn, bù tay.
  private bones: Record<string, THREE.Object3D | null> = {};
  /** Xương đầu của Mannequin (tên 'Head' viết hoa: `bones.head` không bao giờ tìm thấy). */
  private headBone: THREE.Object3D | null = null;
  private lastYaw = NaN;
  private yawRate = 0;
  private lean = 0;
  /** T2: tốc độ khung trước và gia tốc đã làm mượt; T3: thời gian đứng yên liên tục và mốc idle kế. */
  private lastSpeed = 0;
  private loco2 = new LocoImpulse();
  /** Clip Patch: máy trạng thái bắt đầu/dừng/thở dốc và clip đang phát. */
  private patchMove = new PatchMove();
  private patchShot: THREE.AnimationAction | null = null;
  private patchKind: PatchEventKind | null = null;
  /** T5: ragdoll nhẹ (tạo lười ở lần trúng đòn đầu khi bật cờ). */
  private rag: RagRig | null = null;
  private accel = 0;
  private stillT = 0;
  private idleAfter = 7;
  /** Tư thế nghỉ của các xương cường điệu (Thân Pháp T1), chụp lúc dựng rig. */
  private exagRest = new Map<string, THREE.Quaternion>();
  private turnLag = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private flinch = { amp: 0, age: 9, pitch: -1, roll: 0 };
  /** Hướng đòn trúng gần nhất (từ người đánh tới mình) và giờ (clock); dùng cho ngã chết theo hướng (C3b). */
  private lastHit = { dx: 0, dz: 0, at: -99 };
  /** Xoay thân phụ lúc chết (rad) và tiến độ: đổ ra xa người hạ gục. */
  private deathTurn = { to: 0, t: 1 };
  /** Lướt hiển thị (NV3-A4): hình xuất phát ở (fx, fz) thế giới rồi trượt về chỗ thật trong `dur` giây. */
  private dashOff: { fx: number; fz: number; t: number; dur: number } | null = null;
  private clock = Math.random() * 10;
  private side = 1;
  private armFit = 0;
  /** Thể tu: bind của các xương gắn găng/giáp (chụp lúc dựng) và bộ găng khi đã gắn. */
  private gearBind: BindSnapshot | null = null;
  private gear: BrawlerGear | null = null;
  private gearAncient = false;
  /** Hướng tu hiện tại là Thể tu (găng/giáp chỉ vẽ khi đang ở LOD gần: một người xa không đáng một draw call). */
  private gearOn = false;
  private disposed = false;

  constructor(
    private tpl: MannequinTemplate,
    /** `true` = bóng tâm ma (vật liệu bóng chung); một vật liệu = linh thể (nguyên anh, thân xác, phân thân) dùng vật liệu đó. */
    ghost: boolean | THREE.Material = false,
    sword: SwordTemplate | null = null,
    /** Vật liệu thân thay cho vật liệu mẫu (bản đã nhuộm, N-7); không đổi cách dựng như `ghost`. */
    bodyMat: THREE.Material | null = null,
  ) {
    const shadow = !!ghost;
    const ghostMat = ghost === true ? shadowMaterial() : ghost || bodyMat;
    this.height = tpl.height;
    this.shadow = shadow;
    this.spring2 = isSpring2(tpl.handle.id);
    this.rig = cloneSkinned(tpl.handle.scene);
    assets.trackInstance(tpl.handle.id, this.rig); // vị trí thật cho thứ tự nạp texture bậc cao (game/hires)
    const meshes: THREE.Mesh[] = [];
    this.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const lv = lodOf(o, this.rig);
      (this.lods[lv] ??= []).push(m);
      m.frustumCulled = false;
      if (ghostMat) m.material = ghostMat;
      meshes.push(m);
    });
    for (let i = 0; i < this.lods.length; i++) this.lods[i] ??= [];
    // Nhóm bọc lưới nhiều primitive mang `userData.lod` và bị `AssetCache` ẩn sẵn (lod > 0): bật lại, hiển thị theo LOD do từng lưới con quyết định.
    this.rig.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh && typeof o.userData.lod === 'number') o.visible = true;
    });
    // Thiên Y: mesh vải cũ tách riêng (`*_oldskirt`, `*_oldsleeve`) do chr_v3.py --split-cloth; có `?cloth=1` thì thay bằng vải mô phỏng, không thì hiện như thường.
    // Hướng lai: giữ váy Tripo (lò xo), chỉ thay voan tay áo (`*_oldsleeve`) bằng panel vải mô phỏng.
    const oldCloth = meshes.filter((m) => /_oldsleeve/.test(m.name));
    if (FLAGS.cloth && !shadow && oldCloth.length) {
      try {
        // Texture đã bake (tools/asset-pipeline/src/thienybake.ts) nếu có; chưa có thì vải màu trơn.
        const map = new THREE.TextureLoader().load(`${ASSET_BASE}thien_y/${tpl.handle.id}.png`, undefined, undefined, () => undefined);
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false;
        this.cloth = new ClothRig(this.rig, this.root, tpl.height, oldCloth, { map });
        this.lods[0] = (this.lods[0] ?? []).filter((m) => !oldCloth.includes(m));
      } catch (e) {
        thienYLog.warn('bỏ qua vải mô phỏng:', e instanceof Error ? e.message : e);
      }
    }
    this.applyLod(0);
    const defs: SpringDef[] = [];
    this.rig.traverse((o) => {
      if (!(o as THREE.Bone).isBone || !o.name.startsWith('dtl_o_')) return;
      const child = o.children.find((c) => (c as THREE.Bone).isBone);
      defs.push({
        bone: o.name,
        tailLocal: (child ?? o).position.clone(),
        ...(this.spring2 && /^dtl_o_skirt_\d+_[1-9]$/.test(o.name) && { stiff: skirtTuneOf(tpl.handle.id)?.hemStiff ?? SPRING2.hemStiff }),
      });
    });
    if (this.spring2) {
      // Lò xo v2: vạt tách riêng (góc hẹp, gấu cứng hơn, viên nang tay + đùi phình khi ngồi); tóc và tay áo như cũ.
      const tune = skirtTuneOf(tpl.handle.id);
      const isSleeve = (n: string) => n.startsWith('dtl_o_sleeve_');
      const skirt = defs.filter((d) => d.bone.startsWith('dtl_o_skirt_'));
      const sleeve = tune?.sleeve ? defs.filter((d) => isSleeve(d.bone)) : [];
      const tassel = defs.filter((d) => d.bone.startsWith('dtl_o_tassel_'));
      const rest = defs.filter(
        (d) => !d.bone.startsWith('dtl_o_skirt_') && !d.bone.startsWith('dtl_o_tassel_') && !(tune?.sleeve && isSleeve(d.bone)),
      );
      if (tassel.length && !shadow)
        this.tasselSprings = new SpringBones(
          this.rig,
          tassel,
          { ...(ANIM_FX.spring ? SPRING_TP : V3_SPRING), maxAngle: TASSEL_MAX_ANGLE },
          colliderDefs(this.rig, tpl.height),
        );
      if (rest.length && !shadow)
        this.springs = new SpringBones(this.rig, rest, ANIM_FX.spring ? SPRING_TP : V3_SPRING, colliderDefs(this.rig, tpl.height));
      if (sleeve.length && !shadow)
        this.sleeveSprings = new SpringBones(this.rig, sleeve, { ...V3_SPRING, ...tune!.sleeve }, colliderDefs(this.rig, tpl.height));
      if (skirt.length && !shadow)
        this.skirtSprings = new SpringBones(
          this.rig,
          skirt,
          { ...V3_SKIRT_SPRING2, ...skirtTuneOf(tpl.handle.id)?.spring },
          colliderDefs(this.rig, tpl.height, SPRING2.arms, skirtTuneOf(tpl.handle.id)?.rMul ?? SPRING2.rMul),
        );
    } else if (defs.length && !shadow) this.springs = new SpringBones(this.rig, defs, V3_SPRING, colliderDefs(this.rig, tpl.height));
    for (const sd of ['l', 'r']) {
      for (const [limb, next] of Object.entries(TWIST_NEXT)) {
        const L = this.rig.getObjectByName(`${limb}_${sd}`);
        const tw = this.rig.getObjectByName(`${limb}_twist_${sd}`);
        const child = this.rig.getObjectByName(`${next}_${sd}`);
        if (!L || !tw || !child) continue;
        this.twists.push({
          limb: L,
          tw,
          axis: child.position.clone().normalize(),
          restLimb: L.quaternion.clone(),
          restTw: tw.quaternion.clone(),
        });
      }
    }
    for (const n of [
      'pelvis',
      'spine_01',
      'spine_02',
      'spine_03',
      'neck_01',
      'head',
      'upperarm_l',
      'upperarm_r',
      'lowerarm_l',
      'lowerarm_r',
      'clavicle_l',
      'clavicle_r',
    ])
      this.bones[n] = this.rig.getObjectByName(n) ?? null;
    for (const n of Object.keys(EXAG_GAIN)) {
      const bn = this.bones[n];
      if (bn) this.exagRest.set(n, bn.quaternion.clone());
    }
    {
      const th = this.rig.getObjectByName('thigh_l');
      this.rig.updateMatrixWorld(true);
      if (th) this.side = Math.sign(th.getWorldPosition(new THREE.Vector3()).sub(this.rig.getWorldPosition(new THREE.Vector3())).x) || 1;
      this.armFit = ARM_FIT[tpl.handle.id] ?? ARM_FIT_DEFAULT;
    }
    this.headBone = this.rig.getObjectByName('Head') ?? null;
    this.scabbard = this.rig.getObjectByName('dtl_scabbard') ?? null;
    this.hand = this.rig.getObjectByName('dtl_sword') ?? null;
    if (sword && !shadow && this.scabbard && this.hand) {
      this.rig.updateMatrixWorld(true);
      // Hướng mũi kiếm lúc nghỉ (không gian xương): vỏ chéo xuống lưng, cầm tay thì lưỡi hướng lên; mesh kiếm có mũi +Y, chuôi ở gốc.
      const align = (bone: THREE.Object3D, dir: THREE.Vector3, out: THREE.Quaternion): void => {
        const qb = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
        out.copy(qb).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      };
      align(this.scabbard, new THREE.Vector3(-0.12, -0.55, -0.1), this.qScab);
      if (KEEP_ORIGINAL_ASSETS.has(tpl.handle.id)) {
        // chuôi đang ở ~đỉnh đầu (1,75 m): hạ 0,3 m × tỉ lệ cao theo trục thế giới
        const qb = this.scabbard.getWorldQuaternion(new THREE.Quaternion()).invert();
        this.posScab.set(0, -0.3 * (tpl.height / 1.7), 0).applyQuaternion(qb);
      }
      align(this.hand, new THREE.Vector3(0, 1, 0), this.qHand);
      this.blade = sword.mesh.clone();
      this.blade.frustumCulled = false;
      this.bladeLen = sword.info.len;
      this.mountBlade(false);
    }
    if (!shadow) this.gearBind = snapshotBind(this.rig);
    if (V3_ANIM && !shadow && FLAGS.v3Feet) this.feet = MqFeet.from(this.rig, this.root, tpl.height);
    this.inner.add(this.rig);
    this.root.add(this.inner);
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.hit = new HitReact(meshes);
    this.mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action !== this.shot) return;
      this.shot = null;
      const next = this.chain;
      this.chain = null;
      if (next && !this.dead) this.oneShot(next);
    });
    this.play('Idle_Loop');
    this.mixer.update(0);
  }

  /** Hóa hình Cổ Thần (TN-5): phóng cả thân theo `k` (gốc mannequin không đặt tỉ lệ nên 1 = bình thường). */
  setGiant(k: number): void {
    if (this.disposed || this.shadow) return;
    if (this.root.scale.x !== k) this.root.scale.setScalar(k);
  }

  /** Hướng tu Thể tu: tay không, găng + giáp nhẹ (dựng lần đầu khi cần). Bỏ thì ẩn, không dựng lại. */
  setBrawlerGear(on: boolean, ancient = false): void {
    if (this.disposed || this.shadow) return;
    this.gearOn = on;
    // Đổi giữa Thể tu và Cổ Thần: dựng lại bộ giáp theo biến thể (hiếm, chỉ khi đổi công pháp).
    if (this.gear && this.gearAncient !== ancient) {
      this.gear.dispose();
      this.gear = null;
    }
    this.gearAncient = ancient;
    if (on && !this.gear && this.gearBind) this.gear = attachBrawlerGear(this.rig, this.gearBind, this.height, ancient);
    this.gear?.setVisible(gearShown(on, this.lodLevel));
    if (this.blade) this.blade.visible = !on && this.lodLevel < 2;
  }

  /** Đổi vũ khí trong tay/trên lưng theo hướng tu: `key` rỗng = trả kiếm gốc. */
  private swapHeld(key: string, make: () => { mesh: THREE.Mesh; len: number }): void {
    if (this.disposed || this.shadow || !this.blade) return;
    if (!this.origBlade && !this.heldKey) this.origBlade = { mesh: this.blade, len: this.bladeLen };
    let want = this.origBlade;
    if (key) {
      if (!this.held.has(key)) this.held.set(key, make());
      want = this.held.get(key)!;
    }
    this.heldKey = key;
    if (!want || want.mesh === this.blade) return;
    this.blade.removeFromParent();
    this.blade = want.mesh;
    this.bladeLen = want.len;
    this.blade.visible = true;
    this.mountBlade(this.drawn);
    if (this.arcOn) this.syncArc();
  }

  /** Hướng tu cầm đao lớn (Đao tu): thay cây kiếm trong tay/trên lưng bằng đao lớn thủ tục; tắt thì trả kiếm gốc. */
  setGreatBlade(on: boolean): void {
    if (on) this.swapHeld('great', () => greatbladeMesh(this.height));
    else if (this.heldKey === 'great') this.swapHeld('', () => greatbladeMesh(this.height));
  }

  /** Hướng tu Cấm chế sư: cờ trận thay cây kiếm trong tay/trên lưng; tắt thì trả kiếm gốc. */
  setTranKy(on: boolean): void {
    if (this.disposed || this.shadow) return;
    if (on) this.swapHeld('tranky', () => tranKyMesh(this.height));
    else if (this.heldKey === 'tranky') this.swapHeld('', () => tranKyMesh(this.height));
  }

  /** Lôi tu: tia điện nhẹ dọc kiếm, kể cả kiếm đeo lưng (chỉ LOD0 và không phải bóng). Tắt thì gỡ khỏi kiếm. */
  setWeaponArc(on: boolean): void {
    if (this.disposed || this.shadow || on === this.arcOn) return;
    this.arcOn = on;
    this.syncArc();
  }

  private syncArc(): void {
    if (!this.arcOn || !this.blade) {
      this.arc?.detach();
      return;
    }
    this.arc ??= new SwordArc();
    this.arc.attach(this.blade, this.bladeLen);
    this.arc.setVisible(this.lodLevel === 0 && !this.gearOn);
  }

  /** Hướng tu Cổ tu: sáo cổ thay kiếm + hũ cổ treo hông trái (chỉ vẽ ở LOD0). Tắt thì trả kiếm gốc, ẩn hũ. */
  setCoGear(on: boolean): void {
    if (this.disposed || this.shadow) return;
    if (on) this.swapHeld('flute', () => fluteMesh(this.height));
    else if (this.heldKey === 'flute') this.swapHeld('', () => fluteMesh(this.height));
    this.coOn = on;
    if (on && !this.coGear && this.gearBind) this.coGear = attachCoGear(this.rig, this.gearBind, this.height);
    this.coGear?.setVisible(gearShown(on, this.lodLevel));
  }

  private mountBlade(drawn: boolean): void {
    if (!this.blade) return;
    this.drawn = drawn;
    const bone = drawn ? this.hand : this.scabbard;
    this.blade.matrixAutoUpdate = true;
    this.bladeHomed = false;
    bone?.add(this.blade);
    if (drawn) this.blade.position.set(0, 0, 0);
    else this.blade.position.copy(this.posScab);
    this.blade.quaternion.copy(drawn ? this.qHand : this.qScab);
    if (this.parked && this.parkedLevel === 1) this.homeBlade();
  }

  /** Đỗ rig ở LOD1: kiếm rời xương, gắn vào `inner`; `placeBlade` đặt lại theo ma trận xương mỗi lần mixer chạy. */
  private homeBlade(): void {
    const blade = this.blade;
    if (!blade) return;
    this.inner.add(blade);
    blade.matrixAutoUpdate = false;
    this.bladeHomed = true;
    this.placeBlade();
  }

  private placeBlade(): void {
    const blade = this.blade;
    const bone = this.drawn ? this.hand : this.scabbard;
    if (!blade || !bone) return;
    // Rig đỗ không có cha: `matrixWorld` của xương chính là ma trận trong hệ model (= hệ của `inner`).
    blade.matrix.compose(blade.position, blade.quaternion, blade.scale).premultiply(bone.matrixWorld);
    blade.matrixWorldNeedsUpdate = true;
  }

  private applyLod(level: number, self = true): void {
    const shown = Math.min(level, this.lods.length - 1);
    // Bóng đổ như v1: chỉ LOD0 (pass bóng vẽ lại cả lưới). Model bậc cao ~99k tam giác của NGƯỜI KHÁC không đổ bóng (N-7: mỗi model
    // thêm ~100k tam giác mỗi tầng bóng); nhân vật mình luôn đổ. Bóng tâm ma/linh thể trong mờ không đổ.
    const cast = shown === 0 && !this.shadow && (self || this.lod0Cost <= 1);
    for (let i = 0; i < this.lods.length; i++)
      for (const m of this.lods[i]!) {
        m.visible = i === shown;
        m.castShadow = cast && i === 0;
      }
    // Kiếm (một draw call mỗi người) ẩn ở LOD xa nhất: ngoài ~55 m không còn thấy.
    // Thể tu đánh tay không: kiếm ẩn hẳn (`setBrawlerGear`), không để lượt LOD bật lại.
    if (this.blade) this.blade.visible = level < 2 && !this.gearOn;
    this.arc?.setVisible(level === 0 && !this.gearOn);
  }

  /** Đang đỗ rig (LOD1–2): xương ở hệ tọa độ model, không đọc được vị trí thế giới. */
  get rigParked(): boolean {
    return !!this.parked;
  }

  /**
   * Đỗ rig theo mức LOD: 0 = không đỗ (rig trong cảnh), 1 hoặc 2 = đỗ và vẽ lưới LOD tương ứng (LOD1 cần chuyển kiếm sang `inner`, xem `homeBlade`).
   * Đổi mức đỗ thì dỡ rồi đỗ lại.
   */
  private setParked(level: number): void {
    if (level === this.parkedLevel) return;
    if (this.parked) this.unpark();
    if (level > 0) this.park(level);
  }

  private park(level: number): void {
    const list = (this.lods[level] ?? []).filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[];
    if (this.lods.length <= level || !list.length || list.length !== this.lods[level]!.length || !this.rig.parent) return;
    const saved: NonNullable<MannequinCharacter['parked']> = [];
    for (const m of list) {
      if (!m.parent) continue;
      saved.push({ m, home: m.parent, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() });
      // DetachedBindMode: đỉnh = matrixWorld(lưới) · bindMatrix⁻¹ · xương(hệ model) · boneInverse · bindMatrix, nên lưới đặt dưới `inner`
      // với đúng biến đổi lúc bind (bindMatrix = ma trận lưới trong hệ model).
      this.inner.add(m);
      m.bindMatrix.decompose(m.position, m.quaternion, m.scale);
      m.bindMode = THREE.DetachedBindMode;
      const sk = m.skeleton;
      let at = -1;
      sk.update = () => {
        if (at === this.parkVersion) return;
        at = this.parkVersion;
        THREE.Skeleton.prototype.update.call(sk);
      };
    }
    this.inner.remove(this.rig);
    this.parked = saved;
    this.parkedLevel = level;
    if (level === 1) this.homeBlade();
    this.syncParked();
  }

  private unpark(): void {
    const saved = this.parked!;
    this.parked = null;
    this.parkedLevel = 0;
    this.inner.add(this.rig);
    for (const e of saved) {
      e.home.add(e.m);
      e.m.position.copy(e.pos);
      e.m.quaternion.copy(e.quat);
      e.m.scale.copy(e.scale);
      e.m.bindMode = THREE.AttachedBindMode;
      delete (e.m.skeleton as { update?: unknown }).update;
    }
    // Kiếm về lại xương (matrixAutoUpdate bật lại trong `mountBlade`).
    if (this.bladeHomed && this.blade) this.mountBlade(this.drawn);
    this.bladeHomed = false;
  }

  /** Sau khi mixer đổi tư thế lúc đang đỗ: tính lại ma trận xương (hệ model); `skeleton.update()` chạy một lần ở lượt vẽ tới. */
  private syncParked(): void {
    this.rig.updateMatrixWorld(true);
    if (this.bladeHomed) this.placeBlade();
    this.parkVersion++;
  }

  private action(name: string): THREE.AnimationAction | null {
    const c = this.tpl.clips.get(name) ?? (name.startsWith('pose_') ? this.tpl.bank?.baseClip(name) : undefined);
    return c ? this.mixer.clipAction(c) : null;
  }

  /** Clip nền: tư thế K-5 thật cho ngự kiếm, ngự không, niệm chú, đả tọa (nếu pose đã nướng xong), không thì clip UAL. */
  private baseFor(a: AnimState, fallback: string): string {
    const bank = this.tpl.bank;
    if (!bank) return fallback;
    const want = a.dead
      ? null
      : a.meditating
        ? 'tam_thien'
        : a.flying || a.sky
          ? a.sky
            ? POSE_SKY
            : POSE_FLY
          : a.casting
            ? POSE_CAST
            : null;
    if (!want) return fallback;
    const name = poseClipName(want);
    return bank.baseClip(name) ? name : fallback;
  }

  private play(name: string): void {
    if (this.baseName === name) return;
    // Thân Pháp: vòng chạy bằng clip Patch (cần cả PM_Run và PM_Sprint trong template; thiếu thì giữ UAL).
    const patchLoop =
      V3_ANIM && name === LOCO.jog.clip && ANIM_FX.patchLoop && this.tpl.clips.has('PM_Run') && this.tpl.clips.has('PM_Sprint');
    const table: LocoTable = patchLoop ? scaledTable(FLAGS.pStride) : LOCO;
    const next = this.action(patchLoop ? PATCH_TABLE.jog.clip : name);
    if (!next) return;
    this.fadeDur = V3_ANIM ? xfade(this.baseName, name) : FADE;
    // Chạy: kèm clip đi bộ + chạy nhanh, trộn theo tốc độ (companions chia trọng số nền với clip chạy).
    for (const c of this.companions) if (!this.companions.includes(next)) this.weights.set(c, this.weights.get(c) ?? 0);
    // Rời chạy: chốt hệ số trộn của từng action để lúc mờ dần vẫn nhân đúng (không nhảy tư thế ở khung chuyển).
    this.frozenMix.clear();
    if (this.loco && this.base) {
      this.frozenMix.set(this.base, this.locoW(this.base));
      for (const c of this.companions) this.frozenMix.set(c, this.locoW(c));
    }
    this.companions = [];
    this.locoKey.clear();
    this.loco = V3_ANIM && name === LOCO.jog.clip;
    this.locoTable = this.loco ? table : LOCO;
    if (this.loco) {
      this.locoKey.set(next, { band: 'jog', dir: 'f' });
      // Thứ tự cố định: đi, chạy nhanh, rồi lùi/ngang của từng dải (thiếu clip trong asset thì bỏ qua, quay về clip tới).
      const want: [LocoBand, LocoDirKey][] = [
        ['walk', 'f'],
        ['sprint', 'f'],
      ];
      for (const band of ['jog', 'walk', 'sprint'] as const) for (const d of ['b', 'l', 'r'] as const) want.push([band, d]);
      for (const [band, d] of want) {
        const c = this.action(locoClipName(band, d, table));
        if (!c) continue;
        c.setLoop(THREE.LoopRepeat, Infinity);
        c.reset().play();
        c.timeScale = 0;
        c.setEffectiveWeight(0);
        this.weights.set(c, this.base ? 0 : 1);
        this.companions.push(c);
        this.locoKey.set(c, { band, dir: d });
      }
    }
    const loop = /Loop$|Idle$/.test(name);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.reset().play();
    if (this.loco) next.timeScale = 0;
    // Trọng số nền tự quản (không dùng crossFadeTo): three chuẩn hóa theo tổng trọng số, nên khi có đòn một lần
    // clip nền phải về 0 để đòn đủ biên độ (xem `blendBases`).
    next.setEffectiveWeight(this.base ? 0 : 1);
    this.weights.set(next, this.base ? 0 : 1);
    this.base = next;
    this.baseName = name;
  }

  /** Clip cho chân khi chỉ nửa trên đang đánh: clip đi-chạy trội nhất (có trễ để không đổi qua lại ở chéo 45°). */
  private lowerSrc(): THREE.AnimationAction | null {
    if (!this.base || !this.loco) return this.base;
    let best = this.lowerPick && (this.lowerPick === this.base || this.companions.includes(this.lowerPick)) ? this.lowerPick : this.base;
    let bw = this.locoW(best) + 0.15;
    for (const c of [this.base, ...this.companions]) {
      const w = this.locoW(c);
      if (w > bw) {
        best = c;
        bw = w;
      }
    }
    this.lowerPick = best;
    return best;
  }

  /** Trọng số của một action đi/chạy = dải tốc độ × hướng. */
  private locoW(a: THREE.AnimationAction): number {
    const k = this.locoKey.get(a);
    return k ? this.mix[k.band] * this.dir[k.dir] : 1;
  }

  /** Hòa clip nền: clip hiện tại về 1 (về 0 khi đang có đòn, trừ ~0,12 s cuối để khỏi rơi về tư thế nghỉ), clip cũ tắt dần. */
  private blendBases(dt: number): void {
    let gate = 1;
    const sh = this.shot;
    if (this.perf) gate = 1 - this.perf.env;
    else if (sh) {
      const ts = Math.max(0.1, Math.abs(sh.timeScale));
      gate = (sh.getClip().duration - sh.time) / ts < FADE * 0.75 ? 1 : 0;
    }
    const step = dt / this.fadeDur;
    const mixOf = (a: THREE.AnimationAction): number => (this.loco ? this.locoW(a) : 1);
    for (const [a, w] of [...this.weights]) {
      const live = a === this.base || this.companions.includes(a);
      const target = live ? gate : 0;
      const nw = w < target ? Math.min(target, w + step) : Math.max(target, w - step * 2);
      this.weights.set(a, nw);
      a.setEffectiveWeight(live ? nw * mixOf(a) : nw * (this.frozenMix.get(a) ?? 1));
      if (nw <= 0 && !live) {
        a.stop();
        this.weights.delete(a);
      }
    }
    // Chân của đòn nửa trên: theo clip nền hiện tại, đúng lúc nền bị hạ trọng số thì chân thay vào.
    if (this.shotLower) {
      const want = this.shotUpper && this.shot ? 1 - gate : 0;
      this.shotLowerW = want > this.shotLowerW ? Math.min(want, this.shotLowerW + step) : Math.max(want, this.shotLowerW - step * 2);
      this.shotLower.setEffectiveWeight(this.shotLowerW);
      if (this.shotLowerW <= 0 && !this.shot) {
        this.shotLower.stop();
        this.shotLower = null;
        this.shotLowerSrc = null;
      }
    }
  }

  private oneShot(name: string, rate = 1, upper = false): boolean {
    let a = this.action(name);
    if (!a) return false;
    this.shotUpper = false;
    if (upper && V3_ANIM && this.base) {
      a = this.mixer.clipAction(upperBodyOf(this.tpl.clips.get(name)!));
      this.shotUpper = true;
    }
    if (this.shot) this.shot.fadeOut(0.08);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = rate;
    a.reset().fadeIn(0.06).play();
    this.shot = a;
    return true;
  }

  attack(o: AttackOpts = {}): void {
    if (this.dead) return;
    this.attacks++;
    this.combatT = COMBAT_HOLD;
    const moving = !!this.lastAnim && this.lastAnim.speed > 0.3 && !this.perfBlocked();
    this.swingBase = 1.6;
    const clip = SWING[this.swing++ % SWING.length]!;
    if (!this.oneShot(clip, 1.6, moving)) return;
    this.endAtk();
    // Đòn dự phòng cũng phát sự kiện chiêu để VFX/sát thương/tiếng khớp khung chém (mốc từ tools/blender/ual_hit_times.py).
    const h = (UAL_HIT as Record<string, { hit: number; dur: number }>)[clip];
    if (!h || !this.shot) return;
    this.atk = {
      act: this.shot,
      hit: h.hit,
      dur: h.dur,
      t: 0,
      fired: false,
      rec: false,
      skill: o.skill ?? '',
      combo: o.combo ?? -1,
      kb: !!o.kb,
    };
    const hitIn = V3_ANIM ? swingSeconds(0, h.hit, h.dur, this.swingBase) : h.hit / this.swingBase;
    this.emitAtk('windup', 0, hitIn);
  }

  footXZ(out: { x: number; z: number }): void {
    this.inner.updateWorldMatrix(true, false);
    const e = this.inner.matrixWorld.elements;
    out.x = e[12]!;
    out.z = e[14]!;
  }

  /** Cộng độ lệch lướt vào `inner` (hệ nhân vật): nội suy từ điểm xuất phát tới vị trí thật của root, đúng dù gói vị trí mới tới trước hay sau. */
  private applyDash(realDt: number): void {
    const d = this.dashOff;
    if (!d) return;
    d.t += realDt;
    if (d.t >= d.dur) {
      this.dashOff = null;
      return;
    }
    const x = d.t / d.dur;
    const k = 1 - x * x * (3 - 2 * x);
    let dx = d.fx - this.root.position.x;
    let dz = d.fz - this.root.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 14) {
      dx = (dx / len) * 14;
      dz = (dz / len) * 14;
    }
    const yaw = this.root.rotation.y;
    this.inner.position.x += (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * k;
    this.inner.position.z += (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * k;
  }

  private emitAtk(kind: SkillEvent['kind'], index: number, hitIn?: number): void {
    const k = this.atk;
    if (!k) return;
    this.onSkillEvent?.({ kind, skill: k.skill, index, combo: k.combo, t: k.t, kb: k.kb, ...(hitIn !== undefined && { hitIn }) });
  }

  /** Kết thúc theo dõi đòn dự phòng: `cancel` nếu chưa tới khung chém, `end` nếu đã qua. */
  private endAtk(): void {
    const k = this.atk;
    if (!k) return;
    this.emitAtk(k.fired ? 'end' : 'cancel', k.fired ? 1 : 0);
    this.atk = null;
  }

  /** Phát `hit` đúng lúc clip đòn dự phòng qua mốc chém (đồng hồ clip nên đứng theo hit-stop), `recovery` giữa phần thu về. */
  private updateAtk(dt: number): void {
    const k = this.atk;
    if (!k) return;
    if (this.shot !== k.act || this.perf) {
      this.endAtk();
      return;
    }
    k.t += dt;
    const ct = k.act.time;
    if (!k.fired && ct >= k.hit) {
      k.fired = true;
      this.emitAtk('hit', 0);
    } else if (k.fired && !k.rec && ct >= k.hit + (k.dur - k.hit) * 0.5) {
      k.rec = true;
      this.emitAtk('recovery', 1);
    }
  }

  /**
   * Chiêu K-5 (pose IK nướng trên Mixamo, retarget sang Mannequin). Trả false khi pose chưa sẵn sàng hoặc không có (engine gọi `attack()` dùng
   * đòn UAL); true khi đã nhận, kể cả bị bỏ qua vì chết/đang bay.
   */
  perform(id: string, o: PerformOpts = {}): boolean {
    const pose = this.tpl.bank?.get(id);
    if (!pose) return false;
    if (this.dead || this.perfBlocked()) return true;
    if (o.delay && o.delay > 0) {
      this.pendingPerform = { id, left: o.delay, o };
      return true;
    }
    this.startPerform(id, pose, o);
    return true;
  }

  private lastAnim: AnimState | null = null;
  private perfBlocked(): boolean {
    const a = this.lastAnim;
    return !!a && (a.dead || a.flying || a.airborne);
  }

  private startPerform(id: string, pose: MqPose, o: PerformOpts): void {
    this.abortPerform();
    const act = (clip: THREE.AnimationClip) => {
      const x = this.mixer.clipAction(clip);
      x.setLoop(THREE.LoopOnce, 1);
      x.clampWhenFinished = true;
      x.reset();
      x.time = Math.min(Math.max(0, o.from ?? 0), pose.def.duration);
      x.setEffectiveWeight(0);
      x.play();
      return x;
    };
    const tm = o.timing;
    this.perf = {
      id,
      pose,
      upper: act(pose.upper),
      lower: act(pose.lower),
      lowerBase: null,
      t: o.from ?? 0,
      end: Math.max(pose.def.duration, tm?.end ?? 0),
      timing: tm,
      skill: o.skill ?? '',
      combo: o.combo ?? -1,
      fired: 0,
      env: 0,
    };
    const p = this.perf;
    if (tm) {
      while (p.fired < tm.hitAt.length && tm.hitAt[p.fired]! < p.t) p.fired++;
      this.emit('windup', 0);
    }
    if (this.shot) this.shot.fadeOut(0.05);
    if (o.ambient) return;
    this.attacks++;
    this.combatT = COMBAT_HOLD;
  }

  /** Dừng chiêu đang phát giữa chừng (chiêu mới đè, chết, bay): báo `cancel` nếu còn đòn chưa ra, `end` nếu đã ra hết, để VFX/hàng đợi sát thương dọn đúng. */
  private abortPerform(): void {
    const p = this.perf;
    if (p && !p.cancelled && p.timing) this.emit(p.fired < p.timing.hitAt.length ? 'cancel' : 'end', p.fired);
    this.stopPerform();
  }

  private stopPerform(): void {
    const p = this.perf;
    if (!p) return;
    p.upper.stop();
    p.lower.stop();
    p.lowerBase?.stop();
    this.perf = null;
  }

  private emit(kind: SkillEvent['kind'], index: number): void {
    const p = this.perf;
    if (!p) return;
    const hitIn = kind === 'windup' && p.timing ? Math.max(0, p.timing.hitAt[0]! - p.t) : undefined;
    this.onSkillEvent?.({ kind, skill: p.skill, index, combo: p.combo, t: p.t, kb: !!p.timing?.kb, ...(hitIn !== undefined && { hitIn }) });
  }

  private updatePerform(dt: number, a: AnimState): void {
    const q = this.pendingPerform;
    if (q) {
      q.left -= dt;
      if (q.left <= 0) {
        this.pendingPerform = null;
        const pose = this.tpl.bank?.get(q.id);
        if (pose && !this.dead && !this.perfBlocked()) this.startPerform(q.id, pose, q.o);
      }
    }
    const p = this.perf;
    if (!p) return;
    if (a.dead || a.flying || a.airborne) {
      this.abortPerform();
      return;
    }
    p.t += dt;
    const tm = p.timing;
    if (tm && !p.cancelled) {
      while (p.fired < tm.hitAt.length && p.t >= tm.hitAt[p.fired]!) this.emit('hit', p.fired++);
      if (p.fired >= tm.hitAt.length && p.t >= tm.hitAt[tm.hitAt.length - 1]! + 1e-3 && p.env > 0 && !p.recovered) {
        p.recovered = true;
        this.emit('recovery', tm.hitAt.length);
      }
    }
    if (p.t >= p.end) {
      if (!p.cancelled) this.emit('end', tm ? tm.hitAt.length : 0);
      this.stopPerform();
      return;
    }
    // Đường bao: vào nhanh, ra êm ở 0,18 s cuối.
    p.env = Math.min(1, p.t / 0.06, (p.end - p.t) / 0.18);
    const moving = a.speed > 0.3;
    p.upper.setEffectiveWeight(p.env);
    p.lower.setEffectiveWeight(moving ? 0 : p.env);
    // Đang đi: chân giữ clip chạy (chỉ kênh nửa dưới của clip nền hiện tại).
    const src = this.lowerSrc();
    if (moving && !p.lowerBase && src) {
      const lb = this.mixer.clipAction(lowerBodyOf(src.getClip()));
      lb.setLoop(THREE.LoopRepeat, Infinity);
      lb.reset();
      lb.time = src.time;
      lb.timeScale = src.timeScale;
      lb.play();
      p.lowerBase = lb;
    }
    if (p.lowerBase) {
      p.lowerBase.timeScale = this.base?.timeScale ?? 1;
      p.lowerBase.setEffectiveWeight(moving ? p.env : 0);
    }
  }

  /** Đang phát (hoặc chờ phát) động tác `pose`. */
  performing(pose: string): boolean {
    return this.perf?.id === pose || this.pendingPerform?.id === pose;
  }

  performClock(): { t: number; skill: string } | null {
    const p = this.perf;
    return p && p.timing ? { t: p.t, skill: p.skill } : null;
  }

  cancelPerform(): void {
    this.pendingPerform = null;
    const p = this.perf;
    // Đã ra đòn rồi thì để động tác chạy hết (hiệu ứng đã phóng), như SkinnedCharacter.
    if (p && !p.cancelled && p.t < (p.pose.def.hit?.[0] ?? 0)) {
      p.cancelled = true;
      p.end = Math.min(p.end, p.t + 0.18);
      this.emit('cancel', p.fired);
    }
  }

  /** Di chuyển/lướt hủy phần thu về nếu đã qua mốc hủy trong dữ liệu chiêu (K-4). */
  cancelRecovery(kind: 'move' | 'dash'): boolean {
    const p = this.perf;
    const tm = p?.timing;
    if (!p || !tm || p.cancelled || !canCancel(tm, p.t, kind)) return false;
    p.cancelled = true;
    p.end = Math.min(p.end, p.t + 0.12);
    this.emit('cancel', p.fired);
    return true;
  }

  /** Lướt hiển thị: hình xuất phát từ (fromX, fromZ) rồi trượt về chỗ thật trong `dur` giây; phát clip lăn UAL co vừa thời gian lướt. */
  dashFrom(fromX: number, fromZ: number, dur: number, strike = false): void {
    if (this.dead) return;
    this.dashOff = { fx: fromX, fz: fromZ, t: 0, dur: Math.max(0.1, dur) };
    this.cancelRecovery('dash');
    // Chiêu còn sống mà chưa bị hủy thì giữ động tác chiêu; dash-cancel (đã hủy thu về, tắt dần 0,12 s) thì vẫn lăn.
    if (this.perf && !this.perf.cancelled) return;
    const clip = dashClipOf(strike, (n) => this.tpl.clips.has(n));
    const len = this.tpl.clips.get(clip)?.duration ?? 0;
    if (len > 0) this.oneShot(clip, Math.min(3, Math.max(1, len / this.dashOff.dur)));
  }

  knockdown(): void {
    if (this.dead) return;
    this.chain = this.tpl.clips.has('LayToIdle') ? 'LayToIdle' : null;
    this.oneShot('Hit_Knockback');
    if (ANIM_FX.ragdoll && this.lodLevel === 0) {
      // Ngã: xung mạnh theo hướng đòn cuối, khớp mềm hẳn trong lúc nằm.
      const lh = this.lastHit;
      (this.rag ??= new RagRig(this.rig)).down(this.root.rotation.y, lh.dx, lh.dz);
    }
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
    if (this.dead) return;
    if (o.dirX || o.dirZ) this.lastHit = { dx: o.dirX ?? 0, dz: o.dirZ ?? 0, at: this.clock };
    if (V3_ANIM)
      this.flinch = {
        amp: flinchAmpOf(o.tier, !!o.crit, !!o.heavy),
        age: -(o.delay ?? 0),
        ...flinchDirOf(this.root.rotation.y, o.dirX ?? 0, o.dirZ ?? 0),
      };
    if (ANIM_FX.ragdoll && this.lodLevel === 0)
      (this.rag ??= new RagRig(this.rig)).hit(this.root.rotation.y, o.dirX ?? 0, o.dirZ ?? 0, o.tier, !!o.heavy, !!o.crit);
    // Clip theo phía bị đánh (C3b): nặng ngã lùi; nhẹ chạm ngực (trước/bên) hoặc giật đầu (sau gáy).
    const clip = hitClipOf(hitSideOf(this.root.rotation.y, o.dirX ?? 0, o.dirZ ?? 0), !!o.heavy || (o.tier ?? 0) >= 2);
    // Clip Patch (bắt đầu/dừng/thở dốc) là động tác nền đè được: bị đánh thì clip trúng đòn thay vào (không để phản hồi trúng đòn yếu đi khi bật cờ).
    if ((!this.shot || this.shot === this.patchShot) && !o.noFlash && this.oneShot(clip, clip === 'Hit_Knockback' ? 1.2 : 1.4))
      this.patchShot = null;
  }

  /** Mức LOD hiện tại (cho `EntityManager.lodStats` và đo hiệu năng). */
  get lod(): number {
    return this.lodLevel;
  }

  setViewDistance(d: number): void {
    this.setView({ dist: d, inView: true, allowLod0: true, self: d <= 0 });
  }

  setView(v: { dist: number; inView: boolean; allowLod0: boolean; self?: boolean; minLod?: number }): void {
    const level = lodLevel(v.dist, this.lodDist, v.allowLod0, this.lods.length, v.minLod);
    this.applyLod(level, !!v.self);
    this.setParked(this.disposed || V3_OFF.has('park') ? 0 : level >= 2 ? 2 : level === 1 && !V3_OFF.has('park1') ? 1 : 0);
    this.lodLevel = level;
    this.gear?.setVisible(gearShown(this.gearOn, level));
    this.coGear?.setVisible(gearShown(this.coOn, level));
    this.viewDist = v.dist;
    this.viewSelf = !!v.self;
    this.interval = mixerInterval(level, v.inView, !!v.self, v.dist);
    // Ngoài khung nhìn: bỏ cả cây xương khỏi lượt tính ma trận và lượt dựng danh sách vẽ (như `SkinnedCharacter`).
    this.inner.visible = v.inView;
    this.inner.matrixWorldAutoUpdate = v.inView;
  }

  update(realDt: number, a: AnimState): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    this.inner.position.z = 0;
    this.applyDash(realDt);
    this.arc?.update(realDt);
    this.combatT = a.combat ? COMBAT_HOLD : Math.max(0, this.combatT - realDt);
    if (a.dead && !this.dead) {
      // Chết: ngã ra xa người hạ gục (C3b): xoay thân phụ về hướng người đánh trong DEATH_TURN_S nếu đòn cuối còn mới.
      const lh = this.lastHit;
      this.deathTurn =
        this.clock - lh.at <= DEATH_DIR_TTL ? { to: deathYawOffset(this.root.rotation.y, lh.dx, lh.dz), t: 0 } : { to: 0, t: 1 };
      // Chết: bỏ đòn đang phát và đòn nối tiếp, để Death01 phát trọn.
      this.shot?.stop();
      this.shot = null;
      this.chain = null;
    }
    if (a.dead && !this.dead && ANIM_FX.ragdoll && this.lodLevel === 0) {
      const lh = this.lastHit;
      (this.rag ??= new RagRig(this.rig)).down(this.root.rotation.y, lh.dx, lh.dz);
    }
    this.dead = a.dead;
    if (this.dead && this.deathTurn.t < 1) {
      this.deathTurn.t = Math.min(1, this.deathTurn.t + realDt / DEATH_TURN_S);
      this.inner.rotation.y = this.deathTurn.to * this.deathTurn.t;
    } else if (!this.dead && this.inner.rotation.y !== 0) this.inner.rotation.y = 0;
    this.lastAnim = a;
    this.updatePerform(dt, a);
    this.updateAtk(dt);
    this.grounded = !(a.flying || a.airborne || a.sky);
    const rawName = baseClipOf({ ...a, combat: a.combat || this.combatT > 0 });
    const name = this.baseFor(a, rawName);
    this.play(name);
    this.syncShotLower();
    this.stepPatch(dt, a);
    if (this.loco) {
      // Trộn đi/chạy/chạy nhanh theo tốc độ thật; pha chung nên chân trụ không trượt khi đổi nhịp.
      const m = locoMix(a.speed, this.locoTable);
      const k = Math.min(1, realDt * 12);
      this.mix.walk += (m.walk - this.mix.walk) * k;
      this.mix.jog += (m.jog - this.mix.jog) * k;
      this.mix.sprint += (m.sprint - this.mix.sprint) * k;
      const dm = dirMix(a.moveAngle ?? 0);
      for (const d of ['f', 'b', 'l', 'r'] as const) this.dir[d] += (dm[d] - this.dir[d]) * k;
      // Làm mượt chỉ tiệm cận 0: kẹp giá trị nhỏ về đúng 0 (three bỏ qua action trọng số 0) rồi chuẩn hóa lại tổng = 1.
      snapMix(this.mix);
      snapMix(this.dir);
      this.locoCycles = m.cycles;
    } else if (this.base && name === 'Jog_Fwd_Loop') this.base.timeScale = jogRate(a.speed);
    else if (this.base) this.base.timeScale = 1;
    // Đòn UAL dự phòng: anticipation (kéo lại chậm rồi bung nhanh qua điểm trúng).
    if (
      V3_ANIM &&
      this.shot &&
      this.swingBase > 0 &&
      SWING.some((n) => this.shot!.getClip().name === n || this.shot!.getClip().name === `${n}|upper`)
    ) {
      this.shot.timeScale = swingRate(this.shot.time / this.shot.getClip().duration, this.swingBase);
    }
    // Bước chân: đếm theo pha chu kỳ chạy (hai bước mỗi chu kỳ).
    if (name === 'Jog_Fwd_Loop' && this.base) {
      const len = this.base.getClip().duration;
      const ph = (this.loco ? this.locoPhase : this.base.time / len) % 1;
      if (ph >= 0.5 !== this.lastPhase >= 0.5) this.steps++;
      this.lastPhase = ph;
    }
    // Giảm tần số cập nhật xương cho người ở xa.
    this.acc += dt;
    if (this.interval > 0 && !mixerDue(this.acc, this.interval)) return;
    this.blendBases(this.acc);
    if (this.loco && this.base) this.syncLoco(this.acc);
    this.mixer.update(this.acc);
    if (this.proportions.length) applyProportions(this.proportions);
    for (const t of V3_OFF.has('twist') ? [] : this.twists) {
      _tq.copy(t.restLimb).invert().multiply(t.limb.quaternion);
      t.tw.quaternion.copy(t.restTw).multiply(_tq2.setFromAxisAngle(t.axis, TWIST_COUNTER * twistAngle(_tq, t.axis)));
    }
    if (this.parked) this.syncParked();
    if (V3_ANIM && !V3_OFF.has('proc') && !this.shadow && this.lodLevel === 0 && this.inner.visible) this.procedural(this.acc, a);
    if (this.feet && !V3_OFF.has('feet')) {
      if (this.lodLevel === 0 && this.inner.visible) {
        // Hết suất (đông người ở xa camera): `active: false` để IK mờ dần rồi tự nhả, được cấp lại thì hiện dần, không giật.
        const active =
          feetSlot(this.viewDist, this.viewSelf) && this.grounded && !a.dead && !a.meditating && this.baseName !== 'Sitting_Idle_Loop';
        // Khóa chân chỉ khi đứng yên thật: đòn/chiêu/trúng đòn có chân tự di chuyển trong clip.
        this.feet.update(this.acc, { active, standing: a.speed < 0.3 && !this.perf && !this.shot });
      } else this.feet.release();
    }
    const drawNow = this.combatT > 0 || !!a.combat;
    if (drawNow !== this.drawn) this.mountBlade(drawNow);
    // Lò xo vạt: chỉ LOD0 và trong khung nhìn; ma trận thế giới của xương phải mới (root vừa được đặt vị trí).
    if (this.springs || this.skirtSprings || this.sleeveSprings || this.tasselSprings) {
      if (this.lodLevel === 0 && this.inner.visible) {
        this.root.updateMatrixWorld(true);
        const sit = this.spring2 && (this.baseName === 'Sitting_Idle_Loop' || this.baseName === 'pose_tam_thien');
        this.colScale += ((sit ? SPRING2.sitScale : 1) - this.colScale) * Math.min(1, this.acc * 6);
        this.springs?.update(this.acc, IDENT);
        this.sleeveSprings?.update(this.acc, IDENT);
        this.tasselSprings?.update(this.acc, IDENT);
        this.skirtSprings?.update(this.acc, IDENT, this.colScale);
      } else {
        this.springs?.reset();
        this.sleeveSprings?.reset();
        this.tasselSprings?.reset();
        this.skirtSprings?.reset();
      }
    }
    if (this.cloth) {
      const on = this.lodLevel === 0 && this.inner.visible;
      this.cloth.setActive(on);
      const sitNow = this.baseName === 'Sitting_Idle_Loop' || this.baseName === 'pose_tam_thien';
      this.clothSit += ((sitNow ? 1 : 0) - this.clothSit) * Math.min(1, this.acc * 6);
      if (on) this.cloth.update(this.acc, this.clothSit, !!(this.springs || this.skirtSprings || this.sleeveSprings || this.tasselSprings));
    }
    if (ANIM_FX.smear && this.lodLevel === 0 && this.inner.visible) this.updateSmear();
    this.acc = 0;
  }

  /** T4: dải nét kéo bám lưỡi kiếm trong cửa sổ đường chém của pose `_tp`; hết cửa sổ thì tan dần. */
  private updateSmear(): void {
    const p = this.perf;
    const on = !!p && p.id.endsWith('_tp') && smearWindow(p.t, p.pose.def.hit?.[0] ?? 0);
    if (!on && !this.smear?.active) return;
    this.smear ??= new BladeSmear(this.root);
    if (on && this.bladePoints(_sm0, _sm1)) this.smear.push(_sm0, _sm1);
    else this.smear.push(null, null);
  }

  /**
   * Clip Patch (cờ `patch`): bắt đầu/dừng chạy, chạy nhanh, thở dốc sau chạy dài, phát như đòn một lần (đè nền) NHANH cho vừa nhịp tăng/giảm tốc của game.
   * Hủy khi có việc khác chen vào: đòn/hit khác chiếm `shot`, bay/chết/niệm chú, dừng lại giữa clip bắt đầu, hoặc lại chạy giữa clip dừng/thở dốc.
   */
  private stepPatch(dt: number, a: AnimState): void {
    if (!ANIM_FX.patch || !this.tpl.clips.has('PM_Run_To_Idle')) return;
    const free = !a.dead && !a.meditating && !a.flying && !a.sky && !a.airborne && !a.casting && !this.perf && !this.shotUpper;
    if (this.patchShot && this.shot !== this.patchShot) this.patchShot = null;
    if (this.patchShot) {
      const stopLike = this.patchKind !== 'start';
      if (!free || (stopLike ? a.speed > 0.6 : a.speed < 0.3)) {
        this.patchShot.fadeOut(0.12);
        if (this.shot === this.patchShot) this.shot = null;
        this.patchShot = null;
      }
    }
    const other = !!this.shot && this.shot !== this.patchShot;
    const ev = this.patchMove.update(dt, a.speed, !free || other);
    if (!ev || !this.oneShot(ev.clip, ev.rate)) return;
    this.patchShot = this.shot;
    this.patchKind = ev.kind;
  }

  /** Khóa pha ba clip chạy và chân của đòn nửa trên; tạo/giữ clip nửa dưới khi đang đánh nửa trên. */
  private syncLoco(dt: number): void {
    this.locoPhase = (this.locoPhase + this.locoCycles * dt) % 1;
    for (const act of [this.base!, ...this.companions]) {
      act.timeScale = 0;
      act.time = clipTimeAt(act.getClip().name, act.getClip().duration, this.locoPhase);
    }
    const lb = this.perf?.lowerBase;
    if (lb) {
      lb.timeScale = 0;
      lb.time = clipTimeAt(lb.getClip().name, lb.getClip().duration, this.locoPhase);
    }
  }

  private syncShotLower(): void {
    if (!(this.shotUpper && this.shot && this.base)) return;
    const src = this.lowerSrc()!;
    if (this.shotLowerSrc !== src) {
      this.shotLower?.stop();
      const lb = this.mixer.clipAction(lowerBodyOf(src.getClip()));
      lb.setLoop(THREE.LoopRepeat, Infinity);
      lb.reset();
      lb.play();
      lb.setEffectiveWeight(0);
      this.shotLower = lb;
      this.shotLowerSrc = src;
      this.shotLowerW = 0;
    }
    const lb = this.shotLower!;
    lb.timeScale = this.loco ? 0 : src.timeScale;
    if (this.loco) lb.time = clipTimeAt(lb.getClip().name, lb.getClip().duration, this.locoPhase);
    else lb.time = src.time;
  }

  /** Lớp phụ sau mixer (xương chỉnh thêm trên tư thế clip): nghiêng khi rẽ, xoay tại chỗ, thở, nhìn mục tiêu, giật khi trúng đòn, bù dang tay. */
  private procedural(dt: number, a: AnimState): void {
    this.clock += dt;
    const b = this.bones;
    const y = this.root.rotation.y;
    if (Number.isFinite(this.lastYaw) && dt > 1e-3) {
      let d = y - this.lastYaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yawRate += (Math.max(-8, Math.min(8, d / dt)) - this.yawRate) * Math.min(1, dt * 10);
    }
    this.lastYaw = y;
    const free = !a.dead && !a.meditating && !a.flying && !a.sky && !a.airborne;
    const sinY = Math.sin(y);
    const cosY = Math.cos(y);
    const fwd = _ax.set(sinY, 0, cosY).clone();
    const rgt = new THREE.Vector3(cosY, 0, -sinY);
    const k = Math.min(1, dt * 8);
    const perfW = this.perf ? 0.4 : 1;
    // Nghiêng khi rẽ lúc chạy; xoay tại chỗ thì thân trên trễ so với chân.
    const leanBase = free && !this.perf && !this.shotUpper ? leanOf(this.yawRate, a.speed) : 0;
    const leanT = ANIM_FX.bounce ? leanBoost(leanBase) : leanBase;
    this.lean += (leanT - this.lean) * k;
    const lagT = free && a.speed < 0.3 && !this.perf ? turnLagOf(this.yawRate) : 0;
    this.turnLag += (lagT - this.turnLag) * k;
    const ls = -this.lean * this.side;
    rotateWorld(b.spine_01 ?? null, fwd, ls * 0.4);
    rotateWorld(b.spine_02 ?? null, fwd, ls * 0.3);
    rotateWorld(b.spine_03 ?? null, fwd, ls * 0.3);
    rotateWorld(b.spine_02 ?? null, _up, -this.turnLag * 0.5);
    rotateWorld(b.spine_03 ?? null, _up, -this.turnLag * 0.5);
    // Thân Pháp T1 (cờ ?thanphap): khuếch đại tay/vai/hông quanh tư thế nghỉ và nảy bước, chỉ khi chạy tự do.
    if (ANIM_FX.exaggerate && free && !this.perf && !this.shotUpper) this.exaggerate(a.speed);
    this.inner.position.y = ANIM_FX.bounce && free && !this.perf && !this.shotUpper ? bobOf(this.loco ? this.locoPhase : 0, a.speed) : 0;
    // T2 (cờ ?thanphap): lướt thấp khi chạy, chúi tới khi tăng tốc (bắt đầu chạy), ngả ra sau khi phanh (dừng). Hạ hông cộng vào độ nảy.
    if (dt > 1e-3) this.accel += (Math.max(-40, Math.min(40, (a.speed - this.lastSpeed) / dt)) - this.accel) * Math.min(1, dt * 12);
    this.lastSpeed = a.speed;
    if (ANIM_FX.loco && free && !this.perf && !this.shotUpper && !this.patchShot) {
      const pitch = glideLean(a.speed) + accelLean(this.accel);
      rotateWorld(b.spine_01 ?? null, rgt, pitch * 0.4);
      rotateWorld(b.spine_02 ?? null, rgt, pitch * 0.35);
      rotateWorld(b.spine_03 ?? null, rgt, pitch * 0.25);
      this.inner.position.y -= glideDip(a.speed);
      // Xung bắt đầu/dừng/pivot (lò xo tắt dần): chúi/ngả, nghiêng, hạ hông.
      const li = this.loco2;
      if (ANIM_FX.impulse) li.update(dt, a.speed, this.yawRate);
      else if (li.dip !== 0) li.reset();
      const cl = (x: number, m: number) => Math.max(-m, Math.min(m, x));
      const lp = cl(li.pitch, LOCO_CLAMP.pitch);
      const lr = cl(li.roll, LOCO_CLAMP.roll);
      rotateWorld(b.spine_01 ?? null, rgt, lp * 0.4);
      rotateWorld(b.spine_02 ?? null, rgt, lp * 0.35);
      rotateWorld(b.spine_03 ?? null, rgt, lp * 0.25);
      rotateWorld(b.spine_02 ?? null, fwd, lr * 0.5 * this.side);
      rotateWorld(b.spine_03 ?? null, fwd, lr * 0.5 * this.side);
      this.inner.position.y += cl(li.dip, LOCO_CLAMP.dip);
    } else if (this.loco2.dip !== 0 || this.loco2.pitch !== 0) this.loco2.reset();
    // T3: đứng yên lâu thì tự chơi một idle đặc trưng (xoay kiếm khi đang cầm kiếm, chắp tay ngắm trời khi tay không); bỏ ngay khi di chuyển.
    if (ANIM_FX.idle) {
      const still = free && a.speed < 0.3 && !this.perf && !a.combat && !a.casting && this.baseName !== 'Sitting_Idle_Loop';
      this.stillT = still ? this.stillT + dt : 0;
      if (still && idleDue(this.stillT, this.drawn ? IDLE_DRAWN_AFTER : this.idleAfter)) {
        // Chọn theo trạng thái kiếm thật; `ambient`: idle không kéo vào thế đấu, không rút kiếm.
        this.perform(idlePoseFor(this.drawn), { skill: 'idle', ambient: true });
        this.stillT = 0;
        this.idleAfter = 6 + Math.random() * 5;
      } else if (a.speed > 0.5 && this.perf && this.perf.id.startsWith('kiem_idle')) this.abortPerform();
    }
    // T5: ragdoll nhẹ cộng lên tư thế clip (thân trên, đầu, tay); độ lỏng hồi về 0 sau ~1,2 s, riêng lúc chết giữ lỏng.
    // Ragdoll ghi tuyệt đối (gốc + góc), không cộng dồn lên xương mixer không ghi lại (clip kẹp cuối).
    if (this.rag && ANIM_FX.ragdoll) this.rag.apply(dt, y, a.dead, this.lodLevel === 0 && this.viewDist < 30);
    // Thở (cộng thêm, chỉ biên độ nhỏ).
    if (free) rotateWorld(b.spine_03 ?? null, rgt, breathOf(this.clock, a.speed < 0.3));
    // Giật nhẹ khi trúng đòn: thân ngửa ra sau rồi về.
    const f = this.flinch;
    f.age += dt;
    if (f.age >= 0 && f.age < 0.5 && !a.dead) {
      const fl = flinchOf(f.amp, f.age);
      // Theo hướng đòn: bị đẩy ra sau thì ngửa, về trước thì cúi, sang bên thì nghiêng (trước đây luôn ngửa).
      const pf = f.pitch * fl;
      const rl = -f.roll * fl * 0.7 * this.side;
      rotateWorld(b.spine_02 ?? null, rgt, pf * 0.5);
      rotateWorld(b.spine_03 ?? null, rgt, pf * 0.5);
      rotateWorld(b.head ?? null, rgt, -pf * 0.4);
      rotateWorld(b.spine_02 ?? null, fwd, rl * 0.5);
      rotateWorld(b.spine_03 ?? null, fwd, rl * 0.5);
    }
    // Nhìn mục tiêu: quay đầu/cổ tới điểm nhìn, giới hạn góc.
    let ty = 0;
    let tp = 0;
    if (free && !a.casting && a.lookAt) {
      const la = lookAngles(
        a.lookAt.x - this.root.position.x,
        a.lookAt.y - (this.root.position.y + this.height * 0.9),
        a.lookAt.z - this.root.position.z,
        y,
      );
      ty = la.yaw;
      tp = la.pitch;
    }
    this.lookYaw += (ty - this.lookYaw) * Math.min(1, dt * 6);
    this.lookPitch += (tp - this.lookPitch) * Math.min(1, dt * 6);
    rotateWorld(b.spine_03 ?? null, _up, this.lookYaw * 0.15 * perfW);
    rotateWorld(b.neck_01 ?? null, _up, this.lookYaw * 0.3);
    rotateWorld(b.head ?? null, _up, this.lookYaw * 0.55);
    rotateWorld(b.neck_01 ?? null, rgt, this.lookPitch * 0.3);
    rotateWorld(b.head ?? null, rgt, this.lookPitch * 0.5);
    // Model giữ gốc Tripo: đầu thẳng ở A-pose, nhưng clip Idle của UAL (dáng Mannequin) cúi đầu ~13°: ngửa đầu bù lại (cổ 40%, đầu 60%) khi đứng/đi.
    if (free && KEEP_ORIGINAL_ASSETS.has(this.tpl.handle.id)) {
      const lift = FLAGS.headLift;
      rotateWorld(b.neck_01 ?? null, rgt, -lift * 0.4);
      rotateWorld(this.headBone, rgt, -lift * 0.6);
    }
    // Bù dang tay/vai theo model (tay áo rộng không bị tay clip ép xuyên).
    // Hệ số theo độ buông của tay (hướng vai→khuỷu, 0 khi cách phương thẳng đứng hơn 60°, 1 khi buông thẳng): tay giơ/chém không bị dạng thêm, chỉ tay buông sát thân mới cần chừa.
    if (free && !a.casting && this.armFit) {
      const fit = this.armFit * perfW;
      rotateWorld(b.upperarm_l ?? null, fwd, fit * this.side * this.armDroop(b.upperarm_l, b.lowerarm_l));
      rotateWorld(b.upperarm_r ?? null, fwd, -fit * this.side * this.armDroop(b.upperarm_r, b.lowerarm_r));
    }
  }

  /** T1: q' = nghỉ · slerp(I, nghỉ⁻¹·q, gain): độ lệch so với tư thế nghỉ nhân `gain` (xem animFx.EXAG_GAIN). */
  private exaggerate(speed: number): void {
    for (const [n, rest] of this.exagRest) {
      const bn = this.bones[n];
      if (!bn) continue;
      _tq.copy(rest).invert().multiply(bn.quaternion);
      bn.quaternion.copy(rest).multiply(_tq2.identity().slerp(_tq, exagGain(n, speed)));
    }
  }

  /** Độ buông của một cánh tay, 0..1 (xem ARM_FIT); ma trận thế giới đã cập nhật ở bước trên. */
  private armDroop(shoulder: THREE.Object3D | null | undefined, elbow: THREE.Object3D | null | undefined): number {
    if (!shoulder || !elbow) return 1;
    shoulder.getWorldPosition(_a0);
    elbow.getWorldPosition(_a1).sub(_a0);
    const len = _a1.length();
    if (len < 1e-4) return 1;
    return Math.min(1, Math.max(0, (-_a1.y / len - ARM_DOWN_LO) / (ARM_DOWN_HI - ARM_DOWN_LO)));
  }

  bladePoints(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    if (!this.blade || !this.drawn || (this.parked && !this.bladeHomed)) return false;
    this.blade.updateWorldMatrix(true, false);
    base.setFromMatrixPosition(this.blade.matrixWorld);
    tip.set(0, this.bladeLen, 0).applyMatrix4(this.blade.matrixWorld);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.setParked(0); // trả lưới LOD đỗ về rig để dọn chung
    this.disposed = true;
    this.hit.reset();
    this.arc?.dispose();
    this.smear?.dispose();
    this.blade?.removeFromParent();
    for (const h of this.held.values()) {
      h.mesh.removeFromParent();
      h.mesh.geometry.dispose();
    }
    this.coGear?.dispose();
    this.gear?.dispose();
    this.cloth?.dispose();
    this.stopPerform();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    const sk = new Set<THREE.Skeleton>();
    this.rig.traverse((o) => {
      const s = (o as THREE.SkinnedMesh).skeleton;
      if (s) sk.add(s);
    });
    for (const s of sk) s.dispose();
    this.root.removeFromParent();
  }
}

/** Nạp và dựng nhân vật v3 (mặc định từ N-7); PlayerSkins gọi. Trả null khi asset chưa nạp xong (bên gọi dùng model khối tạm) hoặc lỗi. */
export class MannequinPlayers {
  private tpl = new Map<string, MannequinTemplate | 'loading' | 'failed'>();
  private swords = new Map<string, SwordTemplate | 'loading' | 'failed'>();
  private disposed = false;
  /** Nguồn nướng pose K-5 (asset Mixamo), nạp lười khi có template đầu tiên. */
  private poseSrc: PoseSource | 'loading' | 'failed' | null = null;
  private poseHandle: AssetHandle | null = null;
  /** Vật liệu linh thể theo asset + loại (dùng chung giữa các bản sao). */
  private soulMats = new Map<string, THREE.MeshStandardNodeMaterial>();
  /** Vật liệu đã nhuộm theo mẫu + màu (dùng chung giữa mọi người cùng model cùng màu). */
  private dyeMats = new Map<string, THREE.MeshStandardNodeMaterial>();
  /** Trần texture theo model (N-7): nhân vật mình đầy đủ, model của người khác bị chặn cạnh lúc nạp (`v3Detail.ts`). */
  private budget: V3TextureBudget;
  constructor(
    private cache: AssetCache,
    quality: string = storedQuality(),
  ) {
    this.budget = new V3TextureBudget(v3TexturePolicy(quality));
  }

  /** Khóa mẫu (`tpl`) của một nhân vật: id asset + trần texture của bản nạp. */
  private keyOf(g: string, skin: string | undefined, set: string | undefined, self: boolean): { id: string; cap: TexCap; key: string } {
    const id = v3AssetOf(g, skin, set);
    const cap = this.budget.capOf(id, self);
    return { id, cap, key: assetKey(id, cap) };
  }

  private ensurePoses(): void {
    if (this.poseSrc) {
      if (this.poseSrc instanceof PoseSource)
        for (const t of this.tpl.values())
          if (typeof t === 'object' && !t.bank) t.bank = new MannequinPoseBank(this.poseSrc, t.handle.scene);
      return;
    }
    this.poseSrc = 'loading';
    this.cache.acquire(POSE_SOURCE_ASSET, { priority: 15 }).then(
      (h) => {
        if (this.disposed) {
          h.release();
          return;
        }
        try {
          this.poseHandle = h;
          this.poseSrc = new PoseSource(h.scene);
          this.ensurePoses();
        } catch (err) {
          modelsLog.warn('không dựng được nguồn pose K-5 cho v3', err);
          h.release();
          this.poseSrc = 'failed';
        }
      },
      (err) => {
        modelsLog.warn('không nạp được nguồn pose K-5 cho v3', err);
        this.poseSrc = 'failed';
      },
    );
  }

  private load(id: string, cap: TexCap, key: string): void {
    if (this.tpl.has(key)) return;
    this.tpl.set(key, 'loading');
    const robeP = KEEP_ORIGINAL_ASSETS.has(id)
      ? this.cache.acquire(ROBE_LIB, { priority: 1 }).catch(() => undefined)
      : Promise.resolve(undefined);
    const patchP = ANIM_FX.patch ? this.cache.acquire(PATCH_LIB, { priority: 1 }).catch(() => undefined) : Promise.resolve(undefined);
    Promise.all([this.cache.acquire(id, { priority: 1, ...cap }), this.cache.acquire(V3_LIB, { priority: 1 }), robeP, patchP]).then(
      ([h, lib, robe, patch]) => {
        if (this.disposed) {
          h.release();
          lib.release();
          robe?.release();
          patch?.release();
          return;
        }
        try {
          this.tpl.set(key, mannequinTemplate(h, lib, robe, patch));
          this.ensurePoses();
        } catch (err) {
          modelsLog.warn(`không dựng được ${id}`, err);
          this.tpl.set(key, 'failed');
        }
      },
      (err) => {
        modelsLog.warn(`không nạp được ${id} (v3)`, err);
        this.tpl.set(key, 'failed');
      },
    );
  }

  /** Mẫu kiếm `id` (prop_kiem_*), nạp lười; null khi chưa xong hoặc lỗi. */
  private sword(id: string): SwordTemplate | null {
    const cur = this.swords.get(id);
    if (cur) return typeof cur === 'string' ? null : cur;
    this.swords.set(id, 'loading');
    this.cache.acquire(id, { priority: 20 }).then(
      (h) => {
        const tpl = this.disposed ? null : swordTemplateOf(h.scene, partExtras(h.scene), () => h.release());
        if (!tpl) {
          h.release();
          this.swords.set(id, 'failed');
          return;
        }
        for (const m of adoptGltfMaterials(h.scene)) {
          m.metalness = SWORD_METALNESS;
          m.roughness = SWORD_ROUGHNESS;
          const tint = SWORD_TINT[id];
          if (tint) m.color.setRGB(tint[0], tint[1], tint[2]);
        }
        this.swords.set(id, tpl);
      },
      () => this.swords.set(id, 'failed'),
    );
    return null;
  }

  private get(g: string, skin?: string, set?: string, self = false): MannequinTemplate | null {
    const { id, cap, key } = this.keyOf(g, skin, set, self);
    this.load(id, cap, key);
    const t = this.tpl.get(key);
    if (t && typeof t !== 'string') this.ensurePoses();
    return t && typeof t !== 'string' ? t : null;
  }

  /** `self`: nhân vật của mình (texture đầy đủ theo preset); người khác dùng bản có trần texture. `dye`: bộ màu nhuộm (hex) hoặc null. */
  create(g: string, skin?: string, w?: string, set?: string, self = false, dye: V3DyeColors | null = null): CharacterView | null {
    const t = this.get(g, skin, set, self);
    if (!t) return null;
    const mat = dye ? this.dyedMaterial(t, this.keyOf(g, skin, set, self).key, dye) : null;
    const ch = new MannequinCharacter(t, false, this.sword(w ?? SWORD_MODEL_DEFAULT), mat);
    if (FLAGS.hero) ch.enableProportions();
    return ch;
  }

  /** Bản sao vật liệu của mẫu có nhuộm `dye`; null nếu model không nhuộm được (skin toàn thân) hoặc không có vật liệu. */
  private dyedMaterial(t: MannequinTemplate, key: string, dye: V3DyeColors): THREE.MeshStandardNodeMaterial | null {
    const ref = v3DyeRefOf(t.handle.id);
    if (!ref) return null;
    const k = `${key}/${dye.main}/${dye.trim ?? ''}/${dye.accent ?? ''}`.toLowerCase();
    let m = this.dyeMats.get(k);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) ?? null;
    });
    if (!src) return null;
    m = applyV3Dye(cloneWorldMaterial(src as THREE.MeshStandardNodeMaterial), ref, dye);
    this.dyeMats.set(k, m);
    return m;
  }

  createShadow(g: string, def: MonsterDef, skin?: string, set?: string, self = false): MonsterView | null {
    const t = this.get(g, skin, set, self);
    return t ? (Object.assign(new MannequinCharacter(t, true), { def }) as unknown as MonsterView) : null;
  }

  /** Nguyên anh / thân xác / phân thân (E3-K, RFX-1): bản sao model v3 của nhân vật với vật liệu linh thể; null khi asset chưa nạp. */
  createSoul(g: string, kind: SoulKind, skin?: string, set?: string, self = false): CharacterView | null {
    const t = this.get(g, skin, set, self);
    if (!t) return null;
    const key = `${this.keyOf(g, skin, set, self).key}/${kind}`;
    let m = this.soulMats.get(key);
    if (!m) {
      let src: THREE.Material | null = null;
      t.handle.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!src && mesh.isMesh) src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) ?? null;
      });
      m = src ? cloneWorldMaterial(src as THREE.MeshStandardNodeMaterial) : new THREE.MeshStandardNodeMaterial();
      applySoulLook(m, kind);
      this.soulMats.set(key, m);
    }
    return new MannequinCharacter(t, m);
  }

  /** Asset v3 của nhân vật này nạp lỗi (bên gọi lùi về đường cũ trong bản còn giữ v1). */
  failed(g: string, skin?: string, set?: string, self = false): boolean {
    return this.tpl.get(this.keyOf(g, skin, set, self).key) === 'failed';
  }

  pending(g: string, skin?: string, w?: string, set?: string, self = false): boolean {
    if (this.get(g, skin, set, self) === null && !this.failed(g, skin, set, self)) return true;
    this.sword(w ?? SWORD_MODEL_DEFAULT);
    return this.swords.get(w ?? SWORD_MODEL_DEFAULT) === 'loading';
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.tpl.values()) {
      if (typeof t === 'string') continue;
      for (const g of t.owned) g.dispose();
      t.handle.release();
      t.lib.release();
    }
    this.tpl.clear();
    this.poseHandle?.release();
    this.poseHandle = null;
    for (const m of this.soulMats.values()) m.dispose();
    this.soulMats.clear();
    for (const m of this.dyeMats.values()) m.dispose();
    this.dyeMats.clear();
    for (const t of this.swords.values()) if (typeof t === 'object') t.release();
    this.swords.clear();
  }
}
