# M-5: điểm đáng chú ý trong năm vùng săn

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/m5-poi/<file>`.

Mỗi vùng săn có một điểm bày bằng **prop sẵn có** (không asset mới, không credit Tripo) và một cột linh quang nhìn từ xa. Ba điểm có người giao nhiệm vụ dạy hệ thống. Nền truyện: linh mạch còn sống dưới đất (`docs/GAME_DESIGN_CORE.md` 2.2).

| Vùng | Điểm (`pois` trong `levels/van_lam.json`) | Prop bày | Người giao |
| --- | --- | --- | --- |
| Thung Lũng Thanh Phong | Miếu Đổ Thanh Phong (2010, 2376) | 3 trụ đá, phiến lát, đá nằm, lư hương, kiếm gãy, tượng thú, đèn | Lão Miếu Công: `q_cuong_hoa` (cường hóa +3) |
| Suối Thanh Khê | Linh Tuyền Thanh Khê (2414, 2443) | 4 đá nằm quanh mạch nước, phiến đá, bia, đèn, dương xỉ | Tiểu Khê: `q_ti_thi` (tỉ thí) |
| Rừng Linh Thảo | Đình Nghỉ Linh Thảo (2451, 2010) | 4 cột đá làm góc đình, phiến lát, lư hương, 2 đèn, trúc | Hạ Thảo: `q_kiem_trung` (vào Kiếm Trủng) |
| Vách Đá Ngọc | Bia Đá Vách Ngọc (2419, 1795) | 3 bia so le, 3 kiếm gãy, đá nằm, đèn | không (lore) |
| Bãi Hồ Sương Mù | Đài Canh Hồ (1490, 2288) | 3 bậc đá, 2 trụ, tượng thú, 2 đèn, lau sậy | không (lore) |

## Cột linh quang
`render/beacons.ts`: một `InstancedMesh` (một draw call cho cả năm cột), vỏ nón cụt hở, shader TSL không texture. Cường độ theo thời điểm (`beaconParams` trong `atmosphere.ts`: sáng sớm 0,5, ban ngày 0,3, đêm 1,0), đỉnh HDR ≤ 2,0 (lõi) và 1,2 (quầng mềm rộng 3×), gần cột mờ còn ~22% để đứng cạnh không bị lóa, không đánh dấu bloom (bloom làm dải sáng mảnh ở xa ra khối chữ nhật). Chỉ hiện ở thế giới chính. `?beacons=0` tắt để so ảnh; `?mood=dawn|day|night` đổi thời điểm khi xem/chụp (client, không lưu).

## Ba nhiệm vụ
Mục tiêu mới `enhance` (một món đạt +3, lấy mức cao nhất), `dungeon` (vào Kiếm Trủng, tính khi vào room bí cảnh), `duel` (hoàn tất một trận tỉ thí: thắng, đầu hàng hoặc hết giờ; hủy giữa chừng không tính). Thưởng nhỏ, không đổi công thức hay số cân bằng. Chuỗi ở i18n `quest.*`, `npc.*`, `poi.*`, `ui.obj.*`; tên điểm và NPC mới ở `glossary.json` (`pois`, `poiNpcs`), `content:check` kiểm khớp.

## Kiểm tra
- `content:check` (mới): mỗi vùng đúng một poi, poi và mọi prop quanh nó cách mép bãi quái ≥ 6 m / 2 m, không sát nước, ≥ 5 prop, va chạm prop ≤ 1,5 m, NPC đứng trong 10 m quanh poi và ngoài bãi quái, tên khớp glossary.
- `pnpm map:report`: quái thường vẫn 353, độ phủ vùng săn 99,6%, **0 chỗ kẹt** (quét cả collider và NPC mới).
- Ảnh `pnpm shots:m5 --out <thư mục>`: `<điểm>-<day|night>-<gan|can|xa>.png` (GPU thật, WebGPU, tắt tiếng).
- Hiệu năng: A/B xen kẽ `?beacons=0/1` ở rừng và hồ (medium/high, WebGPU): draw call tối đa 134–174 (< 300), CPU p95 giữa hai nhánh lẫn trong nhiễu máy dùng chung (6,5–9,6 ms cả hai bên).
