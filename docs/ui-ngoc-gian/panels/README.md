# UI-3: bảng lớn giấy ngà tường vân

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/ui-ngoc-gian/panels/<file>`.

Mọi bảng lớn (mọi `PanelWindow`) chuyển sang chất liệu **giấy ngà tường vân** của bộ `ui/ngj/` theo `docs/ui-ngoc-gian/mock-bang-nhan-vat.webp`. Giữ nguyên hành vi, phím tắt (B C K L P O H), kéo thả, sắp xếp/lọc túi đồ (#139–#141). `?ngj=0` về bảng cũ (cùng cờ với HUD UI-2) để so ảnh.

## Cách làm

- `kit/Panel.tsx` `PanelWindow`: thêm lớp `ngj-win`, bốn góc mây ngọc bích (`Corners`), viền vàng **vẽ dần** khi mở (SVG `rect` + `stroke-dashoffset`, 250 ms; **tắt bằng Giảm chuyển động**: `--ngj-dur-open` về 0 và `.ngj-draw` ẩn), và `Header` có bảng tên nét đôi (`Cartouche`) với họa tiết theo bản đồ đang đứng (Vân Lam / Đoạn Mạch / Vân Hải).
- `u2/win.css` (thay `ngj/panels.css` từ U2-3a): đổi token `--k-*` và biến toàn cục (`--gold`, `--text`, `--good`…) trong phạm vi `.ngj-win` sang màu hợp giấy, rồi vá riêng chỗ có màu cứng (thẻ, hàng, tên vật phẩm theo phẩm, tab, nút, ô nhập, thanh trang túi). Vì mọi bảng dùng chung kit nên một lớp CSS phủ cả Nhân vật, Túi đồ, Công pháp, Nhiệm vụ, Tổ đội, Cài đặt, Trợ giúp và Hội thoại NPC (trò chuyện, cửa hàng, luyện đan, luyện bảo, cường hóa, khảm ngọc, tẩy luyện, phân giải, chế tạo, thăng bậc).
- **Nhân vật**: tab dọc `TabRail` giấy ngà ở bên trái (icon nét vàng), ô trang bị **thoi** quanh mô hình 3D, viền phẩm chất phát sáng.
- **Túi đồ**: ô **tròn**, viền phẩm chất phát sáng, ô trống vành nhạt; thanh trang, ô tìm, sắp xếp giữ nguyên hành vi.
- Ô vật phẩm giữ lòng tối để icon vẽ màu vẫn nổi trên giấy.

## Ảnh trước/sau (1080p và 1440p, `?mute=1`)

`<bảng>-truoc-<độ phân giải>.jpg` (bảng cũ) và `<bảng>-sau-…`: `nhan-vat`, `nhan-vat-thuoc-tinh`, `tui-do`, `cong-phap`, `nhiem-vu`, `to-doi`, `cai-dat`, `tro-giup`, `npc-hoi-thoai`, `cua-hang`, `luyen-dan`, `cuong-hoa`, `thang-bac`. Chụp lại: `pnpm shots ui --part panels --variants truoc,sau --out <thư mục tuyệt đối> [--panels a,b] [--variants truoc,sau]` (tự đưa đồ, vàng, bộ trang bị vào để bảng có nội dung).

## Giới hạn

- Bảng Nhiệm vụ và Tổ đội chụp ở trạng thái trống (chưa nhận nhiệm vụ, chưa vào đội).
- Bản đồ lớn (phím M) và các bảng chuyên biệt khác (độ kiếp, tâm ma, hồi sinh) chưa đổi; bản đồ lớn có khung riêng.
- Họa tiết bảng tên là SVG đơn giản (UI-1); bảng tên dùng serif hệ thống thay font hiển thị toàn chữ hoa để đọc rõ tiếng Việt.
- Tooltip đã là sơn mài từ UI-2 (dùng chung cho HUD và bảng).
