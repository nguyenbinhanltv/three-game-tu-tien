// Room phòng cầu Cửu Kiều (TN-7): phó bản riêng (vé một lần) + luật qua cầu của server (`game/kieu/bridge.ts`).
// Điều kiện qua cầu do chính room thấy (hết đợt quái/hạ mọi Kiếm Ảnh), không có tin nào từ client. Kiểm vào cửa lần hai ở `DungeonRoom.onAuth`.
import { MS_DEAD, PF_DEAD, kieuIsFirstClear, kieuOfLevel, type WaveDef } from '@dtl/shared';
import { LEVELS, t } from '@dtl/content';
import type { Character } from '../game/character';
import type { MonEnt, PlayerEnt } from '../game/entities';
import { KieuBridge } from '../game/kieu/bridge';
import { DungeonRoom } from './dungeon';

export class KieuRoom extends DungeonRoom {
  private get n(): number {
    return kieuOfLevel(this.levelId)!;
  }

  private br: KieuBridge | null = null;

  /** Bộ luật qua cầu của lượt này (dựng ở lần dùng đầu, nối với sim của room). */
  protected get bridge(): KieuBridge {
    if (this.br) return this.br;
    const sim = this.sim;
    return (this.br = new KieuBridge(this.n, {
      now: () => Date.now(),
      players: () => sim.players.values(),
      isDead: (p) => (p.s.fl & PF_DEAD) !== 0,
      spawnShadow: (p, st, o) => sim.spawnShadow(p, st, o),
      strike: (x, z, r, delay, mul, src, atk) => sim.addHazard({ x, z, r }, delay, mul, false, 'spirit', src, atk),
      sys: (p, k, params, type) => sim.sys(p, k, params, type),
      dismiss: (m) => {
        if (m.state === MS_DEAD) return;
        m.s.hp = 0;
        m.state = MS_DEAD;
        m.s.st = MS_DEAD;
        m.removeAt = Date.now() + 500;
      },
      clear: (p, n, o) => sim.kieu.onClear(p, n, o),
    }));
  }

  override onCreate(options: unknown): void {
    super.onCreate(options);
    this.clock.setInterval(() => this.bridge.tick(), 500);
  }

  /** Lượt đầu mới có thưởng và rơi đồ; luyện lại (đã qua cầu này) không rơi đồ, không thưởng. */
  override noLootFor(char: Character): boolean {
    // Giữ cả giới hạn theo ngày của phó bản (đợt đánh đầu tiên trong ngày đánh dấu đã dùng): vào ra liên tục không cày đồ lần đầu được.
    return super.noLootFor(char) || !kieuIsFirstClear(char.meta.kieu, this.n);
  }

  /** Giờ tính thời gian qua cầu bắt đầu từ lúc có người vào (gồm cả thời gian chờ đợt đầu), không phải lúc quái đầu tiên xuất hiện. */
  override afterJoin(p: PlayerEnt): void {
    super.afterJoin(p);
    this.bridge.begin();
  }

  /** Đóng góp: chỉ tính khi người chơi thật sự gây sát thương lên quái/Kiếm Ảnh (server đếm, không có tin nào từ client). */
  override onPlayerHitMonster(p: PlayerEnt, _m: MonEnt): void {
    this.bridge.noteHit(p);
  }

  protected override spawnWave(w: WaveDef): void {
    this.bridge.begin();
    if (!w.shadow) return super.spawnWave(w);
    this.sim.sysAll('sys.dungeon_wave', { n: this.wave, boss: w.title ? t('dungeon.' + this.levelId + '.wave.' + this.wave) : '' }, 'info');
    this.bridge.startShadowWave(w.shadow);
  }

  protected override onCleared(): void {
    this.bridge.finish();
  }
}

/** Lớp room cho một phòng cầu (`dungeon-kieu_<n>`). */
export function defineKieu(levelId: string): typeof KieuRoom {
  if (kieuOfLevel(levelId) === null || !LEVELS[levelId]?.dungeon) throw new Error(`defineKieu: ${levelId} không phải phòng cầu`);
  return class extends KieuRoom {
    static override levelId = levelId;
  };
}
