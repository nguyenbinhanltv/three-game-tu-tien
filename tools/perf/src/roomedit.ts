// Điểm chạy riêng của kịch bản `roomedit` (Diễn Võ Trường V3): `pnpm --filter @dtl/perf exec tsx src/roomedit.ts --out <thư mục>`.
import { runScenario } from './lib/scenario';
import roomedit from './scenarios/roomedit';

void runScenario(roomedit);
