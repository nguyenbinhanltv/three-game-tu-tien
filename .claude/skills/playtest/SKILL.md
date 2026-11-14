---
name: playtest
description: Chạy toàn bộ Đạp Thiên Lộ ở máy local (server Colyseus + client Vite), mở trong trình duyệt để chơi thử, chạy bot headless để test tải, chụp ảnh màn hình và đọc log. Dùng khi cần xác nhận một thay đổi hoạt động thật trong game, khi người dùng nói "chạy thử", hoặc trước khi báo một tính năng là xong.
---

# Chạy thử và test tải

> Hiện trạng MVP: không có `pnpm db:migrate` (bảng tự tạo khi server khởi động). Tài khoản thử là đạo hiệu bất kỳ; `http://localhost:5173/?auto=<tên>&debug=1` tự đăng nhập và bật số liệu hiệu năng. Lệnh GM: `/gm level|xp|gold|give|tp|heal|killall|tick`. Trong console có `window.__game`.
> Khi khung trình duyệt tích hợp đang ẩn, `requestAnimationFrame` không chạy: bơm khung hình bằng `setInterval(() => __game.frame(), 16)` trước khi chụp ảnh.

## Khởi động

- Cài đặt lần đầu: `pnpm install`, `pnpm db:migrate`, `pnpm content:check`.
- Chạy cả stack: `pnpm dev` (server ở cổng 2567, client ở cổng 5173). Cấu hình trong `.claude/launch.json` để mở bằng trình duyệt tích hợp.
- Đăng nhập khi phát triển: đặt `AUTH_DEV_BYPASS=1` trong `apps/server/.env.local` để vào bằng tài khoản giả `dev1`…`dev9`, không cần Google. Không bao giờ bật biến này ở môi trường VPS.

## Chơi thử trong trình duyệt

- Mở `http://localhost:5173/?dev=1`, chờ màn hình loading xong, chụp ảnh để xác nhận cảnh hiển thị đúng.
- Với tính năng nhiều người chơi, mở 2 tab với tài khoản dev khác nhau và kiểm tra cả hai thấy nhau.
- Đọc console trình duyệt và log server; lỗi đỏ nào cũng phải giải thích hoặc sửa trước khi báo xong.
- Kịch bản kiểm tra nhanh: vào game → đi lại → đánh 1 con quái → nhặt đồ → mở túi đồ → bật ngự kiếm bay một vòng → rời và vào lại xem đồ còn không.

## Test tải

- `pnpm bots --count 100 --room world --duration 300` chạy bot headless (`apps/bot-client`): đi lại ngẫu nhiên, đánh quái, chat, bật tắt ngự kiếm.
- Trong lúc chạy, đọc `tick_ms` p95, bộ nhớ, số message/giây từ log server. Ngưỡng: tick p95 dưới 25ms.
- Sau test tải, chạy `pnpm ledger:check` để chắc chắn không có vật phẩm/tiền sinh ra không có dòng ledger.

## Báo kết quả

- Nói rõ đã kiểm tra gì bằng mắt, gì bằng số đo, gì chưa kiểm tra được (ví dụ: chưa thử Safari, máy không có GPU).
- Gửi ảnh chụp màn hình nếu thay đổi có phần hình ảnh.
