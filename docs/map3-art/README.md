# MAP-3 "Ngự Cảnh Thiên Địa" — Vân Hải Phù Đảo

Tái thiết kế mỹ thuật Vân Hải (level `van_hai`, chương 3). Bảng màu **xanh lam + bạc**, điểm wow: biển mây dưới chân, đảo nổi, thuyền tiên buồm lửa, cá kình băng mây, cầu vòng linh khí, hải đăng/tháp canh trên mõm đá. Chia PR:

1. **Ánh sáng và màu (PR1)**: bốn thời điểm `vh_*`, tia sáng xuyên mây, kịch bản chụp `pnpm shots vanhai`.
2. **Điểm wow (PR2)**: thuyền tiên, cá kình mây, cầu vòng linh khí, hải đăng (PR kế tiếp).
3. Địa hình/vật liệu PBR, phông xa, bóng/AO: các PR sau, theo duyệt ảnh.

## PR1: ánh sáng và màu

- Preset `vh_dawn|vh_day|vh_dusk|vh_night` trong `assets/palette.json` (`grading.presets`), thay `cloud_*` cho Vân Hải (`van_hai.assets.json` `mood: vh_dawn`). `?mood=dawn|day|dusk|night` đổi thời điểm (`moodVariant` nhánh `vh`); trước đây hoàng hôn lấy sắc bình minh.
- Sắc: sương lam nhạt (`fogColor` #C2D6EA…), bóng nhuốm lam thẫm, vùng sáng ấm bạc-hồng; hoàng hôn tím lam; đêm trăng bạc. Sương cao (`heightFogTop` 84–100 m) phủ biển mây dưới chân đảo (đảo ở 122–140 m, sàn mây 60 m), mật độ thấp để núi/đảo xa vẫn rõ.
- Tia sáng xuyên mây: `godRays` trong `van_hai.assets.json` (`x,z,r,count`), dùng chung `render/godRays.ts`; cường độ theo mood ở `GOD_RAY_INTENSITY`.
- Đăng ký mood mới ở: `render/grading.ts`, `render/sky.ts` (màu đỉnh trời), `render/atmosphere.ts` (quầng đèn, cột linh quang), `engine/common.ts` (đèn lồng), `content/src/check.ts`.
- Chụp ảnh: `pnpm shots vanhai --out <thư mục tuyệt đối> [--tag truoc|sau] [--perf 1] [--video 1]` (6 góc × 4 thời điểm × 1080p/720p). Cổng khác khi chạy song song: `PORT=… CLIENT_PORT=…`. Ảnh "trước" chụp ở worktree sạch của `main` với cùng kịch bản.

