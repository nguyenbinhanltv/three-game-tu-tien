# K-5 Chiêu IK, ba ngôn ngữ động tác

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/k5-poses/<file>`.

Chỉ là lớp hình ở client. Luật, số, thời gian chiêu (`windup`, `hitAt`, `recovery`, `cancel`, `combo`) **không đổi**; pose chỉ đọc chúng. Spec: `docs/AUDIT_AND_ROADMAP.md` mục 7.1.

## Cái gì thay đổi

| Việc | Ở đâu |
|---|---|
| 22 pose theo cấu trúc **9 khung** (tấn công) / **7 khung** (niệm, hộ thể, hồi phục) | `packages/content/data/poses/*.json`, sinh bằng `node tools/poses/gen-k5.mjs` (đọc thời gian từ `skills.json`/`methods.json`) |
| Đòn thường: 3 đòn, mỗi đòn một pose (`phi_kiem`, `phi_kiem_2`, `phi_kiem_3`) × 3 giọng (`_hp`, `_ds`) = 9 pose | cùng thư mục |
| Kiếm Khí Trảm × 3 giọng (`kiem_khi_tram`, `_hp`, `_ds`) | cùng thư mục |
| 6 chiêu công pháp (Phi Kiếm Truy Hồn, Vạn Kiếm Quy Tông, Trấn Sơn Ấn, Kim Cương Bất Hoại, Hồi Xuân Quyết, Hồi Thiên Đan Lộ) viết lại theo giọng công pháp của chúng; 4 chiêu gốc còn lại (Thiên Kiếm Vũ, Linh Khí Hộ Thể, Hồi Nguyên Thuật, Lôi Đình Nhất Kiếm) cùng cấu trúc, giọng kiếm tu | cùng thư mục |
| Chọn pose theo đòn trong chuỗi + công pháp | `packages/shared/src/posestyle.ts` (`poseIdFor`, `METHOD_VOICE`), `apps/client/src/game/skillPose.ts` (`poseOf`) |
| Công pháp của **người khác** | server gửi thêm trường hiển thị `PlayerS.mt` (id công pháp, `@view()`, chỉ để hiển thị; không dùng để tính gì) |
| `content:check` | mọi pose có thể chọn phải tồn tại, `hit[0]` ≈ `hitAt` từng đòn (±0,03 s), `hitAt + recovery` ≈ độ dài pose |
| Trang xem chiêu `?show=skill&id=skl_phi_kiem&voice=hp&hit=2` | chọn giọng và đòn trong chuỗi |
| Ảnh | `pnpm shots:k1 --out <đường dẫn tuyệt đối> --mode voices` (ba giọng cạnh nhau ở khung 3 và 5), `pnpm shots:k4 --out … --method <công pháp>` (cận cảnh trong game) |

Chưa chọn công pháp (trước Ngưng Khí 5) hoặc id lạ → giọng kiếm tu (bản gốc, không hậu tố). Thiếu pose riêng → rơi về pose gốc của chiêu.

## Cấu trúc khung (đo bằng `apps/client/src/game/character/k5poses.test.ts`)

| # | Khung | Thời điểm | Cách làm trong dữ liệu |
|---|---|---|---|
| 1 | Thủ thế | 0 | đúng khung 0 của `kiem_thu` |
| 2 | Vào thế | 35% × (hitAt − 0,07) | nửa đường tới khung 3, hông lùi nhẹ (trọng tâm về chân sau) |
| 3 | **Tụ lực** | hitAt − 0,07 − giữ | hạ hông, hông xoay ngược hướng vung (khoảng xoay ≥ 20°) |
| 4 | **Giữ** | hitAt − 0,07 | cùng thế khung 3 (hông dời < 2 cm), kéo dài 0,05/0,08/0,06 s theo giọng |
| 5 | **Trúng** | `hitAt[0]` | `quartOut` từ khung 4; mũi kiếm đi 1,8–2,7 m trong 0,07 s (≥ 1,2 m, ≤ 0,08 s) |
| 6 | Quá đà | hitAt + 0,06 s | vượt khung 5 thêm 15%/5%/10% (đo trên xoay hông) |
| 7 | Hãm | hitAt + 35% recovery | trộn 55% về thủ thế |
| 8 | Thu kiếm | hitAt + 75% recovery | trộn 88% về thủ thế; luôn sau `cancel.move` |
| 9 | Về thủ thế | hitAt + recovery | trùng khung 1 |

Chiêu 7 khung bỏ khung 6 và 8. Khung 3 nằm ở khoảng 54–70% của hitAt − 0,07 (không phải đúng 80%): spec yêu cầu đồng thời "tụ lực ở 80% windup", "giữ 0,05–0,08 s" và "mũi kiếm đi ≥ 1,2 m trong ≤ 0,08 s" kết thúc đúng `hitAt`, mà `windup = hitAt` ở mọi chiêu (0,26–0,5 s), nên không thể thỏa cả ba; mình ưu tiên hai mốc đo được (giữ, vung nhanh) và để khung 3 lùi theo thời gian giữ.

## Ba giọng: số đo thực

Số từ `node tools/poses/report-k5.mjs` (khung khóa, mũi kiếm = cổ tay + 0,9 m theo hướng `sword`):

| Chiêu | Giọng | Hạ hông (m) | Xoay hông | Tay phải z (m) | Giữ | Quá đà | Mũi kiếm đi |
|---|---|---|---|---|---|---|---|
| Đòn thường 1 | kiếm tu (`phi_kiem`) | 0,090 | 40° | 0,77 | 0,05 s | 15% | 2,55 m / 0,07 s |
| Đòn thường 1 | hộ pháp (`phi_kiem_hp`) | 0,190 | 23° | 0,52 | 0,08 s | 5% | 2,38 m / 0,07 s |
| Đòn thường 1 | đan sư (`phi_kiem_ds`) | 0,035 | 26° | 0,55 | 0,06 s | 10% | 2,29 m / 0,07 s |
| Đòn thường 2 | kiếm tu (`phi_kiem_2`) | 0,090 | 40° | 0,77 | 0,05 s | 15% | 2,03 m / 0,07 s |
| Đòn thường 2 | hộ pháp (`phi_kiem_2_hp`) | 0,190 | 23° | 0,52 | 0,08 s | 5% | 1,84 m / 0,07 s |
| Đòn thường 2 | đan sư (`phi_kiem_2_ds`) | 0,035 | 26° | 0,58 | 0,06 s | 10% | 1,95 m / 0,07 s |
| Đòn thường 3 | kiếm tu (`phi_kiem_3`) | 0,090 | 40° | 0,77 | 0,05 s | 15% | 2,71 m / 0,07 s |
| Đòn thường 3 | hộ pháp (`phi_kiem_3_hp`) | 0,190 | 23° | 0,52 | 0,08 s | 5% | 2,69 m / 0,07 s |
| Đòn thường 3 | đan sư (`phi_kiem_3_ds`) | 0,035 | 26° | 0,55 | 0,06 s | 10% | 2,38 m / 0,07 s |
| Kiếm Khí Trảm | kiếm tu (`kiem_khi_tram`) | 0,090 | 40° | 0,77 | 0,05 s | 15% | 2,69 m / 0,07 s |
| Kiếm Khí Trảm | hộ pháp (`kiem_khi_tram_hp`) | 0,190 | 23° | 0,52 | 0,08 s | 5% | 2,64 m / 0,07 s |
| Kiếm Khí Trảm | đan sư (`kiem_khi_tram_ds`) | 0,035 | 26° | 0,55 | 0,06 s | 10% | 2,43 m / 0,07 s |

Các số còn lại của bảng spec (chân bước tới 0,38 m / hai chân rộng hơn vai 0,16 m / chân sau lùi 0,2 m; tay trái đối trọng sau lưng / nắm quyền che ngực / ấn quyết) cũng được `k5poses.test.ts` kiểm. Đo trên **đơn vị pose** (m, so với hông lúc nghỉ, người tham chiếu 1,75 m); rig khác cỡ thì nhân theo tỉ lệ hông.

### Chỗ lệch spec, ghi rõ

- **Tầm tay kiếm tu ≥ 0,75 m**: tay dài 0,54 m nên mình đo là z của cổ tay so với *hông lúc nghỉ* (0,77 m, hông xông tới 0,2 m cộng tay duỗi hết). `validatePose` giới hạn tầm với vai nên không thể cao hơn.
- **"Mũi chân xoay" (đan sư)** và **tay áo vung trễ 0,08 s (`sleeve_l`)**: pose không có trường xoay mũi chân và rig hiện chưa có xương `sleeve_l`; chưa làm (chân sau lùi 0,2 m đã có). Cần thêm trường pose hoặc xương mới, ngoài phạm vi K-5 "không đổi luật".
- **Chiêu lướt (Q)** vẫn không có pose riêng (dùng `run` 2,2× của K-4), nên "9 chiêu công pháp" là 6 chiêu có pose (mỗi công pháp 2: chiêu đặc trưng + tối thượng).
- Đòn thường (Phi Kiếm Thuật, tầm 26 m) trước đây là cử chỉ kiếm chỉ; giờ là ba nhát chém thật (chém ngang, hất ngược, bổ xuống). Kiếm khí vẫn do VFX (K-6) phóng ra từ nhát vung.

## Kiểm

- `pnpm content:check`: hợp lệ (có kiểm đủ bộ pose và `hitAt` từng đòn).
- `apps/client/src/game/character/k5poses.test.ts` (83 test): cấu trúc 9/7 khung, mốc thời gian theo dữ liệu chiêu, số đo ba giọng, **kiếm không xuyên thân** (đoạn kiếm cách trục thân ≥ 0,1 m ở mọi khung, lấy mẫu 60 Hz), đủ bộ pose.
- Ảnh: `giong-don-thuong-1|2|3.png`, `giong-kiem-khi-tram.webp` (ba giọng cạnh nhau ở khung 3 và 5, hai góc); `game-<công pháp>/{nam,nu}-combo-3-don.png`, `{nam,nu}-chieu-kiem-khi-tram.webp` (cận cảnh 3,4 m, góc 3/4).

## Ảnh then chốt

- [`game-lac_kiem_quyet/nam-chieu-kiem-khi-tram.webp`](game-lac_kiem_quyet/nam-chieu-kiem-khi-tram.webp)
- [`game-lac_kiem_quyet/nu-chieu-kiem-khi-tram.webp`](game-lac_kiem_quyet/nu-chieu-kiem-khi-tram.webp)

## C3a: cường điệu thân người cho camera chéo 52° (Chân Cảnh)

`tools/poses/gen-k5.mjs` có `ISO_AMP = 1,18` (mặc định): ở MỌI pose, hông xoay (`hips.rot`), cột sống (`spine`) và đầu lệch khỏi thế thủ (khung 0) nhiều hơn 18%. Thời gian, IK tay/kiếm/chân và `hit` không đổi nên luật chiêu, `hitAt`, khớp VFX giữ nguyên. Trần xoay hông của từng giọng trong `k5poses.test.ts` nới theo cùng hệ số (kt 45° → 53°, hp 25° → 29,5°, ds 30° → 35,4°). Muốn bản gốc để so: `ISO_AMP=1 node tools/poses/gen-k5.mjs` (nhớ sinh lại mặc định sau đó).

## C3c: giọng thứ tư `dt` (đao tu, Chân Cảnh)

`PoseVoice` thêm `dt` (hậu tố `_dt`, `paths.json` → `dao_tu.voice = "dt"`): đại đao hai tay, ở giữa kiếm tu và hộ pháp. Số đo của giọng (khung 3/5, trong `VOICES.dt` của `tools/poses/gen-k5.mjs`; trần kiểm ở `RANGE.dt` của `k5poses.test.ts`): hạ hông 0,14 m, xoay hông 34° (×`ISO_AMP`), giữ 0,07 s (tụ lực lâu), quá đà 0,12, tầm tay 0,68 m, bước dài 0,36 m, tay trái nắm gần tay phải. Có 4 pose có giọng: `phi_kiem_dt`, `phi_kiem_2_dt`, `phi_kiem_3_dt` (đòn thường 3 đòn) và `kiem_khi_tram_dt`; các chiêu khác của đao tu giữ pose riêng như trước. Thời gian, `hit`, luật chiêu không đổi. Ảnh/video: `pnpm shots daotuhit --out <thư mục> [--tag sau|truoc] [--gender m|f] [--video 1]` (bản trước = đặt `voice` về `kt` rồi chạy lại).

## C3d: giọng thứ năm `lt` (lôi tu, Chân Cảnh)

`PoseVoice` thêm `lt` (hậu tố `_lt`, `paths.json` → `loi_tu.voice = "lt"`): tay trái giơ cao "triệu lôi" (`handL5` y 0,92), kiếm bổ từ trên xuống, tụ lực ngắn (giữ 0,05 s như kiếm tu), theo đà dài (quá đà 0,17), tầm tay cao (`reachY` 0,56). Trần kiểm ở `RANGE.lt` của `k5poses.test.ts`. 4 pose có giọng: `phi_kiem_lt`, `phi_kiem_2_lt`, `phi_kiem_3_lt`, `kiem_khi_tram_lt`. Thời gian, `hit`, luật chiêu không đổi. Hồn tu, cổ tu, cấm chế sư (đan sư `ds`) và cổ thần (hộ pháp `hp`) vẫn dùng giọng chung. Ảnh/video: `pnpm shots daotuhit --method cuu_tieu_loi_kinh --set off --video 1 [--tag sau|truoc] [--gender m|f]`.
