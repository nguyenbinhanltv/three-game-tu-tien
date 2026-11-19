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

## PR 2: điểm wow + vật liệu PBR

- **Texture PBR tuyết/đá**: bộ `terrain-snow` (`pnpm assets:terrain --set snow`, Poly Haven CC0: `snow_02/03/04/05`, `snow_field_aerial`, `dark_rock`, `rock_wall_08`, `volcanic_rock_tiles`; albedo + pháp tuyến + độ nhám WebP 1K, ~2,5 MB nạp lười khi vào level). `bac_hoang.assets.json` `ground.set`; phá lặp texture bật cho Bắc Hoang. Sân độ kiếp `do_kiep_bac_hoang` giữ bộ `terrain-ash`.
- `game/world/bhWonders.ts` (1 lớp `BhWonders`, chỉ để nhìn, không va chạm, vị trí tất định): xác cự thú cổ đại (4 cá thể, `InstancedMesh`, cột sống + xương sườn vòm + sọ sừng/răng, dựng bằng ống/ellipsoid mượt, vật liệu xương PBR nhám), cột tà trận ở các bia Trấn Giới Đài (trụ đá đen + 3 vòng phù văn tím TSL), tinh thể băng dọc mép khe (PBR bóng, ánh tím), mạng vết nứt dị vực phát sáng tím bám địa hình (một dải ribbon, TSL).
- `render/aurora.ts`: cực quang ba rèm cong ở chân trời bắc (1 draw call, cộng sáng, bám camera), cường độ theo thời điểm (`AURORA_BY_TOD`: đêm 1, hoàng hôn 0,55, bình minh 0,25, ngày tắt), ngả tím bên kia khe. Preset thấp không dựng cực quang và giảm tinh thể băng.
- Bão tuyết: hạt `ash` (bông tuyết) tăng mật độ 9 → 16.
- Chụp: thêm góc `xac` (xác cự thú) và `thu3` vào `pnpm shots bachoang`; góc `rel` đo cao độ tương đối mặt đất.
- Không đổi địa hình/va chạm/gameplay: khe vẫn sâu như cũ (nền khe y=58 so với mặt 72); "vực sâu" là hiệu ứng phát sáng, không đào thêm.
