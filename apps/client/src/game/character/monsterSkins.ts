import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  color,
  dot,
  float,
  materialColor,
  mix,
  normalView,
  positionViewDirection,
  pow,
  saturate,
  smoothstep,
  texture,
  vec3,
  vec4,
} from 'three/tsl';
import type { MonsterDef } from '@dtl/shared';
import { MONSTER } from '@dtl/content';
import { type AssetCache, type AssetHandle, assets } from '../core/assets';
import { MonsterModel } from '../core/models';
import { adoptGltfMaterials, toonBands } from '../../render/materials/world';
import { FLAGS } from '../../base/flags';
import { markVfxMask } from '../../render/post';
import { type BossMove, SkinnedMonster } from './skinned';
import type { SpringParams } from './spring';
import { partExtras } from './sword';
import { SWORD_METALNESS, SWORD_ROUGHNESS, swordTemplateOf, type SwordTemplate } from './swordModel';
import type { ClipMap } from './states';
import { ELITE_SKINS_NEW } from './eliteSkins';
import { MQ_CLIPS, MQ_LIB, MQ_MOVES, MQ_SHIELD_CLIPS, MQ_ZOMBIE_CLIPS, MQ_ZOMBIE_MOVES, pelvisScaledClips } from './mannequinMonster';
import { type BossMoveKind, legacyModelsRequested, type MonsterView } from './view';
import { logger } from '../../base/log';

const modelsLog = logger('models');

/** Quái dùng model có xương: asset, bảng clip, tông màu (nhân vào texture màu, không thêm texture). */
/** Lò xo cánh: cứng hơn vạt áo, góc lệch hẹp (cánh lớn không được quật quanh thân). */
const WING_SPRING: SpringParams = { stiffness: 70, drag: 5, maxAngle: 24, maxInward: 4 };

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
  /** Dáng đi để bám địa hình (P2-E3): hai chân → IK chân; bốn chân → nghiêng thân theo dốc; không chân (rắn/giao) → không chỉnh. */
  legs: 'biped' | 'quad' | 'none';
  /** Chỉ nạp khi quái xuất hiện lần đầu (boss trong bí cảnh), không nạp sẵn lúc vào thế giới. */
  lazy?: boolean;
  /** Màn (levelId) có quái này; `preloadLazy(levelId)` chỉ nạp trước skin nạp lười của đúng màn (bỏ trống = không nạp trước, chỉ nạp khi quái xuất hiện). */
  level?: string;
  /** Đòn lớn có vùng báo trước (M5-5) → clip và thời điểm chạm. */
  moves?: Partial<Record<BossMoveKind, BossMove>>;
  /** Ép hệ số kim loại (nhân với metalnessMap của asset): 0 = không kim loại, tránh vảy tối đen khi ngược sáng không có envMap. */
  metalness?: number;
  /**
   * Nâng sáng nền (ambient giả): cộng `màu texture × lift` vào emissive để mặt ngược sáng/trong bóng vẫn đọc ra màu
   * (giao ngọc lam bạc không chìm thành xanh than). Nhỏ thì chỉ nâng bóng, lớn thì phẳng hình khối.
   */
  lift?: number;
  /** Lõi phát sáng: phần ngả lam của texture màu phát sáng màu `accent`; số là cường độ. */
  coreGlow?: number;
  /** Bóng ma/gương trong mờ (E3-M): độ đục 0–1 của vật liệu (không ghi chiều sâu). */
  ghost?: number;
  /** Lưới dựng trên bộ xương UE5 Mannequin (chr_v3.py): clip lấy từ thư viện UAL dùng chung (`MQ_LIB`), `clips` trỏ tên clip UAL. Không bám địa hình bằng IK. */
  mannequin?: boolean;
  /**
   * Vũ khí rời (DV-2 đợt 3): asset kiếm `prop_kiem_*` gắn vào xương `dtl_sword` (cổ tay phải của chr_v3.py), lưỡi hướng lên ở tư thế
   * nghỉ như kiếm người chơi nên clip UAL cầm kiếm đúng. `scale` nhân kích thước model kiếm (0,82 m ở 1×).
   */
  weapon?: { asset: string; scale: number };
  /** Có cánh dựng bằng chuỗi xương (`dtl_wing_*` vỗ bằng code, `dtl_o_wing_*` lò xo; chr_v3.py `--wings`): bật lò xo tự động cho quái này. */
  wings?: boolean;
}

const WOLF_CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };
/** Cáo có thêm clip đi bộ của Tripo (quái đi tuần chậm); thú khác lùi về clip chạy phát chậm. */
const FOX_CLIPS: ClipMap = { ...WOLF_CLIPS, walk: 'walk' };
/** Boss: thêm choáng/mất thế; boss có niệm chú (M5-3) thêm clip chant. Boss không niệm thì `cast` lùi về idle. */
const BOSS_CLIPS: ClipMap = { ...WOLF_CLIPS, stun: 'stun' };
const CHANT_BOSS_CLIPS: ClipMap = { ...BOSS_CLIPS, cast: 'chant' };
/**
 * Quái có khiên/gương (E-0): clip `guard` lặp (giơ khiên phản đạn, chặn) gắn vào trạng thái `cast` (kênh giữ thế); E-2/E-3/E-4 đổi sang
 * trạng thái riêng nếu cần. Clip `revive` của Cốt Vệ Kiếm Thủ (hồi sinh một lần) có trong GLB nhưng chưa nối trạng thái nào.
 */
const GUARD_CLIPS: ClipMap = { ...WOLF_CLIPS, cast: 'guard' };
/**
 * Thời điểm chạm (giây trong clip ở 1×) của clip thủ tục: phải khớp tools/blender/anim_quadruped.py (thú bốn chân)
 * và tools/blender/anim_biped_extra.py (người/vượn).
 */
const QUAD_MOVES: MonsterSkin['moves'] = { slam: { clip: 'slam', impact: 1.0 }, sweep: { clip: 'sweep', impact: 0.9 } };
const BIPED_MOVES: MonsterSkin['moves'] = { slam: { clip: 'slam', impact: 1.0 }, sweep: { clip: 'sweep', impact: 0.85 } };
/** Giao (tools/blender/anim_serpent.py): slam 1,0 s (nện đầu), sweep 0,9 s (giữa quạt). */
const SERPENT_MOVES: MonsterSkin['moves'] = { slam: { clip: 'slam', impact: 1.0 }, sweep: { clip: 'sweep', impact: 0.9 } };

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
  // Đo lại 28/11 bằng xưởng animation (`pnpm shots xuong --only mons`: chân trụ trôi bao nhiêu % tốc độ thân lúc chạy, 0 = đứng yên): Hỏa Vân Hồ
  // 2,0 → 2,85 (−43% còn −9%), Huyết Nha Lang 4,3 → 1,65 (+62% còn +17%), Huyết Lang Vương 2,7 → 3,2, Kiếm Khôi 4,6 → 4,0. Sửa refSpeed thì
  // đo lại bằng lệnh đó, đừng suy từ số Blender (`refSpeed` còn nhân với `scale` của quái).
  // refSpeed của các thú dưới theo tỉ lệ tốc độ chân trụ đo trong Blender (anim_quadruped naturalSpeed) so với sói
  // (đo 3,14 ↔ 2,5 đã chỉnh trong game); vượn so với Thanh Phong cùng loại clip Tripo (đo 3,34 ↔ 3,0).
  // Thiết Bối Trư: clip đòn húc nanh (gore), chân ngắn nên bước nhanh.
  mon_thiet_boi_tru: { asset: 'mon_thiet_boi_tru', clips: WOLF_CLIPS, refSpeed: 1.3, legs: 'quad', tint: '#ffffff' },
  // Hỏa Vân Hồ: lông son của asset, viền ánh lửa nhẹ.
  mon_hoa_van_ho: { asset: 'mon_hoa_van_ho', clips: FOX_CLIPS, refSpeed: 2.85, legs: 'quad', tint: '#ffffff', rim: 0.3 },
  // Kiếm Linh: cùng model cáo, lông trắng sương → lam núi xa, phát sáng kiếm khí nhỏ (art: asset đợt 2).
  mon_kiem_linh: {
    asset: 'mon_hoa_van_ho',
    clips: FOX_CLIPS,
    refSpeed: 2.85,
    legs: 'quad',
    tint: '#ffffff',
    roughness: -0.1,
    palette: { dark: '#88ABAA', light: '#DCE6DF', glow: '#CFF3FF' },
  },
  // Thạch Viên: vượn đá hai chân, đòn nện hai tay (clip slash của Tripo đã cắt).
  mon_thach_vien: { asset: 'mon_thach_vien', clips: WOLF_CLIPS, refSpeed: 2.15, legs: 'biped', tint: '#ffffff' },
  // Tinh anh Vân Lam (E-1b): model Tripo thay model khối, nạp lười theo màn (không vào tải đầu). Kích thước nhập ở scale 1 (sói
  // 1,5 m, cáo 1,27 m dài, vượn cao 1,8 m), kích thước thật theo `scale` trong monsters.json (hitbox không đổi). refSpeed theo
  // tỉ lệ 0,796 của naturalSpeed đo trong Blender (cùng cách với sói). Clip thủ tục: tools/blender/anim_quadruped.py, anim_biped_extra.py.
  elite_huyet_nha_lang: {
    asset: 'elite_huyet_nha_lang',
    clips: WOLF_CLIPS,
    refSpeed: 1.65,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.3,
    lazy: true,
    level: 'van_lam',
  },
  elite_xich_dien_ho: {
    asset: 'elite_xich_dien_ho',
    clips: WOLF_CLIPS,
    refSpeed: 2.2,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.25,
    lazy: true,
    level: 'van_lam',
  },
  elite_cu_nham_vien: {
    asset: 'elite_cu_nham_vien',
    clips: WOLF_CLIPS,
    refSpeed: 1.8,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'van_lam',
  },
  // Boss Kiếm Trủng (M3-8). Sói chúa: naturalSpeed 3,378 theo cùng tỉ lệ với sói (→ 2,7); hai boss vượn đo chân trụ
  // clip run Tripo ở scale 1.
  boss_huyet_lang_vuong: {
    asset: 'boss_huyet_lang_vuong',
    clips: BOSS_CLIPS,
    refSpeed: 3.2,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.35,
    lazy: true,
    level: 'kiem_trung',
    moves: QUAD_MOVES,
  },
  boss_kiem_khoi: {
    asset: 'boss_kiem_khoi',
    clips: BOSS_CLIPS,
    refSpeed: 4.0,
    legs: 'biped',
    tint: '#ffffff',
    coreGlow: 1.6,
    lazy: true,
    level: 'kiem_trung',
    moves: BIPED_MOVES,
  },
  boss_thu_mo_tuong: {
    asset: 'boss_thu_mo_tuong',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 3.1,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'kiem_trung',
    moves: BIPED_MOVES,
  },
  // Hàn Giao (boss Hồ Sương Mù): giao băng không chân, bộ xương chuỗi 17 đốt + clip thủ tục. refSpeed 2,1 × scale 2,4 ≈ tốc độ 5 m/s
  // của boss (clip trườn 1,0 s/chu kỳ). Viền băng nhạt theo `accent`.
  boss_han_giao: {
    asset: 'boss_han_giao',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 2.1,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.5,
    lift: 0.3,
    metalness: 0,
    lazy: true,
    level: 'van_lam',
    moves: SERPENT_MOVES,
  },

  // ---- Quái thường của ba bản đồ mở rộng (E-0, docs/e0-mon/README.md) ----
  // Mọi skin dưới đây `lazy` + `level`: không vào gói tải đầu, chỉ nạp khi vào bản đồ (`preloadLazy(levelId)`) hoặc khi quái xuất hiện.
  // Clip đều thủ tục (tools/blender/anim_biped_extra.py `import.mon`, anim_quadruped.py, anim_creature.py). refSpeed ≈ 0,9 ×
  // naturalSpeed trong báo cáo import (cùng tỉ lệ như các thú trên).
  // Đoạn Mạch Cổ Cốc (E-2). Ba tinh anh (E2-B) lấy skin từ ELITE_SKINS_NEW (trước đó chưa gộp nên trong game vẫn là model khối).
  elite_liet_cot_bao: { ...ELITE_SKINS_NEW.elite_liet_cot_bao!, level: 'doan_mach' },
  elite_ho_mach_khoi_tuong: { ...ELITE_SKINS_NEW.elite_ho_mach_khoi_tuong!, level: 'doan_mach' },
  elite_xich_sa_ngo_cong: { ...ELITE_SKINS_NEW.elite_xich_sa_ngo_cong!, level: 'doan_mach' },
  mon_mach_thuong_ho_ve: {
    asset: 'mon_mach_thuong_ho_ve',
    clips: GUARD_CLIPS,
    refSpeed: 2.2,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'doan_mach',
  },
  mon_khai_mach_khoi_loi: {
    asset: 'mon_khai_mach_khoi_loi',
    clips: WOLF_CLIPS,
    refSpeed: 1.7,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'doan_mach',
  },
  mon_thach_giap_te: {
    asset: 'mon_thach_giap_te',
    clips: WOLF_CLIPS,
    refSpeed: 1.75,
    legs: 'quad',
    tint: '#ffffff',
    lazy: true,
    level: 'doan_mach',
  },
  mon_ngo_cong_au: {
    asset: 'mon_ngo_cong_au',
    clips: WOLF_CLIPS,
    refSpeed: 7.3,
    legs: 'none',
    tint: '#ffffff',
    lazy: true,
    level: 'doan_mach',
  },
  // Vân Hải Phù Đảo (E-3). Vân Hạc, Kim Thiền, Vân Hạc Vương và Kình Vương bay: client nâng thân theo `hover` của quái trong monsters.json (game/hover.ts, không nằm trong skin).
  elite_van_hac_vuong: { ...ELITE_SKINS_NEW.elite_van_hac_vuong!, level: 'van_hai' },
  elite_loi_van_su_vuong: { ...ELITE_SKINS_NEW.elite_loi_van_su_vuong!, level: 'van_hai' },
  mon_van_hac: { asset: 'mon_van_hac', clips: WOLF_CLIPS, refSpeed: 2.7, legs: 'none', tint: '#ffffff', lazy: true, level: 'van_hai' },
  mon_kinh_linh: {
    asset: 'mon_kinh_linh',
    clips: GUARD_CLIPS,
    refSpeed: 2.1,
    legs: 'biped',
    tint: '#ffffff',
    palette: { dark: '#1c2c48', light: '#b8d4f4', glow: '#7fc4ff' },
    lazy: true,
    level: 'van_hai',
  },
  mon_phu_dao_thach_quy: {
    asset: 'mon_phu_dao_thach_quy',
    clips: WOLF_CLIPS,
    refSpeed: 3.2,
    legs: 'quad',
    tint: '#ffffff',
    palette: { dark: '#2a2630', light: '#c4a870', glow: '#8fd0ff' },
    lazy: true,
    level: 'van_hai',
  },
  mon_bich_ngoc_kim_thien: {
    asset: 'mon_bich_ngoc_kim_thien',
    clips: WOLF_CLIPS,
    refSpeed: 2.9,
    legs: 'none',
    tint: '#ffffff',
    lazy: true,
    level: 'van_hai',
  },
  // Thiên Khuyết Cổ Thành (E-4)
  mon_thach_tuong_vo_si: {
    asset: 'mon_thach_tuong_vo_si',
    clips: GUARD_CLIPS,
    refSpeed: 1.9,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'thien_khuyet',
  },
  mon_da_minh_loc: {
    asset: 'mon_da_minh_loc',
    clips: WOLF_CLIPS,
    refSpeed: 2.9,
    legs: 'quad',
    tint: '#ffffff',
    lazy: true,
    level: 'thien_khuyet',
  },
  mon_cot_ve_kiem_thu: {
    asset: 'mon_cot_ve_kiem_thu',
    clips: WOLF_CLIPS,
    refSpeed: 2.1,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'thien_khuyet',
  },
  mon_co_thanh_chien_ma: {
    asset: 'mon_co_thanh_chien_ma',
    clips: WOLF_CLIPS,
    refSpeed: 2.7,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'thien_khuyet',
  },
  // Tinh anh Thiên Khuyết (E4-B): skin E-1b trong ELITE_SKINS_NEW.
  elite_thach_tuong_dai_tuong: { ...ELITE_SKINS_NEW.elite_thach_tuong_dai_tuong!, level: 'thien_khuyet' },
  elite_da_minh_loc_vuong: { ...ELITE_SKINS_NEW.elite_da_minh_loc_vuong!, level: 'thien_khuyet' },
  elite_cot_kiem_thong_linh: { ...ELITE_SKINS_NEW.elite_cot_kiem_thong_linh!, level: 'thien_khuyet' },
  // ---- Boss mở rộng (E-2/E-3/E-4): asset đã nhập, chưa có quái trong monsters.json; thêm quái cùng id là chạy. Nạp lười theo
  // màn (id màn là dự kiến của E-2..E-4, đổi `level` cho khớp LevelDef khi có). refSpeed (m/s ở scale 1, model theo kích thước thật)
  // tính từ sải chân của clip run (docs/boss-import/README.md). Đòn lớn khớp tools/blender/anim_{quadruped,serpent,biped_extra}.py.
  // Địa Mạch Long: rồng đá bốn chân, khe sáng ngọc lam theo máu (viền yêu khí nhẹ).
  // DV-B (chương 5, thử pipeline): bản điêu khắc CC BY giảm lưới + rig bằng tools/blender/sculpt_rig.py. Chưa đặt vào bản đồ
  // (không có `level`): chỉ nạp khi xuất hiện (/gm spawn). Lông đen nên nâng sáng nền và viền than hồng để đọc được trong bóng.
  boss_tam_thu_nguc_khuyen: {
    asset: 'boss_tam_thu_nguc_khuyen',
    clips: { ...CHANT_BOSS_CLIPS, walk: 'walk' },
    refSpeed: 8.9,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.3,
    lift: 0.35,
    metalness: 0.35,
    lazy: true,
    moves: { slam: { clip: 'slam', impact: 1.0 } },
  },
  // DV-2 đợt 1 (chương 5, Dị Vực): bản điêu khắc CC BY giảm lưới + rig bằng tools/blender/sculpt_rig.py + anim_quadruped.py (attack `gore`).
  // Chưa đặt vào bản đồ (không `level`): chỉ nạp khi xuất hiện (/gm spawn). Lông đen nên nâng sáng nền để đọc được trong bóng.
  mon_liet_hoa_ma_nguu: {
    asset: 'mon_liet_hoa_ma_nguu',
    clips: WOLF_CLIPS,
    refSpeed: 4.4,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.3,
    lift: 0.25,
    lazy: true,
  },
  mon_u_anh_cot_loc: {
    asset: 'mon_u_anh_cot_loc',
    clips: WOLF_CLIPS,
    refSpeed: 4.5,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.2,
    lift: 0.3,
    lazy: true,
  },
  boss_dia_mach_long: {
    asset: 'boss_dia_mach_long',
    clips: BOSS_CLIPS,
    refSpeed: 9.0,
    legs: 'quad',
    tint: '#ffffff',
    rim: 0.12,
    lift: 0.2,
    lazy: true,
    level: 'doan_mach',
    moves: QUAD_MOVES,
  },
  // Thôn Mạch Ngô Công Vương (Phục Mạch Quật): ngô công 14 m, xương chuỗi, tinh thạch sáng theo accent.
  boss_thon_mach_ngo_cong_vuong: {
    asset: 'boss_thon_mach_ngo_cong_vuong',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 4.6,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.35,
    lift: 0.2,
    metalness: 0,
    lazy: true,
    level: 'phuc_mach',
    moves: SERPENT_MOVES,
  },
  // Thạch Tâm Khôi Vương (Phục Mạch Quật): khôi đá 5 m, tim ngọc ở ngực phát sáng.
  boss_thach_tam_khoi_vuong: {
    asset: 'boss_thach_tam_khoi_vuong',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 2.0,
    legs: 'biped',
    tint: '#ffffff',
    coreGlow: 1.2,
    lazy: true,
    level: 'phuc_mach',
    moves: BIPED_MOVES,
  },
  // Vân Hải Kình Vương: kình ngư bay 18 m, xương chuỗi kiểu bơi.
  boss_van_hai_kinh_vuong: {
    asset: 'boss_van_hai_kinh_vuong',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 5.9,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.25,
    lift: 0.25,
    metalness: 0,
    lazy: true,
    level: 'van_hai',
    moves: SERPENT_MOVES,
  },
  // Kính Nguyệt Chân Quân (Kính Nguyệt Cung): người 3,6 m áo choàng bạc.
  boss_kinh_nguyet_chan_quan: {
    asset: 'boss_kinh_nguyet_chan_quan',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 1.3,
    legs: 'biped',
    tint: '#ffffff',
    palette: { dark: '#2c1840', light: '#f0b860', glow: '#ffd890' },
    lazy: true,
    level: 'kinh_nguyet',
    moves: BIPED_MOVES,
  },
  // Bóng giả của Kính Nguyệt Chân Quân (E3-M): cùng model, cùng kích thước, cùng bảng màu và cùng độ đục với thể thật (nhìn thường không phân biệt):
  // phân biệt bằng vết ngọc lam dưới chân thể thật (MF_REAL) hoặc thần thức (MF_SENSED), không bằng màu.
  mon_kinh_anh_gia: {
    asset: 'boss_kinh_nguyet_chan_quan',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 1.3,
    legs: 'biped',
    tint: '#ffffff',
    palette: { dark: '#2c1840', light: '#f0b860', glow: '#ffd890' },
    lazy: true,
    level: 'kinh_nguyet',
    moves: BIPED_MOVES,
  },
  // Kính Diện Ma Quân (mini-boss đợt 2 Kính Nguyệt Cung): skin tinh anh E-1b.
  elite_kinh_dien_ma_quan: { ...ELITE_SKINS_NEW.elite_kinh_dien_ma_quan!, level: 'kinh_nguyet' },
  // Thiên Khuyết Thủ Linh: tượng thần đá 8 m, kích thước lớn nên bước chậm.
  boss_thien_khuyet_thu_linh: {
    asset: 'boss_thien_khuyet_thu_linh',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 2.5,
    legs: 'biped',
    tint: '#ffffff',
    lift: 0.1,
    lazy: true,
    level: 'thien_khuyet',
    moves: BIPED_MOVES,
  },
  // Vô Diện Thần Quân (Thần Tàng Điện): người 4,6 m sáu tay phụ liền lưới.
  boss_vo_dien_than_quan: {
    asset: 'boss_vo_dien_than_quan',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 1.75,
    legs: 'biped',
    tint: '#ffffff',
    rim: 0.25,
    lift: 0.12,
    lazy: true,
    level: 'than_tang',
    moves: BIPED_MOVES,
  },
  // Quái và tinh anh trong Thần Tàng Điện (E4-C): dùng chung model với quái Thiên Khuyết (id riêng của bí cảnh để không đụng quái ngoài trời).
  mon_tt_cot_ve: {
    asset: 'mon_cot_ve_kiem_thu',
    clips: WOLF_CLIPS,
    refSpeed: 2.1,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'than_tang',
  },
  mon_tt_thach_tuong: {
    asset: 'mon_thach_tuong_vo_si',
    clips: GUARD_CLIPS,
    refSpeed: 1.9,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'than_tang',
  },
  mon_tt_chien_ma: {
    asset: 'mon_co_thanh_chien_ma',
    clips: WOLF_CLIPS,
    refSpeed: 2.7,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
    level: 'than_tang',
  },
  elite_tt_cot_kiem: { ...ELITE_SKINS_NEW.elite_cot_kiem_thong_linh!, level: 'than_tang' },
  // Phân thân thần niệm: cùng model với boss, nhạt hơn và nhỏ hơn.
  mon_tt_phan_than: {
    asset: 'boss_vo_dien_than_quan',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 1.75,
    legs: 'biped',
    tint: '#c8c0e0',
    rim: 0.25,
    lift: 0.12,
    lazy: true,
    level: 'than_tang',
    moves: BIPED_MOVES,
  },
  // Xích Tẫn Khích (DV-3D): model giữ chỗ dùng lại asset sẵn có, nhuộm theo bảng rift_* (thay bằng model Đọa Dực có cánh ở DV2-C).
  boss_xich_tan_cu_khoi: {
    asset: 'boss_thach_tam_khoi_vuong',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 2.0,
    legs: 'biped',
    tint: '#d89080',
    coreGlow: 1.5,
    lazy: true,
    level: 'xich_tan_khich',
    moves: BIPED_MOVES,
  },
  boss_tu_nhan_ma_tuong: { ...ELITE_SKINS_NEW.elite_cot_kiem_thong_linh!, tint: '#b89098', level: 'xich_tan_khich' },
  boss_tu_quang_duc_chu: {
    asset: 'boss_vo_dien_than_quan',
    clips: CHANT_BOSS_CLIPS,
    refSpeed: 1.75,
    legs: 'biped',
    tint: '#b898e8',
    rim: 0.3,
    lift: 0.12,
    lazy: true,
    level: 'xich_tan_khich',
    moves: BIPED_MOVES,
  },
  // DV-2 đợt 2 (quái hai chân Dị Vực, docs/dv2-mon/README.md): lưới trên xương Mannequin + clip UAL (`mannequin: true`). Nạp lười theo màn Bắc Hoang.
  mon_tan_chung: {
    asset: 'mon_tan_chung',
    clips: MQ_ZOMBIE_CLIPS,
    refSpeed: 3.2,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.2,
    lift: 0.3,
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_ZOMBIE_MOVES,
    mannequin: true,
  },
  mon_giac_kiem_trong_binh: {
    asset: 'mon_giac_kiem_trong_binh',
    clips: MQ_SHIELD_CLIPS,
    refSpeed: 3.4,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.3,
    metalness: 0,
    palette: { dark: '#2e2c3a', light: '#d2c4a6', glow: '#d9a93e' },
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
  },
  elite_hoi_giac_cu_thu: {
    asset: 'elite_hoi_giac_cu_thu',
    clips: MQ_CLIPS,
    refSpeed: 3.4,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.3,
    palette: { dark: '#34303a', light: '#cdbfb2', glow: '#ff5a3a' },
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
  },
  // Kim Dạ Cung (DV-3E): hai quái mới dùng lại lưới DV-2 đợt 2, đổi màu theo bảng rift_* (Châm Bà: vải liệm nhạt; Huyết Giác: đỏ máu + kim dát).
  mon_kd_trien_bo_cham_ba: {
    asset: 'mon_tan_chung',
    clips: MQ_ZOMBIE_CLIPS,
    refSpeed: 3.2,
    legs: 'none',
    tint: '#e6d6b4',
    rim: 0.25,
    lift: 0.3,
    lazy: true,
    level: 'kim_da_cung',
    moves: MQ_ZOMBIE_MOVES,
    mannequin: true,
  },
  elite_kd_huyet_giac_ma_tuong: {
    asset: 'elite_hoi_giac_cu_thu',
    clips: MQ_CLIPS,
    refSpeed: 3.4,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.35,
    palette: { dark: '#3a1a20', light: '#d8c0a0', glow: '#e0b44a' },
    lazy: true,
    level: 'kim_da_cung',
    moves: MQ_MOVES,
    mannequin: true,
  },
  // DV-2 đợt 3 (boss hình người Dị Vực, docs/dv2-mon/README.md): xương Mannequin + clip UAL. Kiếm Cơ cầm kiếm Tẫn Hỏa rời (`weapon`).
  boss_tan_hoa_kiem_co: {
    asset: 'boss_tan_hoa_kiem_co',
    clips: { ...MQ_CLIPS, cast: 'Idle_Loop' },
    refSpeed: 3.4,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.35,
    palette: { dark: '#3c2c26', light: '#f0d2b0', glow: '#ff7a30' },
    lift: 0.3,
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
    weapon: { asset: 'prop_kiem_tan_hoa', scale: 1.5 },
  },
  // DV-2 đợt 4: Thủ Khích Dực Chủ (Aetherion Nemesis), bốn cánh bằng chuỗi xương; texture tự có màu tím nên không đổi bảng màu, chỉ nâng sáng để đọc ở 12–24 m.
  boss_thu_khich_duc_chu: {
    asset: 'boss_thu_khich_duc_chu',
    clips: { ...MQ_CLIPS, cast: 'Idle_Loop' },
    refSpeed: 3.6,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.7,
    lift: 0.5,
    metalness: 0,
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
    wings: true,
  },
  // Anh Biến (Nhật Thực Kiếp): Nhật Thực Dực Chủ dùng lại bốn cánh của Thủ Khích Dực Chủ, nhuốm vàng nhật thực.
  boss_nhat_thuc_duc_chu: {
    asset: 'boss_thu_khich_duc_chu',
    clips: { ...MQ_CLIPS, cast: 'Idle_Loop' },
    refSpeed: 3.6,
    legs: 'none',
    tint: '#ffe6b8',
    rim: 1.4,
    lift: 0.5,
    metalness: 0,
    lazy: true,
    level: 'do_kiep_bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
    wings: true,
  },
  boss_kim_da_ma_hau: {
    asset: 'boss_kim_da_ma_hau',
    clips: MQ_CLIPS,
    refSpeed: 3.2,
    legs: 'none',
    tint: '#ffffff',
    rim: 0.5,
    lift: 0.45,
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
  },
  // Bóng của Ma Hậu (decoy `mirror.decoys`): cùng model, mờ và ngả vàng dát.
  mon_kim_da_bong: {
    asset: 'boss_kim_da_ma_hau',
    clips: MQ_CLIPS,
    refSpeed: 3.2,
    legs: 'none',
    tint: '#ffe0a0',
    rim: 0.5,
    lift: 0.3,
    ghost: 0.55,
    lazy: true,
    level: 'bac_hoang',
    moves: MQ_MOVES,
    mannequin: true,
  },
  mon_kd_bong_mac_ca: {
    asset: 'boss_kim_da_ma_hau',
    clips: MQ_CLIPS,
    refSpeed: 3.2,
    legs: 'none',
    tint: '#ffe0a0',
    rim: 0.5,
    lift: 0.3,
    ghost: 0.55,
    lazy: true,
    level: 'kim_da_cung',
    moves: MQ_MOVES,
    mannequin: true,
  },
};

interface Template {
  handle: AssetHandle;
  /** Clip dùng cho bản sao: clip của chính asset, hoặc (quái Mannequin) clip thư viện UAL đã chỉnh độ cao hông. */
  clips: readonly THREE.AnimationClip[];
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
  private swords = new Map<string, SwordTemplate | 'loading' | 'failed'>();
  /** Thư viện clip UAL dùng chung cho mọi quái Mannequin (nạp một lần, lúc skin Mannequin đầu tiên cần). */
  private mqLib: Promise<AssetHandle> | null = null;
  private mqLibHandle: AssetHandle | null = null;
  /** Template đã nạp nhưng đang biên dịch trước (chưa dùng được, xem `warm`). */
  private warming = new Map<string, Template>();
  /** Bóng tâm ma (P3-7) là bản sao model người chơi: EntityManager nối vào PlayerSkins (cùng giới/đạo bào của mình). */
  shadow: { create(def: MonsterDef): MonsterView | null; pending(): boolean } | null = null;
  /**
   * Biên dịch trước pipeline của skin vừa nạp xong (T5): quái/boss hiện lần đầu không còn khựng 12–33 ms vì 11–14
   * pipeline mới. Nhận một nhóm tạm (mọi mức LOD đều hiện, không nằm trong cảnh) để `compileAsync` dựng sẵn.
   */
  warm: ((obj: THREE.Object3D) => Promise<void>) | null = null;

  constructor(
    private cache: AssetCache = assets,
    readonly legacy = legacyModelsRequested(),
  ) {}

  /** Bắt đầu nạp mọi asset quái có trong bảng, trừ asset nạp lười (bỏ qua khi `?models=legacy`). */
  preload(): void {
    if (this.legacy) return;
    for (const s of Object.values(MONSTER_SKINS)) if (!s.lazy) this.load(s.asset);
  }

  /**
   * Nạp trước các asset nạp lười của màn `levelId` (boss bí cảnh Kiếm Trủng, Hàn Giao ở thế giới) để cảnh boss xuất hiện luôn
   * có model thật, không đổi từ model khối giữa cảnh. Skin của màn khác không được nạp (tốn băng thông và GPU vô ích).
   */
  preloadLazy(levelId: string): void {
    if (this.legacy) return;
    for (const s of Object.values(MONSTER_SKINS)) {
      if (!s.lazy || s.level !== levelId) continue;
      this.load(s.asset);
      if (s.weapon) this.sword(s.weapon.asset);
    }
  }

  /** Quái này sẽ có model mới nhưng asset đang nạp (tạm dùng model khối, nạp xong thì đổi). Asset lười bắt đầu nạp ở đây. */
  pending(def: MonsterDef): boolean {
    if (def.id === 'mon_tam_ma' && this.shadow) return this.shadow.pending();
    const s = MONSTER_SKINS[def.id];
    if (this.legacy || !s) return false;
    if (s.lazy) this.load(s.asset);
    const weaponLoading = !!s.weapon && this.sword(s.weapon.asset) === null && this.swords.get(s.weapon.asset) === 'loading';
    return this.templates.get(s.asset) === 'loading' || weaponLoading;
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
    assets.trackInstance(s.asset, scene); // vị trí thật của con quái cho thứ tự nạp texture bậc cao (game/hires)
    const mat = this.material(def, s, t);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    const view = new SkinnedMonster(def, {
      scene,
      clips: t.clips,
      clipMap: s.clips,
      height: t.height,
      refSpeed: s.refSpeed,
      bounds: t.bounds,
      moves: s.moves,
      ground: s.legs === 'none' ? undefined : s.legs,
      autoSprings: s.wings,
      springParams: s.wings ? WING_SPRING : undefined,
    });
    // Kiếm rời (`weapon`): mesh dùng chung, gắn vào xương `dtl_sword` (cổ tay phải); chưa nạp xong thì quái cầm tay không.
    const blade = s.weapon ? this.sword(s.weapon.asset) : null;
    if (blade && s.weapon) view.mountProp('dtl_sword', blade.mesh.clone(), s.weapon.scale);
    return view;
  }

  /** Mẫu kiếm `id` (prop_kiem_*), nạp lười; null khi chưa xong hoặc lỗi. */
  private sword(id: string): SwordTemplate | null {
    const cur = this.swords.get(id);
    if (cur) return typeof cur === 'string' ? null : cur;
    this.swords.set(id, 'loading');
    this.cache.acquire(id, { priority: 120 }).then(
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
        }
        this.swords.set(id, tpl);
      },
      () => this.swords.set(id, 'failed'),
    );
    return null;
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.swords.values()) if (typeof t !== 'string') t.release();
    this.swords.clear();
    for (const t of this.templates.values()) if (typeof t !== 'string') t.handle.release();
    this.mqLibHandle?.release();
    this.mqLibHandle = null;
    // Template đang biên dịch: `warmUp(...).finally` thấy `disposed` và tự trả handle.
    this.templates.clear();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }

  private load(id: string): void {
    if (this.templates.has(id)) return;
    this.templates.set(id, 'loading');
    // Cùng thang ưu tiên với prefetchWorldAssets (preload.ts): sau nhân vật mình và kiến trúc quanh chỗ hồi sinh.
    const mq = Object.values(MONSTER_SKINS).some((k) => k.asset === id && k.mannequin);
    const lib = mq ? this.acquireMqLib() : Promise.resolve(null);
    Promise.all([this.cache.acquire(id, { priority: 120 }), lib]).then(
      ([handle, libHandle]) => {
        if (this.disposed) {
          handle.release();
          return;
        }
        const tpl = templateOf(handle, libHandle ? pelvisScaledClips(handle.scene, libHandle.scene, libHandle.animations) : undefined);
        if (!this.warm) {
          this.templates.set(id, tpl);
          return;
        }
        // Giữ 'loading' (quái dùng model khối) tới khi pipeline biên dịch xong: không có mesh thật nào vẽ bằng pipeline còn dở.
        this.warming.set(id, tpl);
        void this.warmUp(id, tpl).finally(() => {
          this.warming.delete(id);
          if (!this.disposed) this.templates.set(id, tpl);
          else handle.release();
        });
      },
      (err) => {
        if (this.disposed) return;
        modelsLog.warn(`không nạp được ${id}, dùng model khối`, err);
        this.templates.set(id, 'failed');
      },
    );
  }

  /** Nạp (một lần) thư viện clip UAL cho quái Mannequin; handle giữ tới `dispose()`. */
  private acquireMqLib(): Promise<AssetHandle> {
    this.mqLib ??= this.cache.acquire(MQ_LIB, { priority: 120 }).then((h) => {
      if (this.disposed) h.release();
      else this.mqLibHandle = h;
      return h;
    });
    return this.mqLib;
  }

  /** Dựng một bản sao tạm cho mỗi loại quái dùng asset `id` (material riêng từng loại), hiện mọi LOD, rồi nhờ renderer biên dịch trước. */
  private async warmUp(id: string, t: Template): Promise<void> {
    const warm = this.warm;
    if (!warm) return;
    for (const [mid, s] of Object.entries(MONSTER_SKINS)) {
      const def = MONSTER.get(mid);
      if (s.asset !== id || !def || this.disposed) continue;
      const scene = cloneSkinned(t.handle.scene);
      const mat = this.material(def, s, t);
      const tmp = new THREE.Group();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = mat;
        m.visible = true;
        m.frustumCulled = false;
      });
      tmp.add(scene);
      try {
        await warm(tmp);
      } catch (e) {
        modelsLog.warn(`biên dịch trước ${mid} lỗi:`, e);
      } finally {
        scene.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
      }
    }
  }

  /** Material riêng cho mỗi loại quái (cùng texture của asset, khác màu nhân). */
  private material(def: MonsterDef, s: MonsterSkin, t: Template): THREE.MeshStandardNodeMaterial {
    let m = this.mats.get(def.id);
    if (m) return m;
    let src: THREE.Material | null = null;
    t.handle.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!src && mesh.isMesh) src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) ?? null;
    });
    m = adoptGltfMaterials(new THREE.Mesh(undefined, src ?? undefined))[0]!;
    m.color.multiply(new THREE.Color(s.tint));
    if (s.metalness !== undefined) m.metalness = s.metalness;
    if (s.roughness) m.roughness = Math.min(1, Math.max(0, m.roughness + s.roughness));
    if (s.palette) applyPalette(m, s.palette);
    if (s.ghost !== undefined) {
      m.transparent = true;
      m.opacity = s.ghost;
      m.depthWrite = false;
    } else if (s.rim || s.lift) {
      // Viền sáng ở mép nhìn nghiêng: tách bóng sói tối khỏi nền cỏ/rừng, không cần texture.
      const facing = saturate(dot(normalView, positionViewDirection));
      const rim = color(new THREE.Color(def.accent)).mul(pow(float(1).sub(facing), 3).mul(s.rim ?? 0));
      m.emissiveNode = s.lift ? rim.add(materialColor.rgb.mul(s.lift)) : rim;
    } else if (s.coreGlow && m.map) {
      // Lõi linh thể: chỗ texture ngả lam (xanh dương trội hơn đỏ) tự sáng màu accent; giáp xám/đồng không đổi.
      const c = texture(m.map);
      m.emissiveNode = color(new THREE.Color(def.accent)).mul(smoothstep(0.08, 0.22, c.b.sub(c.r)).mul(c.b).mul(s.coreGlow));
    }
    // Dạ Cảnh: quái cũng tô bóng chia bậc như nhân vật (quái bán trong suốt `ghost` giữ nguyên).
    if (FLAGS.da && s.ghost === undefined) {
      toonBands(m, true);
      markVfxMask(m);
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
function templateOf(handle: AssetHandle, clips?: readonly THREE.AnimationClip[]): Template {
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
  return { handle, clips: clips ?? handle.animations, height: box.max.y, bounds: new THREE.Sphere(center, radius) };
}
