# MAP-4 "Ngự Cảnh Thiên Địa" — Thiên Khuyết Cổ Thành

Tái thiết kế mỹ thuật chương 4 (`thien_khuyet`) theo phong cách B (bản tả thực, điện ảnh, PBR), mẫu là Lạc Kiếm Tông (`docs/map1-art/README.md`). Bảng màu: **tím + vàng kim**. Điểm wow: tiên cung đổ nát lơ lửng trên trời, bậc thang lên trời dẫn tới cổng tiên vỡ, tượng thần khổng lồ gãy đổ, cột ngọc vỡ, mảnh đá trời, hoàng hôn tím-vàng, trận pháp cổ phát sáng.

## PR 1: ánh sáng và màu

- `assets/palette.json`: bốn preset `tk_dawn` / `tk` (ngày) / `tk_dusk` / `tk_night` (trời tím, nắng vàng kim, bóng tím đậm, sương tím nhạt mỏng hơn bản cũ). `thien_khuyet` mặc định `tk_dusk`; `?mood=dawn|day|dusk|night` đổi. Thần Tàng Điện vẫn `tk_night` (cùng bảng màu).
- `tk_dusk` được thêm ở: `render/grading.ts` (`moodVariant`), `sky.ts` (màu đỉnh trời), `atmosphere.ts` (quầng đèn, cột linh quang), `engine/common.ts` (đèn thật), `godRays.ts`, `content/check.ts`.
- Tia sáng xuyên mây (`godRays` trong `thien_khuyet.assets.json`).
- Kịch bản chụp: `pnpm shots thienkhuyet --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p, camera tự do cần `?debug=1`).
- Chưa làm (PR 2): địa hình/vành vách núi, kiến trúc, điểm wow.

Ảnh/video duyệt PR để ở artifact phiên (không commit).
