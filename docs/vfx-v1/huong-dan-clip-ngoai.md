# Hướng dẫn: đưa clip animation làm ngoài game vào game (Cascadeur và các nguồn khác)

Dành cho người làm clip (ví dụ chiêu tối thượng, V4). Game dùng **một bộ xương người chung** (rig Mixamo, tên xương `mixamorig_*`);
clip của bạn chỉ cần dùng bộ xương đó, game tự **retarget theo tên xương** lên Thanh Phong, Lam Chi và NPC người
(`apps/client/src/game/character/animLib.ts`). Không cần mesh, không cần texture trong file.

## 1. Làm clip

1. Trong Cascadeur chọn khung xương **Mixamo/Humanoid** (hoặc nhập nhân vật Mixamo bất kỳ làm tham chiếu rồi dựng đè).
2. Dựng một chiêu **một clip**, 30 khung/giây, nhân vật nhìn về **+Z** (trục tiến), chân đứng ở gốc.
   - Chiêu thường nên ≤ 1 giây; chiêu tối thượng ≤ 2,5 giây.
   - Thứ tự nhịp nên giống chiêu có sẵn: tụ khí (chậm) → vung (rất nhanh) → theo đà → thu về.
   - **Đánh dấu khung trúng** (khung kiếm chạm): ghi lại số khung, bạn sẽ báo cho mình hoặc ghi vào `skills.json` (`hitAt`, tính bằng giây = khung / 30).
3. Xuất: **File → Export → FBX** (hoặc glTF/GLB), chỉ chọn nhân vật (armature), bật "animation", tắt mesh nếu có tùy chọn.

## 2. Chuẩn hóa bằng script (một lệnh)

Cần Blender 4.2+ (máy dự án đã có). Từ thư mục gốc repo:

```
node tools/blender/run-ext-clip.mjs --in "D:/cascadeur/chieu_van_kiem.fbx" --name ext_skl_van_kiem_quy_tong --trim 0:2.2
```

(hoặc chạy thẳng Blender:)

```
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b -P tools/blender/ext_clip.py -- ^
    --in "D:/cascadeur/chieu_van_kiem.fbx" --out "../dtl-asset-source/anim/ext/ext_skl_van_kiem_quy_tong.glb" ^
    --name ext_skl_van_kiem_quy_tong --trim 0:2.2
```

Script làm gì (`tools/blender/ext_clip.py`):

- đổi tên xương về `mixamorig_<Tên>` (bỏ tiền tố `mixamorig:`, `Armature|`, `Bip01_`...),
- gom mọi action thành **một clip** tên `--name` (đặt theo quy ước `ext_<id chiêu>`),
- **xóa trượt X/Y của Hips** (nhân vật đứng tại chỗ, game tự dịch chuyển theo luật máy chủ), giữ cao độ; thêm `--keep-root-motion` nếu muốn giữ,
- cắt đoạn `--trim bắt_đầu:kết_thúc` (giây),
- xóa mesh/material, xuất **GLB chỉ có xương + animation**.

Kiểm tự động đường xuất mà không cần file của bạn: `blender -b -P tools/blender/ext_clip.py -- --selftest --out thu.glb`.

## 3. Đưa vào game

1. Chép GLB ra `../dtl-asset-source/anim/ext/` (cạnh repo, như `tripo_lib`).
2. Thêm một mục `clips` vào `assets/source/anim/anim_human_ext/meta.json` (asset mới, cùng cấu trúc `anim_human_k3`:
   `{ "source": "anim/ext/ext_skl_van_kiem_quy_tong.glb", "name": "ext_skl_van_kiem_quy_tong" }`), rồi `pnpm assets:build --only anim_human_ext`.
3. Báo mình (hoặc worker V4) số khung trúng; phần nối clip vào máy trạng thái chiêu (`SkinnedCharacter.perform`, thay pose IK
   bằng clip `ext_<id chiêu>` khi có) làm cùng lúc với chiêu tối thượng ở gói V4. Thời điểm `hitAt` trong `skills.json` đổi theo clip.

## 4. Mẹo

- Clip lỗi retarget thường do **hướng nhìn** (phải là +Z) hoặc **tỉ lệ xương** khác Mixamo: dựng trên khung xương Mixamo thì không lỗi.
- Xem thử clip trong game: `?mute=1&show=chr_kiem_tu_nam&lib=1` (trang xem nhân vật, nạp thư viện clip).
- Không dùng clip có bản quyền không rõ; clip tự quay/tự dựng hoặc thư viện CC0 thì ghi nguồn ở `assets/LICENSES.md`.
