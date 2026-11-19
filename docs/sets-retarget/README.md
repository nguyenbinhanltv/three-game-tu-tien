# Trang phục mô-đun: pipeline gắn mảnh lên thân nền (T-2)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/sets-retarget/<file>`.

Kế hoạch tổng: thân nền nam/nữ + các mảnh rời (áo ngoài, vai/giáp, đai, ủng, choàng), mỗi nhân vật ≤ 18k tam giác, xương lò xo cho tay áo và vạt, nhuộm 3 kênh. Tài liệu này là phần **công cụ** (T-2) và bản thử đầu tiên: 3 mẫu Tripo #119 (ma-nơ-canh nguyên bộ, ~1.900 tam giác) mặc thật lên nam `chr_kiem_tu_nam` và nữ `chr_kiem_tu_nu`. Mẫu #119 là **bản tạm**: texture không vẽ lại, mảnh mới sẽ thay.

## Dữ liệu: bộ nào dùng mảnh nào

`packages/content/data/equipment/outfits.json` (`OUTFITS` trong `@dtl/content`): id bộ trang bị → danh sách mảnh. Client nạp `<mảnh>_nam|nu` cho từng mảnh.

| Bộ | Mảnh (tạm) | Ghi chú |
| --- | --- | --- |
| `set_liet_mach` (bậc 2, Kiếm tu) | `set_liet_mach_kiem_y` | có trong `sets.json` |
| `set_kinh_quang` (bậc 3, Kiếm tu, E3-F #144) | `set_kinh_quang_kiem_y` | bộ do #144 tạo; chưa merge thì client chưa mặc được (không ảnh hưởng gì khác) |
| `set_tinh_khuyet` (bậc 4, Hóa Thần) | `set_tinh_khuyet_kiem_bao` | chưa có dữ liệu bộ/vật phẩm: chỉ chuẩn bị asset |

`content:check` kiểm mỗi mảnh có `assets/source/chr/<mảnh>_<nam|nu>/meta.json`. Bộ nhiều mảnh: `"set_x": ["set_x_ao", "set_x_vai", "set_x_dai"]`.

## Dựng một mảnh mới (người dùng dựng trên Tripo, worker chạy pipeline)

1. **Mảnh dựng ở tư thế nghỉ của thân nền** (chữ T, tay dang ngang, như `chr_kiem_tu_*`), đứng đúng chỗ trên thân 1,75 m (hoặc dùng `anchor`). Ma-nơ-canh có sẵn xương Mixamo (`rig_v01.glb`, tay thả cũng được) dùng `mode: rig`; mảnh rời không xương (`raw_v01.glb`) dùng `transfer` hoặc `rigid`.
2. Đặt GLB nguồn vào `dtl-asset-source/3d/nhan-vat/<mảnh>/tripo/` (thư mục chỉ-đọc ngoài repo; từ worktree đặt `DTL_ASSET_SOURCE=<đường dẫn>`).
3. Tạo `assets/source/chr/<mảnh>_<nam|nu>/meta.json` (mẫu: `set_liet_mach_kiem_y_nam`): `budgetClass: "outfit"`, `import.kind: "tripo"`, `source`, `size` (**kích thước thật của mảnh**, mét: `import_tripo` scale theo đó; mảnh không phải cả người thì đo chiều cao mảnh, không để 1,75), `orient` (`thigh` khi có xương đùi, `none` khi không), `post: "tools/blender/retarget_set.py"`, khối `retarget` (bảng dưới). Thêm dòng `assets/LICENSES.md`.
4. `node tools/blender/run.mjs --only chr_kiem_tu_nam --force` (và `_nu`) để có GLB thô thân nền, rồi `node tools/blender/run.mjs --only <mảnh>_nam` và `pnpm assets:build --only <mảnh>_nam`; `pnpm assets:validate`.
5. Thêm mảnh vào `outfits.json`; `?outfit=<mảnh>` ép mảnh cho mọi bộ đang mặc (xem thử trước khi có bộ).
6. Kiểm: `pnpm shots outfit --out <thư mục tuyệt đối> --matrix 1` (ảnh theo clip) và `outfit_check.py` (số), xem mục Kiểm tra.

### `import.retarget` (tools/blender/retarget_set.py)

| Khóa | Ý nghĩa |
| --- | --- |
| `player` | id nhân vật đích (GLB thô `assets/build/raw/<id>.glb`) |
| `mode` | `rig` (mặc định): nguồn đã skin Mixamo, giữ trọng số Tripo, đặt lại tư thế nghỉ theo xương, kéo giãn theo tỉ lệ dài xương (`clampLen`). `transfer`: không xương, trọng số lấy từ mặt gần nhất của thân nền (nội suy tọa độ trọng tâm) rồi làm mượt (`smooth`). `rigid`: 100% vào một xương (`bone`), cho vai giáp, hộ uyển, ủng, ngọc bội |
| `anchor` `{bone, offset:[x,y,z], align}` | dời mảnh (transfer/rigid) để tâm/đáy/đỉnh hộp bao trùng đầu xương + offset (m, hệ glTF) |
| `scale`, `yaw` | tỉ lệ và xoay quanh trục đứng trước khi căn |
| `pad`, `padRange`, `padBody` | **lồng đệm chống xuyên**: đỉnh nằm trong (hoặc sát hơn `pad` m) thân nền thì đẩy ra mặt thân; chỉ xét đỉnh cách thân < `padRange` (0,12). `padBody: kept` (phần thân còn hiện: đầu/cổ/tay), `all` (thân nền còn nguyên, mảnh mặc lên áo lót) |
| `cut` | bỏ mặt của mảnh theo xương trội (`head`, `neck`, `hand`): da xám của ma-nơ-canh. `[]` cho mảnh rời |
| `legBlend` | vạt dưới hông trộn trọng số hai chân (chống xuyên chân kia khi chạy); `strayHand`, `strayLeg`: bỏ ảnh hưởng lạc (Tripo skin vạt áo vào ngón tay) |
| `spring` | **xương phụ**: `{kind:"skirt", top, full, bottom, weight, radius}`: chia trọng số vạt cho 4 xương `dtl_hem_*` có sẵn của người chơi (lò xo đã chạy ở client; tạo xương mới chỉ khi thân nền chưa có); `{kind:"sleeve", side, from, weight}`: 2 xương `dtl_o_sleeve_l/r` con của cẳng tay, trọng số tăng dần từ `from` (tỉ lệ dọc cẳng tay) tới cổ tay |

Đầu ra: bộ xương người chơi (+ xương phụ) và lưới mảnh có skin, extras `dtl.springs` (đuôi xương cho client). **LOD**: `optimize.ts`, lớp ngân sách mới `outfit` (500–3000 tam giác LOD0, 2 LOD 40%/15%, texture 1024/512, 64 xương: thân nền 59 + xương phụ); mảnh nhiều thì tổng LOD0 của nhân vật phải ≤ 18k (thân nền + mảnh).

### Phía client (`game/character/outfit.ts`, `playerSkins.ts`)
- Mặc bộ (≥ 2 món → `PlayerLook.set`): lưới nhân vật cắt còn tam giác có xương trội thuộc đầu/cổ/tay và kiếm nướng sẵn `dtl_sword` (hình học cắt dùng chung theo mẫu), thêm một SkinnedMesh mỗi mảnh mỗi LOD gắn vào skeleton người chơi (skinIndex đổi theo tên xương). Da, tóc, mũ, kiếm giữ nguyên.
- Xương phụ của mảnh (`dtl_o_*`) được nối vào bộ xương bản sao (`extendSkeleton`), định nghĩa lò xo trộn vào `SpringBones` (cùng hệ M3-10, chỉ chạy ở LOD0 gần).
- Mảnh chưa nạp xong hoặc lỗi: giữ recolor + phụ kiện cũ (`pending()` báo để entities dựng lại). `?outfit=0` tắt hẳn. Xem trước 3D bảng nhân vật (#141) đi qua cùng `PlayerSkins.create`.

## Kiểm tra

- **Ảnh theo clip trong game**: `pnpm shots outfit --out <thư mục tuyệt đối> [--genders m,f] [--sets set_liet_mach] [--query outfit=<mảnh>] [--matrix 1] [--panel 1]`. Mỗi lần chụp: trước/sau/nghiêng, chạy, ngự kiếm, đả tọa, chém; `--matrix 1` thêm chiêu 1-2 của 3 công pháp (lạc kiếm, bất động kim thân, thanh mộc đan kinh) và chết (hơi tối vì màn chết); `--panel 1` chụp bảng nhân vật. Ảnh đã có: `sheet_<mảnh>_<m|f>.jpg` (3 mảnh × 2 giới), `matrix_set_liet_mach_kiem_y_m.webp`, `truoc_sau_liet_mach_nam.webp`, `bang_nhan_vat_liet_mach.webp`.
- **Kiểm số** `tools/blender/outfit_check.py` (Blender nền): đưa thân nền + mảnh vào 6 tư thế cực biên (chạy, chém giơ tay, tay thả, cúi, ngồi, ngã; hai chiều dấu mỗi tư thế) và đếm đỉnh áo **mới** chui vào thân nền còn hiện so với lúc nghỉ, cùng độ sâu lớn nhất. Lệnh: `blender -b --factory-startup --python tools/blender/outfit_check.py -- --player assets/build/raw/chr_kiem_tu_nam.glb --outfit apps/client/public/assets/<mảnh>.<hash>.glb [--keep all] [--tol 0.02] [--out x.json]`. Kết quả 6 mảnh tạm: `check/*.json`. Đọc: số đỉnh mới ≤ ~20 trên ~1.800 và chủ yếu ở ống tay áo chạm bàn tay (độ sâu hiển thị chạm trần `padRange` 12 cm là do tay mảnh, pháp tuyến không ổn định); ảnh trong game không thấy lỗi. Với thân nền mô-đun còn áo lót, chạy `--keep all`.

## Số đo (50 bot cùng mặc `set_liet_mach`, `BOT_SET=set_liet_mach pnpm bench:crowd --bots 50 --scenes san --renderers webgpu --presets high`)

| | draw | tam giác | CPU p50/p95 |
| --- | --- | --- | --- |
| không mặc bộ (nền) | 201 | 1076k | 9,4 / 14,2 ms |
| recolor + phụ kiện (`?outfit=0`) | 287 | 1127k | 10,0 / 14,2 ms |
| áo mặc thật, chưa xương phụ | 277 | 623k | 10,7 / 16,9 ms |
| áo mặc thật + xương lò xo | 278 | 601k | 10,3 / 15,1 ms |

Thêm xương lò xo tay áo + vạt: draw 278, tam giác 601k, CPU p50/p95 10,3 / 15,1 ms (không đáng kể). Mỗi mảnh thêm 1 draw call mỗi người (khác texture nên không gộp được; gộp ở LOD xa là việc của T-5). Mục tiêu kế hoạch < 120 draw call cho nhân vật khi 50 người: cần gộp mảnh LOD1/2 và dùng chung atlas mỗi bộ.

## Giới hạn đã biết
- Mẫu #119 là tấm vỏ mỏng: mép vạt lởm chởm khi ngự kiếm/chạy; trọng số từ Tripo.
- `transfer` cho vạt rời xa thân nền cho trọng số nhiễu (mặt gần nhất nhảy giữa chi này sang chi khác): vạt dài nên dùng `rig` hoặc thêm `legBlend`/`smooth`; mảnh bó sát (vai, đai, ủng) ổn.
- `outfit_check.py` dùng tư thế cực biên chứ không phát clip thật (thư viện clip chung không có skin để Blender nạp thành rig); clip thật kiểm bằng ảnh `--matrix`.
- Kiếm nướng sẵn (xương `dtl_sword`) được giữ ở mọi LOD; phần vỏ kiếm gắn lưng (xương spine2) bị ẩn cùng thân.
- Texture chưa nén KTX2 trên máy dựng này (thiếu `toktx`).
