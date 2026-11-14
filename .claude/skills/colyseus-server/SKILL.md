---
name: colyseus-server
description: Quy ước server Colyseus của Đạp Thiên Lộ — cấu trúc room (bản đồ, kênh, bí cảnh, độ kiếp), @colyseus/schema, xác thực input theo nguyên tắc server quyết định, AOI, combat, đăng nhập Google, lưu SQLite/Drizzle bằng transaction và ledger. Dùng khi viết hoặc sửa code trong apps/server hay giao thức trong packages/shared/protocol.
---

# Server Colyseus

> Hiện trạng MVP: `WorldRoom` và `DungeonRoom` trong `apps/server/src/rooms.ts`; toàn bộ luật chơi trong `game/sim.ts`; nhân vật + `tx()` trong `game/character.ts`. Độ kiếp chạy trong room thế giới (chưa có `TribulationRoom`, `LobbyRoom`). Chưa có AOI. Bảng tạo bằng DDL trong `db.ts`. Validator viết tay ngay trong từng handler `on*` của sim. Sau lần đăng nhập đầu server cấp mã phiên (`issueSession`) để vào room khác mà không cần token Google.

## Cấu trúc room

| Room | Một instance là | Ghi chú |
| --- | --- | --- |
| `WorldRoom` | 1 bản đồ × 1 kênh | `maxClients = 50`, tick 20Hz (`setSimulationInterval(…, 50)`) |
| `DungeonRoom` | 1 lượt bí cảnh của 1 tổ đội | Tạo khi vào, tự hủy sau 30 phút hoặc khi trống |
| `TribulationRoom` | 1 lần độ kiếp của 1 người | Pattern thiên lôi chạy trên server |
| `LobbyRoom` | Chọn kênh, chat toàn server | |

- Chuyển room: server cấp vé (`seat reservation`) cho room mới, room cũ lưu trạng thái người chơi xong mới cho rời. Một nhân vật chỉ được ở một room — khóa bằng bảng `sessions` trong DB.

## Đăng nhập

- Client lấy Google ID token (Google Identity Services) → gửi trong `options` khi join.
- `onAuth` kiểm tra token bằng `google-auth-library` (`verifyIdToken`, đúng `audience`), rồi kiểm tra email có trong bảng `invites`. Không có thì từ chối.
- Không bao giờ tin `userId` client tự gửi.

## Trạng thái và giao thức

- Trạng thái đồng bộ bằng `@colyseus/schema`; chỉ đưa vào schema những gì người chơi được phép thấy (không có tỉ lệ rơi đồ, không có vị trí boss ẩn).
- Lệnh từ client là message có kiểu, định nghĩa trong `packages/shared/protocol/messages.ts`. Mỗi message có validator (zod hoặc hàm tay) chạy trước khi xử lý.
- Giới hạn tần suất mỗi client (ví dụ 30 message/giây); vượt thì bỏ và cộng điểm nghi ngờ, vượt nhiều thì ngắt kết nối.

## Server quyết định

- **Di chuyển**: client gửi hướng + thời điểm; server tính vị trí, kiểm tra tốc độ tối đa (chạy/ngự kiếm), độ cao trần bay 300m, vùng cấm bay, va chạm địa hình. Sai thì kéo về vị trí hợp lệ.
- **Combat**: client gửi `useSkill { skillId, targetId }`; server kiểm tra cooldown, GCD, linh lực, tầm, tầm nhìn rồi tự tính sát thương bằng công thức trong `packages/shared/formulas`.
- **Random** (rơi đồ, đột phá, cường hóa, luyện đan) chỉ chạy trên server, ghi log.

## AOI

- Lưới 3D ô 64m. Thực thể trong 64m cập nhật mỗi tick, 64–200m cập nhật 5Hz, xa hơn không gửi. Dùng `StateView`/filter của Colyseus để mỗi client chỉ nhận thực thể trong tầm.

## Lưu dữ liệu

- SQLite qua Drizzle ORM, schema trong `apps/server/src/db/schema.ts`, migration bằng `drizzle-kit`.
- Thay đổi vật phẩm/tiền: một transaction, có `idempotency_key` duy nhất, ghi dòng `ledger` (ai, gì, bao nhiêu, lý do, thời điểm). Không cập nhật số dư mà không có dòng ledger.
- Nhân vật lưu định kỳ 30 giây và khi rời room. Mất kết nối giữ nhân vật 60 giây (`allowReconnection`).

## Test

- Logic thuần (công thức, validator) test bằng vitest trong `packages/shared`.
- Hành vi room test bằng `@colyseus/testing`.
- Thay đổi lớn về room hoặc AOI: chạy test tải bằng skill `playtest` (100 bot) và xem thời gian tick.
- Sau khi sửa, gọi subagent `netcode-reviewer` để soát lỗ hổng.
