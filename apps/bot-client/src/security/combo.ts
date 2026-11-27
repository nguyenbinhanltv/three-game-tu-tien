// Bài kiểm tra bảo mật: chuỗi đòn thường hành động (Dạ Cảnh). Server giữ nhịp: bấm dồn không ra đòn nhanh hơn khóa của từng đòn,
// bộ đệm chỉ giữ một lệnh, lệnh rác không làm sập. Chạy riêng: SECURITY_ONLY=combo pnpm --filter @dtl/bot-client security.
import { C, S, type FxMsg } from '@dtl/shared';
import { SKILL } from '@dtl/content';
import { W, check, health, join, type M } from './lib';

export async function runCombo(): Promise<void> {
  const g = await join('kt_chuoi');
  const mons = () => (g.room.state as unknown as { monsters: Map<string, M> }).monsters;
  const me = () => (g.room.state as unknown as { players: Map<string, { x: number; z: number }> }).players.get(g.init.sid)!;
  const swings: number[] = [];
  g.room.onMessage(S.FX, (m: FxMsg) => {
    if (m.t === 'sword' && m.src === g.init.sid) swings.push(Date.now());
  });
  const sys: string[] = [];
  g.room.onMessage(S.SYS, (m: { k: string }) => sys.push(m.k));
  const gm = async (cmd: string) => {
    g.room.send(C.CHAT, { m: '/gm ' + cmd });
    await W(900);
  };
  // Nhân vật cấp thấp đánh một tinh anh vừa gọi ra: máu đủ dày để quái không chết giữa bài (đòn hủy vì mục tiêu chết sẽ làm sai phép đếm).
  await gm('level 3');
  await gm('tp 2048 2095');
  await gm('spawn clear');
  await gm('spawn elite_liet_cot_bao 1');
  await gm('god on');
  await W(900);
  // Mục tiêu là đúng con tinh anh vừa gọi (theo loại), gần mình nhất.
  let near: [string, M] | undefined;
  const p = me();
  for (const e of mons().entries()) {
    if (e[1].t !== 'elite_liet_cot_bao') continue;
    if (!near || Math.hypot(e[1].x - p.x, e[1].z - p.z) < Math.hypot(near[1].x - p.x, near[1].z - p.z)) near = e;
  }
  if (!near) {
    check('chuỗi đòn: có quái để thử', false, 'không gọi được quái thử');
    return;
  }
  const [id] = near;

  // 1. Bấm dồn 10 lệnh/giây trong 3 giây (dưới trần 12 lệnh/giây): số đòn không vượt nhịp khóa của chuỗi.
  const hits = SKILL.get('skl_phi_kiem')!.combo!.hits;
  const cycle = hits.reduce((n, h) => n + (h.lock ?? 1), 0);
  const DUR = 3000;
  // Số đòn tối đa trong DUR ms khi mỗi đòn bắt đầu đúng lúc hết khóa đòn trước (nới 60 ms mỗi đòn như server), +1 cho đòn đang chờ trúng ở mép cửa sổ.
  let t = 0;
  let max = 0;
  for (let i = 0; t < DUR / 1000; i++) {
    max++;
    t += (hits[i % hits.length]!.lock ?? 1) - 0.06;
  }
  swings.length = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < DUR) {
    g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
    await W(100);
  }
  await W(700);
  const n = swings.length;
  if (!n)
    console.log('  [combo] tin hệ thống:', [...new Set(sys)].join(', '), '| mục tiêu', id, mons().get(id)?.t, '| quái thấy', mons().size);
  check(
    'chuỗi đòn: bấm dồn 3 giây không ra nhiều đòn hơn nhịp khóa cho phép',
    n <= max + 1,
    `${n} đòn, trần ${max + 1} (vòng chuỗi ${cycle.toFixed(2)} s)`,
  );
  check('chuỗi đòn: đánh liền tay nhanh hơn GCD 1 giây (chuỗi thật sự chạy)', n >= 5, `${n} đòn trong 3 giây`);
  // Khe nhỏ nhất giữa hai đòn liên tiếp không nhỏ hơn khóa ngắn nhất trừ sai số tick 50 ms + nới 60 ms.
  let minGap = Infinity;
  for (let i = 1; i < swings.length; i++) minGap = Math.min(minGap, swings[i]! - swings[i - 1]!);
  const minLock = Math.min(...hits.map((h) => (h.lock ?? 1) * 1000));
  check(
    'chuỗi đòn: khe giữa hai đòn không ngắn hơn khóa của đòn',
    swings.length < 2 || minGap >= minLock - 170,
    `khe nhỏ nhất ${minGap} ms, khóa ${minLock} ms`,
  );

  // 2. Bộ đệm chỉ giữ MỘT lệnh: dội 11 lệnh trong một nhịp rồi ngừng → nhiều nhất 2 đòn (đòn đang được phép + một đòn đệm).
  await W(1500);
  swings.length = 0;
  for (let i = 0; i < 11; i++) g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
  await W(1600);
  check(
    'chuỗi đòn: dội lệnh một nhịp ra tối đa 2 đòn (bộ đệm không cộng dồn)',
    swings.length >= 1 && swings.length <= 2,
    `${swings.length} đòn`,
  );

  // 3. Né ngay sau khi bấm đệm: đòn đệm không tự ra sau khi đã né.
  await W(1500);
  swings.length = 0;
  g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
  await W(250);
  g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
  g.room.send(C.DODGE, {});
  await W(1200);
  check('chuỗi đòn: né xóa đòn đang đệm', swings.length <= 1, `${swings.length} đòn`);

  // 5. Hướng cận chiến (Kiếm tu): đòn thường chỉ ra khi đã áp sát; client có tự áp sát hay không thì server vẫn tự kiểm tầm.
  // Đóng băng quái để nó đứng yên trong lúc đo (cờ của cả room: tắt lại ngay sau bài).
  await W(1500);
  await gm('method lac_kiem_quyet 1');
  await gm('freeze on');
  try {
    const tgt = mons().get(id);
    if (!tgt) check('cận chiến: còn quái để thử', false, 'quái thử đã biến mất');
    else {
      await gm(`tp ${Math.round(tgt.x + 16)} ${Math.round(tgt.z)}`);
      swings.length = 0;
      sys.length = 0;
      g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
      await W(900);
      check(
        'cận chiến: đứng xa 16 m bấm đòn thường thì không ra đòn (server kiểm tầm theo hướng tu)',
        swings.length === 0 && sys.includes('sys.out_of_range'),
        `${swings.length} đòn, tin: ${[...new Set(sys)].join(', ') || 'không'}`,
      );
      await gm(`tp ${Math.round(tgt.x + 3)} ${Math.round(tgt.z)}`);
      swings.length = 0;
      g.room.send(C.SKILL, { id: 'skl_phi_kiem', t: id });
      await W(900);
      check('cận chiến: áp sát 3 m thì ra đòn', swings.length === 1, `${swings.length} đòn`);
    }
  } finally {
    await gm('freeze off');
  }

  // 4. Lệnh rác quanh chuỗi không làm sập.
  for (const bad of [
    { id: 'skl_phi_kiem', t: 123 },
    { id: 'skl_phi_kiem', t: id, ci: 99, lock: 0 },
    { id: 'skl_phi_kiem', ax: NaN, az: Infinity },
    null,
  ])
    g.room.send(C.SKILL, bad as never);
  await W(400);
  check('chuỗi đòn: server vẫn sống sau lệnh rác', await health());
  // Dọn con tinh anh đã gọi: để lại thì nó đánh nhân vật của bài kế tiếp đứng gần đó (bài tâm ma bị server từ chối vì đang giao chiến).
  await gm('spawn clear');
  g.room.leave();
}
