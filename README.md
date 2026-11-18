# Đạp Thiên Lộ

MMORPG tu tiên 3D chạy trên trình duyệt, chơi riêng với bạn bè. TypeScript toàn bộ: client Three.js (WebGPU, tự lùi WebGL2) + React, server Colyseus + SQLite, asset kiến trúc sinh bằng Blender.

Spec đầy đủ: https://claude.ai/artifact/S6ZYqLfR37PYy8NyccDjJt

## Chạy ở máy local

Cần Node.js 24 và pnpm 10 (xem `.github/workflows/ci.yml`).

```bash
pnpm install
```

```bash
pnpm dev
```

Mở http://localhost:5173, nhập một đạo hiệu (2–14 ký tự) rồi bấm **Nhập thế**. Mỗi đạo hiệu là một nhân vật riêng, tiến độ lưu trong `apps/server/data/game.db`.

- Server game chạy ở cổng 2567, client dev ở cổng 5173.
- Đăng nhập bằng đạo hiệu chỉ hoạt động khi `apps/server/.env.local` có `AUTH_DEV_BYPASS=1` (đã tạo sẵn cho máy local, không commit).
- Muốn thử nhiều người: mở thêm tab với đạo hiệu khác, hoặc `http://localhost:5173/?auto=TenKhac`.

## Điều khiển

| Việc | Phím |
| --- | --- |
| Di chuyển | W A S D theo hướng đang nhìn (R: tự chạy) |
| Camera | Kiểu FPS: bấm vào màn hình để khóa con trỏ, rê chuột là xoay, lăn chuột để zoom; Esc hoặc Alt để thả chuột. Phím thay thế: ← → ↑ ↓ và - =. Cài đặt có thêm kiểu "Chỉ bàn phím" và "Giữ chuột kéo" |
| Nhảy | Space |
| Ngự kiếm | F (từ Ngưng Khí tầng 3, tốn linh lực). Khi bay: Space lên, Shift xuống |
| Chọn mục tiêu | Tab, hoặc đưa tâm ngắm vào quái rồi bấm chuột trái (bấm lần nữa để đánh) |
| Kỹ năng | 1–8 trên thanh chiêu (phím 1 tự đánh liên tục), 9 pháp bảo phụ, Shift+số cho chiêu bậc cao, Q lướt |
| Cấp cao | V thần thức (giữ), X nguyên anh xuất khiếu, T Ngưng Đan Lô, G phân thân thần niệm |
| Trò chuyện với NPC, hái thuốc, vào cổng | E hoặc bấm chuột |
| Đả tọa | Z |
| Túi đồ / Nhân vật / Nhiệm vụ / Bản đồ / Hướng dẫn | B / C / L / M / H |
| Công pháp / Tổ đội / Cài đặt | K / P / O |
| Chat | Enter |

## Nội dung MVP

- Bản đồ Vân Lam Sơn Mạch 4×4 km: Lạc Kiếm Tông trên đỉnh núi, thung lũng Thanh Khê, rừng Linh Thảo, hồ Sương Mù, Kiếm Trủng.
- Cảnh giới theo thang Tiên Nghịch: Ngưng Khí tầng 1–15, độ kiếp lên Trúc Cơ (sơ / trung / hậu kỳ).
- Kiếm tu với 6 kiếm quyết, combat tab-target, GCD 1 giây.
- 12 nhiệm vụ nối tiếp, 3 NPC (nhiệm vụ, mua bán, luyện đan, cường hóa).
- 7 loại quái thế giới, boss Hàn Giao, bí cảnh Kiếm Trủng 4 đợt cho tối đa 5 người (thưởng vật phẩm 1 lần mỗi ngày).
- Nhiều người cùng đánh một quái: ai góp trên 5% sát thương đều được tu vi và vật phẩm riêng.
- Kênh tự mở thêm khi một kênh đủ 50 người.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `pnpm dev` | Chạy server + client ở chế độ phát triển |
| `pnpm build` | Build client vào `apps/client/dist` |
| `pnpm start` | Chạy server; nếu đã build thì server phục vụ luôn client ở cổng 2567 |
| `pnpm typecheck` | Kiểm tra kiểu toàn bộ |
| `pnpm test` | Test đơn vị của mọi gói (vitest); CI chạy lệnh này trên mỗi PR vào `main` |
| `pnpm test:slow` | Test chậm chạy ffmpeg thật (`audio:test`, vài phút); chạy khi đổi `tools/audio`. `pnpm test:all` chạy cả hai |
| `pnpm content:check` | Kiểm tra dữ liệu game: id trùng, tham chiếu hỏng, thiếu chuỗi |
| `pnpm sim:progress` | Ước tính thời gian lên từng cảnh giới |
| `pnpm bots --count 100 --duration 120` | Bot headless để test tải |
| `pnpm ledger:check` | Đối soát sổ cái với số dư tiền và vật phẩm |
| `pnpm --filter @dtl/bot-client security` | Kiểm tra hồi quy các lỗ hổng đã vá (cần server dev đang chạy) |
| `pnpm assets:build` | Blender (không giao diện) sinh GLB thô rồi tối ưu ra `apps/client/public/assets/<id>.<hash>.glb` + `manifest.json` (xem `assets/README.md`) |
| `pnpm invite add ban@gmail.com` | Thêm email vào danh sách mời (cũng có `remove`, `list`) |

Xem tải server khi đang chạy: http://localhost:2567/health

## Cấu trúc

```
packages/shared    địa hình, di chuyển, công thức, giao thức — dùng chung client và server
packages/content   dữ liệu game dạng JSON + chuỗi tiếng Việt
apps/server        Colyseus: room thế giới, room bí cảnh, SQLite, đăng nhập
apps/client        Vite + Three.js + React
apps/bot-client    bot test tải
tools/blender      script bpy sinh kiến trúc tông môn
```

Nguyên tắc: server quyết định mọi thứ. Client chỉ gửi input và ý định; vị trí, sát thương, rơi đồ, tiền đều do server tính. Mọi thay đổi vật phẩm/tiền chạy trong một transaction SQLite và ghi vào bảng `ledger`.

## Cho bạn bè chơi qua Internet

1. Tạo OAuth Client ID loại **Web application** trong Google Cloud Console, thêm địa chỉ trang của bạn (https) vào *Authorized JavaScript origins*.
2. Trên máy chủ, tạo `apps/server/.env.local`:

   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   AUTH_DEV_BYPASS=0
   ```

3. Build client kèm Client ID rồi chạy server:

   ```bash
   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com pnpm build
   ```

   ```bash
   pnpm start
   ```

4. Mời từng người bằng email Google của họ:

   ```bash
   pnpm invite add ban1@gmail.com ban2@gmail.com
   ```

5. Đặt một reverse proxy có HTTPS (Caddy, Nginx, Cloudflare Tunnel…) trỏ về cổng 2567, có bật WebSocket. Đăng nhập Google yêu cầu trang chạy trên HTTPS.

Không bật `AUTH_DEV_BYPASS=1` trên máy chủ công khai: ở chế độ đó ai cũng vào được bằng bất kỳ đạo hiệu nào và dùng được lệnh GM. Server tự bỏ qua biến này khi `NODE_ENV=production` hoặc khi đã đặt `GOOGLE_CLIENT_ID`, nhưng vẫn nên chạy máy chủ với `NODE_ENV=production` và không chép file `.env.local` của máy local lên.

## Lệnh GM (chỉ khi đăng nhập thử)

Gõ trong khung chat: `/gm level 10`, `/gm xp 500`, `/gm gold 1000`, `/gm give itm_truc_co_dan 1`, `/gm tp 2048 2440`, `/gm heal`, `/gm killall`, `/gm tick`.

## Asset

- Địa hình, cây, đá, mây, nước, nhân vật, quái, hiệu ứng: sinh bằng code Three.js, không cần file ngoài.
- Kiến trúc Lạc Kiếm Tông: `tools/blender/build_sect.py` sinh lưới tô màu theo đỉnh và xuất GLB. Nếu thiếu file GLB, client tự dùng bản kiến trúc đơn giản dựng bằng code.

## Giới hạn đã biết

- Chỉ có một môn phái (kiếm tu) và một bản đồ.
- Chưa có tổ đội, bang hội, giao dịch giữa người chơi, PvP.
- Chưa giới hạn dữ liệu theo vùng nhìn (AOI): mọi người trong kênh nhận trạng thái của cả kênh. Với 50 người mỗi kênh thì ổn.
- Nhân vật và quái là mô hình khối đơn giản, chưa có xương và animation thật.
- Âm thanh mới là hiệu ứng tổng hợp bằng Web Audio (tắt được trong Cài đặt); chưa có nhạc nền.
- Chưa tối ưu cho điện thoại.
- Tỉ lệ rơi đồ nằm trong dữ liệu dùng chung nên đọc được từ mã client (không ảnh hưởng tính công bằng: việc rơi đồ vẫn do server quyết định).
- Chưa giới hạn tần suất request matchmaking theo IP; nếu mở công khai nên đặt giới hạn ở reverse proxy.
