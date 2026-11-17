# E2 · 3 kiếm bậc mới (Tripo web)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2-kiem/<file>`.

| Asset | Bậc / bản đồ | Dài | LOD0 | `SWORD_TINT` |
| --- | --- | --- | --- | --- |
| `prop_kiem_liet_mach` | 2 (L16–19), Đoạn Mạch | 1,1 m | 2474 | 2,5 / 2,2 / 1,6 (lưỡi ngà vàng) |
| `prop_kiem_kinh_quang` | 3 (L20–23), Vân Hải | 1,15 m | 2464 | 1,9 / 1,8 / 1,65 |
| `prop_kiem_tinh_khuyet` | 4 (L24–27), Cổ Thành | 1,2 m | 2364 | 1,7 / 1,55 / 1,4 |

- Ba kiếm dựng từ concept chéo nên nằm nghiêng ~35° (liệt mạch còn lệch Z): `orient_sword.py` giờ căn trục chính (PCA) về X, bề dày về Y trước khi đo chắn/chuôi (kiếm đã thẳng giữ nguyên); `size.longest` đặt theo chiều dài thật (0,876 / 0,9605 / 0,9908 → 1,1 / 1,15 / 1,2 m).
- Nhập y như 5 kiếm trước (`docs/kiem-moi/`): `meta.json` kind `tripo` + `import.post = tools/blender/orient_sword.py`, lớp `weapon`, không LOD, texture 512. Client gắn vào xương `dtl_sword`, độ dài kẹp theo kiếm cũ (0,75–1,3 lần) nên kiếm 1,15–1,2 m vẫn vừa bao trên lưng.
- **Đăng ký**: `SWORD_MODELS_TIER` trong `packages/content/src/index.ts` (đã nằm trong `SWORD_MODELS`, test kiểm lớp `weapon`). **Chưa gắn vật phẩm**: dữ liệu trang bị bậc 2–4 chưa có, E2-F thêm `"model": "prop_kiem_liet_mach"` … vào `items.json`/`setItems.json`.
- Xem thử khi chưa có vật phẩm: `?sword=<id asset>` (chỉ hình, mọi người chơi hiện kiếm đó; `testParams.swordOverride`), và `pnpm shots:kiem --model prop_kiem_liet_mach --out <đường dẫn tuyệt đối> --gender m|f`.
- Ảnh (GPU thật, WebGPU, preset Cao): `nam/`, `nu/`, mỗi kiếm `*-deo-lung`, `*-cam-tay`, `*-chem`.
