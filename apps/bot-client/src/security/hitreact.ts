// Bài kiểm tra bảo mật: đẩy lùi/khựng/ngã (Chân Cảnh S1) do server quyết; client không gửi được vị trí sau đẩy lùi hay tự xóa/đặt khựng.
import { C, PF_STAGGER, PLAYER_STAGGER_MAX_MS } from '@dtl/shared';
import { W, check, join, type P } from './lib';

export async function runHitReact(): Promise<void> {
  const { room, init } = await join('kiemthu5');
  const me = () => (room.state as { players: Map<string, P & { fl?: number }> }).players.get(init.sid)!;
  await W(600);
  const x0 = me().x;
  const z0 = me().z;
  // Tin giả: vị trí sau đẩy lùi, đặt/xóa khựng, thêm trường vào input và chiêu. Server chỉ đọc mx/mz/yaw/f.
  for (const type of ['kb', 'knock', 'stagger', 'pos', 'move', 'knockback'])
    room.send(type, { x: x0 + 40, z: z0 + 40, y: 500, ms: 0, until: 0 });
  room.send(C.INPUT, { s: 1, mx: 0, mz: 0, yaw: 0, f: 0, x: x0 + 40, z: z0 + 40, kx: 30, kz: 30, staggerUntil: 0 });
  room.send(C.SKILL, { id: 'skl_phi_kiem', t: 'khong-co', kx: 30, kz: 30, tier: 'finisher' });
  await W(700);
  const d = Math.hypot(me().x - x0, me().z - z0);
  check('tin giả kb/stagger/pos và trường lạ trong input không dời được vị trí', d < 1, `lệch ${d.toFixed(2)} m`);
  check('khựng chỉ do server bật: không có cờ PF_STAGGER khi không bị đánh', ((me().fl ?? 0) & PF_STAGGER) === 0);
  check('trần khựng người chơi ≤ 0,6 s (hằng số dùng chung)', PLAYER_STAGGER_MAX_MS <= 600, String(PLAYER_STAGGER_MAX_MS));
  room.leave();
}
