# SETS-4 · Trang bị bậc 4 (Hóa Thần): ba bộ, Tinh Khuyết Kiếm, mở Thăng Bậc 3 → 4

Bậc 4 (Thiên Khuyết, `reqLevel` 24, hệ số dòng chính `TIER_MUL[4]` = 3,8) chơi được: `TIER_OPEN = 4`. Hình trang phục đã nhập từ #157/#160/#162; PR này thêm vật phẩm và dữ liệu.

## Dữ liệu

- **3 bộ**, mỗi bộ 5 món (4 món theo nhánh như bậc 2/3 + trang sức đầu `head`, ô 9), rarity Huyền, `src: forge`, `look` lấy từ palette của asset áo:

| Bộ | Món (`itm_*`) | 2 món | 4 món (fx) |
| --- | --- | --- | --- |
| `set_tinh_khuyet` Tinh Khuyết Kiếm Bào (Kiếm tu) | `tk_dao_bao`, `tk_ho_uyen`, `tk_dai_lung`, `tk_van_ngoa`, `tk_trang_suc` | +8% công kích | `phan_anh`: Phân Anh Kiếm Ảnh gấp đôi sát thương |
| `set_co_thanh` Cổ Thành Huyền Giáp (Hộ pháp) | `ct_dao_bao`, `ct_ho_uyen`, `ct_dai_lung`, `ct_van_ngoa`, `ct_trang_suc` | +6% phòng ngự | `anh_thiet`: Anh Thiết Thân chia 20% sát thương cho đồng đội trong 10 m |
| `set_than_tang` Thần Tàng Đan Bào (Đan sư) | `tt_dao_bao`, `tt_ngoc_boi`, `tt_dai_lung`, `tt_gioi_chi`, `tt_trang_suc` | +10% hồi nhận | `anh_duoc`: Anh Dược Hóa Thân hồi thêm 15% |

  **Lệch thiết kế**: thiết kế 7.2 ghi Cổ Thành 2 món "giảm 6% sát thương nhận" nhưng chưa có dòng phụ giảm sát thương, nên dùng `def_pct` +6% (cùng cách E3-F xử lý khiên Lưu Ly).
- **7 mẫu thường bậc 4** (`templates.json`, Linh phẩm): **Tinh Khuyết Kiếm** (`model: prop_kiem_tinh_khuyet`, kiếm bậc 4 chung cho cả ba công pháp, không có kiếm riêng Hộ pháp/Đan sư; dạng +10 `prop_kiem_tinh_khuyet_cuoi` do #157 lo), Tinh Khuyết Đạo Bào, Cổ Thành Hộ Uyển, Dạ Hành Vân Ngoa, Tinh Văn Đai Lưng, Thần Tàng Ngọc Bội, Thủ Linh Giới Chỉ. Chỉ số = bậc 3 × 1,52 (= 3,8/2,5), giá bán × 1,5 (bảng 7.3: kiếm 21.000 giá cường hóa cơ sở).
- **Thăng Bậc 3 → 4**: đường E2-F, không đổi code server. Đồ bộ bậc 3 có `promoteTo` sang món cùng ô của bộ bậc 4 cùng nhánh (Kính Quang → Tinh Khuyết, Vân Kình → Cổ Thành, Lưu Ly → Thần Tàng); mẫu thường tự tìm món thường cùng ô (Kính Quang Kiếm → Tinh Khuyết Kiếm). 20 Tinh Quang Mặc + 3.520 linh thạch (0,4 × 8.800), cần cảnh giới 24. Món bậc 4 không thăng tiếp được (`promote_locked`). Trang sức đầu chỉ có ở bậc 2 và 4 (bậc 3 chưa có), nên chưa thăng bậc được.
- **Nguyên liệu bậc 4** (`items.json`): Tinh Quang Mặc (`PROMOTE_MAT[4]`), Thần Tàng Ngọc, Cổ Thành Phiến.
  - **Nguồn tạm**: bản đồ Thiên Khuyết (E-4) chưa có nên chưa có quái bậc 4. Tạm cho tinh anh và boss Vân Hải/Kính Nguyệt rơi qua lớp `$mats` của `loot.json` (tinh anh: Mặc 35% × 1–2, Ngọc 20%, Phiến 10%; boss: Mặc 3–5, Ngọc 2–3, Phiến 60% × 1–2). **Khi E-4 có quái bậc 4 thì chuyển nguồn sang đó và bỏ hai dòng này**. Cũng lấy bằng `/gm give`.
- **Chế tạo** (`forge.json`): 15 công thức `frg_tk|ct|tt_*` ở Hứa lão + Thiết lão (`alsoAt`), cảnh giới 24, `ilvl` 25, Huyền 80% / Địa 20%; áo 14 Tinh Quang Mặc + 10 Thiết Tinh + 5 Linh Trần + 1 Cổ Thành Phiến (4.440), món khác 9/6/3 (2.780; trang sức đầu 2.620).
- **Hiệu ứng 4 món** (`SetFx`): `phanAnhPower`, `anhThietShare`, `anhDuocBoost`. Nối vào combat: Anh Thiết Thân (`guard`: đồng đội trong 10 m cũng giảm `anhThietShare` sát thương) và Anh Dược Hóa Thân (`hot`: hồi × (1 + boost)); có test trong `e2g.test.ts` (mở tạm `locked`). **Phân Anh Kiếm Ảnh chưa có sát thương kiếm ảnh để nối** (chiêu Nguyên Anh còn `locked`), chỉ có dữ liệu và trường `phanAnhPower`. Cả ba chiêu bậc 4 vẫn khóa, nên hiệu ứng chưa kích hoạt trong game cho tới khi mở khóa.
- **Icon**: chưa có tranh; mỗi món dùng id icon riêng với emoji dự phòng (`icons:check` 170/199, 29 dùng emoji). Cần vẽ icon bằng Codex (`tools/codex-assets/icons.json`) ở bước sau.
- **Hiển thị**: chữ qua i18n (`item.*`, `set.set_*.name`, `set.fx.phan_anh|anh_thiet|anh_duoc`), tên theo `glossary.json` (`items`, `sets`, `materials`). Phụ kiện thủ tục dự phòng/LOD xa của ba bộ dùng lại hình bậc 3 cùng nhánh với bảng màu riêng (`setAccessories.ts`); áo mô-đun T-5/T-6 từ `outfits.json` là hình chính.

## GM và F3

- `/gm kit 4 <kiem|hophap|dansu> [+N] [m|f]` giờ ra đúng bậc 4 (`GM_TIER_SETS` có hàng thứ 4): Tinh Khuyết Kiếm + 4 món bộ + trang sức đầu + các ô còn lại lấy món thường bậc 4. `/gm outfit set_tinh_khuyet|set_co_thanh|set_than_tang` mặc được. Bảng F3 đã có nút bậc 4, không phải sửa client.
- `pnpm --filter @dtl/perf run shots:sets --kit 4 --sets kiem,hophap,dansu --level 24 [--only still] --out <thư mục tuyệt đối>` chụp ảnh qua `/gm kit` (cờ `--kit` mới).

## Kiểm (2026-11-17)

- `pnpm typecheck` sạch; `pnpm content:check` hợp lệ (itemsources khớp, `icons:check` OK).
- `pnpm test`: shared 211, content 36, asset-pipeline 17, perf 3, client 78 file qua; server 40 file qua (chạy cả bộ một lượt trên máy tải thì 9 file hết thời gian `beforeAll`, chạy lại riêng với `--testTimeout 60000 --no-file-parallelism`: 206/206 qua). Test mới/đổi: `tier.test.ts` (`promoteOpen(3)`, phí bậc 4), `promote.test.ts` (3 → 4 cho kiếm và áo bộ, bậc 4 bị khóa, chặn dưới cảnh giới 24), `sets.test.ts` (13 bộ, bộ bậc 4 đủ 5 món/công thức/`promoteTo`), `e2g.test.ts` (hook Anh Thiết/Anh Dược), `testflags.test.ts` (kit bậc 4 cho cả 3 nhánh, mặc outfit), `gear.test.ts` (chữ 3 hiệu ứng mới).
- `pnpm sim:progress`: không có dòng LỖI; nhịp NK/KĐ/NA không đổi (bảng đồ bậc 1–3 và hố tiêu chương 2–3 y như trước; sim chưa có bảng bậc 4).
- Security (`pnpm --filter @dtl/bot-client security`, cổng 2698, không `RATE_LIMIT_EXEMPT`): **138 mục, tất cả ĐẠT**.
- `pnpm bots --count 100 --duration 120` (`RATE_LIMIT_EXEMPT=loopback`): 100 bot vào, 0 thất bại, **0 dòng `refId`**, tick p95 1,5–3,9 ms; `pnpm ledger:check`: 100 nhân vật, 1.998 dòng, **sổ cái khớp**.

## Ảnh

`/gm kit 4 <nhánh> <m|f>` (WebGPU, tắt tiếng `?mute=1` + `--mute-audio`, tài khoản thử, cổng 2697/5297, server tự tắt): `kiem|hophap|dansu-<m|f>-<truoc|sau|nghieng>.jpg`.

## Việc để lại

- Vẽ icon cho 33 món/nguyên liệu mới; bảng sim lực chiến/TTK cho bậc 4.
- Mở khóa chiêu Nguyên Anh (Phân Anh Kiếm Ảnh cần sát thương kiếm ảnh); chuyển nguồn nguyên liệu bậc 4 sang quái Thiên Khuyết (E-4).
- Bộ bậc 3 chưa có trang sức đầu (nên trang sức đầu bậc 2 chưa thăng bậc được).
