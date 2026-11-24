// Tách từ check.ts (tối ưu Đợt E): credits.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasString } from '../index';
import { CREDITS, CREDIT_KINDS, CREDIT_LICENSE_URL } from '../index';

import { uniqueIds, err } from './base';
// ---- Ghi công (DV1-B): credits.json đối chiếu meta.json + assets/LICENSES.md ----
{
  const root = fileURLToPath(new URL('../../../../assets/', import.meta.url));
  const licenses = fs.readFileSync(root + 'LICENSES.md', 'utf8');
  const metas = new Map<string, { kind?: string; spdx?: string }>();
  for (const type of fs.readdirSync(root + 'source')) {
    for (const id of fs.readdirSync(root + `source/${type}`)) {
      const f = root + `source/${type}/${id}/meta.json`;
      if (!fs.existsSync(f)) continue;
      const m = JSON.parse(fs.readFileSync(f, 'utf8')) as { import?: { kind?: string }; license?: { spdx?: string } };
      metas.set(id, { kind: m.import?.kind, spdx: m.license?.spdx });
    }
  }
  uniqueIds('credit', CREDITS);
  const covered = new Set<string>();
  for (const c of CREDITS) {
    const w = `credits ${c.id}`;
    if (!CREDIT_KINDS.includes(c.kind)) err(`${w}: kind không hợp lệ ${c.kind}`);
    if (!c.title || !c.author || !/^https:\/\//.test(c.url)) err(`${w}: thiếu title/author hoặc url https`);
    if (!CREDIT_LICENSE_URL[c.license]) err(`${w}: giấy phép chưa có link ở CREDIT_LICENSE_URL: ${c.license}`);
    if (!hasString(`ui.credits.license.${c.license}`)) err(`${w}: thiếu chuỗi ui.credits.license.${c.license}`);
    if (!hasString(`ui.credits.kind.${c.kind}`)) err(`${w}: thiếu chuỗi ui.credits.kind.${c.kind}`);
    for (const m of c.mods) if (!hasString(`ui.credits.mod.${m}`)) err(`${w}: thiếu chuỗi ui.credits.mod.${m}`);
    if (c.license.startsWith('CC-BY') && c.mods.length === 0) err(`${w}: CC BY phải ghi rõ đã chỉnh sửa gì (mods)`);
    if (c.license === 'CC-BY-NC-4.0' && c.note !== 'nc')
      err(`${w}: CC BY-NC phải có note: "nc" (màn Ghi công nhắc gỡ nếu game có thu tiền)`);
    if (c.note && !hasString(`ui.credits.note.${c.note}`)) err(`${w}: thiếu chuỗi ui.credits.note.${c.note}`);
    if (c.pending) continue;
    if (c.license.startsWith('CC-BY') && !licenses.includes(c.url)) err(`${w}: assets/LICENSES.md thiếu link nguồn ${c.url}`);
    for (const a of c.assets ?? []) {
      covered.add(a);
      const m = metas.get(a);
      if (!m) err(`${w}: không có assets/source/*/${a}/meta.json (nếu asset chưa vào main thì đặt pending: true)`);
      else if (m.spdx && m.spdx !== c.license) err(`${w}: giấy phép ${c.license} lệch meta.json của ${a} (${m.spdx})`);
      if (!licenses.includes('`' + a + '`')) err(`${w}: assets/LICENSES.md thiếu dòng cho ${a}`);
    }
  }
  // Mọi asset nguồn ngoài (import.kind external) hoặc có giấy phép bên thứ ba (spdx) phải có mục ghi công.
  for (const [id, m] of metas) {
    if (covered.has(id)) continue;
    if (m.kind === 'external' || m.spdx)
      err(`asset ${id} (${m.spdx ?? 'external'}) chưa có mục ghi công trong packages/content/data/credits.json`);
  }
}
