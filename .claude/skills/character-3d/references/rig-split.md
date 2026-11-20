# Rig bind A-pose + tách lưới C2: tham số theo bộ

Tất cả cấu hình ở MỘT file `tools/blender/skins/v3sets/<bộ>.json` (mẫu `_template_ao_dai.json`, `_template_giap.json`, `_template_de_tu.json`; tên bắt đầu `_` bị bỏ qua). `run.mjs` (`v3SetEntries`) sinh job `chr_v3_<set>_<giới>` và truyền cờ: `--bind-a` (khi `bindA` bao gồm giới đó), `--keep-original`, `--split-cloth`, `--c2` (khi có khối `c2`). Mẫu đã chạy: file `tinh_khuyet.json` của Tinh Khuyết nữ.

## Khối cấu hình
| Khóa | Ý nghĩa |
|---|---|
| `raw`, `height`, `bindA` | GLB nguồn (`{g}` = nam/nu), chiều cao m theo giới, giới nào bind A (`["nu"]`) |
| `keepOriginal`, `splitCloth` | LOD0 nguyên gốc; tách mesh phụ `_oldsleeve` (client chỉ dùng khi thử `?cloth`) |
| `groups`, `robe`, `sleeve`, `limbs` | lò xo vạt/tóc/tua, trọng số vạt trước/sau, voan tay áo (geodesic), lò xo cẳng tay (số theo phần chiều cao) |
| `anatomy` | mốc giải phẫu m (model cao 1,7): `shoulderDz` (vai hạ), `shoulderX`, `ankleX` (cổ chân vào), `spine3Z` (hạ `spine_03`), `smoothIters`/`smoothAlpha` (làm mượt đồ thị cạnh), `finalSmooth` |
| `c2` | tách lưới (bên dưới) |

## Mốc giải phẫu
`--auto` ước lượng từ tỉ lệ Mannequin 8 đầu; model đầu to/mão sai vai ~12 cm, cổ chân ~8 cm, đoạn `spine_03→neck_01` 5 cm thay vì ~18 cm. Quy trình: build → ảnh xương chồng lưới (nhìn trước và bên, đo cm) → đặt `anatomy` → build lại. Chỉnh mốc không giảm lỗi vải đủ (Idle 3,3% → 1,6%); bắt buộc mặt nạ phía + làm mượt + tách lưới.

## Khối `c2` (mặc định trong script `chr_v3_c2.py`, đè bằng JSON)
| Khóa | Mặc định | Ghi chú |
|---|---|---|
| `lavLum` | 0,42 | độ sáng texel tối thiểu của voan (kèm B > G + 0,06) |
| `veilX`, `armKeep` | 0,12; 0,045 | voan nằm ngoài trục thân quá `veilX`, cách trục tay quá `armKeep` (phần chiều cao 1,7 m) |
| `veilXLow`, `veilZLow` | 0,20; 0,9 | dưới `veilZLow` mọi thứ ngoài `veilXLow` là voan (gấu voan lavender lẫn ren vàng) |
| `waistZ` | 0,96 | trên là thân, dưới là vạt (trước/sau theo y của hông) |
| `legR`, `legZ` | 0,065; 0,30 | chân/ủng: trong bán kính quanh cẳng/bàn và dưới độ cao này |
| `seamTie` | 0,3 | trộn trọng số hai bản sao ở đường cắt |
| `veilStrips`, `veilLinks` | 3; 2 | chuỗi xương phụ voan mỗi bên (giữ tổng xương ≤ 128) |
| `veilParent`, `veilChain`, `veilPelvis`, `veilArmR`, `veilTop`, `veilHem` | `pelvis`; 0,45; 0,7; 0,10; 1,05; 0,08 | cha chuỗi, phần trọng số về chuỗi, phần về hông, bán kính ảnh hưởng tay, mốc trên/dưới voan |
| `skirtThighK` | 0,5 | tỉ lệ giữ phần vạt bám đùi/cẳng/bàn |
| `smooth` | 12 | vòng làm mượt theo vùng |
| `armTube`, `legTube` | false | ống tay/chân của thân dưới áo (lòi ra ngoài vải) |
| `underScale`, `underColor` | 0,85; `[0.25,0.20,0.34]` | cỡ ống thân; màu texel nền (lấy UV của đỉnh có texel gần màu này) |

Thử nhanh không sửa file: biến môi trường `C2_JSON='{"seamTie":0}'` (trộn đè lên khối `c2`); `C2_DUMP2=<file.npz>` ghi vị trí, nhãn vùng, trọng số để vẽ ảnh phân vùng bằng numpy/matplotlib (chạy Python **ngoài** thư mục có file tên trùng thư viện chuẩn như `inspect.py`).

## Thứ tự trong `chr_v3.py` (chỗ cần biết khi sửa)
1. Nhập mẫu + model, KEEP: không hàn/decimate. 2. Khung xương F theo mốc, trọng số khoảng cách + mặt nạ phía + làm mượt 40 vòng. 3. Bind A: giữ lưới A, khung xương đặt theo lưới. 4. Xương game, twist, lò xo (`groups`, `robe`, `sleeve`, `limbs`). 5. **Giai đoạn C2 chèn ngay trước khi tạo nhóm đỉnh** (sau lò xo, trước `finalSmooth`): sau đó mọi mảng theo đỉnh (`W`, `VP`, `adj`, `RIGID`, `SLEEVE`, `TEXEL`) đã được dựng lại theo lưới mới. 6. Nhóm đỉnh + xuất; vá góc nghỉ nút xương theo template.

## Kiểm sau khi build
- Log có dòng `C2 cạnh cầu nối sau cắt: {… 0 …}`, `C2 xong`, `xuất … bones ≤ 128`.
- `Traceback` = lỗi; `run.mjs` vẫn thoát 0.
- Chứng minh bảo toàn: so tập (vị trí×1000, UV×1000) lưới gốc với mọi mesh của GLB sau (trừ LOD): thiếu ≤ vài chục do làm tròn; mặt = gốc + 2 × (số ô thân dưới áo). Ảnh trước/sau cùng camera, **bỏ Armature modifier** khi dựng ảnh tĩnh (nút xương đã vá về góc nghỉ template nên import vào Blender trông méo).
