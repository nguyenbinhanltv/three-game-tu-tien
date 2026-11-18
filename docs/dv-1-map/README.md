# DV-1: Bắc Hoang Tẫn Nguyên (bản đồ chương 5, cấp 28–31 thiết kế)

Gói bản đồ của chương 5 (`docs/DIVUC_DESIGN.md` mục 4, DV3-A kéo lên làm trước), theo mẫu E4-A (`docs/e4-a/`). Một bản đồ hai nửa, room riêng `world-bac_hoang`, địa hình dữ liệu hóa, 6 vùng, 90 cụm, 13 tinh anh, Tam Thủ Ngục Khuyển ở miệng nam Giới Khích, 7 trận `bh_*`, minimap, bảng màu phụ `rift_*`. **Quái/boss Dị Vực chỉ đặt chỗ**: dùng quái chương 4 có sẵn (model riêng là DV-2/DV3-B). Ảnh và video duyệt nằm ở artifacts của phiên, không commit.

## Đã có

| Thứ | Ở đâu |
| --- | --- |
| Địa hình: hoang nguyên tro, trạm/trận/điểm/bia phẳng, **Giới Khích là lòng máng lõm 14 m có nếp gấp** chạy nam → bắc dọc trục giữa (z −190 → −590, lượn nhẹ) | `packages/content/data/levels/bac_hoang.terrain.json` (đăng ký ở `packages/content/src/index.ts`) |
| Level: 6 vùng, 90 cụm, 13 tinh anh, boss, 6 điểm đáng chú ý, vị trí 5 Trấn Giới Bia (`spots`), 3 điểm hái | `packages/content/data/levels/bac_hoang.json` |
| Asset client (mood `ash_dawn`, ground `terrain-ochre`, không cỏ/cây, minimap) | `packages/content/data/levels/bac_hoang.assets.json` |
| Trận `bh_*` (7) | `packages/shared/src/teleport.bachoang.ts`, nối ở `teleport.ts` |
| Prop bày (85, chỉ asset sẵn có) | `packages/shared/src/props.bachoang.ts`; va chạm ở `terrain.colliders` |
| Chuỗi, glossary (`maps/zones/pois/teleports/spots`), `places.json` (`bh_*`) | `i18n/vi.json`, `vi.ui.json`, `glossary.json`, `places.json` |
| Nền minimap | `apps/client/public/map/bac_hoang.{webp,json}` (`pnpm minimap:build --level bac_hoang`) |
| **Bảng màu phụ `rift_*`** (8 màu, ngoài LUT 32 màu; `gen_palette.mjs` kiểm hex/id/trùng) | `assets/palette.json` `riftColors` |
| Mood `ash_dawn` (bên này) và `rift` (bên kia): preset grading, bầu trời, halo/beacon/đèn | `assets/palette.json` `grading.presets`, `render/{grading,sky,atmosphere}.ts`, `engine.ts` |
| Màu đất tro (bảng tro/huyết sậm, lòng khe tối) | `apps/client/src/game/terrain.ts` `ashColor` |
| Cỏ tắt theo `features.grass: false` (trước đây lớp cỏ tự bật lại mỗi lần cập nhật) | `game/grass.ts` `setEnabled` |
| Bộ sinh tất định | `tools/maps/gen-bac-hoang.mjs` (~3 phút) |
| Kịch bản bay ngang (webm + ảnh mốc) | `pnpm shots flyover --level bac_hoang --out <thư mục tuyệt đối>` (`tools/perf/src/scenarios/flyover.ts`) |
| Test | `packages/content/src/bachoang.test.ts`, `apps/server/src/game/bachoang.test.ts`, `teleport.levels.test.ts` |

Server không phải sửa gì: `index.ts` đăng ký room `world-bac_hoang` từ `LEVELS`; vào bản đồ bằng vé của Truyền Tống như các bản đồ trước (xác thực ở `static onAuth`). Không đụng `rooms.ts`, `index.ts`, `auth.ts`.

## Bố cục

Tọa độ (m) so với tâm bản đồ (1024, 1024); +x đông, +z nam, **bắc là −z**. Hộp chơi 1,44 × 1,44 km, chia thành các ô Voronoi có trọng số quanh tâm thiết kế (như E4-A), bỏ đĩa trạm r 75 m.

| Vùng | Tâm thiết kế | Cấp thiết kế → dữ liệu | km² | Điểm đáng chú ý | Trận |
| --- | --- | --- | --- | --- | --- |
| Vọng Bắc Trạm (an toàn, không vùng) | (0, +520) | | | | `bh_tp_tram` |
| Hàn Hôi Nguyên | (+300, +260) | 28 → 28 | 0,43 | Diệt Mạch Khẩu | `bh_tp_han_hoi` |
| Khô Lộc Lâm | (−320, +220) | 28–29 → 28 | 0,43 | Tàn Mạch Nhãn | `bh_tp_kho_loc` |
| Khích Giai | (0, −40) | 29 → 28 | 0,17 | Giới Khích (miệng nam); **Tam Thủ Ngục Khuyển** ở (0, −90) | `bh_tp_khich_giai` |
| Xích Tẫn Bình | (+340, −330) | 29–30 → 28 | 0,41 | Cổng Xích Tẫn Khích (chưa mở); bia 1, 2 | `bh_tp_xich_tan` |
| Kim Dạ Ngoại Uyển | (−340, −340) | 30–31 → 28 | 0,40 | Cổng Kim Dạ Cung (chưa mở); bia 3, 4 | `bh_tp_kim_da` |
| Trấn Giới Đài | (0, −600) | 31 → 28 | 0,22 | Trấn Giới Bia; bia 5; chỗ trống (0, −650) dành cho Thủ Khích Dực Chủ | `bh_tp_tran_gioi` |

- **Cấp bị kẹp ở 28** vì `MAX_LEVEL` hiện là 28 (thang cấp 29–32 là DV1-D, chưa làm). Bộ sinh giữ cấp thiết kế ở `zone.lvDesign` và kẹp bằng `LV_CAP`: khi DV1-D nâng trần thì bỏ kẹp, chạy lại, vị trí không đổi.
- Trận ba vùng bắc cách bia gần nhất 12–18 m (bộ sinh và test kiểm). Trận trạm `bh_tp_tram` **không mở sẵn** (nhiệm vụ `q5_bac_hanh` là DV3-H): thử bằng `/gm tele bh_tp_tram` từ Ngoại Thành Trạm (Thiên Khuyết) rồi bản đồ lớn (M) → Truyền tống. Cổng: chính trận này; tới nơi thì trận tự mở.
- Quái đứng tạm: Hàn Hôi `mon_co_thanh_chien_ma`; Khô Lộc `mon_da_minh_loc` + chiến mã; Khích Giai Dạ Minh Lộc + Cốt Vệ; Xích Tẫn/Kim Dạ/Trấn Giới quái Thiên Khuyết tương ứng; tinh anh `elite_cot_kiem_thong_linh|da_minh_loc_vuong|thach_tuong_dai_tuong` (2/2/2/2/3/2 = 13). DV3-B đổi id trong `MIX`/`ELITES` của bộ sinh.
- Vùng bên kia vẫn dùng chung bộ texture đất son và mood `ash_dawn`: **mood `rift` đã có preset nhưng chưa được dùng**, vì trộn mood theo vị trí quanh Khích Giai là DV1-C. Màu đất bên kia ngả tro than/huyết sậm bằng màu đỉnh (`ashColor`).

## Số đo (`pnpm map:report --level bac_hoang`)

| | |
| --- | --- |
| Cụm / quái thường / tinh anh / boss | 90 / 270 / 13 / 1 |
| Diện tích vùng săn | 2,05 km² |
| Mật độ | **132 quái/km²** (đạt 100–140) |
| Chỗ kẹt (4963 điểm quét) | **0** |
| Độ phủ chuẩn level (mép cụm gần nhất, lưới 12 m) | 99,1 % ≤ 70 m, p50 30,5 m, **p95 61,2 m, max 82,3 m** (chuẩn `COVER_BY_LEVEL.bac_hoang`: p95 ≤ 65, max ≤ 85: ĐẠT) |

Mục tiêu "mọi điểm ≤ 60–70 m" đạt ở p95 và 99 %; điểm xa nhất 82 m ở góc đông nam (hình học vùng với cụm r 30 m và trần mật độ 140). Mật độ chạm gần trần vì khe Giới Khích (không đặt bãi trong lòng khe) và hai đấu trường boss trống làm ít chỗ đặt cụm.

## Kiểm chứng

- `pnpm typecheck`, `pnpm test` (shared 214, content 49, client 755, server 700), `pnpm content:check`, `node tools/palette/gen_palette.mjs --check`: đạt.
- Ảnh/video/đo: xem mô tả PR (artifacts của phiên).

## Để lại cho gói khác

- **DV1-C**: trộn mood `ash_dawn` ↔ `rift` theo vị trí (80 m quanh Khích Giai), sửa art bible (ngoại lệ điều cấm 12 chỉ cho level `bac_hoang`).
- **DV1-D**: thang cấp 29–32; sau đó bỏ `LV_CAP`.
- **DV3-B/C/D/E/H/I**: quái Dị Vực, giới áp + bia thắp được, boss Thủ Khích, phó bản (hai cổng hiện chỉ là điểm đáng chú ý), nhiệm vụ `q5_*` và `unlockTele` cho `bh_tp_tram`, kiến trúc dị vực, texture đất tro, nhạc `wild_ash`/`wild_rift` (hiện mọi vùng dùng `wild`), tàn lửa trôi thay cỏ, bướm mạch quanh Tàn Mạch Nhãn.
- Ba level `kinh_nguyet`, `phuc_mach`, `than_tang` khai `grass: false` nên sau `setEnabled` không còn cỏ chui qua sàn hang (trước đó vẫn hiện).

## Đo hiệu năng (`pnpm bench:client --level bac_hoang`, Chrome, 1280×720, RTX 3060 Ti)

| Backend / preset | draw call tối đa | tam giác tối đa | CPU p50 | CPU p95 | texture MB |
| --- | --- | --- | --- | --- | --- |
| WebGPU Vừa | 84–112 | 247–376 k | 3,7–4,1 ms | 5,3–8,1 ms | 178 |
| WebGPU Cao | 104–132 | 367–469 k | 4,4–4,8 ms | 8,2–11,5 ms | 210 |
| WebGL2 Vừa | 86–110 | 255–369 k | 3,7–4,2 ms | 6,6–11,6 ms | 136 |
| WebGL2 Cao | 104–127 | 367–448 k | 3,9–4,4 ms | 6,6–9,2 ms | 136 |

Draw call (< 300), tam giác (< 2 triệu) và texture (< 512 MB) đạt; 0 lỗi console. CPU p95 vượt 8 ms ở vài điểm (đỉnh nhất thời, p50 ≤ 4,8 ms; cao nhất ở điểm đầu tiên của mỗi lượt khi còn nạp chunk). Bộ security bot không chạy lại vì không sửa `rooms.ts`/`index.ts`/`auth.ts`.

## Cấp tối thiểu (soát netcode #213)

`LevelDef.minLevel` (bac_hoang: 28): `GameRoom.requestLevel` từ chối cấp vé liên level khi cấp người chơi thấp hơn (báo `sys.dungeon_level`), kể cả khi đã mở khóa `bh_tp_tram`; đồng đội kéo theo (người dẫn tổ đội) thấp hơn thì bị bỏ qua. Test: `apps/server/src/game/bachoang.test.ts`. Lưu ý: `/gm tp` sang Bắc Hoang cũng cần cấp 28 (`/gm level 28` trước).

## Quái tạm

Quái thường/tinh anh ở các vùng cấp 28 là **quái chương 4 dùng tạm** (Thiên Khuyết, Cốt Vệ, Dạ Minh Lộc…); sẽ thay bằng quái DV-2 (#212) khi gói đó merge (đổi id ở `MIX`/`ELITES` của bộ sinh).
