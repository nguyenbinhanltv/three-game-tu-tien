# E4-A: Thiên Khuyết Cổ Thành (bản đồ 4, cấp 24–27)

Gói E4-A của E-4 Hóa Thần (`docs/EXPANSION_DESIGN.md` mục 4.3, 11.2, 11.3). Làm theo mẫu E2-A (`docs/e2-map/`) và E3-A (`docs/e3-map/`). Chưa có quái riêng, boss, nhiệm vụ, phó bản (E4-B và các gói sau). Chỉ dùng asset sẵn có (PROP_LIB `co_thanh` đã vào từ #118, cỏ/cây/đá Vân Lam), không Tripo.

## Đã có

| Thứ | Ở đâu |
| --- | --- |
| Địa hình dữ liệu hóa (cao nguyên thành cổ, đại lộ phẳng, quảng trường, trận, điểm đáng chú ý) | `packages/content/data/levels/thien_khuyet.terrain.json` (đăng ký ở `packages/content/src/index.ts`) |
| Level: 5 vùng, 80 cụm, 12 tinh anh, 5 điểm đáng chú ý, 3 điểm hái, điểm vào | `packages/content/data/levels/thien_khuyet.json` |
| Khai báo asset client (mood `night`, nhạc `wild`, minimap) | `packages/content/data/levels/thien_khuyet.assets.json` |
| Trận truyền tống `tk_*` (6) | `packages/shared/src/teleport.thienkhuyet.ts`, nối ở `teleport.ts` |
| Prop bày (108): 2 hàng trụ khắc vân + đèn trời dọc đại lộ, Cổng Thành Vỡ, tượng đá võ sĩ, Tinh Bái Đài... | `packages/shared/src/props.thienkhuyet.ts`; va chạm nhiều vòng (cổng, tượng, trụ) ở `terrain.colliders` |
| Chuỗi: `map.thien_khuyet`, `zone.*`, `poi.*`, `tele.tk_*`; glossary `maps/zones/pois/teleports` | `packages/content/data/i18n/vi.json`, `vi.ui.json`, `glossary.json` |
| Điểm đặt tên `?at=` và `/gm tp` (`tk_tram`, `tk_dai_lo`, `tk_lam_sao`, `tk_binh_khi`, `tk_dien_tien`, `tk_mo_dao`) | `packages/content/data/places.json` |
| Nền minimap | `apps/client/public/map/thien_khuyet.{webp,json}` (`pnpm minimap:build --level thien_khuyet`) |
| Họa tiết bảng tên vùng cho Cartouche | `ui/ngj/ngj.tsx` (`MapMotif`), `ngj.css` |
| Bộ sinh tất định | `tools/maps/gen-thien-khuyet.mjs` (~45 s) |
| Test | `packages/content/src/thienkhuyet.test.ts`, `apps/server/src/game/thienkhuyet.test.ts`, `teleport.levels.test.ts` |
| Ảnh trong game | `pnpm shots points --level thien_khuyet --out <thư mục tuyệt đối>` (`tools/perf/src/shots-e4a.ts`) |

Server không phải sửa gì: `index.ts` đăng ký room `world-thien_khuyet` từ `LEVELS`. Không đụng `rooms.ts`, `index.ts`, `auth.ts`, nên không cần chạy lại bộ security.

## Bố cục

Tọa độ so với Ngoại Thành Trạm (+x đông, +z nam). Trạm ở giữa thế giới (1024, 1024). Vùng chơi 1,52 × 1,52 km (`play` lệch 140 m về phía bắc vì Điện Tiền ở z = −640). Mỗi vùng là một ô Voronoi có trọng số quanh vị trí thiết kế (đường biên thẳng), bỏ đĩa trạm bán kính 75 m.

| Vùng | Tâm thiết kế | Cấp | km² | Quái thường | Tinh anh | Điểm đáng chú ý | Trận |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ngoại Thành Trạm (an toàn) | (0, 0) | | | | | Cổng Thành Vỡ (cảnh quan), lò đan | `tk_tp_tram` |
| Đại Lộ Đèn Trời | (60, −280) | 24–25 | 0,27 | 35 | 2 | Hàng Trụ Khắc Vân | `tk_tp_dai_lo` |
| Lâm Sao Viên | (−380, −40) | 24–25 | 0,44 | 58 | 2 | Tinh Bái Đài | `tk_tp_lam_sao` |
| Binh Khí Khố | (420, −90) | 25–26 | 0,48 | 54 | 3 | Kho Giáo | `tk_tp_binh_khi` |
| Điện Tiền Quảng Trường | (20, −640) | 26–27 | 0,44 | 51 | 3 | Cổng Thần Tàng Điện | `tk_tp_dien_tien` |
| Mộ Đạo | (−60, 420) | 24–26 | 0,35 | 42 | 2 | Cổ Thành Thất Lộ (chỗ Thiên Khuyết Thủ Linh) | `tk_tp_mo_dao` |

Đại lộ chạy từ Cổng Thành Vỡ (z −100) tới Điện Tiền, phẳng ở cao độ 80 (dải đĩa phẳng, test kiểm). Đấu trường boss (bán kính 38 m quanh Cổ Thành Thất Lộ) để trống.

Khác thiết kế: vùng thiết kế ghi bán kính r (160–220 m) nhưng 60 cụm ≈ 230 quái ở 120/km² cần ~2 km², nên các vùng chia kín hộp chơi (như Đoạn Mạch) thay vì đĩa riêng lẻ; số cụm là 80 cụm × 3 con (240 quái) vì cụm bán kính 30 m và chuẩn độ phủ, không phải 60 cụm × 4. Tinh anh 2/2/3/3/2 = 12 (mỗi vùng 2–3 theo `levelcheck`; thiết kế ghi Mộ Đạo ×1).

## Quái tạm

Chưa có định nghĩa quái Thiên Khuyết (E4-B), nên `camps`/`spawns` dùng mẫu sẵn có để đặt chỗ: Đại Lộ `mon_khai_mach_khoi_loi`, Lâm Sao `mon_van_hac`, Binh Khí `mon_mach_thuong_ho_ve` + `mon_kinh_linh`, Điện Tiền trộn ba loại, Mộ Đạo `mon_mach_thuong_ho_ve`; tinh anh `elite_ho_mach_khoi_tuong|van_hac_vuong|liet_cot_bao|kinh_dien_ma_quan`. Cấp quái theo vùng (24–27). E4-B đổi id `mon` trong bảng `MIX`/`ELITES` của bộ sinh (thứ tự random không phụ thuộc id nên vị trí không đổi) hoặc sửa thẳng `thien_khuyet.json`, và đặt `boss_thien_khuyet_thu_linh` ở `(964, 1504)`.

## Đường đi

- Vân Hải / Đoạn Mạch / Vân Lam → Thiên Khuyết: trận `tk_tp_tram`, **không mở sẵn**. Thiết kế: mở sau `q3_nguyen_anh`; chuyện `unlockTele` trong `quests.json` thuộc E4-H (gói nhiệm vụ chương 4). Thử bằng `/gm tele tk_tp_tram` (hoặc `tele all`) rồi dùng bản đồ lớn (M) → Truyền tống. Tới nơi thì trận trạm tự mở. Mỗi vùng một trận, mở khi chạm. Về: `vh_tp_hub`, `dm_tp_tram` hoặc `tp_tong_mon`.
- Môn phong ấn (cơ chế riêng ở thiết kế 4.3) và cổng Thần Tàng Điện (phó bản) chưa làm: E4-M.

## Số đo (`pnpm map:report --level thien_khuyet`)

| | |
| --- | --- |
| Cụm / quái thường / tinh anh / boss | 80 / 240 / 12 / 0 (E4-B) |
| Diện tích vùng săn | 1,984 km² |
| Mật độ | **121,0 quái/km²** (đạt 100–140; đoạn 112–132 giữa các vùng) |
| Chỗ kẹt (5351 điểm quét) | **0** |
| Độ phủ chuẩn mới (mép cụm gần nhất, lưới 12 m) | 98,0 % ≤ 70 m, p50 33,2 m, **p95 64,4 m, max 83,3 m** (chuẩn `COVER_BY_LEVEL.thien_khuyet`: p95 ≤ 65, max ≤ 85: ĐẠT) |

Khoảng cách từ mọi điểm săn tới mép cụm gần nhất không quá 83 m (phần lớn ≤ 65 m), với cụm bán kính 30 m và 120 quái/km² thì đây là mức hình học cho phép (xem `packages/content/src/coverage.ts`).

## Kiểm chứng

- `pnpm typecheck`, `pnpm content:check`: đạt. `pnpm test`: server 598, client 730, content 43 đạt; `packages/shared` có 1 lỗi cũ `fxtimeline.test.ts` ("tia sét không gộp", không liên quan gói này, không sửa).
- 40 bot sang bản đồ mới (`pnpm bots --count 40 --level 24 --gm "tele all;tp tk_tram;god on"`, 50 s): 39 người trong `world-thien_khuyet` (252 quái), tick p95 1,4–1,9 ms, 0 dòng `refId`.
- Ảnh chụp ở 1280×720, WebGPU, preset Vừa, tắt tiếng: 31–55 draw call, 160–280 nghìn tam giác, khung 8,3 ms (trần 120 fps của headless). Cảnh báo console có từ trước ở các level mở rộng (`Vertex attribute "normal"`, `Draw ... index count of 0`).

## Ảnh để duyệt

| | |
| --- | --- |
| Bố cục nhìn từ trên (ranh vùng, tinh anh vàng, địa hình) | ![](layout-topdown.jpg) |
| Nền minimap | ![](minimap-nen.jpg) |
| Bản đồ lớn (phím M) | ![](worldmap.jpg) |
| Ngoại Thành Trạm, Cổng Thành Vỡ phía bắc | ![](tram.jpg) |
| Trạm, gần nhân vật (đọc được thân người ban đêm) | ![](tram-can.jpg) |
| Đại Lộ Đèn Trời, đầu đại lộ | ![](dai-lo.jpg) |
| Đại lộ, nhìn xa | ![](dai-lo-xa.jpg) |
| Điện Tiền Quảng Trường | ![](quang-truong.jpg) |
| Vùng Đại Lộ Đèn Trời | ![](zone-dai_lo_den_troi.jpg) |
| Vùng Lâm Sao Viên | ![](zone-lam_sao_vien.jpg) |
| Vùng Binh Khí Khố | ![](zone-binh_khi_kho.jpg) |
| Vùng Điện Tiền Quảng Trường | ![](zone-dien_tien_quang_truong.jpg) |
| Vùng Mộ Đạo | ![](zone-mo_dao.jpg) |
| Hàng Trụ Khắc Vân | ![](poi-hang_tru_khac_van.jpg) |
| Tinh Bái Đài | ![](poi-tinh_bai_dai.jpg) |
| Kho Giáo | ![](poi-kho_giao.jpg) |
| Cổng Thần Tàng Điện | ![](poi-cong_than_tang_dien.jpg) |
| Cổ Thành Thất Lộ | ![](poi-co_thanh_that_lo.jpg) |

## Còn lại / để cho gói khác

- **E4-B**: quái, tinh anh, boss Thiên Khuyết Thủ Linh riêng, `loot.json`; thay quái tạm (xem trên).
- **E4-H**: nhiệm vụ chương 4, NPC Mặc Chiếu, `unlockTele: ['tk_tp_tram']` cho nhiệm vụ nối `q3_nguyen_anh`.
- **E4-I (mỹ thuật bản đồ 4)**: mặt đất hiện dùng bộ texture Vân Lam (cỏ xanh, nên cảnh còn "đồng cỏ ban đêm" hơn là sân đá thành cổ): cần bộ texture lát đá/đá xám-lam, cỏ `prop_co_co_thanh`, nhạc `wild_night`/`wild_night_war`/`boss_thu_linh` (hiện cả 5 vùng là `wild`), đường cong giờ riêng, thêm cột đá/tường thành vỡ rải theo vùng, mood `night` có thể cần "ban đêm bớt tối".
- **E4-M**: môn phong ấn (xuất khiếu), cổng và phó bản Thần Tàng Điện.
