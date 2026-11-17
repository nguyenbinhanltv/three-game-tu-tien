# Dựng trang phục vừa thân nền v2 trên Tripo HD (tân thủ, Lạc Kiếm, Liệt Mạch)

Người dùng dựng trên **Tripo web** (không dùng API/credit), từ ảnh concept sinh bằng Codex (`node tools/codex-assets/chr-outfit-gen.mjs`). Ảnh nằm ở `D:\METAGRIT\dtl-asset-source\chr\<thư mục bộ>\concept\` với tiền tố `v2_` (chỉ thêm file mới, không đụng ảnh cũ). Thiết kế vừa thân v2: người cao ráo (~8 đầu), vai hẹp, áo ôm thân vừa phải, **không phồng**. Tạo hình gốc của dự án, tham khảo phong cách bộ v1 (đạo bào dài cổ giao lĩnh, đai, tay áo rộng, giáp vai).

## Cách dựng mỗi mảnh

1. Tripo web → **Image to 3D** (H3.1) → **HD Model**.
2. Upload ảnh theo bảng. Mảnh **không có thân**: ảnh mảnh riêng (`v2_piece_<mảnh>.png`) là đầu vào chính; ba ảnh toàn thân (`v2_front/back/side.png`, tư thế A) dùng để đối chiếu dáng, hoặc làm ảnh **Front / Back / Left** nếu dựng cả bộ một khối để thử.
3. Cài đặt: **Texture** bật (Detailed), **PBR** bật, **Smart Low-poly** bật, **Topology Triangle**, quad tắt, **Polycount** theo bảng. Không bật tự rig.
4. **Tư thế A**: áo ngoài dựng với hai tay áo buông chếch khỏi thân khoảng **35°** (không phải T, không ép sát thân), khuôn ống mở dưới (rỗng), không có người bên trong. Meta cần `fitPose.armDown` ≈ 55 (bộ v1 dùng 70, tay áo sát hơn).
5. Tải **GLB** (có texture), đặt tên `raw_<mảnh>_v01.glb`, lưu vào `D:\METAGRIT\dtl-asset-source\chr\<thư mục bộ>\tripo\`. Báo lại để Claude nhập (`outfit_build.py`, `outfit.player = chr_v2_*`, dựng cả nam và nữ).
6. Xoay kiểm: tay áo không dính thân, vạt không bít kín, không phồng quá hai lần bề ngang thân; quá ba lần thử không đạt thì báo để sửa concept.

## Bảng mảnh

| Mảnh | Tên file | Ảnh dùng (trong `concept\`) | Polycount | Ghi chú |
| --- | --- | --- | --- | --- |
| Áo ngoài | `raw_ao_ngoai_v01.glb` | `v2_piece_ao_ngoai.png` (+ `v2_front/back/side.png` để đối chiếu) | 5000 | Tay áo A-pose 35°, ống rỗng dưới |
| Lớp dưới (quần + vạt trong) | `raw_lop_duoi_v01.glb` | `v2_piece_lop_duoi.png` | 2000 | Phủ đùi tới bắp chân |
| Vai giáp | `raw_vai_giap_v01.glb` | `v2_piece_vai_giap.png` | 1500 | Chỉ Lạc Kiếm và Liệt Mạch; một ảnh hai nửa đối xứng (dựng một bên) |
| Đai + tua | `raw_dai_tua_v01.glb` | `v2_piece_dai_tua.png` | 1200 | Vòng kín quanh eo, tua rời |
| Ủng | `raw_ung_v01.glb` | `v2_piece_ung.png` | 1300 | Cặp ủng, cao tới bắp chân |
| Trang sức đầu | `raw_trang_suc_dau_v01.glb` | `v2_piece_trang_suc_dau.png` | 700 | Băng đầu (tân thủ) / quan nhỏ (Lạc Kiếm, Liệt Mạch) |

## Từng bộ

### Đồ đệ tử tân thủ (`set_de_tu`)
Thư mục `chr\set_de_tu\`. Đạo bào lam tông môn (#3B6584) dài tới bắp chân, cổ giao lĩnh có lớp trong ngà, đai da nâu, quần than, ủng nâu sẫm. **Không có vai giáp**: bỏ qua mảnh `vai_giap`. Hiện đang là bộ thủ tục `set_de_tu_v2_*`; bản Tripo thay thế nó.
Ảnh: `v2_front.png`, `v2_back.png`, `v2_side.png`, `v2_piece_{ao_ngoai,lop_duoi,dai_tua,ung,trang_suc_dau}.png`.

### Lạc Kiếm (`set_lac_kiem`)
Thư mục `chr\set_lac_kiem\`. Đạo bào ngà (#E4DEC8) viền lam hải quân (#27476E), đai lam có ngọc bích nhỏ, **giáp vai xanh sơn mài** (cánh hoa tầng, viền bạc), ánh băng nhạt ở mép giáp. Đủ sáu mảnh.
Ảnh: `v2_front/back/side.png`, `v2_piece_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}.png`.

### Liệt Mạch Kiếm Y (`set_liet_mach_kiem_y`)
Thư mục `chr\set_liet_mach_kiem_y\` (đã có concept và `tripo\` bản cũ: ảnh mới cùng thư mục nhưng tên `v2_*`, **không ghi đè** `raw_*_v01.glb` cũ: dựng bản mới là `raw_<mảnh>_v02.glb`). Áo khoác ngà (#E6DDCB), lót đất son (#9A4A32), giáp vai đồng dạng vách đá nứt với vân hổ phách (#E8A33D), đai da son khóa đồng. Đủ sáu mảnh; vân hổ phách là vật liệu phát sáng riêng như bản cũ.
Ảnh: `v2_front/back/side.png`, `v2_piece_{ao_ngoai,lop_duoi,vai_giap,dai_tua,ung,trang_suc_dau}.png`.

## Sau khi dựng

Báo tên mảnh đã lưu. Claude nhập bằng `tools/blender/outfit_build.py` (meta `outfit.player = chr_v2_nam|nu`, `files` trỏ `raw_*_v02` cho Liệt Mạch), chụp lại ma trận ảnh `pnpm --filter @dtl/perf run shots:chrv2` và so với bản thủ tục.
