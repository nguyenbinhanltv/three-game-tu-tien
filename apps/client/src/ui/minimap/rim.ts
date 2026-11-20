// Vành la bàn "Thiên Cơ" (U2-7): vòng ngọc + đồng, 24 hướng (vạch mỗi 15°, đậm ở bốn hướng chính) xoay theo camera, Bắc = đầu tam giác đỏ,
// mặt trời/mặt trăng theo bầu trời của level. Phần tĩnh (vòng, bóng) vẽ sẵn một lần, phần xoay vẽ mỗi khung.
import { pal } from './palette';

/** Bề dày vành (px thiết kế) tính từ mép ngoài vào: lòng bản đồ nằm trong bán kính `D/2 - RIM`. */
export const RIM = 22;

export type Sky = 'dawn' | 'day' | 'night';

/** Mood lưới màu của level → bầu trời hiển thị trên vành (game chưa có chu kỳ ngày đêm). */
export function skyOf(mood: string): Sky {
  if (mood.includes('night')) return 'night';
  if (mood.includes('day') && !mood.includes('dawn')) return 'day';
  return 'dawn';
}

const staticCache = new Map<string, HTMLCanvasElement>();

/** Vòng tĩnh: nền mực, viền kim ngoài, vòng kim sẫm và vòng ngọc ở sát lòng; giữa trong suốt để lộ bản đồ. */
function rimStatic(D: number, dpr: number): HTMLCanvasElement {
  const key = `${D}@${dpr}`;
  const hit = staticCache.get(key);
  if (hit) return hit;
  const P = pal();
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(D * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const R = D / 2;
  g.translate(R, R);
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.arc(0, 0, R - RIM, 0, Math.PI * 2, true);
  g.fillStyle = P.ink1;
  g.fill('evenodd');
  const gr = g.createLinearGradient(0, -R, 0, R);
  gr.addColorStop(0, P.goldHi);
  gr.addColorStop(0.5, P.gold);
  gr.addColorStop(1, P.goldLo);
  g.beginPath();
  g.arc(0, 0, R - 1.5, 0, Math.PI * 2);
  g.lineWidth = 3;
  g.strokeStyle = gr;
  g.stroke();
  g.beginPath();
  g.arc(0, 0, R - 13.5, 0, Math.PI * 2);
  g.lineWidth = 1.5;
  g.strokeStyle = P.goldLo;
  g.stroke();
  g.beginPath();
  g.arc(0, 0, R - RIM + 0.8, 0, Math.PI * 2);
  g.lineWidth = 1.6;
  g.strokeStyle = P.ngoc;
  g.stroke();
  staticCache.set(key, cv);
  return cv;
}

/** Hướng (độ, theo chiều kim đồng hồ từ Bắc) của mặt trời / mặt trăng theo bầu trời. */
const SUN_AT: Record<Sky, number> = { dawn: 100, day: 150, night: 150 };
const MOON_AT: Record<Sky, number> = { dawn: 280, day: 330, night: 300 };

/** Bát quái (Hậu Thiên) theo thứ tự quanh la bàn từ Bắc: Khảm, Cấn, Chấn, Tốn, Ly, Khôn, Đoài, Càn. Mỗi quẻ ba vạch từ dưới (gần tâm) lên: 1 = dương (liền), 0 = âm (đứt). */
const TRIGRAMS: readonly (readonly (0 | 1)[])[] = [
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 1],
  [1, 0, 1],
  [0, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
];

export interface RimLabels {
  n: string;
  e: string;
  s: string;
  w: string;
}

/**
 * Phần xoay: `rot` = góc (rad, theo chiều kim đồng hồ) của hướng Bắc so với phía trên màn hình (cùng quy ước `View.rot`).
 * Chữ giữ thẳng đứng, chỉ vị trí quay theo camera.
 */
export function drawRim(g: CanvasRenderingContext2D, D: number, dpr: number, rot: number, sky: Sky, labels: RimLabels): void {
  const P = pal();
  const R = D / 2;
  g.save();
  g.translate(R, R);
  g.drawImage(rimStatic(D, dpr), -R, -R, D, D);
  g.lineCap = 'round';
  // Bát quái khắc ở vành ngoài (Khảm Bắc, Cấn Đông Bắc, Chấn Đông, Tốn Đông Nam, Ly Nam, Khôn Tây Nam, Đoài Tây, Càn Tây Bắc), xoay theo camera.
  g.strokeStyle = P.gold;
  g.lineWidth = 1.3;
  for (let q = 0; q < 8; q++) {
    g.save();
    g.rotate(rot + (q * Math.PI) / 4);
    g.translate(0, -(R - 7.5));
    const lines = TRIGRAMS[q]!;
    // Vạch dưới cùng gần tâm: vẽ từ trong ra ngoài, mỗi vạch cách 2,4 px.
    for (let k = 0; k < 3; k++) {
      const y = (1 - k) * 2.4;
      g.beginPath();
      if (lines[k]) {
        g.moveTo(-4, y);
        g.lineTo(4, y);
      } else {
        g.moveTo(-4, y);
        g.lineTo(-1, y);
        g.moveTo(1, y);
        g.lineTo(4, y);
      }
      g.stroke();
    }
    g.restore();
  }
  // 24 sơn hướng: vạch mỗi 15° ở vành trong, đậm hơn ở 8 hướng chính; bốn hướng gốc nhường chỗ cho chữ.
  for (let i = 0; i < 24; i++) {
    if (i % 6 === 0) continue;
    const a = rot + (i * Math.PI) / 12;
    const eight = i % 3 === 0;
    const r1 = R - 14.5;
    const r2 = R - (eight ? 20 : 17.5);
    g.beginPath();
    g.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    g.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2);
    g.lineWidth = eight ? 1.8 : 1;
    g.strokeStyle = eight ? P.goldHi : P.gold;
    g.stroke();
  }
  // Bốn hướng chính: chữ ở vành trong, Bắc màu son.
  g.font = `700 11px ${P.head}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cards: [string, number][] = [
    [labels.n, 0],
    [labels.e, 1],
    [labels.s, 2],
    [labels.w, 3],
  ];
  for (const [txt, k] of cards) {
    const a = rot + (k * Math.PI) / 2;
    const rr = R - 17.5;
    g.fillStyle = k === 0 ? P.sonHi : P.goldHi;
    g.fillText(txt, Math.sin(a) * rr, -Math.cos(a) * rr + 0.5);
  }
  // Đầu Bắc: tam giác đỏ nhô ra ngoài vành.
  g.save();
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, -R - 3);
  g.lineTo(4.2, -R + 4);
  g.lineTo(-4.2, -R + 4);
  g.closePath();
  g.fillStyle = P.son;
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = P.ink0;
  g.stroke();
  g.restore();
  // Mặt trời và mặt trăng chạy trên vành: cái đang lên sáng rõ, cái kia mờ.
  const sunA = rot + (SUN_AT[sky] * Math.PI) / 180;
  const moonA = rot + (MOON_AT[sky] * Math.PI) / 180;
  const orb = (a: number, draw: () => void, alpha: number) => {
    g.save();
    g.globalAlpha = alpha;
    g.translate(Math.sin(a) * (R - 2), -Math.cos(a) * (R - 2));
    draw();
    g.restore();
  };
  orb(
    sunA,
    () => {
      g.beginPath();
      g.arc(0, 0, 6.5, 0, Math.PI * 2);
      g.fillStyle = P.gold;
      g.fill();
      g.lineWidth = 1.4;
      g.strokeStyle = P.goldHi;
      g.stroke();
    },
    sky === 'night' ? 0.35 : 1,
  );
  orb(
    moonA,
    () => {
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fillStyle = P.chu;
      g.fill();
      g.beginPath();
      g.arc(2.6, -1.2, 5.2, 0, Math.PI * 2);
      g.fillStyle = P.ink1;
      g.fill();
    },
    sky === 'night' ? 1 : 0.4,
  );
  g.restore();
}
