# Họa Cảnh (`?style=painted`)

Phong cách nền hoạt hình vẽ tay, thử ở Vân Lam khởi đầu. **Mặc định không đổi gì**: mọi nhánh mới nằm sau `FLAGS.style === 'painted'` (`src/base/flags.ts`). Kế hoạch gốc ở artifact phiên (`ke-hoach-hoa-canh.md`); người dùng duyệt P7 (nhân vật cel) riêng.

## Nguồn và ranh giới

- Kỹ thuật và code tham khảo: painted-valley, MIT © 2026 Patch (nguyên văn giấy phép ở `assets/LICENSES.md`). Nguồn là WebGL2/GLSL; ta **viết lại bằng TSL**, không chép GLSL. File dựa trực tiếp trên nguồn ghi ở dòng đầu: `Dựa trên painted-valley/<file> (MIT, © 2026 Patch), viết lại bằng TSL`.
- KHÔNG dùng âm thanh Sonniss của bản gốc. KHÔNG tái tạo cảnh/nhân vật của phim nào. KHÔNG commit ảnh chụp hay ảnh tham khảo (ảnh duyệt PR để ở artifact phiên). Texture mới qua `pnpm assets:push`.
- Vẫn tuân quy tắc chung: lore ở `lore-boundary.md`, chuỗi hiển thị qua i18n, ngân sách perf (<300 draw call, CPU <8 ms, 512 MB texture).

## Nguyên tắc Họa Cảnh

Rút từ painted-valley (xem README và LICENCE-NOTES của nó). **Phạm vi: chế độ `?style=painted` và các bản đồ làm mới theo hướng này.** Hiện mặc định game vẫn là bán tả thực (art-bible v3); khi Họa Cảnh hoàn thành trên toàn bộ bản đồ (P10) nó thành mặc định và nguồn cũ bị gỡ (P11).

1. **Ít tông, một bảng màu chung.** Mỗi vật có hai màu (sáng, tối) nối bằng một bước ngắn; màu tối pha tay (lạnh hơn, ít bão hòa hơn), không phải màu sáng nhân cho tối. Một bảng dùng chung cho cỏ, đất, đồi, tán cây để cả cảnh là một bức tranh (`palette.ts`, `meadowGreen`).
2. **Không texture ảnh chụp, không nhiễu ở mọi cỡ.** Nền là mảng màu chậm cộng nét cọ; chi tiết chỉ đặt nơi nét cọ cần (gần người chơi), mờ hết trước khi thành lấm tấm. Xa không có họa tiết mịn (lấp lánh).
3. **Cảnh xa VẼ MỘT LẦN, rẻ mà rộng.** Núi xa nướng vào một dải sơn (màu sáng, màu tối, chỗ sáng, sương; trộn theo giờ, không nướng lại); mây đắp khối ray-march một lần vào cubemap rồi đứng yên; đồng xa là MỘT texture kèm thẻ cây; các lớp đồi lùi dần trong sương. Không tốn gì mỗi khung.
4. **Cỏ chi tiết chỉ ở vòng gần.** Lá mảnh theo vòng (gần dày, xa to và thưa) mờ qua nhau theo khoảng cách tới camera; ngoài vòng, đất tự là cỏ vẽ sẵn.
5. **Hậu kỳ tối giản.** Một lớp Kuwahara làm tròn thành nét cọ (trời và hiệu ứng sáng được bỏ qua); không ACES, hạt phim, bloom mạnh khi painted. VFX giữ chuẩn riêng (HPL2), không bị lớp vẽ làm nhòe.
6. **Nền vẽ tay, người cel với viền mực.** Người vẽ ba tông phẳng (sáng, tối, nếp gấp), viền mực theo số nhận dạng từng bộ phận. **Hướng nhân vật CHỜ người dùng xem ảnh P7 rồi quyết**; trước đó nhân vật v3 đã duyệt giữ nguyên.
7. **Animation cần clip chuyển tiếp.** Nhân vật đi bộ trên nền hoạt hình thiếu start, stop, pivot (xoay đột ngột), sprint và nhịp thở dốc (idle mệt) thì đọc là trượt; mỗi bộ cần các clip này (nối với `vfx-animation.md`, Thân Pháp).
8. **Một hướng mỹ thuật thống nhất.** Mọi asset mới (kiến trúc, cây, prop, thẻ cây) đi qua bảng phong cách của chế độ này; không trộn bán tả thực với painted trong cùng một cảnh.
9. **Đo khớp, không "nhìn cho giống".** Port từ nguồn phải dịch từng dòng, giữ hằng số, rồi so bằng số (SSIM, ΔE) ở cảnh thử cô lập (`tools/painted-compare` và cờ `?paintedlab=1`) [CHƯA CÓ trên main: đang dựng ở nhánh riêng, dự kiến vào ở bước P2/P8; trước đó chỉ là kế hoạch] trước khi áp vào địa hình thật.
10. **Giữ ngân sách.** Dưới 300 draw call, dưới 2 triệu tam giác, CPU dưới 8 ms; số đo trước/sau ở mỗi PR.

### Ghi công

- Code painted-valley: MIT, © 2026 Patch (nguyên văn ở `assets/LICENSES.md`); file nào dịch từ nguồn ghi ở dòng đầu. Art của nguồn: CC0 1.0. Clip chuyển tiếp của nguồn là Universal Animation Library của Quaternius (CC0) và clip riêng của Patch (CC0); ta chỉ tham khảo ý (danh sách clip cần có), không nhập asset.
- KHÔNG dùng năm âm thanh Sonniss của bản gốc. KHÔNG tái tạo cảnh hay nhân vật của phim nào; không commit ảnh tham khảo hay ảnh chụp của nguồn.

## Các bước (mỗi bước một PR, tuần tự)

**Quyết định người dùng (2026-11-25): sau khi Họa Cảnh hoàn thành trên TOÀN BỘ bản đồ, Họa Cảnh thành MẶC ĐỊNH và nguồn đồ họa cũ bị gỡ.** Nhân vật cel (P7) vẫn chờ người dùng quyết riêng.

| | Nội dung | Trạng thái |
| --- | --- | --- |
| P1 | cờ `style`, `render/painted/palette.ts` (bảng lit/shade, `cel2`), giấy phép, trang này | xong |
| P2 | mặt đất + cỏ lá mảnh + hoa (port từ painted-valley) | xong ở PR #614 (cảnh thử đo khớp: nhánh riêng, chưa vào) |
| P3 | núi xa nướng một lần vào dải sơn, sương theo giờ | |
| P4 | mây trời đắp khối nướng vào cubemap | |
| P5 | hoàn thiện Kuwahara + mặt nạ (bỏ qua trời/VFX/HUD) | |
| P6 | cây + nhà ngoài tông (cel2, chi tiết shader) | |
| P7 | nhân vật cel thử một bộ | chờ người dùng quyết |
| P8 | pilot Vân Lam đạt: đo khớp SSIM ≥ 0,90 và ΔE trung bình ≤ 5, người dùng xem | |
| P9 | cuốn chiếu từng bản đồ (mỗi bản đồ một PR: nền painted + cảnh xa vẽ một lần), theo thứ tự `LEVELS`; bản đồ mới làm thẳng theo Họa Cảnh | |
| P10 | BẬT MẶC ĐỊNH: bỏ cờ `?style=painted`, giữ `?style=legacy` tạm một đợt để so | |
| P11 | XÓA NGUỒN CŨ: hậu kỳ ACES/grading/grain của cảnh, mood cũ, material/texture mặt đất ảnh chụp, cỏ cũ, nhánh `if !painted`; PR nhỏ, 0 tham chiếu, có số đo | |

## Palette và cel2 (P1)

`render/painted/palette.ts`: `PAINTED` là bảng cặp [sáng, tối] (sRGB hex) cho cỏ, đất, đá, tán, mái, tường, gỗ, núi xa. Màu tối pha tay, lạnh hơn và ít bão hòa hơn màu sáng (test kiểm). `cel2(lit, shade, t, edge?, soft?)` là bước tô TSL; `celFactor` là cùng công thức ở CPU để test. Chưa vật liệu nào dùng (P2 trở đi).

## Đo

Mỗi PR từ P2 ghi số trước/sau cùng điểm `?at=` (draw call, CPU, GPU, texture) cho `?style=painted` và mặc định, trên cả `?renderer=webgpu` lẫn `webgl2`; luôn `?mute=1`.

## Mặt đất + cỏ (P2, làm lại theo đối chiếu trực tiếp)

Lần đầu (bụi cỏ hai tông + nét cọ xoay theo dốc) bị người dùng loại: "không giống painted-valley". Làm lại bằng cách chạy chính painted-valley, đặt camera của nó đúng góc game (chéo 52°, 20 m, FOV 32°, `__tg.view`) để có ảnh tham chiếu cùng góc, rồi port SÁT công thức nguồn:

- `render/painted/meadow.ts`: `meadowGreen` (ba xanh đúng giá trị nguồn), `meadowTint`, `tallAt`, `slopeRel`, `paintGround`, `hash42` (nguồn: tệp glsl.js của painted-valley).
- `game/world/paintedGrass.ts`: `PaintedGrass` thay `Grass` ở level dùng bụi lá thủ tục khi `?style=painted` (port `blades.js` + `flowers.js`): hai vòng lá mảnh `mid`/`wide` mờ qua nhau theo khoảng cách tới camera, mọi thứ suy ra từ số ô thế giới; hoa trắng/vàng/hồng/be thành đám. Độ cao và mật độ đọc từ texture lưới 1 m cuộn quanh người chơi (dựng bằng CPU, luật mọc chung với cỏ thường qua `grassDensityAt`).
- `render/painted/ground.ts`: màu đất = `meadowGreen` + `meadowTint` + `paintGround`; đường mòn/đất khô be nhạt.
- `render/painted/brush.ts`: texture nét cọ dựng như `strokes.js` (mảng lớn, nét, chấm); mảng lớn là thứ cho cỏ các mảng sáng/tối nhiều mét.
- `render/painted/kuwahara.ts` + `post.ts` (P5 rút gọn): Kuwahara bốn phần tư, `?paint=0..3` (mặc định 1), bỏ qua trời (độ sâu) và điểm sáng HDR (VFX). Chưa có mặt nạ alpha cho nhân vật (làm ở P7).
- Nét lá (lần 3): lá tối ở gốc, sáng ở ngọn (`mix(0.5, 1.12, up)`), 12% lá là nét sẫm / 10% hứng nắng, khóm sẫm theo ô 44 cm, mảng đậm/nhạt vài mét; hoa dày (xác suất ×2,5, to hơn); Kuwahara trộn 55% với ảnh gốc (`paintedFinishParams.strength`) để không xóa nét lá.
- Ngân sách: vòng `mid` cell 0,11 m ô 6,6 m; `wide` cell 0,22 m ô 17,6 m; hoa 4×4 ô. Tam giác 1,32–1,43 M, draw call +38..54.
- Chỉnh nhìn: `paintedGroundParams.gain` và `paintedGroundParams.tint`, `paintedGrassParams.gain`.
- Khác nguồn: bỏ lửa/cắt/giẫm; nhiễu `tNoiseHi` thay bằng nhiễu của ta; ánh sáng qua đèn PBR của cảnh (có bóng, theo mood) thay cho `meadowLight`.
- Chụp so sánh: `pnpm shots painted --out <thư mục tuyệt đối> [--styles off,painted] [--moods day,night] [--views 720p,1080p] [--points thunglung,giua,suoi] [--burst N] [--spawn <id quái> --spawn-n N]` (Thung Lũng Thanh Phong); ghi `perf.json`. Ảnh tham chiếu painted-valley chỉ để ở artifact phiên, KHÔNG commit.
