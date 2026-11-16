# E3-H: nhiệm vụ chương 3 · Vân Hải

9 nhiệm vụ chính (`q3_*`) + 2 phụ (`s3_*`), NPC Lâm Chiếu Dung và Tô Vãn Ngư (bản Phù Đảo Các, id `npc_to_van_ngu_hai`). Mẫu: E2-H (`docs/e2h-quests/`). Toàn bộ dùng loại mục tiêu sẵn có (`kill`, `gather`, `talk`, `scan`, `dungeon`, `breakthrough`), không thêm mã server mới.

## Chuỗi

`q3_len_may` (giao ở Tô Vãn Ngư tại Hạ Khuyết Trạm, trả ở Lâm Chiếu Dung; **nhận là mở trận `vh_tp_hub`**, `unlockTele`) → `q3_van_hac` (Vân Hạc ×14) → `q3_than_thuc` (Tô Vãn Ngư; `scan` Đình Phù Đảo, Cầu Xích Mây, Kính Hồ Đài) → `q3_kinh_linh` (Kính Linh ×16 + Kính Hoa Sa ×8) → `q3_thach_quy` (Phù Đảo Thạch Quy ×12) → `q3_loi_van` (Lôi Vân Sư Vương) → `q3_kinh_nguyet` (`dungeon` `kinh_nguyet_cung`) → `q3_kinh_vuong` (Vân Hải Kình Vương) → `q3_nguyen_anh` (`breakthrough nguyen_anh`; **giữ nguyên như main**: giao/trả ở Khưu Hàn Sơn, chỉ cần `q2_ket_dan`, để không chặn người chơi cho tới khi Vân Hải và E3-B vào. TODO sau đó: chuyển sang Lâm Chiếu Dung và `requires q3_kinh_vuong`).
Phụ: `s3_bich_ngoc` (Bích Ngọc Kim Thiền ×18, Lâm Chiếu Dung), `s3_thu_ban_ve` (`scan` Đỉnh Sấm, Vực Kình Ngư, Đình Phù Đảo; Tô Vãn Ngư).

## Nối với các gói khác

- **Tam Trọng Kiếp (#143)**: `q3_nguyen_anh` giữ mục tiêu `breakthrough` đích `nguyen_anh`; `onBreakthrough` đã gọi `questEvent`, test ở `quest3.test.ts`. Ảnh 12 chụp ở nhánh tích hợp khi `q3_nguyen_anh` còn giao ở Lâm Chiếu Dung; nay giữ Khưu Hàn Sơn (xem chuỗi). Phần dẫn vật phẩm `itm_nguyen_anh_dan` (Tố Tâm) giữ nguyên.
- **E3-M (Kính Nguyệt Cung, session -143)**: chỉ hook. Khi vào phó bản, gọi `questEvent(p, 'dungeon', 'kinh_nguyet_cung', 1)` (giống `phuc_mach_quat`). Chưa có thì thử bằng `/gm qev dungeon kinh_nguyet_cung`. Tên phó bản ở i18n `dungeon.kinh_nguyet_cung.name`. Lời lặp của Kính Nguyệt Chân Quân (mục 1.5 thiết kế) thuộc E3-M; E3-H chỉ nhắc trong lời nhiệm vụ.
- **E3-B (quái/boss Vân Hải)**: chưa có quái `mon_van_hac`, `mon_kinh_linh`, `mon_phu_dao_thach_quy`, `mon_bich_ngoc_kim_thien`, `elite_loi_van_su_vuong`, `boss_van_hai_kinh_vuong` trong `monsters.json`. Nhiệm vụ trỏ tới đúng id đó (bảng rơi `loot.json` đã có sẵn). `content:check` tạm cho phép các id này vắng (`E3B_PENDING_MONS` trong `check.ts`, còn lại duy nhất); tên hiển thị `mon.<id>` đã thêm ở `vi.json`, E3-B giữ hoặc ghi đè khi thêm quái. Thử bằng `/gm qev kill <id> <n>`.
- **E3-A (#148, đã merge)**: NPC đặt ở hub (1050,1056) và (1002,1056) theo `places.json` `vh_hub`; `scan` dùng `pois` của Vân Hải; `check.ts` kiểm đầy đủ level, trận, điểm (cờ tạm `E3A_PENDING` đã xóa). `q3_len_may` mở `vh_tp_hub`; `q2_ket_dan` không còn `unlockTele` của #148 (trùng, đã gỡ khi gộp).
- **Chưa làm (cần thêm `escorts`/`spots` vào `van_hai.json`)**: `s3_do_thuyen` (escort Lâm Chiếu Dung ba chuyến, cần `escorts`) và `s3_guong_nuoc` (touch 4 mảnh gương ở Kính Hồ Đài, cần `spots`). Làm sau khi #148 merge.

## Số đo

`pnpm sim:progress`: nhiệm vụ chính chương 3 = 62.100 tu vi = 14,1% chặng Kết Đan (439.000), phụ 3.600. Cờ LỖI nếu ngoài 12–16% hoặc một nhiệm vụ hơn 20% một cấp (không có). Thưởng đi qua `tx` + idem `quest:<char>:<id>` + ledger như mọi nhiệm vụ.

## Việc để lại

- NPC dùng lại model sẵn có đổi màu (`NPC_SKINS.tint`), chưa có chân dung riêng; trong sương Vân Hải trông nhạt (ảnh 04, 08).
- Thẻ chương 3 chưa có tranh nền (`CARD_ART`), giữ thẻ chữ.
- Tiến độ `scan`/`kill` chưa có chỉ báo trên bản đồ.

Ảnh: `pnpm --filter @dtl/perf run shots:e3h --out <thư mục tuyệt đối>` (ảnh trong thư mục này chụp trên nhánh tích hợp main + #148 trước khi #148 merge). Log tiến độ: `e3h-log.json`.
