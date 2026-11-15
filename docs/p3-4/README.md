# P3-4 Bộ trang bị

Bốn bộ theo thiết kế đã duyệt (mục 3.4): hiệu ứng 2 món (chỉ số) và bậc cao (hook combat ở server), chế tạo bộ Lạc Kiếm ở Thiết lão, đổi màu áo/ánh kiếm theo bộ.

| Bộ | Món | 2 món | Bậc cao | Nguồn |
|---|---|---|---|---|
| Lạc Kiếm Môn Phục (`set_lac_kiem`) | đạo bào, hộ uyển, đai, ngoa | +5% công kích | 4 món: Phi Kiếm 20% bắn thêm một thanh | Chế tạo ở Thiết lão (Huyền 85% / Địa 15%) |
| Huyền Giáp Hộ Pháp (`set_huyen_giap`) | đạo bào, hộ uyển, đai, ngoa | +8% phòng ngự | 4 món: Linh Khí Hộ Thể đỡ thêm 30%, phản 15% phần sát thương khiên đã đỡ | Thủ Mộ Thạch Tướng (Kiếm Trủng đợt 4), 45% |
| Đan Tâm Y Bát (`set_dan_tam`) | đạo bào, ngọc bội, đai, giới chỉ | +10% hồi phục | 4 món: Hồi Nguyên Thuật hồi thêm 50% lượng hồi cho đồng đội trong 14 m | Thủ Mộ Thạch Tướng, 35% |
| Hàn Giao Lân (`set_han_giao`) | pháp kiếm, đạo bào, giới chỉ | kháng Thủy +15% | **3 món** (bộ chỉ có 3 món): bạo kích làm chậm 1 giây (quái ×0,5 tốc độ, boss ×0,8) | Boss Hàn Giao, 60% (Địa 75% / Thiên 25%) |

Lưu ý: thiết kế ghi cả Huyền Giáp lẫn Đan Tâm rơi ở đợt 4 (cùng một boss, hai lần roll riêng). Hàn Giao Lân chỉ có 3 món nên bậc cao mở ở 3 món.

## Dữ liệu và code

- `packages/content/data/equipment/sets.json` (bộ, bậc, phối màu), `setItems.json` (15 mẫu món bộ, `set` trỏ về bộ), `forge.json` (công thức chế). Món bộ không rơi theo bảng chung; chỉ rơi qua `EquipRollDef.set` trong `loot.json`.
- `packages/shared/src/sets.ts`: `setStatuses`, `setFxOf`, `lookSet`; `computePlayerStats(level, equipped, root, SETS)` cộng thưởng 2 món và trả `sets`, `setFx`. Client dùng chính hàm này để hiển thị.
- Server: `character.recalc` truyền `SETS`; hook trong `sim.ts` (`executeSkill` Phi Kiếm/khiên/hồi, `damagePlayer` phản, `hitMonster` làm chậm, `moveToward`). Kích hoạt chỉ tính từ trang bị thật ở server.
- Chế tạo: lệnh `upg` với `op: 'forge'` (`apps/server/src/game/upgrade.ts`): một transaction, khóa idem, ledger ghi `forge:<id>:q<phẩm>` và seed.
- Hiển thị: tab **Chế tạo** của Thiết lão (`UpgradeTabs.tsx`), tooltip món bộ và mục "Bộ trang bị" ở bảng Nhân vật (dòng vàng sáng khi bậc kích hoạt, `◆/◇` món có/chưa).
- Màu: schema `sk` (id bộ khi mặc từ 2 món, server tính). Client nhuộm đạo bào bằng `applyDye` với màu của bộ và đặt ánh kiếm màu bộ (`SwordGlow.setTint`).
- GM thử: `/gm set <id bộ> [số món]` mặc ngay bộ (Địa phẩm), `/gm set off` cởi hết.

## Ảnh (WebGPU, GPU thật, tắt tiếng)

- `tab-che-tao.png`: tab Chế tạo.
- `bang-nhan-vat-bo-lac-kiem.png`, `tooltip-bo-lac-kiem.png`: thẻ bộ và tooltip.
- `nhan-vat-4-bo.png`: không bộ và bốn bộ mặc đủ.

## Kiểm tra

- `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress`: đạt.
- Security (`pnpm --filter @dtl/bot-client security`): 62/62 đạt.
- 100 bot × 120 giây: tick p95 ≤ 0,82 ms; `pnpm ledger:check` khớp toàn bộ ngoài nhân vật thử chụp ảnh (lệnh GM `set off` cũ xóa đồ không qua sổ cái; đã sửa thành cất vào túi).
- `pnpm bench:client` (đủ 6 cấu hình, RTX 3060 Ti, sau khi merge main): đạt ngân sách ở mọi điểm, 0 lỗi console. Cao nhất: WebGPU/high rừng 163 draw call, 867k tam giác, CPU p95 6,0 ms, 435 MB texture; WebGPU/low 74–105 draw call, CPU p95 ≤ 3,5 ms; WebGL2/high 55–76 fps (các cấu hình còn lại ≥ 102 fps). Bộ không thêm mesh mới (ánh kiếm dùng lại `SwordGlow`). Không so sánh với file kết quả cũ trong ngày vì đó là lần chạy hẹp bị gián đoạn.
- `pnpm ledger:check` trên DB sạch sau 100 bot × 60 s và các lệnh GM `set`/`set off`: "Sổ cái khớp" (102 nhân vật).

## Phối màu (sau soát)

`applyDye` nhận thêm màu phụ: vải lam đổi sang màu chính của bộ, vùng vải sáng (áo trong ngà) đổi sang màu phụ, giữ vân theo độ sáng texel (da, tóc dưới ngưỡng nên không bị đụng). Lạc Kiếm ngà + lam đậm, Huyền Giáp đen sắt + đồng vàng, Đan Tâm ngọc bích trầm + vàng nhạt, Hàn Giao Lân lam ngọc + bạc băng. Đai và ống tay đen của model vẫn giữ nguyên (cùng màu với tóc nên chưa tách được bằng ngưỡng độ sáng); chưa thêm vân vảy.
