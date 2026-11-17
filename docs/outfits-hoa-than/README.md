# Trang phục bậc 4 Hóa Thần: Tinh Khuyết Kiếm Bào + kiếm Tinh Khuyết (T-6a)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/outfits-hoa-than/<file>`.

Bộ đầu tiên của bậc 4, dựng từ 6 mảnh Tripo (concept P3, PR #154, `docs/outfit-concepts-p3/`) bằng đúng pipeline T-5 (`tools/blender/outfit_build.py`, xem `docs/outfits-ket-dan/README.md`), thay bản tạm #119 của `set_tinh_khuyet`. Cộng dạng cuối +10 và vỏ riêng của Tinh Khuyết Kiếm.

| Bộ (dữ liệu) | Asset (nam/nữ) | Tam giác LOD0 / LOD1 / LOD2 | Xương lò xo |
| --- | --- | --- | --- |
| `set_tinh_khuyet` Kiếm tu | `set_tinh_khuyet_kiem_bao_{nam,nu}` | 11860 / 4736 / 1759 (nam), 11864 / 4737 / 1762 (nữ) | 18 |

`outfits.json` đã ánh xạ `set_tinh_khuyet` → `set_tinh_khuyet_kiem_bao` (cùng id asset, nay là bộ mô-đun). **Bộ vật phẩm `set_tinh_khuyet` chưa có trong `sets.json`** (bậc 4 chưa mở, `TIER_OPEN = 3`, chờ E4), nên chưa mặc được trong game bằng vật phẩm; ảnh chụp ép áo bằng `?outfit=set_tinh_khuyet_kiem_bao`. Ô trang sức đầu (ô 9): mảnh trang sức đầu nằm trong lưới bộ như các bộ Kết Đan; vật phẩm `itm_*_trang_suc` của bộ này sẽ thêm cùng bộ vật phẩm bậc 4.

## Cấu hình (`assets/source/chr/set_tinh_khuyet_kiem_bao_{nam,nu}/meta.json`)

- Nguồn: `chr/set_tinh_khuyet_kiem_bao/tripo/raw_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}_v01.glb`. `raw_v01.glb`/`rig_v01.glb` của #119 không đụng.
- Bảng màu: chính `#1E2335` mực đêm, phụ `#D9CFB6` ngà trăng, viền `#B89B56` vàng cổ, vân sáng `#8E80D8` tím sao (chấm sao, nhãn sao). `gain` 1,5 (mực đêm sẫm nên nâng sáng texture để không đen kịt dưới ánh game).
- Mặc định `PIECE_DEFAULTS` đủ dùng, không cần chỉnh `fit` từng mảnh: áo ngoài kéo dài chạm bắp chân, choàng dài là phần đuôi áo có 8 xương lò xo.

## Kiếm Tinh Khuyết

- **Dạng gốc** `prop_kiem_tinh_khuyet` (#119) giữ cho +0 đến +9, vân sáng +7 chạy như mọi kiếm.
- **Dạng cuối +10** `prop_kiem_tinh_khuyet_cuoi` (`orient_sword.py`, Tripo 3751 → 2500 tam giác theo ngân sách vũ khí): lưỡi tinh thể tím sao, chắn sừng vuốt ngược, nhãn cầu sao ở tâm. `SWORD_FINAL` đổi gốc → cuối khi cường hóa +10 (`swordModelOf(id, glowStage)`). Thử: `?sword=prop_kiem_tinh_khuyet_cuoi`.
- **Vỏ riêng** `prop_vo_kiem_tinh_khuyet` (`orient_scabbard.py`, 1342 tam giác): vỏ lưng giờ chọn theo kiếm (`SCABBARD_OF`/`scabbardOf` trong `@dtl/content`, `PlayerSkins` giữ một mẫu vỏ mỗi asset); kiếm chưa có vỏ riêng vẫn dùng `SCABBARD_DEFAULT` (vỏ Liệt Mạch). Dùng chung cho cả hai dạng kiếm và cả ba công pháp.
- Tia linh khí là phần dựng cứng quanh chắn trong lưới Tripo (không phải hạt). **Hào quang cường hóa (+7 vân sáng, +10 dạng cuối) là tím sao `#9B84F2`**, không phải xanh ngọc của kiếm thấp: `SWORD_GLOW_TINT` trong `@dtl/content` (theo model kiếm, thắng màu theo bộ trang bị), `BladeMount.tint` → `SkinnedPlayer.swordTint`; độ chớp giữ nguyên của `swordGlow` (cùng biên độ, không thêm lóa). Chưa có mặt nạ emissive riêng cho nhãn sao (texture kiếm Tripo giữ màu nguyên).

## Kiểm xuyên mesh

`tools/blender/outfit_check.py --keep head` (6 tư thế cực biên) và ảnh trong game (đứng/chạy/ngự kiếm/đả tọa/chém/chết, ba công pháp). Số đỉnh xuyên vùng đầu/cổ: 0 đến ~50 đỉnh ở chém giơ tay, sâu ≤ 4 cm (trần 4 cm của thử nghiệm): thấp hơn các bộ Kết Đan (hàng chục đến vài trăm) và không thấy lỗi tương ứng trong ảnh. Chi tiết: `check/*.json`.

## Số đo (`BOT_SET=set_liet_mach CROWD_QUERY=&outfit=set_tinh_khuyet_kiem_bao pnpm bench:crowd --bots 50 --scenes san --renderers webgpu --presets high`, cổng 2837/5437)

| | draw | tam giác | CPU p50/p95/p99 | texture MB | heap MB | tick p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 50 bot cùng mặc Tinh Khuyết, sân tông môn | **267** (< 300) | 756k | 8,6 / 11,6 / 61,7 ms | 404 | 281 | 2,3 ms |

Draw đạt ngân sách (< 300). CPU p50 8,6 ms hơi quá ngưỡng 8 ms của ngân sách (đo báo `VƯỢT cpu`), cùng mức các bộ Kết Đan trước đó (8,4 đến 9,7 ms ở máy đo bận); p99 61,7 ms là một khung đầu nạp pipeline mới (23 pipeline mới, 10 khung > 12 ms), không phải trạng thái ổn định. Chưa đo riêng lại.

## Ảnh

- `sheet_tinh_khuyet_<m|f>.jpg`: đứng trước/sau/nghiêng, chạy, ngự kiếm, đả tọa, chém, chết. `matrix_tinh_khuyet_<m|f>.jpg`: chiêu 1–2 của 3 công pháp (kiếm tu, hộ pháp, đan sư), chết, chém. `bang_tinh_khuyet_<m|f>.jpg`: bảng nhân vật 3D.
- `kiem_tinh_khuyet_0_7_10.webp`: kiếm +0, +7, +10 (hàng trên xuống dưới), cột trái đeo lưng (một kiếm trong vỏ riêng), cột phải cầm tay. +0 và +7 chỉ khác vân sáng; +10 đổi sang dạng cuối. `kiem_tinh_khuyet_10_nu.webp`: dạng cuối trên thân nữ. Ảnh chụp với một kiếm Liệt Mạch trong tay để có `plus 7|10`, model hiển thị ép bằng `?sword=`. Hào quang +0 vẫn có vì nhân vật mặc bộ (màu bộ làm sáng vỏ ở bậc tối thiểu 1), không phải lỗi của kiếm.
- Chụp: `pnpm shots:outfit --out <thư mục tuyệt đối> --genders m,f --sets set_liet_mach --matrix 1 --panel 1 --query outfit=set_tinh_khuyet_kiem_bao`; kiếm: `pnpm shots:kiem --out <thư mục> --model prop_kiem_tinh_khuyet|prop_kiem_tinh_khuyet_cuoi --equip "itm_liet_mach_kiem|Liệt Mạch Kiếm" --query outfit=set_tinh_khuyet_kiem_bao --set set_liet_mach --glow 0|1|2` (`--equip` và `--query` thêm ở PR này).

## Lưu ý ảnh (sửa sau review)

Bản ảnh đầu có hai điểm lạ: (1) một khối gai xanh đen nằm đất cạnh chân nữ ở khung chiêu 1, 2, chém; (2) hai kiếm song song sau lưng nữ ở so sánh Phục Mạch v01. Cả hai **không phải lỗi mảnh áo hay kiếm** mà do trình chụp: avatar nam của phiên trước vẫn đứng nguyên chỗ (2048, 2088) trong thế giới khi phiên nữ vào cùng điểm, nên hai người chồng lên nhau (khối gai = áo nam ở tư thế nằm, kiếm thứ hai = kiếm của người nam). `shots:outfit` nay dời nhân vật đi xa (`tp 2048 2900`) trước khi đóng phiên; chụp lại thì cả hai điểm lạ biến mất và sau lưng chỉ còn một kiếm trong vỏ (cả Tinh Khuyết lẫn Phục Mạch v01/v02, nam và nữ; trường hợp có trang bị kiếm riêng chụp bằng `shots:kiem` cũng một kiếm).

## Giới hạn

- Áo hơi tối và nhàu ở mép vạt (Tripo), không rực như concept; texture 1K nên hoa văn chòm sao mờ khi gần.
- Chưa có vật phẩm (xem trên), chưa có icon.
- Mặt nạ phát sáng riêng cho nhãn sao/chòm sao chưa tách (vân sáng áo chỉ bắt chấm tím sao rất nhỏ).

# Thần Tàng Đan Bào (T-6b, Đan sư bậc 4)

Mảnh Tripo `chr/set_than_tang_dan_bao/tripo/raw_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}_v01.glb` → `set_than_tang_dan_bao_{nam,nu}` (LOD0 11399 / LOD1 4560 / LOD2 1702 nam, 11401 / 4556 / 1698 nữ; 18 xương lò xo), `outfits.json` `set_than_tang`. Bộ vật phẩm `set_than_tang` cũng chưa có trong `sets.json` (bậc 4 khóa): ảnh ép áo bằng `?outfit=set_than_tang_dan_bao`.

Bảng màu: chính `#212A38` mực đêm xanh, phụ `#DCD2B8` ngà cổ, viền `#BC9C58` vàng cổ, nhấn `#6DB4A0` lục ngọc; `gain` 1,5.

## Mảnh không texture: vật liệu thủ tục

`raw_ung_v01.glb` là GLB Smart Mesh chưa chạy bước texture (32 KB, 0 ảnh, không UV). Người dùng quyết dùng hình khối này, nên `outfit_build.py` **không chặn** mà cảnh báo (`[outfit_build] CẢNH BÁO: ung ... không có texture màu`) và tự dựng vật liệu thủ tục (`bake_proc`):

- UV mới bằng smart project, rồi nướng màu vào ô atlas của mảnh (rasterize theo UV) từ thuộc tính đỉnh: đồ nhỏ rời (khóa, tua, đồ treo) và cạnh sắc là kim loại viền, dải miệng ủng, mũi ủng và đế là kim loại, đồ rời xen kẽ là ngọc nhấn; còn lại là vải/da nền.
- Thêm nhiễu 3D hai tầng, đường dệt và khắc ngang nhẹ ở vùng kim loại. Màu lấy theo `import.outfit.proc.<mảnh>` (`base`, `metal`, `accent`, `top`, `toe`, `edge`) hoặc bảng màu bộ; tông khớp các mảnh có texture cùng bộ (sRGB mã hóa như texture Tripo, cùng `gain`).
- Atlas giữ nguyên cấu trúc (màu, mặt nạ 3 kênh, vân sáng), nên shader nhuộm và hiệu năng không đổi.
- Hàng rào còn lại: GLB không có mesh, hoặc không đúng một mesh, vẫn dừng với thông báo rõ. GLB không vật liệu/không UV (như ủng này) đi đường thủ tục. Khi người dùng xuất lại ủng có texture thì pipeline tự dùng texture, cấu hình `proc` thành thừa.
- Giới hạn: ủng nhẵn hơn các mảnh có texture (không hoa văn thêu), ngọc nhấn chỉ ở đồ rời nhỏ; chưa có pháp tuyến riêng (dùng phẳng).

## Voan xuyên sáng (blend thật, hai lượt vẽ)

Voan choàng sao nằm chung lưới với đạo bào (Tripo không tách). `import.outfit.alpha = {"ao_ngoai": "veil"}`: pipeline nhận vùng voan theo màu texel (xám-tím sáng, lam ≥ đỏ, lục ≤ lam, ~23% ô áo ngoài) và ghi alpha 0,6 vào atlas màu; material glTF đánh dấu `dtl_outfitAlpha`.

Bản đầu dùng dither theo toạ độ màn hình: ở ảnh cận lộ rõ chấm/lỗ thủng như giấy rách. Nay **không còn dither**: cùng một hình học vẽ hai lượt (`createOutfitMaterial(src, dye, mode)`, `PlayerSkins.dress`):

- `cutout`: phần đặc (texel alpha ≥ 0,95), alphaTest. Thân, áo trong, đầu và mọi mảnh khác luôn đục.
- `veil`: chỉ texel voan, **blend thật**, `depthWrite` tắt, hai mặt, `renderOrder` sau thân, độ đục 0,42 cộng tối đa ~0,2 ở mép nhìn nghiêng, mép sáng nhẹ (fresnel xanh nhạt), không đổ bóng.
- Chỉ ở LOD0 (tối đa vài người trong tầm gần): +1 draw call mỗi người. LOD1/2 vẽ voan như vải đặc (`solid`), nên đám đông không tăng draw call.
- Chỉ **một** mảnh xuyên sáng cho cả bộ (áo ngoài); dải lụa đai tối màu chưa tách (còn dư một suất trong giới hạn 2 mảnh).

Sửa thêm sau review: `gain` 1,5 → 1,2 (lớp dưới ngà bị cháy trắng nên khung chém trông như bóng ma; vật liệu trong suốt chỉ áp lên voan, không lên thân/áo trong) và `normalFlat` 0,8 (kéo pháp tuyến bake của Tripo về phẳng 80%, hết vẻ nứt/nhàu như giấy vò; thêm tham số `import.outfit.normalFlat` cho `outfit_build.py`).

## Kiểm xuyên mesh và số đo

- `outfit_check.py --keep head`: số đỉnh xuyên vùng đầu/cổ 0 đến 32 ở chạy/chém giơ tay/ngồi xổm (nam), 0,5 đến 3,5 (nữ), sâu ≤ 4 cm; ảnh game không thấy xuyên mesh. `check/set_than_tang_dan_bao_*.json`.
- `bench:crowd` sân 50 bot WebGPU high, cùng mặc (ép áo bằng `CROWD_QUERY`), sau khi voan thành lượt blend riêng ở LOD0, hai lần đo: **294 và 272 draw (< 300)**, ~1,0M tam giác, CPU p50/p95 6,8 / 10,4 và 7,0 / 10,7 ms (p95 hơi trên 8 ms), texture 404 MB, heap 260–323 MB, tick p95 1,7–2,2 ms. Trước khi thêm lượt voan: 269 draw, 789k tam giác. Chênh lệch lớn giữa các lần do số bot rơi vào tầm LOD0 (voan chỉ tốn thêm draw ở LOD0); biên so với 300 còn nhỏ ở lần đo xấu (6 draw).
- Ảnh: `sheet_than_tang_<m|f>.jpg`, `matrix_than_tang_<m|f>.jpg`, `bang_than_tang_<m|f>.jpg` (cùng bố cục Tinh Khuyết; chụp bằng `pnpm shots:outfit --sets set_phuc_mach --query outfit=set_than_tang_dan_bao`).

# Cổ Thành Huyền Giáp (T-6c, Hộ pháp bậc 4)

Mảnh Tripo `chr/set_co_thanh_huyen_giap/tripo/raw_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}_v01.glb` → `set_co_thanh_huyen_giap_{nam,nu}` (LOD0 12698 tam giác, 18 xương lò xo), `outfits.json` `set_co_thanh`. Bộ vật phẩm `set_co_thanh` cũng chưa có trong `sets.json` (bậc 4 khóa): ảnh ép áo bằng `?outfit=set_co_thanh_huyen_giap`.

Giáp nặng nên cấu hình theo Địa Long: giáp thân thu 0,82 bề ngang, vai `shoulder_span+0.13`, mão nhỏ; bảng màu chính `#262B38` mực đá đêm, phụ `#6F6A5E` đá cổ thành, viền `#BA9A55` vàng cổ, nhấn `#E2BE62` vàng đèn lồng; `gain` 1,3 (1,7 làm cả bộ ngả vàng đồng).

## Skin giáp cứng (sửa sau review: váy giáp và choàng bung thành khối gai khi ra chiêu)

Bản đầu dùng trọng số mặc định cho vải: váy giáp 3 tầng lấy trọng số từ thân nền theo từng đỉnh (tách trái/phải theo hai đùi) cộng 4 xương lò xo, nên khi chém/chạy các tầng giáp giãn thành khối gai sẫm khổng lồ. Nay (`import.outfit.pieces`):

- **Váy giáp (`lop_duoi`)**: `islands: true` (mọi đỉnh của một khối lấy trọng số trung bình, tức bind cứng theo hông/đùi gần nhất, không giãn), `legBlend` 0,9 (hợp nhất trọng số hai chân), `spring: false` (bỏ lò xo, giáp đá không bay như vải).
- **Giáp thân + choàng (`ao_ngoai`)**: `legBlend` 0,9, `smooth` 4, `armFix` 0,09 (giảm kéo theo xương tay, vì tay áo ngắn), lò xo chỉ 3 xương cho phần xa thân (`minDist` 0,12: choàng sau lưng).
- Đai giữ 4 xương lò xo cho tua/đèn. Vai và mão cứng như cũ.

Ảnh chụp lại (nam+nữ, đứng/chạy/ngự kiếm/đả tọa/chém/chết, ba công pháp): váy giáp giữ hình trong mọi tư thế, không còn khối gai bung; mép giáp vẫn lởm chởm do hình học Tripo. Khung trắng mờ thoáng thấy ở một chiêu đan sư là hiệu ứng chiêu lúc chụp, không phải vật liệu.

## Ba mảnh không texture (đai, mão, ủng): vật liệu thủ tục

`raw_dai_tua`, `raw_trang_suc_dau`, `raw_ung` là Smart Mesh chưa chạy bước texture (24–39 KB, 0 ảnh). Người dùng quyết dùng hình khối này; pipeline cảnh báo và nướng vật liệu thủ tục (`bake_proc`, xem phần Thần Tàng ở trên) theo concept, cấu hình `import.outfit.proc`:

- Đai: da tối `#2A2824`, khóa cổng/đèn lồng/tháp canh (đồ rời nhỏ) vàng cổ, đồ rời xen kẽ vàng đèn lồng.
- Mão lỗ châu mai: thép tối `#2B3040`, dải trên (22% chiều cao, chính là hàng lỗ châu mai) và cạnh sắc vàng cổ.
- Ủng: đá xám `#605D55`, mũi/miệng/đế và cạnh sắc vàng cổ (lượng kim loại giảm `edge` 0,3 sau khi bản đầu ra ủng gần như toàn vàng).

Giới hạn: ba mảnh này nhẵn và đơn sắc hơn ba mảnh có texture (giáp thân, váy giáp, vai giáp có hoa văn cổng thành); đồ treo (đèn lồng) chỉ có vàng, chưa phát sáng riêng.

## Kiểm xuyên mesh và số đo

- `outfit_check.py --keep head`: số đỉnh xuyên vùng đầu/cổ 4 đến 56 (nam, vai và mão to), 1 đến 19 (nữ), sâu ≤ 4 cm; ảnh game (đứng/chạy/ngự kiếm/đả tọa/chém/chết, ba công pháp) không thấy xuyên mesh đáng kể, sau lưng một kiếm trong vỏ. `check/set_co_thanh_huyen_giap_*.json`.
- `bench:crowd` sân 50 bot WebGPU high, cùng mặc (ép áo bằng `CROWD_QUERY`), sau khi sửa skin: **275 draw (< 300)**, 841k tam giác, CPU p50/p95/p99 6,4 / 9,4 / 45,7 ms (p95 hơi trên ngưỡng 8 ms; p99 là khung nạp pipeline đầu), texture 404 MB, heap 295 MB, tick p95 1,9 ms.
- Ảnh: `sheet_co_thanh_<m|f>.jpg`, `matrix_co_thanh_<m|f>.jpg`, `bang_co_thanh_<m|f>.jpg` (cùng bố cục các bộ trước; `pnpm shots:outfit --sets set_dia_giap --query outfit=set_co_thanh_huyen_giap`).

# Kính Quang Kiếm Y (T-6d, Kiếm tu bậc 3, bộ cũ nhất thay bản tạm #119)

Mảnh Tripo `chr/set_kinh_quang_kiem_y/tripo/raw_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}_v01.glb` (không đụng `raw_v01.glb`/`rig_v01.glb` của #119) → `set_kinh_quang_kiem_y_{nam,nu}` thay hẳn bản tạm retarget (`outfits.json` `set_kinh_quang` đã trỏ sẵn đúng id asset). LOD0 11459 / LOD1 4584 / LOD2 1717 (nam), 11461 / 4584 / 1713 (nữ); 18 xương lò xo. Bộ này **đã có vật phẩm** (`set_kinh_quang`, 4 món trong `sets.json`), nên ảnh chụp mặc thật bằng `/gm set set_kinh_quang`, không ép áo.

Bảng màu (bậc 3): chính `#ECEFF1` trắng bạc, phụ `#5E8FA8` lam gương, viền `#BFC8CF` bạc lạnh, nhấn `#8FD8E8` lam băng; `gain` 1,0.

## Ba mảnh không texture (đai, mão, ủng) và mão thu nhỏ

`raw_dai_tua`, `raw_trang_suc_dau`, `raw_ung` là Smart Mesh chưa texture: vật liệu thủ tục (`import.outfit.proc`): đai lam gương + khóa/tua bạc, mão bạc sáng, ủng lam đậm + mũi/miệng bạc. Mão Tripo là một vòng trụ rộng: bản đầu đặt như quan trên đỉnh trông như mũ cao, nên thu nhỏ (`fit.x` 0,20, đỉnh `head_z+0.11`) cho ôm vành đầu.

## Voan nửa dưới tay áo (theo hình học)

Voan của bộ này cùng màu lụa trắng nên không tách theo màu như Thần Tàng. `import.outfit.alpha = {"ao_ngoai": "sleeve"}` + `veil` (`xmin`, `zlo`, `zhi`, biểu thức theo mốc): trọng số voan mỗi đỉnh = đỉnh ở ngoài thân (|x| > bề ngang eo/2 + 0,10) và trong dải z từ `hip_z−0,25` tới `shoulder_z−0,10` ở tư thế tay thả (làm mềm bằng smoothstep), nướng vào kênh alpha của atlas qua UV (`raster_scalar`), alpha 0,5 ở voan (`veilAlpha`). Client dùng đúng cơ chế hai lượt của Thần Tàng (phần đặc `cutout` + voan blend thật chỉ ở LOD0, không dither); chiếm ~9% ô áo ngoài. Chỉ một mảnh xuyên sáng cho cả bộ.

## Kiểm xuyên mesh và số đo

- `outfit_check.py --keep head`: số đỉnh xuyên vùng đầu/cổ 1 đến 20 (nam), 1 đến 7 (nữ), sâu ≤ 4 cm; ảnh game (đứng/chạy/ngự kiếm/đả tọa/chém/chết, ba công pháp) không thấy xuyên mesh đáng kể, sau lưng một kiếm trong vỏ. `check/set_kinh_quang_kiem_y_*.json`.
- `bench:crowd` sân 50 bot WebGPU high, cùng mặc (`BOT_SET=set_kinh_quang`): **288 draw (< 300, biên 12 vì voan thêm draw ở LOD0)**, ~1,03M tam giác, CPU p50/p95/p99 6,6 / 9,7 / 38,6 ms (p95 hơi trên 8 ms), texture 404 MB, heap 320 MB, tick p95 1,9 ms.
- Ảnh: `sheet_kinh_quang_<m|f>.jpg`, `matrix_kinh_quang_<m|f>.jpg`, `bang_kinh_quang_<m|f>.jpg` (`pnpm shots:outfit --sets set_kinh_quang --matrix 1 --panel 1`).

## Giới hạn

- Giáp vai Tripo dạng cánh mỏng rất sắc và hơi lởm chởm khi nhìn gần; ba mảnh thủ tục nhẵn hơn mảnh có texture; chưa có mặt nạ phản chiếu "gương" thật (vật liệu bạc chỉ là màu + nhám thấp).
- Nhóm kiếm Kính Quang (+10, vỏ riêng) chưa dựng: chờ người dùng.
