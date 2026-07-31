import { useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useFarm,
  useFarmHistory,
  useUpdateFarmMetadata,
  useUploadFarmImage,
  useDeleteFarmImage,
  useDeleteFarm,
  useUpdateFarmConfig,
} from '../api/hooks';
import Card from '../components/Card';
import ImageZoom from '../components/ImageZoom';
import FileUploadButton from '../components/FileUploadButton';
import Modal from '../components/Modal';
import type { StorageItem, FarmDetail as FarmDetailType } from '../api/types';

type StorageRow = { id: string; label: string; x: string; y: string; z: string };

function buildConfigForm(f: FarmDetailType) {
  return {
    name: f.name,
    dimension: f.dimension,
    x: String(f.anchor.x),
    y: String(f.anchor.y),
    z: String(f.anchor.z),
    entityScanRadius: String(f.entityScanRadius),
    fakePlayerName: f.fakePlayerName ?? '',
    storageRows: f.storage.map((s): StorageRow => ({ id: s.id, label: s.label, x: String(s.position.x), y: String(s.position.y), z: String(s.position.z) })),
    hasAfkSpot: f.afkSpot !== null,
    afkX: String(f.afkSpot?.position.x ?? f.anchor.x),
    afkY: String(f.afkSpot?.position.y ?? f.anchor.y),
    afkZ: String(f.afkSpot?.position.z ?? f.anchor.z),
    afkRadius: String(f.afkSpot?.radius ?? 5),
  };
}
type ConfigForm = ReturnType<typeof buildConfigForm>;

// A filled shulker box represents its contents, not an item of its own; an empty box still counts as one shulker_box.
function selfAndContents(item: StorageItem): { itemId: string; count: number }[] {
  if (item.shulkerContents && item.shulkerContents.length > 0) {
    return item.shulkerContents.flatMap(selfAndContents);
  }
  return [{ itemId: item.itemId, count: item.count }];
}

function computeRates(samples: { sampledAt: string; storageCounts: Record<string, number> }[]) {
  if (samples.length < 2) return {};
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMinutes = (new Date(last.sampledAt).getTime() - new Date(first.sampledAt).getTime()) / 60_000;
  if (elapsedMinutes <= 0) return {};
  const itemIds = new Set([...Object.keys(first.storageCounts), ...Object.keys(last.storageCounts)]);
  const rates: Record<string, number> = {};
  for (const itemId of itemIds) {
    const delta = (last.storageCounts[itemId] ?? 0) - (first.storageCounts[itemId] ?? 0);
    rates[itemId] = Math.max(0, delta) / elapsedMinutes;
  }
  return rates;
}

function rateStatus(actualPerHour: number, expectedPerHour: number | undefined): 'normal' | 'low' | 'none' | null {
  if (expectedPerHour === undefined) return null;
  const ratio = expectedPerHour > 0 ? actualPerHour / expectedPerHour : 0;
  if (ratio >= 0.9) return 'normal';
  if (ratio >= 0.1) return 'low';
  return 'none';
}

export default function GranjaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const farm = useFarm(id!);
  const history = useFarmHistory(id!, '24h');
  const rateHistory = useFarmHistory(id!, '1h');
  const updateMetadata = useUpdateFarmMetadata();
  const uploadImage = useUploadFarmImage();
  const deleteImage = useDeleteFarmImage();
  const deleteFarm = useDeleteFarm();
  const updateConfig = useUpdateFarmConfig();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [expectedRates, setExpectedRates] = useState<Array<{ itemId: string; rate: string }>>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [config, setConfig] = useState<ConfigForm | null>(null);

  if (farm.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (farm.isError || !farm.data) return <p className="text-status-blocked">No se encontró la granja.</p>;
  const f = farm.data;

  function startEdit() {
    setNotes(f.metadata.notes ?? '');
    setTags(f.metadata.tags.join(', '));
    setCoordinates(f.metadata.coordinates ?? '');
    setExpectedRates(Object.entries(f.metadata.expected_rates).map(([itemId, rate]) => ({ itemId, rate: String(rate) })));
    setEditingMeta(true);
  }

  async function saveMeta() {
    const expected_rates = Object.fromEntries(
      expectedRates.filter((r) => r.itemId.trim() && r.rate.trim()).map((r) => [r.itemId.trim(), Number(r.rate)])
    );
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      coordinates: coordinates || null,
      expected_rates,
    });
    setEditingMeta(false);
  }

  async function onFileChange() {
    const file = fileInput.current?.files?.[0];
    if (file) await uploadImage.mutateAsync({ farmId: f.id, file });
    if (fileInput.current) fileInput.current.value = '';
  }

  async function onDeleteFarm() {
    if (!confirm(`¿Eliminar la granja "${f.name}" de la configuración de MCFarmManager? Esta acción no se puede deshacer.`)) return;
    await deleteFarm.mutateAsync(f.id);
    navigate('/granjas');
  }

  function startEditConfig() {
    setConfig(buildConfigForm(f));
    setConfigModalOpen(true);
  }

  async function saveConfig() {
    if (!config) return;
    await updateConfig.mutateAsync({
      id: f.id,
      name: config.name.trim(),
      dimension: config.dimension.trim(),
      anchor: { x: Number(config.x), y: Number(config.y), z: Number(config.z) },
      entityScanRadius: Number(config.entityScanRadius),
      fakePlayerName: config.fakePlayerName.trim() || null,
      storage: config.storageRows
        .filter((r) => r.id.trim())
        .map((r) => ({ id: r.id.trim(), label: r.label.trim(), position: { x: Number(r.x), y: Number(r.y), z: Number(r.z) } })),
      afkSpot: config.hasAfkSpot
        ? { position: { x: Number(config.afkX), y: Number(config.afkY), z: Number(config.afkZ) }, radius: Number(config.afkRadius) }
        : null,
    });
    setConfigModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <Link to="/granjas" className="text-sm text-cyan hover:underline">
        ← Granjas
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">{f.name}</h1>
        <div className="flex gap-2">
          <button onClick={startEditConfig} className="rounded border border-border px-3 py-1.5 text-sm text-cyan hover:bg-cyan/10">
            Editar configuración
          </button>
          <button onClick={onDeleteFarm} className="rounded border border-status-blocked px-3 py-1.5 text-sm text-status-blocked hover:bg-status-blocked/10">
            Eliminar granja
          </button>
        </div>
      </div>
      {deleteFarm.isError && <p className="text-sm text-status-blocked">{deleteFarm.error.message}</p>}

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
              <div className="space-y-1">
                <div className="text-xs text-slate-400">Tasas esperadas (ítem por hora)</div>
                {expectedRates.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={row.itemId}
                      onChange={(e) => {
                        const next = [...expectedRates];
                        next[i] = { ...next[i], itemId: e.target.value };
                        setExpectedRates(next);
                      }}
                      placeholder="ej. iron_ingot"
                      className="flex-1 rounded border border-border bg-base px-2 py-1 text-sm"
                    />
                    <input
                      value={row.rate}
                      onChange={(e) => {
                        const next = [...expectedRates];
                        next[i] = { ...next[i], rate: e.target.value };
                        setExpectedRates(next);
                      }}
                      type="number"
                      placeholder="por hora"
                      className="w-24 rounded border border-border bg-base px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => setExpectedRates(expectedRates.filter((_, j) => j !== i))}
                      className="text-sm text-status-blocked"
                      aria-label="Eliminar fila"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setExpectedRates([...expectedRates, { itemId: '', rate: '' }])}
                  className="text-sm text-cyan hover:underline"
                >
                  + Agregar ítem
                </button>
              </div>
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
          <h2 className="mb-2 font-mono text-slate-200">Ocupantes</h2>
          {f.occupants.length > 0 ? (
            <div className="space-y-1">
              {f.occupants.map((o) => (
                <p key={o.name} className="text-sm">
                  {o.name} {o.isFakePlayer ? '(bot)' : ''}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin ocupantes en el punto de AFK.</p>
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
          const allItems = f.storage.flatMap((s) => s.items.flatMap(selfAndContents));
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
        <h2 className="mb-2 font-mono text-slate-200">Producción</h2>
        {rateHistory.data && rateHistory.data.samples.length >= 2 ? (
          <div className="space-y-2">
            {Object.entries(computeRates(rateHistory.data.samples)).map(([itemId, perMinute]) => {
              const status = rateStatus(perMinute * 60, f.metadata.expected_rates[itemId]);
              const statusLabel = status === 'normal' ? 'Normal' : status === 'low' ? 'Baja' : status === 'none' ? 'Sin producción' : null;
              const statusColor =
                status === 'normal' ? 'text-status-done' : status === 'low' ? 'text-status-progress' : status === 'none' ? 'text-status-blocked' : 'text-slate-500';
              return (
                <div key={itemId} className="flex items-center justify-between text-sm">
                  <span>{itemId.replace(/^minecraft:/, '')}</span>
                  <span className="flex items-center gap-2 font-mono text-slate-400">
                    {(perMinute * 60).toFixed(1)}/h · {(perMinute * 1440).toFixed(0)}/día
                    {statusLabel && <span className={statusColor}>{statusLabel}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Datos insuficientes.</p>
        )}
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
          {f.images.map((img, i) => (
            <div key={img.id} className="relative">
              <ImageZoom
                src={`/uploads/${img.path}`}
                alt={img.caption ?? ''}
                className="h-24 w-full rounded object-cover"
                index={i}
                gallery={f.images.map((g) => ({ src: `/uploads/${g.path}`, alt: g.caption ?? '' }))}
              />
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
        <FileUploadButton ref={fileInput} onChange={onFileChange} className="mt-3" />
        {uploadImage.isError && <p className="mt-2 text-sm text-status-blocked">{uploadImage.error.message}</p>}
      </Card>

      {config && (
        <Modal open={configModalOpen} onClose={() => setConfigModalOpen(false)} title="Editar configuración">
          <div className="space-y-3">
            <input
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              placeholder="Nombre"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />
            <input
              value={config.dimension}
              onChange={(e) => setConfig({ ...config, dimension: e.target.value })}
              placeholder="Dimensión"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />
            <div>
              <div className="mb-1 text-xs text-slate-400">Ancla (posición central)</div>
              <div className="flex gap-2">
                <input value={config.x} onChange={(e) => setConfig({ ...config, x: e.target.value })} placeholder="X" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
                <input value={config.y} onChange={(e) => setConfig({ ...config, y: e.target.value })} placeholder="Y" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
                <input value={config.z} onChange={(e) => setConfig({ ...config, z: e.target.value })} placeholder="Z" className="w-1/3 rounded border border-border bg-base px-3 py-2" />
              </div>
            </div>
            <input
              value={config.entityScanRadius}
              onChange={(e) => setConfig({ ...config, entityScanRadius: e.target.value })}
              placeholder="Radio de escaneo"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />
            <input
              value={config.fakePlayerName}
              onChange={(e) => setConfig({ ...config, fakePlayerName: e.target.value })}
              placeholder="Nombre del jugador falso (opcional)"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />

            <div className="space-y-1">
              <div className="text-xs text-slate-400">Contenedores</div>
              {config.storageRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={row.id}
                    onChange={(e) => {
                      const rows = [...config.storageRows];
                      rows[i] = { ...rows[i], id: e.target.value };
                      setConfig({ ...config, storageRows: rows });
                    }}
                    placeholder="id"
                    className="w-24 rounded border border-border bg-base px-2 py-1 text-sm"
                  />
                  <input
                    value={row.label}
                    onChange={(e) => {
                      const rows = [...config.storageRows];
                      rows[i] = { ...rows[i], label: e.target.value };
                      setConfig({ ...config, storageRows: rows });
                    }}
                    placeholder="etiqueta"
                    className="flex-1 rounded border border-border bg-base px-2 py-1 text-sm"
                  />
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <input
                      key={axis}
                      value={row[axis]}
                      onChange={(e) => {
                        const rows = [...config.storageRows];
                        rows[i] = { ...rows[i], [axis]: e.target.value };
                        setConfig({ ...config, storageRows: rows });
                      }}
                      placeholder={axis.toUpperCase()}
                      className="w-14 rounded border border-border bg-base px-2 py-1 text-sm"
                    />
                  ))}
                  <button
                    onClick={() => setConfig({ ...config, storageRows: config.storageRows.filter((_, j) => j !== i) })}
                    className="text-sm text-status-blocked"
                    aria-label="Eliminar contenedor"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setConfig({ ...config, storageRows: [...config.storageRows, { id: '', label: '', x: config.x, y: config.y, z: config.z }] })
                }
                className="text-sm text-cyan hover:underline"
              >
                + Agregar contenedor
              </button>
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={config.hasAfkSpot} onChange={(e) => setConfig({ ...config, hasAfkSpot: e.target.checked })} />
                Tiene punto de AFK
              </label>
              {config.hasAfkSpot && (
                <div className="flex gap-2">
                  <input value={config.afkX} onChange={(e) => setConfig({ ...config, afkX: e.target.value })} placeholder="X" className="w-1/4 rounded border border-border bg-base px-2 py-1 text-sm" />
                  <input value={config.afkY} onChange={(e) => setConfig({ ...config, afkY: e.target.value })} placeholder="Y" className="w-1/4 rounded border border-border bg-base px-2 py-1 text-sm" />
                  <input value={config.afkZ} onChange={(e) => setConfig({ ...config, afkZ: e.target.value })} placeholder="Z" className="w-1/4 rounded border border-border bg-base px-2 py-1 text-sm" />
                  <input
                    value={config.afkRadius}
                    onChange={(e) => setConfig({ ...config, afkRadius: e.target.value })}
                    placeholder="Radio"
                    className="w-1/4 rounded border border-border bg-base px-2 py-1 text-sm"
                  />
                </div>
              )}
            </div>

            <button onClick={saveConfig} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
              Guardar configuración
            </button>
            {updateConfig.isError && <p className="text-sm text-status-blocked">{updateConfig.error.message}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
