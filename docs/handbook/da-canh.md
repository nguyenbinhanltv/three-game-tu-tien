# Dạ Cảnh (`?style=da`)

Hướng hình ảnh chính từ 2026-11-27 (người dùng chốt), thay hướng "bán tả thực sương sớm" và dừng kế hoạch đưa Họa Cảnh thành mặc định. Đang dựng sau cờ; **mặc định game chưa đổi** cho tới khi người dùng duyệt lát cắt D1 và bước D5.

Mục tiêu: trận đánh đọc rõ và đã tay ở góc camera 52°. Nền lùi lại (đêm, ít tương phản), nhân vật và chiêu nổi lên.

## Dạ Họa (`?style=dahoa`): gộp Họa Cảnh + Dạ Cảnh

Người dùng yêu cầu 27/11 gộp hai phong cách thành một style tên mới và CHỐT: tên **Dạ Họa**, là **hướng hình ảnh chính** (thay Dạ Cảnh thuần). Mọi việc tiếp theo của lát cắt làm và chụp trên `?style=dahoa`; `?style=da` và `?style=painted` giữ lại để so sánh.

- `base/flags.ts`: `style` nhận `painted | da | dahoa`; mã KHÔNG so `FLAGS.style` nữa mà rẽ nhánh theo hai cờ thành phần `FLAGS.painted` (nền vẽ tay: đất, cỏ, cây và đá hai tông, bút Kuwahara, chuỗi hậu kỳ painted) và `FLAGS.da` (mood đêm theo loại trận, tô chia bậc + viền mực, lớp tối quanh trận, rung trauma, đèn lửa lạnh). `dahoa` bật cả hai.
- Chỗ hai phong cách đụng nhau và cách giải: chuỗi hậu kỳ painted nhuộm trăng và nhòe Kuwahara lên mọi thứ → nhân vật, quái và vỏ viền được đưa vào mặt nạ của Họa Cảnh (`markVfxMask`) nên giữ viền sắc và không bị làm tối.
- Vũng đèn trên đất (`render/painted/lampPools.ts`) theo lửa lạnh khi `FLAGS.da`.
- Số đo Dạ Họa (27/11, `pnpm shots herolight --bots 8 --view 1080p --query style=dahoa`, một mẫu): 168 draw call, 1,66 triệu tam giác, 9,4 ms khung (Dạ Cảnh thuần: 136 / 1,16 triệu / 10,3 ms). Trong ngân sách 300 draw / 2 triệu tam giác; phần tăng là nền vẽ tay của Họa Cảnh.
- Họa Cảnh thuần (`?style=painted`) đã chụp lại sau các sửa dùng chung: chạy bình thường, 0 lỗi console.

## Đã có

- Cờ `?style=da` (`base/flags.ts`, loại trừ `painted`): mọi level lấy biến thể đêm của bộ mood riêng (`moodOf` ở `game/engine/levelLoad.ts`).
- Mood theo loại trận (`game/engine/daMood.ts`, gọi từ `frameLoop.ts`): `daPreset` lấy preset đêm của level rồi hạ tương phản/bão hòa và nâng đáy đen (sàn sáng cho máy không có đèn lồng thật); tinh anh còn sống trong `DA_ELITE_R` m ngả đỏ sẫm nhẹ, boss trong `DA_BOSS_R` m đỏ sẫm rõ và sương dày hơn. Chỉ chỉnh uniform. Level có mood động riêng (khe Bắc Hoang, Vấn Đỉnh, Giới Trì) giữ cơ chế cũ.
- Chụp so: `pnpm shots camiso --level van_lam --query style=da --out <thư mục>` (kịch bản `tieucanh` tự gắn `mood=` nên đè cờ).
- Nhân vật v3 (phương án 1: giữ model, đổi cách tô): `toonBands` (`render/materials/world.ts`) lượng tử hóa độ sáng sau chiếu sáng thành ba bậc `TOON_LEVELS` so với màu gốc, giữ texture và viền sáng `rimLight`; gắn trong `mannequinTemplate` khi `?style=da`. Hệ quả có chủ ý: bậc bóng không dưới 0,34 lần màu gốc nên nhân vật sáng hơn nền đêm.
- Viền mực: `InkHulls` (`game/character/inkHull.ts`) thêm một lưới vỏ dùng chung hình học và bộ xương của lưới thân lớn nhất, vật liệu `createInkHullMaterial` (mặt sau, phồng `INK_WIDTH` m theo pháp tuyến). Trần `INK_HULL_MAX` thể (mỗi thể +1 draw call và một lần skinning). Người chơi trong tầm và quái sống trong 32 m được viền; màu theo `inkStateOf` (lộ yếu điểm vàng, vỡ thế lam nhạt, boss sang pha sau đỏ thẫm). Chưa đo draw call/CPU ở cảnh đông.
- Đòn thường là chuỗi hành động (bật cho mọi người, không sau cờ): mỗi đòn khóa theo `ComboHit.lock`, server giữ một lệnh bấm sớm `COMBO_BUFFER_MS`, phòng ngự nhân theo `comboDefScale` (`packages/shared/src/skillrules.ts`, `apps/server/src/game/combat/index.ts`).

- Đòn thường riêng theo lối tu (`PathDef.basic` ở `packages/shared/src/path.ts`, dữ liệu `packages/content/data/paths.json`): áp cho chuỗi đòn thường của người tu lối đó. Hiện chỉ **Kiếm tu**: tầm 5 m (phải áp sát) và chém quét: quái khác trong cung 110° bán kính 5,5 m trước mặt nhận 0,6 lần đòn chính (`inArc`, server tính hướng người đánh → mục tiêu lúc trúng; `resolveSkill.ts`). Tầm lấy qua `skillRangeFor` (`@dtl/content`) ở cả server (`skillRange`) lẫn client (dự đoán hình, tự đánh). Người chưa theo công pháp và 8 lối tu khác vẫn là phi kiếm tầm xa đơn mục tiêu. CHƯA chơi thử trong trình duyệt bằng nhân vật Kiếm tu (client chưa có tự áp sát khi ngoài tầm); sim cân bằng chưa tính phần quét nhiều mục tiêu.
- Bài security riêng: `SECURITY_ONLY=combo pnpm --filter @dtl/bot-client security [http://localhost:<PORT>]` (`apps/bot-client/src/security/combo.ts`): bấm dồn không vượt nhịp khóa, bộ đệm không cộng dồn, né xóa đòn đệm, lệnh rác không sập. Cũng chạy trong bộ đầy đủ.

## Lạc Kiếm Tông (bản đồ đầu tiên được thiết kế lại để so sánh)

Người dùng chốt 27/11: thiết kế lại MỘT bản đồ theo chất game tham khảo trước khi làm rộng. Đề cương, đánh dấu phần đã làm:

1. [x] Nền lùi lại: `daPreset` bớt nắng trăng (`DA_SUN`) và ánh trời (`DA_SKY`), hạ bão hòa; nhân vật tô chia bậc theo màu gốc nên tự nổi trên nền.
2. [x] Đèn đá thành "lửa lạnh" (`DA_FLAME`, quầng nhỏ, đèn thật × `DA_LAMP_K`): điểm sáng dẫn đường, không rọi ấm cả sân.
3. [x] Lớp tối quanh trận: hậu kỳ trong `feedbackLayers` (`render/post.ts`, `postParams.focusDark/focus/focusAspect`, hằng `FOCUS_*`), điều khiển bởi `game/engine/daFocus.ts` theo cờ giao chiến của camera (vào 3/s, ra 1,2/s); điểm ảnh sáng (chiêu, vạch báo, đèn) được giữ. Không thêm draw call.
4. [ ] Rim + fill cho đạo cụ và kiến trúc xa để khối không chìm vào nền.
5. [ ] Bố cục: phía gần camera chỉ để vật thấp; thêm điểm nhấn phát sáng (đốm linh khí, rêu sáng) theo bảng màu hẹp của khu.
6. [~] Quái: tô chia bậc đã bật cho mọi quái khi `?style=da` (`MonsterSkins.material`, trừ quái bán trong suốt); mắt hoặc điểm phát sáng làm dấu nhận diện chưa làm.

Số đo viền mực (27/11, `pnpm shots herolight --bots 8 --view 1080p`, một mẫu mỗi cấu hình): không viền 129 draw / 1,01 triệu tam giác / 10,2 ms khung; viền dùng lưới LOD0 137 / 1,24 triệu / 10,7 ms; viền dùng lưới LOD1 (`INK_LOD`, hiện tại) 136 / 1,16 triệu / 10,3 ms.

Rung camera: khi `?style=da`, `CameraShake.trauma` bật (`game/camera/shake.ts`): các cú rung cộng dồn vào mức trauma (trần `TRAUMA_MAX`), biên độ = trauma², tắt dần `TRAUMA_DECAY`/giây, có lăn nhẹ `TRAUMA_ROLL`; một cú lẻ giữ đúng biên độ cũ.

## Diễn Võ Trường (phòng tập GM, người dùng duyệt 27/11)

Mọi cải thiện Dạ Họa (VFX, animation, nhân vật, đạo cụ, ánh sáng, giao diện, âm thanh, cân bằng) làm và duyệt ở phòng tập TRƯỚC, đạt rồi mới đem ra bản đồ. Lộ trình V0 → V4 và danh sách xưởng nằm ở bản giải pháp của phiên (ngoài repo).

Đã có (V0, phần server):

- Level `dien_vo`: bí cảnh `practice` riêng từng người, mượn bãi phẳng Thiên Lộ Giới; không đợt quái, không kết thúc, không tính lượt hay nhiệm vụ.
- Vào và ra bằng `/gm dvt` (chỉ tài khoản thử). Ra thì về đúng bản đồ và chỗ đứng cũ.
- **Hàng rào** (`apps/server/src/game/practice.ts`): lúc vào chụp nguyên trạng nhân vật trong DB (bảng `practice_snap`); lúc ra, hoặc ở lần vào room kế tiếp nếu server chết giữa chừng, trả lại y nguyên trong một giao dịch. Sổ cái không bị xóa: dòng ghi trong phòng được gắn `practice:`, bỏ khóa chống trùng, và có dòng bù để tổng vẫn khớp túi.

- **Lệnh GM của phòng thử** (server quyết, chỉ tài khoản thử; dùng được ở mọi room): `/gm freeze` (quái đứng yên, giữ trạng thái), `/gm lockhp` (quái không tụt dưới 1 máu), `/gm state weak|break|stun|chant|phase N|clear [giây]` (ép trạng thái lên quái trong 40 m; `weak`/`chant` chỉ bật cờ nên dùng kèm `freeze`), `/gm free` (chiêu không hồi, linh lực đầy; GCD và khóa đòn giữ nguyên), `/gm build <công pháp> [cấp]` (dựng nhân vật thử một nút), `/gm labreset` (trả phòng về như mới).
- **Tab "Diễn Võ"** ở bảng F3 (`apps/client/src/ui/DebugPanel.tsx`): gom các nút trên, gọi quái có ô tìm theo tên.
- **Cảnh mẫu** (V1): `packages/content/data/lab/scenes.json` (kiểu `LabScene`): nhân vật thử, khu đứng, quái, trạng thái, camera khi chụp. `/gm scene <id>` hoặc nút "Nạp cảnh" dựng lại y hệt mỗi lần (trả phòng về như mới → dựng nhân vật → đưa tới khu → gọi quái vào chỗ cố định → đóng băng, khóa máu, bất tử → ép trạng thái). Thêm cảnh = thêm một mục JSON + một dòng tên ở `lab.scene.<id>`.
- **Bộ ảnh chuẩn** `pnpm shots dienvo --out <thư mục> --view 720p|1080p --query style=dahoa [--base <bộ trước>] [--ssim 0.9] [--only id1,id2]`: chụp mọi cảnh mẫu (ẩn HUD) + số đo từng cảnh; có `--base` thì so SSIM/ΔE từng cảnh với bộ trước, báo cảnh dưới ngưỡng và dựng trang `index-<view>.html` (trước · bản đồ chênh · sau). Bộ ảnh nằm ngoài repo. **Sàn nhiễu:** hai lần chụp liên tiếp không đổi gì cho SSIM 0,966–0,986 (đom đóm, tư thế đứng thở), nên ngưỡng mặc định 0,9.

- **Sáu khu** (`packages/shared/src/props.dienvo.ts`, dùng chung client và server): sàn đấu, hố boss, bục nhân vật, hành lang đạo cụ, buồng ánh sáng, tường hiệu ứng. Client vẽ MỘT tấm sàn đá đều màu có ranh và tên khu (`apps/client/src/game/world/dienVoRoom.ts`, 1 draw call); camera phòng khóa 0° để chữ đọc thẳng. `/gm spawn` trong phòng xếp quái thường vào sàn đấu và boss vào hố boss (`dienVoSpawnAt`). Đo ở Dạ Họa, 3 sói: 34 draw call, 137 nghìn tam giác (720p và 1080p).

Chưa có: nội dung riêng cho bục nhân vật, buồng ánh sáng và tường hiệu ứng (mới có ranh, biển và vài đạo cụ); đồng hồ hiệu năng trên tab; nút WebGL2/preset thấp; lưu cảnh từ trong game (hiện sửa JSON bằng tay).

**Phòng đã chỉ ra (việc phải sửa trong phòng trước khi ra bản đồ):**

- Quái bị vỡ thế hay lộ yếu điểm không khác quái thường ở khoảng cách mặc định (viền trạng thái quá mảnh).
- Cảnh boss ở Dạ Họa KHÔNG ngả đỏ: mood theo loại trận đổi sương và trời, mà nền Họa Cảnh không dùng sương.
- Đạo cụ ở Dạ Họa gần như đen đặc (thiếu ánh viền và ánh bù), và tỉ lệ các món lệch nhau nhiều khi đặt cạnh nhau.
- Ô lát sàn gần như không thấy.

## Lộ trình

D0 mood đêm và trang thử → D1 lát cắt (Lạc Kiếm Tông đêm, Kiếm tu, một tinh anh, boss Kiếm Trủng: viền mực, rim theo trạng thái, lớp tối quanh trận, vệt chém theo vùng trúng, rung, số sát thương, đòn thường cận chiến) → D2 chuỗi đòn cho 8 lối tu còn lại → D3 mood mọi bản đồ → D4 UI và âm thanh → D5 thành mặc định.

## Ngoại lệ so với luật mỹ thuật cũ

Art bible v3 cấm viền đen kiểu hoạt hình và skill `tsl-shaders-vfx` cấm inverted hull; Dạ Cảnh được dùng viền mực cho nhân vật và quái (không cho môi trường), có trần số thể được viền.

## Không làm

Không lấy mã hay asset của dự án tham khảo; chỉ dùng kỹ thuật. Mọi thay đổi render phải kèm số đo (cảnh đánh Vân Lam đã ở CPU p95 12–13,7 ms trước Dạ Cảnh).
