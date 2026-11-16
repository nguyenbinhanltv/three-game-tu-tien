# 3-10 Cân bằng (gộp M-6 nhịp độ)

Mọi số lấy từ `pnpm sim:progress` (mô phỏng một người chơi, nay chia ba công pháp và có cờ **LỖI** khi vượt ràng buộc) và `pnpm --filter @dtl/server fight:check` (đánh thử trong sim server thật, đồng hồ giả).

## Đã đổi gì

| Mục | Trước | Sau |
| --- | --- | --- |
| Tu vi mỗi tầng `xpNeed` | `70·L²` (tổng NK 1→15: 87 nghìn) | `90·L²` (112 nghìn) |
| Tìm quái trong sim | 6 s cố định | đi giữa các cụm của M-2: `3,5 s + 1,3·khoảng cách cụm gần nhất / 7 m/s / số con` (~6,0–6,3 s), kéo 2 con mỗi cụm, hiệu suất khiên/hồi 60% |
| Công kích quái thường (`atkMul`) | Thiết Bối Trư 0,95 · Yêu Lang 1,1 · Hỏa Vân Hồ 1,2 · Thạch Viên 1,1 · U Minh Lang 1,25 | 1,0 · 1,25 · 2,3 · 1,35 · 2,4 (Thiết Bối Trư máu 1,3→1,1, Hỏa Vân Hồ máu 1,0→1,1) |
| Tinh anh | máu ×4,6 / ×4,0 / ×6,0, công ×1,3 / 1,35 / 1,3 | máu ×5,4 / ×5,3 / ×7,0, công ×2,2 / 2,5 / 2,3 |
| Boss (máu) | Kiếm Khôi 20, Huyết Lang Vương 24, Thú Mộ Tướng 32, Hàn Giao 45 | 32, 37, 48, 70 |
| Giá cường hóa | `30 + giá·0,15·(cấp+1)` | `30 + giá·0,06·(cấp+1)` |
| Khắc chế ngũ hành | không có | `DmgMsg.ke` (1 khắc, −1 bị khắc); Kim→Mộc→Thổ→Thủy→Hỏa→Kim; ×1,12 / ×0,92; mọi quái có hệ (`monsters.json: elem`), tinh anh/boss bắt buộc |
| Độ kiếp | chết là mất đan | chết sau 20 s hoàn Trúc Cơ Đan (vẫn mất 15% tu vi); số liệu thiên lôi thành hằng `TRIB_*` trong `formulas.ts` |

## Nhịp lên cấp (sim, giờ tới viên mãn Ngưng Khí 15, một mình, chưa tính boss/bí cảnh/tinh anh)

| | Kiếm tu | Hộ pháp | Đan sư |
| --- | --- | --- | --- |
| Trước (mô hình cũ: tìm quái 6 s, không công pháp) | 2,2 giờ | | |
| Trước (mô hình mới, dữ liệu cũ) | 2,27 | 2,35 | 2,27 |
| **Sau** | **3,37** | **3,43** | **3,11** |
| Sprint 2 (sim sau M-2, `hpMul` Đan sư −0,12) | 3,25 | 3,30 | 3,04 |

Ràng buộc trong sim: cả ba trong 3–4 giờ. Sim chưa tính boss/bí cảnh/tinh anh (cho tu vi nhưng tốn thời gian): thực tế dao động quanh 3–4 giờ; núm chỉnh là hệ số trong `xpNeed`.

## TTK và máu mất mỗi lần giết (sim, đứng yên, kéo 2 con, trang bị theo nhiệm vụ)

| Cảnh giới | Quái | TTK Kiếm/Hộ/Đan | Mất/lần trước (Kiếm/Hộ/Đan) | Mất/lần sau (Kiếm/Hộ/Đan) |
| --- | --- | --- | --- | --- |
| NK 4 | Thiết Bối Trư | 5,9 / 5,9 / 5,9 s | 16 / 16 / 16% | 15 / 15 / 15% |
| NK 6 | Yêu Lang | 4,9 / 5,6 / 5,4 s | 25 / 25 / 15% | 28 / 25 / 19% |
| NK 8 | Yêu Lang | 4,4 / 4,9 / 4,8 s | 16 / 16 / 3% | 18 / 16 / 8% |
| NK 10 | Hỏa Vân Hồ | 4,4 / 4,9 / 4,7 s | **0 / 0 / 0%** | 11 / 9 / 0% |
| NK 12 | Thạch Viên | 6,0 / 6,8 / 6,6 s | 15 / 14 / 0% | 24 / 20 / 12% |
| NK 15 | U Minh Lang | 5,4 / 6,0 / 5,8 s | **0 / 0 / 0%** | 16 / 14 / 4% |

Đan sư gần như không mất máu ở bãi quái đơn vì Hồi Xuân Quyết tự hồi (ý đồ thiết kế: hồi, giữ đội sống); áp lực của họ nằm ở tinh anh, boss và khi bị nhiều con đánh. Bảng đủ 15 tầng: chạy `pnpm sim:progress`.

Đối chiếu sim server thật (`fight:check`, đứng yên, kéo 2 con, 8 lần/ô): NK 4 Thiết Bối Trư 5,6–5,9 s, mất 16–17%; NK 10 Hỏa Vân Hồ Kiếm/Hộ/Đan 3,1/3,8/3,9 s, mất 16/15/8%; NK 15 U Minh Lang 3,8/4,7/4,6 s, mất 10/19/6%, không chết. Server nhanh hơn sim ~10–25% ở Kiếm tu vì chiêu tối thượng đánh cả hai con (sim không tính).

## Tinh anh và boss

| | Trước | Sau |
| --- | --- | --- |
| Tinh anh TTK không đồ (Kiếm/Hộ/Đan) | 28 / 20 / 33 s | 26–29 / 21–23 / 29–33 s |
| Tinh anh TTK bộ Huyền phẩm | 14 / 12 / 18 s | 13–15 / 12–14 / 16–18 s |
| Tinh anh máu mất cả trận (đứng yên, bộ Huyền phẩm) | ~1%/s | 21% / 28% / 23% |
| Boss, nhóm 3–4 (1 hộ pháp + 1 đan sư + kiếm tu) | 35 / 44 / 55 / 58 s | 45 / 57 / 67 / 72 s |

## Bản sắc ba công pháp (chỉ số; không đổi động tác K-5 hay VFX K-6)

| | Nội tại mới (`methods.json`, `passive`) | Hiệu ứng |
| --- | --- | --- |
| Kiếm tu | `critBase` 0,05; `critAtMax` 0,10 (đủ 5 kiếm ý); `gcdRefund` 0,2 | bạo kích 15% → 25% khi đánh liên tục; đòn thứ ba của chuỗi hoàn 0,2 s GCD |
| Hộ pháp | `hpMul` 0,12; `melee` {6 m, +10%}; Thiết Bích Xung `stun` 1 s (quái thường; tinh anh nửa, boss miễn) | cận chiến thật, khống chế đầu tiên ngoài khiêu khích |
| Đan sư | `rangeBonus` 4 m; `hpMul` −0,12 (Sprint 2, từ −0,08, để nhịp Đan sư ≥ 3 giờ); Hồi Xuân Quyết `poison` {10 m, 40% công/s, 8 s} | tầm xa hơn, sát thương riêng theo thời gian (mộc độc) |

Server: `hitMonster` (bạo kích, cận chiến, khắc chế), `onDash` (choáng), `case 'hot'` + `tickMonster` (độc), `skillRange`, `beginSkill` (hoàn GCD), `Character.recalc` (máu, bạo kích gốc). Đòn nhận hệ qua tham số `elem` của `hitMonster`.

## Cường hóa và kinh tế (sim)

Linh thạch kỳ vọng từ +0 (Thiết Tinh quy theo giá mua 60, Hộ Phù quy 400) và số giờ thu nhập cấp tương ứng:

| Món (cấp) | +5 trước → sau | +9 có Hộ Phù trước → sau | +10 có Hộ Phù trước → sau |
| --- | --- | --- | --- |
| Thiết Kiếm (4) | 1200 → 822 (0,7 h) | 6040 → 4231 (3,4 h) | 9273 → 6624 (5,3 h) |
| Thanh Phong (8) | 2055 → 1164 (0,6 h) | 10131 → 5867 (3,0 h) | 15264 → 9021 (4,7 h) |
| Hàn Quang (12) | 4620 → 2190 (0,7 h) | 22403 → 10777 (3,7 h) | 33237 → 16210 (5,5 h) |
| Trảm Tà (15) | 10695 → 4620 (1,1 h) | 51470 → 22403 (5,3 h) | 75803 → 33237 (7,9 h) |

(Trước đây Trảm Tà +9 tốn ~13 giờ thu nhập, +10 ~19 giờ.) Thu nhập cấp 4/8/12/15: 1252 / 1932 / 2929 / 4203 linh thạch/giờ. Ràng buộc trong sim: +5 ≤ 1,2 h, +9 (Hộ Phù) 2–7 h, +10 ≤ 14 h.

Nguồn/tiêu tới NK 15 (Kiếm tu): nguồn **12 668** (8 879 vàng rơi + 3 170 nhiệm vụ + 619 bán trang bị rơi) so với tiêu thiết yếu 3 060 + 4 chiêu cấp 3 840 + 8 chiêu cấp 5 10 880 + Thanh Phong +7 2 398 = 17 178. Đủ cho đồ thiết yếu và 4 chiêu chủ lực, không đủ làm hết (còn chỗ tiêu, tránh lạm phát). Mọi thao tác cường hóa vẫn một tx + idem + ledger (không đổi); `pnpm ledger:check` sau 100 bot: khớp.

## Độ kiếp (G11)

20 đợt trong 40 s = 20 tia nhắm thẳng (24% máu, báo trước 1,25 s) + 44 tia rơi quanh (20%, trúng người đứng yên 8%). Đứng yên mất 547% máu; chỉ né tia nhắm thẳng mà ăn tia rơi quanh theo xác suất mất ~67%, trừ khiên Hộ Thể (35%) còn ~32%. Giữ nguyên độ khó; chỉ hoàn Trúc Cơ Đan khi chết sau 20 s. Ba pha và hộ pháp chia sát thương (`GAME_DESIGN_CORE.md` 5.3) vẫn là Sprint 2.

## Kiểm

`pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress` (không LỖI), `pnpm bots --count 100 --duration 120` (tick p95 ~8–10 ms khi bot đánh quái; bản `main` cùng điều kiện ~5–8 ms), `pnpm ledger:check` (khớp), bộ `security` (đạt hết), playtest trình duyệt tắt tiếng ở NK 4/10/15.
