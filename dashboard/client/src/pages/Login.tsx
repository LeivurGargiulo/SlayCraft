import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';

export default function Login() {
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync(password);
      navigate('/');
    } catch {
      // error is surfaced via login.isError below
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <form onSubmit={onSubmit} className="w-80 rounded-lg border border-border bg-panel p-6">
        <h1 className="mb-4 font-mono text-xl text-gold">SlayCraft</h1>
        <label className="mb-1 block text-sm text-slate-400">Contraseña</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded border border-border bg-base px-3 py-2 text-slate-100 outline-none focus:border-gold"
        />
        {login.isError && <p className="mb-3 text-sm text-status-blocked">Contraseña incorrecta</p>}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90 disabled:opacity-50"
        >
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
