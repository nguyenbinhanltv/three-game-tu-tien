# E3-L · Tam Trọng Kiếp (Nguyên Anh)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e3l-trib/<file>`.

Dãy khung một lần độ kiếp Nguyên Anh 65 s (`/gm trib nguyen_anh`, chạy bằng `pnpm shots:e3l --out <thư mục tuyệt đối>`, Chrome GPU thật, tắt tiếng, 1600×900). Kiếp chạy ở room riêng `tribulation` (level `do_kiep`); mốc giây tính từ lúc HUD kiếp hiện. Ghi chú thiết kế/triển khai: `docs/EXPANSION_DESIGN.md` mục 10.7.

| Ảnh | Mốc | Nội dung |
| --- | --- | --- |
| `01-pha1-loi-bat-dau` | ~3 s | Pha 1, thiên lôi dày hơn Kết Đan |
| `02-pha1-loi-day`, `02b-pha1-tia-xich-1/2` | pha 1 | Tia xích: hai tia tròn nối bằng vạch sét 16×2,6 m (nhìn từ trên, báo 1,3 s) |
| `03-pha2-hoa-o-bao` | ~19 s | Pha 2: lưới 4×4 ô, ô sắp cháy đỏ lên |
| `04-pha2-xuat-khieu` | ~21 s | Bấm X: bóng nguyên anh mờ lơ lửng trên thân, HUD đếm 6 s |
| `05`, `06` | pha 2 | Ô lửa cháy, ô nặng nhất không rơi vào ô thân đứng khi đang xuất khiếu |
| `07-pha3-tam-ma-cat-canh` | ~43 s | Cắt cảnh nhìn xuống chỗ Tâm Ma Ảnh sắp hiện (tông tím trầm) |
| `08-pha3-tam-canh-bong` | ~47 s | Tâm Ma Ảnh tầng 25, thanh tâm cảnh ở HUD |
| `08c`, `08d` | pha 3 | Cận cảnh Tâm Ma Ảnh (hai góc): bản sao tối màu của người chơi, viền tím/đỏ sẫm, vành tím + vành đỏ nở nhịp dưới chân (`Vfx.tamMaAura`), không lóa |
| `08b-pha3-tam-ma-ra-chieu-1/2` | pha 3 | Bóng dùng chiêu của người chơi: vạch báo 1,1 s |
| `09`, `10`, `11` | cuối | Hết kiếp, vành ascend (rất mảnh, alpha thấp, tan nhanh, nhân vật rõ), thẻ chương Nguyên Anh |

Kiểm tự động: `apps/server/src/game/nguyenanh.test.ts` (dữ liệu/cổng, tiêu vật phẩm, tia xích, xuất khiếu 6 s/hồi 20 s/đẩy ô lửa, tâm cảnh giảm-hồi-về 0 thất bại, hạ bóng thì thành, kéo dài tới 65 s thì thành, chết thì thất bại), `tribroom.test.ts` (vé, hộ pháp, về Vân Lam), `content:check` (thông số cơ chế, kiếp bật phải có vật phẩm + công thức, `peakGated`).

Số đo: security (toàn bộ ĐẠT), `pnpm bots --count 100 --duration 120` (0 thất bại, 0 dòng `refId`, tick p95 4,3–8,6 ms trên 2 room, đỉnh lúc bot tụ đông), `ledger:check` khớp.
