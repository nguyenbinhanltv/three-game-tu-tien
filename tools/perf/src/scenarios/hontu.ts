// TN-2 (Hồn tu): ảnh giao diện và hồn phiên trong game, mỗi bước `--step` một phần.
//   learn: bảng Công pháp lúc chưa lĩnh ngộ (nút "Lĩnh ngộ" + điều kiện), bấm lĩnh ngộ thật ở chỗ Lạc Vân chân nhân, sau khi lĩnh ngộ.
//   vfx:   hình sáu chiêu + Nhiếp Hồn từ camera mặc định (hai mốc mỗi chiêu), để soát "không che camera/nhân vật".
//   hud:   đeo hồn phiên (mesh thủ tục sau lưng), thanh Hồn lực, Phệ Hồn đặt Hồn ấn lên quái, Nhiếp Hồn (phiên bay ra phất).
// Mọi thao tác đi đường người chơi thật (bấm nút, phím chiêu); lệnh GM chỉ để dựng cảnh (cảnh giới, linh thạch, gọi quái).
import { NPC, PATH, SKILL, t } from '@dtl/content';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

const HON = 'dan_hon_kinh';

type Page = Awaited<ReturnType<Run['open']>>['page'];

const state = (page: Page) =>
  page.evaluate(() => {
    const g = window.__game as unknown as {
      view: { monsters: Map<string, { mk?: number }> };
    };
    const bar = document.querySelector('[data-testid="res-bar"]');
    const pick = document.querySelector('[data-testid="mp-pick"]') as HTMLButtonElement | null;
    return {
      res: bar?.getAttribute('data-res') ?? null,
      now: bar?.getAttribute('aria-valuenow') ?? null,
      marked: [...g.view.monsters.values()].filter((x) => (x.mk ?? 0) > 0).length,
      pick: pick ? { text: pick.textContent, disabled: pick.disabled } : null,
      note: document.querySelector('[data-testid="mp-learn-note"]')?.textContent ?? null,
    };
  });

async function openHonCard(page: Page): Promise<void> {
  if (!(await page.locator('.mp-cards').count())) await page.keyboard.press('KeyK', { delay: 60 });
  await sleep(600);
  await page.getByRole('tab', { name: new RegExp(t(`method.${HON}.name`)) }).click();
  await sleep(500);
}

async function stepLearn(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const u = PATH.get('hon_tu')!.unlock!;
  const { ctx, page } = await r.open({
    name: 'HonLearn',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'tong_mon' },
  });
  await sleep(2500);
  await gm(page, 'method lac_kiem_quyet', 1300);
  // Thiếu linh thạch: nút khóa, dòng điều kiện hiện.
  await openHonCard(page);
  log.chua = await state(page);
  await snapSizes(page, r.out, 'a-learn-chua-linh-ngo', sizes);
  // Đủ linh thạch, tới chỗ người truyền công pháp rồi bấm nút thật.
  await page.keyboard.press('KeyK', { delay: 60 });
  await gm(page, `gold ${u.gold + 500}`, 1300);
  const npc = NPC.get('npc_chuong_mon')!;
  await tp(page, npc.x + 1.5, npc.z + 2.5);
  await sleep(1500);
  await openHonCard(page);
  log.du = await state(page);
  await snapSizes(page, r.out, 'b-learn-du-dieu-kien', sizes);
  await page.locator('[data-testid="mp-pick"]').click();
  await sleep(1800);
  log.sau = await state(page);
  await snapSizes(page, r.out, 'c-learn-da-linh-ngo', sizes);
  await ctx.close();
  return log;
}

async function stepHud(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const { ctx, page } = await r.open({
    name: 'HonHud',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'rung', god: 1 },
  });
  await sleep(2500);
  await gm(page, `method ${HON} 3`, 1300);
  await gm(page, 'art itm_hon_phien 1', 1300);
  await sleep(1200);
  for (const tag of sizes) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    await gm(page, 'spawn clear', 1400);
    await gm(page, 'res 0', 1300);
    await sleep(600);
    // Lúc nghỉ: hồn phiên cắm chéo sau lưng, thanh Hồn lực rỗng.
    await snap(page, r.out, `d-hud-nghi-${tag}.jpg`, { wait: 300 });
    await gm(page, 'spawn mon_thiet_boi_tru 4', 1800);
    await page.keyboard.press('Tab', { delay: 80 });
    await sleep(300);
    // Phệ Hồn (ô 7): đặt Hồn ấn, tích Hồn lực.
    await gm(page, 'cd', 1300);
    await page.keyboard.press('Digit7', { delay: 60 });
    await sleep(900);
    log[`phe-hon-${tag}`] = await state(page);
    await snap(page, r.out, `e-hud-phe-hon-${tag}.jpg`, { wait: 100 });
    // Nhiếp Hồn (ô 9, pháp bảo): phiên bay ra phất, quái quanh mình nhận ấn.
    await page.keyboard.press('Digit9', { delay: 60 });
    await sleep(650);
    await snap(page, r.out, `f-hud-nhiep-hon-${tag}.jpg`, { wait: 50 });
    await sleep(500);
    log[`nhiep-hon-${tag}`] = await state(page);
    // Tooltip thanh Hồn lực.
    await page.locator('[data-testid="res-bar"]').hover();
    await sleep(700);
    await snap(page, r.out, `g-hud-tooltip-${tag}.jpg`, {
      clip: { x: Math.round(w * 0.5), y: Math.round(h * 0.52), width: Math.round(w * 0.5), height: Math.round(h * 0.48) },
      wait: 200,
    });
    await page.mouse.move(8, 8);
    await sleep(31_000);
  }
  await ctx.close();
  return log;
}

/** Chiêu chụp ở bước `vfx`: id, có cần vòng sạc đầy không, các mốc chụp tính bằng ms sau lúc trúng. */
const VFX_SKILLS: { id: string; tag: string; at: number[]; charge?: boolean; branch?: string }[] = [
  { id: 'skl_phe_hon', tag: 'phe-hon', at: [60, 320] },
  { id: 'skl_suu_hon_thuat', tag: 'suu-hon-thuat', at: [80, 300], branch: '16 suu_hon' },
  { id: 'skl_am_hon_trieu', tag: 'am-hon-trieu', at: [60, 260], branch: '16 hon_trieu' },
  { id: 'skl_dinh_than_thuat', tag: 'dinh-than-thuat', at: [100, 900], branch: '20 dinh_hon' },
  { id: 'skl_hoang_tuyen_dan', tag: 'hoang-tuyen-dan', at: [120, 420], branch: '20 hoang_tuyen' },
  { id: 'skl_tat_dau_thanh_binh', tag: 'tat-dau-thanh-binh', at: [150, 1250], charge: true },
];

/** Mục tiêu chụp: một tinh anh máu dày (không chết giữa hai mốc chụp, cỡ thân như quái thường). */
const VFX_MON = 'elite_liet_cot_bao';

/**
 * Hình chiêu từ camera mặc định (sau lưng), HUD bật: tiêu chí duyệt là nhân vật và mục tiêu luôn nhìn thấy, không khối nào che camera.
 * Mọi chiêu đều bấm thật (server phán định): nhân vật thử lên Hóa Thần và chọn nhánh bằng lệnh GM trước mỗi chiêu nhánh.
 * `real: false` trong hontu.json nghĩa là chiêu không có trên thanh và chỉ phát được dòng thời gian hình.
 */
async function stepVfx(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const { ctx, page } = await r.open({
    name: 'HonVfx',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'rung', god: 1 },
  });
  await sleep(2500);
  // Hóa Thần (cấp 28) để dùng được chiêu mốc 16 và 20; quái cùng cấp để không chết ngay nhát đầu.
  await gm(page, 'level 28', 1500);
  await gm(page, `method ${HON} 3`, 1300);
  await gm(page, 'art itm_hon_phien 1', 1300);
  for (const tag of sizes) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    for (const sk of VFX_SKILLS) {
      if (sk.branch) await gm(page, `branch ${sk.branch}`, 1400);
      await gm(page, 'spawn clear', 1400);
      await gm(page, `spawn ${VFX_MON} 2`, 1800);
      await gm(page, 'cd', 1300);
      if (sk.charge) await gm(page, 'charge', 1300);
      await page.keyboard.press('Tab', { delay: 80 });
      await sleep(400);
      const hitMs = Math.round((SKILL.get(sk.id)?.hitAt?.[0] ?? 0.3) * 1000);
      const real = await page.evaluate((id) => {
        const g = window.__game as unknown as {
          bar(): { id: string }[];
          useSkill(i: number): void;
          sid: string;
          target?: { id: string } | null;
          view: { monsters: Map<string, { x: number; z: number; st: number }> };
          fxArea: Map<string, { x: number; z: number; r: number }>;
          fxDst: Map<string, string>;
          skillFx: { handle(sid: string, e: object): void };
        };
        const slot = g.bar().findIndex((s) => s.id === id);
        if (slot >= 0) {
          g.useSkill(slot);
          return true;
        }
        const hit = [...g.view.monsters.entries()].find(([, m]) => m.st !== 3);
        if (hit) {
          g.fxArea.set(g.sid, { x: hit[1].x, z: hit[1].z, r: 9 });
          g.fxDst.set(g.sid, hit[0]);
        }
        g.skillFx.handle(g.sid, { kind: 'windup', skill: id, combo: -1, index: 0, t: 0, kb: false });
        return false;
      }, sk.id);
      let waited = 0;
      for (const [i, ms] of sk.at.entries()) {
        await sleep(hitMs + ms - waited);
        waited = hitMs + ms;
        await snap(page, r.out, `v-${sk.tag}-${i + 1}-${tag}.jpg`, { wait: 0 });
      }
      log[`${sk.tag}-${tag}`] = { real, ...(await state(page)) };
      await sleep(1500);
    }
    // Nhiếp Hồn: tia hồn từ quái đang giao chiến bay về người (cùng timeline với thu hồn khi quái chết).
    await gm(page, 'spawn clear', 1400);
    await gm(page, `spawn ${VFX_MON} 2`, 1800);
    await gm(page, 'cd', 1300);
    await page.keyboard.press('Tab', { delay: 80 });
    await page.keyboard.press('Digit7', { delay: 60 });
    await sleep(1600);
    await page.keyboard.press('Digit9', { delay: 60 });
    await sleep(330);
    await snap(page, r.out, `v-nhiep-hon-1-${tag}.jpg`, { wait: 0 });
    await sleep(31_000);
  }
  await ctx.close();
  return log;
}

/**
 * Ảnh duyệt #460: (a) ba hồn binh với camera mặc định và camera đảo ra phía trước mặt nhân vật; (b) đồ rơi khi camera sát và ~18 m.
 * Chạy hai lần (`--tag truoc` trên bản main, `--tag sau` trên bản sửa) rồi so cùng góc.
 */
async function stepFix(r: Run, sizes: string[], tag: string): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const { ctx, page } = await r.open({
    name: 'HonFix',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'rung', god: 1 },
  });
  await sleep(2500);
  await gm(page, 'level 28', 1500);
  await gm(page, `method ${HON} 3`, 1300);
  await gm(page, 'art itm_hon_phien 1', 1300);
  const id = 'skl_tat_dau_thanh_binh';
  for (const sz of sizes) {
    const [w, h] = UI_SIZES[sz] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    // (a) hồn binh
    await gm(page, 'spawn clear', 1400);
    await gm(page, `spawn ${VFX_MON} 2`, 1800);
    await gm(page, 'cd', 1300);
    await gm(page, 'charge', 1300);
    await page.keyboard.press('Tab', { delay: 80 });
    await sleep(400);
    await page.evaluate((sk) => {
      const g = window.__game as unknown as { bar(): { id: string }[]; useSkill(i: number): void };
      g.useSkill(g.bar().findIndex((s) => s.id === sk));
    }, id);
    await sleep(1900);
    await snap(page, r.out, `a1-hon-binh-camera-mac-dinh-${tag}-${sz}.jpg`, { wait: 0 });
    const yaw = await page.evaluate(() => (window.__game as unknown as { camYaw: number }).camYaw);
    await cam(page, { yaw: yaw + Math.PI });
    // Hướng khung hồn binh chốt lúc tạo, mỗi HON_BINH_SEG (3,3 s) tạo lại: chờ qua một đoạn để thấy hướng theo camera mới.
    await sleep(4500);
    await snap(page, r.out, `a2-hon-binh-camera-truoc-mat-${tag}-${sz}.jpg`, { wait: 0 });
    await cam(page, { yaw });
    await gm(page, 'spawn clear', 1400);
    await sleep(8000);
    // (b) đồ rơi: một nhóm quanh điểm giữa nhân vật và camera
    for (const [name, dist] of [
      ['gan', 5],
      ['xa18', 18],
    ] as const) {
      await cam(page, { yaw, dist });
      await sleep(1200);
      await page.evaluate(() => {
        const g = window.__game as unknown as {
          renderPos: { x: number; y: number; z: number };
          vfx: { lootDrop(from: object, tier: number, slot: number): void };
        };
        const p = g.renderPos;
        for (let i = 0; i < 4; i++)
          g.vfx.lootDrop(
            {
              x: p.x,
              y: p.y + 1,
              z: p.z,
              clone() {
                return { ...this };
              },
            },
            3,
            i,
          );
      });
      await sleep(1100);
      await snap(page, r.out, `b-do-roi-${name}-${tag}-${sz}.jpg`, { wait: 0 });
      await sleep(5000);
    }
  }
  await ctx.close();
  return log;
}

export default {
  name: 'hontu',
  desc: 'TN-2 Hồn tu: bảng lĩnh ngộ, thanh Hồn lực, Hồn ấn, hồn phiên (mesh thủ tục) ở 1080p + 720p',
  usage: '[--step learn,hud,vfx,fix] [--tag truoc|sau] [--sizes 1080p,720p]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const steps = list('--step', 'learn,hud,vfx');
    const log: Record<string, unknown> = {};
    if (steps.includes('learn')) log.learn = await stepLearn(r, sizes);
    if (steps.includes('hud')) log.hud = await stepHud(r, sizes);
    if (steps.includes('fix')) log.fix = await stepFix(r, sizes, opt('--tag', 'sau'));
    if (steps.includes('vfx')) log.vfx = await stepVfx(r, sizes);
    writeJson(r.out, 'hontu.json', log);
  },
} satisfies Scenario;
