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
import calli from './scenarios/calli';
import calli3d from './scenarios/calli3d';
import chrv2 from './scenarios/chrv2';
import calliscreen from './scenarios/calliscreen';
import calliset from './scenarios/calliset';
import clone from './scenarios/clone';
import collwalk from './scenarios/collwalk';
import divuc from './scenarios/divuc';
import dungeon from './scenarios/dungeon';
import flyover from './scenarios/flyover';
import hires from './scenarios/hires';
import lackiem from './scenarios/lackiem';
import thienkhuyet from './scenarios/thienkhuyet';
import bachoang from './scenarios/bachoang';
import doanmach from './scenarios/doanmach';
import vanhai from './scenarios/vanhai';
import quality from './scenarios/quality';
import map from './scenarios/map';
import mons from './scenarios/mons';
import outfit from './scenarios/outfit';
import points from './scenarios/points';
import propstc from './scenarios/propstc';
import quest4 from './scenarios/quest4';
import quest5 from './scenarios/quest5';
import skin from './scenarios/skin';
import thiennhan from './scenarios/thiennhan';
import ngusuy from './scenarios/ngusuy';
import huyenkiep from './scenarios/huyenkiep';
import anhbien from './scenarios/anhbien';
import fly from './scenarios/fly';
import thanpham from './scenarios/thanpham';
import ual from './scenarios/ual';
import chrv3 from './scenarios/chrv3';
import chrv3anim from './scenarios/chrv3anim';
import chrv3feet from './scenarios/chrv3feet';
import v3sets from './scenarios/v3sets';
import v3views from './scenarios/v3views';
import thetu from './scenarios/thetu';
import rigstretch from './scenarios/rigstretch';
import neck from './scenarios/neck';
import skinv3 from './scenarios/skinv3';
import hoatruc from './scenarios/hoatruc';
import thiengiai from './scenarios/thiengiai';
import hudplay from './scenarios/hudplay';
import touch from './scenarios/touch';
import ui from './scenarios/ui';
import minimap from './scenarios/minimap';
import chat from './scenarios/chat';
import vfx from './scenarios/vfx';
import tn1 from './scenarios/tn1';
import vs2 from './scenarios/vs2';
import hontu from './scenarios/hontu';
import realmaura from './scenarios/realmaura';
import fxlib from './scenarios/fxlib';
import xichkhe from './scenarios/xichkhe';
import n7 from './scenarios/n7';
import dungeonart from './scenarios/dungeonart';
import collscan from './scenarios/collscan';

const SCENARIOS: Scenario[] = [
  points,
  collscan,
  propstc,
  calli,
  calli3d,
  lackiem,
  collwalk,
  thienkhuyet,
  bachoang,
  doanmach,
  vanhai,
  map,
  mons,
  dungeon,
  asset,
  vfx,
  tn1,
  vs2,
  hontu,
  outfit,
  skin,
  chrv2,
  ui,
  minimap,
  chat,
  hudplay,
  touch,
  hoatruc,
  thiengiai,
  thiennhan,
  ngusuy,
  huyenkiep,
  anhbien,
  thanpham,
  ual,
  quest4,
  quest5,
  calliscreen,
  calliset,
  clone,
  fly,
  chrv3,
  chrv3anim,
  chrv3feet,
  v3sets,
  n7,
  v3views,
  thetu,
  rigstretch,
  neck,
  skinv3,
  divuc,
  flyover,
  xichkhe,
  dungeonart,
  hires,
  quality,
  realmaura,
  fxlib,
];

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
