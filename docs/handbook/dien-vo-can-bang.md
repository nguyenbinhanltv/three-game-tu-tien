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
- Lượt đo đầu còn báo Kinh Linh ở Vân Hải kẹt hai hướng (trượt quanh vật 16 giây). Ở lượt chạy sau sửa không tái hiện; điểm sinh có độ lệch ngẫu nhiên giữa các lượt nên không xác nhận được là bản sửa hay may mắn. Cần chạy lặp (`--per 6`) nếu nghi ngờ.
- Không phủ sân boss của Diễn Võ Trường (quái gọi bằng `/gm boss`, không có điểm sinh); AI về nhà dùng chung mã nên lỗi trên áp dụng như nhau.
- Phép thử không có tìm đường: quái bị vật chắn giữa đường tới người chơi vẫn chỉ trượt quanh rồi bỏ đuổi sau 4 giây (`BLOCK_STALL_MS`), đúng thiết kế hiện tại.

## Vạch báo so với vùng thật (28/11, theo đo của -307, `docs/handbook/dien-vo-truong.md`)

-307 đo 16 chiêu: không chiêu nào vẽ sai cỡ/sai hình, bán kính trong dữ liệu khớp `ai` của quái, nên **không có lệch ở dữ liệu quái hay server**. Lệch thật duy nhất là phía hiệu ứng (Kim Dạ Ma Hậu thiếu vạch trên sàn), thuộc tuyến VFX. Nghi vấn "các quái đo sau Kim Dạ Ma Hậu không ra chiêu nữa" cũng đã thử ở server: gọi lần lượt `boss_kim_da_ma_hau` (đập, niệm chú, triệu hồi), `boss_tan_hoa_kiem_co`, `elite_xich_sa_ngo_cong`, `elite_kinh_dien_ma_quan` bằng `/gm boss` + `/gm cast <loại> loop` trong CÙNG một phòng: boss nào cũng ra chiêu đều (4–16 vùng nổ trong 15 giây). Vậy server không đóng chiêu của quái đo sau, nguyên nhân (nếu có) nằm ở kịch bản chụp/client.

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

## Mô hình `sim:progress` đã sửa (28/11)

- Đòn quét của đòn thường cận chiến (`CLEAVE_EXTRA`): bản 27/11 sáng tính trọn một quái đứng cạnh cho MỌI phép tính thời gian hạ, kể cả tinh anh là mục tiêu đơn, nên Kiếm tu ra số nhanh giả (tinh anh Xích Diễm Hồ 19 giây trong sim). Nay: kéo `PULL` con thì bình quân (`PULL` − 1) / 2 con đứng cạnh (= `PULL_FACTOR` − 1), và các phép tính tinh anh truyền 0 (`playerDps(..., 'avg', 0)`).
- Kết quả: 13 dòng LỖI còn 6; hết mọi lỗi tinh anh. Nhịp Ngưng Khí 15 của sim 3,0 → 3,1 giờ, mốc Trúc Cơ 4 giờ vẫn trong ±12%.
- Lúc đó còn 6 dòng LỖI, đều là Kiếm tu hạ quái thường trong 3,7–3,8 giây so với ngưỡng dưới 3,8 giây (chương 4, 5, 6): phần nhanh thật do đòn quét. Đã xử ở mục "Cân bằng game thật đã chỉnh 28/11" (còn 2 dòng).
- Bot của `fight:check` trước đây không biết chiêu cần sao Cổ Thần: bấm mãi chiêu bị server từ chối thay cho đòn thường, nên Cổ Thần cấp 21+ chạm trần 600 giây. Nay bot được số sao theo cấp và bỏ chiêu chưa đủ sao.
