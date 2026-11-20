# Đầu vào: ảnh, Tripo, đặt tên, kiểm A-pose

## Quy trình phía người dùng (Tripo web, không API/credit)
1. Ảnh concept A-pose và 4 góc đã duyệt: `<bộ>_<nam|nu>_front|left|right|back.png` (nền xám phẳng, cùng khung).
2. Tripo web → **Multiview to 3D**. Ghép ô: Front = mặt trước; Left = nhân vật quay mặt sang TRÁI khung (thấy bên trái cơ thể); Right = quay sang PHẢI khung; Back = sau lưng. Nếu nhãn ô trên Tripo khác thứ tự, theo **nhãn ô**. Kết quả ngược trái/phải (ngọc bội, giáp vai nằm sai bên): hoán đổi ảnh left và right rồi dựng lại.
3. Model H3.1, bật PBR, chi tiết cao nhất, **không Auto Rig** (rig bằng `chr_v3.py`), tắt tùy chọn tự đổi tư thế. Không dùng Segment "Auto Detailed" (78 mảnh `tripo_part_N` vô nghĩa, đã thử ở pilot Thiên Y).
4. Tải **GLB**, thả vào `3d/nhan-vat/set_<bộ>/tripo/raw_v3_<bộ>_<nam|nu>.glb` trong `dtl-asset-source` (cây thư mục ngoài repo; trỏ bằng `DTL_ASSET_SOURCE`). Tên bộ viết thường, gạch dưới, giống `set` trong JSON bộ. Hộ pháp/đan sư dùng cùng quy tắc (vd `set_dia_long_ho_giap`, thư mục khác tên `set` ở vài bộ: tra danh sách bộ trong `tools/codex-assets/v3-sets-plan.mjs`).
5. Concept sinh bằng `tools/codex-assets/chr-v3-sets-gen.mjs` (Codex), hướng dẫn Tripo từng bộ sinh bằng `tools/codex-assets/v3-sets-doc.mjs`.

## Kiểm A-pose bằng đo W/H (agent làm, trước khi nhập)
Đọc bbox từ `accessors[].min/max` của `POSITION` trong GLB (không cần Blender): `W/H` = (rộng X) / (cao Y).
- 27 model v3 đã duyệt: W/H = **0,49 – 0,68** (thường 0,50–0,60; Liệt Mạch 0,68 vì tay áo rộng). Chiều sâu Z/H 0,17–0,40.
- T-pose (tay ngang) sẽ cho W/H cao hơn rõ (ước tính ≥ ~0,8, **chưa đo trên mẫu T-pose thật**): nếu vượt ngưỡng đó coi là Tripo tự đổi tư thế, xem ảnh rồi dựng lại (lô thử đầu của Kính Quang/Liệt Mạch từng ra T-pose).
- Chiều cao chuẩn hóa: file Tripo cao ~1,0; `chr_v3.py` co về `height` trong JSON bộ (nữ 1,70 m, nam 1,84 m).
Kiểm bằng mắt (4 góc trong Blender/glTF viewer):
- tay dang ~45°, chân hơi tách; **không cầm vũ khí** (kiếm, vỏ gắn rời trong game);
- **không bóng đổ**/nền dính chân, không "đĩa" dưới ủng;
- vạt, dải lụa không dính chân (dính thì C2 tách được nhưng có thể mất chi tiết); tóc dài là khối riêng, không dính áo;
- mặt, tay không thủng; texture có basecolor + normal + rm (KTX2 sau optimize).
Không đạt: báo người dùng dựng lại (kèm ảnh), không tự sửa lưới thô.

## Sau khi nhận file
1. `node tools/blender/v3-newset.mjs <bộ>` (tạo `meta.json`, dòng `assets/LICENSES.md`).
2. Build: `DTL_ASSET_SOURCE=… node tools/blender/run.mjs --only chr_v3_<bộ>_<giới> --force`; thiếu GLB nguồn thì job bị bỏ qua có cảnh báo, **đọc log**.
3. Cache khóa theo file nguồn: đổi JSON bộ phải thêm `--force`.
