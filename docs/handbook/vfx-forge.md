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
| 8 | Ảnh duyệt 720p + 1080p, ngày + đêm, khung báo/0/+30/+150, clip chiêu cuối | `pnpm shots vfxlab --skill ... [--mood night] [--clip 1]` |

Bật kiểm cho một thẻ bằng cách thêm vào thẻ `"standard": 2`, `"silhouette": "<mô tả hình riêng>"`, `"materials": ["smoke", ...]` (giá trị: `flipbook|smoke|particles|crack|distort`). Thẻ cũ không có `standard` thì không bị kiểm (đợt làm lại sẽ bật dần). Phần đo trên ảnh của `vfxlab` chỉ cảnh báo (cột `overBudget`), vì ảnh có lẫn chuyển động của nhân vật/hình nộm. Mẫu tham chiếu chất lượng: concept Hàn Giao (quái).

## Sprite vẽ tay (Họa Pháp Lô 2, từ đợt Hồn tu)

Hình có hình dạng riêng (bàn tay, mặt hồn, lính giáo, phướn, lốc xoáy, sóng, sợi hồn...) không dựng bằng lưới thủ tục mà dùng **sprite Codex vẽ**:

1. **Vẽ**: `pnpm --filter @dtl/vfx-forge forge sprites --name <tên> --prompt-file <txt> [--ref <bảng concept đã duyệt>]... --out <thư mục ngoài repo>` gọi Codex vẽ MỘT bảng lưới đều (4×2) mỗi ô một sprite trên nền xanh chroma `#00FF00`; prompt dặn không dùng xanh lục trong hình và mép phải mềm như khói. Hồn tu đã có ba bảng (v1: bàn tay, mặt, lính, phướn, xích, vuốt; v2: lốc, màn, sóng, quả cầu hồn, sọ, bóng trùm, roi khói, sợi hồn; v3: sợi hồn chữ S, vòng khói, mặt thương khóc, mặt quỷ sừng, bàn tay xương, chùm 9 mặt).
2. **Đóng atlas**: `node tools/vfx-forge/sprite-pack.mjs --sheet <bảng1.png>:4:2 --sheet <bảng2.png>:4:2 --sheet <bảng3.png>:4:2 [--preview <jpg>]` tách nền (alpha mềm từ độ lệch xanh lục, khử viền), cắt khung bao từng ô, thu vừa ô vuông 512 và xếp nối tiếp vào `apps/client/public/hoa-truc/vfx_sprites.webp`: lưới **4 cột × 6 hàng = 24 ô** (`SPRITE_COLS`/`SPRITE_ROWS` ở `render/vfx/art.ts`), thứ tự ô = `FX_SPRITES` trong `packages/shared/src/fxtimeline.ts` (hàng trên trước, trái sang phải). Thêm sprite mới: thêm tên vào CUỐI `FX_SPRITES`, tăng `SPRITE_ROWS` nếu hết ô, đóng lại atlas với đủ các bảng theo thứ tự.
3. **Đẩy atlas lên R2** (nhị phân KHÔNG commit, xem CLAUDE.md "Không commit nhị phân"): `pnpm assets:push --only hoa-truc/vfx_sprites.webp` (cập nhật `assets/asset-lock.json` rồi upload; thử trước bằng `--dry`), commit sổ khóa. Máy khác/sau merge: `pnpm assets:pull`. Client nạp qua `ASSET_BASE` (`base/assetBase.ts`) ở `spriteAtlas()`; test `sprites.test.ts` kiểm atlas có trong sổ khóa.
4. **Dùng trong timeline**: sự kiện `mesh` với `shape: "sprite"`, `sprite: "<tên>"` (billboard mặc định); `scale` là mét của ô vuông (nội dung chiếm ~35–60%); `alpha`, `erodeFrom`, `move` như mọi mesh; sprite tan dần TUYẾN TÍNH từ `erodeFrom` (như khói mỏng đi). Kiểu vật liệu riêng `sprite` (`spriteNodes` ở `render/vfx/stylized.ts`) KHÔNG gộp instance: hai lần thử gộp chung với `art` làm sprite chập chờn khi ra nhiều chiêu liên tiếp, nên **mỗi sprite là một draw call**. Ngân sách: draw call mỗi chiêu ≤ 12 (kiểm bởi `validateFx`/`content:check`); chiêu nhiều sprite (Hoàng Tuyền Đạn: 12) phải khai `budget.drawCalls` thật trong thẻ, đừng khai thấp.
5. **Màu**: shader tô sprite bằng bảng tím âm hồn (hue ~270–285°): lõi mực gần đen tím → thân tím đậm → viền tím nhạt/trắng lạnh, theo độ sáng của tranh; chi tiết vẽ tay (ngón tay, mặt, lưỡi giáo) nhuốm tím. Tone `rim` của sự kiện chỉ nâng phần chi tiết sáng (lớp điểm nhấn ngắn), không nâng cả thân. Hướng tu khác cần ramp riêng thì tách tham số trong `spriteNodes`, đừng sửa hue của Hồn tu.
6. **Không đặt `camFade`** cho sprite nằm trên đầu mục tiêu: nó mờ gần hết mọi thứ trong 4 m quanh mục tiêu.
7. **Ba nhịp**: báo trước (`t < 0`: bản mờ nhỏ + hạt `inward`), trúng (`t = 0`: hình bật gần đủ cỡ + lớp sáng lạnh ngắn), dư ba (`t ≥ 0,17`: hình mỏng dần + sợi hồn bay lên). Chiêu lướt kích theo S.FX (`trigger: fx`) kẹp mọi mốc ≥ 0 nên không có báo trước: khai `timing.anticipationMs: 0` trong thẻ.
8. Thẻ khai `standard: 2`, `materials: ["sprite", "particles"]` (+ `"smoke"` nếu có khói `flip`); `checkStandard2` kiểm timeline có sự kiện `sprite`.
9. `node tools/vfx-forge/hon-tu.mjs [id...]` là bộ sinh timeline 11 chiêu Hồn tu (chạy lại an toàn, bỏ mesh seed ≥ 1000 rồi dựng lại, giữ âm thanh/rung/hitstop/hạt viết tay); hệ số cỡ theo chiêu ở `SCALE`.

**Đo phủ màn hình**: `node tools/vfx-forge/cover.mjs [id chiêu...]` (chạy ở gốc repo) là ƯỚC LƯỢNG có trọng số, tất định, từ timeline: Σ (bình phương cỡ × alpha × phần còn lại sau khi tan) của các tấm `sprite`/`flip` đang sống, chia diện tích khung camera chéo (cách 20 m, FOV dọc 32°, 16:9 = 20,4 × 11,5 m); in giá trị ở +30 ms và đỉnh. KHÔNG phải cận trên: bỏ ribbon/helix/decal/hạt, nhân alpha và phần tan, không trừ chồng nhau hay phần trong suốt của tranh. Dùng nó để khai `budget.screenCover` của thẻ (≤ 0,2; chiêu cuối ≤ 0,35) và PHẢI kèm số xác nhận bằng ảnh: `pixelCover` của `pnpm shots vfxlab` ở khung 0 và +150 ms (khung +30 ms hay dính rung hitstop làm lệch cả khung). `pixelCover` so với ảnh nền chụp trước khi ra chiêu nên bị lệch khi nền đổi (giờ/mây/rung): khung chưa có hình vẫn có thể báo 0,4; nếu một lượt báo gần như bằng nhau ở mọi khung thì lượt đó lệch nền, bỏ và chụp lại (`screenCover` của phòng thử là ước lượng theo hình cầu bao, quá tay với sprite, chỉ ghi kèm chú thích).

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

Lớp CHẤT LIỆU dùng chung cho quái/boss và chiêu người chơi (mỗi chiêu/boss vẫn phải có silhouette riêng). Gộp thành HAI atlas KTX2 (`apps/client/public/assets/vfx/`, tổng ~1,6 MB) để shader chỉ lấy mẫu một texture:

- `decal_atlas` (2048×1024, ô vuông 512, 4×2) theo thứ tự `FORGE_DECALS`: `warn_crack` (vân nứt đỏ cho vạch báo), `ice_crack`, `steel_crack`, `ember_crack` (lõi tối vân vàng trắng, KHÔNG cam phẳng), `bolt_scorch`, `jade_crack` (đất nâu khe ngọc lam), `root_mat`.
- `flip_atlas` (3072×2048, 3×2 tấm, mỗi tấm 4×4 khung) theo thứ tự `FORGE_FLIPS`: `ice_flip`, `steel_flip`, `fire_flip`, `bolt_flip`, `earth_flip`, `root_flip`.

Thêm/đổi texture: thêm mục ở `tools/vfx-forge/src/sharedTex.ts` (`forge shared <id> --out <artifact>`, Codex vẽ nền đen), thêm id vào `FORGE_DECALS`/`FORGE_FLIPS` (`packages/shared/src/fxtimeline.ts`, GIỮ THỨ TỰ vì là chỉ số ô), dựng lại atlas (PIL, ghép theo thứ tự; hạ gamma/độ bão hòa ô quá sáng: alpha suy từ độ sáng nên vùng sáng càng đặc), rồi `forge import <atlas.png> --id decal_atlas --grid 4x2 --max 2048` và `--id flip_atlas --grid 12x8 --max 3072` (cần `TOKTX`). `pnpm vfx:check` chặn PNG.

- Dùng trong timeline: decal `tex` thuộc `FORGE_DECALS`, thêm `sector` (nửa góc độ, mặt quạt), `swing`/`swingDur` (một tia xoay thay nhiều decal), `strip: [dài, rộng]` (dải chữ nhật cho vùng `rect`, mét thật), `top` cho vạch báo; mesh `shape: "flip", flip: <FORGE_FLIPS>`. Mỗi chiêu quái ≤ 4 decal sống cùng lúc (`DECAL_MAX` = 6 cho cả runner).
- Client: `render/vfx/forgeTex.ts` (shader `mapDecal`/`mapDecalTop`/`mapFlip`, bảng `FILL`/`BRIGHT` theo hệ) + `game/fx/forgeLoad.ts` (nạp nền; lỗi chỉ cảnh báo, lớp này vô hình).
- Timeline riêng của quái: `mon_warn*|mon_boom_*|mon_cast__<quái>[__<chiêu>]`, sinh bằng `tools/vfx/gen-fx-han-giao.py` và `gen-fx-a1.py`; timeline riêng được chọn bảng màu riêng (`palette` của file). Không dùng hình `smoke` trong vùng nổ: nó luôn là khói toon trắng ngả lam.
- Vạch riêng của chiêu quái (`MonFx.ownWarn`) chỉ thay vòng cũ khi `MonFx.warn` thật sự phát và atlas decal đã nạp; xa/đông FX/chưa nạp xong thì giữ vòng cũ để không mất hitbox.
