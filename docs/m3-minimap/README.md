# M-3 Minimap mới

Kế hoạch: `ke-hoach-ban-do-minimap.md` mục 3.4. Dữ liệu vùng/bãi quái lấy từ M-1 (`levels/van_lam.json`).

## Đã làm

- **Zoom 3 mức** (120 / 250 / 500 m mỗi chiều): nút `+` / `−` hoặc lăn chuột trên minimap, chuyển mức có nội suy mượt. Nhớ lựa chọn ở `localStorage` (`dtl.mm.zoom`).
- **Bắc lên trên** là mặc định, có chữ **N** ở hướng Bắc; nút thứ ba bật **xoay theo camera** (`dtl.mm.rot`), lúc đó hướng nhìn luôn lên trên và N chạy quanh mép.
- **Nền bản đồ cổ** dựng lúc build: `pnpm minimap:build` (`tools/asset-pipeline/src/minimap.ts`) vẽ từ `heightAt` + `zones` thành giấy ngà, đường đồng mức mực (20 m nhạt, 100 m đậm), hồ có gợn sóng và bờ mực, ranh vùng nét đứt, đường mòn chấm, vòng tông môn/cổng, ngoài vùng chơi gạch chéo tối. Ra `apps/client/public/map/van_lam.webp` (~0,5 MB, 2048 px / 2400 m) + `van_lam.json`. Client nạp lười sau khung đầu, tự cắt mip để thu nhỏ không rỗ nét; chưa nạp xong thì dùng ảnh địa hình cũ (`g.minimap`).
- **Biểu tượng khác hình dạng** (`ui/minimap/sprites.ts`, vẽ sẵn một lần): NPC thoi (màu theo chức năng) + `!` vàng nhận / `?` vàng trả / `?` xám đang làm; quái thường chấm màu theo độ khó so cấp mình (xám ≤ −4, trắng −3..0, vàng +1..+2, đỏ ≥ +3); tinh anh sọ vàng; boss ngôi sao trong vòng lớn; đồng đội chấm lam có số theo thứ tự tổ đội; người chơi khác vòng nhỏ; điểm hái lá xanh; cổng hình cổng; truyền tống trận (hook, chưa có dữ liệu).
- **Mục tiêu nhiệm vụ**: vùng tô mờ nét đứt trên các bãi quái/điểm hái của đích nhiệm vụ đang theo dõi; ngoài tầm thì mũi tên vàng ở mép (đích là NPC: mũi tên tới NPC). Mũi tên tự lệch khi trùng chữ N.
- **Nhấp nháy khi bị tấn công**: người chơi (mình/đồng đội) trúng đòn và quái đánh họ có vòng đỏ nháy 1,6 s (`Game.hurtAt`, ghi ở `onDmg`).
- **Dưới minimap**: tên vùng + khoảng cấp (`Thung Lũng Thanh Phong · NK1–4`); đỏ khi cấp thấp hơn khoảng hợp, xám khi cao hơn; ngoài mọi vùng (tông môn, hồ) chỉ hiện tên.
- **Tooltip** khi rê chuột (kit `k-tip` + `TipCard`): tên, cấp, chức năng/nhiệm vụ, giờ hồi sinh boss.
- Chuỗi qua i18n (`ui.mm.*`), nút dùng `Tooltip` của kit, bỏ focus sau khi bấm để phím game vẫn nhận.

## Hook cho M-2

Server chưa gửi giờ hồi sinh boss. Khi có: `minimapHooks.bossRespawnAt.set(<id quái>, Date.now() + ms)` (`ui/minimap/model.ts`) — biểu tượng boss xám sẽ hiện đồng hồ và tooltip "Hồi sinh sau m:ss". Boss chết mà không còn trong trạng thái room vẫn vẽ ở chỗ sinh. `minimapHooks.teleports` dành cho Truyền Tống Trận (M-4).

## Đo

`pnpm bench:client --renderers webgpu,webgl2 --presets medium` (RTX 3060 Ti, Chrome headless tắt tiếng, 3 điểm):

| | trước (main) CPU p50 / fps | lần đầu bản mới | sau tối ưu |
| --- | --- | --- | --- |
| WebGPU sân tông môn | 3,7 / 111 | 4,2 / 108 | 3,1 / 115 |
| WebGPU rừng | 5,6 / 113 | 5,3 / 107 | 3,8 / 118 |
| WebGPU hồ | 4,1 / 117 | 5,0 / 113 | 3,8 / 117 |
| WebGL2 sân tông môn | 3,7 / 104 | 4,0 / 98 | 3,3 / 106 |
| WebGL2 rừng | 5,0 / 107 | 5,2 / 108 | 4,5 / 111 |
| WebGL2 hồ | 3,8 / 114 | 4,9 / 109 | 4,6 / 111 |

Lần đầu vẽ 30 lần/giây và selector `x,z` chưa làm tròn nên CPU tăng 0,3–0,9 ms. Sửa: vẽ 15 lần/giây, làm tròn selector, bỏ sort mỗi khung. Bench dao động giữa các lần chạy trên cùng máy: 5/6 điểm ngang hoặc tốt hơn bản cũ; riêng WebGL2 hồ CPU p50 cao hơn 0,8 ms (fps 111 so với 114, vẫn trong ngân sách 8 ms), chưa xác định được là nhiễu hay chi phí thật.

## Ảnh

- `zones-x-zoom.png`: Thung Lũng, Rừng Linh Thảo, Bãi Hồ Sương Mù (hàng) × 120 / 250 / 500 m (cột); mũi tên vàng ở mép là mục tiêu nhiệm vụ ngoài tầm (hàng 1) và vòng đỏ là bị quái đánh (hàng 3).
- `boss-ho.png`: boss Hàn Giao giữa hồ ở ba mức zoom.
- `tooltip-npc.png`: tooltip NPC. `nut-xoay.png`: nút xoay đang bật. `nen-ban-do-co.png`: toàn bộ nền bản đồ cổ.
- Chụp trên GPU thật (RTX 3060 Ti) bằng Browser panel của Orchestrator, `?mute=1`.

## Chưa làm

- Chưa có Truyền Tống Trận và bản đồ lớn dùng nền cổ (M-4); bảng `map` vẫn vẽ ảnh địa hình cũ.
- Xoay theo camera đã kiểm bằng test phép chiếu (`ui/minimap/model.test.ts`), chưa chụp ảnh khi camera đã xoay.
