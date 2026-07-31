// dashboard/client/src/pages/Overview.tsx
import { Link } from 'react-router-dom';
import { useTasks, useFarms, useLivePlayers, usePerformance } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Overview() {
  const tasks = useTasks();
  const farms = useFarms();
  const livePlayers = useLivePlayers();
  const performance = usePerformance();

  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && (t.status === 'blocked' || t.priority === 'high' || (t.due_date && t.due_date < today))
  );

  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) => !f.fakePlayerOnline || f.storageItemCount > 0.9 * 2916 // 27 slots * 108 stack size heuristic; real capacity comes per-chest, this is a coarse "likely full" signal
  );
  const healthyFarmCount = (farms.data?.farms.length ?? 0) - flaggedFarms.length;

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-gold">Resumen</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-400">TPS del servidor</div>
          <div className={`font-mono text-3xl ${performance.data && performance.data.tps < 18 ? 'text-status-blocked' : 'text-status-done'}`}>
            {performance.data ? performance.data.tps.toFixed(1) : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-400">Jugadores en línea</div>
          <div className="font-mono text-3xl text-cyan">{livePlayers.data?.players.length ?? '—'}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-400">Granjas saludables</div>
          {farms.isError ? (
            <div className="font-mono text-3xl text-status-blocked">—</div>
          ) : (
            <div className="font-mono text-3xl text-status-done">{healthyFarmCount}</div>
          )}
        </Card>
      </div>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Tareas que necesitan atención</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tareas urgentes. Bien ahí.</p>
        ) : (
          <div className="space-y-2">
            {needsAttention.slice(0, 5).map((t) => (
              <Card key={t.id} className="flex items-center justify-between">
                <span>{t.title}</span>
                <StatusBadge status={t.status} />
              </Card>
            ))}
          </div>
        )}
        <Link to="/tareas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las tareas →
        </Link>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Granjas que requieren revisión</h2>
        {farms.isError ? (
          <p className="text-sm text-status-blocked">No se pudo conectar con MCFarmManager.</p>
        ) : flaggedFarms.length === 0 ? (
          <p className="text-sm text-slate-500">Todas las granjas están al día.</p>
        ) : (
          <div className="space-y-2">
            {flaggedFarms.map((f) => (
              <Card key={f.id} className="flex items-center justify-between">
                <span>{f.name}</span>
                <StatusBadge status={f.fakePlayerOnline ? 'online' : 'offline'} />
              </Card>
            ))}
          </div>
        )}
        <Link to="/granjas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las granjas →
        </Link>
      </section>
    </div>
  );
}
