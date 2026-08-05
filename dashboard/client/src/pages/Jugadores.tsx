import { useState } from 'react';
import { usePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, useLivePlayers, usePlayerSessions } from '../api/hooks';
import type { Actividad, Player } from '../api/types';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import PlayerSkin from '../components/PlayerSkin';
import Select from '../components/Select';
import ConfirmModal from '../components/ConfirmModal';
import SessionChart from '../components/SessionChart';

const ACTIVIDAD_ORDER: Actividad[] = ['activo', 'ocasional', 'inactivo'];
const ACTIVIDAD_LABELS: Record<Actividad, string> = {
  activo: 'Activo',
  ocasional: 'Ocasional',
  inactivo: 'Inactivo',
};
const ACTIVIDAD_OPTIONS = ACTIVIDAD_ORDER.map((value) => ({ value, label: ACTIVIDAD_LABELS[value] }));

export default function Jugadores() {
  const players = usePlayers();
  const live = useLivePlayers();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [sessionPlayer, setSessionPlayer] = useState<string | null>(null);
  const sessions = usePlayerSessions(sessionPlayer ?? '', '7d');

  const liveNames = new Set((live.data?.players ?? []).map((p) => p.name));
  const allPlayers = players.data?.players ?? [];
  const onlinePlayers = allPlayers.filter((p) => liveNames.has(p.minecraft_name));
  const byActividad = (actividad: Actividad) =>
    allPlayers
      .filter((p) => p.actividad === actividad && !liveNames.has(p.minecraft_name))
      .sort((a, b) => a.minecraft_name.localeCompare(b.minecraft_name));

  async function onCreate() {
    if (!name.trim()) return;
    await createPlayer.mutateAsync({ minecraft_name: name.trim(), note: note || null });
    setName('');
    setNote('');
  }

  function renderPlayer(p: Player) {
    return (
      <Card key={p.id} className="flex flex-col items-center gap-2 text-center">
        <PlayerSkin name={p.minecraft_name} />
        <div className="flex items-center gap-2 font-medium">
          {p.minecraft_name}
          <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
        </div>
        <Select
          value={p.actividad}
          onChange={(actividad) => updatePlayer.mutate({ id: p.id, actividad })}
          options={ACTIVIDAD_OPTIONS}
          className="w-32"
        />
        <input
          defaultValue={p.note ?? ''}
          onBlur={(e) => updatePlayer.mutate({ id: p.id, note: e.target.value || null })}
          placeholder="Nota"
          className="w-full rounded border border-border bg-base px-2 py-1 text-center text-sm"
        />
        <button onClick={() => setDeleteTarget(p.id)} className="text-sm text-status-blocked hover:underline">
          Eliminar
        </button>
        <button onClick={() => setSessionPlayer(p.minecraft_name)} className="text-sm text-cyan hover:underline">
          Historial
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Jugadores</h1>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de Minecraft"
            className="rounded border border-border bg-base px-3 py-2 sm:w-auto"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            className="rounded border border-border bg-base px-3 py-2 sm:flex-1"
          />
          <button onClick={onCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
            Agregar
          </button>
        </div>
        {createPlayer.isError && (
          <p className="mt-2 text-sm text-status-blocked">{createPlayer.error.message}</p>
        )}
      </Card>

      {onlinePlayers.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-mono text-lg text-slate-300">
            En línea <span className="text-sm font-normal text-slate-500">({onlinePlayers.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{onlinePlayers.map(renderPlayer)}</div>
        </section>
      )}

      {ACTIVIDAD_ORDER.map((actividad) => {
        const items = byActividad(actividad);
        if (items.length === 0) return null;
        return (
          <section key={actividad} className="space-y-2">
            <h2 className="font-mono text-lg text-slate-300">
              {ACTIVIDAD_LABELS[actividad]} <span className="text-sm font-normal text-slate-500">({items.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{items.map(renderPlayer)}</div>
          </section>
        );
      })}

      {allPlayers.length === 0 && <p className="text-sm text-slate-500">No hay jugadores registrados.</p>}

      {sessionPlayer && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-slate-200">Conexión de {sessionPlayer} (7 días)</h2>
            <button onClick={() => setSessionPlayer(null)} className="text-sm text-slate-400 hover:underline">
              Cerrar
            </button>
          </div>
          {sessions.data ? <SessionChart sessions={sessions.data.sessions} /> : <p className="text-sm text-slate-500">Cargando…</p>}
        </Card>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Eliminar jugador"
        message="¿Eliminar este jugador? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) deletePlayer.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
