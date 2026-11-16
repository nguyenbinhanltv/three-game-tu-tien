# E2-F · Trang bị bậc 2, Thăng Bậc, bộ Kết Đan, đan bậc 2

Phạm vi: chỉ phần bậc 2 (Đoạn Mạch, cấp 16–19) chơi được; bậc 3–4 có hằng số và khóa (`TIER_OPEN = 2`).

## Bậc trang bị

- `ItemDef.tier` (thiếu = 1) và `promoteTo`. `TIER_MUL = [1, 1, 1.6, 2.5, 3.8]` nhân dòng chính khi roll (`mainLine`, `rollItemInstance(..., tier)`); `Character.addRolled` đọc `def.tier`, nên đồ rơi và đồ chế ra từ mẫu bậc 2 tự có chỉ số bậc 2. Đồ cũ (bậc 1) không đổi.
- Lỗ khảm `socketsFor(phẩm, bậc)`: từ Huyền phẩm, mỗi bậc thêm một lỗ, tối đa 3. `parseInst` nhận tới 3 lỗ.
- 7 mẫu thường bậc 2 (`templates.json`): Liệt Mạch Kiếm (`model: prop_kiem_liet_mach`), Mạch Văn Đạo Bào, Sa Thạch Hộ Uyển, Khô Hà Vân Ngoa, Ngân Mạch Đai Lưng, Mạch Tinh Ngọc Bội, Hoàng Sa Giới Chỉ. `sell` đặt theo giá cơ sở thiết kế (kiếm 9.000, ô khác theo `weight/1,3`) để `enhanceCost` ra đúng bảng 7.3.
- Pháp bảo phụ lên cấp 6–7 và Ngưng Đan Lô thuộc E2-E (chưa làm ở đây).

## Ba bộ bậc 2 (`sets.json`, `setItems.json`)

| Bộ | Món | 2 món | 4 món (fx) |
| --- | --- | --- | --- |
| `set_liet_mach` Liệt Mạch Kiếm Y | đạo bào, hộ uyển, đai, ủng | +6% công kích | `hoanh_kiem` +20% sát thương, +4 m |
| `set_dia_giap` Địa Long Hộ Giáp | đạo bào, hộ uyển, đai, ủng | +9% phòng ngự | `kim_chung` phản thêm 15% |
| `set_phuc_mach` Phục Mạch Đan Bào | đạo bào, ngọc bội, đai, giới chỉ | +8% hồi nhận | `moc_linh` +25% thời lượng |

`SetFx` có thêm `hoanhKiemPower/Reach`, `kimChungReflect`, `mocLinhDur`. **Hook combat của ba hiệu ứng 4 món chưa nối** vì ba chiêu (`skl_hoanh_kiem_pha_mach`, `skl_kim_chung_tran`, `skl_moc_linh_tran`) thuộc E2-G (đang sửa `sim.ts`/`skills`): thưởng 2 món chạy ngay, 4 món hiện trong tooltip và tính vào `stats.setFx`, E2-G đọc ba trường này. Chế tạo ở Hứa lão (`npc_hua_lao`) hoặc Thiết lão (`alsoAt`), cảnh giới 16 (`ForgeRecipe.reqLevel`), 12 công thức `frg_lm_*|dg_*|pm_*`, phẩm Huyền 80% / Địa 20%.

Ngoại hình: recolor (`look`) + phụ kiện thủ tục trong `setAccessories.ts` (Liệt Mạch: một vai giáp đồng lệch, hộ uyển đồng, ủng chỉ ngọc lam; Địa Long: vai vảy đá nặng, đai rộng, ủng đá; Phục Mạch: vai mềm, ngọc bội, túi thuốc, vòng ngọc), bảng màu theo `docs/asset-concepts/set_liet_mach_kiem_y.webp` (hai bộ còn lại chưa có concept: màu tự chọn theo vai trò). `accessoryCode` giữ ≤ 9 bộ (đang 7): khi E3/E4 thêm bộ phải mở rộng mã.

## Thăng Bậc (server quyết định)

Lệnh `upg {op:'promote', w|i}` ở thợ (`enhance`): món bậc n → món cùng ô bậc n+1 (`promoteTarget`: `promoteTo` của món, ví dụ Lạc Kiếm → Liệt Mạch, Huyền Giáp → Địa Long, Đan Tâm → Phục Mạch; không thì mẫu thường cùng ô). Cần 20 `itm_mach_tinh_phien` + 2.400 linh thạch (0,4 × 6.000). Giữ phẩm, dòng phụ, ngọc, ràng buộc; dòng chính roll lại (seed server ghi ledger) theo bậc mới, `ilvl` ≥ 17; cường hóa −3 (tối thiểu +0); thêm lỗ khảm trống. Một `Character.tx` có idem, `d.bump` trừ món cũ/cộng món mới nên `ledger:check` khớp. Chặn khi đích đòi cảnh giới cao hơn, bậc chưa mở, nguyên liệu/tiền thiếu. Client chỉ gửi ô.

## Nguyên liệu, đan, loot

- Nguyên liệu: Mạch Tinh Phiến, Hoàng Sa Thảo, Ngưng Đan Mạch Tinh. Rơi qua lớp `$mats` trong `loot.json` (thêm `drops` cho quái Đoạn Mạch nếu quái đã có bảng rơi; PR #126 thêm quái nên lớp này chỉ có hiệu lực sau khi #126 vào main; `content:check` kiểm vật phẩm và tỉ lệ). Không có `drops` trong `monsters.json`.
- Đan bậc 2 (Tố Tâm, cảnh giới 16): Hồi Mạch Đan (45% hp, 30% mp, hồi 30 s), Mạch Kim Cương/Bạo Huyết/Mãnh Lực Đan (+14% / +12% / +14%), Mạch Phá Cảnh Đan (bình cảnh từ tầng 17: `bottleneckPill`). Chưa làm: Thanh Tâm Đan, Thiên Lôi Hộ Đan, Kết Đan Dịch (E2-D), Phá Ấn Phù, linh ngọc cấp 4–6.
- NPC `npc_hua_lao` (level `doan_mach`, cạnh Hạ Khuyết Trạm 1038, 1048): dữ liệu + chuỗi; chưa có model/hiển thị (client chỉ dựng NPC ở Vân Lam, E2-H bật cho Đoạn Mạch). Hiện chơi được qua Thiết lão.

## Kinh tế (`pnpm sim:progress`)

Thu nhập chương 2 ≈ 28.800 (4 giờ × 6.000 × 1,2); hố tiêu cầu toàn 50.278 = Thăng Bậc 7 ô 16.800 + cường hóa +5 bốn ô 26.578 + chế một bộ 6.900 → 1,75× thu nhập (thiết kế ~1,8×). Cờ LỖI nếu ngoài 1–2,5×.

## Kiểm

`pnpm typecheck`, `pnpm test` (có `promote.test.ts`, `tier.test.ts`), `content:check`, `sim:progress` pass; security chạy hai lần (một lần dính 1 mục salvage do nhịp cooldown, lần sau 119/119 ĐẠT); 100 bot 0 dòng `refId`, `ledger:check` khớp. Test flaky đã có sẵn: `equipment.test.ts` (roll linh căn ngẫu nhiên), `camps.test.ts` (tải).

`pnpm shots:e2f --out <thư mục>` chụp UI; `pnpm shots:sets --sets set_liet_mach,set_dia_giap,set_phuc_mach`; `pnpm shots:kiem [--only liet-mach | --model prop_kiem_kinh_quang]`.

## Ảnh

Thăng Bậc trước/sau: `ui-promote-truoc.jpg`, `ui-promote-sau.jpg`; tooltip: `ui-promote-tooltip-bac1.jpg`, `ui-promote-tooltip-bac2.jpg`; chế tạo `ui-forge-bac2.jpg`; đan `ui-luyen-dan-bac2.jpg`. Nhân vật nam/nữ: `set_<bộ>-<m|f>-<truoc|sau|nghieng|chem>.jpg`. Kiếm: `kiem-liet-mach-*`, `kiem-kinh_quang-*`, `kiem-tinh_khuyet-*`.
