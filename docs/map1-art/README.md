# MAP-1 "Ngự Cảnh Thiên Địa" — Lạc Kiếm Tông

Tái thiết kế mỹ thuật Lạc Kiếm Tông (bản đồ `van_lam`). Chia nhiều PR:

1. **Ánh sáng và màu (PR này)**: bảng màu ngọc lục / trắng mây / mai son, bốn thời điểm riêng, tia sáng xuyên mây.
2. Kit Blender "Thiên Công Khai Vật" (kiến trúc mô-đun, prop tông môn).
3. Địa hình núi trời nổi, cầu mây, thác, Kiếm Đài, mặt đất nhiều lớp, phông xa.

## PR 1: ánh sáng và màu

- Preset `lk_dawn|lk_day|lk_dusk|lk_night` trong `assets/palette.json` (`grading.presets`). `van_lam` và `kiem_trung` có `mood: lk_day`; `?mood=dawn|day|dusk|night` đổi thời điểm. Level khác không có `dusk` riêng nên lấy sắc bình minh.
- Sương trắng-lam (`fogColor`) thay sương vàng-xám, mật độ thấp, `fogHaze` bậc một cho núi xa xếp lớp; nắng thấp hơn (bình minh 13°, hoàng hôn 8°) cho bóng dài; bóng nhuốm ngọc lam, vùng sáng ấm.
- `render/godRays.ts`: tia sáng xuyên mây, một `InstancedMesh` (+1 draw call), khai báo bằng `godRays` trong `*.assets.json` (`x, z, r, count`). Cường độ theo mood (`GOD_RAY_INTENSITY`): bình minh/hoàng hôn rõ, trưa nhẹ, đêm vệt trăng. Trục dải dựng dốc hơn hướng nắng (nắng thấp thì dải nằm ngang, trông như tấm phẳng).
- Chụp ảnh: `pnpm shots lackiem --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p). Muốn so "trước": chạy cùng lệnh ở bản main (nhưng main không có `dusk`).
- Hiệu năng (preset Cao, 1080p, 6 góc × 3 thời điểm): draw call +1…+3, tam giác không đổi, khung 8–9 ms như trước.

Ảnh/video duyệt PR để ở artifact phiên (không commit).
