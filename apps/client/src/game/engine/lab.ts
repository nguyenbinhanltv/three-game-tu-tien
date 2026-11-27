// Công cụ phòng thử (Diễn Võ Trường) nằm ngoài lớp Game: khoảnh khắc giao diện bổ sung, máu/linh lực giả trên HUD, kiểm máy yếu.
// Mọi thứ ở đây CHỈ là hình ở máy mình: không gửi gì lên server, không đổi dữ liệu nhân vật, không đổi mặc định của game.
import { buildRecap } from '@dtl/shared';
import { METHOD_SKILLS } from '@dtl/content';
import { get, set } from '../../ui/store';
import type { Game } from '../engine';

/** Tên giả dài nhất thường gặp, dùng cho các khoảnh khắc có tên người chơi khác. */
const LAB_NAMES = ['Vạn Kiếm Quy Tông Chân Nhân', 'Thanh Mộc Đan Sư', 'Hộ Pháp Kim Cương', 'Cửu Tiêu Lôi Quân'];

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
