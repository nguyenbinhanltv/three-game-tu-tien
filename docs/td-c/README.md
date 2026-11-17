# TD-C: bảng nhân vật 3 tab, xem trước 3D, tooltip chuyên nghiệp

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/td-c/<file>`.

Kế hoạch: `ke-hoach-tui-do-nhan-vat.md` mục C, D. Chạy lại ảnh và số đo: `pnpm --filter @dtl/perf shots:tdc --out <thư mục> [--size 1920x1080] [--renderer webgl2] [--perf]`.

## Bảng nhân vật (`apps/client/src/ui/character/`)
- **Tổng quan** (`Overview.tsx`): 8 ô trang bị quanh xem trước nhân vật, thanh khí huyết/linh lực/tu vi, 8 chỉ số chính, bình cảnh, khối độ kiếp. Thả đồ từ túi lên ô để mặc (dùng kéo thả `ui/bag/dnd.ts` của TD-B, gửi `C.EQUIP`).
- **Thuộc tính** (`Attributes.tsx`, `stats.ts`): mọi chỉ số của `computePlayerStats`, chia nhóm Tấn công / Phòng thủ / Hồi phục / Ngũ hành. Rê chuột thấy nguồn (gốc cảnh giới, trang bị, bộ, linh căn, công pháp/pháp bảo/đan) và một dòng giải thích. Nguồn = hiệu hai lần gọi `computePlayerStats` (không copy công thức); phần chênh với số server gửi thành nguồn "khác".
- **Bộ trang bị · Tu luyện** (`SetTrain.tsx`): bộ đang mặc, công pháp đang tu (nút mở bảng K), linh căn, chiêu.
- Tiêu đề có **Lực chiến** (`combatPower` của shared, TD-A).
- Khối độ kiếp (`breakthrough.ts`) đọc `tribulations.json` qua `tribForLevel`/`TRIB_DEFS` cho mọi cảnh giới: vật phẩm, tu vi, bình cảnh, cờ `enabled`. Đã bỏ `TRUC_CO_PILL` và `NGUNG_KHI_MAX` cứng trong bảng.

## Xem trước 3D (`game/charPreview.ts`)
Vẽ model người chơi (mặc đúng đồ, phụ kiện bộ, kiếm riêng) vào một render target 256×352 bằng renderer chính (không dựng thiết bị GPU thứ hai), đọc điểm ảnh về canvas 2D của bảng. Chỉ vẽ khi bảng mở (gắn lúc mount, gỡ lúc unmount: model và render target được giải phóng), ~30 khung/giây, kéo ngang để xoay. Vượt 3 ms CPU trung bình mỗi lần vẽ, hoặc đọc điểm ảnh lỗi thì tự lùi về hình bóng 2D. `?preview=2d` ép dùng hình 2D.
Lưu ý: WebGPU đọc texture theo hàng căn 256 byte nên chiều rộng phải là bội số của 64.

### Số đo (Chrome, `--perf`, 1280×720, preset Vừa, tắt tiếng)
| Trạng thái | Backend | CPU khung p50 / p95 (ms) | Draw call (cảnh) | Texture |
| --- | --- | --- | --- | --- |
| Bảng đóng | WebGPU | 2,5 / 3,2 | 114 | 103 |
| Nhân vật · Tổng quan | WebGPU | 2,6 / 3,4 | 114 | 105 |
| Nhân vật + Túi | WebGPU | 2,6 / 3,3 | 114 | 105 |
| Đóng lại | WebGPU | 2,5 / 3,3 | 114 | 103 (giải phóng) |
| Bảng đóng / Tổng quan / B+C / đóng lại | WebGL2 | 3,0 / 3,9 · 2,8 / 3,8 · 2,9 / 3,7 · 3,4 / 4,4 | 114 | 103 / 105 / 105 / 103 |

Phần xem trước tự đo: 5 draw call, ~23 nghìn tam giác, ~1,8 MB VRAM (ước tính), trung bình ~0,3 ms CPU mỗi lần vẽ ở cả hai backend. Tổng tải đầu: 2,69 MB / 30 MB. Nằm gọn trong ngân sách (dưới 300 draw call, CPU dưới 8 ms).

## Tooltip (`ui/itemInfo.ts`, `ui/gear.ts`, `windows/common.tsx`)
- So sánh với món đang mặc cùng ô: ▲ xanh / ▼ đỏ từng chỉ số, dòng **Lực chiến +/−** (tính cả linh căn và bộ).
- **Nguồn** (quái rơi, nơi chế, nơi rèn, cửa hàng) và **Dùng để** (chế món nào, cường hóa, Thăng Bậc, khảm ngọc) suy từ dữ liệu. Nguồn rơi lấy từ `packages/content/data/itemsources.json`, sinh bằng `pnpm --filter @dtl/content sources:build` từ bảng rơi của server, chỉ có id quái, không có tỉ lệ (client vẫn không biết `loot.json`); `content:check` báo lỗi nếu tệp cũ.
- Gợi ý: "Có thể Thăng Bậc ở Thiết lão / Hứa lão", "Mặc thêm N món để kích hoạt hiệu ứng bộ", món đang khóa, chưa đủ cấp (chữ đỏ).
- Hàm chung cho ô túi: `isUpgrade(level, equip, item, root)` (mũi tên xanh "tốt hơn"), `belowLevel`, `powerDelta` trong `gear.ts`.
- HUD: `BagWarn.tsx`, "Túi trữ vật chỉ còn N ô trống" khi còn ≤ 10 ô, bấm để mở túi.

## Ảnh
`1280x720-*` và `1920x1080-*` (JPG ≤ 1600 px): `char-tong-quan`, `char-va-tui` (B+C cạnh nhau), `xem-truoc-xoay`, `tooltip-so-sanh`, `char-do-kiep`, `char-thuoc-tinh`, `char-thuoc-tinh-tooltip`, `char-bo-tu-luyen`, `hud-canh-bao-tui`.
