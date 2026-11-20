# K-2: dữ liệu chiêu và luật server

Bước K-2 của kế hoạch kỹ năng và animation. Server áp sát thương tại `hitAt`, thêm đánh thường liên hoàn, cường hóa, lướt có kiểm đường, hủy đòn chờ. Animation mới để K-4/K-5; client chỉ nối tối thiểu.

## Trường mới trong `skills.json` / `methods.json` (kiểu ở `packages/shared/src/types.ts`)

| Trường | Ý nghĩa |
| --- | --- |
| `castType` | `instant` / `cast` (mặc định suy từ `cast`). `channel`, `charge` đã khai báo nhưng `content:check` chặn: server chưa hỗ trợ |
| `windup` | Giây vào thế trước nhát vung, ≤ `hitAt[0]` |
| `hitAt[]` | Các mốc áp hiệu quả, giây từ lúc bấm. Mốc đầu trùng `hit[0]` của pose (±0,03 s). Nhiều mốc: đòn i của chiêu nhiều đòn áp ở mốc i (`hitOffsets`). Chiêu niệm áp lúc hết niệm; `hitAt` chỉ dùng khi biến thức bỏ niệm (Lôi Đình biến thức A) |
| `recovery` | Thu về sau mốc cuối; `hitAt` cuối + `recovery` ≈ độ dài pose, ≤ GCD |
| `cancel` | `{move, dash}`: giây từ lúc bấm mà di chuyển / lướt được phép cắt phần thu về (client dùng ở K-4) |
| `combo` | Chuỗi đánh thường: `{window, hits: [{power, hitAt, kb?}]}` |
| `chain` (VS-2b, thay `empower`) | `{after: [id…], window, powerMul?, mpMul?, cdMul?}`: trong `window` giây sau khi một chiêu trong `after` áp, chiêu này được thưởng, một lần (xem `docs/handbook/gameplay-systems.md`) |
| `dash` + `kind: 'dash'` | `{dist, dir: target|forward|back, stop?}`; hồi chiêu ≥ 8 s |
| `moveWhileCast` | Đã khai báo, chặn ở check (chưa hỗ trợ) |

`validateSkillRules` (`packages/shared/src/skillrules.ts`) chạy trong `pnpm content:check`; có test.

## Luật server (`apps/server/src/game/sim.ts`, trạng thái ở `skillflow.ts`)

- **Áp tại `hitAt`**: `onSkill` kiểm điều kiện, trừ linh lực, đặt hồi chiêu và GCD **lúc bấm** (`commitSkill`), rồi chờ `hitAt[0]` mới áp (`resolveSkill`). Mỗi người một đòn chờ; trong lúc chờ không ra chiêu khác.
- **Hủy**: mục tiêu chết / ra tầm (×1,3) / không còn là đối thủ tỉ thí → hủy và **hoàn** linh lực, hồi chiêu, vòng sạc. Người ra chiêu chết hoặc bay lên → hủy, **không hoàn**. Lướt cũng hủy đòn chờ, **không hoàn** (không đổi được GCD lấy lượt miễn phí). Người chơi hiện chưa có trạng thái choáng nên chưa có nhánh "bị choáng".
- **Đánh thường liên hoàn** (`skl_phi_kiem`): đòn 1, 2, 3 với hệ số 0,9 / 0,9 / 1,4; ngừng quá 2 s thì về đòn đầu. FX mang số đòn (`n`). Tự đánh vẫn do client gửi lệnh mỗi 220 ms, server giữ GCD 1 s.
- **Cường hóa**: `flow.opened[chiêu mở] = lúc áp`; chiêu có `empower.by` mạnh `powerMul` nếu còn trong cửa sổ, tiêu cửa sổ lúc bấm. Server gửi `em` trong `CdMsg` (id chiêu → lúc hết hạn) để ô chiêu sáng viền.
- **Lướt** (`onDash`, phím Q ở client, không nằm trên thanh chiêu): lập đường bằng `stepMove` bước 0,0125 s (không xuyên kiến trúc, mép bản đồ; đất dốc hơn 1,2 hoặc vách xuống đều dừng), hướng tới mục tiêu / nhìn / ra sau, dừng cách mục tiêu `stop` m. Không ăn GCD nhưng có hồi chiêu riêng, khe tối thiểu 400 ms giữa hai lệnh (kể cả lệnh bị chặn), không khi ngự kiếm / độ kiếp / tâm ma / chưa theo công pháp.
- **Chiêu mới** (3): Kiếm Ảnh Bộ (kiếm, tới mục tiêu), Thiết Bích Xung (kim, tới mục tiêu rồi húc 120%, gấp rưỡi sau Trấn Sơn Ấn), Lưu Hương Bộ (mộc, lùi 8 m). Phi Kiếm Truy Hồn gấp rưỡi trong 3 s sau Kiếm Khí Trảm.
- **Đổi id** (giữ cấp, biến thức): `skl_kiem_anh_phan_quang → skl_phi_kiem_truy_hon`, `skl_xuan_phong_hoa_vu → skl_hoi_xuan_quyet`. Bảng `SKILL_ID_ALIASES` (`packages/shared/src/methods.ts`); `sanitizeMethodMeta` đổi khóa `skillLv` / `skillVar` khi đọc nhân vật (idempotent, khóa mới đã có thì thắng). Không cần đổi bảng DB: cấp và biến thức nằm trong `characters.meta` (JSON); bí tịch là vật phẩm chung (`itm_bi_tich_tan_quyen`), không gắn id chiêu. Hình icon vẫn dùng khóa `icon` cũ.

## Client (tối thiểu)

Pose hiện có theo thời gian mới (không đổi: `hitAt[0]` = `hit[0]` nên hình và sát thương trùng nhịp); phím Q gửi chiêu lướt; ô chiêu đang cường hóa viền vàng nhấp nháy (`.skill.empowered`); mục Lướt trong bảng hướng dẫn. Dịch chuyển lướt hiện là dịch tức thời (đối soát vị trí) kèm FX `dash`; hình lướt mượt để K-4.

## Số đo

- `pnpm sim:progress`: **2,2 giờ** tới Ngưng Khí 15 viên mãn, không đổi (mô phỏng chưa mô hình độ trễ `hitAt`/đánh thường liên hoàn; cân bằng ở 3-10).
- `pnpm bots --count 100 --duration 120` + `pnpm ledger:check`: tick server p95 khoảng 0,7–1 ms lúc bot còn đi lại, lên tới 3–5 ms lúc đám bot giao chiến dày (ngưỡng 25 ms); sổ cái khớp (100 nhân vật, 632 dòng).
- Bot security: thêm 6 ca (lướt khi chưa theo công pháp, spam 30 lệnh lướt chỉ ra một lần, lệnh rác, hủy chiêu bằng lướt dồn dập, lướt ở mép bản đồ). Dev account lưu DB nên chạy lại bộ này cần DB mới (`DB_FILE=...`).
- Soát: `netcode-reviewer` (đã sửa: khóa vòng sạc ult tới đòn trễ cuối, đòn trễ kiểm người còn trong room/chưa bay, lệnh lướt bị chặn vẫn đặt mốc chống dội, lướt xuống vách đứng bị chặn, combo cần power > 0, `hitAt` ≤ GCD, chiêu niệm chưa hỗ trợ combo/empower); `lore-keeper` (đã chỉnh 5 chuỗi).
