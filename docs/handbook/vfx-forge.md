# Họa Pháp Lô (quy trình VFX: Codex vẽ, Claude dựng)

> V-P0 của kế hoạch Chân Cảnh. Sửa trang này khi đổi quy trình; đừng nối dòng vào CLAUDE.md. Hạ tầng timeline/shader ở `vfx-animation.md`.

## Bảy bước mỗi chiêu

1. **Thẻ chiêu**: `packages/content/data/vfx/cards/<skillId>.json` (schema `packages/shared/src/vfxcard.ts`, kiểm bằng `pnpm content:check`). Ghi ý tưởng, nguyên tố, ngôn ngữ hình khối, nhịp (anticipation/impact/linger ms), footprint ở camera chéo 52°, hướng tu (bảng màu lấy từ `paths.json`), `colorRole` (`own`; `warn` chỉ cho cảnh báo địch, đỏ/cam), telegraph, ngân sách (draw call ≤ 12, hạt ≤ 1.500, phủ màn hình ≤ 0,35, overdraw ≤ 6) và danh sách texture (`proc:<atlas>` hoặc id đã qua lò rèn).
2. **Concept đúng góc**: `pnpm shots vfxlab --skill <id> --out <thư mục>` cho ảnh nền `base-<size>.jpg` (cùng camera chéo, nhân vật + hình nộm). Rồi `pnpm vfx:forge concept --card <id> --shot <base.jpg> [--ref <ảnh mẫu đã duyệt>] --out <thư mục ngoài repo>` gọi Codex (image-to-image) vẽ lưới 2×2: dồn lực, va chạm, +150 ms, tan. Thêm `--dry` để chỉ in prompt.
3. **Bộ texture**: `pnpm vfx:forge texture --card <id> --kind flipbook|slash|decal|noise|ramp --name <tên> [--grid 4x4] [--ref ...] --out <thư mục ngoài repo>`. Flipbook/vệt chém nền đen thuần, decal nhìn thẳng từ trên, noise lát được, ramp 3 tông.
4. **Lò rèn**: `pnpm vfx:forge import <ảnh> --id <id> [--pack color|packed] [--grid auto|4x4|8x8] [--erode <ảnh xám>] [--distort <ảnh xám>] --sheets <thư mục ngoài repo>`. Tách alpha từ độ sáng (nền đen) hoặc alpha sẵn, cân sáng, khử viền, dò lưới, `packed` đóng kênh R mặt nạ / G ăn mòn / B méo, xuất KTX2 + mip vào `apps/client/public/assets/vfx/` cùng `manifest.json` (nguồn: "Codex-generated, dự án sở hữu") và contact sheet để duyệt. Cần `toktx` (KTX-Software; biến `TOKTX` hoặc cài mặc định); thiếu thì ra PNG kèm cảnh báo và `pnpm vfx:check` (nằm trong `content:check`) chặn PNG vào repo.
5. **Dựng timeline** `packages/content/data/fx/<id>.json` theo thẻ (xem `vfx-animation.md`).
6. **Phòng thử** `pnpm shots vfxlab --skill <id> --out <thư mục> [--dummies 1..5] [--concept <ảnh>] [--sizes 720p,1080p] [--at 0,30,150,400]`: dùng game thật với `?vfxlab=1` (chỉ dev), tạm dừng và tua từng 10 ms để chụp 0/+30/+150/+400 ms sau khung trúng ở 720p + 1080p, dải 4 khung, concept cạnh khung +30 ms, đồng hồ ngân sách (draw call, hạt, phủ màn hình/overdraw ước lượng, phủ điểm ảnh) và đối chiếu thẻ chiêu. API console: `__vfxlab.cast(id) / pause(on) / scale(0.25) / step(ms) / budget()`.
7. **Cổng duyệt**: concept (orchestrator duyệt; ba chiêu pilot đầu cho người dùng duyệt), ảnh trong game so concept, hiệu năng (`perf-budget`).

## Bảng phong cách

`tools/vfx-forge/style-sheet.json`: ramp ba tông (lõi tối 15–25%, thân 50–60%, viền sáng 10–20%), nét không mảnh hơn 3% khung, tương phản lõi/viền ≥ 4:1, nền đen thuần cho flipbook, cấm đỏ/cam. Script đưa bảng này, bảng màu hướng tu và phối cảnh camera chéo vào MỌI prompt; luôn đính ảnh mẫu đã duyệt gần nhất bằng `--ref` để các chiêu cùng phong cách.

## Luật thứ bậc thị giác (runtime)

Chiêu của mình > cảnh báo địch > chiêu đồng đội (`fxHierarchy`: giảm 50% độ sáng và kích thước) > hào quang/môi trường. **Chế độ tĩnh** (Cài đặt) giảm đồng đội còn 25% và tắt khung va chạm.

## Khung va chạm

Sự kiện timeline `{ "type": "impact", "t": 0, "frames": 1|2, "tint": "ink|warm|cool" }`: 1–2 khung hậu kỳ tương phản cao ám màu (`render/post.ts`). Chỉ chiêu của mình, tắt được ở Cài đặt ("Khung va chạm"). Không có tint đỏ/cam.

## Ảnh ở đâu

Ảnh Codex, concept, contact sheet, ảnh phòng thử: artifact phiên hoặc `dtl-asset-source`, KHÔNG commit. Chỉ texture đã qua lò rèn (KTX2 + dòng nguồn trong manifest) vào repo.

## Việc còn mở

- Méo không khí (distortion pass) cần bản sao màn hình; làm khi có chiêu đầu cần tới.
- Phủ điểm ảnh của phòng thử gồm chuyển động của hình nộm; cần quái đứng yên (GM `freeze`) để số chính xác hơn.
- Shader đọc kênh G/B của texture đóng kênh chưa nối (V-P1 nối cùng chiêu pilot đầu tiên cần texture).
