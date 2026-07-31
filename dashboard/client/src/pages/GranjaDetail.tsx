import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFarm, useFarmHistory, useUpdateFarmMetadata, useUploadFarmImage, useDeleteFarmImage } from '../api/hooks';
import Card from '../components/Card';

export default function GranjaDetail() {
  const { id } = useParams<{ id: string }>();
  const farm = useFarm(id!);
  const history = useFarmHistory(id!, '24h');
  const updateMetadata = useUpdateFarmMetadata();
  const uploadImage = useUploadFarmImage();
  const deleteImage = useDeleteFarmImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  if (farm.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (farm.isError || !farm.data) return <p className="text-status-blocked">No se encontró la granja.</p>;
  const f = farm.data;

  function startEdit() {
    setNotes(f.metadata.notes ?? '');
    setTags(f.metadata.tags.join(', '));
    setCoordinates(f.metadata.coordinates ?? '');
    setEditingMeta(true);
  }

  async function saveMeta() {
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      coordinates: coordinates || null,
    });
    setEditingMeta(false);
  }

  async function onFileChange() {
    const file = fileInput.current?.files?.[0];
    if (file) await uploadImage.mutateAsync({ farmId: f.id, file });
    if (fileInput.current) fileInput.current.value = '';
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
              <input
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                placeholder="Coordenadas (ej. 120, 80, -500)"
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
              {f.metadata.coordinates && <p className="mt-1 font-mono text-sm text-slate-400">{f.metadata.coordinates}</p>}
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

        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Entidades</h2>
          {f.entities.length > 0 ? (
            <div className="space-y-1">
              {Object.entries(
                f.entities.reduce<Record<string, number>>((acc, e) => {
                  const type = e.type.replace(/^minecraft:/, '');
                  acc[type] = (acc[type] ?? 0) + 1;
                  return acc;
                }, {})
              ).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span>{type}</span>
                  <span className="font-mono text-slate-400">{count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin entidades detectadas.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Almacenamiento</h2>
        {(() => {
          const allItems = f.storage.flatMap((s) => s.items);
          const total = allItems.reduce((sum, i) => sum + i.count, 0);
          const byType = allItems.reduce<Record<string, number>>((acc, i) => {
            const type = i.itemId.replace(/^minecraft:/, '');
            acc[type] = (acc[type] ?? 0) + i.count;
            return acc;
          }, {});
          return (
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono text-slate-200">{total}</span>
              </div>
              {Object.keys(byType).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(byType).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span>{type}</span>
                      <span className="font-mono text-slate-400">{count}x</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Sin ítems almacenados.</p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-cyan hover:underline">Por contenedor</summary>
                <div className="mt-2 space-y-1">
                  {f.storage.map((s) => (
                    <div key={s.id} className="flex justify-between">
                      <span>{s.label}</span>
                      <span className="font-mono text-slate-400">
                        {s.items.reduce((sum, i) => sum + i.count, 0)} / {s.capacity * 64}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })()}
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Historial (24h)</h2>
        {history.data && history.data.samples.length > 0 ? (
          <p className="text-sm text-slate-400">{history.data.samples.length} muestras registradas.</p>
        ) : (
          <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Imágenes</h2>
        <div className="grid grid-cols-4 gap-2">
          {f.images.map((img) => (
            <div key={img.id} className="relative">
              <img src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-24 w-full rounded object-cover" />
              <button
                onClick={() => deleteImage.mutate(img.id)}
                className="absolute right-1 top-1 rounded bg-black/60 px-1 text-xs text-status-blocked"
                aria-label="Eliminar imagen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input ref={fileInput} type="file" accept="image/*" onChange={onFileChange} className="mt-3 text-sm" />
        {uploadImage.isError && <p className="mt-2 text-sm text-status-blocked">{uploadImage.error.message}</p>}
      </Card>
    </div>
  );
}
