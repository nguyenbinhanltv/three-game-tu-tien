# Collider theo asset (COL-1 / C-2)

- `lib.json`: SINH BẰNG `pnpm colliders:lib` (`tools/asset-pipeline/src/collider.ts`) từ GLB prop đã tối ưu. Hình cục bộ (gốc ở chân, mặt trước +Z). Đừng sửa tay.
- `overrides.json`: ghi tay, thay hẳn hình của một asset; `"none"` = đi xuyên được. Hiện `none` cho cổng/cầu/đình/đồ treo vì cần hình riêng (lối đi giữa, mặt cầu đi được): làm ở COL-B (Đoạn Mạch, Vân Hải, Thiên Khuyết).
- Trong Blender, thêm mesh rỗng tên `COL_box_*`, `COL_cyl_*`, `COL_ramp_*` (`_rev` lật dốc, `_pass` bay xuyên, `_walk` đỉnh đứng được) vào asset: bộ sinh ưu tiên chúng hơn suy tự động. Node `COL_` KHÔNG được vẽ (bước optimize phải bỏ khỏi cảnh).
- `<level>.inst.json`: SINH BẰNG `pnpm colliders:bake` (lệnh `tools/maps/bake-colliders.mjs` chạy `apps/client/src/game/world/colliderBake.ts`) từ `allProps(level)` của client: vị trí/xoay/tỉ lệ từng prop đã rải. Test `apps/client/src/game/world/colliderBake.test.ts` báo đỏ nếu hàm rải đổi mà chưa bake lại.
- Nạp: `packages/content/src/colliders.ts` đăng ký `registerCollision(levelId, …)` khi nạp `@dtl/content` (client và server cùng dữ liệu).
- `extra-lib.json`: ghi tay, hình cục bộ cho đồ dựng bằng mã (id `x_*`, không phải GLB), vd. `x_maple_trunk` (thân phong Đoạn Mạch). Vị trí các instance này do `extraInstances(level)` trong `apps/client/src/game/world/colliderBake.ts` sinh (cùng hàm rải với phần dựng cảnh) và nằm chung `<level>.inst.json`. Thêm level mới: thêm hàm vào bảng `EXTRA`, id mới vào `extra-lib.json`, rồi `pnpm colliders:bake`.
