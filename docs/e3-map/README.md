# E3-A + E3-N: Vân Hải Phù Đảo (bản đồ 3, cấp 20–23)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e3-map/<file>`.

Gói E3-A (bản đồ) kèm E3-N (địa hình đảo nổi) của E-3 Nguyên Anh (`docs/EXPANSION_DESIGN.md` mục 4.2, 11.3, 11.5). Làm theo mẫu E2-A (`docs/e2-map/README.md`). Không đụng phó bản, độ kiếp, boss (E3-B và các gói sau). Chỉ dùng asset sẵn có (prop PROP_LIB #118, cây/đá), không Tripo.

## Đã có

| Thứ | Ở đâu |
| --- | --- |
| Địa hình dữ liệu hóa: đảo nổi, cầu xích, đảo giả, sàn mây | `packages/content/data/levels/van_hai.terrain.json` (đăng ký ở `packages/content/src/index.ts`) |
| Level: 5 vùng, 30 cụm, 12 tinh anh, 5 điểm đáng chú ý, 3 điểm hái, điểm vào | `packages/content/data/levels/van_hai.json` |
| Khai báo asset client | `packages/content/data/levels/van_hai.assets.json` (mood `dawn`, có biển mây, không nạp texture mặt đất để sàn mây giữ màu mây) |
| Kiểu `BridgeDef`, `TerrainDef.bridges/fakeIslands`, `bridgeDeckY`, `Terrain.surfaceAt/blockRise`, luật leo bậc (`MAX_SLOPE_UP`) | `packages/shared/src/level.ts`, `terrain.ts`, `movement.ts` |
| Trận truyền tống `vh_*` (6) | `packages/shared/src/teleport.vanhai.ts`, `teleport.ts` |
| Prop bày (49, asset sẵn có) | `packages/shared/src/props.vanhai.ts`, nối vào `propsOf('van_hai')` |
| Chuỗi: `zone.*`, `poi.*`, `tele.*`, `map.van_hai`; glossary `maps/zones/teleports/pois` | `packages/content/data/i18n/vi.json`, `glossary.json` |
| Điểm đặt tên `?at=` / `/gm tp` (`vh_hub`, `vh_tung_dai`, `vh_thach_quy`, `vh_kinh_ho`, `vh_loi_van`, `vh_kinh_ngu`, `vh_dao_nho`) | `packages/content/data/places.json` |
| Nền minimap | `apps/client/public/map/van_hai.{webp,json}` (`pnpm minimap:build --level van_hai`) |
| Cầu xích + đảo giả (vẽ) | `apps/client/src/game/skyIslands.ts` (nối qua `MapVis`), rải tùng/đá trôi `propScatter.ts` (`scatterVanHai`) |
| Bộ sinh tất định | `tools/maps/gen-van-hai.mjs` (sửa số liệu ở đây rồi chạy lại: sinh 4 tệp dữ liệu/mã ở trên; ~1 phút vì tối ưu vị trí cụm) |
| Test | `packages/shared/src/islands.test.ts`, `packages/content/src/vanhai.test.ts`, `apps/server/src/game/vanhai.test.ts` |
| Ảnh chụp trong game | `pnpm shots points --level van_hai --out <thư mục tuyệt đối>` (`tools/perf/src/shots-e3a.ts`) |

## Bố cục

Tọa độ so với Phù Đảo Các (+x đông, +z nam). Mỗi đảo là một vùng (đa giác = mặt đảo phẳng); đảo vùng bán kính 207 m, hub 85 m, mép đảo là vách đứng bo tròn dày 12 m (không leo từ sàn mây; lên lại bằng thang mây hoặc ngự kiếm).

| Đảo | Vị trí | Cấp | Tinh anh | Cầu |
| --- | --- | --- | --- | --- |
| Phù Đảo Các (hub, an toàn, không quái) | (0, 0) | | | tới Tùng Đài, Thạch Quy, Kính Hồ |
| Tùng Đài Đảo | (−360, 168) | 20–21 | Liệt Cốt Báo Vương ×2 | hub, Kình Ngư Đài |
| Thạch Quy Đảo | (396, 108) | 21–22 | Hộ Mạch Khôi Tướng ×3 | hub, Lôi Vân Đảo |
| Kính Hồ Đảo | (60, 492) | 21–22 | Xích Sa Ngô Công ×2 | hub |
| Lôi Vân Đảo | (528, −420) | 22–23 | Liệt Cốt Báo Vương ×3 | Thạch Quy |
| Kình Ngư Đài | (−456, −456) | 23 | Hộ Mạch Khôi Tướng ×2 | Tùng Đài |

Ba đảo nhỏ (không quái, 4 điểm linh thảo, chỉ ngự kiếm tới được) và bốn đảo giả nằm giữa các đảo lớn. Vùng chơi nửa cạnh 860 m (hơn 780 m của Đoạn Mạch vì Lôi Vân Đảo nằm xa tâm: ở 780 m mép đảo chạm vách và `map:report` báo 17 chỗ kẹt). Boss Vân Hải Kình Vương chưa đặt (E3-B): tâm Kình Ngư Đài để trống làm đấu trường.

Quái tạm dùng mẫu của Đoạn Mạch (4 quái thường, 3 tinh anh) với cấp 20–23; E3-B thay bằng quái riêng (Vân Hạc, Kính Linh, Phù Đảo Thạch Quy…). Nhạc cả 5 vùng là `wild` (nhạc riêng thuộc gói mỹ thuật bản đồ 3).

## Đường đi

- Vân Lam / Đoạn Mạch → Vân Hải: trận `vh_tp_hub` (Phù Đảo Các), **không mở sẵn**. Nhiệm vụ `q2_ket_dan` (Kết Đan, chương 2) mở trận khi nhận (`unlockTele`); thử bằng `/gm tele vh_tp_hub`. Tới nơi thì trận tự mở. Niệm 5 s, đi qua vé một lần.
- Mỗi đảo một trận `vh_tp_<đảo>` (mở khi chạm). Về: `dm_tp_tram` hoặc `tp_tong_mon`.
- Giữa các đảo: cầu xích (đi bộ), hoặc ngự kiếm qua lại (cùng luật bay như mọi nơi).

## E3-N: địa hình đảo nổi

Một hàm `heightAt` chung (client, server, công cụ) gồm:

- **Đảo** (`islands`): mặt phẳng bán kính `r`, vách `edge` = 12 m xuống sàn mây (không bước được vào chỗ mặt đất dốc hơn `MAX_SLOPE_UP` = 1,5 trừ khi đang đi xuống: tính theo độ lớn gradient của mặt đất nên đi chéo, chạy chậm hay nhảy đều không leo vách); các khu `isl_*` thêm nhiễu nhẹ lên mặt đảo. **Thang mây** (`bridges` id `thang_*`, Thăng Vân Đài): mỗi đảo vùng và hub một dốc rộng 5,2 m từ sàn mây lên mép đảo (đáy ở sàn mây, dốc 0,74, bộ sinh chọn hướng xa cụm quái, trận, điểm đáng chú ý, các đảo và cầu); test `vanhai.test.ts` đi bộ lên từng thang bằng `stepMove` thật.
- **Sàn mây** (`voidFloor` = 60 m): mọi chỗ ngoài đảo là mặt đứng đi bộ được, thấp hơn mặt đảo ~60 m. **Rơi khỏi đảo hay cầu thì rơi tới sàn mây, không mất máu, không chết** (server không có sát thương rơi; xem `islands.test.ts` và ảnh `roi-khoi-cau`/`san-may`; lần chụp ghi y 119 → 60, máu 1953/1953). Lên lại đảo bằng thang mây hoặc ngự kiếm. Sàn mây là mặt mây mềm: màu trắng xám gợn noise (`islandColor`), không cỏ/cây/đá (rải cỏ, cây thủ tục và `scatterVanHai` chỉ ở độ cao ≥ sàn + 40 m), hai lớp sương mờ rất nhẹ dưới đầu gối, cao hơn sàn 0,25 m và 0,9 m (`SkyIslands.buildFloorMist`; vành sương ôm chân đảo nằm cao hơn sàn ≥ 20 m nên không phủ lên người đứng trên sàn).
- **Cầu xích** (`bridges`): dải rộng 5,2 m, độ cao nội suy giữa hai đầu có võng. `heightAt` có mặt cầu; `Terrain.surfaceAt` bỏ mặt cầu để dựng lưới địa hình (cầu vẽ riêng bằng ván + dây xích, ba InstancedMesh, không có "tường đất" dưới cầu). Mép dải dốc đứng; từ sàn mây không bị "nhấc" lên cầu: ở level đảo nổi (`Terrain.blockRise`), không bước được vào chỗ mặt đất dốc hơn `MAX_SLOPE_UP` = 1,5 (độ lớn gradient; thang mây dốc 0,74) trừ khi đang đi xuống, nên đi chéo, chạy chậm hay nhảy đều không leo được thành cầu và vách đảo (cả client dự đoán và server qua `stepMove`). Vân Lam và các level khác không đổi từng bit.
- **Đảo giả** (`fakeIslands`): **không vào `heightAt`**, bước lên là rơi về sàn mây. Client vẽ như đảo thật; thần thức (V, Kết Đan) quét qua (trong tầm, còn hiệu lực) thì đảo mờ đi, hiện vòng mép và cột sáng xanh (`SkyIslands.update`); hết hạn quét thì đặc lại. Ảnh `dao-gia-truoc` / `dao-gia-sau-quet`.
- **Mép đảo (hình)**: lưới địa hình bỏ các ô vách (`CLIFF_SKIP` ở `terrain.ts`, cả lưới mịn và lưới thô); `SkyIslands.buildSkirt` dựng khối đá treo: mép bo tròn, thân thu nhỏ thành mũi đá lởm chởm (nhiễu xác định), rễ cây thòng, hai vành sương ôm chân đảo. Màu mặt đảo (`islandColor`): tông trầm, rêu xám-lục trộn đất nâu và mảng đá, dốc lộ đá; cỏ nhạt đi 70 %. Dùng lại cỏ Vân Lam, bộ texture riêng là việc của E3-I.
- **AOI**: server tính khoảng cách phẳng (x, z) nên người trên sàn mây dưới đảo vẫn nhận người/quái phía trên cùng tọa độ. Chấp nhận được: 33 bot trong `world-van_hai` cho tick p95 0,7 ms, không lỗi `refId`. Nếu sau này đảo chồng nhau theo chiều dọc, thêm kiểm tra y ở `aoi.ts`.
- **Camera**: dùng địa hình như mọi level; không thấy camera xuyên đảo trong ảnh chụp (đứng dưới đảo giả thấy đáy đảo bình thường).

## Số đo (`pnpm map:report --level van_hai`)

| | |
| --- | --- |
| Cụm / quái thường / tinh anh / boss | 30 / 90 (cụm 3 con) / 12 / 0 (E3-B) |
| Diện tích vùng săn | 0,643 km² (5 đảo × 0,129) |
| Mật độ | **140,0 quái/km²** (đạt 100–140; trần của `levelcheck`; 5 vùng đều 140,0) |
| Chỗ kẹt (5239 điểm quét) | **0** |
| Độ phủ chuẩn mới (mép cụm gần nhất, lưới 12 m) | 97,1 % ≤ 70 m, p50 29,1 m, **p95 64,6 m, max 83,0 m** (chuẩn `COVER_BY_LEVEL.van_hai`: p95 ≤ 65, max ≤ 85: ĐẠT) |

**Mật độ và độ phủ giằng co nhau.** Đảo tròn bán kính R với cụm 3 con (bán kính 30) chỉ đạt cả hai chuẩn trong một khe rất hẹp: ≤ 140 quái/km² bắt R ≥ 207 m với 6 cụm/đảo, còn p95 ≤ 65 m bắt R ≤ 207 m. Bản này nằm đúng khe đó (R = 207, 140,0 quái/km², p95 64,6 m), nên không còn dư địa: đổi bán kính, số cụm hay khoảng cấm quanh trận/điểm đáng chú ý là phải chạy lại bộ sinh và kiểm cả hai. Bộ sinh tối ưu vị trí cụm bằng ủ nhiệt trên đúng lưới của `coverage.ts`.

## Kiểm chứng

- `pnpm typecheck`, `pnpm test`, `pnpm content:check`: đạt.
- `pnpm --filter @dtl/bot-client security`: tất cả ĐẠT. `pnpm bots --count 100 --duration 120` + `pnpm ledger:check`: sổ cái khớp, 0 dòng `refId`. Bot sang Vân Hải: `pnpm bots --count 40 --level 20 --gm "tele all;tp vh_hub;god on"` (cờ `--gm` mới của bot).
- Ghi chú: ở lần chạy 100 bot, tick p95 lên tới ~8 ms vào cuối 120 s (máy đang dùng chung với việc khác; Vân Lam không đổi); `world-van_hai` 33 bot chỉ 0,7 ms.

## Ảnh để duyệt

| | |
| --- | --- |
| Bố cục nhìn từ trên (map:report: đảo, cầu, tinh anh vàng) | *(ảnh đã gỡ khỏi repo)* |
| Nền minimap | _(ảnh đã gỡ)_ |
| Bản đồ lớn (phím M) | *(ảnh đã gỡ khỏi repo)* |
| Phù Đảo Các (điểm vào; đình dời khỏi trục điểm sinh để camera sau lưng không kẹt trong mái đình) | *(ảnh đã gỡ khỏi repo)* |
| Tùng Đài Đảo | _(ảnh đã gỡ)_ |
| Thạch Quy Đảo | _(ảnh đã gỡ)_ |
| Kính Hồ Đảo | *(ảnh đã gỡ khỏi repo)* |
| Lôi Vân Đảo | _(ảnh đã gỡ)_ |
| Kình Ngư Đài | _(ảnh đã gỡ)_ |
| Đình Phù Đảo | _(ảnh đã gỡ)_ |
| Cầu Xích Mây (điểm) | _(ảnh đã gỡ)_ |
| Kính Hồ Đài | _(ảnh đã gỡ)_ |
| Đỉnh Sấm | _(ảnh đã gỡ)_ |
| Vực Kình Ngư | _(ảnh đã gỡ)_ |
| Cầu xích, nhìn dọc cầu | *(ảnh đã gỡ khỏi repo)* |
| Giữa cầu | _(ảnh đã gỡ)_ |
| Bước ra mép cầu, đang rơi | _(ảnh đã gỡ)_ |
| Sàn mây (chỗ trống xa mọi đảo và cầu; nhân vật và mặt sàn rõ) | _(ảnh đã gỡ)_ |
| Sàn mây ngay sau khi rơi khỏi cầu (đứng dưới gầm cầu, còn nguyên máu) | _(ảnh đã gỡ)_ |
| Thang mây (chân thang trên sàn mây nhìn lên) | _(ảnh đã gỡ)_ |
| Đảo giả khi chưa quét (trông như đảo thật) | _(ảnh đã gỡ)_ |
| Đảo giả sau khi quét thần thức | _(ảnh đã gỡ)_ |

## Còn lại / để cho gói khác

- ~~E3-B~~ (xong, `docs/e3b-mons/`): quái, tinh anh, boss Vân Hải Kình Vương riêng, `loot.json`.
- **E3-H**: nhiệm vụ chương 3, NPC Lâm Chiếu Dung ở hub (hiện chỉ `q2_ket_dan` mở trận).
- **Mỹ thuật bản đồ 3**: bộ texture mặt đảo riêng (hiện dùng lại cỏ Vân Lam đã nhạt màu, màu đỉnh tông trầm), nhạc `wild_cloud`/`mirror_lake`/`wild_storm`, mood chi tiết, `prop_cau_may` (GLB cầu) nếu muốn thay cầu thủ tục, hồi sinh nhẹ ở đảo gần nhất khi rơi (hiện rơi xuống sàn mây rồi tự leo sườn đảo).
- Cảnh báo console `Vertex attribute "normal" not found` (5 lần) có từ trước ở các level mở rộng khác (Đoạn Mạch cũng vậy), không do gói này.
