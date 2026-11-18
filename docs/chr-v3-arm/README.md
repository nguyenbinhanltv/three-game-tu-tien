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

## Cải tiến: chừa khoảng cách tay (client)
`mannequin.ts` (`ARM_CLEAR_DEG`, `SPRING2.armDeg`): sau khi mixer chạy, quay hai cánh tay trên ra khỏi thân quanh trục trước–sau (tính trong hệ xương cha lúc nghỉ nên theo thân khi xoay) một góc, **nhân hệ số theo độ buông của tay** (0 khi hướng vai→khuỷu cách phương thẳng đứng hơn 60°, 1 khi buông thẳng; dùng ma trận khung trước, không cập nhật thêm) để tay giơ ra trước (niệm chú, chém) không bị dạng thêm. Chỉ áp cho asset `chr_v3b2_*`; `?armclear=<độ>` đổi (0 tắt). Quét góc (hệ số theo độ buông, v3b2):

| góc | nam cặp / viên nang | nữ cặp / viên nang |
| --- | --- | --- |
| 0° (cơ sở) | 6.193 / 12.855 | 3.814 / 16.927 |
| 12° | 4.384 (−29%) / 12.347 (−4,0%) | 2.848 (−25%) / 16.804 (−0,7%) |
| **16° (chọn)** | **4.136 (−33%) / 12.291 (−4,4%)** | **2.748 (−28%) / 16.801 (−0,7%)** |
| 20° | 3.939 (−36%) / 12.286 | 2.592 (−32%) / 16.798 |
| 24° | 3.748 (−39%) / 12.308 | 2.456 (−36%) / 16.788 |

Chọn 16° (tay dang thêm 16° khi buông: vẫn tự nhiên, 20°+ bắt đầu thấy "chống nạnh"). Theo tư thế (nam, cặp / viên nang, 0° → 16°): Idle 1.281/710 → 720/646; ngồi 1.789/1.664 → 913/1.289 (viên nang −23%); Hit_Chest 426 → 255; niệm 432 → 104; nữ Idle 825 → 409, ngồi 932/1.990 → 694/1.907. Jog/chém/lăn ít đổi vì tay đã khác tư thế buông.

Khi bật hệ số theo độ buông, tay niệm chú không còn bật cao (không có hệ số: 8°/20° làm tay phải giơ cắt vào thân, nam 962/1.336 cặp ở tư thế niệm).

## CPU
Vi đo 50 nhân vật (`SPRING_CPU=1`, `SPRING_CPU_ARM=off|on`, xen kẽ 2 lần mỗi chế độ, trung vị ms/khung): nam tắt 8,68 / 9,99, bật 9,38 / 7,64; nữ tắt 9,24 / 9,80, bật 8,96 / 7,71. Nhiễu lớn hơn chi phí; thêm một phép nhân quaternion mỗi tay mỗi khung, không đo được.

## Chạm chung file với worker animation
`mannequin.ts` chỉ thêm: hằng số và trường `armClear`/`armQ`, dựng danh sách tay trong constructor (sau khi dựng rig), và **một khối nhỏ trong `update()` ngay sau `mixer.update` và trước tính xương twist** (nhân quaternion hai cánh tay). Không đổi crossfade, retarget, clip nền hay đòn. Nếu worker animation đổi thứ tự trong `update()` thì khối này phải đứng sau mixer và trước twist/lò xo.

## Video
`pnpm shots chrv3 --variants v3old,v3new --genders m,f --six --out <thư mục tuyệt đối>` (đặt `FFMPEG=`): trái `?armclear=0` (không chừa tay), phải mặc định (chừa tay 16°); Idle, chạy, chém, xoay chém, lăn, ngồi (đả tọa K-5), ngã; hai góc (3/4, ngang), camera sát hông–gối, nhãn clip thật trên khung, ghép theo mốc. Khác biệt rõ nhất ở Idle/đứng và ngồi: tay dang hơn.
