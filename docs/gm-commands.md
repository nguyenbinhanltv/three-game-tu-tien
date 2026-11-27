# Lệnh GM thử đồ, kỹ năng, trang phục, vũ khí (GM-TEST)

Chỉ **tài khoản thử** (đăng nhập thử khi server bật `AUTH_DEV_BYPASS=1`) dùng được; tài khoản thật bị server bỏ qua im lặng (kiểm ở `GameSim.onChat`, `p.dev`). Gõ trong ô chat (`/gm ...`) hoặc bấm nút ở **bảng F3** (mục "Lệnh GM", tab Nhân vật / Kỹ năng / Trang bị / Trang phục / Vũ khí / Bản đồ / Quái, nút Trợ giúp = `/gm help`). Chuỗi trợ giúp nằm ở i18n `gm.cmd.<lệnh>`; danh sách lệnh theo nhóm ở `apps/server/src/game/gm/tools.ts` (`GM_GROUPS`).

Playtest luôn tắt tiếng: mở game với `?mute=1` (ví dụ `?mute=1&debug=1&auto=<tên>`).

## Quy tắc

- Server quyết định. Mọi thay đổi vật phẩm/tiền (`kit`, `outfit`, `set`, `weapon`, `skin`, `give`, `roll`, `bag`) chạy trong **một transaction** có ghi `ledger` (lý do `gm:kit`, `gm:set`, `gm:bag`, `gm`); `pnpm ledger:check` vẫn khớp. Món đang mặc bị thay được thu hồi bằng dòng ledger -1, không biến mất lặng lẽ.
- Món GM tạo ra roll ở server (phẩm cao nhất = Thiên, seed ghi vào ledger) như mọi trang bị khác.
- Test từng lệnh, kể cả tài khoản thường bị từ chối: `apps/server/src/testflags.test.ts` (mục "lệnh GM thử đồ").

## Bảng lệnh

### Nhân vật

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `help` | `/gm help [lệnh]` — liệt kê lệnh, cú pháp, ví dụ. | `/gm help kit` |
| `level` | `/gm level <1-28>` — đặt cấp. | `/gm level 20` |
| `realm` | `/gm realm <nk1…nk15\|tc\|tc1…tc3\|kd1…\|na1…\|ht>` — đặt cảnh giới. | `/gm realm tc2` |
| `trib` | `/gm trib [truc_co\|ket_dan\|nguyen_anh\|hoa_than\|anh_bien\|ngu_suy [ải 1..5]\|huyen_ngoai\|huyen_noi\|huyen_hon [kiếp 1..3]]` — độ kiếp ngay. Với `ngu_suy` (Thiên Nhân Ngũ Suy) có thể ghi số ải để vào thẳng ải đó. | `/gm trib ngu_suy 3` |
| `xp` | `/gm xp <n>` — cộng tu vi. | `/gm xp 5000` |
| `gold` | `/gm gold <n>` — cộng linh thạch. | `/gm gold 100000` |
| `god` | `/gm god [on\|off]` — bất tử. | `/gm god on` |
| `heal` | `/gm heal` — hồi đầy khí huyết, linh lực. |  |
| `die` | `/gm die` — chết ngay (thử hồi sinh). |  |
| `charge` | `/gm charge [0-100]` — đặt vòng sạc chiêu tối thượng. | `/gm charge 100` |
| `res` | `/gm res [n]` — đặt tài nguyên riêng của công pháp (Kiếm ý, Huyết khí, Đan hỏa); bỏ trống = đầy. | `/gm res 3` |
| `branch` | `/gm branch <mốc> <id>` hoặc `/gm branch reset` — chọn nhánh công pháp ngay hoặc xóa hết nhánh (không tốn linh thạch). | `/gm branch 16 pha_mach` |
| `cd` | `/gm cd` — xóa hồi chiêu, GCD, hồi thần thức. |  |
| `dye` | `/gm dye <id màu>` — đổi màu áo. | `/gm dye attire_sect` |

### Kỹ năng

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `skills` | `/gm skills list\|max\|all` — list: liệt kê chiêu đang dùng được; max: cấp chiêu tối đa cho công pháp đang tu; all: cấp 28 và cấp chiêu tối đa cho mọi công pháp. | `/gm skills all` |
| `learn` | `/gm learn <id chiêu> [cấp 1-5]` — chuyển sang công pháp của chiêu, mở và đặt cấp. | `/gm learn skl_kiem_khi_tram 5` |
| `method` | `/gm method <id công pháp> [cấp chiêu]` — chọn công pháp. | `/gm method bat_dong_kim_than 5` |
| `variant` | `/gm variant <id chiêu> a\|b` — chọn biến thức. | `/gm variant skl_kiem_khi_tram a` |

### Trang bị

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `kit` | `/gm kit <bậc 1-4> <kiem\|hophap\|dansu> [+N] [m\|f]` — mặc trọn bộ (8 ô + trang sức đầu + kiếm + pháp bảo) phẩm cao nhất. | `/gm kit 2 kiem +10 m` |
| `roll` | `/gm roll <mẫu> [phẩm 0-5] [ilvl]` — roll một món vào túi. | `/gm roll itm_liet_mach_kiem 4` |
| `set` | `/gm set <id bộ\|off> [số món]` — mặc bộ (Địa phẩm), off cởi hết. | `/gm set set_dia_giap 4` |
| `plus` | `/gm plus <0-10> [ô]` — đặt cấp cường hóa món đang mặc (mặc định kiếm). | `/gm plus 10 weapon` |
| `art` | `/gm art <id pháp bảo\|off> [cấp 1-5]` — đeo pháp bảo. | `/gm art itm_thanh_lien_an 5` |
| `give` | `/gm give <id> [n]` — thêm vật phẩm vào túi. | `/gm give itm_pha_canh_dan 3` |
| `bag` | `/gm bag clear\|sort` — dọn túi (bỏ ô khóa) hoặc xếp lại. | `/gm bag clear` |

### Trang phục

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `outfit` | `/gm outfit <id bộ\|list\|off> [m\|f]` — mặc bộ trang phục theo id. | `/gm outfit set_liet_mach f` |

### Vũ khí

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `weapon` | `/gm weapon <id\|list> [+N]` — lấy và cầm kiếm theo id, +10 là dạng cuối có vỏ lưng. | `/gm weapon itm_liet_mach_kiem +10` |
| `skin` | `/gm skin <id|list|off>` — lấy và mặc skin vào ô ngoại hình (không cộng chỉ số); `off` tháo về túi. | `/gm skin itm_skin_varkessa` |

### Bản đồ và nhiệm vụ

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `tp` | `/gm tp <x z\|địa điểm>` — dịch chuyển. | `/gm tp boss` |
| `tele` | `/gm tele all\|none\|cd\|<id trận>` — mở khóa Truyền Tống Trận. | `/gm tele all` |
| `qdone` | `/gm qdone <id nhiệm vụ\|chuong2>` — ghi nhiệm vụ đã xong. | `/gm qdone chuong2` |
| `qev` | `/gm qev <loại> [đích] [n]` — bắn sự kiện nhiệm vụ. | `/gm qev dungeon phuc_mach_quat` |

### Quái

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `spawn` | `/gm spawn <id quái\|boss\|clear> [n ≤ 20]` — gọi quái trước mặt; clear dọn quái đã gọi. | `/gm spawn boss_han_giao 1` |
| `killall` | `/gm killall` — hạ quái trong 40 m. |  |
| `freeze` | `/gm freeze [on|off]` — quái trong room đứng yên, giữ nguyên trạng thái. |  |
| `lockhp` | `/gm lockhp [on|off]` — quái không tụt dưới 1 máu. |  |
| `state` | `/gm state <weak|break|stun|chant|phase N|clear> [giây]` — ép trạng thái lên quái quanh mình. | `/gm state break 10` |
| `free` | `/gm free [on|off]` — chiêu không hồi, linh lực luôn đầy. |  |
| `build` | `/gm build <công pháp> [cấp]` — dựng nhân vật thử một nút (cấp, công pháp, chiêu cấp tối đa, chiêu không hồi). | `/gm build lac_kiem_quyet 30` |
| `labreset` | `/gm labreset` — trả phòng thử về như mới. |  |
| `hurt` | `/gm hurt <pct>` — hạ máu quái quanh mình về pct%. | `/gm hurt 30` |
| `dvt` | `/gm dvt` — vào Diễn Võ Trường (phòng tập riêng); gõ lại trong phòng để ra. Ra khỏi phòng, nhân vật trở về nguyên trạng. |  |
| `tick` | `/gm tick` — số đo tick server. |  |

### Tra cứu

| Lệnh | Cú pháp, ý nghĩa | Ví dụ |
| --- | --- | --- |
| `find` | `/gm find <từ khóa>` — tìm id vật phẩm/chiêu/bộ/quái/công pháp theo tên hoặc id. | `/gm find liet mach` |

## Ghi chú từng lệnh mới

- **`kit <bậc> <nhánh> [+N] [m|f]`**: nhánh `kiem` (Lạc Kiếm Quyết), `hophap` (Bất Động Kim Thân), `dansu` (Thanh Mộc Đan Kinh). Chọn bộ theo bậc × nhánh (bậc 1: Lạc Kiếm / Huyền Giáp / Đan Tâm; bậc 2: Liệt Mạch / Địa Giáp / Phục Mạch; bậc 3: Kính Quang / Vân Kinh / Lưu Ly), ô bộ không có thì lấy món tốt nhất bậc ≤ bậc đó (ví dụ ô đầu bậc 2), kèm kiếm của bậc, pháp bảo của nhánh (cấp 5), đặt công pháp, nâng cấp tới cấp yêu cầu của đồ nếu đang thấp hơn, hồi đầy. **Bậc 4 chưa có vật phẩm** (chờ E4): lệnh lùi về bậc 3 và báo. `+10` cho kiếm dạng cuối (bậc 2: `prop_kiem_liet_mach_cuoi`) và vỏ lưng.
- **`outfit <id bộ> [m|f]`**: hình áo theo bộ đang mặc (hai món trở lên), nên lệnh mặc đủ mọi món của bộ. `outfit list` liệt kê bộ có vật phẩm và bộ chỉ mới có asset (ví dụ `set_tinh_khuyet`, bậc 4: báo "chưa có vật phẩm"; khi có bộ Hóa Thần trong `sets.json` thì mặc được ngay). `outfit off` cất hết đồ vào túi.
- **`weapon <id> [+N]`**: id lấy ở `weapon list` hoặc `find`; kiếm mới thay kiếm cũ (cũ thu hồi qua ledger).
- **`skills all`**: cấp 28 và đặt cấp chiêu tối đa cho **mọi** chiêu của mọi công pháp (mỗi lúc chỉ ra được chiêu của công pháp đang tu, đổi bằng `method` hoặc `learn`). Chiêu có `locked` (24/26/28 chờ cơ chế Hóa Thần) vẫn không ra được, lệnh báo số chiêu còn khóa. `skills max`: chỉ công pháp đang tu. `skills list`: liệt kê id chiêu (cấp mở, khóa).
- **`learn <id chiêu> [cấp]`**: chuyển sang công pháp của chiêu, nâng cấp tới cấp mở khóa, đặt cấp chiêu (mặc định 5).
- **`find <từ khóa>`**: bỏ dấu, tối đa 30 kết quả, trong id và tên của vật phẩm, chiêu, bộ, quái, công pháp.
- **`spawn <id>|clear [n]`**: n tối đa 20, xếp quạt 150° trước mặt; quái gọi bằng lệnh này được nhớ để `spawn clear` dọn (không rơi đồ, không XP).
- **`bag clear|sort`**: `clear` bỏ mọi ô không khóa (ghi ledger -n từng id); `sort` xếp lại theo loại → phẩm → bậc.

## Ảnh

Ảnh chụp bằng `pnpm --filter @dtl/perf run shots:gm --out <thư mục tuyệt đối>` (tắt tiếng, tự chạy server ở `PORT`/`CLIENT_PORT`, mặc định 2675/5175, tự tắt): [`docs/gm-commands/`](gm-commands/README.md).
