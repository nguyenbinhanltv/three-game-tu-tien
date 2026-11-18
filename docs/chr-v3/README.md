# Nhân vật v3 (N-0 + N-1): nguyên khối, xương UE5 Mannequin, clip UAL phát trực tiếp

Kế hoạch đầy đủ ở artifact `ke-hoach-nhan-vat-v3.md` (đã duyệt 18/11). PR này làm **N-0 (pipeline + client thử)** và **N-1 (concept)**. Không đổi mặc định, không xóa v1/v2.

## Pipeline: `tools/blender/chr_v3.py`
`blender -b --factory-startup --python tools/blender/chr_v3.py -- <vào.glb> <ra.glb> --id <tên> --template <UAL1_Standard.glb> [--landmarks <json>] [--tris 24000] [--height <m>] [--springs <json>] [--sheet <thư mục>] [--report <json>]`
(chạy qua `assets:build`: job `chr_v3_varkessa_nu`, `chr_v3_v2_nam` trong `tools/blender/run.mjs`; lớp ngân sách `player_v3`.)

1. Nhập bộ xương mẫu (Mannequin của UAL1) và nhân vật; gộp, hàn đỉnh, giảm về ≤ 24k tam giác; chân về z = 0.
2. Mốc: từ xương Mixamo sẵn có (Varkessa, thân v2) hoặc `--landmarks` (cùng khuôn `autoRig.joints`, cho GLB Tripo không xương).
3. Trọng số: chép từ nhóm đỉnh nguồn (Mixamo → Mannequin), vùng thiếu theo khoảng cách tới đoạn xương, làm mượt nhẹ, ≤ 4 xương/đỉnh (cả LOD).
4. **Đặt lại tư thế nghỉ**: hướng xương giữ NGUYÊN như Mannequin, độ dài theo nhân vật; lưới biến dạng (LBS) sang tư thế đó. Xương xuất = chính bộ xương mẫu đã chỉnh vị trí, nên góc nghỉ cục bộ trùng thư viện clip và clip UAL phát đúng mà không retarget.
5. Xương game: `dtl_sword` (tay phải), `dtl_scabbard` (lưng), `dtl_head_acc` (đầu), chuỗi lò xo `dtl_o_<nhóm>_<k>_<l>` từ `--springs` (**chưa chạy thử trên model thật**: hai model thử không có vạt/tay áo rộng).
6. LOD 50%/20% (do `optimize.ts` sinh), texture ≤ 2048, KTX2.
7. Kiểm: số tam giác; xuyên thân qua 12 tư thế UAL so với tư thế nghỉ (`--report`); tờ khung 8 tư thế (`--sheet`).

Clip: `tools/blender/anim_ual_native.py` → asset `anim_ual_native` (37 clip UAL1+UAL2, **giữ tên xương Mannequin và tên clip gốc**, ~2 MB).

## Client: `?chr=v3`
`apps/client/src/game/character/mannequin.ts`: `MannequinCharacter` (`CharacterView`) dựng từ `chr_v3_*`, phát clip UAL trực tiếp (không `retargetClips`): đứng `Idle_Loop`, thủ thế `Sword_Idle`, chạy `Jog_Fwd_Loop` (timeScale = tốc độ/5,36 để chân không trượt), chém `Sword_Regular_A/B/C`, trúng đòn `Hit_Chest/Hit_Knockback`, ngã `Hit_Knockback`, ngồi `Sitting_Idle_Loop`, chết `Death01`, niệm `Spell_Simple_Idle_Loop`, nhảy/ngự kiếm `Jump_Loop`/`NinjaJump_Idle_Loop`. Kênh vị trí của `pelvis` nhân theo tỉ lệ độ cao hông nhân vật/mẫu. **Bóng tâm ma dùng cùng bộ xương** (vật liệu bóng trên chính lưới v3), nên không còn T-pose khi ngồi/ngã. Nối ở `PlayerSkins` (`create`, `createShadow`, `pending`, `dispose`). Nam = thân v2 trần (chưa có áo v3), nữ = skin Varkessa.

Chưa có (cố ý, N-4/N-5): pose chiêu K-5/IK, kiếm cầm tay và rút/tra, phụ kiện bộ đồ, K-3 (đi lùi/ngang), IK chân trên dốc, NPC/nguyên anh vẫn dùng đường cũ.

## Số đo (chạy ngày 18/11)
| | Varkessa nữ | Thân v2 nam |
| --- | --- | --- |
| Tam giác LOD0/1/2 | 19.908 / 10.471 / 3.947 | 9.294 / 4.647 / 1.858 |
| Xương | 68 (65 Mannequin + 3 `dtl_*`) | 68 |
| GLB | 5,9 MB (2 texture KTX2 2048²) | 0,7 MB |

Xuyên thân (cặp mặt chồng nhau giữa tay/thân/chân, **tăng so với tư thế nghỉ**, 12 tư thế; chỉ số tương đối, không có ngưỡng đạt/hỏng chính thức):
- Thân v2 nam: Idle 76, Jog 41/7, Sword_Attack 108/34, Sitting 312, Death 0, Roll 116, Jump 0, Spell_Simple_Idle 288, Hit_Chest 53, Crouch_Fwd 69.
- Varkessa (giáp gai, tóc, đuôi nên nhiều hơn): Idle 302, Jog 151/82, Sword_Attack 281/67, Sitting 733, Death 1745, Roll 881, Jump 24, Spell 16, Hit_Chest 580, Crouch_Fwd 711.
Thân mình vẫn còn xuyên ở ngồi, niệm chú một tay và chém: cần xương xoắn/giới hạn góc ở N-5 (UAL **không có** xương twist, khác ghi chú trong kế hoạch; muốn có phải tự thêm xương và chia trọng số bằng tay).

## Giới hạn pipeline đã biết
- Mặt nạ nhuộm 3 kênh và atlas gộp chưa làm: texture đầu vào giữ nguyên (chỉ hạ ≤ 2048).
- Chưa kiểm trượt chân (thuộc animation, N-5).
- Chưa chia trọng số xoắn (không có xương xoắn trong UAL).
- Đầu vào chưa xương (GLB Tripo thật) mới chạy bằng `--landmarks`, **chưa thử** vì chưa có model Tripo (N-2 do người dùng dựng); trọng số khi đó chỉ theo khoảng cách nên dự kiến kém hơn đường chép trọng số.
- Varkessa v3 5,9 MB (2048² KTX2) lớn hơn skin hiện có (2,1 MB, 1024²): bản thử, không dùng làm chuẩn ngân sách.

## N-1 concept và Tripo
`pnpm`-ngoài: `node tools/codex-assets/chr-v3-gen.mjs` sinh `v3_<nam|nu>_<front|side|back>.png` + `.prompt.txt` vào `<dtl-asset-source>/chr/set_lac_kiem/concept/` (chỉ thêm file). Hướng dẫn dựng Tripo web (Multi-view, HD, PBR, không auto-rig, `raw_v3_nam.glb`/`raw_v3_nu.glb` vào `.../set_lac_kiem/tripo/`) ở artifact `huong-dan-tripo-nhan-vat-v3.md`.

## Quay video so sánh
`pnpm shots chrv3 --out <thư mục tuyệt đối>` (nam/nữ × `v2`/`v3`, cùng chuỗi: đứng, chạy, chém 3 đòn, trúng đòn nhẹ/nặng, ngã, đả tọa, chết/hồi sinh). Video ghép trái v2, phải v3 nằm ở artifact phiên (không commit).
