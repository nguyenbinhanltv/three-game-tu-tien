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

- **Texture PBR tuyết/đá**: bộ `terrain-snow` (`pnpm assets:terrain --set snow`; albedo + pháp tuyến + độ nhám WebP 1K, ~1,3 MB nạp lười khi vào level). Năm lớp tuyết (bột, gờ gió sastrugi, vỏ băng nứt, đụn, tuyết lẫn sỏi) sinh thủ tục, liền mạch, trong `tools/asset-pipeline/src/terrain-textures.ts` (bộ `snow_*` của Poly Haven có dấu chân/vết bánh xe nên lặp ra chữ "F"/gạch, đã bỏ); đá `dark_rock`, vách `rock_wall_08`, lát `volcanic_rock_tiles` từ Poly Haven CC0. `bac_hoang.assets.json` `ground.set`; phá lặp texture bật cho Bắc Hoang. Sân độ kiếp `do_kiep_bac_hoang` giữ bộ `terrain-ash`.
- `game/world/bhWonders.ts` (1 lớp `BhWonders`, chỉ để nhìn, không va chạm, vị trí tất định): xác cự thú cổ đại (4 cá thể, `InstancedMesh`, cột sống + xương sườn vòm + sọ sừng/răng, dựng bằng ống/ellipsoid mượt, vật liệu xương PBR nhám), cột tà trận ở các bia Trấn Giới Đài (trụ đá đen + 3 vòng phù văn tím TSL), tinh thể băng dọc mép khe (PBR bóng, ánh tím), mạng vết nứt dị vực phát sáng tím bám địa hình (một dải ribbon, TSL).
- `render/aurora.ts`: cực quang ba rèm cong ở chân trời bắc (1 draw call, cộng sáng, bám camera), cường độ theo thời điểm (`AURORA_BY_TOD`: đêm 1, hoàng hôn 0,55, bình minh 0,25, ngày tắt), ngả tím bên kia khe. Preset thấp không dựng cực quang và giảm tinh thể băng.
- Bão tuyết: hạt `ash` (bông tuyết) tăng mật độ 9 → 16.
- Chụp: thêm góc `xac` (xác cự thú) và `thu3` vào `pnpm shots bachoang`; góc `rel` đo cao độ tương đối mặt đất.
- **Vực khe sâu thật** (vòng chỉnh theo duyệt PR2): nền khe hạ y 58 → 38 (mặt 72, sâu 34 m), `outerR` 56 → 46, nhấp nhô 5 m (`levels/bac_hoang.terrain.json` + `tools/maps/gen-bac-hoang.mjs`); khe còn 10 nút (z −190 → −460), 4 nút cuối khép dần về y 72 và dừng cách Trấn Giới Đài hơn 30 m để sân, bia `tran_gioi_bia_5` và cột tà trận vẫn phẳng ~72 m (có test); bac_hoang không `blockRise` nên không chặn đi lại, 56 test server qua; minimap dựng lại. Vách tối, ánh tím từ đáy hắt lên (`bhGroundColor`), tinh thể tím mọc từ vách (`wallCrystalSpots`, `InstancedMesh`, bloom), hai lớp sương tím cuộn ra (`mistMaterial`), băng và vết nứt như trước.
- **Xác cự thú làm lại**: đốt sống khối có gai thần kinh cao + mỏm ngang, xương sườn dày (gãy/thiếu), sọ có mào, hốc mắt, sừng có đai, hàm răng lởm chởm; màu đỉnh ngà ngả vàng, sứt mẻ theo nhiễu 3D, băng xanh và tuyết phủ mặt hướng lên (shader), chôn nửa dưới; cao 8–15 m.
- **Cực quang** lớn hơn (cung 180°, cao tới ~36° trên chân trời) và sáng hơn; góc chụp `cucquang`, `vuc`.

## Polish — Bắc Hoang: sương ngày, đêm Trấn Giới Đài, trại Dị Vực, tinh thể gradient

- **Sương ban ngày xa**: mood `bh_day` hạ `fogHaze` 0,0006 → 0,0004 và đẩy `fogHazeStart` 140 → 150, `fogDensity` 0,00042 → 0,00035; `bhr_day` (bên kia khe) 0,0009/80 → 0,0006/110, mật độ 0,0008 → 0,0007. Hạ thấp hơn nữa sẽ lộ vách nền xa còn phẳng (mảng tím xám sau dải đồi), nên dừng ở mức này; vách nền xa cần làm riêng.
- **Đêm Trấn Giới Đài** (`bhr_night`, bên kia khe): bớt tím đặc — bão hòa 0,85 → 0,55, exposure 1,3 → 1,22, nắng/trời/sương xám ngả tím nhạt thay chàm, sương thưa hơn (0,00144 → 0,001), tương phản 1,25.
- **Trại Dị Vực**: Bắc Hoang trước đây không có nguồn sáng nào ở trại (đèn lồng chỉ lấy `prop_den_da`). Nay `levelLoad.ts` lấy `prop_den_long_troi` + `prop_tc_chan_dong_do_nat(_2)` làm điểm đèn: quầng ấm 4,2 m (`0xffb868`) và đèn điểm thật khi `q.lights` + WebGPU (hệ số theo mood `LANTERN_LIGHT[bh_*]` có sẵn).
- **Tinh thể** (`bhWonders.ts`): băng dọc mép khe và thạch anh tím mọc từ vách dùng màu đỉnh gradient (chân tối → mũi sáng) + vật liệu kiểu PROP-1 (lõi nóng ở mũi, fresnel viền cùng sắc, thân giữa sẫm) thay vật liệu một màu phẳng.
- **Ngân sách (Cao, 1080p)**: 166–244 draw call, ~0,63–0,78M tam giác. Console có 3 cảnh báo có sẵn (`toNonIndexed`, thiếu `normal`/`uv`) giống bản trước.
