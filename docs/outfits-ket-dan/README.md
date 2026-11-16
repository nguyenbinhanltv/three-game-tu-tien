# Trang phục Kết Đan mô-đun (T-5)

Ba bộ bậc 2 dựng từ 18 mảnh Tripo (concept #147, spec từng mảnh ở `docs/outfit-concepts/README.md`) mặc thật lên nam `chr_kiem_tu_nam` và nữ `chr_kiem_tu_nu`, thay bản tạm #119 của Liệt Mạch; cộng kiếm Liệt Mạch dạng cuối +10 và vỏ kiếm đeo lưng.

| Bộ (dữ liệu) | Asset (nam/nữ) | Tam giác LOD0 / LOD1 / LOD2 | Xương lò xo |
| --- | --- | --- | --- |
| `set_liet_mach` Kiếm tu | `set_liet_mach_kiem_y_{nam,nu}` | 11489 / 4595 / 1723 | 15–17 |
| `set_dia_giap` Hộ pháp | `set_dia_long_ho_giap_{nam,nu}` | 12219 / 4888 / 1833 | 19 |
| `set_phuc_mach` Đan sư | `set_phuc_mach_dan_bao_{nam,nu}` | 11011 / 4404 / 1652 | 17 |

Một nhân vật đủ bộ = đầu + cổ + bàn tay của thân nền (~3k) + một lưới bộ (11–12k) ≈ 15k tam giác < 18k. `outfits.json` ánh xạ bộ → asset (`set_kinh_quang`, `set_tinh_khuyet` còn bản tạm #119).

## Pipeline (`tools/blender/outfit_build.py`, `import.outfit` trong meta.json)

`node tools/blender/run.mjs --only <bộ>_<nam|nu>` (cần `DTL_ASSET_SOURCE`, GLB thô `chr_kiem_tu_*` dựng trước) rồi `pnpm assets:build --only ...`. Chi tiết tham số ở đầu script; tóm tắt:

1. **Căn theo mốc thân nền**: mỗi mảnh Tripo chuẩn hóa dài 1 m nên không biết cỡ thật. Script đo mốc từ bộ xương người chơi (cổ, hông, gối, cổ chân, vai, bề ngang/sâu eo, khoảng chân, đỉnh đầu) và đặt từng mảnh theo biểu thức mốc (`fit`: áo ngoài từ cổ tới giữa bắp chân, lớp dưới từ eo tới cổ chân, vai giáp theo bề vai, đai theo eo, ủng từ sàn tới gối, trang sức đầu trên đầu). Nữ/nam ra cỡ khác nhau tự động.
2. **Tư thế căn**: mảnh Tripo có tay áo thả, thân nền dang chữ T, nên mọi bước chạy khi thân nền hạ tay (`fitPose.armDown`, 70°) rồi đưa về tư thế nghỉ bằng nghịch đảo skin.
3. **Trọng số**: chuyển từ mặt gần nhất của thân nền (nội suy trọng tâm, làm mượt 2 vòng); bàn tay → cẳng tay, bỏ xương kiếm; vạt dưới hông trộn trọng số hai chân (`legBlend`); vai giáp mỗi đảo lưới một trọng số (cứng); trang sức đầu 100% xương đầu.
4. **Xương lò xo tự động**: đỉnh treo xa thân (> `minDist`) gom k-means thành N cụm (tay áo, vạt, tua, ruy băng), mỗi cụm một xương `dtl_o_*` con của xương thân gần nhất; client mô phỏng chung hệ M3-10 (`outfit.ts` `extendSkeleton`). Số xương theo spec là cận trên: dùng 8 (áo ngoài), 3–4 (lớp dưới), 2–4 (đai), 3 (trang sức) mỗi bộ, **không** dựng đúng từng chuỗi nhiều đốt của spec (mỗi xương là một hạt lò xo).
5. **Gộp một lưới + một atlas 1K** cho cả bộ (1 draw call mỗi bộ mỗi LOD): màu, pháp tuyến, **mặt nạ 3 kênh** (R chính, G phụ, B viền/kim loại, phân theo khoảng cách tới bảng màu của spec) đi qua kênh ORM của glTF, và vân phát sáng (emissive) theo màu nhấn (hổ phách / vàng đất / lục thảo).
6. LOD1/LOD2 do `optimize.ts` (lớp ngân sách `outfit`: 14000 tam giác, 80 xương, texture 1024).

Shader (`render/materials/outfit.ts`): nhuộm 3 kênh (`createOutfitMaterial(src, {palette, dye})`: màu × (1 + Σ mặt nạ · (nhuộm/bảng − 1)); chưa nối UI nhuộm, mặc định giữ nguyên màu bộ), vải nhám 0,84 / viền kim loại (metalness ≤ 0,6, nhám 0,4), vân sáng × `outfitGlow` (1,2; sau này theo bậc/cường hóa), cộng viền sáng nhân vật.

## Kiếm

- **Dạng cuối +10**: `prop_kiem_liet_mach_cuoi` (`orient_sword.py`, LOD0 hạ 3730 → 2500 theo ngân sách vũ khí). `swordModelOf(itemId, glowStage)`: `glowStage` = 2 (+10) đổi `prop_kiem_liet_mach` sang dạng cuối (`SWORD_FINAL`); entities truyền `s.wg`. Thử: `?sword=prop_kiem_liet_mach_cuoi`.
- **Vỏ lưng**: `prop_vo_kiem_liet_mach` (`orient_scabbard.py`: miệng vỏ Y = 0, đỉnh vỏ +Y), dùng chung tạm cho mọi kiếm (`SCABBARD_DEFAULT`). Khi mặc áo bộ mô-đun và có kiếm riêng, vỏ gắn lưng (hệ xương lưng × chỗ kiếm lúc tra, miệng ở gốc lưỡi, dài hơn lưỡi 3%) và ở lại lưng kể cả khi rút kiếm. Vỏ nướng sẵn trong lưới nhân vật bị ẩn cùng thân khi mặc áo (mặt nạ `dressedIndex`).
- **Chưa làm (T-1)**: nhân vật không mặc áo bộ vẫn mang vỏ nướng sẵn trong lưới (kiếm "thứ hai" khi rút); LOD1/2 vẫn dùng kiếm nướng sẵn (xương `dtl_sword`).

## Đợt sửa sau review
- **Địa Long**: `armFix` (tay áo rộng lấy trọng số theo xương cánh tay), thu nhỏ giáp/vai/mão theo thân (nữ `wscale` 0,72), nhân sáng texture (`gain` 1,7). Ảnh chém sau `armFix` (`matrix_dia_long_*`, khung chiêu 1–2): tay áo theo cánh tay, không còn "cánh" dính thân như trước, nhưng giáp vẫn to và nặng khi giơ tay.
- **Phục Mạch/Liệt Mạch**: hàn đỉnh + pháp tuyến mượt, giảm normal map, vải nhám hơn. Ảnh kiếm +0/+7/+10: `kiem_liet_mach_0_7_10.jpg` (+0 và +7 gần như giống nhau, +10 đổi model).
- **Ô trang bị thứ 9 `head`**: `EquipSlot` + `slots.json` (`drop: false`: chỉ chế ở lò rèn, không đổi cân bằng), 3 món `itm_{lm,dg,pm}_trang_suc` (5 món/bộ), lò rèn, i18n, bảng nhân vật. Chưa có icon riêng (emoji 👑), chưa thăng bậc, chưa có công tắc ẩn/hiện (mão là một phần lưới bộ gộp).
- **Draw call**: một lưới bộ mỗi LOD; lưới thân không đổ bóng và bỏ ở LOD2.

## Số đo (`BOT_SET=<bộ> pnpm bench:crowd --bots 50 --scenes san --presets high`, 50 bot cùng mặc bộ, sân tông môn)

| | backend | draw | tam giác | CPU p50/p95 | texture MB |
| --- | --- | --- | --- | --- | --- |
| không mặc bộ (nền) | WebGPU | 202 | 1057k | 4,6 / 6,3 ms | 374 |
| | WebGL2 | 205 | 1079k | 4,7 / 6,7 ms | 318 |
| Liệt Mạch | WebGPU | 284 | 925k | 6,9 / 9,5 ms | 404 |
| | WebGL2 | 278 | 898k | 6,5 / 9,6 ms | 349 |
| Địa Long | WebGPU | **303** | 995k | 6,1 / 8,8 ms | 404 |
| | WebGL2 | 292 | 962k | 5,6 / 7,6 ms | 348 |
| Phục Mạch | WebGPU | 280 | 876k | 6,0 / 8,8 ms | 404 |
| | WebGL2 | 275 | 872k | 5,8 / 8,1 ms | 349 |

Liệt Mạch và Phục Mạch dưới 300 draw ở cả hai backend; **Địa Long trên WebGPU vẫn 303 (vượt 3 draw)**. Mỗi người mặc bộ thêm ~1,6 draw (lưới bộ + kiếm/vỏ ở LOD0); gộp tiếp cần bake đầu/tay vào atlas áo để còn một draw mỗi người (việc PR sau).

## Chưa làm / giới hạn

- **Ô trang sức đầu (ô 9)**: chưa có ô dữ liệu, server, UI. Tạm: trang sức đầu là một mảnh trong lưới bộ nên hiện cùng áo khi mặc bộ (≥ 2 món). **TODO ô 9**: thêm `EquipSlot` `head`, vật phẩm trang sức đầu mỗi bộ, ẩn/hiện ở UI, ledger khi tạo vật phẩm.
- **Atlas 2K lười** cho bảng nhân vật/nhân vật mình: chưa làm; mọi nơi dùng atlas 1K (mỗi mảnh 512×512 hoặc 512×256 nên chi tiết kém ở gần). Vẫn là việc ghép texture từ 2K gốc, có thể dựng thêm bằng `import.outfit.atlas: 2048`.
- **Voan Phục Mạch** alpha-test/dither: chưa làm (voan đang đặc như vải thường; cần vẽ mặt nạ alpha).
- Chưa có ảnh/trường hợp mảnh Tripo bị lỗi (thủng, dính): 18 mảnh đều nạp và đặt được, nhưng vai giáp và tay áo hơi lởm chởm do atlas thấp.
- `outfit_check.py --keep head` báo nhiều đỉnh mới chui vào vùng đầu/cổ ở tư thế cực biên (hàng chục tới vài trăm, sâu chạm trần 12 cm): phép thử pháp tuyến trên lưới đầu mỏng nhiễu, ảnh trong game không thấy lỗi tương ứng. Chỉ dùng để so sánh tương đối; kết quả: `check/*.json`.

## Ảnh

`sheet_<mảnh>_<m|f>.jpg`: 7 khung đứng trước/sau/nghiêng, chạy, ngự kiếm, đả tọa, chém. `matrix_<bộ>_<m|f>.jpg`: thêm chiêu 1–2 của 3 công pháp và chết. `bang_<bộ>_<m|f>.jpg`: bảng nhân vật 3D. `kiem_*`: kiếm +0/+10 cầm tay và đeo lưng. Chụp: `pnpm shots:outfit --out <thư mục tuyệt đối> --genders m,f --sets set_liet_mach|set_dia_giap|set_phuc_mach --matrix 1 --panel 1 [--query sword=prop_kiem_liet_mach_cuoi]`.

## Số đo (50 bot cùng mặc bộ, `BOT_SET=<bộ> pnpm bench:crowd --bots 50 --scenes san --renderers webgpu --presets high`)

| | draw | tam giác | CPU p50/p95 | texture MB | heap MB |
| --- | --- | --- | --- | --- | --- |
| không mặc bộ (nền) | 202 | 1067k | 4,8 / 6,5 ms | 374 | 269 |
| `set_liet_mach` | 300 | 951k | 6,8 / 9,8 ms | 404 | 258 |
| `set_dia_giap` | 303 | 982k | 8,0 / 11,4 ms | 404 | 310 |
| `set_phuc_mach` | 295 | 936k | 6,3 / 8,6 ms | 404 | 302 |

Mỗi người mặc bộ thêm ~2 draw call (lưới bộ mỗi LOD hiển thị + kiếm/vỏ ở LOD0): phần nhân vật ≈ 100 draw call cho 50 người (< 120), nhưng tổng cảnh ở sân chạm trần 300 (nền 202). Tam giác giảm so với nền vì thân nền chỉ còn đầu/tay. `bench:client` (1 người, không mặc bộ): không chỉ số nào xấu hơn 10% so với lần trước, mọi điểm đạt.
