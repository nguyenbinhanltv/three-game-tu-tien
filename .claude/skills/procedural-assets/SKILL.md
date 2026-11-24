---
name: procedural-assets
description: Sinh asset thủ tục cho Đạp Thiên Lộ khi không có artist — địa hình núi non, sông hồ, cây, đá, linh thảo, kiến trúc tông môn kiểu cổ phong, phi kiếm, pháp bảo — bằng code Three.js hoặc script Blender. Dùng khi cần tạo hoặc thay asset môi trường, prop, hay chỉnh nhân vật lấy từ gói CC0.
---

# Asset thủ tục

> Hiện trạng (2026-11-15, sau Phase 2): địa hình, nước, mây, bầu trời sinh lúc chạy trong `apps/client/src/game/world/terrain.ts`, `env.ts` và `render/` (mặt đất trộn texture PBR Poly Haven CC0 qua `pnpm assets:terrain`, mặt nạ vùng thủ tục ở `render/groundMask.ts`). **Nhân vật, NPC, quái, boss và prop chi tiết đã là GLB Tripo** chuẩn hóa bằng `import_tripo.py` (người chơi nam/nữ, 3 NPC, quái có xương, 4 boss, 5 loài cây, ~20 prop; xem `apps/client/public/assets/manifest.json`), nạp qua `AssetCache`. Kiến trúc tông môn: `build_sect.py` → `arch_sect`. Clip: `anim_human_base` + clip thủ tục cho quái (`tools/blender/anim_*.py`). Cây rải theo khu bằng `game/world/propScatter.ts`, cây xa là impostor. `models.ts` chỉ còn là dự phòng (`?models=legacy`, lỗi nạp) và dựng tinh anh. Pipeline `pnpm assets:build` / `assets:validate` chạy đầy đủ; `assets/LICENSES.md` có dòng cho từng asset.

Dự án chỉ có AI làm, nên asset môi trường được **sinh bằng thuật toán** chứ không nặn tay. Nhân vật, quái, boss và prop chi tiết dựng bằng Tripo (xem `docs/tripo-runbook.md`); gói CC0 chỉ để bổ sung khi thiếu.

**Nguồn chuẩn về hình ảnh: `docs/art-bible.md`** (v3, bán tả thực điện ảnh): mục 3 (vật liệu PBR cách điệu), mục 4 (bảng màu tâm trạng), mục 8 (điều cấm, trong đó có cel-shading).

## Chọn cách làm

Cột "Hiện có" ghi đúng chỗ code đang nằm; cột "Hướng tới" là nơi đặt khi làm mới, file đó **chưa tồn tại** cho tới khi có người viết.

| Asset | Cách làm | Hiện có | Hướng tới |
| --- | --- | --- | --- |
| Địa hình, núi, hồ | Heightmap từ noise (fBm + ridged); độ cao dùng chung client/server qua `heightAt` | `packages/shared/src/terrain.ts` (heightAt), `game/world/terrain.ts` | xói mòn (chưa làm); địa hình thủ tục sinh trực tiếp từ `heightAt`, level mới dựng bằng `tools/maps/gen-<level>.mjs` |
| Đá, cây, cỏ, linh thảo | Cây, đá, linh thảo: Tripo (`prop_*`) rải theo khu; cỏ sinh lúc chạy | `game/world/props.ts` + `propScatter.ts` (cây, prop), `game/world/grass.ts`, `game/world/env.ts` | thêm loài/prop mới qua Tripo + `meta.json` |
| Kiến trúc tông môn | bpy thủ tục: mái cong, cột, lan can, bậc đá, cổng. **Không đi qua Tripo** | `tools/blender/build_sect.py` (job `arch_sect` trong `run.mjs`) | tách thành kit modular `kit_architecture.py` |
| Phi kiếm, pháp bảo, lò đan | Tripo (`prop_phi_kiem`, `prop_lo_dan`…) + material phát sáng; recolor theo bộ trang bị (`recolor_phi_kiem.py`, `swordGlow.ts`) | `assets/source/prop/` | pháp bảo (Phase 3-8) |
| Nhân vật, quái, boss | Tripo (multiview + rig) theo `docs/tripo-runbook.md` và `docs/prompts/`; gói CC0 có xương chỉ là dự phòng | `assets/source/<loại>/<id>/meta.json`, file lớn ở `DTL_ASSET_SOURCE`, chuẩn hóa bằng `import_tripo.py` (khối `import`); client dựng qua `game/character/*Skins.ts`; khối trong `models.ts` là dự phòng | tinh anh `elite_*` còn dùng khối, cần model Tripo |
| Animation | Clip từ Tripo (rig + animation) retarget về `rig_human_base`, cộng IK tự làm phía client (bước chân, nhìn mục tiêu); gói CC0 (Quaternius) chỉ bổ sung clip còn thiếu. Không dùng Mixamo làm nguồn chính | `tools/blender/export_anim_lib.py` → `anim_human_base`, clip thủ tục `anim_quadruped.py`/`anim_serpent.py`/`anim_biped_extra.py`/`tripo_clips.py`, pose IK ở `game/character/ikpose.ts` + `data/poses/` | clip còn thiếu (nhảy, thiền riêng) |

## Quy tắc chung

- Mọi bộ sinh **phải nhận seed** và cho ra cùng kết quả với cùng seed, để có thể sinh lại asset bất cứ lúc nào.
- Không commit asset sinh ra mà không commit kèm script + seed tạo ra nó.
- Vật liệu **PBR đơn giản** (art bible mục 3): màu lấy từ bảng màu tâm trạng (`assets/palette.json`), roughness theo loại chất liệu (vải, đá, gỗ 0,6–0,95; kim loại có metalness), thêm texture nhiễu hoặc trim sheet nhỏ để có chất. **Không** dùng flat/cel shading, toon hay viền mực (art bible mục 8.3). Bảng màu là hướng dẫn, không ép từng điểm ảnh về 32 màu.
- Asset dạng GLB đi qua skill `blender-pipeline`: GLB thô vào `assets/build/raw/<id>.glb` (job trong `tools/blender/run.mjs`), rồi `pnpm assets:build --only <id>` và `pnpm assets:validate --only <id>`; client nạp bằng `assets.acquire(id)`, không tự `new GLTFLoader()`. Kèm `assets/source/<loại>/<id>/meta.json` và một dòng `assets/LICENSES.md` (thiếu thì validate báo lỗi).
- Geometry sinh lúc chạy trong client (terrain, env, models) không qua pipeline nhưng vẫn phải giữ ngân sách (skill `perf-budget`) và dispose khi bỏ.
- Nếu Blender chưa được cài: sinh trực tiếp bằng code Three.js (BufferGeometry) trong client, ghi chú để sinh lại bằng bpy sau. (Chưa có script Node nào xuất GLB bằng `GLTFExporter`.)

## Mẹo dựng khối

`.claude/skills/procedural-assets/references/modeling-tips.md`: dựng/nặn/bake, vật cứng và kiến trúc cổ phong (thứ tự tầng, vát theo tầng, boolean, instance), hữu cơ liền khối (không ghép primitive), thủ tục có seed và thử biên. Dựng theo ảnh mẫu: vòng lặp ở `.claude/skills/blender-pipeline/references/reference-match.md`; kiểm trước xuất: `.claude/skills/blender-pipeline/references/qa-checklist.md`.

## Asset bên thứ ba

- Chỉ dùng nguồn có giấy phép rõ ràng (CC0 ưu tiên). Ghi mỗi asset vào `assets/LICENSES.md`: tên, nguồn, link, giấy phép, ngày tải.
- Không tải asset có điều khoản cấm dùng trong game nhiều người chơi hoặc yêu cầu ghi công mà ta không hiển thị được.
- Không tự tải file thay người dùng từ trang cần đăng nhập (ví dụ Mixamo); hướng dẫn người dùng tải và đặt vào `assets/source/`.

## Kiểm tra bằng mắt

- Sau khi sinh, mở trang xem asset `?mute=1&viewer=asset&file=/assets/<id>.<hash>.glb` khi `pnpm dev` đang chạy (so với người chuẩn 1,7m, xem tam giác, draw call, clip) và chụp ảnh nhìn trước khi báo xong. Chưa có `render_preview.py` hay ảnh xem trước tự động.

## Họa Cảnh (`?style=painted`)

Cảnh xa vẽ MỘT lần: núi nướng vào dải sơn, mây đắp khối nướng vào cubemap, đồng xa một texture cộng thẻ cây, đồi lùi dần trong sương; không sinh chi tiết mịn ở xa (lấp lánh). Texture sinh bằng code lúc chạy khi được; asset nhị phân mới qua `pnpm assets:push`, tên có hash. Chi tiết: `docs/handbook/painted.md`.
