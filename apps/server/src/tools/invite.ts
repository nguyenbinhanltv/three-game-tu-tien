// Quản lý danh sách email được mời (đăng nhập Google).
// pnpm --filter @dtl/server invite add ban@gmail.com [khac@gmail.com…]
// pnpm --filter @dtl/server invite remove ban@gmail.com
// pnpm --filter @dtl/server invite list

import { eq } from 'drizzle-orm';
import { db, invites } from '../db';

const [cmd, ...rest] = process.argv.slice(2);
const emails = rest.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

if (cmd === 'add' && emails.length) {
  for (const email of emails) db.insert(invites).values({ email }).onConflictDoNothing().run();
  console.log(`Đã mời: ${emails.join(', ')}`);
} else if (cmd === 'remove' && emails.length) {
  for (const email of emails) db.delete(invites).where(eq(invites.email, email)).run();
  console.log(`Đã bỏ mời: ${emails.join(', ')}`);
} else if (cmd === 'list') {
  const all = db.select().from(invites).all();
  console.log(all.length ? all.map((r) => r.email).join('\n') : '(chưa mời ai)');
} else {
  console.log('Cách dùng: invite add <email…> | invite remove <email…> | invite list');
  process.exit(1);
}
