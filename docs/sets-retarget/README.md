# Áo bộ trang bị mặc thật (retarget)

Thay đường "recolor + phụ kiện" bằng áo đổi dáng hẳn cho 3 mẫu Tripo (#119), nam `chr_kiem_tu_nam` và nữ `chr_kiem_tu_nu`: **6 asset** `set_<bộ>_<nam|nu>` (lớp ngân sách mới `outfit`: 500–3000 tam giác LOD0, 2 LOD, texture 1024, tối đa 60 xương).

## Cách làm

**Blender** (`tools/blender/retarget_set.py`, chạy như `import.post` của `import_tripo.py`; khối `import.retarget` trong meta.json):
1. Nguồn là `rig_v01.glb` của mẫu (ma-nơ-canh đã có trọng số skin Tripo, xương Mixamo trùng tên với người chơi). Không cần Tripo/credit.
2. Đặt lại tư thế nghỉ theo từng xương: ma-nơ-canh tay thả, người chơi chữ T. Mỗi đỉnh áo quay đường xương nguồn về đường xương đích, kéo giãn dọc xương theo tỉ lệ dài xương hai bên (kẹp 0,75–1,35, nên nữ 1,68 m ra vừa), rồi đặt vào đầu xương đích. Trọng số giữ nguyên (đổi tên nhóm sang xương người chơi, tối đa 4 ảnh hưởng).
3. Lọc ảnh hưởng lạc: Tripo skin vạt áo gần bàn tay vào xương ngón (tay chữ T kéo vạt bay ra); vạt áo ngoài tầm chân bỏ trọng số chân. Vạt dưới hông trộn một phần trọng số hai chân (`legBlend`) cho khỏi xuyên chân kia khi chạy.
4. Bỏ mặt áo thuộc đầu, cổ, bàn tay (da xám của ma-nơ-canh).
5. Xuất bộ xương người chơi + lưới áo (không clip). `pnpm assets:build --only set_liet_mach_kiem_y_nam` (nhớ `DTL_ASSET_SOURCE` khi chạy từ worktree); GLB thô của `chr_kiem_tu_*` phải dựng trước.

**Client** (`apps/client/src/game/character/outfit.ts`, `playerSkins.ts`):
- Khi bộ đang mặc (≥ 2 món, `PlayerLook.set`) có `look.outfit` trong `equipment/sets.json`, nạp lười `<outfit>_<nam|nu>`; lưới nhân vật chỉ giữ tam giác có xương trội thuộc đầu/cổ/bàn tay (hình học cắt dùng chung theo mẫu), thêm một SkinnedMesh áo mỗi LOD gắn vào skeleton người chơi (skinIndex đổi theo tên xương), material dùng chung. Da, tóc, mũ, kiếm lưng/kiếm riêng giữ nguyên. Áo chưa nạp xong/lỗi: giữ recolor + phụ kiện.
- Xem trước 3D ở bảng nhân vật (#141) đi qua cùng `PlayerSkins.create` nên hiện đúng áo.
- `?outfit=0` về đường cũ (so ảnh); `?outfit=<asset>` (vd `set_kinh_quang_kiem_y`) ép áo cho mọi bộ đang mặc (xem bộ chưa có trong dữ liệu).

## Gắn dữ liệu

| Mẫu | Bộ trong dữ liệu | Trạng thái |
| --- | --- | --- |
| `set_liet_mach_kiem_y` | `set_liet_mach` (bậc 2) | đã gắn (`look.outfit`) |
| `set_kinh_quang_kiem_y` | `set_kinh_quang` (bậc 3, EXPANSION_DESIGN mục 7) | asset sẵn, **chưa gắn**: bộ chưa có trong `sets.json` (bậc 3–4 còn khóa) |
| `set_tinh_khuyet_kiem_bao` | `set_tinh_khuyet` (bậc 4) | như trên |

Khi thêm hai bộ đó vào `sets.json` chỉ cần ghi `"outfit": "set_kinh_quang_kiem_y"` (hoặc `set_tinh_khuyet_kiem_bao`) trong `look`. `set_dia_giap`, `set_phuc_mach` chưa có mẫu nên vẫn recolor + phụ kiện.

## Kết quả kiểm

Ảnh trong game (`pnpm shots:outfit --out <thư mục tuyệt đối> [--genders m,f] [--query outfit=0] [--panel 1]`; mỗi tấm 7 khung: trước, sau, nghiêng, chạy, ngự kiếm, đả tọa, chém): `sheet_<mẫu>_<m|f>.jpg` đủ 3 bộ × 2 giới. Không thấy xuyên lưới ở các tư thế đó; trước/sau: `truoc_sau_liet_mach_nam.jpg`; bảng nhân vật: `bang_nhan_vat_liet_mach.jpg`.

Số đo (`bench:crowd --bots 50 --scenes san`, WebGPU high, 50 bot cùng mặc `set_liet_mach`, `BOT_SET=set_liet_mach`):

| | draw | tam giác | CPU p50/p95 |
| --- | --- | --- | --- |
| không mặc bộ (nền) | 201 | 1076k | 9,4 / 14,2 ms |
| recolor + phụ kiện (`?outfit=0`) | 287 | 1127k | 10,0 / 14,2 ms |
| áo mặc thật | 277 | 623k | 10,7 / 16,9 ms |

Draw call dưới 300, tam giác giảm gần một nửa so với phụ kiện thủ tục; CPU p50 ~10 ms vượt trần 8 ms nhưng nền đã vượt (9,4 ms) và chênh lệch nằm trong nhiễu. Mỗi người mặc áo thêm 1 draw call (lưới áo riêng, không gộp được vì khác texture).

## Giới hạn

- Vạt áo là tấm vỏ mỏng của Tripo: mép tua rua lởm chởm khi ngự kiếm/chạy; trọng số từ Tripo, không có xương lò xo như áo gốc.
- Vạt tay áo treo rủ ở tư thế tay thả bị kéo căng khi nhìn ở tư thế chữ T (chỉ thấy trong Blender; trong game tay luôn có clip).
- LOD1/2 của nhân vật mất vỏ kiếm lưng khi mặc áo (kiếm riêng chỉ ở LOD0).
- Texture chưa nén KTX2 trên máy dựng này (thiếu `toktx`, cảnh báo như các asset khác).
