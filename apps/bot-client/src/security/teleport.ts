// Bài kiểm tra bảo mật: Truyền Tống Trận và điểm đánh dấu (M-4) (R-7, tách từ security-check.ts).
import { type Room } from 'colyseus.js';
import { C, MS_DEAD, S } from '@dtl/shared';
import { W, check, health, join, tag, type Ctx, type P, type M } from './lib';

export async function runTeleport(_ctx: Ctx): Promise<void> {
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
    // Không phụ thuộc thời gian: `/gm spawn` đặt sói cách người gọi 8 m, ở p + 8·(sin yaw, cos yaw), và nó đuổi người gọi; nên để tài khoản `tb` gọi sói còn `ta` đứng xa.
    // Sói cần ở W = A + (20, 0) (cách `ta` ở A 20 m: ngoài tầm aggro 12 m, trong tầm 26 m của skl_phi_kiem). Yaw của `tb` đọc từ state (input đứng yên không đổi yaw),
    // rồi đặt `tb` ở W − 8·(sin yaw, cos yaw) trước khi gọi. `tb` bất tử nên sói chỉ đuổi `tb`. Mỗi tài khoản có giới hạn chat riêng nên không vướng 800 ms.
    const WX = 2048 + 20;
    const WZ = 2088;
    const tbYaw = mp(tb.room, tb.init.sid).yaw;
    await sayT(tb.room, 'god on');
    await sayT(tb.room, `tp ${(WX - Math.sin(tbYaw) * 8).toFixed(1)} ${(WZ - Math.cos(tbYaw) * 8).toFixed(1)}`);
    await sayT(tb.room, 'spawn mon_soi_xam 1');
    const here = { x: mp(ta.room, ta.init.sid).x, z: mp(ta.room, ta.init.sid).z };
    const wolf = [...(ta.room.state as { monsters: Map<string, M> }).monsters.entries()].filter(([, m]) => m.t === 'mon_soi_xam' && m.st !== MS_DEAD).sort((x, y) => Math.hypot(x[1].x - WX, x[1].z - WZ) - Math.hypot(y[1].x - WX, y[1].z - WZ))[0];
    if (!wolf) check('dựng được sói để thử giao chiến', false);
    else {
      sysA.length = 0;
      const hp0 = mp(ta.room, ta.init.sid).hp;
      ta.room.send(C.TELE, { id: 'tp_ho' });
      await W(700);
      const casting = !!teleA?.cast;
      // Điều kiện để lượt niệm bị hủy là do chiêu chứ không phải do sói cắn: đang niệm, khí huyết chưa giảm, sói còn cách ta ~20 m (ngoài tầm aggro 12 m).
      const hpBefore = mp(ta.room, ta.init.sid).hp;
      const gap = Math.hypot(wolf[1].x - here.x, wolf[1].z - here.z);
      const clean = casting && hpBefore >= hp0 && gap > 18 && gap < 26 && !sysA.includes('sys.tele_combat');
      check('trước khi ra chiêu: đang niệm, chưa bị đánh, sói cách ~20 m (không đua với sói)', clean, `niệm ${casting ? 'có' : 'không'}, cách sói ${gap.toFixed(1)} m, hp ${hpBefore}`);
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
    }
    await sayT(ta.room, 'killall');
    await sayT(ta.room, 'heal');
    await sayT(tb.room, 'killall');
    await sayT(tb.room, 'tp 2048 2088');
    await sayT(tb.room, 'god off');
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
    // f. Thần thức và bản mệnh pháp bảo (E2-E): chưa Kết Đan thì từ chối hết; Kết Đan rồi thì spam/rác không tạo thêm quét, không tốn thêm linh lực.
    {
      let scans = 0;
      let spiStates = 0;
      ta.room.onMessage(S.SPIRIT_SCAN, () => scans++);
      ta.room.onMessage(S.SPIRIT_STATE, () => spiStates++);
      await sayT(ta.room, 'level 12');
      await sayT(ta.room, 'tp 2048 2088');
      await sayT(ta.room, 'heal');
      await W(400);
      for (let i = 0; i < 60; i++) ta.room.send(C.SPIRIT, { on: true });
      for (let i = 0; i < 60; i++) ta.room.send(C.BONDED, {});
      await W(3200);
      check('chưa Kết Đan: thần thức và Ngưng Đan Lô bị từ chối, không có kết quả quét', scans === 0 && (await health()), `${scans} kết quả quét`);
      await sayT(ta.room, 'level 20');
      await sayT(ta.room, 'god on');
      await W(600);
      for (const m of [null, undefined, 5, 'x', [1], { on: 'yes' }, { on: {} }, { on: 1 }]) {
        ta.room.send(C.SPIRIT, m);
        await W(150);
      }
      await W(3000);
      check('lệnh thần thức sai kiểu bị bỏ qua, không có kết quả quét', scans === 0 && (await health()), `${scans} kết quả quét`);
      const s0 = spiStates;
      for (let i = 0; i < 80; i++) ta.room.send(C.SPIRIT, { on: true });
      await W(3400);
      check('Kết Đan: spam 80 lệnh giữ V chỉ cho đúng một lần quét', scans === 1 && spiStates - s0 <= 4 && (await health()), `${scans} kết quả quét, ${spiStates - s0} trạng thái`);
      for (let i = 0; i < 80; i++) ta.room.send(C.SPIRIT, { on: true });
      await W(3000);
      check('đang hồi chiêu: giữ V lại không quét thêm', scans === 1, `${scans} kết quả quét`);
      for (let i = 0; i < 80; i++) ta.room.send(C.BONDED, {});
      await W(800);
      check('spam 80 lệnh Ngưng Đan Lô: server vẫn sống', await health());
    }
    // g. Nguyên anh xuất khiếu / ngự không / thuấn di (E3-K): chưa Nguyên Anh thì từ chối; rác và spam không sập; dạng nguyên anh không bỏ trốn quá tầm,
    //    không ra chiêu, vị trí lưu là của thân xác; thuấn di không vượt 12 m.
    {
      const souls: { k: number; bx: number; bz: number }[] = [];
      ta.room.onMessage(S.SOUL_STATE, (m: { k: number; bx: number; bz: number }) => souls.push(m));
      const lastK = () => souls.at(-1)?.k ?? 0;
      const mine = () => ta.room.state.players.get(ta.room.sessionId) as { x: number; z: number; fl: number } | undefined;
      await sayT(ta.room, 'level 23');
      await sayT(ta.room, 'tp 2048 2088');
      await W(600);
      for (let i = 0; i < 40; i++) ta.room.send(C.SOUL, {});
      await W(1200);
      check('chưa Nguyên Anh: X bị từ chối', lastK() === 0 && ((mine()?.fl ?? 0) & 128) === 0 && (await health()), `k ${lastK()}`);
      await sayT(ta.room, 'level 24');
      await sayT(ta.room, 'god on');
      await W(600);
      const body = { x: mine()?.x ?? 0, z: mine()?.z ?? 0 };
      ta.room.send(C.SOUL, { on: true });
      await W(700);
      check('xuất khiếu được từ Nguyên Anh', lastK() === 1 && (((mine()?.fl ?? 0) & 128) !== 0));
      // Cố chạy thật xa bằng input (không giới hạn phía client).
      let seq = 1000;
      for (let i = 0; i < 90; i++) {
        ta.room.send(C.INPUT, { s: seq++, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 0 });
        await W(55);
      }
      const d = Math.hypot((mine()?.x ?? 0) - body.x, (mine()?.z ?? 0) - body.z);
      check('dạng nguyên anh không rời thân xác quá 60 m', d <= 60.6 && (await health()), `${d.toFixed(1)} m`);
      ta.room.send(C.SKILL, { id: 'skl_phi_kiem' });
      await W(600);
      check('dạng nguyên anh: lệnh ra chiêu bị bỏ qua (không vào trạng thái niệm)', (await health()) && ((mine()?.fl ?? 0) & 8) === 0);
      ta.room.send(C.SOUL, { on: false });
      await W(900);
      const back = Math.hypot((mine()?.x ?? 0) - body.x, (mine()?.z ?? 0) - body.z);
      check('nhập lại: về đúng chỗ thân xác', back < 1.5 && lastK() === 0, `${back.toFixed(2)} m`);
      // Đang hồi chiêu (30 s): rác và spam không mở lại được dạng nguyên anh.
      for (const m of [null, undefined, 5, 'x', [1], { on: 'yes' }, { on: {} }, { on: 1 }, { on: NaN }]) {
        ta.room.send(C.SOUL, m);
        await W(450);
      }
      await W(800);
      for (let i = 0; i < 80; i++) ta.room.send(C.SOUL, {});
      await W(1200);
      check('đang hồi chiêu: rác và spam 80 lệnh X không mở lại nguyên anh, server sống', (await health()) && lastK() === 0 && (((mine()?.fl ?? 0) & 128) === 0), `k ${lastK()}`);
    }
    await ta.room.leave(true);
    await tb.room.leave(true);
  }

}
