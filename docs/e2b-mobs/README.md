# E2-B: quái, tinh anh, boss Đoạn Mạch Cổ Cốc

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/e2b-mobs/<file>`.

Gói E2-B (`docs/EXPANSION_DESIGN.md` 6.1, 5.4, 11.2). Dữ liệu thay bản tạm của E2-A, dùng bảy kiểu chiêu của E1-E (`docs/e1e-monskill/`) bằng dữ liệu; skin GLB người dùng đã nhập (#115/#116/#117), không dựng model mới.

## Chiêu theo dữ liệu (`packages/content/data/monsters.json`)

| Quái | Cấp | Chiêu (vạch báo) |
| --- | --- | --- |
| Thạch Giáp Tê | 16–19 | `charge` line 12×2 m, báo 1 s, húc 1,6×; sau húc `reveal` 2 s (×1,3) |
| Khai Mạch Khôi Lỗi | 17–19 | `leap` đập vòng r 3,5 báo 1,2 s (kiểu `slam` chỉ boss được dùng nên dùng `leap`) |
| Ngô Công Ấu | 18–19 | `caster` nón 9 m, 30° (giữ nguyên bản E2-A) |
| Mạch Thương Hộ Vệ | 18–19 | combo + `line` húc khiên 5×2,5 m báo 1 s |
| Liệt Cốt Báo Vương (tinh anh) | 17–19 | `leap` vồ r 3 báo 0,8 s, combo, `reveal` sau vồ |
| Hộ Mạch Khôi Tướng (tinh anh) | 17–19 | `leap` đập búa r 5 báo 1,4 s; `reflect` giơ khiên (nhận 30%, phản 30%) |
| Xích Sa Ngô Công (tinh anh) | 18–19 | `burrow` 3 vòng r 3, trồi đánh quạt 10 m; nón độc 12 m; `reveal` sau chui |
| Địa Mạch Long (boss) | 19 | `slam` r 6 báo 1,6 s; `line` Đứt mạch 30×4 báo 2 s (70% sát thương). Pha 70%: `sweep` nón 16 m. Pha 50%: `reveal` mất giáp lưng (×1,6 nhận, ×0,85 ngoài lúc lộ). Pha 30%: `chant` Mạch chảy lại r 14 + slam dồn |

`content:check`: giới hạn `line.r` nới lên 30 m cho boss (thiết kế 30×4). Lời boss `mon.boss_dia_mach_long.say.*` ở i18n. Rơi đồ chỉ ở `loot.json` (không `drops` trong `monsters.json`).

## Cân bằng (`pnpm sim:progress`, `fight:check`)

- TTK quái thường (đứng yên, ba công pháp): tê 5,5–6,8 s, khôi lỗi 5,5–6,0 s, hộ vệ 5,6–6,8 s (hpMul 1,5→1,3), ngô công ấu 3,5–4,5 s → hpMul 1,1→1,3. Cũng nằm trong khoảng 4–7 s ở các cấp 16–19.
- Tinh anh (không đồ): 25–37 s (đạt 20–40 s); atkMul Liệt Cốt 2,3→1,0 và Hộ Mạch 2,2→1,3 (sim tính cả trận 124% → 32%, 67% → 28%), chiêu né được bù bằng `mul` cao.
- Boss: 4 người cấp 19 hạ trong ~81 s (hpMul 90→66; Hàn Giao 72 s).
- `packages/content/src/sim.ts` đã chịu được tinh anh/boss ngoài Vân Lam (trước đó sập vì không thấy chỗ sinh) và thêm Địa Mạch Long vào bảng boss.

## Lỗi hình đã sửa

- **Slam Địa Mạch Long** (`tools/blender/anim_quadruped.py`, clip `slam`): chồm đứng thẳng hai chân sau (thân ngả ~58°, đuôi chống đất), lúc nện hai chân sau vẫn bám đất, chân trước chạm đất (trước đó chân sau hổng khi nện). Ảnh: `boss-slam.webp` (bên/trước, tại 0,9 s và 1,0 s).
- **Scale boss**: `scale` 0,85 (≈ 7,6 m dài, 3,9 m cao so với người 1,8 m).
- **Thạch Giáp Tê chết bị bẹp**: lăn nghiêng 88° làm thân rộng dẹt thành khối. Thêm `import.quadruped.death: "prone"` (quỵ bốn chân, nằm sấp). Ảnh: `te-chet.jpg`.

## Sửa sau soát (orchestrator)

- **Tinh anh đứng như cột**: ba tinh anh E2-B chưa nằm trong `MONSTER_SKINS` (chỉ ở `ELITE_SKINS_NEW`), nên trong game vẫn là model khối cũ (rết = cột đốt chồng). Đã gộp vào `monsterSkins.ts` với `level: 'doan_mach'`. Asset GLB đúng (rết bò ngang, xem `view-elite_xich_sa_ngo_cong-*.png`, `view-mon_ngo_cong_au.jpg`); trục xoay không lỗi. Ngô Công Ấu đã dùng skin thật, nhìn thẳng từ đầu thì ngắn như cột nên ảnh game chụp ngang thân.
- **Địa Mạch Long xanh lam**: không phải tint/emissive sai, skin đúng (nâu đá có vân lam khi nhìn ngang). Ảnh cũ chụp ngược sáng từ phía trước nên viền yêu khí (`rim` 0,3) và bóng lam phủ cả thân. Đã giảm `rim` 0,12, thêm `lift` 0,2 và chụp lại từ bên, gần 14 m.

## Ảnh (trong game, `pnpm shots mons --level doan_mach --out <thư mục tuyệt đối>`; mỗi tấm: 6 khung vạch báo/chiêu, 3 khung chết)

| | |
| --- | --- |
| Thạch Giáp Tê | *(ảnh đã gỡ khỏi repo)* |
| Khai Mạch Khôi Lỗi | _(ảnh đã gỡ)_ |
| Ngô Công Ấu | _(ảnh đã gỡ)_ |
| Mạch Thương Hộ Vệ | _(ảnh đã gỡ)_ |
| Liệt Cốt Báo Vương | *(ảnh đã gỡ khỏi repo)* |
| Hộ Mạch Khôi Tướng | _(ảnh đã gỡ)_ |
| Xích Sa Ngô Công | _(ảnh đã gỡ)_ |
| Địa Mạch Long (pha 1) | *(ảnh đã gỡ khỏi repo)* |
| Địa Mạch Long (99% máu, chiêu slam) | _(ảnh đã gỡ)_ |
| Ngô Công Ấu / Xích Sa trong trang xem | _(ảnh đã gỡ)_ |
| Địa Mạch Long (≤ 45% máu) | _(ảnh đã gỡ)_ |
| Địa Mạch Long (≤ 25% máu) | *(ảnh đã gỡ khỏi repo)* |
| Boss: các clip (`pnpm shots asset --group boss_`) | _(ảnh đã gỡ)_ |

`hazards.json`: các vạch báo ghi được ở client. Cảnh boss xuất hiện (B2) tự bỏ qua trước khi chụp. Mặt đất vẫn là cỏ Vân Lam (E2-I lo).

## Test

`apps/server/src/game/doanmach.mobs.test.ts` (10 test): dữ liệu level, từng chiêu trúng/né theo vị trí, chui đất, khiên, đổi pha boss.
