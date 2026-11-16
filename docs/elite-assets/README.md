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

Ảnh duyệt (bốn góc nhìn + lưới idle/run/attack/death) ở phần "Ảnh" cuối trang; chụp lại bằng `pnpm shots:elite --out <thư mục>`.

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

## Ảnh

GPU thật (Chrome, WebGPU), tắt tiếng, chụp trong trang xem asset (`?show=<id>`; hàng clip: khung 0 / 25% / 50% / 75% / 97%, nhìn bên).

### Huyết Nha Lang (`elite_huyet_nha_lang`)

![elite_huyet_nha_lang bốn góc](elite_huyet_nha_lang-stills.webp)

![elite_huyet_nha_lang animation](elite_huyet_nha_lang-anim.webp)

### Xích Diễm Hồ (`elite_xich_dien_ho`)

![elite_xich_dien_ho bốn góc](elite_xich_dien_ho-stills.webp)

![elite_xich_dien_ho animation](elite_xich_dien_ho-anim.webp)

### Cự Nham Viên (`elite_cu_nham_vien`)

![elite_cu_nham_vien bốn góc](elite_cu_nham_vien-stills.webp)

![elite_cu_nham_vien animation](elite_cu_nham_vien-anim.webp)

### Xích Sa Ngô Công (`elite_xich_sa_ngo_cong`)

![elite_xich_sa_ngo_cong bốn góc](elite_xich_sa_ngo_cong-stills.webp)

![elite_xich_sa_ngo_cong animation](elite_xich_sa_ngo_cong-anim.webp)

### Hộ Mạch Khôi Tướng (`elite_ho_mach_khoi_tuong`)

![elite_ho_mach_khoi_tuong bốn góc](elite_ho_mach_khoi_tuong-stills.webp)

![elite_ho_mach_khoi_tuong animation](elite_ho_mach_khoi_tuong-anim.webp)

### Liệt Cốt Báo Vương (`elite_liet_cot_bao`)

![elite_liet_cot_bao bốn góc](elite_liet_cot_bao-stills.webp)

![elite_liet_cot_bao animation](elite_liet_cot_bao-anim.webp)

### Lôi Vân Sư Vương (`elite_loi_van_su_vuong`)

![elite_loi_van_su_vuong bốn góc](elite_loi_van_su_vuong-stills.webp)

![elite_loi_van_su_vuong animation](elite_loi_van_su_vuong-anim.webp)

### Kính Diện Ma Quân (`elite_kinh_dien_ma_quan`)

![elite_kinh_dien_ma_quan bốn góc](elite_kinh_dien_ma_quan-stills.webp)

![elite_kinh_dien_ma_quan animation](elite_kinh_dien_ma_quan-anim.webp)

### Tuyết Vũ Vân Hạc Vương (`elite_van_hac_vuong`)

![elite_van_hac_vuong bốn góc](elite_van_hac_vuong-stills.webp)

![elite_van_hac_vuong animation](elite_van_hac_vuong-anim.webp)

### Cốt Kiếm Thống Lĩnh (`elite_cot_kiem_thong_linh`)

![elite_cot_kiem_thong_linh bốn góc](elite_cot_kiem_thong_linh-stills.webp)

![elite_cot_kiem_thong_linh animation](elite_cot_kiem_thong_linh-anim.webp)

### Dạ Minh Lộc Vương (`elite_da_minh_loc_vuong`)

![elite_da_minh_loc_vuong bốn góc](elite_da_minh_loc_vuong-stills.webp)

![elite_da_minh_loc_vuong animation](elite_da_minh_loc_vuong-anim.webp)

### Thạch Tượng Đại Tướng (`elite_thach_tuong_dai_tuong`)

![elite_thach_tuong_dai_tuong bốn góc](elite_thach_tuong_dai_tuong-stills.webp)

![elite_thach_tuong_dai_tuong animation](elite_thach_tuong_dai_tuong-anim.webp)

### Trong game, trước và sau (ba con Vân Lam)

`pnpm shots:elitegame --out <thư mục>`: tài khoản thử bất tử ở bãi hồ, `/gm spawn`; "cũ" là model khối (`?models=legacy`), "mới" là model Tripo. Đứng chờ · đang đánh · vừa chết (rơi đồ).

| | Cũ (khối) | Mới (Tripo) |
| --- | --- | --- |
| Huyết Nha Lang · chờ | ![](game-elite_huyet_nha_lang-cu-1-cho.webp) | ![](game-elite_huyet_nha_lang-moi-1-cho.webp) |
| Huyết Nha Lang · đánh | ![](game-elite_huyet_nha_lang-cu-3-danh.webp) | ![](game-elite_huyet_nha_lang-moi-3-danh.webp) |
| Huyết Nha Lang · chết | ![](game-elite_huyet_nha_lang-cu-5-chet-b.webp) | ![](game-elite_huyet_nha_lang-moi-5-chet-b.webp) |
| Xích Diễm Hồ · chờ | ![](game-elite_xich_dien_ho-cu-1-cho.webp) | ![](game-elite_xich_dien_ho-moi-1-cho.webp) |
| Xích Diễm Hồ · đánh | ![](game-elite_xich_dien_ho-cu-3-danh.webp) | ![](game-elite_xich_dien_ho-moi-3-danh.webp) |
| Xích Diễm Hồ · chết | ![](game-elite_xich_dien_ho-cu-5-chet-b.webp) | ![](game-elite_xich_dien_ho-moi-5-chet-b.webp) |
| Cự Nham Viên · chờ | ![](game-elite_cu_nham_vien-cu-1-cho.webp) | ![](game-elite_cu_nham_vien-moi-1-cho.webp) |
| Cự Nham Viên · đánh | ![](game-elite_cu_nham_vien-cu-3-danh.webp) | ![](game-elite_cu_nham_vien-moi-3-danh.webp) |
| Cự Nham Viên · chết | ![](game-elite_cu_nham_vien-cu-5-chet-b.webp) | ![](game-elite_cu_nham_vien-moi-5-chet-b.webp) |

## Số đo

Máy thử: Chrome, RTX 3060 Ti, 2026-11-16, trên nhánh đã gộp `origin/main` (#113, #114).

- `pnpm assets:validate`: **0 lỗi** (55 asset). Mỗi tinh anh 1,0–1,4 MB GLB (LOD0 11,3–12 nghìn tam giác, LOD1 ≤ 4,1 nghìn, LOD2 ≤ 1,5 nghìn; texture 1024 màu + 512 normal + 512 ORM, ước 9–10 MB VRAM kèm mip).
- `pnpm size`: tải trước khi vào game **2,62 MB** (so ngân sách 30 MB), không đổi vì 12 GLB nằm ở nhóm `asset-lazy` ("theo nhu cầu"). Ba tinh anh Vân Lam nạp lười sau khung đầu cùng Hàn Giao (`preloadLazy('van_lam')`); chín con còn lại chưa nằm trong bảng skin nên không nạp.
- `pnpm bench:client` (WebGPU + WebGL2 × thấp/vừa/cao × sân/rừng/hồ): 18/18 đạt; draw call tối đa 160 (< 300), CPU p95 tối đa 7,2 ms (< 8 ms; WebGPU Cao ở rừng), texture tối đa 390 MB (< 450 MB). Điểm đo không có tinh anh trong tầm nhìn nên số này chỉ xác nhận không hồi quy; chi phí thật khi đông tinh anh sẽ đo ở E-2/E-3/E-4.
- `pnpm typecheck`, `pnpm test` (shared 163, server 256, client 553 gồm `eliteSkins.test.ts`, asset-pipeline 17), `pnpm content:check`: đạt.
- Ảnh trong game: không có lỗi console.

## Giới hạn đã biết

- Clip là thủ tục (không phải mocap): biped dùng IK chân cố định, đòn `attack` là một nhát chém một tay (ngô công, hạc, thú bốn chân là đớp/lao); đủ đọc được nhưng chưa tinh. Nếu muốn animation đẹp hơn có thể tải clip Tripo web (preset miễn phí) vào `import.clips` như Thạch Viên.
- `refSpeed` của chín con mới là ước tính (xem `eliteSkins.ts`); `naturalSpeed` do `anim_quadruped.py` đo được cho rig lộn xộn không đáng tin (Liệt Cốt Báo âm), nên dùng công thức theo chiều dài thân.
- Hạc: chân/đuôi/đầu không bám đất; clip `idle` là vỗ cánh tại chỗ. Thân GLB đặt trên mặt đất, E-3 nâng lên.
- Ngô công: `death` cuộn thân lại chứ không nằm duỗi; chưa có clip `slam/sweep` (boss-style). Ba con thú bốn chân mới chưa có `slam/sweep` (hỗ trợ sẵn qua `import.extra`).
- Build lại bằng Blender 5.3 cho ra GLB hơi khác bản đã commit của hai boss `boss_kiem_khoi`, `boss_thu_mo_tuong` (hash đổi, validate báo lệch chiều cao 1,9% khi so với raw cục bộ): không đưa vào PR, giữ bản cũ.
