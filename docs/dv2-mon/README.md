# DV-2 đợt 1: quái bốn chân Dị Vực (Liệt Hỏa Ma Ngưu, U Ảnh Cốt Lộc)

Gói DV2-A của `docs/DIVUC_DESIGN.md`, dùng đúng đường ống DV-B (`docs/dv-b-boss/README.md`): `sculpt_rig.py` giảm lưới + nướng + dựng xương → `anim_quadruped.py` (attack `gore`) → `assets:build --only`. Ảnh và video duyệt ở thư mục artifact của phiên (không commit).

## Chọn model

| Quái | Nguồn (assets-online) | Tác giả | Giấy phép | Tam giác nguồn → game |
| --- | --- | --- | --- | --- |
| `mon_liet_hoa_ma_nguu` | `flame_bull__the_infernal_beast` | 6 (Atahan3D) | CC BY 4.0 | 122 nghìn → 9.000 |
| `mon_u_anh_cot_loc` | `shadow_stag_-_bone-antlered_dark_fantasy` | Pigcraft | CC BY 4.0 | 1,93 triệu → 9.000 |

Đã kiểm: `asset.extras.license` trong từng GLB là CC-BY-4.0 và có tác giả/nguồn Sketchfab; tên node/mesh là tên mặc định của Sketchfab (`Object_4…`, `tripo_node_…`), không có tên xương hay mesh của game khác. Loại hẳn, không nhập: `jett_valorant`, `kafka_honkai_star_rail`, `butterfly_revamp`.

**Hôi Giác Cự Thú** (`gorthazul`) là hình người cầm rìu nên để sang đợt sau cùng các quái hai chân (chờ pipeline bộ xương người của `chr_v3.py`, #209). Đợt này vì vậy chỉ có hai con.

## Kết quả

| | Ma Ngưu | Cốt Lộc |
| --- | --- | --- |
| Lớp ngân sách | `monster` (5–10 nghìn) | `monster` |
| Tam giác LOD0/1/2 | 9.000 / 3.000 / 1.000 | 9.000 / 2.994 / 998 |
| Xương | 24 | 22 |
| Clip | `idle run attack hit_light death` | như trái |
| Texture | màu 1024², normal 512², ORM 512², phát sáng (khe nứt), KTX2 | màu/normal/ORM, KTX2 |
| File GLB | ≈ 1,1 MB | ≈ 1,2 MB |
| Cao × dài | 2,0 × 3,6 m | 2,6 (cả sừng) × 2,2 m |

Ma Ngưu có map phát sáng tách từ phần đỏ rực của base color (`sculpt.emissive`). Yaw nắn thân: Ma Ngưu 51,5°, Cốt Lộc 0°. Xương đặt từ ảnh chiếu có lưới (script vẽ ở thư mục tạm, không commit); `sculpt.limit` như Ngục Khuyển.

## Dữ liệu

`monsters.json` (hp/atk/xp theo mục 6.1 thiết kế), `loot.json` (đồ rơi tạm bằng vật phẩm có sẵn, nguyên liệu Tẫn Giác chờ DV3-F), i18n `mon.<id>` + `.title`, `glossary.divucMonsters` (`content:check` đối chiếu tên), `credits.json` + `assets/LICENSES.md`, skin ở `MONSTER_SKINS` (nạp lười, chưa có `level`).

| Quái | Hành | hp/atk/xp | Chiêu |
| --- | --- | --- | --- |
| Liệt Hỏa Ma Ngưu | Hỏa | 1,7 / 1,4 / 1,3 | `charge` 14×2,5 m báo 1,0 s (lao 16 m/s) + `reveal` sau cú lao |
| U Ảnh Cốt Lộc | Thủy | 1,3 / 1,6 / 1,3 | `charge` 10×2 m báo 0,9 s (lao 17 m/s) + `reveal` sau cú lao |

Lệch so với thiết kế: (1) vệt lửa 3 s của Ma Ngưu chưa có (chưa có trường vệt để lại cho `charge`); (2) Cốt Lộc chưa ẩn bóng tới 8 m (`reveal` hiện có là lộ yếu điểm, không phải tàng hình); (3) báo húc của Cốt Lộc 0,9 s thay vì 0,8 s (`content:check` chặn `charge.delay` < 0,9) và `hpMul` 1,3 thay vì 1,2 để TTK vào khoảng kiểm của `fight:check`. Cả ba để DV3-B.

## Thử nhanh

```
/gm level 28
/gm god on
/gm spawn mon_liet_hoa_ma_nguu
/gm spawn mon_u_anh_cot_loc
```

`pnpm --filter @dtl/server fight:check --levels 28 --mon mon_liet_hoa_ma_nguu`: TTK 7,1 / 7,7 / 12,6 s (kiếm / hộ pháp / đan sư), mất 3–5% máu mỗi con; Cốt Lộc TTK 3,4–6,9 s (đo với hpMul 1,2), mất 9–14%. Đan sư chậm hơn khoảng kiểm ở mọi quái thường cấp 28, không riêng hai con này.

Xem asset: `pnpm shots asset --ids mon_liet_hoa_ma_nguu,mon_u_anh_cot_loc --clips idle,run,attack,hit_light,death --out <thư mục tuyệt đối>`. Đánh thử trong game: `pnpm shots divuc --out <thư mục tuyệt đối>` (kịch bản mới, `tools/perf/src/scenarios/divuc.ts`).

## Bẫy

- Lông Cốt Lộc và da Ma Ngưu rất tối: skin dùng `lift` 0,25–0,3 và `rim`; chỉnh lại khi có mood `rift` (DV1-C).
- Cốt Lộc chân rất mảnh (≈ 0,05 m), 9.000 tam giác chỉ vừa đủ; hạ thêm sẽ gãy chân.
- Skin chưa có `level` nên lần đầu gọi trong phiên có thể thấy model khối vài giây.

---

# DV-2 đợt 2: quái hai chân (Tẫn Chủng Cốt Khôi, Giác Kiếm Trọng Binh, Hôi Giác Cự Thú)

Quái hình người đi đường **xương UE5 Mannequin + clip UAL phát trực tiếp** (cùng pipeline nhân vật v3, `docs/chr-v3/README.md`). Server không đổi. Ảnh, tờ khung clip và video đánh thử ở thư mục artifact của phiên (không commit).

| Quái | Nguồn | Tác giả, giấy phép | Tam giác nguồn → game (LOD0/1/2) | Cao | Lớp ngân sách |
| --- | --- | --- | --- | --- | --- |
| `mon_tan_chung` Tẫn Chủng Cốt Khôi (Tẫn chủng do Thủ Khích Dực Chủ gọi) | `bone_golem_-_necromantic_construct.glb` | Pigcraft, CC BY 4.0 | 1,98 triệu → 9.000 / 3.116 / 1.072 | 2,2 m | `monster_mq` |
| `mon_giac_kiem_trong_binh` Giác Kiếm Trọng Binh (thị vệ Kim Dạ Cung, Tẫn chủng trọng giáp) | `maltherion-the-skullbound-aegis.zip` | Atahan3D, CC BY 4.0 (zip không metadata: tác giả/URL lấy từ trang Sketchfab, ghi ở `assets/LICENSES.md`) | 309 nghìn → 8.993 / 3.120 / 1.078 | 2,5 m | `monster_mq` |
| `elite_hoi_giac_cu_thu` Hôi Giác Cự Thú | `gorthazul__the_ashhorn_behemoth.glb` | Atahan3D, CC BY 4.0 | 701 nghìn → 13.999 / 4.899 / 1.678 | 3,0 m | `elite_mq` |

GLB nguồn đều có `asset.extras.license` CC-BY-4.0 (bản Maltherion không có extras) và tên mesh/xương mặc định của Sketchfab (`tripo_node_…`, `Object_N`, `output_unwrapped`), không có tên của game khác.

## Đường ống
1. Giải nén zip vào thư mục tạm riêng; **không ghi** vào `dtl-asset-source`.
2. `blender -b --factory-startup --python tools/blender/skin_prep.py -- tools/blender/skins/dv2_<tên>.json <thư mục làm việc> --stage bake`: giảm lưới + UV mới + nướng màu/normal. Cấu hình không khai `joints` thì stage `bake` xuất luôn lưới thấp không xương (`<thư mục làm việc>/dv2_<tên>/bake.glb`).
3. Đặt bản nướng vào `<nguồn>/mon/<id>/prep/bake.glb` (đặt `DTL_ASSET_SOURCE` trỏ thư mục làm việc, kèm bản sao UAL1 ở `anim/ual/ual1/...` làm bộ xương mẫu) rồi `pnpm assets:build --only <id>`: job `chr_v3.py` trong `tools/blender/run.mjs`.
   - Tẫn Chủng (chữ A): `--auto`.
   - Trọng Binh và Hôi Giác không ở dáng chữ A: **mốc đo tay** từ ảnh chiếu (`tools/blender/skins/dv2_*_landmarks.json`) và **vùng cứng** `--bind` (mới ở `chr_v3.py`: hộp trong tọa độ lưới nguồn → ép một xương hoặc chuyển dần theo z): rìu Hôi Giác theo tay phải, khiên theo tay trái, kiếm theo tay phải, áo choàng chuyển từ ngực xuống hông.
4. Lớp ngân sách mới `monster_mq`/`elite_mq` (`assets/budgets.json`): như `monster`/`elite` nhưng 96 xương (Mannequin có 68, lớp cũ giới hạn 60). Cả ba GLB ≈ 1,3–1,4 MB, KTX2.

## Client
`MonsterSkin.mannequin: true` (`game/character/monsterSkins.ts`): `MonsterSkins` nạp thêm thư viện `anim_ual_native` (một lần, giữ tới `dispose`), chỉnh độ cao hông theo từng lưới (`pelvisScaledClips`, `game/character/mannequinMonster.ts`) rồi dùng `SkinnedMonster` thường với `ClipMap` trỏ tên clip UAL. Không bám địa hình bằng IK (`legs: 'none'`). Bảng clip: nền `MQ_CLIPS` (Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sword_Attack, Hit_Chest, Death01, Hit_Knockback), Tẫn chủng dáng zombie (`Zombie_Idle_Loop`, `Zombie_Walk_Fwd_Loop`, `Zombie_Scratch`), Trọng Binh thủ khiên (`Idle_Shield_Loop`). Thêm 5 clip vào `anim_ual_native` (`Zombie_*`, `Idle_Shield_Loop`, `Melee_Hook`; thư viện 2,0 → 2,2 MB, chỉ nạp khi cần). Thời điểm chạm của đòn lớn đo bằng tốc độ cổ tay đạt đỉnh (Blender): Sword_Attack 0,33 s, Sword_Regular_A 0,20 s, Zombie_Scratch 0,47 s, Melee_Hook 0,20 s (quái giáp/khiên chỉ dùng Sword_Attack/Sword_Regular_A).

Xem clip: `pnpm shots asset --ids mon_tan_chung,mon_giac_kiem_trong_binh,elite_hoi_giac_cu_thu --lib ual --clips Idle_Loop,Jog_Fwd_Loop,Sword_Attack,Hit_Chest,Death01 --out <thư mục tuyệt đối>` (hoặc `?mute=1&show=<id>&lib=ual`). Đánh thử: `pnpm shots divuc --mons mon_tan_chung,mon_giac_kiem_trong_binh,elite_hoi_giac_cu_thu --out <thư mục tuyệt đối>`.

## Dữ liệu
| Quái | Hành | hp/atk/xp | Chiêu |
| --- | --- | --- | --- |
| Tẫn Chủng Cốt Khôi | Mộc | 1,4 / 1,3 / 1,2 | `combo` 35% |
| Giác Kiếm Trọng Binh | Kim | 1,5 / 1,35 / 1,4 | `combo` 50%, `line` 7 m × 3,5 báo 1,2 s |
| Hôi Giác Cự Thú (tinh anh) | Thổ | 7,5 / 2,4 / 4 | `leap` 10 m r 5 báo 1,5 s (giậm), `line` 10 m × 4 báo 1,4 s (hất sừng) |

`fight:check --levels 28`: Tẫn chủng TTK 3,7 / 4,5 / 7,2 s (kiếm / hộ pháp / đan sư), Trọng Binh 4,2 / 6,2 / 8,1 s, mất 5–7% máu mỗi con, không ai chết. i18n `mon.<id>` + `.title`, `glossary.divucMonsters`, `loot.json` (Hôi Giác như tinh anh Thiên Khuyết), `credits.json`, `assets/LICENSES.md`.

Bản đồ Bắc Hoang (`node tools/maps/gen-bac-hoang.mjs`, vị trí cụm không đổi, 132 quái/km²): Trọng Binh ở Khích Giai, Xích Tẫn Bình, Kim Dạ Ngoại Uyển, Trấn Giới Đài; Tẫn chủng ở Khích Giai và Trấn Giới Đài (lọt qua miệng khe); Hôi Giác Cự Thú ×2 ở Hàn Hôi Nguyên và ×1 ở Khích Giai.

## Lệch so với thiết kế và giới hạn
- Thiết kế ghi Hôi Giác `slam`/`sweep`, Trọng Binh `sweep`: `content:check` chỉ cho boss có `slam`/`sweep` nên dùng `leap` + `line` (cùng vạch báo và tầm). Trọng Binh không cộng Tẫn ấn (chưa có cơ chế, DV3-B).
- Tẫn chủng chưa thành `summon` của Thủ Khích Dực Chủ (chưa có boss đó); đang đặt thẳng vào camp.
- Khiên/kiếm/áo choàng Trọng Binh gắn cứng theo xương (`--bind` có `feather`: trọng số chuyển dần quanh hộp, không còn mảng nhọn kéo dãn ở Sword_Attack); áo choàng vẫn vẫy mạnh ở clip nhào lộn (Sword_Regular_C, Melee_Hook, nên không dùng) và lúc ngã; Hôi Giác Cự Thú: rìu cứng theo tay phải, chùy cuối cán chạm đất trong clip chạy. Thân xuyên giáp ở nhiều khung (số xuyên thân ghi ở log `chr_v3.py`). Xương xoắn/lò xo cho áo choàng chưa làm.
- Texture nguồn Hôi Giác/Trọng Binh gần như xám đen: skin dùng `palette` (dark→light) + `glow` kim dát (Trọng Binh) / đỏ than (Hôi Giác) + `rim` để đọc ra ở 12–24 m; trang xem asset không áp bảng màu này (chỉ trong game).
- Thời điểm chạm là suy từ clip UAL người, không chỉnh theo thân hình quái.

---

# DV-2 đợt 3: hai boss hình người (Tẫn Hỏa Kiếm Cơ, Kim Dạ Ma Hậu)

Cùng đường ống đợt 2 (`skin_prep.py --stage bake` → `chr_v3.py` landmarks + `--bind` → xương Mannequin + clip UAL phát thẳng), lớp ngân sách mới `boss_mq` (20–50 nghìn tam giác, 96 xương, texture 2048). Ảnh, tờ khung clip và video duyệt ở thư mục artifact của phiên (không commit).

| Boss | Nguồn (assets-online) | Tác giả, giấy phép | Tam giác nguồn → game (LOD0/1/2) | Ghi chú |
| --- | --- | --- | --- | --- |
| `boss_tan_hoa_kiem_co` Tẫn Hỏa Kiếm Cơ (mini-boss D2) | `protector_nemesis__the_fallen_seraph.glb` | Atahan3D, CC BY 4.0 | 856 nghìn → 23.990 / 11.995 / 4.788 | Bỏ đại kiếm xanh dính tay (`cut.capsules`), đổi ánh sáng xanh → than hồng (`recolor` mới ở `skin_prep.py`), **kiếm Tẫn Hỏa rời** `prop_kiem_tan_hoa` gắn xương `dtl_sword` |
| `boss_kim_da_ma_hau` Kim Dạ Ma Hậu (boss D2) | `ravenyth__the_gilded_night_empress.glb` | Atahan3D, CC BY 4.0 | 1,99 triệu → 29.999 / 14.997 / 5.948 | Tóc buộc xương đầu, áo choàng/váy buộc hông (`dv2_ravenyth_bind.json`) |

GLB nguồn có `asset.extras.license` CC-BY-4.0, tên mesh/node mặc định Sketchfab (`Object_N`), không có tên của game khác.

**Lệch so với thiết kế (DIVUC mục 6.4):** thiết kế gán Varkessa cho Kiếm Cơ nhưng Varkessa đã là skin người chơi; `protector_nemesis` thực ra là hiệp sĩ cầm đại kiếm (không có cánh như bảng ghi) nên dùng cho Kiếm Cơ (thân nam, tên "Cơ" là chức danh, đã ghi ở mô tả). Dực Chủ (Aetherion, Nyxarion) chưa làm: để đợt sau.

## Client
`MonsterSkin.weapon { asset, scale }` (`monsterSkins.ts`): `MonsterSkins` nạp lười mesh kiếm (cùng quy ước `swordTemplateOf`), `SkinnedMonster.mountProp('dtl_sword', mesh, scale)` chép ma trận xương cổ tay sang mesh mỗi khung (cây xương đã tách khỏi cảnh nên không gắn làm con xương được); mũi kiếm hướng lên trời ở tư thế nghỉ như kiếm người chơi nên clip UAL cầm kiếm đúng. Bóng Ma Hậu `mon_kim_da_bong` dùng cùng model, mờ (`ghost`).

## Dữ liệu và vị trí
| Boss | Hành | hp/atk/xp | Chiêu |
| --- | --- | --- | --- |
| Tẫn Hỏa Kiếm Cơ (cấp 31) | Hỏa | 85 / 1,45 / 20 | `sweep` nón 9 m 40° báo 1,2 s; `charge` 16×3 m báo 0,9 s (lao 18 m/s); từ 65%: `line` 14×3,5 báo 1,3 s + `reveal` sau cú lao; từ 30%: `leap` r 5, tốc độ ×1,15 |
| Kim Dạ Ma Hậu (cấp 31) | Kim | 150 / 1,45 / 36 | Pha 1: `slam` r 8 (Dạ chiếu trong) + `chant` r 12 (Dạ chiếu ngoài, phá chú được) + `summon` 2 Giác Kiếm Trọng Binh mỗi 20 s; từ 65%: bóng `mirror.decoys` (một bóng, nổ r 8 khi bị hạ) + `chant` r 20 (cast 3 s, choáng 3 s nếu phá); từ 30%: `line` 24×4 + `slam` r 8 nhanh hơn |

Tạm đặt ngoài trời ở Kim Dạ Ngoại Uyển (`gen-bac-hoang.mjs`: đấu trường phẳng `BOSS3` (-220,-400), `BOSS4` (-470,-400), hồi sinh 30 phút, `TARGET_CAMPS` 66 → 68 để giữ độ phủ); phó bản Kim Dạ Cung chuyển hai boss vào đợt 5–6 và bỏ spawn ngoài trời. Thử: `/gm spawn boss_tan_hoa_kiem_co`.

**Chưa làm so với thiết kế mục 5.2** (cần cơ chế mới, để DV3-E): vệt lửa 8 s sau mỗi đường chém của Kiếm Cơ, sân hẹp dần; "Mặc cả" phá cả hai chú trong 3 s hoặc dính 5 tầng Tẫn ấn (hiện dùng bóng + chant có sẵn); pha 3 "Kim dạ" (sàn tối, vòng sáng quanh hai bia). VFX dùng bộ `fx/mon_*` theo `kind` (lửa/tinh thần) có sẵn; chưa có hình riêng.

## Giới hạn hình ảnh
Ravenyth: cánh tay dạng 45° theo xương Mannequin kéo theo phần tay áo choàng (đã buộc phần choàng ngoài tay vào hông, vẫn thấy một mảng "cánh" nhỏ ở tư thế nghỉ); tóc và bím dùng `Head`/ngực. Protector: vạt choàng buộc hông nên không bay theo gió. Thân xuyên giáp ở nhiều khung (số ở log `chr_v3.py`).

## Sửa sau duyệt ảnh #231
- Kiếm Cơ quá tối: `palette` (dark→light) + `glow` than hồng + `lift` 0,3 ở `MONSTER_SKINS`; kiếm 1,5×.
- Mảng đen dựng chéo ở clip `Spell_Simple_Idle_Loop`: `chr_v3.py --bind` có thêm `drop` (bỏ ảnh hưởng xương tay lên vạt từ thắt lưng xuống), vai gai/cổ áo choàng/giáp đùi buộc cứng vào ngực/đùi (`dv2_protector_bind.json`). Mảng vẫn còn trong clip niệm chú (vạt choàng lẫn vai), nên Kiếm Cơ (không niệm chú) đổi trạng thái `cast` sang `Idle_Loop`, không phát clip đó.
- Ma Hậu nhỏ: `scale` 1,35 (Kiếm Cơ 1,2); lift 0,45. Chụp góc ngang (`--yaw 1.57 --quiet`) để chiêu người chơi không che.

---

# DV-2 đợt 4: boss có cánh (Thủ Khích Dực Chủ) + vệt lửa Tẫn Hỏa Kiếm Cơ

Ảnh, tờ clip và video duyệt ở thư mục artifact của phiên (không commit).

## Thủ Khích Dực Chủ (boss ngoài trời, Trấn Giới Đài (0, −650), cấp 31)
Chọn Dực Chủ ngoài trời (Thủ Khích) vì đã có đấu trường `BOSS2` để trống ở `gen-bac-hoang.mjs`; Tử Quang (phó bản Xích Tẫn Khích) và Nhật Thực (kiếp cuối) để đợt sau, cùng nguồn Aetherion/Nyxarion.

| | |
| --- | --- |
| Nguồn | `aetherion_nemesis__the_violet_seraph` (assets-online), Atahan3D, CC BY 4.0 (`asset.extras.license` kiểm; tên mesh `Object_N` mặc định Sketchfab, không xương, không tên game khác) |
| Lệch thiết kế mục 6.4 | thiết kế gán `protector_nemesis` cho Thủ Khích nhưng nó đã là Kiếm Cơ (đợt 3); Aetherion là model của Tử Quang nên **dùng chung nguồn**, chỉ khác cách chỉnh (Thủ Khích giữ màu tím gốc, viền lam lạnh `accent` `#8fb6ff` để hiểu là "kẻ giữ cửa", không thuộc dòng nào) |
| Tam giác nguồn → game | 1,0 triệu → 35.960 / 14.999 / 5.967 (`boss_mq`) |
| Xương | 92 (Mannequin 68 + twist + `dtl_sword` + 18 xương cánh), GLB 6,8 MB (lớn ngang Kiếm Cơ/Ma Hậu) |
| Cắt | lưỡi đại kiếm dính tay (chiêu Giáng thương là hiệu ứng, không cầm vũ khí), giữ vòng hào quang |

### Cánh (không kéo dãn)
`tools/blender/chr_v3.py --wings tools/blender/skins/dv2_aetherion_wings.json`: mỗi bên ba chuỗi (cánh trên gai, cánh giữa xòe ngang, cánh dưới rủ), mỗi chuỗi 3 xương: **gốc** `dtl_wing_<up|mid|low>_<l|r>` (con của `spine_03`, không phải lò xo: client vỗ bằng code) rồi hai **lò xo** `dtl_o_wing_*`. Đỉnh trong `region` thuộc chuỗi gần nhất, trọng số tuyến tính dọc chuỗi giữa ba xương, nhạt về thân trong dải `blend` quanh `bodyX` (gốc cánh không rách khỏi giáp vai). 8.976 đỉnh thuộc cánh.

Client (`skinned.ts`): `SkinnedOpts.autoSprings/springParams` (lấy mọi xương `dtl_o_*` làm lò xo, thông số `WING_SPRING` ở `monsterSkins.ts`: cứng hơn vạt áo, góc lệch ≤ 24°), `SkinnedMonster.postPose` vỗ xương gốc quanh trục trước-sau của mô hình (±7° đứng yên, ±15° khi đi, nhanh hơn khi giao chiến; cánh dưới lệch pha, hai bên đối xứng), rồi lò xo thêm độ trễ. Chỉ ở LOD0–1; chết thì cánh buông. `MonsterSkin.wings: true` bật.

Sáng ở 12–24 m: texture nướng đã có tím sáng nên không đổi bảng màu; `lift` 0,5, `rim` 0,7 (lam lạnh). Nhìn rõ trên nền sân đá/cỏ ở góc ngang 9–14 m.

### Chiêu và dữ liệu (`monsters.json`, hp/atk/xp 170 / 1,45 / 38)
| Chiêu | Dữ liệu |
| --- | --- |
| Giáng thương | `line` 22 × 4 m, báo 1,3 s, hồi 10 s |
| Dực tường | `reflect`: báo 0,8 s, giữ cánh 4 s, nhận 30% sát thương, phản 20% (trần 3% máu người đánh), hồi 18 s |
| Khai khích | `summon` 3 Tẫn Chủng Cốt Khôi (`mon_tan_chung`) mỗi 25 s, tối đa 6, delay 1,5 s |
| Neo gốc khe | **mới** `ai.anchor {r: 10, pct: 0.01}` (xử lý ở `MonSkills.tick`): trong 10 m quanh chỗ sinh ra hồi 1%/s; kéo ra xa thì hết (dạy tank định vị) |
| Pha 60% | `slam` r 4,5 báo 1,3 s lên tối đa 4 người |
| Pha 30% | `sweep` nón 14 m, 45°, báo 1,3 s, tốc độ ×1,1 |
Thưởng `loot.json`: linh thạch 800–1.300, Tử Khí Đan, Tẫn Giác ×2–4, thiết tinh, linh ngọc Thổ, trang bị Địa/Thiên. i18n `mon.boss_thu_khich_duc_chu.*` (tên, danh hiệu, lời `say`), `glossary.divucMonsters`, `credits.json` (`aetherion_nemesis`), `assets/LICENSES.md`. Quest `q5_thu_khich` (kill Thủ Khích Dực Chủ) khỏi cần khai chờ dữ liệu nữa (vẫn khóa bằng `minLevel` 31 > cấp tối đa). Hồi sinh 30 phút. **Chưa làm**: lời hắn nói khi gục chỉ hiện ở i18n, chưa nối vào cảnh.

Xem: `/gm spawn boss_thu_khich_duc_chu`; `pnpm shots asset --ids boss_thu_khich_duc_chu --lib ual --clips Idle_Loop,Jog_Fwd_Loop,Sword_Attack,Hit_Chest,Death01 --out <thư mục tuyệt đối>`; `pnpm shots divuc --mons boss_thu_khich_duc_chu --dist 9 --pitch 0.12 --yaw 1.57 --quiet --rounds 26 --out <thư mục tuyệt đối>`.

## Vệt lửa Tẫn Hỏa Kiếm Cơ (hoàn thiện #231)
DIVUC 5.2: "vệt lửa trên sàn 8 s sau mỗi đường chém". **Server quyết định**: `MonsterLine.trail`/`MonsterCharge.trail` (`MonsterTrail {dur, tick, mul, r, kind}` ở `types.ts`): khi vạch `line`/`charge` được đặt, `MonSkills.start` gọi `host.trail`, `MonZones.addTrail` đặt chuỗi vũng tròn dọc vạch (`trailSpots` ở `shared/monskill.ts`: cách nhau 1,5 r, tối đa 8 vũng) bắt đầu **đúng lúc vạch nổ** (cùng `delay`), tồn tại 8 s, mỗi 1 s ai đứng trong vũng chịu 0,3 × atk của boss (cùng đường `poisonHit` với vũng độc Kim Thiền; người ngự kiếm cao > 8 m không bị). `POOL_MAX` 24 → 32. Kiếm Cơ: cả `charge` (16 × 3 m) và `line` (pha 65%) để vệt, `r` 1,8 m, `kind: fire`. `content:check` kiểm `trail` (3–12 s, nhịp 0,5–2 s, `mul` ≤ 0,6, `r` 1–4 m, ≤ 8 vũng mỗi vệt) và `anchor`.

**Báo trước**: vạch chữ nhật của đường chém đã báo như cũ; mỗi vũng gửi `HazardMsg` `mv: 'trail'` (mới ở `protocol.ts`, không sát thương) để client vẽ. `Vfx.trailPool` (`game/vfx.ts`): vòng triện cam than hồng nhấp nháy ngọn lửa, hiện lúc vạch nổ, tắt dần ở 1,5 s cuối (không vòng báo riêng thứ hai, đỡ rối); một sigil mỗi vũng, ≤ 8 vũng mỗi vệt. Không đổi màu vũng độc/ô đố của phó bản (vẫn `mv: 'pool'`).

**Chưa làm**: "sân hẹp dần" (cần sân phó bản Kim Dạ Cung, worker khác); Kiếm Cơ vẫn đang đứng ngoài trời ở Kim Dạ Ngoại Uyển. Pha 3 `leap` chưa để vệt.

Kiểm: `apps/server/src/game/dvtrail.test.ts` (chuỗi vũng, thời điểm cháy, ngoài vệt không cháy, hết hạn; dữ liệu; neo hồi/kéo xa không hồi), `pnpm test`, `pnpm content:check`, `pnpm assets:validate`. `fight:check` chỉ nhận quái thường (bỏ boss) nên chỉ chạy bản mặc định để chắc không hồi quy (Cốt Lộc cấp 28 TTK 3,7–7,3 s như trước).
