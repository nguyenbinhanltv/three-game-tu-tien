# RFX-1: hào quang cảnh giới trên nhân vật

Chỉ là lớp hình, client tự suy từ `PState.lv` (cảnh giới) và `PState.mt` (công pháp = đạo). Server không đổi gì; mình và người khác đều thấy.

| Cảnh giới | Cấp | Hiệu ứng |
| --- | --- | --- |
| Kết Đan | 20+ | Kim đan ở đan điền chớp theo nhịp ~1,1 Hz (lõi vàng + vầng mờ), điểm sáng vàng thổ bắn ra mỗi nhịp; hạt linh khí lắng quanh người khi đứng yên/đả tọa |
| Nguyên Anh | 24+ | Theo đạo. Kiếm tu: 3 → 9 phi kiếm nhỏ xoay quanh lưng (`swordCount`). Hộ pháp: trận đồ triện văn dưới chân + khiên fresnel mờ. Đan sư: sen lửa 6 cánh + 3 đốm lửa lò đan + đốm lửa bay lên. Tắt khi ngự kiếm, mờ (30%) trong 2,5 s sau mỗi lần ra chiêu |
| Hóa Thần | 28+ | Vầng sáng nhẹ sau lưng lúc đứng yên. Ra chiêu tối thượng hoặc chiêu mở từ Hóa Thần (`unlock ≥ 28`): bóng pháp tướng khổng lồ trong suốt sau lưng (nhìn từ camera) 1,3 s rồi tan: Kiếm tu = Kiếm long ngọc, Hộ pháp = Huyền vũ đá, Đan sư = Chu tước lửa (thẻ `phoenix` có sẵn, tô màu lửa); gợn sóng sáng chạy từ chân lên đầu + vành trận đồ tỏa dưới chân |
| Ảnh Biến | 32 | Thêm sương mực đen–vàng quanh chân |

Các bậc cộng dồn (Ảnh Biến có đủ cả bốn).

## Cách dựng

- Logic thuần (bậc, đạo, trần theo preset, tắt khi ngự kiếm/chiến đấu, vòng đời pháp tướng): `apps/client/src/game/fx/realmAuraRules.ts` (+ test). Dựng hình: `game/fx/realmAura.ts` (`RealmAuraFx`), gọi từ `engine.ts` (`realmAura`, nghe `emitSkillEvent`) và `engine/frameLoop.ts`.
- Mọi lưới đi qua `FxPool` kiểu gộp (`crystal` hình `kite` cho phi kiếm/cánh sen, `glow` cầu cho kim đan/đốm lửa, `glow` vành cho vầng sáng, `dome`, `decal` triện văn, `card`), nên cả đám đông dùng chung vài draw call; hạt đi qua `PARTICLES` dùng chung (không draw call). Nhóm gộp dùng đúng `renderOrder`/hình đã vẽ ấm ở `Vfx.warmBatches` (thêm `glow`+`ico1`).
- Thẻ pháp tướng mới `sword` (Kiếm long ngọc) và `turtle` (Huyền vũ) vẽ thủ tục ở `render/vfx/cards.ts`; shader `cardNodes` (`render/vfx/stylized.ts`) chọn thẻ theo `fxA.w` (0 La Hán, 1 Phượng, 2 Quỷ, 3 Kiếm long, 4 Huyền vũ), `fxK` là giờ cho sóng sáng.
- Trần: Thấp tắt cho người khác, của mình chỉ giữ lớp hình chính (không hạt, nửa phi kiếm, không pháp tướng); Vừa: người khác nửa phi kiếm, không hạt; Cao: đủ (người khác nửa hạt). Lấy mức thấp hơn của preset đồ họa và "Chất lượng hiệu ứng". Người khác chỉ vẽ trong `OTHERS_FX_DIST` (45 m), tối đa 4/8 người gần nhất (Vừa/Cao). Tối đa 3 bóng pháp tướng đồng thời.
- Tắt: Cài đặt → "Hào quang cảnh giới" (`dtl.realmAura` trong localStorage), hoặc `?aura=0` để so số đo.

## Kiểm

`pnpm shots realmaura --out <thư mục> [--daos kiem,ho,dan] [--realms kd,na,hn,ab] [--video]`: ảnh 1080p + 720p mỗi cảnh giới × đạo (trước/sau), ngự kiếm ở Nguyên Anh, dãy khung pháp tướng (Hóa Thần+), video đứng yên/chạy/ra chiêu lớn ở Ảnh Biến. `--perf [--others N]`: đo draw call/khung hình tắt-bật hào quang với N người khác cùng sân (mỗi người một phiên trình duyệt). Chiêu tối thượng ở máy thử đôi khi bị server từ chối (chưa đủ sạc): kịch bản phát sự kiện windup giả ở client để vẫn chụp phần hình và báo ra dòng log.

Ảnh/video duyệt PR để ở artifact của phiên, không commit.

## Số đo (2026-11-19, WebGPU, 1280×720, preset Cao, Vân Lam tông môn)

`pnpm shots realmaura --perf --others 4`: một nhân vật mình ở Ảnh Biến + 4 người khác đứng cạnh (Kết Đan → Ảnh Biến, cả ba đạo), tắt/bật hào quang trong cùng phiên, lặp hai lượt.

| | Draw call | Tam giác | Geometries | Textures | Lưới hào quang |
| --- | --- | --- | --- | --- | --- |
| Tắt (`setRealmAura(false)`) | 145 | 616–618k | 213 | 121 | 0 |
| Bật | 150 (+5) | 620k (+1–4k) | 213 | 121 | 32 lưới / 4 người |

Cả đám chia sẻ vài nhóm gộp (`crystal|kite`, `glow|ico1`, `glow|ring`, `dome`, `decal`), nên mỗi người thêm dưới 2 draw call, xa dưới ngưỡng +10 mỗi người. Thời gian khung ~19 ms cả hai lượt là nhiễu của 5 phiên trình duyệt chung một GPU (số tuyệt đối không dùng được; chênh tắt/bật nằm trong nhiễu). Số của chiêu tối thượng một người ở Hóa Thần: 138–146 draw call (nền 112 + VFX chiêu có sẵn).
