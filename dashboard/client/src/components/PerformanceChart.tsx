import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PerformanceHistorySample } from '../api/types';

function formatTick(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PerformanceChart({ samples }: { samples: PerformanceHistorySample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={samples} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="sampledAt" tickFormatter={formatTick} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 20]} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend />
        <Line type="monotone" dataKey="tps" name="TPS" stroke="#4ade80" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
