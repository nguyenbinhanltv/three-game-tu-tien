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
`pnpm`-ngoài: `node archive/codex-assets/chr-v3-gen.mjs` sinh `v3_<nam|nu>_<front|side|back>.png` + `.prompt.txt` vào `<dtl-asset-source>/3d/nhan-vat/set_lac_kiem/concept/` (chỉ thêm file). Hướng dẫn dựng Tripo web (Multi-view, HD, PBR, không auto-rig, `raw_v3_nam.glb`/`raw_v3_nu.glb` vào `.../set_lac_kiem/tripo/`) ở artifact `huong-dan-tripo-nhan-vat-v3.md`.

## Quay video so sánh
`pnpm shots chrv3 --out <thư mục tuyệt đối>` (nam/nữ × `v2`/`v3`, cùng chuỗi: đứng, chạy, chém 3 đòn, trúng đòn nhẹ/nặng, ngã, đả tọa, chết/hồi sinh). Video ghép trái v2, phải v3 nằm ở artifact phiên (không commit).

## N-3: Lạc Kiếm Môn Phục v3 (model Tripo thật, `?chr=v3`)

Hai model Tripo toàn thân của người dùng (`<dtl-asset-source>/3d/nhan-vat/set_lac_kiem/tripo/raw_v3_nam.glb` 57,6k tam giác, `raw_v3_nu.glb` 57,9k): tay chếch rõ, khe giữa chân, mặt rõ: **không lỗi cần dựng lại**. Nhập bằng `chr_v3.py` (job `chr_v3_lac_kiem_nam|nu` trong `run.mjs`, `--auto --height 1.84|1.70 --springs tools/blender/skins/v3_lac_kiem_springs.json`); asset thử thân v2 đã bỏ (Varkessa v3 giữ làm skin, xem #214).

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
- **Xuyên thân 12 tư thế (ĐÃ SỬA SỐ ĐO, xem N-6 bên dưới)**: con số "nam 2531 → 679 (−73%)" ghi ở bản N-4/N-5 là **sai do lỗi phép đo** (cột trọng số xương twist/lò xo không có phía trái/phải nên không vào cặp tay-thân), đã được sửa ở N-6. Số đúng nằm ở mục N-6.
- **Màu (albedo trung tính, không bù grading)**: sau soát PR, bỏ `V3_GAIN` (hệ số ×2,8 từng cắt phẳng kênh b của ngà và đẩy r của lam lên gần gấp 3, lại chỉ đúng cho một cảnh). Albedo nay đúng màu concept dưới ánh sáng trung tính: ngà `#E4DEC8` (hệ số theo kênh từ ngà texture đo `#C6BBA8`, chuẩn hóa theo kênh lớn nhất khi vượt 1 nên không cắt phẳng một kênh), lam theo dải `#27476E → #3B6584 → #4C86B0`. Grading nắng/bóng của từng mood/level tự phủ lên như mọi vật khác. `pnpm shots chrv3 --variants v3raw,v3 --stills` chụp toàn thân + ảnh không nhân vật (hiệu hai ảnh = mặt nạ nhân vật) để đo. **Đo ở sân tông môn, mood mặc định, một cảnh duy nhất** (chưa đo mood đêm/Vân Hải/Thiên Khuyết): ngà trên màn hình ≈ (180,172,133) (trước ≈ 176,168,128; concept 199,188,175), lam ≈ (35,69,75) (trước ≈ 28,53,56; concept 53–62, 61–71, 78–89). Ngà ngả ấm và lam ngả lục là do grading của cảnh đó, không bù vào albedo.
- **Chưa làm**: chuyển tư thế chiêu K-5 sang Mannequin (bake offline; pose K-5 là IK trên xương Mixamo, cần dựng ánh xạ + bake clip, việc riêng), chống trượt chân (hiện chỉ `timeScale = tốc độ/5,36`, chưa đo trượt chân), lò xo tay áo, tư thế ngồi riêng cho đồ dài, mặt nạ nhuộm bake.

## N-6 (kỹ thuật sau khi người dùng quyết dựng lại model: vạt xẻ hai bên đối xứng)

- **Soát lại số đo xuyên thân (nói thẳng)**: phép đo "cặp mặt chồng" cũ (`pen_count`) xếp nhầm cột twist/lò xo, nên bản N-4/N-5 báo giảm 73% là ảo. Sau khi sửa (`region_col`) và so cùng một kịch bản trên cùng model, tổng 12 tư thế (tăng so với tư thế nghỉ):
  | | N-3 | N-4/N-5 | N-6 |
  | --- | --- | --- | --- |
  | Cặp mặt chồng, nam | 4374 | 3246 | 3254 |
  | Cặp mặt chồng, nữ | 2493 | 2316 | 2490 |
  | Đỉnh vải trong viên nang thân, nam | 10093 | 10458 | 10456 |
  | Đỉnh vải trong viên nang thân, nữ | 13326 | 12971 | 12980 |
  Phép đo thứ hai (`cap_pen`: đếm đỉnh vải nằm trong viên nang hông/ngực/đùi/cẳng/tay ở tư thế đang đo mà không nằm trong ở tư thế nghỉ) cho thấy **trọng số vạt (N-4/N-5) hầu như không đổi số đỉnh xuyên thân** (±3%); trọng số theo trước/sau chỉ giảm cặp mặt chồng nam 26%, nữ 7%. Cả hai phép đo chạy trên lưới tĩnh trong Blender (không mô phỏng lò xo), nên **không đo được tác dụng của lò xo/va chạm**: chỉ xem được bằng video trong game.
- **Va chạm viên nang cho lò xo** (`spring.ts` `SpringCollider`, `pushOutCapsule`; `mannequin.ts` `colliderDefs`): hông (pelvis → spine_01, r 0,11), đùi (thigh → calf, r 0,085), cẳng (calf → foot, r 0,06), bán kính theo chiều cao/1,8; đầu mỗi xương lò xo bị đẩy ra ngoài viên nang rồi giữ lại độ dài xương. Khi ngồi/đả tọa đùi nằm ngang nên vạt trước bị đẩy lên phủ trên đùi (thay cho "tư thế ngồi riêng": chưa có clip ngồi riêng cho đồ dài). Test thuần cho `pushOutCapsule`. **Chưa có số đo định lượng** (xem trên).
- **Lò xo tay áo** (`limbs` trong `v3_lac_kiem_springs.json`: `sleeve`, 4 chuỗi × 2 xương mỗi cẳng tay, từ 30% cẳng tay tới cổ tay, trọng số chuyển 70%); xương 99 → 115, ngân sách `player_v3` 128.
- **Chống trượt chân (đo thật)**: `pnpm shots chrv3 --variants v3 --slide` đo tốc độ ngang (hệ thế giới) của chân thấp hơn khi chạy thẳng ~3,5 s, ghi `slide-*.json` (`JOG=<m/s>` đặt `?jog=` để quét). Quét `timeScale = tốc độ/JOG` (tốc độ chạy trong game ≈ 7,2 m/s): JOG 4,8 → trượt trung vị 1,4 m/s; **5,36 → 0,8**; 6,0 → 1,1; 6,8 → 1,9 (nam và nữ cùng hình chữ U). Số ước tính theo độ dài chân (4,3–4,7 m/s, đo analytic trong Blender) **sai** so với thực tế nên bỏ. `JOG_SPEED` = 5,4 (xấp xỉ giá trị trước đó 5,36: **không cải thiện được so với bản cũ, chỉ xác nhận bằng số đo là gần tối ưu**; còn dư ~0,8 m/s ≈ 10% tốc độ chạy do đo bằng rAF và dao động hông).
- **Chưa làm**: chuyển tư thế chiêu K-5 sang Mannequin (bake offline). Pose K-5 là IK thủ tục trên xương Mixamo; cần chạy IK trong Node trên bộ xương Mixamo mẫu, bake clip rồi ánh xạ sang Mannequin: việc riêng, không nhét vào PR này. Tư thế ngồi riêng cho đồ dài (clip) cũng chưa làm.
- **Concept v3b** (`chr-v3-gen.mjs --variant v3b`): áo dài tới bắp chân xẻ tà cao tới hông hai bên đối xứng, quần lam hẹp lộ ra, không mảng lệch; ảnh `v3b_*` trong `dtl-asset-source/3d/nhan-vat/set_lac_kiem/concept/`, hướng dẫn Tripo ở artifacts phiên (`raw_v3b_nam|nu.glb`).

## N-7: tư thế chiêu K-5 trên Mannequin

- **Cách làm (retarget lúc chạy, không bake ra file)**: pose K-5 là IK thủ tục trên xương Mixamo (`ikpose.ts`). `game/character/mannequinPoses.ts` nướng pose (lười, từng pose) trên một asset Mixamo nguồn (`chr_v2_nam`, ~0,76 MB, nạp lười khi có nhân vật v3 đầu tiên), rồi `retargetClips` (cùng thuật toán retarget K-3/UAL, trong không gian thế giới) với bảng đổi tên Mannequin → Mixamo (`mannequinToMixamo`). Clip `upper`/`lower` chỉ xuất kênh cho xương nguồn có kênh (`trackedOnly`), nên nửa thân chồng được lên clip chạy. Làm lúc chạy thay cho "bake offline" vì cùng tiền lệ K-3/UAL, không phình repo (49 pose × 3 clip × nhiều model v3) và tự khớp tỉ lệ từng model; đổi lại tốn CPU lần đầu mỗi pose (lười, mỗi pose một lượt).
- **`MannequinCharacter.perform(pose, {timing, skill, combo, reach, from, delay})`**: nửa trên theo pose (chồng lên nền), nửa dưới theo pose khi đứng yên hoặc theo clip chạy (`lowerBodyOf`: chỉ kênh hông + chân) khi đang đi; đường bao vào 0,06 s, ra 0,18 s; phát **sự kiện chiêu** `windup|hit|recovery|end` đúng mốc `hitAt` (dừng khi hit-stop), `performClock`, `performing`, `cancelPerform`, `cancelRecovery`: VFX K-6, cảm giác đòn K-7 và hủy chiêu bằng di chuyển/lướt chạy như `SkinnedCharacter`. Pose chưa nướng xong thì `perform` trả false và engine dùng đòn UAL (`attack()`).
- **Đả tọa, ngự kiếm, ngự không, niệm chú** dùng tư thế K-5 thật (`tam_thien`, `ngu_kiem`, `ngu_khong`, `niem_chu`) thay clip UAL (ngồi ghế `Sitting_Idle_Loop`, nhảy): đả tọa xếp bằng, vạt phủ lên đùi nhờ va chạm viên nang (N-6).
- **Chưa làm / giới hạn**: lực nắm kiếm theo tay của pose (kiếm vẫn gắn xương `dtl_sword` kiểu N-3, không theo `bladeLocal` của IK nên lưỡi có thể lệch hướng so với pose); cử chỉ rút/tra kiếm (`arm`); ngón tay không theo pose (giữ nền); chưa có số đo khớp tư thế K-5 gốc ↔ Mannequin (chỉ so bằng video); chưa kiểm xuyên thân từng pose. Vạt rách ở chiêu xoay mạnh vẫn như N-6 (cần model v3b).
- Quay: `pnpm shots chrv3 --variants v1,v3 --genders m --skills` (mỗi công pháp một video: 8 ô chiêu + đả tọa), `--sit` ảnh đả tọa.

## N-8: Lạc Kiếm Môn Phục v3b (vạt xẻ hai bên đối xứng)

Người dùng dựng lại hai model Tripo theo concept v3b (`raw_v3b_nam.glb` 57,5k mặt, `raw_v3b_nu.glb` 57,2k mặt). Nhập bằng đúng `chr_v3.py` và cùng cấu hình `v3_lac_kiem_springs.json` (vạt trước/sau, lò xo vạt/tóc/tay áo, xương twist, viên nang N-6): job `chr_v3b_lac_kiem_nam|nu` trong `run.mjs`, asset `chr_v3b_lac_kiem_nam|nu` (24.000 / 12.000 / 4.800 tam giác, 115 xương = 65 Mannequin + 3 `dtl_*` + 6 twist + lò xo; GLB 3,5 MB và 3,3 MB). **`?chr=v3` nay dùng v3b**; `?v3model=a` về bản v3 cũ (asset `chr_v3_lac_kiem_*` giữ nguyên, không đổi byte). Bảng màu 3 lớp, kiếm/vỏ `dtl_scabbard`/`dtl_sword` và K-5 dùng chung với v3.

Base nhánh: origin/main + #233 (pose K-5 Mannequin, chưa merge lúc làm).

**Xuyên thân, 12 tư thế, cùng phép đo (cặp mặt chồng, tăng so với tư thế nghỉ; `chr_v3.py` log "xuyên thân")**

| | v3 | v3b | đổi |
| --- | --- | --- | --- |
| Nam, tổng cặp mặt | 3.254 | 2.058 | −37% |
| Nữ, tổng cặp mặt | 2.490 | 1.585 | −36% |
| Nam, đỉnh vải trong viên nang thân | 10.456 | 9.340 | −11% |
| Nữ, đỉnh vải trong viên nang thân | 12.980 | 12.869 | −1% |

Theo từng tư thế (nam v3 → v3b): Sitting 1690 → 550, Sword_Attack@0.35 403 → 193, Roll 326 → 334, Hit_Chest 147 → 207, Idle 94 → 170, Jog 92/59 → 118/162 (Idle/Jog/Hit_Chest **tăng**). Nữ: Sitting 723 → 367, Hit_Chest 380 → 252, Jog 145/243 → 98/124. Phép đo viên nang (đỉnh vải trong viên nang thân) gần như không đổi, nên mức cải thiện nằm ở cặp mặt tay/thân/chân chồng nhau (nhờ ngồi), không phải ở độ dày vạt so với thân.

**Soát lưới thô v3b (lỗi cần biết)**
- Vạt xẻ hai bên: **nam đối xứng tốt** (hai khe sâu, lớp lót lam hai bên, phía sau có khe giữa lưng). **Nữ kém đối xứng**: khe trái hở lộ lớp lót, khe phải bị mảng vạt loe che; nhìn từ sau, vạt bên phải loe như cánh, bên trái ép sát (tờ góc nhìn `views-nu`).
- Đối xứng đo bằng khoảng cách gương (12.000 điểm mẫu, % chiều cao): nam v3 0,47% → v3b **2,30%** (p95 15,5%), nữ v3 1,87% → v3b 1,71% (p95 12,5%). Phần lệch tập trung ở dải hông-bụng (0,5–0,7 chiều cao): đai, dải rủ và đồ trang trí đai không đối xứng theo thiết kế, nên không phải lỗi mảng; nhưng số này cho thấy v3b nam không "đối xứng hơn" v3 theo phép đo này, chỉ vạt xẻ rõ hơn.
- Mặt nam: mắt trái khép hơn mắt phải (nhìn rõ ở ảnh cận 3/4 trong `views-nam`). Mặt nữ ổn. Tóc nam/nữ không có tay dính thân; tay dang chếch, khe giữa chân rõ.
- Trong game, mặt sau áo v3b có vài mảng lam đậm lớn ở gấu vạt khi chạy/ngã; chưa xác định là lớp lót lộ qua khe hay trọng số vạt/palette (cần thêm thử `?v3pal=0`).
- Chưa sửa: vạt rách khi lăn/xoay/ngã vẫn còn (Roll không giảm), cần mô phỏng vải hoặc tách vạt thành mảnh. Ngự kiếm và đả tọa dùng chung K-5/Mannequin với v3.

**Kiểm tra**: `pnpm typecheck` client sạch, `vitest src/game/character` 274 test qua, `assets:validate` 0 lỗi. Tờ khung 8 tư thế và tờ góc nhìn (toàn thân trước/3-4/bên/sau, cận mặt, hông trước/sau): `node tools/blender/run.mjs`-ngoài, `chr_v3.py ... --sheet <thư mục> --views --no-export`. Video so v3 | v3b: `pnpm shots chrv3 --variants v3a,v3b` (đặt `FFMPEG=` đường dẫn ffmpeg nếu không có trong PATH, nếu không video giữ nguyên phần màn tải). Ảnh phía trước trong game không chụp được (nhân vật luôn quay lưng camera): dùng tờ góc nhìn Blender.

## Thêm bộ mới bằng MỘT file JSON (dựng hàng loạt)
Mỗi bộ trang bị là một model Tripo toàn thân (nam + nữ) nhập qua `chr_v3.py`. Cấu hình nằm trong một file `tools/blender/skins/v3sets/<bo>.json` (tên bắt đầu bằng `_` là mẫu, bị bỏ qua): vừa là cấu hình lò xo/trọng số của `chr_v3.py` (`robe`, `groups`, `limbs`; số theo phần chiều cao), vừa khai `set` (id bộ), `name`, `raw` (GLB Tripo, `{g}` = `nam|nu`, đường dẫn trong `DTL_ASSET_SOURCE`) và `height` theo giới (m). `run.mjs` (`v3SetEntries`) sinh job `chr_v3_<set>_<nam|nu>` từ file này; `node tools/blender/v3-newset.mjs <set>` tạo `meta.json` + dòng `LICENSES.md`. Mẫu: `_template_ao_dai.json` (Kiếm tu/Đan sư: vạt dài xẻ hai bên, mặc định của Lạc Kiếm v3b2), `_template_giap.json` (Hộ pháp: hai tấm giáp trước/sau tới gối, không lò xo tay áo), `_template_de_tu.json`. Thử bằng model Lạc Kiếm v3b làm "bộ giả": nhập, `assets:build`, `assets:validate` đều đạt. Tay dang theo model: `ARM_FIT` ở `mannequin.ts` (mặc định 5°, bộ tay áo rộng khai riêng như Lạc Kiếm 16°). Danh sách bộ, thứ tự dựng và hướng dẫn Tripo từng bộ: `tools/codex-assets/v3-sets-plan.mjs` (`node tools/codex-assets/v3-sets-doc.mjs --out <thư mục>` sinh tài liệu); concept: `node tools/codex-assets/chr-v3-sets-gen.mjs --sets <id,…>`.

## N-9: ba bộ đầu dựng hàng loạt (Đồ Đệ Tử, Huyền Giáp Hộ Pháp, Đan Tâm Y Bát)

Người dùng dựng 6 model Tripo theo concept v3 (`dtl-asset-source/3d/nhan-vat/set_<bộ>/tripo/raw_v3_<bộ>_<nam|nu>.glb`). Nhập bằng `tools/blender/skins/v3sets/{de_tu,huyen_giap,dan_tam}.json` (mẫu `_template_de_tu|giap|ao_dai.json`) + `node tools/blender/v3-newset.mjs <bộ>`, dựng `assets:build --only chr_v3_<bộ>_<giới>` (cần `DTL_ASSET_SOURCE`), `assets:validate` 0 lỗi; mỗi model 24.000 tam giác LOD0, ~3,0-3,7 MB.

**Chọn bộ trong game**: `v3AssetOf(g, skin, set)` (`game/character/mannequin.ts`): skin đè tất cả; có bộ riêng (`V3_OWN_SETS`) dùng `chr_v3_<bộ>_<giới>`; bộ chưa có model riêng tạm dùng model cùng nhánh (kiếm tu → Lạc Kiếm, hộ pháp → Huyền Giáp, đan sư → Đan Tâm); không mặc bộ nào → Đồ Đệ Tử (trước đây là Lạc Kiếm). Lò xo v2 (`isSpring2`) áp cho cả ba bộ.

**ARM_FIT theo bộ** (quét 5/12/16/22°, `SPRING_TUNE='{"armFit":N}'`, cặp mặt chồng tổng 12 tư thế nam/nữ; mốc Lạc Kiếm v3b2 ở 16° = 4.117/2.708):

| Bộ | 5° | 12° | 16° | 22° | chọn |
| --- | --- | --- | --- | --- | --- |
| Đồ Đệ Tử | 3.023/987 | 2.809/931 | 2.653/801 | | 10° (tay áo vừa, ít phụ thuộc) |
| Huyền Giáp | 5.687/5.446 | 4.918/4.619 | 4.707/3.931 | 4.419/3.422 | 20° (giáp, vai + hộ uyển nổi) |
| Đan Tâm | 4.243/4.554 | 3.435/3.361 | 3.164/2.900 | 2.654/2.535 | 16° |

Video và tờ khung: `pnpm shots v3sets --out <thư mục tuyệt đối>` (nam/nữ × 3 bộ cạnh nhau: đứng, chạy, chém, lăn, ngồi).

### N-9b: sửa vạt Đan Tâm khi chạy

Lỗi (video N-9): vạt áo dài bị kéo căng giữa hai chân như một tấm ván vắt ra sau khi chạy ngang, vạt sau văng ra, mảng tối quanh hông/đùi. Nguyên nhân: vạt liền phủ cả hai chân nên bị trọng số chân kéo; `share` thấp (0,6) làm nặng hơn (thử, bỏ). Sửa: `tools/blender/skins/v3sets/dan_tam.json` `skirt.share` 0,8 → **0,95** (vạt do lò xo/viên nang điều khiển, buông tự do) + viên nang đùi lớn hơn cho riêng bộ này (`SKIRT_TUNE['chr_v3_dan_tam_'] = { rMul: 1.5 }` ở `mannequin.ts`; bảng này cho phép chỉnh `spring`/`hemStiff`/`rMul` theo bộ). Xuyên áo (cặp mặt chồng, 12 tư thế, ARM_FIT 16°) không đổi: nam 3.164 → 3.188, nữ 2.900 → 2.852; đỉnh trong viên nang 16.301 → 15.914 / 19.154 → 19.056. Còn lại: mảng tối nhỏ của lớp lót sau lưng khi chạy ngang. Lưu ý: cache `assets:build` khóa theo file nguồn, đổi JSON cấu hình phải thêm `--force`. Quay: `pnpm shots v3sets --sets dan_tam [--sits chạy,chém]`.

## Chuyển mặc định sang v3 (kế hoạch mục C, mã việc N-7 đợt cuối, 21/11)

Từ PR này nhân vật v3 là **mặc định của người chơi**. `?chr=v1` quay về model cũ trong một bản (dự phòng); asset v3 nạp lỗi cũng tự lùi về v1. NPC giữ rig Mixamo cũ. Nguyên anh, thân xác, phân thân Ảnh Biến và bóng tâm ma dựng từ chính model v3 (`soulLook.ts`).

### Lỗi có sẵn đã sửa: model bậc cao vô hình ở LOD1/LOD2
LOD1/LOD2 của 18 model giữ gốc gồm nhiều primitive nên GLTFLoader bọc trong một `Group` mang `userData.lod`; lưới con không có `userData.lod` nên bị xếp vào LOD0, còn Group cha đã bị `AssetCache` ẩn. Hậu quả: ngoài suất LOD0 (4 người gần nhất) người mặc đồ bậc cao **không hiện** (còn bảng tên và kiếm). Ảnh duyệt các đợt nhập model đều chụp cận nên không lộ. Sửa ở `mannequinLod.ts` (`lodOf` đọc mức LOD của nhóm cha). Mọi số đo đám đông v3 trước ngày 21/11 vì thế thấp hơn thực tế.

### Giới hạn nhân vật chi tiết cao
| Biện pháp | Ở đâu | Tác dụng (50 người × 12 bộ × 2 giới, sân tông môn) |
| --- | --- | --- |
| Trần texture cho model của người khác: Cao 3 model đầu 2048 (normal 1024), còn lại 1024 (normal 512); Vừa mình 2048, người khác 1024/512; Thấp 1024 và 512. Mình ở Cao/Cực cao giữ đủ 4096 | `v3Detail.ts`, `AssetCache.acquire(id, { maxTexture, maxNormal })` + `capTextures` (bỏ mức mip lớn ngay sau parse, không lọc ảnh) | texture 2,44 GB → 427 MB (Vừa) |
| Không giữ `parser` của GLTFLoader (nắm nguyên byte GLB 10–13 MB mỗi model) | `AssetCache` | heap sau GC 1503 MB → ~950 MB (v1: 936 MB) |
| Gộp các primitive cùng LOD ≥ 1 thành một lưới | `mergeLodMeshes` | LOD1/LOD2 model bậc cao 4 draw → 1 |
| Suất LOD1 theo tam giác (12 suất; model bậc cao 2, cơ bản 1), hết suất thì LOD2 | `entities.applyLodBudget`, `lod1Cost` | tam giác nhân vật ~0,94M → ~0,65M |
| Từ 24 thể trong khung nhìn: suất LOD0 12 → 6 | `LOD0_CROWD` | bớt 1–2 model 99k tam giác |
| Bóng đổ chỉ LOD0; model bậc cao của người khác không đổ bóng; kiếm ẩn ở LOD2; ngoài khung nhìn không tính ma trận xương | `MannequinCharacter.applyLod/setView` | như v1 |

Trần texture chốt lúc nạp model: đổi preset có tác dụng từ lần vào room kế tiếp. Người khác mặc đúng model mình đang mặc thì dùng chung bản đầy đủ của mình.

### Số đo (Chrome headless, RTX 3060 Ti, 1280×720, dpr 1, Vite dev; máy đang chạy worker khác nên CPU dao động ±2 ms)
`pnpm bench:crowd --bots 50 --scenes san --botargs "--crowd 2048,2088,9 --level 15 --set <12 bộ> --genders m,f"`, v1 = `CROWD_QUERY='&chr=v1'`, đo liền nhau:

| | draw call | tam giác | texture | CPU `frame()` p50 / p95 | heap (chưa GC) |
| --- | --- | --- | --- | --- | --- |
| Ngân sách | < 300 | 1–2 triệu | 512 MB | < 8 ms | |
| WebGPU Vừa, v1 | 355 | 1,63M | 488 MB | 6,0 / 12,4 ms | 768 MB |
| WebGPU Vừa, **v3** | **268** | 1,81M | **427 MB** | 7,8 / 14,8 ms | 1176 MB |
| WebGPU Cao, v1 | 388 | 2,14M | 687 MB | 8,3 / 13,2 ms | 738 MB |
| WebGPU Cao, **v3** | **301** | 2,30M | 648 MB | 10,8 / 36,3 ms | 1292 MB |
| WebGL2 Vừa, v1 → v3 | 357 → 268 | 1,63M → 1,80M | 375 → 351 MB | 6,7 → 8,9 ms | |
| WebGL2 Cao, v1 → v3 | 358 → 285 | 2,05M → 2,25M | 550 → 568 MB | 8,0 → 10,9 ms | |

`pnpm shots n7` (kịch bản đã gỡ ở tối ưu Đợt C) (preset Cao, camera sát đám đông): 50 người v1 343 draw / 2,05M → v3 235 draw / 2,08M; heap sau GC 989 MB.

Đọc số: draw call và texture của v3 tốt hơn v1; tam giác hơn ~0,15M; ở Vừa mọi chỉ số trong ngân sách trừ CPU p95 (v1 cũng vượt). Ở Cao tam giác và texture vượt ngân sách chung ở cả v1 lẫn v3 (cảnh + bóng đổ + texture mặt đất 171 MB), không phải do nhân vật.

**CPU khi đông người: đỗ rig ở LOD2** (`MannequinCharacter.setParked`, PR gỡ code cũ). Số ở bảng trên đo trước bước này: v3 hơn v1 khoảng 2 ms mỗi khung vì bộ xương 119–127 xương (v1: 65) nằm trong cảnh, three duyệt và tính ma trận thế giới mỗi khung, `skeleton.update()` chạy cho từng lưới. Nay ở LOD2 (phần lớn đám đông) cả cây `rig` rời khỏi cảnh, lưới LOD2 gắn thẳng vào nhân vật ở `DetachedBindMode`, ma trận xương chỉ tính lại khi mixer chạy (8 Hz) và `skeleton.update()` bỏ qua khi tư thế chưa đổi (cùng ý với `detachRig` + `skipUnchangedSkeletons` của v1). LOD0/LOD1 giữ nguyên vì kiếm, IK chân, lò xo bám xương trong cảnh. Đo xen kẽ bật/tắt (`CROWD_QUERY='&v3off=park'`), 50 người, WebGPU Vừa, hai vòng, máy đang bận:

| | CPU p50 | `matrix` | `render` | `ents` |
| --- | --- | --- | --- | --- |
| Tắt (`?v3off=park`) | 12,2 / 11,2 ms | 1,91 / 1,79 ms | 10,5 / 9,6 ms | 1,66 / 1,41 ms |
| Bật (mặc định) | 8,7 / 7,1 ms | 0,63 / 0,53 ms | 8,1 / 6,3 ms | 1,64 / 1,31 ms |

Tức giảm khoảng 3,5–4 ms p50 trong cùng điều kiện; `matrix` về ngang v1 (0,54 ms). CPU p95 ở Cao (36 ms ở lần đo trước) chủ yếu là khung khựng lẻ (biên dịch pipeline, GC, máy bận) chứ không phải chi phí đều mỗi khung; chưa đo lại riêng. Trong lúc đỗ, xương ở hệ tọa độ model nên `bladePoints` trả false (vệt kiếm của người ở LOD2 không vẽ). Test: `mannequinPark.test.ts` (vị trí đỉnh trước/sau khi đỗ trùng nhau trên model thật).

### Nhuộm 3 kênh trên v3 (`game/character/v3Dye.ts`, `packages/shared/src/v3dye.ts`)
Model v3 không có texture mặt nạ vải, nên nhuộm bằng hai lớp mặt nạ trong shader:
- **Hình học**: thuộc tính đỉnh `dyeMask` tính lúc dựng mẫu từ trọng số xương; đỉnh bám đầu, cổ, bàn tay, ngón, tóc = 0. Da và tóc không bao giờ bị nhuộm, kể cả bộ vải tông ấm trùng sắc da (Liệt Mạch, Địa Long).
- **Màu** theo model (`V3_DYE_REF` trong `packages/shared/src/v3dye.ts`, đo trên texture gốc). Kênh 1 (vải chính): `chroma` = texel cùng hướng sắc độ với vải chính; `neutral` = texel ít bão hòa (Huyền Giáp, Cổ Thành, Kính Quang, Vạn Kinh). Kênh 2 (viền, lót, đai) và kênh 3 (tua, kim loại, điểm nhấn): texel gần một màu tham chiếu (`trim`, `accent`) trong không gian gamma 2,2 trong bán kính `r` (mép mềm 0,6r–r); hai kênh này thắng kênh 1 ở chỗ trùng, kênh 2 thắng kênh 3. Màu ngoài ba vùng giữ nguyên. Model không có vùng nào thì kênh đó không đổi gì (Đệ Tử không có kim loại riêng trong texture).

Mọi tham số (màu nhuộm, màu tham chiếu, bán kính, bật/tắt từng kênh) là uniform: ba kênh dùng chung MỘT chương trình shader, không thêm draw call hay texture. Công thức trọng số nằm hai nơi, phải khớp: `dyeWeights` (TS thuần, test + công cụ) và shader trong `applyV3Dye`.

Chọn màu tham chiếu: `pnpm dye:preview [thư-mục]` đọc texture gốc Tripo trong `dtl-asset-source` (`DTL_ASSET_SOURCE` nếu nằm chỗ khác), in tỉ lệ phủ từng kênh và ghi ảnh texture | mặt nạ (đỏ = chính, lục = viền/lót, lam = kim loại); `pnpm dye:preview --clusters <id-model>` in 8 cụm màu của phần ngoài vải chính. Tất định, không dùng mạng. Lạc Kiếm v3b dùng bảng màu `v3Palette` lúc chạy nên ảnh xem trước (texture thô) chỉ gần đúng.

Khi nào nhuộm (`v3DyeColors`): màu đạo bào lúc tạo nhân vật áp lên đồ khởi đầu (không mặc bộ, màu khác mặc định), chỉ kênh 1; nhuộm Tủ ngoại trang (`dye3` → `tint.hex/trim/accent`) áp cả ba kênh lên mọi model theo bộ; skin toàn thân không nhuộm. Mặc bộ mà không nhuộm tủ thì model giữ màu riêng (như áo mô-đun của v1). Vật liệu nhuộm là bản sao theo (model, màu), dùng chung giữa mọi người cùng model cùng màu. Ảnh: `pnpm shots n7 --dye` (kịch bản đã gỡ ở tối ưu Đợt C).

Giới hạn: vùng viền/kim loại nhận bằng màu texel nên là xấp xỉ (nét vàng mảnh trên texture 2K nhuộm không trọn vẹn; chi tiết cùng màu với vải chính không tách được). Ảnh: `pnpm shots dye23 --out <thư mục>` (4 bộ × nam/nữ × 5 phối màu, 1080p + 720p). Tinh Khuyết: vải chính gần đen nên lớp đổi màu là voan tím. Thêm model mới phải thêm dòng vào `V3_DYE_REF` (test `v3Dye.test.ts` bắt thiếu).

### Chưa có trên v3 (v1 có)
- Kênh viền (kênh 2) và kênh 3 của nhuộm Tủ ngoại trang.
- Phụ kiện thủ tục theo từng món (`acc`) và vỏ kiếm theo bộ: model v3 nguyên khối đã có sẵn.
- Bộ chưa có model riêng dùng model cùng nhánh (`V3_BRANCH_FALLBACK`).

## Sửa cổ Tinh Khuyết nam / Thần Tàng nữ (21/11)

Triệu chứng: mảng tím (Tinh Khuyết) / xanh đen (Thần Tàng) phẳng, kéo dài dưới cằm, cổ trông dài. **Nguyên nhân**: ống "thân dưới áo" của C2 (`chr_v3_c2.py`, `_tube`) chạy tới hết xương `neck_01` với ell 1,25 và bán kính 0,7× thân, nên lòi ra khỏi cổ thật; UV của nó trỏ vào texel nền áo (`underColor`). Không phải trọng số, ARM_FIT hay mặt nạ tách lưới.
Sửa: khóa `c2.torsoTop: "spine"` (ống dừng ở giữa `spine_03`) trong `v3sets/tinh_khuyet.json`, `v3sets/than_tang.json`. Mặc định giữ `neck`: các bộ khác chưa đổi. Chỉ đổi phần hình học ẩn trong áo; vải, UV, texture gốc không đổi.
Đo (rigstretch, % cạnh sai): Tinh Khuyết nam Idle 0,64%, Jog −68,7%, chém −67,8%, p99 tối đa 2,64 (bản trước sửa cùng số; Jog/chém của nam vốn ~68%, chưa đạt 70%); Thần Tàng nữ Idle 0,29%, Jog −78,6%, chém −77,2%, p99 2,46. Ảnh: `pnpm shots neck --out <dir>` (cận cổ + 4 góc ở đứng/chạy/chém).

### Sửa cổ đợt 2 (21/11): kinh_quang nữ, luu_ly nam+nữ, phuc_mach nữ

Cùng nguyên nhân ống thân C2 (xem trên); phát hiện khi kiểm 16 model còn lại. `c2.torsoTop: "spine"` thêm cho `luu_ly` (cả hai giới), và theo giới `c2.nu` cho `kinh_quang`, `phuc_mach`. 12 model còn lại cổ sạch, không đổi. rigstretch: Idle 0,17–0,43%, p99 tối đa 2,21–2,92. Lưu ý khi chụp nhiều bộ liên tiếp bằng `pnpm shots neck`: người chơi lần trước còn trên server vài chục giây nên nhân vật chồng nhau; kịch bản nghỉ `NECK_GAP` (mặc định 30 giây) giữa các lần.
