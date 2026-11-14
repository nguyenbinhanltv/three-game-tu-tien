# Tham số Tripo theo loại asset

Phiên bản 3 (2026-11-15): hướng bán tả thực, texture chi tiết và PBR. Áp dụng cho cả web app (người dùng bấm) và Tripo CLI (Claude chạy, chỉ cho prop). Cách chạy từng bước và quy tắc credit: [`docs/tripo-runbook.md`](../tripo-runbook.md).

Kiểm chứng với `tripo-cli 0.11.2` bằng các lệnh chỉ đọc (`--help`, `models`, `make --dry-run`), lần cuối 2026-11-15. Tên trường trong cột "CLI" là tên tham số API mà `make --dry-run` in ra. Tên nút trên web app **chưa kiểm chứng**; người dùng đối chiếu lần đầu và sửa bảng này.

## 1. Cài đặt chung (mọi asset)

| Thiết lập | Giá trị | CLI | Lý do |
| --- | --- | --- | --- |
| Model dựng hình | `v3.1-20260211` | `--model v3.1` | **Đã chốt** cho tới khi thử nghiệm M0 xong; chỉ đổi sau báo cáo M0-6. CLI mặc định là `P2-20260801` (đắt hơn), nên **luôn ghi `--model v3.1`** |
| Texture | bật, **chi tiết** (detailed / HD) | `texture=true`, `-p texture_quality=detailed` | Hướng bán tả thực giữ chi tiết texture của Tripo. +10 credit so với tiêu chuẩn |
| PBR | **bật** | `-p pbr=true` | Lấy normal, roughness, metalness cho material PBR cách điệu (art bible mục 3). Báo giá không đổi khi bật PBR |
| Smart Low-poly | **bật** | `-p smart_low_poly=true` | Lưới sạch, đúng giới hạn mặt; +10 credit |
| Giới hạn mặt | theo bảng mục 2 | `-p face_limit=<n>` | Tripo cho phép 500–20.000 |
| Quad | tắt | (không đặt) | Game dùng tam giác |
| Hình học chi tiết | tắt (cân nhắc cho boss) | (không đặt) | +20 credit |
| Định dạng tải về | **GLB** | mặc định khi không có `--for` | **Không dùng `--for game-pc`**: preset này tự thêm bước convert sang FBX |
| Số phương án | 1 | `-n 1` | Mỗi phương án tính credit riêng |
| Seed | ghi lại để tái tạo | `--seed <n>` | Ghi vào `meta.json` |

**Báo giá `make --dry-run`** (v3.1 + detailed + PBR + smart low-poly): **50 credit** cho cả image→3D lẫn multiview→3D. Bỏ smart low-poly thì 40; texture tiêu chuẩn thay vì chi tiết thì 40. Báo giá không gồm các bước chuỗi (rig, animation, convert).

## 2. Theo loại asset

| Loại | Kênh | Đầu vào | Giới hạn mặt | Ngân sách game LOD0 | Rig | Animation |
| --- | --- | --- | --- | --- | --- | --- |
| Người chơi (nam, nữ) | web app | Multiview: trước, trái, sau | **20.000** | 15–25 nghìn (trên 20 nghìn phải tách bộ phận) | biped, spec `mixamo`, rig `v3.0-20260909` | chỉ mua cho **một** model mẫu, bật in place |
| NPC | web app | Multiview | 12.000 | 10–15 nghìn | biped `mixamo` | không (dùng chung clip) |
| Quái bốn chân (Sói Xám, Yêu Lang, U Minh Lang, Thiết Bối Trư, Hỏa Vân Hồ, Kiếm Linh dạng cáo) | web app | Multiview: bên, trước, sau | 8.000 | 5–10 nghìn | quadruped, rig `v2.5-20260210` (CLI tự chọn sau rig-check) | khoảng 6 clip mỗi kiểu xương |
| Quái hai chân (Thạch Viên) | web app | Multiview | 8.000 | 5–10 nghìn | biped hoặc others (v3.0) | khoảng 6 clip |
| Boss (Huyết Lang Vương: xương sói; Kiếm Khôi, Thủ Mộ Thạch Tướng: xương vượn) | web app | Multiview | 20.000 (tối đa của Tripo) | 30–50 nghìn khi tách bộ phận | quadruped hoặc biped/others theo xương | khoảng 6 clip |
| Vũ khí, phi kiếm | **CLI** | Image (3/4) | 2.500 | 1–3 nghìn | không | không |
| Prop lớn (lò đan, rương) | **CLI** | Image (3/4) | 4.000 | 500–5 nghìn | không | không |
| Prop nhỏ, linh thảo | **CLI** | Image (3/4) | 1.500 | 500–5 nghìn | không | không |
| Đồ rơi | **CLI** | Image (3/4) | 1.000 | 300–1,5 nghìn | không | không |

Ghi chú:

- **Boss**: Tripo tối đa 20.000 mặt, dưới ngân sách 30–50 nghìn. Có hai cách: giữ 20.000 (đủ cho hầu hết boss khi có normal map), hoặc tách bộ phận (đầu, thân, vũ khí) dựng riêng. Quyết theo kết quả boss đầu tiên.
- **LOD1/LOD2** sinh bằng `simplify` trong pipeline (M2), không sinh bằng Tripo.
- **Ảnh multiview**: CLI gửi ảnh thứ hai vào ô `left`. Trong concept, ảnh bên là nhân vật quay mặt sang phải khung hình (thấy bên trái của nhân vật). **Chưa kiểm chứng** quy ước "left" của Tripo trùng với cách này; lần đầu chạy trên web app, so với hình minh họa trên ô tải ảnh.
- **Spec `mixamo`** có trong CLI (`tripo anim rig --spec tripo|mixamo|...`). Nếu web app không có, dùng spec mặc định `tripo` rồi đổi tên xương trong Blender.
- **In place**: CLI có cờ `--animate-in-place` cho `anim retarget`. Web app có tùy chọn này không thì **chưa kiểm chứng**; nếu không, pipeline tự khử dịch chuyển gốc theo `characters-animation.md`.

## 3. Animation preset cho người (bộ cơ bản khoảng 12 clip)

Rig Check miễn phí, Auto Rig 25 credit mỗi model (bảng giá API, chưa kiểm chứng trên web app). Animation mua một lần trên model mẫu đệ tử nam, tối đa 5 clip mỗi lượt (10 credit mỗi clip theo bảng giá API):

| Clip trong game | Ghi chú |
| --- | --- |
| idle thường | đứng tự nhiên, kiếm ở lưng |
| idle chiến đấu | thủ thế |
| đi, chạy | **in place** |
| nhảy: lên, rơi, đáp | |
| trúng đòn nhẹ, trúng đòn nặng | |
| chết | |
| đả tọa (clip ngồi thiền) | |
| niệm chú | |
| rút kiếm, tra kiếm | có thể tự làm bằng IK nếu không có preset hợp |

Đòn kiếm và tư thế ngự kiếm **tự làm** bằng IK hai đốt (plan 2.3), không mua. Tên preset cụ thể lấy từ danh sách trên web app hoặc tài liệu Tripo khi làm M0-3; CLI chỉ cho thấy dạng `preset:idle`, `preset:walk`.

## 4. Lệnh CLI mẫu cho prop

Chỉ chạy khi đã có duyệt cho đợt đó (runbook mục 5). Luôn `--dry-run` trước:

```bash
# 1. Báo giá (không tải lên, không tốn credit)
tripo make "$SRC/prop/prop_lo_dan/concept_34.png" \
  --model v3.1 -n 1 \
  -p face_limit=4000 -p smart_low_poly=true -p texture_quality=detailed -p pbr=true \
  --name prop_lo_dan_v01 -o "$SRC/prop/prop_lo_dan/tripo" \
  --dry-run --json

# 2. Chạy thật: cùng lệnh, bỏ --dry-run, thêm --no-open (CHỈ khi đã được duyệt)
```

Kết quả `make --dry-run` phải có `"valid":true`, `"deliverables":["GLB"]`, một bước `image-to-model` và `"generation_credits_estimate":50`. Khác đi thì dừng, không chạy thật.
