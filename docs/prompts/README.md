# Mẫu prompt sinh asset

Bộ mẫu dùng nguyên văn cho chuỗi **Codex (sinh ảnh concept) → Tripo (dựng 3D)**. Phong cách, màu và điều cấm lấy từ [`docs/art-bible.md`](../art-bible.md); quy trình bấm và chạy lệnh ở [`docs/tripo-runbook.md`](../tripo-runbook.md).

| File | Nội dung |
| --- | --- |
| [`codex.md`](codex.md) | Khối phong cách cố định, mẫu concept 3 góc cho nhân vật và quái, mẫu prop, cách sửa ảnh để ra góc bên và sau |
| [`tripo.md`](tripo.md) | Tham số Tripo theo loại asset: image/multiview→3D, face limit, texture, rig, animation |
| [`m0-2-concepts.md`](m0-2-concepts.md) | Prompt đã điền sẵn cho 5 concept M0-2: đệ tử nam, Sói Xám, lò đan, linh thảo, phi kiếm |

## Quy tắc chung

1. **Viết prompt bằng tiếng Anh**, chỉ thay phần trong `<…>`. Giữ nguyên khối phong cách và khối cấm để mọi ảnh đồng nhất (`assets.md`: bổ sung ảnh thì dùng lại nguyên văn mô tả phong cách).
2. **Không nêu tên** game, phim, truyện, tranh, họa sĩ, studio có thật. Không dùng tên nhân vật của truyện mà thang cảnh giới tham khảo.
3. **Một đối tượng mỗi ảnh**, đủ trong khung, nền xám nhạt liền, ánh sáng đều, không đổ bóng.
4. **Không hiệu ứng** (phát sáng, hạt, khói, tia điện, vệt kiếm khí). Tripo dựng chúng thành khối thật. Phần nào cần phát sáng trong game thì vẽ bằng màu thường, ghi chú lại để pipeline đánh dấu emissive.
5. **Không viền nét (line art) trong ảnh concept**. Viền mực do shader vẽ; nếu ảnh có viền, Tripo nướng viền vào texture và cạnh model bị đen.
6. **Không chữ**: chữ Hán, chữ Việt, triện có chữ, watermark, logo.
7. Lưu mọi ảnh đã sinh (cả ảnh bị loại) vào thư mục nguồn ngoài repo và ghi prompt vào `meta.json` (xem runbook mục 2, 3).
