# K-6: VFX theo công pháp (2026-11-16)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/k6-vfx/<file>`.

Spec: `docs/AUDIT_AND_ROADMAP.md` mục 7.2. Chỉ là lớp hình, server vẫn quyết định chiêu, mục tiêu, sát thương.

## Đã làm

| Hạng mục | Chỗ nằm |
| --- | --- |
| Nhịp ba pha gắn vào `Game.onSkillEvent` (K-4): tụ lực lúc `windup` (hạt hút vào ngực, vòng dưới chân thu vào, HDR ≤ 1,2), bùng nổ đúng khung `hit` (lõi sáng HDR 2,3 ≤ `FX_MAX_HDR`, vòng chấn động), tan 0,35–0,7 s, vệt mực nền sống lâu hơn lớp sáng 0,3 s | `game/skillFx.ts`, hàm thuần `render/vfx/phases.ts` |
| Màu theo công pháp: kiếm tu `spirit_sword` #CFF3FF, hộ pháp `spirit_gold` #FFDE96, đan sư `spirit_jade` #7FE3D0 (không tím) | `METHOD_TINT` |
| Ngân sách mỗi chiêu: mình ≤ 60 hạt / ≤ 4 lưới, người khác ≤ 30 / ≤ 2, tối thượng ≤ 400 / 150 hạt; người khác chỉ vẽ trong 45 m và khi pool < 30 lưới; vòng chấn động giới hạn để che ≤ 25% màn hình theo khoảng cách camera | `capsFor`, `maxRadiusFor`, `othersAllowed` |
| Vệt kiếm bám mũi kiếm: lấy mẫu gốc + mũi lưỡi từ xương `dtl_sword` mỗi khung trong `[hitAt − 0,10; hitAt + 0,08]`, 14 đoạn, sống 0,22 s, kiểu `trail` có sẵn (không thêm material), dải toàn cảnh nâng 8 → 12, người khác chỉ trong 25 m | `render/vfx/bladeTrail.ts`, `Trails.openBlade`, `SkinnedPlayer.bladePoints` |
| Vạch báo của quái dùng sigil: son đỏ `wood_cinnabar` (quái thường), ma khí `spirit_demonic` (boss), thiên lôi giữ tím sét; nền ≤ 0,35; 80 ms cuối nháy một lần | `sigil.ts` (`fxA.z` = nháy), `telegraph.ts`, `Vfx.hazard`, `hazardStyle` |
| Linh quang hộ thể Trúc Cơ: sigil 0,9 m dưới chân, độ mờ ≤ 0,25, chỉ khi đứng yên, ngoài giao chiến 4 s, cấp ≥ 16 | `SkillFx.updateAura` |
| Mưa kiếm không che nhân vật khi camera thấp (G5): kiếm tan hẳn trong 2 m quanh camera, đặc từ 6 m | `swordRain.ts` (`rainNearFade`) |
| Gộp draw call: `glow`, `flat`, `solid`, `slash`, `ink`, `sigil`, `dome`, `inkpool` thành `InstancedMesh` theo (kiểu, hình, renderOrder) | `render/materials/fxBatch.ts`, `fxBatchMaterial` |

Công tắc so ảnh: `?k6=0` tắt ba pha, vệt kiếm, linh quang; `?batch=0` tắt gộp draw call. `pnpm shots:k6 --out <thư mục> [--genders m,f] [--only kiem,hophap,dansu,vetkiem,vachbao,hotheb] [--query "&k6=0&batch=0"]`.
`CROWD_QUERY` (bench:crowd) và `BENCH_QUERY` (bench:switch) nhận cùng chuỗi.

## Số đo (RTX 3060 Ti, 50 bot, preset Vừa, bench:crowd)

| Cảnh | Backend | Draw call trước | sau | CPU p95 sau |
| --- | --- | ---: | ---: | ---: |
| rừng | WebGL2 | 239 | 202 | 11,1 ms |
| boss | WebGL2 | 213 | 192 | 6,7 ms |
| rừng | WebGPU | 207 | 177–204 | 7,0–10,3 ms |
| boss | WebGPU | 218 | 186–191 | 6,2–8,2 ms |

Draw call giảm 21–37 mỗi cảnh, **chưa đạt mục tiêu −40**: cảnh bot chỉ có vài chục lưới VFX sống (phần lớn draw call là thực thể) và các kiểu có hình dựng lại mỗi khung (`bolt`, `trail`, `beam`, `vortex`) vẫn một lưới một draw call. Số đo dao động giữa các lần chạy theo số quái trong cảnh.

## Ảnh

Ảnh sau (GPU thật, WebGPU, camera 3,5–4,2 m, tắt tiếng): `nam-*.webp`; ảnh trước (`?k6=0&batch=0`): `truoc-*.png`. Ô nhỏ chụp bằng CDP screencast (~80 ms/khung), nên khung `hit` đánh dấu theo sự kiện, hình có thể trễ vài khung.

Hạn chế đã biết:
- Vệt kiếm chỉ dài ~0,2 s nên khó thấy trên ảnh screencast; số liệu kèm theo (`skill-events.json` trong artifact): gốc/mũi kiếm trên màn hình dài ~90 px, quét 40–70 px mỗi cửa sổ.
- Chiêu tối thượng (ult) chưa chụp: cần sạc đủ `CHARGE_MAX`.
- Ảnh vạch báo dùng `vfx.hazard` gọi trực tiếp (hazard thật của boss bị thực thể che trong ảnh). `__game.hazardLog` (dev) xác nhận boss được nhận đúng (`boss: true`).

## Ghi chú về ảnh chụp (cập nhật)

- Ảnh chiêu chụp với `?quiet=1` (chỉ bản dev): sói vẫn cắn nhưng không nháy trắng model trúng đòn (`hitReact`) và không nổ cầu hồng (`bite`). Hai hiệu ứng đó có từ trước K-6 (bản `?k6=0&batch=0` cũng có) và che nhân vật; không phải VFX của K-6.
- Phiên chụp trước còn ở lại thế giới 60 s (`allowReconnection`), nên mỗi phiên đứng một điểm khác nhau (cách 40 m), nếu không hai nhân vật đè lên nhau thành một hình chồng.
- Cảnh chiêu chụp chậm (`?slowmo=0.25`); vệt kiếm và chuỗi liên hoàn chụp tốc độ thật.

## Ảnh then chốt

- `nam-dansu-hoi-xuan-quyet.webp`
- `nam-hophap-tran-son-an.webp`
- `nam-kiem-kiem-khi-tram.webp`
- `nam-linh-quang-ho-the.webp`
- `nam-vet-kiem.webp`
