# Art bible: Đạp Thiên Lộ

Phiên bản 2 · 2026-11-14 · Việc M0-1 trong plan phát triển mới. Người dùng đã duyệt (xem mục 0).

Tài liệu này là chuẩn hình ảnh cho mọi asset vào game: model Tripo, asset thủ tục (bpy, `GeoBuilder`), VFX, icon, UI. Khi ảnh concept, model hay shader lệch với tài liệu này, sửa asset chứ không sửa tài liệu. Muốn đổi chuẩn thì sửa tài liệu trước, ghi lý do ở mục 11.

Nguồn chuẩn đi kèm:

| File | Vai trò |
| --- | --- |
| `assets/palette.json` | 32 màu, nhóm màu, màu áo người chơi, tham số toon. **Nguồn duy nhất**, các nơi khác đọc từ đây |
| `assets/palette.png` | LUT 256×1 (mỗi màu 8 px), sinh bằng `pnpm palette` |
| `tools/palette/gen_palette.mjs` | Kiểm palette (đủ 32 màu, không trùng, ΔE ≥ 8) và sinh LUT; `pnpm palette:check` để kiểm LUT có khớp JSON |
| `docs/prompts/` | Mẫu prompt Codex và Tripo dựa trên tài liệu này |
| `docs/tripo-runbook.md` | Quy trình chạy Tripo (web app và CLI) |

## 0. Quyết định đã duyệt (2026-11-14)

Người dùng duyệt sau PR #6. Đây là quyết định đã chốt, không còn là đề xuất; muốn đổi thì hỏi lại người dùng.

| # | Quyết định | Ghi ở |
| --- | --- | --- |
| 1 | Palette 32 màu trong `assets/palette.json` | mục 4 |
| 2 | **Kiếm Linh giữ hình cáo** (khớp `"model": "fox"` trong `monsters.json`), là cáo linh thể, không phải hình người | mục 2.2, 4.4; `docs/prompts/tripo.md` |
| 3 | 6 màu áo người chơi như mục 4.5 | mục 4.5 |
| 4 | Tripo CLI: hạn mức **300 credit mỗi đợt**, luôn giữ lại **ít nhất 100 credit** | `docs/tripo-runbook.md` mục 1 |
| 5 | File nguồn lớn ở `../dtl-asset-source` (biến `DTL_ASSET_SOURCE`), ngoài repo | `docs/tripo-runbook.md` mục 2 |
| 6 | Ép palette **không dithering**, không có ngoại lệ (thay cho "dithering nhẹ" trong plan mục 2.2) | mục 6.1 |
| 7 | Tripo dựng hình bằng **model v3.1** cho tới khi thử nghiệm M0 xong; chỉ đổi model sau báo cáo M0-6 | `docs/prompts/tripo.md` mục 1 |

---

## 1. Tinh thần

**Thủy mặc cổ phong, low-poly, cel-shaded.** Một bức tranh thủy mặc được dựng thành khối: nền sáng màu giấy ngà, núi xa lam xám tan vào sương, điểm son đỏ và ngói thanh của tông môn, nhân vật màu phẳng có viền mực mảnh.

Ba từ khóa, dùng để tự hỏi khi duyệt một asset:

1. **Thanh** (sáng, thoáng): cảnh nhìn chung sáng và nhạt. Màu đậm chỉ là điểm nhấn. Bóng không bao giờ đen kịt.
2. **Khối** (rõ hình): khối lớn, cạnh vát dứt khoát, đọc được hình dáng từ xa. Chi tiết nhỏ vẽ vào texture.
3. **Mực** (nét): viền mực mảnh ở cận cảnh, càng xa càng nhạt dần như nét mực loang vào sương.

Thế giới hiện có (`docs/screenshots/`) đã đúng hướng về bố cục và màu nền (sân đá ngà, mái ngói thanh, cột son, hoa đào, núi tùng). Asset mới phải hợp với nó, không kéo nó về phía tả thực.

---

## 2. Tỉ lệ và hình khối

### 2.1 Nhân vật người (quyết định 6.1: cách điệu 1:6)

| Thông số | Giá trị |
| --- | --- |
| Chiều cao chuẩn nam | 1,70 m (từ gót đến đỉnh đầu, không tính búi tóc) |
| Chiều cao chuẩn nữ | 1,64 m (cùng bộ xương `rig_human_base`, scale đều 0,965) |
| Tỉ lệ | 6 đầu (đầu khoảng 0,28 m), đầu hơi to so với người thật |
| Vai | rộng khoảng 1,6 đầu ở nam, 1,4 đầu ở nữ |
| Tay | dài hơn người thật một chút, cổ tay mảnh, bàn tay gọn một khối (không tách ngón; ngón cái tách nếu đủ tam giác) |
| Chân | chiếm khoảng 3 đầu; ống quần rộng bó lại ở cổ chân; giày vải đế dày |
| Mặt | mắt to vừa phải, mũi và miệng tối giản (vẽ texture), không có lỗ mũi hay răng bằng hình học |

Hình bóng (silhouette) phải đọc được ở 30 m khi tô đen toàn bộ. Những khối tạo nên hình bóng tu sĩ:

- **Tay áo rộng** buông dưới cổ tay, mép tay áo là một khối riêng để gắn xương `sleeve_l/r`.
- **Búi tóc** (nam: búi cao có trâm; nữ: búi thấp hoặc hai búi) và vài lọn tóc mái là khối lớn, không làm từng sợi.
- **Đai lưng** chia thân trên và vạt áo; vạt áo dài tới bắp chân, xẻ hai bên để chân đi không xuyên áo.
- **Vũ khí** không dính vào model nhân vật. Kiếm, phi kiếm là model riêng gắn vào `socket_hand_r` / `socket_back` (xem `blender-pipeline`).

Tư thế chuẩn để dựng: **A-pose**, tay hạ 45° dưới phương ngang, chân rộng bằng vai, lòng bàn tay úp vào trong, mặt nhìn thẳng. Tay áo rộng dễ dính vào hông khi A-pose, nên ảnh concept phải thấy rõ khe hở giữa tay áo và thân.

### 2.2 Quái và boss

Kích thước, va chạm và tầm đánh lấy từ dữ liệu (`monsters.json`, `shared/level.ts`), **không suy ra từ model**. Đổi model không được làm đổi cảm giác chơi. Tỉ lệ dưới đây chỉ để model khớp mắt với dữ liệu.

| Đối tượng | Kích thước gợi ý | Hình khối |
| --- | --- | --- |
| Sói Xám | dài khoảng 1,5 m, cao vai khoảng 0,8 m | thân thon, mõm dài, đuôi xù một khối, lông vẽ bằng vệt màu lớn |
| Yêu Lang, U Minh Lang | lớn hơn Sói Xám 30–45% (scale 1,3 và 1,45 trong `monsters.json`) | cùng xương với Sói Xám; khác màu và thêm gai lưng, vệt ma khí |
| Thiết Bối Trư | dài khoảng 1,6 m | thân tròn nặng, lưng có giáp sắt dạng tấm |
| Hỏa Vân Hồ | dài khoảng 1,2 m | thon, nhiều đuôi gộp thành 1–3 khối, chóp đuôi phát sáng nhẹ; lông `wood_cinnabar` + `stone_earth`, chóp đuôi `wood_bronze` (màu cam hiện tại trong `monsters.json` không có trong palette) |
| Thạch Viên | cao khoảng 1,8 m khi đứng | vượn khối đá, tay dài chạm đất |
| Kiếm Linh | dài khoảng 1,3 m (scale 1,2) | **cáo linh thể** (đã chốt, khớp `"model": "fox"`): dùng chung xương cáo với Hỏa Vân Hồ; thân thon màu `ink_1`/`stone_far_light`, bán trong suốt; vài thanh kiếm nhỏ là model riêng lơ lửng quanh lưng, phát sáng `spirit_sword` ở mép |
| Boss (Kiếm Khôi, Huyết Lang Vương, Thủ Mộ Thạch Tướng) | lớn gấp 2–3 lần quái thường | hình bóng khác hẳn quái thường, đọc được ở 60 m. Huyết Lang Vương là biến thể của xương sói; Kiếm Khôi và Thủ Mộ Thạch Tướng là biến thể của xương vượn (theo `model` trong `monsters.json`) |
| Hàn Giao | giữ model thủ tục theo đốt trong `models.ts` (quyết định 6.2) | chỉ có thể làm lại phần đầu |

Quái có thêm một quy tắc: **phần nguy hiểm phải dễ thấy**. Nanh, vuốt, đuôi lửa, nắm đấm đá là khối to hoặc sáng hơn phần còn lại.

### 2.3 Hình học chung

- Khối lớn, cạnh vát lớn và rõ. Không bo tròn mềm kiểu đồ chơi nhựa, không làm cạnh sắc mỏng kiểu tả thực.
- **Chi tiết nhỏ hơn khoảng 5 cm vẽ vào texture**, không làm bằng hình học (hoa văn, khuy áo, mắt, ngón chân).
- Mặt phẳng lớn được phép, không cần thêm lưới cho "mượt". Pháp tuyến mềm trên khối cong (thân, đầu), cứng trên cạnh vát (kiếm, mái, đá).
- Không có lưới bên trong bị che khuất (răng, lưỡi, mặt trong tay áo dày) trừ khi thấy được trong game.

### 2.4 Ngân sách tam giác và texture

Theo plan mục 2.4 và quyết định 6.7. Kiểm bằng `asset-validator`.

| Loại | LOD0 / LOD1 / LOD2 (tam giác) | Texture |
| --- | --- | --- |
| Người chơi | **10–12 nghìn** / 4 nghìn / 1,2 nghìn | 1 atlas 1024² (thân + áo), vũ khí 256² |
| NPC | 6–8 nghìn / 2,5 nghìn / — | 512² |
| Quái thường | 3–6 nghìn / 1,5 nghìn / 600 | 512² |
| Boss | 25–40 nghìn / 10 nghìn / — | 2048² hoặc 2×1024² |
| Vũ khí, phi kiếm | 500–1,5 nghìn | 256² hoặc atlas chung |
| Prop (lò đan, rương, linh thảo) | 300–3 nghìn / 40% / 15% | atlas prop chung 2048² |
| Đồ rơi | 200–800 | atlas prop chung |
| Kiến trúc | giữ pipeline bpy thủ tục, **không đưa qua Tripo** | màu đỉnh từ palette |

---

## 3. Viền mực

Viền là thứ khiến model Tripo, địa hình thủ tục và kiến trúc bpy trông cùng một thế giới. Kỹ thuật: inverted hull (vỏ lật pháp tuyến, chỉ vẽ mặt sau) trong material toon M1-6.

| Loại | Độ dày (theo đơn vị thế giới) | Ghi chú |
| --- | --- | --- |
| Người chơi, NPC | 1,2 cm | khoảng 1 px ở 10 m, 3 px ở 4 m (1080p, FOV 60°) |
| Quái thường | 1,5 cm | |
| Boss | 3 cm | |
| Vũ khí, prop, đồ rơi | 0,8 cm | |
| Kiến trúc, địa hình, cây | không dùng vỏ | nếu cần viền thì làm bằng hậu kỳ (post-process) sau, không nhân đôi lưới kiến trúc |
| VFX, phần phát sáng | không viền | |

Quy tắc:

- Màu viền là `ink_5` (`#2B2B2E`), **không** dùng đen thuần `#000000`.
- Chỉ bật ở LOD0. Từ LOD1 trở đi tắt để tiết kiệm draw call và tam giác.
- Viền chịu sương như mọi bề mặt khác, nên ở xa tự nhạt dần vào màu sương. Không cho viền "xuyên sương".
- Độ dày có thể nhân với một hệ số theo khoảng cách để giữ khoảng 1–3 px trên màn hình, nhưng không mỏng hơn 1 px ở LOD0.

---

## 4. Palette 32 màu

Mọi màu albedo trong game phải nằm trong 32 màu dưới đây (sau bước ép palette ở pipeline). Shader được phép làm sáng hoặc tối chúng theo 3 bậc toon (mục 5), cộng sương và giảm bão hòa theo độ sâu; ngoài ra không tự thêm màu.

![Palette](../assets/palette.png)

Ô xem trước có dải bậc trung và bậc bóng: chạy `node tools/palette/gen_palette.mjs --preview <file.png>`.

### 4.1 Bảng màu

| # | id | Hex | Nhóm | Tên | Dùng cho |
| --- | --- | --- | --- | --- | --- |
| 0 | `ink_paper` | `#EDE6D6` | Mực và giấy | Giấy ngà | sương gần, áo trắng ngà, tường vôi, nền UI |
| 1 | `ink_1` | `#B9B6AE` | Mực và giấy | Mực nhạt 1 | đá sân sáng, mây bóng |
| 2 | `ink_2` | `#8A8782` | Mực và giấy | Mực 2 | đá, lông sói sáng |
| 3 | `ink_3` | `#5F5D5C` | Mực và giấy | Mực 3 | đá bóng, lông sói tối, sắt |
| 4 | `ink_4` | `#48464B` | Mực và giấy | Mực 4 | kẽ đá, đế giày, đai lưng tối |
| 5 | `ink_5` | `#2B2B2E` | Mực và giấy | Mực đậm | viền mực, tóc đen, mắt |
| 6 | `stone_far_light` | `#A9BCC8` | Đá và núi | Núi xa nhạt | lớp núi xa nhất |
| 7 | `stone_far` | `#7F9AAE` | Đá và núi | Núi xa | lớp núi giữa, vách đá lạnh |
| 8 | `stone_moss` | `#5E7F86` | Đá và núi | Đá rêu | đá gần có rêu, bờ suối |
| 9 | `stone_earth` | `#CDBF96` | Đá và núi | Đất vàng | đường mòn, cát, rơm, giấy cũ |
| 10 | `leaf_deep` | `#275C3F` | Lá và cỏ | Lá đậm | tán tùng bách, lá trong bóng |
| 11 | `leaf` | `#3A7A4C` | Lá và cỏ | Lá | tán cây thường, thân linh thảo |
| 12 | `leaf_grass` | `#5FA04E` | Lá và cỏ | Cỏ | cỏ, lá non |
| 13 | `leaf_dry` | `#9AA86A` | Lá và cỏ | Cỏ úa | cỏ khô, rêu sáng, sườn núi nắng |
| 14 | `leaf_blossom` | `#F3B6C9` | Lá và cỏ | Hoa đào | hoa đào, hoa linh thảo |
| 15 | `water_deep` | `#16384C` | Nước và sương | Nước sâu | lòng hồ, vực |
| 16 | `water` | `#3D86AD` | Nước và sương | Nước | mặt hồ, suối |
| 17 | `water_mist` | `#CFE0EA` | Nước và sương | Sương lam | chân trời, màu sương, bọt nước |
| 18 | `wood_cinnabar` | `#A8322D` | Gỗ và mái | Son đỏ | cột, lan can, cổng tông môn, dây buộc |
| 19 | `wood_roof` | `#2F5D62` | Gỗ và mái | Ngói thanh | mái ngói, viền áo tông môn |
| 20 | `wood_dark` | `#5A3D2A` | Gỗ và mái | Gỗ tối | xà, thân cây, bao kiếm, chuôi kiếm |
| 21 | `wood` | `#8A6B3C` | Gỗ và mái | Gỗ | sàn gỗ, rương, cán, giỏ tre |
| 22 | `wood_bronze` | `#B8913F` | Gỗ và mái | Đồng thau | lò đan, đầu ngói, hoa văn viền, chắn kiếm |
| 23 | `attire_sect` | `#3B6EA8` | Y phục | Lam tông môn | áo đệ tử Lạc Kiếm Tông |
| 24 | `attire_elder` | `#1F3A5A` | Y phục | Lam trưởng lão | áo khoác trưởng lão, đai lưng đệ tử |
| 25 | `attire_rogue` | `#4E4466` | Y phục | Tím than | tán tu, người ngoài tông môn |
| 26 | `attire_skin` | `#F0CFA8` | Y phục | Da người | da mặt, tay |
| 27 | `spirit_jade` | `#7FE3D0` | Linh quang | Linh khí ngọc | linh khí, đả tọa, linh thảo phát sáng, hồi phục |
| 28 | `spirit_sword` | `#CFF3FF` | Linh quang | Kiếm khí | vệt kiếm khí, phi kiếm, ngự kiếm |
| 29 | `spirit_thunder` | `#B48CFF` | Linh quang | Thiên lôi | thiên lôi độ kiếp, đột phá |
| 30 | `spirit_demonic` | `#4A2B5E` | Linh quang | Ma khí | ma khí, yêu khí, quái biến dị, boss |
| 31 | `spirit_gold` | `#FFD98A` | Linh quang | Kim quang | đồ rơi quý, hoàn thành nhiệm vụ, cường hóa thành công |

Màu được lấy từ các màu đang dùng trong `env.ts`, `terrain.ts`, `sect.ts`, `models.ts`, `entities.ts`, `vfx.ts` rồi gom lại và chỉnh cho đồng nhất. Cặp gần nhau nhất là `water_mist` / `spirit_sword` (ΔE76 = 8,2); hai màu này không bao giờ đứng cạnh nhau trên cùng một vật vì một màu là bề mặt, một màu là phát sáng.

### 4.2 Tỉ lệ màu trong khung hình

- **Khoảng 60% nền trung tính**: giấy ngà, các bậc mực, núi xa, sương lam.
- **Khoảng 30% màu vùng**: lá, gỗ, đất, nước.
- **Khoảng 10% điểm nhấn**: son đỏ, đồng thau, lam tông môn, linh quang.

Một vật đơn lẻ dùng **tối đa 5 màu** palette (không tính viền). Nhân vật thường là 4: da, tóc, áo chính, viền áo hoặc đai.

### 4.3 Quy tắc theo nhóm

- **Linh quang** (#27–#31) chỉ dùng cho phần phát sáng (emissive), VFX và điểm nhấn UI. Không tô thân quái hay áo bằng các màu này. Ngoại lệ: thân cáo của Kiếm Linh được bán trong suốt và ánh `spirit_sword` ở viền.
- **Ma khí** `spirit_demonic` là màu của tà khí và yêu ma: vệt trên quái biến dị (Yêu Lang, U Minh Lang), boss, khí đen. Người chơi không được chọn làm màu áo.
- **Son đỏ** dành cho kiến trúc tông môn và chi tiết nhỏ (dây buộc tóc, tua kiếm). Không dùng làm màu áo chính của NPC tông môn, để cột cổng vẫn là điểm nhấn của cảnh. Người chơi được chọn son đỏ làm màu áo (mục 4.5) vì đó là lựa chọn riêng của họ.
- **Mực đậm** `ink_5` không bao giờ là màu bóng. Bóng do shader tạo ra (mục 5).

### 4.4 Y phục theo phe

| Phe / vai | Màu chính | Màu phụ | Chi tiết |
| --- | --- | --- | --- |
| Đệ tử Lạc Kiếm Tông | `attire_sect` hoặc `ink_paper` | viền `wood_roof` | đai `attire_elder`, giày `ink_4` |
| Trưởng lão, chưởng môn | `ink_paper` | khoác `attire_elder` | hoa văn viền `wood_bronze` |
| Thiết lão (thợ rèn, trông coi Tàng Kiếm Các), Tố Tâm (dược sư Đan Phòng) | `wood` hoặc `stone_earth` | `ink_paper` | tạp dề, túi thuốc `wood_dark` |
| Tán tu, người ngoài | `attire_rogue` | `ink_3` | |
| Yêu thú (sói, heo, cáo, vượn) | `ink_1`…`ink_4`, `stone_earth`, `wood_dark`; Hỏa Vân Hồ dùng `wood_cinnabar` | | mắt `wood_bronze`; nanh `ink_paper` (concept vẽ miệng ngậm để rig, nanh thêm ở texture) |
| Quái biến dị, boss | như yêu thú | vệt `spirit_demonic` | mắt hoặc vết nứt phát sáng `spirit_demonic` / `spirit_thunder` |
| Linh thể (Kiếm Linh dạng cáo, Kiếm Khôi) | Kiếm Linh: `ink_1`, `stone_far_light`; Kiếm Khôi: `ink_3`, `wood_bronze` | phát sáng `spirit_sword` | |

### 4.5 Màu áo người chơi (quyết định 6.4b)

Người chơi chọn giới tính (nam/nữ) và một trong 6 màu áo khi tạo nhân vật. Chỉ vùng áo chính đổi màu; viền, đai, giày giữ nguyên để mọi người chơi vẫn nhận ra là đệ tử Lạc Kiếm Tông.

| Lựa chọn | id | Hex |
| --- | --- | --- |
| Mặc định | `attire_sect` | `#3B6EA8` |
| | `ink_paper` | `#EDE6D6` |
| | `wood_roof` | `#2F5D62` |
| | `wood_cinnabar` | `#A8322D` |
| | `attire_rogue` | `#4E4466` |
| | `ink_4` | `#48464B` |

Kỹ thuật: vùng áo chính trong atlas dùng một màu mặt nạ cố định; material thay màu đó bằng màu áo lúc chạy, nên không cần texture riêng cho từng màu. Danh sách nằm ở `playerDyes` trong `palette.json`; tên hiển thị của từng màu phải đi qua i18n khi làm màn tạo nhân vật.

---

## 5. Ánh sáng và shading (hợp đồng với M1-6)

Material toon dùng chung (`apps/client/src/render/materials/toon.ts`, việc M1-6) áp cho mọi model Tripo **và** cả thế giới hiện có. Các số dưới đây cũng nằm trong khối `toon` của `palette.json`. **Đổi một bên thì phải đổi bên kia trong cùng commit.** Nếu M1-6 chỉnh số khi thử trong game, cập nhật lại bảng này.

### 5.1 Ba bậc sáng

| Bậc | Điều kiện (N·L, đã cộng bóng đổ) | Độ sáng | Pha màu bóng (w) |
| --- | --- | --- | --- |
| Sáng | > 0,45 | 1,00 | 0 |
| Trung | 0,05 – 0,45 | 0,80 | 0,5 |
| Bóng | ≤ 0,05 hoặc nằm trong bóng đổ | 0,58 | 1 |

Công thức, tính trong không gian tuyến tính:

```
out = albedo * bandLuminance[b] * mix(vec3(1), shadowTint, shadowTintStrength * w[b])
shadowTint = #5D6E8A (lam xám), shadowTintStrength = 0.35
```

- **Bóng ngả lam xám, không ngả đen.** Đây là điều quan trọng nhất của phong cách: bóng trên áo trắng ngà phải ra xám lam nhạt, không ra xám bẩn.
- Ranh giới giữa các bậc được làm mềm rất hẹp (khoảng 0,02 theo N·L) để không bị răng cưa, nhưng vẫn phải đọc là hai mảng màu.
- Không có specular, không phản xạ môi trường, không rim light trắng. Riêng phi kiếm và vũ khí phẩm cao được phép có một dải highlight `spirit_sword` cứng, vẽ vào texture hoặc phát sáng, không tính bằng ánh sáng.

### 5.2 Nguồn sáng

| Nguồn | Giá trị | Ghi chú |
| --- | --- | --- |
| Mặt trời | `#FFF0D6`, một đèn hướng duy nhất | trùng `env.ts` hiện tại; góc cao khoảng 50°, chiếu chéo để mặt người luôn có hai bậc |
| Ánh trời | `#CFE0EA` | dùng cho phần không nhận nắng; thay cho hemisphere light hiện tại khi chuyển sang toon |
| Bóng đổ | một shadow map từ mặt trời | nhân vật LOD2 tắt bóng đổ; quái và nhân vật có bóng tròn mờ dưới chân (blob) ở mọi LOD |

Ánh sáng thay đổi theo thời gian trong ngày (nếu sau này làm) chỉ được đổi màu mặt trời và ánh trời, không đổi palette hay độ sáng các bậc.

### 5.3 Sương và chiều sâu

- Màu sương là `water_mist` `#CFE0EA` (trùng `SKY_HORIZON` trong `env.ts`).
- Giảm bão hòa theo độ sâu: bắt đầu ở 60 m, đạt 55% ở 600 m. Núi xa gần như chỉ còn sắc lam xám như nét mực loang.
- Sương theo độ cao: thung lũng và hồ có sương dày hơn đỉnh núi.

### 5.4 Phát sáng và bloom

- Chỉ phần dùng nhóm linh quang mới phát sáng.
- Đỉnh màu HDR giữ dưới 2–3 lần khi có bloom (M1-7), để không lóa trắng. Bloom chỉ bắt vật phát sáng, không làm mờ cả cảnh.
- Preset Thấp tắt bloom; khi đó phần phát sáng vẫn phải đọc được nhờ màu.

---

## 6. Texture

- **Màu phẳng.** Mỗi vùng là một màu palette. Được phép có hoa văn đơn giản (viền mây, sóng nước, triện tròn không có chữ) bằng một màu palette khác.
- **Không vẽ ánh sáng vào texture**: không AO nướng sẵn, không highlight, không gradient sáng tối, không bóng dưới nếp áo. Shader lo phần sáng tối. Đây là lý do yêu cầu Tripo xuất texture tiêu chuẩn, không HD, không PBR.
- **Chỉ có map màu (albedo).** Bỏ normal, roughness, metalness, AO của Tripo trong pipeline.
- **Không nhiễu vải, vân gỗ chi tiết hay lỗ chân lông.** Vân gỗ, vân đá nếu cần là 2–3 vệt màu palette lớn.
- Mật độ điểm ảnh gợi ý: nhân vật người chơi khoảng 400 px/m, NPC và quái khoảng 200 px/m, prop khoảng 150 px/m. Mặt nhân vật được ưu tiên diện tích UV gấp đôi.
- Asset thủ tục (địa hình, cây, kiến trúc) dùng màu đỉnh lấy từ palette, hoặc UV trỏ vào ô màu trong `palette.png` (`u = (index + 0.5) / 32`).

### 6.1 Ép palette trong pipeline (M2)

Bước ép palette trong `import_tripo.py` hoặc `optimize.ts` dùng `assets/palette.json`:

1. Làm phẳng texture (bỏ nhiễu nhỏ) rồi gom màu bằng k-means.
2. Ánh xạ mỗi cụm về màu palette gần nhất theo khoảng cách Lab. Chỉ xét các nhóm hợp với loại asset (ví dụ quái không lấy nhóm linh quang, trừ vùng đã đánh dấu phát sáng).
3. **Không dithering** (đã chốt, không có ngoại lệ): dithering tạo nhiễu hạt trái với phong cách màu phẳng. Asset nào bị vệt bậc thang sau khi ép thì sửa vùng màu trong concept hoặc texture, không bật dithering.
4. Sau khi ép, 100% điểm ảnh albedo phải là một trong 32 màu (hoặc màu mặt nạ áo của người chơi). `asset-validator` kiểm điều này.

---

## 7. VFX và UI

- VFX dùng nhóm linh quang, cộng sáng. Mỗi loại chiêu có một màu chủ đạo: kiếm khí `spirit_sword`, hồi phục và đả tọa `spirit_jade`, độ kiếp `spirit_thunder`, chiêu của quái biến dị và boss `spirit_demonic`, rơi đồ quý `spirit_gold`.
- Hình dạng VFX lấy cảm hứng từ nét bút: vệt kiếm khí dày ở giữa và thon hai đầu như một nét mực; vòng pháp trận là vòng tròn mảnh có vạch, không phải lưới tròn đặc.
- UI: nền `ink_paper` hoặc mực trong suốt, viền `wood_bronze` mảnh, chữ `ink_5`. Thanh khí huyết, linh lực vẽ bằng code (`assets.md`), không dùng ảnh sinh. Tiêu đề "Đạp Thiên Lộ" dựng bằng font thư pháp; ảnh sinh chỉ dùng cho nền và hoa văn.
- Mọi chuỗi hiển thị đi qua i18n; tên lấy từ `packages/content/data/glossary.json`.

---

## 8. Những điều cấm

1. Màu ngoài palette trong albedo sau khi ép palette.
2. Bóng đen thuần, viền đen thuần `#000000`.
3. Texture có ánh sáng nướng sẵn, AO, highlight, PBR (normal, roughness, metalness).
4. Tả thực: da có lỗ chân lông, vải có sợi, tóc từng sợi, tỉ lệ người thật 1:7,5 trở lên.
5. Chibi 1:4 hoặc đầu to quá mức.
6. Ảnh concept có hiệu ứng phát sáng, hạt, khói, tia điện: Tripo sẽ dựng chúng thành khối thật.
7. Vũ khí liền với model nhân vật.
8. Màu linh quang tô trên thân thường (áo, lông, đá).
9. Kiến trúc đi qua Tripo.
10. Nêu tên game, phim, tranh, họa sĩ, studio có thật trong prompt; chép nhân vật hoặc trang phục nhận diện được của tác phẩm khác (kể cả của bộ truyện mà thang cảnh giới tham khảo).
11. Chữ Hán, chữ Việt hay ký hiệu có nghĩa vẽ trên model hay texture (ảnh sinh hay viết sai). Triện, bùa dùng hoa văn không đọc được.
12. Kiểu dáng phương Tây lạc tông: giáp tấm kiểu hiệp sĩ, áo choàng có mũ trùm kiểu phù thủy, quỷ có cánh dơi, khung trang trí gô-tích.

---

## 9. Kiểm tra trước khi một asset vào game

- [ ] Ảnh xem trước đặt cạnh nhân vật chuẩn 1,70 m và một mảnh sân tông môn (trang `?viewer=asset`, việc M0-4).
- [ ] Hình bóng tô đen đọc được ở 30 m (boss 60 m).
- [ ] Albedo 100% thuộc palette; không còn normal/roughness/metalness.
- [ ] Số tam giác và kích thước texture trong ngân sách mục 2.4.
- [ ] Hướng, tỉ lệ, gốc ở chân đúng quy ước `blender-pipeline` (Y lên, 1 unit = 1 m).
- [ ] Viền mực hiện đúng độ dày, tắt ở LOD1.
- [ ] Đã ghi vào `assets/LICENSES.md` và `meta.json` có task id.
- [ ] `asset-validator` không còn lỗi.

---

## 10. Chỉnh sửa palette

1. Sửa `assets/palette.json` (giữ đủ 32 màu, giữ thứ tự index; đổi màu thì giữ id nếu vai trò không đổi).
2. `pnpm palette` để kiểm và sinh lại `assets/palette.png`. Script dừng nếu hai màu quá gần nhau (ΔE76 < 8).
3. Cập nhật bảng 4.1 trong tài liệu này.
4. Nếu đổi khối `toon`, cập nhật mục 5 và `toon.ts` trong cùng commit.
5. Asset đã ép palette theo bản cũ phải ép lại (pipeline chạy lại được từ nguồn).

## 11. Nhật ký thay đổi

| Ngày | Phiên bản | Thay đổi |
| --- | --- | --- |
| 2026-11-14 | 1 | Bản đầu (M0-1): tỉ lệ 1:6, palette 32 màu, hợp đồng toon với M1-6, quy tắc texture và điều cấm |
| 2026-11-14 | 2 | Ghi 7 quyết định người dùng đã duyệt (mục 0): Kiếm Linh giữ hình cáo, không dithering tuyệt đối, palette và màu áo đã chốt |
