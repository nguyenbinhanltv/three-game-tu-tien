# UI-0 "Ngọc Giản Kim Văn": bảng phong cách và mockup (cần duyệt ảnh)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/ui-ngoc-gian/<file>`.

Chỉ có **ảnh duyệt**, chưa sửa dòng code client nào. UI-1 trở đi chỉ làm sau khi bạn duyệt. Kế hoạch: mục 3 và 6 của "Kế hoạch trùng tu giao diện".

Ảnh gốc (PNG, ~1672×941, 16:9) ở `D:/METAGRIT/dtl-asset-source/2d/ui/ngoc-gian/` kèm `<id>.prompt.txt`; ở đây là bản WebP nén, mockup đã phóng lên 1920×1080 (cố tình để duyệt bố cục, chưa phải ảnh xuất cuối). Sinh bằng Codex: `node tools/codex-assets/ui-ngoc-gian-gen.mjs [id…] [--jobs 2] [--force]` (không Tripo, không API key). Ảnh tham khảo thương mại của bạn chỉ để học nguyên lý, không đưa vào repo, không đưa vào prompt.

## Token

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--ngj-gold` | `#C9A45C` | Chỉ vàng đôi mảnh, góc, đầu mút thanh, chữ tiêu đề trên sơn mài |
| `--ngj-ivory` | `#EDE3CC` | Nền giấy ngà (chất liệu B), chữ trên sơn mài |
| `--ngj-jade` | `#3E9C8F` | Mây cuộn tường vân, nút phụ, thanh linh lực |
| `--ngj-lacquer` | `#1E1712` | Nền sơn mài (chất liệu A), bán trong suốt ~85–92% |

Phẩm chất vật phẩm giữ màu cũ (lục / lam / tím / vàng) nhưng thành **viền phát sáng** quanh ô, không tô đặc ô.

## Các ảnh

### Bảng phong cách (5 trang)

| Ảnh | Nội dung |
| --- | --- |
| `style-01-chat-lieu-goc` | **Chất liệu A** sơn mài huyền (trên nền cảnh để thấy độ trong), **chất liệu B** giấy ngà tường vân; 8 góc (sao, trăng, mặt trời, trơn / mây ngọc bích + hạt ngọc); 2 đường phân cách |
| `style-02-bang-ten` | Bảng tên nét đôi 3 biến thể: Vân Lam (núi xanh, thông, mặt trời), Đoạn Mạch (vách đất son, trăng lưỡi liềm, lau), Vân Hải (đảo mây, hạc, thác); mỗi cái có bản nhỏ giấy ngà, bản HUD sơn mài, và biểu ngữ đột phá có mái đình |
| `style-03-thanh-phan` | Nút chính / phụ / nét / vô hiệu cho cả 2 chất liệu; ô thoi, tròn, bát giác (rỗng, có đồ, chọn, 4 viền phẩm chất); thanh máu, linh lực, tu vi có đầu mút; tab dọc; tooltip; nút đóng; thanh cuộn; viền phẩm chất |
| `style-04-icon-he-thong` | 16 icon hệ thống nét vàng: đả tọa, ngự kiếm, túi, nhân vật, công pháp, tổ đội, nhiệm vụ, bản đồ, cài đặt, thư, cửa hàng, luyện đan, rèn, linh thạch, trang sức đầu (trâm ngọc, thay 👑), đóng |
| `style-05-chu-trien-canh-gioi` | Chữ triện số 1–9 (kèm số thường), bảng cảnh giới "Ngưng Khí / Trúc Cơ / Kết Đan" và thẻ chương "Chương 1/2" với số triện |

### Mockup (kèm ảnh trước)

| Mockup | Trước |
| --- | --- |
| `mock-hud-lac-kiem` (khung nhân vật, minimap, thanh chiêu 9 ô bát giác, nút hệ thống, theo dõi nhiệm vụ, chat, cartouche tên bản đồ) | `truoc-hud-lac-kiem.webp` |
| `mock-hud-van-hai` (thêm thanh boss, cartouche Vân Hải) | (cùng ảnh trước; nền là ảnh chụp Vân Hải `docs/e3i-art/sau/e3i-toan-canh-dao.webp`) |
| `mock-bang-nhan-vat` (giấy ngà tường vân, ô trang bị **thoi**, ô trang sức đầu dùng icon trâm, mô hình 3D giữa vòng đồng tâm, chỉ số) | `truoc-bang-nhan-vat.webp` |
| `mock-chon-cong-phap` (băng chuyền thẻ, thẻ chọn phóng to, vòng tròn đồng tâm nền, số triện, thanh số La Mã) | `truoc-chon-cong-phap.jpg` (bảng Công pháp hiện tại) |

## Kiểm chữ tiếng Việt

Đã đọc từng ảnh: mọi chữ có dấu đúng ("Vân Lam Sơn Mạch", "Đoạn Mạch Cổ Cốc", "Vân Hải Phù Đảo", "Lạc Kiếm Quyết", "Bất Động Kim Thân", "Thanh Mộc Đan Kinh", "Tổng quan", "Trang sức đầu", "Vân ngoa", …).

Lưu ý:
- Mockup **chỉ là hình minh họa**: số liệu, vị trí, cột bị rút gọn (ví dụ bảng Nhân vật chỉ còn 4 dòng chỉ số, tab dọc thay tab ngang). Chữ trong game vẫn đi qua i18n.
- `style-03` có tiêu đề tiếng Anh ("UI Style Sheet", "Control Components") do Codex tự thêm, bỏ qua; nhãn "Chất liệu A / B" cũng chỉ là chú thích.
- Mô tả của thẻ công pháp và bảng chi tiết bên phải ở `mock-chon-cong-phap` là nét giả (không chữ) có chủ ý. Thanh chat trong `mock-hud-*` cũng vậy.
- Chữ triện: số 五 (5) của Codex hơi lạ so với chữ triện chuẩn; khi làm UI-1 sẽ chọn font/glyph triện thật (có giấy phép) thay vì ảnh vẽ.
- Nền `mock-hud-van-hai` là cảnh nhìn từ trên xuống, chưa thấy đảo; chỉ để xem HUD trên nền sáng xanh.

## Đề xuất kỹ thuật cho UI-1

- **Khung bằng SVG + CSS**, không PNG lớn. Mỗi góc là một `<symbol>` SVG nhỏ; đổi màu bằng `currentColor` / biến `--ngj-*`; 4 góc là một component `OrnateCorner` lật bằng `transform: scale(-1,1)`.
- **Panel A (sơn mài)**: `background: rgba(30,23,18,.88)` + `border-image`/hai lớp `box-shadow inset` vàng 1 px và 3 px cách nhau, vân sơn mài là texture lặp WebP < 20 KB (`background-blend-mode: soft-light`), `backdrop-filter` chỉ ở HUD không đổi (tránh tốn GPU).
- **Panel B (giấy ngà)**: texture giấy lặp < 50 KB + viền mây cuộn ngọc bích là SVG 9-slice (`border-image-slice` hoặc 4 góc + 4 cạnh tựa `OrnateCorner`); ngói mây trong nền là một SVG `pattern` độ mờ 6–10%.
- **Cartouche**: SVG 3 lớp (khung nét đôi, họa tiết phong cảnh theo `levelId`, vùng chữ). Họa tiết phong cảnh nhỏ (`motif-van-lam|doan-mach|van-hai.svg`), tối đa ~3 KB mỗi cái; bản sơn mài đổi màu bằng token. Bản vẽ Codex ở `style-02` chỉ làm mẫu, không nhúng.
- **Ô** (`Slot`): `clip-path: polygon()` cho thoi/bát giác, vòng chỉ vàng bằng SVG; viền phẩm chất = `filter: drop-shadow` hoặc `box-shadow` màu phẩm (một lớp, không animation liên tục).
- **Thanh có đầu mút** (`OrnateBar`): hai SVG đầu mút cố định + thân co giãn bằng CSS; phần đầy là `transform: scaleX` hoặc `clip-path`.
- **Icon hệ thống**: 16 icon vẽ lại thành SVG nét 1,5 px đồng độ dày (Codex chỉ cho hình mẫu), gom thành sprite một file, bỏ hết emoji (`👑` ở `character/`).
- **Chữ triện**: dùng font triện có giấy phép OFL cắt tập con (chỉ 一–九 và vài chữ cảnh giới, vài KB), qua `tools/fonts/subset.py`; ngoài ra giữ font serif hiện có cho tiêu đề.
- **Mockup chọn công pháp**: thẻ là CSS 3D nhẹ (`transform: scale + translateZ`), vòng tròn đồng tâm là SVG `<circle>` xoay chậm bằng CSS, tắt khi bật "Giảm chuyển động".
- **Ngân sách**: tổng asset UI mới < 300 KB WebP + SVG; không đẩy CPU quá 1 ms/khung. Tranh minh họa lớn (màn tải, chọn bản đồ) vẫn là chuyện của UI-4, nạp lười.

## Ảnh then chốt

- `mock-hud-lac-kiem.webp`
- `mock-hud-van-hai.webp`
