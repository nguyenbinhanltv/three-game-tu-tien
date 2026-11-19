# Hướng dẫn dựng trang phục bậc 4 và kiếm Tinh Khuyết trên Tripo (Image to 3D)

Áp dụng cho 3 bộ Hóa Thần và dạng cuối + vỏ của Tinh Khuyết Kiếm. Cùng cách làm [bảng bậc 2](../outfit-concepts/README.md) (bản gốc: `huong-dan-tripo-trang-phuc-kiem.md` của phiên điều phối). Thư mục nguồn: **`D:\METAGRIT\dtl-asset-source\`**.

## Luôn dùng ảnh `_front.png`

Ảnh nguyên (`..._v01.png`) có 2 góc nhìn đặt cạnh nhau; Tripo hiểu là 2 vật và dựng ra 2 cái. Ảnh **`..._v01_front.png`** đã cắt sẵn, chỉ một góc chính diện. Ngoại lệ: **vai giáp** và **ủng** vốn là cặp trái và phải, ra 2 mảnh đối xứng là **đúng**.

## Thiết lập chung (mọi mảnh)

| Mục trên Tripo | Đặt |
| --- | --- |
| Chế độ | **Image to 3D**, biểu tượng **ảnh đơn** (ô đầu tiên). Không dùng ô nhiều ảnh |
| HD Model / Smart Mesh | Theo bảng từng mảnh bên dưới |
| AI Model | **H3.1 – Best Quality** |
| Generate in Parts | **Tắt** |
| 8K Texture | **Tắt** (texture mặc định khoảng 2K là đủ) |
| Geometry & Texture | Bật texture, bật PBR nếu có. Có ô giới hạn số mặt thì đặt theo cột "Số mặt" |
| Privacy | Private |
| Rig | **Không gắn xương** (pipeline của worker tự gắn) |
| Generate Multi-Views | Không cần; chỉ dùng khi mặt sau ra xấu |

**Kiểm tra trước khi tải.** Xoay đủ mọi hướng, **dựng lại** nếu: mảnh là tấm mỏng không có độ dày; dính liền với người hoặc ma-nơ-canh; thủng ở cổ, cổ tay, đáy; hoa văn nhòe thành vệt loang; hai bên trái phải lệch nhau.

**Xuất file:** Export → **GLB**. Lưu vào thư mục `tripo\` của từng bộ, tên `raw_<mảnh>_v01.glb`, kèm `raw_<mảnh>_v01.txt` ghi task id Tripo. Dựng lại thì tăng phiên bản `v02`, `v03`.

## Thứ tự làm

1. Tinh Khuyết → Cổ Thành → Thần Tàng → kiếm.
2. Trong mỗi bộ: **áo ngoài trước** (quyết định dáng cả bộ), xong báo "xong áo ngoài <bộ>" để worker mặc thử lên nhân vật trước khi làm 5 mảnh còn lại.
3. Choàng dài là một phần của áo ngoài; nếu Tripo dính choàng vào thân thì dựng lại hoặc báo để tách.

## Bộ 1 · Tinh Khuyết Kiếm Bào (Kiếm tu)

Ảnh trong: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_tinh_khuyet_kiem_bao\concept\`
Lưu vào: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_tinh_khuyet_kiem_bao\tripo\`

| # | Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- | --- |
| 1 | Áo ngoài (áo khoác + choàng dài) | `outfit_tinh_khuyet_ao_ngoai_v01_front.png` | **HD Model** | ~5.000 | `raw_ao_ngoai_v01.glb` |
| 2 | Lớp dưới | `outfit_tinh_khuyet_lop_duoi_v01_front.png` | **HD Model** | ~2.000 | `raw_lop_duoi_v01.glb` |
| 3 | Vai giáp (cặp) | `outfit_tinh_khuyet_vai_giap_v01_front.png` | Smart Mesh | ~1.500 | `raw_vai_giap_v01.glb` |
| 4 | Đai và tua | `outfit_tinh_khuyet_dai_tua_v01_front.png` | Smart Mesh | ~1.200 | `raw_dai_tua_v01.glb` |
| 5 | Ủng (cặp) | `outfit_tinh_khuyet_ung_v01_front.png` | Smart Mesh | ~1.300 | `raw_ung_v01.glb` |
| 6 | Trang sức đầu | `outfit_tinh_khuyet_trang_suc_dau_v01_front.png` | Smart Mesh | ~700 | `raw_trang_suc_dau_v01.glb` |

Choàng dài và viền phân thân mờ: vải đặc, viền phân thân chỉ là đường chỉ nhạt trên texture, không cần tách mesh.

## Bộ 2 · Cổ Thành Huyền Giáp (Hộ pháp)

Ảnh trong: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_co_thanh_huyen_giap\concept\`
Lưu vào: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_co_thanh_huyen_giap\tripo\`

| # | Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- | --- |
| 1 | Áo ngoài (giáp thân + choàng dài) | `outfit_co_thanh_ao_ngoai_v01_front.png` | **HD Model** | ~5.000 | `raw_ao_ngoai_v01.glb` |
| 2 | Lớp dưới (váy giáp tầng tháp) | `outfit_co_thanh_lop_duoi_v01_front.png` | **HD Model** | ~2.000 | `raw_lop_duoi_v01.glb` |
| 3 | Vai giáp (cặp) | `outfit_co_thanh_vai_giap_v01_front.png` | **HD Model (nhiều chi tiết khối)** | ~2.200 | `raw_vai_giap_v01.glb` |
| 4 | Đai và tua | `outfit_co_thanh_dai_tua_v01_front.png` | Smart Mesh | ~1.500 | `raw_dai_tua_v01.glb` |
| 5 | Ủng (cặp) | `outfit_co_thanh_ung_v01_front.png` | Smart Mesh | ~1.500 | `raw_ung_v01.glb` |
| 6 | Trang sức đầu | `outfit_co_thanh_trang_suc_dau_v01_front.png` | Smart Mesh | ~700 | `raw_trang_suc_dau_v01.glb` |

Vai giáp hình lỗ châu mai tường thành là khối nổi thật; nếu Tripo ra tấm phẳng thì dựng lại bằng HD Model.

## Bộ 3 · Thần Tàng Đan Bào (Đan sư)

Ảnh trong: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_than_tang_dan_bao\concept\`
Lưu vào: `D:\METAGRIT\dtl-asset-source\3d\nhan-vat\set_than_tang_dan_bao\tripo\`

| # | Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- | --- |
| 1 | Áo ngoài (đạo bào + choàng sao) | `outfit_than_tang_ao_ngoai_v01_front.png` | **HD Model** | ~5.000 | `raw_ao_ngoai_v01.glb` |
| 2 | Lớp dưới | `outfit_than_tang_lop_duoi_v01_front.png` | **HD Model** | ~2.000 | `raw_lop_duoi_v01.glb` |
| 3 | Vai nhẹ (cặp) | `outfit_than_tang_vai_giap_v01_front.png` | Smart Mesh | ~1.500 | `raw_vai_giap_v01.glb` |
| 4 | Đai, hộp báu và dải lụa | `outfit_than_tang_dai_tua_v01_front.png` | Smart Mesh | ~1.400 | `raw_dai_tua_v01.glb` |
| 5 | Ủng (cặp) | `outfit_than_tang_ung_v01_front.png` | Smart Mesh | ~1.200 | `raw_ung_v01.glb` |
| 6 | Trang sức đầu | `outfit_than_tang_trang_suc_dau_v01_front.png` | Smart Mesh | ~700 | `raw_trang_suc_dau_v01.glb` |

**Choàng sao và dải lụa** (xuyên sáng, tối đa 2 mảnh của bộ) cứ dựng như vải mỏng đặc; worker sẽ đổi sang chất liệu xuyên sáng. Đừng bắt Tripo làm trong suốt.

## Tinh Khuyết Kiếm (dạng cuối +10 và vỏ)

Ảnh trong: `D:\METAGRIT\dtl-asset-source\3d\vu-khi\prop_kiem_tinh_khuyet\concept\`
Lưu vào: `D:\METAGRIT\dtl-asset-source\3d\vu-khi\prop_kiem_tinh_khuyet\tripo\` (thư mục đã có file cũ `raw_v01.glb` của #119: **không ghi đè**, tên mới có hậu tố mảnh)

| Mảnh | Ảnh tải lên | Chế độ | Số mặt | Lưu thành |
| --- | --- | --- | --- | --- |
| Dạng cuối +10 | `outfit_kiem_tinh_khuyet_cuoi_v01_front.png` | **HD Model** | ~2.500 | `raw_cuoi_v01.glb` |
| Vỏ kiếm | `outfit_kiem_tinh_khuyet_vo_v01_front.png` | Smart Mesh | ~1.500 | `raw_vo_v01.glb` |

Kiểm tra riêng cho kiếm: lưỡi thẳng, có độ dày, mũi nhọn; chắn sừng đối xứng hai bên, tia linh khí là sợi kim loại cong dựng cứng quanh chắn; chuôi tròn đều; vỏ kín và vừa dài với lưỡi. Một kiếm dùng chung cho Kiếm tu, Hộ pháp, Đan sư. Kiếm thuộc lớp ngân sách `weapon` (≤ 3.000 mặt, `assets/budgets.json`), nên đừng để Tripo ra nhiều hơn số mặt trong bảng.

## Mẹo

- Mặc định chọn HD Model. Nếu ra quá nhiều mặt thì dùng **Retopo** giảm về khoảng số mặt trong bảng. Smart Mesh chỉ cho mảnh cứng nhỏ; ra thô quá thì dựng lại bằng HD.
- Nam và nữ dùng chung một mảnh: pipeline tự căn theo thân nền từng giới.
- Credit: mỗi lượt Generate trừ credit tài khoản của bạn; Free Retry dựng lại miễn phí một lần.
- Xong mỗi bộ (hoặc chỉ áo ngoài) nhắn "xong áo ngoài Tinh Khuyết", v.v.; worker chạy pipeline T-5 và gửi ảnh duyệt.
