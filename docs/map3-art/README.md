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

## PR2: điểm wow (`vanHaiWow.ts`)

Chỉ để nhìn, không va chạm, không qua mạng. Vị trí suy từ `terrainOf('van_hai')` (đảo thật, đảo giả). Hàm tư thế thuần theo thời gian (có test `vanHaiWow.test.ts`).

| Vật | Mô tả | Draw call |
| --- | --- | --- |
| Thuyền tiên | 4 thuyền lượn elip quanh Phù Đảo Các cao hơn đỉnh đảo ≥ 20 m; thân loft mịn (lacquer lam + bạc), 2 buồm lửa TSL | 2 (InstancedMesh) |
| Cá kình băng mây | mẹ 150 m + con 54 m bơi vòng r 700–760 m; thân mây bán trong suốt, uốn đuôi trong shader | 2 |
| Cầu vòng linh khí | vòm sáng bạc–lam nối Phù Đảo Các/đảo thật với từng đảo giả, dải sáng chạy dọc | 1 |
| Hải đăng, tháp canh | tháp trên 4 đảo giả; 4 mõm đá nhô khỏi biển mây (cách đảo > 300 m) có tháp canh; đèn + chùm tia xoay (mạnh về đêm, theo `beaconParams`) | 3 |

Chụp ảnh: `window.__game.vanHaiWow.freeze(giây)` giữ đồng hồ để cá nằm trong khung (kịch bản `vanhai` tự gọi).
