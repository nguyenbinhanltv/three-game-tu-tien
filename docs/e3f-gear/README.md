# E3-F · Trang bị bậc 3, Thăng Bậc 2 → 3, ba bộ Vân Hải, đan bậc 3

Theo mẫu E2-F (`docs/e2f-gear/`). Phạm vi: bậc 3 (Vân Hải, `reqLevel` 20–23, hệ số dòng chính `TIER_MUL[3]` = 2,5) chơi được: `TIER_OPEN = 3`. Bậc 4 (Thiên Khuyết, cấp 24–27) vẫn khóa cho E4.

> **Lệch chữ so với đề bài.** Đề ghi "bậc 3 (cấp 24–27)". Bảng 7.1 của `docs/EXPANSION_DESIGN.md` đặt bậc 3 = chương 3 Vân Hải, `reqLevel` 20–23, còn cấp 24–27 là bậc 4 (Tinh Khuyết). Gói này theo thiết kế (bậc 3, cấp 20); đồ cấp 24–27 là bậc 4, thuộc E4.

## Dữ liệu

- **Hai kiếm bậc 3** dùng hai model Tripo đã nhập ở #119: `itm_kinh_quang_kiem` Kính Quang Kiếm (`prop_kiem_kinh_quang`, cấp 20, Linh phẩm) và `itm_tinh_khuyet_kiem` Tinh Khuyết Kiếm (`prop_kiem_tinh_khuyet`, cấp 22, Huyền phẩm, công +12% so Kính Quang; mẫu rơi từ ilvl 22). Kiếm Tinh Khuyết bậc 4 ở thiết kế 7.1 vẫn thuộc E4 (khi đó đổi id/tên).
- **7 mẫu thường bậc 3** (`templates.json`, `reqLevel` 20, rarity Linh): Kính Quang Kiếm (`model: prop_kiem_kinh_quang`, kiếm Tripo sẵn có từ #119), Kính Vân Đạo Bào, Lưu Ly Hộ Uyển, Phù Vân Ngoa, Ngân Hà Đai Lưng, Kính Tâm Ngọc Bội, Lưu Quang Giới Chỉ. `stats` = bậc 2 × 2,5/1,6; `sell` = bậc 2 × 14.000/9.000 để `enhanceCost` ra giá cơ sở 14.000 cho kiếm (mục 7.3).
- **3 bộ** (`sets.json`, `setItems.json`; mỗi bộ 4 món, `reqLevel` 20, rarity Huyền, `src: forge`):

| Bộ | Món | 2 món | 4 món (fx) |
| --- | --- | --- | --- |
| `set_kinh_quang` Kính Quang Kiếm Y | đạo bào, hộ uyển, đai, ủng (`itm_kq_*`) | +5% bạo kích | `nghich_kiem`: Nghịch Kiếm Chuyển Phong hoàn 40% hồi chiêu còn lại nếu lướt hạ được ít nhất một quái |
| `set_van_kinh` Vân Kình Thiết Giáp | đạo bào, hộ uyển, đai, ủng (`itm_vk_*`) | +10% khí huyết | `dich_son`: Dịch Sơn Xung choáng thêm 0,5 s (quái thường; tinh anh nửa, boss miễn như mọi choáng) |
| `set_luu_ly` Lưu Ly Đan Y | đạo bào, ngọc bội, đai, giới chỉ (`itm_ll_*`) | +12% hồi nhận | `ngung_dan`: khiên Ngưng Đan Hộ Thế mạnh thêm 5% |

  Bộ bậc 2 trỏ `promoteTo` sang món cùng ô của bộ bậc 3 (Liệt Mạch → Kính Quang, Địa Long → Vân Kình, Phục Mạch → Lưu Ly). **Lệch thiết kế**: thiết kế ghi 2 món Lưu Ly "+12% khiên đan", nhưng chưa có chỉ số dòng phụ cho khiên, nên dùng `heal_recv` +12%; phần khiên nằm ở hiệu ứng 4 món.
- **Hook combat** nối ngay (khác E2-F phải chờ E2-G, vì ba chiêu đã có): `SetFx.nghichKiemRefund | dichSonStun | ngungDanBoost` đọc trong `GameSim` (`onDash`, `executeSkill` case `shield`), cùng chỗ với ba hiệu ứng bậc 2. Không đụng chuyển động (E3-K).
- **Chế tạo** (`forge.json`): 12 công thức `frg_kq_*|vk_*|ll_*` ở Hứa lão + Thiết lão (`alsoAt`), cảnh giới 20, `ilvl` 21, Huyền 80% / Địa 20%; áo cần 14 Kính Hoa Sa + 10 Thiết Tinh + 5 Linh Trần + 1 Bích Ngọc Nhĩ, món khác 9/6/3; phí 2.960 (áo) và 1.850 (món khác).
- **Nguyên liệu** (`items.json`): Kính Hoa Sa (`PROMOTE_MAT[3]`, đã có sẵn trong `upgrade.ts`), Vân Hải Lộ, Bích Ngọc Nhĩ. Rơi qua lớp `$mats` của `loot.json` cho quái, tinh anh, boss bản đồ 3 theo mục 6.2 (quái thường 12%/10%; tinh anh Kính Hoa Sa 2–3, Vân Hải Lộ 50%, Bích Ngọc Nhĩ 30%; boss thêm Dưỡng Anh Đan 12%). **Quái bản đồ 3 chưa có trong `monsters.json`/`loot.json`** (E3-A): lớp này chỉ có hiệu lực khi quái có bảng rơi, y như E2-F; không có `drops` trong `monsters.json`.
- **Đan** (`alchemy.json`, Tố Tâm, cảnh giới 20): Vân Kim Cương Đan (+18% phòng ngự), Vân Bạo Huyết Đan (+15% bạo kích), Vân Mãnh Lực Đan (+18% công kích), phẩm Hạ/Trung/Thượng như đan cũ. `itm_pha_canh_dan_3` Vân Phá Cảnh Đan (cảnh giới 21): `bottleneckPill(level)` trả đan này từ cấp 21 (kể cả bình cảnh Kết Đan 23 và Nguyên Anh 25/27; hai nút sau vẫn bị `peakGated` chặn đến khi E3-L bật Tam Trọng Kiếp).
- **Vật phẩm đột phá Nguyên Anh**: **Dưỡng Anh Đan** (`itm_duong_anh_dan`, hiếm; chế ở Tố Tâm cảnh giới 23: 3 Bích Ngọc Nhĩ + 10 Vân Hải Lộ + 6 Linh Thảo, 2.400 linh thạch, không có phẩm; rơi hiếm ở boss bản đồ 3). **`tribulations.json` giữ nguyên** (`nguyen_anh.enabled=false`, `item=null`): E3-L bật cờ và gán `item: "itm_duong_anh_dan"`.
- **Chưa làm** (cần cơ chế mới, để E3-L/M): Thanh Tâm Đan (kháng tâm ma), Thiên Lôi Hộ Đan (`tribRes`), Hồi Mạch Đan bậc 3, linh ngọc cấp 4–6, ngọc thần thức, Định Thần Phù, Anh Ngọc Kính (pháp bảo bản mệnh Nguyên Anh).

## Mã

- `TIER_OPEN = 3`; Thăng Bậc 2 → 3 chạy bằng đường E2-F (không đổi `apps/server/src/game/upgrade.ts`): Kính Hoa Sa ×20 + 2.960 linh thạch (0,4 × 7.400), giữ phẩm/dòng phụ/ngọc, thêm lỗ khảm, cường hóa −3, một `Character.tx`, ledger −món cũ/+món mới.
- `accessoryCode` không còn giới hạn 9 bộ (mỗi ký tự = mã ASCII 48 + thứ tự bộ, `ACC_MAX_SETS = 40`); hiện 10 bộ. Phụ kiện thủ tục + bảng màu 3 bộ ở `setAccessories.ts`; recolor áo theo `look` của bộ.
- `gear.ts` hiện dòng hiệu ứng bộ mới (`set.fx.nghich_kiem|dich_son|ngung_dan`); tooltip so sánh (TD-C) tự đọc chỉ số mẫu bậc 3, dòng "Bậc 3" ở dòng phụ.

## Icon (Codex, không tốn credit)

28 icon mới (`tools/codex-assets/icons.json`, vẽ bằng `node tools/codex-assets/gen.mjs icons <id…>`; PNG nguồn ở `../dtl-asset-source/2d/icons/`), thêm hàng LICENSES, `pnpm icons:build` rồi `pnpm icons:check`: **170/170 có tranh, 0 emoji dự phòng**. Ảnh: `icons-grid.jpg`.

## Kinh tế và cân bằng (`pnpm sim:progress`)

- Chương 3: thu nhập ≈ 53.280 (6 giờ × 7.400 × 1,2); hố tiêu cầu toàn 69.303 = Thăng Bậc 7 ô 20.720 + cường hóa +5 bốn ô 40.073 + chế một bộ 8.510 → **1,30×** (cờ LỖI nếu ngoài 1–2,5×; chương 2 vẫn 1,75×).
- Bảng mới "Trang bị theo bậc" (bộ 7 món thường Huyền phẩm, 40 lần roll, quái cùng khuôn cấp L). Lực chiến `combatPower` (#140) không đồ → có đồ: bậc 1 cấp 13: 444 → 1.075 (2,42×); bậc 2 cấp 17: 907 → 2.178 (2,40×); bậc 3 cấp 21: 1.714 → 4.103 (2,39×). Lực chiến bậc cao hơn luôn vượt bậc thấp; sim báo LỖI nếu một bậc đổi lực chiến ngoài 1,1–3,2× hoặc TTK ngoài 2,5–8,5 s. TTK có đồ ≈ 2,8–3,4 s so với 6 s không đồ.
- Tỉ lệ ×2,4 gần như đều ở ba bậc (bậc mới không làm đồ lạm phát so với bậc cũ); phần "trang bị trong sức mạnh tổng" đo ở đây cao hơn 30% thiết kế ở cả bậc 1, nên đó là chênh lệch có sẵn của sim (tính cả nội tại roll), không phải do E3-F.

## Kiểm

Test mới: `promote.test.ts` (Thăng Bậc 2 → 3 cho cả ba bộ, kiếm, chặn dưới cảnh giới 20, chế bậc 3, bậc 3 không thăng được), `e2g.test.ts` (ba hiệu ứng 4 món), `shared/sets.test.ts` (mã phụ kiện > 9 bộ), `shared/tier.test.ts` (`promoteOpen`, `bottleneckPill`), `client/ui/gear.test.ts` (dòng "Bậc 3", so sánh với đồ bậc 2, chữ hiệu ứng). Chạy lại: `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress`, security, `pnpm bots --count 100` + `pnpm ledger:check` (kết quả ở phần cuối).

Ảnh trong game: `pnpm --filter @dtl/perf run shots:e3f --out <thư mục tuyệt đối>` (Thăng Bậc trước/sau, tooltip, chế tạo, luyện đan), `pnpm shots:sets --sets set_kinh_quang,set_van_kinh,set_luu_ly --level 20 --out …` (nam/nữ), `pnpm shots:kiem --only kinh-quang-vp` hoặc `--model prop_kiem_kinh_quang` (kiếm).

## Kết quả kiểm (2026-11-16, sau khi hợp nhất main tới #142)

- `pnpm typecheck` sạch; `pnpm content:check` hợp lệ, `icons:check` 169/169; `pnpm sim:progress` không có dòng LỖI (chương 3: 1,30×; bảng đồ bậc 3 ở trên).
- `pnpm test`: shared 188, content, perf, asset-pipeline đều qua. Chạy `pnpm -r test` một lượt thì máy quá tải làm 12 file server và 2 file client lỗi do hết thời gian `beforeAll` (10 s) hoặc đo CPU; chạy lại riêng: client 2/2 qua, server 31/32 file, còn **một bài flaky có sẵn** `e2g.test.ts` "Mộc Linh Trận kéo dài thêm mocLinhDur" (so 134,1 với 135,5 ở một lần chạy, lần khác qua; E2-G, không đụng tới bởi gói này).
- Security (`pnpm --filter @dtl/bot-client security`, server dev ở 2641, không `RATE_LIMIT_EXEMPT`): **132 mục, tất cả ĐẠT**.
- `pnpm bots --count 100 --duration 120` (server có `RATE_LIMIT_EXEMPT=loopback`): 100 bot vào, 0 thất bại, **0 dòng `refId`**, tick p95 2,4–3,2 ms lúc đầu và 7–8 ms ở nửa sau (lúc đó máy đang chạy thêm typecheck/sim và bot đã lên cấp); `pnpm ledger:check`: 100 nhân vật, 1.882 dòng, **sổ cái khớp**.
- Playtest bằng Chromium (WebGPU, tắt tiếng `?mute=1` + `--mute-audio`, tài khoản thử, cổng 2639/5239, server tự tắt sau khi chụp).

## Ảnh

- UI: `ui-promote-truoc.jpg` (bảng Thăng Bậc, bốn món Liệt Mạch → Kính Quang, phí 2.960), `ui-promote-tooltip-bac2.jpg`, `ui-promote-sau.jpg`, `ui-promote-tooltip-bac3.jpg` (tooltip đạo bào bậc 3 + dòng bộ 1/4 + hiệu ứng 4 món), `ui-forge-bac3.jpg` (tab chế tạo, ba bộ mới), `ui-luyen-dan-bac3.jpg`, `ui-tooltip-so-sanh-bac3.jpg` (tooltip so sánh với đồ bậc 2 đang mặc: chỉ số tăng xanh, mất đỏ, **Lực chiến +116**), `icons-grid.jpg` (28 icon mới).
- Nhân vật mặc 3 bộ mới, nam và nữ: `set_<bộ>-<m|f>-<truoc|sau|nghieng|chem>.jpg` (cũng chụp lúc chạy và lúc bay: tệp `-chay|-bay` được bỏ khỏi repo cho nhẹ; chạy lại `pnpm shots:sets --sets set_kinh_quang,set_van_kinh,set_luu_ly --level 20` để có).
- Hai kiếm bậc 3 (nam và nữ × đeo lưng / cầm tay / chém): `kiem-kinh_quang-<m|f>-<deo-lung|cam-tay|chem>.jpg`, `kiem-tinh_khuyet-...` (chụp bằng `shots:kiem --model prop_kiem_<id> --gender m|f`, tên tệp nay có hậu tố giới tính).

## Việc để lại

- Thanh Tâm Đan, Thiên Lôi Hộ Đan, Hồi Mạch Đan bậc 3, linh ngọc cấp 4–6, Anh Ngọc Kính, Phá Ấn Phù/Định Thần Phù: chờ cơ chế của E3-L/M/E4.
- Nguyên liệu bậc 3 chỉ rơi khi E3-A thêm quái bản đồ 3 và bảng rơi của chúng; trước đó chỉ lấy được bằng GM (`give`).
- Gắn `item: "itm_duong_anh_dan"` vào `tribulations.json` (`nguyen_anh`) và bật cờ: E3-L.
