import { timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';
import { getSessionUser, setSessionCookie, clearSessionCookie } from './auth.ts';

type Cookies = APIContext['cookies'];

const ADMIN_IDENTITY = 'admin';

export function passwordsMatch(password: string, expected: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD env var is not set');
  return password;
}

export function verifyAdminPassword(password: string): boolean {
  return passwordsMatch(password, getAdminPassword());
}

export function isAdmin(cookies: Cookies): boolean {
  return getSessionUser(cookies) === ADMIN_IDENTITY;
}

export function setAdminSession(cookies: Cookies): void {
  setSessionCookie(cookies, ADMIN_IDENTITY);
}

export function clearAdminSession(cookies: Cookies): void {
  clearSessionCookie(cookies);
}
