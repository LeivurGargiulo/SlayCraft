import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SkinViewer } from 'skinview3d';
import { usePlayers } from '../api/hooks';
import Card from '../components/Card';

export default function JugadorDetail() {
  const { id } = useParams<{ id: string }>();
  const players = usePlayers();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  const player = players.data?.players.find((p) => p.id === Number(id));

  useEffect(() => {
    if (!player || !canvasRef.current) return;
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 300,
      height: 400,
      skin: `https://minotar.net/skin/${player.minecraft_name}`,
    });
    viewer.controls.enableZoom = true;
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [player?.minecraft_name]);

  if (players.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (!player) return <p className="text-status-blocked">No se encontró el jugador.</p>;

  return (
    <div className="space-y-4">
      <Link to="/jugadores" className="text-sm text-cyan hover:underline">
        ← Jugadores
      </Link>
      <h1 className="font-mono text-2xl text-gold">{player.minecraft_name}</h1>
      <Card>
        <canvas ref={canvasRef} />
      </Card>
    </div>
  );
}
