import { describe, expect, it } from 'vitest';
import { CLUSTER, clusterGeom, designArea, hudBoxes, minDesignHeight, modeOf, overlaps, skillBox, slotsTouch } from './layout';
import { uiScaleFor } from '../../uiScale';

// Độ phân giải PC cần phủ (mục 9.2 kế hoạch). Hệ số tự động lấy từ uiScaleFor (cùng hàm CSS dùng).
const PC: Array<[number, number]> = [
  [1280, 720],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

describe('HUD layout: hộp vùng không chồng lấn', () => {
  for (const [w, h] of PC) {
    for (const questCollapsed of [false, true]) {
      for (const chatCollapsed of [false, true]) {
        for (const skillLayout of ['arc', 'bar'] as const) {
          it(`${w}×${h} nhiệm vụ ${questCollapsed ? 'gọn' : 'mở'} chat ${chatCollapsed ? 'gọn' : 'mở'} ${skillLayout}`, () => {
            const s = uiScaleFor(w, h);
            const { W, H } = designArea(w, h, s);
            const b = hudBoxes(W, H, modeOf(s), { questCollapsed, chatCollapsed, skillLayout });
            expect(overlaps(b)).toEqual([]);
            for (const k of ['tl', 'tc', 'hub', 'map', 'quest', 'chat', 'skills', 'utility', 'dock'] as const) {
              const x = b[k];
              expect(x.x, k).toBeGreaterThanOrEqual(0);
              expect(x.y, k).toBeGreaterThanOrEqual(0);
              expect(x.x + x.w, k).toBeLessThanOrEqual(W);
              expect(x.y + x.h, k).toBeLessThanOrEqual(H);
            }
          });
        }
      }
    }
  }

  it('vùng thiết kế: 4K = 1920×1080 (scale 2), 1280×720 = 1506×847', () => {
    expect(designArea(3840, 2160, uiScaleFor(3840, 2160))).toEqual({ W: 1920, H: 1080 });
    expect(designArea(1280, 720, uiScaleFor(1280, 720))).toEqual({ W: 1506, H: 847 });
  });

  it('thanh boss không đè TL/TR (rộng ≤ 760, còn 600 ở vùng 1506)', () => {
    const b = hudBoxes(1920, 1080, 'standard');
    expect(b.tc.w).toBe(760);
    expect(hudBoxes(1506, 847, 'compact').tc.w).toBeGreaterThanOrEqual(560);
  });

  it('cảm ứng (chuẩn bị): 844×390, 390×844, 1024×768 không chồng lấn', () => {
    for (const [w, h] of [
      [844, 390],
      [390, 844],
      [890, 668],
    ] as const) {
      expect(overlaps(hudBoxes(w, h, 'touch')), `${w}×${h}`).toEqual([]);
    }
  });
});

describe('HUD layout: hệ số người dùng × độ phân giải', () => {
  for (const [w, h] of PC) {
    for (const user of [0.8, 1, 1.2, 1.4]) {
      for (const layout of ['arc', 'bar'] as const) {
        it(`${w}×${h} × ${user} ${layout}: không chồng lấn, vùng thiết kế đủ cao`, () => {
          const s = uiScaleFor(w, h, user);
          const { W, H } = designArea(w, h, s);
          const mode = modeOf(s);
          expect(H).toBeGreaterThanOrEqual(minDesignHeight(mode === 'compact' ? 'compact' : 'standard'));
          expect(overlaps(hudBoxes(W, H, mode, { skillLayout: layout }))).toEqual([]);
        });
      }
    }
  }
});

describe('cụm kỹ năng PC', () => {
  const box = skillBox(1920, 1080);
  const g = clusterGeom(box);
  it('hộp nằm trọn trong màn hình, sát lề an toàn 24', () => {
    expect(box.w).toBeGreaterThan(300);
    expect(box.x + box.w).toBe(1920 - 24);
    expect(box.y + box.h).toBe(1080 - 24);
  });
  it('mọi ô nằm trong hộp', () => {
    for (const s of [g.main, ...g.inner, ...g.outer, ...g.qer]) {
      expect(s.cx - s.d / 2).toBeGreaterThanOrEqual(-0.5);
      expect(s.cy - s.d / 2).toBeGreaterThanOrEqual(-0.5);
      expect(s.cx + s.d / 2).toBeLessThanOrEqual(box.w + 0.5);
      expect(s.cy + s.d / 2).toBeLessThanOrEqual(box.h + 0.5);
    }
  });
  it('không ô nào chạm nhau (hở ≥ 8)', () => {
    const all = [g.main, ...g.inner, ...g.outer, ...g.qer];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(slotsTouch(all[i]!, all[j]!, 8), `${i}-${j}`).toBe(false);
  });
  it('ô nhỏ nhất ≥ 56 (icon ≥ 48 px ở HUD), đòn chính 112', () => {
    expect(CLUSTER.mainD).toBe(112);
    expect(Math.min(CLUSTER.innerD, CLUSTER.outerD, CLUSTER.qerD)).toBeGreaterThanOrEqual(56);
  });
});
