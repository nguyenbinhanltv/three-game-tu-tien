// Chân Cảnh C2: soát tỉ lệ nhân vật (bone scale) ở nhiều tư thế cho các bộ v3 nam + nữ, so bản tắt (`?hero=0`) với bản bật.
// Mỗi (giới × bộ × bản): đứng, chạy, lướt, đòn nặng, đả tọa, ngự kiếm; ảnh cận cảnh mỗi tình huống + đo "đỉnh tay nằm trong khối thân"
// (xuyên ống tay, hàm `PEN_INSTALL` như chrv3anim). Ảnh `<giới>-<bộ>-<bản>-<tình huống>.png`, số đo `pen.json`.
//   pnpm shots herocheck --out <thư mục> [--genders m,f] [--sets de_tu,huyen_giap,dan_tam] [--size 640x600]
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';
import path from 'node:path';

const SETS: Record<string, string> = {
  de_tu: 'set off',
  huyen_giap: 'set set_huyen_giap',
  dan_tam: 'set set_dan_tam',
  kinh_quang: 'set set_kinh_quang',
};

// Đo xuyên (chuỗi JS thuần: tsx chèn __name vào hàm lồng).
const PEN_INSTALL = `(() => {
  const g = window.__game; const e = g.ents.players.get(g.sid); const m = e.model; const rig = m.rig;
  const V = rig.position.constructor;
  const mesh = m.lods[0].find((x) => x.isSkinnedMesh);
  const sk = mesh.skeleton; const names = sk.bones.map((b) => b.name);
  const armBones = new Set(names.map((n, i) => (/^(upperarm|lowerarm|hand)_(l|r)$/.test(n) ? i : -1)).filter((i) => i >= 0));
  const si = mesh.geometry.attributes.skinIndex; const sw = mesh.geometry.attributes.skinWeight;
  const arm = [];
  for (let i = 0; i < si.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (armBones.has(si.getComponent(i, k))) w += sw.getComponent(i, k); if (w > 0.6) arm.push(i); }
  const step = Math.max(1, Math.floor(arm.length / 900)); const pick = arm.filter((_, i) => i % step === 0);
  const get = (n) => rig.getObjectByName(n);
  const segs = [['pelvis', 'spine_02', 0.15], ['spine_02', 'spine_03', 0.16], ['spine_03', 'neck_01', 0.13]];
  const H = m.height / 1.8;
  const a = new V(), b = new V(), p = new V(), ab = new V(), ap = new V();
  const w = { name: '', byName: {} };
  window.__pen = w;
  window.__penSample = () => {
    sk.update();
    let n = 0;
    for (const i of pick) {
      mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld);
      for (const [s0, s1, r] of segs) {
        get(s0).getWorldPosition(a); get(s1).getWorldPosition(b);
        ab.subVectors(b, a); ap.subVectors(p, a);
        const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-6, ab.lengthSq())));
        a.addScaledVector(ab, t);
        if (p.distanceTo(a) < r * H) { n++; break; }
      }
    }
    const o = (w.byName[w.name] ??= { sum: 0, n: 0 }); o.sum += n; o.n++;
  };
  setInterval(() => { if (w.name) window.__penSample(); }, 120);
  return pick.length;
})()`;

export default {
  name: 'herocheck',
  desc: 'C2: tỉ lệ nhân vật v3 (nam/nữ, nhiều bộ) ở đứng/chạy/lướt/đòn nặng/đả tọa/ngự kiếm, tắt vs bật `?hero`; ảnh cận cảnh + đo xuyên tay',
  usage: '[--genders m,f] [--sets de_tu,huyen_giap,dan_tam] [--variants tat,bat] [--size 1920x1080] (một lệnh mỗi ô để không lẫn nhân vật)',
  async run(r) {
    const viewport = size('1920x1080');
    const genders = list('--genders', 'm,f');
    const sets = list('--sets', 'de_tu,huyen_giap,dan_tam');
    // Mỗi lần chạy một server riêng: chạy từng (giới, bộ, bản) bằng một lệnh riêng thì không có nhân vật của lượt khác đứng cạnh.
    const variants = list('--variants', 'tat,bat') as ('tat' | 'bat')[];
    const result: Record<string, Record<string, number>> = {};
    for (const g of genders) {
      const gname = g === 'm' ? 'nam' : 'nu';
      for (const s of sets) {
        for (const variant of variants) {
          const tag = `${gname}-${s}-${variant}`;
          const { page } = await r.open({
            name: `H${g}${s}${variant}`,
            viewport,
            quality: 'high',
            look: { g },
            query: { chr: 'v3', ...(variant === 'tat' ? { hero: '0' } : {}) },
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
          });
          await gm(page, 'level 15', 1500);
          await gm(page, 'god on', 1200);
          await gm(page, SETS[s]!, 1500);
          await gm(page, 'killall', 800);
          await gm(page, 'tp 2048 2088', 1500);
          await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
            timeout: 60_000,
            polling: 300,
          });
          // Chỉ một client trong thế giới: nhân vật của lượt trước còn giữ chỗ chờ nối lại thì chờ nó biến mất (tối đa 3 phút).
          await page
            .waitForFunction(
              `(() => { var g = window.__game; var ids = []; g.view.players.forEach(function (_v, k) { ids.push(k); }); return ids.every(function (k) { return k === g.sid; }); })()`,
              undefined,
              { timeout: 180_000, polling: 1000 },
            )
            .catch(() => console.log('[shots:herocheck] cảnh báo: còn người chơi khác trong cảnh'));
          await sleep(3500);
          await page.evaluate(PEN_INSTALL);
          const mark = (name: string) => page.evaluate(`window.__pen.name = ${JSON.stringify(name)}`);
          const frame = () => cam(page, { yaw: 0.5, pitch: 0.1, dist: 2.7 });
          // Cận cảnh: chiếu vị trí nhân vật lên màn hình rồi cắt quanh đó (camera chéo cố định nên không kéo gần được).
          const shot = async (n: string) => {
            const c = (await page.evaluate(`(() => {
              var g = window.__game; var v = g.renderPos.clone(); v.y += 0.9; v.project(g.camera);
              return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
            })()`)) as { x: number; y: number };
            const w = 400;
            const h = 440;
            const x = Math.max(0, Math.min(viewport[0] - w, Math.round(c.x - w / 2)));
            const y = Math.max(0, Math.min(viewport[1] - h, Math.round(c.y - h / 2)));
            await page.screenshot({ path: path.join(r.out, `${tag}-${n}.png`), clip: { x, y, width: w, height: h } });
          };
          const hold = async (keys: string[], ms: number) => {
            for (const k of keys) await page.keyboard.down(k);
            await sleep(ms);
            for (const k of keys) await page.keyboard.up(k);
          };
          await frame();
          await mark('dung');
          await sleep(1200);
          await shot('1-dung');
          await mark('chay');
          for (const k of ['KeyS', 'KeyD']) await page.keyboard.down(k);
          await sleep(1400);
          await shot('2-chay');
          for (const k of ['KeyS', 'KeyD']) await page.keyboard.up(k);
          await mark('luot');
          await hold(['KeyS', 'KeyD'], 400);
          await page.keyboard.press('KeyQ');
          await sleep(350);
          await shot('3-luot');
          await sleep(900);
          await mark('don-nang');
          await gm(page, 'spawn mon_soi_xam 1', 2500);
          await frame();
          await page.evaluate(() => window.__game!.useSkill(1));
          await sleep(400);
          await shot('4-don-nang');
          await sleep(900);
          await mark('da-toa');
          await gm(page, 'killall', 800);
          await page.keyboard.press('KeyZ');
          await sleep(1800);
          await shot('5-da-toa');
          await page.keyboard.press('KeyW');
          await sleep(500);
          await mark('ngu-kiem');
          await page.evaluate(() => window.__game!.toggleFly());
          await sleep(2200);
          await frame();
          await shot('6-ngu-kiem');
          await page.evaluate(() => window.__game!.toggleFly());
          const pen = await page.evaluate(() => {
            const w = (window as unknown as { __pen: { byName: Record<string, { sum: number; n: number }> } }).__pen;
            return Object.fromEntries(Object.entries(w.byName).map(([k, v]) => [k, Math.round((v.sum / Math.max(1, v.n)) * 10) / 10]));
          });
          result[tag] = pen;
          await page.close();
        }
      }
    }
    writeJson(r.out, `pen-${genders.join('')}-${sets.join('')}-${variants.join('')}.json`, result);
  },
} satisfies Scenario;
