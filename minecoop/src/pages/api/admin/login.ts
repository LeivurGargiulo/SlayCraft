import type { APIRoute } from 'astro';
import { verifyAdminPassword, setAdminSession } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');

  if (!verifyAdminPassword(password)) {
    return redirect('/admin/login?error=1');
  }

  setAdminSession(cookies);
  return redirect('/admin');
};
