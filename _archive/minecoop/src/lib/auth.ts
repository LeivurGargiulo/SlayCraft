import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';

type Cookies = APIContext['cookies'];

const COOKIE_NAME = 'session';

function sign(username: string, secret: string): string {
  return createHmac('sha256', secret).update(username).digest('hex');
}

export function createSessionCookieValue(username: string, secret: string): string {
  return `${username}.${sign(username, secret)}`;
}

export function verifySessionCookieValue(value: string, secret: string): string | null {
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const username = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  const expected = Buffer.from(sign(username, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return username;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');
  return secret;
}

export function getSessionUser(cookies: Cookies): string | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySessionCookieValue(raw, getSecret());
}

export function setSessionCookie(cookies: Cookies, username: string): void {
  cookies.set(COOKIE_NAME, createSessionCookieValue(username, getSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
