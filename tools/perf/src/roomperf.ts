// Điểm chạy riêng của kịch bản `roomperf` (đo ngân sách hiệu năng phòng tập): `pnpm --filter @dtl/perf exec tsx src/roomperf.ts --out <thư mục>`.
import { runScenario } from './lib/scenario';
import roomperf from './scenarios/roomperf';

void runScenario(roomperf);
