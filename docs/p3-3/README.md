# P3-3 Nâng cấp trang bị

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/p3-3/<file>`.

Thiết kế: mục 3.5 và 11 trong "Thiết kế hệ thống thăng tiến nhân vật" (đã duyệt). Phạm vi: cường hóa +10 không vỡ đồ, Hộ Phù, khảm linh ngọc, tẩy luyện dòng phụ, phân giải, ràng buộc, kiếm phát sáng ở +7 và +10.

Tất cả thao tác nâng cấp làm ở Thiết lão (`npc_thiet_lao`, cờ `enhance`), qua bảng Thiết lão trong UI (`apps/client/src/ui/UpgradeTabs.tsx`, dùng `ui/kit`).

## Luật

| Hệ | Luật | Chi phí |
| --- | --- | --- |
| Cường hóa | +0..+4 chắc thắng; +5..+9 tỉ lệ 80/65/50/40/30% (như cũ). Thất bại không bao giờ vỡ đồ. Từ +7 thất bại thì rớt một cấp, trừ khi dùng **Hộ Phù** (tiêu một phù, chỉ khi thật sự cứu cấp). Làm được cả đồ đang mặc lẫn đồ trong túi | `enhanceCost`: `30 + giá×0,15×(cấp+1)` linh thạch, `1 + ⌊cấp/3⌋` Thiết Tinh (không đổi) |
| Khảm ngọc | 5 hệ × 3 cấp (Hạ/Trung/Thượng), 15 viên. Lỗ theo phẩm: Huyền 1, Địa/Thiên 2. Khảm đè thì ngọc cũ mất. Tháo thì ngọc về túi | khảm `20×cấp²`, tháo `30×cấp` linh thạch |
| Ghép ngọc | 3 viên cùng loại và cấp → 1 viên cấp trên, chắc chắn thành công | `60×cấp` linh thạch + `2×cấp` Linh Trần |
| Tẩy luyện | Chọn đúng một dòng phụ, server roll lại bằng seed (ghi trong ledger), các dòng khác khóa và không bị trùng | `(20+3×ilvl)×(1+0,25×phẩm)` linh thạch + 1 Tẩy Luyện Thạch + 1 Linh Trần (2 từ Địa phẩm) |
| Phân giải | Đồ trong túi (không phải đồ đang mặc) → Thiết Tinh `1+phẩm+⌊cấp/2⌋` và Linh Trần `phẩm` (Phàm không có). Ngọc đã khảm trả về túi. Tối đa 30 món một lần. Xác định, không roll | miễn phí |
| Ràng buộc | Địa/Thiên phẩm ràng buộc khi mặc (đã có từ 3-2, giữ nguyên). Tooltip ghi "Ràng buộc khi mặc" / "Đã ràng buộc"; `tradable()` trong shared là hàm kiểm duy nhất cho giao dịch sau này (chưa có hệ giao dịch giữa người chơi) | |

Hiệu quả ngọc (cộng như dòng phụ, chịu trần chỉ số chung): Kim +% công kích, Mộc +% khí huyết, Thủy +% linh lực, Hỏa +% sát thương bạo kích, Thổ +% phòng ngự; mọi ngọc cộng thêm sát thương hệ của chính nó. Số liệu ở `GEM_STATS`/`GEM_ELEM_DMG` trong `packages/shared/src/upgrade.ts`.

Nguồn: ngọc cấp 1 rơi từ quái (tỉ lệ thấp) và tinh anh; ngọc cấp 2 từ boss; Tẩy Luyện Thạch bán ở Thiết lão (80 linh thạch) và rơi từ tinh anh/boss; Hộ Phù chỉ rơi từ boss; Linh Trần chỉ từ phân giải. Bảng rơi ở `packages/content/data/loot.json` (server).

## Kỹ thuật

- Công thức, hằng số, bảng ngọc: `packages/shared/src/upgrade.ts` (có test).
- Server: `apps/server/src/game/upgrade.ts`, tách khỏi `sim.ts` (sim chỉ nối `onEnhance`, `onUpgrade` và bậc phát sáng `wg`). Lệnh mới `C.UPGRADE = 'upg'`: `{ npc, op: 'socket' | 'unsocket' | 'merge' | 'refine' | 'salvage', r, ... }`; `enh` nhận thêm `i` (ô túi) và `ward`.
- Mỗi thao tác là một `Character.tx` với khóa idempotency và ledger. Mọi điều kiện kiểm lại **trên bản nháp** bên trong tx nên hai lệnh song song (tháo + phân giải cùng món, tháo hai lần) chỉ một lệnh thắng. Client không gửi giá trị nào: chỉ chỉ ô/lỗ/dòng/ngọc. Hồi 250 ms mỗi người cho nhóm lệnh này.
- Phân giải gửi kèm `ids` mong đợi để túi xếp lại giữa chừng không làm phân giải nhầm món.
- VFX: `apps/client/src/game/swordGlow.ts`. Server chỉ đồng bộ bậc `wg` (0/1/2) trong `PlayerS`. +7 vỏ sáng ngọc lục nhẹ (1 mesh cộng sáng), +10 vàng rực kèm vệt kiếm khí kéo dài quá mũi (2 mesh). Không đèn, không bóng; tắt ở LOD xa. Chỉ model có xương kiếm tách riêng (Thanh Phong); model khối cũ không phát sáng.
- Lệnh GM thử: `/gm plus <0-10> [ô]` đặt cấp cường hóa món đang mặc.
- `tools/icons/build.mjs`: atlas icon đã đầy (8×4), các vật phẩm mới dùng emoji `iconFallback`; kiểm sức chứa chuyển sang lúc build và chỉ đếm vật phẩm có ảnh nguồn.

## Kiểm

`pnpm typecheck`, `pnpm test` (shared `upgrade.test.ts`, server `upgrade.test.ts`), `pnpm content:check`, `pnpm sim:progress` (nhịp lên cấp không đổi), bộ bảo mật mục 14 (xa NPC, payload xấu, inst giả, khóa lặp, tháo/phân giải song song, spam), `pnpm bots --count 100 --duration 120` + `pnpm ledger:check`, `pnpm bench:client` (đạt ngân sách mọi backend/preset; cảnh bench không có người mặc kiếm ≥ +7 nên chi phí VFX là +1–2 draw call cho mỗi người như vậy).

## Ảnh

Chụp bằng Chrome + GPU thật (RTX 3060 Ti, WebGPU), tắt tiếng: `sword-plus0/7/10.png` (kiếm ở +0, +7, +10), `ui-enhance.webp`, `ui-gem.webp`, `ui-refine.webp`, `ui-salvage.webp`.
