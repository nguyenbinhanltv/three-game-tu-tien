# Lạc Kiếm Tông: bản đồ tiểu cảnh (Chân Cảnh M1+M2, pilot)

Camera chéo khóa góc (FOV 32°, pitch 52°, cách ~20 m, yaw Vân Lam 30°) chỉ thấy một khung **~20 × 12 m**. Mỗi khung phải có
**điểm nhấn** (nhìn là nhớ), **tiền cảnh** (vật gần camera, tự mờ khi che người/mục tiêu) và **đáy** (nước, sương, vực).
Người chơi nhìn khung đó ~90% thời gian, nên bản đồ được lập theo khung, không theo công trình.

Mã nguồn: `apps/client/src/game/world/lacKiemScenes.ts` (`SCENES`, tọa độ tương đối tâm tông môn). Chỉ để nhìn: không va chạm,
không ảnh hưởng server, tất định, tắt bằng `?scenes=0`. Năm mesh gộp (đá, gỗ/vải, đèn phát sáng, nước, sương) cho cả bản đồ.

## Bảng tiểu cảnh

| # | Tiểu cảnh | Tâm (x, z) | Điểm nhấn | Tiền cảnh (tự mờ) | Đáy |
|---|---|---|---|---|---|
| 1 | Cổng Bài ngoài sơn môn | (0, 120) | Cổng bài sơn son hai tầng ngói, mở 9 m (đi xuyên qua được) | Hàng 10 đèn đá dọc lối, đá tảng | Lối đá + cỏ |
| 2 | Ao Sen | (−62, 66) | Ao tròn r 8,5 m, lá sen, hoa sen, bia khắc | Viền đá, đèn đá | Nước gợn |
| 3 | Kiếm Bia Viên | (66, 64) | Bia đá giữa 5 thanh kiếm đá cắm nghiêng (3–4,6 m) | Đèn đá, đá tảng | Cỏ + bóng kiếm |
| 4 | Lối Men Vách | (−92, 54) → (−140, 70) | Đường phiến đá bậc thang bám sườn, cọc + dây lan can phía dốc | Đá tảng ven đường, đèn đá | Sườn dốc xuống hác |
| 5 | Cầu Treo Vân Hác | (−146, 91), dài 44 m | Cầu treo hai tháp son, sàn ván võng, dây lan can | Chính cầu (mờ khi che người) | Hác sâu ~11 m + sương thấp |
| 6 | Thạch Lâm | (96, −8) | Cụm đá tảng + bia nghiêng | Đèn đá | Cỏ |

Điểm chụp chuẩn (`pnpm shots tieucanh`): `congbai (0,114)`, `aosen (−60,58)`, `kiembia (66,58)`, `loivach (−116,62)`, `cautreo (−150,84)`, `thachlam (96,−8)`.

## M2: chiều sâu dọc, vì sao chọn như vậy

Địa hình Lạc Kiếm là lòng chảo: sân phẳng r 95 m, quanh là đồi dâng cao dần, **không có vực thật**. Quét heightmap (độ sâu so với hai bờ cách 44 m) chỉ thấy
vài hác tự nhiên sâu 10–30 m ở vành ngoài. Chọn hác tại (−146, 91): sâu ~11 m (hác 26 m sâu quá, cầu nằm ngoài khung camera 12 m).

- **Cầu treo là cầu cao nối hai bờ, người đi dưới hác được** (không có mặt cầu đi được). Va chạm/heightmap không đổi.
- **Lối men vách** bám địa hình (đi được), dẫn từ sân tới đầu cầu.
- Cầu thật sự đi được cần đổi địa hình dùng chung (`bridges` của `terrain.ts` hiện chỉ cho level đảo) hoặc khoét hác trong shared:
  đây là quyết định cho người dùng (xem báo cáo PR), không làm trong pilot.

## Sight fade (bắt buộc)

Mọi vật cao dùng `withSightFade` (đèn phát sáng cũng vậy): mờ khi nằm giữa camera và người/mục tiêu. Sương hác mềm mép theo độ sâu (`viewportLinearDepth`),
không lộ đường cắt với địa hình.

## Ngân sách

+5 draw call, ~<60k tam giác (test `lacKiemScenes.test.ts`). Số đo thật trước/sau: xem PR.
