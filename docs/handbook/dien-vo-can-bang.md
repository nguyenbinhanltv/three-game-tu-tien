# Diễn Võ Trường: bàn cân bằng và sân boss (V2e, từ 28/11)

Công cụ (6) của kế hoạch phòng tập: đo sát thương thật, thời gian hạ quái, diễn tập từng pha boss, và bảng so với mục tiêu cân bằng. Mọi thứ ở đây là lệnh GM (tài khoản thử) hoặc lệnh chạy ngoài game; **không đổi luật của game**, hàng rào phòng tập (`apps/server/src/game/practice.ts`) vẫn trả nhân vật về nguyên trạng khi ra.

Mã: `apps/server/src/game/gm/meter.ts` (đồng hồ, lớp thuần có test), lệnh ở `apps/server/src/game/gm/index.ts`, test `apps/server/src/game/gmlab.test.ts`, bảng ngoài game `apps/server/src/tools/fightCheck.ts`, mô hình sim `packages/content/src/simparts/common.ts`.

## Đồng hồ sát thương: `/gm dps`

- `/gm dps`: lần đầu bắt đầu đo; gõ lại thì in số (vẫn đo tiếp); `/gm dps start` đo lại từ 0; `/gm dps stop` in rồi dừng.
- In: thời gian (đòn đầu → đòn cuối), tổng, sát thương mỗi giây, số đòn, tỉ lệ bạo kích, rồi từng chiêu (phần trăm, tổng, số đòn, trung bình mỗi đòn), thời gian hạ từng loại quái, và ước thời gian hạ mục tiêu đang đánh dở.
- Số lấy tại đúng chỗ server trừ máu quái (`MonsterSystem.damageMonster`), nên đã gồm khắc chế, nội tại, ấn, phá thế, giáp, phản đòn. Dùng được ở mọi bản đồ; chỉ người bật mới bị đo.
- Giới hạn: đòn được tính cho **chiêu vừa áp hiệu quả gần nhất**, nên đạn bay chậm trúng sau khi đã ra chiêu khác sẽ bị tính nhầm sang chiêu sau; sát thương theo thời gian gom vào dòng `(dot)`.

## Hình nộm: `/gm dummy [id quái] [cấp]`

Chỉ trong phòng tập. Dọn quái đã gọi, đặt MỘT con (mặc định `mon_soi_xam`, cấp mặc định = cấp mình) đứng yên, khóa máu, bật đồng hồ. Cạn máu thì đồng hồ ghi một lần "hạ" kèm thời gian rồi hình nộm hồi đầy, nên đánh liên tục sẽ ra thời gian hạ lặp lại nhiều lần. Lúc khóa máu đồng hồ tính sát thương gốc của đòn (không bị cắt ở 1 máu). `/gm dummy off` thôi hồi đầy; `/gm labreset` dọn hết.

Ví dụ đo một tinh anh: `/gm build lac_kiem_quyet 10` → `/gm dummy elite_xich_dien_ho 10` → đánh → `/gm dps`.

## Sân boss

| Lệnh | Việc |
| --- | --- |
| `/gm boss <id> [cấp]` | Dọn quái đã gọi, gọi boss hoặc tinh anh vào hố boss ở cấp cho trước, AI chạy thật, mình bất tử, đồng hồ đo từ 0. Không có id thì in danh sách boss |
| `/gm phase <n>` | Ép boss quanh mình vào pha n (0 = pha đầu) đúng đường của trận thật (đổi bộ chiêu, báo client) rồi **khóa pha**: máu đổi không đổi pha. `/gm phase off` bỏ khóa |
| `/gm hp <pct>` | Tua máu quái quanh mình về đúng pct%, lên hoặc xuống, không qua sát thương. Chưa khóa pha thì pha đặt lại theo mức máu mới (kể cả lùi pha khi tua lên) |
| `/gm cast <loại> [loop]` | Quái đã gọi ra ngay một loại chiêu: `chant`, `sweep`, `slam`, `caster`, hoặc chiêu mở rộng (`line`, `leap`, `charge`, `burrow`, `summon`, `reflect`, `reveal`). `loop`: chỉ lặp chiêu đó, cách nhau ~1,2 giây, các chiêu khác bị hoãn. `/gm cast off` thôi lặp. Gõ loại không có thì in các loại pha hiện tại có |

`/gm cast` chỉ đổi mốc hẹn giờ; khoảng cách, tầm với và việc đang niệm dở vẫn do AI thật kiểm (đứng quá xa thì boss phải tới gần rồi mới ra chiêu). Lệnh cũ vẫn dùng: `/gm hurt`, `/gm state`, `/gm freeze`, `/gm lockhp`, `/gm spawn`.

Chưa có: nút trên tab Diễn Võ cho nhóm lệnh này (hiện gõ lệnh ở khung chat). Lớp vẽ vùng trúng thật và phép thử quái bỏ đuổi/kẹt vật cản đã có (xem các mục dưới).

## Phép thử quái bỏ đuổi và kẹt vật cản: `leash:check`

`pnpm --filter @dtl/server leash:check [--levels van_lam,doan_mach] [--per 3] [--only <id quái>] [--verbose] [--strict]` (mã `apps/server/src/tools/leashCheck.ts`, sim server thật, đồng hồ giả, CSDL trong bộ nhớ). Mỗi bản đồ lấy `--per` con (đầu, giữa, cuối danh sách) của TỪNG loại quái đang có, mỗi con ba phép:

1. **Kéo chạy:** người chơi bất tử vào trận rồi chạy thẳng ra xa nhà 9 m/s. Mong đợi: quái bỏ đuổi ở mép tầm (48 m, boss 80 m), về nhà, hồi đầy, đứng yên (IDLE) trong 45 giây.
2. **Dắt đi:** như trên nhưng người chơi chỉ nhanh ngang quái (quái bám sát). Vẫn phải bỏ ở mép tầm.
3. **Tám hướng:** người chơi đứng yên cách nhà 14 m theo 8 hướng. Mỗi hướng phải ngã ngũ trong 16 giây: quái tới tầm đánh, đứng vòng ngoài chờ ô cận chiến, hoặc bị vật rắn chặn thì bỏ đuổi + miễn sát thương (`evadeUntil`). Còn trượt quanh vật rắn sau 16 giây = KẸT.

`--strict` thoát mã 1 khi có lỗi. Lượt đo 28/11 (3 con mỗi loại): Vân Lam 10 loại, Đoạn Mạch 8, Vân Hải 8, Thiên Khuyết 8, Bắc Hoang 12, Vấn Đỉnh 13, Cửu Kiều 9, tức 69 loại, **sau khi sửa không có lỗi nào**.

Lỗi phép thử bắt được và đã sửa (`apps/server/src/game/monsters/tickMonster.ts`, `index.ts`): sói xám ở Vân Lam có điểm nhà sát vật rắn (khoảng 2090, 2464). Bỏ đuổi xong nó chạy về nhà nhưng bị vật chắn giữ cách nhà ~2 m, không bao giờ tới nơi nên ở trạng thái "đang về" mãi (không đứng yên nên không tự thấy người chơi, không hồi sinh bãi). Thêm `returnStalled`: đang về mà bị vật rắn giữ liên tục 2,5 giây không tiến gần nhà thêm 1 m thì coi như đã về (xa hơn 4 m thì đặt thẳng về nhà, gần hơn thì đứng lại tại chỗ), hồi đầy, đứng yên. Test `apps/server/src/game/leash.test.ts`.

Chưa chắc chắn / giới hạn:
- Lượt đo đầu báo Kinh Linh ở Vân Hải kẹt hai hướng. Chạy lại với **10 con** (`--levels van_hai --only mon_kinh_linh --per 10`) sau bản sửa: không lỗi, nên kẹt đã hết (không biết chắc con nào gây ra lượt đầu vì điểm sinh lệch ngẫu nhiên giữa các lượt).
- Sân boss của Diễn Võ Trường: xem tùy chọn `--practice` bên dưới.
- Phép thử không có tìm đường: quái bị vật chắn giữa đường tới người chơi vẫn chỉ trượt quanh rồi bỏ đuổi sau 4 giây (`BLOCK_STALL_MS`), đúng thiết kế hiện tại.

## Vạch báo so với vùng thật (28/11, theo đo của -307, `docs/handbook/dien-vo-truong.md`)

-307 đo 16 chiêu: không chiêu nào vẽ sai cỡ/sai hình, bán kính trong dữ liệu khớp `ai` của quái, nên **không có lệch ở dữ liệu quái hay server**. Lệch thật duy nhất là phía hiệu ứng (Kim Dạ Ma Hậu thiếu vạch trên sàn), thuộc tuyến VFX. Nghi vấn "các quái đo sau Kim Dạ Ma Hậu không ra chiêu nữa" cũng đã thử ở server: gọi lần lượt `boss_kim_da_ma_hau` (đập, niệm chú, triệu hồi), `boss_tan_hoa_kiem_co`, `elite_xich_sa_ngo_cong`, `elite_kinh_dien_ma_quan` bằng `/gm boss` + `/gm cast <loại> loop` trong CÙNG một phòng: boss nào cũng ra chiêu đều (4–16 vùng nổ trong 15 giây). Vậy server không đóng chiêu của quái đo sau, nguyên nhân (nếu có) nằm ở kịch bản chụp/client.

### `leash:check --practice`: quái gọi bằng lệnh ở sân Diễn Võ Trường

`pnpm --filter @dtl/server leash:check --practice [--only <id quái>] [--verbose] [--strict]`: mỗi loại quái trong dữ liệu được gọi bằng `/gm boss` (boss, tinh anh) hoặc `/gm spawn` (quái thường) vào level `dien_vo`, rồi thử phép **tám hướng** (người chơi bất tử đứng yên cách 14 m theo 8 hướng). Không cần móc gì ở `practice.ts`: công cụ dùng đúng lệnh GM như người dùng. Hai phép chạy (kéo chạy, dắt đi) KHÔNG áp dụng ở sân: phòng giới hạn người chơi trong ~36 m quanh hố boss nên không kéo quái ra tới tầm bỏ đuổi (48 m, boss 80 m) được; đó là giới hạn của phòng, không phải lỗi quái. Quái mồi nhử đứng yên (tốc độ < 1, ví dụ Kính Ảnh Giả, Kim Dạ Bóng) bị bỏ qua.

Lượt đo 28/11: **92 loại quái, mọi hướng đều tới được, không lỗi** (không có quái kẹt hay đứng im khi gọi bằng lệnh).

## Dựng nhanh nhân vật để chơi thử cân bằng: `/gm preset` (28/11)

Để người dùng chơi thử Đan sư/Thể tu (và Kiếm tu để so) ở cấp 10, 16, 31 đúng đồ và chiêu mà phép đo bot/sim giả định. Chỉ tài khoản thử (`AUTH_DEV_BYPASS`) dùng được; mọi đổi đồ qua giao dịch + sổ cái như `/gm kit`.

`/gm preset <kiem|hophap|dansu> <cấp> [phẩm 0-5] [chiêu 1-5]` (`kiem` = Kiếm tu, `hophap` = Thể tu, `dansu` = Đan sư; cấp từ 5 tới cấp tối đa):

- đặt **cấp chính xác** và công pháp (hồi đầy máu/linh lực);
- **đồ theo mốc**: bộ bậc cao nhất mà cả bộ mặc được ở cấp đó (bậc 1 đòi cấp 15, bậc 2: 16, bậc 3: 20, bậc 4: 24, bậc 5: 28, bậc 6: 32), phẩm mặc định 2, +0; dưới cấp 15 mặc **đồ nhiệm vụ** (kiếm + bào tốt nhất có yêu cầu ≤ cấp) như người chơi thật và như `fight:check`; đồ cũ (trừ pháp bảo) được thu hồi qua sổ cái nên chạy lại ở cấp khác không lẫn đồ;
- **chiêu** mở theo cấp như thường; cấp chiêu mặc định 1 (giống phép đo `fight:check`; thêm tham số thứ tư để đo ở cấp chiêu khác, ví dụ 3 như nhịp lên cấp của sim);
- **nhánh**: nhánh đầu tiên của mỗi mốc 16 / 20 / 24 / 28 đã tới (như bot); đổi bằng `/gm branch <mốc> <id>`;
- **không bật `free`** (khác `/gm build`): chiêu còn hồi chiêu, tốn linh lực như thật; lệnh còn tắt `free` đang bật từ lần trước.

Kết quả của lệnh ở ba cấp (đồ phẩm 2):

| Lệnh | Công pháp | Đồ | Nhánh | Công kích / giáp / khí huyết |
| --- | --- | --- | --- | --- |
| `/gm preset dansu 10` | Thanh Mộc Đan Kinh | nhiệm vụ: Thanh Phong Kiếm, Linh Ti Bào | chưa tới mốc | 93 / 35 / 502 |
| `/gm preset dansu 16` | Thanh Mộc Đan Kinh | bậc 2, 8 món (`set_phuc_mach`) | 16 `moc_linh` | 281 / 143 / 2091 |
| `/gm preset dansu 31` | Thanh Mộc Đan Kinh | bậc 5, 8 món (`set_tinh_dan_bao`) | 16 `moc_linh`, 20 `ho_dan`, 24 `hoa_than`, 28 `truong_duoc` | 1724 / 899 / 13503 |
| `/gm preset hophap 10` | Bất Động Kim Thân | nhiệm vụ: Thanh Phong Kiếm, Linh Ti Bào | chưa tới mốc | 92 / 41 / 650 |
| `/gm preset hophap 16` | Bất Động Kim Thân | bậc 2, 8 món (`set_dia_giap`) | 16 `chan_dia` | 294 / 175 / 2636 |
| `/gm preset hophap 31` | Bất Động Kim Thân | bậc 5, 8 món (`set_tan_thiet`) | 16 `chan_dia`, 20 `son_nhac`, 24 `thiet_than`, 28 `bat_dong` | 1932 / 1087 / 18438 |

Gợi ý quy trình chơi thử: `/gm preset dansu 16` → ra bản đồ (hoặc `/gm dvt` vào Diễn Võ Trường) → đánh quái; để đo, `/gm dps` rồi `/gm dummy` (hình nộm) hoặc `/gm boss <id>`; so với `/gm preset kiem 16`. Công pháp khác ngoài ba lối trên chưa có preset (dùng `/gm build <công pháp> [cấp]`, không có đồ và bật `free`). Mã: `apps/server/src/game/gm/index.ts` (`case 'preset'`), test `apps/server/src/game/gmlab.test.ts`.

## Kênh GM có cấu trúc `C.GM` / `S.GM` (28/11, cho giao diện lệnh GM của phòng tập)

Song song với `/gm …` qua chat (giữ nguyên, vẫn dùng được): kênh riêng trả kết quả CÓ CẤU TRÚC, không bị giới hạn chat 800 ms, không in dòng chat. **Chỉ tài khoản thử** (`p.dev`, cùng điều kiện với chat); người khác không nhận trả lời nào (không lộ kênh tồn tại). Lệnh chạy đúng `GmSystem.run` nên mọi kiểm tham số, quyền, phòng giữ nguyên. Kiểu dùng chung ở `packages/shared/src/protocol.ts` (`GmRequest`, `GmReply`, `GmState`, `GmListResult`…); mã server: `apps/server/src/game/sim.ts` (`onGm`), `apps/server/src/game/gm/index.ts` (`exec`, `state`), `apps/server/src/game/gm/list.ts` (`gmList`); room đăng ký ở `apps/server/src/rooms/base.ts`.

**Yêu cầu** (`room.send(C.GM, …)`; `r` là mã do client đặt, số nguyên, trả lại nguyên):

| Yêu cầu | Ý nghĩa | `d` trong trả lời |
| --- | --- | --- |
| `{ r, a: ['level', '20'] }` | chạy lệnh `/gm level 20` (các từ KHÔNG có tiền tố `/gm`; tối đa 8 từ, mỗi từ 1–64 ký tự, không có khoảng trắng/ký tự điều khiển) | tùy lệnh (xem dưới) |
| `{ r, q: 'state' }` | trạng thái phòng thử/nhân vật | `GmState` |
| `{ r, q: 'list', k, f?, n? }` | danh sách có lọc: `k` thuộc `mon, boss, item, weapon, skin, skill, method, set, art, place, quest, scene, branch, level`; `f` lọc không dấu theo id hoặc tên (≤ 64 ký tự); `n` tối đa 200 | `GmListResult` `{ k, total, items: [{ id, name, sub? }] }` |

**Trả lời** (`room.onMessage(S.GM, …)`): `{ r, ok, e?, m, d?, st? }`.
- `ok`: lệnh thành công. `e` (khi `ok = false`): `unknown` lệnh không có; `usage` thiếu/sai tham số; `bad` yêu cầu hỏng (kiểu, độ dài, ký tự, hoặc thiếu/sai `r`: `r` bắt buộc là số nguyên an toàn, hỏng thì không chạy); `fail` lệnh hợp lệ nhưng không làm được (túi đầy, không ở phòng tập, chưa đo…); `rate` quá nhanh (dưới 40 ms kể từ yêu cầu trước).
- `m`: các dòng kết quả đã dịch (giống chat). Với `usage`, dòng đầu là cú pháp.
- `st`: chỉ ở trả lời CHẠY LỆNH, là `GmState` sau lệnh (đỡ một lượt hỏi `state`).
- `d` của lệnh: `dps` → báo cáo đồng hồ (`secs, total, dps, hits, critRate, targets, skills[], kills[], est?`); `preset` → `{ branch, level, tier, pieces, quality, skillLevel, branches }`; `boss` → `{ id, def, level, hp, phases, kinds }`. Lệnh khác chỉ có `m`.

`GmState`: `level, levelId, practice` (đang ở Diễn Võ Trường), `method`, `branches` (mốc → id), `stars`, các công tắc `god, free, freeze, lockhp, phaseLock, dummy`, `loop` (loại chiêu đang lặp), `meter` (đồng hồ đang đo), `spawned` (quái gọi bằng lệnh còn sống: `{ id, def, hp, mhp, phase, state }`).

Lưu ý cho giao diện: danh sách `place` (địa điểm đặt tên của `/gm tp`) chỉ server biết (client không có tọa độ); mọi loại khác client cũng có thể tự dựng từ `@dtl/content`, nhưng nên dùng `list` để có tên và ghi chú thống nhất và lọc không dấu giống `/gm find`. Ví dụ: `room.send(C.GM, { r: 1, q: 'list', k: 'skill', f: 'hoi xuan' })`.

Kiểm: `apps/server/src/game/gmrpc.test.ts` (11 mục: thành công/lỗi có mã, dữ liệu, trạng thái, danh sách, quyền, tin hỏng, giới hạn) và bài security `SECURITY_ONLY=gm pnpm --filter @dtl/bot-client security` (`apps/bot-client/src/security/gm.ts`; chạy cả bộ thì nằm sau bài chuỗi đòn).

## Bảng tinh anh theo luật thật: `fight:check --elites`

`pnpm --filter @dtl/server fight:check --elites [--runs 3] [--strict]`

Mỗi tinh anh có điểm sinh, ở cấp cao nhất của bãi, đánh đơn với 9 hướng tu trong sim server thật (đồng hồ giả, bot đứng yên xoay vòng chiêu, bất tử). Ô ngoài 18–40 giây có dấu `!`. Với chặng Ngưng Khí in thêm dòng `sim` (số của `pnpm sim:progress` cho mục tiêu đơn) để thấy mô hình lệch thật bao nhiêu.

Cách đọc: bot bấm đủ chiêu ngay khi hồi xong nên nhanh hơn người thật; sim tính người thật làm đúng cơ chế khoảng 60% (`SKILL_EFF`). Số của bot là **trần trên** của sát thương, số sim là mức trung bình.

### Lượt đo 28/11 (3 lần mỗi ô, giây)

| Tinh anh (cấp) | Kiếm | Thể | Đan | Hồn | Đao | Cổ Thần | Cổ | Lôi | Cấm chế |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| elite_huyet_nha_lang (7) | 20 | 32 | 34 | 32 | 33 | 31 | 28 | 33 | 33 |
| elite_xich_dien_ho (10) | 15! | 26 | 26 | 22 | 20 | 25 | 21 | 21 | 23 |
| elite_cu_nham_vien (13) | 20 | 29 | 40 | 31 | 26 | 32 | 27 | 25 | 37 |
| elite_liet_cot_bao (17) | 14! | 21 | 29 | 21 | 16! | 26 | 23 | 20 | 22 |
| elite_ho_mach_khoi_tuong (18) | 23 | 35 | 48! | 34 | 22 | 40 | 28 | 27 | 32 |
| elite_xich_sa_ngo_cong (19) | 14! | 25 | 31 | 22 | 17! | 28 | 23 | 19 | 23 |
| elite_van_hac_vuong (21) | 20 | 29 | 37 | 26 | 20 | 31 | 25 | 23 | 24 |
| elite_loi_van_su_vuong (22) | 20 | 33 | 44! | 27 | 27 | 38 | 27 | 30 | 26 |
| elite_kinh_dien_ma_quan (22) | 34 | 50! | 64! | 49! | 36 | 59! | 48! | 44! | 47! |
| elite_thach_tuong_dai_tuong (25) | 24 | 39 | 47! | 34 | 23 | 42! | 29 | 29 | 31 |
| elite_da_minh_loc_vuong (25) | 19 | 31 | 40 | 25 | 21 | 34 | 25 | 25 | 25 |
| elite_cot_kiem_thong_linh (26) | 21 | 29 | 47! | 29 | 20 | 38 | 29 | 26 | 29 |
| elite_hoi_giac_cu_thu (28) | 17! | 30 | 47! | 28 | 15! | 34 | 24 | 26 | 28 |
| elite_anh_hac_vuong (32) | 13! | 22 | 30 | 21 | 14! | 20 | 14! | 20 | 21 |
| elite_hu_anh_nhan (37) | 14! | 25 | 33 | 24 | 15! | 23 | 22 | 18! | 23 |
| elite_sa_tuong (41) | 12! | 24 | 33 | 22 | 11! | 24 | 17! | 21 | 21 |
| elite_may_lang_vuong (44) | 15! | 26 | 39 | 25 | 18 | 25 | 19 | 25 | 26 |
| elite_lo_thach_tuong (46) | 17! | 30 | 41! | 27 | 17! | 26 | 19 | 26 | 26 |

Phòng đã chỉ ra (CHƯA SỬA, là cân bằng của game thật nên chờ người dùng quyết):

- **Kiếm tu và Đao tu nhanh gấp ~2 lần Đan sư, ~1,6 lần các hướng còn lại** khi bấm đủ chiêu; từ cấp 32 hai hướng này hạ tinh anh trong 11–17 giây (dưới ngưỡng 18).
- **Kính Điện Ma Quân (cấp 22) quá lì với 7/9 hướng** (44–64 giây), riêng Kiếm tu và Đao tu 34–36 giây.
- **Đan sư vượt 40 giây ở 7 tinh anh**: là hướng hỗ trợ nên chậm là có chủ ý, nhưng đi một mình thì tinh anh thành trận dài.
- **Nhánh Huyết Trận (mốc cấp 16) của Cổ Thần cho chiêu Tinh Bạo cần 3 sao**, mà sao thứ ba chỉ rèn được từ cấp 32: người chọn nhánh này có một ô chiêu không bấm được suốt cấp 16–31. (Đã sửa 28/11 cho cả Tinh Bạo và Huyết Cự Hộ.)

## Bảng sát thương mỗi giây trên hình nộm: `fight:check --dps`

`pnpm --filter @dtl/server fight:check --dps [giây] [--levels 10,19,31] [--runs 2] [--strict]`

Mỗi cấp × hướng tu đánh một quái thường hợp cấp bị khóa máu và hồi đầy mỗi nhịp trong 60 giây (mặc định); quái vẫn đánh lại để hướng tích tài nguyên khi bị đánh có tài nguyên, bot bất tử. Số lấy từ chính đồng hồ `/gm dps`. Dòng hai của mỗi cấp là tỉ lệ so với trung vị của cấp đó, `!` = lệch quá ±35%. Đây là sát thương MỘT mục tiêu (không có đòn quét, vùng nổ chỉ trúng một con).

### Lượt đo 28/11 (2 lần mỗi ô; tỉ lệ so với trung vị của cấp)

| Cấp | Kiếm | Thể | Đan | Hồn | Đao | Cổ Thần | Cổ | Lôi | Cấm chế | Trung vị (sát thương/giây) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1,01 | 0,90 | 0,85 | 1,00 | 1,14 | 0,91 | 1,10 | 1,06 | 0,94 | 98 |
| 15 | 1,07 | 1,00 | 0,80 | 0,94 | 1,11 | 0,88 | 1,01 | 1,05 | 0,95 | 147 |
| 19 | 1,36! | 0,96 | 0,76 | 0,99 | 1,21 | 0,83 | 1,00 | 1,12 | 1,10 | 505 |
| 23 | 1,25 | 0,80 | 0,66 | 0,97 | 1,15 | 0,79 | 1,00 | 1,08 | 1,02 | 769 |
| 27 | 1,26 | 0,87 | 0,67 | 1,00 | 1,20 | 0,74 | 1,00 | 1,06 | 1,02 | 1300 |
| 31 | 1,48! | 0,84 | 0,61! | 0,98 | 1,19 | 0,75 | 1,04 | 1,06 | 1,00 | 2086 |
| 36 | 1,51! | 0,81 | 0,68 | 0,97 | 1,31 | 0,88 | 1,04 | 1,14 | 1,00 | 6712 |
| 40 | 1,42! | 0,83 | 0,62! | 0,91 | 1,19 | 0,96 | 1,23 | 1,05 | 1,00 | 9200 |
| 44 | 1,47! | 0,84 | 0,61! | 0,93 | 1,28 | 1,00 | 1,14 | 1,13 | 1,00 | 13834 |
| 47 | 1,49! | 0,76 | 0,65! | 0,91 | 1,20 | 1,00 | 0,98 | 1,01 | 1,04 | 12769 |

Phòng đã chỉ ra (CHƯA SỬA, chờ người dùng quyết):

- **Chặng Ngưng Khí cân:** cấp 10–15 cả 9 hướng nằm trong ±20% trung vị.
- **Từ Trúc Cơ Kiếm tu tách hẳn:** 1,25–1,5 lần trung vị, tăng dần theo cấp (cấp 31 trở lên luôn trên 1,4). Đao tu ổn định ở 1,15–1,3. Đây là sát thương một mục tiêu, chưa tính đòn quét của hai hướng này.
- **Đan sư 0,61–0,68 từ cấp 23**, Thể tu 0,76–0,87: hai hướng hỗ trợ/chống chịu thấp hơn là có chủ ý, nhưng khoảng cách với Kiếm tu là ~2,4 lần ở cấp 31–44.
- Trung vị cấp 47 thấp hơn cấp 44 (quái cấp 47 phòng ngự cao hơn mà trang bị vẫn bậc 5): chỗ này cần đo lại với `--tier 6`.

## Cân bằng game thật đã chỉnh 28/11 (người dùng quyết)

Bốn quyết định sau lượt đo đầu; ba mục đổi số, một mục giữ nguyên.

| Mục | Trước | Sau | Ở đâu |
| --- | --- | --- | --- |
| Đòn quét đòn thường của Kiếm tu | quái khác trong cung nhận 0,4 lần đòn chính | 0,3 lần | `packages/content/data/paths.json` (`basic.arc.mul`) |
| Kiếm tu từ Anh Biến (cấp 32) | đòn trực tiếp lên quái ×1 | ×0,85 | `methods.json` → `late` của `lac_kiem_quyet` |
| Đao tu từ Anh Biến (cấp 32) | ×1 | ×0,93 | `methods.json` → `late` của `liet_nhan_dao_kinh` |
| Tinh Bạo (Cổ Thần, nhánh Huyết Trận mốc 16) | cần Tam Tinh (rèn được từ cấp 32) | không đòi sao, dùng từ cấp 16 | `methods.json` (bỏ `star`), mô tả ở `vi.json` |
| Kính Điện Ma Quân (cấp 22) | 44–64 giây với 7/9 hướng | GIỮ NGUYÊN (lì là có chủ ý) | |

Cơ chế mới `MethodDef.late` (`packages/shared/src/methods.ts`, `methodLateMul`): từ cảnh giới `level`, đòn đánh trực tiếp lên quái của công pháp đó nhân `dmgMul`. Server áp ở `MonsterSystem.hitMonster` (không áp cho sát thương theo thời gian, tỉ thí); sim áp trong `playerDps`; `content:check` chặn `dmgMul` ngoài 0,7–1. Chọn hệ số theo cấp vì phần vượt của hai hướng này trải trên nhiều chiêu (chiêu tối thượng 16–26%, còn lại mỗi chiêu 5–18%), không có chiêu nào mở ở cấp 32 để chỉnh riêng. Đao tu dừng ở 0,93 vì ở 0,88 sim báo Đao tu hạ quái thường chương 7 chậm quá trần 7,3 giây.

Sát thương mỗi giây trên hình nộm, tỉ lệ so với trung vị (trước → sau):

| Cấp | Kiếm tu | Đao tu |
| --- | --- | --- |
| 32 | (chưa đo) → 1,24 | (chưa đo) → 1,10 |
| 36 | 1,51 → 1,33 | 1,31 → 1,10 |
| 40 | 1,42 → 1,20 | 1,19 → 1,07 |
| 44 | 1,47 → 1,21 | 1,28 → 1,10 |
| 47 | 1,49 → 1,31 | 1,20 → 1,18 |

Thời gian hạ tinh anh cấp 32+ (giây, trước → sau; khoảng mong muốn 18–40):

| Tinh anh (cấp) | Kiếm tu | Đao tu |
| --- | --- | --- |
| elite_anh_hac_vuong (32) | 13 → 15 | 14 → 16 |
| elite_hu_anh_nhan (37) | 14 → 16 | 15 → 15 |
| elite_sa_tuong (41) | 12 → 14 | 11 → 12 |
| elite_may_lang_vuong (44) | 15 → 18 | 18 → 19 |
| elite_lo_thach_tuong (46) | 17 → 19 | 17 → 22 |

**Chưa đạt hết:** hai tinh anh Cửu Kiều đã vào khoảng, nhưng ba tinh anh Vấn Đỉnh (Ảnh Hạc Vương, Hư Ảnh Nhân, Sa Tướng) vẫn 12–16 giây với Kiếm tu và Đao tu. Muốn kéo ba con này về 18 giây chỉ bằng cách giảm hai hướng công thì phải giảm thêm 15–35% (Kiếm tu tổng cộng ×0,72, Đao tu ×0,6), khi đó hai hướng công sẽ ngang hoặc dưới trung vị trên hình nộm: không còn là "giảm nhẹ". Ba con này cũng ngắn với Cổ tu (14–17 giây); đề xuất tiếp theo là tăng máu riêng ba tinh anh Vấn Đỉnh khoảng 15% (Đan sư khi đó 35–39 giây, vẫn trong khoảng). Chưa làm, chờ quyết.

Các ô dưới 18 giây của Kiếm tu ở cấp thấp (Xích Diễm Hồ 16, Liệt Cốt Báo 16, Xích Sa Ngô Công 16, Hôi Giác Cự Thú 17) không thuộc quyết định "cấp 32+" nên không đổi; ở cấp 16 Kiếm tu đã 1,5 lần trung vị trên hình nộm.

`sim:progress` sau khi chỉnh: 6 dòng LỖI còn 2 (Kiếm tu hạ quái thường 3,7 giây ở cấp 27 và 31, ngưỡng dưới 3,8); nhịp Ngưng Khí 15 của sim 3,1 → 3,2 giờ, mốc Trúc Cơ 4 giờ vẫn trong ±12%.

### Đợt hai, 28/11 rạng sáng (orchestrator quyết thay khi người dùng vắng; muốn lùi thì đảo đúng các số dưới đây)

| Mục | Trước | Sau | Ở đâu |
| --- | --- | --- | --- |
| Máu elite_anh_hac_vuong (`hpMul`) | 8,0 | 9,2 (+15%) | `packages/content/data/monsters.json` |
| Máu elite_hu_anh_nhan | 7,6 | 8,7 (+14%) | như trên |
| Máu elite_sa_tuong | 6,5 | 7,8 (+20%) | như trên |
| Huyết Cự Hộ (Cổ Thần, nhánh Huyết Cự mốc 16) | cần Tam Tinh | không đòi sao | `methods.json` (bỏ `star`), mô tả ở `vi.json` |
| Ngưỡng dưới thời gian hạ quái thường của sim (chương 2–7) | 3,8 giây | 3,7 giây | `packages/content/src/simparts/ch2.ts` … `ch7.ts` |

Không giảm thêm Kiếm tu/Đao tu; mốc `late` giữ ở cấp 32. Sa Tướng tăng 20% thay vì 15% vì là con ngắn nhất (Đao tu 12 giây); Đan sư vẫn dưới 40 giây.

Thời gian hạ ba tinh anh Vấn Đỉnh (giây; đầu bảng → sau đợt một → sau đợt hai):

| Tinh anh (cấp) | Kiếm tu | Đao tu | Cổ tu | Đan sư |
| --- | --- | --- | --- | --- |
| elite_anh_hac_vuong (32) | 13 → 15 → 17 | 14 → 16 → 17 | 14 → 17 → 19 | 30 → 30 → 36 |
| elite_hu_anh_nhan (37) | 14 → 16 → 18 | 15 → 15 → 17 | 22 → 23 → 24 | 33 → 34 → 40 |
| elite_sa_tuong (41) | 12 → 14 → 17 | 11 → 12 → 19 | 17 → 14 → 16 | 33 → 32 → 38 |

Còn sát ngưỡng dưới (17 giây ở vài ô, sai số giữa các lượt đo khoảng ±1–2 giây) nhưng không tăng máu thêm được: Đan sư đã 36–40 giây. `sim:progress` sau đợt hai: **0 dòng LỖI**, Ngưng Khí 15 của sim 3,2 giờ.

## Mốc sát thương của server so với `hitAt` (28/11, theo báo từ xưởng âm thanh)

Xưởng âm thanh thấy sát thương về muộn so với khung trúng của clip ở ba chiêu: Cổ Bạo (+187/+195 ms), Lạc Thư Đại Trận (+130/+174 ms), Phá Diệt Cấm (+237/+281 ms). Đo riêng từng chiêu trên sim server (đồng hồ giả, nhịp 50 ms, mục tiêu đứng yên khóa máu, cách 4 m và 12 m, có và không có ấn sẵn):

| Chiêu | `hitAt` | Sát thương đầu của server | Kết luận |
| --- | --- | --- | --- |
| `skl_co_bao` | 0,45 s | +450 ms (có 2 Cổ độc: vẫn +450) | đúng mốc |
| `skl_pha_diet_cam` | 0,2 s | +200 ms (có 2 Cấm ấn: vẫn +200) | đúng mốc |
| `skl_lac_thu_dai_tran` | 0,5 s | +2100 ms | là trận: `hitAt` là lúc HẠ trận, nhịp sát thương đầu = hạ trận + `arm` 0,6 + `every` 1 giây |
| `skl_kiem_khi_tram` (đối chứng) | 0,28 s | +300 ms | trễ tối đa một nhịp server (50 ms) |

Server áp sát thương đúng lúc nhận lệnh + `hitAt` (làm tròn lên một nhịp 50 ms) và chỉ giữ lệnh bấm sớm cho đòn thường chuỗi, nên **không sửa `hitAt` hay thời điểm server**. Độ trễ đo được ở xưởng nhiều khả năng do quy nhầm đòn (hai hướng này có Cổ độc và trận gây sát thương theo nhịp) hoặc do lệnh nằm chờ ở máy trước khi gửi. Với Lạc Thư Đại Trận, tiếng "trúng" nên bám nhịp trận chứ không bám `hitAt`.

Để đo đúng từng đòn: khi người đánh đang bật `/gm dps`, tin sát thương (`S.DMG`) có thêm trường `sk` = id chiêu gây ra đòn đó (`(dot)` cho sát thương theo thời gian, `(khác)` khi chưa ra chiêu nào). Người chơi thường không nhận trường này.

## Kiếm tu vượt trung vị từ cấp 10 (28/11): đề xuất và kết quả (đã chọn A×0,85 từ cấp 8 + B nhẹ)

**Hiện trạng đo được** (`fight:check --dps 90 --runs 2 --mon mon_thach_giap_te --levels 6,10,13,15,16,18`, quái thường CẬN CHIẾN, bot bấm đủ chiêu, tỉ lệ so với trung vị 9 hướng):

| Cấp | 6 | 10 | 13 | 15 | 16 | 18 |
| --- | --- | --- | --- | --- | --- | --- |
| Kiếm tu | 1,26 | 1,45 | 1,40 | 1,42 | 1,52 | 1,43 |

- **Không phải bước nhảy ở cấp 16.** Ở bảng DPS trước (quái thường chọn theo cấp), Kiếm tu hiện 1,0 ở cấp 14–15 rồi 1,45 ở cấp 16, nhưng bãi cấp 14–15 là Sói U Minh, quái đánh XA (giữ 9 m), nên Kiếm tu cận chiến (đòn thường tầm 5 m) bị thiệt; từ cấp 16 mục tiêu là Thạch Giáp Tê cận chiến. Cùng một quái cận chiến thì Kiếm tu đã ~1,4 lần trung vị từ cấp 10; nhánh Phá Mạch ở mốc 16 chỉ cộng thêm khoảng +0,1.
- **Chiêu nào gây ra** (cấp 10, 90 giây, sát thương/giây): Kiếm tu 148 so với trung vị 99. Đòn thường `skl_phi_kiem` của Kiếm tu (35% = 52/s) bằng Hồn tu (54% của 97 = 52/s) và hơn Đan sư (46/s) không đáng kể, nên **phần dư đến từ chiêu tối thượng `skl_van_kiem_quy_tong` (27% ≈ 40/s; hệ số 4,2, mở ở cấp 8, hồi bằng vòng sạc, ra 4 lần mỗi 90 giây ≈ 900 mỗi lần) và chiêu đặc trưng `skl_phi_kiem_truy_hon` (11%)**, cộng `skl_kiem_khi_tram` (22% = 33/s, Thể tu/Hồn tu ~28/s). Đao tu cùng kiểu nhưng thấp hơn (115; chiêu tối thượng `skl_tram_son_dao` 25%, hệ số 4,5).
- **Sim (`sim:progress`) đánh giá thấp chênh lệch này**: Kiếm tu hạ quái thường nhanh hơn các hướng khác 8–20% (Trúc Cơ sơ kỳ 5,6 giây so với 6,2–7,5) vì sim tính người thật dùng cơ chế khoảng 60% (`SKILL_EFF`); số 1,4–1,5 ở đây là cận trên khi bấm đủ chiêu.

**Phương án** (cần người dùng chọn; cả ba chỉ cần sửa dữ liệu, không đụng luật server):

- **A. Hệ số cấp thấp cho Kiếm tu** (cơ chế `MethodDef.late` đã có từ PR #838, chỉ cần khai `late` cho `lac_kiem_quyet` ở cấp thấp hơn, hiện là 32/×0,85). Tỉ lệ ≈ 1,45 × hệ số: ×0,8 → 1,16; ×0,75 → 1,09. **Đo sim thật bằng bản vá trong bộ nhớ (không ghi file):**
  - ×0,8 từ cấp 5: Ngưng Khí 15 từ 3,2 giờ lên **3,6 giờ** (vẫn trong 3–4 giờ), TTK Kiếm tu hạ quái thường 6,5 giây ở Ngưng Khí 15; nhưng sinh 4 dòng LỖI mới (Kiếm tu TTK quái thường 7,4 giây ở chương 2 cấp 16 và 7,3 giây ở chương 7 cấp 44 so với trần 7,3; Kiếm tu đánh tinh anh chương 5 cấp 28 mất 65% máu; `itm_tram_ta_kiem` +5 tốn 1,3 giờ thu nhập).
  - ×0,75 từ cấp 5: Ngưng Khí 15 lên **3,8 giờ** (sát trần 4), 8 dòng LỖI (thêm: chương 2 ra 4,61 giờ so với 4 ±12%, chương 3 ra 6,73 giờ so với 6 ±12%).
  - Ưu: gọn, một con số, dễ lùi. Nhược: làm chậm chặng đầu của hướng tu phổ biến nhất (3,2 → 3,6–3,8 giờ), phải nới ngưỡng sim hoặc hạ máu quái chương 2–5 để bù.
- **B. Hạ riêng chiêu tối thượng và chiêu đặc trưng của Kiếm tu**: `skl_van_kiem_quy_tong` hệ số 4,2 → 3,2 và `skl_phi_kiem_truy_hon` 2,5 → 2,2 (`methods.json`). Ước tính theo tỉ trọng: −(27% × 24% + 11% × 12%) ≈ −8% tổng, tỉ lệ 1,45 → ~1,33 (chỉ thu hẹp một phần). Sim ít bị ảnh hưởng (chỉ hai chiêu); có thể kết hợp với A ở ×0,9.
- **C. Nâng các hướng thấp** (Đan sư, Cổ Thần, Thể tu, Hồn tu ~+25–35%). Không khuyến nghị: năm hướng đổi số, mọi TTK ngắn đi, nhịp lên cấp nhanh hơn trần 3–4 giờ nên phải nâng đường cong kinh nghiệm theo.
- **D. Giữ nguyên.** Hướng DPS thuần "vua sát thương" là chủ ý thiết kế (thể hiện ở `role: dps`); chênh thật trong tay người chơi thấp hơn nhiều (60% hiệu suất theo sim). Rủi ro: tinh anh/boss thiết kế theo trung vị thì Kiếm tu qua quá nhanh (xem bảng pha boss bên dưới: boss ngắn nhất do nhóm toàn Kiếm tu).

**Khuyến nghị của tôi: A ở ×0,85 từ cấp 8** (mở chiêu tối thượng) kết hợp với B nhẹ, rồi đo lại bằng `fight:check --dps` và `sim:progress`; chưa chạy cấu hình này (chỉ đã đo ×0,8 và ×0,75 từ cấp 5 ở trên).

### Đã áp dụng (28/11, người dùng chọn): A ×0,85 từ cấp 8 + B nhẹ

| Thay đổi | Trước | Sau | Ở đâu |
| --- | --- | --- | --- |
| Hệ số đòn lên quái của Kiếm tu (`late`) | ×0,85 từ cấp 32 | ×0,85 từ **cấp 8** | `methods.json` (`lac_kiem_quyet.late.level` 32 → 8) |
| Vạn Kiếm Quy Tông (`skl_van_kiem_quy_tong`) | hệ số 4,2 (420%) | 3,7 (370%) | `methods.json`, mô tả ở `vi.json` |
| Phi Kiếm Truy Hồn (`skl_phi_kiem_truy_hon`) | hệ số 2,5 (250%) | 2,3 (230%) | như trên |
| Cận dưới `late.level` ở `content:check` | ≥ 16 | ≥ cấp mở công pháp (5) | `packages/content/src/checkparts/fabao.ts` |

Dự kiến ban đầu: tỉ lệ ~1,18. **Đo sau** (`fight:check --dps 90`, tỉ lệ Kiếm tu so với trung vị 9 hướng; quái cận chiến Thạch Giáp Tê ở cấp 6–20, quái thường chọn theo cấp ở cấp 31–47):

| Cấp | 6 | 10 | 13 | 15 | 16 | 18 | 20 | 31 | 32 | 36 | 40 | 44 | 47 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Trước | 1,26 | 1,45 | 1,40 | 1,42 | 1,52 | 1,43 | 1,41 | 1,36 | 1,24 | 1,33 | 1,20 | 1,21 | 1,31 |
| Sau | 1,29 | 1,09 | 1,12 | 1,11 | 1,19 | 1,17 | 1,12 | 1,13 | 1,22 | 1,16 | 1,19 | 1,24 | 1,21 |

(Cấp 6 dưới mốc 8 nên không đổi. Cấp 32, 36, 47 là trung bình 4 lần; lượt đo 2 lần đầu ra 1,28 / 1,28 / 1,26, sai số giữa các lượt khoảng ±0,05. "Trước" cấp 31–47 lấy từ lượt đo sau PR #838 và #846.)

**Thời gian hạ tinh anh** (`fight:check --elites`, bot bấm đủ chiêu, Kiếm tu, giây; khoảng mong muốn 18–40): xích diễm hổ (10) 16 → 19, liệt cốt báo (17) 16 → 19, xích sa ngô công (19) 16 → 18, hôi giác cự thú (28) 16 → 23, Ảnh Hạc Vương (32) 17 → 17, Hư Ảnh Nhân (37) 18 → 17, Sa Tướng (41) 17 → 19, Mây Lang Vương (44) 18 → 20, Lô Thạch Tướng (46) 21 → 21. Số ô Kiếm tu dưới 18 giây giảm từ 7 xuống 2 (cả hai sát 17).

**`sim:progress`:** Ngưng Khí 15 từ **3,2 giờ lên 3,5 giờ** (trong 3–4 giờ, đạt yêu cầu ≤ 4 giờ); mốc Trúc Cơ 4 giờ: 4,0 → 4,3 giờ (trong ±12%). Số dòng LỖI từ 0 lên 2, cả hai sát ngưỡng mềm: `itm_tram_ta_kiem` cường hóa +5 tốn ~1,2 giờ thu nhập (ngưỡng 1,2 giờ) và Kiếm tu đánh tinh anh chương 5 cấp 28 mất 62% máu (ngưỡng 60%). Không còn dòng LỖI TTK quái thường nào. Kiểm: `pnpm --filter @dtl/server test` 1240/1240, shared 418/418, content 140/140, `content:check` đạt.

Còn quan sát: Ảnh Hạc Vương (32) và Hư Ảnh Nhân (37) vẫn 17 giây với Kiếm tu, dưới khoảng 18 giây một giây (sai số giữa các lượt ±1–2 giây); không chỉnh thêm vì còn sát và cùng mức với Đao tu.

## Bảng thời gian từng pha của mọi boss (28/11): `fight:check --bossphases`

`pnpm --filter @dtl/server fight:check --bossphases [--runs 2] [--only-boss <id>] [--party N] [--methods a,b,c] [--strict]`: mỗi boss ở cấp và nơi xuất hiện trong dữ liệu (bãi ngoài thế giới: nhóm 3 người; phó bản: nhóm 4), nhóm toàn cùng một công pháp (mặc định Kiếm tu, Cổ Thần, Đan sư = chặn trên, giữa, dưới), bot bất tử xoay vòng chiêu như `--god`. Ghi lúc boss vào từng pha (qua mốc máu `phases[].hp`). Đánh dấu pha dưới 15 giây và trận trên 300 giây hoặc không hạ trong 600 giây. Dùng chính sim server (cơ chế giáp, chui đất, phản đòn đều chạy thật).

**Giới hạn:** (1) nhóm toàn cùng một công pháp, không có hộ pháp/đan sư thật nên Kiếm tu×4 là nhóm DPS thuần, nhanh hơn nhóm thật; hãy đọc cột Cổ Thần (giữa) làm mốc; (2) bot đứng yên không né, không chơi cơ chế (không đánh đúng lúc phản, không phá neo/mặt, không né vùng nổ), nên các boss có `reflect`, `anchor`, `faces` cho số **cận trên**, không phải thời gian người thật; (3) mốc "ngắn/dài" 15/300 giây là ngưỡng đề xuất của tôi, chưa ai duyệt; (4) boss khe mạch (`boss_tu_quang_duc_chu`) không hạ bằng sát thương nên bỏ qua.

Lượt đo 28/11 (2 lần mỗi ô; tổng giây = pha 0 | pha 1 | …; Kiếm tu / Cổ Thần / Đan sư):

| Boss (cấp, nơi, người) | Kiếm tu | Cổ Thần | Đan sư |
| --- | --- | --- | --- |
| boss_han_giao (15, Vân Lam, 3) | 102 = 28 / 38 / 36 | 127 = 42 / 42 / 43 | 151 = 55 / 48 / 48 |
| boss_kiem_khoi (12, Kiếm Trủng, 4) | **23** = 12 / 11 | 33 = 16 / 17 | 42 = 17 / 25 |
| boss_huyet_lang_vuong (13, Kiếm Trủng, 4) | **29** = 14 / 15 | 45 = 19 / 25 | 55 = 25 / 29 |
| boss_thu_mo_tuong (15, Kiếm Trủng, 4) | **37** = 14 / 9 / 13 | 58 = 22 / 15 / 22 | 72 = 25 / 21 / 25 |
| boss_dia_mach_long (19, Đoạn Mạch, 3) | **47** = 15 / 8 / 9 / 15 | 69 = 19 / 14 / 14 / 22 | 83 = 25 / 20 / 12 / 25 |
| boss_thach_tam_khoi_vuong (18, Phục Mạch, 4) | **15** = 5 / 6 / 4 | **20** = 6 / 6 / 7 | **29** = 10 / 8 / 11 |
| boss_thon_mach_ngo_cong_vuong (19, Phục Mạch, 4) | **34** = 15 / 5 / 11 / 3 | 58 = 20 / 18 / 13 / 8 | 79 = 26 / 28 / 18 / 8 |
| boss_kinh_nguyet_chan_quan (23, Kính Nguyệt, 4) | 55 = 20 / 16 / 19 | 82 = 31 / 24 / 27 | 129 = 45 / 30 / 55 |
| boss_van_hai_kinh_vuong (23, Vân Hải, 3) | 52 = 16 / **6** / 17 / 14 | 82 = 25 / 19 / 14 / 24 | 109 = 32 / 18 / 25 / 33 |
| boss_vo_dien_than_quan (27, Thần Tạng, 4) | 83 = 25 / 36 / 23 | 154 = 46 / 54 / 53 | 223 = 63 / 91 / 69 |
| boss_thien_khuyet_thu_linh (27, Thiên Khuyết, 3) | 74 = 20 / 19 / 16 / 19 | 132 = 39 / 25 / 27 / 41 | 230 = 53 / 38 / 34 / 106 |
| boss_tam_thu_nguc_khuyen (29, Bắc Hoang, 3) | 82 = 21 / 20 / 20 / 22 | 142 = 41 / 28 / 27 / 44 | 199 = 61 / 38 / 39 / 61 |
| boss_xich_tan_cu_khoi (28, Xích Tàn Khích, 4) | **24** = 8 / 6 / 10 | 42 = 11 / 15 / 16 | 58 = 25 / 20 / 13 |
| boss_tu_nhan_ma_tuong (28, Xích Tàn Khích, 4) | **25** = 12 / 13 | 46 = 22 / 25 | 70 = 34 / 36 |
| boss_tan_hoa_kiem_co (31, Bắc Hoang, 3) | 73 = 25 / 25 / 23 | 132 = 47 / 44 / 41 | 180 = 67 / 58 / 55 |
| boss_thu_khich_duc_chu (31, Bắc Hoang, 3) | **>600** = 126 / 114 / 360 | **>600** = 173 / — | **>600** = 231 / — |
| boss_kim_da_ma_hau (31, Bắc Hoang, 3) | 122 = 41 / 41 / 40 | 212 = 73 / 76 / 63 | **>600** = 108 / 130 / 222 |
| boss_hu_anh_chu (39, Vấn Đỉnh, 3) | 176 = 53 / 42 / 81 | **>600** = 70 / 69 / 445 | **>600** = 126 / — |
| boss_dinh_linh (43, Vấn Đỉnh, 3) | 174 = 63 / 48 / 63 | 291 = 85 / 71 / 135 | **>600** = 140 / 114 / 324 |
| boss_phu_chu (42, Giới Trì, 4) | 157 = 49 / 43 / 65 | **395** = 70 / 54 / 271 | **>600** = 114 / 102 / 385 |
| boss_kieu_thu (47, Cửu Kiều, 3) | 232 = 73 / 60 / 98 | **>600** = 104 / 85 / 411 | **>600** = 168 / 175 / 256 |
| boss_ve_kieu (46, cầu 4, 4) | 36 | 47 | 79 |
| boss_thach_tuong (46, cầu 5, 4) | 53 | 57 | 89 |
| boss_dao_linh (47, cầu 6, 4) | 90 = 33 / 23 / 34 | 119 = 45 / 28 / 46 | 236 = 83 / 50 / 104 |

**Boss quá ngắn** (đáng soi nhất; đề xuất chỉ để người dùng duyệt, chưa sửa):

| Boss | Tổng hiện tại (Cổ Thần) | `hpMul` hiện tại | Đề xuất |
| --- | --- | --- | --- |
| `boss_thach_tam_khoi_vuong` | 20 giây, mỗi pha 6–7 giây, kể cả Đan sư chỉ 29 | 26 | ×3 (78) để ~60 giây, pha dài hơn 15 giây |
| `boss_kiem_khoi` (boss phó bản đầu) | 33 giây | 32 | ×1,75 (56) để ~68 giây |
| `boss_huyet_lang_vuong` | 45 giây | 37 | ×1,5 (55) |
| `boss_xich_tan_cu_khoi` | 42 giây, pha 11 / 15 / 16 | 40 | ×1,5 (60) |
| `boss_tu_nhan_ma_tuong` | 46 giây | 45 | ×1,3 (58) |
| `boss_thon_mach_ngo_cong_vuong` | 58 giây nhưng pha cuối chỉ 3–8 giây (ngưỡng pha cuối 10% máu) | 75 | dời ba ngưỡng pha + tăng máu (xem bảng đã đo bên dưới; chỉ đổi ngưỡng pha cuối là chưa đủ) |

**Phương án cho boss quá ngắn, ĐÃ ĐO what-if** (ghi đè trong bộ nhớ bằng `fight:check --bossphases --hp id:hpMul --phase id:số_pha:ngưỡng`, 2 lần mỗi ô, SAU khi Kiếm tu đã đổi ×0,85 từ cấp 8; không đổi dữ liệu game). Tổng giây Kiếm tu / Cổ Thần / Đan sư, trước → sau (pha = giây ở từng pha của Cổ Thần):

| Boss | `hpMul` | Trước | Sau | Pha sau (Cổ Thần) |
| --- | --- | --- | --- | --- |
| `boss_thach_tam_khoi_vuong` | 26 → **78** | 19 / 21 / 30 | 53 / 64 / 84 | 22 \| 19 \| 23 |
| `boss_kiem_khoi` | 32 → **56** (đề xuất cuối) | 27 / 33 / 43 | 59 / 68 / 80 | 27 \| 41 |
| `boss_huyet_lang_vuong` | 37 → **55** | 38 / 46 / 54 | 79 / 74 / 88 | 29 \| 45 |
| `boss_xich_tan_cu_khoi` | 40 → **60** | 30 / 44 / 56 | 47 / 61 / 92 | 18 \| 24 \| 19 |
| `boss_tu_nhan_ma_tuong` | 45 → **58** | 30 / 46 / 70 | 44 / 60 / 92 | 27 \| 33 |
| `boss_thon_mach_ngo_cong_vuong` | 75 → **98**, ngưỡng pha `hp` [0,65 / 0,35 / 0,1] → **[0,7 / 0,45 / 0,25]** | 48 / 55 / 78 (pha cuối 3–7) | 58 / 83 / 113 | 25 \| 19 \| 21 \| 18 |

- Đổi riêng ngưỡng pha cuối 0,1 → 0,2 (đề xuất trước đó) KHÔNG đủ: pha 2 bị ép còn 9 giây; phải dời cả ba ngưỡng và tăng máu ~30% như bảng.
- Còn sót (nhóm toàn Kiếm tu×4 là cận trên, nhóm thật có hộ pháp/đan sư chậm hơn): pha đầu `boss_xich_tan_cu_khoi` 14 giây và hai pha cuối `boss_thon_mach_ngo_cong_vuong` 12–13 giây với Kiếm tu. Cổ Thần (mốc giữa) mọi pha ≥ 18 giây. Hai boss `boss_thu_mo_tuong` (58 giây) và `boss_dia_mach_long` (69 giây) có pha 14–15 giây ở Cổ Thần nên chưa đề xuất sửa.
- Tác động: chỉ thời gian trận của chín boss phó bản/bãi nói trên; `hpMul` cao hơn làm boss đánh người không đổi (sát thương theo `atkMul`), phần thưởng không đổi. thời gian trận đo được dài thêm 14–49 giây mỗi boss (Cổ Thần: Thạch Tâm +43, Kiếm Khôi +49, Huyết Lang +28, Xích Tàn +17, Tử Nhân +14, Thôn Mạch +28). `sim:progress` mục phó bản (E2-C) dùng `hpMul` để tính thời gian dẹp phó bản (mục tiêu ~20 phút), nên cần chạy lại sim trước khi áp; chưa chạy.
- Cách áp (nếu duyệt): sửa `hpMul` và `phases[].hp` trong `packages/content/data/monsters.json`, chạy `pnpm sim:progress`, `pnpm --filter @dtl/server fight:check --bossphases` và `content:check`.

### Số máu đề xuất cho 5 boss hạ quá nhanh (28/11, CHỜ NGƯỜI DÙNG DUYỆT, chưa chỉnh số)

**Mục tiêu TTK** (nhóm 4 người cùng công pháp, đo bằng `fight:check --bossphases`, bot bất tử, SAU khi Kiếm tu đã đổi ×0,85 từ cấp 8): nhóm **Cổ Thần (mốc giữa) hạ trong 60–90 giây, mọi pha dài ít nhất 15 giây** (đủ thấy và né ít nhất một lượt chiêu của pha đó), Đan sư (chậm nhất) không quá ~100 giây. Lý do: các boss cùng hạng đang "ổn" nằm ở 82–154 giây (Hàn Giao 127, Kính Nguyệt 82, Vô Diện Thần Quân 154); năm boss dưới đây là boss phó bản/bãi mở màn hoặc phụ nên nhắm vào cận dưới của dải đó, không phải ngang các boss chính. Nhóm toàn Kiếm tu×4 là cận trên (nhanh hơn nhóm có hộ pháp/đan sư).

| Boss (cấp, nơi) | `hpMul` hiện tại → đề xuất | Ngưỡng pha `hp` (không đổi) | Mục tiêu (Cổ Thần) |
| --- | --- | --- | --- |
| `boss_thach_tam_khoi_vuong` (18, Phục Mạch) | 26 → **78** (×3) | 0,66 / 0,33 | 60–70 giây |
| `boss_kiem_khoi` (12, Kiếm Trủng, boss đầu) | 32 → **56** (×1,75) | 0,5 | ~70 giây |
| `boss_huyet_lang_vuong` (13, Kiếm Trủng) | 37 → **55** (×1,5) | 0,5 | ~75 giây |
| `boss_xich_tan_cu_khoi` (28, Xích Tàn Khích) | 40 → **60** (×1,5) | 0,66 / 0,33 | ~60 giây |
| `boss_tu_nhan_ma_tuong` (28, Xích Tàn Khích) | 45 → **58** (×1,3) | 0,5 | ~60 giây |

**TTK theo pha, trước → sau** (giây; tổng = pha 0 \| pha 1 \| …; 2 lần mỗi ô, sai số khoảng ±10%):

| Boss | Kiếm tu | Cổ Thần | Đan sư |
| --- | --- | --- | --- |
| `boss_thach_tam_khoi_vuong` | 19 = 7 \| 7 \| 5 → **53** = 19 \| 16 \| 18 | 21 = 6 \| 6 \| 8 → **64** = 22 \| 19 \| 23 | 30 = 10 \| 9 \| 11 → **84** = 31 \| 26 \| 27 |
| `boss_kiem_khoi` | 27 = 14 \| 14 → **59** = 23 \| 36 | 33 = 16 \| 17 → **68** = 27 \| 41 | 43 = 17 \| 26 → **80** = 38 \| 42 |
| `boss_huyet_lang_vuong` | 38 = 17 \| 21 → **79** = 29 \| 51 | 46 = 19 \| 27 → **74** = 29 \| 45 | 54 = 24 \| 30 → **88** = 38 \| 51 |
| `boss_xich_tan_cu_khoi` | 30 = 11 \| 8 \| 11 → **47** = 14 \| 17 \| 16 | 44 = 11 \| 16 \| 17 → **61** = 18 \| 24 \| 19 | 56 = 21 \| 23 \| 12 → **92** = 33 \| 30 \| 29 |
| `boss_tu_nhan_ma_tuong` | 30 = 15 \| 15 → **44** = 20 \| 23 | 46 = 23 \| 23 → **60** = 27 \| 33 | 70 = 34 \| 35 → **92** = 47 \| 45 |

**Lý do từng boss:**
- **Thạch Tâm Khôi Vương**: `hpMul` 26 thấp hẳn so với cùng phó bản/tầng (Thôn Mạch Ngô Công Vương 75 cùng Phục Mạch, Địa Mạch Long 66 cấp 19). Hiện chết trong 21 giây, mỗi pha 6–8 giây, nên không kịp thấy lượt chiêu nhảy đập (`leap`) và lộ yếu điểm (`reveal`) lần thứ hai. ×3 ngang nhóm boss tầng đó.
- **Kiếm Khôi** (boss phó bản đầu, 4 người): hiện 33 giây (pha 16 \| 17). ×1,75 cho 68 giây; thử ×2 (64) ra 82 giây nhưng khi đó vượt cả Huyết Lang Vương (74 giây) là boss sau nó, nên chọn 56.
- **Huyết Lang Vương**: 46 giây, đòn chuỗi + quét. ×1,5 cho 74 giây, đặt trên Kiếm Khôi (68) và Thủ Mộ Tướng (58, 3 pha + chú, không đổi) để thứ tự thời gian Kiếm Trủng là 68 → 74 → 58 (Thủ Mộ Tướng nhiều pha nên cảm giác dài hơn thực tế).
- **Xích Tàn Cự Khôi** và **Tử Nhân Ma Tướng** (cùng Xích Tàn Khích): 44 và 46 giây; mỗi pha 11–23 giây. ×1,5 và ×1,3 đưa cả hai về ~60 giây, pha 18–33 giây. Tử Nhân tăng ít hơn vì đã có triệu hồi đệ tử kéo dài trận.

**Tác động:** chỉ thời gian trận của năm boss; sát thương boss gây ra (`atkMul`) và phần thưởng không đổi. Trận dài thêm (Cổ Thần): Thạch Tâm +43, Kiếm Khôi +35, Huyết Lang +28, Xích Tàn +17, Tử Nhân +14 giây. Mục phó bản của `sim:progress` (E2-C, mục tiêu ~20 phút mỗi phó bản) tính theo `hpMul` nên phải chạy lại sim sau khi áp; chưa chạy. Còn sót (nhóm toàn Kiếm tu, cận trên): pha đầu Xích Tàn Cự Khôi 14 giây.
**Cách áp khi duyệt:** sửa `hpMul` trong `packages/content/data/monsters.json`, rồi `pnpm sim:progress`, `pnpm --filter @dtl/server fight:check --bossphases --only-boss <5 id>`, `content:check`. Thử trước không ghi file: `--hp boss_thach_tam_khoi_vuong:78,boss_kiem_khoi:56,boss_huyet_lang_vuong:55,boss_xich_tan_cu_khoi:60,boss_tu_nhan_ma_tuong:58`.

### Đã áp dụng 5 boss (28/11, người dùng duyệt): `hpMul` 26 → 78, 32 → 56, 37 → 55, 40 → 60, 45 → 58

Đo lại sau khi áp (`fight:check --bossphases`, 2 lần mỗi ô; tổng giây = pha 0 | pha 1 | …):

| Boss | Kiếm tu | Cổ Thần | Đan sư |
| --- | --- | --- | --- |
| `boss_thach_tam_khoi_vuong` | 54 = 19 \| 18 \| 18 | 65 = 24 \| 18 \| 23 | 83 = 31 \| 24 \| 28 |
| `boss_kiem_khoi` | 61 = 23 \| 38 | 71 = 28 \| 42 | 80 = 37 \| 44 |
| `boss_huyet_lang_vuong` | 76 = 30 \| 47 | 73 = 28 \| 45 | 87 = 37 \| 50 |
| `boss_xich_tan_cu_khoi` | 47 = 16 \| 15 \| 16 | 59 = 18 \| 24 \| 17 | 92 = 34 \| 29 \| 28 |
| `boss_tu_nhan_ma_tuong` | 42 = 20 \| 22 | 60 = 27 \| 33 | 91 = 46 \| 46 |

Khớp phương án what-if. Mục tiêu đạt: Cổ Thần 59–73 giây, mọi pha ≥ 17 giây; chỉ còn pha 1 của Xích Tàn Cự Khôi với nhóm toàn Kiếm tu là 15 giây.

**`sim:progress`:** không thêm dòng LỖI nào (vẫn 2 dòng cũ), Ngưng Khí 15 vẫn 3,5 giờ. Mục phó bản (E2-C, mục tiêu ~20 phút kể cả lỡ tay lần đầu), trước → sau:

| Phó bản | Sạch thuần | Kể cả lỡ tay | Đợt boss |
| --- | --- | --- | --- |
| `kiem_trung` (Kiếm Khôi, Huyết Lang Vương, Thủ Mộ Tướng) | 9,3 → 10,8 phút | 16,8 → **19,4** phút | đợt 2–4: 121/141/171 → 168/181/171 giây |
| `phuc_mach` (Thạch Tâm Khôi Vương, Thôn Mạch) | 11,1 → 13,0 phút | 20,0 → **23,4** phút | đợt 4: 108 → 223 giây |
| `xich_tan_khich` (Xích Tàn Cự Khôi, Tử Nhân Ma Tướng) | 13,7 → 15,1 phút | 24,7 → **27,1** phút | đợt 3 và 5: 147/164 → 195/196 giây |

Kiếm Trủng đến gần mục tiêu hơn (16,8 → 19,4 phút). Phục Mạch (+3,4 phút) và Xích Tàn Khích (+2,4 phút) vượt thêm mục tiêu 20 phút; Xích Tàn Khích vốn đã 24,7 phút trước khi đổi, và nhiều phó bản khác cũng trên 20 phút (Kinh Nguyệt 24,7, Thần Tạng 29,2, Giới Trì 31,1, Kim Dạ Cung 40,0). Sim phó bản tính thời gian boss theo công thức riêng (dps nhóm × hiệu suất 0,6, nhân 1,8 lỡ tay lần đầu), nên mức tăng lớn hơn so với thời gian trận bot đo (14–43 giây mỗi boss): hai con số đo hai thứ khác nhau.

**Boss quá dài hoặc không hạ được** (bot không chơi cơ chế, chỉ là cận trên): `boss_thu_khich_duc_chu` (phản đòn + neo; pha 0 đã 126–231 giây), `boss_hu_anh_chu` (phản đòn), `boss_phu_chu` (hai mặt + phản đòn; pha cuối 271–385 giây với Cổ Thần/Đan sư), `boss_kieu_thu` và `boss_dinh_linh` (pha cuối 135–411 giây), `boss_kim_da_ma_hau` (gương, chú). Đề xuất: KHÔNG sửa số trước khi có lượt chơi thật các cơ chế này; nếu muốn một mốc nhanh, đặt máu pha cuối bằng ~30% tổng (ngưỡng `hp` 0,3) như đa số boss khác, và `hpMul` các boss Vấn Đỉnh → Cửu Kiều giảm ~20%.

**Boss ổn** (mọi hướng 40–230 giây, pha đều): `boss_han_giao`, `boss_kinh_nguyet_chan_quan`, `boss_vo_dien_than_quan`, `boss_thien_khuyet_thu_linh`, `boss_tam_thu_nguc_khuyen`, `boss_tan_hoa_kiem_co`, `boss_dao_linh`, `boss_ve_kieu`, `boss_thach_tuong` (hai boss cầu không có pha).

## Đan sư và Thể tu thấp hơn trung vị: phân tích và phương án (28/11, CHỈ ĐỀ XUẤT, chưa chỉnh số)

**Số đo hiện tại** (sau #880; `fight:check --dps 90 --runs 2 --mon mon_thach_giap_te`, quái cận chiến, tỉ lệ so với trung vị 9 hướng): Đan sư **0,87 / 0,80 / 0,64** ở cấp 10 / 16 / 31; Thể tu **1,00 / 1,00 / 0,83**. Trên bảng chuẩn cấp 23–47 là 0,61–0,68 và 0,76–0,87 (lượt đo trước). Tức Thể tu ổn tới cấp 16 rồi tụt, Đan sư tụt dần từ cấp 10.

**Nguyên nhân (chiêu, chỉ số, vai trò):**
- **Đan sư không có chiêu sát thương lớn riêng.** Chiêu đặc trưng `skl_hoi_xuan_quyet` là hồi kèm Mộc độc (hệ số 0,4 trong 8 giây, hồi chiêu 22 giây), chiêu tối thượng `skl_hoi_thien_dan_lo` là HỒI SINH (không gây sát thương). Chiêu đánh riêng chỉ có `skl_dan_hoa_chi` (1,05) và `skl_dan_hoa_vu` (1,2, hồi chiêu 6 giây), đều là chiêu TƯ THẾ (mở ở cấp 12, phải vào tư thế 45 giây hồi), và `skl_dan_hoa_phong_tran` (2,6, hồi chiêu 16 giây, cấp 20). Các hướng khác lấy 25–40% sát thương từ chiêu tối thượng + chiêu đặc trưng (Kiếm tu 38%, Đao tu 33% ở cấp 10); Đan sư chỉ 5–26% sát thương đến từ chiêu riêng và độc (cấp 10 đến 16), còn lại là chiêu chung của mọi hướng (Kiếm Khí Trảm 27%, đòn thường 27%, Lôi Đình 12% ở cấp 16). Nội tại: khí huyết −12% (đổi lấy hồi +20% và tầm +4 m).
- **Thể tu có chiêu đánh riêng** (`skl_chan_son_quyen` 2,0 hồi 4 giây, `skl_thiet_quyen_chan_dia` 2,2, đều từ cấp 12–16) nhưng chiêu tối thượng `skl_kim_cuong_bat_hoai` là phòng thủ (không sát thương) và chiêu đặc trưng `skl_tran_son_an` là khiêu khích (0,5). Nội tại: giáp +15%, khí huyết +12%, đòn cận +10%. Vì vậy ngang trung vị ở cấp 10–16 nhưng thiếu "đỉnh" ở cấp 31 khi các hướng khác có thêm chiêu nhánh mạnh (0,83).
- **Hình nộm một mục tiêu không tính phần bù của vai trò.** Số đo vai trò bù (sim và bot, chỉ để tham khảo): tự hồi/khiên Đan sư 3,1% khí huyết mỗi giây so với 1,5% của hướng khác; tinh anh chương 5 cấp 28 mất máu: Đan sư 33%, Thể tu 40% so với Kiếm tu 62%, Hồn tu 58%; kéo cụm 2 quái ở cấp 31 mất máu: Đan sư 4% so với trung vị 12% (Thể tu 14%, không thấy lợi thế). Trong tổ đội còn: cộng hưởng vai trò +5% sát thương cả đội khi đủ ba vai, lĩnh vực hộ pháp giảm 6% (×1,5 ở Hóa Thần) sát thương nhận, đan sư hồi ~0,4% mỗi giây; những thứ này chưa có số đo (cần nhóm thật).
- **Sim và bot đang bất đồng, quan trọng nhất.** `sim:progress` (người thật dùng cơ chế ~60%, kéo cụm, độc trúng 2 quái `POISON_MOBS`) cho Đan sư và Thể tu bằng hoặc NHANH hơn Kiếm tu: Trúc Cơ sơ kỳ hạ quái thường Kiếm 6,8 giây / Thể 6,2 / Đan 6,3 (Kiếm tu chậm nhất sau #880); tinh anh chương 5 cấp 28 Kiếm 25 / Thể 22 / Đan 22 giây; nhịp Ngưng Khí 15 Kiếm 3,50 giờ / Thể 3,25 / Đan sư **3,01** (sát cận dưới 3 giờ). Bot một mục tiêu thì ngược lại (Đan 0,6–0,87). Sự thật nằm giữa; chưa có lượt chơi thật của Đan sư/Thể tu một mình để chọn.

**Phương án đã đo what-if** (ghi đè trong bộ nhớ, không ghi file; bot = `fight:check --dps` cấp 10 / 16 / 31, sim = `sim:progress`):

| Phương án | Bot: Đan sư | Bot: Thể tu | Sim |
| --- | --- | --- | --- |
| Nền (hiện tại) | 0,87 / 0,80 / 0,64 | 1,00 / 1,00 / 0,83 | 2 LỖI sát ngưỡng (xem dưới), NK15: Đan 3,01 giờ, Thể 3,25 giờ |
| **A.** hệ số dương cho công pháp (`MethodDef.late` > 1, cần nới cận trên `content:check` từ 1,0): Đan sư ×1,3 từ cấp 5, Thể tu ×1,15 | **1,06 / 0,99 / 0,84** | 1,07 / 1,04 / 0,97 (đo ×1,15 từ cấp 5; ở sim thử từ cấp 20) | Đan sư ×1,3: NK15 Đan **2,57 giờ (< 3)**, **27 dòng LỖI** (TTK quái thường 3,2–3,6 giây và tinh anh 16–18 giây ngắn quá, TTK trang bị 2,4 giây, `elite_xich_dien_ho` 17 giây). Thể tu ×1,15 từ cấp 20: 8 LỖI (6 mới: Thể tu TTK quái thường 3,5–3,7 giây ở cấp 27–34) |
| **B.** chỉnh bộ chiêu: Đan sư độc 0,4 → 0,8 và 0,35 → 0,7, `dan_hoa_chi` 1,05 → 1,4, `dan_hoa_vu` 1,2 → 1,6, `dan_hoa_phong_tran` 2,6 → 3,2; Thể tu `chan_son_quyen` 2,0 → 2,4, `thiet_quyen_chan_dia` 2,2 → 2,6, `kim_than_quyen` 1,2 → 1,4 | 0,92 / 0,89 / 0,73 | 0,94 / 1,00 / 0,89 | 14 LỖI: NK15 Đan sư 2,69 giờ (< 3), Đan sư TTK quái thường 3,5–3,7 giây, và kiểm "VS-2 sát thương thực tế lệch mô hình" của Thể tu +5–7% (quá +5%) |
| **C.** giữ vai trò, chưa buff | không đổi | không đổi | không đổi |

(Trung vị thay đổi theo từng phương án nên cột "Bot" của hướng không đổi cũng xê dịch ±0,05.)

**Kết luận và khuyến nghị: C, chưa buff.** Mọi buff đo được đều đẩy sim vào 8–27 dòng LỖI và làm Đan sư lên cấp dưới 3 giờ, vì sim đã coi Đan sư/Thể tu ngang hoặc hơn Kiếm tu. Hai hướng làm ngược nhau; muốn buff thì phải hiệu chỉnh sim trước. Việc nên làm theo thứ tự: (1) người dùng/chơi thử Đan sư và Thể tu một mình ở cấp 10–31, xác nhận có chậm thật không; (2) nếu thật: hạ `POISON_MOBS` 2 → 1 và bỏ phần cộng tư thế cho Đan sư trong `playerDps` (sim sẽ cho Đan sư chậm đi đúng như bot), rồi mới áp A hoặc B và chỉnh ngưỡng sim cho hai hướng; (3) nếu chỉ muốn một bước nhỏ ngay: Thể tu ×1,1 từ cấp 28 (chưa đo; kỳ vọng 0,83 → ~0,9 ở cấp 31). Ngoài ra: sau #880 sim xếp Kiếm tu chậm nhất mà bot xếp nhanh nhất; nếu chơi thật thấy Kiếm tu cấp 10–20 chậm, nới hệ số ×0,85 lên ×0,9 (chưa đo).

### Hai dòng LỖI sim sau #880

1. **`itm_tram_ta_kiem` cường hóa +5 tốn 1,2 giờ thu nhập (ngưỡng 1,2).** Nguyên nhân: thu nhập mỗi giờ ở cấp 15 (theo nhịp hạ quái của Kiếm tu) giảm 4274 → 3750 (−12%) sau #880, còn chi phí +5 giữ 4620 (1,08 → 1,23 giờ). Phương án: (a) hệ số giá cường hóa `enhanceCost` 0,06 → 0,055 (`packages/shared/src/formulas.ts`): +5 4620 → 4284 (1,14 giờ), +9 có Hộ Phù 22403 → 20792 (6,0 → 5,5 giờ, trong 2–7), +10 33237 → 30875 (8,9 → 8,2 giờ); mọi món cường hóa rẻ ~7%; (b) nới ngưỡng `balance.ts` 1,2 → 1,3 (không đổi game); (c) giữ. **Khuyến nghị (b)**: mục tiêu "+5 trong khoảng 1 giờ thu nhập" là mềm, thu nhập giảm do chủ ý nên không cần đổi giá kinh tế cả game.
2. **Kiếm tu đánh tinh anh chương 5 cấp 28 mất 62% máu (ngưỡng 60%).** Nguyên nhân: tinh anh bãi đó là `elite_hoi_giac_cu_thu` (`atkMul` 2,4); Kiếm tu hạ nó chậm hơn sau #880 (21 → 25 giây) nên chịu đòn lâu hơn (52% → 62%); Hồn tu 58% cũng sát, Đan sư 33%, Thể tu 40%. Từ cấp 29 trở đi chỉ còn 0–3%. Phương án: (a) `atkMul` 2,4 → 2,25 (ước tính 62% → ~58%, tỉ lệ thuận; Hồn tu → ~54%); (b) nới ngưỡng `ch5.ts` 0,6 → 0,65; (c) giữ. **Khuyến nghị (b)**: chỉ một mốc cấp (28) và các hướng đánh sát thương đều quanh 58–62%; đổi `atkMul` ảnh hưởng mọi người chơi gặp tinh anh này.

## Mô hình `sim:progress` đã sửa (28/11)

- Đòn quét của đòn thường cận chiến (`CLEAVE_EXTRA`): bản 27/11 sáng tính trọn một quái đứng cạnh cho MỌI phép tính thời gian hạ, kể cả tinh anh là mục tiêu đơn, nên Kiếm tu ra số nhanh giả (tinh anh Xích Diễm Hồ 19 giây trong sim). Nay: kéo `PULL` con thì bình quân (`PULL` − 1) / 2 con đứng cạnh (= `PULL_FACTOR` − 1), và các phép tính tinh anh truyền 0 (`playerDps(..., 'avg', 0)`).
- Kết quả: 13 dòng LỖI còn 6; hết mọi lỗi tinh anh. Nhịp Ngưng Khí 15 của sim 3,0 → 3,1 giờ, mốc Trúc Cơ 4 giờ vẫn trong ±12%.
- Lúc đó còn 6 dòng LỖI, đều là Kiếm tu hạ quái thường trong 3,7–3,8 giây so với ngưỡng dưới 3,8 giây (chương 4, 5, 6): phần nhanh thật do đòn quét. Đã xử ở mục "Cân bằng game thật đã chỉnh 28/11" (còn 2 dòng).
- Bot của `fight:check` trước đây không biết chiêu cần sao Cổ Thần: bấm mãi chiêu bị server từ chối thay cho đòn thường, nên Cổ Thần cấp 21+ chạm trần 600 giây. Nay bot được số sao theo cấp và bỏ chiêu chưa đủ sao.
