import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PlayerSession } from '../api/types';

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function SessionChart({ sessions }: { sessions: PlayerSession[] }) {
  const closed = sessions.filter((s) => s.leftAt);
  if (closed.length === 0) {
    return <p className="text-sm text-slate-500">Sin sesiones registradas todavía.</p>;
  }
  const rows = closed.map((s) => ({
    joinedAt: s.joinedAt,
    minutes: Math.round((new Date(s.leftAt as string).getTime() - new Date(s.joinedAt).getTime()) / 60_000),
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="joinedAt" tickFormatter={formatDay} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(value) => [`${value} min`, 'Duración']}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Bar dataKey="minutes" fill="#60a5fa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
