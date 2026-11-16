# Nhập 12 tinh anh Tripo (E-1b)

2026-11-16 · đi kèm `docs/ASSET_CONCEPTS.md` (ưu tiên 1) và `docs/EXPANSION_DESIGN.md`.

Người dùng dựng 12 tinh anh trên Tripo web (`<DTL_ASSET_SOURCE>/mon/elite_*/tripo/{raw_v01,rig_v01}.glb`). Nhập theo pipeline
Tripo sẵn có: `assets/source/mon/<id>/meta.json` → `tools/blender/import_tripo.py` (+ script `import.post`) → `pnpm assets:build`
→ GLB có hash + `manifest.json`. Không tốn credit Tripo/API; mọi clip là thủ tục (không mua animation).

## Danh sách id → file

Nguồn: `<DTL_ASSET_SOURCE>/mon/<id>/tripo/rig_v01.glb` (riêng ngô công chỉ có `raw_v01.glb`, xương dựng bằng script). Build:
`apps/client/public/assets/<id>.<hash>.glb` (tên chính xác ở `manifest.json`). Mọi asset lớp ngân sách mới `elite`
(10–15 nghìn tam giác LOD0, LOD1 ≤ 5000, LOD2 ≤ 1500; texture màu 1024, normal/ORM 512; ≤ 60 xương). Kích thước là kích thước
thật trong game (mét), trừ ba con Vân Lam (nhập ở scale 1, `scale` trong `monsters.json` giữ nguyên nên hitbox không đổi).

| id | Tên | Bản đồ | Loại rig · script | Kích thước nhập | Tam giác LOD0 | Xương | Clip |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `elite_huyet_nha_lang` | Huyết Nha Lang | Vân Lam (**đã vào game**) | quadruped · `anim_quadruped.py` | dài 1,5 m × scale 1,75 = 2,6 m | 11 288 | 23 | idle run attack hit_light death |
| `elite_xich_dien_ho` | Xích Diễm Hồ | Vân Lam (**đã vào game**) | quadruped · `anim_quadruped.py` | dài 1,27 m × scale 1,5 = 1,9 m | 11 746 | 47 | idem |
| `elite_cu_nham_vien` | Cự Nham Viên | Vân Lam (**đã vào game**) | biped Mixamo · `anim_biped_extra.py` | cao 1,8 m × scale 2,0 = 3,6 m | 12 000 | 53 | idle run attack hit_light death + slam sweep stun |
| `elite_xich_sa_ngo_cong` | Xích Sa Ngô Công | Đoạn Mạch (E-2) | serpent tự dựng · `anim_serpent.py` | dài 6 m | 11 629 | 17 | idle run attack hit_light death |
| `elite_ho_mach_khoi_tuong` | Hộ Mạch Khôi Tướng | Đoạn Mạch (E-2) | biped Mixamo | cao 3,0 m | 12 000 | 52 | + slam sweep stun |
| `elite_liet_cot_bao` | Liệt Cốt Báo Vương | Đoạn Mạch (E-2) | quadruped | dài 2,8 m | 11 444 | 20 | cơ bản |
| `elite_loi_van_su_vuong` | Lôi Vân Sư Vương | Vân Hải (E-3) | quadruped | dài 3,2 m | 11 995 | 26 | cơ bản |
| `elite_kinh_dien_ma_quan` | Kính Diện Ma Quân | Vân Hải (E-3) | biped Mixamo | cao 2,6 m | 11 997 | 52 | + slam sweep stun |
| `elite_van_hac_vuong` | Tuyết Vũ Vân Hạc Vương | Vân Hải (E-3) | chim · `anim_bird.py` (mới) | sải cánh 7 m (cao 3,9 m, thân đặt trên đất) | 11 625 | 21 | cơ bản (idle = lơ lửng vỗ cánh) |
| `elite_cot_kiem_thong_linh` | Cốt Kiếm Thống Lĩnh | Thiên Khuyết (E-4) | biped Mixamo | cao 2,8 m | 11 998 | 44 | + slam sweep stun |
| `elite_da_minh_loc_vuong` | Dạ Minh Lộc Vương | Thiên Khuyết (E-4) | quadruped (kiểu đòn `gore`: húc) | dài 3,0 m | 11 342 | 30 | cơ bản |
| `elite_thach_tuong_dai_tuong` | Thạch Tượng Đại Tướng | Thiên Khuyết (E-4) | biped Mixamo | cao 3,4 m | 11 997 | 51 | + slam sweep stun |

Ảnh duyệt (bốn góc nhìn + lưới idle/run/attack/death): xem phần "Ảnh" cuối trang và `pnpm shots:elite`.

## Việc đã làm trong pipeline

- **Tiền tố `elite_`** (id, schema, `assets/budgets.json` lớp `elite`, `config.ts`/`optimize.ts`/`validate.ts`); `type` vẫn là `mon`, thư mục `assets/source/mon/elite_*`.
- **`anim_biped_extra.py`**: `import.extra` thêm `idle`, `run`, `attack`, `death` (thủ tục, cùng khung `keyed_clip`/IK chân với slam/sweep). Rig Mixamo của Tripo không kèm clip nên trước đây biped chỉ có clip khi người dùng tải thêm animation Tripo. `attack` chạm lúc 0,45 s (chém một tay), `run` 0,6 s lặp, `death` 1,6 s (khuỵu, gục tới trước).
- **`anim_quadruped.py`**: thêm `geometric_layout()` làm đường lùi khi `generic_layout()` thất bại. Rig quadruped Tripo của các tinh anh lộn xộn (chân mọc từ xương đầu, tên "Limb" gắn nhầm vào đuôi, không có xương đầu riêng, chân 2–6 xương). Bố cục hình học tách cây thành chuỗi xương, phân chân/đuôi/đầu theo vị trí, gắn lại cha của chân/đuôi vào xương cột sống gần nhất (Edit mode, tư thế nghỉ và trọng số không đổi). Sói/heo/cáo cũ vẫn đi đường cũ.
- **`anim_serpent.py`**: `import.serpent.auto` tự đo đường tâm từ lưới (ngô công nằm ngang, chữ S) thay cho đường tâm đo tay của Hàn Giao; Hàn Giao không đổi.
- **`anim_bird.py`** (mới): rig chim, cánh hai chuỗi xương, clip lơ lửng/bay/lao/giật/rơi.
- **`tools/perf/src/shots-elite.ts`** (`pnpm shots:elite --out <thư mục> [--only id,id]`): ảnh duyệt trong trang xem asset (`?show=<id>`), tắt tiếng.

## Dùng trong game

- Ba tinh anh Vân Lam: `apps/client/src/game/character/monsterSkins.ts` (`MONSTER_SKINS`, `lazy: true`, `level: 'van_lam'`: nạp sau khung đầu cùng Hàn Giao, không vào `pnpm size`). Thiếu/lỗi asset thì tự về model khối. hitbox/`scale` trong `monsters.json` giữ nguyên.
- Chín tinh anh mới: `apps/client/src/game/character/eliteSkins.ts` (`ELITE_SKINS_NEW`) **chưa** nằm trong `MONSTER_SKINS`, nên không bị nạp. Worker E-2/E-3/E-4 khi thêm quái cùng id vào `monsters.json` thì thêm `[id]: { ...ELITE_SKINS_NEW[id], level: '<màn>' }` vào `MONSTER_SKINS` (giữ `lazy: true`), đặt `scale: 1` (kích thước đã thật). `refSpeed` ở đó là ước tính; chỉnh nếu thấy chân trượt. Đòn lớn có vạch báo (`moves`): biped có `slam`/`sweep` (`BIPED_MOVES` ở `monsterSkins.ts`); thú bốn chân/ngô công/hạc chưa có clip đòn lớn, E-x thêm bằng `import.extra` nếu cần (`anim_quadruped.py` hỗ trợ `slam|sweep|stun`, `anim_serpent.py` thêm `chant`).
- Hạc Vương không có `legs` bám đất; E-3 nâng lơ lửng 3 m bằng transform.

## Số đo

Xem phần cuối (bench, size, validate).
