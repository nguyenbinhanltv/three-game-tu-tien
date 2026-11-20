// Bài kiểm tra bảo mật: Tủ ngoại trang (P4-4). Server quyết định: mở khóa chỉ do server (không có tin nhắn "mở khóa"),
// chọn dáng phải là món đã mở khóa đúng ô, màu chỉ nhận id trong bảng, khóa idem chống phát lại, tin lạ không làm hỏng server.
import { applyInvMsg, C, type Equipment, type InvMsg, type InvSlot, S, type WardrobeMsg } from '@dtl/shared';
import { W, check, health, join, type Ctx, waitUntil } from './lib';

const ROBE = 'itm_bo_y';
/** Đạo bào chưa từng có trong túi của nhân vật thử: không được chọn. */
const FOREIGN_ROBE = 'itm_huyen_van_bao';

export async function runWardrobe(_ctx?: Ctx): Promise<void> {
  const g = await join('kt_tu' + (Date.now() % 100000));
  let wd = null as WardrobeMsg | null;
  let inv: InvSlot[] = [];
  let equip: Equipment = {};
  g.room.onMessage(S.WARDROBE, (m: WardrobeMsg) => {
    wd = m;
  });
  g.room.onMessage(S.INV, (m: InvMsg) => {
    inv = applyInvMsg(inv, m);
    equip = m.equip;
  });
  const chat = async (m: string) => {
    g.room.send(C.CHAT, { m });
    await W(1300);
  };
  const look = () => JSON.stringify(wd?.look ?? null);
  // Mở khóa do server: nhận món thì tủ có món, và server gửi lại tủ cho chủ.
  await chat('/gm give ' + ROBE + ' 1');
  await waitUntil(() => !!wd?.owned.includes(ROBE));
  check('nhận món thì server mở khóa vào tủ và gửi S.WARDROBE', !!wd?.owned.includes(ROBE), JSON.stringify(wd));
  check('chưa nhận thì chưa có trong tủ', !wd?.owned.includes(FOREIGN_ROBE));
  const equipBefore = JSON.stringify(equip);
  const look0 = look();

  // Chọn món CHƯA mở khóa, sai ô, mẫu lạ, kiểu lạ: không đổi gì.
  let n = 0;
  const r = () => 'sec-wd-' + ++n + '-' + Date.now();
  const bads: unknown[] = [
    { slot: 'robe', id: FOREIGN_ROBE, r: r() }, // chưa mở khóa
    { slot: 'head', id: ROBE, r: r() }, // sai ô
    { slot: 'robe', id: 'itm_khong_co', r: r() },
    { slot: 'skin', id: ROBE, r: r() }, // skin không thuộc tủ
    { slot: 'robe', id: 5, r: r() },
    { slot: 'robe', id: ['x'], r: r() },
    { slot: 'robe', id: { a: 1 }, r: r() },
    { slot: 'robe', id: ROBE },
    { slot: 'robe', id: ROBE, r: 5 },
    { slot: 'robe', id: ROBE, r: 'x' },
    { slot: 'robe', id: ROBE, r: 'x'.repeat(500) },
    { slot: '__proto__', id: ROBE, r: r() },
    { slot: 'robe', id: '__proto__', r: r() },
    { slot: 'robe', id: 'x'.repeat(300), r: r() },
    { id: ROBE, r: r() },
    { slot: 'robe', r: r() },
    undefined,
    null,
    'robe',
    7,
    [],
    true,
  ];
  for (const b of bads) {
    g.room.send(C.LOOK_SET, b);
    await W(230);
  }
  await W(400);
  check('chọn món chưa mở khóa / sai ô / kiểu lạ: look không đổi, server sống', look() === look0 && (await health()), look());
  check('tin lạ không mở khóa thêm gì', wd?.owned.length === 1, JSON.stringify(wd?.owned));

  // Tin tự "mở khóa" do client bịa (không có mã như vậy): server bỏ qua.
  for (const t of ['wd', 'unlock', 'lkw', 'lku']) {
    g.room.send(t, { id: FOREIGN_ROBE, owned: [FOREIGN_ROBE] });
    await W(60);
  }
  await W(300);
  check('client không tự mở khóa được (tin lạ bị bỏ qua)', !wd?.owned.includes(FOREIGN_ROBE) && (await health()));

  // Chọn hợp lệ: nhận, không đổi trang bị thật; phát lại cùng khóa không áp dụng lần hai.
  const rk = 'sec-wd-ok-' + Date.now();
  g.room.send(C.LOOK_SET, { slot: 'robe', id: ROBE, r: rk });
  await waitUntil(() => wd?.look.over.robe === ROBE);
  check('chọn món đã mở khóa đúng ô được ghi nhận', wd?.look.over.robe === ROBE, look());
  check('chọn ngoại hình không đổi trang bị thật', JSON.stringify(equip) === equipBefore, JSON.stringify(equip));
  await W(300);
  g.room.send(C.LOOK_SET, { slot: 'robe', id: null, r: rk }); // cùng khóa idem: phải bị chặn
  await W(500);
  check('phát lại cùng khóa idem không áp dụng lần hai', wd?.look.over.robe === ROBE, look());
  await W(300);
  g.room.send(C.LOOK_SET, { slot: 'robe', id: null, r: r() });
  await waitUntil(() => wd?.look.over.robe === undefined);
  check('id null trả về món đang mặc', wd?.look.over.robe === undefined, look());

  // Nhuộm: chỉ id màu trong bảng, đúng 3 phần tử.
  const dyeBads: unknown[] = [
    { dye: ['#ff0000', '#00ff00', '#0000ff'], r: r() },
    { dye: ['attire_sect', 'attire_sect'], r: r() },
    { dye: ['attire_sect', 'attire_sect', 'attire_sect', 'attire_sect'], r: r() },
    { dye: 'attire_sect,attire_sect,attire_sect', r: r() },
    { dye: ['attire_sect', 'attire_sect', 5], r: r() },
    { dye: [null, null, null], r: r() },
    { dye: ['__proto__', 'constructor', 'toString'], r: r() },
    { dye: { 0: 'attire_sect', 1: 'attire_sect', 2: 'attire_sect', length: 3 }, r: r() },
    { r: r() },
    null,
    'dye',
    [],
  ];
  for (const b of dyeBads) {
    g.room.send(C.LOOK_DYE, b);
    await W(230);
  }
  await W(300);
  check('nhuộm màu tự do / sai số kênh / kiểu lạ: không nhận, server sống', wd?.look.dye === undefined && (await health()), look());
  g.room.send(C.LOOK_DYE, { dye: ['attire_sect', 'attire_ivory', 'wood_cinnabar'], r: r() });
  await waitUntil(() => !!wd?.look.dye);
  check('nhuộm ba màu hợp lệ được nhận', wd?.look.dye?.join() === 'attire_sect,attire_ivory,wood_cinnabar', look());
  await W(300);
  g.room.send(C.LOOK_RESET, { r: r() });
  await waitUntil(() => !wd?.look.dye);
  check('reset xóa nhuộm và ghi đè', !wd?.look.dye && Object.keys(wd?.look.over ?? {}).length === 0, look());

  // Spam: 150 tin trong ~1,5 s: server sống, look vẫn hợp lệ, không bị nhân bản/ghi sai.
  for (let i = 0; i < 150; i++) {
    g.room.send(
      i % 2 ? C.LOOK_SET : C.LOOK_DYE,
      i % 2
        ? { slot: 'robe', id: ROBE, r: 'sec-wd-spam-' + i + Date.now() }
        : { dye: ['attire_ink', 'attire_ink', 'attire_ink'], r: 'sec-wd-spam-' + i + Date.now() },
    );
    await W(10);
  }
  await W(1500);
  const sane = !wd || (Object.keys(wd.look.over).every((k) => k === 'robe') && (!wd.look.over.robe || wd.look.over.robe === ROBE));
  check('spam tin tủ: server sống, trạng thái hợp lệ', sane && (await health()), look());
  check('tủ vẫn chỉ có món đã nhận sau spam', wd?.owned.length === 1 && wd.owned[0] === ROBE, JSON.stringify(wd?.owned));
  await g.room.leave(true);
}
