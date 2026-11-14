// Kiểm tra hồi quy các lỗ hổng đã vá (soát netcode 2026-11-12).
// Chạy khi server dev đang bật với AUTH_DEV_BYPASS=1:  pnpm --filter @dtl/bot-client security
// Server khác cổng: thêm đối số http://localhost:2597, hoặc đặt SERVER_URL / PORT.
// Server KHÔNG được bật RATE_LIMIT_EXEMPT (bài 11 kiểm giới hạn /matchmake). Bài 11 làm cạn xô
// của IP này, chạy lại cả bộ sau khoảng 1 phút.

import { Client, type Room } from 'colyseus.js';
import { C, IN_FLY, IN_UP, type InitMsg, MF_CHANT, MF_STUN, MS_DEAD, ROOM_DUNGEON, ROOM_WORLD, S } from '@dtl/shared';
import { defaultServerHttp } from './target';

const HTTP = process.argv[2] ?? defaultServerHttp();
const WS = HTTP.replace(/^http/, 'ws');
const W = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

async function health(): Promise<boolean> {
  try {
    return (await fetch(HTTP + '/health')).ok;
  } catch {
    return false;
  }
}

interface P {
  x: number;
  y: number;
  z: number;
  hp: number;
  fl: number;
  lv: number;
}
interface M {
  t: string;
  x: number;
  z: number;
  hp: number;
  mhp: number;
  st: number;
}

async function join(name: string): Promise<{ client: Client; room: Room; init: InitMsg }> {
  const client = new Client(WS);
  const room = await client.joinOrCreate(ROOM_WORLD, { dev: name });
  const init = await new Promise<InitMsg>((res) => room.onMessage(S.INIT, res));
  room.onMessage('*', () => {});
  return { client, room, init };
}

async function main() {
  // 1. Request HTTP xấu không được làm sập server.
  for (const path of ['//', '/%', '/..%2f..%2fpackage.json', '/%E0%A4%A']) {
    try {
      await fetch(HTTP + path);
    } catch {
      /* lỗi phía client cũng được, miễn server còn sống */
    }
  }
  await W(300);
  check('request HTTP xấu không làm sập server', await health());

  // 4. Matchmake không có thông tin đăng nhập bị từ chối và không dựng room.
  const before = ((await (await fetch(HTTP + '/health')).json()) as { rooms: unknown[] }).rooms.length;
  const r1 = await fetch(HTTP + '/matchmake/joinOrCreate/world', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const j1 = (await r1.json()) as { error?: string; code?: number };
  check('matchmake không đăng nhập bị từ chối', !!j1.error || !!j1.code, JSON.stringify(j1).slice(0, 80));

  // 3. Client không tự create được kênh mới.
  const r2 = await fetch(HTTP + '/matchmake/create/world', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'kiemthu' }) });
  const j2 = (await r2.json()) as { error?: string; code?: number };
  check('client không tự tạo được kênh', !!j2.error || !!j2.code, JSON.stringify(j2).slice(0, 80));
  const after = ((await (await fetch(HTTP + '/health')).json()) as { rooms: unknown[] }).rooms.length;
  check('không có room mới bị dựng', after <= Math.max(before, 1), `${before} → ${after}`);

  const { client, room, init } = await join('kiemthu');
  const me = () => (room.state as { players: Map<string, P> }).players.get(init.sid)!;
  const mons = () => (room.state as { monsters: Map<string, M> }).monsters;
  const gm = async (cmd: string) => {
    room.send(C.CHAT, { m: '/gm ' + cmd });
    await W(900);
  };
  await W(500);

  // 6. Vào bí cảnh không có vé bị từ chối.
  let direct = false;
  try {
    const d = await client.joinOrCreate(ROOM_DUNGEON, { session: init.session });
    direct = true;
    await d.leave(true);
  } catch {
    /* mong đợi */
  }
  check('vào bí cảnh không qua cổng bị từ chối', !direct);

  // 2. Không ra chiêu được khi lơ lửng trên không.
  await gm('level 15');
  await gm('tp 2048 2455');
  let target = '';
  let best = 1e9;
  mons().forEach((m, id) => {
    const d = Math.hypot(m.x - me().x, m.z - me().z);
    if (m.st !== 4 && d < best) {
      best = d;
      target = id;
    }
  });
  const m0 = mons().get(target)!;
  await gm(`tp ${m0.x.toFixed(0)} ${m0.z.toFixed(0)}`);
  let seq = 1000;
  // Bay lên khoảng 20m.
  for (let i = 0; i < 40; i++) {
    room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: IN_FLY | IN_UP });
    await W(50);
  }
  const hp0 = mons().get(target)!.hp;
  let sysMsg = '';
  room.onMessage(S.SYS, (m: { k: string }) => (sysMsg = m.k));
  // Tắt ngự kiếm một bước rồi ra chiêu ngay (cách khai thác cũ).
  room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: 0 });
  await W(110);
  room.send(C.SKILL, { id: 'skl_phi_kiem', t: target });
  await W(400);
  const hp1 = mons().get(target)?.hp ?? -1;
  check('không ra chiêu được khi đang ở trên không', hp1 === hp0, `máu quái ${hp0} → ${hp1}, thông báo: ${sysMsg}`);

  // 9. Rơi không bị làm chậm khi gửi input thưa: rơi 20m phải xong trong dưới 3 giây.
  const t0 = Date.now();
  for (let i = 0; i < 16; i++) {
    room.send(C.INPUT, { s: seq++, mx: 0, mz: 0, yaw: 0, f: 0 });
    await W(190);
    if (me().y < 45) break;
  }
  check('rơi theo giờ thật dù gửi input thưa', me().y < 45 && Date.now() - t0 < 3000, `${Date.now() - t0}ms, y=${me().y.toFixed(1)}`);

  // 10. Ngắt chú boss (M5-3): trong đoạn hộ chú không phá được; qua hộ chú thì boss choáng.
  // Dùng hai nhân vật mới vào (đứng trên đất ở điểm xuất hiện); `kiemthu` lúc này còn đang ngự kiếm.
  {
    const a = await join('kiemthu2');
    const b = await join('kiemthu3');
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900); // chat giới hạn 800ms/lệnh
    };
    for (const r of [a.room, b.room]) {
      await say(r, 'level 18');
      await say(r, 'heal');
    }
    await say(a.room, 'killall');
    await say(a.room, 'spawn boss_han_giao');
    const am = () => (a.room.state as { monsters: Map<string, M & { mf?: number }> }).monsters;
    const boss = [...am().entries()].filter(([, m]) => m.t === 'boss_han_giao' && m.st !== MS_DEAD).pop();
    const mf = () => am().get(boss?.[0] ?? '')?.mf ?? 0;
    let guardMsg = '';
    a.room.onMessage(S.SYS, (m: { k: string }) => {
      if (m.k === 'sys.chant_guarded') guardMsg = m.k;
    });
    let guardOk = false;
    let stunOk = false;
    let detail = boss ? '' : 'không gọi được boss';
    if (boss) {
      const id = boss[0];
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
      const t0 = Date.now();
      let healAt = t0;
      // Chờ boss bắt đầu niệm (lần đầu sau nửa chu kỳ), giữ máu cho cả hai.
      while (Date.now() - t0 < 16000 && !(mf() & MF_CHANT)) {
        await W(30);
        if (Date.now() - healAt > 2500) {
          healAt = Date.now();
          a.room.send(C.CHAT, { m: '/gm heal' });
          b.room.send(C.CHAT, { m: '/gm heal' });
        }
      }
      const seen = Date.now();
      if (mf() & MF_CHANT) {
        a.room.send(C.SKILL, { id: 'skl_kiem_khi_tram', t: id });
        await W(250);
        guardOk = guardMsg === 'sys.chant_guarded' && (mf() & MF_CHANT) !== 0;
        // Qua đoạn hộ chú (30% của 2,6 giây) thì người thứ hai phá chú.
        await W(Math.max(0, 1000 - (Date.now() - seen)));
        b.room.send(C.SKILL, { id: 'skl_kiem_khi_tram', t: id });
        await W(300);
        stunOk = (mf() & MF_STUN) !== 0;
        detail = `mf=${mf()}, thông báo hộ chú: ${guardMsg || 'không có'}`;
      } else detail = 'boss không niệm chú trong 16 giây';
    }
    check('phá chú trong đoạn hộ chú không có tác dụng', guardOk, detail);
    check('phá chú đúng cửa sổ thì boss choáng', stunOk, detail);
    await say(a.room, 'killall');
    await a.room.leave(true);
    await b.room.leave(true);
  }

  // 8. Chết rồi vào lại: tỉnh ở điểm hồi sinh.
  await gm('tp 2048 2455');
  await gm('die');
  await room.leave(true);
  await W(600);
  const again = await join('kiemthu');
  await W(400);
  const p2 = (again.room.state as { players: Map<string, P> }).players.get(again.init.sid)!;
  check('chết rồi vào lại thì về điểm hồi sinh', Math.hypot(p2.x - 2048, p2.z - 2088) < 5 && p2.hp > 0, `(${p2.x.toFixed(0)}, ${p2.z.toFixed(0)}) hp ${p2.hp}`);
  await again.room.leave(true);

  // 12. Thân request /matchmake quá lớn bị từ chối (Colyseus gom cả thân vào bộ nhớ).
  {
    const r = await fetch(HTTP + '/matchmake/joinOrCreate/world', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'x'.repeat(64 * 1024) }) });
    await r.arrayBuffer();
    check('thân /matchmake quá lớn bị từ chối 413', r.status === 413, `HTTP ${r.status}`);
  }

  // 11. Giới hạn tần suất /matchmake theo IP (đặt cuối: làm cạn xô của IP này; chạy lại sau ~1 phút).
  //     Mỗi request mang X-Forwarded-For khác nhau: khi chưa bật TRUST_PROXY thì không lách được.
  {
    let limited: Response | null = null;
    let sent = 0;
    for (let batch = 0; batch < 10 && !limited; batch++) {
      const rs = await Promise.all(
        Array.from({ length: 20 }, () =>
          fetch(HTTP + '/matchmake/joinOrCreate/world', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${1 + (sent++ % 250)}` },
            body: '{}',
          }),
        ),
      );
      for (const r of rs) {
        if (r.status === 429 && !limited) limited = r;
        else await r.arrayBuffer();
      }
    }
    const body = limited ? ((await limited.json()) as { code?: number; error?: string }) : null;
    check(
      '/matchmake dồn dập bị chặn 429 (X-Forwarded-For giả không lách được)',
      !!limited && body?.code === 429 && Number(limited.headers.get('retry-after')) > 0,
      limited ? `sau ${sent} request, Retry-After ${limited.headers.get('retry-after')}s` : `${sent} request không bị chặn — server đang bật RATE_LIMIT_EXEMPT/TRUST_PROXY hoặc RATE_LIMIT_BURST<=0?`,
    );
    // Bị chặn rồi thì join qua colyseus.js báo lỗi 429 thay vì treo.
    let code: number | undefined;
    try {
      const r = await new Client(WS).joinOrCreate(ROOM_WORLD, { dev: 'kiemthu' });
      await r.leave(true);
    } catch (e) {
      code = (e as { code?: number }).code;
    }
    check('client nhận mã 429 khi bị giới hạn', code === 429, `mã ${code}`);
    check('/health không bị giới hạn', await health());
  }

  check('server vẫn sống sau toàn bộ bài kiểm tra', await health());
  console.log(failed ? `\n${failed} mục HỎNG` : '\nTất cả đều ĐẠT');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
