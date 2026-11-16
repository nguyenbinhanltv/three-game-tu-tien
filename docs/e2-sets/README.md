# E2 · 3 bộ trang bị bậc mới: mẫu Tripo và quyết định cách dùng

Nguồn: `chr/set_{liet_mach_kiem_y,kinh_quang_kiem_y,tinh_khuyet_kiem_bao}/tripo/{raw,rig}_v01.glb`. Mỗi file là **một ma-nơ-canh (cả thân, đầu trọc, tay trần) mặc nguyên bộ**, ~1900 tam giác, áo/choàng là các tấm vỏ mỏng, một atlas texture 2048². `rig_v01` có 35–43 xương Tripo riêng (không trùng `rig_human_base`).

**Đã nhập**: `assets/source/chr/set_*/meta.json` (tiền tố `set_`, lớp ngân sách `prop`, cao 1,75 m, LOD0 1855–1930 + 2 LOD, ~360 KB, không xương) làm mẫu trưng bày và tham chiếu hình khối/bảng màu. Ảnh turntable (trên trái: chính diện; phải, sau, trái): `set_*.png`. Chưa nối vào game.

**Chưa làm: thay áo nhân vật bằng mesh này.** Lý do (đã cân nhắc hai hướng đề bài):
1. *Áo ngoài thay được trên `chr_kiem_tu_nam/nu`* đòi chuyển trọng số từ lưới người chơi sang vỏ Tripo (khác xương, khác tỉ lệ, một thân cho cả hai giới), cắt thân cũ theo xương (như kiếm), và vỏ choàng rộng chạm chân khi chạy/chém: không đảm bảo "không xuyên mesh" nếu không có bước tạo trọng số + vùng đệm cho từng giới và từng clip. Đó là một hạng mục riêng, ít nhất 2 mẫu nam + nữ mỗi bộ.
2. *Tách phụ kiện* (vai giáp đồng, hộ uyển, đai + ngọc, ống ủng): hệ phụ kiện thủ tục hiện có (`setAccessories.ts`, `bodyFit.ts`, PR #88) đã làm đúng việc này cho nam/nữ; các bộ bậc 2–4 chưa có định nghĩa bộ (`sets.ts`, vật phẩm, hiệu ứng 2/4 món là E2-F), nên chưa có chỗ gắn.

Đề xuất cho E2-F: vẫn đi đường recolor + phụ kiện thủ tục của #88 theo bảng màu trong concept (Liệt Mạch ocher + ngà, đồng; Kính Quang, Tinh Khuyết lấy từ `docs/asset-concepts/set_*.webp`), dùng ảnh turntable ở đây làm bản vẽ hình khối; chỉ khi muốn áo đổi dáng hẳn thì mở hạng mục retarget riêng.

**Cập nhật:** áo mặc thật đã làm cho cả 3 mẫu × nam/nữ, xem `docs/sets-retarget/`.
