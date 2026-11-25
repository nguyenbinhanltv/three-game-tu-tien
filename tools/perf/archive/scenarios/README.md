# tools/perf/archive/scenarios

Kịch bản `pnpm shots` đã rút khỏi `src/scenarios/` (Đợt C): `hires` (so ảnh bậc texture tải dần, trang viewer `?show=<id>`) và `quality` (đo preset đồ họa). Không import từ đâu khác; nằm ngoài `src` nên không vào typecheck/lint.

Chạy lại: `git mv tools/perf/archive/scenarios/<tên>.ts tools/perf/src/scenarios/`, thêm `import <tên> from './scenarios/<tên>';` và tên vào mảng `SCENARIOS` trong `tools/perf/src/shots.ts`, rồi `pnpm shots <tên>`.
