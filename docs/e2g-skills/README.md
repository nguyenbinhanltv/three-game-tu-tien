# E2-G: chiêu bậc 2–3 (Lạc Kiếm Quyết, Bất Động Kim Thân, Thanh Mộc Đan Kinh)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2g-skills/<file>`.

Nguồn thiết kế: `docs/EXPANSION_DESIGN.md` mục 8.1–8.3 và 11.2. Gói này thêm **21 chiêu** (mỗi công pháp 7), mỗi chiêu có biến thức A/B.
Chơi được: **12 chiêu mở ở cấp 16–22 (Trúc Cơ → Kết Đan hậu kỳ)**. Chiêu mở từ cấp 24 trở lên (Nguyên Anh, Hóa Thần: 9 chiêu) chỉ có **dữ liệu + pose + cờ `locked: true`**;
server từ chối ra chiêu (`sys.skill_locked`), client không đưa lên thanh chiêu. Bỏ cờ khi làm cơ chế tương ứng ở các gói sau.

## Bảng chiêu

| Công pháp | Cấp | Chiêu | Kiểu | Chơi được |
| --- | --- | --- | --- | --- |
| Lạc Kiếm Quyết | 16 | Hoành Kiếm Phá Mạch | `line` 12×3 m, 280% | có |
| | 18 | Kiếm Vũ Tam Điệp | ba nhát một lần bấm (110/110/180%) | có |
| | 20 | Kiếm Đan Bản Mệnh | `summon` 10 s, 40%/nhịp 1 s | có |
| | 22 | Nghịch Kiếm Chuyển Phong | lướt xuyên 10 m, 160% mỗi kẻ | có |
| | 24 / 26 / 28 | Phân Anh Kiếm Ảnh / Thuấn Di Trảm / Thiên Kiếm Hóa Hình | | khóa |
| Bất Động Kim Thân | 16 | Thiết Quyền Chấn Địa | `aoe` quanh mình r 6, choáng 1 s | có |
| | 18 | Kim Chung Trấn | `guard` giảm 30% + phản 20%, 6 s | có |
| | 20 | Sơn Nhạc Hóa Thân | `buff` 10 s, giảm 20% | có |
| | 22 | Dịch Sơn Xung | lướt 8 m + đẩy 6 m, 130% | có |
| | 24 / 26 / 28 | Anh Thiết Thân / Thuấn Di Hộ Thế / Thiên Kim Pháp Tướng | | khóa |
| Thanh Mộc Đan Kinh | 16 | Mộc Linh Trận | `hot` 8 s r 8 + mộc độc | có |
| | 18 | Dược Vũ | `hot` 25% trong 4 s, r 10 | có |
| | 20 | Ngưng Đan Hộ Thế | `shield` cả đội r 12, 15% máu, 10 s | có |
| | 22 | Đan Hỏa Phong Tràn | `aoe` r 6, 320% + thiêu đốt 4 s | có |
| | 24 / 26 / 28 | Anh Dược Hóa Thân / Thuấn Di Cứu Viện / Thiên Đan Pháp Giới | | khóa |

Biến thức A/B: xem `packages/content/data/methods.json` (mục `variants`) và chuỗi `skill.<id>.var.a|b.*` ở `i18n/vi.json`. Tên chiêu nằm ở `glossary.skillsTier` (`content:check` so khớp).

## Cơ chế mới ở server (giữ nhỏ)

Tất cả dùng luật K-2 sẵn có (`windup`/`hitAt`/`recovery`, áp sát thương tại `hitAt`, hủy hoàn nếu mục tiêu mất). Thêm ở `apps/server/src/game/sim.ts` (+ `method.ts`):

- `kind: 'line'`: vệt chữ nhật dài × rộng từ người ra chiêu về mục tiêu, trúng mọi quái trong vệt (`inLine` ở `shared/skillrules.ts`); danh sách trúng chốt lúc áp.
- `kind: 'summon'`: kiếm đan, mỗi người một bộ, mỗi nhịp đánh `count` quái gần nhất (biến thức B ưu tiên quái đang mang dấu ấn của mình). Chạy trong `tickMethods`.
- `kind: 'buff'`: giảm sát thương (`setGuard`) + hồi/giậm (biến thức).
- `aoe` với `self: true` (không cần mục tiêu), `stun`, `burn` (dùng lại `mon.poison`), làm chậm (`mon.slow` sẵn có).
- `guard` có `reflect` (`MethodRt.setReflect`, phản ở `damagePlayer`), `guardAlly`; `shield` có `party` (khiên cả đội) + `regen`.
- `dash` có `pierce` (chém dọc đường lướt) và `push` (đẩy/kéo mục tiêu, `pushMonster`: dừng trước dốc đứng; thủ lĩnh miễn, tinh anh nửa quãng); `lenMul` kéo dài quãng lướt (tối đa 12 m).
- `SkillDef.hitsMul`: nhiều nhát trong một lần bấm (Kiếm Vũ).
- `needsTarget`/`dealsDamage` đưa vào `shared/skillrules.ts` dùng chung server và client.
- Chiêu `locked` bị từ chối ở `onSkill`.

## Điểm lệch so với bảng thiết kế (cần người duyệt)

1. **Thời gian**: chiêu không niệm phải ≤ GCD 1 s (`validateSkillRules`), nên `recovery` một số chiêu bị rút (Thiết Quyền 0,55; Sơn Nhạc 0,4; chiêu Nguyên Anh+ tương tự). Thuấn Di bậc 3 dời `hitAt` từ 0,15 lên 0,2–0,25 để pose có khung chuẩn bị tối thiểu.
2. **Kiếm Vũ Tam Điệp** là **ba nhát trong một lần bấm** (hitAt 0,2/0,5/0,8), không phải combo 3 lần bấm: `combo` hiện đặt hồi chiêu ở mỗi lần bấm nên không hợp chiêu có hồi 15 s. Biến thức B = bốn nhát 90%.
3. **Dược Vũ**: bản thiết kế A "giải độc", B "+5% tốc độ" cần hệ trạng thái xấu/buff tốc độ của người chơi chưa có. Đã đổi A = người được hồi nhận khiên 8% máu, B = vùng hồi rộng thêm 50%.
4. **Nghịch Kiếm B** dài 12 m (thiết kế 14 m): `validateSkillRules` giới hạn quãng lướt 12 m.
5. **Mộc Linh Trận** là hồi dần cho người trong vùng lúc ra chiêu (như `hot` hiện có), chưa là vùng đứng yên theo vị trí.
6. **Sơn Nhạc Hóa Thân**: "thân phóng 1,3×" mới là quầng ngọc đá (`dome`) + trụ, chưa phóng to model.
7. **Chỗ đặt chiêu**: ô 9–10 chính thức là việc của E2-E. Tạm thời 4 chiêu chơi được của công pháp đang tu nằm ở **hàng chiêu bậc cao** (Shift+1…4), chỉ số ≥ `BAR_SIZE` trong `Game.bar()`; 8 ô chính và phím 9 (pháp bảo) không đổi.
8. **Pose chiêu lướt** (Nghịch Kiếm, Dịch Sơn): như các chiêu lướt hiện có, không có pose riêng; hình lướt do client dựng (K-4 `dashFrom`) và VFX riêng.
9. **Dịch Sơn Xung B** không lướt: kéo mục tiêu (và quái trong 4 m quanh nó) từ xa về sát người (tối đa 6 m).
10. **Icon**: 21 chiêu dùng emoji dự phòng (`iconFallback`), chưa có tranh trong atlas (`pnpm icons:check` báo 92/113).

## VFX (K-6)

Ba pha tụ lực → bùng nổ → tan tự áp cho mọi chiêu mới qua `skillFx.ts` (màu theo công pháp `METHOD_TINT`, HDR ≤ 2,4, ngân sách hạt/lưới `capsFor`); thêm 15 kiểu FX riêng ở `game/methodFx.ts`
(`hoanhkiem`, `kiemvu`, `kiemdan`, `kiemdan_hit`, `nghichkiem`, `thietquyen`, `kimchung`, `sonnhac`, `sonnhac_stomp`, `dichson`, `moclinh`, `duocvu`, `ngungdan`, `danhoa`). Nhịp kiếm đan và giậm dùng id FX riêng (`*_hit`, `*_stomp`)
để không kích lại động tác niệm của chiêu. Chiêu `buff`/`summon` không vẽ vệt kiếm bám xương.

## Pose (K-5)

19 pose mới sinh bằng `node tools/poses/gen-k5.mjs` (một giọng theo công pháp của chiêu): kiếm tu 9 khung (Hoành Kiếm, Thuấn Di Trảm, Thiên Kiếm Hóa Hình), Kiếm Vũ ba nhát nối nhau,
hộ pháp 9 khung (Thiết Quyền), đan sư 9 khung (Đan Hỏa), còn lại 7 khung cử chỉ (ép xuống, nâng lên, mở hai bên, đẩy ra, tay áo, chắp tay).
Chạy với tên pose để chỉ ghi pose cần: `node tools/poses/gen-k5.mjs hoanh_kiem kiem_vu`.

## Kiểm

- `pnpm content:check` (hitAt khớp pose ±0,03 s, `hitAt` cuối + `recovery` ≈ độ dài pose, tên khớp glossary, cờ khóa), `pnpm typecheck`, `pnpm test` (`apps/server/src/game/e2g.test.ts`: 20 test cơ chế).
- Chơi thử: `?mute=1&auto=thu&realm=…` (cấp ≥ 16 mới có hàng chiêu bậc cao), `/gm level 22`, `/gm method lac_kiem_quyet`, `/gm spawn mon_soi_xam 3`, rồi Shift+1…4.
- Ảnh: `pnpm shots:k1 --mode viewer --model char|chr_kiem_tu_nu --only <pose>` (dãy khung từng pose, hai góc), `pnpm shots:e2g --out <thư mục>` (trong game, nam/nữ, có VFX).

## Ảnh (GPU thật, tắt tiếng)

- `game/<nam|nu>-<chiêu>.jpg`: trong game, mỗi ô 50 ms (chụp chậm ×0,25), viền đỏ = khung `hit`; 12 chiêu × nam (Thanh Phong) và nữ (Lam Chi). `game/skill-events.json`: nhật ký sự kiện chiêu.
- `pose-nam/`, `pose-nu/`: dãy khung khóa từng pose (viewer, hai góc: chéo và bên) cho 10 chiêu có pose riêng chơi được.

## Đo CPU (bench:client, cùng máy, cùng phiên)

`main` (3e6013f) và PR chạy lần lượt trên cùng máy (RTX 3060 Ti). Cột High, CPU p95 (ms):

| Điểm | WebGPU main | WebGPU PR | WebGL2 main | WebGL2 PR |
| --- | --- | --- | --- | --- |
| sân tông môn | 8,7 | 8,4 | 11,4 | 8,4 |
| rừng | 9,4 | 9,9 | 9,0 | 10,5 |
| hồ | 7,4 | 10,1 | 12,2 | 10,1 |

Cả baseline cũng vượt 8 ms ở 5/6 ô High và dao động 2–3 ms giữa hai lần đo: vượt ngân sách ở preset High là sẵn có trên máy này, không do gói E2-G (không đổi đường vẽ lúc đứng yên).

## Nối hiệu ứng 4 món của bộ bậc 2 (E2-F)

`SetFx.hoanhKiemPower/Reach` (Hoành Kiếm: sát thương thêm, vệt và tầm dài thêm mét), `kimChungReflect` (Kim Chung Trấn: phản cộng thêm) và `mocLinhDur` (Mộc Linh Trận: kéo dài thêm theo tỉ lệ, giữ hồi/độc mỗi giây nên tổng tăng theo) đã nối trong `sim.ts` (test ở `e2g.test.ts`).
