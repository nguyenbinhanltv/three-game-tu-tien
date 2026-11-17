# VFX-V4 (PR 1): Pháp tướng chiêu tối thượng

Hư ảnh khổng lồ bán trong suốt xuất hiện ~0,3 s trước mốc trúng, giữ ~2,5 s rồi tan (dissolve), đặt xa phía trước nhân vật (16 m, camera người chơi nhìn thấy ở phía sau mục tiêu, không che nhân vật/vạch báo), camera kéo xa nhẹ (+20%, chỉ của mình, theo công tắc Rung màn hình). Nguồn `tools/vfx/recipes_d.py`; hình mới `dragon` (ống thon cuộn xoắn) và `statue` (tròn xoay), sự kiện `camera`.
- Kiếm tu, Vạn Kiếm Quy Tông: **Thanh Long** lam ngọc cuộn quanh người (đầu tinh thể, sừng vàng), trên nền mưa kiếm + chém dọc cũ.
- Hộ pháp, Kim Cương Bất Hoại: **Kim Thân La Hán** vàng kim ngồi đài sen, hai tay chắp ấn, hai vòng hào quang + 12 tia sáng.
- Đan sư, Hồi Thiên Đan Lộ: **Phượng hỏa** ngọc lục–đỏ son hai cánh xòe quạt, đuôi, đầu; sen ngàn cánh ở nền sẵn có.
Hạn chế: Phượng còn mảnh, cánh nhạt (lông kite mỏng), chưa ra dáng chim rõ như rồng và La Hán; cần vòng chỉnh sau khi duyệt video. Hộ pháp/Phượng chỉ thấy tốt khi camera ở sau lưng ở khoảng cách xa (≥ ~14 m).
Sân 50 người (`--crowd 50`, 4 chiêu tối thượng/AoE): draw p50/max 173/178 (< 300), tam giác max 718k, khung ms p50/p95/p99 8,3/12,2/32,7 (p99 xấu: cần V6), lưới FX sống max 2.634.
Cascadeur: `cascadeur.md`. Video webm nam/nữ: artifacts `v4/`.
PR 2 (đột phá, độ kiếp, ngự kiếm/xuất khiếu/thuấn di) làm riêng.
