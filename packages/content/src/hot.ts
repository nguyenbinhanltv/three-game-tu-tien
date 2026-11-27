// Nạp lại dữ liệu tức thì (Diễn Võ Trường V3): vá dữ liệu game ĐANG CHẠY tại chỗ khi một file JSON đổi trên đĩa, không tải lại trang,
// không khởi động lại server. Chỉ được gọi ở máy phát triển: client qua sự kiện HMR của Vite (`apps/client/dtlHotData.ts`), server qua bộ
// theo dõi file chỉ bật khi đăng nhập thử đang bật (`apps/server/src/devReload.ts`). Không có đường nào từ tin nhắn mạng tới đây.
//
// Cách vá: giữ nguyên DANH TÍNH của đối tượng/mảng đã xuất (`FX_TIMELINE.get(id)`, `LAB_SCENES`…) và thay nội dung bên
// trong, nên mọi nơi đang giữ tham chiếu đều thấy bản mới ở lần đọc kế tiếp. Mục có id MỚI (file mới) không vá được: cần khai báo import
// trong `fxRegistry.ts` và tải lại. Pose (`data/poses`) CHƯA nóng: client nướng pose thành AnimationClip lúc nạp nên vẫn tải lại trang.
import { setDienVoLayout, type FxTimeline, type LabScene } from '@dtl/shared';
import {
  CO_FX_TIMELINES,
  FX_TIMELINES,
  HK_FX_TIMELINES,
  HON_FX_TIMELINES,
  KC_FX_TIMELINES,
  LAB_SCENES,
  MON_FX_TIMELINES,
  SUY_FX_TIMELINES,
  TRAN_FX_TIMELINES,
  hotStrings,
} from './index';

export type HotKind = 'fx' | 'lab' | 'i18n' | 'layout';

export interface HotResult {
  ok: boolean;
  kind: HotKind | null;
  /** Đường dẫn tương đối gốc repo của file vừa đổi. */
  path: string;
  /** id của mục đã vá (timeline) nếu có. */
  id?: string;
  /** Lý do không vá được, hoặc ghi chú (số mục đã đổi). */
  note?: string;
}

/** Đường dẫn bố cục chỉnh tay của phòng tập (tương đối gốc repo). */
export const HOT_LAYOUT_PATH = 'packages/shared/src/props.dienvo.layout.json';
const DATA = 'packages/content/data/';

/** Loại dữ liệu nạp lại tức thì được của một đường dẫn (tương đối gốc repo, dấu `/`); không thuộc loại nào thì null. */
export function hotKind(rel: string): HotKind | null {
  if (rel === HOT_LAYOUT_PATH) return 'layout';
  if (!rel.startsWith(DATA) || !rel.endsWith('.json')) return null;
  const sub = rel.slice(DATA.length);
  if (/^fx\/[^/]+\.json$/.test(sub)) return 'fx';
  if (sub === 'lab/scenes.json') return 'lab';
  if (sub === 'i18n/vi.json' || sub === 'i18n/vi.ui.json') return 'i18n';
  return null;
}

const FX_LISTS: readonly (readonly FxTimeline[])[] = [
  FX_TIMELINES,
  MON_FX_TIMELINES,
  SUY_FX_TIMELINES,
  HK_FX_TIMELINES,
  KC_FX_TIMELINES,
  HON_FX_TIMELINES,
  CO_FX_TIMELINES,
  TRAN_FX_TIMELINES,
];

/** Thay nội dung `dst` bằng `src`, giữ danh tính `dst`. */
function replaceIn(dst: object, src: object): void {
  for (const k of Object.keys(dst)) delete (dst as Record<string, unknown>)[k];
  Object.assign(dst, src);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Vá một file dữ liệu đã đổi vào dữ liệu đang chạy. Không ném: dữ liệu sai thì giữ bản cũ và trả `ok: false` kèm lý do. */
export function applyHotData(rel: string, json: unknown): HotResult {
  const kind = hotKind(rel);
  const res = (ok: boolean, extra: Partial<HotResult> = {}): HotResult => ({ ok, kind, path: rel, ...extra });
  switch (kind) {
    case 'fx': {
      if (!isObj(json) || typeof json.skill !== 'string' || !Array.isArray(json.events)) return res(false, { note: 'thiếu skill/events' });
      let n = 0;
      for (const list of FX_LISTS)
        for (const tl of list)
          if (tl.skill === json.skill) {
            replaceIn(tl, json);
            n++;
          }
      return n ? res(true, { id: json.skill }) : res(false, { id: json.skill, note: 'timeline mới: khai báo trong fxRegistry.ts rồi tải lại' });
    }
    case 'lab': {
      if (!Array.isArray(json) || json.some((s) => !isObj(s) || typeof s.id !== 'string' || !Array.isArray(s.mons)))
        return res(false, { note: 'scenes.json phải là mảng cảnh có id và mons' });
      LAB_SCENES.splice(0, Infinity, ...(json as LabScene[]));
      return res(true, { note: `${json.length} cảnh` });
    }
    case 'i18n': {
      if (!isObj(json) || Object.values(json).some((v) => typeof v !== 'string')) return res(false, { note: 'i18n phải là bảng key → chuỗi' });
      return res(true, { note: `${hotStrings(json as Record<string, string>)} chuỗi đổi` });
    }
    case 'layout': {
      const err = setDienVoLayout(json);
      return err ? res(false, { note: err }) : res(true);
    }
    default:
      return res(false, { note: 'loại dữ liệu này chưa nạp lại tức thì được' });
  }
}
