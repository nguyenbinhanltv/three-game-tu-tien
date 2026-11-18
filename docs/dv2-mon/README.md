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
