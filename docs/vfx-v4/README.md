# VFX-V4 (PR 1): Pháp tướng chiêu tối thượng

Hư ảnh khổng lồ bán trong suốt xuất hiện ~0,3 s trước mốc trúng, giữ ~2,5 s rồi tan (dissolve), đặt xa phía trước nhân vật (16 m, camera người chơi nhìn thấy ở phía sau mục tiêu, không che nhân vật/vạch báo), camera kéo xa nhẹ (+20%, chỉ của mình, theo công tắc Rung màn hình). Nguồn `tools/vfx/recipes_d.py`; hình mới `dragon` (ống thon cuộn xoắn) và `statue` (tròn xoay), sự kiện `camera`.
- Kiếm tu, Vạn Kiếm Quy Tông: **Thanh Long** lam ngọc cuộn quanh người (đầu tinh thể, sừng vàng), trên nền mưa kiếm + chém dọc cũ.
- Hộ pháp, Kim Cương Bất Hoại: **Kim Thân La Hán** vàng kim ngồi đài sen, hai tay chắp ấn, hai vòng hào quang + 12 tia sáng.
- Đan sư, Hồi Thiên Đan Lộ: **Phượng hỏa** ngọc lục–đỏ son hai cánh xòe quạt, đuôi, đầu; sen ngàn cánh ở nền sẵn có.
**Vòng 3 (đổi cách):** La Hán và Phượng chuyển sang **thẻ 2D quay mặt về camera** (kiểu `card`, `render/vfx/cards.ts`): tranh vẽ bằng nét thủ tục trên canvas (không có công cụ Codex image trong phiên này nên không dùng ảnh ngoài; không Tripo/credit): La Hán ngồi kiết già nửa thân chắp ấn + hào quang 28 tia + đài sen; Phượng dang cánh hai tầng lông, đuôi bảy lông có vòng mắt. Shader 3 tầng màu theo nhánh + điểm nhấn (vàng / đỏ son), mọc từ dưới lên và dissolve ra có mép sáng, kèm hạt kim quang / lông vũ. Cao ~6,5 m (~3,7× người), đặt 6,5 m phía trước cùng hướng nhìn nên canh giữa người từ camera sau lưng. Rồng giữ nguyên. Hình `statue` cũ không còn dùng.
**Vòng 2 (sau soát):** rồng dựng lại có sọ, mõm, hai sừng cong (gân vàng), hai râu, vây lưng; cao ~8,5 m (~5× người), quấn quanh người rồi một con thứ hai lao từ trên xuống mục tiêu. La Hán to hơn (cao ~9 m), đặt 13 m phía trước. Phượng: cánh 10 lông mỗi bên cinnabar/ngọc xòe lớn, thân + đầu + đuôi. Camera kéo xa giảm còn +12%. **Cột đen che camera** là do chỗ đứng quay trong công cụ (sát cổng tông môn); công cụ nay quay ở giữa sân; camera game thật vẫn dùng cơ chế mờ vật cản sẵn có (`updateOcclusion`), chưa thêm né va chạm riêng.
Hạn chế: Phượng còn mảnh, cánh nhạt (lông kite mỏng), chưa ra dáng chim rõ như rồng và La Hán; cần vòng chỉnh sau khi duyệt video. Hộ pháp/Phượng chỉ thấy tốt khi camera ở sau lưng ở khoảng cách xa (≥ ~14 m).
Sân 50 người (`--crowd 50`, 4 chiêu tối thượng/AoE): draw p50/max 173/178 (< 300), tam giác max 718k, khung ms p50/p95/p99 8,3/12,2/32,7 (p99 xấu: cần V6), lưới FX sống max 2.634.
Cascadeur: `cascadeur.md`. Video webm nam/nữ: artifacts `v4/`.
PR 2 (đột phá, độ kiếp, ngự kiếm/xuất khiếu/thuấn di) làm riêng.

## PR 2: đột phá, độ kiếp, di chuyển
Chỉ thêm lớp hình, không đổi luật; timeline kích hoạt theo S.FX với id giả `fx_*` (nguồn `tools/vfx/recipes_e.py`): trường `when` chọn timeline theo cảnh giới (`tb`/biến thức), nên ba cảnh giới có ba bảng màu.
- **Đột phá** (`ascend`): `fx_dotpha_tc` (vàng kim + lam), `_kd` (cam đan), `_na` (tím trắng): vòng triện văn lõi sẫm, sóng gợn, ba dải xoắn (lõi sẫm / thân / viền), vòng gai, hạt bay lên, chớp 100 ms; Kết Đan/Nguyên Anh thêm hai vòng hào quang đứng sau lưng. Thay hình cột sáng cũ.
- **Độ kiếp** (`tribstart`, Trúc Cơ/Kết Đan/Nguyên Anh): vòng trận lôi văn + nứt đất + gai + sét mảnh nối tiếp (3–4 tia, sự kiện `bolt`); mây kiếp cũ giữ nguyên.
- **Xuất khiếu** (`soul_out`/`soul_in`), **thuấn di** (`blink`): lớp thêm lên hình `SoulVis` cũ. **Ngự kiếm**: vòng ấn + kiếm hóa quang dưới chân khi bật bay (client dự đoán, `toggleFly`).
- Hạ tầng: trần decal 8 s, trần chớp vẫn ≤ 0,3, burst < 120 ms (test).
Hạn chế: ngự kiếm chỉ có hiệu ứng lúc cất cánh (chưa có vệt kiếm khi bay, vệt cũ giữ); cột sáng đột phá còn mảnh trong khung quay; các hiệu ứng nhỏ (thuấn di, ngự kiếm) hơi khiêm tốn ở camera xa. **Chưa vẽ lại tranh La Hán/Phượng bằng Codex image** (hết thời gian), tranh thủ tục hiện tại giữ nguyên. Chưa đo sân 50 người cho PR này (cảnh lớn hiếm, một người chơi mỗi lần).
