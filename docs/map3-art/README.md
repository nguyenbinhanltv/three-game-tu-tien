# MAP-3 "Ngự Cảnh Thiên Địa" — Vân Hải Phù Đảo

Tái thiết kế mỹ thuật Vân Hải (level `van_hai`, chương 3). Bảng màu **xanh lam + bạc**, điểm wow: biển mây dưới chân, đảo nổi, thuyền tiên buồm lửa, cá kình băng mây, cầu vòng linh khí, hải đăng/tháp canh trên mõm đá. Chia PR:

1. **Ánh sáng và màu (PR1)**: bốn thời điểm `vh_*`, tia sáng xuyên mây, kịch bản chụp `pnpm shots vanhai`.
2. **Điểm wow (PR2)**: `game/world/vanHaiWow.ts` (thuyền, cá kình, cầu vòng, hải đăng).
3. Địa hình/vật liệu PBR, phông xa, bóng/AO: các PR sau, theo duyệt ảnh.

## PR1: ánh sáng và màu

- Preset `vh_dawn|vh_day|vh_dusk|vh_night` trong `assets/palette.json` (`grading.presets`), thay `cloud_*` cho Vân Hải (`van_hai.assets.json` `mood: vh_dawn`). `?mood=dawn|day|dusk|night` đổi thời điểm (`moodVariant` nhánh `vh`); trước đây hoàng hôn lấy sắc bình minh.
- Sắc: sương lam nhạt (`fogColor` #C2D6EA…), bóng nhuốm lam thẫm, vùng sáng ấm bạc-hồng; hoàng hôn tím lam; đêm trăng bạc. Sương cao (`heightFogTop` 84–100 m) phủ biển mây dưới chân đảo (đảo ở 122–140 m, sàn mây 60 m), mật độ thấp để núi/đảo xa vẫn rõ.
- Tia sáng xuyên mây: `godRays` trong `van_hai.assets.json` (`x,z,r,count`), dùng chung `render/godRays.ts`; cường độ theo mood ở `GOD_RAY_INTENSITY`.
- Đăng ký mood mới ở: `render/grading.ts`, `render/sky.ts` (màu đỉnh trời), `render/atmosphere.ts` (quầng đèn, cột linh quang), `engine/common.ts` (đèn lồng), `content/src/check.ts`.
- Chụp ảnh: `pnpm shots vanhai --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p). Cổng khác khi chạy song song: `PORT=… CLIENT_PORT=…`. Ảnh "trước" chụp ở worktree sạch của `main` với cùng kịch bản.

## PR2: điểm wow (`vanHaiWow.ts`) và đảo/biển mây

Chỉ để nhìn, không va chạm, không qua mạng. Hàm tư thế thuần theo thời gian (test `vanHaiWow.test.ts`). **Không đặt gì trên đảo giả** (`fakeIslands` là bẫy, chỉ thần thức V lộ ra): tháp và cầu vòng chỉ ở đảo thật và mõm đá.

| Vật | Mô tả | Draw call |
| --- | --- | --- |
| Thuyền tiên | 5 thuyền (dài ~34–38 m) lượn sát từng đảo, cao hơn mặt đảo ≥ 30 m: thân cong đầu rồng, lầu ba tầng mái cong đầu đao, buồm cánh đôi phát sáng (vàng lửa → lam bạc), đèn lồng treo | 3 (InstancedMesh) |
| Cá kình băng mây | mẹ 420 m (r 700 m, y 345) + con 150 m (r 640 m, y 305); thân mây bán trong suốt có đầu, vây, đuôi, nếp bụng, mạch linh quang, uốn đuôi trong shader, bụi sáng lấp lánh; bụng luôn cao hơn đỉnh cột buồm mọi thuyền (test) | 4 |
| Cầu vòng linh khí | vòm sáng dựng đứng (không có mặt ngang) nối mép đảo thật gần nhất với từng mõm đá | 1 |
| Vọng nguyệt lâu | 6 mõm đá nhô khỏi biển mây (cách đảo > 150 m, cách mép bản đồ ≥ 260 m vì vách mép cao 210 m) có tháp tám cạnh năm tầng mái cong, đèn linh quang + chùm tia xoay (mạnh về đêm, theo `beaconParams`) | 3 |

Chân đảo (`skyIslands.ts` `buildSkirt`): lưới 112 cạnh dùng chung đỉnh (pháp tuyến mịn, hết low-poly), vách đá ridged + gờ tầng nhô ra, vân tầng lam xám/nâu đất, rêu ở mặt ngửa, vật liệu đá có hạt theo toạ độ thế giới. Biển mây khối (`buildBillows`): 520 khối mây phình dẹt sáng/tối theo hướng mặt, vân chuyển động, mờ khi camera gần. Mặt đất Vân Hải dùng bộ texture `terrain` (`ground` trong `van_hai.assets.json`) và cỏ thẻ mặc định (xanh).

Chụp ảnh: `window.__game.vanHaiWow.freeze(giây)` giữ đồng hồ để cá nằm trong khung (kịch bản `vanhai` tự gọi); `--probe 1` in danh sách mesh.

Chưa làm: cây thẻ alpha thay bonsai tùng (cần asset cây mới), normal map đá bake từ Blender, LOD mõm đá.

## PR3: mép đảo và biển mây

- Chân đảo (`buildSkirt`): profile lấy mẫu lại bằng spline (56 vòng × 96 cạnh; trước 14 vòng nên dịch chuyển chỉ làm bầu, không tạo được gờ); dịch chuyển ridged + gờ tầng ~4,4 m nhô ra + rãnh + gồ ghề mịn; đá **xám ấm ↔ nâu ↔ nâu vàng** phân tầng ~1,6 m (không pha lam), rêu loang theo mảng ở mặt ngửa, vành cỏ chỉ ~1,4 m; nhũ đá ×1,7, rễ ×1,9 và dài hơn.
- Mây cuộn ôm chân đảo (`billowPlan`): mỗi đảo có vòng ~r/5 khối phình dẹt ở ~46 m dưới mặt đảo thấp nhất; biển mây chừa ~25% khe hở, khối nhỏ dần về mép khe, phần thấp khối tối hơn (chiều sâu).
- `cloud-floor`: mặt sàn mây xanh thẫm có vân mây trắng chuyển động, đúng cao độ sàn mây + `polygonOffset` nên không z-fight với lưới địa hình ở mọi khoảng cách, che mặt đất texture của sàn (mặt đất `terrain` ở #308 làm sàn mây lộ ra màu be khi nhìn ngang).
- Mood `vh_*`: `shadowTint` bớt bão hòa (#3C5470…), `shadowAmount` 0,5 (0,3 hoàng hôn) để vùng tối của đá không bị ép về lam.
- Kịch bản chụp: `tungdai` sửa góc (camera cắm xuống đất), thêm `chandao` (nhìn ngang chân đảo và mây cuộn).
- Đo (preset Cao, 1080p): draw call 145–232, tam giác 0,91–1,17 triệu, khung ~8,4 ms (góc `bienmay`, `chandao`, `trencao`).
