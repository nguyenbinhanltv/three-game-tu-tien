# E2-E: Thần thức, ô chiêu 9, Ngưng Đan Lô

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2e/<file>`.

Thiết kế: `docs/EXPANSION_DESIGN.md` mục 2.5 (mở khóa), 7.1 (pháp bảo), 8 (ô chiêu), 11.2 (gói E2-E). Ảnh chụp bằng `pnpm shots:e2e --out <thư mục tuyệt đối>` (Đoạn Mạch, Kết Đan sơ kỳ, tắt tiếng, GPU thật). Dữ liệu quét thật nằm ở `e2e-log.json`.

## Thần thức (phím V, giữ)

- Mở ở **Kết Đan sơ kỳ (cấp 20)**. Giữ V 2,5 giây (hủy nếu thả sớm, di chuyển > 1,5 m, bị đánh, chết, độ kiếp/tâm ma/tỉ thí). Quét xong mới tốn 20 linh lực và vào hồi chiêu 20 giây; hủy giữa chừng không tốn gì.
- Phạm vi theo cấp: **60 m** (cấp 20), **80 m** (21–27), **120 m** (28+); `ngọc thần thức` (+3 m) đã có tham số `bonus` trong `spiritRadius`, chờ E2-F thêm linh ngọc cấp 5.
- Lộ ra: thủ lĩnh, tinh anh, quái thường, điểm hái còn mọc, người chơi khác (ngoài tổ đội) và điểm đáng chú ý (`pois`) trong phạm vi. Tối đa 90 điểm, boss/tinh anh được giữ trước. Hiện 6 giây: cờ trên minimap (`ui/minimap`, kiểu `scan`), cột sáng trong thế giới (`game/scan.ts`: boss đỏ, tinh anh cam, điểm hái xanh lục, người chơi lam, điểm đáng chú ý vàng; quái thường chỉ ở minimap), vòng hội tụ dưới chân lúc vận, sóng quét nở ra khi xong.
- **Server quyết định mọi thứ** (`apps/server/src/game/spirit.ts`): client chỉ gửi `{on: boolean}` (`C.SPIRIT`), nhận `S.SPIRIT_STATE` (mở khóa, đang vận, hồi chiêu, phạm vi) và `S.SPIRIT_SCAN` (kết quả, chỉ gửi người quét). Hồi chiêu sống ở cấp tiến trình theo id nhân vật nên đổi room không xóa được. Không đụng túi/tiền nên không có ledger.
- Chưa làm (không có trong dữ liệu hiện tại): cạm bẫy vô hình, đảo ảo (bản đồ 3), đường tuần tra quái hộ tống ở cấp 22 (không có quái hộ tống nào), người chơi "ẩn" (chưa có cơ chế ẩn thân: thần thức hiện mọi người ngoài tổ đội trong tầm).

## Phím

| Phím | Việc |
| --- | --- |
| `V` | Thần thức (giữ). **Bảng Công pháp chuyển từ V sang `K`** |
| `T` | Bản mệnh pháp bảo Ngưng Đan Lô |
| `1`–`8` | Như cũ |
| `9` | Pháp bảo phụ (giữ tương thích) |
| `0` | **Ô chiêu 9: thần thông** của công pháp (Kết Đan) |
| `Shift+1…` | Hàng chiêu bậc cao, nay chỉ còn chiêu cấp 16, 18, 22 (thần thông cấp 20 đã lên ô 9) |

Ô 9 là chiêu mở ở cấp 20 của từng công pháp (Kiếm Đan Bản Mệnh, Sơn Nhạc Hóa Thân, Ngưng Đan Hộ Thế), `thanThongSkill` trong `@dtl/content`. `Game.bar()` = 8 ô chính, rồi ô 9 (chỉ số `BAR_SIZE`), rồi hàng bậc cao (chỉ số ≥ `BAR_SIZE + 1`). Ô 10 (Hóa Thần) để chương sau.

## Ngưng Đan Lô (bản mệnh pháp bảo)

- Tự có khi lên Kết Đan (cấp 20), **không tháo, không nằm trong túi**: cấp theo cấp của chủ (`bondedLevel`: cấp 20 = 1 … cấp 24+ = 5), nên không cần linh khí hay vật phẩm, không đụng ledger. Pháp bảo phụ ở ô 8 (phím 9) giữ nguyên, hai thứ dùng cùng lúc được.
- Kỹ năng **Ngưng Đan Hồi Nguyên**: hồi 12% khí huyết tối đa (nhân hệ số cấp) cho bản thân và đồng đội cùng tổ đội trong 14 m, tốn 40 linh lực, hồi chiêu 45 giây (giảm theo cấp). Nội tại: khí huyết tối đa +2% mỗi cấp (`character.ts`).
- Dữ liệu `packages/content/data/artifacts.json` (`bonded: true`, loại mới `heal`), công thức `packages/shared/src/artifacts.ts`, server `GameSim.onBonded` (chung đường `fireArtifact` với pháp bảo phụ) + `artifact.ts`, client `artifactVis.ts` (lơ lửng sau vai, bay lên đầu khi vận) dùng asset có sẵn `prop_ngung_dan_lo` (không dựng model mới).

## Ảnh

| Ảnh | Nội dung |
| --- | --- |
| `01-thanh-chieu-truoc-ket-dan.jpg` | Thanh chiêu cấp 19: chưa có ô 9, Lô, thần thức |
| `02-thanh-chieu-ket-dan-o9-lo-than-thuc.webp` | Cấp 20: ô 9 (phím 0), pháp bảo phụ (9), Lô (T), thần thức (V) |
| `03/04/05-tooltip-*.jpg` | Mô tả ô 9, Ngưng Đan Lô, thần thức |
| `06-than-thuc-dang-van.jpg` | Đang giữ V: vòng hội tụ, nút V sạc |
| `07-than-thuc-song-quet.webp` | Quét xong: sóng nở, thông báo kết quả |
| `08*-than-thuc-cot-sang-*.webp`, `09-minimap-co-than-thuc.webp` | Cột sáng và cờ trên minimap |
| `10-than-thuc-hoi-chieu.jpg` | Nút V hồi chiêu |
| `11/12/13-ngung-dan-lo-*.jpg` | Lô vận chiêu (cột đan hỏa mờ, số hồi), rồi treo bên hông |
| `14-o9-than-thong-phim-0.webp` | Bấm phím 0 ra thần thông ô 9 |

## Kiểm

`pnpm typecheck`, `pnpm test` (có `spirit.test.ts`, `bonded.test.ts`, `packages/content/src/spirit.test.ts`), `pnpm content:check` (thêm kiểm bản mệnh duy nhất, `bondedLevel`, `spiritRadius`, mỗi công pháp có đúng một thần thông ô 9, chuỗi i18n), `pnpm --filter @dtl/bot-client security` (thêm mục f cho thần thức và Lô), `pnpm bots --count 100` + `pnpm ledger:check`.

## Ảnh then chốt

- `08-than-thuc-cot-sang-minimap.webp`
