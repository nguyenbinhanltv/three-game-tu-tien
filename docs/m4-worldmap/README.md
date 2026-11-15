# M-4 Bản đồ lớn, điểm đánh dấu, Truyền Tống Trận

Kế hoạch: `ke-hoach-ban-do-minimap.md` mục 3.3 + 3.5 (có Truyền Tống Trận, không sương mù khám phá).

## Bản đồ lớn (phím M)

- Dùng lại nền bản đồ cổ của M-3 (`public/map/van_lam.webp`, mip theo mức zoom), toàn vùng chơi, **kéo** để di chuyển và **lăn chuột** để phóng to quanh con trỏ (kẹp trong vùng chơi). Nút "Về chỗ ta" căn lại quanh nhân vật.
- Mỗi vùng ghi **tên + khoảng cấp** ngay trên bản đồ (đỏ khi cấp mình thấp hơn khoảng hợp, xám khi cao hơn) và ở danh sách bên phải kèm **quái thường, tinh anh, tài nguyên chính** (tính từ `camps`, `spawns`, `nodes` trong `levels/van_lam.json`, nên đi theo dữ liệu M-1). Bấm một vùng trong danh sách để căn bản đồ tới đó.
- **Bộ lọc lớp** (nhớ ở `localStorage` `dtl.wm.layers`): NPC, nhiệm vụ (dấu `!`/`?` và vùng tô mục tiêu), quái (mỗi bãi một chấm theo độ khó, tinh anh sọ, boss), thu thập (điểm hái), truyền tống.
- Biểu tượng và tooltip dùng chung sprite với minimap; quái vẽ theo bãi (tĩnh) chứ không theo từng con vì server chưa có AOI.

## Điểm đánh dấu

- **Chuột phải** trên bản đồ lớn hoặc minimap đặt điểm (chuột phải lên chính điểm đó thì xóa; nút "Xóa điểm đánh dấu"). Mỗi người một điểm.
- Trong thế giới: **cột sáng mảnh** (vàng của mình, lam của đồng đội), vòng dưới chân, **mũi tên ở rìa màn hình** kèm khoảng cách khi điểm ngoài khung nhìn (`OffKind` `mark`/`mate`), cờ trên minimap (bám mép khi ngoài tầm).
- **Chia sẻ qua server**: lệnh `mark` (`MarkCmd`), server kiểm toạ độ (số hữu hạn trong vùng chơi), giãn 1 s mỗi lệnh, điểm hết hạn sau 10 phút, chỉ gửi `S.MARK` cho đồng đội **cùng tổ đội và cùng room**; chủ điểm rời room thì điểm biến mất. Đồng bộ đầy đủ mỗi giây nên người vào tổ đội sau vẫn thấy.

## Truyền Tống Trận

| Trận | Vùng | Vị trí (x, z) |
| --- | --- | --- |
| `tp_tong_mon` (mở sẵn) | sân Lạc Kiếm Tông | 2048, 2112 |
| `tp_cong` | bệ cổng Kiếm Trủng | 2048, 1750 |
| `tp_thung_lung` | Thung Lũng Thanh Phong | 2010, 2375 |
| `tp_suoi` | Suối Thanh Khê | 2405, 2500 |
| `tp_rung` | Rừng Linh Thảo | 2335, 2110 |
| `tp_vach` | Vách Đá Ngọc | 2420, 1815 |
| `tp_ho` | Bãi Hồ Sương Mù | 1580, 2070 |

- Mỗi trận nằm ở mép vùng phía tông môn, chỗ bằng, không đè collider/nước. Các vùng phủ kín bãi quái nên trận chỉ cách bán kính bãi gần nhất 5–12 m (có thể bị quái lang thang gần đó thấy); `content:check` kiểm lại mọi điều kiện (đúng một trận mỗi vùng, trong đa giác, không đè collider/bãi quái, dốc ≤ 2,6 m/4 m).
- **Mở khóa**: đứng trong 4 m của trận thì server mở khóa và ghi cột `characters.tele` ngay (JSON mảng id, không gồm trận mở sẵn). Sửa cả DDL `db.ts` lẫn bảng Drizzle, `ADDED_COLUMNS`, `DATA_VERSION` 2 → 3. **Migration nhân vật cũ** (`migrateTele`): mở sẵn trận của vùng mà họ đã vượt cấp (cấp cao hơn khoảng hợp của vùng) và trận cổng nếu đủ cấp vào Kiếm Trủng; còn lại chạm như người mới. Idempotent.
- **Dùng**: bấm trận đã mở trên bản đồ lớn (lệnh `tele {id}`). Server niệm **3 giây**, hồi chiêu **30 giây** (theo nhân vật, giữ qua chuyển room). Hủy khi di chuyển quá 1,8 m, bị đánh hay vào giao chiến; không bắt đầu được khi chết, độ kiếp, tâm ma, tỉ thí, đang ra chiêu, đang niệm lượt khác hoặc ở ngoài thế giới chính (bí cảnh); lúc niệm xong kiểm lại mọi điều kiện. Đến nơi lệch 3 m về phía tông môn. Lệnh `tele` giãn tối thiểu 0,4 s.
- **Hình ảnh**: bệ đá + bốn trụ gộp một mesh, hai vòng rune quay ngược chiều (xám mờ khi chưa mở, xanh ngọc khi đã mở), cột sáng mảnh; vòng niệm thu nhỏ quanh chân người chơi và một vòng sáng nở ra khi tới nơi. Trận chỉ dựng trong 260 m quanh mình (≤ 4 draw call mỗi trận), mọi vật phát sáng dưới `FX_MAX_HDR`.
- Lệnh GM thử: `/gm tele all|none|cd|<id>`. Minimap (M-3) tự hiện trận đã mở qua `minimapHooks.teleports`.

## Kiểm

- `pnpm typecheck`, `pnpm test` (server 204+15 test teleport/marker/migration, client + test bản đồ lớn), `pnpm content:check`.
- `pnpm --filter @dtl/bot-client security`: thêm bài 14 (trận chưa mở/id lạ/sai kiểu, niệm đủ thì tới nơi, hồi chiêu, bị quái đánh thì không truyền tống, spam 80 lệnh `tele` và 60 lệnh `mark`, toạ độ đánh dấu sai, người ngoài tổ đội không thấy điểm).
- `pnpm bots --count 100 --duration 120` (server `RATE_LIMIT_EXEMPT=loopback`): 100 bot vào hết, 0 thất bại; rồi `pnpm ledger:check`: sổ cái khớp (146 nhân vật, 1936 dòng). Tick p95 ban đầu ~2 ms, lên ~10 ms lúc bot đánh nhau dày (có một bộ kiểm bảo mật khác chạy song song trên máy nên số này không sạch).
- `pnpm bench:client` (WebGPU + WebGL2, Vừa, RTX 3060 Ti), so main hiện tại (chưa có M-4) cùng máy, cùng phiên: CPU p50 / p95 / draw call. WebGPU sân 3,6 / 5,0 / 117 (main 3,7 / 5,7 / 110), rừng 4,4 / 5,7 / 145 (5,0 / 7,2 / 134), hồ 4,5 / 6,0 / 132 (4,1 / 5,4 / 126); WebGL2 sân 4,0 / 5,5 / 117 (3,6 / 4,8 / 110), rừng 5,1 / 7,5 / 147 (5,3 / 7,2 / 134), hồ 4,8 / 6,4 / 136 (4,9 / 6,8 / 128). CPU ngang main (chênh nằm trong nhiễu đo); draw call tăng 7–11 vì mô hình trận (4 call mỗi trận trong 260 m), vẫn dưới ngân sách 300.
- Rà soát netcode theo checklist của `netcode-reviewer` (tự làm, xem mô tả PR).
- Ảnh (`pnpm shots:m4`, Chrome GPU thật, tắt tiếng): `worldmap-full.png`, `worldmap-filter-off.png`, `worldmap-marker.png`, `worldmap-marker-shared.png`, `marker-shared-beam.png`, `marker-edge-arrow.png`, `worldmap-tele-hover.png`, `worldmap-tele-casting.png`, `tele-cast-ring.png`, `tele-arrived.png`, `worldmap-cooldown.png`.

## Chưa làm

- Chưa có biển chỉ đường vẽ lên bản đồ (3.3, phần đường mòn chỉ là nét vẽ nền); chưa có sương mù khám phá (đã quyết không làm).
- Điểm đánh dấu chưa có tin nhắn/đồng hồ riêng ngoài cột sáng; không chia sẻ giữa thế giới và bí cảnh.
