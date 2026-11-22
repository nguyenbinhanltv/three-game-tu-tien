import { renderToString } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAP_IDS } from '@dtl/shared';
import { hasString, t } from '@dtl/content';

// Mục Đạp Thiên (kết game) của tab Cửu Kiều: hiển thị theo CharView (kieu/dap) và Bảng Thiên Lộ do server gửi; ý định gửi qua `send` (không bấm được trong test,
// repo không có thư viện DOM). Nạp module động sau khi stub localStorage (module kéo giao diện u2).
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
let DapView: typeof import('./DapView').DapView;
let dapSummary: typeof import('./DapView').dapSummary;
let showDap: typeof import('./DapView').showDap;
beforeAll(async () => {
  ({ DapView, dapSummary, showDap } = await import('./DapView'));
});

type V = Parameters<typeof DapView>[0];
const send: V['send'] = () => undefined;
const html = (char: Partial<V['char']>, board: V['board'] = null) =>
  renderToString(<DapView char={{ kieu: 0, dap: '', ...char }} board={board} send={send} onCredits={() => undefined} />);

describe('DapView', () => {
  beforeEach(() => undefined);

  it('chưa đủ chín cầu: không hiện gì (xin vé từng cầu ở tab Cửu Kiều, không lặp ở đây)', () => {
    for (const kieu of [0, 3, 8]) {
      expect(showDap({ kieu })).toBe(false);
      expect(html({ kieu }), String(kieu)).toBe('');
    }
    expect(showDap({ kieu: 9 })).toBe(true);
  });

  it('đủ chín cầu: danh hiệu, lời kết, nút ghi công và bốn nguồn Cực nguyên chọn được', () => {
    const h = html({ kieu: 9 });
    expect(h).toContain(t('ui.kieu.title_dap'));
    expect(h).toContain('data-testid="kieu-epilogue"');
    expect(h).toContain(t('ui.kieu.credits_open'));
    for (const id of DAP_IDS) expect(h, id).toContain(`data-dap="${id}"`);
    expect(h).not.toContain('data-kieu-next');
    expect(h).not.toContain(t('ui.kieu.dap_current'));
  });

  it('đã chọn một nguồn: cả bốn nút khóa, nút của nguồn đã chọn ghi "Đã chọn"', () => {
    const h = html({ kieu: 9, dap: 'sat_luc' });
    expect(h).toContain(t('ui.kieu.dap_current'));
    expect(h.match(/disabled/g)?.length).toBe(4);
  });

  it('Bảng Thiên Lộ: đang tải, rỗng, và danh sách do server gửi', () => {
    expect(html({ kieu: 9 })).toContain(t('ui.kieu.board_loading'));
    expect(html({ kieu: 9 }, { rows: [], total: 0 })).toContain(t('ui.kieu.board_empty'));
    const h = html({ kieu: 9 }, { rows: [{ name: 'Lạc Vân', ts: 1_700_000_000_000 }], total: 3 });
    expect(h).toContain('data-name="Lạc Vân"');
    expect(h).toContain(t('ui.kieu.board_total', { n: 3 }));
  });

  it('chuỗi giao diện đủ và tóm tắt thưởng đúng', () => {
    for (const k of [
      'dap_head',
      'title_dap',
      'epilogue',
      'credits_open',
      'dap_title',
      'dap_pick',
      'board_title',
      'stat.hp',
      'stat.mp',
      'stat.atk',
      'stat.def',
    ])
      expect(hasString(`ui.kieu.${k}`), k).toBe(true);
    expect(dapSummary('sat_luc')).toContain('10%');
    expect(dapSummary('cam_che')).toContain('thủ');
  });
});
