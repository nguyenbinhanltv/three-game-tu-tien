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
9. **Đo khớp, không "nhìn cho giống".** Port từ nguồn phải dịch từng dòng, giữ hằng số, rồi so bằng số (SSIM, ΔE) ở cảnh thử cô lập (`tools/painted-compare` và cờ `?paintedlab=1`) (vào cùng PR #614) trước khi áp vào địa hình thật.
10. **Giữ ngân sách.** Dưới 300 draw call, dưới 2 triệu tam giác, 512 MB texture, CPU dưới 8 ms; số đo trước/sau ở mỗi PR. **Ngoại lệ đã chốt (người dùng, 2026-11-25): với `?style=painted` KHÔNG áp luật "không vượt mặc định quá +20% draw/tam giác"**; chỉ áp ngân sách tuyệt đối ở trên (cỏ lá mảnh làm draw call +30…+76% so mặc định, giữ ở mọi preset). `pnpm perf:gate` vốn chỉ chặn theo ngân sách tuyệt đối từng vùng nên không đổi.

### Ghi công

- Code painted-valley: MIT, © 2026 Patch (nguyên văn ở `assets/LICENSES.md`); file nào dịch từ nguồn ghi ở dòng đầu. Art của nguồn: CC0 1.0. Clip chuyển tiếp của nguồn là Universal Animation Library của Quaternius (CC0) và clip riêng của Patch (CC0); ta chỉ tham khảo ý (danh sách clip cần có), không nhập asset.
- KHÔNG dùng năm âm thanh Sonniss của bản gốc. KHÔNG tái tạo cảnh hay nhân vật của phim nào; không commit ảnh tham khảo hay ảnh chụp của nguồn.

## Các bước (mỗi bước một PR, tuần tự)

**Quyết định người dùng (2026-11-25): sau khi Họa Cảnh hoàn thành trên TOÀN BỘ bản đồ, Họa Cảnh thành MẶC ĐỊNH và nguồn đồ họa cũ bị gỡ.** Nhân vật cel (P7) vẫn chờ người dùng quyết riêng.

| | Nội dung | Trạng thái |
| --- | --- | --- |
| P1 | cờ `style`, `render/painted/palette.ts` (bảng lit/shade, `cel2`), giấy phép, trang này | xong |
| P2 | mặt đất + cỏ lá mảnh + hoa (port từ painted-valley) | xong ở PR #614 (cảnh thử đo khớp: nhánh riêng, chưa vào) |
| P3 | núi xa nướng một lần vào dải sơn, sương theo giờ | xong; bật theo level (`PAINTED_THEMES[id].far`, `?far=1|0` ép): Bắc Hoang bật, Vân Lam KHÔNG (thung lũng kín) |
| P4 | mây trời đắp khối nướng vào cubemap | phần sương thấp (`render/painted/lowMist.ts`, tham số theo level) vào ở P9 Bắc Hoang; mây cubemap chưa làm |
| P5 | hoàn thiện Kuwahara + mặt nạ (bỏ qua trời/VFX/HUD) | |
| P6 | cây + nhà ngoài tông (cel2, chi tiết shader) | |
| P7 | nhân vật cel thử một bộ | chờ người dùng quyết |
| P8 | pilot Vân Lam đạt: đo khớp SSIM ≥ 0,90 và ΔE trung bình ≤ 5, người dùng xem | |
| P9 | cuốn chiếu từng bản đồ (mỗi bản đồ một PR: nền painted + cảnh xa vẽ một lần), theo thứ tự `LEVELS`; bản đồ mới làm thẳng theo Họa Cảnh | xong: Bắc Hoang (#661), Cửu Kiều (#685, #690), Vân Hải; kế: Vấn Đỉnh, Đoạn Mạch, Thiên Khuyết, Xích Tẫn Khích, phó bản |
| P10 | BẬT MẶC ĐỊNH: bỏ cờ `?style=painted`, giữ `?style=legacy` tạm một đợt để so | |
| P11 | XÓA NGUỒN CŨ: hậu kỳ ACES/grading/grain của cảnh, mood cũ, material/texture mặt đất ảnh chụp, cỏ cũ, nhánh `if !painted`; PR nhỏ, 0 tham chiếu, có số đo | |

## Palette và cel2 (P1)

`render/painted/palette.ts`: `PAINTED` là bảng cặp [sáng, tối] (sRGB hex) cho cỏ, đất, đá, tán, mái, tường, gỗ, núi xa. Màu tối pha tay, lạnh hơn và ít bão hòa hơn màu sáng (test kiểm). `cel2(lit, shade, t, edge?, soft?)` là bước tô TSL; `celFactor` là cùng công thức ở CPU để test. Chưa vật liệu nào dùng (P2 trở đi).

## Đo

Mỗi PR từ P2 ghi số trước/sau cùng điểm `?at=` (draw call, CPU, GPU, texture) cho `?style=painted` và mặc định, trên cả `?renderer=webgpu` lẫn `webgl2`; luôn `?mute=1`.

## Mặt đất + cỏ (P2, làm lại theo đối chiếu trực tiếp)

Lần đầu (bụi cỏ hai tông + nét cọ xoay theo dốc) bị người dùng loại: "không giống painted-valley". Làm lại bằng cách chạy chính painted-valley, đặt camera của nó đúng góc game (chéo 52°, 20 m, FOV 32°, `__tg.view`) để có ảnh tham chiếu cùng góc, rồi port SÁT công thức nguồn:

- `render/painted/lab/field.ts`: `meadowGreen` (ba xanh đúng giá trị nguồn), `meadowTint`, `tallAt`, `slopeRel`, `paintGround`, `hash42` (nguồn: tệp glsl.js của painted-valley).
- `game/world/paintedField.ts`: `PaintedGameField` thay `Grass` ở level dùng bụi lá thủ tục khi `?style=painted` (port `blades.js` + `flowers.js`): hai vòng lá mảnh `mid`/`wide` mờ qua nhau theo khoảng cách tới camera, mọi thứ suy ra từ số ô thế giới; hoa trắng/vàng/hồng/be thành đám. Độ cao và mật độ đọc từ texture lưới 1 m cuộn quanh người chơi (dựng bằng CPU, luật mọc chung với cỏ thường qua `grassDensityAt`).
- `render/painted/lab/ground.ts`: màu đất = `meadowGreen` + `meadowTint` + `paintGround`; đường mòn/đất khô be nhạt.
- `render/painted/lab/ref/textures.ts`: texture nét cọ dựng như `strokes.js` (mảng lớn, nét, chấm); mảng lớn là thứ cho cỏ các mảng sáng/tối nhiều mét.
- `render/painted/frame.ts` + `post.ts` (P5 rút gọn): Kuwahara bốn phần tư, `?paint=0..3` (mặc định 1), bỏ qua trời (độ sâu) và điểm sáng HDR (VFX). Chưa có mặt nạ alpha cho nhân vật (làm ở P7).
- Nét lá (lần 3): lá tối ở gốc, sáng ở ngọn (`mix(0.5, 1.12, up)`), 12% lá là nét sẫm / 10% hứng nắng, khóm sẫm theo ô 44 cm, mảng đậm/nhạt vài mét; hoa dày (xác suất ×2,5, to hơn); Kuwahara trộn 55% với ảnh gốc (`paintedFinishParams.strength`) để không xóa nét lá.
- Ngân sách: vòng `mid` cell 0,11 m ô 6,6 m; `wide` cell 0,22 m ô 17,6 m; hoa 4×4 ô. Tam giác 1,32–1,43 M, draw call +38..54.
- Chỉnh nhìn: `paintedGroundParams.gain` và `paintedGroundParams.tint`, `paintedGrassParams.gain`.
- Khác nguồn: bỏ lửa/cắt/giẫm; nhiễu `tNoiseHi` thay bằng nhiễu của ta; ánh sáng qua đèn PBR của cảnh (có bóng, theo mood) thay cho `meadowLight`.
- Chụp so sánh: `pnpm shots painted --out <thư mục tuyệt đối> [--styles off,painted] [--moods day,night] [--views 720p,1080p] [--points thunglung,giua,suoi] [--burst N] [--spawn <id quái> --spawn-n N]` (Thung Lũng Thanh Phong); ghi `perf.json`. Ảnh tham chiếu painted-valley chỉ để ở artifact phiên, KHÔNG commit.

## Cảnh thử đo khớp (đạt)

`?paintedlab=1` (`render/painted/lab/`) dựng cánh đồng của painted-valley (đất, lá mảnh, hoa, Kuwahara paint 3) bằng TSL dịch từng dòng; `tools/painted-compare/ref-capture.mjs` chụp tham chiếu (giờ 15,5, thời gian đóng băng, camera 52°/20 m/FOV 32°, 1080p) và `lab-capture.mjs` chụp bản của ta rồi `compare.mjs` tính SSIM và ΔE. **Kết quả: SSIM 0,931, ΔE00 trung bình 1,82** (ngưỡng ≥ 0,90 và ≤ 5). Dải trên cùng của ảnh (khoảng 7%) còn khác: đất ở xa phía sau đỉnh đồi chưa vẽ trong cảnh thử. Bài học TSL rút ra (`.toVar()` trong `select` phải bọc `Fn` + `varyingProperty`) ở skill `tsl-shaders-vfx`, mục "Bẫy three r178 / TSL".

## Phản hồi chiến đấu, VFX và bloom dưới Họa Cảnh

- Pass cuối `paintedOutput` (`render/painted/frame.ts`) nhận thêm hai móc: `aberration` (quang sai màu khi trúng đòn, lấy mẫu lệch R/B) và `overlay` (lớp phủ ở không gian hiển thị). `PostPipeline` truyền `feedbackLayers` (`render/post.ts`) làm `overlay`, nên `hit()`, `flash()`, `impactFrame()`, `punch()`, nhuộm chuyển pha và mực khi chết vẫn hoạt động như chuỗi thường.
- Kuwahara bỏ qua điểm sáng HDR: ảnh trả về ảnh gốc dần khi độ chói đi từ 1,3 đến 2,2, để VFX (chuẩn HPL2) và nhân vật rực sáng không bị nhòe.
- Bloom TẮT khi `?style=painted` (quyết định tạm: painted-valley không có bloom; VFX sẽ mất quầng sáng). Khi Họa Cảnh thành mặc định (P10) cần quyết định riêng: bật lại bloom chỉ cho lớp VFX hay chấp nhận không có.

## P3 — vùng xa nướng một lần (`?style=painted&far=1`)

Dịch từ painted-valley/src/valley/backdrop.js (MIT, © 2026 Patch). Mặc định TẮT; chỉ `?style=painted&far=1` ở Vân Lam, WebGPU.

- **Độ cao (`render/painted/lab/farHeight.ts`, `farHeightCpu.ts`, `farHeightBake.ts`, `farHeight.worker.ts`):** bản TSL dịch từng dòng; bản **CPU float32 chính xác** (Math.fround, worker, 1024², ~2,3 s) là bản dùng thật, vì hàm băm của nguồn (tích tới ~2,5e5) hỗn loạn theo từng ulp: WebGPU và WebGL2 cho địa hình khác nhau ở chi tiết mịn. GLSL gốc qua ANGLE gộp `a*b + c` thành mad (fma), nên bản CPU mô phỏng fma. Đo (`tools/painted-compare/far-compare.mjs --cpu`): SSIM độ cao 0,9987 so GLSL gốc (WebGPU thuần 0,86, WebGL2 0,999998).
- **Pass bức tranh (`render/painted/lab/farPaint.ts`):** ray-march qua độ cao, ra màu sáng / tối + độ sáng / không khí + sương (kèm dải mây chân núi). Đo (`far-paint-compare.mjs`, dải 2048×137): WebGL2 sáng 0,980, tối 0,966, không khí 0,9993; WebGPU với độ cao CPU 0,85 / 0,86 / 0,992 (còn lệch ở hash/noise toạ độ lớn trong chính pass bức tranh). Alpha tách ra lượt vẽ riêng (vật liệu alpha = 0 bị bỏ điểm ảnh).
- **Vòm (`render/painted/farBackdrop.ts`):** nướng sáu lượt, mỗi lượt 16 lát qua nhiều khung (không giật), một draw call trộn theo `LIGHT` như sky.js. Cảnh thử: `?paintedlab=far&stage=dome` (`tools/painted-compare/far-capture.mjs --query "stage=dome&el=8" --wait __domeReady`).
- **Camera vista theo cờ (`game/camera/vista.ts`):** điểm ngắm cảnh pitch 5°/nâng 9 m; ngự kiếm 9,5°/6 m (`?vistafly=<độ>` để so). Không có cờ thì giữ `VISTA` cũ; camera chiến đấu không đổi.
- **Kết luận:** Vân Lam là thung lũng kín, vòng núi/vách đá thật của địa hình che chân trời ở mọi điểm ngắm cảnh và khi ngự kiếm, nên vùng xa chưa có chỗ hiện và KHÔNG bật ở level này. Bật ở P9 cho bản đồ có chân trời mở.
- **Công cụ:** `far-compare.mjs`, `far-paint-compare.mjs`, `far-capture.mjs`, `pnpm shots paintedvista`. Ảnh tham chiếu của painted-valley không commit (artifact phiên).

## P9 — thêm một bản đồ vào Họa Cảnh

- **Bảng theo level** (`render/painted/theme.ts`, `PAINTED_THEMES[levelId]`): `ground` [sáng, tối] cho đất cỏ vẽ (độ chói của màu đất painted-valley ánh xạ vào hai màu nên nét cọ giữ nguyên), `rock` cho đá/vách/tuyết (đổi ở albedo, vẫn nhận đèn và bóng), `mist` + `mistBand` + `mistK` cho sương thấp, `far` [sáng, tối] để bật vùng xa nướng một lần (bỏ trống = tắt). Level không có trong bảng giữ cỏ xanh Vân Lam. Chọn bảng ở `Terrain.setGround` (`setPaintedTheme`); uniform nên không dựng lại shader.
- **Đá lát theo level** (`PAINTED_THEMES[id].paving` → `themeU.pLit/pShade`; bỏ trống = cặp `paving` chung): dùng cho `pavTone` của shader đất (sân lát có mặt nạ, như Vân Lam) VÀ cho lưới đá lát dựng riêng qua `paintedPaving()` (`render/painted/props.ts`). Cửu Kiều dùng mặt nạ đất `neutral` nên `pavTone` không vẽ gì ở đó: mặt đường, mặt cầu và lan can là lưới của `game/world/ckWonders.ts`, phải bọc `paintedPaving` (bỏ đèn PBR, độ chói từng phiến ánh xạ vào cặp đá lát, mặt hướng nắng ấm, mặt khuất ngả lam). Cỏ Cửu Kiều: cặp `ground` đậm hơn và `groundSat` 0,95 (bản đầu 0,8 ra pastel nhạt; 1,05 thì xanh non chói).
- **Vùng xa**: `paintedFarOn(levelId)`; `?far=1|0` ép bật/tắt; dải núi đổi tông theo `far`.
- **Chụp và đo**: `pnpm shots painted --level <id> --out <thư mục tuyệt đối> [--moods day,night] [--views 720p,1080p]` (điểm suy từ dữ liệu level, ảnh `<style>-<view>-<mood>-<điểm>.png` + `perf.json`); mỗi PR bản đồ ghi draw/tam giác/heap/ms trước–sau, draw không vượt mặc định quá +20%.
- Bắc Hoang: bảng tuyết trắng lam, bóng chàm, đá đen tím; màu còn chỉnh theo ảnh duyệt.
- **Vân Hải** (đảo nổi, bản sắc từng đảo nằm ở MÀU ĐỈNH địa hình, mặt nạ đất `neutral`): `vcMix` lấy màu đỉnh làm nền hai tông cho nét cọ (sáng = màu đỉnh đẩy bão hòa, nâng sáng ngả ấm; tối kéo nửa về tông tối của bảng, nếu không trên đảo màu nhạt bóng đọc thành sương xám), nhân chi tiết sáng/tối của đất vẽ, dịu dần từ 60–220 m; phần còn lại là cặp `ground` (vàng rêu bình minh, vì đất vẽ không nhận đèn của mood nên nắng sớm phải nằm sẵn trong màu). `bladeMix` đổi tông lá cỏ vào cùng cặp (uniform ở module lá `render/painted/bladeTone.ts` để `render/painted/lab/blades.ts` không vòng import với `theme.ts`). `slab` = [x, z, r] vẽ sân Phù Đảo Các thành phiến đá so le thủ tục theo cặp `paving` (không texture, mạch mờ hết từ 30–70 m). Cỏ lá mảnh theo đảo: `vhPaintedGrass` (`game/world/vanHaiArt.ts`, cùng luật với thẻ cỏ mặc định: không mọc trên lối mòn/lòng hồ/đá lộ, mật độ và độ khô theo đảo, ghi vào kênh `dry`/`growth` của lưới cỏ). Lưới dựng bằng code đi qua `paintedProp`/`paintedStd` (`render/painted/props.ts`): tán và thân cây vườn, đá chân đảo (bỏ hạt đá mịn), ván/xích cầu (mỗi ván một sắc độ), đá trôi, xương kình ngư, thuyền, tháp đá. **Không bật `far`**: vòm núi xa thành dải tường xám chắn ngang trời khi ngự kiếm; cảnh xa của đảo nổi là biển mây và đảo giả (đã vẽ một lần). Bài học: bản đầu ánh xạ thẳng vào hai tông phẳng ra pastel như phủ sương; phải giữ chi tiết của đất vẽ và đẩy bão hòa màu đỉnh.
- Chụp thêm: `--at "ten:x,z;ten2:x,z"` (điểm đặt tay: cầu, sân, vườn cây), `--fly a,b` (thêm khung ngự kiếm ở các điểm đó: camera hạ thấp lộ chân trời, ảnh `…-<điểm>-fly.png`).
