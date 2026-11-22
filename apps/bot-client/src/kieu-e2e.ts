// Kiểm tay TN-7 qua Colyseus thật: vào Thiên Lộ Giới → xin vé ở Dẫn Kiều Nhân → vào room phòng cầu → (cầu 1) /gm killall từng đợt,
// (cầu 2) hạ Kiếm Ảnh → ghi `char.kieu` và về Kiều Đầu. Dùng `/gm god on` để bot không chết; đóng góp được đếm khi quái có tên bot trong threat,
// `/gm killall` hạ quái qua đường sát thương thật nên tính là đóng góp.
// Chạy: PORT=2793 pnpm --filter @dtl/bot-client exec tsx src/kieu-e2e.ts [1|2|3|5|6|7|8|9]   (server dev có AUTH_DEV_BYPASS=1)
import { Client, type Room } from 'colyseus.js';
import { C, ROOM_WORLD, S, type TransferMsg } from '@dtl/shared';
import { runSuyBot } from './suy-bot';
import { runHkBot } from './hk-bot';

const PORT = process.env.PORT ?? '2793';
const WS = `ws://localhost:${PORT}`;
const n = Number(process.argv[2] ?? '1');
const tag = Date.now().toString(36).slice(-4);
const name = `kv${tag}`;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface View {
  sys: string[];
  transfer: TransferMsg | null;
  mons: Map<string, { x: number; z: number; hp: number; st: number }>;
  me: { x: number; z: number } | null;
  kieu: number;
}

function watch(r: Room): View {
  const v: View = { sys: [], transfer: null, mons: new Map(), me: null, kieu: -1 };
  r.onMessage(S.SYS, (m: { k: string }) => v.sys.push(m.k));
  r.onMessage(S.TRANSFER, (m: TransferMsg) => (v.transfer = m));
  r.onMessage(S.CHAR, (m: { kieu?: number }) => {
    if (typeof m.kieu === 'number') v.kieu = m.kieu;
  });
  r.onMessage('*', () => {});
  return v;
}

const until = async (f: () => boolean, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('hết giờ chờ: ' + what);
    await sleep(100);
  }
};

async function main() {
  const client = new Client(WS);
  let r = await client.joinOrCreate(ROOM_WORLD, { dev: name });
  let v = watch(r);
  const gm = async (cmd: string) => {
    r.send(C.CHAT, { m: '/gm ' + cmd });
    await sleep(1300);
  };
  await gm('level 44');
  await gm('god on');
  if (n > 1) await gm(`kieu ${n - 1}`);
  await gm(n >= 7 ? 'level 46' : 'level 45');
  await gm('tp ck_tram');
  await until(() => v.transfer !== null, 8000, 'chuyển sang Thiên Lộ Giới').catch((e) => {
    console.log('sys:', v.sys.join(','));
    throw e;
  });
  let t = v.transfer!;
  await r.leave(true);
  r = await client.joinOrCreate(t.room, { dev: name, ...t.options });
  v = watch(r);
  log('ở', r.name);
  await gm('tp 1024 1492'); // cạnh Dẫn Kiều Nhân
  r.send(C.KIEU, { n });
  await until(() => v.transfer !== null, 8000, 'vé vào cầu ' + n);
  t = v.transfer!;
  log('vé:', JSON.stringify(t));
  if (t.level !== `kieu_${n}`) throw new Error('sai level vé: ' + t.level);
  await r.leave(true);
  r = await client.joinOrCreate(t.room, { dev: name, ...t.options });
  v = watch(r);
  log('vào room', r.name, 'sys:', v.sys.join(','));
  if (n === 3 || n >= 7) {
    // Cầu kiếp chuỗi: bot tự chơi (cầu 3: năm ải Ngũ Suy, suy-bot.ts; cầu 7–9: ba kiếp nhỏ Huyền Kiếp, hk-bot.ts), server ghi cầu khi chuỗi qua trọn vẹn.
    await gm('god on');
    const bot = n === 3 ? runSuyBot(r, r.sessionId) : runHkBot(r, r.sessionId);
    await until(() => v.sys.includes('sys.kieu_clear'), 260_000, 'qua đủ năm ải Ngũ Suy').catch((e) => {
      console.log('sys:', v.sys.join(','), '| ngũ suy:', bot.seen.join(','), JSON.stringify(bot.peak));
      throw e;
    });
    bot.stop();
    log('XONG cầu', n, '; ải đã thấy', bot.seen.join(','));
    process.exit(0);
  }
  // chờ đợt đầu sinh quái; `/gm killall` hạ quái quanh bot qua damageMonster nên tên bot vào threat (đóng góp do server đếm)
  await gm('god on'); // chuyển room làm mất cờ bất tử
  await gm('tp 1300 985'); // vào giữa sàn cầu để `killall` (40 m) với tới quái
  await sleep(8000);
  // Qua trước giờ tối thiểu (kieuMinClearSec) là bất thường, server không ghi: chờ cho đủ.
  await sleep(({ 2: 20, 5: 65, 6: 65 } as Record<number, number>)[n] ? ({ 2: 20, 5: 65, 6: 65 } as Record<number, number>)[n]! * 1000 : 0);
  // Thạch Tượng (cầu 5) chỉ nhận đủ sát thương trong cửa sổ phá giáp: đánh mỗi 7 s để trúng cửa sổ 22–30 s của một chu kỳ.
  const gap = n === 5 ? 7000 : 14000;
  for (let w = 0; w < (n === 5 ? 12 : 6); w++) {
    await gm('killall');
    await sleep(gap);
    log('đợt', w + 1, 'sys:', v.sys.slice(-4).join(','));
    if (v.sys.includes('sys.kieu_clear')) break;
  }
  log('kết quả sys:', v.sys.join(','));
  if (!v.sys.includes('sys.kieu_clear')) throw new Error('không ghi được cầu ' + n + ' (có thể do đóng góp hoặc thời gian tối thiểu)');
  await r.leave(true);
  log('XONG cầu', n);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
