# Minimap theo DPR và cỡ màn (UI)

Lỗi: minimap nằm ngoài vùng `zoom: var(--ui-scale)` nên ở 1440p/4K vẫn 176 px CSS, buffer chỉ `SIZE*min(2,dpr)`; tọa độ chuột cũng không chia hệ số.
Sửa: `.right-col > .minimap-wrap` phóng theo `--ui-scale`; buffer canvas = DPR x ui-scale (`backingScale`, làm tròn 0,25, trần 4), cấp lại khi đổi cỡ cửa sổ/DPR; chuột và tooltip chia `uiScale()`.

| Cỡ | trước (buffer / hiển thị CSS) | sau |
| --- | --- | --- |
| 1080p | 176 / 176 | 176 / 176 |
| 1440p (x1,35) | 176 / 176 | 220 / 238 |
| 4K (x2) | 176 / 176 | 352 / 352 |
| 1080p @2x | 352 / 176 | 352 / 176 |

Ảnh: `minimap-truoc|sau-<cỡ>.png`. Chụp lại: `pnpm --filter @dtl/perf shots:minimap --out <thư mục tuyệt đối> --variant truoc|sau`.
