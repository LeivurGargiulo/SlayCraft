import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject } from '../api/hooks';
import Card from '../components/Card';
import Modal from '../components/Modal';

export default function Proyectos() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function onCreate() {
    if (!name.trim()) return;
    await createProject.mutateAsync({ name: name.trim(), description: description || null });
    setName('');
    setDescription('');
    setModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">Proyectos</h1>
        <button onClick={() => setModalOpen(true)} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          + Nuevo proyecto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(projects.data?.projects ?? []).map((p) => (
          <Link key={p.id} to={`/proyectos/${p.id}`}>
            <Card className="hover:border-gold">
              {p.images[0] ? (
                <img src={`/uploads/${p.images[0].path}`} alt={p.name} className="mb-2 h-32 w-full rounded object-cover" />
              ) : (
                <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-base text-slate-600">Sin imagen</div>
              )}
              <div className="font-medium">{p.name}</div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{p.description || 'Sin descripción todavía.'}</p>
            </Card>
          </Link>
        ))}
        {(projects.data?.projects.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500">No hay proyectos todavía. Creá el primero.</p>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo proyecto">
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full rounded border border-border bg-base px-3 py-2" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción"
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <button onClick={onCreate} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
            Crear
          </button>
        </div>
      </Modal>
    </div>
  );
}
