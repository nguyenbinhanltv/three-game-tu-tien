# E4-J: cân bằng chương 4 (Nguyên Anh → độ kiếp Hóa Thần)

Cân nhịp **Nguyên Anh sơ kỳ (cấp 24) → độ kiếp Hóa Thần xong ≈ 8 giờ ±12%** (7,04–8,96) theo cách E2-J/E3-J (`docs/e2j-balance.md`, `docs/e3j-balance.md`), sau khi E4-A…I, K, F/G đã merge. Không đổi luật netcode; chỉ đổi dữ liệu content và thêm mô hình vào sim. Không đụng `xpNeed` (không cần migration).

## 1. Mô hình mới trong `pnpm sim:progress`

Trước đó sim **chưa có** mô hình chương 4 (chỉ bảng thưởng nhiệm vụ). Khối "Nhịp chương 4" ở `packages/content/src/sim.ts` (cùng cấu trúc `ch3Timeline`), cấp 24–27, từng công pháp, một mình:

- Săn quái thường theo cụm thật `levels/thien_khuyet.json` (cụm `L−2…L+1`, 10,9 s tìm quái), tinh anh 1 con/15 phút săn.
- Đồ: bậc 3 (đã mặc 85%) pha dần sang bậc 4 phẩm Linh, 30/50/70/85% ở cấp 24–27 (`CH4_GEAR_FRAC`).
- Cố định: nhiệm vụ chính `q4_*` và phụ `s4_*` (trừ `s4_thu_niem`, chỉ mở sau Hóa Thần, cấp 28), Thần Tàng Điện một lượt ở cấp 26 (28 phút kể cả lỡ tay lần đầu, dùng kết quả mô hình phó bản có sẵn), Thiên Khuyết Thủ Linh nhóm 4 (8 phút), tâm ma ở bình cảnh 25/27, chế Hóa Thần Lộ (5 phút) và **Ngũ Hành Thiên Nhân Kiếp** (90 s chuẩn bị + 80 s; làm lại nếu hỏng: mất 15% tu vi, chế lại lò).
- **Monte Carlo Hóa Thần Kiếp** (4000 lần) bám `tribulations.json` (`hoa_than`): tia nhắm + tia rơi quanh theo nhịp co dần, ấn ngũ hành (mỗi 5 s), lưới tia, vạch quét/cột/liên kết của phân thân, tia khóa mệnh `final` (0,75 máu, hộ pháp chắn 25% mỗi người, tối đa 2), Hộ Thể 35%, tối đa 3 đan hồi. Giả định như E2-J/E3-J: người "thường" né đúng 80% mỗi sự kiện né được; sống tới 80 s là qua.
- Kinh tế và nguyên liệu chương: nguồn linh thạch, hố tiêu cầu toàn, Hóa Thần Lộ (3 Thần Tàng Ngọc + 5 Tinh Quang Mặc + 2 Cổ Thành Phiến + 16 Yêu Đan), Tẫn Giác.
- Thêm cờ LỖI: chương 4 ngoài 8 giờ ±12%; TTK quái thường 3,8–7,3 s; tinh anh 18–40 s và không mất > 60% máu (đứng yên); Hóa Thần Kiếp tay thường 55–90% / giỏi ≥ 90% / vụng ≤ 50%; hố tiêu 0,8–2,2× nguồn; nguyên liệu Hóa Thần Lộ dư ≥ 1,3×. `pace.test.ts` thêm dòng `[pace4]`.

## 2. Trước / sau

"Trước" là số của sim chương 4 chạy trên dữ liệu chưa chỉnh (đã merge E4-A…K).

| Mục | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| Giờ chương 4 (Kiếm/Hộ/Đan) | 9,59 / 9,84 / 8,36 | **7,92 / 8,14 / 8,05** | Trước: ~2,2 giờ là làm lại Hóa Thần Kiếp (tay thường chỉ 14%). Sau khi sửa kiếp, nhịp lại hơi nhanh (7,4–7,6) nên bù bằng `xpMul` quái thường |
| Hóa Thần Kiếp, tay thường (Kiếm/Hộ/Đan) | 14% / 14% / 31% | **77% / 77% / 84%** | Kiếp quá khắc nghiệt (pha 3: tia nhắm mỗi 0,9 s, 0,16 máu) |
| Hóa Thần Kiếp, tay vụng / giỏi (Kiếm) | 0% / 77% | **10% / 95%** | Thang chuẩn như Đan Hỏa/Tam Trọng Kiếp |
| Hóa Thần Kiếp, có 2 hộ pháp (Kiếm tu, thường) | 16% | **90%** | `final` có luật hộ pháp chắn: kiếp này hộ pháp có tác dụng (khác Tam Trọng Kiếp) |
| `hoa_than` pha 1 `aimPct`/`extraPct` | 0,12 / 0,14 | 0,07 / 0,09 | |
| `hoa_than` pha 2 | 0,20 / 0,20 | 0,11 / 0,11 | |
| `hoa_than` pha 3 | 0,16 / 0,10 | 0,08 / 0,06 | |
| `xpMul` quái thường (Thạch Tượng Võ Sĩ, Dạ Minh Lộc, Cốt Vệ Kiếm Thú / Cổ Thành Chiến Mã) | 2,0 / 2,2 | **1,85 / 1,9** | Đòn bẩy nhịp (≈ −8%) |
| `hpMul` tinh anh (Thạch Tượng Đại Tướng / Dạ Minh Lộc Vương / Cốt Kiếm Thông Linh) | 8 / 7 / 7,5 | 8,8 / 7,7 / 8,2 (+10%) | TTK tinh anh cùng khung ch2–3 |
| `atkMul` Cốt Kiếm Thông Linh | 1,9 | **1,2** | Mất 85% máu (đứng yên) khi đánh ở cấp 26, trong khi mọi tinh anh khác 0–3% |
| Linh thạch quái thường Thiên Khuyết | 30–52 (Chiến Mã 34–60) | ×0,73 | Nguồn thu 120k → 99k |
| Linh thạch nhiệm vụ chính `q4_*` | 2.600–5.600; `q4_hoa_than` 12.000 | ×0,85; `q4_hoa_than` **6.000** | Giảm lạm phát (xem mục 4) |
| `s4_thu_niem` (thưởng tạm của E4-K) | 8.000 tu vi / 3.000 linh thạch / 3 Tẩy Luyện Thạch | **5.000 / 1.800 / 2** | Ngang các phụ tuyến `s4_*` (nhiệm vụ chỉ cần dùng G một lần) |
| Tẫn Giác (nguồn tạm) | tinh anh 30% × 1–2; boss 4–6 | **80% × 1–2; boss 6–9** | Chặng chỉ rơi ≈ 15; nay ≈ 47 (xem mục 4) |

Không đổi: `xpNeed`, giá vật phẩm, giá chế, `promoteGold`, `TIER_MUL`, công thức sát thương, tham số mạng.

## 3. Kết quả cuối (`pnpm sim:progress`)

Giờ theo thành phần (Kiếm tu 7,92 giờ): quái thường 6,19 · tinh anh 0,33 · đả tọa 0,01 · nhiệm vụ 0,50 · Thần Tàng Điện 0,47 · Thủ Linh 0,13 · tâm ma 0,04 · chế Hóa Thần Lộ 0,08 · Hóa Thần Kiếp 0,17.

| Cấp | TTK quái thường (Kiếm/Hộ/Đan) | Mất máu/lần | TTK tinh anh (Kiếm) | Giờ cấp (Kiếm) |
| --- | --- | --- | --- | --- |
| 24 | 4,7 / 5,2 / 5,1 s | 0% | 26 s | 1,99 |
| 25 | 4,4 / 4,9 / 4,8 s | 0% | 24 s | 1,90 |
| 26 | 4,1 / 4,5 / 4,4 s | 0% (tinh anh 25% / 13% / 3%) | 21 s | 1,67 |
| 27 | 3,8 / 4,2 / 4,1 s | 0% | 22 s | 2,10 |

**Ngũ Hành Thiên Nhân Kiếp: tỉ lệ qua** (Monte Carlo 4000 lần)

| Tay nghề (xác suất né) | Kiếm tu | Hộ pháp | Đan sư | Kiếm tu + 2 hộ pháp |
| --- | --- | --- | --- | --- |
| vụng (60%) | 10% | 10% | 25% | 11% |
| thường (80%) | 77% | 77% | 84% | 90% |
| giỏi (92%) | 95% | 95% | 98% | 100% |

**Độ nhạy theo đồ bậc 4** (Kiếm tu): không có món nào 8,29 giờ, đủ bộ phẩm Linh từ cấp 24 là 7,72 giờ; kỳ vọng 7,92. Cả hai mốc trong ±12%.

**`fight:check` (sim server thật, đứng yên, kéo 2 quái, 4 lần mỗi ô)**: quái thường Thiên Khuyết, mọi công pháp, không ai chết.

| Cấp | Quái | Kiếm tu | Hộ pháp | Đan sư |
| --- | --- | --- | --- | --- |
| 24 | Dạ Minh Lộc | 5,2 s / 8% | 5,5 s / 8% | 7,7 s / 4% |
| 25 | Dạ Minh Lộc | 4,6 s / 12% | 4,3 s / 18% | 7,3 s / 0% |
| 26 | Cổ Thành Chiến Mã | 5,0 s / 4% | 5,5 s / 7% | 8,3 s / 8% |
| 27 | Cốt Vệ Kiếm Thú | 3,9 s / 10% | 4,8 s / 14% | 7,6 s / 3% |

(TTK / máu mất mỗi con; khung 3,5–8,5 s.) Lần đầu, khi tôi tăng 12% máu quái thường, Đan sư ra 9,1–9,5 s, ngoài khung, nên đã hoàn lại `hpMul` quái thường và bù nhịp bằng `xpMul`. `fight:check` chỉ nhận quái thường; tinh anh/boss/Thần Tàng Điện được đo bằng mô hình sim (mục trên: tinh anh 21–29 s; phó bản 28 phút; Thủ Linh nhóm 8 phút).

## 4. Kinh tế

| | Nguồn | Mỗi giờ | Thiết kế |
| --- | --- | --- | --- |
| Kiếm tu (trước) | 120.202 (115.652 + 4.550 bán đồ) | 12.534 (trước sửa nhịp: 9,59 giờ) | 10.560 |
| Kiếm tu (**sau**) | **98.596** (93.638 + 4.958 bán đồ) | **12.448** | 10.560 |

Hố tiêu cầu toàn 111.717 = Thăng Bậc bậc 4 (7 ô) 24.640 + cường hóa +5 bốn ô 58.974 + chế một bộ 15.400 + Hóa Thần Lộ 10.263 (kể cả làm lại, 8.000 mỗi lần) + Phá Cảnh Đan 340 + đan hồi 2.100 = **1,13× nguồn thu** (cờ LỖI ngoài 0,8–2,2×). Thu nhập mỗi giờ vẫn cao hơn thiết kế ≈ 18% (chương 3: +8%) vì nhiệm vụ + phó bản + boss (không phụ thuộc giờ) chiếm gần nửa; chưa giảm thêm để hố tiêu không thiếu: cần người thử xem túi có dư không. Giá vật phẩm, Thăng Bậc, giá chế giữ nguyên.

Nguyên liệu (Kiếm tu, một mình, sau chỉnh):

| Vật liệu | Nguồn trong chặng | Cần |
| --- | --- | --- |
| Thần Tàng Ngọc | 57,8 | 3,8 (Hóa Thần Lộ kể cả làm lại) |
| Tinh Quang Mặc | 193 | 6,4 + 140 Thăng Bậc bậc 4 (7 ô × 20) |
| Cổ Thành Phiến | 20,3 | 2,6 |
| Yêu Đan | 520 | 20,5 |
| Tẫn Giác | 47 (trước: 15) | 140 để Thăng Bậc 4 → 5 đủ 7 ô (làm sau Hóa Thần: 93 còn thiếu ≈ 2–3 giờ săn tinh anh/boss ở cấp 28) |

## 5. Bot 100 người trên Thiên Khuyết

`pnpm bots --count 100 --duration 120 --level 27 --tp --fight 1144,684,60 --gm "tele all;tp tk_dai_lo"` (server riêng cổng 2797, DB tạm, `AUTH_DEV_BYPASS=1`, `RATE_LIMIT_EXEMPT=loopback`): 100 bot vào đủ, 0 thất bại, hai room `world-thien_khuyet` mỗi room 50 người (tự mở kênh) với 255 quái; **tick p95 ≤ 4,7 ms (đỉnh lúc vào; ổn định 2,0–2,5 ms)**, 18–25 KB/s mỗi bot, **0 dòng `refId`**; `pnpm ledger:check`: 100 nhân vật, 554 dòng sổ cái, khớp. Server đã tắt.

## 6. Việc còn lại / giả định cần người thử

- Mô hình Hóa Thần Kiếp là giả định về xác suất trúng (ấn ngũ hành 60%, vạch quét 80%, cột 60%, liên kết 70%, lưới 50% nếu không né). Hai con số nên chỉnh trước tiên nếu người thử thấy khó/dễ: `aimPct` pha 2 và `final.pct`. Mô hình không tính phân thân thần niệm đánh trả, shadows ở pha 3 và hộ pháp chắn ngoài `final`.
- Nhịp chưa tính thời gian di chuyển giữa Thiên Khuyết và Thần Tàng Điện ngoài `PATH_FACTOR`, nên giờ thật có thể nhỉnh hơn (đang gần giữa khung: 7,92–8,14).
- Phân thân (G, cấp 28) và 6 chiêu Nguyên Anh không có chỗ trong mô hình nhịp (chỉ mở sau khi đã đủ cấp); TTK của sim dùng chiêu bậc 1–3 của `methods.json` như E3-J.
- Tẫn Giác vẫn là nguồn tạm chờ quái Dị Vực; `s4_thu_niem` nên xem lại khi có cấp 29+.
