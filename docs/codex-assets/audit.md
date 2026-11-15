# Kiểm kê asset 2D cho Codex (2026-11-16)

Phạm vi: mọi thứ nên là tranh 2D mà hiện đang là emoji, placeholder hay ảnh thủ tục. Sinh bằng công cụ ảnh tích hợp Codex (`codex exec`, đăng nhập ChatGPT, không Tripo, không API key), đúng `docs/prompts/codex.md` và art bible v3. Nguồn: `D:/METAGRIT/dtl-asset-source/2d/<loại>/<id>.png` kèm `<id>.prompt.txt`.

## Hiện trạng đo được

- Atlas icon hiện 8×9 = 72 ô, 70 ô dùng. 6 skill + 9 skill công pháp + 42 vật phẩm + 3 pháp bảo + 3 đan + 13 trang bị + 15 đồ bộ = 91 định nghĩa; **22 chưa có tranh**, dùng emoji `iconFallback`.
- 28 icon trang bị (PR #86) là render Blender thủ tục.
- 37 chỗ dùng emoji/ký hiệu trong UI client (`Hud.tsx`, `Panels.tsx`, `NpcDialog.tsx`, `Party.tsx`, `Realm.tsx`, `UpgradeTabs.tsx`).
- Khung hội thoại NPC, khung mục tiêu, khung boss: không có chân dung.
- Màn tải (`LoadingPanel` ở `App.tsx`) chỉ là thẻ chữ + thanh tiến độ, một kiểu cho mọi vùng.
- Bảng UI (`ui/kit/`): nền màu phẳng bằng CSS, chưa có chất liệu giấy/lụa, hoa văn viền, triện.

## (a) Icon

| Nhóm | Số | ID / ghi chú |
| --- | --- | --- |
| Skill K-2 thiếu tranh | 3 | `skl_kiem_anh_bo` (lướt), `skl_thiet_bich_xung`, `skl_luu_huong_bo` |
| Vật phẩm thiếu tranh | 4 | `itm_pha_canh_dan`, `itm_tay_luyen_thach`, `itm_linh_tran`, `itm_ho_phu` |
| Linh ngọc khảm | 15 | `gem_{kim,moc,thuy,hoa,tho}_{1,2,3}` (5 hành × 3 cấp) |
| Vẽ lại icon trang bị | 28 | 13 mẫu + 15 đồ bộ, giữ nguyên ID và ô atlas |
| Biến thức A/B | 18 | 9 chiêu có biến thức × 2, ID mới `var_<chiêu>_a|b` |
| Công pháp | 3 | `lac_kiem_quyet`, `bat_dong_kim_than`, `thanh_moc_dan_kinh` |
| Linh căn ngũ hành | 5 | `root_kim…root_tho` |
| Vai trò tổ đội | 3 | kiếm / tank / hỗ trợ |
| Buff đan | 3 | `buff_def`, `buff_crit`, `buff_atk` (thay biểu tượng chip buff) |
| Tiền tệ | 1 | linh thạch (thay 💠, 12 chỗ) |
| Nút HUD | 9 | thiền, ngự kiếm, túi, nhân vật, công pháp, tổ đội, nhiệm vụ, trợ giúp, cài đặt (thay emoji) |
| Dấu nhiệm vụ | 2 | có nhiệm vụ, hoàn thành (thay ❗ ❓) |

Đánh thường liên hoàn 3 đòn và ngắt chỉ là trạng thái của chiêu đã có icon, không cần icon riêng. Trạng thái minimap thuộc PR #92, bỏ qua tránh trùng.
Tổng PR1: 22 + 28 + 18 + 3 + 5 + 3 + 3 + 1 + 9 + 2 = **94** ảnh. Atlas nâng lên 8×16 (1024×2048).

## (b) Chân dung

| Nhóm | Số | ID |
| --- | --- | --- |
| NPC (khung hội thoại) | 3 | `npc_chuong_mon`, `npc_duoc_su`, `npc_thiet_lao` |
| Boss | 4 | `boss_han_giao`, `boss_kiem_khoi`, `boss_huyet_lang_vuong`, `boss_thu_mo_tuong` |
| Tinh anh | 3 | `elite_huyet_nha_lang`, `elite_xich_dien_ho`, `elite_cu_nham_vien` |

10 ảnh, khung dọc 3:4, nạp lười, hiện trong khung hội thoại, khung mục tiêu và khung boss. Quái thường dùng icon loài nếu cần (không làm đợt này).

## (c) Màn tải

7 vùng: Lạc Kiếm Tông, Thung Lũng Thanh Khê, Suối Thanh Khê, Rừng Linh Thảo, Vách Đá Ngọc, Hồ Sương Mù, Kiếm Trủng, cộng màn tiêu đề (hiện chỉ có thẻ chữ) = **8** ảnh ngang 16:9, WebP lười, chọn theo `?at`/vị trí vào game; không đưa vào tải đầu.

## (d) Chất liệu UI

| Asset | Dùng ở |
| --- | --- |
| Nền giấy/lụa ghép được (tile) | nền `Panel` kit |
| Hoa văn viền góc (một góc, lật 4 hướng) | viền bảng lớn |
| Triện đỏ (không chữ) | chân bảng, thẻ chương, nút xác nhận |
| Nền bản đồ lớn (giấy cổ, mây, núi mờ, không chữ) | M-4 |

4 ảnh. Chữ luôn do i18n vẽ lên, ảnh không chứa chữ.

## (e) Tranh minh họa nhiệm vụ / lore

12 nhiệm vụ trong `quests.json`; hiện chưa có chỗ hiển thị tranh. Ghi nhận, **không làm đợt này** (cần thiết kế UI trước). Nếu cần: thẻ chương khi nhận nhiệm vụ chính.

## Kế hoạch PR

1. **PR1 Icon**: 94 icon, atlas 8×16, nối `ContentIcon` vào HUD/túi/trang bị/linh ngọc, bỏ emoji.
2. **PR2 Chân dung**: 10 ảnh, `Portrait` lười, nối hội thoại + khung mục tiêu/boss.
3. **PR3 Màn tải + nền UI**: 8 màn tải + 4 chất liệu, nối `LoadingPanel`, `Panel`.

Ngân sách: tải đầu thêm atlas icon (~0,8 MB WebP); chân dung, màn tải, chất liệu nạp lười (~1,5 MB mỗi ảnh WebP 1280 px, q82). `pnpm size` phải < 30 MB.
