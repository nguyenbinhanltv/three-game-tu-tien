# E2 · Thư viện prop 3 bản đồ mở rộng (18 GLB Tripo web)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2-props/<file>`.

Nguồn: `../dtl-asset-source/3d/prop/<id>/tripo/raw_v01.glb` → `assets/source/prop/<id>/meta.json` → `pnpm assets:build --only <id>` → `apps/client/public/assets/<id>.<hash>.glb`.
Chưa rải vào bản đồ nào (E2-A/E2-I). Ảnh turntable 4 hướng (trên trái: camera ở +Z nhìn mặt trước; phải; sau; trái): `docs/e2-props/<id>.png`, chụp bằng `pnpm shots asset --out <thư mục> --ids a,b` (trang xem `?show=<id>`, tắt tiếng).

| Bản đồ | Asset | Loại | Kích thước | LOD0 / LOD1 / LOD2 (tam giác) | Va chạm (`PROP_LIB`) |
| --- | --- | --- | --- | --- | --- |
| Đoạn Mạch | `prop_cong_khai_mach` | cổng phó bản | cao 6 | 4693 / 1873 / 694 | tròn r 4,4 |
| | `prop_cau_da_gay` | cầu (đi bộ) | dài 14 (trục Z) | 4832 / 1932 / 724 | không (E2 lo mặt đi) |
| | `prop_mach_tinh_tru` | POI, lặp | cao 3,5 | 2840 / 1136 / 426 | r 1,6 |
| | `prop_cay_goc_kho` | cây, lặp | cao 6 | 4868 / 1946 / 720 | r 0,9 |
| | `prop_tru_nham_do` | đá, lặp | cao 8 | 3788 / 1514 / 566 | r 2,8 |
| | `prop_ngung_dan_lo` | pháp bảo Kết Đan (lớp `artifact`) | cao 0,4 | 2964 / 1186 / 442 | — |
| Vân Hải | `prop_phu_dao_dinh` | đình | cao 6 | 4783 / 1843 / 650 | không |
| | `prop_cau_may` | cầu (đi bộ) | dài 18 (trục Z) | 3868 / 1602 / 544 | không |
| | `prop_kinh_ho_dai` | POI | rộng 6 | 3834 / 1534 / 574 | r 2,8 |
| | `prop_da_troi` | đá lơ lửng, lặp | cao 8 | 2774 / 1110 / 412 | không (trên cao) |
| | `prop_tung_phu_dao` | cây, lặp | cao 7,5 | 4737 / 1802 / 668 | r 0,8 |
| | `prop_anh_ngoc_kinh` | pháp bảo Nguyên Anh | rộng 0,35 | 2428 / 1054 / 364 | — |
| Cổ Thành | `prop_dai_tinh_bai` | POI | rộng 8 | 3781 / 1509 / 567 | r 3,8 |
| | `prop_cong_thanh_vo` | cổng (rộng 24, lối đi 7 m) | cao 14 | 4999 / 1999 / 737 (gốc 5577, hạ về trần lớp 5000) | hai tháp r 4,5 ở x = ±8 |
| | `prop_den_long_troi` | đèn, lặp | cao 1,2 | 1113 / 444 / 155 | không |
| | `prop_tru_da_khac_van` | cột, lặp | cao 9 | 2958 / 1182 / 444 | r 1,4 |
| | `prop_tuong_da_vo_si` | đầu tượng vỡ (mặt nhìn +Z) | cao 7 | 4238 / 1694 / 630 | ba tròn r 2,8 |
| | `prop_than_nien_chau` | pháp bảo Hóa Thần | rộng 0,25 | 1926 / 770 / 280 | — |

- **Hướng**: Tripo xuất mặt trước ở +Z của glTF cho cả 18 asset này (khác prop cũ nhập `yaw -90`), nên `yaw: 0` với `orient: none`; riêng `prop_cau_da_gay` (trục dài raw theo X) dùng `yaw: -90` để chạy theo Z như `prop_cau_may`.
- **Dữ liệu**: `packages/shared/src/propLib.ts` (`PROP_LIB`, `propLibForMap`, `propColliders(id, x, z, yaw, s)`), mốc để E2 rải. Cờ `repeat` = dùng pool instancing có sẵn của `game/props.ts` (LOD theo cây), cờ `walkable` = cầu cần mặt đi bộ chứ không chỉ va chạm.
- **Nạp lười**: `apps/client/src/game/mapPropLib.ts` `prefetchMapProps(map)`; không gọi từ `preload.ts` (test chứng minh tải đầu Vân Lam không nạp prop mới). Tổng 8,6 MB cho cả ba bản đồ, mỗi bản đồ ~2,8 MB.
- **Texture**: môi trường 1024 màu / 512 dữ liệu (lớp `prop`), pháp bảo và đèn 512 (`artifact`). Máy này không có `toktx` nên GLB giữ PNG/JPEG (có cảnh báo); chạy lại `assets:build` khi có KTX-Software để nén KTX2.
- Pháp bảo (`prop_ngung_dan_lo`, `prop_anh_ngoc_kinh`, `prop_than_nien_chau`) chỉ đăng ký asset; dữ liệu `artifacts.json` và `artifactVis.ts` để E2-F nối.
