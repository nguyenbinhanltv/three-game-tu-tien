# Asset

Nơi chứa dữ liệu nhẹ về asset 3D và cấu hình pipeline. File nguồn lớn **không** nằm trong repo.

## Bố cục

| Đường dẫn | Chứa | Commit? |
| --- | --- | --- |
| `DTL_ASSET_SOURCE` = `../dtl-asset-source/` (cạnh thư mục repo gốc, đã chốt) | ảnh concept, GLB tải từ Tripo, `.blend`, nhật ký CLI thô. Cấu trúc giống `assets/source/` | không, người dùng tự sao lưu |
| `assets/source/<loại>/<asset_id>/meta.json` | hồ sơ asset theo [`meta.schema.json`](meta.schema.json): concept, các lần sinh Tripo, credit, giấy phép | có |
| `assets/source/_batches/*.json` | nhật ký đợt Tripo CLI (`docs/tripo-runbook.md` mục 5.5) | có |
| `assets/build/raw/<asset_id>.glb` | **đầu vào pipeline**: GLB thô do Blender xuất (`tools/blender/run.mjs`) hoặc do `import_tripo.py` chuẩn hóa (M2-2) | không (sinh lại được) |
| `assets/build/.cache.json` | cache theo mtime của bước tối ưu | không |
| `apps/client/public/assets/<asset_id>.<hash>.glb` | GLB đã tối ưu, tên theo hash nội dung (cache CDN vĩnh viễn) | có, vì nguồn nằm ngoài repo |
| `apps/client/public/assets/manifest.json` | id → file, tam giác từng LOD, texture, xương, clip, kích thước raw/build | có |
| [`budgets.json`](budgets.json) | ngân sách theo lớp asset (tam giác LOD0, đích LOD, cạnh texture, số xương) | có |
| [`LICENSES.md`](LICENSES.md) | một dòng cho mỗi asset trong game | có |
| `palette.json`, `palette.png` | bảng màu tham khảo của art bible (không còn ép texture về palette từ 2026-11-15) | có |

`.gitignore` chặn mọi file trong `assets/source/` trừ `meta.json`, nhật ký đợt và README, nên lỡ chép GLB hay PNG vào đó cũng không bị commit.

## Đặt tên

Asset id = tiền tố loại + `snake_case` không dấu, trùng tên thư mục nguồn và tên GLB thô: `chr_` (người chơi, NPC), `mon_` (quái), `boss_`, `prop_` (prop, vũ khí, phi kiếm, đồ rơi), `arch_` (kiến trúc), `fx_`, `anim_` (thư viện animation không mesh, ví dụ `anim_human_base`). Lớp ngân sách suy từ tiền tố; muốn khác (NPC dùng `chr_`, phi kiếm dùng `prop_`, đồ rơi) thì ghi `budgetClass` trong `meta.json`.

## Lệnh

```bash
pnpm assets:build              # Blender sinh GLB thô (bỏ qua nếu script không đổi) → tối ưu → public/assets + manifest
pnpm assets:build --only <id>  # một asset;  --force bỏ qua cache;  --no-ktx không nén texture
pnpm assets:optimize           # chỉ bước tối ưu từ assets/build/raw/
pnpm assets:validate           # kiểm theo manifest; có lỗi thì exit 1 và in lý do
pnpm --filter @dtl/asset-pipeline test   # test pipeline (sect.glb + nhân vật có xương sinh bằng Blender headless)
```

Không có Blender: bước sinh GLB thô bị bỏ qua có cảnh báo, bước tối ưu vẫn chạy với file thô đang có. Không có `toktx` (KTX-Software 4.x, dò theo `TOKTX`, PATH, rồi `C:\Program Files\KTX-Software\bin`): texture giữ PNG/JPEG, có cảnh báo; `validate` vẫn kiểm kích thước texture.

## Bước tối ưu (`tools/asset-pipeline/src/optimize.ts`)

1. `dedup` → `prune` (giữ nút lá: xương, socket; giữ extras) → `weld` → `resample` (animation).
2. Texture → KTX2 qua `toktx`: ETC1S cho màu và dữ liệu thường, UASTC cho normal map; hạ cạnh dài về ngân sách lớp.
3. **LOD** bằng `simplify` (meshoptimizer) theo `budgets.json`: đích = min(tỉ lệ × LOD0, trần). LOD nằm **cùng file** với LOD0: mỗi node có mesh sinh thêm node anh em `<tên>_lod<k>` (`extras.lod = k`, three.js đọc thành `userData.lod`), cùng transform, cùng skin, cùng material, nên texture chỉ tải một lần. Thuộc tính đỉnh (`JOINTS_0`/`WEIGHTS_0`, UV, màu) đi theo đỉnh còn lại, nên mesh có xương giữ trọng số. Simplify bị kẹt (cạnh cứng, đường UV) thì nới sai số rồi bật `Permissive`. Client (M2-8/M3-9) hiện một mức theo khoảng cách và ẩn các mức khác.
4. `reorder` → `quantize` **chỉ với mesh không có xương** → `EXT_meshopt_compression`. Mesh có xương không quantize: nhân vật sẽ co lại khi clip có track scale.
5. Tên theo hash SHA-256 (10 ký tự), ghi `manifest.json`, xóa bản hash cũ của chính asset đó.
6. Cache: khóa theo mtime + kích thước file thô, phiên bản pipeline, ngân sách lớp, phiên bản toktx. Chạy lại khi không đổi gì mất khoảng 1–2 giây.

## Kiểm tra (`tools/asset-pipeline/src/validate.ts`)

Lỗi (lệnh thất bại): asset id sai quy ước; file thiếu hoặc hash không khớp nội dung; tam giác LOD0 vượt ngân sách; thiếu LOD hoặc LOD vượt trần; texture vượt cạnh cho phép; quá số xương; mesh có xương bị quantize (`KHR_mesh_quantization`); node LOD mất skin hoặc trọng số; thiếu dòng trong `LICENSES.md`; `meta.json` sai schema hoặc id khác tên thư mục; **chiều cao raw và build lệch quá 1%** ở tư thế nghỉ và ở đầu/giữa/cuối mỗi clip (đo theo spec glTF: đỉnh có xương = Σ trọng số × joint × inverse bind).

Cảnh báo: dưới mức tam giác tối thiểu; texture chưa KTX2; tên node/mesh/material có dấu hoặc khoảng trắng; nhân vật chưa dùng skin `rig_human_base`; không có file thô để so (dùng số đo trong manifest).

Sau đó chạy subagent `asset-validator` để soát bằng mắt những gì script chưa bắt được.

## Thêm một asset

1. Tạo `assets/source/<loại>/<id>/meta.json` (theo schema) và đặt file lớn vào `../dtl-asset-source/<loại>/<id>/`.
2. Đưa GLB thô vào `assets/build/raw/<id>.glb` (job Blender trong `tools/blender/run.mjs`, hoặc `import_tripo.py` khi có M2-2).
3. Thêm dòng vào `assets/LICENSES.md`.
4. `pnpm assets:build --only <id>` rồi `pnpm assets:validate --only <id>`; xem trong trang `?viewer=asset`.
5. Commit `meta.json`, dòng LICENSES, GLB có hash và `manifest.json`.
6. Trong client: `await assets.attach(renderer)` rồi `const h = await assets.acquire('<id>', { pos })`, thêm `h.scene` vào cảnh, `h.release()` khi bỏ (xem `apps/client/src/game/assets.ts`).

## Chưa có

- Client chọn LOD theo khoảng cách (M2-9): `AssetCache` (`apps/client/src/game/assets.ts`, M2-8) đã nạp theo manifest nhưng chỉ hiện LOD0. `public/assets/sect.glb` (bản chép GLB thô của job Blender) chỉ còn làm đầu vào cho test pipeline, client không nạp.
- `import_tripo.py`, `rig_human_base.py` (M2-2, M2-3); ảnh xem trước `assets/build/previews/`.
- Nhánh KTX2 mới kiểm bằng toktx giả trong test (máy dev chưa cài KTX-Software).
