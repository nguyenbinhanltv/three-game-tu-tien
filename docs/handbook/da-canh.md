# Dạ Cảnh (`?style=da`)

Hướng hình ảnh chính từ 2026-11-27 (người dùng chốt), thay hướng "bán tả thực sương sớm" và dừng kế hoạch đưa Họa Cảnh thành mặc định. Đang dựng sau cờ; **mặc định game chưa đổi** cho tới khi người dùng duyệt lát cắt D1 và bước D5.

Mục tiêu: trận đánh đọc rõ và đã tay ở góc camera 52°. Nền lùi lại (đêm, ít tương phản), nhân vật và chiêu nổi lên.

## Đã có

- Cờ `?style=da` (`base/flags.ts`, loại trừ `painted`): mọi level lấy biến thể đêm của bộ mood riêng (`moodOf` ở `game/engine/levelLoad.ts`).
- Mood theo loại trận (`game/engine/daMood.ts`, gọi từ `frameLoop.ts`): `daPreset` lấy preset đêm của level rồi hạ tương phản/bão hòa và nâng đáy đen (sàn sáng cho máy không có đèn lồng thật); tinh anh còn sống trong `DA_ELITE_R` m ngả đỏ sẫm nhẹ, boss trong `DA_BOSS_R` m đỏ sẫm rõ và sương dày hơn. Chỉ chỉnh uniform. Level có mood động riêng (khe Bắc Hoang, Vấn Đỉnh, Giới Trì) giữ cơ chế cũ.
- Chụp so: `pnpm shots camiso --level van_lam --query style=da --out <thư mục>` (kịch bản `tieucanh` tự gắn `mood=` nên đè cờ).
- Nhân vật v3 (phương án 1: giữ model, đổi cách tô): `toonBands` (`render/materials/world.ts`) lượng tử hóa độ sáng sau chiếu sáng thành ba bậc `TOON_LEVELS` so với màu gốc, giữ texture và viền sáng `rimLight`; gắn trong `mannequinTemplate` khi `?style=da`. Hệ quả có chủ ý: bậc bóng không dưới 0,34 lần màu gốc nên nhân vật sáng hơn nền đêm.
- Viền mực: `InkHulls` (`game/character/inkHull.ts`) thêm một lưới vỏ dùng chung hình học và bộ xương của lưới thân lớn nhất, vật liệu `createInkHullMaterial` (mặt sau, phồng `INK_WIDTH` m theo pháp tuyến). Trần `INK_HULL_MAX` thể (mỗi thể +1 draw call và một lần skinning). Người chơi trong tầm và quái sống trong 32 m được viền; màu theo `inkStateOf` (lộ yếu điểm vàng, vỡ thế lam nhạt, boss sang pha sau đỏ thẫm). Chưa đo draw call/CPU ở cảnh đông.
- Đòn thường là chuỗi hành động (bật cho mọi người, không sau cờ): mỗi đòn khóa theo `ComboHit.lock`, server giữ một lệnh bấm sớm `COMBO_BUFFER_MS`, phòng ngự nhân theo `comboDefScale` (`packages/shared/src/skillrules.ts`, `apps/server/src/game/combat/index.ts`).

- Bài security riêng: `SECURITY_ONLY=combo pnpm --filter @dtl/bot-client security [http://localhost:<PORT>]` (`apps/bot-client/src/security/combo.ts`): bấm dồn không vượt nhịp khóa, bộ đệm không cộng dồn, né xóa đòn đệm, lệnh rác không sập. Cũng chạy trong bộ đầy đủ.

## Lộ trình

D0 mood đêm và trang thử → D1 lát cắt (Lạc Kiếm Tông đêm, Kiếm tu, một tinh anh, boss Kiếm Trủng: viền mực, rim theo trạng thái, lớp tối quanh trận, vệt chém theo vùng trúng, rung, số sát thương, đòn thường cận chiến) → D2 chuỗi đòn cho 8 lối tu còn lại → D3 mood mọi bản đồ → D4 UI và âm thanh → D5 thành mặc định.

## Ngoại lệ so với luật mỹ thuật cũ

Art bible v3 cấm viền đen kiểu hoạt hình và skill `tsl-shaders-vfx` cấm inverted hull; Dạ Cảnh được dùng viền mực cho nhân vật và quái (không cho môi trường), có trần số thể được viền.

## Không làm

Không lấy mã hay asset của dự án tham khảo; chỉ dùng kỹ thuật. Mọi thay đổi render phải kèm số đo (cảnh đánh Vân Lam đã ở CPU p95 12–13,7 ms trước Dạ Cảnh).
