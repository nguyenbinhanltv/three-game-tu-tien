// Diễn Võ Trường V3: kiểm NẠP LẠI DỮ LIỆU TỨC THÌ và CHẾ ĐỘ CHỈNH PHÒNG bằng chuột và nút thật.
//   pnpm --filter @dtl/perf exec tsx src/roomedit.ts --out <thư mục> [--query style=dahoa]
// Kịch bản SỬA rồi TRẢ LẠI nguyên văn ba file trong repo (`data/fx/fx_blink.json`, `data/poses/kiem_khi_tram.json`, `props.dienvo.layout.json`); dừng giữa chừng thì
// kiểm `git status` hai file đó. Giữ khóa trình duyệt khi chạy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { sleep } from '../lib/devserver';
import { opt } from '../lib/env';
import { gm, monsters, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FX = path.join(ROOT, 'packages/content/data/fx/fx_blink.json');
const LAYOUT = path.join(ROOT, 'packages/shared/src/props.dienvo.layout.json');
const POSE = path.join(ROOT, 'packages/content/data/poses/kiem_khi_tram.json');

interface Layout {
  props: { id: string; x: number; z: number; yaw: number; s: number; r?: number }[];
  spawns: { arena: { x: number; z: number }[]; boss: { x: number; z: number }[] };
}
interface EdState {
  on: boolean;
  dirty: boolean;
  props: number;
  undo: number;
  sel: { kind: string; i: number } | null;
  msg: { key: string } | null;
}
interface Ed {
  state(): EdState;
  layout(): Layout;
  select(s: unknown): void;
  moveSel(x: number, z: number): boolean;
  ghostInfo(): { dx: number; dz: number; ready: number } | null;
}
interface HotEntry {
  ok: boolean;
  kind: string | null;
  path: string;
  id?: string;
  note?: string;
}
type W = Window & { __labEdit?: { editor(): Ed | null; hot(): HotEntry[] }; __mark?: number };

const ed = <T>(pg: Page, fn: (e: Ed) => T): Promise<T> =>
  pg.evaluate((src) => {
    const e = (window as W).__labEdit?.editor();
    if (!e) throw new Error('chưa có __labEdit.editor()');
    return (0, eval)(`(${src})`)(e) as T;
  }, fn.toString());
const hot = (pg: Page) => pg.evaluate(() => (window as W).__labEdit?.hot() ?? []);
const waitFor = async (what: string, fn: () => Promise<boolean>, ms = 8000): Promise<boolean> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(120);
  }
  console.log(`[roomedit] HẾT GIỜ chờ: ${what}`);
  return false;
};
/** Tọa độ màn hình của một điểm trên sàn. */
const screenOf = (pg: Page, x: number, z: number) =>
  pg.evaluate(
    ([wx, wz]) => {
      const g = window.__game as unknown as {
        camera: { position: { constructor: new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } } } };
        canvas: HTMLCanvasElement;
        me(): { y: number } | undefined;
      };
      const v = new g.camera.position.constructor(wx!, (g.me()?.y ?? 0) + 0.1, wz!).project(g.camera);
      const r = g.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, z],
  );

export default {
  name: 'roomedit',
  desc: 'Diễn Võ Trường V3: nạp lại dữ liệu tức thì (fx, bố cục) và chế độ chỉnh phòng (kéo thả, lưu file, server nhận điểm gọi quái)',
  usage: '[--query style=dahoa]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const fx0 = fs.readFileSync(FX, 'utf8');
    const layout0 = fs.readFileSync(LAYOUT, 'utf8');
    const pose0 = fs.readFileSync(POSE, 'utf8');
    const checks: { name: string; ok: boolean; note?: string }[] = [];
    const check = (name: string, ok: boolean, note?: string) => {
      checks.push({ name, ok, note });
      console.log(`[roomedit] ${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${note ? ` (${note})` : ''}`);
    };
    try {
      const { page: pg } = await r.open({
        name: 'RoomEdit',
        quality: 'high',
        viewport: [1280, 720],
        query: { cam: 'iso', quiet: 1 },
        extra: opt('--query', ''),
        seenIntro: true,
      });
      await skipCutscene(pg, 20);
      await gm(pg, 'dvt');
      await waitLevel(pg, 'dien_vo');
      await gm(pg, 'scene soi_thuong', 3500);
      // Dấu trên window: trang bị tải lại thì dấu mất.
      await pg.evaluate(() => void ((window as W).__mark = 1));
      const alive = () => pg.evaluate(() => (window as W).__mark === 1);
      check('có cổng __labEdit (bản dev)', await pg.evaluate(() => !!(window as W).__labEdit));

      // ---- 1. Nạp lại tức thì: sửa một timeline fx ----
      const fx = JSON.parse(fx0) as { palette?: string };
      fs.writeFileSync(FX, JSON.stringify({ ...fx, palette: 'loi' }, null, 1));
      const gotFx = await waitFor('fx nóng', async () => (await hot(pg)).some((e) => e.kind === 'fx' && e.id === 'fx_blink' && e.ok));
      check('sửa fx_blink.json: trang nhận và vá tại chỗ', gotFx, JSON.stringify((await hot(pg))[0] ?? null));
      check('…không tải lại trang, vẫn ở trong phòng', (await alive()) && (await pg.evaluate(() => window.__game?.shownLevel)) === 'dien_vo');
      await sleep(250);
      await snap(pg, r.out, 'hot-1-fx-phat-lai.png');
      // JSON hỏng (ghi dở): giữ bản cũ, báo lỗi, không tải lại.
      fs.writeFileSync(FX, '{"skill": "fx_blink", "events": [');
      const gotBad = await waitFor('fx hỏng', async () => (await hot(pg))[0]?.ok === false);
      check('JSON hỏng: báo lỗi, giữ bản cũ, không tải lại', gotBad && (await alive()), (await hot(pg))[0]?.note?.slice(0, 60));
      fs.writeFileSync(FX, fx0);
      const n0 = (await hot(pg)).length;
      await waitFor('fx trả lại', async () => (await hot(pg)).length > n0 && (await hot(pg))[0]!.ok);

      // Pose chiêu (có `hit`): vá tại chỗ, client quên clip đã nướng, server không khởi động lại (các bước sau vẫn gửi được lệnh GM).
      const pose = JSON.parse(pose0) as { hit: number[] };
      fs.writeFileSync(POSE, JSON.stringify({ ...pose, hit: [pose.hit[0]! + 0.02, ...pose.hit.slice(1)] }, null, 2));
      const gotPose = await waitFor('pose nóng', async () => (await hot(pg)).some((e) => e.kind === 'pose' && e.id === 'kiem_khi_tram' && e.ok));
      check('sửa pose chiêu kiem_khi_tram.json: vá tại chỗ, không tải lại trang', gotPose && (await alive()), JSON.stringify((await hot(pg))[0] ?? null));
      const n9 = (await hot(pg)).length;
      fs.writeFileSync(POSE, pose0);
      await waitFor('pose trả lại', async () => (await hot(pg)).length > n9);

      // ---- 2. Chế độ chỉnh phòng ----
      await pg.keyboard.press('F4');
      await pg.waitForSelector('.lab-edit-float [data-act="toggle"]', { timeout: 8000 });
      await pg.click('.lab-edit-float [data-act="toggle"]');
      check('F4 mở bảng, bật chỉnh phòng', await ed(pg, (e) => e.state().on));
      await sleep(300);
      await snap(pg, r.out, 'edit-1-bat.png');

      // Thêm một đạo cụ bằng nút (hiện cách nhân vật 2,5 m về phía trên màn hình) rồi kéo nó sang phải 3 m, lên 1 m bằng chuột thật.
      const before = await ed(pg, (e) => e.layout());
      await pg.click('.lab-edit-float [data-act="addProp"]');
      await sleep(600);
      const added = await ed(pg, (e) => e.layout());
      const idx = added.props.length - 1;
      const from = added.props[idx]!;
      check('thêm đạo cụ bằng nút', added.props.length === before.props.length + 1 && from.id === 'prop_da_dung', JSON.stringify(from));
      const to = { x: from.x + 3, z: from.z - 1 };
      const a = await screenOf(pg, from.x, from.z);
      const b = await screenOf(pg, to.x, to.z);
      await pg.mouse.move(a.x, a.y);
      await pg.mouse.down();
      await pg.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await pg.mouse.move(b.x, b.y, { steps: 4 });
      // Đang giữ chuột: đạo cụ THẬT (lớp xem trước) phải chạy theo, không chỉ vòng tay nắm.
      await waitFor('bản xem trước nạp', async () => ((await ed(pg, (e) => e.ghostInfo()))?.ready ?? 0) > 0, 5000);
      const gh = await ed(pg, (e) => e.ghostInfo());
      // Bản xem trước phải nằm ĐÚNG chỗ đạo cụ đang kéo trong bản làm việc (phép chiếu chuột → sàn của kịch bản chỉ gần đúng, nên so với bố cục).
      const mid = (await ed(pg, (e) => e.layout())).props[idx]!;
      check(
        'đang kéo: bản xem trước thật chạy theo chuột',
        !!gh && gh.ready > 0 && Math.abs(gh.dx - (mid.x - from.x)) < 0.01 && Math.abs(gh.dz - (mid.z - from.z)) < 0.01 && Math.abs(gh.dx) > 2,
        JSON.stringify(gh),
      );
      await snap(pg, r.out, 'edit-2a-dang-keo.png');
      await pg.mouse.up();
      await sleep(900);
      const moved = (await ed(pg, (e) => e.layout())).props[idx];
      check(
        'kéo thả đạo cụ bằng chuột (bám lưới 0,25 m)',
        !!moved && Math.abs(moved.x - to.x) <= 0.6 && Math.abs(moved.z - to.z) <= 0.6 && moved.x % 0.25 === 0 && moved.z % 0.25 === 0,
        JSON.stringify(moved),
      );
      const st1 = await ed(pg, (e) => e.state());
      check('có thay đổi chưa lưu + hai bước hoàn tác', st1.dirty && st1.undo === 2 && st1.sel?.i === idx);
      // Lăn chuột: xoay 15° mỗi nấc.
      await pg.mouse.wheel(0, 100);
      await pg.mouse.wheel(0, 100);
      await sleep(700);
      const yaw = (await ed(pg, (e) => e.layout())).props[idx]!.yaw;
      check('lăn chuột xoay đạo cụ đang chọn 2 × 15°', Math.abs(yaw - (from.yaw + Math.PI / 6)) < 0.01, `yaw ${yaw}`);
      await snap(pg, r.out, 'edit-2-keo-xoay.png');
      // Thêm đèn và điểm gọi quái bằng nút.
      await pg.click('.lab-edit-float [data-act="addLamp"]');
      await pg.click('.lab-edit-float [data-act="addArena"]');
      await ed(pg, (e) => e.moveSel(1296, 983));
      await sleep(900);
      const l2 = await ed(pg, (e) => e.layout());
      check(
        'thêm đèn đá và điểm gọi quái bằng nút',
        l2.props.length === before.props.length + 2 && l2.spawns.arena.length === 1 && l2.spawns.arena[0]!.x === 1296,
        JSON.stringify(l2.spawns),
      );
      await snap(pg, r.out, 'edit-3-them-den-diem-goi.png');
      // Hoàn tác bằng Ctrl+Z rồi làm lại bằng nút.
      await pg.keyboard.press('Control+z');
      check('Ctrl+Z hoàn tác bước cuối', (await ed(pg, (e) => e.layout())).spawns.arena[0]!.x !== 1296);
      await ed(pg, (e) => {
        e.select({ kind: 'spawn', zone: 'arena', i: 0 });
        return e.moveSel(1296, 983);
      });

      // ---- 3. Lưu vào file, server tự nạp ----
      await pg.click('.lab-edit-float [data-act="save"]');
      const saved = await waitFor('lưu', async () => (await ed(pg, (e) => e.state())).msg?.key === 'ui.gm.lab.edit.msg.saved');
      const disk = JSON.parse(fs.readFileSync(LAYOUT, 'utf8')) as Layout;
      check('Lưu: file bố cục trên đĩa đổi đúng', saved && disk.spawns.arena[0]?.x === 1296 && disk.props.length === before.props.length + 2);
      await sleep(600);
      check('…bảng báo khớp với file, trang không tải lại', !(await ed(pg, (e) => e.state())).dirty && (await alive()));
      // Server (devReload) đã đọc lại file: quái gọi ra đứng đúng điểm gọi vừa đặt.
      await pg.click('.lab-edit-float [data-act="toggle"]');
      await gm(pg, 'labreset', 1500);
      await gm(pg, 'freeze', 900);
      await gm(pg, 'spawn mon_soi_xam 1', 1800);
      const mons = await monsters(pg);
      const at = mons[0] as unknown as { x: number; z: number } | undefined;
      check(
        'server nhận điểm gọi quái: quái đứng ở (1296, 983)',
        !!at && Math.hypot(at.x - 1296, at.z - 983) < 0.6,
        at ? `(${at.x.toFixed(1)}, ${at.z.toFixed(1)})` : 'không có quái',
      );
      await snap(pg, r.out, 'edit-4-sau-luu-quai-o-diem-goi.png');

      // ---- 4. Sửa tay file bố cục (trả về bản gốc): phòng dựng lại, không tải lại ----
      const n1 = (await hot(pg)).length;
      fs.writeFileSync(LAYOUT, layout0);
      const back = await waitFor('bố cục gốc', async () => (await hot(pg)).length > n1 && (await hot(pg))[0]!.kind === 'layout');
      await sleep(1200);
      const l3 = await ed(pg, (e) => e.layout());
      check(
        'sửa tay file bố cục: phòng nhận bản trên đĩa, không tải lại',
        back && JSON.stringify(l3) === JSON.stringify(JSON.parse(layout0)) && (await alive()),
      );
      await gm(pg, 'labreset', 1500);
      // `labreset` bỏ đóng băng: bật lại, không thì quái chạy tới đánh trước khi kịp đo chỗ đứng.
      await gm(pg, 'freeze', 900);
      await gm(pg, 'spawn mon_soi_xam 1', 1800);
      const at2 = (await monsters(pg))[0] as unknown as { x: number; z: number } | undefined;
      check('server về lại chỗ gọi mặc định (tâm sàn đấu)', !!at2 && Math.hypot(at2.x - 1300, at2.z - 985) < 0.6);
      await snap(pg, r.out, 'edit-5-ve-goc.png');
      check('không lỗi console', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
    } finally {
      // Luôn trả nguyên văn hai file của repo.
      if (fs.readFileSync(FX, 'utf8') !== fx0) fs.writeFileSync(FX, fx0);
      if (fs.readFileSync(LAYOUT, 'utf8') !== layout0) fs.writeFileSync(LAYOUT, layout0);
      if (fs.readFileSync(POSE, 'utf8') !== pose0) fs.writeFileSync(POSE, pose0);
      writeJson(r.out, 'roomedit.json', { checks, pass: checks.filter((c) => c.ok).length, total: checks.length });
      console.log(`[roomedit] ${checks.filter((c) => c.ok).length}/${checks.length} mục đạt`);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
    }
  },
} satisfies Scenario;
