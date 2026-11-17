# Trang phục bậc 3 Nguyên Anh + Kính Quang Kiếm +10 (T-7)

Hai bộ còn lại của bậc 3, dựng từ 6 mảnh Tripo HD Model (đủ texture, concept `docs/outfit-concepts-p2/` #155) bằng đúng pipeline T-5/T-6 (`tools/blender/outfit_build.py`, xem `docs/outfits-ket-dan/`, `docs/outfits-hoa-than/`). Kính Quang Kiếm Y (Kiếm tu bậc 3) đã nhập ở T-6d (#163).

| Bộ (dữ liệu) | Asset (nam/nữ) | Tam giác LOD0 / LOD1 / LOD2 | Mô tả |
| --- | --- | --- | --- |
| `set_van_kinh` Hộ pháp | `set_van_kinh_thiet_giap_{nam,nu}` | 12009 / 4804 / 1801 (nam), 12005 / 4802 / 1801 (nữ) | giáp vảy kình, vai đuôi kình |
| `set_luu_ly` Đan sư | `set_luu_ly_dan_y_{nam,nu}` | 10823 / 4407 / 1616 (nam), 10823 / 4326 / 1613 (nữ) | đạo bào lưu ly, voan choàng, hồ lô ở đai |

`outfits.json` ánh xạ `set_van_kinh` → `set_van_kinh_thiet_giap`, `set_luu_ly` → `set_luu_ly_dan_y`. Hai bộ **đã có vật phẩm** trong `sets.json`, nên ảnh chụp mặc thật bằng `/gm set` (không ép áo). Trang sức đầu (ô 9) nằm trong lưới bộ như các bộ trước.

## Cấu hình (`assets/source/chr/set_<bộ>_{nam,nu}/meta.json`)

- Nguồn: `chr/<bộ>/tripo/raw_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}_v01.glb`; cả 6 mảnh mỗi bộ đều có texture nên **không cần vật liệu thủ tục** (`proc`). Không đụng `raw_v01.glb`/`rig_v01.glb`.
- **Vân Kình** (bài học #162, skin giáp cứng): váy giáp `islands: true`, `legBlend` 0,9, `spring: false`; giáp thân `legBlend` 0,9, `smooth` 4, `armFix` 0,09, lò xo chỉ 3 xương cho choàng sau lưng (`minDist` 0,12); vai `shoulder_span+0.13`; giáp thân thu 0,82→0,85 bề ngang. Chỉ tua/đai có lò xo. Bảng màu: chính `#4A5870`, phụ `#E4E8EC`, viền `#B9C4D0`, nhấn `#6FB4E8`; `gain` 1,2.
- **Lưu Ly** (bài học #160, voan blend hai lượt): `alpha.ao_ngoai = "veil"` (voan nhận theo màu texel, một mảnh xuyên sáng, còn dư một suất trong giới hạn 2), `normalFlat` 0,8. Client vẽ voan blend thật, `depthWrite` tắt, độ đục ~0,42, chỉ LOD0; LOD1/2 vẽ đặc, không dither chấm. Bảng màu: chính `#F1F5F6`, phụ `#A9D6E6`, viền `#D4DEE0`, nhấn `#7FD4D8`; `gain` 1,1.

## Kính Quang Kiếm

- **+0 và +7** giữ model #119 `prop_kiem_kinh_quang` (không sửa); vân sáng +7 chạy như mọi kiếm.
- **Dạng cuối +10** `prop_kiem_kinh_quang_cuoi` (`orient_sword.py`, 2296 tam giác): lưỡi bạc gương, chắn cánh + ngọc lam. `SWORD_FINAL` đổi gốc → cuối khi cường hóa +10.
- **Vỏ riêng** `prop_vo_kiem_kinh_quang` (1396 tam giác), dùng chung cho hai dạng kiếm (`SCABBARD_OF`); trên lưng chỉ một kiếm trong vỏ.
- Hào quang cường hóa lam băng `#8FD8F0` (`SWORD_GLOW_TINT`, `SWORD_TINT` cho dạng cuối); test ở `swordTint.test.ts`.
- Ảnh `kiem_kinh_quang_0_7_10.jpg` (hàng trên xuống: +0, +7, +10; cột trái đeo lưng, cột phải cầm tay), `kiem_kinh_quang_10_nu.jpg` (+10 trên thân nữ). Chụp với Liệt Mạch Kiếm trong tay để có `plus`, model hiển thị ép bằng `?sword=` (như #157).

## Kiểm xuyên mesh

`outfit_check.py --keep head --tol 0.04`: số đỉnh xuyên vùng đầu/cổ: Vân Kình nam 11–56 (vai to, chém giơ tay), nữ 0–4; Lưu Ly nam 5–24, nữ 1–4; sâu ≤ 4 cm (trần thử nghiệm). Ảnh game (đứng/chạy/ngự kiếm/đả tọa/chém/chết, ba công pháp, nam+nữ) không thấy xuyên mesh đáng kể. `check/*.json`.

## Số đo (`BOT_SET=<bộ> pnpm bench:crowd --bots 50 --scenes san --renderers webgpu --presets high`, cổng 2837/5437)

| | draw | tam giác | CPU p50/p95/p99 | texture MB | heap MB | tick p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 50 bot Vân Kình, sân tông môn | **275** (< 300) | 823k | 6,9 / 10,2 / 47,5 ms | 409 | 302 | 2,3 ms |
| 50 bot Lưu Ly, sân tông môn | **284** (< 300) | 992k | 9,1 / 14,2 / 57,5 ms | 409 | 238 | 3,9 ms |

Draw đạt ngân sách. CPU p50 Lưu Ly 9,1 ms hơi quá 8 ms (voan thêm một draw ở LOD0, cùng mức các bộ voan trước; máy đo bận, p99 là khung nạp pipeline đầu).

## Ảnh

`sheet_<bộ>_<m|f>.jpg` (đứng trước/sau/nghiêng, chạy, ngự kiếm, đả tọa, chém, chết), `matrix_<bộ>_<m|f>.jpg` (chiêu 1–2 của 3 công pháp, chết, chém), `bang_<bộ>_<m|f>.jpg` (bảng nhân vật 3D); bộ = `van_kinh`, `luu_ly`. Chụp: `pnpm shots:outfit --out <thư mục tuyệt đối> --genders m,f --sets set_van_kinh|set_luu_ly --matrix 1 --panel 1`; kiếm: `pnpm shots:kiem --out <thư mục> --model prop_kiem_kinh_quang|prop_kiem_kinh_quang_cuoi --equip "itm_liet_mach_kiem|Liệt Mạch Kiếm" --set set_kinh_quang --glow 0|1|2`.

## Giới hạn

- Vân Kình: tay áo trắng phồng rách mép và hơi nhàu khi chém (hình học Tripo); mép giáp vảy lởm chởm khi nhìn gần.
- Lưu Ly: voan vỡ thành mảnh nhọn do hình học Tripo, hơi cứng so với concept; chưa tách dải lụa đai thành mảnh xuyên sáng thứ hai.
- GLB chưa nén KTX2 (máy dựng không có `toktx`), giống các bộ trước nên GLB 4–5 MB mỗi mảnh; nén lại khi có KTX-Software.
- Kiếm Kính Quang chưa có mặt nạ emissive riêng cho ngọc lam.
