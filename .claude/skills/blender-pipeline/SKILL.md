---
name: blender-pipeline
description: Chạy Blender ở chế độ nền bằng script Python (bpy) để sinh, xuất và tối ưu asset GLB cho Đạp Thiên Lộ — quy ước đặt tên, custom properties, bộ xương chung, LOD, gltf-transform, KTX2, kiểm tra ngân sách tam giác/texture. Dùng khi thêm hoặc sửa bất kỳ asset 3D nào, hoặc khi dùng Blender làm level editor.
---

# Pipeline Blender → glTF

> Hiện trạng MVP: chỉ có `tools/blender/build_sect.py` (sinh lưới bằng `from_pydata`, màu đỉnh `FLOAT_COLOR` tuyến tính, xuất GLB) và `tools/blender/run.mjs` (`pnpm assets:build`). GLB xuất thẳng vào `apps/client/public/assets/`, client nạp bằng GLTFLoader và thay material bằng `MODEL_MAT`. Chưa có bước gltf-transform/KTX2, `export.py`, `export_level.py` hay `assets/source/`. Máy đang dùng Blender 5.3.
> Tọa độ trong script là tọa độ game quanh tâm sân tông môn; vị trí công trình phải khớp `COLLIDERS` trong `packages/shared/src/level.ts`.

## Chạy Blender

- Luôn chạy nền, không mở giao diện: `blender --background <file.blend> --python tools/blender/<script>.py -- <args>`.
- Kiểm tra Blender đã có chưa (`blender --version`). Chưa có thì báo người dùng cài Blender 4.x và thêm vào PATH; trong lúc chờ, dùng cách sinh bằng code Three.js (skill `procedural-assets`).
- Script nhận tham số sau `--`, đọc bằng `sys.argv[sys.argv.index('--') + 1:]`.

## Blender MCP (tương tác)

`.mcp.json` khai báo server `blender` (`uvx mcp-for-blender`, tên mới của gói `blender-mcp`; telemetry tắt). Nó điều khiển **Blender đang mở** qua addon (cổng 9876, chỉ localhost): xem cảnh, chụp viewport, thử dựng hình, soi asset. Chỉ dùng để khám phá và kiểm tra bằng mắt.

- Pipeline chính vẫn là script headless (`tools/blender/*.py`, `pnpm assets:build`). Thứ gì thử được qua MCP mà muốn giữ thì viết lại thành script trong `tools/blender/` để chạy lại được; không giao asset chỉ tồn tại trong một file `.blend` sửa tay.
- Tool `execute_blender_code` chạy Python tùy ý trong Blender: nhắc người dùng lưu file trước, không đọc/ghi ngoài repo, không gọi mạng.
- Không kết nối được (chưa mở Blender, chưa bật addon) thì quay về chạy headless, đừng chờ.

## Các bước pipeline

1. **Sinh hoặc mở** `.blend` nguồn trong `assets/source/`.
2. **Xuất**: `tools/blender/export.py` xuất từng collection có tiền tố `EXPORT_` thành một GLB vào `assets/build/raw/`. Custom properties trên object/Empty ghi ra `extras` của glTF.
3. **Tối ưu**: `tools/asset-pipeline/optimize.ts` dùng `@gltf-transform/core` + `functions`: dedup, prune, weld, `meshopt` nén, texture sang KTX2 (ETC1S cho màu, UASTC cho normal), sinh LOD bằng `simplify` (tỉ lệ 1, 0.4, 0.15).
4. **Kiểm tra ngân sách**: `tools/asset-pipeline/validate.ts`, báo lỗi và dừng nếu vượt.
5. **Đóng gói**: đổi tên theo hash nội dung, cập nhật `assets/build/manifest.json`.

Lệnh tổng: `pnpm assets:build` (hoặc `pnpm assets:build --only <tên>`).

## Quy ước

- Tên collection/object: `snake_case` không dấu, tiền tố loại: `chr_`, `mon_`, `prop_`, `arch_`, `fx_`, `lvl_`.
- Đơn vị: 1 unit = 1 mét, trục Y lên khi xuất (bật `export_yup`), gốc tọa độ ở chân vật.
- Áp dụng scale/rotation trước khi xuất (`bpy.ops.object.transform_apply`).
- Nhân vật hình người dùng **bộ xương chung** `rig_human_base` (tối đa 60 xương) để mọi animation dùng chung.

| Loại | Tam giác LOD0 | Texture | Bắt buộc |
| --- | --- | --- | --- |
| Nhân vật người chơi | 15–25 nghìn | atlas 1024² | bộ xương chung |
| Quái thường / NPC | 3–8 nghìn | 512² | xuất thêm VAT nếu đi theo đàn |
| Boss | 30–50 nghìn | 2048² | |
| Prop | 200–5 nghìn | atlas/trim sheet chung | LOD1, LOD2 |
| Kiến trúc | theo kit modular | trim sheet | lắp từ mảnh |

## Blender làm level editor

- Đặt Empty trong collection `lvl_<tên_bản_đồ>` với custom property:
  - `spawn = "monster:<id>"`, `count`, `radius`, `respawn_s`
  - `npc = "<id>"`
  - `portal = "<room_id>"`
  - `zone = "safe" | "no_fly"` (dùng hộp bao của Empty)
- `tools/blender/export_level.py` xuất ra `packages/content/levels/<tên>.json`; server đọc file này, không đọc GLB.
- Id quái, NPC phải tồn tại trong `packages/content`; script xuất báo lỗi nếu không tìm thấy.
