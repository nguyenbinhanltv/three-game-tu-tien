import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { balance, defringe, detectGrid, extractAlpha, packChannels, parseGrid, stats } from './forge.js';
import { toPng } from './io.js';
import { checkManifest, forge, readManifest } from './pipeline.js';
import { sampleSlashFlipbook, sampleTileNoise } from './samples.js';

describe('extractAlpha', () => {
  it('nền đen → alpha theo độ sáng, màu gỡ khỏi nền', () => {
    const r = extractAlpha(sampleSlashFlipbook(4, 64, 'black'));
    const s = stats(r);
    expect(s.cover).toBeGreaterThan(0.01);
    expect(s.cover).toBeLessThan(0.5);
    // điểm nền (góc khung đầu) trong suốt
    expect(r.data[3]).toBeLessThan(0.05);
  });
  it('ảnh trong suốt giữ alpha', () => {
    const src = sampleSlashFlipbook(4, 64, 'alpha');
    const r = extractAlpha(src, 'auto');
    expect(stats(r).cover).toBeGreaterThan(0.01);
  });
});

describe('detectGrid', () => {
  it('nhận 4×4', () => expect(detectGrid(extractAlpha(sampleSlashFlipbook(4, 128, 'black')))).toMatchObject({ cols: 4, rows: 4 }));
  it('nhận 8×8', () => expect(detectGrid(extractAlpha(sampleSlashFlipbook(8, 64, 'black')))).toMatchObject({ cols: 8, rows: 8 }));
  it('ảnh trống → 1×1', () =>
    expect(detectGrid({ w: 64, h: 64, data: new Float32Array(64 * 64 * 4) })).toMatchObject({ cols: 1, rows: 1 }));
});

describe('balance / defringe / pack', () => {
  it('cân sáng đưa alpha cao về ~0,98', () => {
    const r = extractAlpha(sampleSlashFlipbook(4, 64, 'black'));
    for (let i = 3; i < r.data.length; i += 4) r.data[i] = r.data[i]! * 0.5;
    const b = balance(r);
    let mx = 0;
    for (let i = 3; i < b.data.length; i += 4) mx = Math.max(mx, b.data[i]!);
    expect(mx).toBeGreaterThan(0.9);
  });
  it('khử viền xóa điểm gần trong suốt', () => {
    const r = { w: 2, h: 1, data: new Float32Array([1, 0, 0, 0.02, 1, 1, 1, 1]) };
    const d = defringe(r);
    expect(Array.from(d.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });
  it('đóng kênh: R mặt nạ, G ăn mòn, B trung tính 0,5', () => {
    const m = extractAlpha(sampleSlashFlipbook(4, 64, 'black'));
    const p = packChannels(m);
    expect(p.data[0]).toBeCloseTo(m.data[3]!, 5);
    expect(p.data[2]).toBeCloseTo(0.5, 5);
    expect(p.data[3]).toBe(1);
  });
  it('đóng kênh dùng ảnh ăn mòn/méo khi có', () => {
    const m = extractAlpha(sampleSlashFlipbook(4, 32, 'black'));
    const n = sampleTileNoise(128);
    const p = packChannels(m, { erode: n, distort: n });
    expect(p.data[1]).toBeCloseTo(n.data[0]!, 5);
    expect(p.data[2]).toBeCloseTo(n.data[0]!, 5);
  });
});

describe('parseGrid', () => {
  it('đọc 4x4, từ chối rác', () => {
    expect(parseGrid('4x4')).toEqual({ cols: 4, rows: 4 });
    expect(parseGrid('abc')).toBeNull();
    expect(parseGrid('0x4')).toBeNull();
  });
});

describe('forge end to end', () => {
  it('nhập flipbook nền đen: ra file, manifest, contact sheet, dòng nguồn', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    try {
      const input = path.join(tmp, 'in.png');
      fs.writeFileSync(input, await toPng(sampleSlashFlipbook(4, 128, 'black')));
      const out = path.join(tmp, 'out');
      const res = await forge(
        { id: 'test_slash', input, outDir: out, sheetDir: path.join(tmp, 'sheets'), ktx: false, pack: 'packed' },
        tmp,
      );
      expect(res.entry.grid).toEqual({ cols: 4, rows: 4 });
      expect(res.entry.source).toMatch(/Codex-generated/);
      expect(fs.existsSync(path.join(out, 'test_slash.png'))).toBe(true);
      expect(fs.existsSync(path.join(tmp, 'sheets', 'test_slash.contact.png'))).toBe(true);
      expect(readManifest(out)).toHaveLength(1);
      // PNG chưa phải KTX2 → check phải báo
      expect(checkManifest(out).join()).toMatch(/KTX2/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it('id xấu bị từ chối', async () => {
    await expect(forge({ id: 'Bad Id', input: 'x', outDir: 'y', ktx: false }, '.')).rejects.toThrow(/id/);
  });
});
