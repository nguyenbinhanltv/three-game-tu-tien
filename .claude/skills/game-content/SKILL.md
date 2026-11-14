---
name: game-content
description: Thêm và cân bằng nội dung game Đạp Thiên Lộ — cảnh giới theo Tiên Nghịch, quái, skill, vật phẩm, đan dược, pháp bảo, nhiệm vụ, bí cảnh, bảng thuật ngữ — dưới dạng dữ liệu trong packages/content, và mô phỏng tốc độ lên cấp/kinh tế. Dùng khi tạo hoặc sửa nội dung, công thức chỉ số, hay chữ hiển thị trong game.
---

# Nội dung và cân bằng

> Hiện trạng MVP: dữ liệu nằm phẳng trong `packages/content/data/` (items.json, monsters.json, loot.json, skills.json, recipes.json, npcs.json, quests.json, realms.json, levels/*.json, glossary.json, i18n/vi.json, i18n/vi.ui.json). Chưa có schema zod; `src/check.ts` kiểm tra bằng code. Các đợt quái bí cảnh khai trong `apps/server/src/rooms.ts` (WAVES). Bảng rơi đồ và linh thạch rơi (`gold`, `drops`) của quái nằm trong `loot.json` (khóa theo id quái), chỉ server đọc qua `@dtl/content/loot`; không đặt lại vào `monsters.json` vì tệp đó vào bundle client.

## Dữ liệu ở đâu

```
packages/content/
  glossary.json      thuật ngữ chuẩn: cảnh giới, chỉ số, loại vật phẩm (vi + key i18n)
  realms.json        thang cảnh giới, tu vi cần, chỉ số gốc, skill mở khóa
  monsters/*.json    quái
  skills/*.json      skill theo môn phái
  items/*.json       vật phẩm, đan dược, pháp bảo, nguyên liệu
  recipes/*.json     công thức luyện đan, cường hóa
  quests/*.json      nhiệm vụ
  dungeons/*.json    bí cảnh
  levels/*.json      xuất từ Blender (xem skill blender-pipeline)
  vfx/*.json         cấu hình hiệu ứng
  i18n/vi.json       chuỗi hiển thị
```

- Mỗi loại có schema zod trong `packages/content/schema/`. `pnpm content:check` kiểm tra schema, id trùng, tham chiếu hỏng (quái rơi vật phẩm không tồn tại…). Chạy lệnh này sau mọi thay đổi.
- Id: `snake_case` không dấu, có tiền tố (`mon_soi_xam`, `skl_kiem_khi_tram`, `itm_truc_co_dan`). Không đổi id đã phát hành; đổi tên hiển thị qua i18n.

## Thang cảnh giới (theo Tiên Nghịch)

| Bước | Cảnh giới | Có từ |
| --- | --- | --- |
| 1 | Ngưng Khí (tầng 1–15) → Trúc Cơ | MVP |
| 1 | Kết Đan → Nguyên Anh → Hóa Thần → Anh Biến → Vấn Đỉnh | Alpha |
| 2 | Âm Hư → Dương Thực → Khuy Niết → Tịnh Niết → Toái Niết, qua Thiên Nhân Ngũ Suy | Dài hạn |
| 3 | Không Niết → Không Linh → Không Huyền → Không Kiếp | Dài hạn |
| 4 | Đạp Thiên | Đích cuối |

- Từ Trúc Cơ trở lên: sơ kỳ / trung kỳ / hậu kỳ / đại viên mãn.
- Tên viết từ trí nhớ bản dịch tiếng Việt; khi người dùng sửa thì `realms.json` và `glossary.json` là nguồn đúng.
- Hệ cảnh giới mượn từ Tiên Nghịch chỉ được vì game chơi riêng, không thương mại. Cốt truyện, NPC, địa danh, công pháp phải tự sáng tác, không chép tình tiết hay nhân vật của truyện.

## Thế giới

- Thế giới: Huyền Linh Giới. Bản đồ MVP: Vân Lam Sơn Mạch. Tông môn khởi đầu: Lạc Kiếm Tông (kiếm tu).

## Cân bằng

- Công thức (sát thương, phòng thủ, tu vi cần mỗi tầng, tỉ lệ đột phá) viết trong `packages/shared/formulas/` dưới dạng hàm thuần + test.
- Mục tiêu nhịp MVP (chốt 2026-11-15, thay mốc 10–15 giờ cũ): Ngưng Khí 1 → viên mãn tầng 15 khoảng 3–4 giờ chơi thực tế, tức `pnpm sim:progress` quanh 2–2,5 giờ (sim chưa tính đi lại, boss, bí cảnh). Nhịp sẽ dài thêm khi có thêm nội dung; đổi đường cong `xpNeed` là quyết định của người dùng.
- `pnpm sim:progress` mô phỏng một người chơi 30 ngày (giờ chơi/ngày làm tham số), in thời điểm đạt từng cảnh giới và tổng linh thạch sinh/tiêu. Chạy sau khi đổi số tu vi, phần thưởng hay giá.
- Không bán chỉ số bằng tiền thật (game không thu tiền, nhưng giữ nguyên tắc này nếu sau này mở rộng).

## Chữ hiển thị

- Mọi chữ hiển thị nằm trong `i18n/vi.json`, viết tiếng Việt có dấu, giọng cổ phong vừa phải, dễ đọc.
- Sau khi thêm nội dung có tên riêng, gọi subagent `lore-keeper` để soát thuật ngữ và tính nhất quán.
