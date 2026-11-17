# E2-H: nhiệm vụ chương 2 · Đoạn Mạch

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2h-quests/<file>`.

9 nhiệm vụ chính (`q2_*`) + 4 phụ (`s2_*`), NPC Tô Vãn Ngư, Hứa lão, Khưu Hàn Sơn, loại mục tiêu mới `touch` / `scan` / `escort`.

## Chuỗi

`q2_thu_ha_son` (Lạc Vân → Tô Vãn Ngư; nhận là mở trận `dm_tp_tram`, field `unlockTele`) → `q2_mach_tinh` (kill + touch Mạch Tinh Trụ) → `q2_khu_khoi_loi` → `q2_cau_da` (Hứa lão; Mạch Tinh Phiến có node hái mới) → `q2_xich_sa` → `q2_hoi_chu` (trả ở Khưu Hàn Sơn) → `q2_phuc_mach` → `q2_dia_mach` → `q2_ket_dan` (giao và trả ở Khưu Hàn Sơn, cần `q2_dia_mach`).
Phụ: `s2_ho_tong` (escort, Hứa lão), `s2_cu_tho` (Hoàng Sa Thảo, Tố Tâm), `s2_kiem_gay` (touch 5 mảnh kiếm gãy, cần `q_kiem_trung`), `s2_thu_nghiem` (scan 3 điểm, từ Kết Đan).

## Mục tiêu do server chấm (`apps/server/src/game/questobj.ts`, `shared/src/questobj.ts`)

- `touch`: đứng trong `TOUCH_R` (5 m), không bay, cạnh điểm `target` (id `pois` hoặc `spots` của level). Chấm mỗi 250 ms.
- `scan`: dùng thần thức E2-E (giữ phím V, từ Kết Đan, hồi 20 s); khi bản quét xong, `SpiritSystem.onScanned` → `QuestObjSystem.onSpiritScan` tính các điểm đáng chú ý nằm trong bản quét.
- `escort`: người đồng hành của riêng người nhận (không phải thực thể room), đi theo `escorts[].path` khi người nhận cách ≤ 14 m, đứng đợi khi xa, về đầu đường khi bị bỏ > 90 m; client chỉ nhận `S.ESCORT` để vẽ.
- `q2_phuc_mach` dùng `dungeon` với `target: 'phuc_mach_quat'`: **E2-C chỉ cần gọi `questEvent(p, 'dungeon', 'phuc_mach_quat', 1)`** khi người chơi vào Phục Mạch Quật (Kiếm Trủng không tính). Chưa có phó bản thì thử bằng `/gm qev dungeon phuc_mach_quat`.
- Lệnh GM mới: `/gm qdone <id|chuong2>`, `/gm qev <loại> [đích|-] [n]`.

## Số đo

`pnpm sim:progress`: nhiệm vụ chính chương 2 = 34.100 tu vi = 14% chặng Trúc Cơ (242.000), phụ 5.200. Cờ LỖI nếu ngoài 12–16% hoặc một nhiệm vụ hơn 20% một cấp. Bảng kinh tế linh thạch tới tầng 15 nay chỉ tính nhiệm vụ minLevel ≤ 15.

## Việc để lại

- Chỉ báo/minimap chưa trỏ tới điểm `touch`/`scan` (Mạch Tinh Trụ có cột sáng; điểm kiếm gãy chưa có).
- Chuỗi bị chặn ở `q2_phuc_mach` cho tới khi E2-C vào.
- Tô Vãn Ngư, Hứa lão, Khưu Hàn Sơn dùng lại model NPC sẵn có, đổi màu (`NPC_SKINS.tint`); chưa có chân dung.

Ảnh: `pnpm shots:e2h --out <thư mục tuyệt đối>` (chạy chuỗi bằng /gm, Truyền Tống thật, ghi `e2h-log.json`).
