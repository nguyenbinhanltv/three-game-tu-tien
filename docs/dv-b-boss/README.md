# DV-B: thử pipeline một boss từ bản điêu khắc CC BY (Tam Thủ Ngục Khuyển)

Gói DV-B của `docs/DIVUC_DESIGN.md` (chương 5, Bắc Hoang Dị Vực). Mục tiêu: chứng minh một model tải về **dày lưới, không xương, không animation** đi được hết đường vào game chỉ bằng script Blender headless, không dịch vụ trả phí. Ảnh và video duyệt nằm ở thư mục artifact của phiên (không commit).

## Nguồn và giấy phép

| | |
| --- | --- |
| Model | "GORETHRAX // The Infernal Three- Headed Hound" |
| Tác giả | 6 (https://sketchfab.com/Atahan3D) |
| Giấy phép | CC BY 4.0 (đọc từ `asset.extras` trong GLB) |
| Nguồn | https://sketchfab.com/3d-models/gorethrax-the-infernal-three-headed-hound-90f3e2338d6f41b8a94f376fbc3db3e4 |
| Đã chỉnh sửa | giảm lưới, trải UV, nướng lại texture, dựng xương + trọng số, thêm clip |
| File gốc | `../dtl-asset-source/boss/boss_tam_thu_nguc_khuyen/online/source.glb` (bản chép, không sửa `assets-online/`) |

Ghi công ở ba nơi: `assets/source/mon/boss_tam_thu_nguc_khuyen/meta.json` (`license.spdx`, `owner`, `url`), `assets/LICENSES.md`, và file này. **Chưa có màn Ghi công trong game** (gói DV1-B): cần xong trước khi boss này vào bản chơi chung với bạn bè.

## Đường ống

```bash
export DTL_ASSET_SOURCE=D:/METAGRIT/dtl-asset-source          # xem "Bẫy" bên dưới
node tools/blender/run-sculpt.mjs boss_tam_thu_nguc_khuyen     # sculpt_rig.py: lưới thấp + nướng + xương (≈ 40 s)
pnpm assets:build --only boss_tam_thu_nguc_khuyen --no-ktx     # import_tripo.py + anim_quadruped.py + optimize
pnpm assets:validate --only boss_tam_thu_nguc_khuyen
```

1. **`tools/blender/sculpt_rig.py`** (mới), cấu hình ở khối `sculpt` của `meta.json`:
   - `--stage mesh`: gộp 9 mesh, Decimate (collapse) 979.664 → 36.000 tam giác, bỏ mảnh rời nhỏ, Smart UV Project, nướng Cycles từ lưới gốc sang lưới thấp: base color và ORM bằng pass EMIT (pass DIFFUSE ra màu đen với vật liệu kim loại), normal bằng pass NORMAL (gồm cả normal map gốc). Texture gốc chỉ 1024², nướng ra 2048² rồi `import_tripo.py` hạ về ngân sách lớp boss (màu 1536², dữ liệu 1024²). Map phát sáng tách từ phần đỏ rực của base color (khe nứt, mắt, đuôi lửa: 3,1% điểm ảnh) vì nguồn không có map phát sáng. Màu/ORM/phát sáng lưu JPEG, normal PNG. Kết quả giữ ở `assets/build/sculpt/<id>_low.blend`.
   - `--stage rig`: xoay `yaw` −14,4° (bản điêu khắc đứng chéo), dựng 28 xương theo `sculpt.bones` (tọa độ đọc từ ảnh chiếu trực giao có lưới 0,1), trọng số theo khoảng cách tới đoạn xương (tối đa 4 xương, làm mượt theo cạnh 3 vòng). `sculpt.limit` khai chuỗi hàng xóm để đỉnh đầu trái không ăn cổ giữa, bàn chân trước không ăn chân sau. Không dùng Automatic Weights của Blender (lưới nhiều mảnh xuyên nhau, heat solve hay hỏng).
   - Xuất `../dtl-asset-source/boss/<id>/rig/rig_v01.glb`: từ đây đi đường nhập `import.kind: "external"` (model nguồn ngoài, cùng bước chuẩn hóa `import_tripo.py`, bắt buộc có `license.spdx` + `license.url`).
2. **`tools/blender/anim_quadruped.py`** (mở rộng, hành vi của quái cũ không đổi):
   - Rig đã mang tên vai trò (`spine_0`, `leg_fl_0`…) thì bỏ bước đổi tên (`layout: named`).
   - `import.quadruped.heads`: cổ/đầu phụ mượn góc của cổ/đầu chính, nhân hệ số (`z` âm = soi gương), nên mọi clip cũ tự chạy cho cả ba đầu.
   - `import.extra` thêm `walk` (đi bốn nhịp, 1,1 s) và `chant` (gầm lặp 1,6 s: ghì bốn chân, ba cổ vươn ngửa, hai đầu bên xòe ra, rung lệch pha).
3. `optimize.ts` không đổi: LOD 36.000 / 12.600 / 4.318 tam giác.

## Kết quả

| | |
| --- | --- |
| Tam giác | 979.664 → **36.000** (ngân sách boss 20–50 nghìn) |
| Xương | 28 (trần lớp boss 80): cột sống 3, ba cổ + ba đầu, chân trước 3 × 2, chân sau 4 × 2, đuôi 5 |
| Clip | `idle`, `walk`, `run`, `attack` (đớp), `chant` (gầm/niệm), `hit_light`, `death`, `slam`, `stun` |
| Texture | màu 1536² JPEG, normal 1024² PNG, ORM 1024² JPEG, phát sáng 1024² JPEG |
| File | 4,5 MB (boss Tripo khác ~2,1–2,8 MB: lưới 36 nghìn thay vì 20 nghìn, thêm map phát sáng, 9 clip). Nạp lười, không vào tải đầu |
| Kích thước | cao 3,4 m, dài 5,4 m (cả đuôi) |
| Trong game | Vân Lam, WebGPU, preset Cao: 113–120 draw call, ~0,5 triệu tam giác khi boss đứng cạnh người chơi |

## Boss tạm trong game

`boss_tam_thu_nguc_khuyen` ở `monsters.json` + `loot.json` (đồ rơi tạm bằng vật phẩm có sẵn), tên ở i18n. **Chưa đặt vào bản đồ nào**: gọi bằng lệnh GM.

```
/gm level 28
/gm god on
/gm spawn boss_tam_thu_nguc_khuyen
/gm hurt 65        # pha 2: Ngục hống (niệm 2,4 s, phá chú được)
/gm hurt 45        # pha 3: nện
/gm hurt 25        # pha 4: lửa một đường 26 × 4 m
```

Trang xem asset: `?mute=1&show=boss&id=boss_tam_thu_nguc_khuyen`. Ảnh: `pnpm shots asset --ids boss_tam_thu_nguc_khuyen --clips idle,walk,run,attack,chant,slam,death --out <thư mục>`.

Chiêu dùng trường có sẵn: `sweep` nón 11 m, `chant`, `slam`, `line`. So với thiết kế (mục 5.3 của `DIVUC_DESIGN.md`) còn thiếu, để gói DV3-B: **Tam khẩu** (ba nón xòe), **Vồ** (`leap`), ba thanh thế theo từng đầu. Đã thử `leap`: boss đáp đúng chỗ người chơi rồi đứng đè lên (thân dài 5,4 m), nên tạm bỏ.

## Giới hạn và bẫy

- **Không có xương hàm**: miệng giữ nguyên dáng điêu khắc (hai đầu bên há sẵn, đầu giữa nhe nanh). Đớp và gầm diễn bằng cổ và đầu.
- **Trọng số theo khoảng cách**: vùng bờm giữa ba cổ co giãn hơi cứng khi hai đầu bên xòe rộng; chấp nhận được ở khoảng cách chơi, nhìn sát thì thấy.
- **Lông đen trên nền tối**: skin dùng `lift: 0.35` + viền `rim` màu than hồng để đọc được trong bóng. Khi có mood `rift` (DV1-C) cần chỉnh lại.
- **Skin nạp lười không có `level`**: lần đầu gọi trong một phiên mới, boss hiện bằng model khối (con sói đen nhỏ) vài giây tới chục giây vì asset xếp sau hàng đợi nạp thế giới. Khi có level `bac_hoang`, thêm `level` để `preloadLazy` nạp trước.
- **`DTL_ASSET_SOURCE`**: cạnh thư mục worktree của Orchestrator có một `dtl-asset-source` lạc (chỉ chứa texture) che mất thư mục thật khi dò tự động. Đặt biến môi trường rõ ràng như trên.
- Đặt khớp vẫn là việc tay (đọc tọa độ từ ảnh chiếu): ~30 phút cho một con bốn chân. Model hai chân có cánh/váy (gói DV2-C/D) sẽ khó hơn, chưa thử.

## Lặp lại cho asset khác

1. Chép GLB vào `../dtl-asset-source/<loại>/<id>/online/source.glb`.
2. Tạo `meta.json` có khối `sculpt` (`source`, `out`, `faces`, `texture`, `bones: []`), `license` có `spdx`, `owner`, `url`.
3. `node tools/blender/run-sculpt.mjs <id> --stage mesh`, xem bảng lát cắt in ra và ảnh chiếu, điền `yaw`, `bones`, `limit`.
4. `--stage rig`, thêm khối `import` với `kind: "external"` (như boss này), `pnpm assets:build --only <id> --no-ktx`, `assets:validate`.
5. Thêm dòng `assets/LICENSES.md`, skin ở `MONSTER_SKINS`.
