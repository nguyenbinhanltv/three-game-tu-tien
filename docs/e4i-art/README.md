# E4-I: mỹ thuật Thiên Khuyết Cổ Thành (+ mood Thần Tàng Điện)

Gói E4-I (`docs/EXPANSION_DESIGN.md` 4.3, 11.3), theo mẫu E2-I/E3-I. Chỉ hình/âm, không đụng sim server, quái, nhiệm vụ (E4-H), phân thân (E4-K). Ảnh/video duyệt PR để ở artifacts của phiên, không commit.

## Vấn đề → cách sửa

| Trước (E4-A) | Làm gì | Ở đâu |
| --- | --- | --- |
| Mặt đất dùng bộ Vân Lam: đồng cỏ xanh ban đêm | Bộ **slate** 8 lớp Poly Haven CC0 (đá lát cổ, đá phiến, rêu, sỏi; hạ bão hòa, ngả xám lam), nạp lười khi vào level, giải phóng khi rời. Màu đỉnh riêng: nền xám lam, rêu thành đám ở chỗ trũng, vệt đá nứt, **sân lát sáng hơn** quanh trạm/đại lộ/quảng trường/đài (`pavedWeight`), dốc lộ vách | `tools/asset-pipeline/src/terrain-textures.ts --set slate`, `public/terrain-slate/`, `game/thienKhuyetArt.ts`, `game/terrain.ts` (`SLATE`), `thien_khuyet.assets.json` `ground.set` |
| Cỏ Vân Lam xanh | Atlas thẻ **cỏ sao** (concept `prop_co_co_thanh` + 3 thẻ ngả lam) dựng bằng `pnpm assets:grass-cards --set night`; cỏ thưa, thành đám, **không mọc trên sân lát** | `grass-cards.ts`, `public/grass-night/`, `game/grass.ts` (`tkTuftAt`), `grassCards: "grass-night"` |
| Cảnh trống, chỉ có hàng trụ đặt tay | Rải **tàn tích** ô 26 m, xác định: cột khắc vân đổ nghiêng (chìm nửa thân), tượng võ sĩ nghiêng, đá Vân Lam nhuộm xám lam; tránh sân lát, cụm quái, điểm đáng chú ý, collider. Prop hỗ trợ `lean` + sắc độ theo instance (cả đường ô lẫn pool) | `thienKhuyetArt.ts` (`scatterThienKhuyet`), `propScatter.ts` (`scatterTk`), `props.ts` (`setYawLean`, `instanceColor` cho ô có `tint`) |
| Mood `night` của Vân Lam (xanh ngọc, tối) | Ba preset `tk_dawn` / `tk` / `tk_night` (đêm trăng lam, sương mỏng, đèn vàng nhạt `#F2C47E`, "ban đêm bớt tối": `blackLift #1B2D38`, exposure 1,28); mặc định `tk_night`, `?mood=dawn|day|night` đổi biến thể. **Thần Tàng Điện dùng cùng mood** | `assets/palette.json`, `render/grading.ts` (`moodVariant`), `sky.ts`, `atmosphere.ts`, `engine.ts`, `check.ts`, `thien_khuyet|than_tang.assets.json` |
| Cả level phát nhạc `wild` | Bài **`wild_night`** tự soạn (A yu, 60 BPM, 40 ô ≈ 2:40, nhị hồ trầm dẫn, hạc gảy giọt, hợp xướng vọng, chuông sao, không trống), chọn bằng `regionTrack(…, 'thien_khuyet')` | `tools/audio/compose/wild_night.mjs`, `music.json`, `musicDirector.ts`, `music.ts`, manifest, `LICENSES.md` |

Công cụ mới: `pnpm shots fly --level <id> --route a,b,c` (`tools/perf/src/scenarios/fly.ts`) quay video chạy dọc level.

## Số đo (`pnpm shots points --level thien_khuyet --perf`, WebGPU, Vừa, 1280×720)

| Điểm | Draw call trước → sau | Tam giác trước → sau |
| --- | --- | --- |
| Đại Lộ Đèn Trời | 57 → 66 | 223k → 179k |
| Binh Khí Khố | 45 → 56 | 174k → 143k |
| Mộ Đạo | 53 → 65 | 217k → 178k |
| Hàng Trụ Khắc Vân | 54 → 61 | 236k → 197k |
| Tinh Bái Đài | 38 → 47 | 183k → 146k |
| Cổng Thần Tàng Điện | 58 → 65 | 256k → 204k |
| Cổ Thành Thất Lộ | 34 → 36 | 193k → 124k |

Cao nhất sau: **66 draw call** (< 300), **204k tam giác** (1–2 triệu). Thêm texture nạp lười: slate ≈ 3,5 MB tải + ≈ 54 MB VRAM (thay bộ Vân Lam khi đổi level, không cộng dồn), cỏ sao 0,27 MB, nhạc 2,1 MB (webm) / 2,5 MB (m4a), chỉ tải khi vào level. `pnpm bench:client` chỉ đo Vân Lam (chạy `--renderers webgpu --presets medium,high`, ghi ở `bench/results/`): đạt cả ba điểm rừng/hồ; sân tông môn có đỉnh p95 ở lần đầu (nạp shader), mã Vân Lam không đổi ngoài nhánh `instanceColor`/`lean` chỉ chạy khi prop có `tint`/`lean`.

## Giới hạn

- Mặt nạ mặt đất vẫn `neutral` (một lớp nền, như Đoạn Mạch): lát đá/rêu phân biệt bằng màu đỉnh, chưa có lớp lát riêng theo mặt nạ.
- Mới có `wild_night`: chưa có `wild_night_war` (Binh Khí Khố), `boss_thu_linh` (Điện Tiền, Mộ Đạo), `sect_night` (trạm); phó bản Thần Tàng Điện chỉ đổi mood, giữ nhạc `dungeon`. Chỗ nối vòng lặp `wild_night` 2,1 (ngưỡng cảnh báo 2; `wild_ochre` 2,3).
- Đường cong giờ trong ngày và tượng/cột đổ thêm bằng GLB mới chưa làm: tàn tích dùng lại GLB có sẵn (`prop_tru_da_khac_van`, `prop_tuong_da_vo_si`, đá Vân Lam). Không có asset người dùng mới để nhập.
- Cột sáng (beacon) ở các điểm vẫn rất lớn và sáng khi đứng sát: không thuộc gói này.
