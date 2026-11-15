# M-1: dữ liệu vùng & bố cục bản đồ mới

Kế hoạch gốc: bước M-1 của "Kế hoạch nâng cấp bản đồ, mật độ quái và minimap" (2026-11-15).

## Đã làm

- **Dữ liệu** `packages/content/data/levels/van_lam.json`: `zones` (id, khoảng cấp, màu bản đồ, nhạc, đa giác ranh; tên ở i18n `zone.<id>`), `camps` (tâm, loại quái, cụm 3–4 con, bán kính 18–30 m, hồi sinh, `ranged` = thêm một quái đánh xa), `spawns` giờ chỉ còn tinh anh và boss. Kiểu ở `packages/shared/src/types.ts` (`ZoneDef`, `CampDef`), hàm dùng chung ở `packages/shared/src/zones.ts` (`inPoly`, `zoneAt`, `campSpawns`, `levelSpawns`).
- **Server** đọc camps theo cách đơn giản nhất: `levelSpawns(level)` đổi mỗi camp thành điểm sinh `count` con quanh tâm (+1 con đánh xa), nên hồi sinh vẫn là luật cũ (từng con, `respawn` giây). Hồi sinh theo số người và AOI để M-2.
- **content:check** kiểm: id vùng/camp, tên i18n, màu, nhạc, khoảng cấp, đa giác trong vùng chơi, camp nằm trong vùng hợp cấp (khoảng cấp camp ⊂ khoảng cấp vùng), count 3–4, bán kính 18–30, quái `ranged` có `ai.caster`, không dưới nước, không đè collider, mỗi vùng 2–3 tinh anh hợp cấp, tổng quái thường 300–380.
- **Bố cục** (`packages/shared/src/level.ts`, `terrain.ts`, `movement.ts`):

  | Vùng | Tâm | Cách tông môn | Cấp |
  |---|---|---|---|
  | Thung Lũng Thanh Phong | (2048, 2460) | 412 m | NK 1–4 |
  | Suối Thanh Khê (mới) | (2390, 2440) | 500 m | NK 4–8 |
  | Rừng Linh Thảo | (2450, 2110) | 402 m | NK 8–12 |
  | Vách Đá Ngọc (mới) | (2450, 1740) | 495 m | NK 11–15 |
  | Bãi Hồ Sương Mù | (1640, 2230) | 417 m | NK 13–15, boss Hàn Giao ở đảo giữa hồ |
  | Bệ cổng bí cảnh | (2048, 1720) | 328 m | |
  | Kiếm Trủng | (1520, 1300) | cách bệ cổng 667 m | bí cảnh |

  Thế giới vẫn 4096 m. Vùng chơi chính 2,2 × 2,2 km quanh tông môn (`PLAY_HALF` 1100): ngoài chân vách `PLAY_WALL` địa hình dựng lên +330 m trong 60 m, và `stepMove` đẩy người (cả khi ngự kiếm) về chân vách, nên đi tới ranh gặp vách chứ không bị dịch chuyển. Hồ thu nhỏ (nước bán kính 300 → bãi ven hồ phẳng 150–215 m để đi bộ và đánh quái; phía đông giáp núi sát tông môn). Đường mòn nối các vùng ở `render/groundMask.ts`. NPC tông môn không đổi chỗ; prop, đèn, cổng, nhiệm vụ, điểm đặt tên (`places.json`), cảnh mở đầu (`SECT_PATH`, phải vượt gờ núi 181 m ở z≈2240), tool chụp ảnh đã trỏ theo bố cục mới.
- **`pnpm map:report [--png out.png] [--json out.json]`** (`packages/content/src/mapreport.ts`): diện tích vùng, mật độ quái, khoảng cách tông môn–vùng và giữa các vùng, độ phủ (khoảng cách tới quái thường gần nhất trên lưới điểm), quét chỗ kẹt (đẩy 8 hướng theo luật `stepMove`, quanh vật cản/ranh và tại tâm bãi, NPC, cổng, điểm đặt tên), ảnh nhìn từ trên xuống.

## Số liệu trước/sau

Xem `truoc-map-report.md` và `sau-map-report.md` (cùng lệnh `pnpm map:report`, vị trí quái lấy mẫu tất định).

| | Trước (main) | Sau (M-1) |
|---|---|---|
| Quái thường (+tinh anh +boss) | 78 (+3 +1) | 364 (+13 +1) |
| Diện tích vùng săn | 0,284 km² (đĩa spawn, chồng nhau) | 0,199 km² (zones) |
| Quái / km² vùng săn | 274 | 1 831 |
| Tông môn → tâm vùng | 407–827 m | 402–532 m |
| Tông môn → cổng bí cảnh | 540 m | 340 m |
| Độ phủ ≤ 35 m (trong vùng săn) | 60,0 % (max 106 m) | 99,9 % (p95 25 m, max 37,6 m) |
| Chỗ kẹt (quét 8 hướng) | 0 | 0 |

Tốc độ lên cấp `pnpm sim:progress`: **2,2 giờ** tới NK 15 viên mãn, không đổi (sim chỉ dùng cấp quái theo vùng, chưa tính đi lại; chỉnh ở 3-10).

Tải: `pnpm bots --count 100 --duration 120` rồi `pnpm ledger:check`: 100 bot (2 kênh × 50), 378 quái mỗi kênh, tick server p95 ≈ 2,1 ms (trước ~1–2 ms với 82 quái); sổ cái khớp.

## Ảnh

- `truoc-tren-cao.jpg`, `sau-tren-cao.jpg`: nhìn từ trên xuống cùng khung 948…3148 (đỏ/vàng/trắng: boss, tinh anh, quái thường; nét màu: ranh vùng; chấm trắng lớn: tông môn; chấm lam: cổng).
- `mat-dat-suoi.jpg`, `mat-dat-vach.jpg`, `mat-dat-ho.jpg`, `mat-dat-ranh.jpg`: ảnh mặt đất (WebGPU, preset Cao, Chrome GPU thật): Suối Thanh Khê, Vách Đá Ngọc, bãi hồ phía tây, vách ở ranh vùng chơi.

## Kiểm khác

- `pnpm --filter @dtl/bot-client security`: 80/80 ĐẠT (chạy lại vì đổi luật di chuyển `stepMove`; sửa toạ độ `?at=thung_lung` trong bài kiểm tra).
- `pnpm bench:client` (RTX 3060 Ti, Chrome): vẫn dưới ngân sách draw call (≤ 191 so với 300) và tam giác (≤ 985k). Hai điểm cần theo dõi, đều do mật độ quái và vùng gần nhau hơn: ở bãi hồ (`ho`, đứng giữa ~85 quái) WebGPU/Cao texture 513,7 MB (main: 450 MB, ngân sách 512), WebGPU/Thấp CPU p95 9,9 ms (một lần đo, có thể là nhiễu lần đầu nạp); WebGL2/Cao ở `rung` và `ho` CPU p95 10,3 / 8,8 ms (main: 8,0 / 5,4). Để M-2/M-3 và 3-10 xử lý (LOD/ngân sách quái, nạp lười asset theo vùng).
- WebGL2/Cao: khung đầu có một tác vụ chính ~9,8 s (biên dịch shader, giống hệt trên main); server đôi khi cắt kết nối (mã 1006) vì không nhận được ping, client tự nối lại. Trên main không thấy trong 2 lần đo, trên nhánh này thấy cả 5 lần (bản thân kết nối lại ổn nhưng sinh lỗi console "WebSocket is already in CLOSING"). Chưa tìm ra nguyên nhân gốc; nghi ngờ do trạng thái ban đầu lớn hơn (378 quái). Nên kiểm khi làm AOI (M-2).
- Cổng và tiến trình: chỉ dùng PORT=2589 / CLIENT_PORT=5190, đã tắt.
