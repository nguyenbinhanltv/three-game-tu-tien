// Nhập clip "anymove" của Patch (CC0 1.0) vào thư viện `anim_patch_move` cho nhân vật v3 (Thân Pháp, nối locomotion).
//   pnpm --filter @dtl/asset-pipeline exec tsx src/patch-clips.ts        (đọc DTL_ASSET_SOURCE/anim/patch/starter-man-clips.glb)
//   rồi: pnpm --filter @dtl/asset-pipeline exec tsx src/cli.ts optimize --only anim_patch_move --force   (ra GLB có hash)
// Cùng bộ xương UE5 Mannequin với `anim_ual_native` nên phát trực tiếp, không retarget lúc chạy.
// Việc script làm: chỉ giữ 10 clip anymove (23–24 kênh: xương lõi + pelvis.translation + root.translation), đổi tên `PM_*`, BỎ kênh `root.translation`
// (vị trí do server quyết; chuyển động gốc của clip chuyển trạng thái chỉ dùng để ĐO sải/khoảng đi được, in ra bảng), giữ nguyên mọi nút (xương) để
// `mannequinTemplate` đọc được tư thế nghỉ của pelvis. Các clip khác trong file là UAL của Quaternius (đã có ở `anim_ual_native`) nên bỏ.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';

/** Tên clip nguồn → tên trong thư viện. */
export const PATCH_CLIPS: Readonly<Record<string, string>> = {
  AM_Idle: 'PM_Idle',
  AM_Idle_To_Walk: 'PM_Idle_To_Walk',
  AM_Walk_To_Idle: 'PM_Walk_To_Idle',
  Run: 'PM_Run',
  Sprint: 'PM_Sprint',
  Idle_Tired: 'PM_Idle_Tired',
  Idle_To_Run: 'PM_Idle_To_Run',
  Idle_To_Sprint: 'PM_Idle_To_Sprint',
  Run_To_Idle: 'PM_Run_To_Idle',
  Sprint_To_Idle: 'PM_Sprint_To_Idle',
};

async function main(): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const root = path.resolve(here, '../../..');
  const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(root, '../dtl-asset-source');
  const src = path.join(source, 'anim/patch/starter-man-clips.glb');
  const out = path.join(root, 'assets/build/raw/anim_patch_move.glb');
  if (!fs.existsSync(src)) throw new Error(`thiếu ${src} (đặt DTL_ASSET_SOURCE)`);
  const io = new NodeIO();
  const doc = await io.read(src);
  const rows: string[] = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const to = PATCH_CLIPS[anim.getName()];
    if (!to) {
      anim.dispose();
      continue;
    }
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      if (node?.getName() === 'root' && ch.getTargetPath() === 'translation') {
        const s = ch.getSampler()!;
        const v = s.getOutput()!;
        const n = v.getCount();
        const a = v.getElement(0, []) as number[];
        const b = v.getElement(n - 1, []) as number[];
        const t = s.getInput()!;
        const dur = (t.getElement(t.getCount() - 1, []) as number[])[0]! - (t.getElement(0, []) as number[])[0]!;
        // Khoảng đi ngang (x, z) từ khung đầu tới khung cuối; đơn vị theo file nguồn (in kèm để đổi sang mét).
        const d = Math.hypot(b[0]! - a[0]!, b[2]! - a[2]!);
        rows.push(`${to}: ${dur.toFixed(2)} s, đi ${d.toFixed(3)} (${(d / dur).toFixed(3)}/s)`);
        anim.removeChannel(ch);
        ch.dispose();
      }
    }
    anim.setName(to);
  }
  const kept = doc
    .getRoot()
    .listAnimations()
    .map((a) => a.getName());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  console.log(`[patch-clips] giữ ${kept.length} clip: ${kept.join(', ')}`);
  console.log('[patch-clips] chuyển động gốc (đã bỏ khỏi clip):\n  ' + rows.join('\n  '));
  console.log(`[patch-clips] ghi ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

await main();
