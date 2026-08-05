// dashboard/client/src/pages/Overview.tsx
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTasks, useUpdateTask, useFarms, useLivePlayers, usePerformance, usePerformanceHistory } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import PerformanceChart from '../components/PerformanceChart';
import { fadeUp, staggerContainer } from '../lib/motion';
import { useAnimatedNumber } from '../lib/useAnimatedNumber';

export default function Overview() {
  const tasks = useTasks();
  const updateTask = useUpdateTask();
  const farms = useFarms();
  const livePlayers = useLivePlayers();
  const performance = usePerformance();
  const performanceHistory = usePerformanceHistory('24h');

  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && t.priority === 'high'
  );

  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) =>
      !f.metadata.hidden &&
      !f.metadata.off &&
      ((!f.metadata.manual && !f.online) || (f.storageCapacity > 0 && f.storageItemCount > 0.9 * f.storageCapacity))
  );

  const visibleFarms = (farms.data?.farms ?? []).filter((f) => !f.metadata.hidden);
  const encendidaCount = visibleFarms.filter((f) => !f.metadata.off && f.online).length;
  const rotaCount = visibleFarms.filter((f) => !f.metadata.off && !f.online).length;
  const apagadaCount = visibleFarms.filter((f) => f.metadata.off).length;

  const animatedTps = useAnimatedNumber(performance.data?.tps ?? 0);
  const animatedPlayers = useAnimatedNumber(livePlayers.data?.players.length ?? 0);
  const animatedEncendida = useAnimatedNumber(encendidaCount);
  const animatedRota = useAnimatedNumber(rotaCount);
  const animatedApagada = useAnimatedNumber(apagadaCount);

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-gold">Resumen</h1>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">TPS del servidor</div>
            <div className={`font-mono text-3xl ${performance.data && performance.data.tps < 18 ? 'text-status-blocked' : 'text-status-done'}`}>
              {performance.data ? animatedTps.toFixed(1) : '—'}
            </div>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Jugadores en línea</div>
            <div className="font-mono text-3xl text-cyan">{livePlayers.data ? Math.round(animatedPlayers) : '—'}</div>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Granjas encendidas</div>
            {farms.isError ? (
              <div className="font-mono text-3xl text-status-blocked">—</div>
            ) : (
              <div className="font-mono text-3xl text-status-done">{Math.round(animatedEncendida)}</div>
            )}
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Granjas rotas</div>
            {farms.isError ? (
              <div className="font-mono text-3xl text-status-blocked">—</div>
            ) : (
              <div className="font-mono text-3xl text-status-blocked">{Math.round(animatedRota)}</div>
            )}
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Granjas apagadas</div>
            {farms.isError ? (
              <div className="font-mono text-3xl text-status-blocked">—</div>
            ) : (
              <div className="font-mono text-3xl text-slate-400">{Math.round(animatedApagada)}</div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">TPS del servidor (24h)</h2>
        <Card>
          {performanceHistory.data ? (
            <PerformanceChart samples={performanceHistory.data.samples} />
          ) : (
            <p className="text-sm text-slate-500">Cargando…</p>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Tareas que necesitan atención</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tareas urgentes. Bien ahí.</p>
        ) : (
          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {needsAttention.slice(0, 5).map((t) => (
              <motion.div key={t.id} variants={fadeUp}>
                <Card className="flex items-center justify-between">
                  <div>
                    <div>{t.title}</div>
                    {t.assignees.length > 0 && (
                      <div className="mt-1 text-xs text-slate-400">
                        {t.assignees.map((a) => a.minecraft_name).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    {t.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => updateTask.mutate({ id: t.id, status: 'done' })}
                        disabled={updateTask.isPending}
                        className="rounded border border-status-done/40 px-2 py-1 text-xs text-status-done hover:bg-status-done/10 disabled:opacity-50"
                      >
                        Completar
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
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
          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {flaggedFarms.map((f) => (
              <motion.div key={f.id} variants={fadeUp}>
                <Card className="flex items-center justify-between">
                  <span>{f.name}</span>
                  <StatusBadge status={f.online ? 'online' : 'offline'} />
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
        <Link to="/granjas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las granjas →
        </Link>
      </section>
    </div>
  );
}
