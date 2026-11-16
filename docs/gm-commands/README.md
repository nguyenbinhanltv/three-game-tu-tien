# Ảnh bảng GM và lệnh thử đồ (GM-TEST)

Chụp bằng `pnpm --filter @dtl/perf run shots:gm --out <thư mục tuyệt đối>` (WebGPU, 1280×720, `?mute=1`, Chrome `--mute-audio`, cặp cổng riêng, tự tắt server). Bảng lệnh đầy đủ: [`../gm-commands.md`](../gm-commands.md).

## Bảng GM trong F3 (từng nhóm)

| Nhóm | Ảnh |
| --- | --- |
| Nhân vật | ![](panel-char.png) |
| Kỹ năng | ![](panel-skill.png) |
| Trang bị (bậc / nhánh / +N / giới tính) | ![](panel-gear.png) |
| Trang phục | ![](panel-outfit.png) |
| Vũ khí | ![](panel-weapon.png) |
| Bản đồ | ![](panel-map.png) |
| Quái | ![](panel-mon.png) |

## Lệnh chạy thật

- `kit 2 kiem +10 f` bấm từ bảng (bậc 2, Kiếm tu, +10, nữ): ![](kit-bac2-kiem-tu-+10-truoc.png) ![](kit-bac2-kiem-tu-+10-sau.png)
- `help kit`, `find liet mach`: ![](help-find.png)
- `help` (đủ danh sách): ![](help-full.png)
- `outfit set_dia_giap m`, `outfit set_phuc_mach f`: ![](outfit-set_dia_giap.png) ![](outfit-set_phuc_mach.png)
- `weapon itm_liet_mach_kiem +10`: ![](weapon-liet-mach-+10.png)

Góc camera là camera chơi bình thường (nhân vật nhỏ trong khung); xem kỹ hình dạng đồ thì dùng trang xem asset `?mute=1&show=char`.
