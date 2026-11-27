// Hàng rào của Diễn Võ Trường (phòng tập GM): mọi thứ làm trong phòng KHÔNG được ở lại trên nhân vật thật.
// Lúc vào: chụp nguyên trạng nhân vật trong DB (dòng `characters`, túi, tủ ngoại trang, nhánh công pháp) vào bảng `practice_snap`.
// Lúc ra (rời room, đăng nhập lại, hoặc server chết giữa chừng rồi vào lại bất kỳ room nào): trả về đúng ảnh chụp trong MỘT giao dịch.
// Sổ cái không bị xóa: các dòng ghi trong phòng được đánh dấu `practice:` và bỏ khóa chống trùng (để thưởng thật về sau không bị coi là
// đã phát), kèm một dòng bù cho từng món/tiền lệch để tổng sổ cái vẫn khớp với túi.
import { sqlite } from '../db';

type Row = Record<string, string | number | null>;
interface Snap {
  char: Row;
  items: Row[];
  wardrobe: Row[];
  branches: Row[];
  /** id lớn nhất của sổ cái lúc chụp: dòng sau mốc này là dòng ghi trong phòng. */
  ledgerMax: number;
}

const CHILD = ['items', 'wardrobe', 'branches'] as const;

function readState(charId: number): Omit<Snap, 'ledgerMax'> | null {
  const char = sqlite.prepare('SELECT * FROM characters WHERE id = ?').get(charId) as Row | undefined;
  if (!char) return null;
  const rows = (t: string) => sqlite.prepare(`SELECT * FROM ${t} WHERE char_id = ?`).all(charId) as Row[];
  return { char, items: rows('items'), wardrobe: rows('wardrobe'), branches: rows('branches') };
}

/** Số lượng từng vật phẩm của một trạng thái: túi + món đang mặc (cột `equip`). */
function countItems(s: Omit<Snap, 'ledgerMax'>): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: unknown, n: unknown) => {
    if (typeof id === 'string' && id) m.set(id, (m.get(id) ?? 0) + (typeof n === 'number' && n > 0 ? n : 1));
  };
  for (const r of s.items) add(r.item_id, r.qty);
  try {
    for (const e of Object.values(JSON.parse(String(s.char.equip ?? '{}')) as Record<string, { id?: unknown; n?: unknown } | null>))
      if (e) add(e.id, e.n);
  } catch {
    /* cột hỏng: coi như không mặc gì */
  }
  return m;
}

/** Level thế giới nhân vật đứng lúc vào phòng tập (để đưa về đúng chỗ cũ); không có ảnh thì null. */
export function practiceOrigin(charId: number): string | null {
  const row = sqlite.prepare('SELECT data FROM practice_snap WHERE char_id = ?').get(charId) as { data: string } | undefined;
  if (!row) return null;
  const room = (JSON.parse(row.data) as Snap).char.room;
  return typeof room === 'string' && room ? room : null;
}

/** Có ảnh chụp đang chờ trả không. */
export function practicePending(charId: number): boolean {
  return !!sqlite.prepare('SELECT 1 FROM practice_snap WHERE char_id = ?').get(charId);
}

/** Vào phòng tập: trả ảnh cũ nếu còn (lần trước server chết giữa chừng) rồi chụp ảnh mới. */
export function practiceBegin(charId: number): void {
  practiceEnd(charId);
  const s = readState(charId);
  if (!s) return;
  const max = (sqlite.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM ledger').get() as { m: number }).m;
  const snap: Snap = { ...s, ledgerMax: max };
  sqlite
    .prepare('INSERT OR REPLACE INTO practice_snap (char_id, data, ts) VALUES (?, ?, ?)')
    .run(charId, JSON.stringify(snap), Date.now());
}

/** Rời phòng tập: trả nhân vật về đúng ảnh chụp. Không có ảnh thì không làm gì. Trả true nếu đã trả. */
export function practiceEnd(charId: number): boolean {
  const row = sqlite.prepare('SELECT data FROM practice_snap WHERE char_id = ?').get(charId) as { data: string } | undefined;
  if (!row) return false;
  const snap = JSON.parse(row.data) as Snap;
  const cur = readState(charId);
  sqlite.transaction(() => {
    if (cur) {
      const ts = Date.now();
      sqlite
        .prepare("UPDATE ledger SET idem = NULL, reason = 'practice:' || reason WHERE char_id = ? AND id > ? AND reason NOT LIKE 'practice:%'")
        .run(charId, snap.ledgerMax);
      const ins = sqlite.prepare("INSERT INTO ledger (char_id, kind, ref, delta, reason, ts) VALUES (?, ?, ?, ?, 'practice:restore', ?)");
      const gold = Number(snap.char.gold ?? 0) - Number(cur.char.gold ?? 0);
      if (gold !== 0) ins.run(charId, 'gold', '', gold, ts);
      const a = countItems(snap);
      const b = countItems(cur);
      for (const id of new Set([...a.keys(), ...b.keys()])) {
        const d = (a.get(id) ?? 0) - (b.get(id) ?? 0);
        if (d !== 0) ins.run(charId, 'item', id, d, ts);
      }
    }
    const cols = Object.keys(snap.char).filter((k) => k !== 'id');
    sqlite
      .prepare(`UPDATE characters SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((k) => snap.char[k] ?? null), charId);
    for (const t of CHILD) {
      sqlite.prepare(`DELETE FROM ${t} WHERE char_id = ?`).run(charId);
      for (const r of snap[t]) {
        const ks = Object.keys(r);
        sqlite.prepare(`INSERT INTO ${t} (${ks.join(', ')}) VALUES (${ks.map(() => '?').join(', ')})`).run(...ks.map((k) => r[k] ?? null));
      }
    }
    sqlite.prepare('DELETE FROM practice_snap WHERE char_id = ?').run(charId);
  })();
  return true;
}
