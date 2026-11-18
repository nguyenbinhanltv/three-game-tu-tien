# RFX-1: hào quang cảnh giới trên nhân vật

Chỉ là lớp hình, client tự suy từ `PState.lv` (cảnh giới) và `PState.mt` (công pháp = đạo). Server không đổi gì; mình và người khác đều thấy.

| Cảnh giới | Cấp | Hiệu ứng (mỗi tầng một màu chủ đạo, các bậc cộng dồn) |
| --- | --- | --- |
| Kết Đan (vàng) | 20+ | Kim đan cầu sáng ở bụng chớp theo nhịp ~1,1 Hz + quầng mềm, tia linh khí vàng xoáy ốc quay lên, hạt vàng, điểm sáng bắn ra mỗi nhịp |
| Nguyên Anh (vàng-ngọc) | 24+ | Nguyên Anh nhỏ ngồi thiền trên đầu (thẻ billboard + quầng); vòng ngũ hành 5 viên 5 màu xoay quanh eo + vòng ngọc nối; nhân vật nhấc khỏi đất ~0,2 m trên đài mây + 8 cánh sen. Theo đạo: Kiếm tu 9 thanh kiếm thật (lưỡi, chắn, chuôi, có vệt sáng) xếp vòng đều; Hộ pháp trận đồ triện văn + khiên fresnel; Đan sư sen lửa + 3 viên lửa lò đan. Tắt khi ngự kiếm, mờ trong 2,5 s sau mỗi lần ra chiêu |
| Hóa Thần (xanh đêm-bạc) | 28+ | Viền sáng bạc quanh người; pháp tướng người khổng lồ (~3 lần, hình người đủ đầu + búi tóc + vai + tay áo, `crystal` xanh đêm + viền `dome` bạc) sau lưng nhìn từ camera: mờ nhẹ khi đứng yên, BÙNG rõ + phình khi ra chiêu tối thượng/chiêu mở từ 28 (kèm thẻ thần thú 1,3 s: Kiếm long ngọc / Huyền vũ / Chu tước). Kiếm tu: pháp tướng cầm kiếm khổng lồ; Hộ pháp/Đan sư: vòng hào quang sau đầu. Phù văn đạo luật xoay ngang lưng khi đứng yên |
| Ảnh Biến (đen-vàng-tím) | 32 | Vũng + sương mực đen-vàng quanh chân, 2 dải sét tím-vàng quay quanh thân (nháy), 4 phân thân mờ xếp vòng sau lưng |

## Cách dựng

- Logic thuần (bậc, đạo, trần theo preset, tắt khi ngự kiếm/chiến đấu, vòng đời pháp tướng): `apps/client/src/game/fx/realmAuraRules.ts` (+ test). Dựng hình: `game/fx/realmAura.ts` (`RealmAuraFx`: mỗi bậc đăng ký các hàm cập nhật nhỏ trên cùng một danh sách lưới), gọi từ `engine.ts` (`realmAura`, nghe `emitSkillEvent`) và `engine/frameLoop.ts`. Hào quang nhấc `y` của root model sau `ents.update` (không ghi vào trạng thái).
- Đọc được cả trên nền sáng ban ngày lẫn ban đêm: thân vật thể dùng hòa trộn thường (`crystal`, `solid`, `toon`, `decal`) + lớp cộng sáng/bloom (`dome`, `glow`) và hạt; quầng sáng mềm là hạt GPU (cầu cộng sáng phẳng lộ cạnh đa giác).
- Hình mới ở `render/vfx/fxShapes.ts`: `swordFxGeometry` (kiếm thật) và `bodyFxGeometry` (dáng người, pháp tuyến mịn). Thẻ `infant`, `sword`, `turtle` vẽ thủ tục ở `render/vfx/cards.ts`; `cardNodes` chọn thẻ theo `fxA.w` (0 La Hán, 1 Phượng, 2 Quỷ, 3 Kiếm long, 4 Huyền vũ, 5 Nguyên Anh), `fxK` là giờ cho sóng sáng.
- Mọi lưới đi qua `FxPool` gộp instance nên cả đám đông dùng chung vài draw call; các nhóm mới đã thêm vào `Vfx.warmBatches`.
- Trần: Thấp tắt cho người khác, của mình giữ lớp chính (kim đan + xoáy ốc, nhấc người, 5 kiếm / cánh sen, viền bạc; không hạt, không lớp chi tiết, không pháp tướng); Vừa: người khác nửa phi kiếm, không hạt, không lớp chi tiết; Cao: đủ (người khác nửa hạt). Lấy mức thấp hơn của preset đồ họa và "Chất lượng hiệu ứng". Người khác chỉ vẽ trong 45 m, tối đa 4/8 người gần nhất (Vừa/Cao); tối đa 3 thẻ thần thú cùng lúc.
- Tắt: Cài đặt → "Hào quang cảnh giới" (`dtl.realmAura`), hoặc `?aura=0`.

## Kiểm

`pnpm shots realmaura --out <thư mục> [--daos kiem,ho,dan] [--realms kd,na,hn,ab] [--video]`: ảnh 1080p + 720p mỗi cảnh giới × đạo (trước/sau), ngự kiếm ở Nguyên Anh, dãy khung pháp tướng (Hóa Thần+), video đứng yên/chạy/ra chiêu lớn ở Ảnh Biến. `--perf [--others N]`: đo draw call/khung hình tắt-bật hào quang với N người khác cùng sân (mỗi người một phiên trình duyệt). Chiêu tối thượng ở máy thử đôi khi bị server từ chối (chưa đủ sạc): kịch bản phát sự kiện windup giả ở client để vẫn chụp phần hình và báo ra dòng log.

Ảnh/video duyệt PR để ở artifact của phiên, không commit.

## Số đo (2026-11-19, WebGPU, 1280×720, preset Cao, tông môn Lạc Kiếm)

`pnpm shots realmaura --perf --others 4`: một nhân vật mình + 4 người khác cạnh nhau (Kết Đan → Ảnh Biến, đủ ba đạo), tắt/bật hào quang trong cùng phiên, hai lượt.

| | Draw call | Tam giác | Geometries | Textures | Lưới |
| --- | --- | --- | --- | --- | --- |
| Tắt (`setRealmAura(false)`) | 146 | 637–642k | 217 | 122 | 0 |
| Bật (5 hào quang) | 158 (+12, ~2 mỗi người) | 670–674k (+30k) | 217 | 122 | 150 |

Thời gian khung ~19 ms ở lượt bật/tắt đều là số của 5 phiên trình duyệt chung một GPU (một mẫu nhiễu 28 ms); dùng để so ngang, không phải số tuyệt đối. Hạt dùng chung ngân sách `PARTICLE_BUDGET`.
