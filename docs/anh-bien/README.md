# Nhật Thực Kiếp (Anh Biến, DV-3K)

Kiếp cuối chương 5 (`docs/DIVUC_DESIGN.md` mục 2 và 3): Hóa Thần đại viên mãn (cấp 31) → **Anh Biến sơ kỳ (cấp 32)**, 90 giây, room riêng, tổ đội ≤ 4 (hộ pháp).

## Đã làm

- **Thang cấp (DV1-D tối thiểu)**: `MAX_LEVEL` 28 → 32, `ANH_BIEN_LEVEL`, `xpNeed` cấp 28–31 = 234.000 / 242.000 / 250.000 / 257.500 (tích lũy 983.500 ≈ 10 giờ), `realmMul` Anh Biến 7,8, `realms.json` + chuỗi `realm.29–32`, bình cảnh thêm 29 và 31 (31 là đại viên mãn, vào `PEAK_LEVELS`), mã `?realm=ht1…ht4|ab`. Cấp 28 trước đây là trần `99.999.999` nên không cần migration.
- **Dữ liệu** `tribulations.json` mục `anh_bien`: `level: do_kiep_bac_hoang` (trường mới, mặc định `do_kiep`), `enabled: true`, vật phẩm `itm_anh_bien_lo`, ba pha `dan_loi` (0–25) / `nhat_thuc` (25–65) / `han` (65–90).
- **Sân kiếp riêng** `levels/do_kiep_bac_hoang.json` (địa hình `bac_hoang`, quanh Trấn Giới Đài, mood `rift`). Room tên `tribulation-do_kiep_bac_hoang` (`tribRoomNameOf`, `defineTribulation`); vé theo level của kiếp (`tribLevelOf`); client suy level từ tên room.
- **Cơ chế** (`apps/server/src/game/tribanh.ts`, server giữ hết):
  - `dan_loi`: năm Trấn Giới Bia (thực thể của kiếp, ngũ giác bán kính 16 m quanh tâm sân). Tia nhắm chỗ người độ kiếp đứng, rơi sau 1,4 s; rơi trong 4 m quanh bia chưa sáng thì bia sáng.
  - `nhat_thuc`: Nhật Thực Dực Chủ (`boss_nhat_thuc_duc_chu`, quái thật của sim, không rơi đồ/tu vi) dập bia sáng mỗi 9 s (niệm 2,5 s). Thiên lôi rơi quanh người độ kiếp cũng đánh cả hắn: đứng trong tầm tia thì hắn mất thế 4 s và chú bị phá.
  - Pha 3: `final.gateSteles = 3`: từ ba bia sáng, tia cuối đánh vào khe (FX `rift`, không vào người); dưới đó là tia khóa mệnh 75% như Thiên Nhân Kiếp (hộ pháp chắn 25%).
- **Phần thưởng**: đường chung `endTribulation` (cấp 32, tu vi 0, `questEvent(breakthrough)`); vật phẩm đột phá bị tiêu qua `c.tx` (sổ cái), hoàn lại nếu trụ qua 45 s. Thất bại mất 15% tu vi cấp.
- **Vật phẩm**: `itm_anh_bien_lo` (chế ở npc_duoc_su, `rcp_anh_bien_lo`: 3 Kim Dạ Miện Phiến, 10 Tẫn Giác, 5 Tinh Quang Mặc, 20 Yêu Đan, 12.000 linh thạch), `itm_kim_da_mien_phien` (mới) rơi từ `boss_kim_da_ma_hau` (100%) và `boss_tan_hoa_kiem_co` (60%), Tẫn Giác rơi từ cả hai.
- **Client**: FX `steles` (năm cột sáng, `vfx.steleRing`), `rift` (vết nứt khép, `vfx.riftVein`), HUD "Trấn Giới Bia n/5", thẻ chương `ascend_ab`, skin `boss_nhat_thuc_duc_chu` (dùng lại model Thủ Khích Dực Chủ nhuốm vàng).
- Công cụ: `pnpm shots anhbien --out <thư mục tuyệt đối>` quay webm + dãy khung; `/gm trib anh_bien`.

## Lệch thiết kế / để lại

- **Anh thân** (phím X đánh được 12 s): **để lại** (việc sau, đã chốt ở thiết kế mục 2.4). Cấp 32 hiện chưa mở thêm cơ chế nào.
- **Tịnh Quang đỡ một đòn mỗi 20 s**: làm gần đúng bằng hồi 15% khí huyết tối đa mỗi 20 s (không chặn từng đòn), chưa có NPC Tịnh Quang trong sân.
- **Nhiệm vụ chương 5**: `q5_anh_bien` có đích `breakthrough anh_bien` thật nay (kiếp đã có dữ liệu), nhưng chuỗi `q5_kim_da` (phó bản Kim Dạ Cung) và `q5_ngu_bia` (Huyết Giác Ma Tướng) vẫn thiếu dữ liệu nên bốn nhiệm vụ đó (kèm `s5_cham_ba`) khóa bằng `minLevel` 33 > `MAX_LEVEL`. Khi dữ liệu thật vào thì hạ về 31–32 (và `PENDING_OBJ` ở `check.ts` gỡ tiếp).
- Nghệ thuật Bắc Hoang (`bhart`, vệt nứt `riftVeil`, cây chết) chỉ bật ở level `bac_hoang`, chưa bật ở sân kiếp; mood `rift` thuần.
- Boss kiếp dùng quái thường của `monsters.json` với `hpMul` 60 (≈ 35% boss ngoài trời `hpMul` 170); cân lại nếu thử nghiệm với tổ đội đông.
- Bộ kiểm bảo mật `pnpm --filter @dtl/bot-client security`: 99 bài ĐẠT trên server cổng riêng với DB mới; bước cuối (tự dựng server tạm với `GOOGLE_CLIENT_ID`) báo "server tạm không lên" vì môi trường này, không phải lỗi đã được xác định từ thay đổi.
