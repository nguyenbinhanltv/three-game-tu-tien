# LOD và hình va chạm trong Blender

Nguồn ý tưởng: `lod-pipeline`, `asset-optimization`, `collision-proxy` (blender-skills, MIT, xem `assets/LICENSES.md`), chỉ lấy phần hợp với dự án. **Không** áp tên `LOD0/UCX_` kiểu Unreal; dự án có cơ chế riêng.

## LOD

LOD **không** dựng tay trong Blender: `tools/asset-pipeline/src/optimize.ts` tạo LOD1/LOD2 bằng `simplify` theo `lods[].ratio` và `maxTriangles` của lớp trong `assets/budgets.json` (ví dụ `player_v3_hi`: LOD1 ≤ 24 000, LOD2 ≤ 8 000). Việc của người dựng là làm LOD0 **dễ giản lược**:

- **Bảo vệ silhouette trước khi bàn đến số tam giác.** Xóa chi tiết thừa ở nguồn (mặt trong bị che, bevel nhỏ, vít/greeble nhỏ hơn vài cm ở ngoài tầm nhìn) thay vì trông chờ `simplify` chọn đúng.
- Sau khi tối ưu, **xoay 360° so với LOD0** (trang xem asset `viewer=asset`, hoặc `pnpm shots asset --ids <id>`): mất nhận dạng ở khoảng cách chuyển LOD thì chỉnh nguồn hoặc đặt `budgetClass`/tỉ lệ khác, đừng ép nhỏ thêm.
- **Cùng số slot material và cùng thứ tự ở mọi LOD**; giữ attribute shader cần (UV, màu đỉnh). Mất skin/`JOINTS_0`/`WEIGHTS_0` ở LOD là lỗi (validate chặn).
- Mesh có xương: **không quantize**, không decimate mạnh vùng đầu/bàn tay (`character-3d` mục 2 và 8).
- Cây/đá ở xa: dùng impostor (`tools/blender/bake_impostor.py`, `pnpm assets:impostor`), không thêm LOD3 hình học. Foliage thường giảm tam giác nhanh hơn mức vật cứng; vật cứng phẳng giữ silhouette tốt hơn nếu xử lý theo mặt phẳng.
- Lặp lại nhiều lần (ngói, cột, bậc, đèn): dựng một mảnh, **nhân bản bằng instance** ở client (`propScatter`, bộ kit `thien_cong_kit.py`), không nhân bản hình học vào một GLB lớn.

Sai thường gặp: decimate mù đến khi không nhận ra; LOD khác số slot material; LOD không có UV/màu đỉnh mà shader cần.

## Hình va chạm theo hệ COL-1

Hình va chạm của dự án sinh từ GLB đã tối ưu bằng `pnpm colliders:lib` (thư viện prop) và `pnpm colliders:arch` (kiến trúc), chi tiết ở `docs/handbook/maps-levels.md` (mục COL-1). Từ Blender chỉ cần **đặt một khối lưới (mesh hộp/trụ, đã áp scale) có tên đúng, không dùng Empty** nếu hình suy từ hộp bao không đủ. `colShapes()` trong `tools/asset-pipeline/src/collider.ts` bỏ qua node `COL_*` không có mesh (Empty xuất ra node không mesh nên bị bỏ âm thầm, collider rơi về suy tự động) và lấy hình từ hộp bao của lưới:

| Tên node trong GLB | Hình | Ghi chú |
| --- | --- | --- |
| `COL_box_*` | hộp (lấy hộp bao của mesh node) | hộp xoay theo yaw; đỉnh đứng được |
| `COL_cyl_*` | trụ | cột tròn, thân cây |
| `COL_ramp_*` | hộp có dốc dọc trục z cục bộ (thấp ở −z, cao ở +z) | cầu, thang, dốc |

Các node `COL_*` xuất kèm asset **nhưng không vẽ**; bước optimize bỏ chúng khỏi cảnh. Không có node `COL_*` thì `collider.ts` tự suy (cây = trụ thân cao ~60% với tán xuyên được, vật < 0,6 m bỏ qua…); đồ muốn đi xuyên được ghi `"none"` trong `packages/content/data/colliders/overrides.json`.

Nguyên tắc rút từ `collision-proxy`, áp vào COL-1:

1. **Ít hình đơn giản hơn một lưới phức tạp.** Bảng công thức (đối chiếu cho `COL_*`): hòm = 1 hộp; ghế/bàn = mặt + vài chân; bậc thang = một hộp mỗi bậc hoặc một `COL_ramp_*` (bước lên tối đa `STEP_UP` 0,5 m); cột = `COL_cyl_*`; cổng/đình = hộp từng cột + dầm đủ cao cho người đi dưới.
2. **Không dùng lưới hiển thị làm hình va chạm.** Khối đặc không đi qua được thì để suy tự động; khối rỗng/cong cần hình tay.
3. **Thu nhẹ vào trong vài cm** ở chỗ hay kẹt (góc tường, khe hẹp) để người chơi trượt qua thay vì dính.
4. Hình phải kín (không có lỗ), đã áp scale, **gốc trùng gốc mesh hiển thị**.
5. Không tạo "tường vô hình" lớn hơn mô hình thấy được; ngự kiếm bay xuyên tán lá (`fly: 'pass'`), kiến trúc thì chặn (`block`).
6. Kiểm bằng `pnpm colliders:lib --check`/`colliders:arch --check` (test chống lệch trong `archcollider.test.ts`) và `pnpm map:report` (quét kẹt/rơi xuyên), không chỉ nhìn bằng mắt.
