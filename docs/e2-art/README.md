# E2-I: mỹ thuật Đoạn Mạch Cổ Cốc

Gói E2-I (`docs/EXPANSION_DESIGN.md` 11.2). Chỉ hình/âm, không đụng sim server.

| Hạng mục | Làm gì | Ở đâu |
| --- | --- | --- |
| Mặt đất | Bộ 8 lớp ochre (Poly Haven CC0, đổi sắc) nạp lười khi vào level, giải phóng bộ Vân Lam khi đổi sang và ngược lại. Màu đỉnh + trọng số biome riêng (`ochreColor`). Không nằm trong tải đầu | `tools/asset-pipeline/src/terrain-textures.ts --set ochre`, `public/terrain-ochre/`, `groundTextures.ts`, `engine.ts` `enterLevel`, `terrain.ts`, `doan_mach.assets.json` `ground.set` |
| Cỏ | Atlas 4 thẻ alpha tách từ concept `prop_co_hoang_coc|linh_rung|van_hai|co_thanh` (cỏ khô, bụi gai sa thạch), 3 mặt cắt chéo/bụi, rải thưa theo đám; 1 draw call như cỏ cũ | `tools/asset-pipeline/src/grass-cards.ts` (`pnpm assets:grass-cards`), `public/grass-ochre/`, `game/grass.ts` (`Grass(cardSet)`), `LevelAssets.grassCards` |
| Đá, cây khô | Rải tự động theo ô 24 m (đá Vân Lam nhuộm ấm, `prop_cay_goc_kho`), tránh cụm quái/tinh anh/trạm/điểm đáng chú ý | `propScatter.ts` `scatterDoanMach` |
| Mood | Ba preset `ochre_dawn` / `ochre` / `ochre_night` (nắng hổ phách, sương bụi, bóng xanh xám, đêm lam); `?mood=dawn|day|night` chọn biến thể cùng thời điểm | `assets/palette.json`, `render/grading.ts` `moodVariant`, `sky.ts`, `atmosphere.ts` |
| Nhạc | Bài `wild_ochre` tự soạn (D yu, 68 BPM, 40 ô, nhị hồ + đàn tranh, 2:21) cho vùng wild của `doan_mach`; chiến đấu dùng `combat` (không có stem) | `tools/audio/compose/wild_ochre.mjs`, `music.json`, `musicDirector.ts` `regionTrack(…, level)` |

Ảnh: mỗi tệp `*.jpg` là **trước (E2-A) | sau, ngày | sau, đêm** (`pnpm shots:e2a --out <thư mục> [--query mood=night]`). `ochre-layers.jpg`: 8 lớp mặt đất; `cards-atlas.jpg`: atlas thẻ cỏ.

## Số đo (Chrome headless, WebGPU, Vừa, 1280×720, sân Đoạn Mạch)

- Khung hình: 40–68 draw call, 2–3 ms CPU, ~150–170 nghìn tam giác (ngân sách < 300 / < 8 ms).
- Tải đầu `pnpm size`: 2,52 MB / 30 MB. Nạp lười thêm: ochre 3,5 MB + thẻ cỏ 0,27 MB + nhạc ~2 MB. VRAM: bộ ochre ≈ 54 MB, bộ Vân Lam được giải phóng khi đổi level (không cộng dồn).
- `pnpm test`: client, shared, content, asset-pipeline qua; server có 1 test timeout `equipment.test.ts` (migration 3 → 8 ô, 20 s; không liên quan thay đổi này).

## Giới hạn / để duyệt

- Vòng 2 (theo soát ảnh): giảm bão hòa ochre, ngả khaki xám; bỏ mảng đất/đất nứt (ở preset Vừa lớp nền chọn cứng theo ngưỡng nên thành vệt mép gắt) bằng một lớp nền duy nhất; bỏ hạt sương/phấn hoa kiểu Vân Lam ở `doan_mach` (`ambientRates`, chỉ còn bụi nắng thưa). Chỉnh tông ở `OCHRE_LAYERS.tint`/`saturation` rồi `--set ochre`.
- `wild_ochre`: chỗ nối vòng lặp 2,3 (các bài khác 0,4–0,6) mới nghe ra nhẹ; chưa tách stem giao chiến, chưa có `cave_lull`/`boss_dia_mach`.
- Mặt nạ mặt đất `neutral` (chưa có đường mòn/cát riêng); chưa có nước/khe nứt phát sáng.
- Console có cảnh báo `THREE.TSL: Vertex attribute "normal" not found` (5 lần) **không do PR này**: vẫn còn khi tắt cỏ, prop, cột sáng, gộp VFX, K6 và texture mặt đất; nguồn chưa rõ (chưa so với main).
