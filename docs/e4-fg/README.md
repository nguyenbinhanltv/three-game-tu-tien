# E4-F + E4-G · Trang bị bậc 5 và chiêu Nguyên Anh

> Ảnh/video duyệt PR để ở artifacts của phiên (không commit). Theo mẫu E2-F/E2-G, E3-F, SETS-4.

## E4-G · mở khóa 6 chiêu Nguyên Anh (cấp 24 và 26)

Bỏ `locked` cho Phân Anh Kiếm Ảnh, Thuấn Di Trảm, Anh Thiết Thân, Thuấn Di Hộ Thế, Anh Dược Hóa Thân, Thuấn Di Cứu Viện. Hàng chiêu bậc cao (Shift+số) nay có 5 chiêu mỗi công pháp (16, 18, 22, 24, 26). Ba chiêu cấp 28 (ô 10) do E4-K (#207) mở; PR này chỉ làm sẵn **cơ chế biến thức** của chúng (xem dưới) và vẫn để `locked` trong nhánh này để không đụng dòng của E4-K.

| Chiêu | Cơ chế (server, `sim.ts`) |
| --- | --- |
| Phân Anh Kiếm Ảnh | `buff.echo`: 10 s, mỗi chiêu gây sát thương **có hồi chiêu** (không phải đánh thường) lặp lại một đạo kiếm ảnh vào mục tiêu chính, 60% sức mạnh gốc của chiêu đó (A: 80%, trễ 1,5 s; B: hai đạo 40%). Bộ Tinh Khuyết 4 món (`phanAnhPower`) nay có tác dụng thật (+100% = gấp đôi). |
| Thuấn Di Trảm | `blink`: thuấn di tới sát mục tiêu (qua `planDash`, không xuyên vách) rồi chém. A: hạ gục thì hoàn 50% hồi chiêu; B: nổ 6 m (đã có `cleave`). |
| Thuấn Di Hộ Thế | `blinkAlly`: cần đồng đội trong 30 m (không có thì không tốn linh lực, `sys.no_ally`); thuấn di tới, khiên cả hai. A: khiêu khích quái 8 m trong 3 s; B: khiên +50%, 3 s. |
| Anh Thiết Thân | giữ nguyên (đã có từ SETS-4), chỉ bỏ khóa. |
| Anh Dược Hóa Thân | `allyCount`: chữa mình và 1 đồng đội mất nhiều máu nhất trong 10 m (A: 2 người; B: thêm khiên). |
| Thuấn Di Cứu Viện | `blinkAlly` + `revive`: thuấn di tới người ngã gần nhất rồi hồi sinh (A: 55%; B: `reviveN` 2 người). |

Biến thức cấp 28 (chỉ cơ chế, hiệu lực khi E4-K mở chiêu): Thiên Kiếm Hóa Hình A choáng 1 s, B ba dư chấn 25% (`aftershocks`); Thiên Kim Pháp Tướng A giảm thêm 15% sát thương (`buffReduce`, đổi từ "miễn đẩy lùi" vì người chơi chưa có cơ chế bị đẩy); Thiên Đan Pháp Giới A/B +15% công/phòng cho đạo hữu trong pháp giới (`partyBuff`, dùng buff đan `meta.buffs`, 12 s).

VFX: cả 9 chiêu đã có timeline `data/fx/<id>.json` (V2/V3), thêm kiểu `kiemanh` (tia bạc mỗi nhịp lặp, `methodFx.ts`). Video: `pnpm shots vfx --level 28 --skills …` ghi webm; hai chiêu cần đồng đội (Hộ Thế, Cứu Viện) chỉ phát dòng thời gian FX (server từ chối khi đứng một mình, có `ALLY_ONLY` trong `vfx.ts`), cơ chế được kiểm bằng `e4g.test.ts`.

## E4-F · trang bị bậc 5 (Hóa Thần sơ kỳ, cấp 28)

Chỉ **dữ liệu**, không có mảnh Tripo/`outfit_build` mới (người dùng đã duyệt nhân vật v3: mỗi bộ = một model toàn thân, bộ xương UE5 Mannequin, làm ở worker khác). `TIER_OPEN = MAX_TIER = 5`, `TIER_MUL[5] = 5,5` (= `realmMul` Hóa Thần), `TIER_MIN_ILVL[5] = 29`, thu nhập giờ 10.200 → phí Thăng Bậc 4.080.

- **3 bộ** (5 món gồm trang sức đầu, Huyền phẩm, `src: forge`; tên theo `docs/DIVUC_DESIGN.md` 7/13): `set_tran_khich` Trấn Khích Kiếm Y (`itm_tkh_*`), `set_tan_thiet` Tẫn Thiết Hộ Giáp (`itm_tth_*`), `set_tinh_dan_bao` Tịnh Quang Đan Bào (`itm_tqd_*`). Hình dáng vẫn tiên hiệp, nhuốm tro và viền ngọc lam.
- 2 món: +10% công kích / +8% phòng ngự / +12% hồi nhận. 4 món **tạm** (chờ DV3-F gắn cơ chế chương 5 như Trấn Giới Bia/Tẫn ấn): `thuan_tram` Thuấn Di Trảm +30% sát thương, `thuan_ho` Thuấn Di Hộ Thế khiên +30%, `cuu_vien` Thuấn Di Cứu Viện hồi sinh thêm 15% khí huyết (nối ở `sim.ts`, test ở `e4g.test.ts`).
- **7 mẫu thường** (Linh phẩm, chỉ số = bậc 4 × 5,5/3,8): Giới Quang Kiếm (dùng lại model `prop_kiem_tinh_khuyet`), Giới Quang Đạo Bào, Trấn Giới Hộ Uyển, Bắc Hoang Vân Ngoa, Giới Văn Đai Lưng, Hóa Thần Ngọc Bội, Nguyên Quang Giới Chỉ. Rơi từ quái có `ilvl ≥ 28` (cơ chế chung `templatesFor`).
- **Thăng Bậc 4 → 5**: 20 Tẫn Giác + 4.080 linh thạch, cần cảnh giới 28, đường E2-F không đổi code. Mọi món bậc 4 có `promoteTo` (kể cả trang sức đầu); bậc 5 khóa (`promote_locked`).
- **Nguyên liệu** `itm_tan_giac` (Tẫn Giác, `PROMOTE_MAT[5]`) và `itm_tinh_vu` (Tịnh Quang Vũ, áo bộ). **Nguồn tạm** vì quái Dị Vực chưa có: tinh anh Thiên Khuyết/Thần Tàng (Tẫn Giác 30% × 1–2, Vũ 4%) và boss Thiên Khuyết Thủ Linh + Vô Diện Thần Quân (Tẫn Giác 4–6, Vũ 60%) qua `$mats` của `loot.json`. **Khi DV có Tẫn chủng thì chuyển nguồn sang đó.** Lấy tay: `/gm give`.
- **Chế tạo**: 15 công thức `frg_tkh|tth|tqd_*` ở Hứa lão + Thiết lão (`alsoAt`), cảnh giới 28, `ilvl` 29, Huyền 80% / Địa 20%; áo 14 Tẫn Giác + 10 Thiết Tinh + 5 Linh Trần + 1 Tịnh Quang Vũ (6.440), món khác 9/6/3 (4.030), trang sức đầu 3.800.
- i18n (`item.*`, `set.*`, `set.fx.thuan_tram|thuan_ho|cuu_vien`), glossary (`items`, `sets`, `materials`), `itemsources.json` sinh lại. `/gm kit 5 <nhánh>` ra đúng bậc 5 (kiếm Giới Quang). Icon: dùng emoji dự phòng.

### Việc sau: model v3
Ngoại hình hiện tạm dùng hình bậc 4 cùng nhánh qua `setAccessories.ts` (`BUILDERS`) và bảng màu tro + lam (`paletteOf`, `look` của bộ). Khi nhân vật v3 xong thì mỗi bộ bậc 5 cần một model toàn thân riêng, vẽ icon (Codex), và ánh xạ `outfits.json`.

## Kiểm (2026-11-18)
- `pnpm typecheck` sạch, `pnpm content:check` hợp lệ (icons 170/226, itemsources khớp).
- Test: shared 214, client 756, server 687 (`--no-file-parallelism --testTimeout 60000`), content 43 qua. Mới: `e4g.test.ts` (13 test), `sets.test.ts`, `promote.test.ts` (4 → 5), `testflags.test.ts` (kit 5), `gear.test.ts`. Đã sửa `method.test.ts` (reset `skillCount` trong `fresh`, vòng thử có thêm chiêu) và `e2g.test.ts` (chiêu khóa).
- `pnpm sim:progress`: không dòng LỖI, nhịp không đổi (bậc 5 chưa vào nhiệm vụ). `fight:check --levels 24,28 --runs 3`: cấp 24 trong khoảng; cấp 28 đan sư TTK 10,8 s (cấp 28 chưa được cân, giống trước PR: gear cố định theo nhiệm vụ). Chưa có bảng sim cho bậc 5.
- Không sửa `rooms.ts`/`auth.ts`/`ratelimit.ts`: không chạy bot security.
