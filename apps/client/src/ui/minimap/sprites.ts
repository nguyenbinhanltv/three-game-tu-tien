// Biểu tượng minimap vẽ sẵn một lần vào canvas nhỏ (theo hệ số màn hình), mỗi khung chỉ drawImage.
// Mỗi loại có hình dáng riêng để phân biệt không cần dựa vào màu.
import type { SpiritKind } from '@dtl/shared';
import type { NpcFn, QuestMark, Tone } from './model';
import { pal } from './palette';

const INK = '#2a1f16';
const GOLD = '#ffd54a';

const TONE_COLOR: Record<Tone, string> = { gray: '#9aa0a3', white: '#f4f1e8', yellow: '#ffd23f', red: '#e0412f' };
const NPC_COLOR: Record<NpcFn, string> = { trade: '#ffd54a', alchemy: '#7fd18b', smith: '#f08a3c', root: '#b992e8', quest: '#f1ead8' };

export interface Sprite {
  cv: HTMLCanvasElement;
  /** Kích thước CSS (px) để căn giữa. */
  w: number;
  h: number;
}

const cache = new Map<string, Sprite>();

function make(key: string, w: number, h: number, dpr: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  const k = `${key}@${dpr}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(w / 2, h / 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  const s = { cv, w, h };
  cache.set(k, s);
  return s;
}

function outline(g: CanvasRenderingContext2D, fill: string, lw = 1.4): void {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.stroke();
}

/**
 * NPC: chấm tròn ngà (chấm nhỏ màu chức năng ở giữa). Có nhiệm vụ (nhận/trả): hình thoi vàng với vòng sóng, kèm ! hoặc ?;
 * nhiệm vụ đang làm: thoi ngà nhạt.
 */
export function npcSprite(fn: NpcFn, q: QuestMark, dpr: number): Sprite {
  return make(`npc:${fn}:${q}`, 30, 34, dpr, (g) => {
    const P = pal();
    g.translate(0, 6);
    if (q === 'give' || q === 'turn') {
      for (const [r, a] of [
        [12.5, 0.45],
        [9, 0.8],
      ] as const) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.lineWidth = 1.2;
        g.globalAlpha = a;
        g.strokeStyle = P.goldLo;
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    if (q) {
      g.beginPath();
      g.moveTo(0, -6.5);
      g.lineTo(5.5, 0);
      g.lineTo(0, 6.5);
      g.lineTo(-5.5, 0);
      g.closePath();
      outline(g, q === 'wait' ? P.giayLo : P.gold);
      g.font = `800 15px ${P.head}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = INK;
      const ch = q === 'give' ? '!' : '?';
      g.strokeText(ch, 0, -16);
      g.fillStyle = q === 'wait' ? '#aeb4b6' : P.goldHi;
      g.fillText(ch, 0, -16);
      return;
    }
    g.beginPath();
    g.arc(0, 0, 4.8, 0, Math.PI * 2);
    outline(g, P.giay, 1.6);
    g.beginPath();
    g.arc(0, 0, 1.7, 0, Math.PI * 2);
    g.fillStyle = NPC_COLOR[fn];
    g.fill();
  });
}

export function monSprite(tone: Tone, dpr: number): Sprite {
  return make(`mon:${tone}`, 9, 9, dpr, (g) => {
    g.beginPath();
    g.arc(0, 0, 2.7, 0, Math.PI * 2);
    outline(g, TONE_COLOR[tone], 1.1);
  });
}

/** Sọ vàng: tinh anh. */
export function eliteSprite(dead: boolean, dpr: number): Sprite {
  return make(`elite:${dead}`, 16, 16, dpr, (g) => {
    const body = dead ? '#8c8d84' : GOLD;
    g.beginPath();
    g.moveTo(-5.5, 1);
    g.bezierCurveTo(-6.5, -7.5, 6.5, -7.5, 5.5, 1);
    g.lineTo(3.2, 2.4);
    g.lineTo(3.2, 5.8);
    g.lineTo(-3.2, 5.8);
    g.lineTo(-3.2, 2.4);
    g.closePath();
    outline(g, body, 1.3);
    g.fillStyle = INK;
    for (const sx of [-2.3, 2.3]) {
      g.beginPath();
      g.arc(sx, -0.4, 1.35, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(-0.6, 2.1, 1.2, 1.4);
  });
}

/** Boss: đầu tam giác đỏ (đầu triền độ) có vạch ngà; chết thì xám. */
export function bossSprite(dead: boolean, dpr: number): Sprite {
  return make(`boss:${dead}`, 28, 28, dpr, (g) => {
    const P = pal();
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(10, 8);
    g.lineTo(-10, 8);
    g.closePath();
    outline(g, dead ? '#8c8d84' : P.son, 1.7);
    g.beginPath();
    g.moveTo(-3.6, 2.6);
    g.lineTo(3.6, 2.6);
    g.lineWidth = 1.7;
    g.strokeStyle = dead ? '#c8c8c0' : P.goldHi;
    g.stroke();
  });
}

/** Đồng đội: chấm lam có số. */
export function mateSprite(num: number, dpr: number): Sprite {
  return make(`mate:${num}`, 18, 18, dpr, (g) => {
    g.beginPath();
    g.arc(0, 0, 6.6, 0, Math.PI * 2);
    outline(g, pal().ngocHi, 1.5);
    g.font = `800 9.5px ${pal().head}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    g.fillText(String(num), 0, 0.5);
  });
}

export function playerSprite(dpr: number): Sprite {
  return make('player', 9, 9, dpr, (g) => {
    g.beginPath();
    g.arc(0, 0, 2.6, 0, Math.PI * 2);
    g.lineWidth = 1.5;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = pal().ngocHi;
    g.fill();
  });
}

export function nodeSprite(dpr: number): Sprite {
  return make('node', 7, 7, dpr, (g) => {
    g.beginPath();
    g.moveTo(0, -2.6);
    g.quadraticCurveTo(2.8, 0, 0, 2.6);
    g.quadraticCurveTo(-2.8, 0, 0, -2.6);
    outline(g, '#69d28c', 0.9);
  });
}

/** Cổng: hai cột và xà ngang. */
export function portalSprite(dpr: number): Sprite {
  return make('portal', 20, 20, dpr, (g) => {
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(-5.5, 7);
    g.lineTo(-5.5, -3);
    g.lineTo(5.5, -3);
    g.lineTo(5.5, 7);
    g.moveTo(-8, -5);
    g.lineTo(8, -5);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = '#7fe0f0';
    g.stroke();
    g.beginPath();
    g.arc(0, 2, 2, 0, Math.PI * 2);
    g.fillStyle = '#c9a6ff';
    g.fill();
  });
}

/** Truyền tống trận: đĩa ngọc có vòng trong và dấu thập (nhìn rõ trên giấy). */
export function teleSprite(dpr: number): Sprite {
  return make('tele', 22, 22, dpr, (g) => {
    const P = pal();
    g.beginPath();
    g.arc(0, 0, 8.5, 0, Math.PI * 2);
    g.globalAlpha = 0.75;
    g.fillStyle = P.ngocHi;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 1.6;
    g.strokeStyle = P.ngocLo;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 4.2, 0, Math.PI * 2);
    g.moveTo(-8.5, 0);
    g.lineTo(8.5, 0);
    g.moveTo(0, -8.5);
    g.lineTo(0, 8.5);
    g.lineWidth = 1.2;
    g.stroke();
  });
}

/** Mũi tên mép: mục tiêu nhiệm vụ nằm ngoài tầm (hướng sang phải, xoay khi vẽ). */
export function edgeArrowSprite(dpr: number): Sprite {
  return make('edge', 18, 18, dpr, (g) => {
    g.beginPath();
    g.moveTo(7.5, 0);
    g.lineTo(-4.5, -6);
    g.lineTo(-1.5, 0);
    g.lineTo(-4.5, 6);
    g.closePath();
    outline(g, GOLD, 1.5);
  });
}

/** Mũi tên người chơi (hướng lên trên). */
export function selfSprite(dpr: number): Sprite {
  return make('self', 18, 20, dpr, (g) => {
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    outline(g, pal().goldHi, 1.5);
  });
}

/** Điểm đánh dấu: cờ nhọn, vàng của mình, lam của đồng đội. */
export function flagSprite(own: boolean, dpr: number): Sprite {
  return make(`flag:${own}`, 20, 24, dpr, (g) => {
    g.beginPath();
    g.moveTo(-5, 10);
    g.lineTo(-5, -9);
    g.lineTo(6, -5);
    g.lineTo(-5, -1);
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = own ? GOLD : '#5cb8ff';
    g.fill();
    g.lineWidth = 1.2;
    g.strokeStyle = own ? '#fff3c0' : '#d3ecff';
    g.stroke();
  });
}

const SCAN_COLOR: Record<SpiritKind, string> = {
  boss: '#ff6a4a',
  elite: '#ffb84a',
  mon: '#e6dfc8',
  node: '#7dffa0',
  player: '#5cb8ff',
  poi: '#e8c46a',
};

/** Dấu thần thức (E2-E): vòng sáng có chấm giữa, màu theo loại; viền vòng ngoài để phân biệt với biểu tượng thường. */
export function scanSprite(kind: SpiritKind, dpr: number): Sprite {
  return make(`scan:${kind}`, 20, 20, dpr, (g) => {
    const c = SCAN_COLOR[kind];
    g.beginPath();
    g.arc(0, 0, 7.5, 0, Math.PI * 2);
    g.lineWidth = 3.4;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 1.6;
    g.strokeStyle = c;
    g.stroke();
    g.beginPath();
    if (kind === 'boss' || kind === 'elite') {
      // Hình thoi cho thủ lĩnh/tinh anh.
      g.moveTo(0, -4);
      g.lineTo(3.4, 0);
      g.lineTo(0, 4);
      g.lineTo(-3.4, 0);
      g.closePath();
    } else g.arc(0, 0, kind === 'mon' ? 1.8 : 2.6, 0, Math.PI * 2);
    g.fillStyle = c;
    g.fill();
  });
}
