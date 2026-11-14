# Runbook Tripo

Phiên bản 1 · 2026-11-14 · Việc M0-1. Kiểm chứng với `tripo-cli 0.11.2`.

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
4. **Mỗi đợt có hạn mức credit** do người dùng chốt khi duyệt. Mặc định đề xuất **tối đa 300 credit mỗi đợt** và luôn giữ lại **ít nhất 100 credit** trong tài khoản. Hết hạn mức thì dừng, kể cả khi còn việc.
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
| Thư mục nguồn | `DTL_ASSET_SOURCE`, mặc định `../dtl-asset-source/` (thư mục cạnh thư mục repo gốc, không nằm trong repo) | ảnh concept, GLB tải từ Tripo, nhật ký CLI thô | không. Người dùng tự sao lưu (ổ khác hoặc cloud) |
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

- **Asset id**: tiền tố loại + tên không dấu `snake_case`, trùng id trong `packages/content` khi có. Tiền tố theo `blender-pipeline`: `chr_` (người), `mon_` (quái), boss dùng id game không thêm tiền tố (ví dụ `boss_kiem_khoi`) nhưng vẫn đặt trong thư mục `mon/`, `prop_` (prop, vũ khí, phi kiếm, đồ rơi). Prop không bắt buộc trùng id vật phẩm (ví dụ `prop_linh_thao` ứng với vật phẩm `itm_linh_thao`); ghi id vật phẩm vào trường `itemId` của `meta.json`. Ví dụ: `chr_de_tu_nam`, `chr_de_tu_nu`, `mon_soi_xam`, `prop_lo_dan`, `prop_linh_thao`, `prop_phi_kiem`.
- **Thư mục loại**: `chr`, `mon`, `prop`.
- **Ảnh concept**: `concept_<góc>_v<NN>.png` cho mọi phương án; bản duyệt chép thành `concept_<góc>.png`. Góc: `front`, `left`, `back`, `right`, `34` (3/4 cho prop).
- **File Tripo**: `raw_v<NN>.glb` (dựng hình), `rig_v<NN>.glb`, `anim_<clip>_v<NN>.glb` (clip: `idle`, `idle_combat`, `walk`, `run`, `jump`, `hit_light`, `hit_heavy`, `death`, `meditate`, `cast`, `draw`, `sheathe`; quái thêm `attack`). `NN` tăng theo mỗi lần thử, không ghi đè.
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
      "params": { "face_limit": 2500, "smart_low_poly": true, "texture_quality": "standard", "pbr": false },
      "seed": null,
      "quote": 40,
      "credits": 40,
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
tripo make "$SRC/prop/prop_lo_dan/concept_34.png" \
  --model v3.1 -n 1 \
  -p face_limit=2500 -p smart_low_poly=true -p texture_quality=standard \
  --name prop_lo_dan_v01 -o "$SRC/prop/prop_lo_dan/tripo" \
  --dry-run --json
```

Đọc kết quả: `valid` phải là `true`, `errors` rỗng, `deliverables` là `["GLB"]`, chỉ có một bước `image-to-model`, `generation_credits_estimate` là 40. Khác đi thì dừng và sửa lệnh.

### 5.3 Xin duyệt

Gửi người dùng (qua orchestrator nếu đang chạy trong phiên worker) một bảng báo giá:

| Prop | Lệnh (tóm tắt) | Báo giá |
| --- | --- | --- |
| `prop_lo_dan` v01 | image→3D, v3.1, 2.500 mặt | 40 |
| `prop_linh_thao` v01 | image→3D, v3.1, 800 mặt | 40 |
| `prop_phi_kiem` v01 | image→3D, v3.1, 1.200 mặt | 40 |
| **Cộng** | | **120** |
| **Hạn mức đề xuất** (cộng 20% dự phòng, làm tròn) | | **150** |
| Số dư hiện tại / sau đợt (dự kiến) | | 1000 / 880 |

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
  "cap": 150,
  "balanceBefore": 1000,
  "balanceAfter": 880,
  "jobs": [
    { "asset": "prop_lo_dan", "version": 1, "taskId": "<id>", "quote": 40, "credits": 40, "result": "ok" }
  ],
  "usage": "<dán nguyên kết quả tripo usage --json của các task trong đợt>",
  "notes": "báo giá khớp thực tế / lệch bao nhiêu và vì sao"
}
```

Báo lại người dùng: số credit đã dùng so với báo giá và hạn mức, số dư còn lại, việc nào lỗi. Rồi chuyển GLB sang pipeline (kiểm bằng `asset-validator`).

---

## 6. Quy trình web app cho nhân vật, quái, boss (kênh a)

Người dùng bấm; Claude soạn concept, điền `meta.json` và nhập file. Tên nút dưới đây **chưa kiểm chứng** (trang chặn truy cập tự động); lần đầu làm, người dùng ghi lại tên thật để sửa runbook.

1. **Chuẩn bị** (Claude): concept 3 góc đã duyệt nằm ở `<nguồn>/<loại>/<id>/concept_front.png`, `concept_left.png`, `concept_back.png`. Claude gửi kèm bảng tham số từ `docs/prompts/tripo.md` mục 2 cho đúng loại.
2. **Đăng nhập** tripo3d.ai bằng tài khoản gói Max. Kiểm model đang để **riêng tư** (gói trả phí cho phép; không để công khai trên thư viện Tripo). Ghi số credit hiện có.
3. **Tạo model**: chọn chế độ Multiview (nhiều ảnh) → 3D. Tải ảnh vào đúng ô: trước, trái (ảnh bên: nhân vật quay mặt sang phải khung hình), sau. So ảnh bên với hình minh họa trên ô "trái"; nếu ngược thì báo Claude để lật ảnh.
4. **Thiết lập**: model v3.1 (hoặc bản Claude ghi trong bảng), texture tiêu chuẩn (không HD), PBR tắt, Smart Low-poly bật, giới hạn mặt theo bảng (người chơi 11.000, quái 5.000), quad tắt.
5. **Sinh** và chọn phương án tốt nhất. Xoay xem: tay áo không dính thân, chân tách nhau, mặt không méo. Không đạt thì sinh lại (mỗi lần là một lần trả credit; báo Claude nếu quá 3 lần để sửa concept thay vì sinh tiếp).
6. **Rig**: chạy kiểm tra rig (miễn phí) → Auto Rig. Người: biped, spec mixamo nếu có (không có thì spec mặc định). Quái bốn chân: quadruped.
7. **Animation**: chỉ với model mẫu của mỗi kiểu xương (đệ tử nam cho người; Sói Xám cho quái bốn chân). Chọn clip theo `docs/prompts/tripo.md` mục 3, bật **in place** nếu có. NPC và người chơi nữ chỉ rig, không mua animation.
8. **Tải về GLB** (không FBX): bản dựng hình, bản rig, từng clip. Đặt vào `<nguồn>/<loại>/<id>/tripo/` và đổi tên theo mục 3 (`raw_v01.glb`, `rig_v01.glb`, `anim_walk_v01.glb`…).
9. **Báo Claude** (chat hoặc orchestrator): asset id; mỗi bước (dựng, rig, từng clip) tốn bao nhiêu credit (số dư trước và sau); task id hoặc đường link trang model; phương án đã chọn; điều gì thấy chưa ổn.
10. **Claude**: điền `meta.json` (`channel: "web"`), kiểm file bằng `asset-validator` / trang xem asset (M0-4), rồi đưa qua pipeline Blender (M2).

## 7. Theo dõi credit

| Kênh | Nguồn số liệu | Ghi ở đâu |
| --- | --- | --- |
| CLI | `tripo balance`, `tripo usage` | nhật ký đợt + `meta.json` |
| Web app | người dùng đọc số dư trước và sau mỗi bước | `meta.json` (Claude điền từ báo cáo) |

Báo cáo M0-6 cộng số credit thật theo từng thao tác của cả hai kênh, so với bảng ước tính trong plan mục 4.1, để chỉnh ngân sách cho M3.

## 8. Chưa kiểm chứng

- Tên nút, vị trí tùy chọn trên web app; web app có hiện task id không; có spec mixamo, tùy chọn in place không.
- Giá credit trên web app có giống bảng giá API không.
- Quy ước ô "left" của Tripo multiview so với ảnh nhân vật quay mặt sang phải.
- `tripo task get --download` có thật sự không tốn credit; file tải lại có giữ được bao lâu.
- Báo giá `make --dry-run` không gồm bước chuỗi (CLI tự ghi chú "chain steps not estimated"); prop không dùng chuỗi nên không ảnh hưởng.
