// Bot headless để test tải và kiểm tra giao thức.
// Chạy: pnpm bots --count 100 --duration 300 [--url ws://localhost:2567] [--prefix bot]
// Không có --url thì dùng SERVER_URL hoặc PORT (xem target.ts).

import { Client, type Room } from 'colyseus.js';
import { C, IN_FLY, type InitMsg, MS_DEAD, PF_DEAD, ROOM_WORLD, S, STEP } from '@dtl/shared';
import { defaultServerWs } from './target';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const COUNT = Number(arg('count', '10'));
const DURATION = Number(arg('duration', '60'));
const URL = arg('url', defaultServerWs());
const PREFIX = arg('prefix', 'bot');
const VERBOSE = process.argv.includes('--verbose');

interface PlayerView {
  x: number;
  y: number;
  z: number;
  fl: number;
  lv: number;
  hp: number;
  seq: number;
}
interface MonView {
  x: number;
  z: number;
  st: number;
  lv: number;
}

class Bot {
  room!: Room;
  sid = '';
  seq = 0;
  yaw = Math.random() * Math.PI * 2;
  target = '';
  turnAt = 0;
  flyUntil = 0;
  msgs = 0;
  kills = 0;
  level = 1;
  timer: ReturnType<typeof setInterval> | null = null;

  constructor(public name: string) {}

  async connect(): Promise<void> {
    const client = new Client(URL);
    this.room = await client.joinOrCreate(ROOM_WORLD, { dev: this.name });
    this.room.onMessage(S.INIT, (m: InitMsg) => {
      this.sid = m.sid;
      this.level = m.char.level;
      if (VERBOSE) console.log(`[${this.name}] vào game, ${m.char.name} cấp ${m.char.level}`);
    });
    this.room.onMessage('*', (type) => {
      this.msgs++;
      if (VERBOSE && type === S.SYS) return;
    });
    this.room.onMessage(S.SYS, (m: { k: string; p?: Record<string, unknown> }) => {
      if (m.k === 'sys.levelup') this.level++;
      if (VERBOSE) console.log(`[${this.name}] ${m.k} ${JSON.stringify(m.p ?? {})}`);
    });
    this.room.onLeave((code) => {
      if (VERBOSE) console.log(`[${this.name}] rời room, mã ${code}`);
      if (this.timer) clearInterval(this.timer);
    });
    this.timer = setInterval(() => this.step(), STEP * 1000);
  }

  private me(): PlayerView | undefined {
    return (this.room.state as { players?: Map<string, PlayerView> }).players?.get(this.sid);
  }

  private step(): void {
    const me = this.me();
    if (!me) return;
    const now = Date.now();
    if (me.fl & PF_DEAD) {
      this.room.send(C.RESPAWN);
      this.target = '';
      return;
    }
    const monsters = (this.room.state as { monsters: Map<string, MonView> }).monsters;
    // Chọn quái gần nhất còn sống.
    let tgt = this.target ? monsters.get(this.target) : undefined;
    if (!tgt || tgt.st === MS_DEAD) {
      this.target = '';
      let best = 60 * 60;
      monsters.forEach((m, id) => {
        if (m.st === MS_DEAD || m.lv > this.level + 2) return;
        const d = (m.x - me.x) ** 2 + (m.z - me.z) ** 2;
        if (d < best) {
          best = d;
          this.target = id;
          tgt = m;
        }
      });
    }
    let mz = 1;
    let flags = 0;
    if (tgt) {
      const dx = tgt.x - me.x;
      const dz = tgt.z - me.z;
      // Hướng tiến = (-sin yaw, -cos yaw).
      this.yaw = Math.atan2(-dx, -dz);
      const d = Math.hypot(dx, dz);
      if (d < 18) {
        mz = 0;
        if (this.seq % 5 === 0) this.room.send(C.SKILL, { id: this.seq % 30 === 0 ? 'skl_kiem_khi_tram' : 'skl_phi_kiem', t: this.target });
      }
    } else {
      if (now > this.turnAt) {
        this.turnAt = now + 2000 + Math.random() * 4000;
        // Đi về phía thung lũng nơi có quái, lệch ngẫu nhiên.
        const dx = 2048 + (Math.random() - 0.5) * 400 - me.x;
        const dz = 2500 + (Math.random() - 0.5) * 300 - me.z;
        this.yaw = Math.atan2(-dx, -dz);
        if (Math.random() < 0.15) this.flyUntil = now + 4000;
        if (Math.random() < 0.1) this.room.send(C.CHAT, { m: 'đạo hữu, cùng tu luyện nào' });
      }
      if (now < this.flyUntil) flags |= IN_FLY;
    }
    this.seq++;
    this.room.send(C.INPUT, { s: this.seq, mx: 0, mz, yaw: this.yaw, f: flags });
  }

  async leave(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    try {
      await this.room.leave(true);
    } catch {
      /* đã rời */
    }
  }
}

async function main() {
  console.log(`Khởi động ${COUNT} bot tới ${URL}, chạy ${DURATION} giây…`);
  const bots: Bot[] = [];
  let failed = 0;
  for (let i = 0; i < COUNT; i++) {
    const b = new Bot(`${PREFIX}${i + 1}`);
    try {
      await b.connect();
      bots.push(b);
    } catch (e) {
      failed++;
      console.error(`bot ${b.name} không vào được:`, (e as Error).message);
    }
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`${bots.length} bot đã vào, ${failed} thất bại.`);
  const httpUrl = URL.replace(/^ws/, 'http') + '/health';
  const report = setInterval(async () => {
    try {
      const h = (await (await fetch(httpUrl)).json()) as { online: number; rooms: { name: string; players: number; tickP95: number }[] };
      const lv = bots.reduce((s, b) => s + b.level, 0) / Math.max(1, bots.length);
      console.log(`online=${h.online} ${h.rooms.map((r) => `${r.name}: ${r.players} người, tick p95 ${r.tickP95}ms`).join(' | ')} | cấp TB bot ${lv.toFixed(1)}`);
    } catch {
      console.log('không đọc được /health');
    }
  }, 10_000);
  await new Promise((r) => setTimeout(r, DURATION * 1000));
  clearInterval(report);
  try {
    const h = await (await fetch(httpUrl)).json();
    console.log('Kết quả cuối:', JSON.stringify(h));
  } catch {
    /* bỏ qua */
  }
  await Promise.all(bots.map((b) => b.leave()));
  console.log('Xong.');
  process.exit(0);
}

main();
