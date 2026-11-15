// Bot headless để test tải và kiểm tra giao thức.
// Chạy: pnpm bots --count 100 --duration 300 [--url ws://localhost:2567] [--prefix bot] [--crowd x,z[,r]] [--fight x,z[,r]] [--level N] [--dungeon]
// --crowd: bot không đi săn mà đi lại/đứng quanh điểm (x, z) bán kính r (mặc định 25m), để đo client giữa đám đông (vd. sân tông môn 2048,2088).
// --fight: bot ở quanh điểm (x, z) bán kính r (mặc định 25m), đánh quái/boss trong vùng bằng đủ các chiêu (nhiều VFX),
//   thỉnh thoảng /gm heal để còn máu và linh lực. Không có quái thì đi lại như --crowd.
// --level N: lúc vào game tự /gm level N (chỉ tài khoản đăng nhập thử có GM) để mở mọi chiêu.
// --tp: lúc vào game /gm tp tới một chỗ ngẫu nhiên trong vùng --fight/--crowd thay vì đi bộ tới (cần đăng nhập thử).
// --dungeon: tới cổng Kiếm Trủng rồi vào bí cảnh (room tối đa 5 người, cần --level ≥ 8); thường đi kèm --fight 900,988.
// Gõ "quit" vào stdin để mọi bot rời room ngay (pnpm bench:crowd kết thúc bot theo cách này).
// Không có --url thì dùng SERVER_URL hoặc PORT (xem target.ts).

import { Client, type Room } from 'colyseus.js';
import { C, hashName, IN_FLY, type InitMsg, MS_DEAD, PF_DEAD, PORTAL_POS, ROOM_WORLD, S, STEP, type TransferMsg } from '@dtl/shared';
import { APPEARANCE } from '@dtl/content';
import { defaultServerWs } from './target';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function point(name: string, defR: number): { x: number; z: number; r: number } | null {
  const v = arg(name, '');
  if (!v) return null;
  const [x, z, r = defR] = v.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z, r } : null;
}

const COUNT = Number(arg('count', '10'));
const DURATION = Number(arg('duration', '60'));
const URL = arg('url', defaultServerWs());
const PREFIX = arg('prefix', 'bot');
const VERBOSE = process.argv.includes('--verbose');
const CROWD = point('crowd', 25);
const FIGHT = point('fight', 25);
const LEVEL = Number(arg('level', '0'));
const DUNGEON = process.argv.includes('--dungeon');
const TP = process.argv.includes('--tp');

/** Chiêu khi --fight: [id, cấp mở, hồi chiêu (giây), cần mục tiêu] theo skills.json; ra chiêu đầu tiên đã hết hồi. */
const FIGHT_SKILLS: [string, number, number, boolean][] = [
  ['skl_loi_dinh_nhat_kiem', 10, 20, true],
  ['skl_linh_khi_ho_the', 3, 30, false],
  ['skl_thien_kiem_vu', 5, 14, true],
  ['skl_kiem_khi_tram', 1, 6, true],
  ['skl_phi_kiem', 1, 0, true],
];

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
type Point = { x: number; z: number; r: number };

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
  private transferring = false;

  constructor(public name: string) {}

  async connect(): Promise<void> {
    await this.join(ROOM_WORLD);
    this.timer = setInterval(() => this.step(), STEP * 1000);
  }

  private async join(roomName: string): Promise<void> {
    const client = new Client(URL);
    // Màu áo khác nhau theo tên (chỉ có tác dụng lúc tạo nhân vật) để cảnh test tải giống người thật.
    const dye = APPEARANCE.dyes[hashName(this.name) % APPEARANCE.dyes.length].id;
    const room = await client.joinOrCreate(roomName, { dev: this.name, ap: { g: 'm', dye } });
    this.room = room;
    this.sid = '';
    room.onMessage(S.INIT, (m: InitMsg) => {
      this.sid = m.sid;
      this.level = m.char.level;
      if (VERBOSE) console.log(`[${this.name}] vào ${roomName}, ${m.char.name} cấp ${m.char.level}`);
      this.afterInit(roomName);
    });
    room.onMessage('*', () => {
      this.msgs++;
    });
    room.onMessage(S.SYS, (m: { k: string; p?: Record<string, unknown> }) => {
      if (m.k === 'sys.levelup') this.level++;
      if (VERBOSE) console.log(`[${this.name}] ${m.k} ${JSON.stringify(m.p ?? {})}`);
    });
    room.onMessage(S.TRANSFER, (m: TransferMsg) => void this.transfer(m.room));
    room.onLeave((code) => {
      if (VERBOSE) console.log(`[${this.name}] rời ${roomName}, mã ${code}`);
    });
  }

  /** Server bảo đổi room (vào/ra bí cảnh): rời room cũ, vào room mới như client thật (Game.transfer). */
  private async transfer(roomName: string): Promise<void> {
    if (this.transferring) return;
    this.transferring = true;
    this.sid = '';
    try {
      await this.room.leave(true);
    } catch {
      /* đã rời */
    }
    try {
      await this.join(roomName);
    } catch (e) {
      console.error(`bot ${this.name} không vào được ${roomName}:`, (e as Error).message);
      await this.join(ROOM_WORLD).catch(() => undefined);
    } finally {
      this.transferring = false;
    }
  }

  private chat(m: string): void {
    this.room.send(C.CHAT, { m });
  }

  /** Lên cấp bằng GM, rồi (nếu --dungeon và đang ở thế giới) tới cổng Kiếm Trủng và vào bí cảnh. Chat cách nhau ≥ 0,8 s. */
  private afterInit(roomName: string): void {
    let at = 200;
    if (LEVEL > 0 && this.level < LEVEL) {
      setTimeout(() => this.chat(`/gm level ${LEVEL}`), at);
      this.level = LEVEL;
      at += 1000;
    }
    if (DUNGEON && roomName === ROOM_WORLD) {
      setTimeout(() => this.chat(`/gm tp ${PORTAL_POS.x} ${PORTAL_POS.z + 4}`), at);
      setTimeout(() => this.room.send(C.PORTAL), at + 1200);
      return;
    }
    const zone = FIGHT ?? CROWD;
    if (TP && zone) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * zone.r * 0.8;
      setTimeout(() => this.chat(`/gm tp ${Math.round(zone.x + Math.cos(a) * r)} ${Math.round(zone.z + Math.sin(a) * r)}`), at);
    }
  }

  private me(): PlayerView | undefined {
    if (!this.sid || this.transferring) return undefined;
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
    if (FIGHT) return this.fight(me, now, FIGHT);
    if (CROWD) return this.crowd(me, now, CROWD);
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
        if (Math.random() < 0.1) this.chat('đạo hữu, cùng tu luyện nào');
      }
      if (now < this.flyUntil) flags |= IN_FLY;
    }
    this.seq++;
    this.room.send(C.INPUT, { s: this.seq, mx: 0, mz, yaw: this.yaw, f: flags });
  }

  /** Đánh quái trong vùng --fight: con còn sống gần mình nhất, đứng cách ≤ 16 m, ra chiêu mỗi ~1,1–1,4 s (GCD 1 s). */
  private nextCastAt = 0;
  private healAt = Date.now() + 5000 + Math.random() * 10_000;
  private skillCd = new Map<string, number>();
  private fight(me: PlayerView, now: number, f: Point): void {
    if (now > this.healAt) {
      this.healAt = now + 15_000 + Math.random() * 10_000;
      this.chat('/gm heal');
    }
    const monsters = (this.room.state as { monsters: Map<string, MonView> }).monsters;
    const inZone = (m: MonView) => m.st !== MS_DEAD && Math.hypot(m.x - f.x, m.z - f.z) < f.r + 25;
    let tgt = this.target ? monsters.get(this.target) : undefined;
    if (!tgt || !inZone(tgt)) {
      this.target = '';
      tgt = undefined;
      let best = Infinity;
      monsters.forEach((m, id) => {
        if (!inZone(m)) return;
        const d = (m.x - me.x) ** 2 + (m.z - me.z) ** 2;
        if (d < best) {
          best = d;
          this.target = id;
          tgt = m;
        }
      });
    }
    if (!tgt) return this.crowd(me, now, f);
    const dx = tgt.x - me.x;
    const dz = tgt.z - me.z;
    this.yaw = Math.atan2(-dx, -dz);
    let mz = Math.hypot(dx, dz) > 16 ? 1 : 0;
    if (!mz && now >= this.nextCastAt) {
      for (const [id, lv, cd, needTarget] of FIGHT_SKILLS) {
        if (this.level < lv || (this.skillCd.get(id) ?? 0) > now) continue;
        this.skillCd.set(id, now + cd * 1000 + 300);
        this.room.send(C.SKILL, needTarget ? { id, t: this.target } : { id });
        break;
      }
      this.nextCastAt = now + 1100 + Math.random() * 300;
    }
    // Thỉnh thoảng nhích lên để đám đông không đứng im (vẫn trong tầm chiêu 26 m).
    if (!mz && Math.random() < 0.02) mz = 1;
    this.seq++;
    this.room.send(C.INPUT, { s: this.seq, mx: 0, mz, yaw: this.yaw, f: 0 });
  }

  /** Đi lại quanh điểm tụ tập: ra ngoài bán kính thì quay về, thỉnh thoảng đứng yên. */
  private moving = true;
  private crowd(me: PlayerView, now: number, c: Point): void {
    const dx = c.x - me.x;
    const dz = c.z - me.z;
    if (Math.hypot(dx, dz) > c.r) {
      this.yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.6;
      this.moving = true;
    } else if (now > this.turnAt) {
      this.turnAt = now + 1500 + Math.random() * 3500;
      this.yaw = Math.random() * Math.PI * 2;
      this.moving = Math.random() < 0.6;
    }
    this.seq++;
    this.room.send(C.INPUT, { s: this.seq, mx: 0, mz: this.moving ? 1 : 0, yaw: this.yaw, f: 0 });
  }

  async leave(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.transferring = true;
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
  // Hết giờ, hoặc nhận "quit" từ stdin (công cụ đo điều khiển bot qua pipe).
  await new Promise<void>((r) => {
    setTimeout(r, DURATION * 1000);
    process.stdin.on('data', (d) => {
      if (String(d).includes('quit')) r();
    });
  });
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
