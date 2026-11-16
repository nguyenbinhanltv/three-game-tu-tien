# E3-H2: hai nhiệm vụ phụ chương 3 còn thiếu · Vân Hải

Nối tiếp E3-H (`docs/e3h-quests/`). Cả hai giao và trả ở Lâm Chiếu Dung (Phù Đảo Các), dùng loại mục tiêu có sẵn của E2-H (`escort`, `touch`; server chấm ở `apps/server/src/game/questobj.ts`), không thêm mã server mới.

| Nhiệm vụ | Yêu cầu | Mục tiêu | Thưởng |
| --- | --- | --- | --- |
| `s3_do_thuyen` Ba Chuyến Qua Cầu | cấp 20, xong `q3_len_may` | hộ tống `esc_do_thuyen` tới nơi | 1.800 tu vi, 700 linh thạch, 2 Kính Hoa Sa |
| `s3_guong_nuoc` Gương Nước Kính Hồ | cấp 21, xong `q3_than_thuc` | chạm 4 điểm `guong_nuoc_1…4` quanh Kính Hồ Đài | 2.000 tu vi, 700 linh thạch |

## Dữ liệu

- `levels/van_hai.json`: `spots` (4 mảnh gương, đều nằm trong vùng `kinh_ho_dao`, `content:check` kiểm) và `escorts` (`esc_do_thuyen`, 4 m/s). Bộ sinh `tools/maps/gen-van-hai.mjs` đã thêm đúng hai khối này để chạy lại không mất.
- Hộ tống đi **một tuyến dài ba chuyến** (cơ chế hộ tống chỉ cho một người đồng hành mỗi mục tiêu, và mọi mục tiêu `escort` đang mở chạy cùng lúc nên không tách ba mục tiêu): Phù Đảo Các → Tùng Đài Đảo → về hub → Thạch Quy Đảo → về hub → qua cầu nam sang Kính Hồ Đảo (đích gần Kính Hồ Đài). Đi dọc các cầu `cau_phu_dao_cac_*`; bỏ xa hơn 14 m thì bà đứng đợi, hơn 90 m thì quay về điểm đầu (làm lại).
- Người đồng hành là `npc_lam_chieu_dung_do` (cùng tên "Lâm Chiếu Dung" ở glossary `stationNpcs`; `content:check` cấm dùng id NPC đứng thật). Skin cùng `look` với Lâm Chiếu Dung ở `npcSkins.ts`.
- Chữ: i18n `quest.s3_*`, `spot.guong_nuoc_*`, `npc.npc_lam_chieu_dung_do.*`; tên điểm ở `glossary.spots`.

## Sửa client kèm theo

`EntityManager.setEscort` (`entities.ts`) trước đây dựng người đồng hành bằng `npcSkins.create`, bỏ qua `look` (nên hiện thành model Thiết Lão). Nay dùng `npcModel` như NPC đứng; clip đi bộ K-3 chỉ gắn cho NPC không có `look`.

## Kiểm

- `apps/server/src/game/quest3b.test.ts` (4 test): dữ liệu, chạm gương một lần, đi hết tuyến hộ tống rồi trả một lần (ghi ledger `quest:<id>`), bỏ xa thì quay về.
- `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress` (không cờ LỖI mới), `security` 139/139 đạt trên DB mới, 100 bot 120 s (tick p95 ~9 ms, 0 dòng `refId`), `ledger:check` khớp.
- Ảnh (`pnpm --filter @dtl/perf run shots:e3h2 --out <thư mục tuyệt đối>`, tắt tiếng): `01` hộp thoại Lâm Chiếu Dung, `02` theo dõi nhiệm vụ, `03`–`05` hộ tống từ Phù Đảo Các qua cầu, `06`–`08` chạm bốn mảnh gương ở Kính Hồ Đài. Log: `e3h2-log.json`.

## Việc để lại

- Hộ tống chưa có điểm dừng/thoại ở từng đảo (cần mở rộng `EscortDef` ở server).
- Mảnh gương chưa có prop dựng riêng (chỉ có điểm chạm và dòng tiến độ); tiến độ `touch` chưa có chỉ báo trên bản đồ.
