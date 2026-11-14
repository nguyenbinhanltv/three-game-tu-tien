---
name: procedural-assets
description: Sinh asset thủ tục cho Đạp Thiên Lộ khi không có artist — địa hình núi non, sông hồ, cây, đá, linh thảo, kiến trúc tông môn kiểu cổ phong, phi kiếm, pháp bảo — bằng code Three.js hoặc script Blender. Dùng khi cần tạo hoặc thay asset môi trường, prop, hay chỉnh nhân vật lấy từ gói CC0.
---

# Asset thủ tục

> Hiện trạng MVP: địa hình, cây, đá, mây, nước sinh trong `apps/client/src/game/terrain.ts` và `env.ts` (dùng `GeoBuilder` gộp lưới tô màu đỉnh); nhân vật, quái, cây thuốc trong `models.ts`; kiến trúc tông môn bằng Blender (`tools/blender/build_sect.py`), có bản dự phòng bằng code trong `sect.ts`. Chưa dùng gói CC0 nào, nên chưa có `assets/LICENSES.md`.

Dự án chỉ có AI làm, nên asset môi trường được **sinh bằng thuật toán** chứ không nặn tay. Nhân vật và animation lấy từ gói CC0 rồi chỉnh lại.

## Chọn cách làm

| Asset | Cách làm | Nơi đặt code |
| --- | --- | --- |
| Địa hình, núi, hồ | Heightmap từ noise (fBm + ridged) + xói mòn thủy lực đơn giản, sinh offline thành tile | `tools/procgen/terrain/` |
| Đá, cây, cỏ, linh thảo | Script bpy sinh nhiều biến thể low-poly theo seed | `tools/blender/gen_*.py` |
| Kiến trúc tông môn | Kit modular bằng bpy: mái cong, cột, lan can, bậc đá, cổng; lắp ghép bằng dữ liệu bố cục | `tools/blender/kit_architecture.py` |
| Phi kiếm, pháp bảo, lò đan | Mesh đơn giản bằng bpy + material phát sáng | `tools/blender/gen_props.py` |
| Nhân vật, quái | Gói CC0 có xương (ví dụ Quaternius) → đổi màu, thêm tóc búi, áo bào, phụ kiện | `assets/source/characters/` |
| Animation | Gói animation CC0 hoặc Mixamo do người dùng tải → retarget về bộ xương chung | `assets/source/animations/` |

## Quy tắc chung

- Mọi bộ sinh **phải nhận seed** và cho ra cùng kết quả với cùng seed, để có thể sinh lại asset bất cứ lúc nào.
- Không commit asset sinh ra mà không commit kèm script + seed tạo ra nó.
- Low-poly stylized, flat/cel shading, màu theo bảng của Art Bible (xem skill `tsl-shaders-vfx`). Ưu tiên một atlas màu (palette texture 256×256) dùng chung thay vì texture riêng cho từng vật.
- Mọi asset đi qua skill `blender-pipeline` để tối ưu và kiểm tra ngân sách trước khi vào game.
- Nếu Blender chưa được cài: sinh trực tiếp bằng code Three.js (BufferGeometry), xuất GLB bằng `GLTFExporter` qua script Node, và ghi chú để sinh lại bằng bpy sau.

## Asset bên thứ ba

- Chỉ dùng nguồn có giấy phép rõ ràng (CC0 ưu tiên). Ghi mỗi asset vào `assets/LICENSES.md`: tên, nguồn, link, giấy phép, ngày tải.
- Không tải asset có điều khoản cấm dùng trong game nhiều người chơi hoặc yêu cầu ghi công mà ta không hiển thị được.
- Không tự tải file thay người dùng từ trang cần đăng nhập (ví dụ Mixamo); hướng dẫn người dùng tải và đặt vào `assets/source/`.

## Kiểm tra bằng mắt

- Sau khi sinh, render ảnh xem trước (`tools/blender/render_preview.py` hoặc trang `apps/client/?viewer=asset&file=...`) và nhìn ảnh trước khi báo xong.
