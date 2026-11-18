---
name: blender-pipeline
description: Chạy Blender ở chế độ nền bằng script Python (bpy) để sinh, xuất và tối ưu asset GLB cho Đạp Thiên Lộ — quy ước đặt tên, custom properties, bộ xương chung, LOD, gltf-transform, KTX2, kiểm tra ngân sách tam giác/texture. Dùng khi thêm hoặc sửa bất kỳ asset 3D nào, hoặc khi dùng Blender làm level editor.
---

# Pipeline Blender → glTF

> Hiện trạng (2026-11-15, sau Phase 2; mục cũ bên dưới đã cập nhật):
> - **Có**: `tools/blender/run.mjs` (danh sách job → GLB thô `assets/build/raw/<id>.glb`, bỏ qua job khi GLB thô mới hơn script), `build_sect.py` (kiến trúc tông môn → `arch_sect`), `build_fixture_rig.py` (GLB có xương cho test), `find-blender.mjs` (dò Blender qua `BLENDER`, PATH, thư mục cài mặc định). `tools/asset-pipeline`: `optimize.ts`, `validate.ts`, `ktx.ts`, `config.ts`, test vitest. Client nạp theo manifest qua `AssetCache` (`apps/client/src/game/core/assets.ts`). Chi tiết lệnh và bố cục: `assets/README.md`.
> - **Có từ M2-2**: `import_tripo.py` chuẩn hóa GLB Tripo (hướng theo xương đùi hoặc `yaw`, scale theo `size` trong meta, gốc ở đáy, áp transform, tên theo id, socket, hạ texture); `run.mjs` tự tạo job cho meta.json có khối `import`; `optimize.ts` hạ LOD0 về `budget.faceLimit` (chỉ asset có khối `import`) hoặc ngân sách lớp. Chi tiết: `assets/README.md` mục Nhập Tripo.
> - **Có từ M2-3/M3**: `export_anim_lib.py` (thư viện clip `anim_human_base`), `anim_biped_extra.py`/`anim_quadruped.py`/`anim_serpent.py`/`tripo_clips.py` (clip thủ tục cho người, quái, boss, rắn), `bake_impostor.py` (atlas cây xa, `pnpm assets:impostor`), `recolor_phi_kiem.py`; client chọn LOD theo camera (`LOD0_MAX` trong `entities.ts`, LOD theo từng cây trong `props.ts`). Asset trong game: người chơi nam/nữ, 3 NPC, quái có xương, 4 boss, 5 loài cây, ~20 prop, `arch_sect`, `anim_human_base` (xem `manifest.json`).
> - **Chưa có**: `export.py` theo collection `EXPORT_`, `export_level.py`, ảnh xem trước tự động `assets/build/previews/`. `toktx` (KTX-Software 4.4.2) là bắt buộc để build: thiếu thì `assets:build` dừng với lỗi (cách cài ở `assets/README.md`, mục "Cài toktx").
> - Máy đang dùng Blender 5.3. Tọa độ trong script là tọa độ game quanh tâm sân tông môn; vị trí công trình phải khớp `COLLIDERS` trong `packages/shared/src/level.ts`.

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

1. **Sinh GLB thô**: thêm job `{ id, script }` vào `jobs` trong `tools/blender/run.mjs`; script bpy nhận đường dẫn output sau `--` và xuất GLB vào `assets/build/raw/<id>.glb`. Custom properties trên object/Empty ra `extras` của glTF (three.js đọc thành `userData`). Asset từ Tripo: thêm khối `import` (`kind`, `source`, `size`, `yaw`, `sockets`) vào `meta.json`, `run.mjs` gọi `import_tripo.py`.
2. **Tối ưu** (`tools/asset-pipeline/src/optimize.ts`, `@gltf-transform`): dedup, prune (giữ xương, socket, extras), weld, resample animation; texture sang KTX2 bằng `toktx` (normal UASTC + RDO, màu ETC1S q192, ORM ETC1S q128, hạ cạnh theo ngân sách lớp; `ktx.ts` `encodeArgs`); LOD bằng `simplify` theo `assets/budgets.json`; reorder, quantize (**chỉ mesh không có xương**), nén `EXT_meshopt_compression`.
3. **Đóng gói**: tên `<id>.<hash10>.glb` vào `apps/client/public/assets/`, cập nhật `apps/client/public/assets/manifest.json` (file, byte, tam giác từng LOD, texture, xương, clip, kích thước raw/build), xóa bản hash cũ của asset đó.
4. **Kiểm tra** (`tools/asset-pipeline/src/validate.ts`): exit 1 khi có lỗi (id sai quy ước, hash lệch, vượt ngân sách tam giác/texture/xương, thiếu LOD, mesh có xương bị quantize, LOD mất skin, thiếu dòng `assets/LICENSES.md`, `meta.json` sai schema, chiều cao raw/build lệch quá 1%). Danh sách đầy đủ trong `assets/README.md`.
5. **Xem bằng mắt**: `pnpm dev` rồi mở `?mute=1&viewer=asset&file=/assets/<id>.<hash>.glb` (người chuẩn 1,7m, số tam giác, draw call, clip), rồi gọi subagent `asset-validator`.

Lệnh:

```bash
pnpm assets:build                 # run.mjs (Blender) → optimize → public/assets + manifest
pnpm assets:build --only <id>     # một asset; --force bỏ cache; --no-ktx không nén texture
pnpm assets:optimize              # chỉ bước tối ưu từ assets/build/raw/
pnpm assets:validate [--only <id>]
pnpm --filter @dtl/asset-pipeline test
```

- **Không có Blender**: bước 1 bị bỏ qua có cảnh báo, bước tối ưu vẫn chạy với GLB thô đang có.
- **Không có `toktx`** (KTX-Software 4.4.2; dò `TOKTX`, PATH, thư mục cài mặc định `Program Files/KTX-Software/bin`, rồi bản di động `<dtl-asset-source>/tools/KTX-Software/bin`): `assets:build`/`assets:optimize` dừng với lỗi và in cách cài, vì mọi asset đã commit dùng KTX2 và build thiếu `toktx` sẽ làm manifest lẫn hai định dạng. `--no-ktx` chỉ để thử. Client gọi `detectKtx2Support(ktx2, renderer)` (không gọi thẳng `detectSupportAsync`): `GameKtx2Loader` giải normal map UASTC ra RGBA8 trên WebGPU vì backend WebGPU của three r178 không có BC7.
- Commit cả GLB có hash lẫn `manifest.json` (nguồn lớn nằm ngoài repo). `assets/build/` không commit.

## Client nạp asset

- Dùng `assets` (singleton `AssetCache` trong `apps/client/src/game/core/assets.ts`): `await assets.attach(renderer)` một lần cho mỗi renderer (KTX2 dò định dạng GPU), rồi `const h = await assets.acquire('<id>', { pos })`, thêm `h.scene` vào cảnh, và `h.release()` đúng một lần khi bỏ. Handle cuối release thì geometry/material/texture của bản gốc được dispose.
- Không `new GLTFLoader()` riêng trong game. Material tự gán đè lên bản sao là của người gọi, người gọi tự dispose.
- Transcoder Basis lấy từ `node_modules/three` qua URL Vite (`?url`), phục vụ cùng origin; không dùng CDN ngoài. Trang xem asset dùng chung `createGltfLoader`/`createKtx2Loader` và thêm Draco.
- `apps/client/public/assets/sect.glb` là bản chép của GLB thô `arch_sect`, chỉ còn làm đầu vào cho test pipeline; client không nạp nó.

## Quy ước

- Asset id = tiền tố loại + `snake_case` không dấu: `chr_`, `mon_`, `boss_`, `prop_`, `arch_`, `fx_`, `anim_` (khớp `prefixes` trong `assets/budgets.json`). Lớp ngân sách suy từ tiền tố, khác thì ghi `budgetClass` trong `meta.json`. Collection level (khi có) dùng `lvl_`.
- Tên node/mesh/material không dấu, không khoảng trắng (validate cảnh báo).
- Đơn vị: 1 unit = 1 mét, trục Y lên khi xuất (bật `export_yup`), gốc tọa độ ở chân vật.
- Áp dụng scale/rotation trước khi xuất (`bpy.ops.object.transform_apply`).
- Nhân vật hình người dùng **bộ xương chung** `rig_human_base` (tối đa 60 xương) để mọi animation dùng chung (quái/boss không phải người có rig riêng theo loài, bảng clip trong `game/character/monsterSkins.ts`).
- Mỗi asset cần `assets/source/<loại>/<id>/meta.json` (theo `assets/meta.schema.json`) và một dòng trong `assets/LICENSES.md`.

**Ngân sách**: nguồn duy nhất là `assets/budgets.json` (theo `docs/art-bible.md` mục 6, v3). Tóm tắt lúc viết: người chơi 15–25 nghìn tam giác LOD0, texture 1024; NPC 10–15 nghìn; quái 5–10 nghìn; boss 20–50 nghìn, texture 2048; prop 500–5 nghìn có 2 mức LOD; kiến trúc tới 300 nghìn, chưa sinh LOD. Số trong file JSON thắng nếu khác bảng này.

## Blender làm level editor (chưa làm)

Phần dưới là thiết kế, chưa có script nào; vị trí quái/NPC hiện viết tay trong `packages/content/data/levels/<bản đồ>.json`. Khi làm, script xuất phải ra đúng định dạng file đó.

- Đặt Empty trong collection `lvl_<tên_bản_đồ>` với custom property:
  - `spawn = "monster:<id>"`, `count`, `radius`, `respawn_s`
  - `npc = "<id>"`
  - `portal = "<room_id>"`
  - `zone = "safe" | "no_fly"` (dùng hộp bao của Empty)
- Level (`packages/content/data/levels/<tên>.json`) hiện sinh bằng `tools/maps/gen-<level>.mjs` (không còn `export_level.py`); server đọc file JSON này, không đọc GLB.
- Id quái, NPC phải tồn tại trong `packages/content`; script xuất báo lỗi nếu không tìm thấy.
