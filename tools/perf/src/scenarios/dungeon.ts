// Phó bản theo dữ liệu (`DungeonDef`: Phục Mạch Quật, Kính Nguyệt Cung, phó bản mới): vào bằng cổng thật ở bản đồ trả về
// (vé một lần), chụp cổng, lúc vào, từng đợt quái, vạch báo và các pha máu của boss, đợt giải đố ba gương, lúc hoàn thành.
import { LEVELS, MONSTER } from '@dtl/content';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import {
  cam,
  clearMonsters,
  enterLevel,
  gm,
  hazards,
  info,
  monsters,
  resetHazards,
  skipCutscene,
  tp,
  waitHazard,
  waitLevel,
  waitMonster,
} from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';
import { at } from '@dtl/shared';

/** Thứ tự màu cột gương trong tin hệ thống của đố ba gương (E3-M) ↔ chỉ số điểm trong `puzzle.points`. */
const COLORS = ['Lam', 'Đỏ', 'Vàng', 'Tím'];

export default {
  name: 'dungeon',
  desc: 'Chạy hết một phó bản bằng tài khoản thử bất tử: cổng, từng đợt, vạch báo + pha boss, giải đố, hoàn thành',
  usage: '[--level phuc_mach|kinh_nguyet|<id phó bản>] [--video 1: quay webm cả lượt vào thư mục --out] [--query cam=iso]',
  async run(r) {
    const id = opt('--level', 'phuc_mach');
    const dg = LEVELS[id]?.dungeon;
    const home = dg && LEVELS[dg.returnLevel];
    const portal = home?.portals?.find((p) => p.to === id);
    if (!dg || !portal)
      throw new Error(
        `level ${id} không phải phó bản có cổng (có: ${Object.keys(LEVELS)
          .filter((k) => at(LEVELS, k, 'LEVELS').dungeon?.waves.length)
          .join(', ')})`,
      );
    const { page } = await r.open({
      name: 'Dg',
      quality: 'high',
      query: { quiet: 1 },
      extra: opt('--query', ''),
      hide: 'chat',
      video: opt('--video', '') ? r.out : undefined,
    });
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
          const p = at(wave.puzzle.points, Math.max(0, COLORS.indexOf(name.trim())), 'wave.puzzle.points');
          await gm(page, `tp ${p.x} ${p.z}`, 1600);
        }
        await gm(page, `tp ${c.x} ${c.z - 10}`, 1500);
        await shot(`${tag}-giai-xong`);
        continue;
      }
      if (wave.seals) {
        // Đợt phong ấn (E4-C): thân xác bị chặn ở hốc; cửa 1 mở bằng nguyên anh xuất khiếu (X) chạm trận môn, các cửa còn lại bằng Phá Ấn Phù.
        const first = at(wave.seals.doors, 0, 'wave.seals.doors');
        const rest = wave.seals.doors.slice(1);
        await gm(page, `tp ${c.x} ${c.z}`, 900);
        await cam(page, { pitch: 0.7, dist: 46, yaw: 0 });
        await shot(`${tag}-phong-an`, 2500);
        await gm(page, `tp ${first.gx} ${first.gz}`, 1200);
        await shot(`${tag}-chan-than-xac`);
        await gm(page, `tp ${first.x} ${first.z + 4}`, 900);
        await page.keyboard.press('KeyX');
        await cam(page, { pitch: 0.5, dist: 16, yaw: 0 });
        await shot(`${tag}-xuat-khieu`, 1500);
        await gm(page, `tp ${first.gx} ${first.gz}`, 1500);
        await shot(`${tag}-cua-1-mo`);
        await page.keyboard.press('KeyX');
        await gm(page, 'bag clear', 800);
        await gm(page, `give itm_pha_an_phu ${rest.length + 1}`, 900);
        for (const [i, d] of rest.entries()) {
          await gm(page, `tp ${d.x} ${d.z + 4}`, 1200);
          // Túi đã dọn: bùa nằm ở một trong vài ô đầu; ô trống bị server bỏ qua nên thử lần lượt.
          for (let slot = 0; slot < 6; slot++, await sleep(250))
            await page.evaluate(([sl, r]) => window.__game!.send('use', { slot: sl, r }), [
              slot,
              `pap-${i}-${slot}-${Date.now()}`,
            ] as const);
          await shot(`${tag}-cua-${i + 2}-pha-an-phu`, 1500);
        }
        log[`${tag}-phong-an`] = { opened: /Ba cửa phong ấn đã mở/.test(await page.evaluate(() => document.body.innerText)) };
        await gm(page, `tp ${c.x} ${c.z}`, 900);
      }
      if (wave.steles) {
        // Đợt giữ bia (DV-3D): đứng trong vòng bia, bỏ đi một lúc cho bia tắt (giới áp), quay lại giữ tiếp tới khi đủ.
        const sl = wave.steles;
        await gm(page, `tp ${sl.x} ${sl.z + 2}`, 900);
        await cam(page, { pitch: 0.55, dist: 30, yaw: 0 });
        await shot(`${tag}-bia-bat-dau`, 2500);
        await sleep(12_000);
        await shot(`${tag}-bia-giu-1`);
        await gm(page, `tp ${sl.x + 40} ${sl.z + 30}`, 900);
        await sleep((sl.grace + 4) * 1000);
        await shot(`${tag}-bia-tat`);
        await gm(page, `tp ${sl.x} ${sl.z + 2}`, 900);
        let done = false;
        for (let i = 0; i < 90 && !done; i++, await sleep(1000)) {
          done = /đã giữ đủ/.test(await page.evaluate(() => document.body.innerText));
          if (i === 20) await shot(`${tag}-bia-giu-2`);
        }
        log[`${tag}-bia`] = { done };
        await shot(`${tag}-bia-xong`, 800);
      }
      const lead = at(wave.mons, wave.mons.length - 1, 'wave.mons').id;
      const boss = lead.startsWith('boss_');
      if (!(await waitMonster(page, lead, 45_000))) {
        console.log(
          `[shots:dungeon] ${tag}: không thấy ${lead}; còn ${(await monsters(page)).map((m) => m.t).join(', ') || 'không con nào'}`,
        );
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
      const rift = MONSTER.get(lead)?.rift;
      if (rift) {
        // Khe mạch (DV-3D): đứng giữa khe để boss đi theo; chú của boss thả trên khe thì bị phản (mất thế, mất tầng cháy).
        await gm(page, 'hurt 30', 900);
        await gm(page, 'heal', 600);
        const v = at(rift.veins, 0, 'rift.veins');
        await gm(page, `tp ${v.x} ${v.z}`, 900);
        await cam(page, { pitch: 0.5, dist: 24, yaw: 0 });
        let hit = false;
        for (let i = 0; i < 60 && !hit; i++, await sleep(1000)) {
          hit = /Chú bị mạch phản|ngừng tay/.test(await page.evaluate(() => document.body.innerText));
          if (i % 6 === 0) await shot(`${tag}-khe-${i}`);
        }
        log[`${tag}-khe`] = { hit };
        await shot(`${tag}-khe-phan`, 600);
      }
      const night = MONSTER.get(lead)?.kd?.night;
      if (night) {
        // Kim dạ (DV-3E): boss ở pha 3, đứng trong vòng bia sáng, chờ boss dập bia, rồi bước ra ngoài vòng cho thấy giới áp.
        await gm(page, 'hurt 30', 900);
        await gm(page, 'heal', 600);
        const s0 = at(night.steles, 0, 'night.steles');
        await gm(page, `tp ${s0.x} ${s0.z}`, 900);
        await cam(page, { pitch: 0.55, dist: 30, yaw: 0 });
        for (let i = 0; i < 6; i++) await shot(`${tag}-kim-da-${i}`, 2500);
        await gm(page, `tp ${s0.x} ${s0.z + 30}`, 900);
        await shot(`${tag}-kim-da-ngoai-vong`, 1500);
        log[`${tag}-kim-da`] = { text: /Sảnh chìm vào bóng tối/.test(await page.evaluate(() => document.body.innerText)) };
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
