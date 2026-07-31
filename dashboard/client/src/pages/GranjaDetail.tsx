import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFarm, useFarmHistory, useUpdateFarmMetadata } from '../api/hooks';
import Card from '../components/Card';

export default function GranjaDetail() {
  const { id } = useParams<{ id: string }>();
  const farm = useFarm(id!);
  const history = useFarmHistory(id!, '24h');
  const updateMetadata = useUpdateFarmMetadata();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  if (farm.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (farm.isError || !farm.data) return <p className="text-status-blocked">No se encontró la granja.</p>;
  const f = farm.data;

  function startEdit() {
    setNotes(f.metadata.notes ?? '');
    setTags(f.metadata.tags.join(', '));
    setEditingMeta(true);
  }

  async function saveMeta() {
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setEditingMeta(false);
  }

  return (
    <div className="space-y-4">
      <Link to="/granjas" className="text-sm text-cyan hover:underline">
        ← Granjas
      </Link>
      <h1 className="font-mono text-2xl text-gold">{f.name}</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Notas</h2>
          {editingMeta ? (
            <div className="space-y-2">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border border-border bg-base px-2 py-1" />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="etiquetas separadas por coma"
                className="w-full rounded border border-border bg-base px-2 py-1"
              />
              <button onClick={saveMeta} className="rounded bg-gold px-3 py-1 text-sm text-base">
                Guardar
              </button>
              {updateMetadata.isError && (
                <p className="text-sm text-status-blocked">{updateMetadata.error.message}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-300">{f.metadata.notes || 'Sin notas.'}</p>
              <button onClick={startEdit} className="mt-2 text-sm text-cyan hover:underline">
                Editar
              </button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Trabajador</h2>
          {f.fakePlayer ? (
            <p className="text-sm">
              {f.fakePlayer.name} — {f.fakePlayer.online ? 'en línea' : 'fuera de línea'}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Sin trabajador asignado.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Almacenamiento</h2>
        <div className="space-y-1">
          {f.storage.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="font-mono text-slate-400">
                {s.items.reduce((sum, i) => sum + i.count, 0)} / {s.capacity * 64}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Historial (24h)</h2>
        {history.data && history.data.samples.length > 0 ? (
          <p className="text-sm text-slate-400">{history.data.samples.length} muestras registradas.</p>
        ) : (
          <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>
        )}
      </Card>
    </div>
  );
}
