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

Chưa có: nút trên tab Diễn Võ (hiện gõ lệnh ở khung chat), lớp vẽ vùng trúng thật đè lên vạch báo, phép thử quái bỏ đuổi và kẹt vật cản.

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
- **Nhánh Huyết Trận (mốc cấp 16) của Cổ Thần cho chiêu Tinh Bạo cần 3 sao**, mà sao thứ ba chỉ rèn được từ cấp 32: người chọn nhánh này có một ô chiêu không bấm được suốt cấp 16–31.

## Mô hình `sim:progress` đã sửa (28/11)

- Đòn quét của đòn thường cận chiến (`CLEAVE_EXTRA`): bản 27/11 sáng tính trọn một quái đứng cạnh cho MỌI phép tính thời gian hạ, kể cả tinh anh là mục tiêu đơn, nên Kiếm tu ra số nhanh giả (tinh anh Xích Diễm Hồ 19 giây trong sim). Nay: kéo `PULL` con thì bình quân (`PULL` − 1) / 2 con đứng cạnh (= `PULL_FACTOR` − 1), và các phép tính tinh anh truyền 0 (`playerDps(..., 'avg', 0)`).
- Kết quả: 13 dòng LỖI còn 6; hết mọi lỗi tinh anh. Nhịp Ngưng Khí 15 của sim 3,0 → 3,1 giờ, mốc Trúc Cơ 4 giờ vẫn trong ±12%.
- **Còn 6 dòng LỖI**, đều là Kiếm tu hạ quái thường trong 3,7–3,8 giây so với ngưỡng dưới 3,8 giây (chương 4, 5, 6): phần nhanh thật do đòn quét (`arc.mul` 0,4). Hai cách xử: hạ `arc.mul` của Kiếm tu về 0,3, hoặc nới ngưỡng dưới về 3,6 giây. Chưa làm cách nào.
- Bot của `fight:check` trước đây không biết chiêu cần sao Cổ Thần: bấm mãi chiêu bị server từ chối thay cho đòn thường, nên Cổ Thần cấp 21+ chạm trần 600 giây. Nay bot được số sao theo cấp và bỏ chiêu chưa đủ sao.
