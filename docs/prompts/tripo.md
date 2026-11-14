# Tham số Tripo theo loại asset

Áp dụng cho cả web app (người dùng bấm) và Tripo CLI (Claude chạy, chỉ cho prop). Cách chạy từng bước và quy tắc credit: [`docs/tripo-runbook.md`](../tripo-runbook.md).

Kiểm chứng ngày 2026-11-14 với `tripo-cli 0.11.2` bằng các lệnh chỉ đọc (`--help`, `models`, `make --dry-run`). Tên trường trong cột "CLI" là tên tham số API mà `make --dry-run` in ra. Tên nút trên web app **chưa kiểm chứng**; người dùng đối chiếu lần đầu và sửa bảng này.

## 1. Cài đặt chung (mọi asset)

| Thiết lập | Giá trị | CLI | Lý do |
| --- | --- | --- | --- |
| Model dựng hình | `v3.1-20260211` | `--model v3.1` | **Đã chốt** (2026-11-14): dùng v3.1 cho tới khi thử nghiệm M0 xong; chỉ đổi sau báo cáo M0-6. CLI mặc định là `P2-20260801`, đắt hơn (text→3D với P2 báo giá 120 credit), nên **luôn ghi `--model v3.1`** |
| Texture | bật, **tiêu chuẩn** (standard), không HD/detailed | `texture=true`, `-p texture_quality=standard` | Texture chi tiết nướng nhiều sáng tối hơn và đắt hơn; pipeline ép palette về màu phẳng (art bible mục 6) |
| PBR | **tắt** | `pbr=false` (mặc định) | Game không dùng normal/roughness/metalness |
| Smart Low-poly | **bật** | `-p smart_low_poly=true` | Lưới gọn, đúng ngân sách; +10 credit |
| Giới hạn mặt | theo bảng mục 2 | `-p face_limit=<n>` | Tripo cho phép 500–20.000 |
| Quad | tắt | (không đặt) | Game dùng tam giác; quad +5 credit mà không lợi gì |
| Hình học chi tiết | tắt (trừ boss) | (không đặt) | +20 credit |
| Định dạng tải về | **GLB** | mặc định khi không có `--for` | **Không dùng `--for game-pc`**: preset này tự thêm bước convert sang FBX và chọn texture `detailed` |
| Số phương án | 1 (web app có thể sinh sẵn nhiều; chỉ tải bản được chọn) | `-n 1` | Mỗi phương án tính credit riêng |
| Seed | ghi lại để tái tạo | `--seed <n>` | Ghi vào `meta.json` |

Báo giá `make --dry-run` cho image→3D và multiview→3D với cài đặt trên (v3.1 + standard + smart low-poly) đều là **40 credit**, khớp bảng giá API (30 + 10). Báo giá không gồm các bước chuỗi (rig, animation, convert).

## 2. Theo loại asset

| Loại | Kênh | Đầu vào | Giới hạn mặt | Rig | Animation |
| --- | --- | --- | --- | --- | --- |
| Người chơi (nam, nữ) | web app | Multiview: trước, trái, sau | **11.000** (ngân sách 10–12 nghìn) | biped, spec `mixamo`, rig `v3.0-20260909` | chỉ mua cho **một** model mẫu, bật in place |
| NPC | web app | Multiview | 7.000 | biped `mixamo` | không (dùng chung clip) |
| Quái bốn chân (Sói Xám, Yêu Lang, U Minh Lang, Huyết Lang Vương, Thiết Bối Trư, Hỏa Vân Hồ, Kiếm Linh dạng cáo) | web app | Multiview: bên, trước, sau | 5.000 | quadruped, rig `v2.5-20260210` (CLI tự chọn sau rig-check) | khoảng 6 clip mỗi kiểu xương |
| Quái hai chân (Thạch Viên, Kiếm Khôi, Thủ Mộ Thạch Tướng) | web app | Multiview | 5.000 | biped hoặc others (v3.0) | khoảng 6 clip |
| Boss | web app | Multiview | 18.000–20.000 (tối đa của Tripo), giảm thêm trong Blender nếu cần | theo hình dáng | khoảng 6 clip |
| Vũ khí, phi kiếm | **CLI** | Image (3/4) | 1.200 | không | không |
| Prop lớn (lò đan, rương) | **CLI** | Image (3/4) | 2.500 | không | không |
| Prop nhỏ, linh thảo, đồ rơi | **CLI** | Image (3/4) | 800 | không | không |

Ghi chú:

- **Boss**: ngân sách game là 25–40 nghìn tam giác nhưng Tripo chỉ cho tối đa 20.000 mặt. Với boss lớn, dựng 20.000 rồi giữ nguyên, hoặc tách bộ phận. Hàn Giao giữ model thủ tục (quyết định 6.2).
- **Ảnh multiview**: CLI gửi ảnh thứ hai vào ô `left`. Trong concept, ảnh bên là nhân vật quay mặt sang phải khung hình (thấy bên trái của nhân vật). **Chưa kiểm chứng** quy ước "left" của Tripo trùng với cách này; lần đầu chạy trên web app, so với hình minh họa trên ô tải ảnh.
- **Spec `mixamo`** có trong CLI (`tripo anim rig --spec tripo|mixamo|...`). Nếu web app không có, dùng spec mặc định `tripo` rồi đổi tên xương trong Blender (plan M0, rủi ro).
- **In place**: CLI có cờ `--animate-in-place` cho `anim retarget`. Web app có tùy chọn này không thì **chưa kiểm chứng**; nếu không có, pipeline phải tự khử dịch chuyển gốc theo `characters-animation.md`.

## 3. Animation preset cho người (bộ cơ bản khoảng 12 clip)

Mua một lần trên model mẫu đệ tử nam, tối đa 5 clip mỗi lượt (10 credit mỗi clip theo bảng giá API):

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

Chỉ chạy khi đã có duyệt cho đợt đó (runbook mục 5). Chạy từ thư mục nguồn ngoài repo, luôn có `--dry-run` trước:

```bash
# 1. Báo giá (không tải lên, không tốn credit)
tripo make "$SRC/prop/prop_lo_dan/concept_34.png" \
  --model v3.1 -n 1 \
  -p face_limit=2500 -p smart_low_poly=true -p texture_quality=standard \
  --name prop_lo_dan_v01 -o "$SRC/prop/prop_lo_dan/tripo" \
  --dry-run --json

# 2. Chạy thật: cùng lệnh, bỏ --dry-run, thêm --no-open (CHỈ khi đã được duyệt)
```

`make --dry-run` với đầu vào ảnh in ra `"deliverables":["GLB"]`, `"generation_credits_estimate":40`. Nếu `valid` là `false` hoặc báo giá khác 40 thì dừng, không chạy thật.
