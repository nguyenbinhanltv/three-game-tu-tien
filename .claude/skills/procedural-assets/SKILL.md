---
name: procedural-assets
description: Sinh asset thủ tục cho Đạp Thiên Lộ khi không có artist — địa hình núi non, sông hồ, cây, đá, linh thảo, kiến trúc tông môn kiểu cổ phong, phi kiếm, pháp bảo — bằng code Three.js hoặc script Blender. Dùng khi cần tạo hoặc thay asset môi trường, prop, hay chỉnh nhân vật lấy từ gói CC0.
---

# Asset thủ tục

> Hiện trạng MVP: địa hình, cây, đá, mây, nước sinh trong `apps/client/src/game/terrain.ts` và `env.ts` (dùng `GeoBuilder` gộp lưới tô màu đỉnh); nhân vật, quái, cây thuốc trong `models.ts`; kiến trúc tông môn bằng Blender (`tools/blender/build_sect.py`), có bản dự phòng bằng code trong `sect.ts`. Chưa dùng gói CC0 nào, nên chưa có `assets/LICENSES.md`.

Dự án chỉ có AI làm, nên asset môi trường được **sinh bằng thuật toán** chứ không nặn tay. Nhân vật, quái, boss và prop chi tiết dựng bằng Tripo (xem `docs/tripo-runbook.md`); gói CC0 chỉ để bổ sung khi thiếu.

**Nguồn chuẩn về hình ảnh: `docs/art-bible.md`** (v3, bán tả thực điện ảnh): mục 3 (vật liệu PBR cách điệu), mục 4 (bảng màu tâm trạng), mục 8 (điều cấm, trong đó có cel-shading).

## Chọn cách làm

| Asset | Cách làm | Nơi đặt code |
| --- | --- | --- |
| Địa hình, núi, hồ | Heightmap từ noise (fBm + ridged) + xói mòn thủy lực đơn giản, sinh offline thành tile | `tools/procgen/terrain/` |
| Đá, cây, cỏ, linh thảo | Script bpy sinh nhiều biến thể theo seed, vật liệu PBR đơn giản | `tools/blender/gen_*.py` |
| Kiến trúc tông môn | Kit modular bằng bpy: mái cong, cột, lan can, bậc đá, cổng; lắp ghép bằng dữ liệu bố cục | `tools/blender/kit_architecture.py` |
| Phi kiếm, pháp bảo, lò đan | Mesh đơn giản bằng bpy + material phát sáng | `tools/blender/gen_props.py` |
| Nhân vật, quái | Tripo (multiview + rig) theo `docs/prompts/`; gói CC0 có xương chỉ là dự phòng | `assets/source/<loại>/<id>/meta.json`, file lớn ở `DTL_ASSET_SOURCE` |
| Animation | Gói animation CC0 hoặc Mixamo do người dùng tải → retarget về bộ xương chung | `assets/source/animations/` |

## Quy tắc chung

- Mọi bộ sinh **phải nhận seed** và cho ra cùng kết quả với cùng seed, để có thể sinh lại asset bất cứ lúc nào.
- Không commit asset sinh ra mà không commit kèm script + seed tạo ra nó.
- Vật liệu **PBR đơn giản** (art bible mục 3): màu lấy từ bảng màu tâm trạng (`assets/palette.json`), roughness theo loại chất liệu (vải, đá, gỗ 0,6–0,95; kim loại có metalness), thêm texture nhiễu hoặc trim sheet nhỏ để có chất. **Không** dùng flat/cel shading, toon hay viền mực (art bible mục 8.3). Bảng màu là hướng dẫn, không ép từng điểm ảnh về 32 màu.
- Mọi asset đi qua skill `blender-pipeline` để tối ưu và kiểm tra ngân sách trước khi vào game.
- Nếu Blender chưa được cài: sinh trực tiếp bằng code Three.js (BufferGeometry), xuất GLB bằng `GLTFExporter` qua script Node, và ghi chú để sinh lại bằng bpy sau.

## Asset bên thứ ba

- Chỉ dùng nguồn có giấy phép rõ ràng (CC0 ưu tiên). Ghi mỗi asset vào `assets/LICENSES.md`: tên, nguồn, link, giấy phép, ngày tải.
- Không tải asset có điều khoản cấm dùng trong game nhiều người chơi hoặc yêu cầu ghi công mà ta không hiển thị được.
- Không tự tải file thay người dùng từ trang cần đăng nhập (ví dụ Mixamo); hướng dẫn người dùng tải và đặt vào `assets/source/`.

## Kiểm tra bằng mắt

- Sau khi sinh, render ảnh xem trước (`tools/blender/render_preview.py` hoặc trang `apps/client/?viewer=asset&file=...`) và nhìn ảnh trước khi báo xong.
