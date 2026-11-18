# Chồng tay áo/vạt của Lạc Kiếm v3b2: chẩn đoán, thử trọng số, và chừa khoảng cách tay

Giao việc: sửa trọng số tay áo và trọng số vạt–đùi trong `chr_v3.py`. Làm theo đúng hướng đó, đo bằng harness, thấy **không hiệu quả**; chẩn đoán lại thì nguyên nhân gốc là tay buông sát thân, nên cải tiến thật nằm ở client (chừa khoảng cách tay). Không đổi asset (v3b2 giữ nguyên); `chr_v3.py` không đổi.

## Đổi thước đo: chia vùng theo hình học
Harness `springMetrics.ts` cũ chia vùng theo xương trội của từng đỉnh (như `chr_v3.py`). Cách đó **phụ thuộc trọng số**: làm mượt trọng số tự nó đổi tập tam giác "tay"/"thân" nên chỉ số nhảy (nam 2.387 → 6.835 chỉ vì chia lại vùng, hình học đổi ít). Nay mặc định chia theo **viên nang xương gần nhất ở tư thế nghỉ** (`geometryRegions`), giống nhau giữa mọi asset; `SPRING_PART=weights` về cách cũ. Số tuyệt đối vì vậy khác #246 (v3b2 nam 2.387 → 6.193, nữ 1.640 → 3.814); chỉ so cùng một lượt đo. `SPRING_DIAG=1` in chẩn đoán (xương trội hai bên chồng, độ cao, viên nang bị vào theo vùng vạt/tay/khác); `SPRING_TUNE` thêm khóa `armDeg`.

## Chẩn đoán (nam v3b2)
- Chồng tay×thân nằm ở **chiều cao 0,71–0,86 chiều cao người (vai–nách)** ở Idle/Jog/ngồi, bên tay là `upperarm_twist`, bên thân là `spine_02`: tay áo rộng buông sát thân đè lên vải ngực. Tay×thân chiếm 148–280 cặp mỗi tư thế (Idle 534 + 737 theo vùng hình học), lớn hơn nhiều chân×chân (64–141). Ngồi: tay phải còn chồng với đùi (295).
- Đỉnh vào viên nang: nhiều nhất ở viên nang hông/ngực (chủ yếu đỉnh thân/áo, không phải vạt), đùi/cẳng (vạt).

## Thử chỉnh trọng số/lò xo tay áo: không giúp (nam; cơ sở v3b2: 6.193 cặp / 12.855 đỉnh)
| thử | cặp chồng | đỉnh viên nang |
| --- | --- | --- |
| làm mượt vạt–đùi, 4 vòng hệ số 0,5 | 5.932 (−4,2%) | 13.122 (+2,1%) |
| làm mượt vạt–đùi, 8 vòng | 5.713 (−7,8%) | 13.291 (+3,4%) |
| làm mượt vai–nách (4 vòng) | 6.394 (+3,2%) | 13.102 (+1,9%) |
| làm mượt vai–nách + vạt–đùi mạnh (6 vòng) | 5.886 (−5,0%) | 13.545 (+5,4%) |
| lò xo tay áo riêng cho cánh tay trên (3 chuỗi × 2 khớp mỗi tay) | 6.972 (+12,6%) | 13.120 (+2,1%) |
| lò xo tay áo cánh tay trên + viên nang ngực ×1…×2 | 6.972 → 6.851 | 13.120 → 13.038 |

Nữ làm mượt vạt–đùi: 4 vòng 3.894 (+2,1%) / 17.311 (+2,3%), 8 vòng 3.700 (−3,0%) / 17.595 (+3,9%) so với cơ sở 3.814 / 16.927. Làm mượt đánh đổi cặp chồng lấy đỉnh trong viên nang, không có lợi cả hai; lò xo tay áo cánh tay trên còn làm xấu vì chồng là giữa hai lớp vải (tay áo và áo thân), viên nang chỉ giữ đỉnh khỏi vào thân chứ không tách hai bề mặt. Hết hướng trọng số/tay áo bằng lò xo; muốn giảm bằng hình học thì phải thu hẹp tay áo (dựng lại model) hoặc đổi tư thế tay.

## Cải tiến: dạng tay theo model, gộp vào ARM_FIT của #249
Sau khi #249 merge có `ARM_FIT` (bù dang tay theo model, mặc định 5°, `?armfit=<độ>`), cùng ý với cơ chế chừa tay ban đầu của #251. Đã **gộp thành một cơ chế** (không cộng dồn góc): giữ `ARM_FIT`/`?armfit=` của #249, bỏ `armClear`/`?armclear=` của tôi, và làm hai việc:
- `ARM_FIT` khai góc cho Lạc Kiếm v3b2 (`chr_v3b2_lac_kiem_nam|nu`) = **16°** (tổng cuối); các model khác vẫn mặc định 5°.
- Nhân thêm **hệ số theo độ buông của tay** (0 khi hướng vai→khuỷu cách phương thẳng đứng hơn 60°, 1 khi buông thẳng) vào khối ARM_FIT (`armDroop`, dùng ma trận thế giới đã cập nhật ở khối đó), để tay giơ ra trước (chém, niệm) không bị dạng thêm. Áp cho mọi model.
Điều kiện của #249 giữ nguyên (`free && !casting`, giảm còn 40% khi chiêu K-5 điều khiển tay), nên **ngồi/đả tọa/bay không được bù** (tay đang theo pose riêng); harness lái clip qua trạng thái không-ngồi nên số đo tư thế ngồi bên dưới cao hơn thực tế trong game.

Quét góc ARM_FIT cho v3b2 (cơ chế gộp, 12 tư thế, chia vùng hình học):

| góc | nam cặp / viên nang | nữ cặp / viên nang |
| --- | --- | --- |
| 0° (không bù) | 6.270 / 12.977 | 3.894 / 16.936 |
| 5° (mặc định #249) | 5.214 (−17%) / 12.623 | 3.305 (−15%) / 16.866 |
| 10° | 4.684 (−25%) / 12.484 | 3.020 (−22%) / 16.860 |
| 12° | 4.455 (−29%) / 12.451 | 2.955 (−24%) / 16.819 |
| **16° (chọn)** | **4.179 (−33%) / 12.396 (−4,5%)** | **2.686 (−31%) / 16.830 (−0,6%)** |
| 20° | 3.697 (−41%) / 12.366 | 2.403 (−38%) / 16.828 |

Chọn 16°: tay dang thêm 16° khi buông, vẫn tự nhiên, 20°+ bắt đầu thấy "chống nạnh". 5° của #249 đã lấy được khoảng nửa lợi ích; 16° lấy thêm ~16 điểm phần trăm.

**CPU** (vi đo 50 nhân vật, `SPRING_CPU=1`, `SPRING_CPU_ARM=off|on` xen kẽ 2 lần, trung vị ms/khung): nam tắt 6,22 / 5,77, bật 6,81 / 6,19; nữ tắt 6,83 / 5,53, bật 6,52 / 6,18. Thêm bốn lần `getWorldPosition` mỗi nhân vật mỗi khung: chi phí nhỏ (≲ 0,5 ms cho 50 nhân vật), trong mức nhiễu.

## Chạm chung file với worker animation
Sau khi #249 merge không còn khối riêng của tôi trong `update()`: toàn bộ nằm trong khối ARM_FIT của #249 (thêm `armDroop`, bảng `ARM_FIT` cho v3b2, hai xương `lowerarm_l/r` vào danh sách `bones`). Phần còn lại của `mannequin.ts` là lò xo (#246).

## Video
`pnpm shots chrv3 --variants v3a0,v3a5,v3new --genders m,f --six --out <thư mục tuyệt đối>` (đặt `FFMPEG=`): ba cột — không bù tay (`?armfit=0`) | main (5°, `?armfit=5`) | cơ chế gộp (16° + hệ số buông, mặc định); Idle, chạy, chém, xoay chém, lăn, ngồi (đả tọa K-5), ngã; hai góc (3/4, ngang), camera sát hông–gối, nhãn clip thật trên khung, ghép theo mốc. Khác biệt rõ nhất ở Idle và đứng: tay dang dần từ cột trái sang phải.
