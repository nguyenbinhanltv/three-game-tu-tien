// Kiểu thực thể của sim (R-7): người chơi, quái, vùng nổ, đạn, giao diện host. Tách khỏi sim.ts để các hệ con không import vòng.
import type { CampDef } from '@dtl/shared';
import type { Client } from 'colyseus';
import type { HazardGeom, InvSlot, MonsterDef, MoveInput, MoveState, PhaseRules, SkillDef, SpawnDef, TribDef } from '@dtl/shared';
import type { GuardCfg, TribState } from './tribtypes';
import type { MonS, NodeS, PlayerS } from '../state';
import type { Character } from './character';
import type { MethodRt } from './method';
import type { MonSkillRt } from './monskill';
import type { SkillFlow } from './skillflow';

/** Kiếm đan bản mệnh (E2-G): mỗi người một bộ, nhịp đánh theo `every`. */
export interface Summon {
  sid: string;
  until: number;
  nextAt: number;
  every: number;
  count: number;
  range: number;
  power: number;
  markFirst: boolean;
  elem?: string;
}
/** Giậm của Sơn Nhạc Hóa Thân (E2-G). */
export interface Stomp {
  sid: string;
  until: number;
  nextAt: number;
  every: number;
  r: number;
  power: number;
}

export interface PlayerEnt {
  sid: string;
  client: Client;
  char: Character;
  s: PlayerS;
  /** Tài khoản thử (đăng nhập thử khi server bật AUTH_DEV_BYPASS): được dùng lệnh GM và tham số kiểm thử. */
  dev: boolean;
  /** `?god` / `/gm god`: vẫn nhận đòn (số sát thương, khựng) nhưng không mất máu. Chỉ bật cho `dev`. */
  god: boolean;
  move: MoveState;
  inputs: MoveInput[];
  budget: number;
  lastInputAt: number;
  lastYaw: number;
  lastFlags: number;
  gcdAt: number;
  cds: Map<string, number>;
  itemCdAt: number;
  /** Mặc/tháo đồ: tối thiểu 200 ms giữa hai lần (mỗi lần là một giao dịch DB + dòng ledger). */
  equipCdAt: number;
  /** Ảnh túi client đang có (để gửi delta `S.INV`). */
  invSent?: InvSlot[];
  casting: { skill: SkillDef; target: string; endAt: number } | null;
  /** Đòn chờ `hitAt`, chuỗi đánh thường, cửa sổ cường hóa, lướt (K-2). */
  flow: SkillFlow;
  shield: { amount: number; until: number } | null;
  lastCombatAt: number;
  /** Lần đổi biến thức gần nhất (giờ server, ms): giãn các lần đổi. Không lưu DB. */
  variantAt: number;
  /** Cửa sổ miễn vùng nổ của quái: hết lúc `until` (ms), đã nhận `taken` (xem hazardHit). */
  hazardWin: { until: number; taken: number };
  meditating: boolean;
  xpAcc: number;
  /** Giây đả tọa tích lũy chưa báo cho nhiệm vụ `meditate` (dẫn khí nhập thể). */
  medAcc: number;
  /** `fin`: đã thả tia cuối (pha 3); `pills`: số đan hồi phục đã dùng trong kiếp này. */
  trib: TribState | null;
  /** Thử thách tâm ma đang chạy (P3-7): hết giờ `endAt`, bóng `monId`, chỗ bắt đầu (x, z). Xem `game/realm.ts`. */
  trial: { endAt: number; monId: string; x: number; z: number } | null;
  warnAt: number;
  chatAt: number;
  msgWindowAt: number;
  msgCount: number;
  /** Cửa sổ 1 giây đếm lệnh dùng skill (chống spam, riêng với giới hạn message chung). */
  skillWindowAt: number;
  skillCount: number;
  /** Trạng thái công pháp (kiếm ý/thế, vòng sạc, giảm sát thương). */
  mth: MethodRt;
  saveAt: number;
  /** Không nhận vật phẩm rơi (đã hết lượt thưởng bí cảnh hôm nay). */
  noLoot: boolean;
  /** Bị server đá (spam): không giữ chỗ chờ kết nối lại. */
  kicked: boolean;
  connected: boolean;
}

export interface MonEnt {
  id: string;
  def: MonsterDef;
  s: MonS;
  level: number;
  atk: number;
  defn: number;
  homeX: number;
  homeZ: number;
  spawn: SpawnDef | null;
  /** Cụm (bãi quái) mà con này thuộc về (M-2); hồi sinh do cụm quản. */
  camp?: CampRt;
  state: number;
  target: string;
  attackAt: number;
  respawnAt: number;
  removeAt: number;
  thinkAt: number;
  wanderAt: number;
  wx: number;
  wz: number;
  unreachableSince: number;
  /** Trước thời điểm này quái miễn sát thương (đang bỏ đuổi về chỗ). */
  evadeUntil: number;
  abilityAt: number;
  threat: Map<string, number>;
  /** sid chủ của quái riêng (bóng tâm ma): chỉ đánh và bị đánh bởi người này, không rơi đồ/tu vi. '' = quái thường. */
  owner: string;
  /** Ô cận chiến: giữ tới lúc này; không được giành lại trước `slotCdAt`. */
  slotUntil: number;
  slotCdAt: number;
  /** sid người chơi có ô cận chiến mà quái này đang giữ ('' = không giữ). */
  slotSid: string;
  /** Chiều đi vòng ngoài (±1). */
  orbitSign: number;
  /** Đòn thứ hai của chuỗi đòn đôi (0 = không có). */
  comboAt: number;
  comboTarget: string;
  /** Đang đọc chú (quái đánh xa). */
  cast: { endAt: number } | null;
  castReadyAt: number;
  /** Boss đang niệm chú (ngắt được sau đoạn hộ chú); `chantAt`: lúc được niệm lần tới (0 = chưa hẹn). */
  chant: { startAt: number; endAt: number; lastAt?: number } | null;
  chantAt: number;
  /** Bị ngắt chú hoặc mất thế: choáng tới lúc này, nhận thêm sát thương. */
  stunUntil: number;
  /** Pha boss (0 = pha đầu) và bộ chiêu/nhịp của pha đó (quái thường luôn ở pha 0). */
  phase: number;
  rules: PhaseRules;
  /** Thanh phá thế 0–1 và lúc trúng đòn gần nhất (ms). */
  posture: number;
  lastHitAt: number;
  /** Chiêu chém vùng: lúc được ra tiếp (0 = chưa hẹn); đang đứng yên khóa hướng tới `windUntil`. */
  sweepAt: number;
  windUntil: number;
  /** Nguyên tắc quái mở rộng (E1-E, game/monskill.ts). */
  mx: MonSkillRt;
  /** Đệ tử do quái `minionOf` gọi: không rơi đồ, không tu vi. */
  minionOf?: string;
  /** Dấu ấn của người chơi `sid` (Kiếm Ảnh Phân Quang): sát thương của người đó nhân (1 + mul) tới `until`. */
  mark?: { sid: string; until: number; mul: number };
  /** Bị khiêu khích: buộc nhắm người `sid` tới `until` (ms). */
  taunt?: { sid: string; until: number };
  /** Bị làm chậm (đòn bạo kích của bộ Hàn Giao Lân): tốc độ đuổi nhân `mul` tới `until`. */
  slow?: { until: number; mul: number };
  /** Mộc độc của Hồi Xuân Quyết (đan sư): mỗi giây gây `per` sát thương tới `until`. */
  poison?: { sid: string; until: number; nextAt: number; per: number };
}

export interface NodeEnt {
  id: string;
  s: NodeS;
  respawn: number;
  respawnAt: number;
}

export interface Hazard extends HazardGeom {
  at: number;
  /**
   * Sát thương cố định, phần trăm khí huyết tối đa nếu pct = true,
   * hoặc hệ số nhân với `atk` qua computeDamage nếu atk > 0.
   */
  dmg: number;
  pct: boolean;
  atk: number;
  /** Quái thả vùng (null = thiên kiếp). */
  mon: MonEnt | null;
  /** Tia cuối độ kiếp: khóa mệnh (trúng chủ kiếp dù đứng ngoài vòng), đan phòng ngự giảm sát thương. */
  lock?: boolean;
  /** Nhóm vòng cùng một vạch lôi võng: một người chỉ trúng một lần mỗi nhóm trong cùng nhịp nổ. */
  grp?: number;
  /** Tia khóa mệnh có hộ pháp: người đứng trong `r` mét chắn thay `share` sát thương (chia đều, tối đa `max` người). */
  guard?: GuardCfg;
  /** Giảm sát thương của tia khóa mệnh theo mức buff phòng ngự (`final.defMul`/`defMaxCut` của kiếp). */
  cut?: { mul: number; max: number };
  /** Trận môn khắc chế (Thiên Nhân Kiếp): ai đứng trong vòng này lúc nổ giảm `cut` và nhận cờ `ke`. */
  seal?: { x: number; z: number; r: number; cut: number };
  /** Luôn trúng chủ kiếp dù đứng ngoài vòng (không né bằng cách rời sân); người khác vẫn xét vị trí. Khác `lock`: không có giảm sát thương theo đan. */
  reach?: boolean;
  /** Nguồn: id quái, hoặc sid người độ kiếp. Thiên kiếp trúng cả người ngoài đứng trong vòng, nhưng không giết họ (xem `tickHazards`). */
  src: string;
}

/** Đạn đánh xa của quái đang bay (D1). Vị trí tính lại từ gốc + thời gian, không tích lũy sai số. */
export interface Bolt {
  id: number;
  x0: number;
  z0: number;
  yaw: number;
  v: number;
  r: number;
  /** Độ nâng theo độ cao mục tiêu lúc bắn (boltLift). */
  lift: number;
  /** Giờ server (ms) lúc phát và lúc hết hạn. */
  t0: number;
  endAt: number;
  /** Vị trí ở tick trước (để quét đoạn). */
  px: number;
  pz: number;
  atk: number;
  mul: number;
  mon: MonEnt;
}

export interface SimHost {
  broadcast(type: string, msg: unknown): void;
  /** Gửi cho cả phòng trừ các phiên trong `except` (AOI: người ở xa không nhận). Không có thì lùi về `broadcast`. */
  broadcastExcept?(type: string, msg: unknown, except: ReadonlySet<string>): void;
  /** Bí cảnh: gọi khi một quái không hồi sinh bị hạ. */
  onMonsterKilled?(m: MonEnt): void;
  /**
   * Chuyển người chơi sang bản đồ khác (E1-B): room kiểm điều kiện, cấp vé một lần, lưu nhân vật rồi báo client vào room mới.
   * Trả false nếu bị chặn (đã báo lý do cho người chơi). Không có (test) thì từ chối.
   */
  transferLevel?(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o?: TransferOpts): boolean;
  /** Độ kiếp ở room riêng (E1-F): cấp vé cho người độ kiếp và đồng đội trong tầm, báo client đổi room. false = bị chặn. */
  enterTribulationRoom?(p: PlayerEnt, def: TribDef, force: boolean): boolean;
  /** Một lần độ kiếp vừa kết thúc (thành công hoặc không). Room độ kiếp dùng để đóng phòng. */
  onTribulationEnd?(p: PlayerEnt, def: TribDef, success: boolean): void;
}

export interface TransferOpts {
  /** Chặn khi đang giao chiến (Truyền Tống). */
  combat?: boolean;
  /** Người dẫn tổ đội kéo theo đồng đội cùng room, trong tầm. */
  party?: boolean;
  /** Bỏ qua kiểm điều kiện (lệnh GM / tham số kiểm thử của tài khoản thử). */
  force?: boolean;
}

export interface SimOptions {
  levelId: string;
  roomName: string;
  /** Điểm xuất hiện mặc định. */
  spawn: { x: number; z: number };
  /** Chết thì hồi sinh tại đây. */
  respawn: { x: number; z: number };
  /** Có lưu vị trí khi rời room không (bí cảnh thì không). */
  persistPosition: boolean;
}

/** Ngữ cảnh một lần áp chiêu: đòn thứ mấy của chuỗi đánh thường, hệ số nhân (combo, cường hóa). */
export interface StrikeCtx {
  combo?: number;
  mul?: number;
}

/** Trạng thái chạy của một bãi. */
export interface CampRt {
  def: CampDef;
  /** Các SpawnDef của bãi (con thường, con đánh xa) để quái giữ khoảng cấp. */
  sp: SpawnDef;
  spRanged?: SpawnDef;
  /** Góc đầu vòng đội hình (cố định theo bãi). */
  phase: number;
  melee: MonEnt[];
  ranged?: MonEnt;
  /** Giờ (ms) cả cụm sẽ tái sinh, 0 = đang có quái sống. */
  respawnAt: number;
}
