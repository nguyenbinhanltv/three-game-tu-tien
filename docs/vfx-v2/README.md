# VFX-V2: trùng tu toàn bộ chiêu Kiếm tu (Lạc Kiếm Quyết)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/vfx-v2/<file>`.

Cùng phong cách V1 (lõi sẫm + bóng, lưỡi liềm hai tông, tinh thể lam, phi kiếm vòng xoắn, va chạm + khựng, dư âm tan nhanh; lam ngọc-trắng điểm vàng). Mỗi chiêu một file `packages/content/data/fx/<id>.json`, sinh bằng `python tools/vfx/gen-fx-kiem.py` (+ `recipes_b.py`); sửa tay được.

| Chiêu | Bản sắc hình |
| --- | --- |
| Linh Khí Hộ Thể | kiếm trận hộ thân: vòng ấn, xoáy tinh thể, gai vòng quanh chân |
| Hồi Nguyên Thuật | linh khí dâng như sen, cánh sáng bay lên (thay hình `heal` cũ) |
| Thiên Kiếm Vũ | vòng trận triện văn + nứt đất phủ vùng bán kính 9, 28 kiếm khí tinh thể rơi nghiêng theo nhịp (12 kiếm luôn có, còn lại từ Vừa/Cao), mỗi mũi cắm đất nổ gợn + gai (thay mưa kiếm cũ); biến thức rộng/tập trung |
| Lôi Đình Nhất Kiếm | tông tím (bảng màu `loi`), sét mảnh nối tiếp (sự kiện `bolt`), vết cháy + nứt đất + lôi văn, gai tím, khựng 65 ms, không chớp toàn cảnh; kích hoạt theo S.FX `thunder` vì chiêu niệm không phát sự kiện windup (thay hình cũ) |
| Kiếm Ảnh Bộ (lướt) | tàn ảnh sẫm ở chỗ cũ, vệt xoắn kéo dọc đường lướt |
| Phi Kiếm Truy Hồn | bóng kiếm sẫm lướt trước, bản thể theo sau, dấu ấn tinh thể cắm trên đầu mục tiêu; biến thức sâu/lan |
| Vạn Kiếm Quy Tông (tối thượng) | mười bốn kiếm trút xuống, hai nhát chém dọc khổng lồ, trụ gai, khựng 80 ms |
| Hoành Kiếm Phá Mạch | nhát quét ngang, gai nối tiếp dọc đường chém; dài/đôi |
| Kiếm Vũ Tam Điệp | ba nhát khác hướng (chéo trái, chéo phải, bổ đứng), khựng nhẹ/nhẹ/nặng, nhát cuối nổ gai |
| Kiếm Đan Bản Mệnh | kiếm nhỏ vọt ra từ đan điền |
| Nghịch Kiếm Chuyển Phong | vệt quang kéo ngược chỗ cũ (thay hình cũ) |
| Phản Ảnh Kiếm Ảnh | hai bóng kiếm sẫm hai bên như gương |
| Thuấn Di Trảm | vệt xé không gian, bổ dọc lớn, gai nổ |
| Thiên Kiếm Hóa Hình (tối thượng) | kiếm khổng lồ giáng từ trời, bốn vầng trăng, trận triện văn phủ rộng; biến thức đóng băng/vang vọng |

**Khung mở rộng:** biến thức (`variants`), sự kiện theo mốc trúng (`hit`, Kiếm Vũ Tam Điệp), neo vùng `area` + `fit` (bán kính vùng), `move.offset` (rơi từ trời), kích hoạt theo `S.FX` cho chiêu lướt (`trigger: fx`).
**Animation:** Hộ Thể, Hồi Nguyên, Lôi Đình cường điệu hơn (`AMP` trong `gen-k5.mjs`); các chiêu bậc 2–3 đã có pose riêng từ E2-G (mỗi chiêu một pose), giữ. `hitAt` không đổi.
**Cách xem chiêu còn khóa** (Phản Ảnh, Thuấn Di, Thiên Kiếm Hóa Hình chưa mở trong game): `pnpm shots:vfx` tự phát thẳng sự kiện vào `SkillFx` (không có động tác); Thuấn Di nữ ít thấy va chạm vì đích giả lập chưa trúng, chỉ là hạn chế của công cụ. Nghịch Kiếm chưa có video riêng (chỉ chạy được ở cấp Nguyên Anh).

## Sân đông (V6 rút gọn)
`pnpm shots:vfx --crowd 50 --skills <chiêu,...>`: 50 người giả (client) cùng ra chiêu Kiếm tu, mỗi người ~0,9 s một chiêu, 15 s, WebGPU, Cao:

| Mức | draw p50/p95/max | tam giác max | khung ms p50/p95/p99 | lưới FX sống max |
| --- | --- | --- | --- | --- |
| 6 chiêu, 50 người | 144/145/148 | 462k | 8,3/9,9/15,8 | 631 |

Dưới 300 draw (lưới FX gộp instanced theo hình). Khung ms là khoảng giữa hai khung (màn hình giới hạn 120 Hz), không phải CPU thuần; chưa đo CPU/GPU tách rời (dùng `bench:crowd` khi có bot dùng chiêu này).
Ảnh dãy khung mới/cũ: `anh/` (cũ = `--old`, hình trước V0). Video webm ở artifacts.
