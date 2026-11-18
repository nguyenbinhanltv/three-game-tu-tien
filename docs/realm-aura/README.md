# RFX-1: hào quang cảnh giới trên nhân vật

Chỉ là lớp hình, client tự suy từ `PState.lv` (cảnh giới) và `PState.mt` (công pháp = đạo). Server không đổi gì; mình và người khác đều thấy.

| Cảnh giới | Cấp | Hiệu ứng (mỗi tầng một màu chủ đạo, các bậc cộng dồn) |
| --- | --- | --- |
| Kết Đan (vàng) | 20+ | Kim đan cầu sáng ở bụng chớp theo nhịp ~1,1 Hz + quầng mềm, tia linh khí vàng xoáy ốc quay lên, hạt vàng, điểm sáng bắn ra mỗi nhịp |
| Nguyên Anh (vàng-ngọc) | 24+ | Nguyên Anh nhỏ trên đầu (thẻ billboard: hài nhi ngồi thiền kiết già trên đài sen, mặt nhắm mắt cười, hai tay kết ấn, viền vàng kim dày, hào quang tròn); vòng ngũ hành 5 viên 5 màu xoay quanh eo + vòng ngọc nối; nhân vật nhấc khỏi đất ~0,2 m, dưới chân là trận đồ triện văn mỏng rõ nét (vàng → bạc → tím-vàng theo tầng, không còn vệt decal loang). Theo đạo: Kiếm tu 9 thanh kiếm thật nhỏ (~0,9 m: lưỡi, chắn, chuôi, vệt sáng mỏng) xếp vòng đều ngang lưng, xoay chậm; Hộ pháp dùng trận đồ chân chung; Đan sư sen lửa + 3 viên lửa lò đan. Tắt khi ngự kiếm, mờ trong 2,5 s sau mỗi lần ra chiêu |
| Hóa Thần (xanh đêm-bạc) | 28+ | Rim light bạc lên chính nhân vật (emissive fresnel gắn vào vật liệu model, không còn vỏ/vòm bao quanh). Pháp tướng là tranh vẽ tay của Thiên Giải (`public/hoa-truc/phap_tuong_*.webp`: Kiếm long ngọc / Huyền vũ đá / Chu tước lửa) làm billboard lớn (~6 m) sau lưng nhìn từ camera: mờ nhẹ khi đứng yên, BÙNG rõ + phình khi ra chiêu tối thượng/chiêu mở từ 28, mờ dần ở viền, gợn sóng sáng chạy từ chân lên, có lớp bóng sẫm phía sau để đọc được trên nền sáng; gợn sóng trận đồ tỏa dưới chân khi bùng. Phù văn đạo luật xoay ngang lưng khi đứng yên |
| Ảnh Biến (đen-vàng-tím) | 32 | Sương mực đen-vàng quanh chân (hạt), 2 dải sét tím-vàng quay quanh thân (nháy), 4 phân thân = bản sao mesh của chính nhân vật (`createSoul(look, 'shadow')`, vật liệu bóng tím-vàng) xếp cung sau lưng |

## Cách dựng

- Logic thuần (bậc, đạo, trần theo preset, tắt khi ngự kiếm/chiến đấu, vòng đời pháp tướng): `apps/client/src/game/fx/realmAuraRules.ts` (+ test). Dựng hình: `game/fx/realmAura.ts` (`RealmAuraFx`: mỗi bậc đăng ký các hàm cập nhật nhỏ trên cùng một danh sách lưới), gọi từ `engine.ts` (`realmAura`, nghe `emitSkillEvent`) và `engine/frameLoop.ts`. Hào quang nhấc `y` của root model sau `ents.update` (không ghi vào trạng thái).
- Đọc được cả trên nền sáng ban ngày lẫn ban đêm: thân vật thể dùng hòa trộn thường (`crystal`, `solid`, `toon`, `decal`, `art`) + lớp cộng sáng/bloom (`glow`) và hạt; quầng sáng mềm là hạt GPU (cầu cộng sáng phẳng lộ cạnh đa giác).
- Hình mới: `swordFxGeometry` (kiếm thật) ở `render/vfx/fxShapes.ts`; thẻ `infant` (Nguyên Anh) vẽ thủ tục ở `render/vfx/cards.ts` (`cardNodes`, `fxA.w` = 5); kiểu VFX `art` (`artNodes` ở `render/vfx/stylized.ts`) lấy tranh pháp tướng từ atlas `render/vfx/art.ts` (nạp ba webp, `fxA.w` = 0 Kiếm long, 1 Huyền vũ, 2 Chu tước, `fxK` là giờ cho sóng sáng). Rim light: `patchRim`/`updateRim` trong `game/fx/realmAura.ts` (uniform đọc theo `mesh.userData.rimCol`).
- Mọi lưới đi qua `FxPool` gộp instance nên cả đám đông dùng chung vài draw call; các nhóm mới đã thêm vào `Vfx.warmBatches`.
- Trần: Thấp tắt cho người khác, của mình giữ lớp chính (kim đan + xoáy ốc, nhấc người, 5 kiếm / cánh sen, rim light; không hạt, không lớp chi tiết, không pháp tướng); Vừa: người khác nửa phi kiếm, không hạt, không lớp chi tiết; Cao: đủ (người khác nửa hạt). Lấy mức thấp hơn của preset đồ họa và "Chất lượng hiệu ứng". Người khác chỉ vẽ trong 45 m, tối đa 4/8 người gần nhất (Vừa/Cao); pháp tướng và phân thân chỉ ở bậc có lớp chi tiết (Cao, hoặc Vừa cho chính mình).
- Tắt: Cài đặt → "Hào quang cảnh giới" (`dtl.realmAura`), hoặc `?aura=0`.

## Kiểm

`pnpm shots realmaura --out <thư mục> [--daos kiem,ho,dan] [--realms kd,na,hn,ab] [--video]`: ảnh 1080p + 720p mỗi cảnh giới × đạo (trước/sau), ngự kiếm ở Nguyên Anh, dãy khung pháp tướng (Hóa Thần+), video đứng yên/chạy/ra chiêu lớn ở Ảnh Biến. `--perf [--others N]`: đo draw call/khung hình tắt-bật hào quang với N người khác cùng sân (mỗi người một phiên trình duyệt). Chiêu tối thượng ở máy thử đôi khi bị server từ chối (chưa đủ sạc): kịch bản phát sự kiện windup giả ở client để vẫn chụp phần hình và báo ra dòng log.

Ảnh/video duyệt PR để ở artifact của phiên, không commit.

## Số đo (2026-11-19, WebGPU, 1280×720, preset Cao, tông môn Lạc Kiếm)

`pnpm shots realmaura --perf --others 3`: một nhân vật mình ở Ảnh Biến (có 3 phân thân) + 3 người khác cạnh nhau (Kết Đan → Hóa Thần, đủ ba đạo), tắt/bật hào quang trong cùng phiên, hai lượt. (Mở 5 phiên trình duyệt cùng lúc hết giờ chờ ở máy này, nên đo 4.)

| | Draw call | Tam giác | Geometries | Textures | Lưới |
| --- | --- | --- | --- | --- | --- |
| Tắt (`setRealmAura(false)`) | 142 | 587–598k | 217 | 121 | 0 |
| Bật (4 hào quang) | 158 (+16) | 664–666k (+70k) | 217 | 121 | 71 + 3 phân thân |

Phần lớn mức tăng là 3 phân thân (mesh nhân vật vật liệu bóng, đã tắt đổ bóng): người ở Ảnh Biến khoảng +10 draw call, ba người còn lại vài draw call mỗi người. Thời gian khung ~15 ms ở cả hai lượt (4 phiên chung một GPU, chỉ để so ngang). Hạt dùng chung ngân sách `PARTICLE_BUDGET`. Atlas tranh pháp tướng 1536×683 (~4 MB).
