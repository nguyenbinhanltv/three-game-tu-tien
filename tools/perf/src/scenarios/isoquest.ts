// Thiên Nhãn P5b: làm nhiệm vụ mỗi chương bằng camera chéo qua giao diện thật: tới NPC giao, mở hội thoại, bấm "Nhận", bắn sự kiện mục tiêu
// bằng GM (`qev`), tới NPC trả, bấm "Hoàn thành", kiểm nhiệm vụ đã vào danh sách đã xong. Ảnh + `isoquest.json`.
//   pnpm shots isoquest --out <thư mục> [--only 1,3] [--per 2]
import { NPC, QUESTS } from '@dtl/content';
import { list, num } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Chương → bản đồ, cấp GM, tiền tố id nhiệm vụ. */
const CHAPTERS = [
  { ch: 1, level: 'van_lam', lv: 10, prefix: /^q_/ },
  { ch: 2, level: 'doan_mach', lv: 18, prefix: /^q2_/ },
  { ch: 3, level: 'van_hai', lv: 22, prefix: /^q3_/ },
  { ch: 4, level: 'thien_khuyet', lv: 26, prefix: /^q4_/ },
  { ch: 5, level: 'bac_hoang', lv: 30, prefix: /^q5_/ },
  { ch: 6, level: 'van_dinh', lv: 40, prefix: /^q6_/ },
  { ch: 7, level: 'cuu_kieu', lv: 46, prefix: /^q7_/ },
];

export default {
  name: 'isoquest',
  desc: 'Thiên Nhãn P5b: nhận/làm/trả nhiệm vụ mỗi chương qua hội thoại NPC ở camera chéo',
  usage: '[--only 1,3] [--per 2]',
  async run(r) {
    const only = list('--only', '').map(Number);
    const per = num('--per', 2);
    const { page } = await r.open({ name: 'IsoQuest', quality: 'high', viewport: [1280, 720], query: { cam: 'iso' }, seenIntro: true });
    const text = () => page.evaluate(() => document.body.innerText);
    const talk = (id: string) =>
      page.evaluate((v) => (window as unknown as { __game: { openNpc(i: string): void } }).__game.openNpc(v), id);
    const near = async (id: string) => {
      const n = NPC.get(id)!;
      await tp(page, n.x + 1.5, n.z + 1.5);
      await sleep(700);
    };
    const click = (re: RegExp) =>
      page
        .getByRole('button', { name: re })
        .first()
        .click({ timeout: 4000 })
        .then(() => true)
        .catch(() => false);
    const log: Record<string, unknown>[] = [];
    await gm(page, 'god on');
    for (const c of CHAPTERS) {
      if (only.length && !only.includes(c.ch)) continue;
      const qs = QUESTS.filter((q) => c.prefix.test(q.id));
      await gm(page, `level ${c.lv}`, 900);
      await gm(page, 'god on', 400);
      await enterLevel(page, c.level);
      await skipCutscene(page, 20);
      // Quest đầu chuỗi chương thường là "nói chuyện" bắc cầu; làm lần lượt từ quest thứ hai (chỉ số 1) để có giao nhiệm vụ thật.
      for (let i = 1; i <= per && i < qs.length; i++) {
        const q = qs[i]!;
        const rec: Record<string, unknown> = { ch: c.ch, quest: q.id, giver: q.giver, turnin: q.turnin };
        try {
          for (let k = 0; k < i; k++) await gm(page, `qdone ${qs[k]!.id}`, 1300);
          await near(q.giver);
          await talk(q.giver);
          await sleep(1000);
          await snap(page, r.out, `c${c.ch}-${q.id}-nhan.png`, { wait: 200 });
          rec.accept = await click(/nhận/i);
          await sleep(900);
          await page.keyboard.press('Escape');
          await sleep(300);
          for (const o of q.objectives) {
            const ev =
              o.type === 'kill' ||
              o.type === 'gather' ||
              o.type === 'touch' ||
              o.type === 'talk' ||
              o.type === 'scan' ||
              o.type === 'meditate'
                ? o.type
                : o.type;
            await gm(page, `qev ${ev} ${o.target ?? '-'} ${o.count ?? 1}`, 1300);
          }
          await snap(page, r.out, `c${c.ch}-${q.id}-xong-muc-tieu.png`, { wait: 300 });
          await near(q.turnin);
          await talk(q.turnin);
          await sleep(1000);
          await snap(page, r.out, `c${c.ch}-${q.id}-tra.png`, { wait: 200 });
          rec.turnin = await click(/hoàn thành/i);
          await sleep(1200);
          rec.rewardMsg = /nhận được|hoàn thành nhiệm vụ|Phần thưởng/i.test(await text());
          await page.keyboard.press('Escape');
        } catch (e) {
          rec.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
        }
        log.push(rec);
        console.log('[isoquest]', JSON.stringify(rec));
      }
    }
    writeJson(r.out, 'isoquest.json', log);
  },
} satisfies Scenario;
