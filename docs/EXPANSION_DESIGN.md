# Thiết kế mở rộng: Kết Đan → Nguyên Anh → Hóa Thần (E-0)

> **Lưu ý (2026-11-24):** Thiết kế mở rộng bản 1 (2026-11-16); một số mục (camera, tab-target, số liệu) đã lỗi thời. Hiện trạng và quyết định mới nhất xem `CLAUDE.md` và `docs/handbook/`.

Bản 1 · 2026-11-16 · đi kèm `docs/ASSET_CONCEPTS.md` (asset người dùng dựng trên Tripo) và `docs/GAME_DESIGN_CORE.md` (mục 4 thang cảnh giới, mục 5 độ kiếp, mục 6 ba lối chơi).

Đây là tài liệu **thiết kế**, không đổi code game. Mọi con số là điểm khởi đầu cho `pnpm sim:progress` và `fight:check` ở E-5; mọi tên mới (đánh dấu †) phải vào `glossary.json` và qua `lore-keeper` trước khi vào i18n (danh sách ở mục 13).

Nguồn quyết định: `ke-hoach-mo-rong-ket-dan-hoa-than.md` (2026-11-16): tên **Kết Đan**; **3 bản đồ mới** (mỗi cảnh giới một bản đồ, room riêng, ~2 km²) + **3 phó bản** có boss; nhịp **4 giờ / 6 giờ / 8 giờ**; thiết kế cả ba trước, code lần lượt; người dùng tự dựng model tinh anh, cỏ rừng mới và asset làm đẹp.

---

## 0. Tóm tắt một trang

| | Chương 2 · Kết Đan | Chương 3 · Nguyên Anh | Chương 4 · Hóa Thần |
| --- | --- | --- | --- |
| Chặng | Trúc Cơ sơ kỳ → **Kết Đan sơ kỳ** (cấp 16→20) | Kết Đan sơ kỳ → **Nguyên Anh sơ kỳ** (cấp 20→24) | Nguyên Anh sơ kỳ → **Hóa Thần sơ kỳ** (cấp 24→28) |
| Thời lượng mục tiêu | 4 giờ | 6 giờ | 8 giờ |
| Bản đồ | **Đoạn Mạch Cổ Cốc**† (hẻm đá ochre, mạch cạn) | **Vân Hải Phù Đảo**† (đảo trôi trên biển mây) | **Thiên Khuyết Cổ Thành**† (thành cổ ban đêm, sao) |
| Phó bản | **Phục Mạch Quật**† (mỏ, 5 đợt, boss Thôn Mạch Ngô Công Vương) | **Kính Nguyệt Cung**† (gương, 5 đợt, boss Kính Nguyệt Chân Quân) | **Thần Tàng Điện**† (điện tàng, 6 đợt, boss Vô Diện Thần Quân) |
| Boss ngoài trời | Địa Mạch Long | Vân Hải Kình Vương | Thiên Khuyết Thủ Linh |
| Độ kiếp cuối chặng | **Đan Hỏa Kiếp** 55 s (ngưng đan có hộ pháp) | **Tam Trọng Kiếp** 65 s (lôi, hỏa, tâm ma; xuất khiếu) | **Thiên Nhân Kiếp** 80 s (ngũ hành, phân thân thần niệm) |
| Cơ chế mở sau độ kiếp | Thần thức, bản mệnh pháp bảo, ô chiêu 9 | Nguyên anh xuất khiếu, ngự không, thuấn di | Phân thân thần niệm, lĩnh vực lớn, ô chiêu 10 |
| Câu chuyện | Ai cắt mạch? Tàng Mạch Hội đào mạch tinh bán cho các tông | Mạch tinh trôi lên mây: Kính Nguyệt Cung giữ "bóng của mạch" | Cựu Thiên Điện hút cạn mạch vào Cổ Thành để giữ một Hóa Thần đã chết |

**Cách hiểu "mỗi cảnh giới một bản đồ"** (đã chốt, mục 15): *chương N là chặng kết thúc bằng độ kiếp vào cảnh giới N*. Người chơi cày bản đồ của chương trong lúc còn ở cảnh giới trước, độ kiếp ở cuối chương, rồi mang cơ chế mới của cảnh giới vừa đạt vào chương sau. Nhờ vậy ba nhịp 4/6/8 giờ khớp chính xác với ba bản đồ, và mỗi bản đồ được thiết kế quanh cơ chế người chơi **đã có** khi tới (Trúc Cơ: bay thấp tiết kiệm; Kết Đan: thần thức; Nguyên Anh: xuất khiếu và thuấn di).

**Thang cấp mới** (mở rộng `realms.json`): Trúc Cơ thêm tầng đại viên mãn (cấp 19); Kết Đan cấp 20–23; Nguyên Anh cấp 24–27; Hóa Thần sơ kỳ cấp 28 (trần tạm, `MAX_LEVEL = 28`). Mỗi đại cảnh giới có 4 tiểu cảnh giới (sơ, trung, hậu kỳ, đại viên mãn) theo `glossary.stages`.

**Quyết định:** đã chốt, xem mục 15.

---

## 1. Nền truyện và ba chương

### 1.1 Điều đã có (không đổi)

Linh khí Huyền Linh Giới đang cạn (kỳ Linh Thoái†). Vân Lam Sơn Mạch là một nhánh mạch còn sống; Lạc Kiếm Tông dựng sơn môn ở đó; Hàn Giao ngủ trên mắt mạch dưới Hồ Sương Mù; Kiếm Trủng là mộ của một trận tranh mạch. Cơ duyên có hạn; săn yêu thú là **giành phần linh khí**.

### 1.2 Điều mới: Linh Thoái không phải trời định

Sau khi Hàn Giao ngã, mạch Vân Lam "thở" một nhịp rồi lại yếu. Lạc Vân chân nhân nhận ra: mạch không cạn vì già, mà vì **bị cắt từ thượng nguồn**. Ba chương lần theo đường mạch ngược về nguồn:

1. **Đoạn Mạch Cổ Cốc**: nơi mạch bị đào. Tàng Mạch Hội† đục mạch tinh bán cho các tông đang đói linh khí. Không phải kẻ ác thuần túy: họ cũng chết đói.
2. **Vân Hải Phù Đảo**: mạch tinh bị đào xong thì đoạn mạch trôi lên cao thành đảo. Kính Nguyệt Cung† giữ "bóng của mạch" (mạch ảnh†) để dò mạch thật; kẻ canh giữ đã tự chia thân quá lâu, không còn biết đâu là mình.
3. **Thiên Khuyết Cổ Thành**: Cựu Thiên Điện† (tông đầu tiên của giới) hút mạch vào thành để giữ sống một Hóa Thần đã chết từ lâu. Người chơi mở phong ấn, trả mạch về chỗ cũ.

Kết: mạch chảy trở lại nhưng **về hướng bắc**, nơi chưa ai đặt chân (móc cho các cảnh giới sau Hóa Thần).

Nguyên tắc giữ từ `GAME_DESIGN_CORE.md` mục 2.2: không chép truyện có sẵn; mỗi địa danh trả lời "vì sao chỗ này quý"; lời thoại ngắn, có việc, không hô tên chiêu.

### 1.3 Nhân vật và phe mới (tự sáng tác)

| Tên | Vai | Ở đâu | Giọng |
| --- | --- | --- | --- |
| **Tô Vãn Ngư**† | Mạch tuần sứ của Lạc Kiếm Tông, nữ, dò mạch; người dẫn đường chương 2 và 3 | Hạ Khuyết Trạm, sau đó Phù Đảo Các | Ngắn, khô, hay nhìn đất khi nói |
| **Hứa lão**† | Quản trạm, bán đồ, nâng cấp trang bị bậc 2 (thay Thiết lão ở chương 2) | Hạ Khuyết Trạm | Lải nhải về giá cả, thật bụng |
| **Khưu Hàn Sơn**† | Hội chủ Tàng Mạch Hội; cắt mạch để cứu tộc nhân; không đánh trực tiếp, bị thất thế cuối chương 2 | Cựu Mỏ Khu | Điềm đạm, nói như đang tính sổ |
| **Lâm Chiếu Dung**† | Chủ Phù Đảo Các, nữ, phi hành sư; dẫn chương 3 | Phù Đảo Các | Nhanh, thẳng, hay hỏi ngược |
| **Kính Nguyệt Chân Quân**† | Cựu trưởng lão, tự chia thân giữ Kính Nguyệt Cung; boss | Kính Nguyệt Cung | Lặp lại câu cuối của người đối diện |
| **Mặc Chiếu**† | Thủ điện Cựu Thiên Điện, vẫn nghĩ mình đang giữ một vị Hóa Thần còn sống; dẫn tin chương 4 qua tàn niệm | Thiên Khuyết Cổ Thành | Trang trọng, cũ |
| **Huyền Cơ**† | Hóa Thần của Cựu Thiên Điện, đã chết từ lâu; tiếng vọng, không có hình | Thần Tàng Điện | Chỉ một câu trong cả game (xem 1.5) |
| **Vô Diện Thần Quân**† | Boss: phần "thủ" còn lại của Huyền Cơ, không mặt vì đã mất tên | Thần Tàng Điện | Không nói |

Giữ NPC Vân Lam: Lạc Vân chân nhân gửi thư tay ở mỗi chương (thẻ chương + một đoạn thoại); Tố Tâm mở thêm công thức đan bậc 2–4; Thiết lão chỉ làm bậc 1 (người chơi quay về nâng cấp đồ cũ).

### 1.4 Tuyến nhiệm vụ

Id nhiệm vụ `q2_*`, `q3_*`, `q4_*` (chính) và `s2_*`... (phụ). Mục tiêu dùng loại có sẵn (`kill`, `gather`, `talk`, `dungeon`, `breakthrough`, `craft`, `enhance`); loại mới cần server: `scan` (dùng thần thức), `escort`, `touch` (chạm trận). Tu vi thưởng ≈ 14% tu vi chặng.

**Chương 2 · Đoạn Mạch** (cần xong `q_truc_co`, Trúc Cơ sơ kỳ; tổng thưởng ~34.000 tu vi)

| Id | Nội dung | Mục tiêu | Cấp | Thưởng |
| --- | --- | --- | --- | --- |
| `q2_thu_ha_son` | Lạc Vân gửi thư: mạch bị cắt, đi Đoạn Mạch Cổ Cốc tìm Tô Vãn Ngư | `talk` Tô Vãn Ngư (qua Truyền Tống mới) | 16 | 1.500 tu vi, mở Truyền Tống liên bản đồ |
| `q2_mach_tinh` | Tô Vãn Ngư dẫn đi xem vết đào đầu tiên ở Sa Thạch Pha | `kill` Thạch Giáp Tê ×12, `touch` Mạch Tinh Trụ | 16 | 2.200 |
| `q2_khu_khoi_loi` | Khôi lỗi khai mạch của Hội còn chạy khi chủ đã bỏ | `kill` Khai Mạch Khôi Lỗi ×14 | 17 | 3.600 |
| `q2_cau_da` | Tìm lối qua Khô Hà Đạo, thu mẫu đá | `gather` Mạch Tinh Phiến ×6, `kill` Hộ Mạch Khôi Tướng | 17 | 4.200 |
| `q2_xich_sa` | Hang Sa nuốt mạch tinh rơi; ngô công lớn lên nhờ đó | `kill` Ngô Công Ấu ×16, `kill` Xích Sa Ngô Công | 18 | 5.600 |
| `q2_hoi_chu` | Thám tử Hội: đọc sổ, nghe lời Khưu Hàn Sơn | `kill` Mạch Thương Hộ Vệ ×14, `talk` Khưu Hàn Sơn | 18 | 6.000 |
| `q2_phuc_mach` | Vào mỏ, dừng việc đào | `dungeon` Phục Mạch Quật ×1 | 18 | 7.500 |
| `q2_dia_mach` | Địa Mạch Long là con rồng gác mạch, không phải kẻ địch; nhưng nó đang bị đau | `kill` Địa Mạch Long | 19 | 9.000 |
| `q2_ket_dan` | Hội chủ nhường lại Kết Đan Dịch; độ kiếp | `breakthrough` | 19 viên mãn | 0 + Huyền Thiết Đan Y (bộ bậc 3) |

Nhiệm vụ phụ chương 2 (4): `s2_ho_tong` (hộ tống thương nhân qua Khô Hà Đạo, loại `escort`), `s2_cu_tho` (hái 8 Hoàng Sa Thảo cho Tố Tâm), `s2_kiem_gay` (nhặt 5 mảnh kiếm gãy giống ở Kiếm Trủng, nối với `q_kiem_trung`), `s2_thu_nghiem` (thử Thần thức trên bản đồ, mở ở Kết Đan, thưởng sớm).

**Chương 3 · Vân Hải** (cần xong `q2_ket_dan`; tổng ~63.000 tu vi)

| Id | Nội dung | Mục tiêu | Cấp |
| --- | --- | --- | --- |
| `q3_len_may` | Truyền Tống tới Phù Đảo Các; gặp Lâm Chiếu Dung | `talk` | 20 |
| `q3_van_hac` | Vân Hạc đã tha mạch tinh về làm tổ | `kill` Vân Hạc ×14 | 20 |
| `q3_than_thuc` | Dùng thần thức tìm đảo thật giữa các đảo ảnh | `scan` ×3 | 21 |
| `q3_kinh_linh` | Gương trên đảo quay mặt về phía Kính Nguyệt Cung | `kill` Kính Linh ×16, `gather` Kính Hoa Sa ×8 | 21 |
| `q3_thach_quy` | Thạch Quy chở mạch tinh trên mai | `kill` Phù Đảo Thạch Quy ×12 | 22 |
| `q3_loi_van` | Sư tử mây nhốt cầu vồng giữa hai đảo | `kill` Lôi Vân Sư Vương | 22 |
| `q3_kinh_nguyet` | Vào Kính Nguyệt Cung | `dungeon` Kính Nguyệt Cung ×1 | 22 |
| `q3_kinh_vuong` | Kình ngư mang mạch tinh bay vòng quanh biển mây | `kill` Vân Hải Kình Vương | 23 |
| `q3_nguyen_anh` | Dưỡng Anh Đan và độ kiếp | `breakthrough` | 23 viên mãn |

Phụ (4): `s3_do_thuyen` (đưa Lâm Chiếu Dung ba chuyến giữa các đảo), `s3_bich_ngoc` (diệt bầy Bích Ngọc Kim Thiền), `s3_guong_nuoc` (đặt 4 mảnh gương vào Kính Hồ Đài), `s3_thu_ban_ve` (chép 3 bản vẽ đảo bằng thần thức).

**Chương 4 · Thiên Khuyết** (cần xong `q3_nguyen_anh`; tổng ~96.000 tu vi)

| Id | Nội dung | Mục tiêu | Cấp |
| --- | --- | --- | --- |
| `q4_bac_len` | Cổng Thành Vỡ mở bằng ba tàn niệm; nghe Mặc Chiếu | `talk` + `touch` Tinh Bái Đài | 24 |
| `q4_thach_tuong` | Tượng đá ở đại lộ vẫn tuần | `kill` Thạch Tượng Võ Sĩ ×16 | 24 |
| `q4_da_minh` | Dạ Minh Lộc dẫn đường tới Tinh Bái Đài; bị Cốt Vệ đuổi | `kill` Cốt Vệ Kiếm Thủ ×18, bảo vệ Dạ Minh Lộc (`escort`) | 25 |
| `q4_xuat_khieu` | Tường phong ấn chỉ nguyên anh đi qua được | `touch` ba môn phong ấn bằng nguyên anh xuất khiếu | 25 |
| `q4_chien_ma` | Chiến ma canh kho khí giới | `kill` Cổ Thành Chiến Ma ×16 | 26 |
| `q4_thu_linh` | Thủ Linh không phải kẻ địch, chỉ làm đúng lời dặn cũ | `kill` Thiên Khuyết Thủ Linh | 26 |
| `q4_than_tang` | Vào Thần Tàng Điện | `dungeon` Thần Tàng Điện ×1 | 26 |
| `q4_tra_mach` | Mở phong ấn, trả mạch | `touch` Tinh Bái Đài (cả tổ đội đứng cùng 10 giây) | 27 |
| `q4_hoa_than` | Hóa Thần Lộ và độ kiếp | `breakthrough` | 27 viên mãn |

Phụ (4): `s4_den_troi` (thắp 8 đèn lồng trời ở đại lộ), `s4_ban_khac` (chép 5 bản khắc, đọc được nhờ thần thức), `s4_kiem_thong` (hạ Cốt Kiếm Thống Lĩnh lấy kiếm), `s4_thu_niem` (thử phân thân thần niệm sau Hóa Thần, thưởng cuối game).

### 1.5 Mẫu lời thoại (soát giọng văn)

Giữ giọng hiện có: cổ phong vừa phải, xưng "ngươi", câu ngắn, cụ thể, không hô tên chiêu.

- Lạc Vân (thư chương 2): "Ngươi đã Trúc Cơ. Mạch Vân Lam yếu từ đầu nguồn, không phải từ chân núi. Đi tìm chỗ đứt. Tô Vãn Ngư sẽ chờ ở Hạ Khuyết Trạm."
- Tô Vãn Ngư: "Nhìn vết đào này. Không phải yêu thú. Có người dùng cuốc."
- Khưu Hàn Sơn: "Ngươi tính sổ cho tông ngươi. Ta tính sổ cho ba trăm miệng ăn. Ai đúng, mạch không quan tâm."
- Kính Nguyệt Chân Quân (lặp): người chơi nói "Ngươi là ai?" → "Ngươi là ai."
- Mặc Chiếu: "Điện còn đó. Chủ điện còn đó. Ngươi quỳ ở đâu thì quỳ."
- Huyền Cơ (một câu duy nhất, cuối phó bản): "Ta chờ lâu quá. Trả đi."

Soát theo `lore-keeper`: tên tạo mới đều đã kiểm không trùng truyện gốc; tên **Hóa Thần Lộ**, **Dưỡng Anh Đan**, **Kết Đan Dịch** là vật phẩm của dự án; không dùng "chân nguyên"/"nguyên lực" làm tên chỉ số.

---

## 2. Thang cảnh giới

### 2.1 Cấp và tiểu cảnh giới

| Đại cảnh giới | Cấp | Tiểu cảnh giới | Trạng thái |
| --- | --- | --- | --- |
| Ngưng Khí | 1–15 | tầng 1–15 | Đã có |
| Trúc Cơ | 16–19 | sơ, trung, hậu kỳ, **đại viên mãn (mới, cấp 19)** | Cấp 16–18 đã có; 19 mới |
| Kết Đan | 20–23 | sơ, trung, hậu kỳ, đại viên mãn | Mới |
| Nguyên Anh | 24–27 | như trên | Mới |
| Hóa Thần | 28 | sơ kỳ (trần tạm thời) | Mới; trung kỳ… để chương sau |

`realms.json` thêm cấp 19–28 (key `realm.19`…`realm.28`); `NGUNG_KHI_MAX = 15`, `TRUC_CO_LEVEL = 16`, `MAX_LEVEL = 28`, thêm hằng `KET_DAN_LEVEL = 20`, `NGUYEN_ANH_LEVEL = 24`, `HOA_THAN_LEVEL = 28`. Bảng tên người chơi: dòng cảnh giới màu theo đại cảnh giới (Ngưng Khí ngà; Trúc Cơ vàng kim; Kết Đan **ngọc lam**; Nguyên Anh **bạc ánh trăng**; Hóa Thần **vàng sao nhạt**), đúng quy tắc art bible 4.3 (tím dưới 5%).

### 2.2 Tu vi cần và nhịp giờ

Công thức: `xpNeed(L) = giờ/cấp × thu nhập tu vi/giờ tại cấp L`, với thu nhập = 400 mục tiêu/giờ × `(12 + 7·L)` × `xpMul` trung bình 1,25 × hệ số chênh cấp 0,9 (bảng `monsterXp`, `xpLevelFactor`). Tốc độ này khớp 35 nghìn tu vi/giờ của Ngưng Khí (`90·L²`, 3,2 giờ). Giờ/cấp: Trúc Cơ 1,0; Kết Đan 1,5; Nguyên Anh 2,0.

| Cấp | Cảnh giới | Thu nhập (tu vi/giờ) | `xpNeed` đề xuất | Tích lũy từ cấp 16 |
| --- | --- | --- | --- | --- |
| 16 | Trúc Cơ sơ kỳ | 55.800 | 56.000 | 56.000 |
| 17 | Trúc Cơ trung kỳ | 58.950 | 59.000 | 115.000 |
| 18 | Trúc Cơ hậu kỳ | 62.100 | 62.000 | 177.000 |
| 19 | Trúc Cơ đại viên mãn | 65.250 | 65.000 | **242.000 (4,0 giờ)** |
| 20 | Kết Đan sơ kỳ | 68.400 | 102.500 | 102.500 |
| 21 | Kết Đan trung kỳ | 71.550 | 107.500 | 210.000 |
| 22 | Kết Đan hậu kỳ | 74.700 | 112.000 | 322.000 |
| 23 | Kết Đan đại viên mãn | 77.850 | 117.000 | **439.000 (6,0 giờ)** |
| 24 | Nguyên Anh sơ kỳ | 81.000 | 162.000 | 162.000 |
| 25 | Nguyên Anh trung kỳ | 84.150 | 168.500 | 330.500 |
| 26 | Nguyên Anh hậu kỳ | 87.300 | 174.500 | 505.000 |
| 27 | Nguyên Anh đại viên mãn | 90.450 | 181.000 | **686.000 (8,0 giờ)** |
| 28 | Hóa Thần sơ kỳ | | 99.999.999 (trần) | |

Ghi chú: cấp 16–18 hiện là `30000 + 20000·(L−16)` (30k/50k/70k, 150k tổng, **~2,5 giờ** ở thu nhập 56–62k/giờ của bảng trên). Đường cong mới **kéo dài Trúc Cơ**, không giữ nguyên: cấp 16–18 thành 177k (~3,0 giờ, +18%) và thêm cấp 19 (65k, ~1,1 giờ), tổng 242k (4,0 giờ), tức **+60% thời gian** so với hiện nay. Đây là chủ ý để Trúc Cơ khớp nhịp 4 giờ đã chốt. Migration (E-1C): người đang ở cấp 16–18 giữ **tỉ lệ** tu vi trong cấp (nhân tu vi hiện có với `xpNeed` mới/cũ), nên không mất tiến độ tương đối nhưng phần còn lại để lên cấp dài hơn; người đã Trúc Cơ hậu kỳ đầy tu vi vẫn đủ điều kiện lên cấp 19. Một nửa thu nhập đến từ quái thường, ~20% từ nhiệm vụ và đả tọa, ~15% từ phó bản, ~15% từ tinh anh/boss; `sim.ts` của `packages/content` phải thêm bốn nguồn này (E-5).

Nhịp theo chặng (4h/6h/8h) kiểm bằng `pnpm sim:progress` mở rộng. Cờ LỖI khi ngoài ±12% (Ngưng Khí hiện ±1 giờ trên 3–4).

### 2.3 Chỉ số mở rộng

`playerBaseStats(level)` hiện: `hp = (120 + 34·l)·realmMul`, `mp = (80 + 14·l)·realmMul`, `atk = (12 + 4,2·l)·realmMul`, `def = (3 + 1,6·l)·realmMul`, `l = level − 1`, `realmMul` = 1 (Ngưng Khí) hoặc 1,6 (Trúc Cơ).

Đề xuất `realmMul`: Ngưng Khí 1,0 · Trúc Cơ 1,6 · **Kết Đan 2,5 · Nguyên Anh 3,8 · Hóa Thần 5,5**.

| Cấp | hp | mp | atk | def |
| --- | --- | --- | --- | --- |
| 16 | 1.008 | 464 | 120 | 43 |
| 19 | 1.171 | 531 | 140 | 51 |
| 20 | 1.915 | 865 | 230 | 84 |
| 23 | 2.170 | 970 | 261 | 96 |
| 24 | 3.428 | 1.528 | 413 | 151 |
| 27 | 3.815 | 1.687 | 461 | 169 |
| 28 | 5.709 | 2.519 | 690 | 254 |

**Quái cũng nhân `realmMul`**: `monsterStats(level, hpMul, atkMul)` nhận thêm `realmMul(level)` cho hp/atk để thời gian hạ quái không sụp. Nếu chỉ người chơi nhảy 1,6 → 2,5 thì quái cấp 20 (hp ~900) chết sau ~4 đòn, ngoài khoảng 3,5–8,5 giây của `balance.test.ts`. Hằng `MONSTER_REALM_MUL` ở `shared/formulas.ts`, một nguồn cho server, client (tooltip) và sim.

Chỉ số phụ: bạo kích `0,10` nền (không đổi); linh căn ngũ hành khắc chế 8% giữ nguyên; thêm **chống chịu độ kiếp** (`tribRes`) từ Thiên Lôi Hộ Đan và pháp bảo (mục 7).

### 2.4 Bình cảnh

Mỗi đại cảnh giới có **hai nút**: (1) **trung kỳ → hậu kỳ** thử thách tâm ma (như Ngưng Khí 5/10), hoặc Phá Cảnh Đan; (2) **đại viên mãn → độ kiếp**: đầy tu vi + vật phẩm đột phá + vượt bình cảnh viên mãn. Không đổi cách làm của `realm.ts`; chỉ thêm bảng cấp:

| Nút | Cấp (từ → tới) | Tâm ma | Phá Cảnh Đan |
| --- | --- | --- | --- |
| Trúc Cơ trung → hậu | 17 → 18 | Tâm Ma Ảnh cấp 17 (ngưỡng 70% người chơi) | Phá Cảnh Đan bậc 2 |
| Trúc Cơ viên mãn | 19 | Tâm Ma Ảnh cấp 19 | bậc 2 |
| Kết Đan trung → hậu | 21 → 22 | cấp 21; **tâm ma biết dùng một chiêu của người chơi** | bậc 3 |
| Kết Đan viên mãn | 23 | cấp 23 | bậc 3 |
| Nguyên Anh trung → hậu | 25 → 26 | cấp 25; **dùng hai chiêu** | bậc 4 |
| Nguyên Anh viên mãn | 27 | cấp 27 | bậc 4 |

### 2.5 Mở khóa cơ chế và thay đổi trực quan

| Mốc | Cơ chế mở (một thứ nhìn thấy từ xa + một cơ chế mới) | Thay đổi trực quan |
| --- | --- | --- |
| **Trúc Cơ sơ kỳ (16)** | Ngự kiếm dưới 20 m miễn linh lực (đề xuất `GAME_DESIGN_CORE` 4.3); mở Truyền Tống liên bản đồ | Vòng linh quang `spirit_jade` dưới chân (K-6, đã đề xuất) |
| **Trúc Cơ viên mãn (19)** | Đủ điều kiện độ kiếp Kết Đan | Quầng sáng nhẹ ở đan điền (chỉ khi đả tọa) |
| **Kết Đan sơ kỳ (20)** | **Thần thức**: giữ phím `V` quét 60 m (2,5 giây, hồi 20 giây, tốn linh lực): lộ tinh anh, điểm hái, người chơi ẩn trên minimap 6 giây; thấy cạm bẫy vô hình và ảo ảnh đảo; **Bản mệnh pháp bảo** (ô 8): một pháp bảo luyện hóa, không tháo, lên cấp theo chủ; ô chiêu 9 mở cho thần thông công pháp | Quầng mỏng quanh thân khi vận chiêu, màu theo linh căn; ngự kiếm không cần đạp lên kiếm: phi kiếm bay cạnh người (ngự khí phi hành), tư thế bay mới |
| **Kết Đan trung kỳ (21)** | Thần thức quét 80 m | |
| **Kết Đan hậu kỳ (22)** | Thần thức hiện cả đường đi của quái hộ tống (đường tuần tra) | Đan quang lộ ra dưới ngực khi thiền |
| **Kết Đan đại viên mãn (23)** | Đủ điều kiện độ kiếp Nguyên Anh | Quầng đan điền sáng rõ khi đứng yên |
| **Nguyên Anh sơ kỳ (24)** | **Nguyên anh xuất khiếu**: khi tử vong, nguyên anh thoát ra 10 giây, tự về nơi an toàn gần nhất rồi hồi sinh tại chỗ 30% khí huyết, **không mất tu vi** (mỗi 10 phút một lần); **Ngự không** (không cần kiếm, trong phạm vi 30 m so với mặt đất, bay chậm hơn ngự kiếm 15% nhưng không tiêu linh lực); **Thuấn di** (thay Lướt cho cả ba công pháp: 12 m, hồi 14 giây, có kiểm đường) | Bóng nguyên anh nhỏ nổi sau lưng khi tung chiêu tối thượng; đả tọa lơ lửng khỏi mặt đất; đạo bào bay nhẹ không gió |
| **Nguyên Anh trung kỳ (25)** | **Lĩnh vực nhỏ**: vùng 8 m quanh thân với hiệu ứng thụ động của công pháp (Kiếm: bạo kích +6%; Hộ pháp: người trong vùng giảm 6% sát thương; Đan sư: hồi +10%) | Vòng hoa văn dưới đất, rất nhạt |
| **Nguyên Anh hậu kỳ (26)** | Lĩnh vực 10 m | |
| **Nguyên Anh đại viên mãn (27)** | Đủ điều kiện độ kiếp Hóa Thần | |
| **Hóa Thần sơ kỳ (28)** | **Phân thân thần niệm** (phím `G`, hồi 90 giây): tạo một phân thân 20 giây ở chỗ người chơi chỉ; phân thân dùng chiêu cuối cùng người chơi dùng ở 50% sát thương, hút khiêu khích; chết thì tan, không ảnh hưởng người chơi; **Lĩnh vực lớn** 20 m; **ô chiêu 10**; **Thần thức 120 m** | Bóng thần niệm trong suốt sau gáy; dải sao nhạt trên đạo bào ban đêm |

Cơ chế đặc trưng Hóa Thần đề xuất: **Phân thân thần niệm** vì (a) mở rộng đúng hình ảnh "thần thức hóa hình" của cảnh giới, (b) cho cả ba công pháp một công cụ khác nhau (kiếm: sát thương gấp đôi một chiêu; hộ pháp: bia khiêu khích; đan sư: bản sao hồi cho nhóm), (c) server mô phỏng được bằng một thực thể phụ có chủ (`owner`) và danh sách chiêu, không cần AI mới. Phương án thay thế (lĩnh vực mượn thế trời đất) để lại cho chương Anh Biến.

---

## 3. Ba lần độ kiếp

Khung chung: **ba pha** của `GAME_DESIGN_CORE.md` mục 5.3 (Lôi vân tụ → Lôi võng → Diệt thế nhất kích). S2-C (độ kiếp 3 pha) triển khai khung này ở Trúc Cơ; thời điểm viết, chưa có PR nào của nhánh S2-C trên GitHub (`gh pr list`: rỗng), nên bảng dưới dùng **tên và hằng số của mục 5.3** làm giao diện. Khi S2-C vào main, E-2 phải đọc lại `tickTribulation`, kiểu vùng `line` và `p.trib` để khớp.

Điều kiện chung: đại viên mãn đầy tu vi, vượt bình cảnh viên mãn, có vật phẩm đột phá (bị tiêu khi bắt đầu), ở đúng bản đồ của chương. Thất bại: mất 15% tu vi của cấp; **hoàn lại vật phẩm nếu trụ qua pha 2**. Mỗi lần độ kiếp tối đa 3 viên đan hồi phục. Người xem được phép vào phạm vi 20 m (thành "hộ pháp").

### 3.1 Đan Hỏa Kiếp (Kết Đan) · 55 giây · world room

| Pha | Giây | Thiên lôi | Nhiệm vụ người chơi |
| --- | --- | --- | --- |
| 1. Lôi vân tụ | 0–12 | Như Trúc Cơ, tia nhắm thẳng 24%, tia phụ 1–3 | Chạy, lướt |
| 2. **Ngưng đan** | 12–40 | **Đan Trận**: vòng bán kính 4 m dưới chân (người chơi chọn vị trí khi pha bắt đầu). Đứng trong vòng và đả tọa để "ngưng đan": thanh ngưng đan 0→100 trong 20 giây, **di chuyển ra khỏi vòng làm tụt 3%/giây**. Thiên lôi quét vạch 18×3 m (0,9 giây báo) rơi vào vòng; **Tâm ma phân thân** (3 con cấp = cấp người chơi, ~40% hp) tràn vào cứ mỗi 7 giây | Người độ kiếp phải đứng yên (hoặc lướt ra rồi về); **hộ pháp** diệt tâm ma và chắn tia. Một mình vẫn qua được nhưng phải dùng Linh Khí Hộ Thể + lướt đúng nhịp |
| 3. Diệt thế đan hỏa | 40–55 | Tia lửa lớn bán kính 9 m, báo 3 giây, 70% hp; hộ pháp trong 12 m chịu thay 25% chia đều (tối đa 2 người) | Chống đỡ bằng hộ thể, Kim Cương Đan, Thanh Liên Ấn, hoặc hộ pháp |

Thành công: Kết Đan sơ kỳ (cấp 20), hồi đầy, thông báo kênh, `ascend` bản Kết Đan (cột đan hỏa, vòng đan quang), mở thần thức. Lôi **hỏa** pha 3 đổi màu thiên lôi (HDR dưới 2,4).

### 3.2 Tam Trọng Kiếp (Nguyên Anh) · 65 giây · room riêng `tribulation` (tổ đội cùng vào)

| Pha | Giây | Cơ chế | Cách chơi |
| --- | --- | --- | --- |
| 1. Lôi | 0–18 | Thiên lôi dày hơn Kết Đan (gap 2,2 → 1,2 giây); thêm **tia xích** nối giữa hai tia | Chạy, thuấn di không có sẵn (chưa mở) nên dùng Lướt |
| 2. Hỏa | 18–42 | Mặt đất chia thành 16 ô; mỗi 4 giây, ô bị chọn theo hạt giống server đỏ lên và cháy 3 giây (báo 1,5 giây). **Xuất khiếu có điều kiện**: phím `X` cho nguyên anh rời thân trong 6 giây (hồi 20 giây), thân đứng yên chịu sát thương của ô, nguyên anh bay lơ lửng không chịu lửa và có thể đẩy bẫy ra khỏi ô | Cần lập kế hoạch: lửa nặng nhất ở ô người độ kiếp đứng |
| 3. Tâm ma | 42–65 | **Tâm Ma Ảnh** (như bình cảnh nhưng cấp +2) xuất hiện và dùng 2 chiêu của người chơi; thanh **tâm cảnh** giảm khi bị đánh trúng, hồi khi đánh trúng | Đánh bại hoặc kéo dài tới giây 65 |

Thành công: Nguyên Anh sơ kỳ (cấp 24); thông báo kênh; mở xuất khiếu, ngự không, thuấn di.

### 3.3 Thiên Nhân Kiếp (Hóa Thần) · 80 giây · room riêng, tổ đội 4

| Pha | Giây | Cơ chế |
| --- | --- | --- |
| 1. Ngũ hành lôi | 0–25 | Tia kiếp mang hành xoay vòng Kim → Mộc → Thủy → Hỏa → Thổ (mỗi 5 giây). Dưới đất có 5 **trận môn** (bán kính 3 m) tương ứng ngũ hành; đứng đúng trận môn **khắc chế** hành hiện tại thì giảm 80% sát thương (dùng cờ `ke` của `DmgMsg`). Hiển thị màu và icon hành |
| 2. Thần niệm | 25–55 | Hai lần **tia quét** + một **cột thiên phạt** rơi 3 chỗ cùng lúc. Người độ kiếp phải tạo **phân thân thần niệm** (phím `G`, không cần mở trước, miễn phí chỉ trong kiếp) để đứng ở trận môn thứ hai; thân chính chạy tới bù |
| 3. Thiên nhân hợp nhất | 55–80 | Một tia lớn 11 m, báo 4 giây, 75% hp; thêm 2 tâm ma phân thân tấn công từ hai bên. Phân thân chắn thay **40%** nếu còn sống; hộ pháp chắn thêm 25% (tối đa 2 người, chia đều) |

Thành công: Hóa Thần sơ kỳ (cấp 28); thông báo kênh; mở phân thân thần niệm và lĩnh vực lớn; kết thúc chương 4.

### 3.4 So sánh

| | Trúc Cơ (có/S2-C) | Kết Đan | Nguyên Anh | Hóa Thần |
| --- | --- | --- | --- | --- |
| Thời lượng | 40 s | 55 s | 65 s | 80 s |
| Cơ chế riêng | tia quét, Diệt thế | Đan Trận đứng yên + hộ pháp | xuất khiếu, ô lửa, tâm ma | ngũ hành khắc chế, phân thân |
| Nơi diễn ra | world room | world room | room riêng, tổ đội | room riêng, tổ đội 4 |
| Hộ pháp | chia 25% | cần để diệt tâm ma | chia 25% | chia 25% + phân thân 40% |

Việc cho `netcode-reviewer` mỗi lần: `p.trib` (pha, ô, trận môn, đan đã dùng) chỉ server giữ; client chỉ nhận danh sách vùng đã báo; lệnh `X`/`G` có giới hạn tần suất.

---

## 4. Ba bản đồ

Quy ước chung (khớp M-1, M-2, M-3, M-4, M-5 hiện có):

- Mỗi bản đồ là một `LevelDef` riêng (`levels/<id>.json`: `zones`, `camps`, `spawns` chỉ còn tinh anh/boss, `pois`, `nodes`, `places`), room riêng `world` + `levelId`, kênh tối đa 50 người, tự mở kênh mới (cơ chế sẵn có).
- **Diện tích ~2 km²**: hộp chơi 1,5 × 1,4 km (so với Vân Lam: chơi 2,2 × 2,2 = 4,8 km²). Thế giới dựng 2048 m, tường biên đẩy người về như `PLAY_WALL`. Tọa độ dưới đây là offset (m) so với **trạm trung tâm** (0, 0); +x đông, +z nam.
- Mật độ: **~120 quái thường/km²** (Vân Lam ~70/km²) vì chặng dài hơn; cụm 3–4 con + một quái đánh xa (camp kiểu M-2), 60 cụm ≈ 220 quái thường, 2–3 tinh anh mỗi vùng, 1 boss ngoài trời. Cung hồi sinh (30 s/con, theo số người ở M-2) lớn hơn lượng 50 người đánh (≈ 330 quái/phút) nên không cạn.
- Vùng săn sắp theo cấp tăng dần từ trạm; vùng cuối là vùng boss. Mỗi vùng một Truyền Tống Trận (`TELE_PADS`, mở khi chạm trong 4 m); trận trạm mở sẵn.
- Ánh sáng theo art bible mục 5: dùng ba mood sẵn có; mỗi bản đồ có **mood mặc định** và đường cong đổi giờ riêng, nhạc theo vùng.
- Mỗi bản đồ có **một cỏ riêng** (mục 4.x), nạp cùng bản đồ, không cộng vào tải đầu.

### 4.1 Đoạn Mạch Cổ Cốc† (chương 2, cấp 16–19)

**Chủ đề**: hẻm đá karst ochre, đáy hẻm là lòng sông cạn; trên vách là các khe nứt phát sáng ngọc lam mảnh (mạch đang chết). Tàng Mạch Hội đào mỏ ở thung phía tây. "Vì sao quý": đây là chỗ mạch bị cắt, ai ở đây thấy trực tiếp linh khí rỉ ra.

**Mood**: chiều vàng hanh, nắng xiên qua hẻm, sương thấp chỉ ở đáy; bóng ngọc lam dưới vách. Palette: ochre `#A8763E`, rỉ `#8A4B2A`, xanh ngọc `#2B5552`, ngà `#E6DDCB`; ngọc lam sáng chỉ ở khe mạch (HDR < 2,4).

| Vùng | Vị trí (m) | Cấp | Quái thường | Tinh anh (2–3/vùng) | Điểm đáng chú ý (POI) | Nhạc |
| --- | --- | --- | --- | --- | --- | --- |
| **Hạ Khuyết Trạm** (trạm trung tâm, an toàn) | (0, 0) | | | | Truyền Tống Trận về Vân Lam, Hứa lão, Tô Vãn Ngư, lò đan, Tàng Kiếm nhỏ | `sect`-họ hàng, nhẹ hơn |
| **Sa Thạch Pha** | (+260, +190), r 190 | 16–17 | Thạch Giáp Tê | Liệt Cốt Báo Vương ×2 | Mạch Tinh Trụ (cột linh quang, đầu tiên) | `wild_ochre` |
| **Khô Hà Đạo** | (+470, −60), r 200 | 17–18 | Thạch Giáp Tê, Khai Mạch Khôi Lỗi | Hộ Mạch Khôi Tướng ×2 | Cầu Đá Gãy (nhịp cầu cổ, chỗ ngắm cảnh) | `wild_ochre` |
| **Hoang Sa Huyệt** | (−60, +520), r 190 | 18–19 | Ngô Công Ấu | Xích Sa Ngô Công ×3 | Hố Sa Lún (vùng cát không thể đi nhanh, giảm 25% tốc độ) | `cave_lull` |
| **Cựu Mỏ Khu** | (−430, −90), r 210 | 18–19 | Khai Mạch Khôi Lỗi, Mạch Thương Hộ Vệ | Hộ Mạch Khôi Tướng ×2, Liệt Cốt Báo Vương ×1 | Cổng Mỏ Khai Mạch (phó bản), trại Hội (lều, xe quặng) | `wild_ochre` |
| **Đoạn Mạch Tuyệt Bích** | (+30, −560), r 180 | 19 | Thạch Giáp Tê, Ngô Công Ấu | Xích Sa Ngô Công ×2 | **Địa Mạch Long** ở (+30, −620), vách đứt mạch | `boss_dia_mach` |

Cụm: Sa Thạch Pha 10, Khô Hà Đạo 11, Hoang Sa Huyệt 11, Cựu Mỏ Khu 14, Tuyệt Bích 8, vùng nối 6 = 60 cụm, ≈ 225 quái thường. Tinh anh tổng 12. Thời gian thích hợp mỗi vùng: 0,8–1,0 giờ/cấp.

**Đường đi**: Truyền Tống từ Thiên Mạch Đài† (bệ mới ở sân Lạc Kiếm Tông, phía bắc Chính điện) tới Hạ Khuyết Trạm; đi bộ xuyên giữa các vùng; hồi sinh tại trạm hoặc trận gần nhất đã mở. Nối lại Vân Lam bằng cùng trận. Bay ngự kiếm cho phép (tầm ≤ 40 m so với mặt đất).

**Cỏ**: `prop_co_hoang_coc` (vàng rơm, thưa) trên sàn hẻm; cây `prop_cay_goc_kho`; đá `prop_tru_nham_do`.

### 4.2 Vân Hải Phù Đảo† (chương 3, cấp 20–23)

**Chủ đề**: năm đảo lớn trôi trên biển mây, nối bằng cầu xích mây, bậc đá, và Truyền Tống; dưới đảo là sàn mây phẳng (rơi xuống không chết, hồi sinh nhẹ ở đảo gần nhất, mất 0%, chỉ mất thời gian); giữa đảo là vài đảo nhỏ không có quái chỉ có hái thuốc và ảo ảnh (thần thức lộ ra). "Vì sao quý": mạch tinh bị đào ở chương 2 trôi lên đây, kết thành đảo; ai giữ được đảo thật thì giữ được mạch.

**Mood**: bình minh vĩnh viễn trên mây, sương dày bên dưới, trời trên cao xanh ngọc trong; nắng vàng ấm lên mặt đảo, bóng ngọc lam ở mép. Palette: ngà, xanh sương, ngọc nhạt, vàng mật. Đây là bản đồ **sáng nhất**; ban đêm chuyển trăng bạc (đường cong riêng).

| Vùng (đảo) | Vị trí (m) | Cấp | Quái thường | Tinh anh | POI | Nhạc |
| --- | --- | --- | --- | --- | --- | --- |
| **Phù Đảo Các** (đảo trung tâm, an toàn) | (0, 0) | | | | Truyền Tống Trận, Lâm Chiếu Dung, lò đan, bãi đáp ngự kiếm | `sect_sky` |
| **Tùng Đài Đảo** | (−300, +140), r 170 | 20–21 | Vân Hạc, Bích Ngọc Kim Thiền | Tuyết Vũ Vân Hạc Vương ×2 | Đình Phù Đảo, tùng cổ | `wild_cloud` |
| **Thạch Quy Đảo** | (+330, +90), r 190 | 21–22 | Phù Đảo Thạch Quy, Vân Hạc | Lôi Vân Sư Vương ×2 | Cầu Xích Mây (cầu dài nhất) | `wild_cloud` |
| **Kính Hồ Đảo** | (+60, +440), r 180 | 21–22 | Kính Linh | Kính Diện Ma Quân ×2 | Kính Hồ Đài (POI), cổng Kính Nguyệt Cung | `mirror_lake` |
| **Lôi Vân Đảo** | (+420, −330), r 190 | 22–23 | Kính Linh, Vân Hạc | Lôi Vân Sư Vương ×2, Kính Diện Ma Quân ×1 | Đỉnh sấm | `wild_storm` |
| **Kình Ngư Đài** | (−380, −380), r 180 | 23 | Vân Hạc, Bích Ngọc Kim Thiền | Tuyết Vũ Vân Hạc Vương ×2 | **Vân Hải Kình Vương** quanh biển mây phía trên đảo | `boss_kinh` |

Cụm: 12 / 12 / 12 / 13 / 11 = 60 cụm ≈ 225 quái thường, 12 tinh anh. Giữa đảo là **sàn mây thấp** có thể đi bộ (mây đặc, 60 m dưới đảo) nhưng không có quái và tốn thời gian; người chơi ngự kiếm/ngự không băng qua.

**Cơ chế riêng**: **Ảo ảnh đảo** (đảo giả): vài chiếc đảo nhỏ và Truyền Tống trông thật, nhưng thần thức (Kết Đan) lộ đảo giả thành mờ; bước lên đảo giả sẽ rơi về sàn mây. Thưởng thám hiểm: đảo thật có rương và linh thảo hiếm (nhờ thần thức tìm được). Thích hợp để dạy thần thức ngay trong chặng.

**Đường đi**: Truyền Tống Trận từ Hạ Khuyết Trạm tới Phù Đảo Các (mở sau `q2_ket_dan`); mỗi đảo một trận; rơi xuống sàn mây thì "hồi" bằng Thăng Vân Đài (bậc thang mây sau mỗi đảo) hoặc ngự kiếm.

**Cỏ**: `prop_co_van_hai` (bạc xanh, lông bông); cây `prop_tung_phu_dao`; đá `prop_da_troi`; cầu `prop_cau_may`.

### 4.3 Thiên Khuyết Cổ Thành† (chương 4, cấp 24–27)

**Chủ đề**: thành cổ của Cựu Thiên Điện trên cao nguyên, ban đêm sao, đèn lồng trời vàng nhạt dọc đại lộ, tượng đá khổng lồ nghiêng đổ, thành lũy vỡ. "Vì sao quý": đây là nơi mạch bị hút về; đứng ở Tinh Bái Đài thấy cả mạch ảnh chảy vào Thần Tàng Điện.

**Mood**: đêm trăng lam, sương mỏng, đèn lồng vàng ấm làm điểm; đây là bản đồ **tối nhất** (vẫn phải đọc được thân nhân vật: dùng thông số "ban đêm bớt tối" của `render/grading.ts`). Palette: xanh lam sẫm `#123B45`, xám đá, vàng nhạt `#F2C47E` chỉ ở đèn; ngọc lam ở khắc.

| Vùng | Vị trí (m) | Cấp | Quái thường | Tinh anh | POI | Nhạc |
| --- | --- | --- | --- | --- | --- | --- |
| **Ngoại Thành Trạm** (trạm trung tâm, an toàn) | (0, 0) | | | | Truyền Tống, Mặc Chiếu (tàn niệm), lò đan, Cổng Thành Vỡ | `sect_night` |
| **Đại Lộ Đèn Trời** | (+60, −280), r 180 | 24–25 | Thạch Tượng Võ Sĩ | Thạch Tượng Đại Tướng ×2 | Hàng Trụ Đá Khắc Vân, Đèn Lồng Trời | `wild_night` |
| **Lâm Sao Viên** | (−380, −40), r 200 | 24–25 | Dạ Minh Lộc | Dạ Minh Lộc Vương ×2 | Tinh Bái Đài (POI, đài bái sao) | `wild_night` |
| **Binh Khí Khố** | (+420, −90), r 200 | 25–26 | Cổ Thành Chiến Ma, Cốt Vệ Kiếm Thủ | Cốt Kiếm Thống Lĩnh ×2 | Kho giáo (cảnh quan) | `wild_night_war` |
| **Điện Tiền Quảng Trường** | (+20, −640), r 220 | 26–27 | Cốt Vệ Kiếm Thủ, Thạch Tượng Võ Sĩ, Cổ Thành Chiến Ma | Thạch Tượng Đại Tướng ×2, Cốt Kiếm Thống Lĩnh ×1 | Cổng Thần Tàng Điện (phó bản), Tượng Đá Cổ Thành | `boss_thu_linh` |
| **Mộ Đạo** | (−60, +420), r 160 | 24–26 | Cốt Vệ Kiếm Thủ | Cốt Kiếm Thống Lĩnh ×1 | **Thiên Khuyết Thủ Linh** ngồi ở Cổ Thành Thất Lộ | `boss_thu_linh` |

Cụm: 12 / 12 / 13 / 14 / 9 = 60 cụm ≈ 230 quái thường, 12 tinh anh.

**Cơ chế riêng**: **Môn phong ấn** (3 cái) trên đường vào Điện Tiền: chỉ nguyên anh qua được (xuất khiếu → bay qua tường → mở từ trong). Không phải nhiệm vụ bắt buộc cho người chưa Nguyên Anh: họ đi vòng bằng đường quái đông (thêm 6–8 phút). Dạy xuất khiếu ngay trong chặng.

**Đường đi**: từ Phù Đảo Các tới Ngoại Thành Trạm qua Truyền Tống (mở sau `q3_nguyen_anh`).

**Cỏ**: `prop_co_co_thanh` (xanh lam sẫm, hoa sao); đèn `prop_den_long_troi`; đá `prop_tru_da_khac_van`, `prop_tuong_da_vo_si`; cổng `prop_cong_thanh_vo`; đài `prop_dai_tinh_bai`.

### 4.4 Cỏ rừng Vân Lam (G7)

Giao ước **G7** ("cỏ rừng là bụi nhọn sẫm, thưa và lặp", `AUDIT_AND_ROADMAP.md`): thay bằng `prop_co_linh_rung` (lá mềm nhiều tầng xanh ngọc nhạt, 3 biến thể một atlas). **Không dựng trên Tripo** (quyết định 7, mục 15): worker E-2 làm thẻ cỏ alpha instanced từ ảnh concept (`docs/ASSET_CONCEPTS.md` mục cỏ). E-2 thay bụi nhọn thủ tục bằng tấm cắt từ atlas ở `game/grass.ts`; ngân sách: dưới 15 draw call cho cỏ (instancing theo ô 64 m), alpha cutout (không blend).

---

## 5. Ba phó bản

Cùng khung `DungeonRoom` (tối đa 5 người, đợt theo `WAVES`, vé một lần, khóa sau đợt 2), thêm: **mô tả đợt** trong `levels/<id>.json` thay hằng trong `rooms.ts` (E-1), vạch báo cho mọi cơ chế, thưởng ghi `ledger`. Hồi sinh trong phó bản: tối đa 2 lần mỗi người (tránh "chết rồi cứ vào lại"). Thưởng chung: tu vi 15% của chặng khi qua lần đầu mỗi ngày; mảnh bộ trang bị bậc của chương; nguyên liệu độ kiếp.

### 5.1 Phục Mạch Quật† (chương 2, cấp 17+, 4–5 người, ~20 phút)

**Lối chơi**: mỏ cũ của Tàng Mạch Hội, hầm hình chữ Y, đợt tiến dần xuống hầm sâu. Dạy cơ chế: **khống chế bầy** (khôi lỗi đông), **phá chú** (Thôn Mạch hút mạch hồi máu), **né vạch dài**.

| Đợt | Nội dung | Cơ chế |
| --- | --- | --- |
| 1 | 8 Khai Mạch Khôi Lỗi (cấp 18) | Bầy; thử khiêu khích |
| 2 | 4 Mạch Thương Hộ Vệ + **thủ lĩnh Hộ Vệ** (tinh anh Hộ Mạch Khôi Tướng) | Khiên húc, phá thế |
| 3 | 10 Ngô Công Ấu chui từ tường (3 điểm) | Vạch độc nón; AoE |
| 4 | **Thạch Tâm Khôi Vương** (mini-boss) | Tim ngọc mở 3 lần; mở thì "mất thế" |
| 5 | **Thôn Mạch Ngô Công Vương** (boss) | Xem dưới |

**Thôn Mạch Ngô Công Vương** (cấp 19, hpMul 75, xpMul 22): giữ `posture` kiểu Hàn Giao.
- Pha 1 (100–65%): `slam` (cd 8, r 5,5, báo 1,7 s): vùng tròn dưới đất; `chant` **Thôn Mạch** (cd 18, cast 2,6 s, r 12): hút mạch hồi 2% hp/giây cho tới khi bị **phá chú** (Trấn Hồn Linh, choáng, hoặc `interrupt`); phá được thì mất thế 4 s.
- Pha 2 (65–35%): **Chui đất** (cd 14): biến mất 2 s, vạch tròn 4 m ở 3 chỗ quanh người chơi, rồi trồi lên đánh vạch nón 14 m (báo 1,5 s). Ngô Công Ấu ×2 mỗi lần.
- Pha 3 (dưới 35%): **Vạch độc dài** (line 22×3 m, báo 1,2 s), thêm `speedMul 1,15`; hết pha thì **tự bạo mạch** (vòng tròn 12 m lan ra, 3 s báo, 65% hp): hộ thể hoặc ra xa.
- Phần thưởng: mảnh bộ trang bị bậc 2 (`set_liet_mach`, mục 7), **Ngưng Đan Mạch Tinh** (nguyên liệu Kết Đan Dịch), 15% tu vi chặng.

### 5.2 Kính Nguyệt Cung† (chương 3, cấp 21+, 4–5 người, ~25 phút)

**Lối chơi**: cung gương sáng, hành lang thẳng và phòng tròn; mỗi phòng là một cơ chế. Dạy **thần thức** (lộ bóng giả), **chia tổ** (hai đội ở hai gương), và đọc vạch phản chiếu.

| Đợt | Nội dung | Cơ chế |
| --- | --- | --- |
| 1 | 8 Kính Linh | Giơ khiên phản đạn xa; đánh khi hạ khiên |
| 2 | **Kính Diện Ma Quân** (mini-boss, cấp 22) | Phản chiếu mọi chiêu xa 30% trở lại; dùng chiêu đòn gần để hạ |
| 3 | **Ba gương** (không quái): ba gương lớn, mỗi gương phát một màu; phải chạm theo thứ tự màu hiện trên trần trong 20 s (thần thức hiện thứ tự); sai thì quái đẻ thêm | Giải đố, thưởng giảm sát thương boss 8% |
| 4 | 6 Kính Linh + 2 Phù Đảo Thạch Quy hóa gương | Bầy mạnh |
| 5 | **Kính Nguyệt Chân Quân** (boss) | Xem dưới |

**Kính Nguyệt Chân Quân** (cấp 23, hpMul 90, xpMul 25):
- **Ba bóng một thật**: lúc vào pha, 4 thể hiện (1 thật, 3 giả) đứng ở bốn góc; giả có hp 1 đòn và chết thì nổ vòng 6 m (báo 1 s). **Thần thức** (phím `V`) làm bóng thật sáng vàng 6 s. Không có thần thức: đoán bằng vết ngọc lam ở chân (chỉ bóng thật có) hoặc đánh thử.
- Pha 1: `sweep` nón 14 m, 35° (cd 9); **Lặp lại**: sau một chiêu của người chơi, bóng thật phản lại đúng chiêu đó 50% sát thương lên người vừa dùng, báo 1 s.
- Pha 2 (60%): **Đĩa gương** quay chiếu tia: 3 tia đường thẳng xoay chậm 8 s; người chơi đứng giữa các tia hoặc lướt qua.
- Pha 3 (30%): **Nguyệt phản**: màn gương che phủ vùng 14 m, trong đó người chơi nhìn thấy bản thân của mình đánh lại (Tâm Ma Ảnh cấp +0, hai chiêu); phải thoát hoặc hạ.
- Thưởng: mảnh bộ trang bị bậc 3 (`set_kinh_quang`), **Kính Hoa Sa**, 15% tu vi chặng.

### 5.3 Thần Tàng Điện† (chương 4, cấp 26+, 4–5 người, ~30 phút)

**Lối chơi**: điện tàng của Cựu Thiên Điện, ba tầng dọc: lên từng tầng bằng cầu thang đá. Dạy **xuất khiếu chia tổ** (một người bay qua tường mở cửa cho đồng đội), **khắc chế ngũ hành** và đọc phân thân.

| Đợt | Nội dung | Cơ chế |
| --- | --- | --- |
| 1 | 10 Cốt Vệ Kiếm Thủ | Bầy vừa |
| 2 | 4 Thạch Tượng Võ Sĩ + 2 Cổ Thành Chiến Ma | Phân vai tank/dps |
| 3 | **Cốt Kiếm Thống Lĩnh** (mini-boss, cấp 26) | Hai kiếm, tia quét kép; nối đợt 4 bằng cửa phong ấn |
| 4 | **Đại sảnh phong ấn**: ba cửa phong ấn, mỗi cửa mở bằng nguyên anh xuất khiếu qua tường rồi chạm trận môn bên trong; đồng thời bầy quái 14 con đến theo đợt; mở đủ ba thì qua | Cần ít nhất 1 người Nguyên Anh; nếu không có, mở được bằng "Phá Ấn Phù" (vật phẩm chế được, mục 7.4) |
| 5 | Trận **Hóa Hình**: 6 Thạch Tượng Võ Sĩ + 4 Cốt Vệ + tinh anh | Cuối cùng trước boss |
| 6 | **Vô Diện Thần Quân** (boss) | Xem dưới |

**Vô Diện Thần Quân** (cấp 27, hpMul 120, xpMul 30):
- Pha 1: **sáu tay** (6 vạch nón nhỏ xoay 45°, báo 1,3 s, mỗi cái 70% sát thương thường); đòn ngũ hành: mỗi 20 giây chọn một hành (Kim/Mộc/Thủy/Hỏa/Thổ), đánh vòng 10 m; đứng đúng **ấn** hành khắc chế dưới đất (5 ấn hiện) thì giảm 80% (cờ `ke`).
- Pha 2 (65%): **Thần niệm**: tách 2 phân thân (hp 25%) cùng chiêu; hạ phân thân trước thì boss mất thế; để sống quá 15 s thì phân thân hợp lại, boss hồi 8%.
- Pha 3 (30%): **Mất tên**: boss dừng, vòng đá phía sau gáy tách ra, phát ra 3 vòng đá xoay quanh sàn (vạch tròn r 3 m); người chơi tránh 12 s; sau đó **Phản hồi**: nếu cả đội đứng trong 10 m thì sát thương gấp đôi tia cuối (phải chia ra).
- Khi chết: Huyền Cơ vọng lại một câu ("Ta chờ lâu quá. Trả đi."), mở nhiệm vụ `q4_tra_mach`.
- Thưởng: mảnh bộ trang bị bậc 4 (`set_tinh_khuyet`), **Thần Tàng Ngọc**, 15% tu vi chặng, 1% rơi **Hóa Thần Lộ** hiếm (vật phẩm độ kiếp luôn có đường chế được, mục 7.4).

### 5.4 Boss ngoài trời

Cùng khung Hàn Giao (4 người, `posture`, `phases`), hp 90 / 110 / 140.

| Boss | Cấp | Vạch báo và chiêu | Cơ chế riêng |
| --- | --- | --- | --- |
| **Địa Mạch Long** | 19 | `slam` r 6 (báo 1,6 s); `sweep` nón 16 m, 40° (báo 1,5 s); **Đứt mạch**: khe nứt line 30×4 m xuất hiện dưới đất, 2 s sau phát sáng nổ (70% sát thương thường); pha 3: **mạch chảy lại** (vòng tròn r 14 m, ra từ thân) | Khi hp < 50%, khe sáng ngọc lam mờ dần (hiệu ứng) và rồng mất giáp lưng: lộ điểm yếu |
| **Vân Hải Kình Vương** | 23 | **Cuốn sóng mây** (line 40×6 m quét ngang, báo 2 s); **Nuốt**: kéo người chơi trong 6 m về miệng 1,2 s (báo 1,5 s; phá bằng lướt); vây rơi (r 7) | Bay lượn trên đảo; hạ thấp mỗi 25 s để đánh gần (cửa sổ đánh); người chơi ngự kiếm đánh khi bay |
| **Thiên Khuyết Thủ Linh** | 27 | **Búa halberd** (line 20×4); **Quầng sao** (vòng tròn r 12 + vòng thứ hai r 20, lệch pha 1 s); **Gọi tượng** (2 Thạch Tượng Võ Sĩ mỗi 20 s) | Nhìn từ 60 m thấy rõ; phản ứng với ngũ hành như Vô Diện (tùy chọn) |

---

## 6. Quái mới

Tên, model và asset: `docs/ASSET_CONCEPTS.md`. `hpMul/atkMul/xpMul` cho `monsters.json`; `ai` dùng trường hiện có (`combo`, `caster`, `slam`, `chant`, `sweep`, `posture`, `phases`); trường mới cần E-2 thêm (mục 11.2). `xpMul` bình thường 1,2–1,4, tinh anh 4 (như hiện có), boss 20–30.

### 6.1 Bản đồ 2

| Id | Tên | Cấp | Hành | Vai | hp/atk/xp | Chiêu và vạch báo |
| --- | --- | --- | --- | --- | --- | --- |
| `mon_thach_giap_te` | Thạch Giáp Tê | 16–19 | Thổ | tank chậm | 1,4 / 1,2 / 1,2 | **Lao** (`charge`): vạch line 12×2 m, báo 1,0 s, húc 1,6× |
| `mon_khai_mach_khoi_loi` | Khai Mạch Khôi Lỗi | 17–19 | Thổ | bầy | 1,3 / 1,3 / 1,2 | `slam` r 3,5 báo 1,2 s; đi theo cụm 4 |
| `mon_ngo_cong_au` | Ngô Công Ấu | 18–19 | Mộc | xa-độc | 1,1 / 1,5 / 1,2 | `caster` nón 9 m, 30°, báo 0,9 s, độc 6 s |
| `mon_mach_thuong_ho_ve` | Mạch Thương Hộ Vệ | 18–19 | Kim | cận chiến | 1,5 / 1,4 / 1,3 | **Húc khiên** (`combo`), phá thế người chơi nhẹ |
| `elite_liet_cot_bao` | Liệt Cốt Báo Vương | 17–19 | Kim | tinh anh, lướt | 5,5 / 2,3 / 4 | **Vồ** (`leap`): lao 10 m báo 0,8 s; combo 3 |
| `elite_ho_mach_khoi_tuong` | Hộ Mạch Khôi Tướng | 17–19 | Thổ | tinh anh, khiên | 7,0 / 2,2 / 4 | **Đập búa** r 5 báo 1,4 s; giơ khiên chặn 70% từ phía trước 3 s |
| `elite_xich_sa_ngo_cong` | Xích Sa Ngô Công | 18–19 | Mộc | tinh anh, độc | 6,0 / 2,4 / 4 | **Chui đất** (xem 5.1 rút gọn) + nón độc 12 m |
| `boss_dia_mach_long` | Địa Mạch Long | 19 | Thổ | boss ngoài trời | 90 / 1,35 / 30 | xem 5.4 |
| `boss_thach_tam_khoi_vuong` | Thạch Tâm Khôi Vương | 19 | Thổ | mini-boss D1 | 60 / 1,3 / 14 | xem 5.1 |
| `boss_thon_mach_ngo_cong_vuong` | Thôn Mạch Ngô Công Vương | 19 | Mộc | boss D1 | 75 / 1,35 / 22 | xem 5.1 |

### 6.2 Bản đồ 3

| Id | Tên | Cấp | Hành | Vai | hp/atk/xp | Chiêu và vạch báo |
| --- | --- | --- | --- | --- | --- | --- |
| `mon_van_hac` | Vân Hạc | 20–23 | Thủy | xa, bay thấp | 1,1 / 2,3 / 1,3 | Đạn lông (`bolt`, r 0,5, v 10), 3 viên tản 20° |
| `mon_kinh_linh` | Kính Linh | 21–23 | Kim | khiên phản | 1,3 / 1,5 / 1,3 | Giơ khiên 2 s phản đạn xa; mở sườn khi đánh |
| `mon_phu_dao_thach_quy` | Phù Đảo Thạch Quy | 21–22 | Thổ | tank chậm | 2,0 / 1,0 / 1,3 | Giậm r 5 báo 1,8 s; đòn rất chậm |
| `mon_bich_ngoc_kim_thien` | Bích Ngọc Kim Thiền | 20–23 | Mộc | bầy | 0,6 / 1,2 / 0,8 | Đâm thẳng, bầy 6–8; chết thì phun độc nhỏ r 2 |
| `elite_van_hac_vuong` | Tuyết Vũ Vân Hạc Vương | 20–23 | Thủy | tinh anh bay | 5,4 / 2,5 / 4 | Mưa lông: 5 đạn tản 30°; xoay vòng r 8 |
| `elite_kinh_dien_ma_quan` | Kính Diện Ma Quân | 21–23 | Kim | tinh anh phản chiếu | 6,5 / 2,3 / 4 | Phản đạn xa 30%; cắt kiếm bạc nón 10 m |
| `elite_loi_van_su_vuong` | Lôi Vân Sư Vương | 21–23 | Hỏa | tinh anh sấm | 7,0 / 2,5 / 4 | **Sấm vùng**: 3 vòng r 4 báo 1,2 s quanh người chơi |
| `boss_van_hai_kinh_vuong` | Vân Hải Kình Vương | 23 | Thủy | boss ngoài trời | 110 / 1,35 / 32 | xem 5.4 |
| `boss_kinh_nguyet_chan_quan` | Kính Nguyệt Chân Quân | 23 | Kim | boss D2 | 90 / 1,3 / 25 | xem 5.2 |

### 6.3 Bản đồ 4

| Id | Tên | Cấp | Hành | Vai | hp/atk/xp | Chiêu và vạch báo |
| --- | --- | --- | --- | --- | --- | --- |
| `mon_thach_tuong_vo_si` | Thạch Tượng Võ Sĩ | 24–27 | Thổ | cận chiến | 1,6 / 1,4 / 1,3 | Chém ngang nón 6 m báo 1,0 s; chặn khiên |
| `mon_da_minh_loc` | Dạ Minh Lộc | 24–25 | Thủy | nhanh | 1,2 / 1,5 / 1,3 | Húc lao line 10×2 m báo 0,9 s |
| `mon_cot_ve_kiem_thu` | Cốt Vệ Kiếm Thủ | 25–27 | Kim | bầy | 1,3 / 1,5 / 1,3 | Combo 2 kiếm; hồi sinh một lần sau 6 s nếu không bị diệt cùng lúc với bạn đồng hành |
| `mon_co_thanh_chien_ma` | Cổ Thành Chiến Ma | 26–27 | Hỏa | cận chiến nặng | 1,8 / 1,6 / 1,4 | Đâm giáo line 8×2,5 m báo 1,1 s; gầm làm giảm phòng ngự 3 s |
| `elite_thach_tuong_dai_tuong` | Thạch Tượng Đại Tướng | 24–27 | Thổ | tinh anh | 7,0 / 2,3 / 4 | Quét kiếm nón 12 m, 60°; giáng kiếm line 14×3 |
| `elite_da_minh_loc_vuong` | Dạ Minh Lộc Vương | 24–25 | Thủy | tinh anh | 5,5 / 2,4 / 4 | Quầng sao r 6 báo 1,3 s; húc lao line 14×2 |
| `elite_cot_kiem_thong_linh` | Cốt Kiếm Thống Lĩnh | 25–27 | Kim | tinh anh, mini-boss D3 | 6,5 / 2,5 / 4 | Hai kiếm tia quét kép; combo 4 |
| `boss_thien_khuyet_thu_linh` | Thiên Khuyết Thủ Linh | 27 | Thổ | boss ngoài trời | 140 / 1,4 / 34 | xem 5.4 |
| `boss_vo_dien_than_quan` | Vô Diện Thần Quân | 27 | (Ngũ hành) | boss D3 | 120 / 1,4 / 30 | xem 5.3 |

Tinh anh Vân Lam hiện có (`elite_huyet_nha_lang`, `elite_xich_dien_ho`, `elite_cu_nham_vien`) giữ hành, chiêu, dữ liệu; chỉ đổi model (concept ở `ASSET_CONCEPTS.md`).

---

## 7. Trang bị, pháp bảo, đan dược, nguyên liệu, kinh tế

### 7.1 Bậc trang bị

Giữ 8 ô (Pháp kiếm, Đạo bào, Hộ uyển, Vân ngoa, Đai lưng, Ngọc bội, Giới chỉ, Pháp bảo phụ) và 5 phẩm (Phàm, Linh, Huyền, Địa, Thiên). Thêm **bậc** (tier) gắn với chương; `reqLevel` mỗi bậc theo cấp vào chương.

| Bậc | Chương | `reqLevel` | Nhân chỉ số chính (so bậc 1) | Nguồn chính |
| --- | --- | --- | --- | --- |
| 1 | Vân Lam (đã có) | 1–15 | ×1,0 | giữ nguyên |
| 2 | Đoạn Mạch | 16–19 | ×1,6 | quái bản đồ 2, Phục Mạch Quật, chế tạo ở Hứa lão |
| 3 | Vân Hải | 20–23 | ×2,5 | quái bản đồ 3, Kính Nguyệt Cung, chế tạo |
| 4 | Thiên Khuyết | 24–27 | ×3,8 | quái bản đồ 4, Thần Tàng Điện, chế tạo |

Hệ số theo `realmMul` để phần trang bị trong sức mạnh tổng giữ ~30% như hiện nay. Mỗi bậc thêm **1 lỗ khảm tối đa** (bậc ≥ 3 tối đa 3 lỗ), dòng phụ roll có seed như hiện có.

| Ô | Bậc 2 · Đoạn Mạch | Bậc 3 · Vân Hải | Bậc 4 · Thiên Khuyết |
| --- | --- | --- | --- |
| Pháp kiếm | Liệt Mạch Kiếm† | Kính Quang Kiếm† | Tinh Khuyết Kiếm† |
| Đạo bào (chế/rơi theo bộ) | Mạch Văn Đạo Bào† | Kính Vân Đạo Bào† | Tinh Khuyết Đạo Bào† |
| Hộ uyển | Sa Thạch Hộ Uyển† | Lưu Ly Hộ Uyển† | Cổ Thành Hộ Uyển† |
| Vân ngoa | Khô Hà Vân Ngoa† | Phù Vân Ngoa† | Dạ Hành Vân Ngoa† |
| Đai lưng | Ngân Mạch Đai Lưng† | Ngân Hà Đai Lưng† | Tinh Văn Đai Lưng† |
| Ngọc bội | Mạch Tinh Ngọc Bội† | Kính Tâm Ngọc Bội† | Thần Tàng Ngọc Bội† |
| Giới chỉ | Hoàng Sa Giới Chỉ† | Lưu Quang Giới Chỉ† | Thủ Linh Giới Chỉ† |
| Pháp bảo phụ | Tử Kim Hồ Lô, Trấn Hồn Linh, Thanh Liên Ấn **lên cấp 6–7** | **Ngưng Đan Lô**† (bản mệnh, Kết Đan) | **Anh Ngọc Kính**† (Nguyên Anh), **Thần Niệm Châu**† (Hóa Thần) |

### 7.2 Bộ trang bị (4 món, hiệu ứng 2/4) — mỗi chương ba bộ, mỗi công pháp một bộ

| Bậc | Kiếm tu | Hộ pháp | Đan sư | Nguồn |
| --- | --- | --- | --- | --- |
| 2 | **Liệt Mạch Kiếm Y** (`set_liet_mach`): 2 món +6% công kích; 4 món Hoành Kiếm Phá Mạch +20% và dài thêm 4 m | **Địa Long Hộ Giáp** (`set_dia_giap`): 2 món +9% phòng ngự; 4 món Kim Chung Trấn phản thêm 15% | **Phục Mạch Đan Bào** (`set_phuc_mach`): 2 món hồi +8%; 4 món Mộc Linh Trận +25% thời lượng | Phục Mạch Quật (mảnh), chế tạo |
| 3 | **Kính Quang Kiếm Y** (`set_kinh_quang`): 2 món +5% bạo kích; 4 món Nghịch Kiếm Chuyển Phong hoàn 40% hồi chiêu nếu hạ được mục tiêu | **Vân Kình Thiết Giáp** (`set_van_kinh`): 2 món +10% khí huyết; 4 món Dịch Sơn Xung choáng thêm 0,5 s | **Lưu Ly Đan Y** (`set_luu_ly`): 2 món +12% khiên đan; 4 món Ngưng Đan Hộ Thế thêm 5% | Kính Nguyệt Cung (mảnh), chế tạo |
| 4 | **Tinh Khuyết Kiếm Bào** (`set_tinh_khuyet`): 2 món +8% công kích; 4 món Phân Anh Kiếm Ảnh gấp đôi sát thương | **Cổ Thành Huyền Giáp** (`set_co_thanh`): 2 món giảm 6% sát thương nhận; 4 món Anh Thiết Thân chia 20% cho đồng đội | **Thần Tàng Đan Bào** (`set_than_tang`): 2 món +10% hồi; 4 món Anh Dược Hóa Thân hồi thêm 15% | Thần Tàng Điện (mảnh), chế tạo |

Recolor theo bộ (`recolorSet`) và phụ kiện hình dáng (`setAccessories.ts`) dùng lại hệ thống 3-4 (ảnh tham chiếu bộ màu ở `ASSET_CONCEPTS.md`, mục "set").

### 7.3 Cường hóa, khảm, thăng bậc

- **Cường hóa** giữ `MAX_ENHANCE = 10`, công thức `enhanceCost`; giá cơ sở `itemPrice` bậc 2/3/4 = 9.000 / 14.000 / 21.000 cho Pháp kiếm (ô khác nhân `weight`/1,3 của `slots.json`).
- **Thăng Bậc** (mới, ở Hứa lão hoặc Thiết lão): món bậc n + 20 nguyên liệu bậc n+1 + linh thạch (0,4 × thu nhập 1 giờ của chương đích) → món cùng ô, cùng phẩm chất, **giữ dòng phụ**, chỉ số chính theo bậc mới, cấp cường hóa **trừ 3** (tối thiểu +0). Để đồ cũ không bỏ phí, và có đích đến cho đồ rơi đẹp.
- **Linh ngọc cấp 4–6** (ghép 3 → 1 như 1–3), bốn hành, mở từ chương 2 / 3 / 4; có thêm **ngọc thần thức** (cấp 5): +3 m phạm vi thần thức.
- Công thức nằm ở `packages/shared/src/upgrade.ts` và `apps/server/src/game/upgrade.ts`, mỗi thao tác một tx + idem + ledger như hiện có.

### 7.4 Nguyên liệu, đan dược

| Nhóm | Id đề xuất | Dùng cho | Rơi từ |
| --- | --- | --- | --- |
| Nguyên liệu bậc 2 | `itm_mach_tinh_phien`† (Mạch Tinh Phiến), `itm_hoang_sa_thao`† (Hoàng Sa Thảo), `itm_ngung_dan_mach_tinh`† | chế bậc 2, Thăng Bậc, Kết Đan Dịch | quái bản đồ 2, Phục Mạch Quật |
| Nguyên liệu bậc 3 | `itm_kinh_hoa_sa`† (Kính Hoa Sa), `itm_van_hai_lo`† (Vân Hải Lộ), `itm_bich_ngoc_nhi`† | chế bậc 3, Dưỡng Anh Đan | quái bản đồ 3, Kính Nguyệt Cung |
| Nguyên liệu bậc 4 | `itm_tinh_quang_mac`† (Tinh Quang Mặc), `itm_than_tang_ngoc`† (Thần Tàng Ngọc), `itm_co_thanh_phien`† | chế bậc 4, Hóa Thần Lộ, Phá Ấn Phù | quái bản đồ 4, Thần Tàng Điện |
| Vật phẩm độ kiếp | **Kết Đan Dịch**† · **Dưỡng Anh Đan**† · **Hóa Thần Lộ**† | độ kiếp (bị tiêu); chế được ở Tố Tâm bằng nguyên liệu bậc của chương; Dịch/Đan/Lộ cũng rơi hiếm ở boss phó bản | chế, rơi hiếm |
| Phá Cảnh Đan bậc 2/3/4 | `itm_pha_canh_dan_2|3|4`† | qua bình cảnh (mục 2.4) | chế, rơi |
| Đan chiến đấu bậc mới | **Hồi Mạch Đan**† (hồi 45% hp, hồi 30% mp; hồi chiêu chung 30 s), **Thanh Tâm Đan**† (kháng tâm ma +15%, buff 10 phút), **Thiên Lôi Hộ Đan**† (`tribRes` +12% trong kiếp), **Kim Cương Đan / Bạo Huyết Đan / Mãnh Lực Đan bậc 2–3** (+14% / +18%, 10 phút) | chiến đấu, độ kiếp (tối đa 3 viên/kiếp) | chế (Tố Tâm) |
| Công cụ phó bản | **Phá Ấn Phù**† (mở cửa phong ấn trong Thần Tàng Điện khi không có người Nguyên Anh), **Định Thần Phù**† (giảm sát thương gương Kính Nguyệt 40% trong 10 s) | phó bản | chế (Tố Tâm hoặc Hứa lão) |

Phẩm chất đan (Hạ/Trung/Thượng, `alchemy.json`: `base [0,62; 0,30; 0,08]`, `support [0,34; 0,40; 0,26]`) giữ nguyên; đan bậc mới nhân `potency` 1 / 1,2 / 1,45.

### 7.5 Kinh tế linh thạch

Công thức rơi: `gold(L) = [round(0,55·L), round(1,2·L)]` mỗi quái thường (khớp `[6,14]` ở cấp 10 hiện nay). Thu nhập ước (400 con/giờ, trung bình 0,875·L): cấp 17 ≈ 6,0k/giờ; cấp 21 ≈ 7,4k/giờ; cấp 25 ≈ 8,8k/giờ, cộng ~20% bán đồ rơi.

| Chặng | Linh thạch nhận (~) | Hố tiêu tiền thiết kế (điều chỉnh bằng giá) |
| --- | --- | --- |
| Chương 2 (4 giờ) | 24k + 5k bán đồ | Thăng Bậc 8 ô × 0,4 × 6k = 19k; cường hóa +5 cho 4 ô ≈ 4 × (150 + 0,9 × 9k) ≈ 33k; đan, vật phẩm độ kiếp |
| Chương 3 (6 giờ) | 44k + 9k | Thăng Bậc 8 × 0,4 × 7,4k = 24k; cường hóa +5 cho 4 ô ≈ 4 × 12,7k = 51k; đan |
| Chương 4 (8 giờ) | 70k + 14k | Thăng Bậc 8 × 0,4 × 8,8k = 28k; cường hóa +5 ≈ 4 × 19k = 76k |

Hố tiêu tiền **lớn hơn thu nhập một chút** cho người cầu toàn (người chơi chọn ô nào nâng), cân bằng theo cấp **không lạm phát**: không có nguồn linh thạch mới ngoài quái, bán đồ, nhiệm vụ (đã có); không có giao dịch người với người (để sau). Kiểm bằng `pnpm sim:progress` mở rộng: nếu số dư trung bình cuối chương > 30% thu nhập thì thêm hố tiêu (giá Thăng Bậc, đan bậc); nếu < 0 thì giảm. Mọi giao dịch vẫn một tx + idem + ledger.

---

## 8. Kỹ năng và biến thức mới

Khung dữ liệu K-2 giữ nguyên: `windup`, `hitAt[]`, `recovery`, `cancel.{move,dash}`, `combo{window,hits[]}`, `empower`, `mark`, `dash`; hàm thuần ở `shared/skillrules.ts`, `shared/animrules.ts` suy pha và cửa sổ hủy. Mỗi chiêu có **hai biến thức A/B** (3-6). Ô chiêu: 8 hiện nay → **9 ở Kết Đan sơ kỳ**, **10 ở Hóa Thần sơ kỳ**; phím số, phím `V` thần thức, `X` xuất khiếu, `G` phân thân.

**Ngôn ngữ động tác K-5**: pose chiêu theo cấu trúc 9 khung (tấn công) / 7 khung (niệm, hộ thể, hồi phục), sinh bằng `node tools/poses/gen-k5.mjs`; mỗi chiêu có ba giọng: kiếm tu (pose gốc), hộ pháp (`_hp`, quyền/trụ vững), đan sư (`_ds`, ấn quyết/tay áo). **VFX K-6**: ba pha tụ lực → bùng nổ tại `hitAt` → tan; HDR dưới `FX_MAX_HDR` (2,4); màu theo công pháp (kiếm `#9FD8FF`, hộ pháp `#FFC95A`, đan sư `#7DFFA0`); vệt kiếm bám `dtl_sword`.

### 8.1 Lạc Kiếm Quyết (kiếm tu)

| Id | Tên | Mở | Loại | hồi/mp | power | windup / hitAt / recovery | Biến thức A | Biến thức B | K-5 | K-6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skl_hoanh_kiem_pha_mach` | Hoành Kiếm Phá Mạch | 16 | damage line 12×3 m | 12 s / 34 | 2,8 | 0,40 / 0,40 / 0,60 | Xuyên Mạch: dài 18 m, power 2,4 | Cuồng Mạch: 2 đợt 1,8 trong 9 m | chém ngang một nhịp | vệt trắng ngà dài, nứt đất |
| `skl_kiem_vu_tam_diep` | Kiếm Vũ Tam Điệp | 18 | combo 3 (window 1,5 s) | 15 s / 40 | 1,1 / 1,1 / 1,8 | 0,25 / 0,25 / 0,35 mỗi đòn | đòn 3 đẩy lùi | 4 đòn nhỏ (0,9 × 4) | ba nhịp liền | ba vệt chồng |
| `skl_kiem_dan_ban_menh` | Kiếm Đan Bản Mệnh (thần thông ô 9) | 20 | summon 10 s | 40 s / 50 | 0,4 mỗi nhịp 1 s | 0,5 / 0,5 / 0,5 | 2 kiếm đan, 6 s | kiếm đan đuổi mục tiêu đã đánh dấu | niệm ấn, kiếm bay ra | kiếm nhỏ quanh thân, ngọc lam |
| `skl_nghich_kiem_chuyen_phong` | Nghịch Kiếm Chuyển Phong | 22 | dash xuyên 10 m | 14 s / 30 | 1,6 mỗi kẻ trúng | 0,20 / 0,20 / 0,45 | quay về chỗ cũ | dài 14 m | lao thẳng | vệt kiếm bám xương |
| `skl_phan_anh_kiem_anh` | Phân Anh Kiếm Ảnh | 24 | buff nguyên anh | 25 s / 55 | 0,6 (lặp chiêu cuối) | 0,40 / 1,40 / 0,40 | 80% nhưng chậm 1,5 s | 2 × 40% | tay chắp, anh nhỏ hiện | bóng anh bạc phía sau |
| `skl_thuan_di_tram` | Thuấn Di Trảm | 26 | teleport + damage | 18 s / 45 | 3,2 | 0,15 / 0,35 / 0,45 | hạ mục tiêu thì hoàn 50% hồi | nổ nhỏ 6 m khi tới | thuấn di + chém xuống | tia ngọc lam rút ngắn |
| `skl_thien_kiem_hoa_hinh` | Thiên Kiếm Hóa Hình (thần thông ô 10) | 28 | aoe r 12 | 60 s / 90 | 7,5 | 0,70 / 0,70 / 0,55 | thêm đóng băng 1 s | thêm 3 đòn dư chấn | tư thế tối thượng | thanh kiếm khổng lồ ánh sáng |

### 8.2 Bất Động Kim Thân (hộ pháp)

| Id | Tên | Mở | Loại | hồi/mp | power | windup / hitAt / recovery | A | B | K-5 | K-6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skl_thiet_quyen_chan_dia` | Thiết Quyền Chấn Địa | 16 | aoe r 6, choáng 1 s quái thường | 14 s / 30 | 2,2 | 0,45 / 0,45 / 0,65 | vòng r 8 không choáng | để lại vùng chậm 4 s | quyền đập đất | vòng chấn động vàng |
| `skl_kim_chung_tran` | Kim Chung Trấn | 18 | guard + phản 20%, 6 s | 24 s / 36 | 0 | 0,40 / 0,40 / 0,55 | phản 35%, 4 s | giảm 10% cho đồng đội r 8 | trụ vững, hai tay giữ | chuông vàng bao thân |
| `skl_son_nhac_hoa_than` | Sơn Nhạc Hóa Thân (thần thông ô 9) | 20 | buff 10 s | 60 s / 60 | 0 | 0,60 / 0,60 / 0,50 | thêm hồi 1%/s | giậm r 6 mỗi 2 s | hóa thân | thân ngọc đá phóng to 1,3× |
| `skl_dich_son_xung` | Dịch Sơn Xung | 22 | dash 8 m, đẩy 6 m | 14 s / 28 | 1,3 | 0,20 / 0,20 / 0,45 | choáng 1,5 s | kéo kẻ gần vào | húc vai | bụi đá cuộn |
| `skl_anh_thiet_than` | Anh Thiết Thân | 24 | guard 8 s, nhận 30% thay đồng đội | 30 s / 50 | 0 | 0,35 / 0,35 / 0,50 | 8 s → 10 s, nhận 20% | tự giảm 25% | hai tay mở | nguyên anh bạc che chắn |
| `skl_thuan_di_ho_the` | Thuấn Di Hộ Thế | 26 | teleport tới đồng đội, khiên 20% | 20 s / 40 | 0 | 0,15 / 0,15 / 0,40 | thêm khiêu khích r 8 | khiên 30% nhưng 3 s | thuấn di tới | tia vàng |
| `skl_thien_kim_phap_tuong` | Thiên Kim Pháp Tướng (thần thông ô 10) | 28 | buff 12 s | 70 s / 90 | 0,8 mỗi giậm | 0,70 / 0,70 / 0,50 | miễn đẩy lùi | giậm mỗi 2 s | pháp tướng khổng lồ | tượng vàng bán trong suốt |

### 8.3 Thanh Mộc Đan Kinh (đan sư)

| Id | Tên | Mở | Loại | hồi/mp | power | windup / hitAt / recovery | A | B | K-5 | K-6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skl_moc_linh_tran` | Mộc Linh Trận | 16 | zone 8 s r 8 | 18 s / 38 | hồi 6%/s, độc quái 4%/s | 0,40 / 0,40 / 0,55 | r 6, hồi 10%/s | độc 8%/s | ấn xuống đất | vòng lá ngọc |
| `skl_duoc_vu` | Dược Vũ | 18 | heal aoe 4 s | 20 s / 40 | hồi 25% tổng | 0,40 / 0,40 / 0,55 | thêm giải độc | thêm +5% tốc độ 6 s | tay áo vung | mưa lá |
| `skl_ngung_dan_ho_the` | Ngưng Đan Hộ Thế (thần thông ô 9) | 20 | shield party 15% hp / 10 s | 45 s / 55 | 0,15 | 0,50 / 0,50 / 0,50 | 20% nhưng 8 s | thêm hồi 2%/s | ấn quyết | quầng đan ngọc |
| `skl_dan_hoa_phong_tran` | Đan Hỏa Phong Tràn | 22 | thrown, r 6, burn | 16 s / 36 | 3,2 + 4%/s | 0,35 / 0,35 / 0,50 | r 8 | burn dài 6 s | ném đan | cầu lửa lam |
| `skl_anh_duoc_hoa_than` | Anh Dược Hóa Thân | 24 | nguyên anh bay hồi đồng đội | 25 s / 50 | hồi 40% / 4 s | 0,40 / 0,40 / 0,45 | r 10 cho 2 người | cộng thêm 10% khiên | anh nhỏ bay đi | luồng sáng ngọc |
| `skl_thuan_di_cuu_vien` | Thuấn Di Cứu Viện | 26 | teleport + hồi sinh 40% | 90 s / 70 | 0 | 0,20 / 0,20 / 0,45 | hồi sinh 55% | hồi sinh 2 người | thuấn di | lá + ngọc |
| `skl_thien_dan_phap_gioi` | Thiên Đan Pháp Giới (thần thông ô 10) | 28 | zone 12 s r 14 | 70 s / 90 | hồi 8%/s + giải hiệu ứng xấu | 0,70 / 0,70 / 0,55 | thêm +15% công kích | thêm +15% phòng ngự | đứng tâm vòng | pháp giới sáng |

Chiêu dùng chung mới: **Thần thức** (`V`, 20 s hồi, 2,5 s giữ, tốn 20 mp): quét 60/80/120 m; **Xuất khiếu** (`X`, 20 s hồi, 6 s): nguyên anh rời thân (xem 3.2; ngoài độ kiếp chỉ để bay qua môn phong ấn); **Phân thân thần niệm** (`G`, 90 s hồi, 20 s sống).

Nội tại công pháp mở rộng ở mỗi đại cảnh giới (một dòng, `methods.json`): kiếm ý tối đa 5 → 6 (Kết Đan) → 7 (Nguyên Anh); sơn ý chuyển 8% → 10% → 12% mỗi điểm; Đan kinh hồi +20% → +25% → +30%. Không đụng sáu chiêu gốc (vấn đề `GAME_DESIGN_CORE` 6.2 xử lý ở Sprint 2).

---

## 9. Hệ thống hỗ trợ cần thiết kế riêng

- **Truyền Tống liên bản đồ**: mỗi bản đồ một "hub" trận; Thiên Mạch Đài (Vân Lam) mở sau `q_truc_co`; Hạ Khuyết Trạm → Phù Đảo Các mở sau `q2_ket_dan`; Phù Đảo Các → Ngoại Thành Trạm mở sau `q3_nguyen_anh`. Niệm 5 s (liên bản đồ), hồi 30 s, các điều kiện chặn như `teleport.ts` hiện có. Bản đồ lớn (M) thêm thẻ "Bản đồ" chuyển giữa 4 level (chỉ xem; cần đã mở).
- **Hồi sinh**: ở trạm trung tâm của bản đồ hiện tại, hoặc trận đã mở gần nhất trong cùng bản đồ.
- **Thần thức** là đường dạy người chơi đọc bản đồ: thêm cờ minimap "mờ/ảo" cho đảo giả.
- **Người chơi chưa đủ cấp** vẫn vào được hub (an toàn) nhưng thấy cảnh báo cấp ở bãi quái và giảm tu vi theo `xpLevelFactor` (đã có).

---

## 10. Kế hoạch kỹ thuật E-1 (nền nhiều bản đồ)

### 10.1 Hiện trạng đã đọc (2026-11-16)

| Thứ | Hiện nay | Vấn đề cho nhiều bản đồ |
| --- | --- | --- |
| Địa hình | `heightAt(x, z)` toàn cục trong `shared/terrain.ts`, hằng `SECT`, `VALLEY`, `SUOI`, `FOREST`, `VACH`, `LAKE`, `PORTAL_PAD`, `KIEM_TRUNG`, `PLAY_BOUNDS`, `WORLD_SIZE` trong `shared/level.ts`; gọi trực tiếp từ ~20 file (client `terrain`, `groundMask`, `water`, `clouds`, `backdrop`, `grass`, `propScatter`, `soundscape`, `surface`; server `sim`; content `check`, `mapreport`; tools `minimap`) | Mọi nơi giả định một thế giới |
| Level | `LEVELS[levelId]` (`van_lam`, `kiem_trung`) chỉ chứa `spawns`/`nodes`; `zones`/`camps`/`pois` của Vân Lam nằm trong JSON nhưng bố cục dựa vào hằng số TS | Không có `terrain` theo level |
| Room | `WorldRoom` (`levelId: 'van_lam'`, `roomName: 'world'`), `DungeonRoom` (`kiem_trung`, vé một lần), `transfer(p, ROOM_DUNGEON|ROOM_WORLD)`; `sim.ts` có các điểm kiểm cứng `levelId !== 'van_lam'` (dòng ~422, 466, 479, 612, 2856: độ kiếp, truyền tống, tâm ma…) | Cần tham số hóa |
| DB | `characters.room` lưu id level, `x`, `z`; `persistPosition` chỉ khi `char.room === levelId`; `characters.tele` mở khóa trận; `characters.meta` JSON; `DATA_VERSION`, `ADDED_COLUMNS` | Chạy được cho nhiều level, cần migration cho `xpNeed`, cảnh giới mới |
| Tổ đội, vé | Tổ đội trong bộ nhớ tiến trình; vé vào bí cảnh trong bộ nhớ (`takeTicket`) | Một tiến trình Node nên dùng chung được giữa các room; cần vé có `toLevel` |
| AOI | Từng room có `aoi.ts` riêng (160/190 m, boss 300/330 m) | Dùng được nguyên; Vân Hải: chiều dọc lớn, kiểm tra khoảng cách 3D hay chỉ x,z |
| Nạp asset | `preload.ts` + `AssetCache` đếm tham chiếu, nạp theo ưu tiên khoảng cách; ground textures nạp lười; nhạc theo vùng | Phải giải phóng tài nguyên bản đồ cũ khi đổi; nạp theo bản đồ không tính vào tải đầu 30 MB |

### 10.2 Thiết kế đề xuất

1. **`LevelDef` thống nhất** (`packages/shared/src/level.ts`): `{ id, size, play: {x0,z0,x1,z1}, wall, water?, mood, terrain: TerrainDef, zones, camps, spawns, pois, nodes, places, tele }`. `TerrainDef` dữ liệu hóa: `{ seed, base: noise params, features: [{x,z,y,flatR,outerR}], islands?: [...], voidFloor? }`. `terrainOf(levelId)` trả `{ heightAt, bounds, water }`; `heightAt(x, z)` hiện có giữ làm lối tắt cho Vân Lam (không phải sửa 20 file một lượt: chuyển dần theo từng file có test).
2. **Room theo bản đồ**: `defineWorld(levelId)` đăng ký `world.<levelId>` (Vân Lam giữ tên `world` để không phá bot, test, script); `filterBy(['channel'])` giữ cơ chế kênh 50 người. `DungeonRoom` đọc `levelId` và `WAVES` từ `levels/<id>.json`.
3. **Chuyển bản đồ**: `transfer(player, {level, spawn})` + **vé có `toLevel`** (one-time, hết hạn 15 s, kiểm điều kiện ở room đi: không chết, không độ kiếp, không tỉ thí, ra chiêu xong, không niệm dở); room đến kiểm vé trong `onAuth`. Trạng thái (hp, buff, hồi chiêu, tổ đội) đi theo bản ghi DB đã ghi trước khi rời (`persist` ngay), tổ đội đi theo người dẫn (cả đội vào cùng kênh nếu còn chỗ).
4. **Truyền Tống liên bản đồ**: `TELE_PADS` thêm trường `level`; lệnh `tele {id}` với pad ở level khác chạy `transfer`; id pad có tiền tố level (`dm_`, `vh_`, `tk_`) để `characters.tele` không đổi cấu trúc; niệm 5 s, hồi 30 s; UI bản đồ lớn (M) thêm thẻ chọn level.
5. **Cảnh giới mở rộng**: `realms.json` + `realm.19…28`, hằng số cấp mới, `xpNeed`, `playerBaseStats`, `monsterStats` (mục 2). Bảng thuật ngữ: thêm vào glossary (mục 13). Server `game/realm.ts` mở rộng bình cảnh theo bảng 2.4.
6. **Độ kiếp theo dữ liệu**: `packages/content/data/tribulations.json` (pha, thời lượng, hằng số, vùng) thay hằng trong `formulas.ts`; `tickTribulation` đọc pha; liên kết S2-C: kiểm tra nhánh của họ rồi dùng chung cấu trúc, không viết hai lần.
7. **Nạp asset theo bản đồ**: `levels/<id>.assets.json` (GLB, texture ground, nhạc, cỏ, impostor cây); `Game.enterLevel(id)`: dựng terrain, đổi mood, nạp asset theo ưu tiên, **giải phóng bản đồ cũ** (đếm tham chiếu `AssetCache`, dispose terrain/props/grass/VFX theo level); màn tải tái sử dụng loading screen có sẵn; nhạc nạp bài của level mới trước khi tắt bài cũ.
8. **Công cụ**: `pnpm map:report --level <id>`, `pnpm minimap:build --level <id>`, `pnpm shots --level`, `content:check` kiểm mọi level (camp trong vùng, không đè collider, mật độ 100–140 quái/km²), `pnpm sim:progress` mở rộng 28 cấp và bốn nguồn tu vi.
9. **Hiệu năng**: mỗi bản đồ phải đạt cùng ngân sách (dưới 300 draw call, 1–2 triệu tam giác, 512 MB texture; tải đầu dưới 30 MB không gồm bản đồ mới); `bench:crowd` chạy cho từng bản đồ; Vân Hải cần kiểm tra khoảng nhìn xa và sàn mây (biển mây hiện có `render/clouds.ts` dùng lại làm sàn).

### 10.3 Việc phải làm trước khi code (phụ thuộc)

- **S2-C** (độ kiếp 3 pha, khả năng chỉ Trúc Cơ): E-1F đọc kết quả của họ; nếu cấu trúc pha khác, chỉnh bảng 3.1–3.3 cho khớp; không đụng `tickTribulation` song song.
- **K-5/K-6**: hộp công cụ pose/VFX đã có; chiêu mới tạo qua `gen-k5.mjs` và `skillFx.ts`.
- **Asset của người dùng**: chương 2 chạy được với model tạm (đổi màu/tỉ lệ model có sẵn), thay khi có GLB.

### 10.4 Ghi chú triển khai E1-B (2026-11-16)

- **Tên room**: `world` (Vân Lam), `world-<levelId>`, `dungeon` (Kiếm Trủng), `dungeon-<levelId>`. Không dùng dấu chấm như mục 10.2 viết: Colyseus chỉ giữ phần khớp `[A-Za-z0-9_-]+` đầu tiên của tên room, nên `world.doan_mach` bị nhận nhầm thành `world` (đã gặp khi chạy bộ `security`). `worldRoomName`/`dungeonRoomName` ở `shared/protocol.ts`, `defineWorld`/`defineDungeon` ở `rooms.ts`, `index.ts` đăng ký mỗi level trong `LEVELS` một room.
- **Vé**: `apps/server/src/transfer.ts` (`tickets`, `TicketBook`): một vé mỗi nhân vật, `{to, spawn, exp}`, hết hạn 15 s, `take` xóa vé; vé tới nơi khác không bị đốt. Room đến kiểm trong `static onAuth` (level gốc Vân Lam không cần vé, mọi level khác và bí cảnh bắt buộc); điểm xuất hiện đi theo vé.
- **Kiểm ở room đi**: `GameSim.leaveBlocker` (chết, độ kiếp, tâm ma, tỉ thí, niệm dở/ra chiêu; thêm giao chiến khi Truyền Tống), `GameRoom.requestLevel` (cấp vé, `savePlayer`, gửi `S.TRANSFER {room, level}`); người dẫn tổ đội kéo đồng đội cùng room trong 30 m (`TELE_PARTY_R`) nếu họ qua được kiểm. Chưa bảo đảm cùng kênh (client vào bằng `joinOrCreate`, chọn kênh còn chỗ đầu tiên).
- **Đăng nhập lại**: nhân vật lưu ở level khác với room đang vào thì room gửi `S.TRANSFER` ngay trong `onJoin` (kèm vé) và không dựng người; bí cảnh không giữ người qua đăng nhập (về `returnLevel`/`returnSpawn`). Client (E1-D) phải xử lý `S.TRANSFER` đến trước `S.INIT`.
- **Dữ liệu**: `LevelDef.spawn|portals|dungeon` (`DungeonDef`: spawn, exit, center, minLevel, returnLevel, returnSpawn, waves); `NpcDef.level`; `TelePad.level|face`. Sim dùng `terrainOf(level)` cho độ cao và `stepMove`. Id trận ở level khác Vân Lam có tiền tố level; `characters.tele` không đổi cấu trúc nên không cần migration DB.
- **Còn lại cho gói sau**: khóa thưởng hằng ngày bí cảnh (`meta.dungeonDay`) đang dùng chung một ngày cho mọi bí cảnh (E2-C); võ đài chỉ ở Vân Lam; `testflags` đọc toạ độ `?at=x,z` theo `WORLD_SIZE` 4096 (kích thước level khác: E1-G/E2-A).

### 10.5 Ghi chú triển khai E1-F (2026-11-16)

- **Dữ liệu**: `packages/content/data/tribulations.json` thay hằng số độ kiếp trong `formulas.ts` (giữ tên cũ làm bí danh của `truc_co`). Mỗi pha có `kind` (`lei` thiên lôi, `hoa` lưới ô lửa, `tam_ma` bóng tâm ma), `end`, `gap` (+ `gapEnd` nội suy), tia nhắm `aimPct`, tia rơi quanh `extra*`, lôi võng `net`, tia khóa mệnh `final` (kèm `guardShare`/`guardMax`/`guardR`: hộ pháp chắn thay), `grid`, `shadows`, `mechanic`. `content:check` kiểm pha liền mạch, mốc cuối = thời lượng, cơ chế hợp lệ, chuỗi i18n.
- **Hành vi Trúc Cơ không đổi**: thứ tự `Math.random` và thứ tự phát vùng giữ nguyên; bản chuẩn băm 3 hạt giống × 40 s lấy từ code cũ (`apps/server/src/game/trib.golden.test.ts`).
- **Pha chung đã làm** (server): thiên lôi, lôi võng, tia khóa mệnh + hộ pháp chắn (hộ pháp trong `guardR` chỉ chịu phần chia, không ăn thêm đòn vòng), lưới ô lửa (một ô luôn là ô người độ kiếp đứng, báo `warn` rồi cháy, đòn thứ hai sau `burn`), bóng tâm ma theo nhịp hoặc một lần (`maxAlive`, `levelDelta`, `hpFrac`).
- **Hook cơ chế** (`tribmech.ts`, `registerMechanic(id, {enter, tick, exit})`): `dan_tran` (E2-D), `tia_xich`, `xuat_khieu`, `tam_canh` (E3), `ngu_hanh`, `phan_than` (E4). Hiện chỉ ghi log một lần. Trạng thái đặt ở `tr.mech[id]`; phím X/G phải qua `rateOk` và kiểm kiếp ở server.
- **Room riêng**: `room: "tribulation"` trong dữ liệu kiếp. Level `do_kiep` (địa hình dùng chung bồn Kiếm Trủng, `LevelDef.tribulation`), room `tribulation` (`ROOM_TRIBULATION`), `defineRoom().filterBy(['tribRoom'])` để mỗi lần độ kiếp một phòng; tối đa 5 người. Room thế giới chỉ kiểm điều kiện (bình cảnh, đủ tu vi, vật phẩm, không chết/niệm/tỉ thí) rồi cấp vé `{key, id}` cho người độ kiếp và vé `{key}` cho đồng đội tổ đội trong tầm `guard.r` (hộ pháp). Một mình vẫn độ được. Vật phẩm đột phá bị tiêu khi tới sân (không phải lúc rời); thiếu vật phẩm hoặc không ai bắt đầu sau 25 s thì đưa mọi người về. Kiếp bắt đầu 3,5 s sau khi người độ kiếp tới (cho client dựng cảnh). Xong (thành công, chết, rời) thì nán 6 s rồi cấp vé về `returnLevel` tại `returnSpawn` (người chết hồi sinh ở sân trước); ngắt kết nối giữa kiếp = thất bại im lặng (mất 15% tu vi, không hoàn), đăng nhập lại được dẫn về `returnLevel`.
- **Cờ `enabled`**: `ket_dan`, `nguyen_anh`, `hoa_than` đang `false` và `item: null` (chưa có vật phẩm đột phá; `peakGated` ở `shared/realm.ts` vẫn chặn bình cảnh Trúc Cơ 19/Kết Đan 23/Nguyên Anh 27). E2-D/E3/E4 thêm vật phẩm, bật cờ, bỏ `peakGated`. Thử ngay bằng `/gm trib ket_dan|nguyen_anh|hoa_than`.
- **Còn lại**: cơ chế riêng (ghi ở trên), VFX hỏa/ngũ hành, cân bằng số liệu bản đầu (đặc biệt số bóng tâm ma Kết Đan: đang 3 con mỗi 7 s tối đa 6), `?tribulation=<id>`, cảnh điện ảnh riêng cho NA/HT (thẻ chương dùng chung `trib`/`ascend`).

### 10.6 Ghi chú triển khai E2-D (2026-11-16)

- **Đan Hỏa Kiếp bật cho người chơi**: `ket_dan.enabled = true`, `item = itm_ket_dan_dich`. `peakGated` (shared/realm.ts) nay theo cờ `enabled` của kiếp: bình cảnh Trúc Cơ 19 mở; Kết Đan 23 và Nguyên Anh 27 vẫn chặn (E3/E4 bật cờ là tự bỏ chặn). `content:check` kiểm kiếp đã bật phải có vật phẩm tồn tại và có công thức chế.
- **Cơ chế `dan_tran`** (`tribmech.ts`, thông số ở `danTran` của pha trong `tribulations.json`): vòng r 4 m đặt ở chỗ người độ kiếp đứng lúc pha Ngưng đan bắt đầu; thanh ngưng đan 0→100 trong 14 s (E2-J, trước 20 s) khi **đứng yên trong vòng** (đả tọa không dùng được trong kiếp nên "đứng yên" = tốc độ ≤ 1,2 m/s, chưa bay), ra khỏi vòng tụt 3%/s, đi lại trong vòng giữ nguyên; cứ 5,5 s một vạch sét 18×3 m (báo 0,9 s, 22% khí huyết; E2-J, trước 4,5 s / 26%) đi qua vòng với tâm lệch ngẫu nhiên. Hết pha 2 mà thanh < 100 thì kiếp thất bại (mất 15% tu vi, hoàn Kết Đan Dịch vì đã trụ quá `refundAfter`). Bóng tâm ma 3 con/7 s (tối đa 6) lấy từ `shadows` chung. Hộ pháp chỉ chắn tia khóa mệnh pha 3 (luật `shareToGuards`, chỉ đồng đội cùng tổ đội, giữ nguyên từ #128); vạch quét pha 2 chưa chia cho hộ pháp, hộ pháp giúp bằng cách diệt tâm ma.
- **Vật phẩm**: `itm_ket_dan_dich` (Kết Đan Dịch) chế ở Tố Tâm (`rcp_ket_dan_dich`: 3 Ngưng Đan Mạch Tinh + 10 Yêu Đan + 6 Linh Thảo, 1500 linh thạch, cấp 19), rơi 12% từ Địa Mạch Long; nguyên liệu `itm_ngung_dan_mach_tinh` rơi từ 3 tinh anh Đoạn Mạch (35%) và Địa Mạch Long (2–3). Icon chưa vẽ (dùng emoji dự phòng). Chế đi qua đường craft có sẵn (tx + idem + ledger); tiêu khi bắt đầu kiếp và hoàn qua `tribulation:refund`.
- **Nhiệm vụ `q2_ket_dan`**: giao và trả ở Lạc Vân (`npc_chuong_mon`, tạm: NPC Khưu Hàn Sơn thuộc E2-H), cần `q_truc_co`, cấp 19, mục tiêu `breakthrough`; thưởng 3000 linh thạch + 5 Tụ Khí Đan (Huyền Thiết Đan Y bậc 3 chờ E2-F). Chưa nối vào chuỗi `q2_*` (E2-H).
- **Client**: `FxMsg` `dantran` (vòng + tiến độ `pg`, -1 = khép) và `dantran_ok`; HUD thêm thanh "Ngưng đan"; cắt cảnh nhìn xuống vòng (`DAN_CUTSCENE`, `danTranPath`, giữ HUD, bỏ qua được); thiên lôi pha 3 nhuốm lửa (`TribPhaseDef.hot` → `HazardMsg.hot`, cam dưới trần HDR); `ascend` mang `tb` nên Kết Đan có vành đan quang vàng + thẻ `ascend_kd`; thẻ `ch2` (Chương 2 · Đoạn Mạch) lần đầu tới Đoạn Mạch. Ảnh: `docs/e2d-trib/` (`pnpm shots:e2d --out <thư mục tuyệt đối>`).
- **Còn lại**: cân bằng số đã xong ở E2-J (sweep 22% mỗi 5,5 s, 14 s ngưng đan; xem `docs/e2j-balance.md`); icon hai vật phẩm; nối nhiệm vụ vào chuỗi E2-H.

### 10.8 Ghi chú triển khai E4-D/E4-L (2026-11-18)

- **Thiên Nhân Kiếp bật**: `hoa_than` `enabled: true`, `item: itm_hoa_than_lo` (Hóa Thần Lộ: chế ở Tố Tâm, rơi hiếm 1% ở Thần Tàng Điện); `peakGated` không còn chặn cấp nào. Cơ chế `ngu_hanh` (năm trận môn, tia kiếp xoay hành, cờ `ke` qua `Hazard.seal`) và `phan_than` (phím G, thế thân, tia quét, cột thiên phạt, mạch nối, chắn 40% tia lớn) ở `apps/server/src/game/tribnhan.ts`. Thế thân chỉ là móc của kiếp (`C.TRIB_CLONE`); phân thân thần niệm thật là E4-K (xong: `docs/e4-k/README.md`). Chi tiết, số, giới hạn: `docs/e4-d/README.md`.

---

## 11. Gói việc cho worker

Mỗi gói ghi vùng code. Các gói cùng một mã chạy song song nếu vùng code không chồng (cột "Song song"). Kích thước: S ≈ nửa ngày, M ≈ 1–2 ngày, L ≈ 3–4 ngày công của một worker.


### 10.7 Ghi chú triển khai E3-L (2026-11-16)

- **Kiếp bật**: `nguyen_anh` `enabled: true`, `item: itm_nguyen_anh_dan` (chế ở Tố Tâm: 3 `itm_ngung_anh_phach` + 4 `itm_ngung_dan_mach_tinh` + 12 yêu đan + 5000 linh thạch, cấp 23; phách rơi từ 3 boss và 3 tinh anh Đoạn Mạch, các bản đồ E3-M/N thêm nguồn rơi vào `loot.json`). `peakGated`: Kết Đan 23 đã mở, Nguyên Anh 27 vẫn chặn. Nhiệm vụ `q3_nguyen_anh` (giao Khưu Hàn Sơn, chỉ mục tiêu `breakthrough nguyen_anh`; E3-H nối vào chuỗi chương 3). Icon hai vật phẩm mới đang dùng emoji dự phòng (`icons:check`: 142/144).
- **Room riêng, vé, hộ pháp**: không đổi so với E1-F. Room thế giới chỉ kiểm điều kiện và cấp vé, `TribulationRoom.onAuth` kiểm vé một lần (khóa `tribRoom`), vật phẩm tiêu khi tới sân, hộ pháp chỉ nhận đồng đội cùng tổ đội trong 20 m (#128).
- **`tia_xich`** (pha 1, `tiaXich` trong dữ liệu): mỗi 3,4 s (co dần còn 70%) hai tia tròn 3,2 m rơi ở hai đầu vạch sét 16×2,6 m đi qua chỗ người độ kiếp đứng (lệch ngang ngẫu nhiên), báo 1,3 s; vạch cùng nhóm `grp` nên đứng trong vạch chỉ trúng một lần.
- **`xuat_khieu`** (pha 2, `xuatKhieu {dur 6, cd 20}`): **móc tạm cho E3-K**. Lệnh riêng `C.TRIB_SOUL` (`tsoul`) → `GameSim.onTribSoul` → `TribSystem.soul` → `soulOut` (kiểm đúng pha, còn hồi chiêu). Trong 6 s thân đứng yên (`stepMove frozen`), ô lửa nặng nhất của đợt kế bị đẩy sang ô kề; fx `xuatkhieu`/`xuatkhieu_end`, client vẽ bóng nguyên anh (`Vfx.soulOut`), phím X chỉ gửi ý định khi đang ở Tam Trọng Kiếp. Khi E3-K (nguyên anh xuất khiếu thật, phím X chung) vào main: `git merge origin/main`, nối phím/thực thể thật vào `soulOut` (luật kiếp giữ nguyên), bỏ `C.TRIB_SOUL` nếu không cần.
- **`tam_canh`** (pha 3, `tamCanh`): Tâm Ma Ảnh cấp +2 (một con, máu bằng khí huyết người độ kiếp) mỗi 4 s dùng một trong hai chiêu của người chơi (`tamMaSkills`: chiêu đặc trưng công pháp nếu là chiêu sát thương + một chiêu chung đã mở; chiêu diện rộng thành vòng tại chỗ người độ kiếp, chiêu đơn thành vạch 3 m từ bóng; báo 1,1 s, sát thương theo công của bóng). Tâm cảnh 0..100: bị bóng đánh trúng −5, đánh trúng bóng +1,5, về 0 thì thất bại (`sys.tam_canh_fail`); hạ được bóng thì kiếp thành ngay, kéo tới 65 s cũng thành. Hook ở `sim.damagePlayer`/`damageMonster` chỉ chạy khi `p.trib`. Cân bằng số liệu bản đầu: cần chơi thử (hai con số nên chỉnh trước tiên là `hurt` và `skillEvery`).
- **Client**: thanh tâm cảnh ở HUD (`ui.trib.tam_canh.label`), gợi ý X + đếm xuất khiếu, cắt cảnh nhìn xuống lúc tâm ma hiện (dùng lại `DAN_CUTSCENE`, màu tím trầm), `ascendGlow` bản Nguyên Anh (lam tím nhạt, mảnh), thẻ chương `ascend_na` (cấp 24). `pnpm shots:e3l`; ảnh: `docs/e3l-trib/`.
### 11.1 E-1 Nền kỹ thuật

| Gói | Nội dung | Vùng code | Kích | Song song |
| --- | --- | --- | --- | --- |
| **E1-A** | `LevelDef` + `terrainOf(levelId)`; chuyển `heightAt`, `stepMove`, `zones`, `props` sang level (Vân Lam giữ hành vi bit-for-bit; test `shared.test.ts`, `zones.test.ts` không đổi) | `packages/shared/src/{level,terrain,movement,zones,props}.ts`, `packages/content/src/{check,mapreport}.ts` | L | Không |
| **E1-B** | Room theo level, `transfer` + vé `toLevel`, tham số hóa các điểm kiểm `van_lam` trong `sim.ts`, Truyền Tống liên level, migration DB | `apps/server/src/{rooms,index,db}.ts`, `game/{sim,teleport}.ts`, `packages/shared/src/{protocol,teleport}.ts`, `testflags.ts` | L | Sau A |
| **E1-C** | Thang cảnh giới 28 cấp, `xpNeed`, `playerBaseStats`, `MONSTER_REALM_MUL`, bình cảnh, migration tu vi người đang ở Trúc Cơ, `sim:progress` 28 cấp | `packages/shared/src/{formulas,realm}.ts`, `packages/content/data/realms.json`, `i18n`, `apps/server/src/game/realm.ts`, `packages/content/src/sim.ts` | M | Song song A |
| **E1-D** | Client nhiều level: `Game.enterLevel`, giải phóng bản đồ cũ, preload theo level, ground textures theo level, mood, nhạc theo level, UI bản đồ lớn và minimap theo level | `apps/client/src/game/{engine,terrain,preload,assets,groundTextures,mapVis}.ts`, `ui/worldmap/*`, `ui/minimap/*`, `tools/asset-pipeline/src/minimap.ts` | L | Sau A |
| **E1-E** | Nguyên tắc quái mở rộng: kiểu vùng `line`, `charge`, `leap`, `burrow`, `reflect`, `summon`, `reveal`; vạch báo client cho từng kiểu | `apps/server/src/game/sim.ts`, `packages/shared/src/{combat,boss,projectile}.ts`, `packages/content/data/monsters.json` schema, `check.ts`, client `render/vfx/*` | L | Song song A |
| **E1-F** | `tribulations.json` + khung pha; hợp nhất với S2-C | `apps/server/src/game/{sim,realm}.ts`, `packages/shared/src/formulas.ts`, `content/data/tribulations.json`, client `game/cutscene.ts`, `ui/` | M | Sau S2-C |
| **E1-G** | Công cụ: `--level` cho `map:report`, `minimap:build`, `shots`; `content:check` mọi level; mở rộng `fight:check`, `balance.test` | `tools/*`, `packages/content/src/*` | M | Song song |

E-1 ước tính ~6–8 ngày công, 3–4 worker đồng thời. Kết thúc E-1: chạy `bench:crowd` Vân Lam không đổi, bộ `security` pass, bot 100 người vẫn qua.

### 11.2 E-2 Kết Đan (cần xong E1-A…D)

| Gói | Nội dung | Vùng code | Kích |
| --- | --- | --- | --- |
| **E2-A** | Level Đoạn Mạch Cổ Cốc: `levels/doan_mach.json` (terrain, zones, camps 60 cụm, pois, places), `TELE_PADS`, i18n `zone.*`, glossary, `map:report` đạt (độ phủ ≤ 35 m, không kẹt), minimap | `packages/content/data/levels/*`, `packages/shared/src/teleport.ts`, `i18n`, `docs/e2-map/` | L |
| **E2-B** | Quái, tinh anh, boss ngoài trời Đoạn Mạch: `monsters.json`, `loot.json` (không `drops` trong `monsters.json`), model tạm, AI boss Địa Mạch Long | `packages/content/data/{monsters,loot}.json`, `apps/client/src/game/models.ts` (tạm), `sim.ts` hook boss | M |
| **E2-C** | Phục Mạch Quật: `levels/phuc_mach.json` (đợt), `DungeonRoom` theo dữ liệu, boss Thôn Mạch (chui đất, chant Thôn Mạch), Thạch Tâm Khôi Vương, thưởng + ledger | `apps/server/src/rooms.ts`, `sim.ts`, `content/data/levels`, client vạch báo, test `dungeon` | L |
| **E2-D** | Đan Hỏa Kiếp + vật phẩm Kết Đan Dịch + `q2_ket_dan`; thẻ chương, cắt cảnh, `ascend` Kết Đan | `sim.ts`, `tribulations.json`, client `cutscene.ts`, `deathFx`, `render/vfx/lightning.ts` | L |
| **E2-E** | Thần thức (`V`), ô chiêu 9, bản mệnh pháp bảo Ngưng Đan Lô (UI + server), cờ minimap | `apps/server/src/game/{sim,artifact}.ts`, `packages/content/data/artifacts.json`, `apps/client/src/game/{scan,artifactVis}.ts`, `ui/` | L |
| **E2-F** | Trang bị bậc 2, bộ 3 công pháp, Thăng Bậc, đan bậc 2, nguyên liệu, công thức ở Hứa lão và Tố Tâm | `packages/content/data/{equipment,items,recipes,alchemy,quests,npcs}.json`, `packages/shared/src/{upgrade,items,sets}.ts`, `apps/server/src/game/upgrade.ts`, UI `UpgradeTabs.tsx` | L |
| **E2-G** | Kỹ năng bậc 2–3 (Lạc Kiếm, Kim Thân, Đan Kinh): dữ liệu, pose K-5 (`gen-k5.mjs`), VFX K-6, biến thức | `packages/content/data/{skills,methods,poses}`, `tools/poses`, `apps/client/src/game/{skillFx,skillPose}.ts`, `render/vfx/phases.ts` | L |
| **E2-H** | Nhiệm vụ chương 2 (9 chính + 4 phụ), NPC (Tô Vãn Ngư, Hứa lão, Khưu Hàn Sơn), lời thoại, thẻ chương, loại mục tiêu `scan`/`escort`/`touch` | `quests.json`, `npcs.json`, `i18n`, `sim.ts` (`questEvent`), client dialog | L |
| **E2-I** | Mỹ thuật bản đồ 2: texture mặt đất (`terrain-textures.ts` thêm bộ ochre), mood, nhạc (`compose/doan_mach.mjs`…), cỏ/cây/đá, nhập asset người dùng khi có | `tools/asset-pipeline`, `tools/audio/compose`, `apps/client/src/{game,render}`, `assets/source/*/meta.json` | L |
| **E2-J** | Cân bằng chương 2: `sim:progress` 4 giờ ±12%, `fight:check` TTK, kinh tế, bot 100 người | `packages/content/src/sim.ts`, `apps/server/src/tools` | M |

E-2 ước tính ~16–20 ngày công; chạy được 5–6 worker song song. Người dùng chơi thử ở mốc: sau E2-A + E2-B (đi lại, đánh quái), sau E2-C + E2-D (phó bản, độ kiếp), cuối cùng cân bằng.

### 11.3 E-3 Nguyên Anh và E-4 Hóa Thần

Cùng cấu trúc gói A–J cho từng bản đồ. Khác biệt cần gói riêng:

| Gói | Nội dung | Vùng code | Kích |
| --- | --- | --- | --- |
| **E3-K** | Nguyên anh xuất khiếu (cơ chế tử vong và `X`), ngự không (cho phép bay không kiếm ≤ 30 m), thuấn di | `apps/server/src/game/sim.ts` (`onDeath`, chuyển động), `packages/shared/src/movement.ts`, client `character/` (pose bay, bóng anh) | L |
| **E3-L** | Tam Trọng Kiếp (room riêng `tribulation`, tổ đội vào cùng, ô lửa, tâm ma dùng chiêu người chơi) | `rooms.ts`, `sim.ts`, `tribulations.json`, client UI | L |
| **E3-M** | Kính Nguyệt Cung: bóng giả, phản chiếu, đĩa gương (VFX), Định Thần Phù | `rooms.ts`, `sim.ts`, `render/vfx/*` | L |
| **E3-N** | Vân Hải: sàn mây, đảo giả (ẩn bằng thần thức), cầu xích, rơi mây | `shared/terrain.ts` (`islands`), client `render/clouds.ts`, `game/terrain.ts` | L |
| **E4-K** | Phân thân thần niệm (thực thể phụ có chủ, danh sách chiêu), lĩnh vực lớn, ô chiêu 10 | `sim.ts`, `shared/skillrules.ts`, client `entities.ts` | L |
| **E4-L** | Thiên Nhân Kiếp: ngũ hành khắc chế (`DmgMsg.ke`), trận môn, phân thân chắn | `sim.ts`, `tribulations.json`, UI cờ khắc chế (PR C) | L |
| **E4-M** | Thần Tàng Điện: môn phong ấn bằng xuất khiếu, Phá Ấn Phù, ấn ngũ hành | `rooms.ts`, `sim.ts` | L |

E-3 ước tính ~20–24 ngày công; E-4 ~22–26 ngày công; mỗi bước kết thúc bằng một lượt người dùng chơi thử và E-5 cân bằng tổng sau cùng (mô phỏng NK1 → Hóa Thần ~21 giờ, `bench:crowd` 100 bot trên cả bốn bản đồ).

### 11.4 Thứ tự khuyến nghị

1. E-1 (A, C song song; E, G song song; rồi B, D; F sau S2-C).
2. E-2: A + B + J đầu tiên (đi và đánh) để bạn chơi thử sớm; asset người dùng nhập khi có.
3. E-3, E-4 tương tự, mỗi bước chờ chơi thử.
4. E-5 cân bằng tổng và hiệu năng cuối.

### 11.5 Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Đổi `xpNeed` cấp 16–18 làm lệch tiến độ người đang chơi | Migration tỉ lệ; thông báo; chỉ ảnh hưởng 3–4 người chơi bạn bè |
| Quái cấp 16+ không nhân `realmMul` → thời gian hạ quái sụp | Mục 2.3; `balance.test` kiểm 3,5–8,5 s mọi cấp |
| Phó bản 5 người chịu tải server | Mỗi room riêng; `bench:crowd` có bí cảnh; giới hạn tối đa phó bản đồng thời (cấu hình) |
| Asset do người dùng dựng chậm | Chương chạy bằng model tạm; E2-I chỉ nhập khi có GLB |
| Vân Hải (đảo, chiều dọc) làm AOI/camera/va chạm phức tạp | E3-N nằm trong E-3, không ở E-1; sàn mây cho phép đi bộ; rơi không chết |
| Độ kiếp trùng việc với S2-C | E1-F chờ S2-C; không viết hai khung |

---

## 12. Quy ước nội dung cần bám

- Chuỗi hiển thị đi qua i18n key (`packages/content/data/i18n/`), không viết cứng tiếng Việt trong component.
- Tên cảnh giới, vật phẩm, địa danh lấy từ `glossary.json`; thêm tên mới ở mục 13 trước.
- `monsters.json` vào bundle client: không chứa `drops`/`gold` (đã có `no-server-data.test.ts`); rơi đồ ở `loot.json`.
- Mọi thay đổi vật phẩm/tiền: một transaction, idempotency key, ghi `ledger`.
- Logic chung chỉ ở `packages/shared`.
- Server quyết định mọi thứ: client chỉ gửi ý định; phân thân, xuất khiếu, thần thức, vạch báo đều do server giữ trạng thái.

---

## 13. Đề xuất thêm vào glossary (†)

| Nhóm | Tên mới |
| --- | --- |
| Bản đồ | Đoạn Mạch Cổ Cốc · Vân Hải Phù Đảo · Thiên Khuyết Cổ Thành |
| Phó bản | Phục Mạch Quật · Kính Nguyệt Cung · Thần Tàng Điện |
| Vùng | Hạ Khuyết Trạm · Sa Thạch Pha · Khô Hà Đạo · Hoang Sa Huyệt · Cựu Mỏ Khu · Đoạn Mạch Tuyệt Bích · Phù Đảo Các · Tùng Đài Đảo · Thạch Quy Đảo · Kính Hồ Đảo · Lôi Vân Đảo · Kình Ngư Đài · Ngoại Thành Trạm · Đại Lộ Đèn Trời · Lâm Sao Viên · Binh Khí Khố · Điện Tiền Quảng Trường · Mộ Đạo · Thiên Mạch Đài |
| Phe và nơi | Tàng Mạch Hội · Cựu Thiên Điện · Linh Thoái (kỳ) · mạch ảnh |
| Nhân vật | Tô Vãn Ngư · Hứa lão · Khưu Hàn Sơn · Lâm Chiếu Dung · Kính Nguyệt Chân Quân · Mặc Chiếu · Huyền Cơ · Vô Diện Thần Quân |
| Quái | Thạch Giáp Tê · Khai Mạch Khôi Lỗi · Ngô Công Ấu · Mạch Thương Hộ Vệ · Liệt Cốt Báo Vương · Hộ Mạch Khôi Tướng · Xích Sa Ngô Công · Vân Hạc · Kính Linh · Phù Đảo Thạch Quy · Bích Ngọc Kim Thiền · Tuyết Vũ Vân Hạc Vương · Kính Diện Ma Quân · Lôi Vân Sư Vương · Thạch Tượng Võ Sĩ · Dạ Minh Lộc · Cốt Vệ Kiếm Thủ · Cổ Thành Chiến Ma · Thạch Tượng Đại Tướng · Dạ Minh Lộc Vương · Cốt Kiếm Thống Lĩnh |
| Boss | Địa Mạch Long · Vân Hải Kình Vương · Thiên Khuyết Thủ Linh · Thôn Mạch Ngô Công Vương · Thạch Tâm Khôi Vương |
| Trang bị | Liệt Mạch Kiếm · Kính Quang Kiếm · Tinh Khuyết Kiếm · Mạch Văn/Kính Vân/Tinh Khuyết Đạo Bào · Sa Thạch/Lưu Ly/Cổ Thành Hộ Uyển · Khô Hà/Phù/Dạ Hành Vân Ngoa · Ngân Mạch/Ngân Hà/Tinh Văn Đai Lưng · Mạch Tinh/Kính Tâm/Thần Tàng Ngọc Bội · Hoàng Sa/Lưu Quang/Thủ Linh Giới Chỉ |
| Bộ | Liệt Mạch Kiếm Y · Địa Long Hộ Giáp · Phục Mạch Đan Bào · Kính Quang Kiếm Y · Vân Kình Thiết Giáp · Lưu Ly Đan Y · Tinh Khuyết Kiếm Bào · Cổ Thành Huyền Giáp · Thần Tàng Đan Bào |
| Pháp bảo | Ngưng Đan Lô · Anh Ngọc Kính · Thần Niệm Châu |
| Đan, vật phẩm | Kết Đan Dịch · Dưỡng Anh Đan · Hóa Thần Lộ · Hồi Mạch Đan · Thanh Tâm Đan · Thiên Lôi Hộ Đan · Phá Ấn Phù · Định Thần Phù · Mạch Tinh Phiến · Hoàng Sa Thảo · Ngưng Đan Mạch Tinh · Kính Hoa Sa · Vân Hải Lộ · Bích Ngọc Nhi · Tinh Quang Mặc · Thần Tàng Ngọc · Cổ Thành Phiến |
| Kiếp, cơ chế | Đan Hỏa Kiếp · Tam Trọng Kiếp · Thiên Nhân Kiếp · Đan Trận · thần thức · nguyên anh xuất khiếu · ngự không · thuấn di · phân thân thần niệm · lĩnh vực · trận môn · tâm cảnh · hộ pháp (độ kiếp) |
| Chiêu (mục 8) | Hoành Kiếm Phá Mạch · Kiếm Vũ Tam Điệp · Kiếm Đan Bản Mệnh · Nghịch Kiếm Chuyển Phong · Phân Anh Kiếm Ảnh · Thuấn Di Trảm · Thiên Kiếm Hóa Hình · Thiết Quyền Chấn Địa · Kim Chung Trấn · Sơn Nhạc Hóa Thân · Dịch Sơn Xung · Anh Thiết Thân · Thuấn Di Hộ Thế · Thiên Kim Pháp Tướng · Mộc Linh Trận · Dược Vũ · Ngưng Đan Hộ Thế · Đan Hỏa Phong Tràn · Anh Dược Hóa Thân · Thuấn Di Cứu Viện · Thiên Đan Pháp Giới |

---

## 14. Tự soát lore (theo `.claude/agents/lore-keeper.md`, 2026-11-16)

Phiên làm việc này không gọi subagent; **chưa có lượt soát độc lập** — cần chạy `lore-keeper` trước khi chuỗi nào ở mục 1 và 13 vào i18n.

| Mục soát | Kết quả |
| --- | --- |
| Thuật ngữ | Dùng đúng glossary: tu vi, khí huyết, linh lực, linh thạch, đả tọa, ngự kiếm, đột phá, độ kiếp, bình cảnh, tâm ma, linh căn, ngũ hành, Phàm/Linh/Huyền/Địa/Thiên phẩm. "Hộ pháp" là tên công pháp (Bất Động Kim Thân) và nay thêm nghĩa "người bảo vệ khi độ kiếp": phân biệt bằng "hộ pháp (độ kiếp)" trong glossary. Không dùng "chân nguyên" |
| Thang cảnh giới | Theo glossary (Kết Đan, Nguyên Anh, Hóa Thần), tiểu cảnh giới theo `glossary.stages`; Ngưng Khí giữ tên "tầng" |
| Bản quyền | Tên nhân vật, phe, địa danh, chiêu, vật phẩm đều đặt mới. "Nguyên anh xuất khiếu", "thuấn di", "thần thức", "hóa thần" là từ chung của thể loại tu tiên; không có nhân vật, tông môn, địa danh, công pháp nào của truyện có sẵn. Cốt truyện "mạch bị cắt, hút mạch giữ người chết" là thiết kế gốc của dự án |
| Giọng văn | Câu ngắn, cụ thể, cổ phong vừa phải, xưng "ngươi"; không dùng dấu gạch dài kiểu lời dẫn; tên chiêu không xuất hiện trong lời thoại |
| Nhất quán | Cùng thế giới Huyền Linh Giới, linh khí suy tàn, Lạc Vân chân nhân, Tố Tâm, Thiết lão; Hứa lão thay Thiết lão ở trạm xa (không mâu thuẫn); phó bản dùng cơ chế vé như Kiếm Trủng; Hàn Giao chết trước chương 2 (khớp `q_han_giao`) |

---

## 15. Quyết định (đã chốt)

Người dùng đã chốt ngày 2026-11-16:

| # | Quyết định | Trạng thái |
| --- | --- | --- |
| 1 | Bản đồ N = chặng tới cảnh giới N, kết thúc bằng độ kiếp vào cảnh giới N (chương 2 → Kết Đan, 3 → Nguyên Anh, 4 → Hóa Thần) | **Đã chốt** |
| 2 | Thang cấp mới: Trúc Cơ đại viên mãn (cấp 19), Kết Đan 20–23, Nguyên Anh 24–27, Hóa Thần sơ kỳ 28 (trần tạm); đổi `xpNeed` cấp 16–18 kèm migration giữ tiến độ người đang ở Trúc Cơ (Trúc Cơ dài ~2,5 giờ → 4,0 giờ) | **Đã chốt** |
| 3 | Độ kiếp Nguyên Anh và Hóa Thần ở room riêng, tổ đội vào cùng; một mình vẫn qua được (Kết Đan ở world room) | **Đã chốt** |
| 4 | Cơ chế đặc trưng Hóa Thần là **phân thân thần niệm** (lĩnh vực mượn thế để chương Anh Biến) | **Đã chốt** |
| 5 | Giữ mặc định: bản đồ ~2 km², mật độ 120 quái/km² | **Đã chốt (mặc định)** |
| 6 | Asset làm theo ưu tiên 1–4 trước (tinh anh, boss, quái, cỏ); prop môi trường, kiếm, bộ trang bị theo từng chương; **kiến trúc dựng bằng bpy**, Tripo chỉ nháp | **Đã chốt (mặc định)** |
| 7 | **Cỏ không dựng 3D trên Tripo**: worker làm thẻ cỏ alpha instanced (atlas, alpha cutout, `game/grass.ts`) từ ảnh concept; người dùng chỉ dựng trên Tripo mục không phải cỏ, bằng image-to-3D với PNG gốc (dán prompt làm mô tả phụ nếu giao diện có ô) | **Đã chốt** |

Những điều không cần quyết: tên chiêu, tên vật phẩm, tên NPC (đề xuất ở trên, `lore-keeper` soát sau).
