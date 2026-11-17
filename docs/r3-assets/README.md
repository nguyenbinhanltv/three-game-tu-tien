# R-3: dọn asset (2026-11-18)

Giai đoạn R-3 của kế hoạch tái cấu trúc. Ảnh so sánh nằm ở thư mục artifact của phiên làm việc (không commit, theo quy ước R-1); file này chỉ giữ số đo và kết luận.

> **Cập nhật sau R-3:** Q6 đã quyết bật KTX2 cho toàn bộ asset (`docs/ktx2/README.md`); hai đề xuất X13 đã làm (khóa chân dung đổi thành `npc_khieu_han_son`, `LEVEL_ART` có `van_hai`). Phần dưới là số đo tại thời điểm R-3.

## Kết quả

| Hạng mục | Trước | Sau |
| --- | --- | --- |
| `apps/client/public/assets` trên đĩa | 189,4 MiB | **139,1 MiB** |
| 18 áo v1 (`set_<bộ>_<nam\|nu>`, lớp `outfit`) | 77,5 MB | 24,8 MB |
| Bộ `terrain-ochre` | 3 lớp pháp tuyến trùng với bộ gốc | trỏ chung, bớt 0,92 MB |
| Tải đầu (`pnpm size`) | 2,94 MB | 2,94 MB (áo nạp lười) |
| `bench:crowd` 50 bot mặc `set_dia_giap`, sân, Cao: texture | 414,2 MB WebGPU / 349,4 MB WebGL2 | y hệt |

## Áo v1 nén WebP

- `assets/budgets.json`: lớp `outfit` thêm `"webp": true` (cùng thiết lập với `outfit_v2`: màu và normal lossy q88, emissive lossless, ORM lossy q93). `optimize.ts` không đổi, nhánh WebP có sẵn theo cờ này.
- Dựng lại từng áo bằng `pnpm assets:build --only <id>` (Blender 5.3 + optimize, `DTL_ASSET_SOURCE` trỏ thư mục nguồn). GLB thô ra đúng từng byte so với `rawBytes` cũ trong manifest.
- So GLB cũ và mới: **mọi accessor hình học và ma trận bind giống nhau từng byte**; manifest chỉ đổi `file`, `bytes`, `mimeType`. Không asset nào ngoài lớp `outfit` bị đổi.
- Sai khác texture (PSNR so với PNG gốc): màu 34–41 dB, normal 37–51 dB, emissive không mất gì. ORM 22–35 dB: lệch nằm trên đường biên giữa các vùng mặt nạ, rộng 1–2 texel, do WebP lossy lấy mẫu màu 4:2:0; áo v2 dùng cùng thiết lập từ trước.
- Ảnh trong game (`pnpm shots:outfit --only still`, 9 bộ × nam/nữ × 3 góc, WebGPU, preset Cao): lệch trung bình 1,3–2,4/255 mỗi kênh, ngang mức nhiễu giữa hai lần chụp (nhân vật thở, hạt bay); soi cận cảnh không phân biệt được.
- Bộ nhớ GPU không đổi: PNG và WebP đều giải mã thành RGBA8 1024².

## Vì sao 27 asset có bản build lớn hơn bản thô

Cả 27 đều là asset có xương và có 3 mức LOD. Ba nguyên nhân cộng lại:

1. LOD1 + LOD2 nằm chung file, thêm khoảng 70% dữ liệu hình học so với LOD0.
2. Mesh có xương không quantize (quantize dời phép giải lượng tử lên node/ma trận bind, clip có track scale làm nhân vật co lại), nên `EXT_meshopt_compression` chỉ nén được còn khoảng 62% trên thuộc tính float.
3. Texture đi thẳng qua, không nén lại (trừ lớp có `webp`).

Ví dụ `chr_kiem_tu_nam`: thô 1.649 KB = texture 869 + hình học 755; build 1.674 KB = texture 869 + phần hình học sau nén 805 (LOD0/1/2 trước nén 755/369/167 KB).

- 18 trong 27 là áo v1: texture PNG chiếm 3,9/4,6 MB mỗi file, đã hết sau khi nén WebP.
- 9 còn lại (`chr_kiem_tu_nam`, 6 quái, 2 tinh anh) vượt 0,1–35 KB mỗi file, tổng 152 KB. Không phải lỗi, **không sửa trong R-3**.
- Hướng giảm nếu sau này cần: quantize riêng các thuộc tính không phải vị trí (`NORMAL`, `TANGENT`, `TEXCOORD_n`, `WEIGHTS_n`) cho mesh có xương. Thử trên bản build hiện tại (không ghi file): 86 asset có xương 111,3 → 92,2 MB (−19 MB). Việc này đổi mọi GLB có xương nên phải dựng lại toàn bộ và duyệt ảnh, kiểm code client đọc thẳng mảng thuộc tính (`outfit.ts`, `bodyRegions.ts`, `bodyFit.ts`); để thành hạng mục riêng.

## X14: texture terrain trùng

`terrain/gravel.n` = `terrain-ochre/gravel.n` = `terrain-ochre/forest.n`, và `terrain/paving.n` = `terrain-ochre/paving.n` (cùng nguồn Poly Haven, tint chỉ áp cho albedo). Manifest `terrain-ochre/manifest.json` giờ ghi `../terrain/<file>` cho ba lớp đó; client ghép `<bộ>/<tên>` nên không cần đổi code nạp. `terrain-textures.ts` tự tái dùng file cùng nội dung (trong cùng lần chạy hoặc của bộ gốc) nên chạy lại `pnpm assets:terrain --set ochre` không sinh lại bản trùng. Đã kiểm: chạy lại script cho ra đúng manifest đang commit; vào Đoạn Mạch trong game (WebGPU) bộ ochre nạp đủ 8 lớp, ba lớp dùng chung tải từ `/terrain/` với mã 200, không lỗi console.

## X13: ba asset nghi không tham chiếu

Không xóa cái nào.

| Asset | Kết luận | Đề xuất |
| --- | --- | --- |
| `art/portraits/npc_khuu_han_son` | Chân dung tra theo id NPC (`Portrait`, `ui/Art.tsx`), mà id NPC trong `npcs.json` là `npc_khieu_han_son`. Ảnh không thừa, chỉ lệch khóa nên chưa bao giờ hiện | Đổi khóa trong `art.json` + `tools/codex-assets/portraits.json` thành `npc_khieu_han_son` (đổi hiển thị, cần duyệt ảnh) |
| `art/loading/van_hai_phu_dao` | Tranh màn tải làm sẵn cho Vân Hải (`docs/e2-codex-assets`: "đã đóng gói, chưa gắn"). `LEVEL_ART` ở `game/bootArt.ts` chưa có `van_hai` nên vào Vân Hải vẫn hiện tranh Vân Lam | Thêm `van_hai: 'van_hai_phu_dao'` vào `LEVEL_ART` |
| `prop_linh_thao` (0,41 MB) | Không tham chiếu lúc chạy: điểm hái dùng mesh thủ tục (`game/models.ts`), không chỗ nào ghép id `prop_` + tên vật phẩm; chỉ xem được qua `?show=prop_linh_thao`. Còn `meta.json` (`itemId: itm_linh_thao`), dòng giấy phép, lô Tripo M0-3 | Giữ: là model Tripo đã trả công dựng, dự định cho điểm hái. Muốn xóa thì gỡ cả `meta.json` và dòng `LICENSES.md` |

## Thử KTX2 trên 5 asset (Q6)

`toktx` 4.4.2 (KTX-Software, Apache-2.0) giải nén tạm vào thư mục temp, không cài vào máy, không thêm dependency. Mỗi asset tối ưu hai lần từ cùng một GLB thô: A = pipeline hiện tại, B = `TOKTX=<đường dẫn>` (ETC1S cho màu/ORM/emissive, UASTC cho normal, như `ktx.ts`). Bộ nhớ texture và thời gian nạp đo trong trang xem asset (`?mute=1&show=<id>`), Chrome headless.

| Asset | File A → B (KB) | Texture GPU hiện tại (RGBA8) | KTX2 trên WebGPU | KTX2 trên WebGL2 | Nạp A → B, WebGPU (ms, trung vị 3 lần) |
| --- | --- | --- | --- | --- | --- |
| `set_dia_long_ho_giap_nam` | 1.501 → 1.753 (+17%) | 21,33 MB | 2,67 MB | 5,33 MB | 693 → 829 |
| `chr_kiem_tu_nam` | 1.714 → 1.541 (−10%) | 16,00 MB | 2,00 MB | 4,00 MB | 693 → 726 |
| `boss_han_giao` | 2.152 → 2.079 (−3%) | 22,67 MB | 2,83 MB | 5,67 MB | 649 → 737 |
| `mon_thiet_boi_tru` | 931 → 938 (+1%) | 8,00 MB | 1,00 MB | 2,00 MB | 498 → 735 |
| `prop_co_thu` | 532 → 556 (+4%) | 8,00 MB | 1,00 MB | 2,00 MB | 494 → 621 |
| **Tổng** | 6.829 → 6.867 (+0,6%) | **76,0 MB** | **9,5 MB (−87%)** | **19,0 MB (−75%)** | |

- Bộ nhớ texture giảm 8 lần trên WebGPU (three chuyển mã sang BC1, 0,5 byte/điểm ảnh) và 4 lần trên WebGL2 (BC7, 1 byte/điểm ảnh).
- Cỡ file gần như ngang: lợi với asset còn normal PNG, thiệt với áo đã WebP.
- Nạp chậm hơn 30–240 ms mỗi asset trên WebGPU (chuyển mã Basis trong worker); WebGL2 chậm hơn 100–290 ms.
- Thời gian build: 0,8 s → 14,6 s cho 5 asset (`toktx` 2–4,5 s mỗi asset).
- Hình: ảnh A/B trong trang xem không thấy vỡ màu hay sai chất liệu, không lỗi console trên cả hai backend. Chưa soi trong game và chưa soi cận normal map.

Điều cần biết trước khi quyết:

- Trên WebGPU, normal map (UASTC) cũng bị chuyển sang BC1 chứ không phải BC7. Cần soi cận normal map trước khi bật, hoặc xem lại cách `KTX2Loader` dò định dạng trên backend WebGPU.
- Bật đại trà nghĩa là dựng lại cả 146 asset từ Blender (kèm chuyện `boss_kiem_khoi`/`boss_thu_mo_tuong` lệch vài KB) và duyệt ảnh toàn bộ.
- `optimize.ts` hiện **tự dùng KTX2 khi máy có `toktx`** (trong PATH, biến `TOKTX` hoặc thư mục cài mặc định). Máy nào cài `toktx` mà không định bật thì phải chạy `assets:build` với `--no-ktx`, nếu không asset dựng lại sẽ lẫn hai định dạng. Chưa đổi mặc định này trong R-3.
- Mốc tham chiếu: cảnh đông nhất đo ở R-3 (50 bot mặc bộ, sân tông môn, Cao) đang dùng 414 MB / ngân sách 512 MB texture trên WebGPU.

## Kiểm

- `pnpm assets:validate`: 146 asset, 0 lỗi.
- `pnpm size`: 2,94 MB / 30 MB.
- `bench:crowd` (`BOT_SET=set_dia_giap`, 50 bot, sân, Cao, WebGPU + WebGL2): texture, draw call, tam giác không đổi ngoài biên nhiễu. CPU p95 vượt 8 ms ở cả lần đo trước lẫn sau (22,2 → 11,7 ms WebGPU, 15,4 → 20,3 ms WebGL2: dao động giữa hai lần chạy, không do asset).
