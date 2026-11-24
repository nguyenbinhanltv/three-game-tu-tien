# P2-E4: camera theo khu, nhãn/thanh máu kẹp cỡ, sửa vân ô lưới

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/p2-e4/<file>`.

Ảnh chụp bằng GPU thật (RTX 3060 Ti, Chrome), 1280×720, tắt tiếng, `pnpm e4shots` (`tools/perf/src/e4shots.ts`).
`truoc-*` là `?e4=0` (tắt camera theo khu và kẹp cỡ nhãn); `sau-*` là bản mới. Tên tệp: `<truoc|sau>-<webgpu|webgl2>-<preset>-<điểm>.jpg`.

## 1. Camera theo khu (`game/camZones.ts`) — đã gỡ (B1, 2026-11-24)
Mỗi vùng cho (nhân khoảng cách, cộng góc ngẩng, FOV), trọng số giảm mượt (smoothstep) từ trong ra ngoài ranh, engine làm mượt thêm theo thời gian (`easeZoneCam`, ~0,45 s) nên đi qua ranh không giật.

| Vùng | distMul | pitch | FOV |
| --- | --- | --- | --- |
| Mặc định | 1 | 0 | 55 |
| Sân Lạc Kiếm Tông | 1,25 | +0,04 | 58 |
| Kiếm Trủng (lòng chảo) | 0,74 | +0,05 | 50 |
| Biển Hồ Sương Mù | 1,18 | +0,02 | 60 |
| Rừng | 0,88 | +0,05 | 54 |
| Thung lũng | 1,08 | 0 | 56 |
| Bệ cổng / sườn núi cao | 1,15 | +0,03 | 59 |

Nhân lên khoảng cách người chơi tự đặt (lăn chuột/phím vẫn hoạt động), cộng với khung thẻ chương. Trong cảnh điện ảnh (`cine.active`) và độ kiếp, đích về mặc định nên không phá cutscene B1–B5; làm mờ vật che (`occlusion.ts`) không đổi. `?e4=0` tắt.
Ảnh: `*-san`, `*-kiemtrung`, `*-ho`.

## 2. Nhãn tên, thanh máu, số sát thương
- Tên (sprite) và thanh máu (`HeadBars`) là vật thể thế giới nên camera sát thì phình to che nhân vật. Nay rộng trên màn hình bị kẹp: nhãn 140–300 px (tấm nhãn, chữ chiếm ~62%), thanh máu 44–120 px (boss 100–300) (`game/screenFit.ts`, `fitFactor`).
- Chống chồng nhãn: duyệt theo ưu tiên (mình, mục tiêu, rồi gần → xa); nhãn trùng hộp màn hình với nhãn đã đặt thì ẩn (`EntityManager.fitLabel`).
- Số sát thương: nếu điểm sinh nằm trong hộp tên, nhấc lên trên hộp đó một lần (không nhảy lúc đang bay).
Ảnh: `*-nhan_sat` (camera 3 m), `*-nhan_dong` (6 sói).

## 3. Lỗi đồ họa
- **Vân ô lưới/sọc kẻ ô trên sườn đồi** (tái hiện được: `truoc-webgpu-medium-matroi_san.webp`, nhìn lướt ở sườn cạnh sân): do lớp lát đá (mạch vữa tương phản cao) bị chiếu từ trên xuống lên mặt dốc và texture mảng không có mip đủ. `?ground=0` làm vân biến mất (`chan-doan-ground0-matroi_san.jpg`). Sửa trong `render/materials/ground.ts`: mặt nạ lát đá tắt theo độ dốc, lớp lát đá hòa về màu đỉnh lưới từ ~20 m hoặc khi nhìn lướt (n·v < 0,35), thêm hòa nhẹ cho mọi lớp khi nhìn lướt. Kết quả `sau-*-matroi_san.webp`.
- **Mặt trời có vành, vẽ đè lên núi**: KHÔNG tái hiện được trên bản `main` (preset `day`, độ cao nắng 36°). Đã thử nhìn thẳng mặt trời từ sân, Kiếm Trủng, chân núi, bờ hồ, và các điểm tìm bằng quét địa hình sao cho đỉnh núi cắt đúng độ cao mặt trời (1580,2140): trời vẽ trước (`renderOrder -10`, không ghi/không thử độ sâu) nên núi che đúng (xem `truoc-webgpu-medium-sun_b.webp`, mặt trời lấp ló sau sườn), cả WebGPU lẫn WebGL2. Đã làm: bỏ số mũ 48 tách thành vành riêng quanh đĩa (quầng liền một dải `pow(sd,6)` + `pow(sd,90)`, đĩa mép mờ rộng hơn) trong `render/sky.ts`. Hai thứ có thể bị nhầm là mặt trời có vành: đĩa cổng ra Kiếm Trủng (đĩa vàng lớn trong khung cổng đá, `truoc-webgpu-medium-kt_sun2` đã bỏ khỏi thư mục) và các đĩa sương/hạt phóng to khi sát camera (ảnh `sun_a`, `sun_b`): hạt nay mờ dần khi cỡ vượt 35–80% khoảng cách tới camera (`render/vfx/particles.ts`). Nếu lỗi còn, cần ảnh chụp/toạ độ và preset.

## Đo
`pnpm bench:client` (WebGPU + WebGL2 × Thấp/Vừa/Cao): draw call (max 156 ở rừng/Cao), tam giác (max 859k), texture 450 MB, đều trong ngân sách; draw call không đổi so với `?e4=0`. WebGL2/Cao thường báo vượt CPU (fps ~30–40) cả ở `?e4=0`, nên không do thay đổi này (GPU RTX 3060 Ti bị tranh chấp, tồn đọng cũ).

## Ảnh then chốt

- [`sau-webgl2-low-matroi_san.webp`](sau-webgl2-low-matroi_san.webp)
- [`sau-webgl2-medium-matroi_san.webp`](sau-webgl2-medium-matroi_san.webp)
- [`sau-webgpu-medium-matroi_san.webp`](sau-webgpu-medium-matroi_san.webp)
