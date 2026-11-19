# MAP-4 "Ngự Cảnh Thiên Địa" — Thiên Khuyết Cổ Thành

Tái thiết kế mỹ thuật chương 4 (`thien_khuyet`) theo phong cách B (bản tả thực, điện ảnh, PBR), mẫu là Lạc Kiếm Tông (`docs/map1-art/README.md`). Bảng màu: **tím + vàng kim**. Điểm wow: tiên cung đổ nát lơ lửng trên trời, bậc thang lên trời dẫn tới cổng tiên vỡ, tượng thần khổng lồ gãy đổ, cột ngọc vỡ, mảnh đá trời, hoàng hôn tím-vàng, trận pháp cổ phát sáng.

## PR 1: ánh sáng và màu

- `assets/palette.json`: bốn preset `tk_dawn` / `tk` (ngày) / `tk_dusk` / `tk_night` (trời tím, nắng vàng kim, bóng tím đậm, sương tím nhạt mỏng hơn bản cũ). `thien_khuyet` mặc định `tk_dusk`; `?mood=dawn|day|dusk|night` đổi. Thần Tàng Điện vẫn `tk_night` (cùng bảng màu).
- `tk_dusk` được thêm ở: `render/grading.ts` (`moodVariant`), `sky.ts` (màu đỉnh trời), `atmosphere.ts` (quầng đèn, cột linh quang), `engine/common.ts` (đèn thật), `godRays.ts`, `content/check.ts`.
- Tia sáng xuyên mây (`godRays` trong `thien_khuyet.assets.json`).
- Kịch bản chụp: `pnpm shots thienkhuyet --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p, camera tự do cần `?debug=1`).
- Chưa làm (PR 2): địa hình/vành vách núi, kiến trúc, điểm wow.

Ảnh/video duyệt PR để ở artifact phiên (không commit).

## PR 2: cảnh trên trời + điểm wow (bản làm lại theo phong cách B)

Phản hồi duyệt lần 1: cả cảnh nhuộm một màu tím, kiến trúc là khối primitive, cột kiểu Hy Lạp, vòng đồng đơn điệu, tượng thần mờ, mặt đất đơn sắc. Bản này:

- **Kiến trúc là GLB Blender** `arch_thien_khuyet` (`tools/blender/thien_khuyet_arch.py`, job trong `tools/blender/run.mjs`, `pnpm assets:build --only arch_thien_khuyet`), dựng từ bộ kit #296 (`thien_cong_kit.py`) với bảng màu riêng: ngọc trắng ngà, ngói lưu ly vàng + sống mái tím, cột son, vàng kim, vết nứt phát sáng vàng. Gốc toạ độ = tâm quảng trường Điện Tiền; dữ liệu từ `thienKhuyetSky` trong `thien_khuyet.assets.json`.
  - Bậc thang xoắn 1,35 vòng, làm lại thành thang nhỏ: bậc cao ~0,2 m, rộng 4,2 m, bước 1,1 m (~1000 bậc), chia thành các đoạn treo 64 bậc, giữa các đoạn có khe vỡ với mảnh trôi; lan can ngọc chạy dọc hai bên (kit `balustrade`, bỏ ~8% đoạn cho gãy), trụ ngọc ở đầu mỗi đoạn, đèn đá, đáy đá thô thon như thuyền và nhũ đá. Bỏ mọi bậc thấp hơn `MIN_Y` = 18 m để chân thang không chắn lối đi.
  - Cổng Tiên Vỡ: hai cột rồng son khổng lồ (trái nguyên có đai vàng, phải gãy), mái lưu ly vàng/tím trượt, hoành phi treo nghiêng, bia/trụ phù văn, mạch vàng nứt trên nền, mảnh vỡ trời trôi quanh (bỏ vành đồng).
  - 4 tiên cung đổ nát: nền ngọc, cột son đầu củng (hàng sau gãy), mái hip lưu ly vàng trượt khỏi cột, mái rơi, sư tử đá đổ, lan can gãy.
  - Cột son/đầu củng/cột rồng dọc đại lộ (gãy, đứng, đổ, có đèn đá): vị trí và độ cao đất thật `y` sinh bằng `tools/perf/src/tk-pillars.ts` (`terrainOf(...).heightAt`, tránh trại/điểm) và ghi vào `thienKhuyetSky.pillars`; cột nướng vào GLB nên cần `y` có sẵn (địa hình tự nhiên lệch tới +10 m so với mặt quảng trường), chân bệ chìm 0,6 m.
  - Tượng thần tướng đổ ngửa (`tk_statue`, lưới điêu khắc procedural trong `thien_khuyet_arch.py`: mặt cầu/ống chia nhỏ + nhiễu 3D + nếp giáp lá, không dùng khối hộp): ngực giáp lá xếp tầng, vai giáp ba lớp, đai lưng và mào mũ vàng kim, mặt có sống mũi/khe mắt, hộ nhĩ, giáp váy, hai tay (cánh tay phải gãy cụt, cẳng tay rời), kiếm cổ phong (jian: lưỡi thẳng hai lưỡi có sống, hộ thủ đĩa vàng, chuôi quấn dây, tua đỏ) cắm xiên bên cạnh; vật liệu cam thạch nứt vỡ, rêu phủ mặt ngửa, nứt phát sáng vàng. Client hạ theo độ cao đất (`loadTkModel`).
- Client (`game/world/thienKhuyetSky.ts`): thân đảo đá xám ấm phân tầng + rêu + cây xanh + nhũ đá, màn sáng cổng, trận pháp, mảnh đá trời. Đá trung tính (không tím).
- Giảm tím toàn cảnh: tím chỉ ở trời/sương/ánh hoàng hôn; mặt đất đá xám ấm + rêu xanh, vách xám nâu có vỉa vàng (`thienKhuyetArt.ts`); `skyColor`/`shadowTint` của `tk_*` bớt bão hòa, `shadowAmount` 0,3.
- **Va chạm/lối đi (phản hồi review):** thang và tượng không có va chạm nên không được nằm trên lối đi. (1) Chân thang (u = 0) rơi đúng đại lộ và điểm `den_troi_8`, nên script Blender bỏ mọi bậc thấp hơn `MIN_Y` = 18 m so với mặt quảng trường (`thien_khuyet_arch.py`): thang bắt đầu lơ lửng trên tầm đầu người, người chơi đi qua bên dưới; `a0`/`r0`/`y0` trong JSON giữ nguyên (client không còn hàm `stairPoint`, nên không còn test cho nó). (2) Tượng thần (v5) đặt ở dải phía tây đại lộ, chân tượng (730, 490), `yaw` 1,5708 (thân nằm đông–tây tới x ≈ 930), `size` 160 (dài ~200 m): quét lưới 20 m theo `camps`/`pois`/`spots`/`nodes`/`portals`/`spawns` (+ đại lộ và quảng trường) cho chỗ có nền chênh cao nhỏ nhất (~5 m) và cách mọi trại/điểm ≥ 20 m, thay vị trí cũ (1400, 440) chật giữa các trại: quét `camps`/`pois`/`spots`/`nodes`/`portals`/`spawns` trong `levels/thien_khuyet.json` thì chỗ này cách trại gần nhất (404 và 264 theo z, bán kính + 15 m) hơn 60 m, ngoài hành lang đại lộ và quảng trường. Không thêm collider; quái tuần tra trong bán kính trại nên không chạm khối đá.
- Chỉ để nhìn: không đổi va chạm, hồi sinh, NPC, cổng, đường đi, vùng quái, nhiệm vụ.
- Đo (preset Cao, 1080p, 4 thời điểm × 10 góc): draw call đỉnh 96 → 138, tam giác đỉnh 246k → 892k, khung 10,4 → 12,2 ms (nhiễu đo ~1 ms; góc nhìn cả cảnh). GLB 4,9 MB (24 MB thô, 272k tam giác, dưới trần 300k của lớp `arch`).
- Chưa làm: phông xa (dãy núi mây xa có vân đá + mây cuộn thay vách phẳng, chia PR sau), texture PBR bake riêng (kit dùng texture thủ tục 256 px + màu đỉnh), vách núi bao quanh sân vẫn là một mặt dốc (cần dựng lại `thien_khuyet.terrain.json`), tượng thần chưa có texture chạm khắc (chỉ lưới + màu đỉnh), LOD cho GLB, cây chỉ là tán tròn trên đảo.
