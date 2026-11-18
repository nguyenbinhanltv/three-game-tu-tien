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
- Hiệu năng (preset Cao, 1080p, 6 góc × 4 thời điểm): draw call +1…+3 so với main, tam giác không đổi, khung 8–9 ms (đỉnh lẻ 13–17 ms là nhiễu đo, không lặp lại ở góc đó).

Ảnh/video duyệt PR để ở artifact phiên (không commit).

## PR 2: kit Blender "Thiên Công Khai Vật" + Lạc Kiếm Tông mới

- `tools/blender/thien_cong_kit.py`: 76 mảnh đăng ký bằng `@part(id, nhóm)` (nền, cột, đấu củng, mái, lan can, tường/cửa, cầu, công trình, ~20 prop), vật liệu mới: ngọc trắng có vân mây/mạch (`jade`), ngói lưu ly lục ngọc (khóa `tile`, bóng hơn), cột sơn mai son, đồng/vàng (`metal`), trắng mây (tường). Rêu đóng ở chân và mặt ngửa, mép đá/ngọc vát (bevel 3,5 cm).
- `tools/blender/thien_cong_sect.py`: ghép mảnh thành tông môn (`pnpm assets:build --only arch_sect`; job `arch_sect` ở `run.mjs`): đại lộ ngọc + vòng bát quái quanh cự kiếm, chính điện hai tầng mái trên nền ba bậc, hai lầu hai tầng + hành lang, tháp Kiếm bảy tầng, hai đình lục giác, sơn môn tam quan, hai cổng phụ, tường rào, prop sân (bia, trụ phù văn, trống chuông, ván cờ, ghế đá, phướn, vại nước, chậu cây). Chế độ `kit` xuất lưới mảnh để duyệt. Toạ độ `arch_sect` giữ nguyên; va chạm thêm 5 vòng ở `COLLIDERS` (hai lầu, tháp, hai bia); `map:report` 0 chỗ kẹt.
- `tools/blender/thien_cong_preview.py`: ảnh xem trước 4 góc 360° mỗi mảnh và 6 góc tông môn bằng Cycles (không cần GPU).
- Số đo: `arch_sect` 74,6k tam giác, 1,35 MB sau meshopt/KTX2 (trước: 10k tam giác, 192 KB); 9 vật liệu, không có LOD (lớp `arch` không dùng LOD).
- Chưa làm ở PR này: bake vật liệu ra texture Codex cho chi tiết chạm khắc, ba LOD, công cụ đặt cảnh từ "bố cục khu". Núi trời nổi, cầu mây, thác, Kiếm Đài, mặt đất nhiều lớp, phông xa: PR 3.
