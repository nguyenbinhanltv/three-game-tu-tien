# TD-B: khung nhiều cửa sổ và túi đồ mới

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/td-b/<file>`.

Kế hoạch: `ke-hoach-tui-do-nhan-vat.md` mục B. Phần giao thức (INV_SORT/INV_LOCK/INV_SPLIT, 120 ô, `itemCategory`) là gói TD-A.

## Khung cửa sổ (`apps/client/src/ui/windows/`)

- `useUI.panel` (một giá trị) → `useUI.windows: {id, x, y, z}[]`. Hàm trong `ui/store.ts`: `openPanel`, `closePanel`, `togglePanel`, `focusPanel`, `movePanel`, `closeTopPanel`, `closeAllPanels`.
- `windows/layout.ts`: hàm thuần (đặt, kẹp màn hình, ghép đôi, nhớ vị trí `localStorage dtl.win.<id>`), test ở `layout.test.ts`. Tọa độ theo đơn vị thiết kế (bên trong `zoom: var(--ui-scale)`); bản đồ lớn không phóng (`panelScale`).
- `windows/Panels.tsx`: `WindowHost` đặt cửa sổ theo `{x,y,z}`, bấm vào thì lên trên cùng, kéo thanh tiêu đề (`.k-head`) để dời, thả thì lưu vị trí. Nội dung bảng vẫn là `PanelWindow` cũ (CSS `.win-host > .k-window` bỏ định vị giữa màn hình).
- Esc đóng cửa sổ trên cùng (`Game` phím `cancel`). Mở B khi C đang mở (và ngược lại): nhân vật bên trái, túi bên phải, cùng mép trên, không chồng ở 1280×720 và 1920×1080. Cửa sổ khác chồng nhau thì xếp bậc thang 28 px.
- Con trỏ chuột tự thả khi có ≥ 1 cửa sổ mở (như trước với `panel`).

## Tách `Panels.tsx`

| Cũ | Mới |
| --- | --- |
| `Panels.tsx` Bag | `ui/bag/Bag.tsx` (+ `model.ts`, `dnd.ts`, `bag.css`) |
| Character, EquipBoard, SetBoard | `ui/character/Character.tsx` (hành vi giữ nguyên; thêm ô thả trang bị) |
| Quests, Help, Settings | `ui/windows/Quests.tsx`, `Help.tsx`, `Settings.tsx` |
| ItemIcon, ItemDetail, ItemTip, statLines, RewardLine, Window | `ui/windows/common.tsx` |

Hàng 8 ô trang bị không còn trong túi (đã có ở bảng Nhân vật).

## Túi đồ mới

- Tab Tất cả / Trang bị / Đan dược / Nguyên liệu / Nhiệm vụ / Khác (`itemCategory` của shared), ô tìm theo tên (không phân biệt dấu), lọc theo phẩm. **Chỉ lọc hiển thị**: ô không khớp mờ đi, vị trí không đổi (test ở `bag/model.test.ts`).
- Nút Sắp xếp gửi `C.INV_SORT`; đếm `dùng/120`; 4 nút trang (số đồ mỗi trang), ô có viền phẩm, số lượng, chấm "mới" (nhặt thêm, tắt khi rê chuột), ổ khóa.
- Kéo thả: ô ↔ ô (`MOVE_ITEM`), thả lên số trang (ô trống đầu của trang), thả lên ô trang bị ở bảng Nhân vật (mặc; ô hợp loại sáng viền khi đang kéo), Shift+kéo hoặc nút "Tách chồng" (hộp hỏi số lượng → `INV_SPLIT`), Ctrl+click khóa (`INV_LOCK`), chuột phải dùng/mặc.
- Quyết định thả nằm ở hàm thuần `planDrop` (`bag/model.ts`). Chữ qua i18n (`ui.bag.*`).

## Kiểm

`pnpm shots:tdb --out <thư mục> [--size 1280x720]` (cần server có TD-A): tự kiểm 20 điều (B+C không chồng, kéo tiêu đề + lưu vị trí, Esc, tab, tìm, sắp xếp, kéo ô/trang/ô trang bị, tách, khóa) và chụp ảnh. Ảnh trong thư mục này: `*-1280x720.webp`, `*-1920x1080.webp`.

Ghi chú: Chromium headless không bắt đầu kéo khi Shift đã giữ từ lúc nhấn chuột, nên kịch bản nhấn Shift ngay trước khi thả; client đọc Shift cả lúc bắt đầu kéo lẫn lúc thả.

Đo: `pnpm size` 2,68 MB / 30 MB; `pnpm bench:client` đạt cả 18 ô, draw call sân tông môn 92/124/149 (thấp/vừa/cao) như trước (bảng là DOM, không thêm draw call 3D).

## Ảnh then chốt

- [`01-bag-1280x720.webp`](01-bag-1280x720.webp)
- [`01-bag-1920x1080.webp`](01-bag-1920x1080.webp)
- [`02-bag-char-1920x1080.webp`](02-bag-char-1920x1080.webp)
- [`06-tim-kiem-1920x1080.webp`](06-tim-kiem-1920x1080.webp)
- [`09-keo-tha-o-1920x1080.webp`](09-keo-tha-o-1920x1080.webp)
