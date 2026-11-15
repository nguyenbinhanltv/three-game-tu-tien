# Kiếm riêng theo trang bị (5 model Tripo web)

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
  ẩn ở LOD2) gắn vào xương đó với tâm chuôi trùng chuôi cũ và độ dài bằng kiếm cũ (kẹp 0,75–1,3 lần), nên rút/tra kiếm
  (M3-2), ra chiêu, IK tay đều giữ nguyên. Đổi vũ khí → `PlayerLook.w` đổi → dựng lại model; kiếm riêng chưa nạp xong thì
  tạm cầm kiếm mặc định. Kiếm nạp lười (chỉ kiếm mặc định nạp cùng nhân vật, +~370 KB).
- **Phát sáng +7/+10** (`swordGlow.ts`): vỏ sáng lấy số đo gốc lưỡi/chiều dài lưỡi của model mới (`glowDims`).
- Vỏ kiếm trên lưng là phần chung của nhân vật (không đổi theo kiếm).

## Ảnh (GPU thật, Chrome, preset Cao, WebGPU)

`pnpm shots:kiem --out <thư mục> [--gender m|f] [--only thanh-phong,thiet,...] [--glow 1|2]`

- `nam/`, `nu/`: mỗi kiếm 3 ảnh: `*-deo-lung` (đeo lưng), `*-cam-tay` (rút kiếm sau khi ra chiêu), `*-chem` (đang đánh).
- `sang-7/` (Thanh Phong +7, ánh ngọc lục) và `sang-10/` (Hàn Giao Lân +10, vàng + vệt kiếm khí).
