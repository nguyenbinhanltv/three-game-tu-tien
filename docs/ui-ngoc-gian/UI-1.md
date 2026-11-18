# UI-1: nền tảng "Ngọc Giản Kim Văn"

Xem toàn bộ thành phần: `http://localhost:5173/?ui=ngj&mute=1` (trang xem, không cần server game). Ảnh: `docs/ui-ngoc-gian/kit/` (`pnpm --filter @dtl/perf shots:ngj --out <thư mục tuyệt đối>`, 1080p và 1440p, đo chi phí khung vào `ngj-metrics.json`).

Mã nguồn: `apps/client/src/ui/ngj/`. Import `from '../ngj'` (hoặc `./ngj`); chưa gắn vào HUD/bảng thật (UI-2, UI-3).

| Thành phần | Ghi chú |
| --- | --- |
| `tokens.css` | Mọi token `--ngj-*`: màu `#C9A45C / #EDE3CC / #3E9C8F / #1E1712`, phẩm chất, nét, khoảng cách, bóng, chuyển động (`--ngj-dur*` về 0 khi giảm chuyển động) |
| `NgjPanel` | `material="lacquer"` (HUD, trong suốt 90%, chỉ vàng đôi, góc sao/trăng) hoặc `"paper"` (bảng lớn, viền ngọc bích + chỉ vàng, góc mây) |
| `OrnateCorner` | Góc SVG `star|moon|sun|plain|cloud`, lật bằng CSS |
| `Cartouche` | Bảng tên nét đôi, họa tiết phong cảnh theo `map` (`van_lam|doan_mach|van_hai`), nền giấy hoặc sơn mài |
| `NgjButton` | `primary | secondary | ghost`, vô hiệu, focus bàn phím |
| `NgjSlot` | Thoi / tròn / bát giác, viền phẩm chất 0–4 phát sáng (không tô đặc), chọn, trống |
| `OrnateBar` | Máu / linh lực / tu vi, đầu mút trái hoa văn, phải hạt ngọc; phần đầy `scaleX` |
| `TabRail` | Tab dọc, mũi tên lên xuống, mốc thoi vàng khi chọn |
| `NgjTooltip` + `NgjTipCard` | Dùng lại định vị của `Tooltip` kit (thêm prop `tipClass`) |
| `SysIcon` | 16 icon nét vàng 24×24 (`meditate sword bag character method party quest map settings mail shop alchemy forge stone head close`) |
| `SealNumeral` | Chữ triện 1–99 bằng nét SVG (hình xấp xỉ, không dùng font) |
| `motion.ts` | "Giảm chuyển động": Cài đặt → mục mới, lưu `dtl.reduceMotion`, mặc định theo hệ điều hành, đặt `data-reduce-motion` trên `<html>`; là nguồn duy nhất: các khối `prefers-reduced-motion` cũ (styles, kit, panels, tutien, methodpanel) đã đổi thành `:root[data-reduce-motion="true"]` |

Chất liệu: `tex/lacquer.webp` (~1 KB) và `tex/paper.webp` (~1 KB), sinh bằng `python tools/ui/ngj-textures.py` (cần Pillow); đều dưới giới hạn 50 KB.

Thay emoji: 3 món trang sức đầu (`setItems.json`) có `iconFallback: "sys:head"`; `ContentIcon` vẽ icon SVG `head` thay 👑 (loot bay hiện dấu ◆). Emoji dự phòng khác (đan, pháp bảo…) chưa đụng, thuộc UI-3.

## Đo

UI chỉ là CSS/SVG tĩnh, không có JS theo khung. Trang kit ở trạng thái nghỉ (CDP, 3 s): layout 0 ms, style 0 ms, script 0 ms, tổng task ≈ 0,2 ms mỗi 3 s; 61 fps ở cả 1080p và 1440p, không lỗi console. Tải đầu: chỉ thêm khoảng vài KB CSS/JS và 2 KB texture (bundle game vẫn nạp `ngj.css` qua Cài đặt/ContentIcon).

## Giới hạn

- Chữ triện số 4, 5, 6, 9 là nét vẽ tay xấp xỉ; muốn đúng bản chuẩn cần font triện có giấy phép (ý trong README UI-0).
- Họa tiết bản đồ của `Cartouche` là bản SVG đơn giản, nhỏ hơn bản Codex ở `style-02`.
- Hiệu ứng mở bảng chỉ có fade/trượt 250 ms; vòng quét, hạt vàng, băng chuyền thẻ để UI-4.
