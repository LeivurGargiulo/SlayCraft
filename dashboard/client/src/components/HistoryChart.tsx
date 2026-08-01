import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FarmHistorySample } from '../api/types';

const LINE_COLORS = ['#e8b339', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa'];

function formatTick(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HistoryChart({ samples }: { samples: FarmHistorySample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>;
  }

  const itemIds = Array.from(new Set(samples.flatMap((s) => Object.keys(s.storageCounts)))).sort();
  const rows = samples.map((s) => ({
    sampledAt: s.sampledAt,
    ...Object.fromEntries(itemIds.map((id) => [id, s.storageCounts[id] ?? 0])),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="sampledAt" tickFormatter={formatTick} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(value, name) => [value, String(name).replace(/^minecraft:/, '')]}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend formatter={(name: string) => name.replace(/^minecraft:/, '')} />
        {itemIds.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={id}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
