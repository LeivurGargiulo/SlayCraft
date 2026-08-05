import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFarms, useCreateFarm, useUpdateFarmMetadata, useSearch } from '../api/hooks';
import type { FarmSummary } from '../api/types';
import Card from '../components/Card';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Select from '../components/Select';

const DIMENSIONS = [
  { value: 'minecraft:overworld', label: 'Overworld' },
  { value: 'minecraft:the_nether', label: 'Nether' },
  { value: 'minecraft:the_end', label: 'End' },
];

type FarmCategory = 'encendida' | 'rota' | 'apagada';

function categorize(f: FarmSummary): FarmCategory {
  if (f.metadata.off) return 'apagada';
  return f.online ? 'encendida' : 'rota';
}

const CATEGORY_LABELS: Record<FarmCategory, string> = {
  encendida: 'Encendidas',
  rota: 'Rotas',
  apagada: 'Apagadas',
};

export default function Granjas() {
  const farms = useFarms();
  const createFarm = useCreateFarm();
  const updateMetadata = useUpdateFarmMetadata();
  const [modalOpen, setModalOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [dimension, setDimension] = useState('minecraft:overworld');
  const [x, setX] = useState('0');
  const [y, setY] = useState('64');
  const [z, setZ] = useState('0');
  const [entityScanRadius, setEntityScanRadius] = useState('16');
  const [searchTerm, setSearchTerm] = useState('');
  const search = useSearch(searchTerm);

  async function onCreate() {
    if (!id.trim() || !name.trim()) return;
    await createFarm.mutateAsync({
      id: id.trim(),
      name: name.trim(),
      dimension,
      anchor: { x: Number(x), y: Number(y), z: Number(z) },
      entityScanRadius: Number(entityScanRadius),
      fakePlayerName: null,
      storage: [],
      afkSpot: null,
    });
    setId('');
    setName('');
    setModalOpen(false);
  }

  if (farms.isLoading) return <p className="text-slate-400">Cargando granjas…</p>;
  if (farms.isError) return <p className="text-status-blocked">No se pudo conectar con MCFarmManager.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-2xl text-gold">Granjas</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-400">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Mostrar ocultas
          </label>
          <div className="flex rounded border border-border">
            <button
              type="button"
              aria-pressed={mode === 'view'}
              onClick={() => setMode('view')}
              className={`rounded-l px-3 py-1.5 text-sm ${mode === 'view' ? 'bg-gold text-base' : 'text-slate-300 hover:bg-panel'}`}
            >
              Ver
            </button>
            <button
              type="button"
              aria-pressed={mode === 'edit'}
              onClick={() => setMode('edit')}
              className={`rounded-r px-3 py-1.5 text-sm ${mode === 'edit' ? 'bg-gold text-base' : 'text-slate-300 hover:bg-panel'}`}
            >
              Editar
            </button>
          </div>
          <button onClick={() => setModalOpen(true)} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
            + Nueva granja
          </button>
        </div>
      </div>
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Buscar en almacenamiento</h2>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar ítem (ej. diamond)"
          className="w-full rounded border border-border bg-base px-3 py-2"
        />
        {searchTerm.trim() && (
          <div className="mt-3 space-y-1">
            {(search.data?.results.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">Sin resultados.</p>
            ) : (
              search.data!.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <Link to={`/granjas/${r.farmId}`} className="text-cyan hover:underline">
                    {r.farmName} · {r.storageLabel}
                  </Link>
                  <span className="font-mono text-slate-400">
                    {r.itemId.replace(/^minecraft:/, '')} × {r.count}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
      {(['encendida', 'rota', 'apagada'] as const).map((category) => {
        const categoryFarms = farms.data!.farms.filter(
          (f) => (showHidden || !f.metadata.hidden) && categorize(f) === category
        );
        if (categoryFarms.length === 0) return null;
        return (
          <div key={category} className="space-y-2">
            <h2 className="font-mono text-lg text-slate-200">{CATEGORY_LABELS[category]}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryFarms.map((f) => (
                <Link key={f.id} to={`/granjas/${f.id}`} className="relative">
                  {mode === 'edit' && (
                    <div className="absolute right-2 top-2 z-10 flex gap-1">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateMetadata.mutate({ id: f.id, ...f.metadata, off: !f.metadata.off });
                        }}
                        className="rounded bg-base/80 px-2 py-1 text-xs text-slate-400 hover:text-cyan"
                      >
                        {f.metadata.off ? 'Encender' : 'Apagar'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateMetadata.mutate({ id: f.id, ...f.metadata, hidden: !f.metadata.hidden });
                        }}
                        className="rounded bg-base/80 px-2 py-1 text-xs text-slate-400 hover:text-cyan"
                      >
                        {f.metadata.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                    </div>
                  )}
                  <Card>
                    {f.images[0] ? (
                      <img src={`/uploads/${f.images[0].path}`} alt={f.name} className="mb-2 h-32 w-full rounded object-cover" />
                    ) : (
                      <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-base text-slate-600">
                        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current" aria-hidden="true">
                          <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h14V7H5Zm2 8 3.5-4.5 2.5 3 3-4L18 15H7Z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{f.name}</span>
                      <div className="flex items-center gap-1">
                        {f.metadata.manual && <span className="rounded bg-base px-2 py-0.5 text-xs text-cyan">Manual</span>}
                        {f.metadata.hidden && <span className="rounded bg-base px-2 py-0.5 text-xs text-slate-400">Oculta</span>}
                        {f.metadata.off && <span className="rounded bg-base px-2 py-0.5 text-xs text-slate-400">Apagada</span>}
                        <StatusBadge status={f.online ? 'online' : 'offline'} />
                      </div>
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
            </div>
          </div>
        );
      })}
      {farms.data!.farms.length === 0 && <p className="text-sm text-slate-500">No hay granjas configuradas en MCFarmManager.</p>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva granja">
        <div className="space-y-3">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="id (ej: iron_farm)" className="w-full rounded border border-border bg-base px-3 py-2" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full rounded border border-border bg-base px-3 py-2" />
          <Select value={dimension} onChange={setDimension} options={DIMENSIONS} className="w-full [&>button]:py-2" />
          <div className="flex gap-2">
            <input value={x} onChange={(e) => setX(e.target.value)} placeholder="X" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
            <input value={y} onChange={(e) => setY(e.target.value)} placeholder="Y" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
            <input value={z} onChange={(e) => setZ(e.target.value)} placeholder="Z" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
          </div>
          <input
            value={entityScanRadius}
            onChange={(e) => setEntityScanRadius(e.target.value)}
            placeholder="Radio de escaneo"
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <button onClick={onCreate} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
            Crear
          </button>
          {createFarm.isError && <p className="text-sm text-status-blocked">{createFarm.error.message}</p>}
        </div>
      </Modal>
    </div>
  );
}
