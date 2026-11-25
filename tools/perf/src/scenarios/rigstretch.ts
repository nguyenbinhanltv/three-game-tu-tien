// PHÂN TÍCH (NV3-B, không sửa sản phẩm): đo độ giãn/nén cạnh tam giác của mesh LOD0 (Tripo gốc, đã skin) so với tư thế bind, theo từng khung của từng clip,
// chạy ngay trong game (cùng bộ giải xương, retarget clip UAL, trọng số thật). Ra `<out>/rigstretch.json` + `rigstretch-worst-<clip>.json` (vị trí đỉnh + tỉ lệ cạnh
// tệ nhất mỗi đỉnh ở khung tệ nhất, để vẽ heatmap bằng Python) + liệt kê vùng/cặp xương tệ nhất.
// Dùng: pnpm shots rigstretch --out <thư mục> [--clips Idle_Loop,Jog_Fwd_Loop,…] [--frames 12]
import fs from 'node:fs';
import path from 'node:path';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const DEFAULT_CLIPS =
  'Idle_Loop,Jog_Fwd_Loop,Jog_Bwd_Loop,Walk_Loop,Sword_Attack,Sword_Regular_A,Sword_Regular_B,Sword_Regular_C,Roll,Hit_Chest,Hit_Knockback,Sitting_Idle_Loop,Jump_Loop,Spell_Simple_Idle_Loop,Death01';

export default {
  name: 'rigstretch',
  desc: 'Phân tích: độ giãn/nén cạnh tam giác của nhân vật v3 theo từng khung của từng clip + heatmap khung tệ nhất',
  usage: '--out <dir> [--clips a,b,…] [--frames 12] [--set set_tinh_khuyet] [--gender f|m]',
  async run(r) {
    const clips = list('--clips', DEFAULT_CLIPS);
    const frames = Number(list('--frames', '12')[0]);
    const setId = list('--set', 'set_tinh_khuyet')[0]!;
    const gender = list('--gender', 'f')[0]!;
    const { ctx, page } = await r.open({
      name: 'RS',
      viewport: [1280, 720],
      quality: 'high',
      look: { g: gender },
      query: { chr: 'v3' },
      hide: 'hud',
      warnings: /models|chr_v3|clip/,
    });
    await gm(page, 'level 12', 1500);
    await gm(page, 'god on', 1200);
    await gm(page, `outfit ${setId} ${gender}`, 3500);
    await gm(page, 'killall', 800);
    await gm(page, 'tp 2048 2088', 1500);
    await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
      timeout: 60_000,
      polling: 300,
    });
    await sleep(3500);
    await cam(page, { yaw: 0.5, pitch: 0.1, dist: 3 });
    const names = await page.evaluate(() => [
      ...(window.__game!.ents.players.get(window.__game!.sid).model.tpl.clips as Map<string, unknown>).keys(),
    ]);
    fs.writeFileSync(path.join(r.out, 'clips.json'), JSON.stringify(names));
    console.log(`[rigstretch] ${names.length} clip UAL: ${names.join(', ')}`);
    const results: Record<string, unknown> = {};
    for (const clip of clips) {
      if (!names.includes(clip)) {
        console.log(`[rigstretch] bỏ qua ${clip} (không có)`);
        continue;
      }
      const res = await page.evaluate(
        ({ clipName, nFrames }) => {
          const g = window.__game!;
          const m = g.ents.players.get(g.sid).model;
          const lods: {
            geometry: {
              index: { array: ArrayLike<number> } | null;
              getAttribute: (n: string) => { count: number; getX: (i: number) => number; array: ArrayLike<number> };
            };
            getVertexPosition: (i: number, t: unknown) => unknown;
            skeleton: { bones: { name: string }[] };
            name: string;
          }[] = m.lods[0];
          const V = m.rig.position.constructor as new () => { x: number; y: number; z: number };
          const tmp = new V();
          // đỉnh toàn model (gộp các mesh LOD0), toạ độ bind (nghỉ) và xương trội
          const meshes = lods.filter((x) => x.skeleton);
          const rest: number[] = [];
          const dom: string[] = [];
          const edges: number[] = [];
          const edgeSeen = new Set<number>();
          let base = 0;
          const info: { m: (typeof meshes)[0]; base: number; n: number }[] = [];
          for (const mesh of meshes) {
            const pos = mesh.geometry.getAttribute('position');
            const si = mesh.geometry.getAttribute('skinIndex');
            const sw = mesh.geometry.getAttribute('skinWeight');
            const n = pos.count;
            for (let i = 0; i < n; i++) {
              // vị trí bind = skin ở tư thế bind (bind pose): dùng getVertexPosition khi skeleton ở pose bind sẽ cho cùng giá trị; ở đây lấy attribute trực tiếp (toạ độ mesh)
              rest.push(
                pos.getX(i),
                (pos as unknown as { getY: (i: number) => number }).getY(i),
                (pos as unknown as { getZ: (i: number) => number }).getZ(i),
              );
              let best = 0;
              let bw = -1;
              for (let k = 0; k < 4; k++) {
                const w = (sw as unknown as { array: ArrayLike<number> }).array[i * 4 + k]!;
                if (w > bw) {
                  bw = w;
                  best = k;
                }
              }
              dom.push(mesh.skeleton.bones[(si as unknown as { array: ArrayLike<number> }).array[i * 4 + best]!]?.name ?? '?');
            }
            const idx = mesh.geometry.index!.array;
            for (let t = 0; t < idx.length; t += 3) {
              for (let e = 0; e < 3; e++) {
                const a = idx[t + e]! + base,
                  b = idx[t + ((e + 1) % 3)]! + base;
                const key = a < b ? a * 1000003 + b : b * 1000003 + a;
                if (!edgeSeen.has(key)) {
                  edgeSeen.add(key);
                  edges.push(a, b);
                }
              }
            }
            info.push({ m: mesh, base, n });
            base += n;
          }
          const nV = base;
          // chiều dài cạnh ở bind: tính bằng vị trí skin ở khung bind của clip? dùng toạ độ attribute (đã ở không gian bind của mesh)
          const restLen = new Float32Array(edges.length / 2);
          for (let e = 0; e < restLen.length; e++) {
            const a = edges[2 * e]!,
              b = edges[2 * e + 1]!;
            restLen[e] = Math.hypot(rest[3 * a]! - rest[3 * b]!, rest[3 * a + 1]! - rest[3 * b + 1]!, rest[3 * a + 2]! - rest[3 * b + 2]!);
          }
          // kiểm trọng số: đỉnh tổng trọng số < 0.99 (bị kéo về gốc toạ độ khi skin) và đỉnh có đúng 0
          let wLow = 0,
            wZero = 0;
          const lowPos: number[] = [];
          for (const mesh of meshes) {
            const sw = mesh.geometry.getAttribute('skinWeight') as unknown as { array: ArrayLike<number>; count: number };
            const pp = mesh.geometry.getAttribute('position') as unknown as {
              getX: (i: number) => number;
              getY: (i: number) => number;
              getZ: (i: number) => number;
            };
            for (let i = 0; i < sw.count; i++) {
              const sum = sw.array[4 * i]! + sw.array[4 * i + 1]! + sw.array[4 * i + 2]! + sw.array[4 * i + 3]!;
              if (sum < 0.99) {
                wLow++;
                if (sum < 1e-4) wZero++;
                if (lowPos.length < 60)
                  lowPos.push(Math.round(pp.getX(i) * 100) / 100, Math.round(pp.getY(i) * 100) / 100, Math.round(pp.getZ(i) * 100) / 100);
              }
            }
          }
          const clipObj = m.tpl.clips.get(clipName);
          m.mixer.stopAllAction();
          const act = m.mixer.clipAction(clipObj);
          act.reset();
          act.play();
          act.paused = true;
          const dur = clipObj.duration as number;
          const cur = new Float32Array(nV * 3);
          const perFrame: { t: number; p99: number; max: number; nStretch: number; nSquash: number; worstEdge: number }[] = [];
          let worst: { score: number; t: number; ratio: Float32Array; pos: Float32Array } | null = null;
          const pairCount = new Map<string, number>();
          for (let f = 0; f < nFrames; f++) {
            const t = (f / nFrames) * dur;
            act.time = t;
            m.mixer.update(0);
            m.rig.updateMatrixWorld(true);
            for (const { m: mesh, base: b0, n } of info)
              for (let i = 0; i < n; i++) {
                mesh.getVertexPosition(i, tmp);
                cur[3 * (b0 + i)] = tmp.x;
                cur[3 * (b0 + i) + 1] = tmp.y;
                cur[3 * (b0 + i) + 2] = tmp.z;
              }
            const ratios: number[] = [];
            const vr = new Float32Array(nV).fill(1);
            let ns = 0,
              nq = 0,
              wE = 0,
              wV = 1;
            for (let e = 0; e < restLen.length; e++) {
              const L0 = restLen[e]!;
              if (L0 < 0.004) continue;
              const a = edges[2 * e]!,
                b = edges[2 * e + 1]!;
              const L = Math.hypot(cur[3 * a]! - cur[3 * b]!, cur[3 * a + 1]! - cur[3 * b + 1]!, cur[3 * a + 2]! - cur[3 * b + 2]!);
              const q = L / L0;
              ratios.push(q);
              const dev = q > 1 ? q : 1 / q;
              if (q > 1.8) ns++;
              if (q < 0.55) nq++;
              const dW = wV > 1 ? wV : 1 / wV,
                dA = vr[a]! > 1 ? vr[a]! : 1 / vr[a]!,
                dB = vr[b]! > 1 ? vr[b]! : 1 / vr[b]!;
              if (dev > dW) {
                wV = q;
                wE = e;
              }
              if (dev > dA) vr[a] = q;
              if (dev > dB) vr[b] = q;
            }
            const sorted = ratios.slice().sort((x, y) => x - y);
            const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
            const p01 = sorted[Math.floor(sorted.length * 0.01)]!;
            const score = ns + nq;
            perFrame.push({
              t: Math.round(t * 100) / 100,
              p99: Math.round(p99 * 100) / 100,
              max: Math.round(wV * 100) / 100,
              nStretch: ns,
              nSquash: nq,
              worstEdge: wE,
            });
            void p01;
            if (!worst || score > worst.score) worst = { score, t, ratio: vr, pos: cur.slice() };
          }
          // cặp xương của các cạnh tệ ở khung tệ nhất
          const wr = worst!.ratio;
          for (let e = 0; e < restLen.length; e++) {
            const a = edges[2 * e]!,
              b = edges[2 * e + 1]!;
            const q = Math.max(wr[a]!, 1 / wr[a]!, wr[b]!, 1 / wr[b]!);
            if (q > 1.8 && dom[a] !== dom[b]) {
              const key = [dom[a], dom[b]].sort().join(' | ');
              pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
            }
          }
          const pairs = [...pairCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
          // vùng theo NHÓM XƯƠNG trội của đỉnh (trục y của three.js là chiều cao nên không chia theo toạ độ)
          const reg = new Map<string, number>();
          const regTot = new Map<string, number>();
          const groups: string[] = [];
          for (let i = 0; i < nV; i++) {
            const d = dom[i]!;
            let name = 'than_dau';
            if (/^dtl_o_skirt/.test(d)) name = 'lo_xo_vat_vay';
            else if (/^dtl_o_hair/.test(d)) name = 'lo_xo_toc';
            else if (/^dtl_o_(tassel|sleeve)/.test(d)) name = 'lo_xo_tua';
            else if (/(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(d)) name = 'tay';
            else if (/(thigh|calf|foot|ball)/.test(d)) name = 'chan';
            else if (/(pelvis)/.test(d)) name = 'hong';
            else if (/(Head|neck)/.test(d)) name = 'dau_co';
            groups.push(name);
            regTot.set(name, (regTot.get(name) ?? 0) + 1);
            const q = wr[i]!;
            if (q > 1.8 || q < 0.55) reg.set(name, (reg.get(name) ?? 0) + 1);
          }
          // cạnh "cầu nối" giữa nhóm tay và nhóm khác (tay áo dính thân/váy) ở tư thế bind: cạnh ngắn (< 3 cm) nối hai nhóm
          let bridgeArm = 0;
          let bridgeLeg = 0;
          for (let e = 0; e < restLen.length; e++) {
            if (restLen[e]! > 0.03) continue;
            const ga = groups[edges[2 * e]!]!,
              gb = groups[edges[2 * e + 1]!]!;
            if (ga === gb) continue;
            if ((ga === 'tay') !== (gb === 'tay')) bridgeArm++;
            if ((ga === 'chan') !== (gb === 'chan')) bridgeLeg++;
          }
          const regions = [...regTot.entries()]
            .map(([k, tot]) => ({ region: k, bad: reg.get(k) ?? 0, total: tot, pct: Math.round(((reg.get(k) ?? 0) / tot) * 1000) / 10 }))
            .sort((x, y) => y.pct - x.pct);
          const w = worst!;
          // dữ liệu vẽ overlay xương / heatmap trọng số: toạ độ bind của đỉnh, nhóm xương trội, vị trí bind + cha của từng xương
          const sk0 = meshes[0]!.skeleton as unknown as {
            bones: { name: string; parent: { name: string } | null }[];
            boneInverses: { elements: number[] }[];
          };
          const bindBones = sk0.bones.map((bn, bi) => {
            const e = sk0.boneInverses[bi]!.elements;
            // vị trí bind = −R^T · t với ma trận nghịch đảo (cột): t = e[12..14], R^T từ 3x3 trên
            const tx = e[12]!,
              ty = e[13]!,
              tz = e[14]!;
            return {
              name: bn.name,
              parent: bn.parent ? bn.parent.name : null,
              p: [
                -(e[0]! * tx + e[1]! * ty + e[2]! * tz),
                -(e[4]! * tx + e[5]! * ty + e[6]! * tz),
                -(e[8]! * tx + e[9]! * ty + e[10]! * tz),
              ].map((v) => Math.round(v * 1000) / 1000),
            };
          });
          return {
            nEdges: restLen.length,
            restPos: clipName === 'Idle_Loop' ? rest.map((v) => Math.round(v * 1000) / 1000) : [],
            groups: clipName === 'Idle_Loop' ? groups : [],
            domBones: clipName === 'Idle_Loop' ? dom : [],
            bindBones: clipName === 'Idle_Loop' ? bindBones : [],
            wLow,
            wZero,
            lowPos,
            bridgeArm,
            bridgeLeg,
            clip: clipName,
            duration: dur,
            perFrame,
            worstT: w.t,
            regions,
            pairs,
            worstRatio: Array.from(w.ratio).map((v) => Math.round(v * 100) / 100),
            worstPos: Array.from(w.pos).map((v) => Math.round(v * 1000) / 1000),
            nV,
          };
        },
        { clipName: clip, nFrames: frames },
      );
      const { worstRatio, worstPos, restPos, groups, domBones, bindBones, ...summary } = res as {
        worstRatio: number[];
        worstPos: number[];
        restPos: number[];
        groups: string[];
        domBones: string[];
        bindBones: unknown[];
        [k: string]: unknown;
      };
      if (restPos.length)
        fs.writeFileSync(path.join(r.out, 'rest.json'), JSON.stringify({ pos: restPos, groups, domBones, bones: bindBones }));
      fs.writeFileSync(path.join(r.out, `rigstretch-worst-${clip}.json`), JSON.stringify({ ratio: worstRatio, pos: worstPos }));
      results[clip] = summary;
      const pf = (summary as { perFrame: { nStretch: number; nSquash: number }[] }).perFrame;
      console.log(
        `[rigstretch] ${clip}: tệ nhất ${Math.max(...pf.map((x) => x.nStretch + x.nSquash))} cạnh (giãn>1.8 hoặc nén<0.55) / khung`,
      );
    }
    fs.writeFileSync(path.join(r.out, 'rigstretch.json'), JSON.stringify(results, null, 1));
    await ctx.close();
  },
} satisfies Scenario;
