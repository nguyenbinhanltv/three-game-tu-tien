// Vẽ lớp động của minimap lên canvas: nền bản đồ (một drawImage), vùng mục tiêu, biểu tượng, mũi tên mép, mũi tên mình, chữ N.
import { t } from '@dtl/content';
import { type AncientMap, mipFor } from './ancient';
import type { MinimapFrame } from './marks';
import { edgeClampDisc, formatCountdown, type Mark, project, type View } from './model';
import type { Fog } from './fog';
import type { InkMap } from './ink';
import { pal } from './palette';
import { drawRim, RIM, type RimLabels, type Sky } from './rim';
import {
  bossSprite,
  flagSprite,
  edgeArrowSprite,
  eliteSprite,
  mateSprite,
  monSprite,
  nodeSprite,
  npcSprite,
  scanSprite,
  playerSprite,
  portalSprite,
  selfSprite,
  type Sprite,
  teleSprite,
} from './sprites';
import { npcFunction } from './model';
import { NPC } from '@dtl/content';

/** Điểm bắt chuột của một biểu tượng (toạ độ canvas, px CSS). */
export interface HitPt {
  x: number;
  y: number;
  r: number;
  mark: Mark;
}

const ORDER: Record<Mark['kind'], number> = {
  node: 0,
  mon: 1,
  player: 2,
  portal: 3,
  tele: 3,
  goal: 3,
  npc: 4,
  elite: 5,
  mate: 6,
  boss: 7,
  flag: 7,
  scan: 6,
};
const _p = { x: 0, y: 0 };

function put(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, dy = 0): void {
  ctx.drawImage(s.cv, x - s.w / 2, y - s.h / 2 + dy, s.w, s.h);
}

function spriteOf(m: Mark, dpr: number): { s: Sprite; dy: number; r: number } {
  switch (m.kind) {
    case 'npc': {
      const n = NPC.get(m.id);
      return { s: npcSprite(n ? npcFunction(n) : 'quest', m.quest ?? '', dpr), dy: -6, r: 8 };
    }
    case 'mon':
      return { s: monSprite(m.tone ?? 'white', dpr), dy: 0, r: 4 };
    case 'elite':
      return { s: eliteSprite(!!m.dead, dpr), dy: 0, r: 7 };
    case 'boss':
      return { s: bossSprite(!!m.dead, dpr), dy: 0, r: 11 };
    case 'mate':
      return { s: mateSprite(m.num ?? 1, dpr), dy: 0, r: 7 };
    case 'player':
      return { s: playerSprite(dpr), dy: 0, r: 4 };
    case 'node':
      return { s: nodeSprite(dpr), dy: 0, r: 3 };
    case 'portal':
      return { s: portalSprite(dpr), dy: 0, r: 9 };
    case 'scan':
      return { s: scanSprite(m.scanKind ?? 'mon', dpr), dy: 0, r: 8 };
    case 'flag':
      return { s: flagSprite(!!m.own, dpr), dy: -5, r: 9 };
    default:
      return { s: teleSprite(dpr), dy: 0, r: 9 };
  }
}

/** Lớp sương: nền giấy loãng đục đi các vùng đã đi qua bằng mặt nạ (vẽ trên canvas phụ rồi dán lên). */
let fogCv: HTMLCanvasElement | null = null;
let mist: CanvasPattern | null = null;

/** Một dải mây tường vân: ba vòng cuốn nối nhau và đuôi lượn, nét mảnh. */
function xiangyun(x: CanvasRenderingContext2D, cx: number, cy: number, sc: number): void {
  x.beginPath();
  x.moveTo(cx - 14 * sc, cy + 5 * sc);
  x.bezierCurveTo(cx - 20 * sc, cy - 6 * sc, cx - 6 * sc, cy - 10 * sc, cx - 3 * sc, cy - 3 * sc);
  x.bezierCurveTo(cx - 2 * sc, cy - 12 * sc, cx + 12 * sc, cy - 12 * sc, cx + 11 * sc, cy - 2 * sc);
  x.bezierCurveTo(cx + 18 * sc, cy - 7 * sc, cx + 26 * sc, cy + 1 * sc, cx + 19 * sc, cy + 6 * sc);
  x.moveTo(cx - 14 * sc, cy + 5 * sc);
  x.bezierCurveTo(cx - 6 * sc, cy + 10 * sc, cx + 8 * sc, cy + 9 * sc, cx + 19 * sc, cy + 6 * sc);
  x.stroke();
}

/**
 * Sương chưa khám phá: lớp sương mực mờ (xám ấm, nhìn xuyên được địa hình lờ mờ) có mảng mây sáng và hoa văn mây tường vân nét mảnh;
 * ô lặp 160 px, vẽ cả bốn mép để nối liền.
 */
function mistPattern(g: CanvasRenderingContext2D): CanvasPattern {
  if (mist) return mist;
  const T = 160;
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const x = c.getContext('2d')!;
  const P = pal();
  x.fillStyle = P.chu;
  x.globalAlpha = 0.5;
  x.fillRect(0, 0, T, T);
  x.globalAlpha = 1;
  const wraps = [-T, 0, T];
  // Mảng sương sáng và tối loang nhẹ.
  for (let i = 0; i < 12; i++) {
    const px = (i * 53) % T;
    const py = (i * 71) % T;
    for (const ox of wraps)
      for (const oy of wraps) {
        const gr = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, 34);
        gr.addColorStop(0, i % 3 === 0 ? 'rgba(40,36,30,0.16)' : 'rgba(255,255,255,0.3)');
        gr.addColorStop(1, 'transparent');
        x.fillStyle = gr;
        x.fillRect(0, 0, T, T);
      }
  }
  // Mây tường vân nét mực mảnh.
  x.strokeStyle = 'rgba(52,44,34,0.34)';
  x.lineWidth = 1.1;
  x.lineCap = 'round';
  for (const [cx, cy, sc] of [
    [38, 40, 1.15],
    [112, 96, 0.95],
    [40, 128, 0.8],
    [128, 24, 0.75],
  ] as const)
    for (const ox of wraps) for (const oy of wraps) xiangyun(x, cx + ox, cy + oy, sc);
  mist = g.createPattern(c, 'repeat')!;
  return mist;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  frame: MinimapFrame,
  v: View,
  dpr: number,
  now: number,
  layers: { ink: InkMap | null; ancient: AncientMap | null; fog: Fog | null; sky: Sky; labels: RimLabels },
  yaw: number,
  hits: HitPt[],
  /** Vùng mặt đất camera đang thấy (U8): hình thang vẽ dưới biểu tượng để thấy hướng camera. */
  foot?: readonly { x: number; z: number }[] | null,
): void {
  const size = v.size;
  const half = size / 2;
  const inner = half - RIM;
  const s = size / v.span;
  const P = pal();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  // 1) lòng bản đồ cắt tròn: giấy → thủy mặc (hoặc nền dựng sẵn khi chưa dựng xong) → sương
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, inner, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = P.giay;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(half, half);
  ctx.rotate(v.rot);
  ctx.scale(s, s);
  ctx.translate(-v.cx, -v.cz);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { ink, ancient: map, fog } = layers;
  if (ink) ctx.drawImage(ink.canvas, 0, 0, ink.size, ink.size);
  else if (map) ctx.drawImage(mipFor(map, s * dpr), map.meta.x0, map.meta.z0, map.meta.size, map.meta.size);
  ctx.restore();
  if (fog) {
    const w = Math.ceil(size * dpr);
    if (!fogCv || fogCv.width !== w) {
      fogCv = document.createElement('canvas');
      fogCv.width = fogCv.height = w;
    }
    const f = fogCv.getContext('2d')!;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, w);
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.fillStyle = mistPattern(f);
    f.fillRect(0, 0, size, size);
    f.globalCompositeOperation = 'destination-out';
    f.translate(half, half);
    f.rotate(v.rot);
    f.scale(s, s);
    f.translate(-v.cx, -v.cz);
    f.imageSmoothingEnabled = true;
    f.drawImage(fog.mask, 0, 0, fog.size, fog.size);
    ctx.drawImage(fogCv, 0, 0, size, size);
  }

  // 2) vùng mục tiêu nhiệm vụ: tô mờ, viền nét đứt
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  for (const a of frame.goals) {
    const c = project(v, a.x, a.z, _p);
    const r = a.r * s;
    if (Math.hypot(c.x - half, c.y - half) - r > inner) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(226,185,85,${0.16 + 0.07 * pulse})`;
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = P.goldLo;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 2b) tầm nhìn camera (U8): camera chéo khóa góc nên hình thang đứng yên theo bản đồ, chỉ dời theo người chơi
  if (foot && foot.length >= 3) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, inner, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    foot.forEach((p, i) => {
      const c = project(v, p.x, p.z, _p);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.goldLo;
    ctx.stroke();
    ctx.restore();
  }

  // 3) biểu tượng
  hits.length = 0;
  const blink = Math.floor(now / 120) % 2 === 0;
  // Quái thường: chỉ hiện ở gần (30% bề ngang đang xem), tối đa 14 con gần nhất hoặc đang đánh nhau; ưu tiên icon nhiệm vụ, NPC, truyền tống, đồng đội, boss.
  const monR = v.span * 0.3;
  const allowMon = new Set<Mark>();
  frame.marks
    .filter((m) => m.kind === 'mon')
    .map((m) => ({ m, d: Math.hypot(m.x - v.cx, m.z - v.cz) }))
    .filter((e) => e.d <= monR || (e.m.hurtUntil !== undefined && e.m.hurtUntil > now))
    .sort((a, b) => a.d - b.d)
    .slice(0, 14)
    .forEach((e) => allowMon.add(e.m));
  // Vẽ theo lớp (chấm nhỏ dưới, boss trên cùng) bằng vài lượt lọc thay vì sort mỗi khung.
  for (let pass = 0; pass < 8; pass++)
    for (const m of frame.marks) {
      if (ORDER[m.kind] !== pass) continue;
      if (m.kind === 'mon' && !allowMon.has(m)) continue;
      let c = project(v, m.x, m.z, _p);
      const outside = Math.hypot(c.x - half, c.y - half) > inner + 6;
      // Điểm đánh dấu nằm ngoài khung: bám mép để luôn biết hướng.
      if (outside && m.kind === 'flag') {
        const e = edgeClampDisc(c.x, c.y, size, RIM + 6);
        c = { x: e.x, y: e.y };
      } else if (outside) continue;
      const { s: sp, dy, r } = spriteOf(m, dpr);
      if (m.hurtUntil && m.hurtUntil > now && blink) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 3.5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = P.sonHi;
        ctx.stroke();
      }
      put(ctx, sp, c.x, c.y, dy);
      if (m.kind === 'boss' && m.dead && m.respawnAt) {
        ctx.font = `700 9px ${P.head}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = P.ink1;
        const txt = formatCountdown((m.respawnAt - Date.now()) / 1000);
        ctx.strokeText(txt, c.x, c.y + 12);
        ctx.fillStyle = P.goldHi;
        ctx.fillText(txt, c.x, c.y + 12);
      }
      hits.push({ x: c.x, y: c.y, r, mark: m });
    }

  // 4) mục tiêu nhiệm vụ ngoài tầm: mũi tên ở mép tròn
  const gp = frame.goalPoint;
  if (gp) {
    const c = project(v, gp.x, gp.z, _p);
    const e = edgeClampDisc(c.x, c.y, size, RIM + 8);
    if (!e.inside) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      put(ctx, edgeArrowSprite(dpr), 0, 0);
      ctx.restore();
      hits.push({
        x: e.x,
        y: e.y,
        r: 9,
        mark: {
          kind: 'goal',
          id: 'goal-edge',
          x: gp.x,
          z: gp.z,
          label: gp.label,
          sub: t('ui.mm.goal_far', { d: Math.round(Math.hypot(gp.x - v.cx, gp.z - v.cz)) }),
        },
      });
    } else {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8 + 3 * pulse, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(226,185,85,${0.9 - 0.4 * pulse})`;
      ctx.stroke();
    }
  }

  // 5) mình ở tâm, luôn hướng lên (bản đồ xoay theo camera)
  ctx.save();
  ctx.translate(half, half);
  if (frame.selfHurt && blink) {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.sonHi;
    ctx.stroke();
  }
  put(ctx, selfSprite(dpr), 0, 0);
  ctx.restore();
  // bóng lõm sát vành trong cho có chiều sâu
  ctx.beginPath();
  ctx.arc(half, half, inner, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();

  // 6) vành la bàn xoay theo camera
  void yaw;
  drawRim(ctx, size, dpr, v.rot, layers.sky, layers.labels);
}
