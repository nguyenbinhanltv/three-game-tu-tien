# MAP-5 "Ngũ Cảnh Thiên Địa" — Bắc Hoang

Tái thiết kế mỹ thuật Bắc Hoang Tẫn Nguyên (level `bac_hoang`, chương 5 Dị Vực), phong cách B (bán tả thực, điện ảnh, PBR). Bảng màu mới: **tuyết trắng + đen + tím độc**. Chia nhiều PR:

1. **Ánh sáng và màu (PR này)**: mood bốn thời điểm, đất tuyết, bão tuyết nhẹ, khe nứt tím.
2. Kit + địa hình + điểm wow: băng nguyên mỏng, khe nứt dị vực phát sáng tím xé đất, xác cự thú cổ đại, cực quang, cột tà trận tím, texture PBR.

## PR 1: ánh sáng và màu

- Preset `bh_dawn|bh_day|bh_dusk|bh_night` (nửa nam, bên này khe: tuyết lam-trắng, nắng thấp hồng nhạt, đêm cực quang) và `bhr_*` (bên kia khe: tím độc, sương tím, bóng đen) trong `assets/palette.json` (`grading.presets`). `bac_hoang.assets.json` có `mood: bh_dawn`; `?mood=dawn|day|dusk|night` đổi thời điểm. Sân độ kiếp `do_kiep_bac_hoang` dùng `bhr_dusk`.
- `updateRiftMood` (`game/engine/levelLoad.ts`) trộn `bh_<giờ>` ↔ `bhr_<giờ>` theo vị trí (`riftBlend`) như trước, nhưng theo thời điểm hiện tại (`bhTod`). Preset cũ `ash_dawn`/`rift` giữ nguyên cho level khác (`rift_pit` của Xích Tẫn Khích).
- Đất: `bhGroundColor` (`game/world/bacHoangArt.ts`) đổi sang tuyết trắng ngả lam, đá đen lộ trên sườn dốc/gió quét, bên kia khe tím sậm, mạng nứt tím. Texture `terrain-ash` vẫn nhân bên dưới (texture tuyết PBR ở PR 2).
- Hạt: `ash` thành bông tuyết rơi nghiêng theo gió, `ember` thành tàn sáng tím (chỉ ở Bắc Hoang + sân kiếp; phó bản khác giữ nguyên).
- `render/riftVeil.ts`: tùy chọn `violet` đổi chân màn khe từ than hồng sang tím (Bắc Hoang dùng, Xích Tẫn Khích giữ than hồng).
- Chụp ảnh: `pnpm shots bachoang --out <thư mục tuyệt đối> [--tag truoc|sau] [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views tram,khich,khoc,tragioi,trencao,phongbac|all] [--perf 1] [--video 1]`. Bản "trước": chạy cùng kịch bản với mã cũ (main chưa có `dusk`/giờ riêng nên chỉ có một ảnh mỗi góc).

Ảnh/video duyệt PR để ở artifact phiên (không commit).
