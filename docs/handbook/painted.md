# Họa Cảnh (`?style=painted`)

Phong cách nền hoạt hình vẽ tay, thử ở Vân Lam khởi đầu. **Mặc định không đổi gì**: mọi nhánh mới nằm sau `FLAGS.style === 'painted'` (`src/base/flags.ts`). Kế hoạch gốc ở artifact phiên (`ke-hoach-hoa-canh.md`); người dùng duyệt P7 (nhân vật cel) và quyết định mặc định (P8).

## Nguồn và ranh giới

- Kỹ thuật và code tham khảo: painted-valley, MIT © 2026 Patch (nguyên văn giấy phép ở `assets/LICENSES.md`). Nguồn là WebGL2/GLSL; ta **viết lại bằng TSL**, không chép GLSL. File dựa trực tiếp trên nguồn ghi ở dòng đầu: `Dựa trên painted-valley/<file> (MIT, © 2026 Patch), viết lại bằng TSL`.
- KHÔNG dùng âm thanh Sonniss của bản gốc. KHÔNG tái tạo cảnh/nhân vật của phim nào. KHÔNG commit ảnh chụp hay ảnh tham khảo (ảnh duyệt PR để ở artifact phiên). Texture mới qua `pnpm assets:push`.
- Vẫn tuân quy tắc chung: lore ở `lore-boundary.md`, chuỗi hiển thị qua i18n, ngân sách perf (<300 draw call, CPU <8 ms, 512 MB texture).

## Các bước (mỗi bước một PR, tuần tự)

| | Nội dung | Trạng thái |
| --- | --- | --- |
| P1 | cờ `style`, `render/painted/palette.ts` (bảng lit/shade, `cel2`), giấy phép, trang này | xong ở PR này |
| P2 | mặt đất + cỏ (nét cọ theo dốc, mảng màu chậm) | xong ở PR này |
| P3 | núi xa nướng một lần vào dải sơn, sương theo mood | |
| P4 | mây trời đắp khối nướng vào cubemap | |
| P5 | hoàn thiện Kuwahara + mặt nạ (bỏ qua trời/VFX/HUD) | |
| P6 | cây + nhà ngoài tông (cel2, chi tiết shader) | |
| P7 | nhân vật cel thử một bộ (cần người dùng duyệt) | |
| P8 | tổng kết, preset chất lượng, quyết định mặc định | |

## Palette và cel2 (P1)

`render/painted/palette.ts`: `PAINTED` là bảng cặp [sáng, tối] (sRGB hex) cho cỏ, đất, đá, tán, mái, tường, gỗ, núi xa. Màu tối pha tay, lạnh hơn và ít bão hòa hơn màu sáng (test kiểm). `cel2(lit, shade, t, edge?, soft?)` là bước tô TSL; `celFactor` là cùng công thức ở CPU để test. Chưa vật liệu nào dùng (P2 trở đi).

## Đo

Mỗi PR từ P2 ghi số trước/sau cùng điểm `?at=` (draw call, CPU, GPU, texture) cho `?style=painted` và mặc định, trên cả `?renderer=webgpu` lẫn `webgl2`; luôn `?mute=1`.

## Mặt đất + cỏ (P2, làm lại theo đối chiếu trực tiếp)

Lần đầu (bụi cỏ hai tông + nét cọ xoay theo dốc) bị người dùng loại: "không giống painted-valley". Làm lại bằng cách chạy chính painted-valley, đặt camera của nó đúng góc game (chéo 52°, 20 m, FOV 32°, `__tg.view`) để có ảnh tham chiếu cùng góc, rồi port SÁT công thức nguồn:

- `render/painted/meadow.ts`: `meadowGreen` (ba xanh đúng giá trị nguồn), `meadowTint`, `tallAt`, `slopeRel`, `paintGround`, `hash42` (nguồn `src/lib/glsl.js`).
- `game/world/paintedGrass.ts`: `PaintedGrass` thay `Grass` ở level dùng bụi lá thủ tục khi `?style=painted` (port `blades.js` + `flowers.js`): hai vòng lá mảnh `mid`/`wide` mờ qua nhau theo khoảng cách tới camera, mọi thứ suy ra từ số ô thế giới; hoa trắng/vàng/hồng/be thành đám. Độ cao và mật độ đọc từ texture lưới 1 m cuộn quanh người chơi (dựng bằng CPU, luật mọc chung với cỏ thường qua `grassDensityAt`).
- `render/painted/ground.ts`: màu đất = `meadowGreen` + `meadowTint` + `paintGround`; đường mòn/đất khô be nhạt.
- `render/painted/brush.ts`: texture nét cọ dựng như `strokes.js` (mảng lớn, nét, chấm); mảng lớn là thứ cho cỏ các mảng sáng/tối nhiều mét.
- `render/painted/kuwahara.ts` + `post.ts` (P5 rút gọn): Kuwahara bốn phần tư, `?paint=0..3` (mặc định 1), bỏ qua trời (độ sâu) và điểm sáng HDR (VFX). Chưa có mặt nạ alpha cho nhân vật (làm ở P7).
- Nét lá (lần 3): lá tối ở gốc, sáng ở ngọn (`mix(0.5, 1.12, up)`), 12% lá là nét sẫm / 10% hứng nắng, khóm sẫm theo ô 44 cm, mảng đậm/nhạt vài mét; hoa dày (xác suất ×2,5, to hơn); Kuwahara trộn 55% với ảnh gốc (`paintedFinishParams.strength`) để không xóa nét lá.
- Ngân sách: vòng `mid` cell 0,11 m ô 6,6 m; `wide` cell 0,22 m ô 17,6 m; hoa 4×4 ô. Tam giác 1,32–1,43 M, draw call +38..54.
- Chỉnh nhìn: `paintedGroundParams.gain/.tint`, `paintedGrassParams.gain`.
- Khác nguồn: bỏ lửa/cắt/giẫm; nhiễu `tNoiseHi` thay bằng nhiễu của ta; ánh sáng qua đèn PBR của cảnh (có bóng, theo mood) thay cho `meadowLight`.
- Chụp so sánh: `pnpm shots painted --out <thư mục tuyệt đối> [--styles off,painted] [--moods day,night] [--views 720p,1080p] [--points thunglung,giua,suoi] [--burst N] [--spawn <id quái> --spawn-n N]` (Thung Lũng Thanh Phong); ghi `perf.json`. Ảnh tham chiếu painted-valley chỉ để ở artifact phiên, KHÔNG commit.
