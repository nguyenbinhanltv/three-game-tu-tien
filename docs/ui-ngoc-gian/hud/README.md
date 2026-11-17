# UI-2: HUD sơn mài "Ngọc Giản Kim Văn"

Thay vỏ toàn bộ HUD trong game sang chất liệu **sơn mài huyền** của bộ `ui/ngj/`. Bám mockup `docs/ui-ngoc-gian/mock-hud-*.webp`. Giữ nguyên bố cục, kích thước ô, hành vi và phím tắt (Z F B C K P L H O, 1–9, Shift+số). Chưa đổi các bảng lớn (UI-3).

`?ngj=0` quay về HUD cũ (cùng bản build) để so ảnh; mặc định là HUD mới. Mã: `apps/client/src/ui/ngj/hud.css` (mọi quy tắc dưới `:root[data-ngj='1']`), thay đổi JSX nhỏ ở `Hud.tsx` và `minimap/Minimap.tsx` (chỉ khi `ngjHud`).

## Đã đổi

| Khối | Thay đổi |
| --- | --- |
| Khung nhân vật | Sơn mài + chỉ vàng đôi + góc sao/trăng; ô chân dung bát giác (icon nhân vật, **số tầng/kỳ bằng chữ triện**: `十二` = tầng 12), thanh máu / linh lực / tu vi có đầu mút (thoi vàng trái, hạt ngọc phải) |
| Thanh chiêu | Ô bát giác, viền theo màu nhánh công pháp (`--mc`), nền nâu đen, hồi chiêu giữ vòng linh văn cũ; hàng bậc cao và ô 9/T/V cùng kiểu |
| Thanh chức năng | Nút tròn vàng + **icon nét vàng** (`SysIcon`) + nhãn + chip phím; giữ `data-bag` cho hiệu ứng nhặt đồ bay vào túi |
| Bản đồ nhỏ | Vòng la bàn mảnh (hai vành vàng), nút phóng/xoay tròn; tên vùng là **bảng tên (Cartouche) theo bản đồ** (Vân Lam núi, Đoạn Mạch cốc, Vân Hải đảo mây) |
| Theo dõi nhiệm vụ | Thẻ sơn mài có tiêu đề "Nhiệm vụ" kèm icon, giữ chọn nhiệm vụ theo dõi |
| Chat | Nền sơn mài, viền vàng, màu dòng theo loại; vẫn mờ dần khi nhàn rỗi |
| Chú giải (tooltip) | Sơn mài, góc vát, đường kẻ vàng dưới tên; áp cho cả HUD và bảng (dùng chung `.k-tip`) |
| Thông báo (toast) | Tấm sơn mài viền vàng vát góc |
| Thanh máu boss, mục tiêu | Khung có góc hoa văn, tên boss chữ vàng, thanh 10 vạch có đầu mút, chân dung vát |

Không đổi (có chủ ý): bảng tên trên đầu nhân vật/quái/NPC (vẽ trong WebGL qua atlas chữ, giữ đọc rõ trên mọi nền; để dành khi làm lại headBars), mọi bảng lớn, thẻ chương, cảnh điện ảnh, độ kiếp.

## Ảnh trước/sau

Cùng góc, `?mute=1`, tài khoản thử, 1080p và 1440p: `<cảnh>-truoc-<độ phân giải>.jpg` (HUD cũ) và `<cảnh>-sau-…` (HUD mới). Cảnh: `lac_kiem` (sân Lạc Kiếm Tông, có nhiệm vụ), `doan_mach`, `van_hai`, `boss` (Hàn Giao, mục tiêu đã chọn), `dem` (`?mood=night`). Chụp lại: `pnpm --filter @dtl/perf shots:ui2 --out <thư mục tuyệt đối> [--scenes a,b]`.

## Đo (1080p, 5 giây mỗi lượt, CDP; `ui2-metrics.json`)

| Cảnh | Task ms/khung trước | sau | Δ | Layout+style ms/khung trước | sau | Draw call trước / sau |
| --- | --- | --- | --- | --- | --- | --- |
| lac_kiem | 7,08 | 7,63 | +0,55 | 0,026 | 0,037 | 114 / 116 |
| doan_mach | 6,64 | 5,82 | −0,82 | 0,142 | 0,070 | 65 / 55 |
| van_hai | 4,42 | 5,23 | +0,81 | 0,015 | 0,020 | 118 / 121 |
| boss | 6,02 | 4,62 | −1,41 | 0,169 | 0,100 | 112 / 113 |
| dem | 5,66 | 5,33 | −0,33 | 0,018 | 0,019 | 114 / 116 |

Đọc: tổng task mỗi khung dao động ±1 ms giữa các lượt (cảnh 3D, hạt, quái khác nhau) nên không tách được phần HUD; phần chắc chắn là **layout + style của trang ≤ 0,17 ms/khung ở cả hai bản** và HUD mới không thêm JS theo khung (chỉ CSS/SVG tĩnh + vài phần tử). Draw call khác nhau vài cái giữa hai lượt là do cảnh (quái/hạt), không do HUD (HUD là DOM, không phải draw call 3D). Chưa chạy `bench:client` đầy đủ.

## Giới hạn / việc còn lại

- Chân dung nhân vật là icon `character`, chưa có khuôn mặt (mockup có); chờ tranh chân dung ở UI-4.
- Bảng tên trên đầu giữ nguyên.
- Tooltip đổi sang sơn mài cho cả bảng lớn (còn nền xanh đêm cũ) nên tạm lệch tông cho đến UI-3.
