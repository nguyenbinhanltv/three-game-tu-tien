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

## Giới hạn pipeline đã biết (N-0)
- Mặt nạ nhuộm 3 kênh và atlas gộp chưa làm: texture đầu vào giữ nguyên (chỉ hạ ≤ 2048).
- Chưa kiểm trượt chân (thuộc animation, N-5).
- Chưa chia trọng số xoắn (không có xương xoắn trong UAL).
- Đầu vào chưa xương (GLB Tripo thật) mới chạy bằng `--landmarks`, **chưa thử** vì chưa có model Tripo (N-2 do người dùng dựng); trọng số khi đó chỉ theo khoảng cách nên dự kiến kém hơn đường chép trọng số.
- Varkessa v3 5,9 MB (2048² KTX2) lớn hơn skin hiện có (2,1 MB, 1024²): bản thử, không dùng làm chuẩn ngân sách.

## N-1 concept và Tripo
`pnpm`-ngoài: `node tools/codex-assets/chr-v3-gen.mjs` sinh `v3_<nam|nu>_<front|side|back>.png` + `.prompt.txt` vào `<dtl-asset-source>/chr/set_lac_kiem/concept/` (chỉ thêm file). Hướng dẫn dựng Tripo web (Multi-view, HD, PBR, không auto-rig, `raw_v3_nam.glb`/`raw_v3_nu.glb` vào `.../set_lac_kiem/tripo/`) ở artifact `huong-dan-tripo-nhan-vat-v3.md`.

## Quay video so sánh
`pnpm shots chrv3 --out <thư mục tuyệt đối>` (nam/nữ × `v2`/`v3`, cùng chuỗi: đứng, chạy, chém 3 đòn, trúng đòn nhẹ/nặng, ngã, đả tọa, chết/hồi sinh). Video ghép trái v2, phải v3 nằm ở artifact phiên (không commit).

## N-3: Lạc Kiếm Môn Phục v3 (model Tripo thật, `?chr=v3`)

Hai model Tripo toàn thân của người dùng (`<dtl-asset-source>/chr/set_lac_kiem/tripo/raw_v3_nam.glb` 57,6k tam giác, `raw_v3_nu.glb` 57,9k): tay chếch rõ, khe giữa chân, mặt rõ: **không lỗi cần dựng lại**. Nhập bằng `chr_v3.py` (job `chr_v3_lac_kiem_nam|nu` trong `run.mjs`, `--auto --height 1.84|1.70 --springs tools/blender/skins/v3_lac_kiem_springs.json`); asset thử thân v2 đã bỏ (Varkessa v3 giữ làm skin, xem #214).

- **Mốc tự động** (`--auto`, `estimate_landmarks`): tỉ lệ khớp lấy từ Mannequin co theo chiều cao, tay (đầu ngón) và chân (cổ chân, mũi chân) đo từ lưới. Đủ cho nhân vật ~8 đầu chữ A; GLB không xương không có nhóm đỉnh để chép nên trọng số theo khoảng cách tới đoạn xương.
- **Vạt đạo bào** (`robe` trong cấu hình): ở giữa trước/sau bám hông, ra ngoài mới bám đùi cùng phía (tránh vạt bị xé khi hai chân tách); thêm 8 chuỗi × 2 xương lò xo `dtl_o_skirt_*` (trọng số chuyển 60% theo độ sâu). Client chạy `SpringBones` chung (`spring.ts`) cho mọi xương `dtl_o_*` ở LOD0.
- **Kiếm/vỏ**: client gắn mesh kiếm (`prop_kiem_*`, `look.w`) vào `dtl_scabbard` (lưng, chéo xuống) khi nghỉ và `dtl_sword` (nắm tay) khi giao chiến; `bladePoints` cho vệt kiếm.
- **Số đo** (24.000 / 12.000 / 4.800 tam giác, 84 xương = 65 Mannequin + 3 `dtl_*` + 16 lò xo; GLB 3,5 MB mỗi bản, texture 2048² KTX2). Xuyên thân (cặp mặt chồng, tăng so với tư thế nghỉ):
  - Nam: Idle 1, Jog 7/8, Sword_Attack 312/12, Sitting 1170, Death 1, Roll 584, Jump 1, Spell 4, Hit_Chest 64, Crouch_Fwd 367.
  - Nữ: Idle 26, Jog 21/47, Sword_Attack 82/14, Sitting 385, Death 18, Roll 34, Jump 30, Spell 15, Hit_Chest 98, Crouch_Fwd 88.
- **Còn xấu**: vạt áo rách/xé khi ngồi, lăn (Roll) và vài đòn chém (nhìn tờ khung); tóc dài chưa có lò xo (đỉnh tóc không tách được bằng bộ lọc hình học); tay áo rộng chưa có lò xo; mặt nạ nhuộm 3 kênh chưa làm (texture Tripo đã đúng màu ngà `#E4DEC8`/lam `#27476E` của `set_lac_kiem`, nhuộm lại chưa cần cho bản thử); xương xoắn không có (UAL).
- **Ảnh cận mặt trong game**: người chơi quay mặt về camera yaw 0 ngay sau khi vào game, nhưng đổi hướng nếu chạy/`level` trước; `pnpm shots chrv3 --stills` chụp đúng thời điểm đó.
- Quay: `pnpm shots chrv3 --out <thư mục tuyệt đối> [--variants v1,v3] [--genders m,f] [--stills]` (v1 mặc định mặc bộ `set_lac_kiem` | v3: đứng, chạy, chém ô 1-3, trúng đòn, ngã/dậy, đả tọa, ngự kiếm, chết).

## N-4/N-5 (sửa tiếp sau khi duyệt hướng v3)

- **Màu** (`game/character/v3Palette.ts`, chỉ model `chr_v3_lac_kiem_*`): đo texture Tripo thấy lam chỉ ≈ #282E3E và ngà ≈ #C6BBA8, tối và xám hơn concept (lam viền #27476E, giáp xanh sơn mài #3B6584/#4C86B0, ngà #E4DEC8), cộng sương/grading làm giáp ám xám bạc. Shader nhận ba lớp ngay trong material (lam theo độ lệch b − r; ngà/bạc theo độ bão hòa thấp + sáng; còn lại giữ nguyên), lam đi qua dải màu theo độ sáng texel (viền tối → #27476E, giáp → #3B6584, mép sáng → #4C86B0). **Là mặt nạ phân tích trong shader (như `dye.ts`), chưa có texture mặt nạ bake riêng và chưa nhuộm theo màu người chơi chọn.** `?v3pal=0` tắt để so; `pnpm shots chrv3 --variants v3raw`.
- **Tóc lò xo**: `chr_v3.py` lấy màu texel tại từng đỉnh (mẫu texture 256²) để chọn đỉnh tóc (tối, trung tính, sau lưng): `tex: hair` trong `v3_lac_kiem_springs.json`, 3 chuỗi × 3 xương. **Tay áo rộng chưa có lò xo.**
- **Vạt (v2)**: trọng số theo trước/sau + trái/phải liên tục (`robe.front|back` trong `v3_lac_kiem_springs.json`): vạt trước theo đùi (gấu 90%, phủ gối khi ngồi), vạt sau theo hông (gấu 45%) + lò xo 35%, đùi trái/phải nội suy theo x, 40% xuống cẳng khi dưới gối; client dùng `V3_SPRING` (cứng 130, cản 8, góc ≤ 30°, vào trong ≤ 8°). Ngồi/đả tọa riêng cho đồ dài: **chưa làm**, tư thế ngồi UAL nay để vạt phủ hai bên gối chứ không còn bảng cứng thẳng đứng.
- **Xương twist** (`upperarm|lowerarm|thigh_twist_<l|r>`, 6 xương, con của xương gốc, đặt ở 1/2 đoạn): trọng số chuyển từ xương gốc theo `0,85·(1−t)^0,8` (t: vị trí dọc đoạn); client (`MannequinCharacter`) mỗi khung tách góc xoắn của xương gốc quanh trục xương (swing-twist, `twistAngle`) rồi xoay xương twist ngược `−0,8×` (đỉnh gần đầu xương chỉ xoắn ~1/3, gần cuối xoắn đủ). Áp cho cả 7 asset v3 (Lạc Kiếm nam/nữ, Varkessa, Duskrella, Crimson, Noxavyra, Kings Demon), ngân sách xương `player_v3` nâng lên 112.
- **Xuyên thân 12 tư thế** (đỉnh/cặp mặt chồng tăng so với tư thế nghỉ; thứ tự Idle, Jog 0,25, Jog 0,75, Chém 0,35, Chém 0,6, Ngồi, Chết, Lăn, Nhảy, Niệm, Trúng đòn, Rình):
  - Nam trước (N-3): 1, 7, 8, 312, 12, 1170, 1, 584, 1, 4, 64, 367 (tổng 2531). Sau (N-4/5): 25, 43, 25, 68, 33, 175, 8, 85, 28, 34, 53, 102 (tổng 679, −73%).
  - Nữ trước: 26, 21, 47, 82, 14, 385, 18, 34, 30, 15, 98, 88 (tổng 858). Sau: 54, 53, 107, 61, 13, 192, 16, 78, 38, 34, 113, 81 (tổng 840, −2%).
  Nam giảm mạnh ở ngồi/lăn/chém; nữ ngồi giảm một nửa nhưng Idle/Jog/Lăn nhỉnh hơn. Tờ khung: ngồi hết bảng cứng, lăn vẫn méo (người úp ngược), chém xoay vẫn còn mảng tối (vạt lót). **Chưa triệt để**.
- **Màu, hiệu chỉnh theo ảnh trong game**: `pnpm shots chrv3 --variants v3raw,v3 --stills` chụp toàn thân + ảnh không nhân vật (hiệu hai ảnh = mặt nạ nhân vật) để đo màu thật; `V3_GAIN` bù nắng ấm/bóng ngọc lam (ngà thiếu kênh b, lam ngả lục). Đo (sRGB, trung bình cụm): ngà trước 176,168,128 → sau ≈ 181,174,143 (concept 199,188,175); lam trước ≈ 28,53,56 → sau ≈ 46,65,75 (concept 53–62, 61–71, 78–89). Gần concept hơn rõ rệt (lam, trắng ngà lạnh) nhưng ngà trong game vẫn tối và ấm hơn concept.
- **Chưa làm**: chuyển tư thế chiêu K-5 sang Mannequin (bake offline; pose K-5 là IK trên xương Mixamo, cần dựng ánh xạ + bake clip, việc riêng), chống trượt chân (hiện chỉ `timeScale = tốc độ/5,36`, chưa đo trượt chân), lò xo tay áo, tư thế ngồi riêng cho đồ dài, mặt nạ nhuộm bake.
