import { useEffect, useRef } from 'react';
import { SkinViewer, IdleAnimation } from 'skinview3d';

export default function PlayerSkin({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 64,
      height: 96,
      skin: `https://minotar.net/skin/${name}`,
    });
    viewer.animation = new IdleAnimation();
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.8;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    return () => viewer.dispose();
  }, [name]);

  return <canvas ref={canvasRef} />;
}
