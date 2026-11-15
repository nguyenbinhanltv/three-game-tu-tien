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

  // 13. Tham số kiểm thử ?god / ?at (M1-10): tài khoản thử dùng được; server production / có Google thì không.
  await testParamsChecks();

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
    check('?at=thung_lung đưa tài khoản thử tới thung lũng', Math.hypot(me().x - 2048, me().z - 2455) < 3, `(${me().x.toFixed(0)}, ${me().z.toFixed(0)})`);
    room.send(C.CHAT, { m: '/gm spawn mon_soi_xam 4' });
    await W(900);
    room.send(C.CHAT, { m: '/gm tp 2048 2455' });
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
