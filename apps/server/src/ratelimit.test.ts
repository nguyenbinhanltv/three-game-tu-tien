import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { clientIp, installHttpRateLimit, ipKey, MAX_MATCHMAKE_BODY, rateLimitFromEnv, TokenBucket } from './ratelimit';

describe('TokenBucket', () => {
  it('cho dồn burst rồi chặn, hồi theo perMin', () => {
    const b = new TokenBucket(3, 60); // 1 token/giây
    expect([b.take('a', 0), b.take('a', 0), b.take('a', 0)]).toEqual([0, 0, 0]);
    expect(b.take('a', 0)).toBe(1);
    expect(b.take('b', 0)).toBe(0); // IP khác không ảnh hưởng
    expect(b.take('a', 1000)).toBe(0);
    expect(b.take('a', 1000)).toBeGreaterThanOrEqual(1);
  });
  it('burst <= 0 thì tắt', () => {
    const b = new TokenBucket(0, 10);
    for (let i = 0; i < 100; i++) expect(b.take('a', 0)).toBe(0);
  });
  it('sweep bỏ xô đầy, giới hạn số mục', () => {
    const b = new TokenBucket(2, 60, 3);
    for (const k of ['a', 'b', 'c', 'd', 'e']) b.take(k, 0);
    expect(b.size).toBeLessThanOrEqual(3);
    b.sweep(10_000);
    expect(b.size).toBe(0);
  });
});

describe('ipKey / clientIp', () => {
  it('chuẩn hóa IPv4, ::ffff:, IPv6 /64', () => {
    expect(ipKey('::ffff:10.0.0.7')).toBe('10.0.0.7');
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(ipKey('::1')).toBe('::1');
    expect(ipKey('rác')).toBe('invalid');
    expect(ipKey(undefined)).toBe('invalid');
  });
  it('bỏ qua X-Forwarded-For khi không tin proxy', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '127.0.0.1', false)).toBe('127.0.0.1');
  });
  it('tin proxy: lấy phần tử cuối (do proxy ghi), không lấy phần client tự khai', () => {
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, '127.0.0.1', true)).toBe('1.2.3.4');
    expect(clientIp({}, '127.0.0.1', true)).toBe('127.0.0.1');
  });
});

describe('rateLimitFromEnv', () => {
  it('mặc định bật', () => {
    const o = rateLimitFromEnv({});
    expect(o.burst).toBeGreaterThan(0);
    expect(o.trustProxy).toBe(false);
    expect(o.exempt.size).toBe(0);
  });
  it('production bỏ miễn trừ và không cho tắt', () => {
    const o = rateLimitFromEnv({ NODE_ENV: 'production', RATE_LIMIT_EXEMPT: 'loopback', RATE_LIMIT_BURST: '0' });
    expect(o.exempt.size).toBe(0);
    expect(o.burst).toBeGreaterThan(0);
  });
  it('dev: loopback miễn trừ', () => {
    const o = rateLimitFromEnv({ RATE_LIMIT_EXEMPT: 'loopback, 10.0.0.2' });
    expect([...o.exempt].sort()).toEqual(['10.0.0.2', '127.0.0.1', '::1']);
  });
});

describe('installHttpRateLimit', () => {
  let server: http.Server | null = null;
  afterEach(() => server?.close());

  async function start(burst: number, inner: http.RequestListener, exempt: string[] = []) {
    server = http.createServer(inner);
    installHttpRateLimit(server, { burst, perMin: 1, trustProxy: false, exempt: new Set(exempt) });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it('429 sau burst, X-Forwarded-For giả không lách được, đường khác không bị chặn', async () => {
    let hits = 0;
    const base = await start(2, (_req, res) => {
      hits++;
      res.end('ok');
    });
    const post = (xff?: string) =>
      fetch(base + '/matchmake/joinOrCreate/world', { method: 'POST', body: '{}', headers: xff ? { 'x-forwarded-for': xff } : {} });
    expect((await post()).status).toBe(200);
    expect((await post('9.9.9.1')).status).toBe(200);
    const r = await post('9.9.9.2');
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(hits).toBe(2);
    expect((await fetch(base + '/matchmake/joinOrCreate/world', { method: 'OPTIONS' })).status).toBe(200);
    expect((await fetch(base + '/health')).status).toBe(200);
  });

  it('thân request /matchmake quá lớn bị 413, không tới handler', async () => {
    let hits = 0;
    const base = await start(10, (req, res) => {
      hits++;
      req.resume();
      req.on('end', () => res.end('ok'));
    });
    const big = 'x'.repeat(MAX_MATCHMAKE_BODY + 1);
    const r = await fetch(base + '/matchmake/joinOrCreate/world', { method: 'POST', body: big });
    expect(r.status).toBe(413);
    expect(hits).toBe(0);
    expect((await fetch(base + '/matchmake/joinOrCreate/world', { method: 'POST', body: '{}' })).status).toBe(200);
  });

  it('đã bị 429 rồi gửi thân chunked quá trần: server không sập', async () => {
    const base = await start(1, (req, res) => {
      req.resume();
      req.on('end', () => res.end('ok'));
    });
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on('uncaughtException', onErr);
    try {
      expect((await fetch(base + '/matchmake/joinOrCreate/world', { method: 'POST', body: '{}' })).status).toBe(200);
      // Không có Content-Length (Transfer-Encoding: chunked), thân > trần, gửi từng mảnh.
      const status = await new Promise<number | string>((resolve) => {
        const u = new URL(base + '/matchmake/joinOrCreate/world');
        const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST' }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', (e) => resolve('err:' + e.message));
        const piece = 'x'.repeat(4096);
        let i = 0;
        const pump = () => {
          if (i++ < 10 && !req.destroyed) {
            req.write(piece);
            setTimeout(pump, 5);
          } else if (!req.destroyed) req.end();
        };
        pump();
      });
      expect(status === 429 || String(status).startsWith('err:')).toBe(true);
      await new Promise((r) => setTimeout(r, 100));
      // Server vẫn sống: request khác vẫn có phản hồi.
      expect((await fetch(base + '/health')).status).toBe(200);
      expect(errors).toEqual([]);
    } finally {
      process.off('uncaughtException', onErr);
    }
  });

  it('thân vượt trần sau khi response đã xong: không ghi thêm lên response (không sập)', () => {
    // req/res giả để tái hiện chắc chắn: res.end() trên response đã xong phát 'error' như Node
    // khi socket chưa bị hủy, và không ai nghe 'error' thì EventEmitter ném ra.
    const srv = http.createServer((_req, res) => res.end('ok')); // trả lời ngay, chưa đọc thân
    installHttpRateLimit(srv, { burst: 10, perMin: 1, trustProxy: false, exempt: new Set() });
    const req = Object.assign(new EventEmitter(), {
      method: 'POST',
      url: '/matchmake/joinOrCreate/world',
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
      resume() {},
      destroy() {},
    });
    let ends = 0;
    const res = Object.assign(new EventEmitter(), {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      writeHead() {
        res.headersSent = true;
      },
      end() {
        ends++;
        if (res.writableEnded) res.emit('error', Object.assign(new Error('write after end'), { code: 'ERR_STREAM_WRITE_AFTER_END' }));
        res.writableEnded = true;
      },
    });
    srv.emit('request', req, res);
    expect(ends).toBe(1);
    expect(() => {
      for (let i = 0; i < 5; i++) req.emit('data', Buffer.alloc(4096));
    }).not.toThrow();
    expect(ends).toBe(1);
  });

  it('IP miễn trừ không bị chặn', async () => {
    const base = await start(1, (_req, res) => res.end('ok'), ['127.0.0.1']);
    for (let i = 0; i < 5; i++) expect((await fetch(base + '/matchmake/x/y', { method: 'POST', body: '{}' })).status).toBe(200);
  });
});
