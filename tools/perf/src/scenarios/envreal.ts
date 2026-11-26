// HPL2 PR3: ảnh CẢNH THẬT của hình môi trường (không phải phòng thử): một cổng phó bản thật (Vân Lam → Kiếm Trủng) và một cụm linh thảo thật trên bản đồ.
//   pnpm shots envreal --out <thư mục tuyệt đối> [--style painted] [--mood night] [--sizes 720p,1080p] [--only gate|herb]
// Cổng: đứng cách tâm cổng ~4 m về phía camera. Linh thảo: tìm điểm hái `on` có nhiều điểm hái khác quanh nó nhất trong vùng cụm (2048, 2480), đứng cách ~4 m.
// Quái ở gần bị dọn (`spawn clear`), HUD ẩn; ghi toạ độ đã chọn vào `envreal.json`.
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

const PORTAL = { x: 2048, z: 1708 };
const HERB_AREA = { x: 2048, z: 2480 };

interface NodePos {
  id: string;
  x: number;
  z: number;
}

export default {
  name: 'envreal',
  desc: 'HPL2 PR3: ảnh cảnh thật cổng phó bản + cụm linh thảo (ngày/đêm, ?style=painted), 720p + 1080p',
  usage: '--out <dir> [--style painted] [--mood night] [--sizes 720p,1080p] [--only gate|herb]',
  async run(r: Run) {
    const sizes = list('--sizes', '720p,1080p');
    const only = opt('--only', '');
    const style = opt('--style', '');
    const { ctx, page } = await r.open({
      name: 'VL',
      viewport: [1920, 1080],
      seenIntro: true,
      look: { g: 'm' },
      extra: style ? `&style=${style}` : '',
      query: { realm: 'nk12', god: 1, chr: 'v3', quiet: 1, mood: opt('--mood', '') || undefined },
      hide: 'hud',
    });
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 120_000 });
    await sleep(2500);
    await gm(page, 'level 32', 1500);
    await gm(page, 'spawn clear', 800);
    const out: Record<string, unknown> = { style: style || 'default', mood: opt('--mood', '') || 'day' };
    const shoot = async (tag: string) => {
      for (const size of sizes) {
        const [w, h] = UI_SIZES[size] ?? UI_SIZES['1080p']!;
        await page.setViewportSize({ width: w, height: h });
        await sleep(2500);
        await snap(page, r.out, `${tag}-${size}.jpg`, { wait: 0 });
      }
    };
    if (only !== 'herb') {
      // Cổng thật: đứng CẠNH cổng (không đè lên đĩa). `--gateat "dx,dz;dx,dz"`: thử nhiều chỗ (độ lệch so với tâm cổng, m), mỗi chỗ một bộ ảnh `gate<i>-*`.
      const spots = opt('--gateat', '-4,14')
        .split(';')
        .map((t) => t.split(',').map(Number) as [number, number]);
      const gates: unknown[] = [];
      for (let k = 0; k < spots.length; k++) {
        const [dx, dz] = spots[k]!;
        await gm(page, `tp ${PORTAL.x + dx} ${PORTAL.z + dz}`, 7000);
        gates.push({ at: [PORTAL.x + dx, PORTAL.z + dz] });
        await shoot(spots.length > 1 ? `gate${k}` : 'gate');
      }
      out.gate = gates;
    }
    if (only !== 'gate') {
      await gm(page, `tp ${HERB_AREA.x} ${HERB_AREA.z}`, 5000);
      const nodes = (await page.evaluate(() => {
        const g = window.__game as unknown as { view: { nodes: Map<string, { x: number; z: number; on: boolean }> } };
        return [...g.view.nodes.entries()].filter(([, n]) => n.on).map(([id, n]) => ({ id, x: n.x, z: n.z }));
      })) as NodePos[];
      let best: { n: NodePos; k: number } | null = null;
      for (const n of nodes) {
        const k = nodes.filter((o) => Math.hypot(o.x - n.x, o.z - n.z) < 9).length;
        if (!best || k > best.k) best = { n, k };
      }
      if (best) {
        await gm(page, `tp ${Math.round(best.n.x - 3)} ${Math.round(best.n.z + 3)}`, 5000);
        out.herb = {
          node: best.n,
          neighbours: best.k,
          standAt: [Math.round(best.n.x - 3), Math.round(best.n.z + 3)],
          nodesSeen: nodes.length,
        };
        await shoot('herb');
      } else out.herb = { error: 'không thấy điểm hái nào quanh (2048, 2480)', nodesSeen: nodes.length };
    }
    writeJson(r.out, 'envreal.json', out);
    console.log(JSON.stringify(out));
    await ctx.close();
  },
} satisfies Scenario;
