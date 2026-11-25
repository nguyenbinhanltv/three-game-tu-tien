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
import collwalk from './scenarios/collwalk';
import daotuhit from './scenarios/daotuhit';
import clothcheck from './scenarios/clothcheck';
import herocheck from './scenarios/herocheck';
import herolight from './scenarios/herolight';
import bossfaces from './scenarios/bossfaces';
import dungeon from './scenarios/dungeon';
import lackiem from './scenarios/lackiem';
import painted from './scenarios/painted';
import paintedvista from './scenarios/paintedvista';
import tieucanh from './scenarios/tieucanh';
import thienkhuyet from './scenarios/thienkhuyet';
import bachoang from './scenarios/bachoang';
import lvlchain from './scenarios/lvlchain';
import vandinh from './scenarios/vandinh';
import cuukieu from './scenarios/cuukieu';
import isoquest from './scenarios/isoquest';
import isoplay from './scenarios/isoplay';
import kieu from './scenarios/kieu';
import doanmach from './scenarios/doanmach';
import vanhai from './scenarios/vanhai';
import map from './scenarios/map';
import mons from './scenarios/mons';
import camiso from './scenarios/camiso';
import densefly from './scenarios/densefly';
import densep00 from './scenarios/densep00';
import densefade from './scenarios/densefade';
import vista from './scenarios/vista';
import terrainflow from './scenarios/terrainflow';
import points from './scenarios/points';
import propstc from './scenarios/propstc';
import huyenkiep from './scenarios/huyenkiep';
import kiepch6 from './scenarios/kiepch6';
import ual from './scenarios/ual';
import chrv3 from './scenarios/chrv3';
import chrv3anim from './scenarios/chrv3anim';
import chrv3feet from './scenarios/chrv3feet';
import v3sets from './scenarios/v3sets';
import v3views from './scenarios/v3views';
import thetu from './scenarios/thetu';
import loitu from './scenarios/loitu';
import loivfx from './scenarios/loivfx';
import cothan from './scenarios/cothan';
import cothanvfx from './scenarios/cothanvfx';
import daotu from './scenarios/daotu';
import cotu from './scenarios/cotu';
import camchevfx from './scenarios/camchevfx';
import animlab from './scenarios/animlab';
import vfxlab from './scenarios/vfxlab';
import vfxmon from './scenarios/vfxmon';
import path2428vfx from './scenarios/path2428vfx';
import pathaura from './scenarios/pathaura';
import camche from './scenarios/camche';
import rigstretch from './scenarios/rigstretch';
import neck from './scenarios/neck';
import skinv3 from './scenarios/skinv3';
import hoatruc from './scenarios/hoatruc';
import thiengiai from './scenarios/thiengiai';
import hudplay from './scenarios/hudplay';
import touch from './scenarios/touch';
import ui from './scenarios/ui';
import minimap from './scenarios/minimap';
import vfx from './scenarios/vfx';
import uichecks from './scenarios/uichecks';
import vs2 from './scenarios/vs2';
import hontu from './scenarios/hontu';
import realmaura from './scenarios/realmaura';
import fxlib from './scenarios/fxlib';
import xichkhe from './scenarios/xichkhe';
import dye23 from './scenarios/dye23';
import silk from './scenarios/silk';
import dungeonart from './scenarios/dungeonart';
import collscan from './scenarios/collscan';

const SCENARIOS: Scenario[] = [
  camiso,
  densefly,
  densep00,
  densefade,
  vista,
  terrainflow,
  points,
  collscan,
  propstc,
  lackiem,
  painted,
  paintedvista,
  tieucanh,
  collwalk,
  thienkhuyet,
  bachoang,
  lvlchain,
  vandinh,
  cuukieu,
  kieu,
  isoplay,
  isoquest,
  doanmach,
  vanhai,
  map,
  mons,
  bossfaces,
  dungeon,
  asset,
  vfx,
  uichecks,
  vs2,
  hontu,
  ui,
  minimap,
  hudplay,
  touch,
  hoatruc,
  thiengiai,
  huyenkiep,
  kiepch6,
  ual,
  chrv3,
  chrv3anim,
  chrv3feet,
  v3sets,
  dye23,
  silk,
  v3views,
  thetu,
  loitu,
  loivfx,
  daotu,
  cotu,
  camchevfx,
  animlab,
  vfxlab,
  vfxmon,
  path2428vfx,
  pathaura,
  camche,
  cothan,
  cothanvfx,
  rigstretch,
  neck,
  skinv3,
  daotuhit,
  clothcheck,
  herocheck,
  herolight,
  xichkhe,
  dungeonart,
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
