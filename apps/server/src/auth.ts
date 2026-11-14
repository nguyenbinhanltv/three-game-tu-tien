import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { ServerError } from 'colyseus';
import { validName } from '@dtl/shared';
import { config } from './config';
import { accounts, db, invites } from './db';

export const ERR_NEED_NAME = 4010;
export const ERR_NAME_TAKEN = 4011;
export const ERR_NOT_INVITED = 4012;
export const ERR_AUTH = 4013;
export const ERR_SESSION = 4014;
export const ERR_NO_TICKET = 4015;

export interface AuthResult {
  accountId: number;
  dev: boolean;
  email: string;
}

const SESSION_TTL = 24 * 3600 * 1000;
const sessions = new Map<string, { auth: AuthResult; exp: number }>();

/** Cấp mã phiên để client vào room khác / vào lại mà không cần token Google (vốn hết hạn sau 1 giờ). */
export function issueSession(auth: AuthResult): string {
  const now = Date.now();
  if (sessions.size > 5000) for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
  const token = randomBytes(24).toString('base64url');
  sessions.set(token, { auth: { accountId: auth.accountId, dev: auth.dev, email: auth.email }, exp: now + SESSION_TTL });
  return token;
}

export function sessionAuth(token: unknown): AuthResult | null {
  if (typeof token !== 'string') return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) return null;
  return s.auth;
}

const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

function findOrCreateAccount(sub: string, email: string): number {
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.sub, sub)).get();
  if (row) return row.id;
  return db.insert(accounts).values({ sub, email, createdAt: Date.now() }).returning({ id: accounts.id }).get().id;
}

/** Xác thực người chơi từ tham số join. Không bao giờ tin `userId` do client tự khai. */
export async function authenticate(options: unknown): Promise<AuthResult> {
  const o = (options ?? {}) as { token?: unknown; dev?: unknown; session?: unknown };

  if (typeof o.session === 'string' && o.session.length > 0) {
    const a = sessionAuth(o.session);
    if (a) return a;
    throw new ServerError(ERR_SESSION, 'session_expired');
  }

  if (typeof o.token === 'string' && o.token.length > 0) {
    if (!google) throw new ServerError(ERR_AUTH, 'google_not_configured');
    let email = '';
    let sub = '';
    try {
      const ticket = await google.verifyIdToken({ idToken: o.token, audience: config.googleClientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email || !payload.email_verified) throw new Error('bad payload');
      email = payload.email.toLowerCase();
      sub = payload.sub;
    } catch {
      throw new ServerError(ERR_AUTH, 'auth_failed');
    }
    if (!config.openInvite) {
      const invited = db.select().from(invites).where(eq(invites.email, email)).get();
      if (!invited) throw new ServerError(ERR_NOT_INVITED, 'not_invited');
    }
    return { accountId: findOrCreateAccount('g:' + sub, email), dev: false, email };
  }

  if (config.devBypass && typeof o.dev === 'string' && validName(o.dev)) {
    const name = o.dev.trim();
    return { accountId: findOrCreateAccount('dev:' + name.toLowerCase(), ''), dev: true, email: '' };
  }

  throw new ServerError(ERR_AUTH, 'auth_failed');
}
