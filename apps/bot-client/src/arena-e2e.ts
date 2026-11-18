// Kiểm tay E1-F qua Colyseus thật: /gm trib <kiếp> → S.TRANSFER sang room `tribulation` → tribstart + vùng sét → thành công → về room thế giới.
// Chạy: PORT=2621 pnpm --filter @dtl/bot-client exec tsx src/arena-e2e.ts [nguyen_anh|hoa_than] [người_xem]
import { Client, type Room } from 'colyseus.js';
import { C, ROOM_WORLD, S, type FxMsg, type HazardMsg, type TransferMsg } from '@dtl/shared';

const PORT = process.env.PORT ?? '2621';
const WS = `ws://localhost:${PORT}`;
const id = process.argv[2] ?? 'nguyen_anh';
const withGuard = process.argv[3] === 'guard';
const tag = Date.now().toString(36).slice(-4);

const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = Date.now();

async function enter(client: Client, name: string, roomName: string, opts: Record<string, unknown> = {}): Promise<Room> {
  const r = await client.joinOrCreate(roomName, { dev: name, ...opts });
  r.onMessage('*', () => {});
  return r;
}

interface Seen {
  fx: FxMsg[];
  haz: HazardMsg[];
  sys: string[];
  transfer: TransferMsg | null;
}
function watch(r: Room): Seen {
  const s: Seen = { fx: [], haz: [], sys: [], transfer: null };
  r.onMessage(S.FX, (m: FxMsg) => s.fx.push(m));
  r.onMessage(S.HAZARD, (m: HazardMsg) => s.haz.push(m));
  r.onMessage(S.SYS, (m: { k: string }) => s.sys.push(m.k));
  r.onMessage(S.TRANSFER, (m: TransferMsg) => (s.transfer = m));
  return s;
}
const until = async (f: () => boolean, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('hết giờ chờ: ' + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};

async function main() {
  const owner = `ow${tag}`;
  const mate = `gd${tag}`;
  const c1 = new Client(WS);
  const c2 = new Client(WS);
  let r1 = await enter(c1, owner, ROOM_WORLD);
  let s1 = watch(r1);
  let r2: Room | null = null;
  let s2: Seen | null = null;
  if (withGuard) {
    r2 = await enter(c2, mate, ROOM_WORLD);
    s2 = watch(r2);
    // tổ đội: owner mời, mate nhận (lệnh chat /moi, server kiểm)
    let inviteFrom = 0;
    r2.onMessage(S.INVITE, (m: { kind: string; id: number }) => {
      if (m.kind === 'party') inviteFrom = m.id;
    });
    r1.send(C.PARTY, { a: 'inv', n: mate });
    await until(() => inviteFrom > 0, 5000, 'lời mời tổ đội');
    r2.send(C.PARTY, { a: 'acc', id: inviteFrom });
    await new Promise((r) => setTimeout(r, 1000));
    log('đã lập tổ đội');
  }
  r1.send(C.CHAT, { m: '/gm god on' });
  await new Promise((r) => setTimeout(r, 1000));
  r1.send(C.CHAT, { m: `/gm trib ${id}` });
  await until(() => s1.transfer !== null, 8000, 'S.TRANSFER sang room độ kiếp').catch((e) => {
    console.log('sys:', s1.sys.join(','));
    throw e;
  });
  log('TRANSFER', JSON.stringify(s1.transfer));
  if ((s1.transfer as TransferMsg).room !== 'tribulation' || !(s1.transfer as TransferMsg).options.tribRoom)
    throw new Error('transfer không đúng room độ kiếp');
  const opts = s1.transfer!.options;
  const t1 = s1.transfer!;
  await r1.leave(true);
  r1 = await enter(c1, owner, t1.room, { ...opts, god: 1 });
  s1 = watch(r1);
  log('owner vào room', r1.name, r1.roomId);
  let guardRoom: Room | null = null;
  if (withGuard && s2 && s2.transfer) {
    const t2 = s2.transfer as TransferMsg;
    await r2!.leave(true);
    guardRoom = await enter(c2, mate, t2.room, { ...t2.options, god: 1 });
    watch(guardRoom);
    log('hộ pháp vào room', guardRoom.roomId, 'cùng room:', guardRoom.roomId === r1.roomId);
    if (guardRoom.roomId !== r1.roomId) throw new Error('hộ pháp vào room khác');
  } else if (withGuard) log('CẢNH BÁO: hộ pháp không nhận được TRANSFER (tổ đội chưa lập?)');
  await until(() => s1.fx.some((f) => f.t === 'tribstart'), 10_000, 'tribstart');
  const st = s1.fx.find((f) => f.t === 'tribstart')!;
  log('tribstart', JSON.stringify(st));
  const dur = st.d ?? 0;
  await until(() => s1.haz.length > 0, 8000, 'vùng sét đầu tiên');
  log('vùng sét đầu', JSON.stringify(s1.haz[0]));
  // chờ hết kiếp (god bật nên sống) + ascend
  await until(() => s1.fx.some((f) => f.t === 'ascend'), (dur + 15) * 1000, 'ascend').catch((e) => {
    console.log('sys:', s1.sys.join(','));
    throw e;
  });
  log('ascend; số vùng sét', s1.haz.length, 'loại', [...new Set(s1.haz.map((h) => h.kind))].join(','));
  await until(() => s1.transfer !== null, 15_000, 'về room thế giới sau khi xong');
  log('TRANSFER về', JSON.stringify(s1.transfer));
  if ((s1.transfer as TransferMsg | null)?.room !== ROOM_WORLD) throw new Error('không về room world');
  await r1.leave(true);
  const back = await enter(c1, owner, ROOM_WORLD);
  log('đã về', back.name);
  await back.leave(true);
  if (guardRoom) await guardRoom.leave(true).catch(() => {});
  log('OK');
  process.exit(0);
}
main().catch((e) => {
  console.error('LỖI', e);
  process.exit(1);
});
