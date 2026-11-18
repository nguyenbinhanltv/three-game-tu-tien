import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { matchMaker, Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketClient, WebSocketTransport } from '@colyseus/ws-transport';
import { config } from './config';
import { sqlite } from './db';
import { installHttpRateLimit } from './ratelimit';
import { dungeonRoomName, ROOM_TRIBULATION, TRIB_LEVEL, tribRoomNameOf, worldRoomName } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { activeRooms, defineDungeon, defineTribulation, defineWorld, onlineCount, TribulationRoom } from './rooms';
import { maybeCpuProfile } from './game/tickprof';
import { log } from './log';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Mọi lỗi khi xử lý request HTTP phải dừng ở đây: một URL xấu không được làm sập cả server game. */
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  try {
    handleHttp(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
  }
}

function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    const rooms = [...activeRooms].map((r) => ({
      name: r.roomName,
      players: r.sim.players.size,
      monsters: r.sim.monsters.length,
      tickP95: Number(r.sim.tickP95().toFixed(2)),
      ...(r.sim.prof.enabled ? { prof: r.sim.prof.report() } : {}),
    }));
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, online: onlineCount(), rooms }));
    return;
  }
  const dist = config.clientDist;
  if (!fs.existsSync(dist)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Đạp Thiên Lộ — server đang chạy. Client dev ở http://localhost:${process.env.CLIENT_PORT || 5173} (hoặc chạy pnpm build để server phục vụ bản build).`);
    return;
  }
  let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  if (file !== dist && !file.startsWith(dist + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
  if (url.pathname.startsWith('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
  res.writeHead(200, headers);
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

// Trạng thái đầy đủ của một kênh 50–100 người vượt bộ đệm mặc định 8KB của bộ mã hóa.
Encoder.BUFFER_SIZE = 128 * 1024;
// Client không được tự tạo room (mở kênh mới để có boss và điểm hái mới tinh);
// kênh mới chỉ sinh ra qua joinOrCreate khi các kênh hiện có đã đầy.
matchMaker.controller.exposedMethods = ['joinOrCreate', 'join', 'joinById', 'reconnect'];

const httpServer = http.createServer(serveStatic);
// Colyseus mã hóa patch vào một bộ đệm dùng chung và đưa thẳng cho ws; với gói lớn ws không sao chép mà ghi bất đồng bộ
// từ chính bộ đệm đó. Client đọc chậm (trình duyệt dừng đọc socket khi luồng chính bị chặn, ví dụ ~10 s biên dịch shader
// WebGL2 ở khung đầu) thì gói còn nằm trong hàng đợi bị tick sau ghi đè → client giải mã hỏng ("refId" not found, mất đồng
// bộ trạng thái). Quái nhiều (M-1: 378) làm patch đủ lớn để dính. Sao chép trước khi gửi (một memcpy vài KB mỗi gói).
const rawSend = WebSocketClient.prototype.raw;
WebSocketClient.prototype.raw = function (this: InstanceType<typeof WebSocketClient>, data: Uint8Array | Buffer, options?: unknown, cb?: (err?: Error) => void) {
  return rawSend.call(this, Buffer.from(data), options as never, cb);
};
// Nhịp ping của ws: mặc định 3 s × 2 lần ≈ 9 s. Trình duyệt dừng đọc socket khi luồng chính của trang bị chặn (biên
// dịch shader WebGL2 ở khung đầu có thể ~10 s, và 378 quái làm luồng patch dày hơn nên bộ đệm nhận đầy sớm), pong không
// trả được và server cắt kết nối (mã 1006). Nới tới ~33 s: client chết thật vẫn bị dọn sau nửa phút.
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, pingInterval: 3000, pingMaxRetries: 10 }) });
// Sau khi Colyseus gắn route /matchmake và ws gắn 'upgrade': bọc ngoài cùng để chặn trước cả hai.
const rl = config.rateLimit;
installHttpRateLimit(httpServer, rl, (req) => ({
  ...matchMaker.controller.DEFAULT_CORS_HEADERS,
  ...matchMaker.controller.getCorsHeaders(req),
}));

// Mỗi level một loại room (E1-B): bản đồ thế giới `world` (Vân Lam) / `world-<id>`, bí cảnh `dungeon` (Kiếm Trủng) / `dungeon-<id>`.
// Vào level ngoài Vân Lam và bí cảnh cần vé một lần (xem transfer.ts); client không tự tạo room được (exposedMethods ở trên).
for (const lv of Object.values(LEVELS)) {
  if (lv.tribulation) continue;
  if (lv.dungeon) gameServer.define(dungeonRoomName(lv.id), defineDungeon(lv.id)).filterBy(['dgKey']);
  else gameServer.define(worldRoomName(lv.id), defineWorld(lv.id));
}

// Room độ kiếp riêng (E1-F): mỗi lần độ kiếp một room (khóa `tribRoom` trong vé), tổ đội vào cùng.
gameServer.define(ROOM_TRIBULATION, TribulationRoom).filterBy(['tribRoom']);
for (const lv of Object.values(LEVELS)) {
  if (lv.tribulation && lv.id !== TRIB_LEVEL) gameServer.define(tribRoomNameOf(lv.id), defineTribulation(lv.id)).filterBy(['tribRoom']);
}

await gameServer.listen(config.port);
void maybeCpuProfile();
log.info(`[server] Đạp Thiên Lộ chạy ở cổng ${config.port}`);
log.info(
  `[server] giới hạn /matchmake + websocket: ${rl.burst > 0 ? `${rl.burst} dồn, ${rl.perMin}/phút mỗi IP` : 'TẮT'}` +
    `${rl.trustProxy ? ', tin X-Forwarded-For' : ''}${rl.exempt.size ? `, miễn: ${[...rl.exempt].join(' ')}` : ''}`,
);
log.info(`[server] đăng nhập dev: ${config.devBypass ? 'BẬT (chỉ dùng khi phát triển)' : 'tắt'}; Google: ${config.googleClientId ? 'đã cấu hình' : 'chưa cấu hình'}`);

setInterval(() => {
  for (const r of activeRooms) {
    if (r.sim.players.size > 0) {
      log.info(`[metric] room=${r.roomName} players=${r.sim.players.size} monsters=${r.sim.monsters.length} tick_ms_p95=${r.sim.tickP95().toFixed(2)}`);
    }
  }
}, 30_000).unref();

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  log.info('[server] đang lưu và tắt…');
  for (const r of activeRooms) r.sim.saveAll();
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (e) {
    log.warn('[server] tắt Colyseus không gọn (tiếp tục thoát):', e);
  }
  sqlite.close();
  process.exit(0);
}
// Lỗi lọt lưới: ghi log, lưu mọi nhân vật, và tiếp tục chạy thay vì để cả nhóm rớt mạng.
process.on('uncaughtException', (e) => {
  log.error('[server] uncaughtException:', e);
  for (const r of activeRooms) r.sim.saveAll();
});
process.on('unhandledRejection', (e) => {
  log.error('[server] unhandledRejection:', e);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
