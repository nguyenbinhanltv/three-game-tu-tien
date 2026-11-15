# Game Design Core: Đạp Thiên Lộ

Bản 1 · 2026-11-16 · đi kèm `docs/AUDIT_AND_ROADMAP.md`.

Tài liệu này chốt **vòng chơi lõi** và những gì bao quanh nó: thế giới, tuyến tân thủ, thang cảnh giới, độ kiếp, ba lối chơi. Mỗi mục tách rõ ba thứ:

- **Đã có**: đang chạy trong game, kèm nơi lưu dữ liệu.
- **Còn thiếu**: lỗ hổng so với thiết kế, kèm ai làm (mã việc trong `AUDIT_AND_ROADMAP.md`).
- **Thiết kế (chưa làm)**: định hướng sau MVP. Không được đưa vào code khi chưa có quyết định của người dùng.

Nguồn chuẩn về tên là `packages/content/data/glossary.json`. Tài liệu này không đặt tên mới cho thứ đã có trong glossary.

> **Lưu ý về tên cảnh giới.** Thang cảnh giới theo Tiên Nghịch nên đại cảnh giới sau Trúc Cơ là **Kết Đan** (glossary), không phải "Kim Đan". Đầu đề giao việc ghi "Kim Đan"; tài liệu này dùng "Kết Đan" cho khớp glossary. Tầng đầu là **Ngưng Khí**, không dùng "Luyện Khí".

---

## 1. Vòng chơi lõi

```
Đả tọa dẫn khí ──► Săn yêu thú ──► Linh thạch, đan dược, trang bị ──► Bình cảnh / Độ kiếp ──► Tương tác người chơi
      ▲                                                                                              │
      └──────────────────────────── mạnh hơn, đi xa hơn, cần nhau hơn ◄──────────────────────────────┘
```

| Mắt xích | Người chơi làm gì | Đã có | Cảm giác cần đạt |
| --- | --- | --- | --- |
| Đả tọa dẫn khí | Phím Z: hồi 5% khí huyết và 8% linh lực mỗi giây, tu vi tăng `0,4 + 0,12 × tầng` mỗi giây | Có (`formulas.ts`, tư thế `tam_thien`, nhạc `meditate`) | Nghỉ có ích, không phải treo máy: tu vi từ đả tọa chỉ là phần phụ |
| Săn yêu thú | Tab chọn mục tiêu, 6 chiêu gốc + 3 chiêu công pháp, GCD 1 giây, lướt phím Q | Có (K-2: đòn có `windup`/`hitAt`/`recovery`, liên hoàn 3 đòn) | Mỗi đòn có sức nặng; quái có đòn báo trước để né |
| Linh thạch, đan dược, trang bị | Nhặt đồ, bán đồ, luyện đan ở Đan Phòng, cường hóa/khảm/tẩy luyện ở Thiết lão | Có (Phase 3-1…3-4, 3-8) | Món rơi quý nhận ra ngay từ xa; nâng cấp có rủi ro nhưng không mất trắng |
| Bình cảnh, độ kiếp | Tầng 5/10/15: vượt tâm ma hoặc Phá Cảnh Đan; tầng 15 viên mãn + Trúc Cơ Đan: độ kiếp 40 giây | Có (3-7, P2-B4) | Một cột mốc, cả kênh cùng thấy |
| Tương tác người chơi | Tổ đội 4 người, cộng hưởng vai trò, chia đồ theo lượt, tỉ thí | Có (3-9) | Đi cùng nhau lợi hơn đi một mình, không ép buộc |

**Phạm vi MVP không đổi**: Ngưng Khí 1–15 → Trúc Cơ, một bản đồ (Vân Lam Sơn Mạch), một tông môn (Lạc Kiếm Tông), một bí cảnh (Kiếm Trủng). Không bang hội, kết hôn, gia viên, phó bản mới, cảnh giới mới trong code.

---

## 2. Thế giới: Huyền Linh Giới

### 2.1 Đã có trong game

| Thứ | Nội dung | Nơi lưu |
| --- | --- | --- |
| Thế giới | Huyền Linh Giới | `glossary.world` |
| Bản đồ | Vân Lam Sơn Mạch: vùng chơi 2,2 × 2,2 km quanh tông môn | `glossary.map`, `levels/van_lam.json` |
| Tông môn | Lạc Kiếm Tông (kiếm tu), sân đá, Chính điện, Đan Phòng, Tàng Kiếm Các | `glossary.sect`, `arch_sect` |
| NPC | Lạc Vân chân nhân (chưởng môn), Tố Tâm (dược sư Đan Phòng), Thiết lão (trông coi Tàng Kiếm Các) | `npcs.json`, i18n `npc.*` |
| Vùng săn | Thung Lũng Thanh Phong (nam, cấp 1–4), Suối Thanh Khê (đông nam, 4–8), Rừng Linh Thảo (đông, 8–12), Vách Đá Ngọc (đông bắc, 11–15), Bãi Hồ Sương Mù (tây) | `zones`, i18n `zone.*` |
| Yêu thú | Sói Xám, Thiết Bối Trư, Yêu Lang, Hỏa Vân Hồ, Thạch Viên, U Minh Lang; 3 tinh anh; boss Hàn Giao | `monsters.json` |
| Bí cảnh | Kiếm Trủng: Kiếm Linh, Kiếm Khôi, Huyết Lang Vương, Thủ Mộ Thạch Tướng | `rooms.ts` (`WAVES`) |
| Giọng văn | Cổ phong vừa phải, xưng "ngươi", câu ngắn, cụ thể | i18n `quest.*`, `mon.*.say.*` |

Lore hiện chỉ nằm rải trong lời NPC, thẻ chương và lời boss. Chưa có đoạn nào nói **vì sao** người chơi phải tu luyện gấp, vì sao yêu thú tụ quanh tông môn, vì sao Kiếm Trủng có vạn kiếm gãy.

### 2.2 Nền truyện đề xuất (tự sáng tác, chưa vào game)

Dưới đây là khung để viết lời thoại và mô tả vật phẩm sau này. Các tên mới (đánh dấu †) **chưa có trong glossary**; khi dùng trong game phải thêm vào `glossary.json` và soát lore trước.

- **Linh khí đang cạn.** Huyền Linh Giới từng có linh mạch chảy khắp núi sông. Nay mạch khô dần từ rìa vào trong; người trong giới gọi đó là kỳ Linh Thoái†. Mỗi đời tu sĩ ra đời trong một thế giới nghèo hơn đời trước.
- **Vân Lam Sơn Mạch là một nhánh mạch còn sống.** Vì thế Lạc Kiếm Tông dựng sơn môn ở đây, và cũng vì thế yêu thú kéo về: chúng cũng cần linh khí. Săn yêu thú không phải việc vặt của tông môn mà là **giành phần linh khí**.
- **Cơ duyên có hạn.** Linh thảo, yêu đan, nội đan Hàn Giao, kiếm cũ trong Kiếm Trủng đều là thứ dùng một lần. Ai tới trước thì được. Đây là lý do của mọi tranh đoạt: giữa người với yêu thú, và sau này giữa người với người.
- **Kiếm Trủng là mộ của một trận tranh mạch.** Vạn thanh kiếm gãy thuộc về các tu sĩ đời trước đã chết khi tranh nhánh mạch này. Kiếm Linh là kiếm ý chưa tan; Thủ Mộ Thạch Tướng giữ lời thề với chủ cũ (khớp lời boss hiện có: "Đá có thể vỡ. Lời thề thì không.").
- **Hàn Giao ngủ trên mắt mạch.** Hồ Sương Mù đóng băng ba trăm năm vì Hàn Giao nằm ngay trên mắt mạch dưới đáy hồ, hút linh khí để ngủ. Nội đan của nó vì thế là chủ dược của Trúc Cơ Đan (khớp nhiệm vụ `q_han_giao`).
- **Động cơ của người chơi.** Đệ tử mới nhập môn đúng lúc mạch yếu đi rõ rệt. Chưởng môn cần người Trúc Cơ trước khi mạch tắt. Mục tiêu MVP (Trúc Cơ) vì thế có lý do trong truyện, không chỉ là thanh tiến độ.

Nguyên tắc viết:

1. Không chép cốt truyện, nhân vật, tông môn, công pháp, địa danh của truyện có sẵn. Chỉ **thang cảnh giới** được mượn (game chơi riêng, không thương mại).
2. Mỗi địa danh có một câu trả lời cho "vì sao chỗ này quý": gắn với linh mạch hoặc một cơ duyên cụ thể.
3. Lời thoại ngắn, có việc. Không hô tên chiêu, không thuật lại lịch sử dài dòng.

### 2.3 Soát lore (theo danh mục của `lore-keeper`, 2026-11-16)

Tôi tự soát theo đúng năm mục của `.claude/agents/lore-keeper.md`. Phiên làm việc này không được gọi subagent, nên **chưa có lượt soát độc lập**; cần chạy `lore-keeper` trên tài liệu này trước khi đưa bất kỳ câu nào ở mục 2.2 vào i18n.

| Mục soát | Kết quả |
| --- | --- |
| Thuật ngữ | Khớp glossary: tu vi, khí huyết, linh lực, linh thạch, đả tọa, ngự kiếm, đột phá, độ kiếp, bình cảnh, tâm ma, linh căn, năm phẩm "Phàm/Linh/Huyền/Địa/Thiên phẩm". Không dùng "chân nguyên", "linh khí" làm tên chỉ số (linh khí chỉ là khái niệm thế giới và tên chiêu Linh Khí Hộ Thể) |
| Thang cảnh giới | `realms.json` có 18 cấp: Ngưng Khí tầng 1–15, Trúc Cơ sơ/trung/hậu kỳ. Glossary có đủ 17 đại cảnh giới. Đầu đề ghi "Kim Đan": đã đổi thành **Kết Đan** |
| Bản quyền | Không có tên nhân vật, tông môn, công pháp, địa danh nào trùng truyện gốc trong i18n hiện có. Tên chiêu "Vạn Kiếm Quy Tông" là cụm quen dùng chung của thể loại, không riêng tác phẩm nào; giữ được |
| Chữ hiển thị | i18n có dấu đủ. Phát hiện: `ui.trib.left` và `ui.bk.in_trial` dùng dấu gạch dài kiểu lời dẫn; `sim.ts` còn vài câu trả lời lệnh GM viết cứng tiếng Việt (chỉ tài khoản thử thấy, chấp nhận) |
| Nhất quán | `q_nhap_mon` nói "Đan Phòng bên trái sân": Tố Tâm ở (2004, 2064), phía tây điểm hồi sinh; trái hay phải tùy hướng người chơi đang nhìn nên nên đổi thành "phía tây sân". `q_truc_co` nói "mở bảng nhân vật để độ kiếp": đúng hiện trạng, sẽ đổi khi có nút Đột Phá trên HUD (PR C) |

---

## 3. Tuyến tân thủ 15 phút

### 3.1 Mục tiêu

Trong 15 phút đầu người chơi phải: (1) hiểu mình là ai và ở đâu, (2) đánh và thắng, (3) **đả tọa dẫn khí một lần có chủ đích**, (4) **bay được** (ngự kiếm ở Ngưng Khí tầng 3), (5) biết đích xa là **Trúc Cơ**.

### 3.2 Hiện trạng theo phút

Số liệu từ `pnpm sim:progress` (2026-11-16) và `quests.json`. Thời gian đi lại ước theo khoảng cách bản đồ M-1 (tông môn → thung lũng ~330 m, chạy ~45 giây).

| Phút | Việc | Nhiệm vụ | Phần thưởng | Ghi chú |
| --- | --- | --- | --- | --- |
| 0:00 | Cảnh mở đầu Lạc Kiếm Tông (bỏ qua được), thẻ chương | | | Đã có (P2-B1) |
| 0:30 | Nói chuyện Lạc Vân chân nhân | `q_nhap_mon` | | Gợi ý `ui.help_hint` chỉ đường |
| 1:00 | Sang Đan Phòng gặp Tố Tâm, nhận kiếm gỗ và áo vải | trả `q_nhap_mon` | Mộc Kiếm, Bố Y, 30 tu vi | **Hẫng 1**: không ai bảo mặc đồ vừa nhận |
| 1:30 | Nhận hai việc: diệt 6 Sói Xám, hái 5 Linh Thảo | `q_diet_soi`, `q_hai_thuoc` | | Hai việc cùng chỗ, tốt |
| 2:30 | Xuống thung lũng, đánh con sói đầu tiên (TTK ~5 giây) | | | **Hẫng 2**: chưa ai dạy đả tọa; mất 11–16% máu mỗi con mà không biết hồi |
| 5:00 | Xong 6 sói + 5 thảo, lên Ngưng Khí tầng 2 | | | |
| 6:00 | Về trả việc, nhận `q_luyen_dan` và `q_ngu_kiem` | | 3 Hồi Xuân Đan, 280 tu vi | Lên tầng 3 ngay khi trả việc |
| 7:00 | Luyện 2 Hồi Xuân Đan ở lò | `q_luyen_dan` | Ngọc bội, Tụ Khí Đan | |
| 8:00 | **Ngự kiếm lần đầu** (phím F) | `q_ngu_kiem` | 250 tu vi | Khoảnh khắc đáng nhớ nhất của 15 phút. **Hẫng 3**: không có thẻ chương, không có nhạc riêng, không có gợi ý Space/X |
| 9:00 | Thiết lão: 8 Thiết Bối Trư | `q_thiet_boi` | Thiết Kiếm, Bí Tịch Tàn Quyển | Bay tới bãi phía nam |
| 14:00 | Ngưng Khí tầng 4–5, **chạm bình cảnh tầng 5** | | | **Hẫng 4**: bình cảnh đầu tiên xuất hiện đúng lúc hết 15 phút mà chưa ai nhắc tới Trúc Cơ |

Chuỗi sau đó (đã có): `q_yeu_lang` (cấp 5) → `q_hoa_van` (8) → `q_thach_vien` (11) → `q_u_minh` (13) → `q_han_giao` (14) → `q_truc_co`. Tổng 12 nhiệm vụ, 25.740 tu vi.

### 3.3 Chỗ hẫng và cách vá

| # | Chỗ hẫng | Vá | Loại thay đổi | Ai làm |
| --- | --- | --- | --- | --- |
| 1 | Nhận kiếm, áo mà không ai bảo mặc | Sau khi trả `q_nhap_mon`: toast gợi ý mở Túi trữ vật (B) và mặc đồ vừa nhận + ô đồ mới nhấp sáng một lần | UI, i18n | PR C |
| 2 | **Không có bước dẫn khí nhập thể**. Đả tọa chỉ nhắc ở bảng trợ giúp | Thêm mục tiêu loại `meditate` vào `q_nhap_mon` (đả tọa 5 giây trước Chính điện) hoặc một nhiệm vụ riêng `q_dan_khi` trước `q_nhap_mon`. Cần thêm loại mục tiêu ở server (`questEvent`) | Nội dung + server (nhỏ) | Sprint 2, gộp vào 3-10 vì đổi tổng tu vi nhiệm vụ |
| 3 | Ngự kiếm lần đầu không có nghi thức | Thẻ chương "Ngự kiếm" lần đầu bay (`chapter.ts` đã có sẵn cơ chế), gợi ý Space lên / X xuống 6 giây | Client, i18n | PR D (nếu kịp) hoặc Sprint 2 |
| 4 | Trúc Cơ không được nhắc tới trước cấp 14 | Lời trả `q_ngu_kiem` thêm một câu về Trúc Cơ; thanh tu vi trên HUD ghi mốc kế tiếp (bình cảnh hoặc độ kiếp) | i18n + UI | PR C (UI), nội dung ở Sprint 2 |
| 5 | Bình cảnh tầng 5 đến mà không có lời dẫn | NPC chưởng môn có câu riêng khi người chơi đang kẹt bình cảnh (`npc.npc_chuong_mon.greet_bk`) | i18n + client | Sprint 2 |
| 6 | Sau tầng 5 mới được chọn công pháp nhưng không nhiệm vụ nào dẫn tới | Nhiệm vụ `q_yeu_lang` thêm mục tiêu `talk` với chưởng môn để mở bảng Công pháp | Nội dung | Sprint 2 |
| 7 | Chuỗi 12 nhiệm vụ đều là "hạ N con". Không có nhiệm vụ nào dùng tổ đội, tỉ thí, pháp bảo, cường hóa | Thêm 3 nhiệm vụ dạy hệ thống (cường hóa một món lên +3; vào Kiếm Trủng; tỉ thí một trận) | Nội dung | M-5 (điểm đáng chú ý) + 3-10 |

**Kết luận**: nhịp 15 phút đầu đã đủ nhanh (bay ở phút thứ 8). Thứ thiếu là **nghi thức** ở ba khoảnh khắc: dẫn khí lần đầu, bay lần đầu, nghe tới Trúc Cơ lần đầu.

---

## 4. Thang cảnh giới

### 4.1 Tổng quan

| Đại cảnh giới | Tiểu cảnh giới | Trạng thái | Cột mốc vượt qua |
| --- | --- | --- | --- |
| **Ngưng Khí** | tầng 1–15 | **Đã có** | Bình cảnh ở tầng 5, 10, 15 (tâm ma hoặc Phá Cảnh Đan) |
| **Trúc Cơ** | sơ kỳ, trung kỳ, hậu kỳ (cấp 16–18) | **Đã có một phần**: đạt được qua độ kiếp; chưa có nội dung riêng | Độ kiếp thiên lôi 40 giây + Trúc Cơ Đan |
| **Kết Đan** | sơ kỳ, trung kỳ, hậu kỳ, đại viên mãn | Thiết kế, **không code** | Ngưng đan (mục 4.4) |
| **Nguyên Anh** | như trên | Thiết kế, **không code** | Toái đan hóa anh (mục 4.5) |

Các cảnh giới sau Nguyên Anh (Hóa Thần → Đạp Thiên) chỉ có tên trong glossary.

### 4.2 Ngưng Khí (đã có)

| Tầng | Mở khóa cơ chế | Thay đổi trực quan hiện có |
| --- | --- | --- |
| 1 | Phi Kiếm Thuật (liên hoàn 3 đòn), Kiếm Khí Trảm | Kiếm trên lưng, rút kiếm khi vào chiến đấu |
| 3 | **Ngự kiếm** (F), Linh Khí Hộ Thể | Phi kiếm dưới chân, vệt kiếm, sương quanh chân khi bay |
| 5 | Thiên Kiếm Vũ; **bình cảnh thứ nhất**; chọn **công pháp** (ô 7, phím Q lướt) | Màu thanh chiêu và thẻ chiêu tối thượng theo công pháp |
| 7 | Hồi Nguyên Thuật | |
| 8 | Chiêu tối thượng của công pháp (ô 8, vòng sạc); vào được Kiếm Trủng | |
| 10 | Lôi Đình Nhất Kiếm; **bình cảnh thứ hai** | |
| 15 | **Bình cảnh thứ ba**, rồi độ kiếp | Thẻ chương "Độ kiếp" |

Còn thiếu: người đứng ngoài **không phân biệt được** Ngưng Khí tầng 2 với tầng 14 nếu không đọc bảng tên. Cảnh giới chưa có hình.

### 4.3 Trúc Cơ (đã đạt được; thay đổi trực quan là việc còn thiếu)

| | Đã có | Còn thiếu (đề xuất trong phạm vi MVP) |
| --- | --- | --- |
| Cơ chế | Cấp 16 sau độ kiếp, hồi đầy, chỉ số theo cấp, phần thưởng `q_truc_co` (Huyền Vân Bào) | Chưa có gì **chỉ Trúc Cơ mới làm được**. Đề xuất nhỏ nhất: ngự kiếm không tốn linh lực khi bay dưới 20 m (đổi một hằng số, thuộc 3-10) |
| Trực quan | Thẻ chương "Trúc Cơ sơ kỳ", hiệu ứng `ascend`, thông báo toàn kênh | **Linh quang hộ thể**: một vòng sáng `spirit_jade` rất mảnh dưới chân khi đứng yên ngoài chiến đấu, chỉ từ Trúc Cơ. Một lưới phẳng dùng lại shader `sigil`, 0 draw call thêm nếu gộp vào pool. Giao **K-6** |
| Bảng tên | `Trúc Cơ sơ kỳ` dòng phụ dưới tên | Màu dòng cảnh giới theo đại cảnh giới (Ngưng Khí: ngà; Trúc Cơ: vàng kim). PR C |

### 4.4 Kết Đan (thiết kế, không code)

- **Chủ đề**: từ "mượn linh khí" sang "giữ linh khí". Đan điền ngưng thành đan, linh lực không còn tán khi ngừng vận công.
- **Thay đổi trực quan**: linh quang hộ thể thành quầng mỏng quanh thân khi vận chiêu, màu theo linh căn ngũ hành. Ngự kiếm không cần đạp lên kiếm: phi kiếm bay cạnh người (ngự khí phi hành), tư thế bay đổi.
- **Cơ chế mở**:
  - **Thần thức**: phím giữ để quét 60 m, lộ quái tinh anh, điểm hái và người chơi đang ẩn trên bản đồ nhỏ trong vài giây.
  - **Bản mệnh pháp bảo**: một pháp bảo phụ được "luyện hóa", lên cấp theo chủ, không tháo ra được.
  - Ô chiêu thứ 9 cho thần thông của công pháp.
- **Cột mốc**: ngưng đan. Khác độ kiếp thiên lôi: thử thách **tĩnh**, người chơi đả tọa giữ nhịp dẫn khí 60 giây trong khi tâm ma và đồng đội (hộ pháp) chống quái tràn vào. Lần đầu tiên một cột mốc cần **người khác bảo vệ mình**.
- **Điều kiện mở trong lộ trình**: có bản đồ thứ hai và ít nhất 20 giờ nội dung Trúc Cơ.

### 4.5 Nguyên Anh (thiết kế, không code)

- **Chủ đề**: thân ngoài thân. Chết không còn là hết.
- **Thay đổi trực quan**: bóng nguyên anh nhỏ hiện sau lưng khi tung chiêu tối thượng; đả tọa lơ lửng khỏi mặt đất; ngự không phi hành không cần kiếm.
- **Cơ chế mở**:
  - **Nguyên anh xuất khiếu**: khi tử vong, nguyên anh thoát ra 10 giây, tự chạy về chỗ an toàn thì hồi sinh tại chỗ với 30% khí huyết, không mất tu vi (mỗi 10 phút một lần).
  - **Thuấn di** tầm ngắn thay chiêu lướt.
  - Lĩnh vực nhỏ của công pháp: vùng 8 m quanh thân có hiệu ứng thụ động.
- **Cột mốc**: toái đan hóa anh, kiếp gồm ba pha (lôi, hỏa, tâm ma), cả tổ đội cùng vào một room riêng.

### 4.6 Nguyên tắc cho mọi đại cảnh giới

1. Mỗi đại cảnh giới đổi **một thứ nhìn thấy từ xa** (linh quang, cách bay) và mở **một cơ chế mới** (không chỉ thêm chỉ số).
2. Cột mốc vượt cảnh giới là sự kiện cả kênh thấy.
3. Hình ảnh theo art bible mục 4.3: linh quang chỉ là điểm nhấn, đỉnh HDR dưới 2,5, tím dưới 5% khung hình.

---

## 5. Độ kiếp Trúc Cơ

### 5.1 Bản hiện có (đã đo trong game, ảnh ở `docs/audit/`)

| Thứ | Giá trị | Nơi |
| --- | --- | --- |
| Điều kiện | Ngưng Khí tầng 15, tu vi đầy, đã vượt bình cảnh tầng 15, có 1 Trúc Cơ Đan (bị tiêu khi bắt đầu), đang ở Vân Lam Sơn Mạch, không tỉ thí | `sim.ts` `onBreakthrough` |
| Thời lượng | **40 giây** (`TRIBULATION_DURATION`) | `formulas.ts` |
| Thiên lôi | Tia đầu sau 3 giây. Mỗi đợt: 1 tia nhắm thẳng người độ kiếp (bán kính 4,2 m, báo trước 1,25 giây, 24% khí huyết tối đa) + 1 đến 4 tia rơi quanh (cách 5–14 m, bán kính 3,6 m, báo trước 1,25–1,85 giây, 20%) | `tickTribulation` |
| Nhịp | Khoảng cách giữa các đợt giảm tuyến tính từ 2,6 giây xuống 1,4 giây; số tia phụ tăng dần | như trên |
| Thành công | Sống hết 40 giây: lên Trúc Cơ sơ kỳ, hồi đầy, thông báo toàn kênh, hiệu ứng `ascend`, thẻ chương | `endTribulation` |
| Thất bại | Chết: mất 15% tu vi của tầng, mất viên đan | `TRIBULATION_FAIL_XP_LOSS` |
| Trình diễn | Letterbox mỏng, mây kiếp xoáy, màu trời tối tím, tia sét theo seed server (mọi người thấy giống nhau), chớp toàn cảnh, rung camera, nhạc `tribulation` | P2-B4, `render/vfx/lightning.ts` |

Thời lượng 40 giây nằm trong khoảng mục tiêu 30–45 giây. Không đổi.

### 5.2 Điểm yếu

1. **Chỉ có một cách chơi**: chạy vòng tròn. Tia nhắm thẳng luôn rơi đúng chỗ đang đứng lúc báo trước, nên chạy đều là né hết; không cần đọc gì.
2. **Không dùng gì đã học**: lướt (Q), Linh Khí Hộ Thể, đan dược, pháp bảo, đồng đội đều không có vai trò riêng. Hộ thể vẫn chặn được sát thương nhưng game không gợi ý.
3. **Không có cao trào**: đợt cuối giống đợt giữa, chỉ dày hơn.
4. **Người đứng xem không làm gì được**, dù cả kênh nhận thông báo.
5. HUD độ kiếp là một khối chữ có emoji tia sét, chưa cùng ngôn ngữ với bộ khung UI.

### 5.3 Đề xuất cải thiện (giữ 40 giây, giữ luật "server quyết định")

Chia 40 giây thành ba pha. Mọi con số dưới đây là **điểm khởi đầu để 3-10 cân**, không phải số chốt.

| Pha | Giây | Thiên lôi | Người chơi phải làm | Công cụ |
| --- | --- | --- | --- | --- |
| 1. Lôi vân tụ | 0–12 | Như hiện tại, thưa | Di chuyển | Chạy |
| 2. Lôi võng | 12–28 | Thêm **tia quét**: vạch thẳng dài 18 m rộng 3 m quét qua chỗ đứng, báo trước 0,9 giây. Chạy thường không kịp ra khỏi vạch | **Lướt (Q)** băng qua vạch. Chiêu lướt hồi 10–12 giây nên pha này có 1–2 lần phải chọn: lướt hay chịu đòn | Thân pháp |
| 3. Diệt thế nhất kích | 28–40 | Một tia lớn báo trước 3 giây, bán kính 9 m quanh người độ kiếp, **không né được** bằng chạy; 70% khí huyết tối đa | **Chống đỡ**: Linh Khí Hộ Thể (hấp thụ 35% khí huyết tối đa), Kim Cương Đan (+15% phòng ngự), Thanh Liên Ấn (khiên tổ đội 4 giây), hoặc khí huyết còn trên 70% | Đan dược, pháp bảo, chiêu hộ thể |

Bổ sung:

- **Hộ pháp**: thành viên tổ đội đứng trong 12 m chịu thay 25% sát thương của tia cuối (chia đều, tối đa 2 người). Người xem có việc để làm, và hợp với vai Hộ pháp của Bất Động Kim Thân.
- **Đan dược có giới hạn**: mỗi lần độ kiếp dùng tối đa 3 viên đan hồi phục (đan độc tích tụ), để không thành cuộc thi uống thuốc.
- **Thất bại nhẹ tay hơn ở lần đầu**: giữ mất 15% tu vi nhưng **hoàn lại Trúc Cơ Đan nếu trụ qua pha 2**. Viên đan cần nội đan Hàn Giao (boss 4 người); mất trắng viên đan là mức phạt nặng nhất game hiện nay và dễ làm nản.
- **HUD**: thay khối chữ bằng thanh tiến trình ba khấc (ba pha) dùng `ProgressBar` của bộ khung, dòng gợi ý đổi theo pha. Việc UI thuộc PR C; logic pha thuộc Sprint 2.

Việc cần làm ở server (Sprint 2, **không thuộc đợt này**): thêm kiểu vùng `line` cho thiên lôi (đã có hình `1 chữ nhật` trong shader `sigil`), thêm pha vào `tickTribulation`, đếm đan đã dùng trong `p.trib`, chia sát thương cho hộ pháp. Phải chạy lại bộ `security` và `netcode-reviewer`.

---

## 6. Ba lối chơi

Ba công pháp chọn ở Ngưng Khí tầng 5 (`methods.json`). Mọi nhân vật dùng chung 6 chiêu gốc; công pháp thêm chiêu lướt (Q), chiêu đặc trưng (ô 7), chiêu tối thượng (ô 8, vòng sạc) và một nội tại.

| | **Kiếm tu** | **Hộ pháp (thể tu)** | **Đan sư** |
| --- | --- | --- | --- |
| Công pháp | Lạc Kiếm Quyết | Bất Động Kim Thân | Thanh Mộc Đan Kinh |
| Bản sắc mong muốn | Tốc độ, bạo kích, dồn sát thương | Cận chiến, khống chế, đứng mũi chịu sào | Tầm xa, hỗ trợ, giữ đội sống |
| Nội tại | **Kiếm ý**: mỗi đòn trúng +1 (tối đa 5, rụng sau 10 giây); Lôi Đình Nhất Kiếm tiêu hết, mỗi điểm +15% | Phòng ngự +15%; **sơn ý**: bị đánh tích điểm (tối đa 5), chiêu sát thương kế tiếp +8% mỗi điểm | Mọi hồi phục +20%; đan dược dùng được lên đạo hữu trong 12 m |
| Lướt (Q) | Kiếm Ảnh Bộ: 8 m tới sát mục tiêu | Thiết Bích Xung: 8 m, húc 120%; mạnh gấp rưỡi sau Trấn Sơn Ấn | Lưu Hương Bộ: lùi 8 m |
| Ô 7 | Phi Kiếm Truy Hồn: 300%, đánh dấu +20% sát thương 8 giây | Trấn Sơn Ấn: khiêu khích 12 m trong 5 giây, 50% | Hồi Xuân Quyết: hồi 40% trong 6 giây cho cả nhóm trong 10 m |
| Ô 8 (tối thượng) | Vạn Kiếm Quy Tông: 550% trong 10 m | Kim Cương Bất Hoại: giảm 60% sát thương 6 giây | Hồi Thiên Đan Lộ: hồi sinh đạo hữu gần nhất, hồi 20% cho người còn đứng |
| Bộ trang bị | Lạc Kiếm Môn Phục | Huyền Giáp Hộ Pháp | Đan Tâm Y Bát |
| Cộng hưởng tổ đội | vai `dps` | vai `tank` | vai `support` |

### 6.1 Đã có và còn thiếu

| Lối chơi | Đã đúng bản sắc | Còn thiếu | Ai làm |
| --- | --- | --- | --- |
| **Kiếm tu** | Kiếm ý thưởng cho đánh liên tục; đánh dấu rồi dồn sát thương; lướt áp sát | **Tốc độ chưa có**: GCD 1 giây như mọi người, không có gì nhanh hơn. **Bạo kích chưa gắn với công pháp** (chỉ từ trang bị và linh căn Kim). Đề xuất: kiếm ý đủ 5 điểm thì +10% bạo kích; đòn thứ ba của liên hoàn hoàn 0,2 giây GCD | 3-10 (số), K-5 (ngôn ngữ động tác nhanh, gọn), K-6 (vệt kiếm bám mũi kiếm) |
| **Hộ pháp** | Khiêu khích, giảm sát thương, lao vào; phá thế boss qua pháp bảo Trấn Hồn Linh | **Khống chế mới chỉ có khiêu khích**: không có choáng, đẩy lùi, làm chậm. Chiêu thường vẫn là *Phi Kiếm Thuật* tầm 26 m nên "thể tu" đứng xa đánh như kiếm tu: **không có cận chiến thật**. Đề xuất: khi tu Bất Động Kim Thân, đòn thường đổi sang biến thể quyền tầm 4 m, sát thương cao hơn 25% (dùng cơ chế `SKILL_ID_ALIASES`/biến thức đã có); Thiết Bích Xung thêm choáng 1 giây lên quái thường | 3-10 (số và luật), K-5 (động tác quyền, trụ vững), K-6 (màu kim, vòng chấn động) |
| **Đan sư** | Hồi nhóm, hồi sinh, ném đan cho đồng đội, lướt lùi để giữ khoảng cách | **Tầm xa chưa khác ai**: mọi người đều đánh 26 m. **Không có sát thương hay khống chế riêng**: đánh một mình chậm hơn hẳn hai công pháp kia. Đề xuất: Hồi Xuân Quyết gieo "mộc độc" lên quái trong vùng (sát thương theo thời gian), tầm đòn thường +4 m | 3-10 (số), K-5 (động tác ấn quyết, tay áo), K-6 (lá, hương, màu ngọc) |

### 6.2 Vấn đề chung của cả ba

1. **Sáu chiêu gốc giống hệt nhau** ở mọi công pháp. Bản sắc chỉ nằm ở 3/9 ô. Biến thức A/B (3-6) là chỗ sẵn có để mỗi công pháp bẻ chiêu gốc theo hướng mình; hiện biến thức không gắn với công pháp.
2. **Ba ngôn ngữ động tác chưa tách** (cùng một bộ pose): đây đúng là phạm vi K-5.
3. **Linh căn ngũ hành chưa có khắc chế** thấy được: `elemDmg` +8% là số ẩn. Số sát thương "khắc chế" (PR C) cần server gửi cờ trong `DmgMsg`; ghi vào roadmap.
4. **Chơi một mình**: sim cho thấy từ tầng 4 trở đi người chơi gần như không mất máu sau khiên và hồi nguyên (cột "mất/lần" 0%). Quái thường chưa tạo áp lực, nên lựa chọn công pháp chưa có hệ quả khi đi một mình. Thuộc 3-10.

---

## 7. Không làm (để giữ vòng lõi chắc)

| Thứ | Lý do |
| --- | --- |
| Bang hội, kết hôn, gia viên, sư đồ | Hệ xã hội lớn; game 50 người chơi riêng với bạn bè, tổ đội 4 người đã đủ |
| Phó bản mới, bản đồ thứ hai | Một bí cảnh chưa được khai thác hết (chưa có nhiệm vụ dẫn vào) |
| Kết Đan, Nguyên Anh trong code | Chỉ thiết kế ở mục 4. MVP dừng ở Trúc Cơ |
| Giao dịch giữa người chơi, đấu giá | `tradable()` đã sẵn nhưng cần chống nhân bản, sổ cái hai chiều; để sau P2-F |
| Soft-lock, đỡ đòn, phản đòn kiểu hành động | Quyết định đã chốt: tab-target, GCD 1 giây |
| Mobile | Quyết định đã chốt: chỉ desktop |
