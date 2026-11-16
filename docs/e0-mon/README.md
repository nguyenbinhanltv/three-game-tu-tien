# E-0: 12 quái thường mới cho ba bản đồ mở rộng

Nhập 12 model Tripo (người dùng dựng trên web, ưu tiên 3 của `docs/ASSET_CONCEPTS.md`) vào pipeline asset: GLB tối ưu có hash, LOD, clip thủ tục idle/chạy/đánh/trúng đòn/chết, nạp lười theo bản đồ. **Chưa đặt vào bản đồ** và chưa có dòng nào trong `monsters.json` (việc của E-2/E-3/E-4: hp/atk, `ai`, `scale`, hitbox, loot). Quái Vân Lam cũ giữ nguyên.

Nguồn: `<dtl-asset-source>/mon/<id>/tripo/{raw_v01,rig_v01}.glb` (không có file `anim_*` nên mọi clip là thủ tục). Meta: `assets/source/mon/<id>/meta.json` (`import.kind: "tripo"`, nguồn là `rig_v01.glb`).

## Bảng id → file → bản đồ

Kích thước lấy theo `docs/ASSET_CONCEPTS.md` ("Kích thước trong game"). `scale` trong `monsters.json` nên để 1 cho kích thước này (E-2/3/4 chỉnh nếu cần). Clip: `idle, run, attack, hit_light, death` (+ `guard` cho quái khiên, `revive` cho Cốt Vệ). Tốc độ chân ở scale 1 là `naturalSpeed` của clip chạy (m/s), refSpeed client ≈ 0,9 ×.

| Asset id (= id quái) | Tên | Bản đồ · `level` (nạp lười) | Cấp | Cỡ (m) | Xương | Rig / script clip | Chạm đòn (s) | `naturalSpeed` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mon_mach_thuong_ho_ve` | Mạch Thương Hộ Vệ | E-2 Đoạn Mạch Cổ Cốc · `doan_mach` | 18–19 | cao 1,75 | 50 | Mixamo người, `anim_biped_extra` `mon` (húc khiên, `guard`) | 0,55 | 2,44 |
| `mon_khai_mach_khoi_loi` | Khai Mạch Khôi Lỗi | E-2 · `doan_mach` | 17–19 | cao 2,2 | 47 | Mixamo, `mon` (nện hai tay, chết sụp) | 0,80 | 1,90 |
| `mon_thach_giap_te` | Thạch Giáp Tê | E-2 · `doan_mach` | 16–17 | dài 2,2 | 21 | Tripo quadruped, `anim_quadruped` (`gore`: lao đầu) | xem log import | 2,17 |
| `mon_ngo_cong_au` | Ngô Công Ấu | E-2 · `doan_mach` | 18–19 | dài 2,4 | 14 | chuỗi xương Tripo, `anim_creature` `chain` | 0,50 | 8,2 |
| `mon_van_hac` | Vân Hạc | E-3 Vân Hải Phù Đảo · `van_hai` | 20–21 | sải cánh 3,2 | 34 | chim, `anim_creature` `bird` | 0,55 | 3,0 |
| `mon_kinh_linh` | Kính Linh | E-3 · `van_hai` | 21–22 | cao 2,0 | 51 | Mixamo, `mon` (chém, `guard` giơ gương) | 0,62 | 2,35 |
| `mon_phu_dao_thach_quy` | Phù Đảo Thạch Quy | E-3 · `van_hai` | 21–22 | dài 2,6 | 22 | quadruped, `anim_quadruped` | xem log import | 4,04 |
| `mon_bich_ngoc_kim_thien` | Bích Ngọc Kim Thiền | E-3 · `van_hai` | 20–23 | dài 0,7 | 24 | côn trùng, `anim_creature` `insect` | 0,35 | 3,2 |
| `mon_thach_tuong_vo_si` | Thạch Tượng Võ Sĩ | E-4 Thiên Khuyết Cổ Thành · `thien_khuyet` | 24–27 | cao 2,4 | 40 | Mixamo, `mon` (chém ngang, `guard`) | 0,82 | 2,11 |
| `mon_da_minh_loc` | Dạ Minh Lộc | E-4 · `thien_khuyet` | 24–25 | dài 2,2 | 20 | quadruped, `anim_quadruped` (`gore`: húc) | xem log import | 3,63 |
| `mon_cot_ve_kiem_thu` | Cốt Vệ Kiếm Thủ | E-4 · `thien_khuyet` | 25–27 | cao 1,8 | 43 | Mixamo, `mon` (chém bổ, `revive`) | 0,62 | 2,36 |
| `mon_co_thanh_chien_ma` | Cổ Thành Chiến Ma | E-4 · `thien_khuyet` | 26–27 | cao 2,6 (có cả ngọn giáo) | 51 | Mixamo, `mon` (đâm giáo, tiến chân, chết sấp) | 0,72 | 3,05 |

`level` là id màn dự kiến theo `docs/EXPANSION_DESIGN.md` (`doan_mach` có sẵn trong tài liệu; `van_hai`, `thien_khuyet` do E-3/E-4 chốt, đổi cho khớp ở `MONSTER_SKINS` khi tạo level).

Chạm đòn của quái bốn chân: clip `attack` của `anim_quadruped` (`gore` 0,9 s, đầu hất ở khoảng 0,5 s); xem báo cáo `[anim_quadruped]` khi `pnpm assets:build`.

## Nạp lười, không cộng vào tải đầu

Cả 12 skin trong `MONSTER_SKINS` (`apps/client/src/game/character/monsterSkins.ts`) có `lazy: true` + `level`, nên `prefetchWorldAssets`/`MonsterSkins.preload` bỏ qua. `MonsterSkins.preloadLazy(levelId)` nạp trước đúng màn khi vào bản đồ (E-1 gọi theo `Game.enterLevel`), hoặc nạp khi quái đầu tiên xuất hiện (`pending`). `pnpm size` không đổi so với trước (xem PR).

Để E-2/E-3/E-4 dùng: thêm quái vào `monsters.json` với `id` = asset id ở bảng trên (hoặc trỏ skin khác id về asset này, như `mon_yeu_lang` dùng model sói), thêm `bodyScale`/`scale` theo cỡ ở bảng.

## Pipeline và clip thủ tục

- `tools/blender/anim_biped_extra.py` thêm khối `import.mon` (mục 7 trong file): `idle`, `run` (IK chân, vung tay quanh dáng nghỉ nên vũ khí không rời tay), `attack` (`chop`, `thrust`, `bash`, `sweep`, `smash`), `guard`, `death` (`back`, `fwd`, `crumble`), `revive`. Khung khóa mới: `arot` (cánh tay xoay quanh dáng nghỉ), `hipsRot`, `noik`/`legrot` (chân tự do khi ngã), `armfree` (xác nằm, tay theo thân).
- `tools/blender/anim_creature.py` (mới): chim, rết, côn trùng có cánh; vai trò xương khai báo ở `import.creature.groups` vì rig Tripo của ba con này thiếu đối xứng (chim thiếu một đốt cánh, rết không có xương chân).
- Thú bốn chân (tê, hươu, rùa) dùng `anim_quadruped.py` có sẵn, chỉ thêm `yaw: 90` (đầu quay về -X trong GLB nguồn).
- Rig Tripo không có xương hàm/ngón riêng nên đòn cắn/húc là cúi đầu cả cổ như các quái cũ.

## Giới hạn đã biết

- Rùa: rig Tripo gán sai tên chi (chuỗi `0_left_limb` làm cổ), clip chạy ổn nhưng đòn húc chỉ là hất đầu; đòn giậm của thiết kế (`slam` r 5) cần clip riêng nếu E-3 muốn (dùng `import.extra` của `anim_quadruped` như boss).
- Vân Hạc: rig chỉ có hai đốt ở cánh trái, ba đốt ở cánh phải nên hai cánh hơi lệch nhau lúc vỗ.
- Bích Ngọc Kim Thiền / Vân Hạc bay: độ cao lơ lửng do client/server quyết định (clip chỉ nhún nhẹ); mặt đất của skin `legs: 'none'`.
- Ngô Công Ấu: chỉ 14 xương nên thân uốn thô; chân rết không nhúc nhích riêng.
- Ảnh duyệt hình (GPU thật, `pnpm shots:e0 --out <thư mục>`): `docs/e0-mon/<id>.jpg` (hàng đầu: trước/bên/sau/chéo; các hàng sau: 5 khung mỗi clip idle, run, attack, hit_light, death, guard, revive) và `docs/e0-mon/so-co-voi-nhan-vat.jpg` (cả 12 quái cạnh Thanh Phong, thang mét thật, dựng bằng Blender Workbench).
