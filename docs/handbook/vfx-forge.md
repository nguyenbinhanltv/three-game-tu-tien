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

## Chuẩn "Họa Pháp Lô 2" (người dùng duyệt 24/11)

Áp cho mọi chiêu/hiệu ứng mới và cho các đợt làm lại. Tám điều bắt buộc, và công cụ kiểm tự động phần đo được:

| # | Luật | Kiểm ở đâu |
| --- | --- | --- |
| 1 | Concept Codex trước khi dựng; ảnh so concept/game trong PR | quy trình (`forge concept`, prompt đã có đoạn "Standard 2") |
| 2 | Cấm khuôn chung (sao tỏa tia, vòng rune dưới chân, lưỡi liềm trơn) làm hình chính; mỗi chiêu một silhouette riêng | `content:check` → `checkStandard2`: thẻ `standard: 2` phải khai `silhouette`; timeline không được chỉ gồm hình khuôn chung hay rune + rune_ring2 làm chính |
| 3 | ≥ 1 lớp chất liệu (flipbook Codex, khói/hạt, vân nứt, distort) | thẻ khai `materials: [...]`, `checkStandard2` đối chiếu timeline có lớp đó thật |
| 4 | Đọc được cả nền sáng ngày lẫn đêm: lõi tối/ink hoặc viền đậm | `pnpm shots vfxlab` đo `darkShare` (≥ 0,12 điểm đổi tối hơn nền, chỉ ban ngày) |
| 5 | Ba nhịp: báo trước → trúng (+30 ms có điểm nhấn) → dư ba | `checkStandard2`: có sự kiện hình trước mốc trúng (nếu `anticipationMs` ≥ 150), quanh ±50 ms, và từ +150 ms |
| 6 | Đúng màu hướng tu, không đỏ/cam cho chiêu người chơi | `checkStandard2` chặn tông (`body/core/rim/accent/shadow`) của bảng hướng tu mà HSL là đỏ/cam; `vfxlab` đo `redShare` ≤ 3% |
| 7 | Ngân sách: phủ ≤ 0,2 (chiêu cuối ≤ 0,35), draw/hạt theo thẻ | `checkStandard2` + `vfxlab` (`overBudget`) |
| 8 | Ảnh duyệt 720p + 1080p, ngày + đêm, khung báo/0/+30/+150, clip chiêu cuối | `pnpm shots vfxlab --skill ... [--mood night] [--clip 1]` + `tools/vfx-forge/table.mjs` |

Bật kiểm cho một thẻ bằng cách thêm vào thẻ `"standard": 2`, `"silhouette": "<mô tả hình riêng>"`, `"materials": ["smoke", ...]` (giá trị: `flipbook|smoke|particles|crack|distort`). Thẻ cũ không có `standard` thì không bị kiểm (đợt làm lại sẽ bật dần). Phần đo trên ảnh của `vfxlab` chỉ cảnh báo (cột `overBudget`), vì ảnh có lẫn chuyển động của nhân vật/hình nộm. Mẫu tham chiếu chất lượng: concept Hàn Giao (quái).

## Bảng phong cách

`tools/vfx-forge/style-sheet.json`: ramp ba tông (lõi tối 15–25%, thân 50–60%, viền sáng 10–20%), nét không mảnh hơn 3% khung, tương phản lõi/viền ≥ 4:1, nền đen thuần cho flipbook, cấm đỏ/cam. Script đưa bảng này, bảng màu hướng tu và phối cảnh camera chéo vào MỌI prompt; luôn đính ảnh mẫu đã duyệt gần nhất bằng `--ref` để các chiêu cùng phong cách.

## Luật thứ bậc thị giác (runtime)

Chiêu của mình > cảnh báo địch > chiêu đồng đội (`fxHierarchy`: chỉ giảm 50% độ sáng, kích thước và vị trí giữ nguyên; đối thủ đấu pháp không bị giảm) > hào quang/môi trường. **Chế độ tĩnh** (Cài đặt) giảm đồng đội còn 25% độ sáng, tắt khung va chạm, chớp và viền.

## Khung va chạm

Sự kiện timeline `{ "type": "impact", "t": 0, "frames": 1|2, "tint": "ink|warm|cool" }`: 1–2 khung hậu kỳ tương phản cao ám màu (`render/post.ts`). Chỉ chiêu của mình, tắt được ở Cài đặt ("Khung va chạm") và tự tắt khi bật chế độ tĩnh (cùng `flash`, `vignette`). Không có tint đỏ/cam.

## VFX quái/boss (V-P9)

- **Timeline riêng theo chiêu quái**: `MonFx` (`game/fx/monFx.ts`) tìm `mon_warn|mon_warn_line|mon_warn_cone|mon_boom_circle|mon_boom_line|mon_boom_cone` theo thứ tự `<khóa>__<quái>__<chiêu>`, `<khóa>__<quái>`, rồi khóa chung (hành vi cũ). `HazardMsg` không mang tên chiêu nên `game/fx/monMove.ts` (`moveOfHazard`) đoán từ hình + bán kính + thời gian báo khớp với `ai`/`phases[].ai` của quái (slam, chant, sweep, line, charge, leap, burrow/emerge); không khớp thì dùng timeline chung. Tên file mẫu: mon_warn + hai gạch dưới + id quái + hai gạch dưới + tên chiêu (đuôi .json) trong thư mục data/fx của packages/content (khai báo import ở `packages/content/src/index.ts`, thêm vào `MON_FX_TIMELINES`).
- **Phòng thử quái**: `pnpm shots vfxmon --mon boss_han_giao --move slam,chant,sweep --out <thư mục> [--sizes 720p,1080p] [--at -1200,-600,0,30,150,400] [--mood night] [--clip 1]`: dùng `?vfxlab=1` + `__vfxlab.castMon(mon, move)` đi đúng đường S.HAZARD của game (`onHazard` tách khỏi `room.ts`; `setTimeout` của vùng nổ đổi sang đồng hồ trình diễn trong phòng thử để tua được). Mốc âm = trước lúc nổ (vạch báo nạp), 0 = lúc nổ.
- **Luật màu**: vạch báo của địch đỏ/cam (`accent` của bảng `mon_*`, boss `mon_boss_<hệ>` accent đỏ thẫm), phải rõ ở góc 52°, đúng HÌNH và BÁN KÍNH vùng server (không vẽ rộng/hẹp hơn hitbox), nhịp nạp ≥ ngưỡng né (`delay` của chiêu). Màu hệ (xanh băng...) dành cho vùng nổ/dư ba, không dùng cho vạch báo.

- **Thẻ chiêu quái** (V-P9b): `packages/content/data/vfx/cards/mon/<monId>__<chiêu>.json` (`MonVfxCard` ở `packages/shared/src/vfxcard.ts`): `zone` (hình + bán kính + tâm), `palette` (hex, `accent` đỏ cảnh báo), nhịp nạp, `readability`. `content:check` bắt buộc `zone.shape/r` và nhịp nạp bằng `ai` của quái (vẽ vùng lệch hitbox là lỗi). Concept: `pnpm vfx:forge concept --mon-card <monId>__<chiêu> --shot <ảnh nền phòng thử> --out <thư mục ngoài repo>` (4 khung: vạch báo vừa hiện, nạp ~60%, lúc nổ, +150 ms). Codex đôi khi sinh ảnh xong mà bước sao chép hỏng hoặc treo: forge tự lấy ảnh từ `~/.codex/generated_images/<session id>/`. Ảnh nền sạch: `pnpm shots vfxmon` (đã tắt vạch báo của AI server và vòng chọn mục tiêu).

## Ảnh ở đâu

Ảnh Codex, concept, contact sheet, ảnh phòng thử: artifact phiên hoặc `dtl-asset-source`, KHÔNG commit. Chỉ texture đã qua lò rèn (KTX2 + dòng nguồn trong manifest) vào repo.

## Việc còn mở

- Méo không khí (distortion pass) cần bản sao màn hình; làm khi có chiêu đầu cần tới.
- Phủ điểm ảnh của phòng thử gồm chuyển động của hình nộm; cần quái đứng yên (GM `freeze`) để số chính xác hơn.
- Shader đọc kênh G/B của texture đóng kênh chưa nối (V-P1 nối cùng chiêu pilot đầu tiên cần texture).

## Texture dùng chung theo hệ (Họa Pháp Lô 2)

Lớp CHẤT LIỆU dùng chung cho quái/boss và chiêu người chơi (mỗi chiêu/boss vẫn phải có silhouette riêng). Danh sách id ở `FORGE_DECALS`/`FORGE_FLIPS` (`packages/shared/src/fxtimeline.ts`): `warn_crack` (vân nứt đỏ cho vạch báo), `ice_crack` (băng nứt), `ice_flip` (flipbook 4×4 băng trồi/vỡ).

- Sinh: `pnpm --filter @dtl/vfx-forge forge shared <id> --out <thư mục artifact>` (Codex), rồi `forge import <png> --id <id> [--grid 4x4] --sheets <artifact>` (cần `TOKTX`) → `apps/client/public/assets/vfx/<id>.ktx2` + `manifest.json`. `pnpm vfx:check` chặn PNG.
- Dùng trong timeline: decal `tex: "warn_crack"|"ice_crack"` (thêm `sector` = nửa góc độ để vẽ MẶT QUẠT từ tâm theo hướng vùng; `top` cho vạch báo); mesh `shape: "flip", flip: "ice_flip"`.
- Client: `render/vfx/forgeTex.ts` (shader `mapDecal`/`mapDecalTop`/`mapFlip`, texture giữ chỗ trong suốt) + `game/fx/forgeLoad.ts` (nạp KTX2 nền sau khi có renderer; lỗi chỉ cảnh báo, lớp này vô hình). Thêm texture mới: thêm id vào `shared`, thêm nút texture ở `forgeTex.ts`, thêm mục ở `tools/vfx-forge/src/sharedTex.ts`.
- Vạch báo riêng của chiêu quái (`MonFx.ownWarn`) chỉ thay vòng cũ khi `MonFx.warn` thật sự phát (trả `true`); xa/đông FX thì giữ vòng cũ để không mất vạch báo.
