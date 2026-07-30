import { useState } from 'react';
import { usePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, useLivePlayers } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Jugadores() {
  const players = usePlayers();
  const live = useLivePlayers();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const liveNames = new Set((live.data?.players ?? []).map((p) => p.name));

  async function onCreate() {
    if (!name.trim()) return;
    await createPlayer.mutateAsync({ minecraft_name: name.trim(), note: note || null });
    setName('');
    setNote('');
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Jugadores</h1>

      <Card>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de Minecraft"
            className="rounded border border-border bg-base px-3 py-2"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            className="flex-1 rounded border border-border bg-base px-3 py-2"
          />
          <button onClick={onCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
            Agregar
          </button>
        </div>
      </Card>

      <div className="space-y-2">
        {(players.data?.players ?? []).map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {p.minecraft_name}
                <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
              </div>
              <input
                defaultValue={p.note ?? ''}
                onBlur={(e) => updatePlayer.mutate({ id: p.id, note: e.target.value || null })}
                placeholder="Nota"
                className="mt-1 rounded border border-border bg-base px-2 py-1 text-sm"
              />
            </div>
            <button onClick={() => deletePlayer.mutate(p.id)} className="text-sm text-status-blocked hover:underline">
              Eliminar
            </button>
          </Card>
        ))}
        {(players.data?.players.length ?? 0) === 0 && <p className="text-sm text-slate-500">No hay jugadores registrados.</p>}
      </div>
    </div>
  );
}
