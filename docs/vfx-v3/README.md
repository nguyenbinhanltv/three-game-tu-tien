# VFX-V3: Hộ pháp (Bất Động Kim Thân) + Đan sư (Thanh Mộc Đan Kinh)

20 chiêu, mỗi chiêu một timeline `packages/content/data/fx/<id>.json` sinh bằng `python tools/vfx/gen-fx-kiem.py` (công thức `tools/vfx/recipes_c.py`). Phong cách V1/V2 (lõi sẫm + bóng, ba tầng màu, khựng, dư âm tan nhanh, chớp < 120 ms); màu theo nhánh từ `render/vfx/palette.ts`: Hộ pháp hổ phách/vàng kim, bóng nâu; Đan sư ngọc lục, điểm đỏ son.

**Hộ pháp** (gai đá trồi nối tiếp, ấn nứt đất, chuông vàng): Trấn Sơn Ấn (ấn đóng đất, vòng chấn tới mép bán kính khiêu khích, gai đá vây), Thiết Quyền Chấn Địa (đập đất, nứt, mười gai tỏa tròn, khựng 80 ms), Kim Chung Trấn (ba vòng chuông dâng từ chân lên đầu), Sơn Nhạc Hóa Thân (gai núi ôm thân, nứt đất), Kim Cương Bất Hoại, Ảnh Thiết Thân, Thuấn Di Hộ Thể, Thiên Kim Pháp Tướng (tối thượng), hai chiêu lướt Thiết Bích Xung / Dịch Sơn Xung.
**Đan sư** (sen, lá, dải lụa, đan hỏa): Hồi Xuân Quyết, Hồi Thiên Đan Lộ (sen khổng lồ, tối thượng), Mộc Linh Trận, Dược Vũ (mưa lá rơi vào vùng), Ngưng Đan Hộ Thế, Đan Hỏa Phong Tràn (cầu đan hỏa đỏ-lục xoáy), Ảnh Dược Hóa Thân, Thuấn Di Cứu Viện, Thiên Đan Pháp Giới (tối thượng), lướt Lưu Hương Bộ.

**Khung:** hình `lotus` ghép từ `kite` (hai lớp cánh bung ra), xoay `rot` theo thứ tự yaw→pitch (`YXZ`, giúp cánh nghiêng ra ngoài; không đổi chiêu cũ vì chúng chỉ dùng một trục), chiêu lướt kích hoạt theo S.FX có lọc công pháp (`method`), nên ba công pháp cùng dùng `dash` không giẫm nhau.
**Sơn Nhạc Hóa Thân (sửa):** chụp lại cả nam và nữ ở cùng điều kiện: không còn màn tối. Ảnh tối trước đây là lỗi công cụ chụp (camera đặt vào vị trí đứng thứ ba bị che), không phải lỗi chiêu; công cụ nay chụp mỗi giới ở vị trí đầu. Thân gai núi lui ra bán kính 1,9 để không che nhân vật.
**Animation:** Hộ pháp dùng sẵn giọng `hp` nặng, hạ hông 0,19–0,22 (đã ở trần dải đo K-5; thử cường điệu thêm vượt dải nên giữ nguyên). Đan sư: Hồi Xuân Quyết cường điệu uyển chuyển hơn (×1,4), Hồi Thiên ×1,15; các chiêu còn lại giữ pose E2-G riêng từng chiêu. `hitAt` không đổi.

## Sân đông (50 người giả, 10 chiêu Hộ pháp/Đan sư, WebGPU, Cao, 15 s)
draw p50/p95/max 136/137/138 (< 300); tam giác max 418k; khung ms p50/p95/p99 8,2/13,8/24,3 (khoảng giữa khung, không phải CPU thuần); lưới FX sống max 647. Mức p99 có gai 24 ms: cần soát tiếp ở V6 bằng `bench:crowd`.

Ảnh dãy khung mới (nam) và cũ: `anh/`; video webm ở artifacts.
