# UI-5: hoàn thiện bộ giao diện Ngọc Giản

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/ui-ngoc-gian/final/<file>`.

Việc cuối của bộ UI-0…5. `?ngj=0` vẫn về giao diện cũ để so ảnh. Ảnh kiểm: `<màn>-truoc|sau-<cỡ>.jpg` (cỡ: 1366x768, 1080p, 1440p, 4k). Chụp lại: `pnpm --filter @dtl/perf shots:ui5 --out <thư mục tuyệt đối> [--scenes kich-thuoc,do-kiep,hoi-sinh] [--variants truoc,sau]`.

## Đã làm

- **Bảng độ kiếp, tổ đội, lời mời, tỉ thí, thử thách tâm ma, gợi ý, hồi sinh**: sang sơn mài (HUD) / giấy ngà (hồi sinh). Ảnh `do-kiep-*`, `hoi-sinh-*`.
- **Âm thanh UI nhẹ**, đi qua pipeline có sẵn (bus `ui` → master, nên `?mute=1` và công tắc tắt tiếng đều tôn trọng): mở/đóng bảng dùng `ui_open`/`ui_close` sẵn có (tiếng giở/gấp sách), bấm = `ui_click`, **nút chính (nâng cấp, tu luyện, nhập thế…) = `ui_confirm`** (trước đây cùng `ui_click`), **lướt chuột qua nút/ô/tab = `ui_hover`** mới: chạm trầm 230→190 Hz, 60 ms, âm lượng 0,3, mỗi phần tử một lần, cách nhau ≥ 70 ms (`game/audio.ts` tổng hợp, không thêm file). Mã: `ui/App.tsx`.
- **Tương phản WCAG AA** cho chữ thân: `node tools/ui/contrast.mjs` kiểm 23 cặp màu chữ/nền (giấy ngà ở nền sáng nhất lẫn tối nhất của texture; sơn mài kể cả chữ ngà mờ). Có 9 cặp trượt ở giấy ngà (chữ phụ, màu phẩm chất, màu tốt/xấu, nhấn ngọc) nên đã đậm hóa (`--ngj-ink-dim` `#574a34`, phẩm lục `#3b6322`, lam `#215a8a`, tím `#5f35b3`, vàng `#744b00`, xanh `#22633a`, đỏ `#8f2a21`, ngọc `#145f53`/`#145877`): hiện **tất cả ≥ 4,5**. Đây là kiểm theo token, không đo từng điểm ảnh trên nền 3D.
- **Cửa sổ nhỏ (1366×768)**: (1) thanh chức năng ≤ 1500 px chỉ còn icon + phím (hết xuống dòng, không đè khung chat 300 px), (2) co bảng vào khung khi đổi cỡ trình duyệt (`fitWindows` trong `windows/layout.ts`, có test; cặp Nhân vật + Túi đang chồng nhau thì xếp lại cạnh nhau). Ảnh `kich-thuoc-*` (mở trực tiếp ở từng cỡ) và `kich-thuoc-thu-nho-*` (mở ở 1080p rồi thu nhỏ).

## Đo

- **UI < 1 ms/khung** (CDP, 5 s mỗi lượt, cảnh sân Lạc Kiếm và đánh boss, cũ → mới): layout+style 0,014 → 0,008 ms và 0,156 → 0,131 ms/khung; script/task chênh ≤ 0,12 ms (nhiễu cảnh 3D). HUD là CSS/SVG tĩnh, không có JS theo khung; âm hover chỉ chạy khi con trỏ vào phần tử mới.
- **Tải đầu**: `pnpm size` tổng 2,9 MB (ngân sách 30 MB), không thêm asset trong UI-5.

## Giới hạn

- **Bản đồ nhỏ không phóng theo `--ui-scale`** (tự quản vì tọa độ chuột): ở 4K nó nhỏ so với phần HUD còn lại, đọc được nhưng bé; cần sửa riêng nếu muốn.
- Ở 1366×768 hai bảng lớn (Nhân vật + Túi) phủ khung nhân vật ở góc trái; bảng cuộn được và kéo được.
- Tên bảng vẫn chưa có chân dung/tranh riêng; bảng hồi sinh giữ tiêu đề kit cũ (chỉ nền giấy ngà).
- Chưa đo độ tương phản trên nền cảnh 3D thật, chưa có kiểm tra tự động trong CI (script chạy tay).
