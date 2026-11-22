import { renderToString } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAP_IDS } from '@dtl/shared';
import { hasString, t } from '@dtl/content';
// store/Game đọc localStorage khi nạp: stub trước rồi nạp module bằng import động.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
let KieuView: typeof import('./KieuView').KieuView;
let dapSummary: typeof import('./KieuView').dapSummary;
beforeAll(async () => {
  ({ KieuView, dapSummary } = await import('./KieuView'));
});

// TN-7: tab Thiên Lộ ở Dẫn Kiều Nhân. Hiển thị theo CharView (kieu/dap/level) và Bảng Thiên Lộ do server gửi; ý định gửi qua Game (không có trong test).
type V = Parameters<typeof KieuView>[0];
const sent: { type: string; msg: unknown }[] = [];
const send: V['send'] = (type, msg) => void sent.push({ type, msg });
const html = (char: Partial<V['char']> | null, board: V['board'] = null) =>
  renderToString(char ? <KieuView char={{ level: 44, kieu: 0, dap: '', ...char }} board={board} send={send} /> : <></>);

describe('KieuView', () => {
  beforeEach(() => void (sent.length = 0));

  it('chưa vào game thì không vẽ gì', () => {
    expect(html(null)).toBe('');
  });

  it('chưa qua cầu nào: nút xin vé cầu 1, chưa có mục chọn nguồn', () => {
    const h = html({ kieu: 0 });
    expect(h).toContain('data-kieu-next="1"');
    expect(h).toContain(t('dungeon.kieu_1.name'));
    expect(h).not.toContain('data-dap=');
  });

  it('thiếu cấp cho cầu kế: nút xin vé bị khóa và báo cảnh giới cần', () => {
    const h = html({ kieu: 3, level: 44 }); // cầu 4 cần ≥ 45
    expect(h).toContain('data-kieu-next="4"');
    expect(h).toContain('disabled');
    expect(h).toContain(t('realm.45'));
  });

  it('đủ chín cầu: danh hiệu, bốn nguồn Cực nguyên chọn được; đã chọn thì khóa hết', () => {
    let h = html({ kieu: 9, level: 47 });
    expect(h).toContain(t('ui.kieu.title_dap'));
    expect(h).toContain('data-testid="kieu-epilogue"');
    expect(html({ kieu: 8, level: 47 })).not.toContain('kieu-epilogue');
    for (const id of DAP_IDS) expect(h, id).toContain(`data-dap="${id}"`);
    expect(h).not.toContain('data-kieu-next');
    h = html({ kieu: 9, level: 47, dap: 'sat_luc' });
    expect(h).toContain(t('ui.kieu.dap_current'));
    expect(h.match(/disabled/g)?.length).toBe(4);
  });

  it('Bảng Thiên Lộ: đang tải, rỗng, và danh sách do server gửi', () => {
    expect(html({ kieu: 1 })).toContain(t('ui.kieu.board_loading'));
    expect(html({ kieu: 1 }, { rows: [], total: 0 })).toContain(t('ui.kieu.board_empty'));
    const h = html({ kieu: 1 }, { rows: [{ name: 'Lạc Vân', ts: 1_700_000_000_000 }], total: 3 });
    expect(h).toContain('data-name="Lạc Vân"');
    expect(h).toContain(t('ui.kieu.board_total', { n: 3 }));
  });

  it('chuỗi giao diện đủ và tóm tắt thưởng đúng', () => {
    for (const k of ['title', 'progress', 'enter', 'dap_title', 'dap_pick', 'board_title', 'stat.hp', 'stat.mp', 'stat.atk', 'stat.def'])
      expect(hasString(`ui.kieu.${k}`), k).toBe(true);
    expect(hasString('ui.npc.tab.kieu')).toBe(true);
    expect(dapSummary('sat_luc')).toContain('10%');
    expect(dapSummary('cam_che')).toContain('thủ');
  });
});
