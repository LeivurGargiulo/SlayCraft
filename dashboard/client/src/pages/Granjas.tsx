import { Link } from 'react-router-dom';
import { useFarms } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Granjas() {
  const farms = useFarms();

  if (farms.isLoading) return <p className="text-slate-400">Cargando granjas…</p>;
  if (farms.isError) return <p className="text-status-blocked">No se pudo conectar con MCFarmManager.</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Granjas</h1>
      <div className="grid grid-cols-3 gap-4">
        {farms.data!.farms.map((f) => (
          <Link key={f.id} to={`/granjas/${f.id}`}>
            <Card className="hover:border-gold">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <StatusBadge status={f.occupantCount > 0 ? 'online' : 'offline'} />
              </div>
              <div className="mt-2 font-mono text-sm text-slate-400">
                {f.entityCount} entidades · {f.storageItemCount} ítems almacenados
              </div>
              {f.metadata.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.metadata.tags.map((t) => (
                    <span key={t} className="rounded bg-base px-2 py-0.5 text-xs text-cyan">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </Link>
        ))}
        {farms.data!.farms.length === 0 && <p className="text-sm text-slate-500">No hay granjas configuradas en MCFarmManager.</p>}
      </div>
    </div>
  );
}
