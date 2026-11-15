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
| Quái thường (+tinh anh +boss) | 78 (+3 +1) | 353 (+13 +1) |
| Diện tích vùng săn | 0,284 km² (đĩa spawn, chồng nhau) | ~0,2 km² (zones) |
| Quái / km² vùng săn | 274 | ~1 800 |
| Tông môn → tâm vùng | 407–827 m | 402–532 m |
| Tông môn → cổng bí cảnh | 540 m | 340 m |
| Độ phủ ≤ 35 m (trong vùng săn) | 60,0 % (max 106 m) | 99,6 % (p95 25 m, max 44 m) |
| Chỗ kẹt (quét 8 hướng) | 0 | 0 |

Tốc độ lên cấp `pnpm sim:progress`: **2,2 giờ** tới NK 15 viên mãn, không đổi (sim chỉ dùng cấp quái theo vùng, chưa tính đi lại; chỉnh ở 3-10).

Tải: `pnpm bots --count 100 --duration 120` rồi `pnpm ledger:check`: 100 bot (2 kênh × 50), ~367 quái mỗi kênh, tick server p95 ≈ 2,1 ms (trước ~1–2 ms với 82 quái); sổ cái khớp.

## Ảnh

- `truoc-tren-cao.jpg`, `sau-tren-cao.jpg`: nhìn từ trên xuống cùng khung 948…3148 (đỏ/vàng/trắng: boss, tinh anh, quái thường; nét màu: ranh vùng; chấm trắng lớn: tông môn; chấm lam: cổng).
- `mat-dat-suoi.jpg`, `mat-dat-ho.jpg`, `mat-dat-rung.jpg`, `mat-dat-ranh.jpg`: ảnh mặt đất (WebGPU, preset Cao, Chrome GPU thật): Suối Thanh Khê, bãi hồ phía tây, Rừng Linh Thảo, vách ở ranh vùng chơi.

## Sửa sau soát (orchestrator)

- **Ngắt kết nối 1006 / `"refId" not found` ở WebGL2/Cao: đã tìm ra và sửa.** Khung đầu WebGL2 có một tác vụ chính 10–13 s (biên dịch shader, cả trên main). Trong lúc đó trình duyệt không đọc socket. Colyseus mã hóa patch vào một bộ đệm dùng chung và đưa thẳng cho `ws`; với gói lớn `ws` không sao chép mà ghi bất đồng bộ từ chính bộ đệm đó, nên gói nằm chờ trong hàng đợi bị tick sau ghi đè, client giải mã hỏng (mất đồng bộ trạng thái). Quái nhiều (378) làm patch đủ lớn để dính, nên main không gặp. Thử nghiệm: giảm số quái xuống 50 % thì hết lỗi; sửa gốc: `apps/server/src/index.ts` sao chép gói (`Buffer.from`) trước khi gửi. Trước đó còn một nguyên nhân phụ là ping/pong (3 s × 2 lần ≈ 9 s ngắn hơn cú treo 10–13 s) nên nới `pingMaxRetries` lên 10 (~33 s). Sau sửa: 0 lần ngắt và 0 lỗi console trong 4/4 lần đo riêng và 10/10 lần `bench:client` (5 WebGL2/Cao + 5 WebGPU/Cao); trước sửa lỗi xuất hiện 4/5 lần WebGL2.
- **Ngân sách**: pháp tuyến mặt đất tải nửa độ phân giải (512, −32 MB VRAM), quái chỉ dựng model trong 100 m (trước 240 m). Texture bãi hồ tối đa 474 MB (< 512). Draw call ≤ 167, tam giác ≤ 971k. CPU p50 3–6 ms; p95 vượt 8 ms ở 7/30 mẫu (rừng và bãi hồ, đỉnh 13,8 ms một lần): máy đo đang chia GPU với các phiên khác nên dao động lớn, trên main cùng máy p95 cũng chạm 8 ms. Chưa đưa p95 về dưới 8 chắc chắn; hướng tiếp: LOD/impostor quái, AOI (M-2).
- **Địa hình**: vết cắt hình chữ nhật ở núi tây bắc là do nhiễu Perlin chỉ có 8 hướng gradient (4 hướng dọc trục làm nhiễu bằng 0 dọc các đường lưới, sống núi `ridged` lộ đường thẳng). Đổi sang 16 hướng lệch 11,25° (`shared/noise.ts`, bù biên độ 1,22), tinh chỉnh biên độ núi; toàn bộ địa hình đổi nhẹ nên camp, vùng, prop được sinh lại. Ranh bãi bằng/bờ hồ không còn là đĩa tròn đều: khoảng cách tới tâm khu bị méo bằng nhiễu thấp tần số (`warpedDist`, trừ sân tông môn, bệ cổng, Kiếm Trủng giữ hình tròn); đa giác vùng lấy theo đường đồng mức thật, bãi hồ theo cao độ thật.
- Nhãn bản đồ M (`Panels.tsx`) và test rải cây (`propScatter.test.ts`) giờ đọc từ `VALLEY`, `FOREST`, `LAKE`, `SUOI`, `VACH`, `PORTAL_POS`.

## Kiểm khác

- `pnpm --filter @dtl/bot-client security`: 80/80 ĐẠT (lần chạy trước sửa ping/sao chép gói; chạy lại ở cuối).
- Cổng và tiến trình: chỉ dùng PORT=2589 / CLIENT_PORT=5190, đã tắt.
