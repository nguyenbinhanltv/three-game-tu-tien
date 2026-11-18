// Quái, tinh anh, boss của một level trong game thật (E2-B/E3-B/E4-B): đứng ở đúng bãi của nó, gọi một con bằng `/gm spawn`,
// chụp dãy khung lúc ra chiêu (vạch báo) và lúc chết; boss chụp thêm hai pha máu thấp. Danh sách quái lấy từ dữ liệu level.
import { levelSpawns } from '@dtl/shared';
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, faceMonster, gm, hazards, monsters, resetHazards, skipCutscene, waitHazard } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'mons',
  desc: 'Quái/tinh anh/boss của một level: vạch báo chiêu + cảnh chết, boss thêm pha máu thấp (duyệt quái mới, soát VFX quái)',
  usage: '[--level thien_khuyet] [--only id,id] [--frames 6]',
  async run(r) {
    const level = opt('--level', 'thien_khuyet');
    const only = list('--only', '');
    const spots = new Map<string, { x: number; z: number; lv: number }>();
    for (const s of levelSpawns(requireLevel(level))) if (!spots.has(s.mon)) spots.set(s.mon, { x: s.x, z: s.z, lv: s.levelMax });
    const { page } = await r.open({ name: 'Mons', quality: 'high', query: { quiet: 1 }, extra: opt('--query', ''), hide: 'chat' });
    await gm(page, 'level 28');
    await gm(page, 'god on');
    await enterLevel(page, level);
    const log: Record<string, unknown> = {};
    for (const [mon, at] of spots) {
      if (only.length && !only.includes(mon)) continue;
      const boss = mon.startsWith('boss_');
      const view = { pitch: 0.42, dist: boss ? 24 : mon.startsWith('elite_') ? 10 : 7 };
      // Boss: pha đầu, rồi hạ máu xuống 65% và 25% để thấy chiêu của pha sau.
      for (const phase of boss ? ['', 'hurt 65', 'hurt 25'] : ['']) {
        const tag = `${mon}${phase ? '-' + phase.replace(' ', '') : ''}`;
        let seen = false;
        // Chập chờn (quái áp sát trước khi ra chiêu): thử lại tối đa 3 lần.
        for (let attempt = 0; attempt < 3 && !seen; attempt++) {
          await gm(page, `level ${Math.max(at.lv, 1)}`, 900);
          await gm(page, 'killall', 800);
          await gm(page, `tp ${Math.round(at.x)} ${Math.round(at.z + 10)}`, 2500);
          await gm(page, 'killall', 600);
          await gm(page, 'heal', 400);
          await gm(page, 'god on', 400);
          await resetHazards(page);
          await cam(page, { ...view, yaw: Math.PI });
          await gm(page, `spawn ${mon} 1`, 3000);
          if (phase) await gm(page, phase, 700);
          await faceMonster(page, mon, view);
          seen = await waitHazard(page, boss ? 25_000 : 12_000);
        }
        await skipCutscene(page, 20);
        // Quái chỉ đánh thường/bắn đạn không có vạch báo: vẫn chụp dãy khung lúc giao chiến.
        const t0 = Date.now();
        for (let i = 0; i < num('--frames', 6); i++)
          await snap(page, r.out, `${tag}-${seen ? 'skill' : 'fight'}-${i}-t${Date.now() - t0}.jpg`, { wait: 250 });
        log[tag] = { telegraph: seen, hazards: await hazards(page) };
      }
      // Boss chặn sát thương ở ngưỡng pha: hạ nhiều lượt tới khi chết, rồi chụp từ lúc ngã.
      for (let k = 0; k < (boss ? 10 : 1); k++) {
        await gm(page, 'killall', boss ? 1150 : 300);
        if (!(await monsters(page)).some((m) => m.t === mon)) break;
      }
      for (let i = 0; i < 5; i++) await snap(page, r.out, `${mon}-death-${i}.jpg`, { wait: boss ? 450 : 350 });
      await sleep(600);
    }
    writeJson(r.out, 'hazards.json', log);
  },
} satisfies Scenario;
