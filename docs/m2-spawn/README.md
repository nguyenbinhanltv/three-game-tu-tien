# M-2: bãi quái theo cụm, hồi sinh theo số người, giờ hồi sinh tinh anh/boss, AOI

Bước M-2 của kế hoạch bản đồ và minimap (mục 3.2). Dữ liệu bãi (`camps` trong `levels/van_lam.json`) từ M-1 giữ nguyên; M-2 đổi cách server dùng nó và cách đồng bộ.

## 1. Cụm quái (`apps/server/src/game/camps.ts`, luật số ở `packages/shared/src/spawnrules.ts`)

- Mỗi bãi (`CampDef`) là một **cụm**: `count` con thường (3–4) đứng đều trên một vòng quanh tâm (bán kính vòng ≈ 40% bán kính bãi, 4–9 m, góc đầu cố định theo id bãi); nếu có `ranged` thì con đánh xa đứng phía sau gần tâm. Điểm nhà (leash) của mỗi con là chỗ đứng của nó, nên sau khi kéo đi quái về đúng đội hình.
- Một con bị đánh thì đồng bọn rảnh trong 14 m cùng lao vào (`aggroMonster`, một tầng).
- **Tái sinh cả cụm**: chỉ khi mọi con đã chết mới hẹn giờ (`CampSystem.onKill`); tới giờ cả cụm hồi sinh cùng lúc đúng đội hình. Quái trong bãi không còn hồi sinh lẻ.
- **Theo số người trong vùng** (`campRespawnSec`, `campMeleeCount`): hồi sinh `min(respawn dữ liệu, 25) / (1 + 0,1·(n−1))` giây, kẹp **12–25 s**; số con thường tăng dần theo `n` tới **×1,5 số con gốc** (làm tròn xuống; đủ 10 người thì tối đa, 3→4, 4→6). Cụm vắng người lại thì tái sinh về số gốc, con thừa bị gỡ khỏi thế giới. `n` = người **đang kết nối, còn sống, có input hoặc giao chiến trong 30 s** ở cùng vùng (`zoneAt`), nên người "ma" hay treo máy không kéo số con.
- Tinh anh và boss đứng lẻ (`spawns`) giữ đường hồi sinh riêng như trước.

## 2. Giờ hồi sinh tinh anh/boss (tin `S.BOSS_TIMERS` = `'btm'`, `BossTimerMsg` ở `packages/shared/src/protocol.ts`)

```ts
interface BossTimerMsg { now: number; list: BossTimer[] }          // now = giờ server (ms) lúc gửi
interface BossTimer { id: string; t: string; x: number; z: number; lv: number; at: number }
//   id: id thực thể quái (ổn định qua các lần hồi sinh)   t: id loại quái (elite_*, boss_*)
//   x, z: ĐIỂM NHÀ (làm tròn m), không phải vị trí đang đi   lv: cấp hiện tại
//   at: giờ server (ms) hồi sinh; 0 = đang sống
```

- Gửi cho người mới vào (ngay lúc `onJoin`) và cho cả phòng mỗi khi một tinh anh/boss chết hoặc hồi sinh. Không phụ thuộc AOI: có đủ mọi tinh anh/boss của bản đồ.
- Client lưu ở `useUI.getState().bossTimers = { ...msg, off }` (`off = Date.now() − now`; giờ máy = `at + off`) và **nối vào móc của minimap M-3**: `minimapHooks.bossRespawnAt.set(<id loại boss>, at + off)` (xóa khi boss sống). Minimap (`ui/minimap/marks.ts`) vẽ tinh anh/boss ở xa (ngoài AOI) từ danh sách này; con đang trong tầm vẫn vẽ từ state.
- Bóng Tâm Ma và quái do GM sinh không có trong danh sách.

## 3. AOI (`apps/server/src/aoi.ts`)

- Colyseus `StateView` **mức trường**: mọi trường của `PlayerS` và `MonS` có `@view()` (`state.ts`); mỗi client có `client.view`, `Aoi.update` (mỗi 200 ms, và một lần lúc vào) `view.add/remove` thực thể theo khoảng cách: vào ≤ **160 m**, ra > **190 m** (độ trễ chống nhấp nháy); boss 300/330 m (client vẽ boss tới ~280 m; quái thường tới 125 m). Luôn thấy: chính mình, đồng đội cùng tổ đội, đối thủ tỉ thí, bóng Tâm Ma của mình.
- Tin hiệu ứng/sát thương (`FX`, `DMG`, `HAZARD`, `BOLT`, `BOLT_END`) qua `Sim.emit`: chỉ gửi người trong 190 m quanh điểm xảy ra (330 m nếu có boss), cộng người có tên trong tin (`host.broadcastExcept`, mã hóa một lần). Tin toàn phòng cố ý: `sys.boss_*`, chat, `BOSS_TIMERS`.
- **Vì sao không dùng `@view` ở mức collection**: thử trước, nhưng client `colyseus.js 0.16.22` / `@colyseus/schema 3.0.76` giải mã lỗi `"refId" not found` và `RangeError: Maximum call stack` khi thực thể vào/ra tầm dồn dập (bot rải ở 3 vùng sập sau vài chục giây), và `state.monsters` còn `undefined` khi chưa thấy con nào. Mức trường ổn định (0 lỗi trong 4 lượt × 100 bot).
- **Đánh đổi (ghi rõ)**: hai collection vẫn hiển thị với mọi client, nên client ngoài tầm thấy **khóa** (id quái `m<n>`, sessionId) và **số lượng** thực thể, với bản ghi rỗng (`MonS.t` / `PlayerS.name` rỗng); **không** thấy vị trí, máu, loại, tên, cờ, cấp. Client che bản ghi rỗng cho gọn (`apps/client/src/game/aoiView.ts`, `visibleMon`, `visiblePlayer`); bảo mật không dựa vào bước này. Suy luận còn lại: số quái tăng khi cụm đẻ ×1,5 (có đám đông ở đâu đó), khóa `m*` biến mất sau 4 s là bóng Tâm Ma, khóa sessionId thêm/xóa là có người vào/ra. Muốn kín hơn nữa: id không đoán được và để bóng Tâm Ma ngoài state chung, hoặc dùng `@view` mức collection khi nâng bản schema.
- Server vẫn phán định trên thế giới đầy đủ (nhắm, AoE, tổ đội, boss, hồi sinh chiêu); AOI không đổi luật K-2.
- `Aoi.update` là O(người × quái) mỗi 200 ms (≈ 25k phép với 50 người, 500 quái), nên dùng vòng lặp thẳng chứ chưa cần lưới ô.

## 4. Số đo

Đo bằng `pnpm bots` 3 nhóm rải ở thung lũng / rừng / hồ (100 bot cấp 12, `--fight --tp`, 130 s, 2 kênh), A/B với `main` xen kẽ 2 lượt, cùng máy:

| | main | M-2 |
| --- | --- | --- |
| băng thông nhận mỗi bot | 81,5 / 81,4 KB/s | **19,4 / 19,3 KB/s** (−76%) |
| tick server p95 (trung vị các mẫu) | 7,2 / 5,9 ms (max 10,7) | **3,4 / 4,8 ms** (max 5,9) |
| lỗi giải mã | 0 | 0 |

Bench client A/B (CPU p95 rừng/hồ high) và các kiểm khác: xem mô tả PR.

## 5. Kiểm và công cụ

- Test: `packages/shared/src/spawnrules.test.ts`, `apps/server/src/game/camps.test.ts` (cụm, đội hình, tái sinh cả cụm, theo số người, người "ma", hỗ trợ aggro, giờ hồi sinh, AOI, tin ở xa), `apps/client/src/game/aoiView.test.ts`.
- `pnpm --filter @dtl/bot-client security`: thêm 7 ca AOI (chỉ nhận quái trong tầm, ít hơn nửa tổng, không thấy người xa, vẫn đánh được, lệnh nhắm quái ngoài tầm, nối lại sau mất kết nối không lỗi `refId`, tới gần thì thấy nhau). Nhân vật thử lưu DB nên chạy lại cần `DB_FILE=` mới.
- `pnpm bots` in thêm băng thông nhận (KB/s mỗi bot) mỗi 10 s.
- `pnpm map:report`: phủ ≤ 35 m trong vùng săn 99,6%, 0 chỗ kẹt (dữ liệu bãi không đổi).
