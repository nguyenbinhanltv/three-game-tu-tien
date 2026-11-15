---
name: playtest
description: Chạy toàn bộ Đạp Thiên Lộ ở máy local (server Colyseus + client Vite), mở trong trình duyệt để chơi thử, chạy bot headless để test tải, chụp ảnh màn hình và đọc log. Dùng khi cần xác nhận một thay đổi hoạt động thật trong game, khi người dùng nói "chạy thử", hoặc trước khi báo một tính năng là xong.
---

# Chạy thử và test tải

> Hiện trạng MVP: không có `pnpm db:migrate` (bảng tự tạo khi server khởi động). Tài khoản thử là đạo hiệu bất kỳ; `http://localhost:5173/?mute=1&auto=<tên>&debug=1` tự đăng nhập và bật số liệu hiệu năng. Lệnh GM (chỉ tài khoản thử): `/gm level|xp|gold|give|plus|tp|god|heal|die|killall|hurt|spawn|tick|dye|cd|variant|method|set|roll…` (danh sách đủ ở `CLAUDE.md` và `sim.ts`). Trong console có `window.__game` (`__game.info()` cho số đo nhanh). Tham số kiểm thử `?god`, `?at=<địa điểm>`, `?show=char`: xem mục "Tham số URL kiểm thử".
> Khi khung trình duyệt tích hợp đang ẩn, `requestAnimationFrame` không chạy: bơm khung hình bằng `setInterval(() => { __game.renderer._nodes.nodeFrame.update(); __game.frame(); }, 16)` trước khi chụp ảnh (thiếu `nodeFrame.update()` thì pass cảnh không vẽ lại, ảnh chụp là khung cũ).

## Luôn tắt tiếng

Người dùng làm việc cạnh máy chạy thử, tiếng game gây ồn. Mọi lần mở game hoặc trang xem asset để chơi thử, chụp ảnh hay soát bằng mắt đều phải tắt tiếng:

- URL luôn có `mute=1`, ghép với tham số khác bằng `&`: `?mute=1&auto=<tên>`, `?mute=1&dev=1`, `?mute=1&viewer=asset&file=...`. Client đọc tham số này trong `apps/client/src/game/audio.ts` và tắt mọi âm (nhạc, môi trường, SFX) ngay từ đầu.
- Browser panel của Orchestrator (`ao browser open`) cũng dùng URL có `?mute=1`.
- Tự chạy Chromium/Playwright thì thêm cờ `--mute-audio` (ví dụ `chromium.launch({ args: ['--mute-audio'] })`).
- Đang có tab của mình phát tiếng thì đóng ngay, hoặc tải lại với `?mute=1`.
- Bot (`apps/bot-client`) chỉ nối WebSocket, không mở trình duyệt nên không cần gì thêm.

## Khởi động

- Cài đặt lần đầu: `pnpm install`, `pnpm db:migrate`, `pnpm content:check`.
- Chạy cả stack: `pnpm dev` (server ở cổng 2567, client ở cổng 5173; đổi cổng xem mục "Chạy song song nhiều worktree"). Cấu hình trong `.claude/launch.json` để mở bằng trình duyệt tích hợp.
- Đăng nhập khi phát triển: đặt `AUTH_DEV_BYPASS=1` trong `apps/server/.env.local` để vào bằng tài khoản giả `dev1`…`dev9`, không cần Google. Không bao giờ bật biến này ở môi trường VPS.

## Chạy song song nhiều worktree

Nhiều worktree (nhiều agent) có thể cùng chạy `pnpm dev`, nhưng mỗi worktree phải có cặp cổng riêng.

- Biến cổng:
  - `PORT`: cổng server, mặc định 2567.
  - `CLIENT_PORT`: cổng Vite, mặc định 5173 (preview mặc định 4173). `vite preview` chạy bản build nên không biết `PORT`/`CLIENT_PORT`: nó chỉ tự nối server khi chạy ở 4173 với server 2567. Muốn preview ở cặp cổng khác thì build bằng `VITE_SERVER_URL=ws://localhost:2597 pnpm build`, không thì client nối nhầm vào chính server preview.
  - `VITE_SERVER_URL`: URL WebSocket đầy đủ, ghi đè cách client tự suy `ws://<host>:$PORT`. Đặt bằng biến môi trường hoặc trong `apps/client/.env.local`, không đặt trong `apps/server/.env*`. Giá trị từ file env của server chỉ dùng khi chạy dev/preview, không bao giờ vào bản build; còn `VITE_SERVER_URL` lấy từ biến môi trường hay `apps/client/.env*` thì vẫn vào bản build, nên đừng để nó khi build production.
  - `SERVER_URL`: địa chỉ server cho bot và security-check (nếu không đặt thì chúng suy từ `PORT`).
- Chọn cặp cổng: worktree chính dùng mặc định 2567/5173. Worktree khác lấy cặp `2500+N`/`5100+N` với `N` ít va chạm, ví dụ số cuối trong tên session (`three-game-tu-tien-10` → `2510/5110`). Hai số ví dụ trong tài liệu là `2597/5197`.
- Kiểm cổng trước khi chạy. Cả hai cổng phải trống:
  - Git Bash: `netstat -ano | grep LISTENING | grep -E ":(2597|5197)\b"`
  - PowerShell: `Get-NetTCPConnection -State Listen -LocalPort 2597,5197`
  Cổng bận nghĩa là của worktree khác: đổi cặp khác, KHÔNG dùng server đó và KHÔNG kill nó. Vite chạy `strictPort`, nên khi cổng bận nó báo lỗi chứ không tự nhảy sang cổng khác.
- Cách chạy:
  - Git Bash: `AUTH_DEV_BYPASS=1 PORT=2597 CLIENT_PORT=5197 pnpm dev`
  - PowerShell: `$env:AUTH_DEV_BYPASS=1; $env:PORT=2597; $env:CLIENT_PORT=5197; pnpm dev`. Biến sẽ còn trong cửa sổ đó.
  - Hoặc ghi `PORT=2597` và `CLIENT_PORT=5197` vào `apps/server/.env.local` của worktree. Cả server, Vite và bot đều đọc file này; biến môi trường thật được ưu tiên hơn.
  Mỗi worktree đã có DB riêng (`apps/server/data/game.db`). Nếu chạy hai stack trong cùng một worktree thì đặt thêm `DB_FILE=` riêng.
- Mở `http://localhost:5197/?mute=1&auto=<tên>` rồi xác nhận client nối đúng server: log server của mình phải có dòng `[join] <tên>`, hoặc `curl localhost:2597/health` phải thấy `online` tăng. Đặt đạo hiệu riêng cho mỗi worktree. Nếu log có tên lạ, đó là trình duyệt hoặc bot của session khác đã vào nhầm cổng của mình. Đừng dựa vào số `online` khi đó.
- Bot và security-check:
  - `SERVER_URL=ws://localhost:2597 pnpm bots --count 10 --duration 60`, hoặc `--url ws://localhost:2597`.
  - `PORT=2597 pnpm --filter @dtl/bot-client security`, hoặc truyền `http://localhost:2597` làm đối số. Bài 13 (`?god`/`?at`) tự dựng tạm hai server ở cổng trống ngẫu nhiên với DB tạm (`GOOGLE_CLIENT_ID` giả, rồi `NODE_ENV=production`) và tự tắt; không đụng server khác.
- Tự tắt server của mình khi xong. Trên Windows, dừng tiến trình `pnpm dev` cha có thể để lại tiến trình node con vẫn giữ cổng. Ghi lại PID đang nghe ở hai cổng của mình ngay sau khi khởi động (`netstat -ano`). Khi xong, chỉ kill đúng các PID đó, ví dụ `taskkill //PID <pid> //T //F` trong Git Bash. Sau đó kiểm lại để chắc hai cổng đã trống. Không bao giờ kill theo tên tiến trình (`node.exe`), vì sẽ giết luôn server của worktree khác.
- `.claude/launch.json` vẫn cố định 2567/5173 cho worktree chính.

## Chơi thử trong trình duyệt

- Mở `http://localhost:5173/?mute=1&dev=1`, chờ màn hình loading xong, chụp ảnh để xác nhận cảnh hiển thị đúng.
- Với tính năng nhiều người chơi, mở 2 tab với tài khoản dev khác nhau và kiểm tra cả hai thấy nhau.
- Đọc console trình duyệt và log server; lỗi đỏ nào cũng phải giải thích hoặc sửa trước khi báo xong.
- Kịch bản kiểm tra nhanh: vào game → đi lại → đánh 1 con quái → nhặt đồ → mở túi đồ → bật ngự kiếm bay một vòng → rời và vào lại xem đồ còn không.

## Tham số URL kiểm thử (M1-10)

Ghép sau `?mute=1&auto=<tên>`. Chỉ chạy với tài khoản thử (đăng nhập thử khi server bật `AUTH_DEV_BYPASS=1`); server kiểm ở `apps/server/src/testflags.ts`. Tài khoản Google thật xin `?god`/`?at` thì bị bỏ qua và nhận thông báo `sys.test_denied`; server có `NODE_ENV=production` hoặc `GOOGLE_CLIENT_ID` thì không có đăng nhập thử nên không có đường tắt nào.

- `?god`: bất tử. Vẫn bị đánh (số sát thương, khựng hiện như thường) nhưng không mất máu, đi theo cả khi vào bí cảnh. Bật/tắt lúc chơi: `/gm god [on|off]`. `/gm die` vẫn chết được để thử hồi sinh. Có god thì độ kiếp luôn thành công (thất bại duy nhất là chết): đừng dùng `?god` khi đo độ khó độ kiếp/bí cảnh.
- `?at=<địa điểm>`: vào game ở điểm đặt tên, như `/gm tp <địa điểm>` lúc đang chơi. Chỉ áp lần vào đầu (không áp lại khi từ bí cảnh về). Bảng ở `packages/content/data/places.json` (chỉ server đọc; `content:check` kiểm). Hiện có: `tong_mon` (sân, điểm hồi sinh), `cong` / `kiem_trung` (đài truyền tống tới Kiếm Trủng; bí cảnh là room riêng nên vào bằng cổng, cần cấp 8: thêm `/gm level 8`), `thung_lung` (Sói Xám), `heo_rung`, `yeu_lang`, `rung`, `hoa_ho`, `thach_vien`, `u_minh`, `ho` (bờ đông hồ, cùng chỗ đường camera `ho` của bench), `boss` (mặt hồ, cách đảo Hàn Giao ~55m), `kt_giua` (giữa Kiếm Trủng, chỉ dùng trong room bí cảnh). Id lạ thì không dịch chuyển, chat in danh sách id hợp lệ.
- `?show=char`: alias trang xem asset cho model người chơi (`chr_kiem_tu_nam`); `?show=<id asset>` mở asset bất kỳ trong `manifest.json`. Tương đương `?viewer=asset&file=assets/<id>.<hash>.glb` mà không cần biết hash.
- `__game.info()`: `{ backend, drawCalls, triangles, geometries, textures, frames, room, x, y, z, hp, players, monsters, lod, particles }`. Draw call và tam giác là của khung vừa vẽ, cộng dồn qua mọi pass (bóng, cảnh, hậu kỳ), vì `renderer.info.autoReset = false` và reset ở đầu `frame()`. Gọi lúc đang tải thì trả số 0.
- Ví dụ: `http://localhost:5197/?mute=1&auto=thu&god&at=boss` (đánh Hàn Giao không chết), `?mute=1&auto=thu&at=rung&debug=1` (đo ở rừng).
- Thêm điểm mới: thêm dòng vào `places.json` (id `a-z0-9_`, `level` là `van_lam` hoặc `kiem_trung`), chạy `pnpm content:check`.

## Test tải

- `pnpm bots --count 100 --room world --duration 300` chạy bot headless (`apps/bot-client`): đi lại ngẫu nhiên, đánh quái, chat, bật tắt ngự kiếm.
- Cờ bot: `--crowd x,z[,r]` (đi lại quanh điểm), `--fight x,z[,r]` (đánh quái trong vùng bằng đủ chiêu, tự `/gm heal`), `--level N` (`/gm level N` lúc vào), `--tp` (dịch chuyển thẳng vào vùng), `--dungeon` (vào bí cảnh qua cổng; room tối đa 5 người). Gõ `quit` vào stdin để bot rời êm. Đo hiệu năng client giữa đám đông: `pnpm bench:crowd` (skill `perf-budget`).
- Bot chạy chung một IP nên sẽ vướng giới hạn `/matchmake` (40 dồn, 20/phút mỗi IP): bật server test tải với `RATE_LIMIT_EXEMPT=loopback`. Bài `security` thì ngược lại, chạy với server KHÔNG miễn trừ.
- Trong lúc chạy, đọc `tick_ms` p95, bộ nhớ, số message/giây từ log server. Ngưỡng: tick p95 dưới 25ms.
- Sau test tải, chạy `pnpm ledger:check` để chắc chắn không có vật phẩm/tiền sinh ra không có dòng ledger.

## Báo kết quả

- Nói rõ đã kiểm tra gì bằng mắt, gì bằng số đo, gì chưa kiểm tra được (ví dụ: chưa thử Safari, máy không có GPU).
- Gửi ảnh chụp màn hình nếu thay đổi có phần hình ảnh.
