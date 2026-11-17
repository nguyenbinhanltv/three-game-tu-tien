# E4-H: nhiệm vụ chương 4 · Thiên Khuyết

9 nhiệm vụ chính (`q4_*`) + 3 phụ (`s4_*`), NPC Mặc Chiếu và Tô Vãn Ngư ở Ngoại Thành Trạm, thẻ chương `ch4`. Mẫu: E2-H/E3-H. Không ảnh trong repo (ảnh duyệt nằm ở artifacts của phiên).

## Chuỗi

`q4_bac_len` (nhận ở Lâm Chiếu Dung sau `q3_nguyen_anh`, **nhận là mở trận `tk_tp_tram`**; trả ở Mặc Chiếu; `talk` + chạm Hàng Trụ Khắc Vân) → `q4_thach_tuong` (Thạch Tượng Võ Sĩ ×16) → `q4_da_minh` (Cốt Vệ Kiếm Thủ ×18 + hộ tống tàn niệm Mặc Chiếu tới Tinh Bái Đài; trả ở Tô Vãn Ngư) → `q4_xuat_khieu` (chạm 3 môn phong ấn bằng nguyên anh xuất khiếu) → `q4_chien_ma` (Cổ Thành Chiến Ma ×16) → `q4_thu_linh` (Thiên Khuyết Thủ Linh) → `q4_than_tang` (`dungeon` `than_tang_dien`) → `q4_tra_mach` (chạm Tinh Bái Đài; Mặc Chiếu nghe câu của Huyền Cơ, khắc bia tàn niệm giao Tô Vãn Ngư mang lên bắc) → `q4_hoa_than` (`breakthrough hoa_than`, giao/trả ở Tô Vãn Ngư, lời dẫn sang chương 5).
Phụ: `s4_den_troi` (8 đèn trời, `touch`), `s4_ban_khac` (`scan` 5 poi của Thiên Khuyết), `s4_kiem_thong` (Cốt Kiếm Thống Lĩnh).

## Mã mới

- `touch` môn phong ấn (`phong_an_mon_*`, `SOUL_SPOT_PREFIX` ở `apps/server/src/game/questobj.ts`): chỉ tính khi đang xuất khiếu (`PF_SOUL`, bay được); điểm `touch` khác vẫn phải đi bộ.
- **Sửa lỗi cũ**: `DungeonRoom.afterJoin` phát `questEvent('dungeon', undefined)` nên `q2_phuc_mach` và `q3_kinh_nguyet` (có `target`) không bao giờ tiến triển trong chơi thật (chỉ `/gm qev` chạy). Nay phát kèm đích theo level (`DUNGEON_QUEST_TARGET` ở `rooms.ts`: `phuc_mach_quat`, `kinh_nguyet_cung`, `than_tang_dien`). Kiếm Trủng không đích, vẫn khớp mục tiêu `dungeon` không khai `target`.
- Level `thien_khuyet.json` thêm `spots` (8 đèn trời, 3 môn phong ấn) và `escorts` (`esc_mac_chieu`), sinh bằng `tools/maps/gen-thien-khuyet.mjs`. Client `questSpots.ts` vẽ mảnh sáng theo tiền tố (lam gương nước, hổ phách đèn trời, lục bích môn phong ấn).
- Thẻ chương `ch4` (`game/chapter.ts`, engine kiểm lần đầu tới `thien_khuyet`).
- `pnpm shots quest4 --out <thư mục>`: thẻ chương + hội thoại.

## Số đo

`pnpm sim:progress`: chính 96.500 tu vi = 14,1% chặng Nguyên Anh (686.000), phụ 12.800; không cờ LỖI (cờ mới 12–16% và ≤ 20% một cấp cho chương 4 ở `packages/content/src/sim.ts`).

## Việc sau

- `s4_thu_niem` (thử phân thân thần niệm): đã nối ở E4-K (#207): mục tiêu `clone`, `CloneSystem.command` gọi `questEvent(p,'clone')` khi hóa phân thân thành công (`requires q4_hoa_than`, cấp 28).
- `q4_tra_mach` thiết kế gốc đòi cả tổ đội đứng cùng 10 giây: hiện chỉ `touch` một người (cần loại mục tiêu "giữ chỗ theo tổ đội").
- Tàn niệm Mặc Chiếu thay Dạ Minh Lộc làm người đồng hành (chưa có model hươu cho `escort`); Dạ Minh Lộc chỉ ở lời nhiệm vụ.
- Cảnh "Huyền Cơ nói một câu" chưa có hình/âm: lời nằm ở `quest.q4_tra_mach.done`.
- Chưa có chân dung NPC; thẻ `ch4` chưa có tranh nền.
- `q4_hoa_than` cần `itm_hoa_than_lo` (Tố Tâm chế, `rcp_hoa_than_lo`) và kiếp `hoa_than` của E4-L.
