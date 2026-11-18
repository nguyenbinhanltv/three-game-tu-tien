import type { MonsterSkin } from './monsterSkins';
import type { ClipMap } from './states';

/**
 * Skin của 9 tinh anh Tripo cho bản đồ mới (E-1b). CHƯA gộp vào `MONSTER_SKINS`: quái chưa có trong dữ liệu game, và
 * `preload.ts`/`MonsterSkins.preload` chỉ nạp theo bảng đó nên các GLB này không nằm trong tải đầu. Worker E-2/E-3/E-4 khi thêm
 * quái `monsters.json` cùng id thì thêm vào bảng bằng `...ELITE_SKINS_NEW[id]` rồi đặt `level` của màn (giữ `lazy: true`).
 *
 * Kích thước asset đã là kích thước thật trong game (mét, `docs/ASSET_CONCEPTS.md`), nên đặt `scale: 1` trong monsters.json;
 * đổi `scale` thì refSpeed nhân theo (client tự nhân). refSpeed là ƯỚC TÍNH (m/s ở scale 1 mà clip chạy phát 1× khớp bước chân):
 * thú bốn chân 1,67 × chiều dài thân (cùng tỉ lệ sói trong game), hai chân 1,07 × chiều cao xương đầu (hành trình bước 0,32 H
 * trong nửa chu kỳ 0,3 s của clip `run`), rắn/giao theo chu kỳ trườn 1,0 s; chim bay lơ lửng bằng transform nên không dùng.
 * Nếu E-x thấy chân trượt thì chỉnh số này. Clip thủ tục: tools/blender/anim_quadruped.py / anim_biped_extra.py / anim_serpent.py /
 * anim_bird.py. Danh sách id → file: docs/elite-assets/README.md.
 */
const CLIPS: ClipMap = { idle: 'idle', run: 'run', attack: 'attack', hit: 'hit_light', death: 'death' };

export const ELITE_SKINS_NEW: Record<string, MonsterSkin> = {
  // Đoạn Mạch Cổ Cốc (E-2). Ngô công: thân dài 6 m, 17 xương đốt, không chân bám đất.
  elite_xich_sa_ngo_cong: { asset: 'elite_xich_sa_ngo_cong', clips: CLIPS, refSpeed: 5, legs: 'none', tint: '#ffffff', lazy: true },
  elite_ho_mach_khoi_tuong: { asset: 'elite_ho_mach_khoi_tuong', clips: CLIPS, refSpeed: 2.9, legs: 'biped', tint: '#ffffff', lazy: true },
  elite_liet_cot_bao: { asset: 'elite_liet_cot_bao', clips: CLIPS, refSpeed: 4.7, legs: 'quad', tint: '#ffffff', lazy: true },
  // Vân Hải Phù Đảo (E-3). Hạc: sải cánh 7 m, thân đặt trên đất trong GLB, E-3 nâng lơ lửng 3 m bằng transform.
  elite_loi_van_su_vuong: { asset: 'elite_loi_van_su_vuong', clips: CLIPS, refSpeed: 5.3, legs: 'quad', tint: '#ffffff', lazy: true },
  elite_kinh_dien_ma_quan: {
    asset: 'elite_kinh_dien_ma_quan',
    clips: CLIPS,
    refSpeed: 2.6,
    legs: 'biped',
    tint: '#ffffff',
    palette: { dark: '#2c2040', light: '#d8c4ec', glow: '#c8a0ff' },
    lazy: true,
  },
  elite_van_hac_vuong: { asset: 'elite_van_hac_vuong', clips: CLIPS, refSpeed: 5, legs: 'none', tint: '#ffffff', lazy: true },
  // Thiên Khuyết Cổ Thành (E-4).
  elite_cot_kiem_thong_linh: {
    asset: 'elite_cot_kiem_thong_linh',
    clips: CLIPS,
    refSpeed: 2.8,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
  },
  elite_da_minh_loc_vuong: { asset: 'elite_da_minh_loc_vuong', clips: CLIPS, refSpeed: 5, legs: 'quad', tint: '#ffffff', lazy: true },
  elite_thach_tuong_dai_tuong: {
    asset: 'elite_thach_tuong_dai_tuong',
    clips: CLIPS,
    refSpeed: 3.3,
    legs: 'biped',
    tint: '#ffffff',
    lazy: true,
  },
};
