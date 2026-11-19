# Collider theo asset (COL-1 / C-2)

- `lib.json`: SINH BẰNG `pnpm colliders:lib` (`tools/asset-pipeline/src/collider.ts`) từ GLB prop đã tối ưu. Hình cục bộ (gốc ở chân, mặt trước +Z). Đừng sửa tay.
- `overrides.json`: ghi tay, thay hẳn hình của một asset; `"none"` = đi xuyên được. Hiện `none` cho cổng/cầu/đình/đồ treo vì cần hình riêng (lối đi giữa, mặt cầu đi được): làm ở COL-B (Đoạn Mạch, Vân Hải, Thiên Khuyết).
- Trong Blender, thêm mesh rỗng tên `COL_box_*`, `COL_cyl_*`, `COL_ramp_*` (`_rev` lật dốc, `_pass` bay xuyên, `_walk` đỉnh đứng được) vào asset: bộ sinh ưu tiên chúng hơn suy tự động. Node `COL_` KHÔNG được vẽ (bước optimize phải bỏ khỏi cảnh).
- `<level>.inst.json`: SINH BẰNG `pnpm colliders:bake` (`apps/client/scripts/build-colliders.ts`) từ `allProps(level)` của client: vị trí/xoay/tỉ lệ từng prop đã rải. Test `colliders.drift.test.ts` ở client báo đỏ nếu hàm rải đổi mà chưa bake lại.
- Nạp: `packages/content/src/colliders.ts` đăng ký `registerCollision(levelId, …)` khi nạp `@dtl/content` (client và server cùng dữ liệu).
