# Mẹo dựng khối: kiến trúc, vật cứng, hữu cơ, thủ tục

Nguồn ý tưởng: `hard-surface`, `procedural-modeling`, `sculpting` (blender-skills, MIT, xem `assets/LICENSES.md`), viết lại cho dự án: script bpy nền qua `tools/blender/run.mjs`, không GUI, không Blender MCP, không Geometry Nodes bắt buộc (bộ kit hiện dùng bpy/bmesh thuần, có seed).

## Dựng, nặn hay bake?

| Việc | Làm thế nào ở dự án này |
| --- | --- |
| Kiến trúc, bậc, cột, mái, bệ | **Dựng thủ tục** (bpy), theo kit mô-đun (`thien_cong_kit.py`) |
| Hữu cơ lớn có thể đọc được (tượng, rễ, đá nứt) | Dựng thủ tục liền khối (mục "Hữu cơ" dưới) hoặc Tripo nếu cần mặt/tay chi tiết |
| Nhân vật, quái, boss, prop chi tiết | Tripo (`docs/tripo-runbook.md`); **không nặn tay, không sculpt trong game** |
| Chi tiết mịn (nứt, mòn, lỗ chân lông) | texture/normal map (`render/` TSL), không thêm tam giác |
| Vật phẳng xa tầm nhìn | impostor hoặc bỏ hẳn; đừng thêm hình học |

Nhận định từ `sculpting`: chi tiết tần số cao nên **chuyển sang texture** (bake normal), không thêm hình học; dyntopo không bao giờ là bản cuối; mọi chi tiết phải hợp **khoảng cách camera** (camera chơi ở xa, nên một vết khắc nhỏ hơn vài cm là phí).

## Kiến trúc và vật cứng (cổ phong)

"Lý lẽ chế tạo" của vật cứng khoa học-viễn-tưởng đổi thành **lý lẽ kết cấu cổ phong**: mọi đường cắt nằm ở chỗ có thật (cột–xà, đấu củng, bậc, mộng, giáp nối ngói), không ốp mảng cho đẹp.

- **Thứ tự tầng**: (1) khối chính, silhouette đọc được từ xa; (2) nhịp cắt (gờ, bậc, hõm, vát); (3) chi tiết nhỏ (ngói, đinh, họa tiết); (4) vi mô để cho texture. Kiểm silhouette mỗi **45°** quanh vật.
- **Phá góc 90°**: dùng vát/bo (bevel) hoặc ống thay cho hộp trần. Mức vát theo tầng, **không vát đều toàn lưới**: cạnh chính 0,5–2 cm cho vật cỡ người, rãnh 0,1–0,3 cm, vi mô để cho normal map. Chỉnh theo cỡ mét của asset.
- **Thứ tự modifier**: Mirror → Boolean → Bevel → Weighted Normal (bevel trước boolean thì boolean phá vát). Giữ modifier còn sống trong lúc dựng, **áp hết khi xuất**.
- **Boolean**: dùng solver chính xác; cutter có tên (`cutter_<đặc điểm>`), dài vượt hai đầu vật bị cắt, đã áp scale, đặt riêng một collection **không xuất**; gộp nhiều cutter bằng một lần Union rồi mới Difference. Tránh boolean trên mặt cong chưa đủ chia lưới. Lỗi thường gặp: mặt trùng (z-fighting) → hàn đỉnh; mặt mất → cutter chưa đủ xuyên/pháp tuyến ngược; vệt shading → Weighted Normal + đánh dấu cạnh sắc.
- **Cạnh sắc**: đánh dấu cạnh sắc hoặc trọng số bevel; Weighted Normal bật Keep Sharp (góc ~30°). API làm trơn tự động đã đổi giữa các bản Blender (máy đang dùng 5.3): kiểm thuộc tính có sẵn trước khi gán, đừng hard-code.
- **Lặp mảnh (ngói, đinh, lan can)**: dựng một mảnh mẫu, **nhân bằng instance/mảng**, đừng mô hình độc nhất (trừ mảnh chủ đạo). Rải đinh/họa tiết nhỏ **xoay quanh pháp tuyến mặt**, mật độ dày ở nơi camera chơi nhìn gần, và tắt ở LOD thấp. Greeble không được chiếm phần lớn tam giác.
- Ngân sách: 76 mảnh kit tông môn đã có; thêm mảnh mới thì kiểm tổng tam giác `arch_*` trong `assets/budgets.json` trước khi thêm chi tiết nhỏ.

## Hữu cơ liền khối (không ghép primitive)

Rút từ tượng Thiên Khuyết (`tools/blender/thien_khuyet_arch.py`, MAP-DEBT 1) và `reference-match.md` của skill `blender-pipeline`:

- Tay, chân, ngón, rễ, dải: **một lưới liền** quét dọc đường cong (Catmull-Rom/Bezier) với bán kính đổi theo vị trí; đầu tròn hoặc gãy dẹt có nhiễu. **Mọi ống có nắp bán cầu kín**, không để lộ khe giữa các đoạn.
- Khối lớn bằng cầu/ellipsoid đủ mịn rồi **dịch đỉnh bằng nhiễu nhiều bậc** (lớn → nhỏ, cùng seed); hõm sâu ở nơi cần bóng (hốc mắt, nếp áo), gờ ở nơi cần sáng.
- Phong hóa: đổi màu theo độ cao/độ nghiêng/độ cong (đỉnh sáng hơn, hốc sẫm hơn) trong màu đỉnh hoặc shader; không thêm tam giác.
- Luôn kiểm ở **khoảng cách chơi** bằng `pnpm shots`, không ngắm cận trong Blender.

## Thủ tục có kiểm soát (seed, biên, hiện thực hóa)

- **Seed tường minh** cho mọi nhiễu/ngẫu nhiên (quy tắc chung của skill); không `random` không seed.
- **Thử ở biên**: giá trị nhỏ nhất/lớn nhất của kích thước, mật độ, độ nhiễu; và ít nhất ba seed (ví dụ 0, 42, 9999) để chắc kết quả lặp lại được và không có seed hỏng.
- Ghi **khoảng tham số hợp lệ** trong docstring script (min/max/mặc định) và số tam giác ở hai biên.
- **Hiện thực hóa** (áp modifier, realize instance) trước khi xuất GLB; sau đó qua `pnpm assets:build` và QA (`blender-pipeline/references/qa-checklist.md`).
- Có kế hoạch UV cho đầu ra thủ tục (tiền tố, trim sheet, hoặc dùng triplanar ở shader) trước khi viết sinh; đừng để UV là thứ làm sau.
- Mỗi biến thể là một asset có id riêng hoặc tham số của `meta.json`; không "vô hạn biến thể" mà chưa đo hiệu năng và draw call.
- Đá/vách rải theo khu: phối hợp với `propScatter.ts` (mật độ theo vùng) thay vì dựng một cảnh khổng lồ.
