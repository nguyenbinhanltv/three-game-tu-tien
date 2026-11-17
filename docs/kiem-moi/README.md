# Kiếm riêng theo trang bị (5 model Tripo web)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/kiem-moi/<file>`.

Trước đây mọi pháp kiếm dùng chung kiếm Thanh Phong nướng trong lưới nhân vật. Nay 5 kiếm có model riêng
(`prop_kiem_*`, lớp ngân sách `weapon`, ≤ 2500–3000 tam giác, texture 512²), cả nam (Thanh Phong) lẫn nữ (Lam Chi).

| Asset | Gán vào `items` | Bộ / phối màu | Tam giác LOD0 |
| --- | --- | --- | --- |
| `prop_kiem_thanh_phong` | `itm_thanh_phong_kiem` (và kiếm mặc định khi tay không / vũ khí lạ) | Lạc Kiếm: ngà + lam đậm, bạc | 2500 |
| `prop_kiem_thiet` | `itm_thiet_kiem`, `itm_moc_kiem` (gần nhất theo phẩm Phàm) | Huyền Giáp: đen sắt + đồng | 2500 |
| `prop_kiem_han_quang` | `itm_han_quang_kiem` | Đan Tâm: ngọc bích trầm + vàng nhạt | 2500 |
| `prop_kiem_han_giao` | `itm_hgl_kiem` | Hàn Giao Lân: bạc băng + lam ngọc | 2930 |
| `prop_kiem_tram_ta` | `itm_tram_ta_kiem` | cổ kiếm Kiếm Trủng (Thiên phẩm đề xuất) | 2902 |

## Cách chạy

- **Dữ liệu**: trường `model` của vật phẩm vũ khí (`items.json`, `equipment/setItems.json`); thiếu thì theo phẩm
  (`swordModelOf` trong `@dtl/content`, bảng phẩm 0→thiết, 1→thanh phong, 2→hàn quang, 3→hàn giao, 4→trảm tà).
  Server vẫn chỉ gửi id vũ khí (`wp`), client tự suy model: không đổi giao thức.
- **Pipeline**: `assets/source/prop/prop_kiem_*/meta.json` (kind `tripo`, `import.post = tools/blender/orient_sword.py`).
  Script xoay kiếm đứng (mũi +Y, cạnh lưỡi dọc X, cầu chuôi ở Y = 0), đo vị trí chắn và ghi extras `dtl.blade`
  `{ len, grip, guard, bladeStart }`. Không có LOD (lớp `weapon` không yêu cầu); `pnpm assets:build`.
- **Client** (`apps/client/src/game/character/swordModel.ts`, `playerSkins.ts`): khi mẫu nhân vật nạp xong (cùng kiếm
  mặc định), tam giác kiếm cũ (100% trọng số xương `dtl_sword`) bị cắt khỏi mọi LOD; mesh kiếm mới (không xương, 1 draw call,
  chỉ ở LOD0, LOD1/2 giữ kiếm cũ trong lưới) gắn vào xương đó với tâm chuôi trùng chuôi cũ và độ dài bằng kiếm cũ (kẹp 0,75–1,3 lần), nên rút/tra kiếm
  (M3-2), ra chiêu, IK tay đều giữ nguyên. Kiếm mới chỉ cắt khỏi lưới LOD0, nên số draw call thêm bị chặn bởi `LOD0_MAX` (12 người). Đổi vũ khí → `PlayerLook.w` đổi → dựng lại model; kiếm riêng chưa nạp xong thì
  tạm cầm kiếm mặc định. Kiếm nạp lười (chỉ kiếm mặc định nạp cùng nhân vật, +~370 KB).
- **Phát sáng +7/+10** (`swordGlow.ts`): vỏ sáng lấy số đo gốc lưỡi/chiều dài lưỡi của model mới (`glowDims`).
- **Vật liệu** (`SWORD_METALNESS/ROUGHNESS/TINT` trong `swordModel.ts`): game không có envMap, texture ORM của Tripo cho kim loại một phần nên lưỡi tối đen/ám đỏ; ép metalness 0, độ nhám 0,7 và nhân màu theo từng kiếm (ánh sáng game ngả lam ngọc làm thép xám ám xanh). Kiếm dài = kiếm cũ nhưng mũi không vượt mũi kiếm cũ (nên vừa vỏ trên lưng).
- Vỏ kiếm trên lưng là phần chung của nhân vật (không đổi theo kiếm).

## Đo hiệu năng (RTX 3060 Ti, Chrome, máy dùng chung nên dao động)

`?swords=legacy` giữ kiếm cũ trong lưới (không nạp/không dựng 5 model kiếm) để đo A/B cùng một bản build; `CROWD_QUERY='&swords=legacy' pnpm bench:crowd`, `LOAD_QUERY='&swords=legacy' pnpm bench:load`.

- **`bench:crowd`** (50 bot, preset Cao, 1 lượt mỗi bên), draw call max: sân WebGPU/WebGL2 199/200 (kiếm cũ 190/178); Kiếm Trủng đánh boss 266/264 (kiếm cũ 280/247). Chênh lệch nằm trong dao động giữa các lượt (VFX boss, số quái) và ≤ +12 theo thiết kế. CPU p50 sân 5,3 / 4,8 ms, boss 5,5 / 7,4 ms; các điểm boss "VƯỢT cpu" (p95) có ở cả hai bên, không do kiếm.
  - Bản đầu hiện kiếm riêng ở LOD0 và LOD1 cho +9…+50 draw call (boss WebGL2 297 sát trần 300); đã chuyển sang chỉ LOD0.
- **`bench:load`** (20 Mbps, 3 lượt × 2 vòng xen kẽ): khung game đầu 2,79 / 2,98 s (kiếm cũ 3,37 / 2,98 s), vào game 6,58 / 6,84 s (kiếm cũ 6,90 / 6,48 s): không chậm hơn. Kiếm mặc định (~370 KB) được prefetch cùng nhân vật (`preload.ts`, ưu tiên `player`).
- **`pnpm size`**: tải đầu 2,38 MB / 30 MB.

## Ảnh (GPU thật, Chrome, preset Cao, WebGPU)

`pnpm shots:kiem --out <thư mục> [--gender m|f] [--only thanh-phong,thiet,...] [--glow 1|2]`

- `nam/`, `nu/`: mỗi kiếm 3 ảnh: `*-deo-lung` (đeo lưng), `*-cam-tay` (rút kiếm sau khi ra chiêu), `*-chem` (đang đánh).
- `can/` + `so-sanh/`: kiếm cầm tay cận cạnh ảnh concept (`pnpm shots:kiem --hand-only --dist 1.2`).
- `sang-7/` (Thanh Phong +7, ánh ngọc lục) và `sang-10/` (Hàn Giao Lân +10, vàng + vệt kiếm khí).
