// Giới hạn tần suất theo IP cho các đường HTTP có xác thực (/matchmake) và bắt tay WebSocket.
// Token bucket trong bộ nhớ: đủ cho một tiến trình, 50 người online.
import type http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { log } from './log';

export interface RateLimitOptions {
  /** Số request dồn tối đa (dung lượng xô). <= 0 thì tắt giới hạn. */
  burst: number;
  /** Tốc độ hồi token mỗi phút. */
  perMin: number;
  /** Tin X-Forwarded-For (chỉ bật khi server đứng sau reverse proxy của mình). */
  trustProxy: boolean;
  /** Khóa IP (sau chuẩn hóa) được miễn giới hạn — chỉ dùng cho bot/test ở máy dev. */
  exempt: Set<string>;
  /** Số IP theo dõi tối đa; vượt thì bỏ bớt mục cũ nhất để bộ nhớ không phình. */
  maxEntries?: number;
}

interface Bucket {
  tokens: number;
  last: number;
}

export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();
  private readonly ratePerMs: number;
  private readonly maxEntries: number;

  constructor(
    readonly burst: number,
    perMin: number,
    maxEntries = 10_000,
  ) {
    this.ratePerMs = Math.max(0, perMin) / 60_000;
    this.maxEntries = maxEntries;
  }

  get enabled(): boolean {
    return this.burst > 0;
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Lấy một token. Trả 0 nếu được phép, ngược lại số giây nên chờ (>= 1). */
  take(key: string, now = Date.now()): number {
    if (!this.enabled) return 0;
    let b = this.buckets.get(key);
    if (b) {
      b.tokens = Math.min(this.burst, b.tokens + (now - b.last) * this.ratePerMs);
      b.last = now;
      // Đưa xuống cuối Map để thứ tự chèn = thứ tự dùng gần nhất.
      this.buckets.delete(key);
    } else {
      if (this.buckets.size >= this.maxEntries) this.evict(now);
      b = { tokens: this.burst, last: now };
    }
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    if (this.ratePerMs <= 0) return 3600;
    return Math.max(1, Math.ceil((1 - b.tokens) / this.ratePerMs / 1000));
  }

  /** Bỏ các xô đã hồi đầy (không còn mang thông tin gì). */
  sweep(now = Date.now()): void {
    for (const [k, b] of this.buckets) {
      if (b.tokens + (now - b.last) * this.ratePerMs >= this.burst) this.buckets.delete(k);
    }
  }

  private evict(now: number): void {
    this.sweep(now);
    // Vẫn đầy (đang bị dội từ rất nhiều IP): bỏ mục dùng lâu nhất.
    while (this.buckets.size >= this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

/** Mở rộng IPv6 (có '::') thành 8 nhóm hex. */
function expandV6(ip: string): string[] {
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? new Array(Math.max(0, 8 - h.length - t.length)).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

/**
 * Khóa giới hạn cho một địa chỉ: IPv4 giữ nguyên (kể cả dạng ::ffff:a.b.c.d), IPv6 gộp theo /64
 * vì một máy thường có cả dải /64 và đổi địa chỉ tùy ý. Chuỗi không phải IP trả về 'invalid'.
 */
export function ipKey(raw: string | undefined): string {
  let ip = (raw ?? '').trim();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1] ?? ip;
  const v = net.isIP(ip);
  if (v === 4) return ip;
  if (v === 6) {
    if (ip === '::1') return '::1';
    return expandV6(ip).slice(0, 4).join(':') + '::/64';
  }
  return 'invalid';
}

/**
 * IP của người gửi. Chỉ đọc X-Forwarded-For khi bật trustProxy, và lấy phần tử cuối cùng
 * (do proxy của mình ghi thêm) — các phần tử phía trước do client tự khai, giả được.
 */
export function clientIp(headers: http.IncomingHttpHeaders, remote: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    const s = Array.isArray(xff) ? xff.join(',') : xff;
    if (s) {
      const parts = s
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return ipKey(last);
    }
  }
  return ipKey(remote);
}

/** Đọc cấu hình từ biến môi trường (xem CLAUDE.md và apps/server/src/config.ts). */
export function rateLimitFromEnv(env: NodeJS.ProcessEnv): RateLimitOptions {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
  };
  const production = env.NODE_ENV === 'production';
  const exempt = new Set<string>();
  for (const e of (env.RATE_LIMIT_EXEMPT ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (e === 'loopback') {
      exempt.add('127.0.0.1');
      exempt.add('::1');
    } else exempt.add(ipKey(e));
  }
  exempt.delete('invalid');
  if (production && exempt.size > 0) {
    log.warn('[config] RATE_LIMIT_EXEMPT bị bỏ qua vì đang ở production.');
    exempt.clear();
  }
  let burst = num(env.RATE_LIMIT_BURST, 40);
  if (production && burst <= 0) {
    log.warn('[config] RATE_LIMIT_BURST<=0 (tắt giới hạn) bị bỏ qua ở production, dùng mặc định 40.');
    burst = 40;
  }
  return {
    burst,
    perMin: num(env.RATE_LIMIT_PER_MIN, 20),
    trustProxy: env.TRUST_PROXY === '1',
    exempt,
  };
}

/** Trần kích thước thân request /matchmake (byte). */
export const MAX_MATCHMAKE_BODY = 16 * 1024;

type RequestListener = (req: http.IncomingMessage, res: http.ServerResponse) => void;
type UpgradeListener = (req: http.IncomingMessage, socket: Duplex, head: Buffer) => void;

export interface HttpRateLimiter {
  matchmake: TokenBucket;
  upgrade: TokenBucket;
}

/**
 * Bọc mọi listener 'request' và 'upgrade' hiện có của httpServer (gồm route /matchmake mà Colyseus
 * gắn vào). Gọi SAU `new Server(...)` để chặn được trước Colyseus.
 * - /matchmake/*: một token mỗi request (OPTIONS preflight không tính). Hết token: 429 + Retry-After.
 *   Thân request quá MAX_MATCHMAKE_BODY: 413 và ngắt.
 * - Bắt tay WebSocket: xô riêng cùng ngưỡng. Hết token: trả 429 rồi đóng socket.
 * Mọi lỗi trong bộ lọc dừng ở đây (quy tắc: request listener phải bọc try/catch).
 */
export function installHttpRateLimit(
  server: http.Server,
  opts: RateLimitOptions,
  corsHeaders: (req: http.IncomingMessage) => Record<string, string> = () => ({}),
): HttpRateLimiter {
  const matchmake = new TokenBucket(opts.burst, opts.perMin, opts.maxEntries);
  const upgrade = new TokenBucket(opts.burst, opts.perMin, opts.maxEntries);
  const keyOf = (req: http.IncomingMessage) => clientIp(req.headers, req.socket.remoteAddress, opts.trustProxy);
  let warnedAt = 0;
  const logLimited = (kind: string, key: string) => {
    const now = Date.now();
    if (now - warnedAt < 10_000) return;
    warnedAt = now;
    log.warn(`[ratelimit] chặn ${kind} từ ${key}`);
  };

  // Colyseus gom cả thân request vào bộ nhớ không giới hạn; tùy chọn đăng nhập (kể cả ID token Google) chỉ vài KB.
  const capBody = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    let done = false;
    const tooBig = () => {
      // Response có thể đã xong (handler khác trả lời trước khi thân đến hết): ghi thêm sẽ phát
      // ERR_STREAM_WRITE_AFTER_END thành sự kiện 'error' không ai nghe và làm sập tiến trình.
      if (done || res.writableEnded || res.destroyed) return;
      done = true;
      if (!res.headersSent) res.writeHead(413, { ...corsHeaders(req), 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ code: 413, error: 'body_too_large' }));
    };
    if (Number(req.headers['content-length'] ?? 0) > MAX_MATCHMAKE_BODY) {
      tooBig();
      req.resume();
      return false;
    }
    let n = 0;
    const onData = (chunk: Buffer) => {
      n += chunk.length;
      if (n > MAX_MATCHMAKE_BODY) {
        req.off('data', onData);
        tooBig();
        req.destroy();
      }
    };
    req.on('data', onData);
    res.once('close', () => req.off('data', onData));
    return true;
  };

  const reqListeners = server.listeners('request').slice(0) as RequestListener[];
  server.removeAllListeners('request');
  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      // Colyseus nhận mọi URL chứa '/matchmake' với mọi method; chỉ preflight OPTIONS là miễn phí.
      if (req.method !== 'OPTIONS' && (req.url ?? '').includes('/matchmake')) {
        // Kiểm giới hạn trước: request bị 429 không gắn bộ đếm thân (tránh ghi lên response đã xong).
        const key = keyOf(req);
        if (!opts.exempt.has(key)) {
          const wait = matchmake.take(key);
          if (wait > 0) {
            logLimited('matchmake', key);
            res.writeHead(429, {
              ...corsHeaders(req),
              'content-type': 'application/json',
              'retry-after': String(wait),
              'access-control-expose-headers': 'Retry-After',
              // Đóng kết nối sau khi trả lời: không phải đọc tiếp thân của request bị từ chối.
              connection: 'close',
            });
            res.end(JSON.stringify({ code: 429, error: 'rate_limited' }));
            req.resume();
            return;
          }
        }
        if (!capBody(req, res)) return;
      }
    } catch (e) {
      log.error('[ratelimit] lỗi bộ lọc request:', e);
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }
    for (const l of reqListeners) l.call(server, req, res);
  });

  const upListeners = server.listeners('upgrade').slice(0) as UpgradeListener[];
  server.removeAllListeners('upgrade');
  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const key = keyOf(req);
      if (!opts.exempt.has(key)) {
        const wait = upgrade.take(key);
        if (wait > 0) {
          logLimited('websocket', key);
          socket.end(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${wait}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
          return;
        }
      }
    } catch (e) {
      log.error('[ratelimit] lỗi bộ lọc upgrade:', e);
      socket.destroy();
      return;
    }
    for (const l of upListeners) l.call(server, req, socket, head);
  });

  const timer = setInterval(() => {
    matchmake.sweep();
    upgrade.sweep();
  }, 60_000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return { matchmake, upgrade };
}
