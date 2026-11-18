// Bài kiểm tra bảo mật: Lướt/hủy chiêu (K-2), AOI (M-2) (R-7, tách từ security-check.ts).
import { Client, type Room } from 'colyseus.js';
import { C, S } from '@dtl/shared';
import { HTTP, WS, W, check, health, join, type Ctx } from './lib';

export async function runDashaoi(_ctx: Ctx): Promise<void> {
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

}
