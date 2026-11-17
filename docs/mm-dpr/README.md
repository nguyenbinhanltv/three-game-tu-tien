# Minimap theo DPR và cỡ màn (UI)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/mm-dpr/<file>`.

Lỗi: minimap nằm ngoài vùng `zoom: var(--ui-scale)` nên ở 1440p/4K vẫn 176 px CSS, buffer chỉ `SIZE*min(2,dpr)`; tọa độ chuột cũng không chia hệ số.
Sửa: `.right-col > .minimap-wrap` phóng theo `--ui-scale`; buffer canvas = DPR x ui-scale (`backingScale`, làm tròn lên 0,25, trần 4), cấp lại khi đổi cỡ cửa sổ/DPR; chuột và tooltip chia `uiScale()`.

| Cỡ | trước (buffer / hiển thị CSS) | sau |
| --- | --- | --- |
| 1080p | 176 / 176 | 176 / 176 |
| 1440p (x1,35) | 176 / 176 | 264 / 238 |
| 4K (x2) | 176 / 176 | 352 / 352 |
| 1080p @2x | 352 / 176 | 352 / 176 |

Ảnh: `minimap-truoc|sau-<cỡ>.png`. Chụp lại: `pnpm shots map --out <thư mục tuyệt đối> --variant truoc|sau`.
