// Vẽ lớp động của minimap lên canvas: nền bản đồ (một drawImage), vùng mục tiêu, biểu tượng, mũi tên mép, mũi tên mình, chữ N.
import { levelTerrain } from '../../base/levelCtx';
import { t } from '@dtl/content';
import type { Game } from '../../game/engine';
import { type AncientMap, mipFor } from './ancient';
import type { MinimapFrame } from './marks';
import { edgeClamp, formatCountdown, type Mark, project, type View } from './model';
import { bossSprite, flagSprite, edgeArrowSprite, eliteSprite, mateSprite, monSprite, nodeSprite, npcSprite, scanSprite, playerSprite, portalSprite, selfSprite, type Sprite, teleSprite } from './sprites';
import { npcFunction } from './model';
import { NPC } from '@dtl/content';

/** Điểm bắt chuột của một biểu tượng (toạ độ canvas, px CSS). */
export interface HitPt {
  x: number;
  y: number;
  r: number;
  mark: Mark;
}

const ORDER: Record<Mark['kind'], number> = { node: 0, mon: 1, player: 2, portal: 3, tele: 3, goal: 3, npc: 4, elite: 5, mate: 6, boss: 7, flag: 7, scan: 6 };
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

export function drawMinimap(ctx: CanvasRenderingContext2D, g: Game, frame: MinimapFrame, v: View, dpr: number, now: number, map: AncientMap | null, yaw: number, hits: HitPt[]): void {
  const size = v.size;
  const s = size / v.span;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2a2218';
  ctx.fillRect(0, 0, size, size);

  // 1) nền bản đồ: toàn bộ ảnh dựng sẵn qua một phép biến đổi
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(v.rot);
  ctx.scale(s, s);
  ctx.translate(-v.cx, -v.cz);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (map) ctx.drawImage(mipFor(map, s * dpr), map.meta.x0, map.meta.z0, map.meta.size, map.meta.size);
  else if (g.minimap) ctx.drawImage(g.minimap, 0, 0, levelTerrain().size, levelTerrain().size);
  ctx.restore();

  // 2) vùng mục tiêu nhiệm vụ: tô mờ, viền nét đứt
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  for (const a of frame.goals) {
    const c = project(v, a.x, a.z, _p);
    const r = a.r * s;
    if (c.x + r < 0 || c.y + r < 0 || c.x - r > size || c.y - r > size) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,196,64,${0.16 + 0.07 * pulse})`;
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,214,90,0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3) biểu tượng
  hits.length = 0;
  const blink = Math.floor(now / 120) % 2 === 0;
  // Vẽ theo lớp (chấm nhỏ dưới, boss trên cùng) bằng vài lượt lọc thay vì sort mỗi khung.
  for (let pass = 0; pass < 8; pass++)
    for (const m of frame.marks) {
    if (ORDER[m.kind] !== pass) continue;
    let c = project(v, m.x, m.z, _p);
    const outside = c.x < -10 || c.y < -10 || c.x > size + 10 || c.y > size + 10;
    // Điểm đánh dấu nằm ngoài khung: bám mép để luôn biết hướng.
    if (outside && m.kind === 'flag') {
      const e = edgeClamp(c.x, c.y, size, 12);
      c = { x: e.x, y: e.y };
    } else if (outside) continue;
    const { s: sp, dy, r } = spriteOf(m, dpr);
    if (m.hurtUntil && m.hurtUntil > now && blink) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 3.5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff3b30';
      ctx.stroke();
    }
    put(ctx, sp, c.x, c.y, dy);
    if (m.kind === 'boss' && m.dead && m.respawnAt) {
      ctx.font = '700 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1a120c';
      const txt = formatCountdown((m.respawnAt - Date.now()) / 1000);
      ctx.strokeText(txt, c.x, c.y + 12);
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(txt, c.x, c.y + 12);
    }
    hits.push({ x: c.x, y: c.y, r, mark: m });
    }

  // 4) mục tiêu nhiệm vụ ngoài tầm: mũi tên ở mép
  const gp = frame.goalPoint;
  if (gp) {
    const c = project(v, gp.x, gp.z, _p);
    let e = edgeClamp(c.x, c.y, size, 10);
    if (!e.inside) {
      // Chữ N nằm ở mép phía Bắc: mũi tên trùng chỗ đó thì xoay lệch quanh tâm một chút để cả hai cùng đọc được.
      const nAng = Math.atan2(-Math.cos(v.rot), Math.sin(v.rot));
      let d = e.angle - nAng;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 0.3) {
        const a = nAng + (d < 0 ? -0.3 : 0.3);
        const half = size / 2;
        e = { ...edgeClamp(half + Math.cos(a) * half * 2, half + Math.sin(a) * half * 2, size, 10), angle: e.angle };
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      put(ctx, edgeArrowSprite(dpr), 0, 0);
      ctx.restore();
      hits.push({ x: e.x, y: e.y, r: 9, mark: { kind: 'goal', id: 'goal-edge', x: gp.x, z: gp.z, label: gp.label, sub: t('ui.mm.goal_far', { d: Math.round(Math.hypot(gp.x - v.cx, gp.z - v.cz)) }) } });
    } else {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8 + 3 * pulse, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(255,214,90,${0.9 - 0.4 * pulse})`;
      ctx.stroke();
    }
  }

  // 5) mình: mũi tên hướng camera (xoay theo camera thì luôn hướng lên)
  ctx.save();
  ctx.translate(size / 2, size / 2);
  if (frame.selfHurt && blink) {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff3b30';
    ctx.stroke();
  }
  ctx.rotate(v.rot === 0 ? -yaw : 0);
  put(ctx, selfSprite(dpr), 0, 0);
  ctx.restore();

  // 6) chữ N ở hướng Bắc
  const nx = size / 2 + Math.sin(v.rot) * (size / 2 - 12);
  const ny = size / 2 - Math.cos(v.rot) * (size / 2 - 12);
  ctx.beginPath();
  ctx.arc(nx, ny, 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(32,22,14,0.82)';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#d9b873';
  ctx.stroke();
  ctx.font = '800 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe3a0';
  ctx.fillText(t('ui.mm.n'), nx, ny + 0.5);
}
