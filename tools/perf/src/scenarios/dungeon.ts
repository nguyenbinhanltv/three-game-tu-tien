// Phó bản theo dữ liệu (`DungeonDef`: Phục Mạch Quật, Kính Nguyệt Cung, phó bản mới): vào bằng cổng thật ở bản đồ trả về
// (vé một lần), chụp cổng, lúc vào, từng đợt quái, vạch báo và các pha máu của boss, đợt giải đố ba gương, lúc hoàn thành.
import { LEVELS } from '@dtl/content';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, clearMonsters, enterLevel, gm, hazards, info, monsters, resetHazards, skipCutscene, tp, waitHazard, waitLevel, waitMonster } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Thứ tự màu cột gương trong tin hệ thống của đố ba gương (E3-M) ↔ chỉ số điểm trong `puzzle.points`. */
const COLORS = ['Lam', 'Đỏ', 'Vàng'];

export default {
  name: 'dungeon',
  desc: 'Chạy hết một phó bản bằng tài khoản thử bất tử: cổng, từng đợt, vạch báo + pha boss, giải đố, hoàn thành',
  usage: '[--level phuc_mach|kinh_nguyet|<id phó bản>]',
  async run(r) {
    const id = opt('--level', 'phuc_mach');
    const dg = LEVELS[id]?.dungeon;
    const home = dg && LEVELS[dg.returnLevel];
    const portal = home?.portals?.find((p) => p.to === id);
    if (!dg || !portal) throw new Error(`level ${id} không phải phó bản có cổng (có: ${Object.keys(LEVELS).filter((k) => LEVELS[k].dungeon?.waves.length).join(', ')})`);
    const { page } = await r.open({ name: 'Dg', quality: 'high', query: { quiet: 1 }, hide: 'chat' });
    const shot = (name: string, wait = 0) => snap(page, r.out, `${name}.jpg`, { wait });
    const log: Record<string, unknown> = {};
    const c = dg.center;

    await gm(page, `level ${dg.minLevel + 2}`);
    await gm(page, 'god on');
    await enterLevel(page, dg.returnLevel);
    await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
    await cam(page, { pitch: 0.25, dist: 14, yaw: Math.PI });
    await shot('00-cong', 1500);
    await tp(page, portal.x, portal.z);
    await page.keyboard.press('KeyE');
    await waitLevel(page, id);
    await gm(page, 'god on', 1000);
    log.room = (await info(page)).room;
    await shot('01-vao');
    await cam(page, { pitch: 0.62, dist: 46, yaw: 0 });
    await shot('01-toan-canh', 800);
    await gm(page, `tp ${c.x} ${c.z + 26}`, 900);

    for (const [n, wave] of dg.waves.entries()) {
      const tag = `${String(n + 2).padStart(2, '0')}-dot${n + 1}`;
      if (wave.puzzle) {
        // Đố ba gương: đọc thứ tự màu từ tin hệ thống rồi chạm lần lượt ba cột.
        let text = '';
        for (let i = 0; i < 100 && !/thứ tự:/.test(text); i++, await sleep(400)) text = await page.evaluate(() => document.body.innerText);
        await cam(page, { pitch: 0.7, dist: 40, yaw: 0 });
        await shot(`${tag}-do-guong`, 1200);
        const order = /thứ tự:\s*([^.\n]+?)\.\s*Chạm/.exec(text)?.[1] ?? COLORS.join(' → ');
        log[tag] = { order };
        for (const name of order.split('→')) {
          const p = wave.puzzle.points[Math.max(0, COLORS.indexOf(name.trim()))];
          await gm(page, `tp ${p.x} ${p.z}`, 1600);
        }
        await gm(page, `tp ${c.x} ${c.z - 10}`, 1500);
        await shot(`${tag}-giai-xong`);
        continue;
      }
      const lead = wave.mons[wave.mons.length - 1].id;
      const boss = lead.startsWith('boss_');
      if (!(await waitMonster(page, lead, 45_000))) {
        console.log(`[shots:dungeon] ${tag}: không thấy ${lead}; còn ${(await monsters(page)).map((m) => m.t).join(', ') || 'không con nào'}`);
        await shot(`${tag}-MISS`);
        break;
      }
      await skipCutscene(page, 40);
      await gm(page, `tp ${c.x} ${c.z + (boss ? 10 : 20)}`, 900);
      await cam(page, { pitch: boss ? 0.4 : 0.5, dist: boss ? 26 : 22, yaw: 0 });
      await shot(`${tag}-${lead}`, 1800);
      // Vạch báo: quái thường một lượt; boss thêm hai pha máu thấp (65%, 30%).
      for (const [ph, hurt] of (boss ? ['', 'hurt 65', 'hurt 30'] : ['']).entries()) {
        if (hurt) {
          await gm(page, hurt, 900);
          await gm(page, 'heal', 600);
        }
        await resetHazards(page);
        const got = await waitHazard(page, boss ? 22_000 : 8_000);
        for (let i = 0; i < (boss ? 4 : 2); i++) await shot(`${tag}-pha${ph}-${i}`, 300);
        log[`${tag}-pha${ph}`] = { telegraph: got, hazards: await hazards(page) };
      }
      // Không dịch chuyển đi xa lúc dọn: quái mất mục tiêu sẽ bỏ đuổi và miễn sát thương (evade), killall không hạ được.
      await gm(page, 'hurt 1', 900);
      await clearMonsters(page);
      await gm(page, `tp ${c.x} ${c.z + 26}`, 900);
    }
    await shot('99-hoan-thanh', 3500);
    writeJson(r.out, 'dungeon.json', log);
  },
} satisfies Scenario;
