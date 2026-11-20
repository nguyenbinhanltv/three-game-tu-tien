# Checklist QA asset trước khi xuất

Chạy sau khi dựng xong và **trước** `pnpm assets:build`/PR. Phần đo được đã có trong `pnpm assets:validate` (xem `tools/asset-pipeline/src/validate.ts`, ghi rõ bên dưới); phần còn lại là soát tay và ảnh. Kết thúc bằng một **phán quyết rõ ràng** (SHIP / SHIP CÓ GHI CHÚ / KHÔNG SHIP).

Nguồn ý tưởng: `qa-review`, `asset-optimization`, `lod-pipeline`, `collision-proxy` (blender-skills, MIT, xem `assets/LICENSES.md`), viết lại theo quy ước dự án.

## 1. Hình học (trong script bpy, trước khi xuất)

| Kiểm | Cách | Tự động ở validate? |
| --- | --- | --- |
| Tam giác LOD0 trong lớp ngân sách | `assets/budgets.json` (lớp suy từ tiền tố id) | có |
| Đã áp scale/rotation (scale 1,1,1) | `transform_apply` trước khi xuất | một phần (chiều cao raw/build lệch >1%) |
| Gốc ở chân vật, 1 unit = 1 m, trục Y lên | `export_yup` | chiều cao |
| Cạnh không-manifold, mặt thừa bên trong, đỉnh rời | bmesh (đoạn mẫu dưới) | không |
| Đỉnh trùng (hàn) | `remove_doubles` khoảng cách nhỏ; **không hàn** lưới giữ gốc của Tripo (`character-3d` mục 2) | không |
| Pháp tuyến hướng ra ngoài, không lật | `recalc_face_normals`; nhìn ảnh có mặt tối bất thường | không |
| Tên node/mesh/material không dấu, không khoảng trắng | quy ước `blender-pipeline` | cảnh báo |
| Modifier còn sống (mirror, boolean, bevel…) | áp hết trước xuất, trừ khi cố ý | không |

Đoạn mẫu soát nhanh (để dán vào script job, **chưa có file riêng**):

```python
import bmesh, bpy
def audit(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    return dict(name=ob.name, tris=tris, nonmanifold=nm, loose=loose, ngons=ngons,
                scale=tuple(round(s, 4) for s in ob.scale), mats=len(ob.material_slots))
```

Không-manifold ở vật **cố ý hở** (lá, cờ, voan, mặt phẳng một lớp) là chấp nhận được; ghi lý do vào bản phán quyết. Khối đặc kín mà hở là blocker.

## 2. UV và texture

- Hiệu suất xếp UV > 75% với asset tự dựng (asset Tripo giữ UV gốc, không ép).
- Mật độ texel đồng đều giữa các mảnh cùng asset (so bằng ảnh lưới ô vuông kiểm tra), nhất là mặt và bàn tay so với thân.
- Không chồng UV ngoài ý muốn (đối xứng gương cố ý thì được).
- Texture theo lớp ngân sách và KTX2 (`blender-pipeline` bước 2); validate đã chặn vượt ngân sách.

## 3. Vật liệu và draw call

- **Số material = số draw call mỗi mảnh**: gộp các material trùng, dùng chung atlas/trim sheet khi có thể (ngân sách cả cảnh < 300 draw call, `CLAUDE.md`).
- Không có slot rỗng/không dùng. Mọi slot cùng thứ tự ở các LOD.
- **Mảng phát sáng là material riêng theo từng vật**; tuyệt đối không dùng chung một material cấu trúc cho nơi cần nhấp nháy/đổi cường độ phát (đổi một lần làm trắng cả thân). Hiệu ứng nhấp nháy làm ở shader/phía client, không bằng cách lật `emission` của material dùng chung.
- Màu lấy từ `assets/palette.json`; không flat/cel shading (art bible mục 8).

## 4. Tổ chức và xuất

- Tên asset theo tiền tố loại (`chr_`, `mon_`, `prop_`, `arch_`…); có `assets/source/<loại>/<id>/meta.json` và dòng trong `assets/LICENSES.md`.
- Hình va chạm (nếu cần) đi theo hệ **COL-1** của dự án, không phải UCX của Unreal: xem `lod-collision.md`.
- Custom property cần cho game (`extras`) có mặt; các node chỉ để dựng (cutter boolean, đối tượng hỗ trợ, camera, đèn) không lọt vào GLB.
- Kết quả build: **grep `Traceback` trong log** (run.mjs vẫn trả 0 khi script lỗi và giữ asset cũ, `character-3d` mục 7).

## 5. Ảnh bắt buộc

| # | Ảnh | Khi nào |
| --- | --- | --- |
| 1 | 3/4 chính (trước) | luôn |
| 2 | 3/4 đối diện hoặc mặt sau | luôn |
| 3 | Hồ sơ ngang, hoặc nhìn thẳng từng 45° | khi tỉ lệ quan trọng; kiểm silhouette ở mỗi 45° |
| 4 | Lưới/wireframe hoặc ảnh mật độ tam giác | tùy chọn, hữu ích khi lệch ngân sách |
| 5 | **Ở khoảng cách chơi trong game** (`pnpm shots …` hoặc trang xem asset `?mute=1&viewer=asset`) | luôn: ảnh Blender cận cảnh không chứng minh được gì về cách nó đọc trong game |
| 6 | So với ảnh tham chiếu | nếu có ảnh tham chiếu (`reference-match.md`) |

Trang xem asset có sẵn người chuẩn 1,7 m để so tỉ lệ.

## 6. Mức nghiêm trọng

| Mức | Nghĩa | Ví dụ |
| --- | --- | --- |
| Blocker | không vào game được | sai scale/hướng, pháp tuyến hỏng, vượt ngân sách mạnh, thiếu LICENSES/meta, LOD mất skin |
| Major | đọc được kém, lỗi dễ thấy | silhouette sai, gốc sai, khe hở lộ, mặt/tay méo |
| Minor | tinh chỉnh | tên chưa chuẩn, lệch shading nhỏ |
| Ghi chú | tùy chọn | ý tưởng đánh bóng |

## 7. Mẫu phán quyết (dán vào mô tả PR)

```markdown
## QA: <id asset>
**Kết quả:** SHIP / SHIP CÓ GHI CHÚ / KHÔNG SHIP
**Ngân sách:** <tam giác LOD0/1/2, texture, xương> so với lớp `<lớp>`
**Ảnh:** <liệt kê các góc đã chụp, có ảnh ở khoảng cách chơi không>
**Blocker:** …
**Major:** …
**Minor:** …
**Chạy lại sau:** <thay đổi nào cần kiểm lại>
```

Quy tắc: không đóng dấu SHIP nếu việc về hình ảnh mà chưa có ảnh; sau mỗi lần sửa phải kiểm lại trước khi đổi phán quyết; vượt ngân sách mà chưa được người dùng cho phép thì không SHIP (`perf-budget`: không hạ ngưỡng để cho qua).
