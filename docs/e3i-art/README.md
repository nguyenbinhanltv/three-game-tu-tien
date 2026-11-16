# E3-I: mỹ thuật Vân Hải Phù Đảo

Gói E3-I nâng hình ảnh bản đồ `van_hai` (E3-A/E3-N, PR #148) theo `docs/EXPANSION_DESIGN.md` mục 4.2, `docs/ASSET_CONCEPTS.md` và art bible v3 (bán tả thực, bình minh sương, tông trầm, nhân vật rõ trong 20 m). Không dùng Tripo/credit, không thêm ảnh ngoài, không sửa gì trong `dtl-asset-source`. Không đụng quái, boss, nhiệm vụ, phó bản.

Ảnh trước (`truoc/`) và sau (`sau/`) cùng tên, cùng góc với `docs/e3-map/` (cùng script `pnpm shots:e3a`). `sau/e3i-*.jpg` là ảnh thêm chỉ có ở bản sau.

## Vấn đề → cách sửa

| Vấn đề trước | Làm gì | Ở đâu |
| --- | --- | --- |
| Mặt đảo phẳng như bàn | Gò đồi nhấp nhô theo đảo (`TerrainFeature.relief`: biên độ, tần số, kiểu nếp gấp), nhạt dần về rìa 6–46 m nên đầu cầu/thang/vách giữ nguyên độ cao; dùng chung `heightAt` (server, client, công cụ). Độ dốc cục bộ < 1,2 (ngưỡng leo 1,5), test ghim. | `packages/shared/src/terrain.ts`, `level.ts`, `van_hai.terrain.json`, `tools/maps/gen-van-hai.mjs` |
| Xanh đều như bãi cỏ, không có đá/đất/lối đi | Màu đỉnh theo bảng màu từng đảo: rêu ↔ đất ↔ đốm sẫm, đá lộ theo nhiễu + độ dốc + bias đảo với vân tầng, **lối mòn** lượn (trận → điểm đáng chú ý, trận → đầu cầu/thang), bờ hồ ẩm, rìa đảo ngả tối. Thêm hai tầng nhiễu theo điểm ảnh (mảng ~70 m, vân ~2 m) nhân vào màu đỉnh. | `game/vanHaiArt.ts` (hàm thuần), `game/terrain.ts` |
| Cỏ rải đều kiểu lưới | Thẻ cỏ (atlas `grass-ochre` dùng chung, thẻ `van_hai` chủ đạo) mọc **thành đám** theo nhiễu, mật độ/màu/độ đám theo đảo, không mọc trên lối mòn, đá lộ, lòng hồ, sát mép đảo; rậm quanh hồ. | `game/grass.ts` (`vanHaiTuftAt`), `van_hai.assets.json` (`grassCards`, `grass: true`) |
| Năm đảo giống nhau | Bản sắc riêng (bảng dưới): màu nền, bộ prop và sắc độ, địa hình, dáng chân đảo, điểm nhấn. | `vanHaiArt.ts`, `game/vanHaiScatter.ts` (thay hàm rải cũ, ô 13 m, theo đám), `skyIslands.ts` |
| Mép đảo đơn điệu, sàn/biển mây phẳng | Chân đảo: vân tầng đá, nhũ đá, rễ (số lượng và độ dài theo đảo, mũi không chọc xuống sàn mây), thân phình/thon theo đảo; thác mây rơi từ mép (dải cuộn chậm); tầng mây ngang nhiều độ cao quanh chân đảo (1 draw call); đá trôi quanh đảo (1 draw call); sàn mây có ba tầng nhiễu màu (mảng lớn, dải, vân). | `game/skyIslands.ts`, `game/terrain.ts` |
| Mood | Bộ mood riêng `cloud_dawn` (mặc định), `cloud`, `cloud_night` (trăng bạc): nắng vàng mật thấp, trời xanh ngọc, sương ngà dày ở dưới nhưng thưa gần (mật độ 0,0011, tầm nhìn nhân vật trong 20 m không đổi), bóng ngọc lam. | `assets/palette.json`, `render/grading.ts`, `atmosphere.ts`, `sky.ts`, `engine.ts`, `check.ts` |
| Nhạc | `wild_cloud` tự soạn (cung G ngũ cung, sáo trúc dẫn, hạc, chuông thủy tinh, nền dây thưa, 72 BPM, 2:13), `regionTrack` chọn cho level `van_hai`; chưa có stem chiến đấu riêng nên crossfade sang `combat` như bài chưa có stem. | `tools/audio/compose/wild_cloud.mjs`, `music.json`, `musicDirector.ts`, `music.ts` (kiểu dự phòng), manifest + `LICENSES.md` |

## Bản sắc năm đảo

| Đảo | Nền | Địa hình | Prop chủ đạo (PROP_LIB và Vân Lam, có sắc độ) | Điểm nhấn |
| --- | --- | --- | --- | --- |
| Tùng Đài | rêu xanh thẫm, đất nâu ẩm | đồi tròn thoải (biên độ 2,4) | rừng tùng (`prop_tung_phu_dao`, `prop_thong_co`), dương xỉ, đá phủ rêu | rễ dài rủ ở chân đảo, thác mây |
| Thạch Quy | xám cát, nhiều đá lộ | gò đá có nếp gấp (3,0) | đá tảng cụm, trụ khắc vân, bia đá | chân đảo phình rộng như mai rùa |
| Kính Hồ | phù sa xanh nhạt | gần phẳng (0,7), **3 hồ gương nông** | tre, dương xỉ, anh đào quanh hồ, đá nhỏ ở bờ | mặt hồ phản chiếu trời (`render/pondWater.ts`), cỏ rậm quanh hồ |
| Lôi Vân | đá phiến sẫm, đất cháy | gò nhọn có nếp gấp (3,0) | đá phiến dựng sẫm, cây cháy, kiếm gãy, trụ đá | nhiều nhũ đá nhọn, mây sấm xám treo cao thỉnh thoảng lóe |
| Kình Ngư Đài | trắng xương, tẩy trắng | sóng dài (2,0) | đá nhạt ngả lam, tùng gió | **dãy sườn kình ngư** khổng lồ (9 vòng cung), chân đảo dài thon |

## Số đo (perf-budget)

Đo bằng `pnpm shots:e3a` (WebGPU, preset Vừa, 1280×720, `__game.info()` của khung vừa vẽ), cùng điểm đứng. Thời gian khung bị khóa ở ~8,3 ms (vsync 120 Hz) ở cả hai bản nên không phân biệt được; xem fps/ms trên HUD của từng ảnh (đều ~120 fps). `bench:client --level van_hai` **không** dùng được ở gói này: bản hiện tại đo ở Vân Lam (số trước/sau trùng từng con số) và lần chạy có preset Cao bị treo, nên không lấy làm bằng chứng.

| Điểm | Draw call trước → sau | Tam giác trước → sau |
| --- | --- | --- |
| Phù Đảo Các (hub) | 101 → 121 | 315k → 268k |
| Tùng Đài | 113 → 139 | 391k → 363k |
| Thạch Quy | 114 → 129 | 348k → 319k |
| Kính Hồ | 135 → 144 | 405k → 320k |
| Lôi Vân | 95 → 120 | 309k → 420k |
| Kình Ngư | 95 → 121 | 323k → 338k |
| Điểm đáng chú ý Kính Hồ Đài | 137 → 147 | 429k → 367k |
| Điểm đáng chú ý Đỉnh Sấm | 105 → 134 | 365k → 497k |
| Cầu xích | 114 → 147 | 291k → 306k |

Cao nhất sau: **148 draw call** (ngân sách < 300), **497k tam giác** (1–2 triệu). Thêm khoảng +10–30 draw call (prop theo đảo: mỗi loại prop thêm một pool, tầng mây, đá trôi, thác mây, hồ) và vài texture canvas nhỏ (hàng chục KB mỗi cái). Số geometry/texture tăng chậm theo số điểm đã đi qua (nạp lười), không rò. Nhạc thêm 1,8 MB (webm) / 2,1 MB (m4a), chỉ tải khi vào Vân Hải (không nằm trong tải đầu).

## Kiểm chứng

- `pnpm typecheck`, `pnpm test` (cả 618 test client, 206 shared, 517 server), `pnpm content:check`, `pnpm audio:check`, `pnpm palette:check`: đạt.
- Test mới `game/vanHaiArt.test.ts`: bản sắc/bảng màu, lối mòn, hồ lõm, mặt đảo nhấp nhô mà đi được, rìa đảo đúng độ cao, rải prop xác định và đúng bộ prop từng đảo.
- `pnpm map:report --level van_hai`: 0 chỗ kẹt, độ phủ chuẩn như cũ (p95 64,6 m, max 83,0 m); `islands.test.ts` và `vanhai.test.ts` (leo vách/thang bằng `stepMove` thật) vẫn đạt.
- Ảnh chụp luôn `?mute=1` và `--mute-audio`, cặp cổng riêng 2797/5397, server tự tắt.

## Ghi chú, giới hạn

- Hồ gương là hồ **nông đi bộ được** (lòng chảo 1 m trong `heightAt`, không phải `water` của level): không bơi, không chậm. Mặt nước chỉ là hình.
- Mây sấm chỉ đổi màu vật liệu khi lóe (không thêm đèn, không đổi luật); thời điểm lóe dùng `Math.random` vì chỉ là hình.
- Xương kình ngư, thác mây, đá trôi không có va chạm.
- Thang mây/sàn mây còn nhiều mảnh nhọn trắng ở xa khi nhìn từ dưới (nhũ đá và rễ trong sương); đã giữ mũi cách sàn ≥ 8–10 m.
- Chưa có bộ texture mặt đảo riêng (vẫn màu đỉnh + nhiễu theo điểm ảnh); nếu muốn thêm chiều sâu thì làm bộ Poly Haven riêng như Vân Lam. Chưa có `prop_co_van_hai` dạng GLB: dùng thẻ cỏ `van_hai` trong atlas sẵn có.
- Nhạc `mirror_lake`/`wild_storm` theo từng đảo trong thiết kế chưa làm (cả level dùng `wild_cloud`).
- Bộ sinh `gen-van-hai.mjs` đã thêm `relief`/`ponds`; không chạy lại trong gói này (sẽ ghi đè `van_hai.json` mà E3-B đang sửa), `van_hai.terrain.json` được vá tay đúng hai trường đó, khớp với bộ sinh.

## Ảnh

Trước | Sau, từng cặp:

| | Trước | Sau |
| --- | --- | --- |
| Phù Đảo Các | ![](truoc/hub.jpg) | ![](sau/hub.jpg) |
| Tùng Đài | ![](truoc/zone-tung-dai-dao.jpg) | ![](sau/zone-tung-dai-dao.jpg) |
| Thạch Quy | ![](truoc/zone-thach-quy-dao.jpg) | ![](sau/zone-thach-quy-dao.jpg) |
| Kính Hồ | ![](truoc/zone-kinh-ho-dao.jpg) | ![](sau/zone-kinh-ho-dao.jpg) |
| Lôi Vân | ![](truoc/zone-loi-van-dao.jpg) | ![](sau/zone-loi-van-dao.jpg) |
| Kình Ngư | ![](truoc/zone-kinh-ngu-dai.jpg) | ![](sau/zone-kinh-ngu-dai.jpg) |
| Kính Hồ Đài | ![](truoc/poi-kinh-ho-dai.jpg) | ![](sau/poi-kinh-ho-dai.jpg) |
| Cầu xích | ![](truoc/cau-xich.jpg) | ![](sau/cau-xich.jpg) |
| Giữa cầu | ![](truoc/cau-giua.jpg) | ![](sau/cau-giua.jpg) |
| Sàn mây | ![](truoc/san-may.jpg) | ![](sau/san-may.jpg) |
| Thang mây | ![](truoc/thang-may.jpg) | ![](sau/thang-may.jpg) |
| Toàn cảnh | ![](truoc/overview.jpg) | ![](sau/overview.jpg) |
| Bản đồ lớn | ![](truoc/worldmap.jpg) | ![](sau/worldmap.jpg) |

Chỉ có ở bản sau (`E3I_EXTRA=1 pnpm shots:e3a --out <thư mục tuyệt đối>`):

| | |
| --- | --- |
| Hồ gương Kính Hồ | ![](sau/e3i-ho-guong.jpg) |
| Xương kình ngư, Kình Ngư Đài | ![](sau/e3i-xuong-kinh.jpg) |
| Rừng tùng, Tùng Đài (có lối mòn) | ![](sau/e3i-tung-dai-rung.jpg) |
| Đá phiến sẫm và nhũ đá, Lôi Vân | ![](sau/e3i-may-sam.jpg) |
