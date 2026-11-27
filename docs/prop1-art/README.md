# PROP-1 — "Thiên Công Khai Vật": bộ đồ trang trí cho 5 bản đồ

Kế hoạch đã duyệt: ~80 món (76 asset = 38 món × 2 biến thể), phong cách B bán tả thực, dựng bằng bộ kit Blender của MAP-1 (`tools/blender/thien_cong_kit.py`), rải có kiểm soát vào Vân Lam, Đoạn Mạch, Vân Hải, Thiên Khuyết, Bắc Hoang. Chia PR theo nhóm.

| Nhóm | Món (mỗi món 2 biến thể) | Bản đồ dùng |
| --- | --- | --- |
| `tong_mon` | đỉnh lư đồng, giá kiếm, bia khắc chữ thư pháp, cờ phướn, lò luyện đan, chuông đồng, trống, đèn đá, lư hương, bàn ghế đá | Vân Lam (sân tông môn, sơn đạo), Đoạn Mạch (tàn tích), Vân Hải (Phù Đảo Các), Thiên Khuyết (đại lộ, điện tiền) |
| `cho_lang` | sạp hàng, vò rượu, giỏ thuốc, lồng đèn giấy, xe kéo, thùng gỗ, hàng rào tre, giếng nước, lu nước | Vân Lam (Chợ Sơn Môn, Thôn Thanh Phong), Vân Hải, Đoạn Mạch (đoàn buôn bỏ lại), Bắc Hoang (đoàn tiếp tế bị phá) |
| `hoang_da` | đá linh khí, tre, cây cổ thụ uốn lượn (thẻ alpha), linh thảo/nấm phát sáng, mộ cổ, cột đá đổ, rễ cây, khúc gỗ khô | cả 5 bản đồ theo khu |
| `tran_phap` | trận đồ khắc sàn, cột trận, tế đàn, bia trận, linh thạch | bệ cổng bí cảnh, điểm đáng chú ý, đại lộ Thiên Khuyết, đảo Vân Hải |
| `di_vuc` | xương cự thú thu nhỏ, cột tà màu tím, tinh thể tím, chân đồng đổ nát phương Tây, cờ rách | Bắc Hoang |

## Cách dựng

- Mỗi món là hàm `fn(b, v)` trong `tools/blender/prop_tc_<nhóm>.py`, gốc ở đáy, mặt trước +z; `v` chọn biến thể. Vật liệu PBR Poly Haven CC0 nướng vào texture 512 (đá, gỗ, đá nứt, đá đen…), vật liệu phát sáng (`glow_*`) cho linh thảo, nấm, tinh thể, rune; lá cây là thẻ alpha (`alphaMode MASK`).
- Danh mục + vòng va chạm: `tools/blender/prop_tc_items.json`. Mỗi asset ≤ 5000 tam giác LOD0 và 2 LOD thu nhỏ (lớp `prop` của `assets/budgets.json`).
- Ảnh 360° từng món: `blender --background --python tools/blender/prop_tc_preview.py -- assets/build/raw <thư mục ra> <nhóm> [cỡ]` (ảnh duyệt để ở artifact phiên, không commit).

## Cách bày

`packages/content/src/thienCongScenes.ts` khai các cảnh (tâm, bán kính, số lượng từng món); `gen-thien-cong.ts` rải theo seed cố định và ghi `packages/shared/src/props.thiencong.ts`. Luật rải:

- chỉ đặt chỗ đi được: trên mặt nước/ngoài đảo, độ dốc quanh chân lớn, ngoài vùng chơi đều bị loại;
- giữ nguyên đường chính (hành lang sân tông môn → sơn đạo → thung lũng, `propScatter.test.ts`), không đè prop đặt tay, điểm đáng chú ý, cổng truyền tống, trận truyền tống, điểm hái, NPC, điểm xuất hiện;
- món có va chạm (vòng tròn, món dài như rào/sạp có nhiều vòng) không nằm trong bãi quái hay điểm tinh anh; món không va chạm (cỏ, nấm, khúc gỗ) được vào bãi quái để khu săn không trống trơn;
- vòng va chạm cộng vào địa hình qua `registerTerrain`, client và server thấy giống nhau; `pnpm map:report --level <id>` vẫn 0 chỗ kẹt.

Cờ `?tc=0` (ẩn hình để so) đã gỡ ở V4 (28/11/2026).

## Kiểm

`pnpm shots propstc --out <thư mục> [--levels ...] [--groups ...] [--size 1920x1080]` chụp trước/sau + đo draw call, tam giác, ms khung từng cảnh. Test: `packages/content/src/thiencong.test.ts` (id có asset nguồn, trong vùng chơi, không đè điểm nhấn/bãi quái/cổng).

## Tiến độ theo PR

- PR1 (#325): hạ tầng + `tong_mon`. PR2: `cho_lang` (chợ Sơn Môn bày tay hai dãy sạp trên thềm phẳng trước cổng, thôn, đoàn buôn bỏ lại). Món nhỏ (vò rượu, giỏ thuốc, thùng gỗ, lu nước, lồng đèn, rào tre) chỉ bày một biến thể và dùng ít vật liệu để giữ draw call; lưới ô prop lệch nửa ô (`props.ts`) để trục sân x = 2048 không tách mỗi loại prop thành nhiều InstancedMesh.
- Bộ sinh duyệt theo thứ tự nhóm, nên bật thêm nhóm không đổi toạ độ nhóm trước (kiểm bằng `gen-thien-cong.ts --check` và so với file của PR trước).
- PR3: `hoang_da` (đá linh khí, tre, cổ thụ thẻ alpha, linh thảo/nấm phát sáng, mô cổ, cột đá đổ, rễ cây, khúc gỗ). Rải theo cụm (`clusters` trong cảnh) để lùm cây/bãi đá đông ở từng chỗ. Kích thước chân (`foot`) nằm trong `prop_tc_items.json` (bộ sinh không còn đọc file build không commit) và bộ sinh tránh tâm bãi quái, vùng quanh điểm đáng chú ý (`levelcheck`).
- PR4: `tran_phap` (trận đồ khắc sàn, cột trận, tế đàn, bia trận, linh thạch). Chuẩn v3: đá PBR có rãnh khắc chìm, chữ Việt thư pháp, nét phát sáng mảnh bão hòa (hổ phách/ngọc lục/lam đậm), không pastel. Bệ cổng bí cảnh Vân Lam bày tay: vòng sáu cột trận quanh trận truyền tống `tp_cong`, hai bia trận, bốn linh thạch, trận đồ phía bắc.
- PR5: `di_vuc` (xương cự thú thu nhỏ, cột tà màu tím, tinh thể tím, chân đồng đổ nát phương Tây, cờ rách) cho Bắc Hoang. Đá đen PBR, tinh thể gradient tím trầm (`propCrystal`), đồng cổ có patina, cờ rách lắc theo gió; rải theo cụm chỉ cho nhóm này (`clusterGroups`). Lưu ý COL-1: sau khi đổi prop hoặc hàm rải phải chạy `pnpm colliders:lib && pnpm colliders:bake`.
