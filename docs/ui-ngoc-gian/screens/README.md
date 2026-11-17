# UI-4: màn đặc trưng kiểu Ngọc Giản

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/ui-ngoc-gian/screens/<file>`.

`?ngj=0` về bản cũ (cùng cờ UI-2/UI-3). Ảnh `<màn>-truoc-*` (cũ) và `<màn>-sau-*` (mới), 1080p/1440p, `?mute=1`; video webm 1280×720 (3 đoạn ~2 MB) chỉ cho bản mới. Chụp lại: `pnpm --filter @dtl/perf shots:ui4 --out <thư mục tuyệt đối> [--scenes dang-nhap,man-tai,bang-chuyen,do-kiep,ban-do] [--variants truoc,sau] [--video 0]`.

| Màn | Thay đổi | Ảnh / video |
| --- | --- | --- |
| Đăng nhập + tạo nhân vật | Thẻ giấy ngà tường vân (góc mây ngọc, viền vàng); chọn giới tính bằng **hai thẻ chân dung** (tranh Codex `player_m/f` từ UI-2); hạt màu áo viền vàng; nút chính vàng sơn | `dang-nhap-*`, `dang-nhap-nu-*`, `dang-nhap-man-tai.webm` |
| Màn tải | Giữ tranh minh họa theo vùng (Codex, nạp lười, 61–138 KB mỗi ảnh, đều ≤ 300 KB, có sẵn từ P2); thẻ tải giấy ngà + thanh tiến độ đầu mút thoi vàng/hạt ngọc | `man-tai-*` |
| Chọn công pháp | **Băng chuyền thẻ** toàn màn (mockup `mock-chon-cong-phap`): thẻ chọn phóng to ruột giấy ngà, hai thẻ bên mờ, vòng tròn đồng tâm nền, số triện, số La Mã, cột chi tiết + hai chiêu + nút tu luyện; ← → Enter Esc. Mở bằng nút "Mở băng chuyền chọn công pháp" ở bảng Công pháp (K); gửi cùng ý định `C.METHOD`, server quyết định | `bang-chuyen-*`, `bang-chuyen-the3-*`, `bang-chuyen.webm` |
| Đột phá / độ kiếp | **Vòng quét** (ba vòng mảnh đồng tâm), **vết nứt sáng** vẽ dần từ tâm, hạt vàng bay; gắn vào thẻ chương `trib` và `ascend*`; tắt hẳn bằng Giảm chuyển động | `do-kiep-*`, `do-kiep.webm` |
| Bản đồ lớn (M) | Đã là giấy ngà từ UI-3; vá thêm chip, danh sách vùng, khung bản đồ cho đọc rõ trên giấy | `ban-do-*` |

## Giới hạn

- Vòng quét/vết nứt khá mảnh trên nền sáng của sân Lạc Kiếm; chỉnh độ sáng nếu cần. Ảnh tĩnh khó thể hiện chuyển động: xem `do-kiep.webm`.
- Băng chuyền hiện chưa có tranh minh họa riêng cho từng công pháp (dùng icon công pháp phóng lớn); chữ triện số 1–3 chỉ là nét ngang.
- Chưa chụp màn đột phá thành công (`ascend*`, thẻ chương cùng cơ chế) trong ảnh; chỉ chụp thẻ `trib` khi bắt đầu độ kiếp.
- Tải đầu: không thêm asset nào vào lần tải đầu (CSS/JS nhỏ; hai chân dung và tranh tải đều nạp lười).
