// Điểm chạy riêng của kịch bản `zonecheck` (vạch báo so với vùng trúng thật): `pnpm --filter @dtl/perf exec tsx src/zonecheck.ts --out <thư mục>`.
import { runScenario } from './lib/scenario';
import zonecheck from './scenarios/zonecheck';

void runScenario(zonecheck);
