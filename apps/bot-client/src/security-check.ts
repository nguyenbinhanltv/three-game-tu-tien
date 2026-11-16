// Kiểm tra hồi quy các lỗ hổng đã vá (soát netcode 2026-11-12).
// Chạy khi server dev đang bật với AUTH_DEV_BYPASS=1:  pnpm --filter @dtl/bot-client security
// Server khác cổng: thêm đối số http://localhost:2597, hoặc đặt SERVER_URL / PORT.
// Server KHÔNG được bật RATE_LIMIT_EXEMPT (bài 11 kiểm giới hạn /matchmake). Bài 11 làm cạn xô
// của IP này, chạy lại cả bộ sau khoảng 1 phút.

import { Client, type Room } from 'colyseus.js';
import { C, IN_FLY, rootChangeCost, IN_UP, type InitMsg, MF_CHANT, MF_STUN, MS_DEAD, ROOM_DUNGEON, ROOM_WORLD, S } from '@dtl/shared';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
interface CharV {
  xp: number;
  xpNeed: number;
  gold: number;
  level: number;
  bk: number;
  root: string;
  trial: number;
  retry: number;
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
  // SECURITY_ONLY=testparams: chỉ chạy bài ?god/?at (bài 13) để thử lại nhanh.
  if (process.env.SECURITY_ONLY === 'testparams') {
    await testParamsChecks();
    console.log(failed ? `${failed} mục HỎNG` : 'Tất cả đều ĐẠT');
    process.exit(failed ? 1 : 0);
  }
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

  // Ngoại hình lúc tạo nhân vật: giới tính không tồn tại ('x'; nữ 'f' đã mở nên là ca dương tính bên dưới), màu tự do, dữ liệu sai kiểu/quá lớn → server dùng mặc định, không lỗi.
  const tag = Math.random().toString(36).slice(2, 7);
  const bad: [string, unknown][] = [
    ['ap' + tag + 'a', { g: 'x', dye: 'attire_ink' }],
    ['ap' + tag + 'b', { g: 'm', dye: '#ff00ff' }],
    ['ap' + tag + 'c', { g: 'm', dye: 'x'.repeat(100000) }],
    ['ap' + tag + 'd', ['m', 'attire_ink']],
  ];
  for (const [name, ap] of bad) {
    const c = new Client(WS);
    let r: Room;
    try {
      r = await c.joinOrCreate(ROOM_WORLD, { dev: name, ap });
    } catch (e) {
      // Body quá lớn bị chặn trước khi tới onAuth (giới hạn kích thước /matchmake) cũng là đạt.
      const code = (e as { code?: number }).code;
      check(`ngoại hình không hợp lệ bị từ chối (${JSON.stringify(ap).slice(0, 30)})`, code === 413, `mã ${code}`);
      continue;
    }
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { g: string; dye: string }> }).players.get(r.sessionId);
    check(`ngoại hình không hợp lệ thì về mặc định (${JSON.stringify(ap).slice(0, 30)})`, me?.g === 'm' && me?.dye === 'attire_sect', `${me?.g}/${me?.dye}`);
    await r.leave(true);
  }
  // Ca dương tính: nữ tu hợp lệ được nhận lúc tạo nhân vật mới.
  {
    const c = new Client(WS);
    const r = await c.joinOrCreate(ROOM_WORLD, { dev: 'ap' + tag + 'f', ap: { g: 'f', dye: 'attire_ink' } });
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { g: string; dye: string }> }).players.get(r.sessionId);
    check('giới tính nữ hợp lệ được nhận lúc tạo nhân vật', me?.g === 'f' && me?.dye === 'attire_ink', `${me?.g}/${me?.dye}`);
    await r.leave(true);
  }
  // Chỉ nhận lúc tạo: vào lại nhân vật cũ với lựa chọn khác không đổi được màu.
  {
    const c = new Client(WS);
    const r = await c.joinOrCreate(ROOM_WORLD, { dev: 'ap' + tag + 'a', ap: { g: 'm', dye: 'attire_ink' } });
    r.onMessage('*', () => {});
    await W(400);
    const me = (r.state as unknown as { players: Map<string, { dye: string }> }).players.get(r.sessionId);
    check('ngoại hình chỉ nhận lúc tạo nhân vật', me?.dye === 'attire_sect', String(me?.dye));
    await r.leave(true);
  }

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

  // 6b. Chuyển bản đồ trái phép (E1-B): room không tồn tại, cổng ở xa, trận lạ, vé dùng lại, vé hết hạn.
  {
    const tryJoin = async (name: string, opts: Record<string, unknown>) => {
      try {
        const r = await new Client(WS).joinOrCreate(name, opts);
        await r.leave(true);
        return true;
      } catch {
        return false;
      }
    };
    const j1 = await tryJoin('world-doan_mach', { dev: 'xferbad' });
    const j2 = await tryJoin('dungeon-van_lam', { dev: 'xferbad' });
    const j3 = await tryJoin('world-van_lam', { dev: 'xferbad' });
    check('room level không tồn tại / đặt tên bậy bị từ chối', !j1 && !j2 && !j3, `${j1}/${j2}/${j3}`);

    const b = await join('xferb' + tag);
    const xfers: { room: string; level?: string }[] = [];
    b.room.onMessage(S.TRANSFER, (m: { room: string; level?: string }) => xfers.push(m));
    const bgm = async (cmd: string) => {
      b.room.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    await bgm('level 10');
    b.room.send(C.PORTAL, {});
    await W(700);
    check('bấm cổng khi đứng xa cổng: không có vé, không đổi room', xfers.length === 0);
    b.room.send(C.TELE, { id: 'dm_khong_co' });
    b.room.send(C.TELE, { id: '__proto__' });
    b.room.send(C.TELE, { id: { toString: 1 } });
    await W(900);
    b.room.send(C.TELE, { id: 'tp_rung' });
    await W(700);
    check('Truyền Tống tới trận lạ / chưa mở khóa không chuyển room', xfers.length === 0 && (await health()));

    await bgm('tp 2048 1712');
    b.room.send(C.PORTAL, {});
    await W(700);
    check('bấm cổng đúng chỗ: có lệnh chuyển sang bí cảnh', xfers.length === 1 && xfers[0].room === ROOM_DUNGEON && xfers[0].level === 'kiem_trung', JSON.stringify(xfers));
    let first = false;
    try {
      const d = await new Client(WS).joinOrCreate(ROOM_DUNGEON, { session: b.init.session });
      first = true;
      let bounced = false;
      d.onMessage(S.TRANSFER, () => (bounced = true));
      d.onMessage('*', () => {});
      await W(1500);
      check('vào bí cảnh bằng vé: ở lại bí cảnh, không bị dẫn ngược về thế giới', !bounced && d.name === ROOM_DUNGEON, `bounced=${bounced} room=${d.name}`);
      await d.leave(true);
    } catch {
      /* xem bên dưới */
    }
    check('vé vào bí cảnh dùng được một lần', first);
    check('vé đã dùng không dùng lại được', !(await tryJoin(ROOM_DUNGEON, { session: b.init.session })));
    await W(1500);

    // vé hết hạn sau 15 s: nhân vật mới nhận vé rồi để quá hạn
    const c = await join('xferc' + tag);
    const xc: unknown[] = [];
    c.room.onMessage(S.TRANSFER, (m: unknown) => xc.push(m));
    const cgm = async (cmd: string) => {
      c.room.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    await cgm('level 10');
    await cgm('tp 2048 1712');
    c.room.send(C.PORTAL, {});
    await W(700);
    await W(16_000);
    check('vé hết hạn sau 15 s bị từ chối', xc.length === 1 && !(await tryJoin(ROOM_DUNGEON, { session: c.init.session })), `lệnh chuyển ${xc.length}`);
    // Phiên b đã bị đá khi vào bí cảnh (đăng nhập trùng): leave có thể không bao giờ trả về, nên chỉ chờ có hạn.
    await Promise.race([c.room.leave(true).catch(() => {}), W(1500)]);
    await Promise.race([b.room.leave(true).catch(() => {}), W(1500)]);
  }

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
        // Chiêu áp tại hitAt (0,28 s): chờ qua mốc đó rồi mới đọc kết quả.
        await W(500);
        guardOk = guardMsg === 'sys.chant_guarded' && (mf() & MF_CHANT) !== 0;
        // Qua đoạn hộ chú (30% của 2,6 giây) thì người thứ hai phá chú.
        await W(Math.max(0, 1000 - (Date.now() - seen)));
        b.room.send(C.SKILL, { id: 'skl_kiem_khi_tram', t: id });
        await W(550);
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

  // 15. Bình cảnh, tâm ma, linh căn (P3-7): mọi thứ do server phán định, client chỉ gửi ý định.
  {
    const a = await join('binhcanh1');
    const b = await join('binhcanh2');
    let ca = null as CharV | null;
    a.room.onMessage(S.CHAR, (c: CharV) => (ca = c));
    let cb = null as CharV | null;
    b.room.onMessage(S.CHAR, (c: CharV) => (cb = c));
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    const mons = () => (a.room.state as { monsters: Map<string, M> }).monsters;
    const shadows = () => [...mons().entries()].filter(([, m]) => m.t === 'mon_tam_ma' && m.st !== MS_DEAD);
    const rq = () => 'r' + Math.random().toString(36).slice(2, 10);
    await say(a.room, 'tp 2048 2088'); // DB dev lưu vị trí lần chạy trước: về sân (xa Lạc Vân) cho bài đổi linh căn từ xa
    await say(a.room, 'level 5');
    await say(a.room, 'heal');
    await W(300);
    // a. Tu vi chưa đầy: không bắt đầu được tâm ma, không dùng được đan (kể cả khi có đan).
    await say(a.room, 'give itm_pha_canh_dan 1');
    a.room.send(C.BOTTLENECK, { m: 'trial' });
    a.room.send(C.BOTTLENECK, { m: 'pill', r: rq() });
    await W(700);
    check('tu vi chưa đầy: không mở được tâm ma, không dùng được Phá Cảnh Đan', shadows().length === 0 && ca?.level === 5 && ca?.bk === 0 && ca?.trial === 0, `lv ${ca?.level} bk ${ca?.bk}`);
    // b. Kiểu gửi lạ không làm gì, không sập.
    for (const m of [null, 'x', { m: 'hack' }, { m: 'pill' }, { m: 'pill', r: 5 }, { m: ['trial'] }]) a.room.send(C.BOTTLENECK, m);
    await W(500);
    check('lệnh bình cảnh sai kiểu bị bỏ qua', ca?.level === 5 && (await health()));
    // c. Đầy tu vi: chủ chưa đủ điều kiện độ kiếp tầng 15 khi chưa vượt bình cảnh.
    await say(a.room, 'level 15');
    await say(a.room, 'xp 9999999');
    await say(a.room, 'give itm_truc_co_dan 1');
    a.room.send(C.BREAKTHROUGH);
    await W(700);
    const pa = (a.room.state as { players: Map<string, P> }).players.get(a.init.sid)!;
    check('tầng 15 chưa vượt bình cảnh: không độ kiếp được', (pa.fl & 16) === 0 && ca?.level === 15 && ca?.bk === 10, `fl ${pa.fl} bk ${ca?.bk}`);
    // d. Đan: dùng một viên, vượt đúng một lần; trên tầng 15 chỉ mở đường độ kiếp.
    await say(a.room, 'give itm_pha_canh_dan 1');
    const r1 = rq();
    a.room.send(C.BOTTLENECK, { m: 'pill', r: r1 });
    a.room.send(C.BOTTLENECK, { m: 'pill', r: r1 });
    await W(900);
    check('Phá Cảnh Đan tầng 15: bình cảnh vỡ (bk 15), vẫn Ngưng Khí 15', ca?.bk === 15 && ca?.level === 15, `lv ${ca?.level} bk ${ca?.bk}`);
    // e. Tâm ma: người khác không đánh được bóng của mình.
    await say(a.room, 'level 5');
    await say(a.room, 'xp 9999999');
    await say(b.room, 'level 5');
    await say(b.room, 'heal');
    a.room.send(C.BOTTLENECK, { m: 'trial' });
    await W(900);
    const sh = shadows()[0];
    check('tâm ma: server dựng bóng riêng và báo thời gian', !!sh && (ca?.trial ?? 0) > 100, `bóng ${sh ? 'có' : 'không'}, còn ${ca?.trial}s`);
    if (sh) {
      const hp0 = sh[1].hp;
      for (let i = 0; i < 4; i++) {
        b.room.send(C.SKILL, { id: 'skl_phi_kiem', t: sh[0] });
        await W(1100);
      }
      check('người khác không làm bóng tâm ma mất máu', (mons().get(sh[0])?.hp ?? 0) >= hp0, `${hp0} → ${mons().get(sh[0])?.hp}`);
    }
    // e2. Chết trong thử thách: thua ngay, KHÔNG mất tu vi, phải đợi thử lại (người chơi b, bóng của b).
    b.room.send(C.RESPAWN); // DB dev nhớ lần chạy trước (b có thể đang trọng thương, tu vi đã tụt)
    await W(700);
    await say(b.room, 'level 5');
    await say(b.room, 'heal');
    await say(b.room, 'xp 9999999');
    await W(5000); // b vừa ra chiêu lên bóng của a: đợi hết giao chiến (6 giây) mới mở tâm ma được
    b.room.send(C.BOTTLENECK, { m: 'trial' });
    await W(900);
    const trialB = cb?.trial ?? 0;
    await say(b.room, 'die');
    await W(600);
    check('chết trong tâm ma: không mất tu vi, đợi thử lại', trialB > 100 && cb?.trial === 0 && (cb?.retry ?? 0) > 30 && cb?.xp === cb?.xpNeed, `trial ${trialB} → ${cb?.trial}, retry ${cb?.retry}, xp ${cb?.xp}/${cb?.xpNeed}`);
    // f. Chủ hạ bóng thì thắng (GM killall chạy qua damageMonster như đòn thật).
    await say(a.room, 'killall');
    await W(600);
    check('hạ bóng tâm ma: vượt bình cảnh tầng 5 → tầng 6', ca?.level === 6 && ca?.bk === 5 && ca?.trial === 0, `lv ${ca?.level} bk ${ca?.bk}`);
    // g. Đổi linh căn: sai NPC / xa NPC / root lạ / thiếu tiền đều bị từ chối.
    const before = ca?.root;
    await say(a.room, 'gold 100000');
    for (const m of [
      { npc: 'npc_chuong_mon', root: before === 'kim' ? 'moc' : 'kim', r: rq() }, // đứng xa NPC
      { npc: 'npc_thiet_lao', root: 'kim', r: rq() }, // NPC không đổi linh căn
      { npc: 'npc_chuong_mon', root: 'rong', r: rq() },
      { npc: 'npc_chuong_mon', root: 'kim' }, // thiếu khóa chống trùng
      { npc: 5, root: 'kim', r: rq() },
    ])
      a.room.send(C.ROOT, m);
    await W(700);
    check('đổi linh căn từ xa / sai NPC / root lạ / thiếu khóa bị từ chối', ca?.root === before, `${before} → ${ca?.root}`);
    // h. Đứng cạnh Lạc Vân: đổi được, trừ đúng phí một lần; gửi lại cùng khóa không bị trừ lần hai.
    await say(a.room, 'tp 2048 2033');
    const want = before === 'kim' ? 'moc' : 'kim';
    const g0 = (ca as CharV | null)?.gold ?? 0;
    const rr = rq();
    a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root: want, r: rr });
    await W(700);
    const g1 = (ca as CharV | null)?.gold ?? 0;
    const flipped = ca?.root === want;
    a.room.send(C.ROOT, { npc: 'npc_chuong_mon', root: before, r: rr }); // cùng khóa, root khác: phải bị chặn
    await W(700);
    check('đổi linh căn cạnh NPC: đổi đúng, trừ phí một lần, khóa trùng bị chặn', flipped && g0 - g1 === rootChangeCost(6) && ca?.root === want && ((ca as CharV | null)?.gold ?? 0) === g1, `${before} → ${ca?.root}, linh thạch ${g0} → ${g1}`);
    await say(a.room, 'killall');
    await a.room.leave(true);
    await b.room.leave(true);
  }

  // 14. Trang bị (3-2): client chỉ gửi ô túi + khóa idempotency; không giả được dòng chính/phụ, không mặc đồ không có, không spam.
  {
    const g = await join('trangbi' + (Date.now() % 100000));
    await W(300);
    let inv: { id: string; inst?: { q: number } }[] = [];
    let equip: Record<string, { id: string; inst?: { q: number } }> = {};
    g.room.onMessage(S.INV, (m: { inv: typeof inv; equip: typeof equip }) => {
      inv = m.inv;
      equip = m.equip;
    });
    const say = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1150); // chat có giới hạn tần suất (~1 giây)
    };
    await say('/gm level 15');
    await say('/gm roll itm_thanh_phong_kiem 0 12');
    await say('/gm roll itm_dao_bao 0 5');
    await W(300);
    const slot = inv.findIndex((x) => x?.id === 'itm_thanh_phong_kiem');
    // Thiếu khóa idempotency, ô ngoài khoảng, ô trống, kiểu sai, thêm trường giả: đều không làm gì.
    for (const bad of [{ slot }, { slot, r: 'x' }, { slot: -1, r: 'bad-0001' }, { slot: 99, r: 'bad-0002' }, { slot: 29, r: 'bad-0003' }, { slot: '0', r: 'bad-0004' }, { slot: 1.5, r: 'bad-0005' }, null, 'weapon']) {
      g.room.send(C.EQUIP, bad);
      await W(250);
    }
    check('mặc đồ thiếu khóa/ô sai bị bỏ qua', !equip.weapon && !equip.robe && inv[slot]?.id === 'itm_thanh_phong_kiem', 'slot ' + slot + ' inv ' + inv.length + ' ' + JSON.stringify(Object.keys(equip)));
    // Gửi kèm inst giả (Thiên phẩm): server bỏ qua, món mặc vào vẫn là Phàm phẩm đã roll.
    g.room.send(C.EQUIP, { slot, r: 'forge-0001', inst: { q: 4, ilvl: 99, main: { atk: 99999 }, affixes: [], gems: [], bound: false }, id: 'itm_tram_ta_kiem' });
    await W(500);
    check('inst giả từ client bị bỏ qua khi mặc đồ', equip.weapon?.id === 'itm_thanh_phong_kiem' && equip.weapon?.inst?.q === 0, JSON.stringify(equip.weapon));
    // Cùng khóa gửi lại (mất mạng, bấm đúp): không đổi thêm lần nào.
    const before = JSON.stringify(equip);
    g.room.send(C.UNEQUIP, { slot: 'weapon', r: 'forge-0001' });
    await W(500);
    check('khóa idempotency dùng lại bị bỏ qua', JSON.stringify(equip) === before, JSON.stringify(Object.keys(equip)));
    // Tháo ô không có đồ / tên ô lạ: không crash.
    for (const bad of [{ slot: 'robe', r: 'un-0001' }, { slot: '__proto__', r: 'un-0002' }, { slot: 'artifact', r: 'un-0003' }, { r: 'un-0004' }]) {
      g.room.send(C.UNEQUIP, bad);
      await W(250);
    }
    // Spam mặc/tháo khác khóa: vài lần đầu có hiệu lực nhưng số dòng ledger bị chặn bởi hồi 200 ms.
    for (let i = 0; i < 60; i++) {
      g.room.send(i % 2 ? C.UNEQUIP : C.EQUIP, i % 2 ? { slot: 'weapon', r: 'spam-u' + i } : { slot: inv.findIndex((x) => x?.id === 'itm_thanh_phong_kiem'), r: 'spam-e' + i });
      await W(10);
    }
    await W(400);
    check('spam mặc/tháo không làm sập server', await health());
    await g.room.leave(true);
  }

  // 14. Công pháp (P3-5): chiêu của công pháp khác, ult khi chưa sạc, nâng cấp thiếu nguyên liệu, đổi công pháp xa NPC.
  {
    const g = await join('kt_congphap');
    const msgs: { k: string; p?: unknown }[] = [];
    let method: { method: string; lv: Record<string, number>; charge: number } | null = null;
    let gold = -1;
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.METHOD, (m: { method: string; lv: Record<string, number>; charge: number }) => (method = m));
    g.room.onMessage(S.CHAR, (c: { gold: number }) => (gold = c.gold));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(900);
    };
    await chat('/gm level 12');
    await chat('/gm gold 5000');
    const gold0 = gold;
    const has = (k: string) => msgs.some((m) => m.k === k);
    // Chưa chọn công pháp: chiêu của công pháp không ra.
    g.room.send(C.SKILL, { id: 'skl_kim_cuong_bat_hoai' });
    await W(300);
    check('chiêu công pháp khi chưa chọn công pháp bị từ chối', has('sys.no_method'));
    await W(800);
    g.room.send(C.SKILL, { id: 'skl_tran_son_an' });
    await W(300);
    check('khiêu khích giả (chưa có công pháp) bị từ chối', msgs.filter((m) => m.k === 'sys.no_method').length >= 2);
    // Nâng cấp thiếu Bí Tịch: không đổi cấp, không mất linh thạch.
    g.room.send(C.SKILL_UP, { skill: 'skl_phi_kiem', r: 'sec-up-0001' });
    g.room.send(C.SKILL_UP, { skill: 'skl_phi_kiem', r: 'sec-up-0001' });
    g.room.send(C.SKILL_UP, { skill: 'skl_khong_co', r: 'sec-up-0002' });
    g.room.send(C.SKILL_UP, { skill: { $gt: '' }, r: 'sec-up-0003' });
    await W(600);
    check('nâng cấp chiêu thiếu Bí Tịch bị từ chối, không mất linh thạch', gold === gold0 && !(method as { lv: Record<string, number> } | null)?.lv?.skl_phi_kiem, `vàng ${gold0} → ${gold}`);
    // Biến thức khi chiêu chưa tới cấp 3 (warn của server giới hạn 1 lần/0,7 giây nên chờ giữa các lệnh).
    await W(800);
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: 'a' });
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: '__proto__' });
    await W(400);
    check('chọn biến thức khi chưa đủ cấp bị từ chối', has('sys.variant_low'));
    // Chọn công pháp (lần đầu được), rồi đổi ở xa NPC thì không được.
    g.room.send(C.METHOD, { method: 'lac_kiem_quyet' });
    await W(500);
    check('chọn công pháp lần đầu ở tầng 5+ được', (method as { method: string } | null)?.method === 'lac_kiem_quyet');
    await chat('/gm tp 2200 2400');
    g.room.send(C.METHOD, { method: 'bat_dong_kim_than', r: 'sec-sw-0001' });
    await W(500);
    check('đổi công pháp xa Lạc Vân chân nhân bị từ chối', (method as { method: string } | null)?.method === 'lac_kiem_quyet' && gold === gold0);
    // Ult khi vòng sạc chưa đầy.
    await W(800);
    g.room.send(C.SKILL, { id: 'skl_van_kiem_quy_tong', t: 'khong-co' });
    await W(300);
    check('chiêu tối thượng khi chưa đầy vòng sạc bị từ chối', has('sys.ult_not_ready'));
    // Gửi rác vào ba message không làm sập server.
    for (const m of [null, 7, 'x', [], { method: {} }, { skill: [], v: 1 }]) {
      g.room.send(C.METHOD, m);
      g.room.send(C.SKILL_UP, m);
      g.room.send(C.SKILL_VAR, m);
    }
    await W(400);
    check('message công pháp rác không làm sập server', await health());
    await g.room.leave(true);
  }

  // 15. Bí tịch và biến thức (P3-6): đổi biến thức dồn dập bị giãn; chép bí tịch giả không ra bí tịch (tài khoản riêng).
  {
    const g = await join('kt_bitich' + (Date.now() % 100000));
    const msgs: { k: string }[] = [];
    let inv: unknown[] = [];
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.INV, (m: { inv?: unknown[] }) => (inv = m.inv ?? inv));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(900);
    };
    await chat('/gm level 12');
    await chat('/gm method lac_kiem_quyet 3');
    // 3-6: đổi biến thức dồn dập bị giãn; chép bí tịch giả (thiếu nguyên liệu, xa Dược sư) không ra bí tịch.
    await chat('/gm tp tong_mon');
    await W(800);
    const wait0 = msgs.filter((m) => m.k === 'sys.variant_wait').length;
    g.room.send(C.SKILL_VAR, { skill: 'skl_phi_kiem', v: 'a' });
    await W(800);
    g.room.send(C.SKILL_VAR, { skill: 'skl_kiem_khi_tram', v: 'b' });
    await W(500);
    check('đổi biến thức hai lần liên tiếp: lần sau bị giãn', msgs.filter((m) => m.k === 'sys.variant_wait').length > wait0);
    const scrolls = () => (inv as ({ id: string; n: number } | null)[]).reduce((n, s) => (s?.id === 'itm_bi_tich_tan_quyen' ? n + s.n : n), 0);
    const s0 = scrolls();
    g.room.send(C.CRAFT, { id: 'rcp_bi_tich', n: 20, r: 'sec-cr-0001' });
    g.room.send(C.CRAFT, { id: 'rcp_bi_tich', n: -1, r: 'sec-cr-0002' });
    await W(600);
    check('chép bí tịch thiếu nguyên liệu không ra bí tịch', scrolls() === s0, `${s0} → ${scrolls()}`);
    check('message chép bí tịch/biến thức không làm sập server', await health());
    await g.room.leave(true);
  }

  // 16. Nâng cấp trang bị (P3-3): khảm/tháo/ghép ngọc, tẩy luyện, phân giải, cường hóa. Server quyết định; client chỉ gửi ý định.
  {
    const g = await join('nangcap' + (Date.now() % 100000));
    await W(300);
    type It = { id: string; n: number; plus?: number; inst?: { q: number; gems: string[]; affixes: unknown[] } };
    let inv: (It | null)[] = [];
    let gold = 0;
    g.room.onMessage(S.INV, (m: { inv: typeof inv }) => {
      inv = m.inv;
    });
    g.room.onMessage(S.CHAR, (m: { gold: number }) => (gold = m.gold));
    const say = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1150);
    };
    const count = (id: string) => inv.reduce((n, x) => n + (x && x.id === id ? x.n : 0), 0);
    const upg = async (m: Record<string, unknown>) => {
      g.room.send(C.UPGRADE, { npc: 'npc_thiet_lao', ...m });
      await W(320); // hồi 250 ms mỗi lần
    };
    await say('/gm level 15');
    await say('/gm gold 5000');
    await say('/gm roll itm_thiet_kiem 0 5');
    await say('/gm roll itm_han_quang_kiem 2 12');
    await say('/gm give gem_kim_1 4');
    await say('/gm give itm_linh_tran 6');
    await W(300);
    const sword = inv.findIndex((x) => x?.id === 'itm_thiet_kiem');
    const rare = inv.findIndex((x) => x?.id === 'itm_han_quang_kiem');
    const snap = () => JSON.stringify([inv, gold]);
    // Đứng xa Thiết lão: mọi lệnh bị bỏ qua.
    const far = snap();
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'far-0001' });
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'far-0002' });
    await upg({ op: 'socket', i: rare, idx: 0, gem: 'gem_kim_1', r: 'far-0003' });
    check('nâng cấp khi đứng xa Thiết lão bị bỏ qua', snap() === far);
    await say('/gm tp 2088 2064');
    await W(600);
    // Payload xấu: thiếu khóa, ô/lỗ ngoài khoảng, kiểu sai, ngọc/loại lạ, lô quá lớn, ô trùng: không đổi gì.
    const bad: Record<string, unknown>[] = [
      { op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'] },
      { op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'x' },
      { op: 'salvage', slots: [sword, sword], ids: ['itm_thiet_kiem', 'itm_thiet_kiem'], r: 'bad-0001' },
      { op: 'salvage', slots: [sword], ids: ['itm_dao_bao'], r: 'bad-0002' },
      { op: 'salvage', slots: [sword], ids: [], r: 'bad-0003' },
      { op: 'salvage', slots: Array.from({ length: 31 }, (_, i) => i % 30), ids: Array(31).fill('x'), r: 'bad-0004' },
      { op: 'salvage', slots: [-1], ids: ['x'], r: 'bad-0005' },
      { op: 'salvage', slots: ['0'], ids: ['x'], r: 'bad-0006' },
      { op: 'salvage', slots: 'all', r: 'bad-0007' },
      { op: 'socket', i: rare, idx: 5, gem: 'gem_kim_1', r: 'bad-0008' },
      { op: 'socket', i: rare, idx: -1, gem: 'gem_kim_1', r: 'bad-0009' },
      { op: 'socket', i: rare, idx: 0.5, gem: 'gem_kim_1', r: 'bad-0010' },
      { op: 'socket', i: rare, idx: 0, gem: 'gem_kim_9', r: 'bad-0011' },
      { op: 'socket', i: rare, idx: 0, gem: '__proto__', r: 'bad-0012' },
      { op: 'socket', i: rare, idx: 0, gem: 'gem_tho_3', r: 'bad-0013' }, // không sở hữu
      { op: 'socket', i: 99, idx: 0, gem: 'gem_kim_1', r: 'bad-0014' },
      { op: 'socket', w: 'robe', idx: 0, gem: 'gem_kim_1', r: 'bad-0015' }, // ô chưa mặc
      { op: 'unsocket', i: rare, idx: 0, r: 'bad-0016' }, // lỗ trống
      { op: 'merge', gem: 'gem_kim_3', r: 'bad-0017' }, // đã cấp cao nhất
      { op: 'merge', gem: 'itm_thiet_tinh', r: 'bad-0018' },
      { op: 'refine', i: rare, idx: 0, r: 'bad-0019' }, // thiếu Tẩy Luyện Thạch
      { op: 'refine', i: sword, idx: 0, r: 'bad-0020' }, // Phàm phẩm không có dòng phụ
      { op: 'hack', r: 'bad-0021' },
    ];
    let changed = '';
    for (const b of bad) {
      const was = snap();
      await upg(b);
      if (snap() !== was) changed = JSON.stringify(b).slice(0, 70);
    }
    check('payload nâng cấp xấu không đổi túi/tiền', !changed, changed);
    // inst giả kèm lệnh khảm hợp lệ: chỉ ngọc sở hữu có hiệu lực, ngọc giả cấp 3 không xuất hiện.
    await upg({ op: 'socket', i: rare, idx: 0, gem: 'gem_kim_1', r: 'sock-0001', inst: { q: 4, gems: ['gem_kim_3', 'gem_kim_3'], affixes: [] } });
    check('inst giả trong lệnh khảm bị bỏ qua', inv[rare]?.inst?.gems.join(',') === 'gem_kim_1' && count('gem_kim_3') === 0 && count('gem_kim_1') === 3, JSON.stringify(inv[rare]?.inst?.gems));
    // Cùng khóa gửi lại (mất mạng): không trừ thêm ngọc/tiền.
    const goldNow = gold;
    await upg({ op: 'socket', i: rare, idx: 0, gem: 'gem_kim_1', r: 'sock-0001' });
    check('khóa idempotency dùng lại không khảm/trừ tiền lần hai', gold === goldNow && count('gem_kim_1') === 3, `gold ${gold}/${goldNow} gem ${count('gem_kim_1')}`);
    // Hai lệnh tháo cùng một lỗ (khóa khác nhau): chỉ trả ngọc một lần.
    await upg({ op: 'unsocket', i: rare, idx: 0, r: 'un-a-0001' });
    await upg({ op: 'unsocket', i: rare, idx: 0, r: 'un-b-0001' });
    check('tháo ngọc hai lần cùng lỗ chỉ trả một viên', count('gem_kim_1') === 4 && inv[rare]?.inst?.gems[0] === '', `gem ${count('gem_kim_1')}`);
    // Ghép ngọc: 3 → 1, không ghép khi thiếu.
    const dust = count('itm_linh_tran');
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'mg-0001' });
    await upg({ op: 'merge', gem: 'gem_kim_1', r: 'mg-0002' }); // chỉ còn 1 viên
    check('ghép ngọc 3 → 1 và không ghép khi thiếu', count('gem_kim_2') === 1 && count('gem_kim_1') === 1 && count('itm_linh_tran') === dust - 2, `kim2 ${count('gem_kim_2')} kim1 ${count('gem_kim_1')}`);
    // Phân giải: một lần, rồi không nhân đôi khi gửi lại hoặc khi ô đã trống.
    const ore = count('itm_thiet_tinh');
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0001' });
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0001' });
    await upg({ op: 'salvage', slots: [sword], ids: ['itm_thiet_kiem'], r: 'sv-0002' });
    check('phân giải không nhân đôi (khóa lặp và ô đã trống)', count('itm_thiet_kiem') === 0 && count('itm_thiet_tinh') === ore + 1, `Thiết Tinh ${count('itm_thiet_tinh')} (cũ ${ore})`);
    // Spam cường hóa khác khóa: hồi 250 ms/người, server vẫn sống.
    for (let i = 0; i < 60; i++) {
      g.room.send(C.ENHANCE, { npc: 'npc_thiet_lao', i: rare, r: 'enh-spam' + i });
      await W(10);
    }
    await W(500);
    check('spam cường hóa không làm sập server', await health());
    await g.room.leave(true);
  }

  // 16. Tổ đội và tỉ thí (P3-9): server giữ lời mời, chặn spam, không cho đánh đồng đội ngoài tỉ thí, tỉ thí không thưởng.
  {
    const A = 'doi_a' + (Date.now() % 1000);
    const B = 'doi_b' + (Date.now() % 1000);
    const Cn = 'doi_c' + (Date.now() % 1000);
    const a = await join(A);
    const b = await join(B);
    const c = await join(Cn);
    const players = (r: Room) => (r.state as { players: Map<string, P> }).players;
    const pa = () => players(a.room).get(a.init.sid)!;
    const pb = () => players(a.room).get(b.init.sid)!;
    const pc = () => players(a.room).get(c.init.sid)!;
    const say = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    const keys = (r: Room) => {
      const out: string[] = [];
      r.onMessage(S.SYS, (m: { k: string }) => out.push(m.k));
      return out;
    };
    let partyA = undefined as { members: { id: number }[]; loot: string } | null | undefined;
    let partyB = undefined as { members: { id: number }[] } | null | undefined;
    a.room.onMessage(S.PARTY, (m) => (partyA = m));
    b.room.onMessage(S.PARTY, (m) => (partyB = m));
    const inviteB: { id: number; kind: string }[] = [];
    b.room.onMessage(S.INVITE, (m: { id: number; kind: string; gone?: boolean }) => !m.gone && inviteB.push(m));
    const sysA = keys(a.room);
    const sysB = keys(b.room);
    const sysC = keys(c.room);
    let duelA = null as { phase: string; won?: boolean; why?: string } | null;
    a.room.onMessage(S.DUEL, (m) => (duelA = m));
    let ca = null as CharV | null;
    a.room.onMessage(S.CHAR, (v: CharV) => (ca = v));
    for (const r of [a, b, c]) {
      await say(r.room, 'level 12');
      await say(r.room, 'god off');
      await say(r.room, 'tp 2048 2455'); // xa võ đài
    }
    // a. Rác không làm sập, không tạo tổ đội.
    for (const m of [null, 5, 'x', {}, { a: 7 }, { a: 'inv' }, { a: 'inv', n: 5 }, { a: 'acc', id: 'x' }, { a: 'kick', id: NaN }, { a: 'loot', m: 'bậy' }, { a: 'inv', n: 'x'.repeat(500) }]) a.room.send(C.PARTY, m);
    for (const m of [null, 5, { a: 'inv', n: {} }, { a: 'acc', id: -1 }, { a: 'yield' }]) a.room.send(C.DUEL, m);
    await W(600);
    check('lệnh tổ đội/tỉ thí sai kiểu bị bỏ qua, server còn sống', !partyA && (await health()));
    // b. Nhận lời khi không có lời mời: không vào tổ đội.
    b.room.send(C.PARTY, { a: 'acc', id: Number.MAX_SAFE_INTEGER });
    await W(500);
    check('nhận lời mời giả (không ai mời) không lập được tổ đội', !partyB);
    // c. Mời, nhận lời → tổ đội; mời dồn dập bị chặn.
    a.room.send(C.PARTY, { a: 'inv', n: B });
    await W(500);
    check('lời mời tổ đội tới đúng người', inviteB.length === 1 && inviteB[0].kind === 'party');
    a.room.send(C.PARTY, { a: 'inv', n: Cn });
    await W(500);
    check('mời liên tục trong 2 giây bị chặn', sysA.includes('party.invite_rate'));
    b.room.send(C.PARTY, { a: 'acc', id: inviteB[0].id });
    await W(700);
    check('nhận lời mời hợp lệ: cả hai cùng thấy tổ đội 2 người', partyA?.members.length === 2 && partyB?.members.length === 2);
    // d. Người không phải trưởng nhóm không đổi được chia đồ/đuổi.
    b.room.send(C.PARTY, { a: 'loot', m: 'free' });
    b.room.send(C.PARTY, { a: 'kick', id: inviteB[0].id });
    await W(500);
    check('thành viên thường không đổi được chia đồ hay đuổi trưởng nhóm', partyA?.loot === 'turn' && partyA?.members.length === 2 && sysB.includes('party.not_leader'));
    // e. Không đánh được đồng đội hay người lạ bằng chiêu.
    await say(a.room, 'tp 2048 2090');
    await say(b.room, 'tp 2050 2090');
    await say(c.room, 'tp 2052 2090');
    await say(a.room, 'heal');
    const hpB = pb().hp;
    const hpC = pc().hp;
    for (const t of [pb(), pc()]) void t;
    for (let i = 0; i < 4; i++) {
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
      await W(1100);
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: c.init.sid });
      await W(1100);
    }
    check('không đánh được đồng đội hay người lạ ngoài tỉ thí', pb().hp >= hpB && pc().hp >= hpC, `B ${hpB} → ${pb().hp}, C ${hpC} → ${pc().hp}`);
    // f. Tỉ thí ngoài võ đài bị từ chối.
    await say(b.room, 'tp 2048 2455');
    await say(a.room, 'tp 2048 2455');
    a.room.send(C.DUEL, { a: 'inv', n: B });
    await W(600);
    check('tỉ thí ngoài võ đài bị từ chối', sysA.includes('duel.not_in_arena') && !duelA);
    // g. Tỉ thí trong võ đài: giữa chừng người thứ ba không can thiệp được; kết thúc không thưởng, không mất gì.
    await say(a.room, 'tp 2048 2088');
    await say(b.room, 'tp 2052 2088');
    await say(c.room, 'tp 2046 2088');
    await say(a.room, 'heal');
    await say(b.room, 'heal');
    const duelInvB: { id: number }[] = [];
    b.room.onMessage(S.INVITE, (m: { id: number; kind: string; gone?: boolean }) => m.kind === 'duel' && !m.gone && duelInvB.push(m));
    a.room.send(C.DUEL, { a: 'inv', n: B });
    await W(600);
    check('lời thách đấu tới đúng người', duelInvB.length === 1);
    const xp0 = ca?.xp ?? 0;
    const gold0 = ca?.gold ?? 0;
    b.room.send(C.DUEL, { a: 'acc', id: duelInvB[0].id });
    await W(500);
    check('chấp nhận thì vào đếm ngược', duelA?.phase === 'count');
    const hpBefore = pb().hp;
    a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
    await W(500);
    check('đang đếm ngược chưa đánh được', pb().hp === hpBefore);
    await W(3200);
    c.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
    await W(400);
    check('người thứ ba không đánh được người đang tỉ thí', pb().hp === hpBefore);
    let min = 1e9;
    for (let i = 0; i < 40 && duelA?.phase !== 'end'; i++) {
      a.room.send(C.SKILL, { id: 'skl_phi_kiem', t: b.init.sid });
      await W(1050);
      min = Math.min(min, pb().hp);
    }
    check('đánh được đối thủ, máu giảm nhưng không chết', min < hpBefore && min >= 1 && (pb().fl & 2) === 0, `thấp nhất ${min}`);
    await say(a.room, 'tp 2048 2088');
    if (duelA?.phase !== 'end') {
      b.room.send(C.DUEL, { a: 'yield' });
      await W(600);
    }
    check('kết thúc rõ ràng, có kết quả gửi cho người chơi', duelA?.phase === 'end' && (pb().fl & 2) === 0);
    check('tỉ thí không cho tu vi hay linh thạch', (ca?.xp ?? 0) === xp0 && (ca?.gold ?? 0) === gold0, `xp ${xp0} → ${ca?.xp}, vàng ${gold0} → ${ca?.gold}`);
    check('người thua không ngã (không mất tu vi), trận hết thì đánh được quái bình thường', !sysB.includes('sys.died') && !sysA.includes('sys.died'));
    void sysC;
    for (const r of [a, b, c]) await r.room.leave(true);
  }

  // 17. Pháp bảo phụ và đan (P3-8): không có pháp bảo thì không kích hoạt; chế pháp bảo thiếu nguyên liệu/cảnh giới/xa NPC bị từ chối;
  // đan phẩm chất do server roll (client gửi phẩm giả bị bỏ qua); spam kích hoạt không làm sập server và không hồi linh lực.
  {
    const g = await join('kt_phapbao');
    const msgs: { k: string; p?: unknown }[] = [];
    let gold = -1;
    let inv: ({ id: string; n: number; plus?: number } | null)[] = [];
    let equip: Record<string, { id: string }> = {};
    let mp = -1;
    let artId = '';
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    g.room.onMessage(S.CHAR, (c: { gold: number; mp: number }) => ((gold = c.gold), (mp = c.mp)));
    g.room.onMessage(S.INV, (m: { inv: typeof inv; equip: typeof equip }) => ((inv = m.inv), (equip = m.equip)));
    g.room.onMessage(S.METHOD, (m: { art?: { id: string } }) => (artId = m.art?.id ?? ''));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1300);
    };
    await chat('/gm level 12');
    await chat('/gm gold 5000');
    const has = (k: string) => msgs.some((m) => m.k === k);
    // Chưa đeo pháp bảo: kích hoạt (kể cả kèm tham số lạ) không làm gì.
    for (const bad of [undefined, {}, { id: 'itm_tu_kim_ho_lo' }, 'art', null]) {
      g.room.send(C.ARTIFACT, bad);
      await W(150);
    }
    check('kích hoạt pháp bảo khi chưa đeo bị từ chối', has('sys.art_none') && !artId, `${JSON.stringify(msgs.map((m) => m.k))} artId=${artId}`);
    // Chế pháp bảo ở xa Thiết lão, thiếu nguyên liệu: từ chối, không mất linh thạch, không ra món nào.
    const gold0 = gold;
    await chat('/gm tp 2200 2400');
    g.room.send(C.CRAFT, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'art-craft-001' });
    await W(500);
    check('chế pháp bảo ở xa NPC bị từ chối', has('sys.too_far') && gold === gold0 && !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo'));
    await chat('/gm tp 2090 2066');
    g.room.send(C.CRAFT, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'art-craft-002' });
    await W(500);
    check('chế pháp bảo thiếu nguyên liệu bị từ chối, không mất linh thạch', has('sys.not_enough_mat') && gold === gold0 && !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo'), `vàng ${gold0} → ${gold}`);
    // Số lượng giả (nhiều món một lần) và công thức không tồn tại.
    for (const bad of [{ id: 'rcp_tu_kim_ho_lo', n: 5, r: 'art-craft-003' }, { id: 'rcp_khong_co', n: 1, r: 'art-craft-004' }, { id: { $ne: 1 }, n: 1, r: 'art-craft-005' }, { id: 'rcp_tu_kim_ho_lo', n: -1, r: 'art-craft-006' }]) {
      g.room.send(C.CRAFT, bad);
      await W(150);
    }
    check('chế pháp bảo với tham số giả không ra món nào', !inv.some((x) => x?.id === 'itm_tu_kim_ho_lo') && gold === gold0);
    // Đan: phẩm giả từ client bị bỏ qua (phẩm do server roll theo ledger).
    await chat('/gm tp 2006 2066');
    await chat('/gm give itm_linh_thao 8');
    g.room.send(C.CRAFT, { id: 'rcp_hoi_xuan_dan', n: 4, r: 'art-pill-001', plus: 2, q: 2, quality: 2 });
    await W(700);
    const pills = inv.filter((x) => x?.id === 'itm_hoi_xuan_dan');
    const total = pills.reduce((a, x) => a + (x?.n ?? 0), 0);
    check('luyện đan ra đúng số lượng, phẩm do server roll', total === 4 && pills.every((x) => (x?.plus ?? 0) >= 0 && (x?.plus ?? 0) <= 2), JSON.stringify(pills));
    // Cùng khóa gửi lại: không luyện thêm.
    g.room.send(C.CRAFT, { id: 'rcp_hoi_xuan_dan', n: 4, r: 'art-pill-001' });
    await W(500);
    check('luyện đan gửi lặp cùng khóa không ra thêm', inv.filter((x) => x?.id === 'itm_hoi_xuan_dan').reduce((a, x) => a + (x?.n ?? 0), 0) === 4);
    // Đeo pháp bảo (GM thử) rồi spam kích hoạt: không crash, linh lực không tăng quá mức tối đa.
    await chat('/gm art itm_thanh_lien_an 2');
    check('đeo được pháp bảo ở ô Pháp bảo phụ', equip.artifact?.id === 'itm_thanh_lien_an' && artId === 'itm_thanh_lien_an');
    for (let i = 0; i < 60; i++) {
      g.room.send(C.ARTIFACT, {});
      await W(10);
    }
    await W(300);
    check('spam kích hoạt pháp bảo không làm sập server', await health() && mp <= 100000);
    await g.room.leave(true);
  }

  // 20. K-2: lướt và hủy chiêu. Spam lướt chỉ ra một lần (khe + hồi chiêu), lướt không xuyên mép bản đồ, lệnh rác không làm sập,
  // người chưa theo công pháp không lướt được, hủy đòn chờ bằng lướt không cho đánh thêm miễn phí.
  {
    const g = await join('kt_luot');
    const pos = () => {
      const pl = (g.room.state as unknown as { players: Map<string, { x: number; z: number }> }).players.get(g.init.sid)!;
      return { x: pl.x, z: pl.z };
    };
    const msgs: { k: string }[] = [];
    g.room.onMessage(S.SYS, (m: { k: string }) => msgs.push(m));
    const chat = async (m: string) => {
      g.room.send(C.CHAT, { m });
      await W(900);
    };
    await chat('/gm level 12');
    await chat('/gm tp 2048 2088');
    // Chưa theo công pháp: lướt của công pháp bị từ chối, vị trí không đổi.
    const p0 = pos();
    g.room.send(C.SKILL, { id: 'skl_kiem_anh_bo' });
    await W(400);
    const p1 = pos();
    check('lướt khi chưa theo công pháp bị từ chối', msgs.some((m) => m.k === 'sys.no_method') && Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.5, `${JSON.stringify(msgs.map((m) => m.k))} di chuyển ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);
    g.room.send(C.METHOD, { method: 'lac_kiem_quyet' });
    await W(500);
    await chat('/gm cd');
    // Spam lướt 30 lệnh: tối đa một lần lướt (≤ 8,5 m), vẫn trong bản đồ.
    const q0 = pos();
    for (let i = 0; i < 30; i++) g.room.send(C.SKILL, { id: 'skl_kiem_anh_bo' });
    await W(700);
    const q1 = pos();
    const moved = Math.hypot(q1.x - q0.x, q1.z - q0.z);
    check('spam lướt chỉ ra một lần (≤ 8,5 m)', moved <= 8.5, `${moved.toFixed(2)} m`);
    // Lệnh rác (kiểu sai, id mảng, mục tiêu đối tượng) không làm sập, không làm di chuyển thêm.
    await W(700);
    for (const bad of [{ id: ['skl_kiem_anh_bo'] }, { id: 'skl_kiem_anh_bo', t: { $gt: '' } }, { id: 'skl_kiem_anh_bo', t: 12345 }, { id: { toString: 1 } }, null, 7]) g.room.send(C.SKILL, bad as never);
    await W(500);
    const q2 = pos();
    check('lệnh lướt rác bị bỏ qua (còn hồi chiêu), không di chuyển thêm', Math.hypot(q2.x - q1.x, q2.z - q1.z) < 0.5);
    check('server vẫn sống sau lệnh lướt rác', await health());
    // Hủy chiêu bằng lướt: bấm một đòn rồi lướt ngay, lặp lại: hồi chiêu vẫn giữ, không đánh thêm miễn phí → chỉ cần không crash và vị trí trong bản đồ.
    await chat('/gm cd');
    await chat('/gm spawn mon_soi_xam 3');
    for (let i = 0; i < 6; i++) {
      g.room.send(C.SKILL, { id: 'skl_kiem_khi_tram' });
      g.room.send(C.SKILL, { id: 'skl_kiem_anh_bo' });
      g.room.send(C.SKILL, { id: 'skl_phi_kiem' });
      await W(120);
    }
    await W(600);
    const q3 = pos();
    check('hủy chiêu bằng lướt dồn dập: vị trí hợp lệ, server sống', Number.isFinite(q3.x) && q3.x > 0 && q3.z > 0 && (await health()));
    // Dọn sói vừa gọi: chúng không hồi sinh, không tự tan, và đứng ngay sân tông môn nên sẽ đánh người thử ở ca sau (Truyền Tống bị chặn vì "đang giao chiến").
    await chat('/gm killall');
    // Lướt ra mép bản đồ không ra ngoài.
    await chat('/gm tp 2 2');
    await chat('/gm cd');
    for (let i = 0; i < 4; i++) {
      g.room.send(C.SKILL, { id: 'skl_luu_huong_bo' });
      await W(500);
    }
    const q4 = pos();
    check('lướt ở mép bản đồ không ra ngoài', q4.x >= 0 && q4.z >= 0 && q4.x <= 4096 && q4.z <= 4096, `${q4.x.toFixed(1)}, ${q4.z.toFixed(1)}`);
    await g.room.leave(true);
  }

  // 21. AOI (M-2): client chỉ nhận quái/người trong tầm; ở xa thì không thấy (cheat không dò được quái ngoài tầm qua state), vẫn đánh được quái trong tầm,
  // đồng đội cùng tổ đội luôn thấy, tới gần thì thấy nhau.
  {
    const A = await join('kt_aoi_a');
    const B = await join('kt_aoi_b');
    type Ent = { x: number; z: number; hp?: number; t?: string };
    const mons = (g: { room: Room }) => new Map([...(g.room.state as unknown as { monsters: Map<string, Ent> }).monsters].filter(([, m]) => !!m.t));
    const plrs = (g: { room: Room }) => new Map([...(g.room.state as unknown as { players: Map<string, Ent & { name?: string }> }).players].filter(([, p]) => !!p.name));
    const chat = async (g: { room: Room }, m: string) => {
      g.room.send(C.CHAT, { m });
      await W(1000);
    };
    await chat(A, '/gm tp thung_lung');
    await chat(B, '/gm tp ho');
    await W(900);
    const total = ((await (await fetch(HTTP + '/health')).json()) as { rooms: { monsters: number }[] }).rooms.reduce((n, r) => n + r.monsters, 0);
    const me = plrs(A).get(A.init.sid)!;
    let worst = 0;
    for (const m of mons(A).values()) worst = Math.max(worst, Math.hypot(m.x - me.x, m.z - me.z) - (m.t?.startsWith('boss_') ? 330 : 190));
    check('AOI: client chỉ nhận quái trong tầm (không quái ngoài AOI_OUT)', mons(A).size > 0 && worst <= 5, `${mons(A).size}/${total} quái, vượt tầm ${worst.toFixed(0)} m`);
    check('AOI: số quái nhận được ít hơn nửa tổng số', total > 100 && mons(A).size < total / 2, `${mons(A).size}/${total}`);
    check('AOI: thấy chính mình, không thấy người ở xa', plrs(A).has(A.init.sid) && !plrs(A).has(B.init.sid) && !plrs(B).has(A.init.sid), `A thấy ${plrs(A).size} người`);
    // Vẫn đánh được quái trong tầm: chọn con gần nhất trong state, bắn phi kiếm, máu giảm.
    let nearest: [string, Ent] | undefined;
    for (const e of mons(A).entries()) if (!nearest || Math.hypot(e[1].x - me.x, e[1].z - me.z) < Math.hypot(nearest[1].x - me.x, nearest[1].z - me.z)) nearest = e;
    if (nearest) {
      const [id, m0] = nearest;
      await chat(A, `/gm tp ${Math.round(m0.x)} ${Math.round(m0.z) - 4}`);
      await chat(A, '/gm god on');
      const hp0 = mons(A).get(id)?.hp ?? 0;
      A.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
      await W(1400);
      const hp1 = mons(A).get(id)?.hp ?? 0;
      check('AOI: vẫn nhắm và đánh được quái trong tầm', hp1 < hp0, `${hp0} → ${hp1}`);
    }
    // Quái ngoài tầm không nhắm được dù biết id (server từ chối vì ngoài tầm đánh), không lỗi.
    const farId = [...mons(B).keys()][0] ?? 'm1';
    A.room.send(C.SKILL, { id: 'skl_phi_kiem', t: farId });
    await W(300);
    check('AOI: server vẫn sống sau lệnh nhắm quái ngoài tầm', await health());
    // Mất kết nối rồi nối lại giữa lúc quái đang vào/ra tầm: view giữ nguyên, không lỗi giải mã (refId not found), vẫn thấy quái trong tầm.
    {
      let decodeErr = 0;
      const warn = console.warn;
      const err = console.error;
      const hook = (...a: unknown[]) => {
        if (a.some((x) => typeof x === 'string' && x.includes('refId'))) decodeErr++;
      };
      console.warn = (...a: unknown[]) => (hook(...a), undefined);
      console.error = (...a: unknown[]) => (hook(...a), undefined);
      try {
        const token = (A.room as unknown as { reconnectionToken: string }).reconnectionToken;
        const ws = (A.room.connection as unknown as { transport?: { ws?: { terminate?: () => void; close?: () => void } } }).transport?.ws;
        (ws?.terminate ?? ws?.close)?.call(ws);
        await W(700);
        const again = await new Client(WS).reconnect(token);
        again.onMessage('*', () => {});
        await W(1500);
        const st = again.state as unknown as { monsters: Map<string, Ent> };
        const n = [...st.monsters.values()].filter((m) => !!m.t).length;
        check('AOI: nối lại sau khi mất kết nối vẫn thấy quái trong tầm, không lỗi giải mã', n > 0 && decodeErr === 0, `${n} quái, ${decodeErr} lỗi refId`);
        A.room = again;
      } catch (e) {
        check('AOI: nối lại sau khi mất kết nối vẫn thấy quái trong tầm, không lỗi giải mã', false, String((e as Error).message ?? e));
      } finally {
        console.warn = warn;
        console.error = err;
      }
    }
    // Tới gần nhau thì thấy nhau.
    const here = plrs(A).get(A.init.sid)!;
    await chat(B, `/gm tp ${Math.round(here.x) + 5} ${Math.round(here.z)}`);
    await W(900);
    check('AOI: tới gần nhau thì thấy nhau', plrs(A).has(B.init.sid) && plrs(B).has(A.init.sid));
    await A.room.leave(true);
    await B.room.leave(true);
  }

  // 13. Tham số kiểm thử ?god / ?at (M1-10): tài khoản thử dùng được; server production / có Google thì không.
  await testParamsChecks();

  // 12. Thân request /matchmake quá lớn bị từ chối (Colyseus gom cả thân vào bộ nhớ).
  {
    const r = await fetch(HTTP + '/matchmake/joinOrCreate/world', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'x'.repeat(64 * 1024) }) });
    await r.arrayBuffer();
    check('thân /matchmake quá lớn bị từ chối 413', r.status === 413, `HTTP ${r.status}`);
  }

  // 14. Truyền Tống Trận và điểm đánh dấu (M-4): server quyết định mở khóa, giao chiến, spam, kiểu gửi lạ, chia sẻ chỉ trong tổ đội.
  {
    const ta = await join('tele' + tag + 'a');
    const tb = await join('tele' + tag + 'b');
    interface TeleV {
      open: string[];
      cast: { id: string; ms: number } | null;
      cd: number;
    }
    let teleA = null as TeleV | null;
    const sysA: string[] = [];
    let teleMsgs = 0;
    ta.room.onMessage(S.TELE, (m: TeleV) => {
      teleA = m;
      teleMsgs++;
    });
    ta.room.onMessage(S.SYS, (m: { k: string }) => sysA.push(m.k));
    let marksA = 0;
    let marksB = 0;
    ta.room.onMessage(S.MARK, () => marksA++);
    tb.room.onMessage(S.MARK, () => marksB++);
    const sayT = async (r: Room, cmd: string) => {
      r.send(C.CHAT, { m: '/gm ' + cmd });
      await W(900);
    };
    const mp = (r: Room, sid: string) => (r.state as { players: Map<string, P> }).players.get(sid)!;
    await sayT(ta.room, 'level 12');
    await sayT(ta.room, 'god off');
    await sayT(ta.room, 'tele none');
    await sayT(ta.room, 'tp 2048 2088');
    await sayT(ta.room, 'heal');
    const start = { x: mp(ta.room, ta.init.sid).x, z: mp(ta.room, ta.init.sid).z };
    const moved = () => Math.hypot(mp(ta.room, ta.init.sid).x - start.x, mp(ta.room, ta.init.sid).z - start.z);
    // a. Trận chưa mở khóa, id lạ, sai kiểu: không niệm, không dịch chuyển, server sống.
    for (const m of [{ id: 'tp_thung_lung' }, { id: '../../etc' }, { id: 5 }, { id: ['tp_ho'] }, null, 'x']) {
      ta.room.send(C.TELE, m);
      await W(450);
    }
    await W(3600);
    check('trận chưa mở khóa / id lạ / sai kiểu: không niệm, không dịch chuyển', moved() < 3 && !teleA?.cast && (await health()), `lệch ${moved().toFixed(1)} m, thông báo: ${[...new Set(sysA)].join(',')}`);
    // b. Mở khóa rồi niệm đủ: dịch chuyển; hồi chiêu chặn lần sau.
    await sayT(ta.room, 'tele tp_thung_lung');
    await W(500);
    ta.room.send(C.TELE, { id: 'tp_thung_lung' });
    await W(3800);
    const dest = { x: mp(ta.room, ta.init.sid).x, z: mp(ta.room, ta.init.sid).z };
    check('niệm đủ 3 giây thì tới trận đã mở khóa', Math.hypot(dest.x - 2010, dest.z - 2375) < 20, `(${dest.x.toFixed(0)}, ${dest.z.toFixed(0)})`);
    check('sau khi tới có hồi chiêu', (teleA?.cd ?? 0) > 20_000, `cd ${teleA?.cd}`);
    await sayT(ta.room, 'tele cd');
    // c. Giao chiến thật (tự đánh một con sói): bắt đầu niệm rồi ra chiêu thì lượt niệm bị hủy; đang giao chiến thì không bắt đầu niệm được.
    await sayT(ta.room, 'tp 2048 2088');
    await sayT(ta.room, 'tele all');
    await sayT(ta.room, 'spawn mon_soi_xam 1');
    await W(800);
    const wolf = [...(ta.room.state as { monsters: Map<string, M> }).monsters.entries()].filter(([, m]) => m.t === 'mon_soi_xam' && m.st !== MS_DEAD).sort((x, y) => Math.hypot(x[1].x - 2048, x[1].z - 2088) - Math.hypot(y[1].x - 2048, y[1].z - 2088))[0];
    if (!wolf) check('dựng được sói để thử giao chiến', false);
    else {
      // Đứng cách 20 m: ngoài tầm phát hiện của sói (aggro 12 m) nên nó chưa đánh trước, vẫn trong tầm 26 m của skl_phi_kiem.
      await sayT(ta.room, `tp ${wolf[1].x.toFixed(1)} ${(wolf[1].z + 20).toFixed(1)}`);
      await W(1500);
      const here = { x: mp(ta.room, ta.init.sid).x, z: mp(ta.room, ta.init.sid).z };
      sysA.length = 0;
      ta.room.send(C.TELE, { id: 'tp_ho' });
      await W(700);
      const casting = !!teleA?.cast;
      ta.room.send(C.SKILL, { id: 'skl_phi_kiem', t: wolf[0] });
      await W(4200);
      const p1 = { x: mp(ta.room, ta.init.sid).x, z: mp(ta.room, ta.init.sid).z };
      check('đang niệm mà ra chiêu đánh quái: lượt niệm bị hủy, không dịch chuyển', casting && Math.hypot(p1.x - 1580, p1.z - 2070) > 100 && sysA.includes('sys.tele_broken'), `niệm ${casting ? 'có' : 'không'}, (${p1.x.toFixed(0)}, ${p1.z.toFixed(0)}), sys ${[...new Set(sysA)].join(',')}`);
      // Vừa đánh xong (đang trong cửa sổ giao chiến): không bắt đầu niệm được.
      await sayT(ta.room, 'heal');
      ta.room.send(C.SKILL, { id: 'skl_phi_kiem', t: wolf[0] });
      await W(300);
      sysA.length = 0;
      ta.room.send(C.TELE, { id: 'tp_ho' });
      await W(700);
      check('đang giao chiến: không bắt đầu niệm Truyền Tống', !teleA?.cast && sysA.includes('sys.tele_combat'), `cast ${teleA?.cast ? 'có' : 'không'}, sys ${[...new Set(sysA)].join(',')}`);
      void here;
    }
    await sayT(ta.room, 'killall');
    await sayT(ta.room, 'heal');
    await W(11000);
    // d. Spam lệnh: server giãn lệnh, không tạo hàng loạt thông báo.
    const t0 = teleMsgs;
    for (let i = 0; i < 80; i++) ta.room.send(C.TELE, { id: 'tp_rung' });
    await W(600);
    check('spam 80 lệnh tele chỉ sinh vài trạng thái', teleMsgs - t0 <= 4 && (await health()), `${teleMsgs - t0} tin`);
    ta.room.send(C.TELE, {});
    await W(500);
    // e. Điểm đánh dấu: kiểu lạ / ngoài vùng bị bỏ qua; spam bị giãn; không cùng tổ đội thì người khác không thấy.
    const m0 = marksA;
    for (const m of [{ x: NaN, z: 1 }, { x: 'a', z: 1 }, { x: 1e9, z: 0 }, { x: 0, z: 0 }, { x: 2100 }, null, 'x', [1, 2]]) {
      ta.room.send(C.MARK, m);
      await W(1050);
    }
    check('điểm đánh dấu sai kiểu / ngoài vùng chơi bị bỏ qua', marksA === m0 && (await health()), `${marksA - m0} tin`);
    const m1 = marksA;
    for (let i = 0; i < 60; i++) ta.room.send(C.MARK, { x: 2100 + i, z: 2100 });
    await W(1300);
    check('spam 60 lệnh đánh dấu chỉ sinh ≤ 2 tin cho chủ điểm', marksA - m1 <= 2 && marksA - m1 >= 1, `${marksA - m1} tin`);
    check('người ngoài tổ đội không thấy điểm đánh dấu của người khác', marksB === 0, `${marksB} tin`);
    ta.room.send(C.MARK, { clear: true });
    await W(1200);
    await ta.room.leave(true);
    await tb.room.leave(true);
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

/** Cổng TCP trống (để server tạm không đụng server của worktree khác). */
function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

/**
 * Dựng tạm một server với `env` (DB tạm, cổng trống), chạy `fn` rồi tắt. AUTH_DEV_BYPASS=1 luôn được bật
 * để chứng minh chốt chặn trong config.ts thắng (giống lỡ mang .env.local lên VPS).
 */
async function withServer(env: Record<string, string>, fn: (http: string) => Promise<void>): Promise<void> {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-sec-'));
  const port = await freePort();
  const childEnv: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), DB_FILE: path.join(tmp, 'game.db'), AUTH_DEV_BYPASS: '1', ...env };
  delete childEnv.RATE_LIMIT_EXEMPT;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: serverDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const http = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up && child.exitCode === null; i++) {
      await W(500);
      up = await fetch(http + '/health').then((r) => r.ok, () => false);
    }
    if (!up) throw new Error(`server tạm không lên (${JSON.stringify(env)}):
${log.slice(-800)}`);
    await fn(http);
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode !== null ? r(null) : child.once('exit', r)));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testParamsChecks(): Promise<void> {
  // a) Tài khoản thử trên server dev: ?at đưa tới điểm đặt tên, ?god không mất máu dù bị quái đánh.
  {
    const client = new Client(WS);
    const room = await client.joinOrCreate(ROOM_WORLD, { dev: 'kiemthu_god', god: true, at: 'thung_lung' });
    const init = await new Promise<InitMsg>((res) => room.onMessage(S.INIT, res));
    let hits = 0;
    room.onMessage(S.DMG, (m: { dst: string; n: number }) => {
      if (m.dst === init.sid && m.n > 0) hits++;
    });
    room.onMessage('*', () => {});
    await W(500);
    const me = () => (room.state as { players: Map<string, P> }).players.get(init.sid)!;
    check('?at=thung_lung đưa tài khoản thử tới thung lũng', Math.hypot(me().x - 2048, me().z - 2400) < 3, `(${me().x.toFixed(0)}, ${me().z.toFixed(0)})`);
    // Đứng yên giữa 4 con sói vừa gọi (cách 10 m, trong tầm phát hiện 12 m). Trước đây dịch chuyển sang (2048, 2455) rồi
    // trông vào sói của bãi quái gần đó; sau M-1 bãi quái đổi chỗ nên có lượt không con nào tới đánh.
    room.send(C.CHAT, { m: '/gm spawn mon_soi_xam 4' });
    await W(900);
    let low = me().hp;
    const mhp = me().hp;
    for (let i = 0; i < 16; i++) {
      await W(500);
      low = Math.min(low, me().hp);
    }
    check('?god: bị đánh nhưng không mất máu', hits > 0 && low === mhp, `${hits} đòn trúng, máu thấp nhất ${low}/${mhp}`);
    room.send(C.CHAT, { m: '/gm killall' });
    await W(300);
    await room.leave(true);
  }

  // b) ?at lạ / sai kiểu không làm gì (và không làm sập room).
  for (const at of ['__proto__', 'khong_co', { x: 1 }, 'a'.repeat(5000)]) {
    let ok = false;
    try {
      const r = await new Client(WS).joinOrCreate(ROOM_WORLD, { dev: 'kiemthu_at', at });
      const init = await new Promise<InitMsg>((res) => r.onMessage(S.INIT, res));
      r.onMessage('*', () => {});
      await W(300);
      const p = (r.state as { players: Map<string, P> }).players.get(init.sid);
      ok = !!p && Number.isFinite(p.x);
      await r.leave(true);
    } catch {
      ok = true; // bị từ chối hẳn cũng được
    }
    check(`?at không hợp lệ bị bỏ qua (${JSON.stringify(at).slice(0, 20)})`, ok && (await health()));
  }

  // c) Server production / đã cấu hình Google (kể cả lỡ để AUTH_DEV_BYPASS=1): đăng nhập thử kèm ?god/?at
  //    và token giả kèm ?god/?at đều bị từ chối, không có đường tắt.
  //    Tài khoản Google thật xin ?god/?at bị bỏ qua: xem apps/server/src/testflags.test.ts (cần token thật mới chạy được ở đây).
  const envs: Record<string, string>[] = [{ GOOGLE_CLIENT_ID: 'security-check.apps.googleusercontent.com' }, { NODE_ENV: 'production', GOOGLE_CLIENT_ID: '' }];
  for (const env of envs) {
    const tag = env.NODE_ENV ? 'NODE_ENV=production' : 'có GOOGLE_CLIENT_ID';
    await withServer(env, async (http) => {
      const ws = http.replace(/^http/, 'ws');
      for (const opts of [{ dev: 'kiemthu', god: true, at: 'boss' }, { token: 'a.b.c', god: true, at: 'boss' }]) {
        let code: number | undefined;
        let joined = false;
        try {
          const r = await new Client(ws).joinOrCreate(ROOM_WORLD, opts);
          joined = true;
          await r.leave(true);
        } catch (e) {
          code = (e as { code?: number }).code;
        }
        check(`${tag}: ${opts.dev ? 'đăng nhập thử' : 'token giả'} kèm ?god/?at bị từ chối`, !joined, `mã ${code}`);
      }
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
