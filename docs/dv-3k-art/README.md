# DV-3K: mỹ thuật phó bản Xích Tẫn Khích (chương 5)

Gói hình/âm cho phó bản DV-3D (#227), theo mẫu Bắc Hoang (`docs/dv-3i-art/`) và Thiên Khuyết (`docs/e4i-art/`). **Không đổi luật** đợt quái, boss, thưởng, chiêu, server: chỉ địa hình/level data, hình và nhạc. Ảnh/video duyệt PR ở artifacts của phiên, không commit.

## Vấn đề → cách sửa

| Trước (DV-3D) | Làm gì | Ở đâu |
| --- | --- | --- |
| Đồng bằng đỏ thẫm phẳng (phó bản nằm trên địa hình Vân Lam, bị lòng chảo Kiếm Trủng + vỏ hang úp) | **Địa hình riêng `xich_tan_khich`**: hẻm núi dựng bằng `TerrainDef.canyon` (mới, `shared/terrain.ts`): sàn phẳng 92 × 164 m quanh tâm bí cảnh, vách 50 m dựng trong 15 m, mép vách uốn lượn, gân đá dọc vách, cao nguyên tro phía trên, bầu trời thật thay vỏ hang. Level có `canyon` thì `blockRise` bật (không leo được vách, cả server lẫn client), bỏ alias địa hình Vân Lam | `levels/xich_tan_khich.terrain.json`, `shared/src/level.ts`, `terrain.ts`, `content/src/index.ts` |
| Màu một lớp, không có chi tiết | Màu đỉnh: sàn than xám tro + mạng nứt hồng sẫm, vết nứt nóng dần, bục xương + vòng than quanh bia giữ; vách dải tầng đá huyết sậm/dạ tím theo độ cao, chân vách ám khói, gờ đỉnh ánh than; bộ texture `terrain-ash` có sẵn (DV-3I) | `game/xichArt.ts` (`xichGroundColor`), `game/terrain.ts`, `xich_tan_khich.assets.json` `ground` |
| Prop đặt tay không hiện (`trees: "none"`), cột đá ở vòng bán kính 78 m nay nằm trên vách | `trees: "scatter"`; hai hàng cột khắc vân dọc chân vách; **rải đá dung nham nguội** (tint tối ngả than hồng), cột đổ nghiêng, kiếm gãy: ô 7 m xác định, dày ở chân vách, thưa trên sàn, chừa vòng quanh bia, lối vào/ra, vết nứt | `shared/src/props.xichtan.ts`, `game/xichArt.ts` (`scatterXich`), `game/propScatter.ts` |
| Không có vết nứt Giới Khích | **Ba vết nứt phát sáng trên sàn** (hai vết ven chân vách, một vết xương sống qua Trấn Giới Bia): dùng lại shader TSL `riftVeil` của Bắc Hoang, thêm tùy chọn (`height`, `ribs`, `floorHalf`, `strength`, `floorStrength`, `endFade`): màn khói thấp 7 m, dải lòng khe 6 m, tan dần hai đầu. 2 draw call mỗi vết. Đáy vết nứt nằm sát mặt đất thật | `render/riftVeil.ts`, `engine.ts` (`buildXich`) |
| Sương/ánh sáng của `rift` (ngoài trời) | Mood riêng **`rift_pit`**: nắng than hồng thấp, sương dày hơn và thấp (`heightFogTop` 38), tím–huyết sậm, bão hòa 0,66; giữ cố định (không đổi theo giờ) | `assets/palette.json`, `render/grading.ts`, `atmosphere.ts`, `sky.ts` |
| Không có điểm nhấn | **Ánh sáng điểm nhấn**: 4 điểm — bia giữ (than hồng, mạnh) và ba khe mạch của boss cuối (ngọc lam, đối màu). `LanternLights` nhận màu/cường độ riêng từng điểm, chỉ WebGPU (preset có đèn); quầng giả `createLanternHalos` ở mọi backend | `render/lanternLights.ts`, `engine.ts` (`buildXich`) |
| Dùng nhạc `dungeon`/`dungeon_boss` của Kiếm Trủng | Hai bài tự soạn: **`dungeon_rift`** (đàn ống pedal, hợp xướng hẹp, timpani nhịp tim, thang E F A B C, 52 BPM, 2:28) và **`dungeon_rift_boss`** (ostinato 3-3-2, đồng thau, taiko, 108 BPM, 1:29). Chọn theo level ở `regionTrack` và đợt boss | `tools/audio/compose/dungeon_rift*.mjs`, `music.json`, `musicDirector.ts`, `music.ts` (bảng dự phòng tổng hợp) |

Cờ so ảnh `?xichart=0` đã gỡ ở V4 nhóm D (28/11/2026); so với bản cũ dùng ảnh trước/sau của artifacts.

## Ngân sách (`pnpm shots xichkhe --perf 1`, WebGPU, Vừa, 1280×720; 6 điểm, đã dọn quái)

| | Trước | Sau |
| --- | --- | --- |
| Draw call (6 điểm) | 29–43 | 54–72 (< 300) |
| Tam giác | 118k–144k | 353k–414k (< 1–2 triệu) |
| Texture | 65 | 83 |
| Khung (đo kẹp vsync) | ≈ 8,3–8,5 ms | ≈ 8,3–8,7 ms |

`pnpm bench:client` (Vân Lam, WebGPU/Vừa, trước → sau): fps 101 → 100 / 115 → 115 / 113 → 108, CPU p50 3,9/4,8/4,7 → 3,9/4,7/5,0 ms; tam giác, draw call, texture MB y hệt (các thay đổi chung chỉ là tùy chọn mới của `riftVeil`/`LanternLights` và nhánh địa hình có `canyon`).

Nhạc nạp lười khi vào phó bản: 2,1 MB + 1,2 MB (WebM).

## Kiểm

- `pnpm typecheck`, `pnpm test` (shared 214, content 55, client 801, server 748), `pnpm content:check`: đạt. Test mới: `content/src/xichkhe.test.ts` (sàn phẳng ở tâm/lối vào/vòng quái/khe mạch, vách, chặn leo bằng `stepMove`), `client/src/game/xichArt.test.ts`, `musicDirector.test.ts`.
- Ảnh trước/sau 6 điểm + video một lượt: `pnpm shots xichkhe --out <thư mục tuyệt đối> [--video 1] [--perf 1]` (tài khoản thử bất tử, vào bằng cổng thật, tắt tiếng, tự tắt server).

## Giới hạn / để lại

- Texture dùng lại bộ `terrain-ash` (không thêm bộ CC0 mới nên không có mục ghi công mới); nhìn từ trên cao thấy lưới lặp texture mờ.
- Vết nứt, đèn nhấn chỉ để tô cảnh, không gắn với luật khe mạch (khe mạch thật vẫn là vòng ngọc lam do server/hazard vẽ).
- Vách chưa đổ bóng riêng (chỉ màu đỉnh); `cave` (vỏ hang) không còn dùng cho level này.
