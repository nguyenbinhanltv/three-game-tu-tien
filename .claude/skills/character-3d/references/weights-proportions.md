# Tỉ lệ, trọng số, vải: mẹo bổ sung cho nhân vật v3

Nguồn ý tưởng: `character-artist`, `rigging`, `cloth-sim` (blender-skills, MIT, xem `assets/LICENSES.md`), viết lại cho dự án. Nhớ ràng buộc nền: **lưới/UV/texture gốc của Tripo giữ nguyên** (`SKILL.md` mục 2), bộ xương là **UE5 Mannequin** (giữ tên xương), chạy bpy nền qua `node tools/blender/run.mjs --only chr_v3_<bộ>_<giới>`, trần 128 xương (`player_v3_hi` ở `assets/budgets.json`), tối đa 4 xương/đỉnh. Phần dưới là bảng kiểm và gợi ý để soát, không thay quy trình ở `SKILL.md`.

## 1. Tỉ lệ (soát đầu vào Tripo và mốc giải phẫu)

Dùng khi nhận GLB Tripo và khi đặt khối `anatomy` (`shoulderDz`, `ankleX`, `spine3Z`) để biết mốc nào đáng ngờ:

| Loại | Số đầu | Ghi chú |
| --- | --- | --- |
| Thực tế người lớn | 7,5–8 | nhân vật tả thực |
| Anh hùng | 8–9 | dáng cao, hợp kiếm tu |
| Cách điệu | 4–6 | quá đầu to so với tay áo sẽ làm vải méo khi giảm biên độ |

Mốc theo đơn vị đầu tính từ đỉnh đầu (người 8 đầu): cằm 1; ngực 2; rốn 3; **đáy chậu 4**; giữa đùi 5; **đầu gối 6**; giữa cẳng 7; chân 8. Rộng vai ~2–2,5 đầu (nam), hông 1,5–2 đầu; đầu ngón tay chạm giữa đùi khi buông tay. Sai lệch **mốc nào hơn ~10%** so với bảng thì chiều cao `height` hoặc `anatomy` đang sai (ảnh xương chồng lưới sẽ lộ).

Soát thêm ở mặt (chỉ để đối chiếu ảnh multiview, không dựng lại mặt): khoảng giữa hai mắt ≈ bề rộng sống mũi; lông mày–đáy mũi–tai thẳng hàng; môi dưới đầy hơn môi trên.

## 2. Trọng số: thứ tự và bảng kiểm

Quy trình `chr_v3.py` (khoảng cách + mặt nạ phía + làm mượt) đã chạy; khi gỡ lỗi hoặc làm bộ mới, soát theo thứ tự:

1. **Chuẩn hóa tổng = 1, ≤ 4 xương/đỉnh** (glTF chỉ có `JOINTS_0`/`WEIGHTS_0`; xương thứ 5 bị cắt âm thầm). Đếm đỉnh vượt 4 và đỉnh tổng ≠ 1 trong báo cáo.
2. **Chuyển tiếp mượt ở khớp**: không để trọng số nhảy 1,0 → 0,0 ngay tâm khuỷu/đầu gối/hông; làm mượt theo vùng (đã có, mục 5), đầu và bàn tay **cứng**.
3. **Xương xoắn (twist)**: UAL không có twist, dự án đã thêm `<x>_twist_<l|r>` ở giữa đoạn (`chr_v3.py` ~dòng 809). Gợi ý chia: đỉnh gần vai/hông bám xương trên, ~1/3 đoạn đầu xương xoắn, ~2/3 sau chuyển sang xương dưới; đừng tăng số xương chỉ để xoắn nếu đã chạm trần 128.
4. **Thử tư thế cực đoan (tĩnh)** ngoài 15 clip rigstretch: tay giơ hết cỡ, ngồi xổm sâu, xoay cổ tối đa, xoay thân. Chụp bằng trang xem hoặc `pnpm shots v3views`; xem nách, hông, cổ, nếp vải.
5. **Không** scale xương ở tư thế bind, **không** khóa scale ở clip; tên xương giữ Mannequin, không có hai xương gốc.
6. IK (bước chân, nhìn mục tiêu) do client làm (`ikpose.ts`); không thêm xương điều khiển/pole vào GLB.
7. Soát bằng số **và** bằng ảnh: số đo cạnh không thấy khe hở ở đường cắt (xem `SKILL.md` mục 7).

Tóm tắt "đừng": auto-weights nguyên bản cho nhân vật chính; chạy trọng số trước khi lưới đã hết biến động; để vị trí nghỉ của xương lệch template UAL (clip phát trực tiếp).

## 3. Mặt và bàn tay (khi lưới gốc có vấn đề)

Dự án **không retopo** lưới Tripo, nên mục này chỉ để **hiểu vì sao mặt/tay hỏng khi trọng số mềm** và làm thước đo nếu sau này người dùng cho dựng đầu riêng:

- Mặt biểu cảm cần vòng cạnh quanh mắt (≥ 1 vòng hốc mắt + 2 trên mí), quanh miệng (≥ 3 vòng môi, vòng khóe miệng chạy xuống hàm), đường mũi–môi–cằm; cực (pole) 3-cạnh phải nằm ngoài khóe miệng, khóe mắt trong, giữa môi, chóp mũi (đặt dưới tóc, gáy hoặc trong miệng).
- Khớp vai/khuỷu/gối/hông cần ≥ 3 vòng cạnh để gập mà không xẹp thể tích.
- Tối thiểu cho game: xương hàm, nháy mắt (xương mí hoặc morph), lông mày lên/xuống; bộ v3 hiện giữ đầu cứng (trọng số đầu/tay cứng, mục 5 của `SKILL.md`).
- Quần áo/phụ kiện là **mảnh riêng** (đã có: tách voan/vạt/chân ở C2); không dùng chung UV với thân; trọng số chép từ thân rồi chỉnh.

## 4. Vải: dùng gì từ mô phỏng

Bài học đã có (`SKILL.md` mục 8): dựng lại vải bằng mô phỏng thất bại (khối vuông, CPU ×8); `?cloth` chỉ để thử. Từ `cloth-sim` chỉ lấy những gì giúp **chỉnh lò xo/clip**, không đưa mô phỏng vào bản chạy:

- **Ghim (pin) mềm**: nhóm đỉnh có trọng số giảm dần (vai, cổ áo, đai hông), không ghim nhị phân (gập nếp xấu).
- **Va chạm bằng thân đơn giản** (viên nang/hình hộp theo xương) chứ không bằng lưới mịn; bật tự va chạm chỉ khi cần.
- **Cuộn trước (pre-roll) 20–60 khung** cho vải ổn định tư thế nghỉ trước khi lấy mẫu; áp scale trước khi mô phỏng.
- Muốn dùng kết quả mô phỏng trong game thì **bake thành chuỗi xương phụ/clip** (như `dtl_o_sleeve_*` + `anim_robe`), đừng bake shape key hay cache thô.
- Độ cứng theo loại vải để chọn hệ số lò xo: váy mềm (bẻ thấp), áo choàng/cờ (bẻ thấp, nhớt không khí cao), áo khoác cứng (bẻ cao). Dùng làm điểm khởi đầu cho nhóm lò xo `sleeve`/`robe`, rồi đo bằng `rigstretch`.
