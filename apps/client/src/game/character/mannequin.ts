// Nhân vật v3 (N-0, `?chr=v3`): model nguyên khối có bộ xương UE5 Mannequin (`chr_v3_*`, tools/blender/chr_v3.py) phát
// clip UAL TRỰC TIẾP (`anim_ual_native`, cùng tên xương và tư thế nghỉ), không retarget lúc chạy. Bóng dùng chính bộ xương này
// (sửa lỗi bóng T-pose). Chưa có: pose IK chiêu K-5, kiếm gắn tay, phụ kiện bộ đồ, K-3 (đi lùi/ngang), IK chân.
// Đây là bản thử pipeline: không đổi mặc định, không đụng v1/v2.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SWORD_MODEL_DEFAULT } from '@dtl/content';
import { canCancel, POSE_CAST, POSE_FLY, POSE_SKY, type MonsterDef } from '@dtl/shared';
import { type AssetCache, type AssetHandle, assets } from '../core/assets';
import { HitReact, type HitOpts } from '../combat/hitreact';
import { adoptGltfMaterials } from '../../render/materials/world';
import { lodLevel, mixerInterval } from './skinned';
import { SpringBones, type SpringCollider, type SpringDef, type SpringParams } from './spring';
import { partExtras } from './sword';
import { SWORD_METALNESS, SWORD_ROUGHNESS, SWORD_TINT, swordTemplateOf, type SwordTemplate } from './swordModel';
import { applySkinLook, SKIN_LOOKS } from './skinLook';
import { applyV3Palette } from './v3Palette';
import {
  breathOf,
  dirMix,
  type DirMix,
  flinchDirOf,
  flinchOf,
  leanOf,
  LOCO,
  locoClipName,
  type LocoBand,
  type LocoDirKey,
  locoMix,
  lookAngles,
  swingRate,
  swingSeconds,
  turnLagOf,
  xfade,
} from './mannequinAnim';
import { MqFeet } from './mannequinFeet';
import { lowerBodyOf, upperBodyOf, MannequinPoseBank, type MqPose, PoseSource, POSE_SOURCE_ASSET, poseClipName } from './mannequinPoses';
import UAL_HIT from './ualHit.json';
import type { AnimState, AttackOpts, CharacterView, MonsterView, PerformOpts, SkillEvent } from './view';
import { FLAGS } from '../../base/flags';
import { logger } from '../../base/log';

const modelsLog = logger('models');

/** `?chr=v3` bật nhân vật Mannequin. Mặc định tắt. */
export const CHR_V3 = FLAGS.chr === 'v3';
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
export const V3_MODELS = V3_PICK === 'a' ? V3_MODELS_A : V3_PICK === 'b' ? V3_MODELS_B : V3_MODELS_B2;
/** Asset dùng lò xo v2 (`chr_v3b2_*` và các bộ dựng hàng loạt `chr_v3_<bộ>_*`): hệ số cứng gấu vạt, viên nang tay, phình viên nang khi ngồi. */
export const isSpring2 = (assetId: string | undefined): boolean =>
  !!assetId && (assetId.startsWith('chr_v3b2_') || Object.values(V3_OWN_SETS).some((k) => assetId.startsWith(`chr_v3_${k}_`)));
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
  hemStiff?: number;
  rMul?: number;
}
export const SKIRT_TUNE: Record<string, SkirtTune> = {
  chr_v3_dan_tam_: { rMul: 1.5 },
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
/** Skin chỉ có bản v3 (v1/v2 không có asset `set_skin_<tên>_<giới>`: bỏ qua, hiện trang phục thường). Varkessa có cả v1. */
export const V3_ONLY_SKINS: ReadonlySet<string> = new Set([
  'set_skin_duskrella',
  'set_skin_crimson',
  'set_skin_noxavyra',
  'set_skin_kings_demon',
  'set_skin_shadow_wolf',
  'set_skin_korvaden',
]);
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
};
const V3_BRANCH_FALLBACK: Readonly<Record<string, string>> = {
  set_lac_kiem: 'lac_kiem',
  set_han_giao: 'lac_kiem',
  set_tran_khich: 'lac_kiem',
  set_dia_giap: 'huyen_giap',
  set_van_kinh: 'huyen_giap',
  set_co_thanh: 'huyen_giap',
  set_tan_thiet: 'huyen_giap',
  set_phuc_mach: 'dan_tam',
  set_luu_ly: 'dan_tam',
  set_than_tang: 'dan_tam',
  set_tinh_dan_bao: 'dan_tam',
};
/** Asset v3 của một nhân vật (giới `g`, skin đang mặc nếu có, bộ trang bị `set`). Skin sai giới (server không cho mặc) bị bỏ qua. */
export function v3AssetOf(g: string, skin?: string, set?: string): string {
  const f = g === 'f';
  const id = skin ? V3_SKINS[skin] : undefined;
  if (id && id.endsWith(f ? '_nu' : '_nam')) return id;
  const key = set ? (V3_OWN_SETS[set] ?? V3_BRANCH_FALLBACK[set]) : 'de_tu';
  if (key === undefined || key === 'lac_kiem') return f ? V3_MODELS.f : V3_MODELS.m;
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
}

function restPos(root: THREE.Object3D, name: string): THREE.Vector3 | null {
  const o = root.getObjectByName(name);
  return o ? o.position.clone() : null;
}

export function mannequinTemplate(handle: AssetHandle, lib: AssetHandle): MannequinTemplate {
  const mats = adoptGltfMaterials(handle.scene);
  if (/^chr_v3b2?_lac_kiem/.test(handle.id)) for (const m of mats) applyV3Palette(m);
  const look = SKIN_LOOKS[handle.id];
  if (look) for (const m of mats) applySkinLook(m, look);
  const box = new THREE.Box3().setFromObject(handle.scene);
  // Độ cao hông của nhân vật so với bộ xương mẫu của thư viện: chỉ kênh vị trí của pelvis bị nhân theo tỉ lệ.
  const a = restPos(handle.scene, 'pelvis');
  const b = restPos(lib.scene, 'pelvis');
  const k = a && b && b.length() > 1e-6 ? a.length() / b.length() : 1;
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of lib.animations) {
    const cl = c.clone();
    for (const t of cl.tracks) {
      if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i]! *= k;
    }
    clips.set(c.name, cl);
  }
  const height = box.max.y - Math.max(box.min.y, 0);
  return { handle, lib, height, bank: null, clips };
}

/** Bù góc dang vai/tay (rad) theo model khi áp clip UAL: tay áo rộng của Tripo bị tay clip ép xuyên; đo/chỉnh bằng `chrv3 --pen`. `?armfit=<độ>` ghi đè. */
/** Lạc Kiếm v3b2: tay áo rộng đâm vào thân nên cần dang nhiều hơn mặc định (góc tổng đã đo bằng `springMetrics`, docs/chr-v3-arm/README.md). */
export const ARM_FIT: Record<string, number> = {
  chr_v3b2_lac_kiem_nam: (16 * Math.PI) / 180,
  chr_v3b2_lac_kiem_nu: (16 * Math.PI) / 180,
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
};
export const ARM_FIT_DEFAULT = ((FLAGS.armFit ?? 5) * Math.PI) / 180;

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
const _tq = new THREE.Quaternion();
const _tq2 = new THREE.Quaternion();
/** Lò xo v3 (vạt dài + tóc): cứng vừa, cản nhiều, góc lệch hẹp để vạt không xé/xuyên khi ngồi, lăn, chém (N-4). */
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
  attacks = 0;
  private inner = new THREE.Group();
  private rig: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private lods: THREE.Mesh[][] = [];
  private lodDist: [number, number] = [22, 55];
  private interval = 0;
  private acc = 0;
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
  private colScale = 1;
  private twists: Twist[] = [];
  private lodLevel = 0;
  /** Kiếm: vỏ trên lưng (`dtl_scabbard`) khi nghỉ, nắm tay (`dtl_sword`) khi giao chiến. */
  private blade: THREE.Mesh | null = null;
  private bladeLen = 0;
  private scabbard: THREE.Object3D | null = null;
  private hand: THREE.Object3D | null = null;
  private qScab = new THREE.Quaternion();
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
  private lastYaw = NaN;
  private yawRate = 0;
  private lean = 0;
  private turnLag = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private flinch = { amp: 0, age: 9, pitch: -1, roll: 0 };
  /** Lướt hiển thị (NV3-A4): hình xuất phát ở (fx, fz) thế giới rồi trượt về chỗ thật trong `dur` giây. */
  private dashOff: { fx: number; fz: number; t: number; dur: number } | null = null;
  private clock = Math.random() * 10;
  private side = 1;
  private armFit = 0;
  private disposed = false;

  constructor(
    private tpl: MannequinTemplate,
    shadow = false,
    sword: SwordTemplate | null = null,
  ) {
    this.height = tpl.height;
    this.shadow = shadow;
    this.spring2 = isSpring2(tpl.handle.id);
    this.rig = cloneSkinned(tpl.handle.scene);
    assets.trackInstance(tpl.handle.id, this.rig); // vị trí thật cho thứ tự nạp texture bậc cao (game/hires)
    const meshes: THREE.Mesh[] = [];
    this.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const lv = typeof o.userData.lod === 'number' ? o.userData.lod : 0;
      (this.lods[lv] ??= []).push(m);
      m.frustumCulled = false;
      if (shadow) m.material = shadowMaterial();
      meshes.push(m);
    });
    for (let i = 0; i < this.lods.length; i++) this.lods[i] ??= [];
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
      const skirt = defs.filter((d) => d.bone.startsWith('dtl_o_skirt_'));
      const rest = defs.filter((d) => !d.bone.startsWith('dtl_o_skirt_'));
      if (rest.length && !shadow) this.springs = new SpringBones(this.rig, rest, V3_SPRING, colliderDefs(this.rig, tpl.height));
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
    {
      const th = this.rig.getObjectByName('thigh_l');
      this.rig.updateMatrixWorld(true);
      if (th) this.side = Math.sign(th.getWorldPosition(new THREE.Vector3()).sub(this.rig.getWorldPosition(new THREE.Vector3())).x) || 1;
      this.armFit = ARM_FIT[tpl.handle.id] ?? ARM_FIT_DEFAULT;
    }
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
      align(this.hand, new THREE.Vector3(0, 1, 0), this.qHand);
      this.blade = sword.mesh.clone();
      this.blade.frustumCulled = false;
      this.bladeLen = sword.info.len;
      this.mountBlade(false);
    }
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

  private mountBlade(drawn: boolean): void {
    if (!this.blade) return;
    this.drawn = drawn;
    const bone = drawn ? this.hand : this.scabbard;
    bone?.add(this.blade);
    this.blade.position.set(0, 0, 0);
    this.blade.quaternion.copy(drawn ? this.qHand : this.qScab);
  }

  private applyLod(level: number): void {
    for (let i = 0; i < this.lods.length; i++) for (const m of this.lods[i]!) m.visible = i === Math.min(level, this.lods.length - 1);
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
    const next = this.action(name);
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
    if (this.loco) {
      this.locoKey.set(next, { band: 'jog', dir: 'f' });
      // Thứ tự cố định: đi, chạy nhanh, rồi lùi/ngang của từng dải (thiếu clip trong asset thì bỏ qua, quay về clip tới).
      const want: [LocoBand, LocoDirKey][] = [
        ['walk', 'f'],
        ['sprint', 'f'],
      ];
      for (const band of ['jog', 'walk', 'sprint'] as const) for (const d of ['b', 'l', 'r'] as const) want.push([band, d]);
      for (const [band, d] of want) {
        const c = this.action(locoClipName(band, d));
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
  dashFrom(fromX: number, fromZ: number, dur: number): void {
    if (this.dead) return;
    this.dashOff = { fx: fromX, fz: fromZ, t: 0, dur: Math.max(0.1, dur) };
    this.cancelRecovery('dash');
    // Chiêu còn sống mà chưa bị hủy thì giữ động tác chiêu; dash-cancel (đã hủy thu về, tắt dần 0,12 s) thì vẫn lăn.
    if (this.perf && !this.perf.cancelled) return;
    const len = this.tpl.clips.get('Roll')?.duration ?? 0;
    if (len > 0) this.oneShot('Roll', Math.min(3, Math.max(1, len / this.dashOff.dur)));
  }

  knockdown(): void {
    if (this.dead) return;
    this.chain = this.tpl.clips.has('LayToIdle') ? 'LayToIdle' : null;
    this.oneShot('Hit_Knockback');
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
    if (this.dead) return;
    if (V3_ANIM)
      this.flinch = {
        amp: o.heavy ? 0.26 : o.crit ? 0.18 : 0.12,
        age: -(o.delay ?? 0),
        ...flinchDirOf(this.root.rotation.y, o.dirX ?? 0, o.dirZ ?? 0),
      };
    if (!this.shot && !o.noFlash) this.oneShot(o.heavy ? 'Hit_Knockback' : 'Hit_Chest', o.heavy ? 1.2 : 1.4);
  }

  setViewDistance(d: number): void {
    this.setView({ dist: d, inView: true, allowLod0: true, self: d <= 0 });
  }

  setView(v: { dist: number; inView: boolean; allowLod0: boolean; self?: boolean }): void {
    const level = lodLevel(v.dist, this.lodDist, v.allowLod0, this.lods.length);
    this.applyLod(level);
    this.lodLevel = level;
    this.interval = mixerInterval(level, v.inView, !!v.self);
    this.inner.visible = v.inView;
  }

  update(realDt: number, a: AnimState): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    this.inner.position.z = 0;
    this.applyDash(realDt);
    this.combatT = a.combat ? COMBAT_HOLD : Math.max(0, this.combatT - realDt);
    if (a.dead && !this.dead) {
      // Chết: bỏ đòn đang phát và đòn nối tiếp, để Death01 phát trọn.
      this.shot?.stop();
      this.shot = null;
      this.chain = null;
    }
    this.dead = a.dead;
    this.lastAnim = a;
    this.updatePerform(dt, a);
    this.updateAtk(dt);
    this.grounded = !(a.flying || a.airborne || a.sky);
    const rawName = baseClipOf({ ...a, combat: a.combat || this.combatT > 0 });
    const name = this.baseFor(a, rawName);
    this.play(name);
    this.syncShotLower();
    if (this.loco) {
      // Trộn đi/chạy/chạy nhanh theo tốc độ thật; pha chung nên chân trụ không trượt khi đổi nhịp.
      const m = locoMix(a.speed);
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
    if (this.interval > 0 && this.acc < this.interval) return;
    this.blendBases(this.acc);
    if (this.loco && this.base) this.syncLoco(this.acc);
    this.mixer.update(this.acc);
    for (const t of this.twists) {
      _tq.copy(t.restLimb).invert().multiply(t.limb.quaternion);
      t.tw.quaternion.copy(t.restTw).multiply(_tq2.setFromAxisAngle(t.axis, TWIST_COUNTER * twistAngle(_tq, t.axis)));
    }
    if (V3_ANIM && !this.shadow && this.lodLevel === 0 && this.inner.visible) this.procedural(this.acc, a);
    if (this.feet) {
      if (this.lodLevel === 0 && this.inner.visible) {
        const active = this.grounded && !a.dead && !a.meditating && this.baseName !== 'Sitting_Idle_Loop';
        // Khóa chân chỉ khi đứng yên thật: đòn/chiêu/trúng đòn có chân tự di chuyển trong clip.
        this.feet.update(this.acc, { active, standing: a.speed < 0.3 && !this.perf && !this.shot });
      } else this.feet.release();
    }
    const drawNow = this.combatT > 0 || !!a.combat;
    if (drawNow !== this.drawn) this.mountBlade(drawNow);
    // Lò xo vạt: chỉ LOD0 và trong khung nhìn; ma trận thế giới của xương phải mới (root vừa được đặt vị trí).
    if (this.springs || this.skirtSprings) {
      if (this.lodLevel === 0 && this.inner.visible) {
        this.root.updateMatrixWorld(true);
        const sit = this.spring2 && (this.baseName === 'Sitting_Idle_Loop' || this.baseName === 'pose_tam_thien');
        this.colScale += ((sit ? SPRING2.sitScale : 1) - this.colScale) * Math.min(1, this.acc * 6);
        this.springs?.update(this.acc, IDENT);
        this.skirtSprings?.update(this.acc, IDENT, this.colScale);
      } else {
        this.springs?.reset();
        this.skirtSprings?.reset();
      }
    }
    this.acc = 0;
  }

  /** Khóa pha ba clip chạy và chân của đòn nửa trên; tạo/giữ clip nửa dưới khi đang đánh nửa trên. */
  private syncLoco(dt: number): void {
    this.locoPhase = (this.locoPhase + this.locoCycles * dt) % 1;
    for (const act of [this.base!, ...this.companions]) {
      act.timeScale = 0;
      act.time = this.locoPhase * act.getClip().duration;
    }
    const lb = this.perf?.lowerBase;
    if (lb) {
      lb.timeScale = 0;
      lb.time = this.locoPhase * lb.getClip().duration;
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
    if (this.loco) lb.time = this.locoPhase * lb.getClip().duration;
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
    const leanT = free && !this.perf && !this.shotUpper ? leanOf(this.yawRate, a.speed) : 0;
    this.lean += (leanT - this.lean) * k;
    const lagT = free && a.speed < 0.3 && !this.perf ? turnLagOf(this.yawRate) : 0;
    this.turnLag += (lagT - this.turnLag) * k;
    const ls = -this.lean * this.side;
    rotateWorld(b.spine_01 ?? null, fwd, ls * 0.4);
    rotateWorld(b.spine_02 ?? null, fwd, ls * 0.3);
    rotateWorld(b.spine_03 ?? null, fwd, ls * 0.3);
    rotateWorld(b.spine_02 ?? null, _up, -this.turnLag * 0.5);
    rotateWorld(b.spine_03 ?? null, _up, -this.turnLag * 0.5);
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
    // Bù dang tay/vai theo model (tay áo rộng không bị tay clip ép xuyên).
    // Hệ số theo độ buông của tay (hướng vai→khuỷu, 0 khi cách phương thẳng đứng hơn 60°, 1 khi buông thẳng): tay giơ/chém không bị dạng thêm, chỉ tay buông sát thân mới cần chừa.
    if (free && !a.casting && this.armFit) {
      const fit = this.armFit * perfW;
      rotateWorld(b.upperarm_l ?? null, fwd, fit * this.side * this.armDroop(b.upperarm_l, b.lowerarm_l));
      rotateWorld(b.upperarm_r ?? null, fwd, -fit * this.side * this.armDroop(b.upperarm_r, b.lowerarm_r));
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
    if (!this.blade || !this.drawn) return false;
    this.blade.updateWorldMatrix(true, false);
    base.setFromMatrixPosition(this.blade.matrixWorld);
    tip.set(0, this.bladeLen, 0).applyMatrix4(this.blade.matrixWorld);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hit.reset();
    this.blade?.removeFromParent();
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

/** Nạp và dựng nhân vật v3; PlayerSkins gọi khi `?chr=v3`. Trả null khi asset chưa nạp xong (bên gọi dùng đường cũ). */
export class MannequinPlayers {
  private tpl = new Map<string, MannequinTemplate | 'loading' | 'failed'>();
  private swords = new Map<string, SwordTemplate | 'loading' | 'failed'>();
  private disposed = false;
  /** Nguồn nướng pose K-5 (asset Mixamo), nạp lười khi có template đầu tiên. */
  private poseSrc: PoseSource | 'loading' | 'failed' | null = null;
  private poseHandle: AssetHandle | null = null;
  constructor(private cache: AssetCache) {}

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

  private load(id: string): void {
    if (this.tpl.has(id)) return;
    this.tpl.set(id, 'loading');
    Promise.all([this.cache.acquire(id, { priority: 1 }), this.cache.acquire(V3_LIB, { priority: 1 })]).then(
      ([h, lib]) => {
        if (this.disposed) {
          h.release();
          lib.release();
          return;
        }
        try {
          this.tpl.set(id, mannequinTemplate(h, lib));
          this.ensurePoses();
        } catch (err) {
          modelsLog.warn(`không dựng được ${id}`, err);
          this.tpl.set(id, 'failed');
        }
      },
      (err) => {
        modelsLog.warn(`không nạp được ${id} (v3)`, err);
        this.tpl.set(id, 'failed');
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

  private get(g: string, skin?: string, set?: string): MannequinTemplate | null {
    const id = v3AssetOf(g, skin, set);
    this.load(id);
    const t = this.tpl.get(id);
    if (t && typeof t !== 'string') this.ensurePoses();
    return t && typeof t !== 'string' ? t : null;
  }

  create(g: string, skin?: string, w?: string, set?: string): CharacterView | null {
    const t = this.get(g, skin, set);
    return t ? new MannequinCharacter(t, false, this.sword(w ?? SWORD_MODEL_DEFAULT)) : null;
  }

  createShadow(g: string, def: MonsterDef, skin?: string, set?: string): MonsterView | null {
    const t = this.get(g, skin, set);
    return t ? (Object.assign(new MannequinCharacter(t, true), { def }) as unknown as MonsterView) : null;
  }

  pending(g: string, skin?: string, w?: string, set?: string): boolean {
    if (this.get(g, skin, set) === null && this.tpl.get(v3AssetOf(g, skin, set)) !== 'failed') return true;
    this.sword(w ?? SWORD_MODEL_DEFAULT);
    return this.swords.get(w ?? SWORD_MODEL_DEFAULT) === 'loading';
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.tpl.values()) {
      if (typeof t === 'string') continue;
      t.handle.release();
      t.lib.release();
    }
    this.tpl.clear();
    this.poseHandle?.release();
    this.poseHandle = null;
    for (const t of this.swords.values()) if (typeof t === 'object') t.release();
    this.swords.clear();
  }
}
