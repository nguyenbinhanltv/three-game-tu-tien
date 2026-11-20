# Giấy phép asset

> Đường dẫn nguồn dạng `2d/icons/…` và `icons/…` trong các bảng icon bên dưới là bản cũ, nay nằm ở `../dtl-asset-source-luu-tru/` (ASSET-CLEAN 2026-11-19); atlas hiện tại lấy từ `2d/icon/v2/png256/`. Các đường dẫn khác tính từ gốc cây nguồn mới (`3d/`, `2d/`, `audio/`…).

## Màn tải và chất liệu UI 2D Codex (2026-11-16)

Sinh bởi công cụ tạo ảnh tích hợp Codex cho dự án Đạp Thiên Lộ (`tools/codex-assets/gen.mjs loading|ui`, chủ thể ở `tools/codex-assets/loading.json`, `ui.json`), thiết kế gốc, không dùng Tripo hay dịch vụ ngoài. PNG gốc + prompt ở `<DTL_ASSET_SOURCE>/2d/<nhóm>/<id>.png` và `<id>.prompt.txt`. Đóng gói bằng `tools/codex-assets/pack.mjs loading ui` thành WebP ở `apps/client/public/assets/art/` (nạp lười).

| ID | Nguồn | Giấy phép | Ngày | Tệp |
| --- | --- | --- | --- | --- |
| `ho_suong_mu` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/ho_suong_mu.png` |
| `kiem_trung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/kiem_trung.png` |
| `rung_linh_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/rung_linh_thao.png` |
| `suoi_thanh_khe` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/suoi_thanh_khe.png` |
| `thung_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/thung_lung.png` |
| `title` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/title.png` |
| `tong_mon` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/tong_mon.png` |
| `vach_da_ngoc` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/nen/loading/vach_da_ngoc.png` |
| `corner_ornament` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/ui/ui/corner_ornament.png` |
| `map_bg` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/ui/ui/map_bg.png` |
| `paper_tile` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/ui/ui/paper_tile.png` |
| `seal_red` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/ui/ui/seal_red.png` |

## Chân dung 2D Codex (2026-11-16)

Sinh bởi công cụ tạo ảnh tích hợp Codex cho dự án Đạp Thiên Lộ (`tools/codex-assets/gen.mjs portraits`, chủ thể ở `tools/codex-assets/portraits.json`), thiết kế gốc, không dùng Tripo hay dịch vụ ngoài. PNG gốc + prompt ở `<DTL_ASSET_SOURCE>/2d/chan-dung/portraits/<id>.png` và `<id>.prompt.txt`. Đóng gói bằng `tools/codex-assets/pack.mjs portraits` thành WebP 480×640 ở `apps/client/public/assets/art/portraits/` (nạp lười).

| ID | Nguồn | Giấy phép | Ngày | Tệp |
| --- | --- | --- | --- | --- |
| `boss_han_giao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/boss_han_giao.png` |
| `boss_huyet_lang_vuong` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/boss_huyet_lang_vuong.png` |
| `boss_kiem_khoi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/boss_kiem_khoi.png` |
| `boss_thu_mo_tuong` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/boss_thu_mo_tuong.png` |
| `elite_cu_nham_vien` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/elite_cu_nham_vien.png` |
| `elite_huyet_nha_lang` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/elite_huyet_nha_lang.png` |
| `elite_xich_dien_ho` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/elite_xich_dien_ho.png` |
| `npc_chuong_mon` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/npc_chuong_mon.png` |
| `npc_duoc_su` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/npc_duoc_su.png` |
| `npc_thiet_lao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/chan-dung/portraits/npc_thiet_lao.png` |

## Icon UI M4-7

Sinh bởi công cụ tạo ảnh tích hợp Codex cho dự án Đạp Thiên Lộ. Không dùng tài sản hoặc khung icon của guizang. PNG gốc ở `<DTL_ASSET_SOURCE>/2d/icon/v1/<id>.png`; prompt tại `docs/prompts/codex.md` mục 9, chủ thể tại `tools/icons/subjects.json`. Atlas 128px/ô: `apps/client/public/assets/ui/icons.*.webp`. Manifest lưu SHA-256 và dung lượng từng PNG nguồn.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `skl_phi_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_phi_kiem.png` |
| `skl_kiem_khi_tram` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_kiem_khi_tram.png` |
| `skl_linh_khi_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_linh_khi_ho_the.png` |
| `skl_thien_kiem_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_thien_kiem_vu.png` |
| `skl_hoi_nguyen_thuat` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_hoi_nguyen_thuat.png` |
| `skl_loi_dinh_nhat_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_loi_dinh_nhat_kiem.png` |
| `itm_linh_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_linh_thao.png` |
| `itm_huyet_linh_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyet_linh_chi.png` |
| `itm_nanh_soi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_nanh_soi.png` |
| `itm_yeu_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_yeu_dan.png` |
| `itm_thiet_tinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thiet_tinh.png` |
| `itm_han_giao_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_giao_dan.png` |
| `itm_kiem_phach` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_kiem_phach.png` |
| `itm_truc_co_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_truc_co_dan.png` |
| `skl_kiem_anh_phan_quang` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_kiem_anh_phan_quang.png` |
| `skl_van_kiem_quy_tong` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_van_kiem_quy_tong.png` |
| `skl_tran_son_an` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_tran_son_an.png` |
| `skl_kim_cuong_bat_hoai` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_kim_cuong_bat_hoai.png` |
| `skl_xuan_phong_hoa_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_xuan_phong_hoa_vu.png` |
| `skl_hoi_thien_dan_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_hoi_thien_dan_lo.png` |
| `itm_bi_tich_tan_quyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_bi_tich_tan_quyen.png` |
| `itm_tu_kim_ho_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tu_kim_ho_lo.png` |
| `itm_tran_hon_linh` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tran_hon_linh.png` |
| `itm_thanh_lien_an` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thanh_lien_an.png` |
| `itm_kim_cuong_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_kim_cuong_dan.png` |
| `itm_bao_huyet_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_bao_huyet_dan.png` |
| `itm_manh_luc_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_manh_luc_dan.png` |
| `itm_dai_lung_da` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dai_lung_da.png` |
| `itm_dai_lung_ngoc` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dai_lung_ngoc.png` |
| `itm_dai_lung_vai` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dai_lung_vai.png` |
| `itm_dt_dai_lung` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dt_dai_lung.png` |
| `itm_dt_dao_bao` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dt_dao_bao.png` |
| `itm_dt_gioi_chi` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dt_gioi_chi.png` |
| `itm_dt_ngoc_boi` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_dt_ngoc_boi.png` |
| `itm_gioi_chi_dong` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_gioi_chi_dong.png` |
| `itm_hg_dai_lung` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hg_dai_lung.png` |
| `itm_hg_dao_bao` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hg_dao_bao.png` |
| `itm_hg_ho_uyen` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hg_ho_uyen.png` |
| `itm_hg_van_ngoa` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hg_van_ngoa.png` |
| `itm_hgl_dao_bao` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hgl_dao_bao.png` |
| `itm_hgl_gioi_chi` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hgl_gioi_chi.png` |
| `itm_hgl_kiem` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_hgl_kiem.png` |
| `itm_ho_uyen_da` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ho_uyen_da.png` |
| `itm_ho_uyen_thiet` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ho_uyen_thiet.png` |
| `itm_ho_uyen_vai` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ho_uyen_vai.png` |
| `itm_lk_dai_lung` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_lk_dai_lung.png` |
| `itm_lk_dao_bao` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_lk_dao_bao.png` |
| `itm_lk_ho_uyen` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_lk_ho_uyen.png` |
| `itm_lk_van_ngoa` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_lk_van_ngoa.png` |
| `itm_ngoc_boi_linh` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ngoc_boi_linh.png` |
| `itm_ngoc_boi_moc` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ngoc_boi_moc.png` |
| `itm_ngoc_boi_thanh` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_ngoc_boi_thanh.png` |
| `itm_van_ngoa_da` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_van_ngoa_da.png` |
| `itm_van_ngoa_vai` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_van_ngoa_vai.png` |
| `itm_van_ngoa_van` | Dựng thủ tục bằng Blender cho dự án (`tools/icons/render_equipment.py`) | dự án | 2026-11-16 | `icons/itm_van_ngoa_van.png` |
| `itm_hoi_xuan_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_hoi_xuan_dan.png` |
| `itm_hoi_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_hoi_khi_dan.png` |
| `itm_tu_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tu_khi_dan.png` |
| `itm_moc_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_moc_kiem.png` |
| `itm_thiet_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thiet_kiem.png` |
| `itm_thanh_phong_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thanh_phong_kiem.png` |
| `itm_han_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_quang_kiem.png` |
| `itm_tram_ta_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tram_ta_kiem.png` |
| `itm_bo_y` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_bo_y.png` |
| `itm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_dao_bao.png` |
| `itm_linh_ti_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_linh_ti_bao.png` |
| `itm_huyen_van_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyen_van_bao.png` |
| `itm_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_ngoc_boi.png` |
| `itm_huyen_thiet_gioi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyen_thiet_gioi.png` |
| `itm_han_giao_hoan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_giao_hoan.png` |


Mỗi asset đi vào game (mọi GLB trong `apps/client/public/assets/manifest.json`) phải có **đúng một dòng** trong bảng dưới. `pnpm assets:validate` báo lỗi nếu thiếu. Cột đầu ghi asset id trong dấu `` ` ``.

- **Nguồn**: Tripo (web app gói Max / API trả phí), Codex (ảnh concept), CC0 (ghi tên gói), tự sinh bằng script (ghi đường dẫn script).
- **Giấy phép**: mã SPDX nếu là giấy phép mở (`CC0-1.0`, `CC-BY-4.0`…); asset dự án tự làm hoặc sinh bằng dịch vụ trả phí ghi `dự án`.
- **Chi tiết**: task id Tripo, URL gói CC0, yêu cầu ghi công nếu có. Chi tiết đầy đủ nằm trong `assets/source/<loại>/<id>/meta.json`.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `arch_sect` | Tự sinh bằng script `tools/blender/build_sect.py` (Blender headless) | dự án | 2026-11-12 | Kiến trúc Lạc Kiếm Tông; không có texture, chỉ màu đỉnh |
| `arch_thien_khuyet` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/thien_khuyet_arch.py` (Blender headless) | dự án | 2026-11-19 | Kiến trúc Thiên Khuyết (bậc thang, Cổng Tiên Vỡ, tiên cung, cột, tượng thần đổ); texture thủ tục của kit |
| `prop_tc_xuong_cu_thu` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Xương cự thú thu nhỏ |
| `prop_tc_xuong_cu_thu_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Xương cự thú thu nhỏ (biến thể 2) |
| `prop_tc_cot_ta_mau_tim` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Cột tà màu tím |
| `prop_tc_cot_ta_mau_tim_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Cột tà màu tím (biến thể 2) |
| `prop_tc_tinh_the_tim` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Tinh thể tím |
| `prop_tc_tinh_the_tim_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Tinh thể tím (biến thể 2) |
| `prop_tc_chan_dong_do_nat` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Chân đồng đổ nát phương Tây |
| `prop_tc_chan_dong_do_nat_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Chân đồng đổ nát phương Tây (biến thể 2) |
| `prop_tc_co_rach` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Cờ rách |
| `prop_tc_co_rach_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_di_vuc.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm di_vuc: Cờ rách (biến thể 2) |
| `prop_tc_xich_bua` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Dây xích bùa |
| `prop_tc_xich_bua_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Dây xích bùa (biến thể 2) |
| `prop_tc_tran_do_khac_san` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Trận đồ khắc sàn |
| `prop_tc_tran_do_khac_san_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Trận đồ khắc sàn (biến thể 2) |
| `prop_tc_cot_tran` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Cột trận |
| `prop_tc_cot_tran_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Cột trận (biến thể 2) |
| `prop_tc_te_dan` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Tế đàn |
| `prop_tc_te_dan_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Tế đàn (biến thể 2) |
| `prop_tc_bia_tran` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Bia trận |
| `prop_tc_bia_tran_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Bia trận (biến thể 2) |
| `prop_tc_linh_thach` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Linh thạch |
| `prop_tc_linh_thach_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tran_phap.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tran_phap: Linh thạch (biến thể 2) |
| `prop_tc_goc_cay` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Gốc cây mục |
| `prop_tc_goc_cay_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Gốc cây mục (biến thể 2) |
| `prop_tc_da_reu` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Đá phủ rêu |
| `prop_tc_da_reu_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Đá phủ rêu (biến thể 2) |
| `prop_tc_da_linh_khi` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Đá linh khí |
| `prop_tc_da_linh_khi_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Đá linh khí (biến thể 2) |
| `prop_tc_tre` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Tre |
| `prop_tc_tre_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Tre (biến thể 2) |
| `prop_tc_cay_co_thu` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Cây cổ thụ uốn lượn |
| `prop_tc_cay_co_thu_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Cây cổ thụ uốn lượn (biến thể 2) |
| `prop_tc_linh_thao` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Linh thảo phát sáng |
| `prop_tc_linh_thao_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Linh thảo phát sáng (biến thể 2) |
| `prop_tc_nam_phat_sang` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Nấm phát sáng |
| `prop_tc_nam_phat_sang_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Nấm phát sáng (biến thể 2) |
| `prop_tc_mo_co` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Mộ cổ |
| `prop_tc_mo_co_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Mộ cổ (biến thể 2) |
| `prop_tc_cot_da_do` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Cột đá đỏ |
| `prop_tc_cot_da_do_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Cột đá đỏ (biến thể 2) |
| `prop_tc_re_cay` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Rễ cây |
| `prop_tc_re_cay_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Rễ cây (biến thể 2) |
| `prop_tc_kho_go` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Khô gỗ |
| `prop_tc_kho_go_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_hoang_da.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm hoang_da: Khô gỗ (biến thể 2) |
| `prop_tc_sap_hang` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Sạp hàng |
| `prop_tc_sap_hang_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Sạp hàng (biến thể 2) |
| `prop_tc_vo_ruou` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Vò rượu |
| `prop_tc_vo_ruou_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Vò rượu (biến thể 2) |
| `prop_tc_gio_thuoc` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Giỏ thuốc |
| `prop_tc_gio_thuoc_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Giỏ thuốc (biến thể 2) |
| `prop_tc_long_den_giay` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Lồng đèn giấy |
| `prop_tc_long_den_giay_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Lồng đèn giấy (biến thể 2) |
| `prop_tc_xe_keo` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Xe kéo |
| `prop_tc_xe_keo_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Xe kéo (biến thể 2) |
| `prop_tc_thung_go` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Thùng gỗ |
| `prop_tc_thung_go_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Thùng gỗ (biến thể 2) |
| `prop_tc_hang_rao_tre` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Hàng rào tre |
| `prop_tc_hang_rao_tre_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Hàng rào tre (biến thể 2) |
| `prop_tc_gieng_nuoc` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Giếng nước |
| `prop_tc_gieng_nuoc_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Giếng nước (biến thể 2) |
| `prop_tc_lu_nuoc` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Lu nước |
| `prop_tc_lu_nuoc_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_cho_lang.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm cho_lang: Lu nước (biến thể 2) |
| `prop_tc_dinh_lu_dong` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Đỉnh lư đồng |
| `prop_tc_dinh_lu_dong_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Đỉnh lư đồng (biến thể 2) |
| `prop_tc_gia_kiem` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Giá kiếm |
| `prop_tc_gia_kiem_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Giá kiếm (biến thể 2) |
| `prop_tc_bia_khac` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Bia khắc chữ |
| `prop_tc_bia_khac_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Bia khắc chữ (biến thể 2) |
| `prop_tc_co_phuong` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Cờ phướn |
| `prop_tc_co_phuong_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Cờ phướn (biến thể 2) |
| `prop_tc_lo_luyen_dan` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Lò luyện đan |
| `prop_tc_lo_luyen_dan_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Lò luyện đan (biến thể 2) |
| `prop_tc_chuong_dong` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Chuông đồng |
| `prop_tc_chuong_dong_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Chuông đồng (biến thể 2) |
| `prop_tc_trong` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Trống |
| `prop_tc_trong_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Trống (biến thể 2) |
| `prop_tc_den_da` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Đèn đá |
| `prop_tc_den_da_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Đèn đá (biến thể 2) |
| `prop_tc_lu_huong` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Lư hương |
| `prop_tc_lu_huong_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Lư hương (biến thể 2) |
| `prop_tc_ban_ghe_da` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Bàn ghế đá |
| `prop_tc_ban_ghe_da_2` | Tự sinh bằng bộ kit `tools/blender/thien_cong_kit.py` + `tools/blender/prop_tc_tong_mon.py` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm tong_mon: Bàn ghế đá (biến thể 2) |
| `arch_kiem_trung` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Kiếm Trủng (cự kiếm, vành núi đá, mộ, bia, cột gãy, bậc đá, xương, giáp vụn); texture thủ tục của kit |
| `arch_phuc_mach` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/phuc_mach_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Phục Mạch Quật (cụm mạch tinh, cột sa thạch, khung chống gỗ, cửa hầm, ray, xe quặng, nhũ đá, mạch tinh treo trần); texture thủ tục của kit |
| `arch_kinh_nguyet` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/kinh_nguyet_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Kính Nguyệt Cung (hàng cột vòm gương, vòng gương trăng, mảnh gương, dây chuông treo trần, chậu sen); texture thủ tục của kit |
| `arch_than_tang` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/than_tang_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Thần Tàng Điện (tường hốc vòm, ba cửa phong ấn, tượng võ sĩ không mặt, đống kim ngân, đèn chùm, mặt nạ vô diện); texture thủ tục của kit |
| `arch_xich_tan` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/xich_tan_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Xích Tẫn Khích (cột bazan lục giác, obsidian, vỏ dung nham nguội, miệng phun, cây cháy, cột cờ gãy, xương, lò sắt); texture thủ tục của kit |
| `arch_do_kiep` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/do_kiep_arch.py` (Blender headless) | dự án | 2026-11-20 | Cảnh Độ Kiếp (đài lát đá khảm bát quái, lôi trụ, đỉnh đồng, vết sét cháy, tảng đá nung, tùng cháy); texture thủ tục của kit |
| `arch_kim_da` | Tự sinh bằng bộ dựng `tools/blender/build_sect.py` + `tools/blender/thien_cong_kit.py` + `tools/blender/kiem_trung_arch.py` + `tools/blender/kim_da_arch.py` (Blender headless) | dự án | 2026-11-19 | Cảnh Kim Dạ Cung (nhịp tường cột sơn đen đai vàng, cửa sổ hoa cách, ngai vàng, cột đèn + dây đèn lồng, đỉnh đồng, cây vàng chết); texture thủ tục của kit |
| `arch_dm_bridge` | Tự sinh bằng `tools/blender/dm_bridge_arch.py` (Blender headless) | dự án | 2026-11-20 | POLISH-3: cầu treo Đoạn Mạch (ván gỗ lệch, dầm tròn, dây thừng xoắn, cọc đầu cầu, dây neo); màu đỉnh |
| `arch_vh_island` | Tự sinh bằng `tools/blender/vh_island_arch.py` (Blender headless, không texture) | dự án | 2026-11-20 | POLISH-1: chân đảo bay Vân Hải (7 bản sắc + 2 đảo giả): vân tầng, nứt dọc, thạch nhũ, rễ cây thòng; màu đỉnh |
| `prop_lo_dan` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `bf2c9afd-c009-472c-abb5-21b01acdc63d` |
| `prop_linh_thao` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `eec1fb46-1922-479c-95c4-939052c05a4b` |
| `prop_phi_kiem` | Tripo API (multiview→3D v3.1, chỉ lấy hình) + Codex (concept); màu tô bằng script `tools/blender/recolor_phi_kiem.py` | dự án | 2026-11-15 | task `70d2072c-c993-4c70-a8d2-82931408bcc1` |
| `mon_soi_xam` | Tripo web app (multiview H3.1 + auto rig quadruped) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_thiet_boi_tru` | Tripo web app (text-to-3D H3.1 + auto rig quadruped) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py` (đòn húc nanh) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_hoa_van_ho` | Tripo web app (text-to-3D H3.1 + auto rig quadruped, clip walk) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py`; dùng chung cho Kiếm Linh (đổi màu trong game) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_thach_vien` | Tripo web app (text-to-3D H3.1 + auto rig biped, clip idle/run/slash/fall) + Codex (concept); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_mach_thuong_ho_ve` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_khai_mach_khoi_loi` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_kinh_linh` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_co_thanh_chien_ma` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_cot_ve_kiem_thu` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_thach_tuong_vo_si` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_biped_extra.py (import.mon)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_thach_giap_te` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_da_minh_loc` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_phu_dao_thach_quy` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_van_hac` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_creature.py (bird)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_ngo_cong_au` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_creature.py (chain)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `mon_bich_ngoc_kim_thien` | Tripo web app (text-to-3D H3.1 + auto rig) + Codex (concept); mọi clip thủ tục `tools/blender/anim_creature.py (insect)` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `anim_human_base` | Thư viện clip không mesh dùng chung cho nhân vật người rig Mixamo: preset animation Tripo web (idle, run, slash đổi tên heavy_chop, fall) của rig Thanh Phong + hit_light thủ tục `tools/blender/anim_biped_extra.py`, xuất bằng `tools/blender/export_anim_lib.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `anim_human_k3` | Thư viện clip K-3 (26 clip, nạp lười, không mesh) cho nhân vật người rig Mixamo: 14 clip chọn từ thư viện animation Tripo web (K-3: walk, hit_to_*, defeat_02, dive, flip, jump, jump_down, cast_a_spell, front_kick_01/02; điều khoản Tripo gói Max) của rig Thanh Phong, retarget/khóa chân trụ/dẫn xuất (đi ngang, lùi, lăn trái/phải, hit_r, cast_walk, getup) bằng `tools/blender/anim_human_k3.py`; clip thủ tục combat_idle, guard, hit_back, roar, hit_light bằng `tools/blender/anim_biped_extra.py`; xuất bằng `tools/blender/export_anim_lib.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `anim_human_ual` | Thư viện clip UAL (17 clip chọn lọc, nạp lười, không mesh) cho nhân vật người rig Mixamo: Quaternius Universal Animation Library 1 + 2 bản Standard, **CC0 1.0** (https://quaternius.com), đổi tên xương sang Mixamo, ghim hông, lấy mẫu 30 fps bằng `tools/blender/anim_human_ual.py`; nguồn ghi ở `../dtl-asset-source/anim/ual/SOURCE.md` | Quaternius | 2026-11-18 | CC0-1.0, không cần ghi công |
| `chr_kiem_tu_nam` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Thanh Phong"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_kiem_tu_nu` | Tripo API (text-to-3D v3.1 + auto rig Mixamo, CLI) + Codex (concept "Lam Chi"); kiếm + bao thủ tục `tools/blender/biped_parts.py` | dự án | 2026-11-15 | tasks `d46f4925-70b6-4056-80af-a5fd500107d8` (model), `4fe8d7ec-24a0-4211-9c0b-5c3894065cd5` (rig) |
| `prop_den_da` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `e164185e-13d5-45e7-abcf-ffd8d22a01ce` |
| `prop_bia_da` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `a790d072-62de-4dc4-b323-4971a9b3e0a6` |
| `prop_thong_co` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `c8bbd788-32bf-40b9-b4f8-c3ec9fa45c6e` |
| `prop_co_thu` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `28cb2643-4d61-4480-8d8b-ef9b784f6159` |
| `prop_da_nam` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `155d1dc8-741e-44a0-852f-a4ffd4639792` |
| `prop_da_dung` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `0922240a-2732-4bdb-a309-d9aa604774fc` |
| `prop_da_phien` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `cb75629d-e94e-4ff0-a053-f0e3f537035e` |
| `prop_truc` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `7fc22a51-bdd8-4dd7-aaba-7288366868dd` |
| `prop_lau` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `76413ff2-f1eb-4c6d-81b9-3dc302e47fdb` |
| `prop_kiem_gay` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `7027728e-2700-4ce9-83dd-50324f4ca5a6` |
| `prop_lu_huong` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `f42da251-53af-4f68-a799-f15bce1438c2` |
| `prop_tuong_canh` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `256b6d53-5b06-479b-8cf9-7b6a27cce15f` |
| `prop_soi_nui` | Tripo web app (image→3D) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_anh_dao` | Tripo web app (image→3D) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_phong_do` | Tripo web app (image→3D) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_tu_kim_ho_lo` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_tran_hon_linh` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_thanh_lien_an` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `prop_kiem_thanh_phong` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_thiet` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_han_quang` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_han_giao` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_tram_ta` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_duong_xi` | Tripo API (image→3D v3.1, CLI) + Codex (concept) | dự án | 2026-11-15 | task `5ef06438-a4c7-4e3c-8050-76dffebe72eb` |
| `prop_anh_ngoc_kinh` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_cau_da_gay` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_cau_may` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_cay_goc_kho` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_cong_khai_mach` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_cong_thanh_vo` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_da_troi` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_dai_tinh_bai` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_den_long_troi` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kinh_ho_dai` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_mach_tinh_tru` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_ngung_dan_lo` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_tan_hoa` | Sketchfab: "Sword of Miracle Free" của **Art_workshop** (https://sketchfab.com/art_workshop); nhập bằng `tools/blender/ext_sword.py` + `orient_sword.py` | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "Sword of Miracle Free" by Art_workshop, https://sketchfab.com/3d-models/sword-of-miracle-free-a163029fb3d74626bbb1711bd8840c46. Đã sửa so với bản gốc: gộp lưới, bỏ hai lưới ngọc trong suốt, giảm 25.940 → 3.000 tam giác, texture 2048 → 512, bỏ map kim loại. Kiếm của boss chương 5 Tẫn Hỏa Kiếm Cơ, không phải vật phẩm người chơi |
| `set_skin_varkessa_nu` | Sketchfab: "VARKESSA // The Infernal Emberblade" của **Atahan3D** (https://sketchfab.com/Atahan3D); chuẩn bị bằng `tools/blender/skin_prep.py` (cấu hình `tools/blender/skins/varkessa.json`), đặt lên thân nữ bằng `retarget_set.py` | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "VARKESSA // The Infernal Emberblade" by Atahan3D, https://sketchfab.com/3d-models/varkessa-the-infernal-emberblade-13c07cff4b884037a08b7463df5bc996. Đã sửa so với bản gốc: bỏ đại kiếm dính tay, giảm 1.952.526 → 20.000 tam giác, UV mới và nướng lại texture (màu + normal, 1024²), thêm bộ xương và trọng số, đổi tư thế nghỉ. Skin ngoại hình của vật phẩm `itm_skin_varkessa` |
| `prop_kiem_liet_mach` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_liet_mach_cuoi` | Tripo web app (image→3D H3.1) + Codex (concept #147); dạng cuối +10, xoay đứng bằng orient_sword.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_vo_kiem_liet_mach` | Tripo web app (image→3D H3.1) + Codex (concept #147); vỏ kiếm dùng chung tạm, tools/blender/orient_scabbard.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_kinh_quang` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_tinh_khuyet` | Tripo web app (image→3D H3.1) + Codex (concept); xoay đứng và đo chắn/chuôi bằng `tools/blender/orient_sword.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_kiem_tinh_khuyet_cuoi` | Tripo web app (image→3D H3.1) + Codex (concept P3 #154); dạng cuối +10, xoay đứng bằng orient_sword.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `prop_vo_kiem_tinh_khuyet` | Tripo web app (image→3D H3.1) + Codex (concept P3 #154); vỏ riêng đeo lưng, tools/blender/orient_scabbard.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `prop_kiem_kinh_quang_cuoi` | Tripo web app (image→3D H3.1) + Codex (concept); dạng cuối +10, xoay đứng bằng orient_sword.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `prop_vo_kiem_kinh_quang` | Tripo web app (image→3D H3.1) + Codex (concept); vỏ riêng đeo lưng, tools/blender/orient_scabbard.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_liet_mach_kiem_y` | Tripo web app (image→3D H3.1) + Codex (concept); mẫu trưng bày, không thay áo nhân vật | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_liet_mach_kiem_y_nam` | Tripo web app (image→3D H3.1) + Codex (concept); áo bộ Liệt Mạch chuyển sang bộ xương nhân vật nam bằng tools/blender/retarget_set.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_liet_mach_kiem_y_nu` | Tripo web app (image→3D H3.1) + Codex (concept); áo bộ chuyển sang bộ xương nhân vật bằng tools/blender/retarget_set.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_kinh_quang_kiem_y_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời; đai, mão, ủng không texture dùng vật liệu thủ tục) + Codex (concept bậc 3 #155); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_kinh_quang_kiem_y_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời; đai, mão, ủng không texture dùng vật liệu thủ tục) + Codex (concept bậc 3 #155); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_tinh_khuyet_kiem_bao_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_tinh_khuyet_kiem_bao_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_dia_long_ho_giap_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept #147); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_dia_long_ho_giap_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept #147); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_phuc_mach_dan_bao_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept #147); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_phuc_mach_dan_bao_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời) + Codex (concept #147); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_than_tang_dan_bao_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời; ủng không texture dùng vật liệu thủ tục) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_than_tang_dan_bao_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời; ủng không texture dùng vật liệu thủ tục) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_co_thanh_huyen_giap_nam` | Tripo web app (image→3D H3.1, 6 mảnh rời; đai, mão, ủng không texture dùng vật liệu thủ tục) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_co_thanh_huyen_giap_nu` | Tripo web app (image→3D H3.1, 6 mảnh rời; đai, mão, ủng không texture dùng vật liệu thủ tục) + Codex (concept P3 #154); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_van_kinh_thiet_giap_nam` | Tripo web app (image→3D H3.1, HD Model 6 mảnh rời, đủ texture) + Codex (concept Vân Kình Thiết Giáp, bậc 3 Hộ pháp); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_van_kinh_thiet_giap_nu` | Tripo web app (image→3D H3.1, HD Model 6 mảnh rời, đủ texture) + Codex (concept Vân Kình Thiết Giáp, bậc 3 Hộ pháp); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_luu_ly_dan_y_nam` | Tripo web app (image→3D H3.1, HD Model 6 mảnh rời, đủ texture) + Codex (concept Lưu Ly Đan Y, bậc 3 Đan sư); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_luu_ly_dan_y_nu` | Tripo web app (image→3D H3.1, HD Model 6 mảnh rời, đủ texture) + Codex (concept Lưu Ly Đan Y, bậc 3 Đan sư); gộp bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | web app, không có task id; xem meta.json |
| `set_kinh_quang_kiem_y` | Tripo web app (image→3D H3.1) + Codex (concept); mẫu trưng bày, không thay áo nhân vật | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `set_tinh_khuyet_kiem_bao` | Tripo web app (image→3D H3.1) + Codex (concept); mẫu trưng bày, không thay áo nhân vật | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_phu_dao_dinh` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_than_nien_chau` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_tru_da_khac_van` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_tru_nham_do` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_tung_phu_dao` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `prop_tuong_da_vo_si` | Tripo web app (image→3D H3.1) + Codex (concept) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `chr_npc_chuong_mon` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Lạc Vân chân nhân"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_npc_duoc_su` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Tố Tâm"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_npc_thiet_lao` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Thiết lão"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_huyet_lang_vuong` | Tripo web app (text-to-3D H3.1 + auto rig quadruped) + Codex (concept); 8 clip thủ tục `tools/blender/anim_quadruped.py` (gồm slam/sweep/stun) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_kiem_khoi` | Tripo web app (text-to-3D H3.1 + auto rig biped + preset animation) + Codex (concept); hit_light/slam/sweep/stun thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_han_giao` | Tripo web app (image-to-3D H3.1 từ concept Codex, không dùng Auto Rig) + Codex (concept); bộ xương chuỗi 17 đốt và 9 clip thủ tục `tools/blender/anim_serpent.py` (gồm slam/sweep/stun/chant) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_tam_thu_nguc_khuyen` | "GORETHRAX // The Infernal Three- Headed Hound" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 980 nghìn → 36 nghìn tam giác, trải UV và nướng lại texture, dựng xương + trọng số (`tools/blender/sculpt_rig.py`), clip thủ tục (`tools/blender/anim_quadruped.py`) | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/gorethrax-the-infernal-three-headed-hound-90f3e2338d6f41b8a94f376fbc3db3e4 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `mon_liet_hoa_ma_nguu` | "FLAME BULL // The Infernal Beast" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 122 nghìn → 9 nghìn tam giác, trải UV và nướng lại texture (kèm map phát sáng khe nứt), dựng xương + trọng số (`tools/blender/sculpt_rig.py`), clip thủ tục (`tools/blender/anim_quadruped.py`) | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/flame-bull-the-infernal-beast-0f6ac3ada7e648c7b727ba22c67bb684 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `mon_u_anh_cot_loc` | "Shadow Stag - Bone-Antlered Dark Fantasy" của **Pigcraft** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 1,93 triệu → 9 nghìn tam giác, trải UV và nướng lại texture, dựng xương + trọng số (`tools/blender/sculpt_rig.py`), clip thủ tục (`tools/blender/anim_quadruped.py`) | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/s8819296 · nguồn https://sketchfab.com/3d-models/shadow-stag-bone-antlered-dark-fantasy-607bb5705fcd431bb09faec790fa4692 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `mon_tan_chung` | "Bone Golem - Necromantic Construct" của **Pigcraft** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 1,98 triệu → 9 nghìn tam giác, UV mới và nướng lại texture màu + normal (`tools/blender/skin_prep.py --stage bake`), dựng xương UE5 Mannequin + trọng số (`tools/blender/chr_v3.py`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/s8819296 · nguồn https://sketchfab.com/3d-models/bone-golem-necromantic-construct-7510de27700c4b199d1d727b9f2f48d6 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `mon_giac_kiem_trong_binh` | "MALTHERION // The Skullbound Aegis" của **Atahan3D** trên Sketchfab (gói tải về không kèm metadata; tác giả và URL lấy từ trang Sketchfab của mô hình). **Đã chỉnh sửa**: giảm lưới 309 nghìn → 9 nghìn tam giác, UV mới và nướng lại texture, dựng xương UE5 Mannequin + trọng số, khiên/kiếm/áo choàng gắn cứng vào xương (`tools/blender/chr_v3.py --bind`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/85ff03237ee94a0cbfe9770dde440d6c · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `elite_hoi_giac_cu_thu` | "GORTHAZUL // The Ashhorn Behemoth" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 701 nghìn → 14 nghìn tam giác, UV mới và nướng lại texture, dựng xương UE5 Mannequin + trọng số, rìu gắn cứng vào xương tay phải (`tools/blender/chr_v3.py --bind`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/gorthazul-the-ashhorn-behemoth-0e2a0f6baad64f51b2aa613112b7fd7c · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `boss_tan_hoa_kiem_co` | "PROTECTOR NEMESIS // The Fallen Seraph" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: bỏ đại kiếm dính tay (kiếm Tẫn Hỏa gắn rời, xem `prop_kiem_tan_hoa`), giảm lưới 856 nghìn → 24 nghìn tam giác, UV mới và nướng lại texture, đổi ánh sáng xanh sang than hồng, dựng xương UE5 Mannequin + trọng số, áo choàng gắn cứng vào xương hông (`tools/blender/skin_prep.py`, `tools/blender/chr_v3.py --bind`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/protector-nemesis-the-fallen-seraph-746df03aadb54395874cdb959c36e681 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `boss_thu_khich_duc_chu` | "AETHERION NEMESIS // The Violet Seraph" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: bỏ lưỡi kiếm dính tay (chiêu Giáng thương là hiệu ứng), giảm lưới 1,0 triệu → 36 nghìn tam giác, UV mới và nướng lại texture, dựng xương UE5 Mannequin + trọng số, thêm ba chuỗi xương cho mỗi cánh trong bốn cánh (`tools/blender/skin_prep.py`, `tools/blender/chr_v3.py --wings`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/aetherion-nemesis-the-violet-seraph-9e86faa1fe764b0e8ea1f509ddbf8d13 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `boss_kim_da_ma_hau` | "RAVENYTH // The Gilded Night Empress" của **6 (Atahan3D)** trên Sketchfab. **Đã chỉnh sửa**: giảm lưới 1,99 triệu → 30 nghìn tam giác, UV mới và nướng lại texture, dựng xương UE5 Mannequin + trọng số, tóc gắn vào xương đầu, áo choàng gắn cứng vào xương hông/ngực (`tools/blender/skin_prep.py`, `tools/blender/chr_v3.py --bind`); clip UAL của Quaternius (CC0) phát trực tiếp | CC-BY-4.0 | 2026-11-18 | Ghi công bắt buộc: tác giả https://sketchfab.com/Atahan3D · nguồn https://sketchfab.com/3d-models/ravenyth-the-gilded-night-empress-706cfa7b57e34536852930ac79facf07 · giấy phép https://creativecommons.org/licenses/by/4.0/ |
| `boss_dia_mach_long` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); rig quadruped Tripo (33 xương, bảng layout tường minh) + clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_thon_mach_ngo_cong_vuong` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); bỏ rig Tripo; bộ xương chuỗi 17 đốt và 9 clip thủ tục `tools/blender/anim_serpent.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_van_hai_kinh_vuong` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); bỏ rig Tripo; bộ xương chuỗi 17 đốt và 9 clip thủ tục kiểu bơi `tools/blender/anim_serpent.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_thach_tam_khoi_vuong` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); Tripo không rig được; xương người và trọng số dựng bằng `tools/blender/biped_autorig.py`, clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_kinh_nguyet_chan_quan` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); rig Tripo (thêm xương bàn chân) + clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_thien_khuyet_thu_linh` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); rig Mixamo Tripo (thêm bàn chân trái) + clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_vo_dien_than_quan` | Tripo web app (image-to-3D H3.1 từ concept `docs/asset-concepts`, người dùng dựng); rig Mixamo Tripo + clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `boss_thu_mo_tuong` | Tripo web app (text-to-3D H3.1 + auto rig biped + preset animation) + Codex (concept); hit_light/slam/sweep/chant/stun thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `elite_huyet_nha_lang` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig quadruped) + Codex (concept); clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_xich_dien_ho` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig quadruped) + Codex (concept); clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_liet_cot_bao` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig quadruped) + Codex (concept); clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_loi_van_su_vuong` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig quadruped) + Codex (concept); clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_da_minh_loc_vuong` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig quadruped) + Codex (concept); clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_cu_nham_vien` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig biped Mixamo) + Codex (concept); clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_ho_mach_khoi_tuong` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig biped Mixamo) + Codex (concept); clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_kinh_dien_ma_quan` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig biped Mixamo) + Codex (concept); clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_cot_kiem_thong_linh` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig biped Mixamo) + Codex (concept); clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_thach_tuong_dai_tuong` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig biped Mixamo) + Codex (concept); clip thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_van_hac_vuong` | Tripo web app (image-to-3D H3.1 từ concept Codex + auto rig rig Tripo) + Codex (concept); clip thủ tục `tools/blender/anim_bird.py` | dự án | 2026-11-16 | web app, không có task id; xem meta.json |
| `elite_xich_sa_ngo_cong` | Tripo web app (image-to-3D H3.1 từ concept Codex) + Codex (concept); clip thủ tục `tools/blender/anim_serpent.py` (không rig Tripo (xương đốt dựng bằng script)) | dự án | 2026-11-16 | web app, không có task id; xem meta.json |

## Texture mặt đất (P2-A2)

Tám bộ texture PBR từ [Poly Haven](https://polyhaven.com/textures), giấy phép **CC0-1.0** (public domain, dùng thương mại được, không bắt buộc ghi nguồn; vẫn ghi để truy vết). Bản 1K gốc ở `../dtl-asset-source/texture/<id>/`, đóng gói bằng `pnpm assets:terrain` (`tools/asset-pipeline/src/terrain-textures.ts`) thành WebP 1024 trong `apps/client/public/terrain/`.

| Lớp | Poly Haven | Tác giả | Giấy phép |
| --- | --- | --- | --- |
| cỏ | [leafy_grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | CC0-1.0 |
| đất | [brown_mud_leaves_01](https://polyhaven.com/a/brown_mud_leaves_01) | Rob Tuytel | CC0-1.0 |
| nền rừng | [forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) | Rob Tuytel | CC0-1.0 |
| đá núi | [rocky_terrain_02](https://polyhaven.com/a/rocky_terrain_02) | Amal Kumar | CC0-1.0 |
| vách đá | [rock_face](https://polyhaven.com/a/rock_face) | Greg Zaal (chụp), Dario Barresi (xử lý) | CC0-1.0 |
| cát ven hồ | [coast_sand_rocks_02](https://polyhaven.com/a/coast_sand_rocks_02) | Rob Tuytel | CC0-1.0 |
| lát sân đá | [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | Rob Tuytel | CC0-1.0 |
| sỏi đường mòn | [gravelly_sand](https://polyhaven.com/a/gravelly_sand) | Dario Barresi | CC0-1.0 |

### Texture mặt đất Đoạn Mạch Cổ Cốc (E2-I)

Bộ ochre cho `doan_mach`, cũng từ [Poly Haven](https://polyhaven.com/textures), **CC0-1.0**; đổi sắc (giảm bão hòa, ngả đất son) bằng `pnpm --filter @dtl/asset-pipeline exec tsx src/terrain-textures.ts --set ochre`, ra `apps/client/public/terrain-ochre/` (nạp lười khi vào level). Tác giả từng bộ xem ở trang Poly Haven tương ứng.

| Lớp | Poly Haven | Giấy phép |
| --- | --- | --- |
| cỏ (đất khô) | [dry_ground_rocks](https://polyhaven.com/a/dry_ground_rocks) | CC0-1.0 |
| đất | [red_laterite_soil_stones](https://polyhaven.com/a/red_laterite_soil_stones) | CC0-1.0 |
| nền sỏi cát | [gravelly_sand](https://polyhaven.com/a/gravelly_sand) | CC0-1.0 |
| đá | [sandstone_cracks](https://polyhaven.com/a/sandstone_cracks) | CC0-1.0 |
| vách đá | [rock_face_03](https://polyhaven.com/a/rock_face_03) | CC0-1.0 |
| cát | [aerial_sand](https://polyhaven.com/a/aerial_sand) | CC0-1.0 |
| lát đá | [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | CC0-1.0 |
| sỏi | [gravelly_sand](https://polyhaven.com/a/gravelly_sand) | CC0-1.0 |

Thẻ cỏ alpha (`apps/client/public/grass-ochre/`) dựng từ ảnh concept của dự án `docs/asset-concepts/prop_co_*.webp` bằng `pnpm assets:grass-cards` (không dùng Tripo).

### Texture mặt đất Thiên Khuyết Cổ Thành (E4-I)

Bộ slate cho `thien_khuyet`, cũng từ [Poly Haven](https://polyhaven.com/textures), **CC0-1.0**; đổi sắc (giảm bão hòa, ngả xám lam đêm) bằng `pnpm --filter @dtl/asset-pipeline exec tsx src/terrain-textures.ts --set slate`, ra `apps/client/public/terrain-slate/` (nạp lười khi vào level).

| Lớp | Poly Haven | Tác giả | Giấy phép |
| --- | --- | --- | --- |
| nền (đá lát cổ) | [monastery_stone_floor](https://polyhaven.com/a/monastery_stone_floor) | Amal Kumar | CC0-1.0 |
| đất (lối đá) | [rock_path](https://polyhaven.com/a/rock_path) | Amal Kumar | CC0-1.0 |
| nền rêu | [mossy_cobblestone](https://polyhaven.com/a/mossy_cobblestone) | Sơn Nguyễn | CC0-1.0 |
| đá | [slate_floor_02](https://polyhaven.com/a/slate_floor_02) | Dimitrios Savva | CC0-1.0 |
| vách đá | [rock_face_03](https://polyhaven.com/a/rock_face_03) | Rob Tuytel | CC0-1.0 |
| cát | [gravelly_sand](https://polyhaven.com/a/gravelly_sand) | Dario Barresi | CC0-1.0 |
| lát đá | [patterned_slate_tiles](https://polyhaven.com/a/patterned_slate_tiles) | Dimitrios Savva | CC0-1.0 |
| sỏi | [rocky_gravel](https://polyhaven.com/a/rocky_gravel) | Dario Barresi, Dimitrios Savva | CC0-1.0 |

Thẻ cỏ sao (`apps/client/public/grass-night/`) dựng từ ảnh concept của dự án `docs/asset-concepts/prop_co_*.webp` bằng `pnpm assets:grass-cards --set night` (không dùng Tripo).

### Texture mặt đất Bắc Hoang Tẫn Nguyên (DV-3I)

Bộ ash cho `bac_hoang`, cũng từ [Poly Haven](https://polyhaven.com/textures), **CC0-1.0**; đổi sắc (giảm bão hòa, ngả tro than) bằng `pnpm assets:terrain --set ash`, ra `apps/client/public/terrain-ash/` (nạp lười khi vào level).

| Lớp | Poly Haven | Tác giả | Giấy phép |
| --- | --- | --- | --- |
| nền (đất cháy) | [burned_ground_01](https://polyhaven.com/a/burned_ground_01) | Rob Tuytel | CC0-1.0 |
| đất (bùn nứt khô) | [mud_cracked_dry_03](https://polyhaven.com/a/mud_cracked_dry_03) | Dario Barresi, Dimitrios Savva | CC0-1.0 |
| nền rừng (bùn) | [aerial_mud_1](https://polyhaven.com/a/aerial_mud_1) | Rob Tuytel | CC0-1.0 |
| đá (tảng nứt) | [rock_boulder_cracked](https://polyhaven.com/a/rock_boulder_cracked) | Dario Barresi, Dimitrios Savva | CC0-1.0 |
| vách đá | [rock_wall_08](https://polyhaven.com/a/rock_wall_08) | Amal Kumar | CC0-1.0 |
| cát (tro bay) | [aerial_sand](https://polyhaven.com/a/aerial_sand) | Rob Tuytel | CC0-1.0 |
| lát đá (đá núi lửa) | [volcanic_rock_tiles](https://polyhaven.com/a/volcanic_rock_tiles) | Charlotte Baglioni | CC0-1.0 |
| sỏi (lòng sông cạn) | [dry_riverbed_rock](https://polyhaven.com/a/dry_riverbed_rock) | Amal Kumar | CC0-1.0 |

Cây chết, vệt nứt Giới Khích và đá/cột đổ của Bắc Hoang là thủ tục (code TSL/Three.js), không dùng asset ngoài.

<!-- audio:begin (sinh bởi tools/audio/build.mjs, đừng sửa tay) -->

### Âm thanh (SFX, âm môi trường)

Tất cả nguồn là **CC0-1.0** (không bắt buộc ghi công; vẫn ghi để tra lại). File nguồn nằm ở `../dtl-asset-source/audio/sfx/`, khai báo xử lý trong `tools/audio/sounds.json`. Bản build trong `apps/client/public/audio/`. Lớp kim loại tổng hợp (`synth: metal` trong sounds.json: `sfx_ascend`, `sfx_spellbreak`, `sfx_rare`) và âm chuông/lách tách đèn lồng ở client do code tự sinh, không dùng nguồn ngoài.

| Âm | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `sfx_sword` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.3.ogg, sword.4.ogg, sword.6.ogg |
| `sfx_slash` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.1.ogg, sword.5.ogg, sword.8.ogg; https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: knifeSlice.ogg, knifeSlice2.ogg |
| `sfx_rain` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.3.ogg, sword.7.ogg, sword.4.ogg, sword.6.ogg, sword.10.ogg |
| `sfx_hit` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck; OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_06.ogg, bfh1_hit_07.ogg, bfh1_hit_02.ogg; https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: knifeSlice.ogg, knifeSlice2.ogg, chop.ogg |
| `sfx_crit` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.4.ogg, sword_clash.6.ogg, sword_clash.8.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_06.ogg, bfh1_hit_02.ogg, bfh1_hit_07.ogg |
| `sfx_hurt` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_02.ogg |
| `sfx_block` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_metal_hit_04.ogg, bfh1_metal_hit_05.ogg, bfh1_metal_hit_02.ogg |
| `sfx_death` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_falling_01.ogg, bfh1_falling_04.ogg, bfh1_falling_05.ogg |
| `sfx_impact` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck; OpenGameArt: 100 CC0 SFX #2 — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_rock_breaking_01.ogg, bfh1_rock_breaking_02.ogg, bfh1_rock_breaking_03.ogg, bfh1_hit_02.ogg; https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg |
| `sfx_thunder` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: Rain + Long Thunder — WuxiaScrub; OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck; squigglyfish.itch.io: Godot 4 Elemental Spells VFX + SFX: Free Sampler — SquigglyFish | CC0-1.0 | 2026-11-18 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_thunder_01.ogg; https://opengameart.org/content/rain-long-thunder — `oga/rain-long-thunder/`: rain-thunder.ogg; https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.1.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_rock_breaking_02.ogg; https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx — `godot-elemental-sampler/`: lightning_strike_01.wav |
| `sfx_loi_cast` | squigglyfish.itch.io: Godot 4 Elemental Spells VFX + SFX: Free Sampler — SquigglyFish | CC0-1.0 | 2026-11-18 | https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx — `godot-elemental-sampler/`: lightning_cast_01.wav, lightning_cast_02.wav, lightning_cast_04.wav |
| `sfx_fire_burst` | squigglyfish.itch.io: Godot 4 Elemental Spells VFX + SFX: Free Sampler — SquigglyFish | CC0-1.0 | 2026-11-18 | https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx — `godot-elemental-sampler/`: fireball_start_01.wav, fireball_stop_01.wav, fireball_start_02.wav, fireball_stop_02.wav |
| `sfx_ice_hit` | squigglyfish.itch.io: Godot 4 Elemental Spells VFX + SFX: Free Sampler — SquigglyFish | CC0-1.0 | 2026-11-18 | https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx — `godot-elemental-sampler/`: ice_impact_01.wav, ice_impact_03.wav, ice_impact_05.wav |
| `sfx_ice_spike` | squigglyfish.itch.io: Godot 4 Elemental Spells VFX + SFX: Free Sampler — SquigglyFish | CC0-1.0 | 2026-11-18 | https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx — `godot-elemental-sampler/`: ice_spikes_01.wav, ice_spikes_02.wav, ice_spikes_04.wav |
| `sfx_trib` | OpenGameArt: Rain + Long Thunder — WuxiaScrub | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/rain-long-thunder — `oga/rain-long-thunder/`: rain-thunder.ogg |
| `sfx_shield` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_2.ogg, magical_5.ogg, magical_6_0.ogg |
| `sfx_heal` | OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure1.wav, Cure2.wav, Cure3.wav |
| `sfx_potion` | OpenGameArt: 50 RPG sound effects — Kenney; OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: metalLatch.ogg, metalClick.ogg; https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure4.wav, Cure5.wav |
| `sfx_cast` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_mcast` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_respawn` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_4.ogg |
| `sfx_portal` | OpenGameArt: Cure Magic — Someoneman; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure8.wav; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `sfx_spellbreak` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.4.ogg, sword_clash.6.ogg, sword_clash.8.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_metal_hit_04.ogg, bfh1_metal_hit_05.ogg, bfh1_metal_hit_02.ogg |
| `sfx_rare` | OpenGameArt: 50 RPG sound effects — Kenney; OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: handleCoins.ogg; https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure5.wav |
| `sfx_step_stone` | OpenGameArt: 100 CC0 SFX #2 — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_footstep_01.ogg, sfx100v2_footstep_02.ogg |
| `sfx_step_grass` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: footstep03.ogg, cloth1.ogg, footstep05.ogg, cloth3.ogg, footstep09.ogg |
| `sfx_step_dirt` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: footstep00.ogg, footstep02.ogg, footstep07.ogg |
| `sfx_step_sand` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: footstep01.ogg, cloth3.ogg, footstep04.ogg, cloth1.ogg, footstep08.ogg |
| `sfx_step_wood` | OpenGameArt: 100 CC0 SFX #2 — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_footstep_wood_01.ogg, sfx100v2_footstep_wood_02.ogg, sfx100v2_footstep_wood_03.ogg, sfx100v2_footstep_wood_04.ogg |
| `sfx_step_water` | OpenGameArt: 100 CC0 SFX #2 — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_footstep_wet_01.ogg, sfx100v2_footstep_wet_02.ogg, sfx100v2_footstep_wet_03.ogg |
| `sfx_ui_click` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: click_001.ogg, select_001.ogg |
| `sfx_ui_open` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: bookFlip2.ogg, bookFlip3.ogg |
| `sfx_ui_close` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: bookClose.ogg, bookPlace1.ogg |
| `sfx_ui_error` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: error_004.ogg |
| `sfx_ui_confirm` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: confirmation_001.ogg |
| `sfx_target` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: select_002.ogg |
| `sfx_loot` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: handleCoins.ogg, handleCoins2.ogg |
| `sfx_meditate` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: bong_001.ogg |
| `sfx_levelup` | OpenGameArt: 85 Short music jingles — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA07.ogg |
| `sfx_quest` | OpenGameArt: 85 Short music jingles — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA03.ogg |
| `sfx_ascend` | OpenGameArt: 85 Short music jingles — Kenney; OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA12.ogg; https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_4.ogg |
| `sfx_craft` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: metalPot1.ogg, metalPot2.ogg |
| `sfx_enhance` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_metal_hit_01.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_metal_hit_06.ogg |
| `sfx_gather` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: cloth1.ogg, cloth3.ogg |
| `sfx_fly` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.2.ogg; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_wind` | OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_forest` | OpenGameArt: AMB Morning Sounds (Perfect Loop) — Kresiek The Furry; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/amb-morning-sounds-perfect-loop — `oga/amb-morning-sounds-perfect-loop/`: amb_morning.wav; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_stream` | OpenGameArt: Sea and river wave sounds — RandomMind | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/sea-and-river-wave-sounds — `oga/sea-and-river-wave-sounds/`: VistulaShort_0.mp3 |
| `amb_water` | OpenGameArt: 30 CC0 SFX Loops — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/30-cc0-sfx-loops — `oga/30-cc0-sfx-loops/sfx_loops/`: water_flowing.ogg |
| `amb_night` | OpenGameArt: Crickets Ambient Noise - loopable — Wolfgang_; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/crickets-ambient-noise-loopable — `oga/crickets-ambient-noise-loopable/`: crickets_1.mp3; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_cave` | OpenGameArt: wind whoosh loop — SketchMan3; OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg; https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.9.ogg |

<!-- audio:end -->

## Font

Font web tự host trong `apps/client/public/fonts/`, subset bằng `tools/fonts/subset.py` (fonttools) từ kho [google/fonts](https://github.com/google/fonts) ghim commit `cc39c4c`. Văn bản giấy phép đầy đủ nằm cạnh file font (`OFL-*.txt`); bản quyền và giấy phép cũng giữ trong bảng `name` của từng woff2. Không font nào khai Reserved Font Name.

| File | Font gốc | Giấy phép | Ngày | Dùng cho |
| --- | --- | --- | --- | --- |
| `dtl-title.woff2` | Charm Bold, © 2018 The Charm Project Authors (Cadson Demak) | `OFL-1.1` | 2026-11-15 | Tiêu đề thư pháp trên khung hình đầu (chỉ glyph của `ui.title`), biến CSS `--font-title` |
| `dtl-thu-phap.woff2` | Charm Bold, © 2018 The Charm Project Authors (Cadson Demak) | `OFL-1.1` | 2026-11-19 | Tên thư pháp dọc (đạo hiệu người chơi) ở tầng Hóa Thần của Hoa Trúc, bút lông thư pháp, đủ Latin + tiếng Việt, biến CSS `--u-font-thuphap` |
| `dtl-display.woff2` | Alegreya SC Bold, © 2011 The Alegreya Project Authors (Huerta Tipográfica) | `OFL-1.1` | 2026-11-15 | Tên boss, biển hiệu, phụ đề màn tiêu đề (Latin + tiếng Việt), biến CSS `--font-display` |
| `dtl-u2-display.woff2` | Grenze Gotisch Bold, © 2020 The Grenze Gotisch Project Authors (Omnibus-Type) | `OFL-1.1` | 2026-11-18 | UI Kit 2.0: chữ trang trí lớn (thẻ chương, tên chiêu, "Đột phá"), biến `--u-font-display` |
| `dtl-u2-head.woff2` | Texturina (opsz 24, 600–800), © 2020 The Texturina Project Authors (Omnibus-Type) | `OFL-1.1` | 2026-11-18 | UI Kit 2.0: tiêu đề bảng, tab, nút, nhãn, biến `--u-font-head` |
| `dtl-u2-body.woff2`, `dtl-u2-body-italic.woff2` | Newsreader (opsz 16, 400–600 + nghiêng), © 2020 The Newsreader Project Authors (Production Type) | `OFL-1.1` | 2026-11-18 | UI Kit 2.0: nội dung, số liệu, biến `--u-font-body` |

Ba font U2 do `tools/fonts/subset_u2.py` cắt (Latin + Latin mở rộng + U+1E00–1EFF, ghim trục biến thiên, woff2; tổng 177 KB). Đã đối chiếu từng văn bản OFL: không họ nào khai Reserved Font Name, nên đổi tên tệp `dtl-u2-*` và cắt tập ký tự là hợp lệ; bản quyền + giấy phép giữ trong bảng `name` và `OFL-grenzegotisch|texturina|newsreader.txt` cạnh file.

<!-- music:begin (sinh bởi tools/audio/loop.mjs, đừng sửa tay) -->

### Nhạc nền

**Nhạc tự soạn** (Claude soạn bằng code ở `tools/audio/compose/<id>.mjs`, xuất MIDI): phát hành **CC0-1.0**. Render bằng soundfont **GeneralUser GS v2.0.3** của S. Christian Collins ([trang gốc](https://www.schristiancollins.com/generaluser.php), [repo](https://github.com/mrbumpy409/GeneralUser-GS), commit `684543d`), giấy phép *GeneralUser GS License v2.0*: “You may use GeneralUser GS without restriction for your own music creation, private or commercial … Please feel free to use it in your software projects”. Game chỉ phân phối bản âm thanh đã render, không phân phối file soundfont (file ở `../dtl-asset-source/audio/nhac/sf2/`, build tự tải theo commit ghim và kiểm SHA-256).

Khai báo ở `tools/audio/music.json`, hậu kỳ (vòng lặp, -16 LUFS) bằng `tools/audio/loop.mjs`. Bản build trong `apps/client/public/audio/music/`.

| Bài | Tên | Nguồn | Giấy phép | Ngày | Link |
| --- | --- | --- | --- | --- | --- |
| `sect` | Lạc Kiếm Tông | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/sect.mjs` |
| `combat` | Giao Phong | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/combat.mjs` |
| `wild` | Vân Lam Sơn Mạch | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/wild.mjs` |
| `wild_ochre` | Đoạn Mạch Cổ Cốc | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/wild_ochre.mjs` |
| `wild_night` | Thiên Khuyết Cổ Thành | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-18 | `tools/audio/compose/wild_night.mjs` |
| `wild_ash` | Bắc Hoang — Hàn Hôi | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-18 | `tools/audio/compose/wild_ash.mjs` |
| `wild_rift` | Bắc Hoang — Bên Kia Vết Nứt | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-18 | `tools/audio/compose/wild_rift.mjs` |
| `wild_cloud` | Vân Hải Phù Đảo | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/wild_cloud.mjs` |
| `forest` | Rừng Linh Thảo | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/forest.mjs` |
| `lake` | Hồ Sương Mù | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/lake.mjs` |
| `dungeon` | Kiếm Trủng | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/dungeon.mjs` |
| `boss` | Hàn Giao | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/boss.mjs` |
| `dungeon_boss` | Kiếm Trủng — Thủ Mộ | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/dungeon_boss.mjs` |
| `dungeon_rift` | Xích Tẫn Khích — Đáy Hẻm | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-18 | `tools/audio/compose/dungeon_rift.mjs` |
| `dungeon_rift_boss` | Xích Tẫn Khích — Chiến Giới | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-18 | `tools/audio/compose/dungeon_rift_boss.mjs` |
| `tribulation` | Độ Kiếp | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/tribulation.mjs` |
| `meditate` | Đả Tọa | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/meditate.mjs` |
| `title` | Đạp Thiên Lộ | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-16 | `tools/audio/compose/title.mjs` |
| `sect_pulse` | Lạc Kiếm Tông — lớp nhịp | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/sect_pulse.mjs` |
| `sect_edge` | Lạc Kiếm Tông — lớp giai điệu căng | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/sect_edge.mjs` |
| `wild_pulse` | Vân Lam Sơn Mạch — lớp nhịp | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/wild_pulse.mjs` |
| `wild_edge` | Vân Lam Sơn Mạch — lớp giai điệu căng | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/wild_edge.mjs` |
| `dungeon_pulse` | Kiếm Trủng — lớp nhịp | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/dungeon_pulse.mjs` |
| `dungeon_edge` | Kiếm Trủng — lớp giai điệu căng | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/dungeon_edge.mjs` |
| `sting_levelup` | Tu Vi Tinh Tiến | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/sting_levelup.mjs` |
| `sting_breakthrough` | Trúc Cơ Thành | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/sting_breakthrough.mjs` |
| `sting_death` | Thân Tử Đạo Tiêu | Đạp Thiên Lộ (original, CC0/tự soạn) | CC0-1.0; tiếng nhạc cụ: soundfont GeneralUser GS v2.0.3 của S. Christian Collins (GeneralUser GS License v2.0) | 2026-11-17 | `tools/audio/compose/sting_death.mjs` |

<!-- music:end -->

## Icon 2D Codex (2026-11-16)

Sinh bởi công cụ tạo ảnh tích hợp Codex cho dự án Đạp Thiên Lộ (`tools/codex-assets/gen.mjs`, chủ thể ở `tools/codex-assets/icons.json`), thiết kế gốc, không dùng Tripo hay dịch vụ ngoài. PNG gốc + prompt ở `<DTL_ASSET_SOURCE>/2d/icon/v1/<id>.png` và `<id>.prompt.txt`. 28 icon trang bị vẽ lại thay bản render Blender (PR #86); ID cũ giữ nguyên ô atlas.

| ID | Nguồn | Giấy phép | Ngày | Tệp |
| --- | --- | --- | --- | --- |
| `buff_atk` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/buff_atk.png` |
| `buff_crit` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/buff_crit.png` |
| `buff_def` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/buff_def.png` |
| `cur_linh_thach` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/cur_linh_thach.png` |
| `gem_hoa_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_hoa_1.png` |
| `gem_hoa_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_hoa_2.png` |
| `gem_hoa_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_hoa_3.png` |
| `gem_kim_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_kim_1.png` |
| `gem_kim_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_kim_2.png` |
| `gem_kim_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_kim_3.png` |
| `gem_moc_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_moc_1.png` |
| `gem_moc_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_moc_2.png` |
| `gem_moc_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_moc_3.png` |
| `gem_tho_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_tho_1.png` |
| `gem_tho_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_tho_2.png` |
| `gem_tho_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_tho_3.png` |
| `gem_thuy_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_thuy_1.png` |
| `gem_thuy_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_thuy_2.png` |
| `gem_thuy_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/gem_thuy_3.png` |
| `hud_cai_dat` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_cai_dat.png` |
| `hud_cong_phap` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_cong_phap.png` |
| `hud_ngu_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_ngu_kiem.png` |
| `hud_nhan_vat` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_nhan_vat.png` |
| `hud_nhiem_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_nhiem_vu.png` |
| `hud_thien` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_thien.png` |
| `hud_to_doi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_to_doi.png` |
| `hud_tro_giup` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_tro_giup.png` |
| `hud_tui` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_tui.png` |
| `itm_ho_phu` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ho_phu.png` |
| `itm_linh_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_linh_tran.png` |
| `itm_pha_canh_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pha_canh_dan.png` |
| `itm_tay_luyen_thach` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_tay_luyen_thach.png` |
| `mark_nhan` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/mark_nhan.png` |
| `mark_xong` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/mark_xong.png` |
| `met_bat_dong_kim_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/met_bat_dong_kim_than.png` |
| `met_lac_kiem_quyet` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/met_lac_kiem_quyet.png` |
| `met_thanh_moc_dan_kinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/met_thanh_moc_dan_kinh.png` |
| `role_ho_tro` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/role_ho_tro.png` |
| `role_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/role_kiem.png` |
| `role_tank` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/role_tank.png` |
| `root_hoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/root_hoa.png` |
| `root_kim` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/root_kim.png` |
| `root_moc` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/root_moc.png` |
| `root_tho` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/root_tho.png` |
| `root_thuy` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/root_thuy.png` |
| `skl_kiem_anh_bo` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_kiem_anh_bo.png` |
| `skl_luu_huong_bo` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_luu_huong_bo.png` |
| `skl_thiet_bich_xung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thiet_bich_xung.png` |
| `var_hoi_nguyen_thuat_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_hoi_nguyen_thuat_a.png` |
| `var_hoi_nguyen_thuat_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_hoi_nguyen_thuat_b.png` |
| `var_hoi_xuan_quyet_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_hoi_xuan_quyet_a.png` |
| `var_hoi_xuan_quyet_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_hoi_xuan_quyet_b.png` |
| `var_kiem_khi_tram_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_kiem_khi_tram_a.png` |
| `var_kiem_khi_tram_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_kiem_khi_tram_b.png` |
| `var_linh_khi_ho_the_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_linh_khi_ho_the_a.png` |
| `var_linh_khi_ho_the_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_linh_khi_ho_the_b.png` |
| `var_loi_dinh_nhat_kiem_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_loi_dinh_nhat_kiem_a.png` |
| `var_loi_dinh_nhat_kiem_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_loi_dinh_nhat_kiem_b.png` |
| `var_phi_kiem_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_phi_kiem_a.png` |
| `var_phi_kiem_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_phi_kiem_b.png` |
| `var_phi_kiem_truy_hon_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_phi_kiem_truy_hon_a.png` |
| `var_phi_kiem_truy_hon_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_phi_kiem_truy_hon_b.png` |
| `var_thien_kiem_vu_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_thien_kiem_vu_a.png` |
| `var_thien_kiem_vu_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_thien_kiem_vu_b.png` |
| `var_tran_son_an_a` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_tran_son_an_a.png` |
| `var_tran_son_an_b` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/var_tran_son_an_b.png` |
| `skl_hoanh_kiem_pha_mach` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_hoanh_kiem_pha_mach.png` |
| `skl_kiem_vu_tam_diep` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_kiem_vu_tam_diep.png` |
| `skl_kiem_dan_ban_menh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_kiem_dan_ban_menh.png` |
| `skl_nghich_kiem_chuyen_phong` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_nghich_kiem_chuyen_phong.png` |
| `skl_phan_anh_kiem_anh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_phan_anh_kiem_anh.png` |
| `skl_thuan_di_tram` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thuan_di_tram.png` |
| `skl_thien_kiem_hoa_hinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thien_kiem_hoa_hinh.png` |
| `skl_thiet_quyen_chan_dia` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thiet_quyen_chan_dia.png` |
| `skl_kim_chung_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_kim_chung_tran.png` |
| `skl_son_nhac_hoa_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_son_nhac_hoa_than.png` |
| `skl_dich_son_xung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_dich_son_xung.png` |
| `skl_anh_thiet_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_anh_thiet_than.png` |
| `skl_thuan_di_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thuan_di_ho_the.png` |
| `skl_thien_kim_phap_tuong` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thien_kim_phap_tuong.png` |
| `skl_moc_linh_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_moc_linh_tran.png` |
| `skl_duoc_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_duoc_vu.png` |
| `skl_ngung_dan_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_ngung_dan_ho_the.png` |
| `skl_dan_hoa_phong_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_dan_hoa_phong_tran.png` |
| `skl_anh_duoc_hoa_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_anh_duoc_hoa_than.png` |
| `skl_thuan_di_cuu_vien` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thuan_di_cuu_vien.png` |
| `skl_thien_dan_phap_gioi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/skl_thien_dan_phap_gioi.png` |
| `itm_ngung_dan_mach_tinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ngung_dan_mach_tinh.png` |
| `itm_ket_dan_dich` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ket_dan_dich.png` |
| `itm_mach_tinh_phien` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_mach_tinh_phien.png` |
| `itm_hoang_sa_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_hoang_sa_thao.png` |
| `itm_pha_canh_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pha_canh_dan_2.png` |
| `itm_hoi_mach_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_hoi_mach_dan.png` |
| `itm_kim_cuong_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kim_cuong_dan_2.png` |
| `itm_bao_huyet_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_bao_huyet_dan_2.png` |
| `itm_manh_luc_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_manh_luc_dan_2.png` |
| `itm_liet_mach_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_liet_mach_kiem.png` |
| `itm_mach_van_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_mach_van_dao_bao.png` |
| `itm_sa_thach_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_sa_thach_ho_uyen.png` |
| `itm_kho_ha_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kho_ha_van_ngoa.png` |
| `itm_ngan_mach_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ngan_mach_dai_lung.png` |
| `itm_mach_tinh_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_mach_tinh_ngoc_boi.png` |
| `itm_hoang_sa_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_hoang_sa_gioi_chi.png` |
| `itm_lm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_lm_dao_bao.png` |
| `itm_lm_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_lm_ho_uyen.png` |
| `itm_lm_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_lm_dai_lung.png` |
| `itm_lm_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_lm_van_ngoa.png` |
| `itm_dg_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_dg_dao_bao.png` |
| `itm_dg_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_dg_ho_uyen.png` |
| `itm_dg_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_dg_dai_lung.png` |
| `itm_dg_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_dg_van_ngoa.png` |
| `itm_pm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pm_dao_bao.png` |
| `itm_pm_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pm_ngoc_boi.png` |
| `itm_pm_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pm_dai_lung.png` |
| `itm_pm_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pm_gioi_chi.png` |
| `itm_ngung_dan_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ngung_dan_lo.png` |
| `hud_than_thuc` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_than_thuc.png` |
| `itm_kinh_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kinh_quang_kiem.png` |
| `itm_kinh_van_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kinh_van_dao_bao.png` |
| `itm_luu_ly_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_luu_ly_ho_uyen.png` |
| `itm_phu_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_phu_van_ngoa.png` |
| `itm_ngan_ha_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ngan_ha_dai_lung.png` |
| `itm_kinh_tam_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kinh_tam_ngoc_boi.png` |
| `itm_luu_quang_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_luu_quang_gioi_chi.png` |
| `itm_kq_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kq_dao_bao.png` |
| `itm_kq_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kq_ho_uyen.png` |
| `itm_kq_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kq_dai_lung.png` |
| `itm_kq_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kq_van_ngoa.png` |
| `itm_vk_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_vk_dao_bao.png` |
| `itm_vk_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_vk_ho_uyen.png` |
| `itm_vk_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_vk_dai_lung.png` |
| `itm_vk_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_vk_van_ngoa.png` |
| `itm_ll_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ll_dao_bao.png` |
| `itm_ll_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ll_ngoc_boi.png` |
| `itm_ll_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ll_dai_lung.png` |
| `itm_ll_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ll_gioi_chi.png` |
| `itm_kinh_hoa_sa` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kinh_hoa_sa.png` |
| `itm_van_hai_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_van_hai_lo.png` |
| `itm_bich_ngoc_nhi` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_bich_ngoc_nhi.png` |
| `itm_pha_canh_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_pha_canh_dan_3.png` |
| `itm_kim_cuong_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_kim_cuong_dan_3.png` |
| `itm_bao_huyet_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_bao_huyet_dan_3.png` |
| `itm_manh_luc_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_manh_luc_dan_3.png` |
| `itm_nguyen_anh_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_nguyen_anh_dan.png` |
| `itm_ngung_anh_phach` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/itm_ngung_anh_phach.png` |
| `hud_nguyen_anh` | Sinh bởi Codex cho dự án | dự án | 2026-11-16 | `2d/icons/hud_nguyen_anh.png` |

## Nhân vật nền v2 (CHR-PROTO, 2026-11-17)

Bản thử, không thay nhân vật trong game (`?chr=v2`, docs/chr-v2). Thân và tay: **MakeHuman** qua addon **MPFB2** (<https://github.com/makehumancommunity/mpfb2>, bản 2.0.18). Dùng riêng phần **lưới cơ sở, target hình thể (macro Á Đông), bộ xương Mixamo và trọng số kèm theo MPFB** (thư mục `src/mpfb/data/`), toàn bộ phát hành **CC0 1.0** (`LICENSE.ASSETS.md` của MPFB; mã Python của MPFB là GPL nhưng chỉ chạy như công cụ, không đóng gói vào game). Không dùng asset pack tải riêng (quần áo, tóc, da của MakeHuman Community). Da và đồ lót vẽ thủ tục bằng `tools/blender/chr_base_v2.py`. **Đầu và tóc** do người dùng dựng trên Tripo web app (image→3D H3.1) từ concept sinh bằng Codex (`tools/codex-assets/chr-base-gen.mjs`), gộp vào thân bằng `tools/blender/chr_v2_head.py`. Bốn áo (hai bộ × nam, nữ) dựng lại trên thân này dùng nguồn Tripo của hai bộ Liệt Mạch và Kính Quang như dòng của chúng ở trên.

| ID | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `chr_v2_nam` | MakeHuman base mesh + target + rig/trọng số Mixamo qua MPFB2 (CC0-1.0); đầu + tóc Tripo web app (người dùng dựng) từ concept Codex; gộp bằng tools/blender/chr_v2_head.py | dự án + CC0-1.0 | 2026-11-17 | xem meta.json |
| `chr_v2_nu` | MakeHuman base mesh + target + rig/trọng số Mixamo qua MPFB2 (CC0-1.0); đầu + tóc Tripo web app (người dùng dựng) từ concept Codex; gộp bằng tools/blender/chr_v2_head.py | dự án + CC0-1.0 | 2026-11-17 | xem meta.json |
| `chr_v2_hb_nam` | MakeHuman base mesh + target + rig/trọng số Mixamo qua MPFB2 (CC0-1.0); đầu + tóc Tripo web app (người dùng dựng) từ concept Codex; gộp bằng tools/blender/chr_v2_head.py | dự án + CC0-1.0 | 2026-11-17 | xem meta.json |
| `chr_v2_hb_nu` | MakeHuman base mesh + target + rig/trọng số Mixamo qua MPFB2 (CC0-1.0); đầu + tóc Tripo web app (người dùng dựng) từ concept Codex; gộp bằng tools/blender/chr_v2_head.py | dự án + CC0-1.0 | 2026-11-17 | xem meta.json |
| `set_de_tu_v2_nam` | Thủ tục: sao chép vùng lưới thân MakeHuman (CC0 qua MPFB2), tools/blender/chr_v2_starter.py | dự án | 2026-11-17 | xem meta.json |
| `set_de_tu_v2_nu` | Thủ tục: sao chép vùng lưới thân MakeHuman (CC0 qua MPFB2), tools/blender/chr_v2_starter.py | dự án | 2026-11-17 | xem meta.json |
| `set_dia_long_ho_giap_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_dia_long_ho_giap_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_phuc_mach_dan_bao_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_phuc_mach_dan_bao_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_tinh_khuyet_kiem_bao_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_tinh_khuyet_kiem_bao_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_co_thanh_huyen_giap_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_co_thanh_huyen_giap_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_than_tang_dan_bao_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_than_tang_dan_bao_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_van_kinh_thiet_giap_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_van_kinh_thiet_giap_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_luu_ly_dan_y_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_luu_ly_dan_y_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_liet_mach_kiem_y_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_liet_mach_kiem_y_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_kinh_quang_kiem_y_v2_nam` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `set_kinh_quang_kiem_y_v2_nu` | Tripo web app (image→3D H3.1) + Codex (concept), áo mô-đun dựng lại trên thân v2 bằng tools/blender/outfit_build.py | dự án | 2026-11-17 | xem meta.json |
| `anim_ual_native` | Thư viện 37 clip UAL cho nhân vật v3, GIỮ tên xương UE5 Mannequin (phát trực tiếp, không chuyển clip): Quaternius Universal Animation Library 1 + 2 bản Standard, **CC0 1.0** (https://quaternius.com), gói bằng `tools/blender/anim_ual_native.py`; nguồn ở `../dtl-asset-source/anim/ual/SOURCE.md` | Quaternius | CC0-1.0 | 2026-11-18 | Không bắt buộc ghi công (vẫn ghi ở màn Ghi công) |
| `chr_v3_lac_kiem_nam` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Lạc Kiếm Môn Phục v3 (nam); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_lac_kiem_nu` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Lạc Kiếm Môn Phục v3 (nữ); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3b_lac_kiem_nam` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Lạc Kiếm Môn Phục v3b, vạt xẻ hai bên đối xứng (nam); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3b_lac_kiem_nu` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Lạc Kiếm Môn Phục v3b, vạt xẻ hai bên đối xứng (nữ); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3b2_lac_kiem_nam` | Như `chr_v3b_lac_kiem_nam` (Tripo web app, người dùng dựng, concept Codex Lạc Kiếm Môn Phục v3b), vạt 12 chuỗi lò xo; đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3b2_lac_kiem_nu` | Như `chr_v3b_lac_kiem_nu` (Tripo web app, người dùng dựng, concept Codex Lạc Kiếm Môn Phục v3b), vạt 12 chuỗi lò xo; đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_varkessa_nu` | Sketchfab: "VARKESSA // The Infernal Emberblade" của **Atahan3D** (https://sketchfab.com/Atahan3D), bản đã sửa của `set_skin_varkessa_nu`, đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` (bản thử pipeline N-0) | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "VARKESSA // The Infernal Emberblade" by Atahan3D, https://sketchfab.com/3d-models/varkessa-the-infernal-emberblade-13c07cff4b884037a08b7463df5bc996. Đã sửa: bỏ đại kiếm dính tay, giảm tam giác, nướng lại texture, dựng xương và trọng số, đổi tư thế nghỉ sang UE5 Mannequin |
| `chr_v3_duskrella_nu` | Sketchfab: "DUSKRELLA the Ashen Whisper" của **Atahan3D** (https://sketchfab.com/Atahan3D), đã sửa: giảm 489.286 → 20.000 tam giác, nướng lại texture, dựng xương và trọng số (`tools/blender/skin_prep.py`, `skins/duskrella.json`), đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "DUSKRELLA the Ashen Whisper" by Atahan3D, https://sketchfab.com/3d-models/1df2e0ecd2364312a8d7821e45d180b2 . Đã chỉnh sửa (xem cột nguồn) |
| `chr_v3_crimson_nam` | Sketchfab: "Crimson Death Knight - Dual Falchions" của **Pigcraft** (https://sketchfab.com/s8819296), đã sửa: bỏ hai đao dính tay, giảm 1.923.148 → 22.000 tam giác, nướng lại texture, dựng xương và trọng số (`skin_prep.py`, `skins/crimson.json`), đặt lên bộ xương UE5 Mannequin bằng `chr_v3.py` | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "Crimson Death Knight - Dual Falchions" by Pigcraft, https://sketchfab.com/3d-models/crimson-death-knight-dual-falchions-08a29190cc7d458dbaf1085991520ef5 . Đã chỉnh sửa (xem cột nguồn) |
| `chr_v3_noxavyra_nu` | Sketchfab: "NOXAVYRA // The Crimson Twinblade" của **Atahan3D** (https://sketchfab.com/Atahan3D), đã sửa: bỏ hai katana dính tay (tsuba, lưỡi, cán sau hông), giảm 405.549 → 22.000 tam giác, nướng lại texture, dựng xương và trọng số (`tools/blender/skin_prep.py`, `tools/blender/skins/noxavyra.json`), đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | CC-BY-4.0 | 2026-11-18 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "NOXAVYRA // The Crimson Twinblade" by Atahan3D, https://sketchfab.com/3d-models/noxavyra-the-crimson-twinblade-194340bf60d1496eb723fa89909d44bf . Đã chỉnh sửa (xem cột nguồn). |
| `chr_v3_kings_demon_nu` | Sketchfab: "Kings Demon" của **Wilson (neilhancart)** (https://sketchfab.com/neilhancart), đã sửa: gộp 8 vật liệu/19 ảnh về một atlas, giảm 64.150 → 24.000 tam giác, nướng lại texture, dựng xương và trọng số (`tools/blender/skin_prep.py`, `tools/blender/skins/kings_demon.json`), đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | CC-BY-NC-4.0 | 2026-11-18 | **Phải ghi công** (CC BY-NC 4.0, https://creativecommons.org/licenses/by-nc/4.0/): "Kings Demon" by Wilson (neilhancart), https://sketchfab.com/3d-models/kings-demon-1c8a4b2cd3ce4492ac0cff2fdfe4e59d . Đã chỉnh sửa (xem cột nguồn). **KHÔNG THƯƠNG MẠI (NC): gỡ asset này nếu game có thu tiền.** |
| `chr_v3_korvaden_nam` | Sketchfab: "KORVADEN // The Runebound Axemaster" của **Atahan3D** (https://sketchfab.com/Atahan3D), đã sửa: xoay thân về -Y, bỏ hai rìu dính tay, giảm 1.294.723 → 22.000 tam giác, nướng lại texture, dựng xương và trọng số, đặt lại tư thế khom về tư thế nghỉ (`tools/blender/skin_prep.py`, `tools/blender/skins/korvaden.json`), đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | CC-BY-4.0 | 2026-11-19 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "KORVADEN // The Runebound Axemaster" by Atahan3D, https://sketchfab.com/3d-models/56b55945548942f28359c76820b4e910 . Đã chỉnh sửa (xem cột nguồn). |
| `chr_v3_shadow_wolf_nam` | Sketchfab: "Shadow Wolf Warlord Knight" của **Pigcraft** (https://sketchfab.com/s8819296), đã sửa: xoay mặt về -Y, bỏ đại kiếm dính tay trái, giảm 1.000.095 → 22.000 tam giác, nướng lại texture, dựng xương và trọng số (`tools/blender/skin_prep.py`, `tools/blender/skins/shadow_wolf.json`), đặt lên bộ xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | CC-BY-4.0 | 2026-11-19 | **Phải ghi công** (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): "Shadow Wolf Warlord Knight" by Pigcraft, https://sketchfab.com/3d-models/shadow-wolf-warlord-knight-2838faddd383439cb0c067402cb4c61f . Đã chỉnh sửa (xem cột nguồn). |
| `chr_v3_dan_tam_nam` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Đan Tâm Y Bát (v3, nam); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_dan_tam_nu` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Đan Tâm Y Bát (v3, nữ); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_de_tu_nam` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Đồ Đệ Tử (v3, nam); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_de_tu_nu` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Đồ Đệ Tử (v3, nữ); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_huyen_giap_nam` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Huyền Giáp Hộ Pháp (v3, nam); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |
| `chr_v3_huyen_giap_nu` | Tripo web app (image→3D, người dùng dựng) từ concept Codex Huyền Giáp Hộ Pháp (v3, nữ); đặt lên xương UE5 Mannequin bằng `tools/blender/chr_v3.py` | dự án | 2026-11-18 | xem meta.json |


## VFX viết lại bằng TSL từ gói bên ngoài (2026-11-18)

Không có file, mesh hay shader nguồn nào của các gói dưới đây nằm trong repo. Shader Godot được **viết lại bằng TSL từ kỹ thuật** (client `apps/client/src/render/vfx/`); riêng âm thanh CC0 được cắt, cân âm lượng rồi đóng sprite (`tools/audio/sounds.json`, gói `elem`; khối giấy phép âm thanh ở trên). Ghi công hiển thị trong game ở Cài đặt → Ghi công (`packages/content/data/credits.json`).

### EdgeFlux Lite (MIT)

Dùng kỹ thuật: dải vũ khí nội suy Catmull-Rom (`bladeTrail.ts`), phần cũ co dần về mũi + viền cắt sáng gắt + nhiễu năng lượng (`trail.ts` `bladeTrailNodes`), viền cắt của kiếm khí (`slash.ts`), vạch chéo va chạm "clash cross" (`stylized.ts` `burstNodes`).

```
MIT License

Copyright (c) 2026 gennai (https://gennai.itch.io)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Nguồn: https://gennai.itch.io/edgeflux

### Storm & Wind 3D Free (CC BY 4.0)

Storm & Wind 3D Free by heyheythere - https://heyheythere.itch.io/storm-wind-3d-free - CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Đã chỉnh sửa: viết lại bằng TSL từ kỹ thuật (nhấp nháy tia sét, đốm sáng mũi tia dẫn trong `lightning.ts` `boltNodes`; vũng sáng, tia chớp tỏa và vòng xung kích chỗ sét đánh là decal `strike` trong `stylized.ts`; đường gió `windNodes` + hình `gust` trong `fxShapes.ts`).

### Godot 4 Elemental Spells VFX + SFX: Free Sampler (CC0 1.0)

SquigglyFish, https://squigglyfish.itch.io/godot-elemental-spells-vfx-sfx. Chỉ dùng 20 file âm thanh (lửa, băng, sét); không cần ghi công, vẫn ghi để truy nguồn.

## Icon 2D Codex v2 (U2-I, 2026-11-18)

Sinh bằng công cụ ảnh tích hợp Codex (`codex exec`) cho dự án Đạp Thiên Lộ, thiết kế gốc, không dùng Tripo hay dịch vụ ngoài. Mỗi tờ là một lưới 3×2 icon (1536×1024) cắt và căn giữa thành PNG 256 px; atlas WebP 128/64 px ở `apps/client/public/assets/ui/icons-{hud,items}.v2.*.webp`. Nguồn: `<DTL_ASSET_SOURCE>/2d/icon/v2/` (`sheets/` tờ gốc + prompt, `png256/` icon đã cắt). Danh sách tờ và prompt: `tools/icons/sheets.v2.json`.

| Nhóm | Số icon | Nguồn |
| --- | --- | --- |
| Trang bị 16 bộ (72 món) | 72 | `2d/icon/v2/sheets/s_set_*.png` |
| Trang bị mẫu thường, pháp bảo, đan phụ | 42 | `s_extra_01..07.png` |
| Vật phẩm, nguyên liệu, skin | 69 | `s_item_01..12.png`, `s_reroll_01.png` |
| Chiêu | 36 | `s_skill_01..06.png` |
| Linh ngọc, linh căn, vai trò, buff đan, tiền tệ, công pháp | 30 | `s_misc_01..05.png` |
| Biến thức A/B | 18 | dựng bằng mã từ icon chiêu gốc + chip A/B (không có ảnh riêng) |
| Icon hệ thống (hub, dấu nhiệm vụ, tiền, buff/debuff, nhãn, hệ thống) | 75 | SVG tự viết, `sprite-system.*.svg`, tác giả dự án, không bên thứ ba |

Mỗi icon trong atlas (tên khóa = id icon):

| Icon | Nguồn tạo | Tác giả | Ngày | Nguồn |
| --- | --- | --- | --- | --- |
| `buff_atk` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `buff_crit` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `buff_def` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `cur_linh_thach` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `gem_hoa_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `gem_hoa_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `gem_hoa_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `gem_kim_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_kim_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_kim_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_moc_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_moc_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_moc_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_01.png` |
| `gem_tho_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_reroll_01.png` |
| `gem_tho_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_03.png` |
| `gem_tho_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_03.png` |
| `gem_thuy_1` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `gem_thuy_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `gem_thuy_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_02.png` |
| `hud_cai_dat` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_cong_phap` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_ngu_kiem` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_nguyen_anh` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_nhan_vat` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_nhiem_vu` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_than_thuc` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_thien` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_to_doi` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_tro_giup` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `hud_tui` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `itm_bac_hoang_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_09.png` |
| `itm_bao_huyet_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_bao_huyet_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_bao_huyet_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_bi_tich_tan_quyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_bich_ngoc_nhi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_07.png` |
| `itm_bo_y` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_co_thanh_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_co_thanh_phien` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_ct_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_co_thanh.png` |
| `itm_ct_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_co_thanh.png` |
| `itm_ct_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_co_thanh.png` |
| `itm_ct_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_co_thanh.png` |
| `itm_ct_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_co_thanh.png` |
| `itm_da_hanh_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_dai_lung_da` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_dai_lung_ngoc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_dai_lung_vai` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_dg_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dia_giap.png` |
| `itm_dg_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dia_giap.png` |
| `itm_dg_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dia_giap.png` |
| `itm_dg_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dia_giap.png` |
| `itm_dg_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dia_giap.png` |
| `itm_dinh_than_phu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_dt_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dan_tam.png` |
| `itm_dt_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dan_tam.png` |
| `itm_dt_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dan_tam.png` |
| `itm_dt_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_dan_tam.png` |
| `itm_gioi_chi_dong` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_gioi_quang_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_09.png` |
| `itm_gioi_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_09.png` |
| `itm_gioi_van_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_10.png` |
| `itm_han_giao_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_han_giao_hoan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_han_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_hg_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_huyen_giap.png` |
| `itm_hg_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_huyen_giap.png` |
| `itm_hg_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_huyen_giap.png` |
| `itm_hg_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_huyen_giap.png` |
| `itm_hgl_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_han_giao.png` |
| `itm_hgl_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_han_giao.png` |
| `itm_hgl_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_han_giao.png` |
| `itm_ho_phu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_ho_uyen_da` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_ho_uyen_thiet` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_ho_uyen_vai` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_hoa_than_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_hoa_than_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_10.png` |
| `itm_hoang_sa_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_hoang_sa_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_hoi_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_hoi_mach_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_hoi_xuan_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_huyen_thiet_gioi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_huyen_van_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_huyet_linh_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_08.png` |
| `itm_ket_dan_dich` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_09.png` |
| `itm_kho_ha_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_04.png` |
| `itm_kiem_phach` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_09.png` |
| `itm_kim_cuong_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_kim_cuong_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_kim_cuong_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_02.png` |
| `itm_kim_da_mien` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_09.png` |
| `itm_kinh_hoa_sa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_09.png` |
| `itm_kinh_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_kinh_tam_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_kinh_van_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_kq_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_kinh_quang.png` |
| `itm_kq_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_kinh_quang.png` |
| `itm_kq_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_kinh_quang.png` |
| `itm_kq_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_kinh_quang.png` |
| `itm_liet_mach_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_linh_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_09.png` |
| `itm_linh_ti_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_linh_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_lk_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_lac_kiem.png` |
| `itm_lk_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_lac_kiem.png` |
| `itm_lk_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_lac_kiem.png` |
| `itm_lk_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_lac_kiem.png` |
| `itm_ll_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_luu_ly.png` |
| `itm_ll_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_luu_ly.png` |
| `itm_ll_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_luu_ly.png` |
| `itm_ll_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_luu_ly.png` |
| `itm_lm_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_liet_mach.png` |
| `itm_lm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_liet_mach.png` |
| `itm_lm_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_liet_mach.png` |
| `itm_lm_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_liet_mach.png` |
| `itm_lm_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_liet_mach.png` |
| `itm_luu_ly_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_luu_quang_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_05.png` |
| `itm_mach_tinh_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_mach_tinh_phien` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_mach_van_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_manh_luc_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_manh_luc_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_manh_luc_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_03.png` |
| `itm_moc_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_nanh_soi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_ngan_ha_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_ngan_mach_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_02.png` |
| `itm_ngoc_boi_linh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_ngoc_boi_moc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_06.png` |
| `itm_ngoc_boi_thanh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_ngung_anh_phach` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_ngung_dan_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_ngung_dan_mach_tinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_nguyen_anh_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_10.png` |
| `itm_nguyen_quang_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_10.png` |
| `itm_pha_an_phu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_pha_canh_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_pha_canh_dan_2` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_03.png` |
| `itm_pha_canh_dan_3` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_04.png` |
| `itm_phu_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_pm_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_phuc_mach.png` |
| `itm_pm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_phuc_mach.png` |
| `itm_pm_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_phuc_mach.png` |
| `itm_pm_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_phuc_mach.png` |
| `itm_pm_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_phuc_mach.png` |
| `itm_sa_thach_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_skin_crimson_knight` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skin_tokens.png` |
| `itm_skin_duskrella` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skin_tokens.png` |
| `itm_skin_kings_demon` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skin_tokens.png` |
| `itm_skin_noxavyra` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skin_tokens.png` |
| `itm_skin_shadow_wolf` | Sinh bởi Codex cho dự án | dự án | 2026-11-19 | `2d/icon/v2/sheets/s_skin_tokens_2.png` |
| `itm_skin_korvaden` | Sinh bởi Codex cho dự án | dự án | 2026-11-19 | `2d/icon/v2/sheets/s_skin_tokens_2.png` |
| `itm_skin_varkessa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skin_tokens.png` |
| `itm_tan_giac` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_tay_luyen_thach` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_than_tang_ngoc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_than_tang_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_thanh_lien_an` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_thanh_phong_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_thiet_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_thiet_tinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_thu_linh_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_tinh_khuyet_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_tinh_khuyet_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icons/` |
| `itm_tinh_quang_mac` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_tinh_van_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_08.png` |
| `itm_tinh_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_11.png` |
| `itm_tk_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_khuyet.png` |
| `itm_tk_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_khuyet.png` |
| `itm_tk_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_khuyet.png` |
| `itm_tk_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_khuyet.png` |
| `itm_tk_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_khuyet.png` |
| `itm_tkh_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tran_khich.png` |
| `itm_tkh_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tran_khich.png` |
| `itm_tkh_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tran_khich.png` |
| `itm_tkh_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tran_khich.png` |
| `itm_tkh_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tran_khich.png` |
| `itm_tqd_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_dan_bao.png` |
| `itm_tqd_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_dan_bao.png` |
| `itm_tqd_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_dan_bao.png` |
| `itm_tqd_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_dan_bao.png` |
| `itm_tqd_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tinh_dan_bao.png` |
| `itm_tram_ta_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_01.png` |
| `itm_tran_gioi_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_09.png` |
| `itm_tran_hon_linh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_truc_co_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_12.png` |
| `itm_tt_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_than_tang.png` |
| `itm_tt_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_than_tang.png` |
| `itm_tt_gioi_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_than_tang.png` |
| `itm_tt_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_than_tang.png` |
| `itm_tt_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_than_tang.png` |
| `itm_tth_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tan_thiet_v2.png` |
| `itm_tth_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tan_thiet_v2.png` |
| `itm_tth_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tan_thiet_v2.png` |
| `itm_tth_trang_suc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tan_thiet_v2.png` |
| `itm_tth_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_tan_thiet_v2.png` |
| `itm_tu_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_04.png` |
| `itm_tu_kim_ho_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_01.png` |
| `itm_van_hai_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_12.png` |
| `itm_van_ngoa_da` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_van_ngoa_vai` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_van_ngoa_van` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_extra_07.png` |
| `itm_vk_dai_lung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_van_kinh.png` |
| `itm_vk_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_van_kinh.png` |
| `itm_vk_ho_uyen` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_van_kinh.png` |
| `itm_vk_van_ngoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_set_van_kinh.png` |
| `itm_yeu_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_item_12.png` |
| `mark_nhan` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `mark_xong` | Dự án | dự án | 2026-11-18 | SVG tự viết `tools/icons/v2/sysicons.py`, rasterize |
| `met_bat_dong_kim_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `met_lac_kiem_quyet` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `met_thanh_moc_dan_kinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_05.png` |
| `role_ho_tro` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `role_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `role_tank` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `root_hoa` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `root_kim` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_03.png` |
| `root_moc` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_03.png` |
| `root_tho` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_04.png` |
| `root_thuy` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_misc_03.png` |
| `skl_anh_duoc_hoa_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_anh_thiet_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_dan_hoa_phong_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_dich_son_xung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_duoc_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_hoanh_kiem_pha_mach` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_hoi_nguyen_thuat` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_hoi_thien_dan_lo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_kiem_anh_bo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_kiem_anh_phan_quang` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_kiem_dan_ban_menh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_kiem_khi_tram` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_kiem_vu_tam_diep` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_kim_chung_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_kim_cuong_bat_hoai` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_linh_khi_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_loi_dinh_nhat_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_luu_huong_bo` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `skl_moc_linh_tran` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `skl_nghich_kiem_chuyen_phong` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_ngung_dan_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `skl_phan_anh_kiem_anh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_phi_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_son_nhac_hoa_than` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_thien_dan_phap_gioi` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `skl_thien_kiem_hoa_hinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_04.png` |
| `skl_thien_kiem_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_01.png` |
| `skl_thien_kim_phap_tuong` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_02.png` |
| `skl_thiet_bich_xung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_thiet_quyen_chan_dia` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_thuan_di_cuu_vien` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `skl_thuan_di_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_thuan_di_tram` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_tran_son_an` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_03.png` |
| `skl_van_kiem_quy_tong` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_05.png` |
| `skl_xuan_phong_hoa_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/icon/v2/sheets/s_skill_06.png` |
| `var_hoi_nguyen_thuat_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_hoi_nguyen_thuat_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_hoi_xuan_quyet_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_hoi_xuan_quyet_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_kiem_khi_tram_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_kiem_khi_tram_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_linh_khi_ho_the_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_linh_khi_ho_the_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_loi_dinh_nhat_kiem_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_loi_dinh_nhat_kiem_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_phi_kiem_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_phi_kiem_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_phi_kiem_truy_hon_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_phi_kiem_truy_hon_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_thien_kiem_vu_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_thien_kiem_vu_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_tran_son_an_a` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |
| `var_tran_son_an_b` | Dự án | dự án | 2026-11-18 | dẫn xuất từ icon chiêu gốc + chip A/B (tools/icons/v2) |

## Nền sơn thủy và lớp parallax Codex (U2-4, 2026-11-18)

Sinh bằng công cụ ảnh tích hợp Codex cho dự án Đạp Thiên Lộ (`codex exec`), thiết kế gốc, không dùng Tripo hay dịch vụ ngoài. PNG gốc + prompt ở `<DTL_ASSET_SOURCE>/2d/nen/loading|layers/`; đóng gói bằng `node tools/codex-assets/pack.mjs loading layers` thành WebP có hash ở `apps/client/public/assets/art/`.

| Ảnh | Nguồn tạo | Tác giả | Ngày | Nguồn |
| --- | --- | --- | --- | --- |
| `title_cuon` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/nen/loading/title_cuon.png` |
| `load_song` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/nen/loading/load_song.png` |
| `bac_hoang` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/nen/loading/bac_hoang.png` |
| `canh_tung` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/nen/layers/canh_tung.png` |
| `suong` | Sinh bởi Codex cho dự án | dự án | 2026-11-18 | `2d/nen/layers/suong.png` |

## Texture mặt đất Bắc Hoang (MAP-5 PR2)

Bộ snow cho `bac_hoang`, đóng gói bằng `pnpm assets:terrain --set snow` ra `apps/client/public/terrain-snow/` (nạp lười khi vào level). Năm lớp tuyết (`proc:powder|ripple|crust|drift|grit`) do chính dự án sinh thủ tục (không nguồn ngoài, không cần ghi công). Ba lớp còn lại từ [Poly Haven](https://polyhaven.com/textures), **CC0-1.0**: `dark_rock` (Rob Tuytel), `rock_wall_08` (Amal Kumar), `volcanic_rock_tiles` (Charlotte Baglioni); đã kéo về đen lam bằng `tint`.

## Lạc Kiếm Tông bản B tả thực (MAP-1)

Texture PBR từ [Poly Haven](https://polyhaven.com/textures), giấy phép **CC0-1.0** (ghi để truy vết). Bản 2K gốc ở `../dtl-asset-source/texture/<id>/` (tải bằng `pnpm assets:sect-textures`). Kiến trúc: ảnh màu đổi sang độ sáng (xám) rồi nhân màu đỉnh theo bảng màu, cộng normal + độ nhám, nướng vào `arch_sect.glb` bằng `tools/blender/thien_cong_kit.py`. Đá vách đảo nổi và atlas tán lá đóng gói bằng `pnpm assets:sky-textures` ra `apps/client/public/sky/` (atlas lá tự vẽ bằng SVG, không dùng ảnh ngoài).

| Dùng cho | Poly Haven | Tác giả | Giấy phép |
| --- | --- | --- | --- |
| ngọc trắng (nền, lan can, bậc) | [marble_rock_01](https://polyhaven.com/a/marble_rock_01) | Amal Kumar | CC0-1.0 |
| đá chân tảng, nền | [japanese_stone_wall](https://polyhaven.com/a/japanese_stone_wall) | Rico Cilliers, Charlotte Baglioni, Dario Barresi | CC0-1.0 |
| tường vữa | [plastered_stone_wall](https://polyhaven.com/a/plastered_stone_wall) | Rob Tuytel | CC0-1.0 |
| ngói lưu ly | [ceramic_roof_01](https://polyhaven.com/a/ceramic_roof_01) | Rob Tuytel | CC0-1.0 |
| cột sơn son | [lacquered_cherry_wood](https://polyhaven.com/a/lacquered_cherry_wood) | Jenelle van Heerden, Rico Cilliers | CC0-1.0 |
| gỗ xà, cửa | [dark_wood](https://polyhaven.com/a/dark_wood) | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0-1.0 |
| vách đá đảo nổi | [cliff_side](https://polyhaven.com/a/cliff_side) | James Ray Cock, Jenelle van Heerden, Dario Barresi | CC0-1.0 |

Tác giả lấy từ API Poly Haven (`/info/<id>`) ngày 2026-11-19.

Bổ sung (vòng chỉnh bản B): `metal_plate` ([Poly Haven](https://polyhaven.com/a/metal_plate), Rob Tuytel, CC0-1.0) cho thép cự kiếm; bộ mặt đất `terrain-lk` dùng cùng 8 texture Poly Haven CC0 của bộ `terrain` ở bản 2K; font [Charm Bold](https://fonts.google.com/specimen/Charm) (SIL OFL 1.1, giấy phép ở `apps/client/public/fonts/OFL-charm.txt`; bản TTF ở `../dtl-asset-source/font/`) chỉ dùng để dựng mesh chữ Việt trên biển hiệu và cự kiếm trong `arch_sect.glb`.

Bổ sung (PROP-1 Thiên Công Khai Vật): `green_metal_rust` ([Poly Haven](https://polyhaven.com/a/green_metal_rust), Rob Tuytel, CC0-1.0) cho đồng cổ rỉ xanh của đỉnh lư, lò đan, chuông, lư hương (nướng luma + normal + roughness 512 vào từng prop); `rock_boulder_cracked` và `dark_rock` (đã ghi ở mục texture địa hình) cho đá nứt và đá đen. Tải bằng `pnpm assets:sect-textures green_metal_rust`.

