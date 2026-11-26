# Dạ Cảnh (`?style=da`)

Hướng hình ảnh chính từ 2026-11-27 (người dùng chốt), thay hướng "bán tả thực sương sớm" và dừng kế hoạch đưa Họa Cảnh thành mặc định. Đang dựng sau cờ; **mặc định game chưa đổi** cho tới khi người dùng duyệt lát cắt D1 và bước D5.

Mục tiêu: trận đánh đọc rõ và đã tay ở góc camera 52°. Nền lùi lại (đêm, ít tương phản), nhân vật và chiêu nổi lên.

## Đã có

- Cờ `?style=da` (`base/flags.ts`, loại trừ `painted`): mọi level lấy biến thể đêm của bộ mood riêng (`moodOf` ở `game/engine/levelLoad.ts`).
- Đòn thường là chuỗi hành động (bật cho mọi người, không sau cờ): mỗi đòn khóa theo `ComboHit.lock`, server giữ một lệnh bấm sớm `COMBO_BUFFER_MS`, phòng ngự nhân theo `comboDefScale` (`packages/shared/src/skillrules.ts`, `apps/server/src/game/combat/index.ts`).

- Bài security riêng: `SECURITY_ONLY=combo pnpm --filter @dtl/bot-client security [http://localhost:<PORT>]` (`apps/bot-client/src/security/combo.ts`): bấm dồn không vượt nhịp khóa, bộ đệm không cộng dồn, né xóa đòn đệm, lệnh rác không sập. Cũng chạy trong bộ đầy đủ.

## Lộ trình

D0 mood đêm và trang thử → D1 lát cắt (Lạc Kiếm Tông đêm, Kiếm tu, một tinh anh, boss Kiếm Trủng: viền mực, rim theo trạng thái, lớp tối quanh trận, vệt chém theo vùng trúng, rung, số sát thương, đòn thường cận chiến) → D2 chuỗi đòn cho 8 lối tu còn lại → D3 mood mọi bản đồ → D4 UI và âm thanh → D5 thành mặc định.

## Ngoại lệ so với luật mỹ thuật cũ

Art bible v3 cấm viền đen kiểu hoạt hình và skill `tsl-shaders-vfx` cấm inverted hull; Dạ Cảnh được dùng viền mực cho nhân vật và quái (không cho môi trường), có trần số thể được viền.

## Không làm

Không lấy mã hay asset của dự án tham khảo; chỉ dùng kỹ thuật. Mọi thay đổi render phải kèm số đo (cảnh đánh Vân Lam đã ở CPU p95 12–13,7 ms trước Dạ Cảnh).
