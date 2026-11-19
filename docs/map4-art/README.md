# MAP-4 "Ngự Cảnh Thiên Địa" — Thiên Khuyết Cổ Thành

Tái thiết kế mỹ thuật chương 4 (`thien_khuyet`) theo phong cách B (bản tả thực, điện ảnh, PBR), mẫu là Lạc Kiếm Tông (`docs/map1-art/README.md`). Bảng màu: **tím + vàng kim**. Điểm wow: tiên cung đổ nát lơ lửng trên trời, bậc thang lên trời dẫn tới cổng tiên vỡ, tượng thần khổng lồ gãy đổ, cột ngọc vỡ, mảnh đá trời, hoàng hôn tím-vàng, trận pháp cổ phát sáng.

## PR 1: ánh sáng và màu

- `assets/palette.json`: bốn preset `tk_dawn` / `tk` (ngày) / `tk_dusk` / `tk_night` (trời tím, nắng vàng kim, bóng tím đậm, sương tím nhạt mỏng hơn bản cũ). `thien_khuyet` mặc định `tk_dusk`; `?mood=dawn|day|dusk|night` đổi. Thần Tàng Điện vẫn `tk_night` (cùng bảng màu).
- `tk_dusk` được thêm ở: `render/grading.ts` (`moodVariant`), `sky.ts` (màu đỉnh trời), `atmosphere.ts` (quầng đèn, cột linh quang), `engine/common.ts` (đèn thật), `godRays.ts`, `content/check.ts`.
- Tia sáng xuyên mây (`godRays` trong `thien_khuyet.assets.json`).
- Kịch bản chụp: `pnpm shots thienkhuyet --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p, camera tự do cần `?debug=1`).
- Chưa làm (PR 2): địa hình/vành vách núi, kiến trúc, điểm wow.

Ảnh/video duyệt PR để ở artifact phiên (không commit).

## PR 2: cảnh trên trời + điểm wow

- Dữ liệu `thienKhuyetSky` (`ThienKhuyetSky` ở `packages/shared/src/types.ts`) trong `levels/thien_khuyet.assets.json`: 5 đảo (`cong_tien` = bệ Cổng Tiên Vỡ, 4 `cung` = tiên cung đổ nát), bậc thang xoắn 1,35 vòng quanh quảng trường (z 374) từ mặt đất lên bệ cổng, tượng thần đổ, trận pháp, số mảnh đá trời và cột ngọc vỡ.
- Client dựng ở `game/world/thienKhuyetSky.ts` (`ThienKhuyetSkyScene`, nối ở `engine/levelLoad.ts`, cập nhật ở `engine/frameLoop.ts`). Mesh vát cạnh (`RoundedBoxGeometry`) và cột lathe có entasis, gãy lởm chởm theo nhiễu; thân đảo pháp tuyến mượt; vật liệu đá nhân nhiễu ba mặt phẳng theo toạ độ thế giới; vàng kim là vật liệu kim loại riêng; ngọc/trận pháp/màn cổng là TSL cộng sáng. Tất định (không `Math.random`).
- Điểm wow: Cổng Tiên Vỡ (hai cột khổng lồ một gãy, xà đổ viền vàng, màn sáng vàng-tím rách mép, vòng tiên môn gãy phía sau); bậc thang xoắn có lan can gãy và đèn ngọc tím; tiên cung trôi (nền ba bậc, cột góc gãy, mái ngói tím nứt, vòm gãy); tượng thần võ sĩ gãy đổ cạnh đại đao cắm nghiêng; cột ngọc vỡ dọc đại lộ; 90 mảnh đá trời; trận pháp vàng kim xoay trên quảng trường.
- Màu mặt đất (`thienKhuyetArt.ts`): nền tím xám, vách tím đậm có vỉa vàng kim.
- Chỉ để nhìn: **không** đổi va chạm, điểm hồi sinh, NPC, cổng truyền tống, đường đi, vùng quái, nhiệm vụ. Bậc thang không đi bộ được.
- Đo (preset Cao, 1080p, cả 4 thời điểm × 9 góc): draw call đỉnh 96 → 110, tam giác đỉnh 246k → 1,09 triệu, khung 10,4 → 11,3 ms (Chrome headless, nhiễu đo ~1 ms); trong ngân sách 300 draw call / 1–2 triệu tam giác. Thêm +8 draw call cố định cho cảnh này, không tải thêm file (hình học dựng lúc chạy).
- Chưa làm (việc tiếp): texture PBR bake từ Blender/Poly Haven cho kiến trúc (hiện chỉ vật liệu theo màu đỉnh + nhiễu), kit Blender riêng cho Thiên Khuyết, tượng thần chi tiết hơn (đang ghép khối), LOD cho cảnh trời, vách núi bao quanh sân vẫn là một mặt dốc đều (cần dựng lại `thien_khuyet.terrain.json`), đảo đi bộ được, phông xa riêng.
