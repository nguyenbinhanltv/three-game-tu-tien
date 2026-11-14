// Địa chỉ server cho bot và security-check. Thứ tự ưu tiên: đối số dòng lệnh, SERVER_URL,
// PORT (biến môi trường rồi apps/server/.env.local), cuối cùng là localhost:2567.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function portFromServerEnvFile(): string | undefined {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', '.env.local');
  if (!fs.existsSync(file)) return undefined;
  const m = /^\s*PORT\s*=\s*["']?(\d+)/m.exec(fs.readFileSync(file, 'utf8'));
  return m?.[1];
}

/** URL HTTP của server, ví dụ http://localhost:2597. */
export function defaultServerHttp(): string {
  const url = process.env.SERVER_URL;
  if (url) return url.replace(/^ws/, 'http').replace(/\/$/, '');
  const port = process.env.PORT || portFromServerEnvFile() || '2567';
  return `http://localhost:${port}`;
}

export function defaultServerWs(): string {
  return defaultServerHttp().replace(/^http/, 'ws');
}
