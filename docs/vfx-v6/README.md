# VFX-V6: kỹ thuật từ EdgeFlux (MIT) và Storm & Wind (CC BY) + SFX Hỏa/Băng/Lôi (CC0)

Chỉ là lớp hình/âm. Shader Godot **không** được chép: mọi thứ viết lại bằng TSL từ kỹ thuật. Giấy phép và ghi công: `assets/LICENSES.md` (mục "VFX viết lại bằng TSL từ gói bên ngoài"), `packages/content/data/credits.json` (kind `vfx`, hiện ở Cài đặt → Ghi công).

## Hình

| Hạng mục | Nguồn kỹ thuật | Chỗ |
| --- | --- | --- |
| Vệt kiếm mượt: nội suy Catmull-Rom mỗi đoạn (`BLADE_SUB` = 3, 40 điểm vẽ từ 14 mẫu), lưới cấp sẵn | EdgeFlux (ribbon) | `render/vfx/bladeTrail.ts` |
| Dáng vệt: phần cũ co dần về mũi (lưỡi liềm), viền cắt sáng gắt tắt theo hàm mũ, nhiễu năng lượng cuộn, mờ theo lũy thừa của tuổi; bật bằng `fxA.w = 1` (vệt phi kiếm giữ nguyên) | EdgeFlux (trail) | `render/vfx/trail.ts` `bladeTrailNodes` |
| Kiếm khí: viền cắt sáng gắt phía ngoài, pha trắng ở viền | EdgeFlux (slash) | `render/vfx/slash.ts` |
| Tia lửa trúng đòn: vạch chéo "clash cross" (ngang dài + dọc ngắn, xoay theo seed) trong `burst`, bật bằng `"cross": true` ở sự kiện mesh; đang dùng ở `skl_phi_kiem`, `skl_kiem_khi_tram` | EdgeFlux (flare) | `render/vfx/stylized.ts` `burstNodes` |
| Sét: nhấp nháy theo sin(thời gian) lệch pha theo seed, đốm sáng ở mũi tia dẫn | Storm & Wind (bolt) | `render/vfx/lightning.ts` `boltNodes` |
| Chỗ sét đánh: decal `strike` (vũng sáng, tia chớp tỏa, vòng xung kích); dùng ở `skl_loi_dinh_nhat_kiem` và mọi thiên lôi qua `Vfx.lightning` (tối đa 6 cái cùng lúc) | Storm & Wind (strike) | `stylized.ts` `DECAL_STRIKE`, `game/vfx.ts` `strikePool` |
| Đường gió: hình `gust` (7 vệt cuộn quanh trục +Z) + kiểu material `wind`; dùng ở `skl_nghich_kiem_chuyen_phong`, `fx_blink` | Storm & Wind (line) | `lightning.ts` `windNodes`, `fxShapes.ts` `gustGeometry` |

Kiểu `wind` mới nằm trong `warmKinds`, không gộp instanced (như `trail`), HDR chặn ở `FX_MAX_HDR`, bloom 0,2.

## Âm thanh (CC0, gói `elem` trong `tools/audio/sounds.json`)

20 file WAV từ sampler của SquigglyFish chép vào `<dtl-asset-source>/sfx/godot-elemental-sampler/` (kho nguồn, không commit), đóng vào sprite `sfx_magic`:

- `thunder` (sét của quái, Lôi Đình Nhất Kiếm, thiên lôi độ kiếp qua hazard `lightning`): thêm ba biến thể `lightning_strike` chồng lớp với sấm có sẵn.
- `loi_cast`: `lightning_cast`, gắn vào `skl_loi_dinh_nhat_kiem` (sự kiện `sound`).
- `fire_burst`: `fireball_start` + `fireball_stop`, gắn vào `skl_dan_hoa_phong_tran`.
- `ice_spike`, `ice_hit`: `ice_spikes`, `ice_impact`, gắn vào biến thức `freeze` của `skl_thien_kiem_hoa_hinh`.

Các loop (`fire_aura_loop`, `fireball_loop`) chưa dùng: game chưa có hiệu ứng lặp theo trạng thái cần chúng. `pnpm audio:levels` đã chạy lại, `audio:check` đạt cả bốn quy tắc.

## Số đo

Xem mô tả PR (draw call, tam giác, CPU khung trước/sau bằng `pnpm shots vfx --perf` và `pnpm bench:client`).
