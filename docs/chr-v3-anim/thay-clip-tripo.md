# Bảng thay clip Tripo (`anim_human_base`, `anim_human_k3`, `anim_human_ual`) bằng UAL/thủ tục trên Mannequin (NV3-A4)

Mục đích: đủ clip trên bộ xương UE5 Mannequin để bước C gỡ ba gói clip khỏi bản tải của người chơi v3 (`anim_human_base` 293 KB, `anim_human_k3` 1,41 MB, `anim_human_ual` 794 KB: tổng ~2,5 MB). Test `thayTripo.test.ts` giữ bảng này đủ mọi clip trong `humanClips.ts`.

Nguồn mới: **UAL** = `anim_ual_native` (Quaternius CC0, phát thẳng trên Mannequin); **A1** = clip dựng thủ tục từ UAL (`tools/blender/ual_loco.py`); **lớp phụ** = xương chỉnh sau mixer trong `mannequin.ts`; **A2** = IK chân (`mannequinFeet.ts`); **K-5** = pose IK nướng và retarget sang Mannequin (`mannequinPoses.ts`).

| Clip cũ | Thay bằng trên Mannequin | Trạng thái |
| --- | --- | --- |
| `idle` | UAL `Idle_Loop` | đã dùng |
| `run` | UAL `Jog_Fwd_Loop` + `Walk_Loop` + `Sprint_Loop` trộn theo tốc độ (`locoMix`) | đã dùng |
| `heavy_chop` | UAL `Sword_Regular_A/B/C` (đòn dự phòng, sự kiện `hitAt` ở A3); đòn kiếm thật là pose K-5 | đã dùng |
| `hit_light` | UAL `Hit_Chest` + giật thân theo hướng đòn (`flinchDirOf`, A4) | đã dùng |
| `death` | UAL `Death01` | đã dùng |
| `walk` | UAL `Walk_Loop` | đã dùng |
| `back` | A1 `Walk/Jog/Sprint_Bwd_Loop` | A1 |
| `strafe_l`, `strafe_r` | A1 `*_StrafeL/R_Loop`, trộn 8 hướng (`dirMix`) | A1 |
| `cast_walk` | không còn dùng: đang niệm thì đứng (clip UAL `Spell_Simple_Idle_Loop`, hoặc pose K-5 `POSE_CAST` khi đã nướng) | bỏ |
| `jump` | UAL `NinjaJump_Idle_Loop` / `Jump_Loop` | đã dùng |
| `land` | UAL `Jump_Land` / `NinjaJump_Land` | đã có clip |
| `combat_idle` | UAL `Sword_Idle` | đã dùng |
| `guard` | UAL `Sword_Block` (chỉ quái dùng clip `guard` của rig riêng; người chơi không) | đã có clip |
| `dodge_f`, `dodge_l`, `dodge_r`, `dodge_back` | UAL `Roll` qua `dashFrom` (A4): lăn trong thời gian lướt, hình trượt về chỗ thật | A4 |
| `hit_front_1`, `hit_front_2` | UAL `Hit_Chest`, `Hit_Head` | đã dùng |
| `hit_l`, `hit_r`, `hit_back` | UAL `Hit_Chest` + giật thân đúng hướng (ngửa / cúi / nghiêng) theo `flinchDirOf` | A4 |
| `hit_heavy` | UAL `Hit_Knockback` | đã dùng |
| `hit_head` | UAL `Hit_Head` | đã có clip |
| `knockdown`, `getup` | UAL `Hit_Knockback` → `LayToIdle` | đã dùng |
| `cast_stand` | UAL `Spell_Simple_*` / pose K-5 `POSE_CAST` | đã dùng |
| `kick_1`, `kick_2` | không có chiêu nào gọi (không có trong `skills.json`) | bỏ |
| `roar` | không có chiêu nào gọi | bỏ |
| `ual_death`, `ual_hit_chest`, `ual_hit_head`, `ual_knockback`, `ual_getup`, `ual_combat_idle` | chính các clip UAL gốc (`Death01`, `Hit_Chest`, `Hit_Head`, `Hit_Knockback`, `LayToIdle`, `Sword_Idle`) | đã dùng |
| `ual_dash` | UAL `Roll` (A4); `Sword_Dash` còn trong thư viện | A4 |
| `ual_roll`, `ual_block` | UAL `Roll`, `Sword_Block` | đã có clip |
| `ual_jump_start`, `ual_jump_loop`, `ual_jump_land` | UAL `NinjaJump_Start`, `NinjaJump_Idle_Loop`, `NinjaJump_Land` | đã dùng |
| `ual_idle_fold`, `ual_idle_talk`, `ual_interact`, `ual_yes`, `ual_no` | NPC giữ nguyên rig cũ theo quyết định (NPC không chuyển v3); khi chuyển: UAL `Idle_FoldArms_Loop`, `Idle_Talking_Loop`, `Interact` (đã có trong thư viện), `Yes`/`Idle_No_Loop` (chưa nằm trong `anim_ual_native`) | NPC, ngoài phạm vi |

## Chiêu K-5

Người chơi v3 đã phát chiêu K-5 bằng clip pose chạy trên Mannequin: pose IK được nướng trên **một rig Mixamo mẫu** (`chr_v2_nam`, 762 KB, `POSE_SOURCE_ASSET`) rồi retarget sang xương Mannequin lúc chạy. Nên phần K-5 không cần gói clip Tripo, nhưng còn cần asset `chr_v2_nam` để nướng. Chuyển nướng thẳng trên Mannequin cần hiệu chuẩn lại hướng kiếm và trục bàn tay (rest A-pose, `IkRig` giả định T-pose Mixamo) và so từng pose với bản retarget: chưa làm; ghi lại cho bước C (hoặc thay `chr_v2_nam` bằng GLB chỉ có xương Mixamo mẫu để bỏ mesh).

## Số liệu gỡ ở bước C

Gỡ khỏi bản tải của người chơi v3: `anim_human_base` + `anim_human_k3` + `anim_human_ual` ≈ 2,49 MB. Giữ: `anim_ual_native` (3,05 MB, đã gồm 9 clip lùi/ngang), `chr_v2_nam` (pose nguồn, 0,76 MB) cho tới khi nướng trên Mannequin hoặc thay bằng rig trần.
