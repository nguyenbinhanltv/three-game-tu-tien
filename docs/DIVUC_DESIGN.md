# Thiết kế chương 5: Bắc Hoang Dị Vực (DV-0)

Bản 2 · 2026-11-18 (sau lượt soát lore độc lập) · nối tiếp `docs/EXPANSION_DESIGN.md` (chương 2–4), cùng khuôn mục. Đi kèm `docs/art-bible.md` (bảng màu, điều cấm) và `assets/LICENSES.md` (ghi công).

Đây là tài liệu **thiết kế**, không đổi code game. Mọi con số là điểm khởi đầu cho `pnpm sim:progress` và `fight:check`; mọi tên mới (đánh dấu †) phải vào `glossary.json` trước khi vào i18n (mục 13); lượt soát `lore-keeper` độc lập đã chạy và đã áp (mục 14.1). Mười hai quyết định ở mục 15 đã được người dùng **chốt ngày 2026-11-18** (tất cả theo đề xuất).

Nguồn quyết định (người dùng, 2026-11-18): hướng **A "Dị Vực xâm lấn"**: giữ bản sắc tiên hiệp; phương Tây chỉ xuất hiện như **thế lực từ giới khác** tràn vào Huyền Linh Giới; nối từ kết chương 4 ("mạch chảy trở lại nhưng về hướng bắc, nơi chưa ai đặt chân", `EXPANSION_DESIGN.md` mục 1.2). Asset lấy từ 17 model CC BY 4.0 trong `../dtl-asset-source/3d/skin/goc-online/` (mục 6.4); ba file **loại hẳn** dù trang tải ghi CC BY vì là nhân vật của hãng khác (điều cấm 10 của art bible): `jett_valorant…`, `kafka_honkai_star_rail…` (Riot/HoYoverse) và `butterfly_revamp` (không phải con bướm, xem mục 6.4).

---

## 0. Tóm tắt một trang

| | Chương 5 · Bắc Hoang Dị Vực |
| --- | --- |
| Chặng | Hóa Thần sơ kỳ → **Anh Biến sơ kỳ** (cấp 28 → 32) |
| Thời lượng mục tiêu | 10 giờ (nối nhịp 4 / 6 / 8) |
| Bản đồ | **Bắc Hoang Tẫn Nguyên**† (~2 km²): nửa nam là hoang nguyên tro lạnh của Huyền Linh Giới, nửa bắc đã bị dị vực nuốt, giữa là **Giới Khích**† (vết nứt giới) |
| Phó bản | **Xích Tẫn Khích**† (cấp 29+, 6 đợt, boss Tử Quang Dực Chủ) · **Kim Dạ Cung**† (cấp 31+, 6 đợt, boss Kim Dạ Ma Hậu) |
| Boss ngoài trời | **Tam Thủ Ngục Khuyển**† (chó ba đầu gác vết nứt) · **Thủ Khích Dực Chủ**† (kẻ giữ cửa bên kia) |
| Độ kiếp cuối chặng | **Nhật Thực Kiếp**† 90 s: thiên kiếp bị dị vực chen vào, Nhật Thực Dực Chủ giáng xuống giữa kiếp |
| Cơ chế mới | **Giới áp**† (linh lực hồi chậm trong đất dị vực, thắp Trấn Giới Bia để đẩy lùi) · **Tẫn ấn**† (dấu tro giảm hồi phục, gột bằng mạch) |
| Phe mới | **Tẫn Giới**† (giới đã cháy hết nguồn sáng): **Đọa Dực**† (kẻ có cánh, chủ mưu) và **Tẫn chủng**† (ma thú, binh lính) |
| Câu chuyện | Mạch chảy về bắc vì có thứ đang **hút** nó: một vết nứt sang giới khác mà Huyền Cơ đã lấy thân làm then cài. Trả mạch xong thì then lỏng. Người chơi đóng vết nứt, và một kẻ bên kia chọn ở lại |

**Nguyên tắc bản sắc** (trả lời "sao game tiên hiệp lại có chó ba đầu và thiên sứ"):

1. **Người kể là người Huyền Linh Giới.** Mọi tên hiển thị là tên Hán-Việt do tu sĩ bên này đặt cho thứ họ thấy (Tam Thủ Ngục Khuyển, Đọa Dực). Tên gốc của model (Gorethrax, Aetherion…) chỉ nằm trong ghi công.
2. **Dị vực là kẻ lạ, và phải trông lạ.** Giáp tấm, cánh, sừng, vàng dát là dấu hiệu "không thuộc giới này". Người chơi, NPC, kiến trúc, UI, chiêu thức, nhạc nền bên Huyền Linh **không đổi** một nét nào.
3. **Hai bảng màu không trộn.** Ngọc lam sương sớm bên này, tro than hồng và tím thực bên kia; chỗ gặp nhau là chỗ có chuyện (mục 4.2).
4. **Vẫn là chuyện linh mạch.** Dị vực không đến để "diệt thế" chung chung: giới của họ đã cạn nguồn sáng, họ đến **uống mạch**, đúng động cơ của mọi phe từ chương 1 (giành phần linh khí).

---

## 1. Nền truyện

### 1.1 Điều đã có (không đổi)

Chương 4 kết: người chơi mở phong ấn Thần Tàng Điện, trả mạch. Huyền Cơ nói một câu duy nhất: "Ta chờ lâu quá. Trả đi." Mạch chảy lại nhưng về **hướng bắc**. Người chơi vừa thành Hóa Thần sơ kỳ, có phân thân thần niệm và lĩnh vực lớn.

### 1.2 Điều mới: vì sao mạch chảy về bắc

Bắc Hoang là vùng đất chết ngoài bản đồ của mọi tông. Ở đó có **Giới Khích**: một vết rách sang giới khác, có từ trước kỳ Linh Thoái. Bên kia là **Tẫn Giới**, một giới từng sáng rực, nay nguồn sáng (họ gọi là "quang", tu sĩ bên này gọi là **nguyên quang**†) đã cháy hết. Kẻ sống sót bên đó tìm thấy vết nứt và thấy linh mạch: một nguồn mới để uống.

**Hình dạng Giới Khích** (một khe, không phải hai): khe chạy dài nam → bắc dọc trục giữa bản đồ, ~600 m. **Miệng nam** ở Khích Giai là chỗ khe hẹp nhất, nơi Tẫn chủng lọt sang và Tam Thủ Ngục Khuyển gác. **Gốc khe** ở Trấn Giới Đài (đầu bắc) là chỗ rộng nhất, thông hẳn sang Tẫn Giới, nơi Thủ Khích Dực Chủ đứng giữ. Đất hai bên nửa bắc của khe là phần đã bị dị vực nuốt. Đứng ở trạm nhìn lên thấy cả vệt sáng tím dọc trời.

**Ba tầng nguyên nhân của Linh Thoái**, gom lại cho rõ ai làm gì:

| Tầng | Ai | Làm gì | Vì sao |
| --- | --- | --- | --- |
| Gốc | Giới Khích (Tẫn Giới bên kia) | Hút linh mạch về bắc từ trước khi có tông môn nào | Giới bên kia cạn nguồn sáng |
| Giữa | Cựu Thiên Điện, Huyền Cơ | Huyền Cơ lấy thần niệm làm **then cài** khe; điện hút mạch về Cổ Thành để **nuôi cái then** | Then giữ khe khép; cái giá là mạch cả giới yếu đi đều đều: đó là Linh Thoái mà người đời tưởng trời định |
| Ngọn | Tàng Mạch Hội (chương 2) | Đào mạch tinh đem bán | Hệ quả, không phải nguyên nhân: mạch yếu thì các tông đói, đói thì đào |

Không tầng nào là "kẻ ác": khe chỉ là một vết thương, điện chọn cái hại nhỏ hơn, Hội chỉ muốn sống.

**Khớp với chương 4** (mở rộng, không phủ định). Chương 4 nói điện hút mạch "để giữ sống một Hóa Thần đã chết từ lâu": đó là cách **người đời sau của điện hiểu**, kể cả Mặc Chiếu. Sự thật là Huyền Cơ biết mình đã chết; thứ điện nuôi không phải mạng ông mà là phần thần niệm ông để lại làm then. Câu "Ta chờ lâu quá. Trả đi." chỉ có **một nghĩa**: trả mạch về cho giới, ông không muốn giới trả giá thêm vì mình. Ông không giao gánh cho ai. Lên bắc là việc người chơi tự chọn; Mặc Chiếu nói thẳng điều này một lần (mục 1.5).

**Mặc Chiếu đổi nhận thức thế nào**: khi phong ấn Thần Tàng Điện mở và tiếng Huyền Cơ vọng ra (cuối chương 4), tàn niệm Mặc Chiếu nghe cùng một câu ấy và hiểu chủ điện đã chết từ lâu. Việc cuối của hắn là khắc phần tàn niệm còn lại vào một tấm bia đá của điện (**bia tàn niệm**) và nhờ Tô Vãn Ngư mang theo lên bắc, để kể nốt điều điện đã giấu. Đó là tấm bia đặt ở Vọng Bắc Trạm.

Mạch được trả, then lỏng. Khe mở lại và **kéo** mạch về bắc. Ba nhịp của chương:

1. **Tro lạnh** (cấp 28–29): tới Bắc Hoang, thấy mạch ngọc lam chảy vào đất tro rồi tắt. Tẫn chủng (ma thú dị vực) đã qua miệng khe. Tam Thủ Ngục Khuyển gác miệng nam.
2. **Bên kia vết nứt** (cấp 29–31): nửa bắc bản đồ đã thành đất dị vực. Đọa Dực không phải một khối (mục 1.3): dòng **Kim Dạ** muốn dời cả triều sang giới mới; dòng **Tử** chỉ muốn uống cho đỡ khát rồi đốt nốt. Người chơi hạ Tử Quang Dực Chủ trong Xích Tẫn Khích; mạch gột phần cháy của nó, còn lại một kẻ tỉnh táo: **Tịnh Quang Dực Sứ**†. Nó quên tên, quên mình là ai, nhưng **vẫn nhớ đường và nhớ đói** (thân xác đã đi lối ấy cả trăm năm), nên dẫn được tới Kim Dạ Cung.
3. **Nhật thực** (cấp 31–32): hạ Ma Hậu, rồi hai việc khác nhau nối tiếp. **Năm Trấn Giới Bia** là neo: thắp đủ năm bia thì hai mép khe bị kéo khép lại, còn hở một khe chỉ ở gốc (`q5_ngu_bia`); bia không hàn được. **Thiên lôi** mới hàn kín: người chơi độ kiếp Anh Biến ngay tại gốc khe để mượn sét của trời hàn chỗ hở ấy (`q5_anh_bien`). **Nhật Thực Dực Chủ** (kẻ đứng đầu dòng Tử) giáng xuống giữa kiếp để giữ cửa. Tịnh Quang đứng hộ pháp.

Kết: khe khép hẳn, chỉ còn một vết sẹo sáng. Tịnh Quang ở lại bên này, không về được. Trước khi khe kín, bên kia còn một bóng nhìn sang (**Hư Uyên Dực Chủ**, không thuộc dòng nào, để dành chương 6). Lạc Vân chân nhân gửi thư cuối chương: mạch Vân Lam lần đầu "thở đều".

Móc cho chương sau: Tẫn Giới vì sao cháy; có giới nào khác cũng đang cạn.

### 1.3 Nhân vật và phe mới (tự sáng tác)

| Tên | Vai | Ở đâu | Giọng |
| --- | --- | --- | --- |
| **Tô Vãn Ngư** (đã có) | Mạch tuần sứ, lần theo mạch tới tận bắc; người dẫn đường chương 5 | Vọng Bắc Trạm | Như cũ: ngắn, khô |
| **Mặc Chiếu** (đã có, tàn niệm) | Kể phần Cựu Thiên Điện giấu: cái then, cái giá | Vọng Bắc Trạm (bia tàn niệm) | Trang trọng, cũ; lần này biết chủ điện đã chết |
| **Cố Bất Dịch**† | Tán tu Bắc Hoang, thợ săn Tẫn chủng, bán đồ và nâng cấp bậc 5 | Vọng Bắc Trạm | Cộc, hay đếm (số con, số ngày, số bạn đã chết) |
| **Tịnh Quang Dực Sứ**† | Tử Quang Dực Chủ sau khi được mạch gột; đồng minh từ giữa chương, hộ pháp ở kiếp cuối | Trấn Giới Đài, sau đó Giới Khích | Chậm, dùng chữ sai chỗ kiểu người mới học tiếng; không xưng danh cũ |
| **Kim Dạ Ma Hậu**† | Chủ một triều Đọa Dực, muốn dời dân sang; boss phó bản 2 | Kim Dạ Cung | Lịch sự, coi người chơi như sứ giả để mặc cả |
| **Tẫn Hỏa Kiếm Cơ**† | Kiếm thủ của Ma Hậu, đốt đường lui của chính quân mình | Kim Dạ Cung (mini-boss) | Không nói với người chơi; chỉ nói với Ma Hậu |
| **Tử Nhận Ma Tướng**† | Tướng của Tử Quang, giữ Xích Tẫn Khích | Xích Tẫn Khích (mini-boss) | Hô lệnh, một hai chữ |
| **Nhật Thực Dực Chủ**† | Kẻ đứng đầu dòng Tử; uống mạch lâu nhất nên mạnh nhất, và cũng cháy nhiều nhất: không còn lý do, chỉ còn đói | Gốc Giới Khích (kiếp cuối) | Không nói |
| **Thủ Khích Dực Chủ**† | Kẻ gác cửa phía bên kia, đối xứng với Huyền Cơ: cũng lấy thân giữ cửa, nhưng để giữ cho nó **mở** | Trấn Giới Đài, gốc khe (boss ngoài trời) | Một câu khi gục (mục 1.5) |

**Tẫn Giới** không có "ma vương". Hai dòng Đọa Dực, một bầy Tẫn chủng, không ai chỉ huy tất cả.

| Dòng | Muốn gì | Thủ lĩnh | Thuộc hạ có tên |
| --- | --- | --- | --- |
| **Dòng Tử** (lửa tím) | Uống cho đỡ khát rồi đốt nốt | Nhật Thực Dực Chủ (đứng đầu), Tử Quang Dực Chủ (kế) | Tử Nhận Ma Tướng |
| **Dòng Kim Dạ** (vàng dát) | Dời cả triều sang giới còn sáng | Kim Dạ Ma Hậu | Tẫn Hỏa Kiếm Cơ |
| Không thuộc dòng nào | Giữ cửa mở cho cả hai, không đứng về bên nào | Thủ Khích Dực Chủ | |
| Ngoài cuộc (chương 6) | Chưa rõ | Hư Uyên Dực Chủ | |

**Hệ chức danh** (dùng thống nhất, không đặt thêm kiểu khác): **Dực Chủ** = Đọa Dực đứng đầu một dòng hoặc giữ một việc lớn (có cánh); **Ma Hậu** = chủ một triều, ngang Dực Chủ; **Dực Sứ** = Đọa Dực không còn dòng (chỉ Tịnh Quang); **Ma Tướng**, **Kiếm Cơ** = tướng dưới quyền (không cánh); **Trọng Binh**, thú = Tẫn chủng. Giữ nguyên tắc `GAME_DESIGN_CORE.md` 2.2: không kẻ ác thuần túy; ai cũng đang đói.

### 1.4 Tuyến nhiệm vụ

Id `q5_*` (chính), `s5_*` (phụ). Chỉ dùng loại mục tiêu đã có (`kill`, `gather`, `talk`, `touch`, `scan`, `escort`, `dungeon`, `breakthrough`). Tu vi thưởng ≈ 14% tu vi chặng (~138.000).

| Id | Nội dung | Mục tiêu | Cấp |
| --- | --- | --- | --- |
| `q5_bac_hanh` | Thư Lạc Vân: mạch không về chỗ cũ. Theo Tô Vãn Ngư lên bắc | `talk` Tô Vãn Ngư (Vọng Bắc Trạm; nhận là mở trận `bh_tp_tram`) | 28 |
| `q5_tro_lanh` | Mạch chảy vào đất tro rồi tắt. Thứ ăn nó có sừng lửa | `kill` Liệt Hỏa Ma Ngưu ×14, `touch` Diệt Mạch Khẩu | 28 |
| `q5_then_cai` | Mặc Chiếu kể về cái then | `talk` Mặc Chiếu, `scan` ×3 dấu thần niệm của Huyền Cơ | 28 |
| `q5_cot_loc` | Dạ Minh Lộc của Thiên Khuyết theo mạch lên bắc, uống phải mạch đã nhiễm tro, hóa U Ảnh Cốt Lộc | `kill` U Ảnh Cốt Lộc ×16, `gather` Tẫn Giác ×8 | 29 |
| `q5_nguc_khuyen` | Con gác miệng nứt | `kill` Tam Thủ Ngục Khuyển | 29 |
| `q5_qua_khich` | Thắp Trấn Giới Bia đầu tiên bên kia vết nứt | `touch` Trấn Giới Bia ×2, `kill` Giác Kiếm Trọng Binh ×16 | 29 |
| `q5_xich_tan` | Vào Xích Tẫn Khích | `dungeon` Xích Tẫn Khích ×1 | 30 |
| `q5_tinh_quang` | Kẻ còn lại sau khi mạch gột; đưa nó về Trấn Giới Đài | `escort` Tịnh Quang Dực Sứ | 30 |
| `q5_thu_khich` | Kẻ giữ cửa cho nó mở | `kill` Thủ Khích Dực Chủ | 31 |
| `q5_kim_da` | Vào Kim Dạ Cung | `dungeon` Kim Dạ Cung ×1 | 31 |
| `q5_ngu_bia` | Thắp đủ năm bia, khép vết nứt lại còn một khe | `touch` Trấn Giới Bia ×5 (cả tổ đội), `kill` Huyết Giác Ma Tướng ×2 | 31 |
| `q5_anh_bien` | Mượn thiên lôi hàn khe | `breakthrough` | 31 viên mãn |

Phụ (4): `s5_dem_xac` (Cố Bất Dịch nhờ đếm 6 cái xác bạn săn, `touch`), `s5_cham_ba` (hạ Triền Bố Châm Bà, lấy lại thuốc bị cướp), `s5_buom_mach` (theo đàn bướm mạch tới ba mạch nhãn còn sống, `scan`; nối với sinh vật trang trí của DV-C), `s5_tieng_ben_kia` (dạy Tịnh Quang năm chữ: năm lần `talk` sau các mốc chính).

### 1.5 Mẫu lời thoại (soát giọng văn)

- Lạc Vân (thư): "Mạch đã trả. Nó không về. Nó đi lên bắc như nước tìm chỗ trũng. Đi xem chỗ trũng ấy là gì."
- Tô Vãn Ngư: "Đất này không lạnh vì gió. Sờ thử đi. Lạnh từ dưới lên."
- Mặc Chiếu: "Chủ điện không giữ mạng. Chủ điện giữ cửa. Ta giữ chủ điện mà không biết người đã đi từ lâu. Nay ngươi hỏi ai sai, ta không biết đáp."
- Mặc Chiếu (nói một lần về câu của Huyền Cơ): "Người bảo trả, là trả mạch. Người không bảo ngươi lên đây. Lên hay không, tự ngươi."
- Cố Bất Dịch: "Chó ba đầu. Ta đếm rồi, ba. Đầu giữa không ngủ."
- Kim Dạ Ma Hậu: "Giới các ngươi còn sáng. Chia một góc. Ta trả bằng thứ các ngươi chưa có tên."
- Thủ Khích Dực Chủ (khi gục): "Bên các ngươi cũng có một kẻ như ta."
- Tịnh Quang Dực Sứ: "Ta nhớ đói. Ta không nhớ tên. Ngươi gọi gì, ta nghe cái đó."

Không nhân vật dị vực nào nói tên chiêu, không dùng từ phương Tây phiên âm.

---

## 2. Thang cảnh giới sau Hóa Thần (đã chốt 2026-11-18)

### 2.1 Cấp

`glossary.realms` đã có sẵn thứ tự: … Hóa Thần → **Anh Biến** → Vấn Đỉnh. Hóa Thần hiện chỉ có sơ kỳ (cấp 28, trần tạm).

| Đại cảnh giới | Cấp | Tiểu cảnh giới | Trạng thái |
| --- | --- | --- | --- |
| Hóa Thần | 28–31 | sơ, trung, hậu kỳ, đại viên mãn | 28 đã có; 29–31 mới |
| Anh Biến | 32 | sơ kỳ (trần tạm mới) | Mới |

`MAX_LEVEL = 32`, thêm `ANH_BIEN_LEVEL = 32`, `realms.json` thêm cấp 29–32. Giữ đúng cách hiểu đã chốt ở chương 2–4: chương N kết thúc bằng độ kiếp vào cảnh giới kế.

### 2.2 Tu vi và nhịp giờ

Cùng công thức mục 2.2 của `EXPANSION_DESIGN.md` (thu nhập = 400 mục tiêu/giờ × `(12 + 7·L)` × 1,25 × 0,9), giờ/cấp Hóa Thần **2,5**:

| Cấp | Cảnh giới | Thu nhập (tu vi/giờ) | `xpNeed` đề xuất | Tích lũy |
| --- | --- | --- | --- | --- |
| 28 | Hóa Thần sơ kỳ | 93.600 | 234.000 | 234.000 |
| 29 | Hóa Thần trung kỳ | 96.750 | 242.000 | 476.000 |
| 30 | Hóa Thần hậu kỳ | 99.900 | 250.000 | 726.000 |
| 31 | Hóa Thần đại viên mãn | 103.050 | 257.500 | **983.500 (10,0 giờ)** |
| 32 | Anh Biến sơ kỳ | | 99.999.999 (trần) | |

Cấp 28 hiện là trần (`99.999.999`); đổi thành 234.000 không cần migration (chưa ai tích quá).

### 2.3 Chỉ số

`realmMul`: Hóa Thần 5,5 (đã có) · **Anh Biến 7,8** (đề xuất, giữ bước nhảy ~×1,42–1,56 như các bậc trước). `MONSTER_REALM_MUL` theo cùng bảng. Bình cảnh: 29 → 30 (tâm ma dùng **ba** chiêu) và viên mãn 31; Phá Cảnh Đan bậc 5.

### 2.4 Mở khóa

| Mốc | Cơ chế | Thay đổi trực quan |
| --- | --- | --- |
| Hóa Thần trung kỳ (29) | Phân thân thần niệm hồi 90 → 75 s | |
| Hóa Thần hậu kỳ (30) | **Thần niệm ấn**†: phân thân đứng trên Trấn Giới Bia thì bia sáng gấp đôi tầm (dùng trong bản đồ và kiếp) | Bóng thần niệm rõ hơn một bậc |
| Hóa Thần đại viên mãn (31) | Đủ điều kiện Nhật Thực Kiếp | |
| **Anh Biến sơ kỳ (32)** | **Anh thân**† (đã chốt, phím giữ nguyên `X`): nguyên anh xuất khiếu không còn chỉ thám thính, mà **đánh được** trong 12 s (dùng thanh chiêu của chủ ở 60% sát thương, thân xác đứng yên, nguyên anh chết thì chủ về thân còn 30% khí huyết; hồi 120 s) | Nguyên anh hiện rõ mặt người chơi, cỡ 60% thân |

Lý do chọn: dùng lại `SoulSystem` (E3-K) và thực thể phụ có chủ của phân thân (E4-K), không cần AI mới. Phương án "lĩnh vực mượn thế trời đất" (đã để dành ở `EXPANSION_DESIGN.md` 2.5) vẫn là lựa chọn thay thế, mục 15.

---

## 3. Nhật Thực Kiếp (Anh Biến) · 90 giây · room riêng `tribulation`, tổ đội 4

Khung `tribulations.json` + `tribmech.ts` như bốn kiếp trước; kiếp `anh_bien`, `enabled:false` tới khi làm.

**Nơi diễn ra**: room riêng `tribulation` như Nguyên Anh và Hóa Thần (không chạy ở room thế giới `world-bac_hoang`: kiếp có boss và năm bia, không được để người ngoài tổ đội chen vào hay bị quái bản đồ kéo tới). Nhưng **không dùng level `do_kiep` chung**: kiếp này cần bố cục cố định, nên thêm một level kiếp riêng **`do_kiep_bac_hoang`** (`LevelDef.tribulation`, `returnLevel: bac_hoang`): sân tròn dựng lại đỉnh Trấn Giới Đài, khe Giới Khích ở mép bắc, **năm Trấn Giới Bia ở vị trí cố định** (ngũ giác bán kính 16 m quanh tâm sân; tọa độ nằm trong pha 1 của `tribulations.json`, trường `steles`), mood `rift`. Việc kéo theo:

- `tribulations.json` thêm trường **`level`** cho từng kiếp (mặc định `do_kiep`; `anh_bien` ghi `do_kiep_bac_hoang`); `GameRoom.enterTribulationRoom` và `TribulationRoom` đọc level từ kiếp thay vì hằng số; `content:check` kiểm level tồn tại và có `tribulation`.
- Điều kiện bắt đầu: người độ kiếp đứng trong 12 m quanh tâm Trấn Giới Đài ở `bac_hoang` (về truyện: kiếp diễn ra ngay trên vết nứt); vé và hộ pháp như E1-F.
- **Bia trong kiếp là thực thể của room kiếp** (trạng thái "đầy 0..5/5" thuộc `TribSystem`, sinh khi kiếp bắt đầu, mất khi room đóng). Chúng **không dùng chung** trạng thái với năm bia 20 phút của room thế giới (mục 4.3): hai hệ khác id, khác vòng đời, khác tin nhắn (`FxMsg` của kiếp so với `S.STELES`). Thắp bia ngoài bản đồ không giúp gì trong kiếp, và ngược lại.

| Pha | Giây | Cơ chế | Móc `mechanic` |
| --- | --- | --- | --- |
| 1. Lôi hàn khe | 0–25 | Thiên lôi nhắm người độ kiếp; **mỗi tia rơi trong 4 m quanh một Trấn Giới Bia thì bia đầy thêm 1/5**. Người chơi phải **dẫn sét** tới đủ năm bia (đứng cạnh bia lúc tia rơi, rồi né) | `dan_loi` (mới) |
| 2. Nhật thực | 25–65 | Trời tối tím: **Nhật Thực Dực Chủ** giáng xuống (thực thể boss thật, 35% máu boss ngoài trời). Hắn dập bia (mỗi 9 s nhắm bia sáng nhất, niệm 2,5 s, phá chú được). Thiên lôi vẫn rơi và **đánh cả hắn**: kéo hắn vào chỗ tia rơi thì hắn mất thế. Tịnh Quang đỡ thay một đòn mỗi 20 s | `nhat_thuc` (mới), dùng `posture` sẵn có |
| 3. Hàn | 65–90 | Còn ≥ 3 bia sáng thì tia cuối đánh vào khe (không vào người): người chơi chỉ cần sống. Dưới 3 bia thì tia cuối 11 m, 75% khí huyết như Thiên Nhân Kiếp; hộ pháp và phân thân chắn như cũ | dùng lại `final` |

Thành công: Anh Biến sơ kỳ (cấp 32), khe khép, thẻ chương `ascend_ab`, kết chương 5. Thất bại: như các kiếp trước (mất 15% tu vi cấp, hoàn vật phẩm nếu qua pha 2). Vật phẩm: **Anh Biến Lộ**† (chế ở Tố Tâm; nguyên liệu rơi từ hai boss phó bản).

Một mình vẫn qua được: ba bia là đủ, Tịnh Quang luôn có mặt. Việc cho `netcode-reviewer`: trạng thái bia của kiếp và boss kiếp chỉ server (room kiếp) giữ; tia "đánh cả boss" đi qua `Hazard` như mọi vùng nổ.

---

## 4. Bản đồ: Bắc Hoang Tẫn Nguyên†

Quy ước chung như `EXPANSION_DESIGN.md` mục 4: một `LevelDef` (`levels/bac_hoang.json` + `.terrain.json` + `.assets.json`), room `world-bac_hoang`, hộp chơi 1,5 × 1,4 km, 100–140 quái/km², cụm 3–4 con, sinh bằng `tools/maps/gen-bac-hoang.mjs` như ba bản đồ trước. Tọa độ là offset (m) so với trạm; +x đông, +z nam. **Bắc là −z**: người chơi đi từ nam lên bắc, đúng hướng mạch.

### 4.1 Vùng

| Vùng | Vị trí (m) | Cấp | Quái thường | Tinh anh | POI | Nhạc |
| --- | --- | --- | --- | --- | --- | --- |
| **Vọng Bắc Trạm**† (trạm, an toàn) | (0, +520) | | | | Truyền Tống, Tô Vãn Ngư, Cố Bất Dịch, bia tàn niệm Mặc Chiếu, lò đan | `sect_night` họ hàng |
| **Hàn Hôi Nguyên**† (đồng tro, bên này) | (+300, +260), r 210 | 28 | Liệt Hỏa Ma Ngưu | Hôi Giác Cự Thú ×2 | **Diệt Mạch Khẩu**† (chỗ mạch ngọc lam chui xuống tro rồi tắt) | `wild_ash` (mới) |
| **Khô Lộc Lâm**† (rừng chết, bên này) | (−320, +220), r 200 | 28–29 | U Ảnh Cốt Lộc, Liệt Hỏa Ma Ngưu | Triền Bố Châm Bà ×2 | **Tàn Mạch Nhãn**† (ba mắt mạch còn sống, có bướm mạch) | `wild_ash` |
| **Khích Giai**† (thềm miệng nam của khe) | (0, −40), r 180 | 29 | U Ảnh Cốt Lộc, Giác Kiếm Trọng Binh | Hôi Giác Cự Thú ×1, Huyết Giác Ma Tướng ×1 | **miệng nam Giới Khích** (khe chạy từ đây lên Trấn Giới Đài, vệt sáng tím dọc trời thấy từ trạm); **Tam Thủ Ngục Khuyển** ở (0, −90) | `boss_nguc_khuyen` |
| **Xích Tẫn Bình**† (bên kia, đồng than hồng) | (+340, −330), r 210 | 29–30 | Giác Kiếm Trọng Binh, Liệt Hỏa Ma Ngưu | Huyết Giác Ma Tướng ×2 | Cổng **Xích Tẫn Khích** (phó bản 1); Trấn Giới Bia 1, 2; trận `bh_tp_xich_tan` | `wild_rift` (mới) |
| **Kim Dạ Ngoại Uyển**† (bên kia, vườn vàng chết) | (−340, −340), r 210 | 30–31 | Giác Kiếm Trọng Binh, U Ảnh Cốt Lộc | Triền Bố Châm Bà ×1, Xích Tẫn Cự Khôi ×2 | Cổng **Kim Dạ Cung** (phó bản 2); Trấn Giới Bia 3, 4; trận `bh_tp_kim_da` | `wild_rift` |
| **Trấn Giới Đài**† (đỉnh bắc, **gốc Giới Khích**) | (0, −600), r 170 | 31 | Giác Kiếm Trọng Binh | Huyết Giác Ma Tướng ×1, Xích Tẫn Cự Khôi ×1 | Trấn Giới Bia 5; **Thủ Khích Dực Chủ** ở (0, −650); tâm đài là **chỗ bắt đầu** Nhật Thực Kiếp (kiếp chạy ở level riêng `do_kiep_bac_hoang`, mục 3) | `boss_thu_khich` |

Cụm: 11 / 11 / 9 / 12 / 12 / 8, vùng nối 5 = 68 cụm ≈ 250 quái thường; 13 tinh anh; 2 boss ngoài trời.

### 4.2 Bảng màu dị vực (tách khỏi tông sương sớm)

Art bible giữ nguyên cho Huyền Linh Giới. Chương 5 thêm **một bảng phụ 8 màu** (`assets/palette.json`, nhóm mới "Dị vực", id `rift_*`) và hai mood. Hai bảng **không dùng chung trên một vật**.

| id | Hex | Tên | Dùng cho |
| --- | --- | --- | --- |
| `rift_ash` | `#2A2426` | Tro than | đất, đá, giáp nền của dị vực; không đen tuyền |
| `rift_ash_light` | `#8C8580` | Tro bay | sương dị vực (thay `air_mist`), bụi, da Tẫn chủng |
| `rift_ember` | `#C4412B` | Than hồng | khe nứt trên da thú, lưỡi kiếm lửa, mắt; **phát sáng** |
| `rift_blood` | `#6E1F24` | Huyết sậm | vải, sừng, cờ của Tẫn chủng |
| `rift_violet` | `#6B3FA0` | Tím thực | cánh và hào quang Đọa Dực, bầu trời bên kia; **phát sáng** |
| `rift_violet_deep` | `#241634` | Dạ tím | trời bên kia vết nứt, bóng đổ dị vực (thay `air_night`) |
| `rift_gilt` | `#B8923A` | Kim dát | vàng của triều Kim Dạ: viền giáp, vương miện, cột cung |
| `rift_bone` | `#CFC6B4` | Xương | sừng, cốt giáp, băng vải |

Quy tắc:

- **Bên này (Hàn Hôi Nguyên, Khô Lộc Lâm, Vọng Bắc Trạm)**: vẫn bảng 32 màu, mood `ash_dawn`†: sương sớm nhưng hạ bão hòa lá, đất ngả tro, trời `air_sky` nhạt hơn. Vẫn nhận ra là Huyền Linh Giới.
- **Bên kia (ba vùng bắc)**: mood `rift`†: sương `rift_ash_light`, trời `rift_violet_deep`, nắng thay bằng ánh `rift_ember` thấp từ chân trời. Tỉ lệ 60/30/10 giữ nguyên: 60% tro, 30% huyết sậm + xương, 10% phát sáng (than hồng **hoặc** tím, mỗi vùng một màu chủ: Xích Tẫn Bình than hồng, Kim Dạ Ngoại Uyển kim dát + tím).
- **Chỗ gặp nhau là hình ảnh chủ đạo của chương**: mạch `spirit_jade` chảy trên đất và bị `rift_violet` ăn dần từ đầu bắc. Mỗi Trấn Giới Bia được thắp đẩy vòng ngọc lam ra 60 m (đổi màu đất bằng mặt nạ mặt đất theo level, cùng cơ chế `render/groundMask.ts`).
- Quy tắc "tím dưới 5% khung hình" của art bible 4.3 **chỉ nới ở ba vùng bên kia** (tới ~15%); bên này giữ nguyên. Người chơi, VFX chiêu, UI giữ màu cũ ở mọi nơi, nên nhân vật luôn nổi trên nền tro.
- Trần HDR `FX_MAX_HDR` 2,4 không đổi. `rift_ember`/`rift_violet` trên model là emissive vừa (≤ 1,6), không bloom cả thân.
- Bảng màu nguy hiểm VFX: thêm `mon_rift_ember`, `mon_rift_violet` vào `render/vfx/palette.ts` (cùng chỗ với `mon_<hệ>` của V5) để vạch báo dị vực khác màu vạch báo yêu thú.

**Điều cấm 12 của art bible** ("kiểu dáng phương Tây lạc tông: giáp tấm, quỷ cánh dơi, gô-tích…") cần một dòng ngoại lệ có phạm vi: *chỉ thực thể và kiến trúc của Tẫn Giới, chỉ ở level `bac_hoang` và hai phó bản của nó*. Đây là quyết định 3 ở mục 15; chưa sửa art bible trong PR này.

### 4.3 Cơ chế riêng

- **Giới áp**†: trong ba vùng bên kia, linh lực tự hồi −40%, đả tọa không hồi tu vi. Trong 60 m quanh một **Trấn Giới Bia**† đã thắp thì hết giới áp. Bia thắp bằng `touch` (niệm 4 s, bị đánh thì hủy), sáng 20 phút. Server: một hệ số theo vùng trong `sim.ts`, trạng thái bia theo room (không lưu DB).
- **Bia và Truyền Tống Trận là hai thứ tách nhau.**
  - **Trận `bh_tp_*`**: đúng mô hình ba bản đồ trước, **mỗi vùng một trận cố định** (7 trận: `bh_tp_tram` mở sẵn khi nhận `q5_bac_hanh`, `bh_tp_han_hoi`, `bh_tp_kho_loc`, `bh_tp_khich_giai`, `bh_tp_xich_tan`, `bh_tp_kim_da`, `bh_tp_tran_gioi`), bảng ở `packages/shared/src/teleport.bachoang.ts`. Mở khóa **vĩnh viễn theo nhân vật** khi chạm trong 4 m (`characters.tele`), **luôn dùng được** dù bia sáng hay tắt, giống hệt mọi trận khác. Không sửa `teleport.ts`.
  - **Bia** (5 cái, chỉ ở ba vùng bắc: Xích Tẫn Bình 2, Kim Dạ Ngoại Uyển 2, Trấn Giới Đài 1): chỉ là cơ chế giới áp. Trạng thái **theo room**, tức **theo kênh**: người ở kênh khác không thấy bia sáng, đổi kênh thì thấy trạng thái của kênh mới; room đóng thì mất. Chạm bia **không** mở khóa trận; mở khóa trận **không** cần thắp bia.
  - Ở ba vùng bắc, trận đặt cách bia gần nhất 12–18 m (trong vòng 60 m của bia): truyền tống tới lúc bia đang tắt thì người chơi đứng trong giới áp, việc đầu tiên là thắp bia. Ba vùng bên này (Hàn Hôi Nguyên, Khô Lộc Lâm, Khích Giai) không có bia vì không có giới áp, chỉ có trận.
  - Nhiệm vụ `touch` Trấn Giới Bia (`q5_qua_khich`, `q5_ngu_bia`) tính theo lần **người chơi tự thắp** (hoặc đứng trong tổ đội của người thắp, trong 20 m), không theo trạng thái bia của kênh, nên bia đang sáng sẵn do người khác thắp vẫn phải chạm lại để tính (chạm bia đang sáng: gia hạn về đủ 20 phút, niệm 4 s như thường).
- **Tẫn ấn**† ("ấn" ở đây là **dấu in của tro** trên người, một debuff; không liên quan phong ấn hay Phá Ấn Phù của chương 4; tooltip ghi "dấu tro"): đòn của Đọa Dực và tinh anh dị vực gắn dấu tro (tối đa 5 tầng, mỗi tầng −8% hồi phục nhận vào, 12 s). Gột bằng: đứng trong vòng bia, chiêu hồi của Đan sư (thêm hiệu ứng gột một tầng), hoặc **Tịnh Tẫn Đan**†. Dạy tổ đội cần người gột; chơi đơn thì bám bia.
- **Bay**: ngự kiếm/ngự không bình thường ở bên này; bên kia trần bay hạ còn 15 m (giới áp), để vách và cổng cung còn nghĩa.
- **Bướm mạch**† (trang trí, DV-C): đàn bướm chỉ đậu nơi mạch còn sống; ở Bắc Hoang chúng chỉ có quanh Tàn Mạch Nhãn và bia đã thắp. Là dấu chỉ đường không lời.

### 4.4 Đường đi, prop, cỏ

Truyền Tống từ Ngoại Thành Trạm (Thiên Khuyết) tới Vọng Bắc Trạm, mở khi nhận `q5_bac_hanh`. Kiến trúc trạm dựng bằng bpy như cũ (lán gỗ, cờ Lạc Kiếm Tông). Kiến trúc dị vực (cột gãy dát vàng, cổng vòm nhọn, bậc than) cũng **dựng thủ tục bằng bpy** theo bảng `rift_*`, không lấy từ asset ngoài. Cỏ: `prop_co_tro` (cỏ tro thưa, thẻ alpha) bên này; bên kia không cỏ, thay bằng tàn lửa trôi (hạt môi trường, `game/ambient.ts`).

---

## 5. Hai phó bản

Khung `DungeonDef` hiện có (`waves`, `lockAt`, `maxRevives` 2, `private`, `reward`, vé một lần). Thưởng: 15% tu vi chặng lần đầu mỗi ngày, mảnh bộ bậc 5, nguyên liệu Anh Biến Lộ.

### 5.1 Xích Tẫn Khích† (cấp 29+, 4–5 người, ~30 phút)

Khe nứt phụ cắm xuống đất: hành lang than hồng dốc xuống, ba sảnh. Dạy **gột Tẫn ấn** và **kéo boss vào vùng có lợi**.

| Đợt | Nội dung | Cơ chế |
| --- | --- | --- |
| 1 | 10 Giác Kiếm Trọng Binh | Bầy; đòn chém nón chậm, đọc vạch |
| 2 | 6 Liệt Hỏa Ma Ngưu húc theo hàng | `charge` chồng nhau; đứng lệch hàng |
| 3 | **Xích Tẫn Cự Khôi** (mini-boss) | Lò trong ngực mở 3 lần (như Thạch Tâm Khôi Vương); mở thì mất thế |
| 4 | Sảnh bia: giữ một Trấn Giới Bia 60 s giữa ba đợt quái | Giới áp trong phó bản; bia tắt thì cả đội dính Tẫn ấn 3 tầng |
| 5 | **Tử Nhận Ma Tướng** (mini-boss) | Hai đường chém chéo `line` nối nhau; hô lệnh gọi 4 trọng binh (`summon`) |
| 6 | **Tử Quang Dực Chủ** (boss) | Xem dưới |

**Tử Quang Dực Chủ** (cấp 30, hpMul 130, xpMul 32; `hover` 2,5 m):
- Pha 1: **Quét cánh** (nón 16 m, 50°, báo 1,4 s); **Quang tiễn** (5 `bolt` tản 30°); mỗi đòn trúng +1 Tẫn ấn.
- Pha 2 (65%): bay lên, **mưa tàn quang** (5 vòng r 4 theo hạt giống server, báo 1,3 s, hai lượt); giữa hai lượt hạ thấp 6 s (cửa sổ đánh).
- Pha 3 (30%): **Uống mạch** (`chant` kiểu `drain` của Thôn Mạch: hồi 2%/s). Trong sảnh có ba khe mạch ngọc lam; **kéo boss đứng lên khe mạch** thì chant phản lại: boss mất thế 6 s và mất 1 tầng "cháy" (3 tầng). Hết 3 tầng: boss dừng đánh ở 1 máu, cảnh ngắn, thành Tịnh Quang (không có cảnh giết).
- Thưởng: mảnh `set_*` bậc 5, **Tịnh Quang Vũ**† (nguyên liệu), mở `q5_tinh_quang`.

### 5.2 Kim Dạ Cung† (cấp 31+, 4–5 người, ~35 phút)

Cung dát vàng của một triều đã chết, đèn tím, sàn bóng. Dạy **chia tổ theo bia** và **phá chú kép**.

| Đợt | Nội dung | Cơ chế |
| --- | --- | --- |
| 1 | 8 Giác Kiếm Trọng Binh + 2 Triền Bố Châm Bà | Châm Bà hồi cho bầy: phá chú hoặc hạ trước |
| 2 | 6 U Ảnh Cốt Lộc ẩn bóng | `reveal` (thần thức V lộ) |
| 3 | **Huyết Giác Ma Tướng** ×2 (tinh anh đôi) | Một con giận khi con kia chết: hạ gần cùng lúc |
| 4 | Hành lang đèn: thắp 4 đèn theo thứ tự thần thức chỉ | Giải đố như ba gương (dùng lại `mirrorpuzzle.ts` tổng quát hóa) |
| 5 | **Tẫn Hỏa Kiếm Cơ** (mini-boss) | Vệt lửa để lại trên sàn 8 s sau mỗi đường chém (`pool`); sân hẹp dần |
| 6 | **Kim Dạ Ma Hậu** (boss) | Xem dưới |

**Kim Dạ Ma Hậu** (cấp 31, hpMul 150, xpMul 36):
- Pha 1: **Dạ chiếu** (vòng r 12 + vòng r 20 lệch 1 s, như Quầng sao của Thủ Linh); **Triệu thị vệ** (2 trọng binh mỗi 20 s).
- Pha 2 (65%): **Mặc cả**: Ma Hậu niệm 3 s hai chú cùng lúc ở hai đầu sảnh (bóng của bà niệm chú thứ hai, cơ chế `mirror.decoys`); phá **cả hai** trong 3 s, nếu không cả đội nhận 5 tầng Tẫn ấn.
- Pha 3 (30%): **Kim dạ**: sàn tối, chỉ vòng quanh hai bia trong sảnh sáng; ngoài vòng mất 4% khí huyết/s. Bà dập luân phiên từng bia: đội phải chia hai nhóm giữ bia (thần niệm ấn của phân thân tính là một người giữ).
- Thưởng: mảnh bộ bậc 5, **Kim Dạ Miện Phiến**† (nguyên liệu Anh Biến Lộ), mở `q5_ngu_bia`.

### 5.3 Boss ngoài trời

| Boss | Cấp | Vạch báo và chiêu | Cơ chế riêng |
| --- | --- | --- | --- |
| **Tam Thủ Ngục Khuyển** | 29 | **Tam khẩu** (ba nón 9 m, 28°, xòe 40°, báo 1,2 s); **Vồ** (`leap` 12 m, báo 0,9 s); **Ngục hống** (`chant` 2,4 s, r 14: gầm làm choáng 2 s, phá chú được) | Ba đầu ba thanh thế: mỗi lần mất thế thì một đầu gục (bớt một nón); **đầu giữa không gục** cho tới 30% máu. Pha 3: lửa ba đầu thành một `line` 26×4 m quét |
| **Thủ Khích Dực Chủ** (Trấn Giới Đài, (0, −650)) | 31 | **Giáng thương** (`line` 22×4, báo 1,3 s); **Dực tường** (giơ cánh chắn 70% phía trước 4 s, `reflect` đạn xa); **Khai khích** (mở khe phụ gọi 3 Tẫn chủng mỗi 25 s, `summon`) | Đứng quay lưng về gốc khe: trong 10 m quanh gốc khe hắn hồi 1%/s, phải **kéo ra xa khe** (dạy tank định vị) |

Hp 150 / 170. Model, clip: mục 6.4. Tam Thủ Ngục Khuyển là **boss thử pipeline** (PR "DV-B"), đặt tạm bằng `/gm spawn` trước khi có bản đồ.

---

## 6. Quái mới và asset

### 6.1 Quái thường và tinh anh

`ai` chỉ dùng trường đã có sau E1-E (`combo`, `caster`, `slam`, `chant`, `sweep`, `line`, `charge`, `leap`, `reflect`, `summon`, `reveal`, `posture`, `phases`). Hành (ngũ hành) vẫn gán để khắc chế `ke` chạy như cũ.

| Id | Tên | Cấp | Hành | Vai | hp/atk/xp | Chiêu và vạch báo |
| --- | --- | --- | --- | --- | --- | --- |
| `mon_liet_hoa_ma_nguu` | Liệt Hỏa Ma Ngưu† | 28–30 | Hỏa | tank húc | 1,7 / 1,4 / 1,3 | `charge` line 14×2,5 m báo 1,0 s; để lại vệt lửa 3 s |
| `mon_u_anh_cot_loc` | U Ảnh Cốt Lộc† | 28–31 | Thủy | nhanh, ẩn | 1,2 / 1,6 / 1,3 | Ẩn bóng tới khi cách 8 m (`reveal`); húc `line` 10×2 báo 0,8 s |
| `mon_giac_kiem_trong_binh` | Giác Kiếm Trọng Binh† | 29–31 | Kim | cận chiến nặng | 1,8 / 1,6 / 1,4 | Chém nón 7 m, 70°, báo 1,1 s; `combo` 2; +1 Tẫn ấn |
| `elite_hoi_giac_cu_thu` | Hôi Giác Cự Thú† | 28–29 | Thổ | tinh anh, giậm | 7,5 / 2,4 / 4 | `slam` r 6 báo 1,5 s; hất sừng nón 10 m |
| `elite_trien_bo_cham_ba` | Triền Bố Châm Bà† | 28–31 | Mộc | tinh anh, hỗ trợ địch | 5,5 / 2,3 / 4 | `chant` hồi bầy 3%/s (phá chú); kim `bolt` ×3 gắn Tẫn ấn |
| `elite_huyet_giac_ma_tuong` | Huyết Giác Ma Tướng† | 29–31 | Hỏa | tinh anh, cuồng | 7,0 / 2,6 / 4 | `leap` 10 m; `sweep` nón 12 m; dưới 40% máu `speedMul` 1,2 |
| `elite_xich_tan_cu_khoi` | Xích Tẫn Cự Khôi† | 30–31 | Thổ | tinh anh, mini-boss D1 | 8,0 / 2,4 / 4 (D1: 70 / 1,35 / 16) | `slam` r 5; lò ngực mở thì lộ điểm yếu (`MF_WEAK`) |

### 6.2 Boss

| Id | Tên | Cấp | Vai | hp/atk/xp |
| --- | --- | --- | --- | --- |
| `boss_tam_thu_nguc_khuyen` | Tam Thủ Ngục Khuyển | 29 | boss ngoài trời | 150 / 1,4 / 36 |
| `boss_thu_khich_duc_chu` | Thủ Khích Dực Chủ | 31 | boss ngoài trời | 170 / 1,45 / 38 |
| `boss_tu_nhan_ma_tuong` | Tử Nhận Ma Tướng | 30 | mini-boss D1 | 75 / 1,4 / 18 |
| `boss_tu_quang_duc_chu` | Tử Quang Dực Chủ | 30 | boss D1 | 130 / 1,45 / 32 |
| `boss_tan_hoa_kiem_co` | Tẫn Hỏa Kiếm Cơ | 31 | mini-boss D2 | 85 / 1,45 / 20 |
| `boss_kim_da_ma_hau` | Kim Dạ Ma Hậu | 31 | boss D2 | 150 / 1,45 / 36 |
| `boss_nhat_thuc_duc_chu` | Nhật Thực Dực Chủ | 32 | boss trong Nhật Thực Kiếp | 60 (35% boss ngoài trời) / 1,5 / 0 |
| `npc_tinh_quang_su` | Tịnh Quang Dực Sứ | | NPC đồng minh, hộ pháp kiếp | |
| (để dành) | Hư Uyên Dực Chủ | | bóng bên kia khe ở cảnh kết; boss chương 6 | |

### 6.3 Ngân sách và cách xử lý chung

Mọi model nguồn là bản điêu khắc 0,1–2 triệu tam giác, **không xương, không animation** (trừ bướm: có xương, không clip), một vật liệu, texture 1–4 tấm. Đường ống (thử ở PR DV-B với Tam Thủ Ngục Khuyển, rồi lặp lại):

1. Chép nguồn vào `../dtl-asset-source/<loại>/<id>/source.glb` (chỉ **thêm**, không sửa `assets-online/`).
2. Blender headless: gộp lưới, **giảm lưới** về ngân sách lớp (`assets/budgets.json`: `mon_` 5–10 nghìn, `elite_` 10–15 nghìn, `boss_` 20–40 nghìn tam giác), **nướng** normal từ lưới gốc + chép base color/ORM sang UV mới, texture boss 2048² base + 1024² normal/ORM.
3. **Auto-rig** bằng script (không dịch vụ trả phí): bốn chân dùng `anim_quadruped.py` (`geometric_layout`), hai chân dùng `biped_autorig.py`; cánh thêm 2–3 xương mỗi bên.
4. Clip thủ tục `idle | run | attack | cast/roar | hit_light | death` (`anim_quadruped.py`, `anim_biped_extra.py`), cùng tên clip với boss hiện có để `MONSTER_SKINS` dùng thẳng.
5. `assets:build --only <id>`, `assets:validate`, `meta.json` có `license: CC-BY-4.0`, `author`, `source`, `title`, và dòng trong `assets/LICENSES.md`.

**Ghi công CC BY 4.0** là bắt buộc và phải **người chơi thấy được**: ngoài `assets/LICENSES.md`, cần mục "Ghi công" trong bảng Cài đặt đọc từ một file sinh tự động (`credits.json` từ các `meta.json` có giấy phép khác `dự án`/CC0). Model đã giảm lưới, dựng xương là "bản phái sinh": ghi rõ "đã chỉnh sửa". Gói DV1-B.

Rủi ro chất lượng: bản điêu khắc dày chi tiết (lông, xích, cánh nhiều lớp) giảm 25–50 lần sẽ mất nét; normal nướng bù được phần lớn. Model người (Đọa Dực, hai ác nữ) có áo choàng/cánh dính thân, auto-rig khó hơn bốn chân: xếp sau, làm khi pipeline bốn chân đã ổn.

### 6.4 Bảng gắn asset

Nguồn: `../dtl-asset-source/3d/skin/goc-online/`. Tác giả, giấy phép lấy từ `asset.extras` trong từng GLB (đọc ngày 2026-11-18). "6 (Atahan3D)" là tên hiển thị + tài khoản Sketchfab của cùng một tác giả.

| File nguồn | Tam giác | Tác giả | Vai trong game | Id đề xuất | Lớp | Rig |
| --- | --- | --- | --- | --- | --- | --- |
| `gorethrax__the_infernal_three-_headed_hound` | 980k | 6 (Atahan3D) | boss ngoài trời | `boss_tam_thu_nguc_khuyen` | boss | bốn chân + 3 cổ |
| `flame_bull__the_infernal_beast` | 122k | 6 (Atahan3D) | quái thường | `mon_liet_hoa_ma_nguu` | mon | bốn chân |
| `gorthazul__the_ashhorn_behemoth` | 701k | 6 (Atahan3D) | tinh anh | `elite_hoi_giac_cu_thu` | elite | hai chân, lưng gù |
| `krovath__the_bloodhorn_tyrant` | 852k | 6 (Atahan3D) | tinh anh | `elite_huyet_giac_ma_tuong` | elite | hai chân |
| `rhaum__the_hellforged_colossus` | 1,14M | 6 (Atahan3D) | tinh anh + mini-boss D1 | `elite_xich_tan_cu_khoi` | elite | hai chân |
| `shadow_stag_-_bone-antlered_dark_fantasy` | 1,93M | Pigcraft | quái thường | `mon_u_anh_cot_loc` | mon | bốn chân |
| `bone_knight_-_horned_skull_greatsword` | 1,96M | Pigcraft | quái thường | `mon_giac_kiem_trong_binh` | mon | hai chân + kiếm |
| `bandaged_asylum_matron_needle_horror` | 1,95M | Pigcraft | tinh anh | `elite_trien_bo_cham_ba` | elite | hai chân |
| `protector_nemesis__the_fallen_seraph` | 856k | 6 (Atahan3D) | boss ngoài trời | `boss_thu_khich_duc_chu` | boss | hai chân + cánh |
| `velkryon__the_violet_dreadblade` | 1,01M | 6 (Atahan3D) | mini-boss D1 | `boss_tu_nhan_ma_tuong` | boss | hai chân + kiếm |
| `aetherion_nemesis__the_violet_seraph` | 1,00M | 6 (Atahan3D) | boss D1 | `boss_tu_quang_duc_chu` | boss | hai chân + cánh |
| `aetherion_nemesis__the_violet_seraphpurified` | 926k | 6 (Atahan3D) | NPC đồng minh (cùng rig, cùng clip với bản trên) | `npc_tinh_quang_su` | boss | dùng lại rig Tử Quang |
| `varkessa__the_infernal_emberblade` | 1,95M | 6 (Atahan3D) | mini-boss D2 | `boss_tan_hoa_kiem_co` | boss | hai chân + kiếm |
| `ravenyth__the_gilded_night_empress` | 1,99M | 6 (Atahan3D) | boss D2 | `boss_kim_da_ma_hau` | boss | hai chân, váy dài |
| `nyxarion_nemesis__the_violet_eclipse` | 1,97M | 6 (Atahan3D) | boss trong kiếp cuối | `boss_nhat_thuc_duc_chu` | boss | hai chân + cánh |
| `void_nemesis__the_abyssal_angel` | 1,99M | 6 (Atahan3D) | **để dành chương 6**; chương 5 chỉ là bóng ở cảnh kết | (chưa nhập) | | |
| `butterfly_revamp` | 46k, 136 xương | topomega3 | **Loại hẳn, không nhập** (phát hiện ở DV-C): không phải con bướm mà là nhân vật nữ cầm kiếm; tên mesh/xương (`DaoFengBaoBei`, `JingKe`, `Hero`) cho thấy là model tướng "Butterfly" trích từ game thương mại. "Bướm mạch" làm **thủ tục** (`apps/client/src/game/butterflies.ts`, không asset ngoài) | | | |
| `sword_of_miracle_free` | 26k | Art_workshop | *không nằm trong yêu cầu*; ứng viên kiếm bậc 5 hoặc kiếm của Tẫn Hỏa Kiếm Cơ (mục 15, quyết định 9) | | weapon | |
| `jett_valorant…`, `kafka_honkai_star_rail…` | | | **Loại hẳn, không nhập** | | | |

Lưu ý: model trong nguồn có trục và tỉ lệ tùy tiện (hộp bao ~1,9 đơn vị); chiều cao trong game đặt ở `meta.json` (Ngục Khuyển vai ~3,2 m; Đọa Dực ~3,5 m; Ma Ngưu ~2 m; Cự Khôi ~4,5 m).

---

## 7. Trang bị, đan, kinh tế (phác, chi tiết ở gói DV-F)

- **Bậc 5** (`TIER_OPEN = 5`, `reqLevel` 28): 3 bộ theo công pháp (đề xuất tên: **Trấn Khích Kiếm Y**†, **Tẫn Thiết Hộ Giáp**†, **Tịnh Quang Đan Bào**†), hình dáng **vẫn tiên hiệp** (đạo bào, hộ uyển), chỉ nhuốm tro và một đường viền ngọc lam "đã qua lửa". Không mặc giáp dị vực lên người chơi (nguyên tắc bản sắc 2). Thăng Bậc 4 → 5 bằng 20 **Tẫn Giác**† + linh thạch theo đường cong hiện có.
- **Nguyên liệu** qua `$mats` của `loot.json`: Tẫn Giác (Tẫn chủng), **Tàn Dực Vũ**† (Đọa Dực), Tịnh Quang Vũ, Kim Dạ Miện Phiến.
- **Đan**: bậc 5 của ba loại tăng sức, Phá Cảnh Đan bậc 5, **Tịnh Tẫn Đan** (gột Tẫn ấn), **Anh Biến Lộ** (đột phá).
- **Hiệu ứng 4 món**: gắn với cơ chế chương, giữ đơn giản (ví dụ kiếm: đứng trong vòng bia +8% sát thương; hộ pháp: giảm một tầng Tẫn ấn nhận vào; đan sư: chiêu hồi gột thêm một tầng). Chốt ở DV3-F cùng `sim:progress`.
- Kinh tế giữ đường cong `EXPANSION_DESIGN.md` 7.5 kéo dài một bậc; không thêm loại tiền.

---

## 8. Kỹ năng

Không thêm chiêu thường. Mỗi công pháp một chiêu **cấp 30** (đề xuất tên ở mục 13) và chiêu **cấp 32** `locked` chờ cơ chế Anh thân. Ba chiêu cấp 24/26/28 đang `locked` của E2-G phải mở trước (thuộc E-4, không tính vào chương 5).

---

## 9. Hệ thống hỗ trợ

- **Màn Ghi công** (bắt buộc trước khi asset CC BY đầu tiên vào bản chơi chung): mục 6.3.
- **Mood theo vùng trong một level**: hiện mood theo level + giờ. Chương 5 cần **trộn mood theo vị trí** (bên này/bên kia vết nứt), nội suy trên 80 m quanh Khích Giai. Gói DV1-C.
- **Trạng thái theo room có hạn giờ** (bia đã thắp ở bản đồ): cùng kiểu với giờ hồi sinh boss (`S.BOSS_TIMERS`), gửi qua một tin `S.STELES`; theo kênh, không lưu DB. Tách hẳn khỏi Truyền Tống Trận (mục 4.3) và khỏi bia của Nhật Thực Kiếp (mục 3).
- **Bướm và sinh vật trang trí**: `game/butterflies.ts` (DV-C), thủ tục, instanced, không thuộc server.

---

## 10. Ghi chú kỹ thuật

- Không cần nền mới: nhiều level, phó bản theo dữ liệu, kiếp theo dữ liệu, quái mở rộng, `hover`, `mirror.decoys`, `summon`, `drain` đều đã có sau E-1…E-4.
- Level kiếp theo từng kiếp: trường `level` trong `tribulations.json` (mặc định `do_kiep`), level mới `do_kiep_bac_hoang` (`levels/do_kiep_bac_hoang.json` + `.assets.json`), `enterTribulationRoom`/`TribulationRoom` đọc level từ kiếp (mục 3).
- Việc mới về server: hệ số giới áp theo vùng, Tẫn ấn (một debuff có tầng, đọc ở `heal`), bia (trạng thái room + `touch`), hai móc kiếp `dan_loi`/`nhat_thuc`, boss "dừng ở 1 máu" (cờ trong `MonsterDef`, không rơi đồ theo đường chết thường mà qua thưởng phó bản).
- Việc mới về client: mood trộn theo vị trí, khe Giới Khích (một tấm dọc cao 300 m, shader TSL, thấy từ xa), mặt nạ đất ngọc lam quanh bia, bảng màu `rift_*`.
- Ngân sách: mỗi boss dị vực là một `SkinnedMesh` một vật liệu như boss hiện có; nạp lười theo level. Texture boss 2048² × ~7 con nạp lười ≈ +60 MB GPU lúc đỉnh nếu vào cả hai phó bản trong một phiên: `AssetCache` đã đếm tham chiếu và nhả khi rời level.

---

## 11. Gói việc

Kích thước như `EXPANSION_DESIGN.md` mục 11 (S ≈ nửa ngày, M ≈ 1–2 ngày, L ≈ 3–4 ngày công một worker).

### 11.1 DV-1 Nền và thử nghiệm (đang làm, 3 PR tuần tự)

| Gói | Nội dung | Vùng code | Kích |
| --- | --- | --- | --- |
| **DV-A** | Tài liệu này | `docs/DIVUC_DESIGN.md` | S |
| **DV-B** | Thử pipeline một boss: Tam Thủ Ngục Khuyển (giảm lưới, nướng, auto-rig, 5 clip, `assets:build --only`, ghi công, boss tạm + `/gm spawn`) | `tools/blender/*`, `assets/source/boss/*`, `assets/LICENSES.md`, `monsters.json`, `loot.json`, `MONSTER_SKINS`, i18n | L |
| **DV-C** | Bướm mạch: sinh vật trang trí bay, instanced, thủ tục (không asset ngoài) | `apps/client/src/game/butterflies.ts`, `engine.ts` | M |
| **DV1-B** | Màn Ghi công + `credits.json` sinh từ `meta.json` | `tools/asset-pipeline`, `apps/client/src/ui/windows/Settings.tsx`, i18n | S |
| **DV1-C** | Bảng màu `rift_*`, mood `ash_dawn`/`rift`, trộn mood theo vị trí, ngoại lệ art bible | `assets/palette.json`, `render/{atmosphere,grading}.ts`, `docs/art-bible.md` | M |
| **DV1-D** | Thang cấp 29–32, `xpNeed`, `realmMul` Anh Biến, bình cảnh, `sim:progress` 32 cấp | `packages/shared/src/{formulas,realm}.ts`, `realms.json`, i18n | M |

### 11.2 DV-2 Asset (sau khi DV-B được duyệt)

| Gói | Nội dung | Kích |
| --- | --- | --- |
| **DV2-A** | Ba con bốn chân/thú: Ma Ngưu, Cốt Lộc, Cự Thú (dùng lại đúng script của DV-B) | M |
| **DV2-B** | Bốn con hai chân không cánh: Trọng Binh, Châm Bà, Huyết Giác, Cự Khôi (`biped_autorig.py`) | L |
| **DV2-C** | Đọa Dực có cánh: Thủ Khích, Tử Quang + bản Tịnh Quang (chung rig), Nhật Thực; thêm xương cánh và clip `fly_idle` | L |
| **DV2-D** | Ba boss người: Tử Nhận, Tẫn Hỏa Kiếm Cơ, Kim Dạ Ma Hậu (váy, kiếm rời gắn xương tay) | L |

### 11.3 DV-3 Nội dung

| Gói | Nội dung | Kích |
| --- | --- | --- |
| **DV3-A** | Level Bắc Hoang: địa hình, vùng, cụm, vị trí 5 bia, 7 trận `bh_tp_*` (`teleport.bachoang.ts`), minimap, `map:report` đạt | L |
| **DV3-B** | Quái, tinh anh, hai boss ngoài trời: `monsters.json`, `loot.json`, skin, VFX `mon_*` | L |
| **DV3-C** | Giới áp, Tẫn ấn, Trấn Giới Bia của bản đồ (trạng thái theo room/kênh, `S.STELES`; server + HUD + mặt nạ đất). Không đụng `teleport.ts`; không dùng chung trạng thái với bia của kiếp (DV3-L) | L |
| **DV3-D** | Xích Tẫn Khích + Tử Quang Dực Chủ (boss dừng ở 1 máu, cảnh gột) | L |
| **DV3-E** | Kim Dạ Cung + Kim Dạ Ma Hậu | L |
| **DV3-F** | Trang bị bậc 5, nguyên liệu, đan, công thức, icon | L |
| **DV3-G** | Chiêu cấp 30 ba công pháp, pose, VFX | M |
| **DV3-H** | Nhiệm vụ chương 5 (12 chính + 4 phụ), NPC, thoại, thẻ chương `ch5` | L |
| **DV3-I** | Mỹ thuật: kiến trúc dị vực bpy, khe Giới Khích, texture đất tro, nhạc `wild_ash`/`wild_rift`/2 bài boss | L |
| **DV3-K** | Anh thân (nguyên anh đánh được) | L |
| **DV3-L** | Nhật Thực Kiếp + Nhật Thực Dực Chủ + Tịnh Quang hộ pháp; level kiếp riêng `do_kiep_bac_hoang` (sân, năm bia cố định, khe, mood `rift`), trường `level` trong `tribulations.json`, bia của kiếp là trạng thái riêng của room kiếp | L |
| **DV3-J** | Cân bằng: `sim:progress` 10 giờ ±12%, `fight:check`, bot 100, `bench:crowd` Bắc Hoang | M |

Ước tính: DV-1 ~6–8 ngày công; DV-2 ~9–12; DV-3 ~30–36. Tổng **~45–56 ngày công**, chạy được 5–6 worker song song ở DV-3. Mốc chơi thử: sau DV-B (xem một boss), sau DV3-A + DV3-B (đi và đánh), sau DV3-D (phó bản 1), cuối cùng kiếp và cân bằng.

### 11.4 Phụ thuộc và rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Chương 4 chưa đóng (E4-K phân thân, E4-L Thiên Nhân Kiếp, ba chiêu `locked`) | Chương 5 bắt đầu nội dung (DV-3) sau khi E-4 xong; DV-1/DV-2 không phụ thuộc, làm trước được |
| Auto-rig model người có cánh/váy cho kết quả xấu | DV-B thử con dễ nhất trước; nếu DV2-C/D không đạt, boss người đứng yên bay lơ lửng (`hover`) với clip ít chuyển động chân, hoặc người dùng rig tay một lần trên Mixamo/Blender |
| Lạc tông | Bốn nguyên tắc mục 0; bảng màu tách; người dùng duyệt ảnh từng PR asset |
| Giấy phép | Nhãn CC BY trên trang tải **chưa đủ**: phải mở file xem tên mesh/xương/vật liệu trước khi nhập (`butterfly_revamp` gắn nhãn CC BY nhưng là model trích từ game khác). Chỉ nhập file có `asset.extras.license = CC-BY-4.0` và nội dung là sáng tác gốc; ghi công ba nơi (meta, LICENSES, màn Ghi công); hai model nhân vật có bản quyền đã loại; CC BY cho phép sửa và dùng, kể cả sau này game đổi phạm vi |
| Tác giả gỡ model khỏi Sketchfab | Giấy phép CC BY không thu hồi được với bản đã tải; giữ nguyên file gốc + URL nguồn trong `dtl-asset-source` |
| Tải đầu tăng | Mọi asset chương 5 nạp lười theo level; bướm là thủ tục, không thêm file tải |

---

## 12. Quy ước nội dung cần bám

Như `EXPANSION_DESIGN.md` mục 12 (i18n, glossary, `loot.json`, transaction + ledger, logic chung ở shared, server quyết định). Thêm cho chương 5:

- **Không tên phiên âm phương Tây** trong chuỗi hiển thị; tên gốc model chỉ ở ghi công.
- **Không** dùng chữ "thiên sứ", "ác quỷ", "địa ngục", "luyện ngục", "nguyên quang" (bản dịch sát của khái niệm phương Tây) làm tên riêng: dùng Đọa Dực, Tẫn chủng, Xích Tẫn, nguyên quang. Ngoại lệ duy nhất: chữ "Ngục" trong **Tam Thủ Ngục Khuyển** (tên do thợ săn Bắc Hoang đặt cho con thú, lore-keeper đã cho qua).
- **Giới Khích**: "khích" là khe hở (隙), dễ bị hiểu là "khiêu khích"; lần đầu hiện tên trong game phải kèm tooltip "vết nứt giữa hai giới".
- Id của Tịnh Quang (Tịnh, "sạch") không được trùng gốc với `itm_tinh_quang_mac` (Tinh Quang Mặc, "ánh sao") đã có: dùng `npc_tinh_quang_su`, `itm_tinh_vu` (Tịnh Quang Vũ), `set_tinh_dan_bao` (Tịnh Quang Đan Bào).
- Người chơi và NPC Huyền Linh **không** mặc, cầm, cưỡi đồ dị vực.

---

## 13. Đề xuất thêm vào glossary (†)

Tên dưới đây là bản **sau lượt soát `lore-keeper` độc lập** (mục 14.1; người dùng đã chốt hướng đặt tên ở mục 15, quyết định 11). Chưa thêm vào `glossary.json` trong PR này; thêm khi gói tương ứng vào code.

| Nhóm | Tên mới |
| --- | --- |
| Bản đồ, phó bản | Bắc Hoang Tẫn Nguyên · Xích Tẫn Khích · Kim Dạ Cung |
| Vùng | Vọng Bắc Trạm · Hàn Hôi Nguyên · Khô Lộc Lâm · Khích Giai · Xích Tẫn Bình · Kim Dạ Ngoại Uyển · Trấn Giới Đài |
| POI | Diệt Mạch Khẩu · Tàn Mạch Nhãn · Giới Khích · Trấn Giới Bia |
| Phe, khái niệm | Tẫn Giới · Đọa Dực · Tẫn chủng · nguyên quang · dị vực · Giới áp · Tẫn ấn · bướm mạch |
| Nhân vật | Cố Bất Dịch · Tịnh Quang Dực Sứ · Kim Dạ Ma Hậu · Tẫn Hỏa Kiếm Cơ · Tử Nhận Ma Tướng · Tử Quang Dực Chủ · Nhật Thực Dực Chủ · Thủ Khích Dực Chủ · Hư Uyên Dực Chủ |
| Quái | Liệt Hỏa Ma Ngưu · U Ảnh Cốt Lộc · Giác Kiếm Trọng Binh · Hôi Giác Cự Thú · Triền Bố Châm Bà · Huyết Giác Ma Tướng · Xích Tẫn Cự Khôi · Tam Thủ Ngục Khuyển |
| Kiếp, cơ chế | Nhật Thực Kiếp · Anh thân · thần niệm ấn |
| Vật phẩm | Anh Biến Lộ · Tịnh Tẫn Đan · Tẫn Giác · Tàn Dực Vũ · Tịnh Quang Vũ · Kim Dạ Miện Phiến |
| Bộ | Trấn Khích Kiếm Y · Tẫn Thiết Hộ Giáp · Tịnh Quang Đan Bào |

---

## 14. Soát lore

### 14.1 Lượt soát độc lập (lore-keeper, 2026-11-18)

Subagent `lore-keeper` do orchestrator chạy trên bản 1 của tài liệu này (chỉ đọc, đối chiếu `glossary.json` và `EXPANSION_DESIGN.md`; không tra mạng, phần trùng truyện gốc theo trí nhớ của nó). Kết quả đã áp hết vào bản này:

- **Cảnh giới**: "Anh Biến" đúng thứ tự `glossary.realms`. Cơ chế mở khóa trùng tên cảnh giới nên đổi thành **Anh thân**; vật phẩm đột phá theo mẫu "Hóa Thần Lộ" thành **Anh Biến Lộ**.
- **Tên**: 17 tên đổi (bảng dưới), 2 tên giữ kèm ghi chú (Giới Khích có tooltip; Tẫn ấn ghi rõ là "dấu tro", mục 12 và 4.3). Các tên còn lại đạt; không tên nào trùng nguyên văn glossary.
- **Cốt truyện**: 10 điểm đã vá: Mặc Chiếu đổi nhận thức và nguồn gốc bia tàn niệm, Huyền Cơ "giữ then" so với "giữ sống", ba tầng nguyên nhân Linh Thoái, một nghĩa cho câu "Trả đi", hình dạng Giới Khích (một khe nam → bắc), vị trí Thủ Khích, hai dòng Đọa Dực và ai thuộc dòng nào, Tịnh Quang nhớ đường, vai trò năm bia so với kiếp, Dạ Minh Lộc theo mạch lên bắc (mục 1.2, 1.3, 1.4, 1.5, 4.1, 5.3).
- **Giọng văn**: chốt một hệ chức danh (mục 1.3).
- **Còn nên tra tay trước khi vào i18n** (lore-keeper không tra mạng): Cố Bất Dịch, Nhật Thực, Hư Uyên, Kim Dạ, Tẫn Giới có trùng tên riêng của truyện nào không.
- Ngoài phạm vi, ghi lại để lượt soát glossary riêng: `Thanh Liên Ấn` (đã có từ P3-8) gần một tên trong truyện khác.

| Tên cũ (bản 1) | Tên mới | Lý do | Id đổi theo |
| --- | --- | --- | --- |
| Tẫn Nguyên (vùng) | **Hàn Hôi Nguyên** | trùng đuôi tên bản đồ Bắc Hoang Tẫn Nguyên; "Tẫn" để dành cho Tẫn Giới | `bh_tp_tan_nguyen` → `bh_tp_han_hoi` |
| Bậc Khích | **Khích Giai** | pha thuần Việt | `bh_tp_bac_khich` → `bh_tp_khich_giai` |
| Luyện Ngục Bình | **Xích Tẫn Bình** | "Luyện Ngục" là bản dịch sát của Purgatory, trái mục 12 | `bh_tp_luyen_nguc` → `bh_tp_xich_tan` |
| Luyện Ngục Khích | **Xích Tẫn Khích** | như trên | `q5_luyen_nguc` → `q5_xich_tan` |
| Ngục Luyện Cự Khôi | **Xích Tẫn Cự Khôi** | đảo thứ tự so với tên phó bản (bắt buộc sửa) | `elite_nguc_luyen_cu_khoi` → `elite_xich_tan_cu_khoi` |
| Tắt Mạch Khẩu | **Diệt Mạch Khẩu** | pha thuần Việt | |
| Mạch Nhãn Tàn | **Tàn Mạch Nhãn** | đảo thứ tự Hán-Việt | |
| ngục chủng | **Tẫn chủng** | thống nhất sau khi bỏ "Luyện Ngục" | |
| thánh quang | **nguyên quang** | "Holy Light" kiểu phương Tây | |
| Hàn Bất Dịch | **Cố Bất Dịch** | gần tên nhân vật truyện khác; đã nhiều chữ Hàn | |
| Tử Thực Dực Chủ | **Nhật Thực Dực Chủ** | chỉ khác Tử Quang một âm | `boss_tu_thuc_duc_chu` → `boss_nhat_thuc_duc_chu` |
| Thực Nhật Kiếp | **Nhật Thực Kiếp** | thống nhất với tên trên | móc `thuc_nhat` → `nhat_thuc` |
| Thủ Khích Đọa Dực | **Thủ Khích Dực Chủ** | thống nhất chức danh | `boss_thu_khich_doa_duc` → `boss_thu_khich_duc_chu` |
| Cốt Giác Trọng Kiếm Vệ | **Giác Kiếm Trọng Binh** | gần Cốt Vệ Kiếm Thủ, Cốt Kiếm Thống Lĩnh (chương 4) | `mon_cot_giac_kiem_ve` → `mon_giac_kiem_trong_binh` |
| Dực Vũ Tàn | **Tàn Dực Vũ** | đảo thứ tự | |
| Tẫn Thiết Huyền Giáp | **Tẫn Thiết Hộ Giáp** | đã có hai bộ "Huyền Giáp" | |
| Biến Anh Lộ | **Anh Biến Lộ** | theo mẫu Hóa Thần Lộ | |
| anh biến (cơ chế) | **Anh thân** | trùng tên cảnh giới Anh Biến | |
| Tịnh Quang Dực Sứ (giữ tên) | (giữ) | id va chạm gốc với `itm_tinh_quang_mac` | `npc_tinh_quang_duc_su` → `npc_tinh_quang_su`; `itm_tinh_vu`, `set_tinh_dan_bao` |
| `q5_coc_loc` | `q5_cot_loc` | gõ sai "cốt" | |

Tên boss thử pipeline **Tam Thủ Ngục Khuyển** (`boss_tam_thu_nguc_khuyen`, PR DV-B) đạt, không đổi.

### 14.2 Tự soát của phiên viết (bản 1)

| Mục soát | Tự soát |
| --- | --- |
| Thang cảnh giới | Hóa Thần → Anh Biến đúng thứ tự `glossary.realms`; tiểu cảnh giới theo `glossary.stages`; quái, vật phẩm chương 5 đều cấp 28+ |
| Thuật ngữ | Dùng đúng glossary: tu vi, khí huyết, linh lực, linh thạch, thần thức, phân thân thần niệm, hộ pháp (độ kiếp), mất thế, phá chú |
| Bản quyền | Mọi tên riêng đặt mới. Không dùng tên model gốc trong game. Ba model nhân vật của hãng khác đã loại. Mô-típ "chó ba đầu gác cửa", "kẻ có cánh sa ngã" là mô-típ chung; không dùng tên thần thoại (Cerberus, Lucifer…) |
| Nhất quán | Mở rộng, không phủ định chương 4 (mục 1.2). Tô Vãn Ngư, Mặc Chiếu giữ giọng. Dạ Minh Lộc (chương 4) là gốc của U Ảnh Cốt Lộc |
| Giọng văn | Câu ngắn, xưng "ngươi", không hô tên chiêu; nhân vật dị vực nói tiếng bên này vụng, không phiên âm |

---

## 15. Quyết định (đã chốt)

Người dùng đã chốt ngày 2026-11-18: **cả 12 câu theo cột "Đã chọn"**. Cột "Phương án đã loại" giữ lại để biết đã cân nhắc gì.

| # | Câu hỏi | Đã chọn | Phương án đã loại | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Thang cấp sau Hóa Thần | Hóa Thần 28–31, **Anh Biến sơ kỳ 32** là trần mới; chương 5 dài **10 giờ** | (b) chương 5 chỉ tới Hóa Thần đại viên mãn (31), không kiếp, Anh Biến để chương 6; (c) 8 giờ | **Đã chốt 2026-11-18** |
| 2 | Số bản đồ | **Một** bản đồ hai nửa (bên này/bên kia vết nứt) + 2 phó bản | Hai bản đồ riêng (Bắc Hoang và Tẫn Giới), mỗi bản đồ một phó bản: thêm ~8–10 ngày công, bên kia "lạ" hơn hẳn | **Đã chốt 2026-11-18** |
| 3 | Ngoại lệ điều cấm 12 art bible cho thực thể Tẫn Giới, giới hạn ở level chương 5 | **Đồng ý**, kèm bảng màu `rift_*` | Không: chỉ dùng thú (chó, bò, hươu, cự thú), bỏ nhóm Đọa Dực mặc giáp | **Đã chốt 2026-11-18** |
| 4 | Giải thích lại động cơ của Huyền Cơ (then cài vết nứt) | **Dùng** | Giữ chương 4 nguyên nghĩa; vết nứt là chuyện mới không liên quan Cựu Thiên Điện | **Đã chốt 2026-11-18** |
| 5 | Tử Quang được gột thành đồng minh Tịnh Quang (dùng model "purified") | **Đồng minh từ giữa chương**, hộ pháp ở kiếp cuối | Chỉ xuất hiện ở cảnh kết; hoặc là NPC bán đồ ở trạm | **Đã chốt 2026-11-18** |
| 6 | Hư Uyên Dực Chủ (Void Nemesis) | **Để dành chương 6** | Làm boss ẩn/khó của chương 5 (raid 8 người) | **Đã chốt 2026-11-18** |
| 7 | Cơ chế Anh Biến | **Anh thân**: nguyên anh xuất khiếu đánh được | Lĩnh vực mượn thế trời đất | **Đã chốt 2026-11-18** |
| 8 | Trang bị bậc 5 | **Có**, hình dáng vẫn tiên hiệp | Hoãn; chương 5 chỉ rơi đồ bậc 4 phẩm cao | **Đã chốt 2026-11-18** |
| 9 | `sword_of_miracle_free.glb` (ngoài danh sách yêu cầu, CC BY) | Dùng làm kiếm của Tẫn Hỏa Kiếm Cơ (không cho người chơi) | Bỏ; hoặc làm kiếm bậc 5 của người chơi | **Đã chốt 2026-11-18** |
| 10 | Nơi hiện ghi công CC BY | **Mục "Ghi công" trong Cài đặt** + `LICENSES.md` | Thêm cả màn tải | **Đã chốt 2026-11-18** |
| 11 | Tên | Như mục 13 (Hán-Việt, người bên này đặt) | Người dùng đổi tên nào thì sửa trước khi vào glossary | **Đã chốt 2026-11-18** |
| 12 | Thứ tự làm | DV-B → DV-C → DV1-B/C/D → DV-2 song song E-4 còn lại → DV-3 | Dừng sau DV-C, chờ E-4 xong hẳn | **Đã chốt 2026-11-18** |
