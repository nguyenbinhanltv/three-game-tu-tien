// Nạp lại dữ liệu tức thì + cổng lưu bố cục phòng tập (Diễn Võ Trường V3). CHỈ có ở `vite dev` (`apply: 'serve'`): bản build và server
// game không có mã này.
//
// 1) Khi một file dữ liệu "nóng" đổi (timeline fx, cảnh mẫu, chuỗi i18n, bố cục phòng), Vite mặc định tải lại cả trang vì không
//    module nào nhận HMR cho JSON. Ở đây chặn việc tải lại và gửi nội dung mới cho trang qua sự kiện `dtl:data`; trang vá dữ liệu đang
//    chạy tại chỗ (`@dtl/content/hot`, `apps/client/src/game/editor/hotData.ts`). Module của file vẫn bị Vite đánh dấu cũ nên lần tải
//    trang kế tiếp nhận bản mới như thường.
// 2) `GET/POST /__lab/layout`: đọc / ghi `packages/shared/src/props.dienvo.layout.json` cho chế độ chỉnh phòng. Chỉ nhận từ chính máy
//    này (loopback), chỉ ghi ĐÚNG một file, nội dung phải qua `checkDienVoLayout` của `@dtl/shared`.
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const HOT_RE = /^packages\/content\/data\/(fx\/[^/]+|lab\/scenes|i18n\/vi(\.ui)?)\.json$/;
const LAYOUT = 'packages/shared/src/props.dienvo.layout.json';
const MAX_BODY = 64 * 1024;

interface LayoutLike {
  props: object[];
  spawns: Record<string, object[]>;
}
type Check = (raw: unknown) => { ok: LayoutLike } | { err: string };

/** Mỗi đạo cụ một dòng: diff của file bố cục đọc được khi commit. */
export function formatLayout(l: LayoutLike): string {
  const line = (o: object) =>
    '{ ' +
    Object.entries(o)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ') +
    ' }';
  const list = (a: object[], pad: string) => (a.length ? '[\n' + a.map((o) => pad + '  ' + line(o)).join(',\n') + '\n' + pad + ']' : '[]');
  return `{\n  "props": ${list(l.props, '  ')},\n  "spawns": { "arena": ${list(l.spawns.arena ?? [], '  ')}, "boss": ${list(l.spawns.boss ?? [], '  ')} }\n}\n`;
}

const isLoopback = (a: string | undefined) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

export function dtlHotData(repoRoot: string): Plugin {
  const layoutFile = path.join(repoRoot, LAYOUT);
  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  const layoutApi = (server: ViteDevServer) => (req: IncomingMessage, res: ServerResponse) => {
    // Vite dev mở cổng ra LAN (`host: true`): cổng ghi file chỉ nhận từ chính máy này, và phải có header riêng + JSON
    // (trang web lạ mở trong trình duyệt của máy dev không gửi được yêu cầu như vậy mà không qua preflight).
    if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { err: 'chỉ nhận từ máy này' });
    if (req.method === 'GET') {
      try {
        return send(res, 200, JSON.parse(fs.readFileSync(layoutFile, 'utf8')));
      } catch (e) {
        return send(res, 500, { err: String(e) });
      }
    }
    if (req.method !== 'POST') return send(res, 405, { err: 'chỉ GET/POST' });
    if (req.headers['x-dtl-lab'] !== '1' || !String(req.headers['content-type'] ?? '').startsWith('application/json'))
      return send(res, 400, { err: 'thiếu header' });
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      void (async () => {
        try {
          if (size > MAX_BODY) return send(res, 413, { err: 'quá lớn' });
          const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // Luật kiểm nằm ở @dtl/shared (một nguồn): nạp qua Vite để dùng thẳng mã TS.
          const mod = (await server.ssrLoadModule('@dtl/shared')) as { checkDienVoLayout: Check };
          const c = mod.checkDienVoLayout(raw);
          if ('err' in c) return send(res, 400, { err: c.err });
          const tmp = layoutFile + '.tmp';
          fs.writeFileSync(tmp, formatLayout(c.ok));
          fs.renameSync(tmp, layoutFile);
          send(res, 200, { ok: true, props: c.ok.props.length, file: LAYOUT });
        } catch (e) {
          send(res, 400, { err: String(e) });
        }
      })();
    });
  };
  return {
    name: 'dtl-hot-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab/layout', layoutApi(server));
    },
    async handleHotUpdate({ file, server, read }) {
      const rel = path.relative(repoRoot, file).replaceAll('\\', '/');
      if (rel !== LAYOUT && !HOT_RE.test(rel)) return;
      let data: { path: string; json?: unknown; error?: string };
      try {
        data = { path: rel, json: JSON.parse(await read()) };
      } catch (e) {
        // File đang ghi dở hoặc JSON hỏng: báo cho trang, giữ dữ liệu cũ, KHÔNG tải lại trang.
        data = { path: rel, error: String(e) };
      }
      server.ws.send({ type: 'custom', event: 'dtl:data', data });
      return [];
    },
  };
}
