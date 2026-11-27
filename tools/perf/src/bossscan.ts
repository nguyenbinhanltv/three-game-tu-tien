// Điểm chạy riêng của kịch bản `bossscan` (quét boss theo từng pha): `pnpm --filter @dtl/perf exec tsx src/bossscan.ts --out <thư mục>`.
import { runScenario } from './lib/scenario';
import bossscan from './scenarios/bossscan';

void runScenario(bossscan);
