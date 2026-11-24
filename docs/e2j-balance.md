# E2-J: cân bằng chương 2 (Trúc Cơ → Kết Đan)

Mục tiêu người dùng chốt: Trúc Cơ (cấp 16) → độ kiếp Kết Đan **khoảng 4 giờ chơi, sai số ±12%**, không phá nhịp Ngưng Khí 1 → 15 (3–3,4 giờ) và Trúc Cơ cũ. Số liệu do `pnpm sim:progress` (khối "Nhịp chương 2", `packages/content/src/sim.ts`) và `pnpm --filter @dtl/server fight:check`.

## Mô hình mới trong sim

Trước E2-J, sim chỉ có thang `xpNeed` (242k) và "thu nhập thiết kế" 400 mục tiêu/giờ; chưa ai đo thật trên bản đồ Đoạn Mạch. Khối mới tính theo từng cấp 16–19, từng công pháp, một mình:

- **Săn quái thường** Đoạn Mạch theo cụm thật (`levels/doan_mach.json`): cụm cấp `L−2…L+1` (chênh ≤ 2 cấp vẫn nhận đủ tu vi), thời gian tìm quái theo khoảng cách cụm gần nhất (≈ 10,6–10,9 s/lần, thưa hơn Vân Lam 6 s), kéo 2 con, khiên/hồi 60%, đả tọa hồi máu.
- **Đồ bậc 2 kỳ vọng**: pha dần từ bộ nhiệm vụ cũ sang bộ bậc 2 phẩm Linh, 30/50/70/85% ở cấp 16/17/18/19 (`CH2_GEAR_FRAC`).
- **Tinh anh** gặp 1 con/15 phút săn; **nhiệm vụ chính** `q2_*` (150 s đi lại mỗi nhiệm vụ, mục tiêu giết quái trùng với săn); **Phục Mạch Quật** một lượt (khóa ngày; tu vi `xpPct` 15% cấp 18 + quái trong đợt chia nhóm 4: ×1,6/4; thời gian lấy từ mô hình phó bản, 18,6 phút kể cả lỡ tay lần đầu); **Địa Mạch Long** một lần theo nhóm (8 phút); **thử thách tâm ma** ở bình cảnh 17 và 19; **chế Kết Đan Dịch** (3 phút); **Đan Hỏa Kiếp** (90 s chuẩn bị + 55 s + làm lại nếu hỏng: mất 15% tu vi cấp 19 và phải chế Dịch mới).
- **Đan Hỏa Kiếp** có Monte Carlo (4000 lần) bám đúng `tribulations.json`: tia nhắm, tia rơi quanh, vạch quét, bóng tâm ma (bị đánh trong lúc đứng ngưng đan), tia cuối khóa mệnh (Kim Cương Đan giảm 30%, hộ pháp chắn 25%), Hộ Thể 35%, tối đa 3 đan hồi. Người chơi chọn né khi còn đủ thời gian đầy thanh, nếu không thì chịu đòn.

## Trước / sau

| Mục | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| Giờ chương 2 (Kiếm/Hộ/Đan) | 5,83 / 5,99 / 6,02 giờ (+46–50%) | **4,12 / 4,17 / 4,03 giờ** | Mô hình đo thật: quái Đoạn Mạch chỉ cho ≈ 225 kill/giờ chứ không phải 400; mỗi con ít tu vi hơn thiết kế |
| `xpMul` quái thường Đoạn Mạch | 1,2 / 1,2 / 1,2 / 1,3 | **2,15 / 2,15 / 2,15 / 2,4** (giáp tê, khôi lỗi, ngô công, hộ vệ) | Đòn bẩy chính. Không đổi `xpNeed` (tổng 242k đã có test), nên không cần migration |
| `hpMul` / `atkMul` quái thường | 1,3–1,4 / 1,2–1,5 | hp 1,6 / 1,7 / 1,7 / 1,8, atk 1,7 / 1,8 / 2,1 / 1,8 | TTK với đồ bậc 2 từ 3,3 s xuống 4,1–6,8 s (mục tiêu 4–7 s) và có áp lực máu |
| `hpMul` tinh anh Đoạn Mạch | 5,5 / 7 / 6 | **7,4 / 9,5 / 8,1** | TTK với đồ bậc 2 từ 14–20 s lên 19–31 s (mục tiêu 20–40 s) |
| Đan Hỏa Kiếp, tỉ lệ qua (tay thường, một mình) | 0% (cả ba công pháp) | **66% / 73% / 84%** | Phải né ≥ 17 sự kiện trong 28 s nhưng thanh ngưng đan cần 20 s đứng yên, không thể |
| `fill` thanh ngưng đan | 20 s | **14 s** | Đủ chỗ cho ~14 lần né |
| Pha 2: nhịp tia / `aimPct` / vạch quét | gap 2,4 s, 20%, mỗi 4,5 s × 26% | gap 2,8 s, 17%, mỗi 5,5 s × 22% | Giảm số đòn trong cửa sổ 28 s |
| Pha 1 / pha 3 `aimPct` | 24% / 16% | 20% / 13% | Pha 3 là nguồn sát thương lớn nhất của người né 80% |
| `fight:check` cấp 17–19 | Đồ cấp 15 | Có kiếm (17), đạo bào (18), hộ uyển (19) bậc 2 | Đúng đồ kỳ vọng, nếu không hệ số mới (đồ bậc 2 mạnh hơn nhiều) lệch hẳn |

## Kết quả cuối (`pnpm sim:progress`)

Giờ theo thành phần (Kiếm tu): quái thường 2,75 · tinh anh 0,16 · đả tọa 0,14 · nhiệm vụ 0,38 · phó bản 0,32 · Địa Mạch Long 0,13 · tâm ma 0,04 · chế Dịch 0,05 · Đan Hỏa Kiếp 0,15.

| Cấp | TTK quái (Kiếm/Hộ/Đan) | Mất máu/lần | TTK tinh anh (Kiếm) |
| --- | --- | --- | --- |
| 16 | 6,1 / 6,8 / 6,6 s | 8% / 5% / 0% | 28 s |
| 17 | 5,3 / 6,0 / 5,8 s | 4% / 2% / 1% | 23 s |
| 18 | 4,7 / 5,3 / 5,1 s | 2% / 1% / 0% | 27 s |
| 19 | 4,1 / 4,6 / 4,5 s | 1% / 0% / 0% | 19 s |

Tinh anh Vân Lam giữ 20–40 s (không đồ). Địa Mạch Long: nhóm 4 hạ trong 82 s (đã thiết kế). Phục Mạch Quật 18,6 phút kể cả lỡ tay.

**Đan Hỏa Kiếp (qua một mình | có hộ pháp chắn tia cuối)**

| Tay nghề (xác suất né mỗi lần) | Kiếm tu | Hộ pháp | Đan sư |
| --- | --- | --- | --- |
| vụng (60%) | 8% \| 13% | 11% \| 19% | 19% \| 32% |
| thường (80%) | 66% \| 81% | 73% \| 86% | 84% \| 92% |
| giỏi (92%) | 96% \| 99% | 98% \| 100% | 99% \| 100% |

Hộ pháp chỉ chắn 25% tia cuối (luật server `shareToGuards`); mô hình không tính hộ pháp đánh bóng tâm ma hộ nên số có hộ pháp là cận dưới.

**Độ nhạy theo đồ bậc 2** (Kiếm tu): không có món nào 5,60 giờ, đủ bộ phẩm Linh ngay từ cấp 16 3,77 giờ; kỳ vọng 4,12 giờ. Hai mốc cực này nằm ngoài ±12%; người chơi thật nằm giữa. Nếu người thử thấy chậm, tăng tỉ lệ rơi trang bị của quái thường hơn là tăng `xpMul`.

## Kinh tế linh thạch (một mình)

| | Nguồn | Mỗi giờ | Thiết kế |
| --- | --- | --- | --- |
| Kiếm tu | 26.229 (24.929 vàng/nhiệm vụ/phó bản/boss + 1.301 bán đồ) | 6.374 | ~7.200 (6.000 + 20% bán đồ) |

Bán đồ rơi chỉ ≈ 5% (thiết kế 20%): trang bị rơi từ quái thường phẩm thấp, giá bán nhỏ. Hố tiêu cầu toàn 54.335 = Thăng Bậc 7 ô 16.800 + cường hóa +5 bốn ô 26.578 + chế một bộ 6.900 + Kết Đan Dịch 2.217 (kể cả làm lại) + Phá Cảnh Đan 340 + đan hồi 1.500, tức 2,07× nguồn thu: người cầu toàn thiếu, người chơi thường chọn ô nên cân bằng; không có nguồn linh thạch nào khác nên không lạm phát. Sim báo LỖI nếu hố tiêu ngoài 0,8–2,2× nguồn thu. Chưa đổi giá (Thăng Bậc 2.400/ô, cường hóa theo bảng) vì thiếu chỉ nhỏ và nên chờ người chơi thử trước.

Nguyên liệu: Ngưng Đan Mạch Tinh ≈ 14 (cần ≈ 4,4 cho Kết Đan Dịch kể cả làm lại; Kết Đan Dịch còn rơi 12% từ Địa Mạch Long), Yêu Đan ≈ 187 (cần ≈ 18), Mạch Tinh Phiến ≈ 119 từ rơi cộng điểm thu thập (Thăng Bậc 7 ô cần 140). Giữ nguyên tỉ lệ rơi: mảnh bộ từ phó bản (40%/bộ), tinh anh 100% một món.

## CI

`packages/content/src/pace.slow.test.ts` (chạy bằng `pnpm test:slow`) chạy thật `sim.ts` và kiểm: không dòng LỖI, ba công pháp ở 3,52–4,48 giờ, Ngưng Khí 1 → 15 vẫn 3–4 giờ. Thêm trong `sim.ts`: TTK quái thường chương 2 trong 3,8–7,3 s, tinh anh 18–40 s, Đan Hỏa Kiếp (tay thường qua 55–90% một mình, tay giỏi ≥ 90%, tay vụng ≤ 50%, có hộ pháp không kém một mình), nguyên liệu Kết Đan Dịch dư 1,3×.

Kiểm đã chạy: `pnpm typecheck`, `pnpm content:check`, `pnpm test` (một test roll trang bị ngẫu nhiên `equipment.test.ts` lỗi một lần khi chạy cả bộ, đạt khi chạy riêng; không liên quan thay đổi này), `pnpm --filter @dtl/bot-client security` (tất cả ĐẠT), `pnpm bots --count 100 --duration 120` (0 thất bại, 0 dòng `refId`, tick p95 ≈ 4–6 ms trên máy đang tải) và `pnpm ledger:check` (khớp).

## Việc còn lại

- Người chơi thật thử Đan Hỏa Kiếp (số tay nghề trong Monte Carlo là giả định).
- Mô hình chưa tính nhiệm vụ phụ `s2_*` (+5.200 tu vi ≈ 2%) nên có thêm chút dự phòng.
