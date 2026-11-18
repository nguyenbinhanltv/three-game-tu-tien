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
