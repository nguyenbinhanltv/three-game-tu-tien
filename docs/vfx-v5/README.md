# VFX-V5 (PR 1): hiệu ứng quái thường và tinh anh

Cùng ngôn ngữ V0–V4 (ba tầng màu + bóng sẫm, mép rách, gai tinh thể, triện văn, hạt tan) nhưng bảng màu **"nguy hiểm"** tách khỏi bảng "của ta" của người chơi:
`mon_<hệ>` ở `render/vfx/palette.ts` (kim: thép lam, mộc: lục, thủy: lam, hỏa: cam đỏ, thổ: hổ phách; mọi hệ có `accent` đỏ son để vạch báo và đòn quái luôn đọc ra là mối nguy). Chỉ hình: ai trúng, sát thương, hồi chiêu vẫn do server (HazardMsg, DmgMsg, BoltMsg không đổi).

## Cách chạy

- Dữ liệu: `packages/content/data/fx/mon_*.json` (sinh bằng `python tools/vfx/gen-fx-mon.py`), nạp thành `MON_FX` (`@dtl/content`), `content:check` kiểm ngân sách (≤ 12 draw, ≤ 1.500 hạt).
- `FxRunner.startAt(timeline, {actor, palette, tgt, area, mul, delay})` (`game/fxTimeline.ts`) phát một timeline tại điểm bất kỳ (không cần chiêu người chơi): `mul` nhân cỡ hình/khoảng dịch/hạt theo chiều cao quái hoặc bán kính vùng; sự kiện `untilDelay` kéo dài đúng thời gian báo trước của vạch.
- `game/monFx.ts` (`MonFx`) nối vào engine: không phát khi xa quá 60 m hoặc khi lưới FX sống chạm trần đám đông; mỗi quái giãn 0,12 s (bị đánh) / 0,3 s (đánh trúng người) giữa hai lần. `?monfx=0` tắt hết để so trước/sau.

| Sự kiện | Hook | Timeline | Hình |
| --- | --- | --- | --- |
| Quái bị đánh | `applyDmg` (dst là quái) | `mon_hit` | chớp, tia, mảnh tinh thể theo hệ |
| Quái đánh trúng người | `applyDmg` (src là quái) | `mon_strike` | ba vệt cào mảnh mép rách (đỏ son + thân theo hệ), nhỏ hơn vệt chém tròn của người chơi |
| Quái niệm/tụ lực | cờ `MF_CHANT` bật | `mon_cast` | triện văn đỏ dưới chân, hai gợn, khí hút vào tâm |
| Vạch báo vùng tròn | `S.HAZARD` (quái thả) | `mon_warn` | triện văn đỏ tồn tại đúng tới lúc nổ + gợn (cộng thêm pháp trận sẵn có) |
| Nổ vùng tròn / đường / nón | hết `delay` của vạch | `mon_boom_circle` / `_line` / `_cone` | chớp, hai gợn, vòng gai trồi lần lượt, vết nứt + cháy / gai nối tiếp dọc trục / ba lưỡi liềm quét + khói toon |
| Đạn đánh xa | `S.BOLT` / `S.BOLT_END` | `mon_bolt_muzzle` / `mon_bolt_impact` | chớp nòng + tia; chớp, gợn, tia, mảnh khi tan |
| Quái gục | `monsterInk` | `mon_death` | chớp, hai gợn, tro bay lên, tia, mảnh rơi, cánh linh quang, vết cháy (mực sẵn có vẫn vẽ) |

`Vfx.hazard(..., quiet)`: vùng tròn do quái thả không còn vẽ chớp/gai băng cũ (timeline thay thế).

## Số đo (`pnpm shots:vfx --perf`, WebGPU, sân tông môn, một quái)

| Cảnh | draw p50/max | tam giác max | khung ms p50/p95 |
| --- | --- | --- | --- |
| Quái bị đánh (4 lần) | 121–134 / 122–135 | 363k | 7,9–8,3 / 12–14 |
| Quái chết | 128–144 / 135–147 | 373k | 8,2–8,4 / 11–15 |
| Nổ vùng tròn tinh anh | 123–136 / 127–140 | 383k | 8,0–8,3 / 12–16 |

Trong ngân sách (< 300 draw). Đo 50 người + nhiều quái cùng lúc để V6.

## Ảnh và video

Ảnh dãy khung (nam/nữ, mỗi ô 60 ms game): `anh/`. Video webm chậm 0,25× và tốc độ thật: artifacts của phiên (không nằm trong repo). Quay: `pnpm shots:vfx --out <thư mục tuyệt đối> --skills mon:<loại>[:<id quái>]` với loại ∈ `hit|strike|cast|boom_circle|boom_line|boom_cone|bolt|death` (kèm `--genders m,f --frames --tile 60 --tmax 2600`); gọi qua `__game.monFx` đúng đường client dùng khi nhận tin server (vùng thử đặt quanh người chơi).

## Hạn chế

- Quái chết vẫn dùng model gục + mực sẵn có, chưa tan model thành hạt (cần shader dissolve cho SkinnedMesh).
- Vạch báo hình chữ nhật/nón chỉ có pháp trận cũ (triện văn đỏ mới chỉ cho vùng tròn).
- PR 2 (boss: vạch báo/niệm/chết riêng, bảng màu ma khí, Vân Lam, Phục Mạch, Vân Hải, Kính Nguyệt) làm riêng.

---

# VFX-V5 (PR 2): boss

Biến thức `boss` của cùng các timeline (`variants.boss` trong `mon_*.json`, thêm vào sự kiện chung; `MonFx` tự chọn khi quái là `MonsterDef.boss`), bảng màu ma khí `mon_boss_<hệ>` (thân theo hệ, viền vàng kim `0xffe9b0`, accent đỏ thẫm `0xff1f3d`, bóng gần đen) và hai timeline vạch báo mới chỉ cho boss.

| Hạng mục | Timeline | Thêm so với quái thường |
| --- | --- | --- |
| Vạch báo vùng tròn | `mon_warn` + `boss` | vành triện văn ngoài sẫm, bốn cột gai đỏ ở mép đứng tới lúc nổ, hai gợn nhấp nháy, khí hút vào dày |
| Vạch báo đường/nón | `mon_warn_line`, `mon_warn_cone` | ba nhịp gợn/lưỡi liềm nhấp nháy dọc vạch (pháp trận cũ vẫn chạy) |
| Nổ vùng tròn | `mon_boom_circle` + `boss` | chớp đỏ lớn, gợn viền sáng, vòng 12 gai ngoài, cột sáng giữa, mảnh vỡ, vết nứt lớn |
| Nổ đường / nón | `mon_boom_line`/`_cone` + `boss` | hai hàng gai rộng, cột sáng cuối đường, vết nứt; lưỡi liềm thứ tư + mảnh |
| Đánh trúng người | `mon_strike` + `boss` | vệt cào lớn viền sáng + mảnh |
| Niệm (chant 2,4 s) | `mon_cast` + `boss` | triện văn 4,6 m, gợn lặp, cột sáng tụ, 40 hạt hút vào |
| Gục | `mon_death` + `boss` | ba gợn lớn, vòng gai vỡ, cột sáng bay lên, tro + cánh linh quang, vết nứt |

Boss đã xem: Kiếm Khôi (Vân Lam), Hàn Giao (Vân Lam), Ngô Công Vương (Phục Mạch, niệm hút mạch), Thạch Tâm Khôi Vương (Phục Mạch), Vân Hải Kình Vương (Vân Hải, đường), Huyết Lang Vương (Vân Lam). Kính Nguyệt Chân Quân dùng chung vùng quét (nón) và bảng màu kim; bóng gương giả vẫn do `mirror` của server. Cùng hạ tầng cho cả boss bí cảnh (Kiếm Trủng, Phục Mạch Quật, Kính Nguyệt Cung): vùng nổ đi qua `S.HAZARD` như mọi nơi.

Số đo (`--perf`, một boss): draw p50/max 125–149 / 128–157, tam giác max 490k, khung p50/p95 8,1–10,1 / 11–18 ms (trong ngân sách; đo 50 người + nhiều boss để V6). Ảnh dãy khung nam/nữ: `anh-boss/`. Quay: `pnpm shots:vfx --out <thư mục> --mon-dist 16 --skills mon:boom_circle:boss_kiem_khoi,mon:boom_cone:boss_han_giao,mon:chant:boss_thon_mach_ngo_cong_vuong,mon:boom_line:boss_van_hai_kinh_vuong,mon:strike:boss_huyet_lang_vuong,mon:death:boss_kiem_khoi`.

Hạn chế: boss lớn (Ngô Công Vương, Hàn Giao) vượt khung ở camera 16–18 m, cần lùi camera; vạch báo hình chữ nhật/nón mới chỉ nhấp nháy, chưa có triện văn trải đúng hình; boss gục vẫn dùng model gục + mực.
