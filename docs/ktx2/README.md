# KTX2 cho toàn bộ asset (2026-11-18)

Quyết định Q6 của kế hoạch tái cấu trúc: mọi texture trong GLB chuyển sang KTX2 (Basis Universal). Số đo thử nghiệm ban đầu trên 5 asset ở `docs/r3-assets/README.md`. Ảnh so sánh nằm ở thư mục artifact của phiên làm việc (không commit, theo quy ước R-1).

## Kết quả

| Hạng mục | Trước | Sau |
| --- | --- | --- |
| Texture trong manifest | 456 texture PNG/JPEG/WebP, 0 KTX2 | 456/456 KTX2 (146 asset) |
| `apps/client/public/assets` trên đĩa | 139,1 MiB | 139,4 MiB |
| `bench:crowd` 50 bot mặc `set_dia_giap`, sân, Cao: texture | 414,2 MB WebGPU / 349,4 MB WebGL2 | **223,7 MB / 147,2 MB** |
| Nạp cả 144 asset có mesh trong trang xem (WebGPU): texture | 1.771 MB | 561 MB |
| `bench:load` WebGPU: vào game / GLB về hết | 7,52 s / 15,58 s | 6,51 s / 14,68 s |
| `bench:load` WebGL2: vào game / GLB về hết | 7,29 s / 17,71 s | 7,06 s / 16,86 s |
| Tải đầu (`pnpm size`) | 2,94 MB | 2,94 MB (ngân sách 30 MB) |

Số trong bảng đo trên 146 asset có lúc bắt đầu. Trong lúc làm, `main` thêm `prop_kiem_tan_hoa` (#197, texture PNG); asset này cũng đã nén KTX2 trong cùng PR (538 → 229 KB, cùng file thô, cùng số tam giác và kích thước), nên manifest hiện có **147 asset, 458/458 texture KTX2**.

Hình học, animation và mọi trường manifest ngoài texture của cả 146 asset **giống hệt bản trước** (so từng accessor, ma trận bind, transform node, kênh animation).

Bộ nhớ texture từng asset (WebGPU, MB): `chr_kiem_tu_nam` 16,0 → 6,7; `chr_v2_nam` 21,3 → 2,7; `set_dia_long_ho_giap_nam` 21,3 → 7,3; `boss_han_giao` 22,7 → 7,5; `mon_thiet_boi_tru` 8,0 → 2,2; `prop_co_thu` 8,0 → 2,2.

## Mã hóa (`tools/asset-pipeline/src/ktx.ts`, `encodeArgs`)

Chọn bằng số đo trên texture thật 1024² (`set_dia_long_ho_giap_nam` nguồn PNG, `chr_kiem_tu_nam` nguồn JPEG/PNG); PSNR đo sau khi giải mã lại bằng `ktx extract --transcode rgba8`.

| Loại | Tham số | Cỡ file | PSNR |
| --- | --- | --- | --- |
| Normal map | UASTC chất lượng 2, RDO λ=1,0, zstd 18 | 291–518 KB | 44,7–49,9 dB |
| Màu sRGB (base color, emissive) | ETC1S q192, clevel 3 | 190–249 KB | 28,8–38,9 dB |
| Dữ liệu tuyến tính khác (ORM) | ETC1S q128, clevel 2 | 67–129 KB | 22–48 dB tùy kênh |

Phương án đã loại:

- Normal map bằng ETC1S: chỉ 34–39 dB, vỡ khối trên pháp tuyến. UASTC không RDO: thêm khoảng 2 dB nhưng file lớn hơn 30–45%.
- Màu bằng ETC1S q128: thấp hơn q192 khoảng 1,1–1,7 dB; q255 chỉ thêm 0,1–1,2 dB mà lớn hơn 11–12%. Màu bằng UASTC: 0,9–1,1 MB mỗi texture.
- ORM bằng UASTC: 0,75–0,86 MB mỗi texture (thêm khoảng 30 MB cho riêng 38 áo). ORM của áo có vùng mặt nạ cạnh cứng nên PSNR kênh G/B thấp (22 dB) ở cả ETC1S lẫn WebP trước đây; lệch nằm trên đường biên vùng, ảnh trong game không thấy khác.

Texture WebP trong GLB thô (áo, nhân vật v2) được giải mã sang PNG trước khi đưa cho `toktx`. Các texture của một asset nén song song; tối ưu cả 146 asset mất khoảng 8 phút.

## Client (`apps/client/src/game/assets.ts`)

`GameKtx2Loader` + `detectKtx2Support(ktx2, renderer)`, dùng chung cho game, trang xem asset và `pnpm compat`. Hai dòng đầu của bảng đã kiểm trên trình duyệt (Chrome headless, máy dev); hai dòng cuối là hành vi theo bảng ưu tiên định dạng của `KTX2Loader`.

| Backend | Màu, ORM, emissive (ETC1S) | Normal map (UASTC) |
| --- | --- | --- |
| WebGL2 desktop | BC7 | BC7 |
| WebGPU desktop | BC1 (BC3 khi có alpha) | **RGBA8 không nén** |
| GPU có ASTC (chưa thử trên máy thật) | ETC2 nếu có, không thì theo thứ tự của three | ASTC 4×4 |
| Không có định dạng nén nào (chưa thử trên máy thật) | RGBA8 | RGBA8 |

Vì sao WebGPU khác WebGL2: backend WebGPU của three r178 chỉ tạo được texture BC1–BC3, ETC2 và ASTC, **không có BC7**. Ép BC7 thì console báo `Unsupported texture format` và texture hỏng (đã gặp khi chụp ảnh so sánh lần đầu). Để mặc định thì three chuyển normal map xuống BC1 (5–6 bit mỗi kênh), vỡ khối. Nên trên WebGPU, tệp UASTC đi qua một loader phụ tắt hết định dạng nén, trả về `DataTexture` RGBA8 (mức 0 từ tệp, mip do GPU sinh). Hệ quả: WebGPU tiết kiệm bộ nhớ ít hơn WebGL2 (khoảng 2,4 lần so với 4 lần trên một nhân vật). Khi three hỗ trợ BC7 trên WebGPU thì bỏ nhánh này trong `GameKtx2Loader`.

Test chạy trong Node nạp GLB qua `nodeGltfLoader()` (`apps/client/src/game/gltfTestLoader.ts`): Node không có GPU/Worker để chuyển mã KTX2, nên mọi texture là `Texture` rỗng; test chỉ kiểm hình học, xương, clip, vật liệu.

## Pipeline

- `toktx` 4.4.2 (KTX-Software, Apache-2.0) là bắt buộc để build asset; cách cài và thứ tự dò ở `assets/README.md`, mục "Cài toktx". Thiếu `toktx` thì `assets:build`/`assets:optimize` dừng với lỗi thay vì âm thầm ra PNG/WebP.
- `PIPELINE_VERSION` tăng lên 3 (đổi tham số mã hóa).
- `shrink.ts` bỏ qua texture KTX2 (đã hạ cạnh lúc nén).

## Bảy asset giữ GLB cũ, chỉ nén lại texture

Dựng lại từ Blender, 139/146 asset ra đúng hình học cũ. Bảy asset ra hình học khác bản đang commit:

- `boss_kiem_khoi`, `boss_thu_mo_tuong`: lệch đã biết khi build toàn bộ.
- `prop_kiem_han_giao`, `prop_kiem_han_quang`, `prop_kiem_thanh_phong`, `prop_kiem_thiet`, `prop_kiem_tram_ta`: hộp bao đổi rõ (Hàn Quang: cao 0,95 → 0,985 m, sâu 0,286 → 0,102 m), tức nguồn hoặc `orient_sword.py` đã đổi sau lần build được commit.

Với bảy asset này, GLB đang commit được giữ nguyên và chỉ nén lại texture sang KTX2 (texture trong GLB cũ là PNG/JPEG đi thẳng từ nguồn nên không mất thêm chất lượng). Việc để lại: tìm nguyên nhân năm thanh kiếm dựng lại ra khác rồi mới dựng lại chúng từ nguồn; trước đó `pnpm assets:build --only prop_kiem_*` sẽ đổi hình kiếm.

## So ảnh

- 144 asset trong trang xem (`?mute=1&show=<id>`, WebGPU, animation dừng ở t=0): lệch trung bình mỗi kênh lớn nhất 0,91/255, trung vị 0,22; không lỗi console.
- Trong game (5 cảnh × WebGPU/WebGL2, 3 bộ áo × nam/nữ, nhân vật v1/v2 có và không có bộ): số lệch lớn hơn (tới 12/255) vì cảnh động: nước, hạt bay, nhân vật thở, có ảnh chụp đúng lúc bị quái đánh. Xem trực tiếp các cặp lệch nhiều nhất không thấy khác biệt về texture.

## Kiểm

- `pnpm assets:validate`: 146 asset, 0 lỗi.
- `pnpm typecheck`, `pnpm content:check`, `pnpm docs:check`: đạt.
- Test: shared, content, asset-pipeline, perf, server (633) đạt. Client 729–730/730: bài đo thời gian `groundFeet` ("CPU thêm ≤ 0,5 ms mỗi khung") đạt khi chạy riêng nhưng hay vượt ngưỡng khi cả bộ chạy song song trên máy dev; bài này không đụng texture (đã thay bằng stub) và đã chập chờn từ trước.
- `bench:crowd`: CPU p95 vượt 8 ms ở cả trước lẫn sau (WebGPU 11,7 → 10,9 ms, WebGL2 20,3 → 10,6 ms), draw call và tam giác không đổi ngoài biên nhiễu.
- `bench:load`: ngưỡng "khung đầu − JS < 2 s" không đạt ở cả trước lẫn sau (WebGPU 2,90 → 2,87 s, WebGL2 2,50 → 2,30 s).
