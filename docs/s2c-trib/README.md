# S2-C: tân thủ, độ kiếp ba pha, đặc quyền Trúc Cơ

Ảnh chụp bằng `pnpm shots:trib --out <thư mục tuyệt đối>` (GPU thật, tắt tiếng, `/gm trib` với `god`).

| Ảnh | Nội dung |
| --- | --- |
| `1-pha1-loi-van` | Pha 1 (0–12 s): tia nhắm + 1 tia rơi quanh, thưa |
| `2-pha2-loi-vong-*-tren-xuong` | Pha 2 (12–28 s): lôi võng, 3 vạch song song (chuỗi vòng sét) cắt qua chỗ đứng, báo trước 1 s |
| `3a/3b/3c` | Pha 3 (28–40 s): tia cuối khóa mệnh (báo 3 s, 70% máu), rồi mưa sét dồn |
| `4-nghi-thuc-ngu-kiem` | Thẻ chương "Ngự kiếm" lần đầu bay |

Luật: `packages/shared/src/formulas.ts` (`TRIB_*`), server `tickTribulation`/`tribNet` ở `apps/server/src/game/sim.ts`, test `apps/server/src/game/trib.test.ts`.
Phát hiện: `sigil` gộp `InstancedMesh` chỉ vẽ ra một pháp trận khi có nhiều cái cùng lúc (dữ liệu instance đúng; `?batch=0` vẽ đủ); đã bỏ `sigil` khỏi `BATCH_KINDS`, nguyên nhân gốc chưa tìm ra.
