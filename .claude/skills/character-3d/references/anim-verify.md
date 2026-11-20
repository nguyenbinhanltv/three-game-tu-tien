# Clip áo bào, đo và nộp kết quả

## Clip: `anim_robe.py`
Job `anim_robe` trong `tools/blender/run.mjs` (nguồn UAL1 + UAL2). Mỗi clip có hồ sơ (`base`, `amp`) theo nhóm xương:

| Hồ sơ | tay | bàn tay | chân | thân/đầu |
|---|---|---|---|---|
| IDLE | 1,0 / 0,9 | 1,0 / 0,9 | 1,0 / 0,9 | 1,0 / 0,9 |
| LOCO (đi, chạy, nhảy) | 1,0 / 0,55 | 1,0 / 0,7 | 1,0 / 0,7 | 1,0 / 0,75 |
| SWORD | 1,0 / 0,65 | 1,0 / 0,8 | 1,0 / 0,8 | 1,0 / 0,85 |
| ROLL | 1,0 / 0,5 | 1,0 / 0,6 | 1,0 / 0,55 | 1,0 / 0,5 |
| HURT | 1,0 / 0,6 | 1,0 / 0,7 | 1,0 / 0,65 | 1,0 / 0,7 |
(cặp `base / amp`). Công thức mỗi khóa xoay: `q' = slerp(1, q̄, base) · slerp(1, q̄⁻¹·q, amp)` với `q̄` = trung bình đã căn nửa cầu của mọi khóa của xương trong clip.
Quy tắc: **không bao giờ `slerp(1, q, k)` với k < 1** (kéo về quaternion đơn vị = tư thế T của mẫu: Idle giang tay 36°, Jog 75°, voan bung như cánh). Kiểm góc: nhập `anim_robe.glb` vào Blender, đo góc `upperarm_l` so với hướng xuống tại 4 mốc Idle/Jog/Roll/Sword (Idle phải ≈ 20–26°, bằng bind A).
Clip thiếu trong UAL1/UAL2 (Walk_Bwd, Jog_Bwd, Jog_Strafe*, Walk_Strafe*) bị bỏ qua có thông báo: chúng nằm ở thư viện K-3 (`anim_human_k3`).
Client: `ROBE_LIB = 'anim_robe'` ghi đè clip cùng tên chỉ cho asset trong `KEEP_ORIGINAL_ASSETS` (`apps/client/src/game/character/mannequin.ts`); `?norobeanim` tắt.

## Đo: `rigstretch` và `v3views`
- `pnpm shots rigstretch --out <thư mục tuyệt đối> [--clips a,b] [--frames 12]`: trong game, bản `m.lods[0]` ở từng khung của từng clip, so độ dài mỗi cạnh với bind. Ngưỡng cạnh sai: giãn > 1,8× hoặc nén < 0,55×. Ra `rigstretch.json` (`perFrame`: `nStretch`, `nSquash`, `p99`, `max`; `nEdges`; `regions`, `pairs` cặp xương trội của cạnh hỏng), `rigstretch-worst-<clip>.json` (tỉ lệ + vị trí khung tệ nhất, để vẽ heatmap), `rest.json` (vị trí bind + nhóm xương, từ Idle). Số mỗi clip = `max` theo khung của `nStretch + nSquash`; p99 = max theo khung; % = số / `nEdges`. **Chưa tính** lò xo/va chạm sống và kiếm.
- `pnpm shots v3views --out <dir> --sets <bộ> --genders f|m`: đứng 4 góc 720p/1080p cạnh ảnh multiview Thiên Giải + tờ chuyển động 15 ô (đứng, chạy 1-2, lùi, ngang phải/trái, chém 1-3, lướt, trúng đòn nhẹ/nặng, ngồi đả tọa, ngự kiếm, bay tiến). Cần `V3_REF_DIR` nếu multiview ở chỗ khác.
- Mẫu số: lưới gốc Tinh Khuyết nữ 161.432 cạnh duy nhất (đếm `me.edges` trong Blender); C2 163.760 (đo trong game). README cũ ghi "~190k" là ước lượng sai.

## Số đo làm chuẩn (Tinh Khuyết nữ; cạnh sai gốc → C4 → C2)
Idle 6220 → 3090 → 626; Jog_Fwd 13891 → 5891 → 2086; Jog_Bwd 14137 → 6975 → 3008; Walk 7955 → 4042 → 835; Sword_Attack 17223 → 8756 → 4146; Sword_Regular_A 14323 → 6334 → 2962; B 16749 → 8959 → 3822; C 17124 → 10340 → 3745; Roll 17194 → 20014 → 3679; Hit_Chest 6113 → 3035 → 766; Hit_Knockback 14881 → 8602 → 2961; Sitting 9288 → 6255 → 2551; Jump 10920 → 5850 → 2638; Spell 8094 → 3656 → 1826; Death01 12982 → 6549 → 4813. Dữ liệu thô và ảnh: artifact phiên NV3-B (không commit).

## Chi phí runtime
12 xương lò xo voan thêm ≈ 0,02 ms/khung/nhân vật (nhóm tay áo); tổng lò xo 53 xương ≈ 0,085 ms (cận trên, đo bằng gọi `update` 3000 lần). 50 người online chỉ vài người ở LOD0; LOD khác tắt lò xo.

## Gói nộp cho người dùng duyệt (không commit ảnh)
Artifact `thi-nghiem-<tên>/`: `README.md` (kết quả so tiêu chí, đã làm, rủi ro nói thẳng), `bang-so.md` (15 clip, ba cột gốc/trước/sau), `4-goc-1080p_*.png`, `15-khung_*.png`, `heatmap_<clip>_*.png`, ảnh phân vùng lưới, ảnh trước/sau chi tiết. Báo checkpoint ngắn bằng số.
