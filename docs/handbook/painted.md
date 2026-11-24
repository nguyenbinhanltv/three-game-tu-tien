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

## Mặt đất + cỏ (P2)

- `render/painted/brush.ts`: texture nét cọ 512 liền mạch sinh bằng CPU (R = nét mảnh dài theo x + chấm tròn, G = mảng mềm lớn); không có asset.
- `render/painted/ground.ts`: `paintedGroundColor` (gọi cuối `applyGroundShader` khi `FLAGS.style === 'painted'`) và `paintedGrassColor` (`game/world/grass.ts`). Đất cỏ và đường mòn thành hai tông (sáng/tối) từ bảng `PAINTED`, mảng xanh chậm lấy từ mặt nạ vĩ mô, nét cọ xoay theo hướng xuống dốc (đất bằng: chéo cố định), mờ hết ở ~38–120 m để không lấp lánh. Đá/vách/tuyết/lát đá/mộ giữ nguyên; pháp tuyến texture bị bỏ ở phần được tô. Tông tối của nét là nét cọ (pha nửa với tông sáng), bóng thật vẫn do bản đồ bóng của cảnh.
- Chỉnh nhìn: `paintedGroundParams.gain` (sáng) và `.strokes` (tương phản nét).
- Chụp so sánh: `pnpm shots painted --out <thư mục tuyệt đối> [--styles off,painted] [--moods day,night] [--views 720p,1080p] [--points thunglung,giua,suoi]` (Thung Lũng Thanh Phong); ghi `perf.json` (draw call, tam giác, texture, ms/khung).
