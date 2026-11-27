import { describe, expect, it } from 'vitest';
import { LabTrace, TRACE_ROWS, traceSpans } from './labTrace';

describe('LabTrace (nhật ký điều khiển của phòng thử)', () => {
  it('ghép phím → gửi → server trả lời → trúng thành một dòng', () => {
    const tr = new LabTrace();
    tr.key('Digit1', 1000);
    tr.send('sk', { id: 'kiem_khi_tram' }, 1040);
    tr.recv('cd', {}, 'me', 1110);
    tr.recv('dmg', { src: 'me', dst: 'm1', n: 10 }, 'me', 1400);
    expect(tr.rows).toHaveLength(1);
    expect(tr.rows[0]!.label).toBe('kiem_khi_tram');
    expect(traceSpans(tr.rows[0]!)).toEqual({ hold: 40, ack: 70, hit: 360 });
  });

  it('bỏ qua tin không phải lệnh hành động, sát thương của người khác và hồi máu', () => {
    const tr = new LabTrace();
    tr.send('in', {}, 0);
    tr.send('chat', { m: 'x' }, 0);
    expect(tr.rows).toHaveLength(0);
    tr.send('sk', { id: 'a' }, 10);
    tr.recv('cd', {}, 'me', 50);
    tr.recv('dmg', { src: 'other', dst: 'm1', n: 1 }, 'me', 60);
    tr.recv('dmg', { src: 'me', dst: 'me', n: 1, heal: true }, 'me', 70);
    expect(tr.rows[0]!.hitAt).toBeNull();
  });

  it('lệnh tự phát (tự đánh) không có phím; phím cũ quá cửa sổ không được gán', () => {
    const tr = new LabTrace();
    tr.send('sk', { id: 'a' }, 100);
    expect(tr.rows[0]!.key).toBeNull();
    tr.key('KeyQ', 200);
    tr.send('sk', { id: 'b' }, 5000);
    expect(tr.rows[1]!.key).toBeNull();
    expect(traceSpans(tr.rows[1]!).hold).toBeNull();
  });

  it('một phím chỉ gán cho một lệnh; đòn quét trúng nhiều quái chỉ tính cú đầu', () => {
    const tr = new LabTrace();
    tr.key('Digit2', 0);
    tr.send('sk', { id: 'a' }, 10);
    tr.send('sk', { id: 'b' }, 20);
    expect(tr.rows.map((r) => r.key)).toEqual(['Digit2', null]);
    tr.recv('cd', {}, 'me', 30);
    tr.recv('cd', {}, 'me', 40);
    tr.recv('dmg', { src: 'me' }, 'me', 100);
    tr.recv('dmg', { src: 'me' }, 'me', 101);
    // Cú trúng đầu thuộc lệnh mới nhất đã được nhận; cú thứ hai rơi về lệnh trước đó còn trống.
    expect(tr.rows[1]!.hitAt).toBe(100);
    expect(tr.rows[0]!.hitAt).toBe(101);
  });

  it('server không trả lời trong cửa sổ thì dòng giữ trống; giữ tối đa TRACE_ROWS dòng', () => {
    const tr = new LabTrace();
    tr.send('sk', { id: 'a' }, 0);
    tr.recv('cd', {}, 'me', 9000);
    expect(tr.rows[0]!.ackAt).toBeNull();
    for (let i = 0; i < TRACE_ROWS + 3; i++) tr.send('dg', {}, 10_000 + i);
    expect(tr.rows).toHaveLength(TRACE_ROWS);
    expect(tr.rows[0]!.type).toBe('dg');
  });
});
