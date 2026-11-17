// pnpm shots <kịch bản> --out <thư mục> [tham số riêng]: một lệnh cho mọi kịch bản chụp ảnh/quay video kiểm thử.
//   pnpm shots --list                 liệt kê kịch bản
//   pnpm shots <kịch bản> --help      tham số của kịch bản
//   pnpm shots --out <thư mục> …      không ghi tên = kịch bản `points` (ảnh cảnh cố định, như lệnh cũ)
// Chung cho mọi kịch bản: --out (tương đối thì tính từ nơi gõ lệnh), --renderer webgpu|webgl2; cổng PORT/CLIENT_PORT
// (mặc định 2675/5175). Khung tự chạy `pnpm dev` với DB tạm, mở Chrome tắt tiếng (?mute=1, --mute-audio), tự tắt server.
// Thêm kịch bản: tạo `scenarios/<tên>.ts` export default một `Scenario` rồi thêm vào bảng dưới (xem `lib/scenario.ts`).
import { args, flag } from './lib/env';
import { runScenario, type Scenario } from './lib/scenario';
import asset from './scenarios/asset';
import chrv2 from './scenarios/chrv2';
import dungeon from './scenarios/dungeon';
import map from './scenarios/map';
import mons from './scenarios/mons';
import outfit from './scenarios/outfit';
import points from './scenarios/points';
import thiennhan from './scenarios/thiennhan';
import ual from './scenarios/ual';
import ui from './scenarios/ui';
import vfx from './scenarios/vfx';

const SCENARIOS: Scenario[] = [points, map, mons, dungeon, asset, vfx, outfit, chrv2, ui, thiennhan, ual];

const name = args[0] && !args[0].startsWith('--') ? args[0] : 'points';
const sc = SCENARIOS.find((s) => s.name === name);
if (flag('--list') || !sc) {
  if (!sc) console.error(`không có kịch bản "${name}"\n`);
  console.log('Kịch bản (pnpm shots <tên> --out <thư mục>):\n' + SCENARIOS.map((s) => `  ${s.name.padEnd(8)} ${s.desc}`).join('\n'));
  process.exitCode = sc ? 0 : 1;
} else if (flag('--help')) {
  console.log(`pnpm shots ${sc.name} --out <thư mục> [--renderer webgpu|webgl2] ${sc.usage ?? ''}\n  ${sc.desc}`);
} else {
  await runScenario(sc);
}
