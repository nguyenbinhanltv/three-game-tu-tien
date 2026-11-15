# Asset

Nơi chứa dữ liệu nhẹ về asset 3D và cấu hình pipeline. File nguồn lớn **không** nằm trong repo.

## Bố cục

| Đường dẫn | Chứa | Commit? |
| --- | --- | --- |
| `DTL_ASSET_SOURCE` = `../dtl-asset-source/` (cạnh thư mục repo gốc, đã chốt) | ảnh concept, GLB tải từ Tripo, `.blend`, nhật ký CLI thô. Cấu trúc giống `assets/source/` | không, người dùng tự sao lưu |
| `assets/source/<loại>/<asset_id>/meta.json` | hồ sơ asset theo [`meta.schema.json`](meta.schema.json): concept, các lần sinh Tripo, credit, giấy phép | có |
| `assets/source/_batches/*.json` | nhật ký đợt Tripo CLI (`docs/tripo-runbook.md` mục 5.5) | có |
| `assets/build/raw/<asset_id>.glb` | **đầu vào pipeline**: GLB thô do Blender xuất (`tools/blender/run.mjs`): script thủ tục hoặc `import_tripo.py` chuẩn hóa GLB Tripo | không (sinh lại được) |
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

## Nhập Tripo (`tools/blender/import_tripo.py`)

GLB Tripo cao đúng 1 m, gốc ở tâm khối, mặt trước thường nhìn +X, texture 4096², số tam giác vượt `face_limit`. Khai báo khối `import` trong `meta.json` thì `run.mjs` tự tạo job (đọc GLB ở `DTL_ASSET_SOURCE`; không có thư mục nguồn thì bỏ qua, có cảnh báo, giữ build đã commit):

```json
"import": {
  "kind": "tripo",
  "source": "prop/prop_lo_dan/tripo/raw_v01.glb",
  "size": { "height": 1.2 },
  "yaw": -90,
  "sockets": [{ "name": "socket_fx_top", "position": [0, 1.22, 0] }]
}
```

1. **Hướng**: mặt trước nhìn +Z (client quay model theo `yaw = atan2(vx, vz)`). Có armature với cặp xương đùi trái/phải (`thigh`, `upleg`, `upperleg`… kèm `l/left`, `r/right`) thì tự xoay cho đùi trái về +X (`orient`: `auto` mặc định, `thigh` bắt buộc, `none` tắt). Sau đó cộng `yaw` (độ, quanh +Y). Prop không có xương: đặt `yaw` bằng mắt; Tripo trả mặt trước về +X nên thường là `-90`. Kiểm bằng ảnh render nhìn từ +Z so với concept mặt trước.
2. **Tỉ lệ**: `size` có đúng một khóa `height` | `width` | `depth` | `longest` (mét, hộp bao ở tư thế nghỉ); scale đều.
3. **Gốc ở đáy**: tâm X/Z về 0, đáy về Y = 0. Áp transform cho mọi object; khóa location của xương trong clip nhân theo scale của armature nên quãng dịch chuyển giữ đúng mét.
4. **Tên**: mesh `<id>` (`<id>_<k>` nếu nhiều), material `<id>_mat`, ảnh `<id>_color|orm|normal|emissive`, armature `<id>_rig` (giữ `rig_human_base`). Bỏ Icosphere hình xương mà importer glTF tạo.
5. **Socket**: Empty `socket_*` ở tọa độ glTF sau chuẩn hóa, `bone` để gắn vào xương; extras `socket: 1`.
6. **Texture** hạ về ngân sách lớp: map màu theo `texture.color`, normal/ORM theo `texture.data`.

Không giảm tam giác ở bước này: `optimize.ts` hạ LOD0 về trần. Cùng đầu vào cho ra cùng file (đã kiểm bằng hash).

## Bước tối ưu (`tools/asset-pipeline/src/optimize.ts`)

1. `dedup` → `prune` (giữ nút lá: xương, socket; giữ extras) → `weld` → `resample` (animation).
2. **Hạ LOD0 về trần**: với asset có khối `import`, trần là `budget.faceLimit` trong `meta.json` (mức đã xin Tripo), không quá `triangles.max` của lớp; asset khác (gồm job thủ tục tự giảm tam giác như `prop_phi_kiem`) dùng `triangles.max`. Dùng `simplify` của meshoptimizer, nới dần sai số; giữ `JOINTS_0`/`WEIGHTS_0`. Manifest ghi `rawTriangles` và `lod0Cap`.
3. Texture → KTX2 qua `toktx`: ETC1S cho màu và dữ liệu thường, UASTC cho normal map; hạ cạnh dài về ngân sách lớp.
4. **LOD** bằng `simplify` (meshoptimizer) theo `budgets.json`: đích = min(tỉ lệ × LOD0, trần). LOD nằm **cùng file** với LOD0: mỗi node có mesh sinh thêm node anh em `<tên>_lod<k>` (`extras.lod = k`, three.js đọc thành `userData.lod`), cùng transform, cùng skin, cùng material, nên texture chỉ tải một lần. Thuộc tính đỉnh (`JOINTS_0`/`WEIGHTS_0`, UV, màu) đi theo đỉnh còn lại, nên mesh có xương giữ trọng số. Simplify bị kẹt (cạnh cứng, đường UV) thì nới sai số rồi bật `Permissive`. Client (M2-8/M3-9) hiện một mức theo khoảng cách và ẩn các mức khác.
5. `reorder` → `quantize` **chỉ với mesh không có xương** → `EXT_meshopt_compression`. Mesh có xương không quantize: nhân vật sẽ co lại khi clip có track scale.
6. Tên theo hash SHA-256 (10 ký tự), ghi `manifest.json`, xóa bản hash cũ của chính asset đó.
7. Cache: khóa theo mtime + kích thước file thô, phiên bản pipeline, ngân sách lớp, trần LOD0, phiên bản toktx. Chạy lại khi không đổi gì mất khoảng 1–2 giây.

## Kiểm tra (`tools/asset-pipeline/src/validate.ts`)

Lỗi (lệnh thất bại): asset id sai quy ước; file thiếu hoặc hash không khớp nội dung; tam giác LOD0 vượt ngân sách; thiếu LOD hoặc LOD vượt trần; texture vượt cạnh cho phép; quá số xương; mesh có xương bị quantize (`KHR_mesh_quantization`); node LOD mất skin hoặc trọng số; thiếu dòng trong `LICENSES.md`; `meta.json` sai schema hoặc id khác tên thư mục; **chiều cao raw và build lệch quá 1%** ở tư thế nghỉ và ở đầu/giữa/cuối mỗi clip (đo theo spec glTF: đỉnh có xương = Σ trọng số × joint × inverse bind).

Cảnh báo: dưới mức tam giác tối thiểu; texture chưa KTX2; tên node/mesh/material có dấu hoặc khoảng trắng; nhân vật chưa dùng skin `rig_human_base`; không có file thô để so (dùng số đo trong manifest).

Sau đó chạy subagent `asset-validator` để soát bằng mắt những gì script chưa bắt được.

## Thêm một asset

1. Tạo `assets/source/<loại>/<id>/meta.json` (theo schema) và đặt file lớn vào `../dtl-asset-source/<loại>/<id>/`.
2. Đưa GLB thô vào `assets/build/raw/<id>.glb`: job thủ tục trong `tools/blender/run.mjs`, hoặc khối `import` trong `meta.json` cho GLB Tripo (mục Nhập Tripo). Job thủ tục có trường `source` (ví dụ `prop_phi_kiem`: lưới Tripo v02 tô màu bằng `recolor_phi_kiem.py`) đọc file trong `DTL_ASSET_SOURCE`; máy không có thư mục nguồn thì job bị bỏ qua kèm cảnh báo, GLB build đã commit vẫn dùng được.
3. Thêm dòng vào `assets/LICENSES.md`.
4. `pnpm assets:build --only <id>` rồi `pnpm assets:validate --only <id>`; xem trong trang `?viewer=asset`.
5. Commit `meta.json`, dòng LICENSES, GLB có hash và `manifest.json`.
6. Trong client: `await assets.attach(renderer)` rồi `const h = await assets.acquire('<id>', { pos })`, thêm `h.scene` vào cảnh, `h.release()` khi bỏ (xem `apps/client/src/game/assets.ts`).

## Âm thanh (`tools/audio/`)

SFX và âm môi trường không đi qua pipeline GLB mà qua `pnpm audio:build` (`tools/audio/build.mjs`):

- Khai báo trong `tools/audio/sounds.json`: gói nguồn (thư mục trong `../dtl-asset-source/sfx/`, tác giả, link, giấy phép; **chỉ nhận CC0-1.0**), từng âm với các biến thể (âm combat 3 biến thể, có thể trộn nhiều lớp, đổi tốc độ, cắt đoạn), nhóm sprite, bus, ducking.
- Xử lý: giải mã 48 kHz, cắt lặng, chuẩn hóa theo RMS đoạn to nhất (đỉnh ≤ -1 dBFS), ghép sprite theo nhóm; mã hóa WebM/Opus (48 kbps) và M4A/AAC dự phòng cho Safari; tên file theo hash nội dung. Kết quả xác định nên build lại không làm đổi byte.
- Âm môi trường: chồng lớp lặp ở nhiều tốc độ, đường bao âm lượng ngẫu nhiên có seed, nối vòng bằng crossfade; dài 40–60 giây. Lệnh in chỉ số điểm nối và độ lặp chu kỳ để soát.
- Đầu ra: `apps/client/public/audio/sfx/`, `amb/`, `manifest.json` (giữ nguyên mục `music`), và khối giữa `<!-- audio:begin -->`…`<!-- audio:end -->` trong `LICENSES.md`.
- Nạp: sprite thường tải byte lúc rảnh sau khi vào trang, sprite `lazy` và âm môi trường chỉ tải khi cần (stream).
- Lấy ffmpeg không cần cài hệ thống: `npm i ffmpeg-static` ở một thư mục tạm rồi `FFMPEG=<thư mục>/node_modules/ffmpeg-static/ffmpeg.exe pnpm audio:build`.

## Chưa có

- Client chọn LOD theo khoảng cách (M2-9): `AssetCache` (`apps/client/src/game/assets.ts`, M2-8) đã nạp theo manifest nhưng chỉ hiện LOD0. `public/assets/sect.glb` (bản chép GLB thô của job Blender) chỉ còn làm đầu vào cho test pipeline, client không nạp.
- `rig_human_base.py` (M2-3, đổi tên xương Tripo/mixamo); ảnh xem trước tự động `assets/build/previews/`.
- `import_tripo.py` mới kiểm nhánh có xương bằng fixture (`build_fixture_rig.py --legs --tripo`); chưa chạy với GLB rig thật của Tripo.
- Nhánh KTX2 mới kiểm bằng toktx giả trong test (máy dev chưa cài KTX-Software).

## Texture mặt đất (P2-A2)

`pnpm assets:terrain` tải 8 bộ Poly Haven CC0 (1K JPG) vào `../dtl-asset-source/texture/<id>/` rồi đóng gói ra `apps/client/public/terrain/` (albedo WebP + WebP pháp tuyến RG và độ nhám B, kèm `manifest.json`). Client nạp lười sau khung đầu (`game/groundTextures.ts`), không nằm trong tải đầu. Nguồn và giấy phép: `assets/LICENSES.md`. Không có `toktx` trên máy nên dùng WebP (client giải mã rồi ghép texture mảng); thêm KTX2 khi có toktx và cần cắt VRAM.
