# DV3-H: nhiệm vụ chương 5 · Bắc Hoang

12 nhiệm vụ chính (`q5_*`) + 4 phụ (`s5_*`), 4 NPC ở Vọng Bắc Trạm và Trấn Giới Đài, thẻ chương `ch5`. Theo `docs/DIVUC_DESIGN.md` mục 1.4–1.5 và mẫu E4-H (`docs/e4h-quests/`). Không ảnh trong repo (ảnh duyệt ở artifacts của phiên).

## Chuỗi

`q5_bac_hanh` (nhận ở Tô Vãn Ngư Thiên Khuyết sau `q4_hoa_than`, **nhận là mở trận `bh_tp_tram`**, `minLevel` 28 = cấp vào level) → `q5_tro_lanh` → `q5_then_cai` (bia tàn niệm Mặc Chiếu + quét thần thức ba poi) → `q5_cot_loc` → `q5_nguc_khuyen` → `q5_qua_khich` → `q5_xich_tan` → `q5_tinh_quang` → `q5_thu_khich` → `q5_kim_da` → `q5_ngu_bia` → `q5_anh_bien`.
Phụ: `s5_dem_xac` (6 điểm `xac_tho_san_*`), `s5_cham_ba`, `s5_buom_mach` (3 điểm `mach_nhan_*`), `s5_tieng_ben_kia`.

## Chơi được ngay / chờ dữ liệu

`MAX_LEVEL` hiện 28 (cấp 29–32 là DV3 sau). Sáu nhiệm vụ đầu dùng quái/boss đã có trên bản đồ (#212, #224) và `minLevel` 28 (thiết kế 29 ở ba cái cuối). Các nhiệm vụ trỏ tới thứ chưa có được **khóa bằng `minLevel` > MAX_LEVEL** (không ai nhận được, không bị kẹt), `content:check` ép điều này qua bảng `PENDING_OBJ` ở `check.ts`:

| Nhiệm vụ | Chờ |
| --- | --- |
| `q5_xich_tan` | đã nối phó bản Xích Tẫn Khích (#227), `minLevel` 28 |
| `q5_tinh_quang`, `s5_tieng_ben_kia` | cảnh gột Tịnh Quang của DV3-D (tuyến hộ tống `esc_tinh_quang` đã có ở `bac_hoang.json`) |
| `q5_thu_khich` | boss `boss_thu_khich_duc_chu` (DV3-B) |
| `q5_kim_da` | phó bản Kim Dạ Cung (DV3-E), đích `kim_da_cung` |
| `q5_ngu_bia` | `elite_huyet_giac_ma_tuong` (DV3-B) và cơ chế bia (DV3-C) |
| `s5_cham_ba` | `elite_trien_bo_cham_ba` (DV3-B) |
| `q5_anh_bien` | kiếp Anh Biến (DV3-L), mục tiêu `breakthrough anh_bien` (id kiếp chưa có; `tribDef` lạc id sẽ về Trúc Cơ nên phải khóa) |

Khi dữ liệu thật vào: đổi id trong nhiệm vụ cho khớp, gỡ khỏi `PENDING_OBJ`, hạ `minLevel` theo `realms`.

## Lệch so với thiết kế (có chủ ý)

- `q5_then_cai`: ba "dấu thần niệm" là ba poi sẵn có (Diệt Mạch Khẩu, Tàn Mạch Nhãn, Giới Khích) vì `content:check` chỉ cho đúng một poi mỗi vùng và `scan` chỉ thấy poi.
- `q5_cot_loc`: `gather` linh thảo (node có thật ở Bắc Hoang) thay Tẫn Giác (chỉ rơi từ boss Thiên Khuyết, `gather` chỉ tính hái từ node).
- `s5_buom_mach`: chạm ba điểm mạch nhãn (spot) thay `scan`, cùng lý do poi. `s5_tieng_ben_kia`: một lần `talk` thay năm lần.
- `q5_ngu_bia`: năm điểm `touch` cho một người (chưa có "chạm theo tổ đội").
- Tịnh Quang Dực Sứ (`npc_tinh_quang_su`) đứng ở Trấn Giới Đài từ đầu (NPC chưa có điều kiện hiện theo nhiệm vụ); skin tạm là người áo xám nhạt, model Đọa Dực chờ DV-2.
- Cố Bất Dịch chưa bán đồ/nâng cấp bậc 5 (DV3-F).

## Mã mới

- `levels/bac_hoang.json` (sinh bằng `gen-bac-hoang.mjs`, phần thêm nằm SAU mọi bước dùng RNG nên bố cục cũ không đổi): spots `mach_nhan_1..3`, `xac_tho_san_1..6`, escort `esc_tinh_quang`.
- Client: `ch5` ở `chapter.ts` + `engine.ts`; màu điểm chạm `xac_tho_san_|tran_gioi_bia_|mach_nhan_` ở `questSpots.ts`; skin NPC ở `npcSkins.ts`.
- `check.ts`: chuỗi chương 5, **trận mở bằng nhiệm vụ phải có `minLevel` ≥ cấp vào level đích** (server kiểm minLevel lúc cấp vé, #213), NPC/điểm/quái phải có trên `bac_hoang`. `sim.ts`: khối "Nhiệm vụ chương 5" (bảng `xpNeed` thiết kế cấp 28–31).
- `pnpm shots quest5 --out <thư mục tuyệt đối>` (kịch bản đã gỡ ở tối ưu Đợt C): thẻ chương + hội thoại.

## Số đo

Xem khối "Nhiệm vụ chương 5" trong `pnpm sim:progress`: chính 128.000 tu vi ≈ 13% chặng 983.500 (thiết kế ≈ 14%, ngưỡng 12–16%), phụ 19.000.

## Việc sau

Cảnh Tịnh Quang, boss/phó bản thật (đổi đích), chân dung NPC, thẻ `ch5` chưa có tranh nền, Cố Bất Dịch bán đồ (DV3-F), lời thoại boss (Ma Hậu, Thủ Khích) khi DV3-B/E vào.
