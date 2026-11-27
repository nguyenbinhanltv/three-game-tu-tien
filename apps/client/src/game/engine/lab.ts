// Công cụ phòng thử (Diễn Võ Trường) nằm ngoài lớp Game: khoảnh khắc giao diện bổ sung, máu/linh lực giả trên HUD, kiểm máy yếu.
// Mọi thứ ở đây CHỈ là hình ở máy mình: không gửi gì lên server, không đổi dữ liệu nhân vật, không đổi mặc định của game.
import { buildRecap } from '@dtl/shared';
import { METHOD_SKILLS } from '@dtl/content';
import { closePanel, get, openPanel, type Panel, set } from '../../ui/store';
import type { Game } from '../engine';

/** Tên giả cho dữ liệu thử có người chơi khác: dài đúng mức tối đa server cho đặt (`NAME_MAX` = 14 ký tự), không dài hơn (tên dài hơn không tồn tại trong game). */
export const LAB_NAMES = ['VạnKiếmQuyTông', 'ThanhMộcĐanSư', 'HộPhápKimCương', 'CửuTiêuLôiQuân'];

/**
 * Khoảnh khắc giao diện bổ sung của khu Giao diện (đợt hai): bảng tổng kết trận, lời mời tổ đội + tỉ thí, thẻ chiêu tối thượng.
 * `Game.labMoment` gọi sang đây cho các loại nó không biết. Trả false nếu không có loại đó.
 */
export function labMomentExtra(eng: Game, kind: string): boolean {
  switch (kind) {
    case 'recap':
      set({
        recap: buildRecap(
          'kiem_trung',
          754,
          LAB_NAMES.map((name, i) => ({
            sid: i === 0 ? eng.sid : 'lab' + i,
            name,
            level: 30 - i,
            dead: i === 2,
            dealt: [1_284_500, 402_300, 96_800, 731_200][i]!,
            heal: [0, 512_400, 18_200, 0][i]!,
            taken: [88_100, 41_700, 644_900, 120_300][i]!,
            reflect: [0, 0, 58_600, 0][i]!,
          })),
        ),
      });
      return true;
    case 'invite': {
      const until = Date.now() + 20_000;
      set({
        invites: [
          { kind: 'party', id: 9001, name: LAB_NAMES[1]!, until },
          { kind: 'duel', id: 9002, name: LAB_NAMES[0]!, until },
        ],
      });
      return true;
    }
    case 'ult': {
      // Chiêu tối thượng của công pháp mình đang tu nếu có, không thì chiêu tối thượng đầu danh sách.
      const mine = get().method?.method;
      const sk = METHOD_SKILLS.find((s) => s.ult && s.method === mine) ?? METHOD_SKILLS.find((s) => s.ult);
      if (!sk) return false;
      set({ ultCard: { id: ++eng.ultCardId, skill: sk.id, color: '9fd8ff', until: Date.now() + 900 } });
      return true;
    }
    case 'clear':
      // Dọn các khoảnh khắc còn treo (lời mời sống 20 giây, bảng tổng kết chờ bấm đóng) để lượt soi kế tiếp không bị chúng che.
      set({ invites: [], recap: null, ultCard: null, bossLine: null });
      return true;
    default:
      return false;
  }
}

/** Mức máu/linh lực giả của HUD (phần của tối đa, 0–1); null = theo nhân vật thật. */
export interface LabVitals {
  hp: number | null;
  mp: number | null;
}

/**
 * Đặt máu hoặc linh lực GIẢ trên HUD của mình để soi thanh máu, viền máu thấp, ô chiêu thiếu linh lực mà không phải để quái đánh.
 * `frac` ngoài 0–1 hoặc null thì trả kênh đó về số thật. Chỉ đổi số HUD đọc (`hudSync`), server và luật chơi không biết gì.
 */
export function labVitalsSet(eng: Game, what: 'hp' | 'mp', frac: number | null): boolean {
  const v = frac !== null && Number.isFinite(frac) && frac >= 0 && frac <= 1 ? frac : null;
  const cur: LabVitals = eng.labVitals ?? { hp: null, mp: null };
  const next: LabVitals = { ...cur, [what]: v };
  eng.labVitals = next.hp === null && next.mp === null ? null : next;
  return true;
}

export const LAB_PRESETS = ['high', 'medium', 'low'] as const;

/**
 * Kiểm máy yếu, phần đổi được ngay: đặt preset chất lượng và KHÓA nó (không tự nâng/hạ) để soi đúng mức đó. Preset là cài đặt của người chơi
 * (như trong Cài đặt), không phải mặc định của game.
 */
export function labPreset(eng: Game, q: string): boolean {
  if (!(LAB_PRESETS as readonly string[]).includes(q)) return false;
  eng.setQualityLock(true);
  eng.setQuality(q);
  return get().quality === q;
}

/** Kiểm máy yếu, phần phải tải lại: URL của trang hiện tại với `?renderer=<webgl2|webgpu>` (đường lùi không có WebGPU). */
export function labRendererUrl(href: string, renderer: 'webgl2' | 'webgpu'): string {
  const u = new URL(href);
  u.searchParams.set('renderer', renderer);
  return u.toString();
}

// ---------- nhịp hiệu ứng giao diện ----------

/** Token thời lượng của bộ giao diện Ngọc Giản chỉnh được trong phòng thử (khai ở `ui/u2/tokens.css`). */
export const LAB_UI_TOKENS = ['--u-dur-fast', '--u-dur', '--u-dur-open', '--u-dur-ink'] as const;

/** Giá trị hiện tại (ms) của một token thời lượng. */
export function labUiTokenGet(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(v.endsWith('ms') ? n : n * 1000) : 0;
}

/** Đặt một token thời lượng (ms) cho PHIÊN này; null = bỏ ghi đè, về giá trị của tokens.css. Không lưu, không đổi mặc định của game. */
export function labUiToken(name: string, ms: number | null): boolean {
  if (!(LAB_UI_TOKENS as readonly string[]).includes(name)) return false;
  const st = document.documentElement.style;
  if (ms === null || !Number.isFinite(ms)) st.removeProperty(name);
  else st.setProperty(name, Math.round(Math.min(2000, Math.max(0, ms))) + 'ms');
  return true;
}

let uiRate = 1;
let uiRateRaf = 0;
function uiRateTick(): void {
  for (const a of document.getAnimations()) if (a.playbackRate !== uiRate) a.playbackRate = uiRate;
  uiRateRaf = uiRate === 1 ? 0 : requestAnimationFrame(uiRateTick);
}

/**
 * Tốc độ phát của MỌI animation và transition CSS của giao diện (1 = thường; 0,1 = chậm mười lần) để soi nhịp bật bảng, thông báo, thẻ chương.
 * Áp cho cả animation sinh ra sau đó (lặp theo khung hình) tới khi đặt lại 1. Không đụng lớp 3D (xem nhóm Thời gian).
 */
export function labUiRate(rate: number): number {
  uiRate = Number.isFinite(rate) ? Math.min(1, Math.max(0.05, rate)) : 1;
  if (uiRateRaf) cancelAnimationFrame(uiRateRaf);
  uiRateTick();
  return uiRate;
}

export function labUiRateGet(): number {
  return uiRate;
}

// ---------- cửa sổ ----------

export const LAB_WINDOWS: readonly Panel[] = ['char', 'bag', 'method', 'quests', 'map', 'party', 'wardrobe', 'settings', 'help'];

/** Đóng mọi cửa sổ rồi mở đúng một cái (`id` rỗng = chỉ đóng), để chụp từng cửa sổ một mình ở mọi cỡ màn. */
export function labWindow(id: string): boolean {
  for (const w of get().windows) closePanel(w.id);
  if (!id) return true;
  if (!(LAB_WINDOWS as readonly string[]).includes(id)) return false;
  openPanel(id as Panel);
  return true;
}

/** Cổng gọi công cụ phòng thử từ console / Playwright (`__game.labx.*`), để thêm công cụ mới không phải sửa lớp Game. */
export function makeLabX(eng: Game) {
  return {
    window: labWindow,
    uiRate: labUiRate,
    uiRateGet: labUiRateGet,
    uiToken: labUiToken,
    uiTokenGet: labUiTokenGet,
    vitals: (what: 'hp' | 'mp', frac: number | null) => labVitalsSet(eng, what, frac),
    preset: (q: string) => labPreset(eng, q),
  };
}
