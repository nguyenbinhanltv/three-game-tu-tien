# tools/perf/archive/scenarios

Kịch bản `pnpm shots` đã rút khỏi `src/scenarios/` (Đợt C): `hires` (so ảnh bậc texture tải dần, trang viewer `?show=<id>`) và `quality` (đo preset đồ họa). Không import từ đâu khác; nằm ngoài `src` nên không vào typecheck/lint.

Chạy lại: `git mv tools/perf/archive/scenarios/<tên>.ts tools/perf/src/scenarios/`, thêm `import <tên> from './scenarios/<tên>';` và tên vào mảng `SCENARIOS` trong `tools/perf/src/shots.ts`, rồi `pnpm shots <tên>`.

Đợt V4 nhóm A (28/11/2026, người dùng duyệt): thêm 12 kịch bản không còn sổ tay, skill hay script nào dẫn tới, đều phục vụ các đợt đã merge — `densefade`, `densefly`, `densep00`, `flybench` (mật độ cỏ, bay), `hpl2ms` (đo HPL2, dùng `?vfxlab`), `isoplay`, `isoquest` (Thiên Nhãn), `path2428vfx`, `tp2` (Thân Pháp 2, dùng `?animlab`), `ual`, `uichecks`, `vista`. Chạy lại theo cách ở trên.

V4 nhóm D (28/11/2026): `pathaura` (ảnh trước/sau của hào quang riêng theo hướng tu) vào đây khi cờ `?pathaura` bị gỡ; chế độ "trước" của nó không còn chạy được.
