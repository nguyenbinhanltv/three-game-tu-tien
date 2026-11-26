// Dòng thời gian hiệu ứng của một chiêu (VFX-V0): mỗi chiêu một file JSON `packages/content/data/fx/<id chiêu>.json`
// liệt kê sự kiện theo mốc thời gian (mesh, hạt, decal, vệt kiếm, khựng hình, rung camera, chớp, âm thanh).
// Chỉ là lớp hình: không đụng luật chơi, windup/hitAt vẫn do `skills.json` và server quyết định.
// Kiểu và hàm thuần ở đây để `content:check` kiểm; phần vẽ ở `apps/client/src/game/fxTimeline.ts`.

/** Ba tầng màu + bóng sẫm của một nhánh: lõi (đậm), thân (chủ đạo), viền (sáng), điểm nhấn (vàng...), bóng (sẫm nhất). */
export type FxTone = 'core' | 'body' | 'rim' | 'accent' | 'shadow';

/** Hình khối FX dùng chung (dựng ở `render/vfx/fxShapes.ts`). */
export type FxShape =
  /** Lưỡi liềm hai tông, mép trong rách, mọc theo đường vung. */
  | 'crescent'
  /** Gai tinh thể sáu mặt (trồi từ đất, mảnh vỡ). */
  | 'spike'
  /** Mũi tinh thể dài hai đầu nhọn (kiếm hóa quang). */
  | 'kite'
  /** Đĩa/vòng nằm ngang, mép rách (gợn sóng, vòng ấn). */
  | 'ripple'
  /** Tấm vuông quay mặt về camera: chớp va chạm + vạch tốc độ tỏa tròn. */
  | 'burst'
  /** Tấm khói toon phẳng trên mặt đất, nở rồi tan theo nhiễu. */
  | 'smoke'
  /** Dải xoắn quanh một trục (vòng xoắn của phi kiếm). */
  | 'helix'
  /** Dải xoắn mảnh (nét bút lông) cho vòng lụa cỡ lớn quanh một vùng: bề rộng dải chỉ bằng 1/3 `helix` khi phóng to. */
  | 'ribbon'
  /** Pháp tướng rồng: ống thon cuộn xoắn quanh một trục đứng, đầu ở đỉnh (kiểu `crystal`, mọc từ đuôi lên đầu). */
  | 'dragon'
  /** Pháp tướng tượng ngồi (La Hán): thân tròn xoay dựng từ đài sen tới đầu, cao ~4,2 m ở scale 1 (kiểu `crystal`). */
  | 'statue'
  /** Hồn binh (TN-2): bóng lính đứng cầm giáo, cao 1 ở scale 1 (chân ở gốc, dọc +Y), mặt quay +Z (kiểu `crystal`, mọc từ chân lên). */
  | 'soul_soldier'
  /** Thẻ pháp tướng vẽ 2D quay mặt về camera (kiểu `card`); chọn tranh bằng `card`. */
  | 'card'
  /** Chùm đường gió: bảy vệt mảnh cuộn quanh trục +Z, đầu vệt chạy dọc đường rồi tan (kiểu `wind`, Storm & Wind CC BY). */
  | 'gust'
  /** Sprite vẽ tay (Họa Pháp Lô 2): một ô của atlas `public/hoa-truc/vfx_sprites.webp` (lưới 4×10) (nền trong suốt) quay mặt về camera, tô ink theo bảng màu nhánh; chọn ô bằng `sprite` (kiểu `art`). */
  | 'sprite'
  /** Tấm flipbook (VS-1): khói mực, tia lửa, bụi, nét bút... phát tuần tự 16 khung theo tiến độ vòng đời; chọn atlas bằng `flip` (kiểu `flip`). */
  | 'flip'
  | FxLibShape;

/**
 * Thư viện hình mesh có khối (VS-1, dựng ở `render/vfx/fxLib.ts`). Hậu tố cho biết dùng thế nào:
 * `slash_*` vết chém dày (toon, mặt XZ lồi +Z); `bolt|bolt_b|bolt_c` tia sét zigzag có nhánh rẽ (toon, dọc +Z, ba biến thể để chập chờn); `blade_*` kiếm (crystal, mũi +Z); `shock_cone|crack_radial|rift_line|rune_ring2` mặt đất (toon, mặt XZ);
 * `rubble_*` đá vỡ, `rune_array|sword_halo|dragon_sword|petal_blade` (crystal); `spark_streak` tia lửa (toon, dọc +Z);
 * `seal_block|bell_cage|rock_spire|shield_plate|diamond_cage` khối Hộ pháp (crystal, đứng +Y, đáy y = 0; rơi/bay thì thêm `keepUp`).
 */
export type FxLibShape = (typeof FX_LIB_SHAPES)[number];
export const FX_LIB_SHAPES = [
  'slash_thick',
  'slash_thin',
  'slash_cross',
  'slash_fan',
  'bolt',
  'bolt_b',
  'bolt_c',
  'blade_flying',
  'blade_stuck',
  'blade_giant',
  'blade_ghost',
  'shock_cone',
  'crack_radial',
  'rift_line',
  'rubble_a',
  'rubble_b',
  'rubble_c',
  'rune_ring2',
  'rune_array',
  'dragon_sword',
  'sword_halo',
  'spark_streak',
  'petal_blade',
  // Hộ pháp (VS-1): ấn, chuông khung, trụ đá, thuẫn, khung kim cương; đứng theo +Y, đáy ở y = 0 (kiểu `crystal`).
  'seal_block',
  'bell_cage',
  'rock_spire',
  'shield_plate',
  'diamond_cage',
  // Đan sư (VS-1): viên đan (`crystal`), sen nở và lưỡi lửa (`toon`; đứng +Y, đáy y = 0, `sweep` = sen nở từ tâm ra / lửa bốc lên).
  'pill_orb',
  'lotus_bloom',
  'flame_tongue',
  // Đan lô (lò luyện đan ba chân, `crystal`, đứng +Y, đáy y = 0).
  'dan_lo',
  // Cổ tu: Cổ Vương (con cổ khổng lồ: thân ba đốt, đầu, hai cặp cánh, hai càng, hai râu; `crystal`, mũi ở +Z, cánh dang ±X).
  'co_vuong',
] as const;

/** Hình vẽ bằng shader `toon` (có lớp bóng sẫm phía sau khi `shadow` không tắt): tính thêm một nhóm draw call khi đếm ngân sách. */
export const FX_TOON_SHAPES: ReadonlySet<string> = new Set([
  'crescent',
  'ripple',
  'helix',
  'ribbon',
  'slash_thick',
  'slash_thin',
  'slash_cross',
  'slash_fan',
  'bolt',
  'bolt_b',
  'bolt_c',
  'shock_cone',
  'crack_radial',
  'rift_line',
  'rune_ring2',
  'spark_streak',
  'lotus_bloom',
  'flame_tongue',
]);

/** Atlas flipbook có sẵn (4×4 khung mỗi atlas, sinh thủ tục ở `render/vfx/flipbook.ts`). */
export const FLIP_ATLASES = ['ink_smoke', 'spark_burst', 'dust_kick', 'slash_streak'] as const;
export type FlipAtlas = (typeof FLIP_ATLASES)[number];

/**
 * Sprite vẽ tay (Codex, qua `tools/vfx-forge/sprite-pack.mjs`): thứ tự = ô trong atlas 4×10 (hàng trên trước, trái sang phải). Mỗi sprite là khối khói/hình có
 * lõi tối + viền sáng lạnh; shader đọc độ sáng làm tầng màu theo bảng màu nhánh (đọc được cả nền sáng lẫn đêm).
 */
export const FX_SPRITES = [
  'hon_hand_claw',
  'hon_hand_press',
  'hon_face_scream',
  'hon_face_sad',
  'hon_soldier',
  'hon_banner',
  'hon_chain',
  'hon_claws3',
  'hon_tornado',
  'hon_curtain',
  'hon_wave',
  'hon_orb',
  'hon_face_grin',
  'hon_wraith',
  'hon_whips',
  'hon_wisps',
  'hon_thread_s1',
  'hon_thread_s2',
  'hon_ring',
  'hon_veil',
  'hon_face_pale',
  'hon_face_horn',
  'hon_bone_hand',
  'hon_swarm9',
  // Lôi tu (tô kiểu "lôi": viền mực chàm tối → thân tím-lam → lõi trắng xanh; tiền tố `loi_` chọn kiểu tô)
  'loi_bolt_forked',
  'loi_bolt_zigzag',
  'loi_spear',
  'loi_cloud',
  'loi_bolts9',
  'loi_orbs',
  'loi_tablet',
  'loi_web',
  'loi_spiral',
  'loi_scales',
  'loi_wave',
  'loi_ground_arcs',
  'loi_flash',
  'loi_sparks',
  'loi_mark',
  'loi_arcs_pair',
  'kiem_afterimages',
  'kiem_flying',
  'kiem_seal',
  'kiem_rain',
  'kiem_circle',
  'kiem_wave',
  'kiem_arcs3',
  'kiem_pill',
  'kiem_drill',
  'kiem_ghost',
  'kiem_rift',
  'kiem_bigsword',
  'kiem_cracks',
  'kiem_flash',
  'kiem_sparks',
  'kiem_slash',
  'hp_wedge',
  'hp_furrows',
  'hp_seal',
  'hp_fieldcracks',
  'hp_crystal',
  'hp_fist',
  'hp_cracks',
  'hp_bell',
  'hp_peaks',
  'hp_earthwave',
  'hp_armor',
  'hp_shield',
  'hp_guardian',
  'hp_flash',
  'hp_dust',
  'hp_rubble',
  // Vân Hải A2 (kiểu tô "thủy": lõi chàm, thân xanh biển, bọt trắng; tiền tố `thuy_`) và Kính Nguyệt (kiểu tô "nguyệt": thép sẫm → bạc → trắng; tiền tố `nguyet_`)
  'thuy_whirl',
  'thuy_foam_ring',
  'thuy_jet',
  'thuy_wave',
  'thuy_spout',
  'thuy_spray',
  'thuy_arc',
  'thuy_beam',
  'nguyet_blade',
  'nguyet_slash',
  'nguyet_scar',
  'nguyet_shards',
  'nguyet_burst',
  'nguyet_ring',
  'nguyet_beam',
  'nguyet_halo',
  // Tinh anh A3 (kiểu tô vẽ tay nguyên màu): xương (cot_), đá (tho_), đất-độc (doc_), sét tím (tim_)
  'cot_claw',
  'cot_burst',
  'cot_crack',
  'cot_frags',
  'cot_dust',
  'cot_swipe',
  'tho_spikes',
  'tho_crack',
  'tho_dust',
  'tho_column',
  'tho_debris',
  'tho_jade',
  'doc_crater',
  'doc_roots',
  'doc_swirl',
  'doc_spores',
  'doc_mound',
  'doc_spray',
  'tim_bolt',
  'tim_arcs',
  'tim_cloud',
  'tim_orb',
  'tim_zigzag',
  'tim_flash',
  // Tinh anh Vân Lam A4: lửa ma ám tím (lua_), đá + khe hổ phách (ham_)
  'lua_plume',
  'lua_blast',
  'lua_embers',
  'lua_smoke',
  'lua_lick',
  'lua_scar',
  'ham_spikes',
  'ham_crack',
  'ham_dust',
  'ham_pillar',
  'ham_debris',
  'ham_ridge',
  'dao_vwedge',
  'dao_fan',
  'dao_giant',
  'dao_cleft',
  'dao_scythe',
  'dao_planted',
  'dao_ribbons',
  'dao_xcrack',
  'dao_cutline',
  'dao_crossed',
  'dao_skyslash',
  'dao_flash',
  'dao_shards',
  'dao_dust',
  'dao_streaks',
  'dao_shadow',
  // Đan sư (tô kiểu "đan": viền mực lục thẫm, thân xanh lá, lõi vàng chanh; tiền tố `dan_` chọn kiểu tô)
  'dan_lo_tripod',
  'dan_smoke_spiral',
  'dan_pill',
  'dan_ink_tail',
  'dan_drop',
  'dan_flame',
  'dan_lotus_bud',
  'dan_peony',
  'dan_leaves',
  'dan_wind_petals',
  'dan_leaf_ring',
  'dan_mist_sweep',
  'dan_vine',
  'dan_incense_s',
  'dan_crane',
  'dan_leaf_vortex',
  'dan_orb_giant',
  'dan_cauldron_big',
  'dan_pour',
  'dan_lotus_big',
  'dan_herb_ring',
  'dan_pills3',
  'dan_sparks',
  'dan_smoke_bud',
  'cth_footprints',
  'cth_fist',
  'cth_arm',
  'cth_crater',
  'cth_core',
  'cth_shards',
  'cth_stele',
  'cth_roots',
  'cth_dust',
  'cth_boulders',
  'cth_smear',
  'cth_streaks',
  'cth_slab',
  'cth_spark',
  'cth_arcs',
  'cth_veins',
  // A6: nhóm atlas `guong`
  'guong_shard',
  'guong_crack',
  'guong_hand',
  'guong_hands',
  'guong_pane',
  'guong_ray',
  'guong_spiral',
  'guong_crane',
  'guong_feather',
  'guong_glint',
  'guong_splinter',
  'guong_figure',
  'mac_stroke',
  'mac_blot',
  'mac_arcs',
  'mac_drops',
  // A6: nhóm atlas `dong`
  'dong_drops',
  'dong_stream',
  'dong_glyph',
  'dong_pillar',
  'dong_heat',
  'dong_plate',
  'dong_bell',
  'dong_scale',
  'phu_door',
  'phu_half',
  'phu_flip',
  'phu_split',
  'phu_leaf',
  'phu_dust',
  'tuq_feather',
  'tuq_wing',
  'tuq_beam',
  'tuq_rain',
  'tuq_burn',
  'tuq_vortex',
  'tuq_vein',
  'tuq_halo',
  'tuq_trail',
  'tuq_flock',
  // A6: nhóm atlas `kieu`
  'kieu_crack',
  'kieu_chunks',
  'kieu_blade',
  'kieu_wind',
  'kieu_armor',
  'kieu_dust',
  'kieu_bell',
  'kieu_vein',
  'kieu_slab',
  'kieu_ridge',
  'kieu_flip',
  'kieu_sweep',
  'sa_swirl',
  'sa_blade',
  'sa_storm',
  'sa_dune',
  'sa_dust',
  'sa_grain',
  'may_ball',
  'may_streak',
  'may_ring',
  'may_tuft',
  'may_tail',
  'may_burst',
  // V-P10: nhóm atlas `dp` (đột phá tầng/cảnh giới). Tranh vẽ ĐƠN SẮC (mực → trắng), shader tô theo bảng màu của timeline (kiểu 12).
  'dp_ribbon',
  'dp_leaves',
  'dp_slab',
  'dp_plume',
  'dp_pill',
  'dp_orbit',
  'dp_swirl',
  'dp_shell',
  'dp_bud',
  'dp_lotus',
  'dp_infant',
  'dp_petal',
  'dp_spirit',
  'dp_mantle',
  'dp_wisp',
  'dp_crack',
  // Trúng đòn chung (HPL2): nhóm atlas `chung` (vết va, chí mạng, chặn, né, cào/cắn, hồi máu/linh lực, ngắt chú). Tranh ĐƠN SẮC, kiểu tô 12 (theo bảng màu lúc phát: hướng tu người đánh / hệ quái).
  'chung_cut',
  'chung_smash',
  'chung_stab',
  'chung_crit',
  'chung_guard',
  'chung_dodge',
  'chung_chips',
  'chung_claw',
  'chung_fang',
  'chung_lotus',
  'chung_petals',
  'chung_drops',
  'chung_eddy',
  'chung_snap',
  'chung_puff',
  'chung_splat',
  // Trạng thái kéo dài (HPL2 PR2): chậm (sương băng), độc (bọt), bỏng (than hồng), choáng (đốm mực xoáy), đâm dày, khiên mai rùa, yếu điểm, mắt soi.
  'chung_frost',
  'chung_bubble',
  'chung_coal',
  'chung_dizzy',
  'chung_spear',
  'chung_ward',
  'chung_crack',
  'chung_eye',
  // Dấu trạng thái đọc rõ ở 720p: xích kéo lùi (chậm), lưỡi mực-than (bỏng), vòng sao + chim mực (choáng), lá + giọt ngọc (hồi dần).
  'chung_chain',
  'chung_flame',
  'chung_halo',
  'chung_leaf',
  // V-P10: nhóm atlas `ngu` (ngự kiếm: cất cánh, hạ cánh, vệt bay). Tranh đơn sắc, kiểu tô 12.
  'ngu_blade',
  'ngu_ring',
  'ngu_gust',
  'ngu_wake',
  'ngu_puffs',
  'ngu_dust',
  'ngu_streak',
  'ngu_wisp',
  // V-P10: nhóm atlas `kiep` (độ kiếp: mở kiếp, kiếp vân, chỗ sét đánh). Tranh đơn sắc, kiểu tô 12.
  'kiep_rift',
  'kiep_cloud',
  'kiep_cloud2',
  'kiep_eye',
  'kiep_impact',
  'kiep_smoke',
  'kiep_arcs',
  'kiep_knot',
] as const;
export type FxSprite = (typeof FX_SPRITES)[number];

/**
 * Texture Họa Pháp Lô 2 dùng chung theo hệ (Codex vẽ → `forge import` → KTX2 ở `public/assets/vfx`). Dùng cho quái/boss và chiêu người chơi;
 * chỉ là LỚP CHẤT LIỆU, mỗi chiêu/boss vẫn phải có silhouette riêng. `FORGE_DECALS` = decal nhìn thẳng từ trên (tex của `decal`),
 * `FORGE_FLIPS` = flipbook 4×4 (trường `flip` của hình `flip`). Thêm texture mới: thêm id ở đây + `render/vfx/forgeTex.ts`.
 */
export const FORGE_DECALS = ['warn_crack', 'ice_crack', 'steel_crack', 'ember_crack', 'bolt_scorch', 'jade_crack', 'root_mat'] as const;
export const FORGE_FLIPS = ['ice_flip', 'steel_flip', 'fire_flip', 'bolt_flip', 'earth_flip', 'root_flip'] as const;
export type ForgeDecal = (typeof FORGE_DECALS)[number];
export type ForgeFlip = (typeof FORGE_FLIPS)[number];
/** Hai atlas KTX2 chứa các texture trên (`apps/client/public/assets/vfx/<id>.ktx2`): decal xếp ô vuông 4×2 theo thứ tự `FORGE_DECALS`; flipbook xếp 3×2 tấm (mỗi tấm 4×4 khung) theo thứ tự `FORGE_FLIPS`. */
export const FORGE_ATLAS_IDS = ['decal_atlas', 'flip_atlas'] as const;
export const FORGE_DECAL_COLS = 4;
export const FORGE_DECAL_ROWS = 2;
export const FORGE_FLIP_SHEET_COLS = 3;
export const FORGE_FLIP_SHEET_ROWS = 2;

/**
 * Luật thứ bậc thị giác (V-P0): 1 chiêu của mình, 2 chiêu/cảnh báo của địch (kể cả đối thủ đấu pháp), 3 chiêu đồng đội, 4 hào quang/môi trường.
 * Chỉ chiêu đồng đội (không phải mình, không thù địch) tự giảm độ sáng 50%; chế độ tĩnh giảm còn 25%. Kích thước và vị trí giữ nguyên (`size` luôn 1)
 * để hình vẫn khớp tầm đánh thật; số hạt của người khác đã giảm riêng ở `particleScale`.
 */
export function fxHierarchy(mine: boolean, staticMode: boolean, hostile = false): { size: number; alpha: number } {
  if (mine || hostile) return { size: 1, alpha: 1 };
  return { size: 1, alpha: staticMode ? 0.25 : 0.5 };
}

/** Bố trí gốc của sự kiện. */
/** `area`: tâm vùng của chiêu diện rộng (`S.FX` x,z; không có thì như `ground`). `ground`: chân mục tiêu (mặt đất dưới chân); không có mục tiêu thì 5 m trước mặt, ngang chân người ra chiêu. */
export type FxAnchor = 'self' | 'target' | 'ahead' | 'ground' | 'area' | 'origin';

export interface FxBase {
  /** Giây so với mốc neo (mặc định `hitAt` của mốc trúng đang xét; `from: "start"` thì tính từ lúc bấm chiêu). Có thể âm. */
  t: number;
  from?: 'hit' | 'start';
  /**
   * Bậc chất lượng tối thiểu để phát: 0 = luôn (cả chiêu người khác ở mức Thấp), 1 = từ Vừa, 2 = chỉ Cao.
   * Chiêu của người khác bị hạ một bậc (xem `fxTierFor`).
   */
  tier?: 0 | 1 | 2;
  /** Chỉ phát ở mốc trúng thứ mấy (0-based) của chiêu nhiều mốc (Kiếm Vũ Tam Điệp...); không có thì mọi mốc. */
  hit?: number | number[];
  /** Sự kiện CHUNG bị bỏ khi biến thức đang chọn (`fx`) bằng giá trị này (biến thức thay hẳn một phần hình, không chỉ cộng thêm: Dịch Sơn Xung kéo thay vì đẩy). */
  unless?: string;
}

export interface FxMeshEvent extends FxBase {
  type: 'mesh';
  shape: FxShape;
  /** Tự thêm lớp bóng sẫm (cùng hình, to hơn 8%, vẽ trước) cho hình `toon`. Mặc định có. */
  shadow?: boolean;
  /** Gốc đặt: `self` ngực người ra chiêu, `ahead` trước ngực `dist` m theo hướng nhìn, `target` điểm trúng. */
  at?: FxAnchor;
  /** Dịch theo hệ cục bộ (x phải, y lên, z tiến) của người ra chiêu (mét). */
  offset?: [number, number, number];
  /** Xoay (độ) quanh x, y, z cục bộ; `roll` của lưỡi liềm là z. */
  rot?: [number, number, number];
  /** Cỡ ban đầu → cuối (đều hoặc [x,y,z]). */
  scale?: number | [number, number, number];
  scaleTo?: number | [number, number, number];
  dur: number;
  /** Màu: tầng nào của bảng màu nhánh làm thân. */
  tone?: FxTone;
  /** Độ trong lớn nhất (0..1). */
  alpha?: number;
  /** Đầu quét: 0..1 trong `sweep` đầu của vòng đời (mặc định 0,35); 0 = hiện cả hình ngay. */
  sweep?: number;
  /** Tan (ăn mòn) từ tỉ lệ vòng đời này (mặc định 0,5). */
  erodeFrom?: number;
  /** Mép rách 0..1 (mặc định 0,5). */
  ragged?: number;
  /**
   * Kiểu "mực" (V-P1, chỉ hình `toon`): lõi tối rộng, thân bão hòa, viền sáng chỉ còn một vệt mảnh sát mép và không mờ dần theo đuôi,
   * để đọc được trên nền đá trắng (viền pha trắng không chìm). Lớp bóng sẫm vẫn bật như thường.
   */
  ink?: boolean;
  /** Quay hình mặt về camera (burst, smoke). */
  billboard?: boolean;
  /** Hình `burst`: thêm vạch chéo ngang-dọc kiểu tia lửa va chạm (EdgeFlux "clash"), dùng cho đòn kim loại trúng đích. */
  cross?: boolean;
  /** Bay từ gốc sang `to` trong `dur` (phi kiếm lao, kiếm khí bay): gốc → đích, đơn vị mét hoặc theo neo. */
  move?: {
    to: FxAnchor;
    ahead?: number;
    ease?: 'out' | 'in' | 'linear';
    /** Dịch đích (khác `offset` của điểm xuất phát), ví dụ rơi thẳng từ trên cao. */ offset?: [number, number, number];
  };
  /** Atlas của hình `flip` (bắt buộc với `shape: "flip"`). */
  flip?: FlipAtlas | ForgeFlip;
  /** Ô sprite của hình `sprite` (bắt buộc với `shape: "sprite"`). */
  sprite?: FxSprite;
  /** Sprite billboard: `aim` xoay trong mặt phẳng nhìn để trục +x của tranh chạy dọc HƯỚNG NGẮM (chiêu tia/giáo/đường sét dài), tính từ camera chéo; `rot[2]` cộng thêm. */
  align?: 'aim';
  /** Tranh của hình `card`: `arhat` (La Hán ngồi + hào quang) hoặc `phoenix` (Phượng dang cánh); `colossus` (Cổ Thần khổng lồ nửa thân) và `fist` (cự quyền) của Cổ Thần (TN-5). */
  card?: 'arhat' | 'phoenix' | 'ghost' | 'colossus' | 'fist';
  /** Với `move`: giữ hướng thẳng đứng (chỉ xoay theo hướng nhìn) thay vì quay mũi theo hướng bay (rồng lao xuống). */
  keepUp?: boolean;
  /** Quay quanh trục tiến (độ/giây), cho vòng xoắn. */
  spin?: number;
  /** Seed hình (mặc định theo lần phát). */
  seed?: number;
  /** Bám theo mục tiêu/người ra chiêu suốt vòng đời (mặc định cố định tại điểm đặt). */
  follow?: boolean;
  /** Nhân kích thước (x, z) với bán kính vùng `r` của chiêu diện rộng (scale thành mét tính theo bán kính). */
  fit?: 'area';
  /** Hiệu ứng của quái (V5): `dur` lấy bằng thời gian báo trước `delay` của vạch (vùng sắp nổ), `dur` trong JSON chỉ là dự phòng. */
  untilDelay?: boolean;
  /**
   * Khối cao dựng quanh người (trụ đá, thuẫn): tự mờ dần tới ẩn khi nằm GIỮA camera và người ra chiêu, hoặc giữa camera và mục tiêu của đòn (khối trong 4 m quanh mục tiêu), để không che nhân vật
   * và mục tiêu đứng gần; phía bên kia vẫn hiện đủ. Chỉ là hình.
   */
  camFade?: boolean;
  /**
   * Đặt khối ở PHÍA XA camera so với người ra chiêu: nếu vị trí tính ra (anchor + offset) nằm cùng phía với camera thì lấy đối xứng qua người
   * (trên mặt XZ). Dùng cho bóng lớn "sau lưng" khi chưa biết hướng nhìn của người chơi so với camera (Hóa Hình của Cổ Thần).
   */
  awayFromCam?: boolean;
}

/**
 * Độ hiện (0..1) của một khối `camFade`: (cx, cz) = camera − người ra chiêu, (mx, mz) = khối − người ra chiêu trên mặt XZ.
 * Khối lệch dưới ~45° so với hướng về camera thì ẩn hẳn, ngoài ~75° hiện đủ; khối sát người (< 0,5 m) không mờ.
 */
export function fxCamFade(cx: number, cz: number, mx: number, mz: number): number {
  const lc = Math.hypot(cx, cz);
  const lm = Math.hypot(mx, mz);
  if (lc < 1e-3 || lm < 0.5) return 1;
  const d = (cx * mx + cz * mz) / (lc * lm);
  const k = Math.min(1, Math.max(0, (d - 0.26) / (0.7 - 0.26)));
  return 1 - k * k * (3 - 2 * k);
}

/**
 * Điểm (px, pz) đặt ở phía xa camera: (ax, az) = người ra chiêu, (cx, cz) = camera. Cùng phía với camera (tích vô hướng > 0) thì đối xứng qua người.
 * Trả `[x, z]` mới; không đổi khi đã ở phía xa hoặc trùng người.
 */
export function fxAwayFromCam(ax: number, az: number, cx: number, cz: number, px: number, pz: number): [number, number] {
  const dot = (px - ax) * (cx - ax) + (pz - az) * (cz - az);
  return dot > 0 ? [2 * ax - px, 2 * az - pz] : [px, pz];
}

export interface FxParticleEvent extends FxBase {
  type: 'particles';
  /** `spark` tia sáng ngắn, `shard` mảnh tinh thể, `dust` bụi mờ, `petal` cánh sáng. */
  kind: 'spark' | 'shard' | 'dust' | 'petal';
  n: number;
  at?: FxAnchor;
  offset?: [number, number, number];
  /** Tốc độ (m/s), độ tỏa 0..1 (0 = theo hướng tiến, 1 = mọi hướng), tuổi thọ (giây), cỡ. */
  speed: number;
  spread: number;
  life: number;
  size: number;
  tone?: FxTone;
  /** Bắn ngược (về phía người ra chiêu) thay vì theo hướng tiến. */
  back?: boolean;
  /** Thêm trọng lực (m/s², dương = rơi). */
  grav?: number;
  /** Hạt sinh quanh gốc (bán kính ≈ speed × life) rồi bay vào tâm (tụ khí). */
  inward?: boolean;
}

export interface FxDecalEvent extends FxBase {
  type: 'decal';
  /** `crack` vết nứt phát sáng, `rune` vòng triện văn, `scorch` vết cháy mờ. */
  tex: 'crack' | 'rune' | 'scorch' | 'strike' | ForgeDecal;
  /** Kiểu mực (V-P1, `rune` và `crack`): màu thân đậm, không pha viền sáng/HDR/nóng sáng, đọc được trên nền sáng. */
  ink?: boolean;
  at?: FxAnchor;
  offset?: [number, number, number];
  r: number;
  /** Mọc trong `grow` giây rồi giữ tới `dur` (tổng) và mờ dần. */
  grow?: number;
  dur: number;
  tone?: FxTone;
  alpha?: number;
  /** Góc xoay quanh trục đứng (độ); không có thì theo hướng nhìn + seed. */
  yaw?: number;
  /** Hiệu ứng của quái (V5): `dur` lấy bằng thời gian báo trước `delay` của vạch. */
  untilDelay?: boolean;
  /** Lớp tô tiến độ của vạch báo: `grow` lấy bằng `delay` thật của vạch (chiêu cùng khóa nhưng khác `delay` giữa các pha, vd. chant pha cuối), thay vì hằng số trong timeline. */
  growUntilDelay?: boolean;
  /** Vẽ ĐÈ lên mọi vật (không thử độ sâu): vạch báo của boss phải đọc được khi thân boss dài nằm đè lên vùng (V-P9). Chỉ dùng cho cảnh báo của địch. */
  top?: boolean;
  /** Mặt quạt (chỉ tex `FORGE_DECALS`): nửa góc (độ, 1–180) quanh hướng nhìn/hướng vùng; `yaw` là độ lệch thêm so với hướng đó (quét từng tia). `r` là bán kính cung quạt. */
  sector?: number;
  /** Dải chữ nhật (vùng `rect`; chỉ tex `FORGE_DECALS`): `[dài, rộng]` mét, từ tâm vùng về hướng nhìn/hướng vùng; không nhân cỡ quái. Ô texture lặp dọc dải. */
  strip?: [number, number];
  /** Với `sector`: tia xoay từ `swing[0]` sang `swing[1]` độ (so với hướng vùng) trong `swingDur` giây (mặc định 0,3). Một decal quét thay vì nhiều decal (trần 6 decal sống/runner). */
  swing?: [number, number];
  swingDur?: number;
  /** Nâng decal thêm (m, 0–0,5; mặc định 0) cho chỗ nền có ô đá nhô cao hơn mặt phẳng decal (sân lát đá tông môn). */
  lift?: number;
}

export interface FxTrailEvent extends FxBase {
  type: 'trail';
  /** Thời lượng lấy mẫu vệt kiếm bám xương `dtl_sword` (giây). */
  dur: number;
  tone?: FxTone;
}

export interface FxHitstopEvent extends FxBase {
  type: 'hitstop';
  /** Mili giây (40–80). */
  ms: number;
}

export interface FxShakeEvent extends FxBase {
  type: 'shake';
  /** Mức rung của `CameraShake` (0..1). */
  level: number;
}

/** Tia sét thiên lôi (hình có sẵn của `Vfx.lightning`), tông theo bảng màu; mảnh, không chớp toàn cảnh. */
export interface FxBoltEvent extends FxBase {
  type: 'bolt';
  at?: FxAnchor;
  offset?: [number, number, number];
  scale?: number;
  /** Hệ số bề rộng riêng của thân sét (hào quang/vòng chạm đất không đổi), (0, 6]. */
  thick?: number;
  tone?: FxTone;
  seed?: number;
  /** Lõi mực dưới thân sáng (V-P10): thiên lôi của độ kiếp đọc được trên nền sáng; chiêu người chơi không dùng. */
  ink?: boolean;
}

/**
 * Kéo camera ra xa nhẹ (chỉ của mình): `pull` = hệ số khoảng cách thêm (0..0,4), lên trong 0,4 s, giữ rồi hạ trong 0,6 s cuối của `dur`.
 * `fov` (VS-1, tùy chọn): đẩy góc nhìn thêm 0..8° cùng nhịp (đòn nặng "nện" vào mắt); theo công tắc "Rung màn hình".
 */
export interface FxCameraEvent extends FxBase {
  type: 'camera';
  pull: number;
  dur: number;
  fov?: number;
}

/**
 * Chậm thời gian TRÌNH DIỄN (VS-1; chỉ của mình, theo công tắc "Rung màn hình"): hình ảnh/hạt/animation chạy `scale`× tốc độ trong `ms`;
 * di chuyển, dự đoán, luật chơi và server không đổi. `scale` 0,2..0,9, `ms` 40..300.
 */
export interface FxSlowmoEvent extends FxBase {
  type: 'slowmo';
  scale: number;
  ms: number;
}

/** Chớp tối/sáng ở viền khung hình (VS-1; chỉ của mình): `amount` 0..0,5, tự tan trong `ms` (100..900). */
export interface FxVignetteEvent extends FxBase {
  type: 'vignette';
  amount: number;
  ms: number;
  tone?: 'dark' | 'light';
}

/** Âm đặt đúng mốc (VS-1): như `sound` nhưng chỉnh được tốc độ phát `rate` (0,6..1,6) và biến thiên ngẫu nhiên `jitter` (0..0,25). */
export interface FxSoundAtEvent extends FxBase {
  type: 'soundAt';
  id: string;
  gain?: number;
  rate?: number;
  jitter?: number;
}

export interface FxFlashEvent extends FxBase {
  type: 'flash';
  /** Độ chớp toàn cảnh 0..0,3 (tắt theo công tắc rung màn hình? không: giới hạn cứng để không lóa). */
  amount: number;
}

/**
 * Khung va chạm (V-P0): 1–2 khung hình tương phản cao ám màu ngay lúc trúng đòn (chỉ chiêu của mình, có công tắc tắt ở Cài đặt).
 * `tint`: `ink` ám xám mực, `warm` ám vàng nhạt, `cool` ám lam nhạt (KHÔNG có đỏ/cam: dành riêng cho cảnh báo của địch).
 */
export interface FxImpactEvent extends FxBase {
  type: 'impact';
  frames: 1 | 2;
  tint?: 'ink' | 'warm' | 'cool';
}

export interface FxSoundEvent extends FxBase {
  type: 'sound';
  id: string;
  gain?: number;
}

export type FxEvent =
  | FxMeshEvent
  | FxParticleEvent
  | FxDecalEvent
  | FxTrailEvent
  | FxHitstopEvent
  | FxImpactEvent
  | FxShakeEvent
  | FxFlashEvent
  | FxSoundEvent
  | FxBoltEvent
  | FxCameraEvent
  | FxSlowmoEvent
  | FxVignetteEvent
  | FxSoundAtEvent;

export interface FxTimeline {
  /** id chiêu (khớp `skills.json`/`methods.json`). */
  skill: string;
  /** Công pháp có bảng màu riêng; không có thì theo công pháp của chiêu (chung = kiếm tu). */
  palette?: string;
  /** Sự kiện chung mọi mốc trúng (neo `hit` thì áp cho từng mốc trúng của đòn). */
  events: FxEvent[];
  /** Sự kiện thêm theo đòn thứ mấy của chuỗi liên hoàn (khóa "0", "1", "2"). */
  combo?: Record<string, FxEvent[]>;
  /** Sự kiện thêm theo biến thức đã chọn (`fx` của `SkillVariant`: deep, spread, twin, long...). */
  variants?: Record<string, FxEvent[]>;
  /**
   * `fx`: chiêu không có mốc trúng/động tác riêng (lướt) nên phát khi nhận `S.FX` cùng loại `fxKind` (đúng công pháp `method` nếu có);
   * mọi sự kiện neo vào lúc nhận (hitAt = 0). Mặc định `skill`: phát theo sự kiện chiêu của model.
   */
  /** Với `trigger: fx`: chỉ khớp khi biến thức/`tb` của S.FX bằng giá trị này (ba cảnh giới đột phá dùng ba timeline); không có thì khớp mọi giá trị. */
  when?: string;
  trigger?: 'skill' | 'fx';
  fxKind?: string;
  method?: string;
  /** `S.FX` kiểu cũ mà timeline này thay thế (engine bỏ hình cũ của kiểu đó cho chiêu này). */
  replaces?: string[];
}

/**
 * Số draw call ước của một tập sự kiện: lưới cùng (hình, lớp) gộp một nhóm instanced (render/materials/fxBatch.ts), nên đếm số nhóm khác nhau:
 * mỗi hình mesh một nhóm (+1 nhóm bóng nếu có lớp bóng), decal nằm một nhóm riêng theo kiểu, vệt kiếm một nhóm. Hạt dùng chung hai lớp, không tính.
 */
export function fxDrawCount(events: readonly FxEvent[]): number {
  const groups = new Set<string>();
  let bolts = 0;
  let gusts = 0;
  for (const e of events) {
    if (e.type === 'mesh') {
      if (e.shape !== 'gust') groups.add(e.shape);
      if (e.shadow !== false && FX_TOON_SHAPES.has(e.shape)) groups.add(e.shape + ':shadow');
    } else if (e.type === 'decal') groups.add('decal:' + e.tex);
    else if (e.type === 'trail') groups.add('trail');
    else if (e.type === 'bolt') bolts++;
  }
  // Tia sét (`Vfx.lightning`) KHÔNG gộp instanced: mỗi tia một draw call; thêm hai nhóm gộp dùng chung (cầu sáng + vòng chạm đất) cho mọi tia.
  if (bolts > 0) {
    groups.add('bolt-glow');
    groups.add('bolt-ring');
    // Mỗi tia còn tự sinh vũng sáng (decal `strike`, tối đa 2 cái cùng lúc): cùng nhóm gộp với mọi decal (QUAD_XZ, renderOrder −3), nên chỉ thêm nhóm khi chiêu chưa có decal nào.
    if (![...groups].some((g) => g.startsWith('decal:'))) groups.add('decal:strike');
  }
  // Hình `gust` (kiểu `wind`) KHÔNG gộp instanced: mỗi lưới một draw call.
  for (const e of events) if (e.type === 'mesh' && e.shape === 'gust') gusts++;
  return groups.size + bolts + gusts;
}

/** Số sự kiện `mesh` tối đa mỗi đòn/biến thức (mỗi cái là một lưới sống + một closure mỗi khung). */
export const FX_MESH_MAX = 170;

/** Số âm tối đa (`sound` + `soundAt`) mỗi đòn/biến thức: mỗi âm chiếm một voice (MAX_VOICES = 32), âm FX không bị chống dồn. */
export const FX_SOUND_MAX = 8;

/** Ngân sách draw call của CẢ chiêu (VS-1): mọi sự kiện của mọi mốc/đòn/biến thức hợp lại. Mỗi mốc riêng vẫn ≤ 12. */
export const FX_SKILL_DRAW_MAX = 25;

/** Tổng số hạt của một tập sự kiện (ngân sách ≤ 1.500/chiêu). */
export function fxParticleCount(events: readonly FxEvent[]): number {
  let n = 0;
  for (const e of events) if (e.type === 'particles') n += e.n;
  return n;
}

/** Sự kiện của một mốc trúng thuộc đòn `combo` (không có `combo` thì chỉ sự kiện chung). */
export function fxEventsFor(tl: FxTimeline, combo: number, variant?: string): FxEvent[] {
  const extra = combo >= 0 ? tl.combo?.[String(combo)] : undefined;
  const vr = variant ? tl.variants?.[variant] : undefined;
  const base = variant && tl.events.some((e) => e.unless === variant) ? tl.events.filter((e) => e.unless !== variant) : tl.events;
  return extra || vr ? [...base, ...(extra ?? []), ...(vr ?? [])] : base;
}

/** Bậc chất lượng hiệu ứng (cài đặt người chơi): 0 Thấp, 1 Vừa, 2 Cao. */
export type FxQuality = 'low' | 'medium' | 'high';

export const FX_QUALITY_TIER: Record<FxQuality, 0 | 1 | 2> = { low: 0, medium: 1, high: 2 };

/** Bậc cao nhất được phát: chiêu người khác hạ một bậc (Cao → Vừa, còn lại → Thấp). */
export function fxTierFor(q: FxQuality, mine: boolean): 0 | 1 | 2 {
  const t = FX_QUALITY_TIER[q];
  return mine ? t : (Math.max(0, t - 1) as 0 | 1);
}

/** Kiểm một timeline; trả danh sách lỗi (rỗng = hợp lệ). */
export function validateFxTimeline(tl: FxTimeline, skillExists: (id: string) => boolean): string[] {
  const errs: string[] = [];
  const p = `fx ${tl.skill}`;
  if (!skillExists(tl.skill)) errs.push(`${p}: không có chiêu ${tl.skill}`);
  const all = [tl.events, ...Object.values(tl.combo ?? {}), ...Object.values(tl.variants ?? {})];
  for (const list of all) {
    for (const e of list) {
      if (!Number.isFinite(e.t) || Math.abs(e.t) > 3) errs.push(`${p}: mốc t=${e.t} ngoài [-3, 3]`);
      if (e.type === 'mesh' && !(e.dur > 0 && e.dur <= 4)) errs.push(`${p}: mesh ${e.shape} dur=${e.dur} ngoài (0, 4]`);
      if (e.type === 'decal' && !(e.dur > 0 && e.dur <= 8)) errs.push(`${p}: decal dur=${e.dur} ngoài (0, 8]`);
      if (e.type === 'impact' && ![1, 2].includes(e.frames)) errs.push(`${p}: impact frames ${e.frames} ngoài 1–2`);
      if (e.type === 'hitstop' && !(e.ms >= 40 && e.ms <= 80)) errs.push(`${p}: hitstop ${e.ms} ms ngoài 40–80`);
      if (e.type === 'shake' && !(e.level >= 0 && e.level <= 0.6)) errs.push(`${p}: rung ${e.level} ngoài 0–0,6`);
      if (e.type === 'flash' && !(e.amount >= 0 && e.amount <= 0.3)) errs.push(`${p}: chớp ${e.amount} ngoài 0–0,3`);
      if (e.type === 'camera' && !(e.pull >= 0 && e.pull <= 0.4 && e.dur > 0 && e.dur <= 4))
        errs.push(`${p}: camera pull=${e.pull} dur=${e.dur} ngoài (0–0,4, ≤ 4 s)`);
      if (e.type === 'camera' && !(e.fov === undefined || (e.fov >= 0 && e.fov <= 8))) errs.push(`${p}: camera fov=${e.fov} ngoài 0–8°`);
      if (e.type === 'slowmo' && !(e.scale >= 0.2 && e.scale <= 0.9 && e.ms >= 40 && e.ms <= 300))
        errs.push(`${p}: slowmo scale=${e.scale} ms=${e.ms} ngoài (0,2–0,9; 40–300 ms)`);
      if (e.type === 'vignette' && !(e.amount >= 0 && e.amount <= 0.5 && e.ms >= 100 && e.ms <= 900))
        errs.push(`${p}: vignette amount=${e.amount} ms=${e.ms} ngoài (0–0,5; 100–900 ms)`);
      if (e.type === 'soundAt') {
        if (!e.id) errs.push(`${p}: soundAt thiếu id`);
        if (!(e.rate === undefined || (e.rate >= 0.6 && e.rate <= 1.6))) errs.push(`${p}: soundAt rate=${e.rate} ngoài 0,6–1,6`);
        if (!(e.jitter === undefined || (e.jitter >= 0 && e.jitter <= 0.25))) errs.push(`${p}: soundAt jitter=${e.jitter} ngoài 0–0,25`);
        if (!(e.gain === undefined || (e.gain >= 0 && e.gain <= 1.5))) errs.push(`${p}: soundAt gain=${e.gain} ngoài 0–1,5`);
      }
      if (
        e.type === 'mesh' &&
        e.shape === 'flip' &&
        !(e.flip && ((FLIP_ATLASES as readonly string[]).includes(e.flip) || (FORGE_FLIPS as readonly string[]).includes(e.flip)))
      )
        errs.push(`${p}: mesh flip thiếu/sai atlas (${e.flip}), hợp lệ: ${[...FLIP_ATLASES, ...FORGE_FLIPS].join('|')}`);
      if (e.type === 'mesh' && e.shape !== 'flip' && e.flip) errs.push(`${p}: chỉ hình flip mới có trường flip`);
      if (e.type === 'mesh' && e.shape === 'sprite' && !(e.sprite && (FX_SPRITES as readonly string[]).includes(e.sprite)))
        errs.push(`${p}: mesh sprite thiếu/sai ô (${e.sprite}), hợp lệ: ${FX_SPRITES.join('|')}`);
      if (e.type === 'mesh' && e.shape !== 'sprite' && e.sprite) errs.push(`${p}: chỉ hình sprite mới có trường sprite`);
      if (e.type === 'decal' && e.strip !== undefined) {
        if (!(e.strip[0] > 0 && e.strip[0] <= 40 && e.strip[1] > 0 && e.strip[1] <= 12))
          errs.push(`${p}: decal strip=${e.strip} ngoài (0, 40] × (0, 12] m`);
        if (e.sector !== undefined) errs.push(`${p}: decal không dùng cả sector lẫn strip`);
        if (!(FORGE_DECALS as readonly string[]).includes(e.tex)) errs.push(`${p}: decal strip chỉ dùng cho tex ${FORGE_DECALS.join('|')}`);
      }
      if (e.type === 'decal' && e.sector !== undefined) {
        if (!(e.sector >= 1 && e.sector <= 180)) errs.push(`${p}: decal sector=${e.sector} ngoài 1–180°`);
        if (!(FORGE_DECALS as readonly string[]).includes(e.tex))
          errs.push(`${p}: decal sector chỉ dùng cho tex ${FORGE_DECALS.join('|')}`);
      }
      if (e.type === 'bolt' && !(e.scale === undefined || (e.scale > 0 && e.scale <= 4)))
        errs.push(`${p}: bolt scale=${e.scale} ngoài (0, 4]`);
      if (e.type === 'bolt' && !(e.thick === undefined || (e.thick > 0 && e.thick <= 6)))
        errs.push(`${p}: bolt thick=${e.thick} ngoài (0, 6]`);
      if (e.type === 'particles' && !(e.n > 0 && e.n <= 400)) errs.push(`${p}: hạt n=${e.n} ngoài (0, 400]`);
    }
  }
  // Ngân sách: mỗi đòn (sự kiện chung + của đòn đó) ≤ 12 draw và ≤ 1.500 hạt.
  const combos = Object.keys(tl.combo ?? {}).length ? Object.keys(tl.combo!).map(Number) : [-1];
  const vars: (string | undefined)[] = [undefined, ...Object.keys(tl.variants ?? {})];
  for (const c of combos) {
    for (const v of vars) {
      const ev = fxEventsFor(tl, c, v);
      if (fxDrawCount(ev) > 12) errs.push(`${p}: ${fxDrawCount(ev)} draw > 12 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
      if (fxParticleCount(ev) > 1500) errs.push(`${p}: ${fxParticleCount(ev)} hạt > 1500 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
    }
  }
  // VS-1: ngân sách cả chiêu (mọi mốc, đòn, biến thức hợp lại) ≤ 25 draw, và mỗi mốc tối đa một chớp chậm thời gian (chồng nhau gây rối nhịp).
  const union = [...tl.events, ...Object.values(tl.combo ?? {}).flat(), ...Object.values(tl.variants ?? {}).flat()];
  if (fxDrawCount(union) > FX_SKILL_DRAW_MAX) errs.push(`${p}: ${fxDrawCount(union)} draw cả chiêu > ${FX_SKILL_DRAW_MAX}`);
  for (const c of combos)
    for (const v of vars) {
      const ev = fxEventsFor(tl, c, v);
      for (const hit of new Set(ev.map((e) => (typeof e.hit === 'number' ? e.hit : -1)))) {
        const n = ev.filter(
          (e) => e.type === 'slowmo' && (e.hit === undefined || e.hit === hit || (Array.isArray(e.hit) && e.hit.includes(hit))),
        ).length;
        if (n > 1) errs.push(`${p}: ${n} slowmo cùng một mốc trúng (tối đa 1)`);
      }
    }
  // Số lưới: mỗi sự kiện `mesh` là một closure `Vfx.track` + một lần ghi instance mỗi khung; chiêu của người khác chỉ hạ một bậc nên vẫn nhiều (đo: ≥ 150 lưới sống làm khung p50 gấp đôi).
  for (const c of combos)
    for (const v of vars) {
      const n = fxEventsFor(tl, c, v).filter((e) => e.type === 'mesh').length;
      if (n > FX_MESH_MAX) errs.push(`${p}: ${n} sự kiện mesh > ${FX_MESH_MAX} (đòn ${c}${v ? ', biến thức ' + v : ''})`);
    }
  // Âm: `soundAt`/`sound` không qua chống dồn của `sfx` (throttle = false) và mỗi âm chiếm một trong MAX_VOICES = 32 → tối đa FX_SOUND_MAX mỗi đòn.
  for (const c of combos)
    for (const v of vars) {
      const n = fxEventsFor(tl, c, v).filter((e) => e.type === 'sound' || e.type === 'soundAt').length;
      if (n > FX_SOUND_MAX) errs.push(`${p}: ${n} âm > ${FX_SOUND_MAX} (đòn ${c}${v ? ', biến thức ' + v : ''})`);
    }
  // Tia sét: tối đa 4 tia mỗi đòn (mỗi tia một draw call riêng, không gộp).
  for (const c of combos)
    for (const v of vars) {
      const n = fxEventsFor(tl, c, v).filter((e) => e.type === 'bolt').length;
      if (n > 4) errs.push(`${p}: ${n} tia sét > 4 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
    }
  if (tl.trigger === 'fx' && !tl.fxKind) errs.push(`${p}: trigger fx thiếu fxKind`);
  return errs;
}
