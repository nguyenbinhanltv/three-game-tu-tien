---
name: procedural-assets
description: Sinh asset thủ tục cho Đạp Thiên Lộ khi không có artist — địa hình núi non, sông hồ, cây, đá, linh thảo, kiến trúc tông môn kiểu cổ phong, phi kiếm, pháp bảo — bằng code Three.js hoặc script Blender. Dùng khi cần tạo hoặc thay asset môi trường, prop, hay chỉnh nhân vật lấy từ gói CC0.
---

# Asset thủ tục

> Hiện trạng (2026-11-15): địa hình, cây, đá, mây, nước sinh lúc chạy trong `apps/client/src/game/terrain.ts` và `env.ts` (dùng `GeoBuilder` gộp lưới tô màu đỉnh); nhân vật, quái, cây thuốc dựng bằng khối trong `models.ts`; kiến trúc tông môn bằng Blender (`tools/blender/build_sect.py` → asset `arch_sect`, client nạp qua `AssetCache` trong `game/assets.ts`), có bản dự phòng bằng code trong `sect.ts`. Pipeline asset (`pnpm assets:build` / `assets:validate`, xem `assets/README.md` và skill `blender-pipeline`) đã chạy được. `assets/LICENSES.md` đã có (mới một dòng `arch_sect`). Chưa dùng gói CC0 nào, chưa có asset Tripo trong game.

Dự án chỉ có AI làm, nên asset môi trường được **sinh bằng thuật toán** chứ không nặn tay. Nhân vật, quái, boss và prop chi tiết dựng bằng Tripo (xem `docs/tripo-runbook.md`); gói CC0 chỉ để bổ sung khi thiếu.

**Nguồn chuẩn về hình ảnh: `docs/art-bible.md`** (v3, bán tả thực điện ảnh): mục 3 (vật liệu PBR cách điệu), mục 4 (bảng màu tâm trạng), mục 8 (điều cấm, trong đó có cel-shading).

## Chọn cách làm

Cột "Hiện có" ghi đúng chỗ code đang nằm; cột "Hướng tới" là nơi đặt khi làm mới, file đó **chưa tồn tại** cho tới khi có người viết.

| Asset | Cách làm | Hiện có | Hướng tới |
| --- | --- | --- | --- |
| Địa hình, núi, hồ | Heightmap từ noise (fBm + ridged); độ cao dùng chung client/server qua `heightAt` | `packages/shared` (heightAt), `game/terrain.ts` | xói mòn, sinh offline thành tile trong `tools/procgen/terrain/` |
| Đá, cây, cỏ, linh thảo | Biến thể theo seed, vật liệu PBR đơn giản | `game/env.ts`, `game/terrain.ts`, `game/models.ts` (sinh lúc chạy) | script bpy `tools/blender/gen_*.py` → pipeline |
| Kiến trúc tông môn | bpy thủ tục: mái cong, cột, lan can, bậc đá, cổng. **Không đi qua Tripo** | `tools/blender/build_sect.py` (job `arch_sect` trong `run.mjs`) | tách thành kit modular `kit_architecture.py` |
| Phi kiếm, pháp bảo, lò đan | Mesh đơn giản + material phát sáng | khối trong `game/models.ts` | `tools/blender/gen_props.py` hoặc Tripo cho prop chi tiết |
| Nhân vật, quái, boss | Tripo (multiview + rig) theo `docs/tripo-runbook.md` và `docs/prompts/`; gói CC0 có xương chỉ là dự phòng | khối trong `game/models.ts` (dự phòng giữ lại) | `assets/source/<loại>/<id>/meta.json`, file lớn ở `DTL_ASSET_SOURCE`, chuẩn hóa bằng `import_tripo.py` (M2-2) |
| Animation | Clip từ Tripo (rig + animation) retarget về `rig_human_base`, cộng IK tự làm phía client (bước chân, nhìn mục tiêu); gói CC0 (Quaternius) chỉ bổ sung clip còn thiếu. Không dùng Mixamo làm nguồn chính | animation thủ tục trong `game/models.ts` | `rig_human_base.py`, `export_anim_lib.py` → `anim_human_base` (M2-3) |

## Quy tắc chung

- Mọi bộ sinh **phải nhận seed** và cho ra cùng kết quả với cùng seed, để có thể sinh lại asset bất cứ lúc nào.
- Không commit asset sinh ra mà không commit kèm script + seed tạo ra nó.
- Vật liệu **PBR đơn giản** (art bible mục 3): màu lấy từ bảng màu tâm trạng (`assets/palette.json`), roughness theo loại chất liệu (vải, đá, gỗ 0,6–0,95; kim loại có metalness), thêm texture nhiễu hoặc trim sheet nhỏ để có chất. **Không** dùng flat/cel shading, toon hay viền mực (art bible mục 8.3). Bảng màu là hướng dẫn, không ép từng điểm ảnh về 32 màu.
- Asset dạng GLB đi qua skill `blender-pipeline`: GLB thô vào `assets/build/raw/<id>.glb` (job trong `tools/blender/run.mjs`), rồi `pnpm assets:build --only <id>` và `pnpm assets:validate --only <id>`; client nạp bằng `assets.acquire(id)`, không tự `new GLTFLoader()`. Kèm `assets/source/<loại>/<id>/meta.json` và một dòng `assets/LICENSES.md` (thiếu thì validate báo lỗi).
- Geometry sinh lúc chạy trong client (terrain, env, models) không qua pipeline nhưng vẫn phải giữ ngân sách (skill `perf-budget`) và dispose khi bỏ.
- Nếu Blender chưa được cài: sinh trực tiếp bằng code Three.js (BufferGeometry) trong client, ghi chú để sinh lại bằng bpy sau. (Chưa có script Node nào xuất GLB bằng `GLTFExporter`.)

## Asset bên thứ ba

- Chỉ dùng nguồn có giấy phép rõ ràng (CC0 ưu tiên). Ghi mỗi asset vào `assets/LICENSES.md`: tên, nguồn, link, giấy phép, ngày tải.
- Không tải asset có điều khoản cấm dùng trong game nhiều người chơi hoặc yêu cầu ghi công mà ta không hiển thị được.
- Không tự tải file thay người dùng từ trang cần đăng nhập (ví dụ Mixamo); hướng dẫn người dùng tải và đặt vào `assets/source/`.

## Kiểm tra bằng mắt

- Sau khi sinh, mở trang xem asset `?viewer=asset&file=/assets/<id>.<hash>.glb` khi `pnpm dev` đang chạy (so với người chuẩn 1,7m, xem tam giác, draw call, clip) và chụp ảnh nhìn trước khi báo xong. Chưa có `render_preview.py` hay ảnh xem trước tự động.
