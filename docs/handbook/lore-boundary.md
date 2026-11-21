# Ranh giới Tiên Nghịch (TN-0)

Game mượn **thang cảnh giới, khái niệm và tên kỹ năng** của Tiên Nghịch; mọi thứ còn lại tự sáng tác. Repo công khai và game phi thương mại, nên ranh giới dưới đây là bắt buộc. Người dùng chốt ngày 2026-11-20. Đây là quy ước thiết kế, không phải tư vấn pháp lý; nếu sau này thương mại hóa thì phải soát lại toàn bộ mức "Cẩn trọng".

## Được dùng gì

| Mức | Gồm | Cách dùng |
| --- | --- | --- |
| **Dùng thẳng** | Thang cảnh giới (`glossary.realms`, 4 Bộ ở `glossary.steps`), thuật ngữ thể loại (linh căn, tâm ma, độ kiếp, cấm chế, trận pháp, hồn phiên, thể tu), khái niệm chung trong `glossary.dao` (Bản Nguyên, pháp tắc, lĩnh vực, ý cảnh, nguyên lực, Cổ Thần) | Giữ tên, cơ chế và mô tả tự viết |
| **Cẩn trọng** | Tên kỹ năng/thần thông gốc (ví dụ Lưu Nguyệt, Sưu Hồn Thuật, Trảm La Quyết); Thiên Nhân Ngũ Suy, Huyền Kiếp, Đạp Thiên Cửu Kiều; 14 Bản Nguyên | Giữ **tên**; cơ chế, mô tả, hiệu ứng tự viết khác hẳn. Thêm vào `glossary.json` và qua subagent `lore-keeper` trước khi vào dữ liệu |
| **Tự đặt** | Tên tông môn, quốc gia, nhân vật, NPC, địa danh, bản đồ, pháp bảo, cốt truyện, nhiệm vụ | Chỉ lấy ý tưởng chung (ví dụ "tông luyện hồn", "quốc gia tu chân xếp cấp"), tên mới hoàn toàn |

## Không được dùng gì

- **Tên nhân vật** của truyện, ở bất kỳ dạng nào (NPC, quái, vật phẩm, lời thoại, id).
- **Nơi khởi đầu** của nhân vật chính: Hằng Nhạc (môn phái), Chu Tước tinh (làm bản đồ/địa danh). "Chu Tước" như một linh thú thì được.
- **Tên tông môn, quốc gia** của truyện. Lấy khái niệm, đặt tên mới.
- **Pháp bảo gắn nhân vật chính**: đổi tên, giữ chức năng chung (ví dụ hạt châu tu luyện gọi là bản mệnh châu với tên riêng của game; cờ chứa hồn chỉ gọi "hồn phiên" kèm tên tự đặt).
- **"Thiên Nghịch"** (đứng riêng hay trong tên ghép), tên truyện và bút danh tác giả trong dữ liệu game và UI.
- **Cốt truyện, tình tiết, câu chữ gốc**: không nhiệm vụ lặp lại tình tiết, không chép hay dịch lại câu mô tả từ truyện, wiki fan hoặc bản dịch.
- **Hình ảnh**: không dùng, không commit ảnh/artwork/khung hình của truyện hay donghua, kể cả làm ảnh tham khảo. Không dùng IP của bên khác.
- Hệ song tu và nội dung người lớn.

## Thuật ngữ đã chốt (`packages/content/data/glossary.json`)

| Khóa | Nội dung | Tên gốc / tự đặt | Ghi chú |
| --- | --- | --- | --- |
| `steps` | Nhất Bộ … Tứ Bộ | gốc | Nhất Bộ: Ngưng Khí → Vấn Đỉnh. Nhị Bộ: Âm Hư → Toái Niết (cuối là Thiên Nhân Ngũ Suy). Tam Bộ: Không Niết → Không Kiếp. Tứ Bộ: Đạp Thiên |
| `dao` | Bản Nguyên, pháp tắc, lĩnh vực, ý cảnh, nguyên lực, Cổ Thần, hồn phiên, hồn lực, cấm chế, Thiên Nhân Ngũ Suy, Huyền Kiếp, Đạp Thiên Cửu Kiều, bán bộ Đạp Thiên | gốc hoặc thuật ngữ thể loại | "nguyên lực" là năng lượng từ Nhị Bộ trở lên, khác "linh lực" (`mp`). "bán bộ Đạp Thiên" là cụm chỉ trạng thái, không phải cảnh giới. "cấm chế" viết thường là khái niệm; "Cấm Chế" viết hoa là tên một Bản Nguyên |
| `dao.path` | Hướng tu | **tự đặt** | hướng tu luyện người chơi chọn (Kiếm tu, Hồn tu, Cổ Thần thể tu…), khung ở VS-3/TN-1 |
| `origins` | 14 Bản Nguyên: Kim, Mộc, Thủy, Hỏa, Thổ, Lôi; Sinh Tử, Nhân Quả, Chân Giả, Luân Hồi; Khởi Nguyên, Tịch Diệt, Cấm Chế, Sát Lục | gốc | 6 nguồn đầu chọn lúc tạo nhân vật, 8 nguồn còn lại mở theo chương (TN-1). `elements` vẫn là ngũ hành cho tới TN-1 |
| `originGroups` | Hành nguyên (6), Lý nguyên (4), Cực nguyên (4) | **tự đặt** | tránh "Thực/Hư" (dễ nhầm cảnh giới Dương Thực, Âm Hư) và "Dị" (dễ nhầm Dị Vực) |
| `huyenKiep` + `huyenKiepGroups` | 9 kiếp, 3 nhóm × 3: Ngoại (Tuyết, Phong, Lôi), Nội (Trảm Ly, Huyết Ảnh, Vấn Tâm), Hồn (Thập Tức Khô Thần, Hồn Thọ, Luân Hồi) | gốc, trừ **Vấn Tâm Kiếp tự đặt** | Nguồn không ghi tên kiếp nội thứ ba, nên bộ 9 tên không trùng khít bản gốc. "Thập Tức Khô Thần" giữ nguyên tên gốc, là ngoại lệ không có hậu tố "Kiếp". "Lôi Kiếp" ở đây là một Huyền Kiếp, khác lôi kiếp đột phá Trúc Cơ đang có. Cơ chế từng kiếp tự thiết kế (TN-6) |
| `cuuKieu` | Đệ Nhất Kiều … Đệ Cửu Kiều | số thứ tự chung | chương cuối (TN-7); thử thách từng cầu tự thiết kế |
| `coThanStars` | Nhất Tinh … Cửu Tinh | gốc | thang thể tu Cổ Thần, trục riêng không đổi sang cảnh giới (TN-5) |

Tên năm ải của Thiên Nhân Ngũ Suy (TN-4, `glossary.nguSuy`) **tự đặt** vì nguồn không ghi: Linh Lực Suy, Nhục Thân Suy, Thần Thức Suy, Thọ Nguyên Suy, Đạo Tâm Suy (ghép từ thuật ngữ thể loại: linh lực, nhục thân, thần thức, thọ nguyên, đạo tâm). Thuật ngữ riêng của chuỗi ở `glossary.nguSuyTerms` cũng tự đặt: suy khí, Linh Nhãn, Tôi Thể Lôi, lôi ẩn, ngưng thần, Thọ Đăng, suy phong, phá vọng, pháp tắc sơ ngộ. Cơ chế từng ải tự thiết kế, không dựa tình tiết nào của truyện; chuỗi `ui.trib.ngu_suy.<ải>` phải khớp `glossary.nguSuy` (`content:check`).

Thuật ngữ riêng của Huyền Kiếp (TN-6, `glossary.huyenKiepTerms`) đều **tự đặt** từ từ ghép thể loại: kiếp lực, cương phong, Dẫn Lôi Trụ, Bản Mệnh Ấn, Huyết Ảnh, Hồn Châu, cung sinh, điều tức. Chín tên kiếp giữ theo `glossary.huyenKiep` (TN-0, trong đó Vấn Tâm Kiếp tự đặt); cơ chế cả chín kiếp tự thiết kế, không dựa tình tiết nào của truyện.

Tên Hán-Việt lấy từ wiki fan, nhiều mục chỉ có một nguồn; khi người dùng sửa thì `glossary.json` là nguồn đúng. Nguồn khái niệm và độ chắc từng mục ghi ở tài liệu kế hoạch nội bộ, không đưa vào lời thoại hay UI.

## Kiểm tự động

- `packages/content/src/lore.ts`: `BANNED_NAMES` (tên truyện, nhân vật, nơi khởi đầu, tông môn, pháp bảo) và `checkLoreTerms` (đủ 14 / 5 / 9 / 9 / 4 / 9 mục, không trùng, ngũ hành khớp `glossary.elements`).
- `pnpm content:check` quét mọi file `.json` và `.md` trong `packages/content/data/` (dữ liệu, `i18n/`, level, fx, cả tên file): khóa và chuỗi nào chứa tên cấm đều báo lỗi kèm vị trí. So dạng có dấu (không phân biệt hoa thường, theo ranh giới từ) và dạng không dấu trong chuỗi thuần ASCII (id như `npc_<tên>`, key i18n).
- Test: `packages/content/src/lore.test.ts`.
- Danh sách cấm chỉ chặn được tên đã liệt kê. Tên quá chung (trùng từ ghép thường gặp) không nằm trong danh sách; `lore-keeper` vẫn phải soát bằng mắt mọi nội dung có tên riêng.

## Quy trình khi thêm tên mới

1. Tên thuộc mức "Cẩn trọng": thêm vào `glossary.json`, gọi `lore-keeper`, rồi mới dùng trong dữ liệu và `i18n/`.
2. Tên tự đặt: kiểm không trùng tên riêng của truyện; nghi ngờ thì đổi tên và nối tên gốc vào `BANNED_NAMES`.
3. Mô tả, lời thoại, cơ chế: viết mới, không dịch hay phỏng theo câu chữ gốc.
4. Chạy `pnpm content:check` và `pnpm test`.
