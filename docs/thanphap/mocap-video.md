# Mocap từ video (TP-6): hướng dẫn quay và công cụ mã nguồn mở

Mục tiêu: người dùng tự quay động tác võ/kiếm, ta trích xương từ video rồi retarget sang bộ xương UE5 Mannequin của nhân vật v3. Thử cho 3–5 chiêu tiêu biểu và so với bản pose-to-pose của Claude (`tools/poses/thanphap.mjs`). **Dịch vụ AI mocap trả phí: phải hỏi người dùng trước khi dùng.** Mọi công cụ dưới đây chạy cục bộ, không trả phí; chưa chạy thử trên máy này (làm ở TP-6), nên mục "Trạng thái" ghi rõ.

## 1. Hướng dẫn quay

| Hạng mục | Yêu cầu |
| --- | --- |
| Máy quay | Điện thoại đặt cố định trên chân máy hoặc dựa vào vật chắc. Không cầm tay, không zoom, không chế độ chống rung điện tử cắt khung |
| Hướng | Ngang (landscape), 1080p trở lên, **60 fps** (đòn nhanh cần 60 fps; 30 fps nhòe tay) |
| Góc | Quay hai lần mỗi động tác: (a) chính diện, (b) chéo 45° hoặc sườn. Camera ngang tầm hông, cách 4–5 m, **thấy trọn từ đầu đến chân và cả hai tay khi dang rộng** (chừa lề 20%) |
| Ánh sáng | Sáng đều, ban ngày trong nhà gần cửa sổ hoặc ngoài trời râm. Tránh ngược sáng, tránh nắng gắt cắt bóng |
| Nền | Tường trơn hoặc nền tương phản với trang phục, không có người khác trong khung |
| Trang phục | Ôm vừa, màu đơn sắc **tương phản với nền**; không áo choàng dài, không váy rộng (che chân/hông, xương sai). Tay áo gọn tới cổ tay. Giày màu khác sàn |
| Vũ khí | Dùng gậy/kiếm gỗ nhẹ màu sáng (không kiếm thật). Gắn băng màu ở mũi để ta đo hướng lưỡi |
| Mở đầu mỗi clip | Đứng **tư thế chữ T 2 giây** (dang hai tay ngang vai, nhìn thẳng) rồi về tư thế nghỉ, để định chuẩn kích thước/tỉ lệ cơ thể |
| Độ dài | Mỗi clip 3–6 giây cho **một** chiêu: dồn lực, đòn, thu về; nghỉ 1 giây giữa các lần. Quay 3 lần mỗi chiêu, ta chọn lần sạch nhất |
| Nhịp | Làm đúng nhịp mong muốn của game: dồn lực chậm hơn một chút, đỉnh đòn **khựng 0,1 giây**, rồi thu. Động tác cường điệu hơn thường ngày (camera chéo cần biên độ lớn) |
| Chiêu ưu tiên | `kiem_khi_tram` (chém ngang), `phi_kiem` (đâm/chém liên hoàn), `thien_kiem_vu` (vung lên rồi nện xuống), một đòn lướt, một thế chuẩn bị (idle đặc trưng) |
| Đặt tên file | `<chiêu>_<chinhdien|cheo>_<lần>.mp4`, ví dụ `kiem_khi_tram_cheo_2.mp4`; để vào `dtl-asset-source/anim/mocap/raw/` (ngoài repo, không commit video) |

## 2. Công cụ mã nguồn mở (không trả phí, chạy cục bộ)

Chuỗi đề xuất: **video → khung xương 3D → BVH → retarget Mannequin trong Blender → clip glTF**.

| Bước | Công cụ | Giấy phép | Ghi chú |
| --- | --- | --- | --- |
| Trích khớp 3D từ một video | MediaPipe Pose (BlazePose, 33 điểm, có tọa độ thế giới) | Apache-2.0 | Nhẹ, chạy CPU, dễ cài (`pip install mediapipe`). Chất lượng trung bình; hợp để thử nhanh |
| Trích khớp, độ chính xác cao hơn | RTMPose / MMPose + nâng 3D (MotionBERT) | Apache-2.0 | Chính xác hơn khi tay chạm thân; cần GPU |
| Chuyển động cả thân dạng SMPL | WHAM hoặc 4DHumans | MIT (mã); **mô hình SMPL có điều khoản phi thương mại** | Game chơi riêng với bạn bè, không thương mại nên phù hợp; vẫn ghi vào `assets/LICENSES.md` |
| Làm mượt, khử rung | One-Euro hoặc Savitzky–Golay trên chuỗi khớp | — | Tự viết (script nhỏ); bắt buộc vì video 60 fps vẫn có nhiễu |
| Xuất BVH | script riêng từ chuỗi khớp, hoặc add-on Blender import SMPL | — | |
| Retarget sang UE5 Mannequin | Blender (constraint Copy Rotation theo cặp xương, rồi Bake Action) | GPL | Dùng ánh xạ tên xương Mannequin: `pelvis`, `spine_01..03`, `neck_01`, `Head`, `clavicle_*`, `upperarm_*`, `lowerarm_*`, `hand_*`, `thigh_*`, `calf_*`, `foot_*` |
| Xuất clip | `tools/blender/` (`export_anim_lib.py`, `anim_biped_extra.py` làm mẫu) → GLB → `tools/asset-pipeline` | — | Giữ tên xương Mannequin để dùng chung thư viện clip |

Không dùng: dịch vụ đám mây tính phí (Plask, Move AI, DeepMotion, Rokoko Vision, v.v.) khi chưa có duyệt của người dùng. Không dùng Tripo API.

## 3. Cách đưa vào game

1. Clip mocap thành **pose key dạng dữ liệu** thay vì clip xương dày: lấy ~8–12 khung khóa (dồn lực, đỉnh, giữ, thu) từ chuỗi đã làm mượt, đổi thành `packages/content/data/poses/<id>_mc.json` (cùng định dạng K-5 của `tools/poses/`). Lợi: IK chân, khung giữ 2–4 khung và hit-stop dùng nguyên đường hiện có, dễ chỉnh tay.
2. Hoặc nhập thẳng như clip (như `anim_ual_native`) cho các động tác liên tục như chạy/idle.
3. So sánh bằng `pnpm shots animlab --pose <id>,<id>_mc --cams iso,close` (ảnh cạnh nhau, cùng khung thời gian).

## 4. Trạng thái

Chưa chạy thử công cụ nào trên máy này. Việc làm khi người dùng có video: (1) thử MediaPipe trên một clip để kiểm chất lượng; (2) nếu tay/kiếm giật thì thử RTMPose + MotionBERT; (3) viết script ánh xạ khớp → xương Mannequin; (4) retarget một chiêu, xem ở `?animlab`; (5) báo người dùng trước khi tốn quota cho cả bộ.
