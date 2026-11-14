// Đối soát sổ cái: tổng biến động trong ledger phải khớp đúng số dư tiền và vật phẩm hiện có.
// Chạy: pnpm ledger:check  (nên chạy khi server đã tắt, hoặc chấp nhận lệch nhỏ do giao dịch đang diễn ra)

import { sql } from 'drizzle-orm';
import { EQUIP_SLOTS, type Equipment } from '@dtl/shared';
import { characters, db, items, ledger, sqlite } from '../db';

let bad = 0;
const chars = db.select().from(characters).all();

const goldByChar = new Map<number, number>();
const itemByChar = new Map<number, Map<string, number>>();
for (const r of db
  .select({ charId: ledger.charId, kind: ledger.kind, ref: ledger.ref, total: sql<number>`sum(${ledger.delta})` })
  .from(ledger)
  .groupBy(ledger.charId, ledger.kind, ledger.ref)
  .all()) {
  if (r.kind === 'gold') goldByChar.set(r.charId, r.total);
  else if (r.kind === 'item') {
    let m = itemByChar.get(r.charId);
    if (!m) itemByChar.set(r.charId, (m = new Map()));
    m.set(r.ref, r.total);
  }
}

for (const c of chars) {
  const lg = goldByChar.get(c.id) ?? 0;
  if (lg !== c.gold) {
    bad++;
    console.error(`[lệch tiền] ${c.name}: số dư ${c.gold}, sổ cái ${lg}`);
  }
  const have = new Map<string, number>();
  for (const it of db.select().from(items).where(sql`${items.charId} = ${c.id}`).all()) {
    have.set(it.itemId, (have.get(it.itemId) ?? 0) + it.qty);
    if (it.qty <= 0) {
      bad++;
      console.error(`[số lượng âm] ${c.name}: ô ${it.slot} ${it.itemId} = ${it.qty}`);
    }
  }
  let equip: Equipment = {};
  try {
    equip = JSON.parse(c.equip) as Equipment;
  } catch {
    bad++;
    console.error(`[trang bị hỏng] ${c.name}`);
  }
  for (const es of EQUIP_SLOTS) {
    const e = equip[es];
    if (e) have.set(e.id, (have.get(e.id) ?? 0) + 1);
  }
  const led = itemByChar.get(c.id) ?? new Map<string, number>();
  const ids = new Set([...have.keys(), ...led.keys()]);
  for (const id of ids) {
    const a = have.get(id) ?? 0;
    const b = led.get(id) ?? 0;
    if (a !== b) {
      bad++;
      console.error(`[lệch vật phẩm] ${c.name}: ${id} đang có ${a}, sổ cái ${b}`);
    }
  }
}

const totalGold = chars.reduce((s, c) => s + c.gold, 0);
const rows = sqlite.prepare('select count(*) n from ledger').get() as { n: number };
console.log(`${chars.length} nhân vật, ${rows.n} dòng sổ cái, tổng linh thạch lưu hành ${totalGold}.`);
if (bad) {
  console.error(`${bad} chỗ lệch.`);
  process.exit(1);
}
console.log('Sổ cái khớp.');
