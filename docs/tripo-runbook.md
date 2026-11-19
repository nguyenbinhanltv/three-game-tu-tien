# Runbook Tripo

Phiên bản 3 · 2026-11-15 · Việc M0-1, cập nhật theo hướng bán tả thực. Kiểm chứng với `tripo-cli 0.11.2`. Các quyết định đã duyệt (hạn mức, nơi lưu nguồn, model v3.1) xem `docs/art-bible.md` mục 0.

Dự án dùng **cả hai kênh** Tripo, tách theo loại asset:

| Kênh | Ai thao tác | Credit | Dùng cho |
| --- | --- | --- | --- |
| **(a) Web app** tripo3d.ai | người dùng tự bấm | credit gói Max của web app | nhân vật người chơi, NPC, quái, boss (multiview + rig + animation) |
| **(b) Tripo CLI** (`tripo`) | Claude chạy | credit API **riêng** (2026-11-14: 1000 credit, 0 bị giữ) | prop hàng loạt: vũ khí, phi kiếm, lò đan, linh thảo, đồ rơi (image→3D, không rig) |

Tham số dựng hình: [`docs/prompts/tripo.md`](prompts/tripo.md). Phong cách: [`docs/art-bible.md`](art-bible.md).

---

## 1. Quy tắc bắt buộc với CLI (đọc trước khi chạy bất kỳ lệnh nào)

`tripo` **tự bật `--yes` khi chạy nền** (không có terminal tương tác, ví dụ khi Claude chạy qua Bash). Nghĩa là mọi lệnh tốn credit sẽ chạy ngay, **không hỏi lại**. Vì vậy:

1. **Lệnh được chạy tự do** (không tốn credit): `tripo --help`, `tripo <lệnh> --help`, `tripo models`, `tripo balance`, `tripo whoami`, `tripo usage`, `tripo make … --dry-run`.
2. **Mọi lệnh tốn credit chỉ chạy khi người dùng đã duyệt đúng đợt đó**, qua orchestrator hoặc trực tiếp trong chat. Duyệt đợt trước không có giá trị cho đợt sau.
3. **Luôn `--dry-run` trước** với đúng tham số sẽ chạy thật, để có báo giá (`generation_credits_estimate`). Báo giá gửi cho người dùng duyệt.
4. **Hạn mức credit mỗi đợt** (người dùng đã chốt 2026-11-14): **tối đa 300 credit mỗi đợt**, và luôn giữ lại **ít nhất 100 credit** trong tài khoản. Khi duyệt một đợt, người dùng có thể đặt hạn mức thấp hơn; muốn vượt 300 phải hỏi riêng. Hết hạn mức thì dừng, kể cả khi còn việc.
5. **Sau mỗi đợt chạy `tripo usage --json`** và `tripo balance --json`, ghi vào nhật ký đợt (mục 5.5) và vào `meta.json` của từng asset.
6. **Cấm khi chưa có duyệt riêng**:
   - `tripo ai` (bộ lập kế hoạch tự ghép chuỗi bước, khó báo giá trước).
   - `tripo redo` (sinh lại với seed mới là một lần trả tiền mới).
   - `tripo batch run`: **không có `--dry-run`** và tự thử lại khi lỗi. Chạy từng việc bằng `make`.
   - `tripo anim check|rig|retarget`, `tripo mesh …`, `tripo model texture`, `tripo generate …`: không có `--dry-run`. Prop không cần các bước này.
   - `make --then …` (bước chuỗi không có trong báo giá), `make --for …` (preset `game-pc` tự thêm convert FBX và texture chi tiết), `make -n` lớn hơn 1.
   - `tripo topup`, `tripo login/logout/use`, `tripo config set`.
7. **Không bao giờ chạy CLI trong thư mục repo.** Mặc định CLI ghi vào `./tripo-out/`; luôn truyền `-o` trỏ vào thư mục nguồn ngoài repo (mục 2).
8. Một việc lỗi thì **không tự chạy lại**. Kiểm `tripo task get <task_id> --json` trước: task có thể đã xong và đã trừ credit, chỉ là tải về hỏng.

---

## 2. Nơi lưu file (quyết định 6.6: ngoài repo)

File lớn (ảnh concept, GLB thô, GLB rig, animation) nằm **ngoài repo**. Repo chỉ giữ `meta.json` (nhẹ, đủ để tải lại từ Tripo theo task id) và bản build đã tối ưu.

| Nơi | Đường dẫn | Chứa | Commit? |
| --- | --- | --- | --- |
| Thư mục nguồn | `DTL_ASSET_SOURCE`, `../dtl-asset-source/` (đã chốt; thư mục cạnh thư mục repo gốc, không nằm trong repo) | ảnh concept, GLB tải từ Tripo, nhật ký CLI thô (cây `3d/`, `2d/`, `anim/`, `audio/`… xem `assets/README.md`) | không. Người dùng tự sao lưu (ổ khác hoặc cloud) |
| Metadata trong repo | `assets/source/<loại>/<asset_id>/meta.json` | prompt, task id, credit, trạng thái | có |
| Nhật ký đợt CLI | `assets/source/_batches/<YYYY-MM-DD>-<tên-đợt>.json` | báo giá, người duyệt, hạn mức, usage | có |
| Build | `assets/build/`, `apps/client/public/assets/` | GLB đã tối ưu (M2) | theo pipeline M2 |

`.gitignore` chặn mọi file trong `assets/source/` trừ `meta.json`, nhật ký đợt và README, để lỡ chép GLB hay PNG vào đó cũng không bị commit.

Cấu trúc trong thư mục nguồn (giống hệt cấu trúc `assets/source/` trong repo):

```
<DTL_ASSET_SOURCE>\
  chr\chr_de_tu_nam\
    concept\concept_front_v01.png … (mọi phương án, kể cả bị loại)
    concept_front.png  concept_left.png  concept_back.png    (bản đã duyệt)
    tripo\raw_v01.glb  rig_v01.glb  anim_idle_v01.glb …
  mon\mon_soi_xam\ …
  prop\prop_lo_dan\
    concept\concept_34_v01.png …
    concept_34.png
    tripo\raw_v01.glb   (+ thư mục con CLI tự tạo)
  _batches\2026-11-20-m0-3-prop\cli.log
```

## 3. Đặt tên

- **Asset id**: tiền tố loại + tên không dấu `snake_case`, trùng id trong `packages/content` khi có. Tiền tố theo `blender-pipeline`: `chr_` (người), `mon_` (quái), boss dùng id game không thêm tiền tố (ví dụ `boss_kiem_khoi`) nhưng vẫn đặt trong thư mục `3d/quai`, `prop_` (prop, vũ khí, phi kiếm, đồ rơi). Prop không bắt buộc trùng id vật phẩm (ví dụ `prop_linh_thao` ứng với vật phẩm `itm_linh_thao`); ghi id vật phẩm vào trường `itemId` của `meta.json`. Ví dụ: `chr_de_tu_nam`, `chr_de_tu_nu`, `mon_soi_xam`, `prop_lo_dan`, `prop_linh_thao`, `prop_phi_kiem`.
- **Thư mục loại**: `chr`, `mon`, `prop`.
- **Ảnh concept**: `concept_<góc>_v<NN>.png` cho mọi phương án; bản duyệt chép thành `concept_<góc>.png`. Góc: `front`, `left`, `back`, `right`, `34` (3/4 cho prop).
- **File Tripo**: `raw_v<NN>.glb` (dựng hình), `lowpoly_v<NN>.glb` (lưới đã hạ về Polycount bằng **Retopo** trên web, chưa rig), `rig_v<NN>.glb`, `anim_<clip>_v<NN>.glb` (clip: `idle`, `idle_combat`, `walk`, `run`, `jump`, `hit_light`, `hit_heavy`, `death`, `meditate`, `cast`, `draw`, `sheathe`, `attack` (đòn đánh chính: người chém, quái cắn)). `NN` tăng theo mỗi lần thử, không ghi đè.
- **File đưa vào pipeline**: `import.source` trong `meta.json` ghi rõ một file. Thứ tự chọn trong cùng `NN`: `rig_v<NN>.glb` (có xương; clip mua trên Tripo nằm trong file `anim_*` cùng xương) > `lowpoly_v<NN>.glb` > `raw_v<NN>.glb`. Không nhập `raw` khi đã có `lowpoly` cùng `NN`: `raw` có thể quá nặng (M0-3: 1,95 triệu tam giác).
- **Preset animation Tripo → tên clip**: đặt tên file theo tên clip của dự án, không theo tên preset:

  | Preset Tripo | Tên clip / file |
  | --- | --- |
  | idle | `idle` → `anim_idle_v<NN>.glb` |
  | run | `run` → `anim_run_v<NN>.glb` |
  | slash | `attack` → `anim_attack_v<NN>.glb` |
  | hurt | `hit_light` → `anim_hit_light_v<NN>.glb` |
  | death (không có thì fall) | `death` → `anim_death_v<NN>.glb` |
- **Tên lịch sử CLI** (`--name`): `<asset_id>_v<NN>`, ví dụ `prop_lo_dan_v01`.

## 4. `meta.json`

Một file cho mỗi asset, tại `assets/source/<loại>/<asset_id>/meta.json`. Claude điền phần CLI; với web app, người dùng báo lại số liệu (mục 6, bước 9) và Claude điền.

```json
{
  "id": "prop_lo_dan",
  "type": "prop",
  "itemId": null,
  "status": "concept_approved",
  "budget": { "faceLimit": 2500, "texture": 512 },
  "concept": [
    {
      "file": "concept/concept_34_v02.png",
      "view": "34",
      "tool": "codex",
      "date": "2026-11-18",
      "prompt": "SUBJECT: single game prop, a Chinese bronze ding-style alchemy furnace …",
      "chosen": true
    }
  ],
  "tripo": [
    {
      "step": "image_to_model",
      "channel": "cli",
      "version": 1,
      "taskId": "<task id Tripo>",
      "parentTaskId": null,
      "model": "v3.1-20260211",
      "params": { "face_limit": 4000, "smart_low_poly": true, "texture_quality": "detailed", "pbr": true },
      "seed": null,
      "quote": 50,
      "credits": 50,
      "batch": "2026-11-20-m0-3-prop",
      "date": "2026-11-20",
      "output": "tripo/raw_v01.glb",
      "result": "ok",
      "note": ""
    }
  ],
  "license": { "source": "Tripo (API trả phí) + Codex", "owner": "dự án", "date": "2026-11-20" }
}
```

- `status`: `planned` → `concept_approved` → `generated` → `rigged` → `animated` → `imported` → `in_game`, hoặc `rejected`.
- `channel`: `web` hoặc `cli`. Với `web`, `taskId` có thể thay bằng `webUrl` nếu web app không hiện task id (**chưa kiểm chứng**), và `credits` = số dư trước trừ số dư sau.
- Mỗi lần thử là một phần tử mới trong `tripo`, kể cả lần hỏng. Không xóa.
- Có task id thì tải lại được bằng `tripo task get <taskId> --download -o <thư mục>` (lệnh truy vấn; theo mô tả không tốn credit, **chưa kiểm chứng**). Đây là lý do repo không cần giữ GLB thô.

---

## 5. Quy trình CLI cho prop (kênh b)

Claude thực hiện. Mỗi đợt gồm 5 bước; bước 3 cần người dùng.

### 5.1 Chuẩn bị

- Concept 3/4 của mọi prop trong đợt đã được duyệt và nằm ở `<nguồn>/prop/<id>/concept_34.png`.
- Kiểm tài khoản (không tốn credit):

  ```bash
  tripo whoami --json     # đúng profile, region
  tripo balance --json    # ghi số dư đầu đợt
  ```

### 5.2 Báo giá từng việc

Với **mỗi** prop, chạy đúng lệnh sẽ chạy thật, thêm `--dry-run`:

```bash
SRC="${DTL_ASSET_SOURCE:-../dtl-asset-source}"   # nên đặt DTL_ASSET_SOURCE thành đường dẫn tuyệt đối
tripo make "$SRC/3d/prop/prop_lo_dan/concept_34.png" \
  --model v3.1 -n 1 \
  -p face_limit=4000 -p smart_low_poly=true -p texture_quality=detailed -p pbr=true \
  --name prop_lo_dan_v01 -o "$SRC/3d/prop/prop_lo_dan/tripo" \
  --dry-run --json
```

Đọc kết quả: `valid` phải là `true`, `errors` rỗng, `deliverables` là `["GLB"]`, chỉ có một bước `image-to-model`, `generation_credits_estimate` là 50. Khác đi thì dừng và sửa lệnh.

### 5.3 Xin duyệt

Gửi người dùng (qua orchestrator nếu đang chạy trong phiên worker) một bảng báo giá:

| Prop | Lệnh (tóm tắt) | Báo giá |
| --- | --- | --- |
| `prop_lo_dan` v01 | image→3D, v3.1, 4.000 mặt, texture chi tiết + PBR | 50 |
| `prop_linh_thao` v01 | image→3D, v3.1, 1.500 mặt, texture chi tiết + PBR | 50 |
| `prop_phi_kiem` v01 | image→3D, v3.1, 2.500 mặt, texture chi tiết + PBR | 50 |
| **Cộng** | | **150** |
| **Hạn mức đề xuất** (cộng 20% dự phòng, làm tròn; không vượt 300) | | **180** |
| Số dư hiện tại / sau đợt (dự kiến) | | 1000 / 850 |

Chỉ chạy khi người dùng trả lời rõ là đồng ý **đợt này** với **hạn mức này**. Ghi người duyệt, thời điểm (giờ Asia/Bangkok) và hạn mức vào nhật ký đợt trước khi chạy.

### 5.4 Chạy

- Chạy **tuần tự từng việc**, cùng lệnh đã báo giá, bỏ `--dry-run`, thêm `--no-open`. Không dùng `batch run`.
- Sau mỗi việc: lấy `task_id` từ JSON trả về, ghi ngay vào `meta.json`; chạy `tripo balance --json`. Nếu credit đã tiêu cộng báo giá việc kế tiếp vượt hạn mức thì **dừng đợt**.
- Đổi tên file tải về thành `raw_v<NN>.glb` trong `<nguồn>/prop/<id>/tripo/`.
- Việc lỗi: ghi `result: "failed"` kèm thông báo lỗi, kiểm `tripo task get`, không tự chạy lại.

### 5.5 Kết thúc đợt

```bash
tripo usage --json --limit 50
tripo balance --json
```

Ghi nhật ký `assets/source/_batches/<YYYY-MM-DD>-<tên-đợt>.json`:

```json
{
  "batch": "2026-11-20-m0-3-prop",
  "approvedBy": "người dùng (qua orchestrator)",
  "approvedAt": "2026-11-20T14:05+07:00",
  "cap": 180,
  "balanceBefore": 1000,
  "balanceAfter": 850,
  "jobs": [
    { "asset": "prop_lo_dan", "version": 1, "taskId": "<id>", "quote": 50, "credits": 50, "result": "ok" }
  ],
  "usage": "<dán nguyên kết quả tripo usage --json của các task trong đợt>",
  "notes": "báo giá khớp thực tế / lệch bao nhiêu và vì sao"
}
```

Báo lại người dùng: số credit đã dùng so với báo giá và hạn mức, số dư còn lại, việc nào lỗi. Rồi chuyển GLB sang pipeline (kiểm bằng `asset-validator`). Pipeline **không ép palette** texture (đã bỏ từ art bible v3); chỉ có bước chuẩn hóa màu nhẹ tùy chọn và giữ nguyên các map PBR (art bible mục 3).

---

## 6. Quy trình web app cho nhân vật, quái, boss (kênh a)

Người dùng bấm; Claude soạn concept, điền `meta.json` và nhập file. Tên nút theo giao diện người dùng gửi ngày 2026-11-15. Thanh trái gồm **Image · Model · Segment · Retopo · Smart UV · Texture · Rig**.

**Bài học M0-3** (2026-11-15):
- Đệ tử nam dựng với thiết lập mặc định ra **1,95 triệu tam giác**, texture màu 8192².
- Tự giảm lưới trong Blender làm **nứt đường nối UV**. Vì vậy phải đặt **Polycount** ngay khi dựng, hoặc dùng **Retopo** của Tripo (Tripo chiếu lại texture).
- Sói đặt Polycount 8000 ra đúng 7.895 tam giác.
- File "anim" của sói tải về trùng hệt file rig, không có clip: mỗi clip phải tải riêng sau khi chọn.

| Thiết lập | Người chơi | NPC | Quái | Boss |
| --- | --- | --- | --- | --- |
| **Polycount** (Topology **Triangle**) | 20000 | 12000 | 8000 | 20000 |
| Rig | biped (Mixamo nếu có) | biped | quadruped / biped theo xương | theo xương |
| Animation trên Tripo | 5 clip trên **một** model mẫu | không | không: Tripo chỉ có clip đi bộ cho bốn chân; làm bằng Blender thủ tục | không |

1. **Chuẩn bị** (Claude): concept 3 góc đã duyệt nằm ở `<nguồn>/<loại>/<id>/concept_front.png`, `concept_left.png`, `concept_back.png`.
2. **Đăng nhập** bằng tài khoản gói Max. Ghi số credit trước mỗi bước.
3. **Model** → khung **Generate Model** → tab **HD Model**. Ảnh multiview: **Front** = concept_front, **Left** = concept_left (nhân vật quay mặt sang phải khung hình), **Back** = concept_back, **Right** để trống.
4. **General Settings**: **Generate in Parts** tắt, **8K Texture** tắt, **Privacy** bật. **AI Model**: **H3.1**.
5. Popup **Geometry & Texture**:
   - **Ultra Mesh Quality** tắt.
   - **Texture** bật, **Texture Quality 2K**.
   - **Remove Lighting** bật, **PBR** bật.
   - **Topology Triangle**, **Polycount** theo bảng.
6. **Generate** (65 credit, 2026-11-15). Xoay kiểm: tay áo không dính thân, chân tách, mặt không méo. Quá 3 lần không đạt thì báo Claude để sửa concept.
7. Nếu đã có model quá nặng: **Retopo** (Triangle, Polycount theo bảng). Texture lệch thì dùng **Texture** (2K, PBR, Remove Lighting). Không dựng lại từ đầu.
8. **Rig** trên **bản đã đúng Polycount** (không rig bản nặng). Người chọn biped (Mixamo nếu có); quái bốn chân chọn quadruped.
9. **Animation** (chỉ model mẫu người): preset idle, run, slash, hurt, death (không có death thì chọn fall); bật in place nếu có.
10. **Export GLB** (không FBX). Tải riêng từng clip. Đặt vào `<nguồn>/<loại>/<id>/tripo/` và đặt tên theo mục 3 (preset đổi sang tên clip): `lowpoly_v02.glb` (sau Retopo), `rig_v02.glb`, `anim_idle_v02.glb`, `anim_run_v02.glb`, `anim_attack_v02.glb` (slash), `anim_hit_light_v02.glb` (hurt), `anim_death_v02.glb`. Không ghi đè bản cũ.
11. **Báo Claude**: asset id, credit từng bước (Retopo, Texture, Generate, Rig, Animation), clip đã chọn, có Mixamo / in place không.
12. **Claude** kiểm từng file (số tam giác, xương, clip, hash không trùng), điền `meta.json` (`channel: "web"`), đánh giá bằng trang `?viewer=asset` và `asset-validator`, rồi đưa qua pipeline: thêm khối `import` vào `meta.json` (`source` theo thứ tự chọn ở mục 3, kích thước thật, `yaw`, socket, `post` nếu cần clip thủ tục; xem `assets/README.md` mục Nhập Tripo) và chạy `pnpm assets:build --only <id>`. Giữ texture PBR, không ép palette.

## 7. Theo dõi credit

| Kênh | Nguồn số liệu | Ghi ở đâu |
| --- | --- | --- |
| CLI | `tripo balance`, `tripo usage` | nhật ký đợt + `meta.json` |
| Web app | người dùng đọc số dư trước và sau mỗi bước | `meta.json` (Claude điền từ báo cáo) |

Báo cáo M0-6 cộng số credit thật theo từng thao tác của cả hai kênh, so với bảng ước tính trong plan mục 4.1, để chỉnh ngân sách cho M3.

## 8. Chưa kiểm chứng

- Web app: giá của Retopo, Texture, Rig, Animation; có hiện task id không; có spec Mixamo, tùy chọn in place không; preset animation cho người có đúng tên idle/run/slash/hurt/death không. (Tên nút đã kiểm 2026-11-15, xem mục 6.)
- Giá credit trên web app có giống bảng giá API không.
- Quy ước ô "Left" của Tripo multiview so với ảnh nhân vật quay mặt sang phải: hai lần dựng M0-3 (đệ tử, sói) ra đúng hình, nhưng chưa kiểm riêng.
- `tripo task get --download` có thật sự không tốn credit; file tải lại có giữ được bao lâu.
- Báo giá `make --dry-run` không gồm bước chuỗi (CLI tự ghi chú "chain steps not estimated"); prop không dùng chuỗi nên không ảnh hưởng.
