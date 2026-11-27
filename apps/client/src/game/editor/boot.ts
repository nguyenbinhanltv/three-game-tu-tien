// Điểm vào của bộ công cụ chỉnh phòng tập (Diễn Võ Trường V3). CHỈ nạp ở bản dev (`main.tsx` nạp động sau `import.meta.env.DEV`),
// nên bản build không có mã này. Việc ở đây: bật nhận dữ liệu nóng, nối dữ liệu nóng với phòng (phát lại hiệu ứng vừa sửa, dựng lại
// đạo cụ khi file bố cục đổi), giữ một `RoomEditor` cho Game đang chạy, và mở bảng Chỉnh phòng bằng F4.
import { POSE } from '@dtl/content';
import { PRACTICE_LEVEL } from '@dtl/shared';
import { levelId } from '../../base/levelCtx';
import { forgetMannequinPose } from '../character/mannequinPoses';
import { forgetPoseBake } from '../character/poseLib';
import type { Game } from '../engine';
import { hotEntries, installHotData, onHotData } from './hotData';
import { forgetProps } from '../world/propScatter';
import { RoomEditor } from './roomEdit';

let editor: RoomEditor | null = null;
let owner: Game | null = null;
let booted = false;

const game = (): Game | null => (window as unknown as { __game?: Game }).__game ?? null;

/** Tùy chọn của phiên (bảng Chỉnh phòng bật tắt). */
export const labAuto = {
  /** Sửa một file fx thì tự phát lại hiệu ứng đó trong phòng. */
  fxReplay: true,
};

/** Trình chỉnh phòng của Game đang chạy (tạo lười; Game đổi thì tạo lại). Chưa vào game thì null. */
export function roomEditor(): RoomEditor | null {
  const g = game();
  if (!g) return null;
  if (owner !== g) {
    editor?.dispose();
    editor = new RoomEditor(g);
    owner = g;
  }
  return editor;
}

export function bootLabEditor(): void {
  if (booted) return;
  booted = true;
  installHotData();
  onHotData((e) => {
    if (!e.ok) return;
    // Bố cục đổi lúc đang ở bản đồ khác: chỉ cần quên danh sách đã nhớ, lần vào phòng kế sẽ dựng theo file mới.
    if (e.kind === 'layout') forgetProps(PRACTICE_LEVEL);
    if (e.kind === 'pose' && e.id) {
      const def = POSE.get(e.id);
      if (def) forgetPoseBake(def);
      forgetMannequinPose(e.id);
    }
    const g = game();
    if (!g || g.disposed || levelId() !== PRACTICE_LEVEL) return;
    if (e.kind === 'layout') roomEditor()?.onFileChanged();
    else if (e.kind === 'fx' && e.id && labAuto.fxReplay) g.labFx(e.id);
  });
  // Cổng cho console / Playwright (kịch bản kiểm): `__labEdit.editor()`, `__labEdit.hot()`.
  (window as unknown as { __labEdit?: unknown }).__labEdit = { editor: roomEditor, hot: hotEntries, auto: labAuto };
  // F4: mở/đóng bảng Chỉnh phòng nổi (bảng F3 → Diễn Võ có thể nhúng cùng component `RoomEditPanel`).
  let panel: Promise<{ toggleRoomEditPanel(): void }> | null = null;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F4' || e.repeat) return;
    e.preventDefault();
    panel ??= import('../../ui/lab-editor/mount');
    void panel.then((m) => m.toggleRoomEditPanel());
  });
}
