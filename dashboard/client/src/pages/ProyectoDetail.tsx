import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjects, useUpdateProject, useDeleteProject, useUploadProjectImage } from '../api/hooks';
import Card from '../components/Card';

export default function ProyectoDetail() {
  const { id } = useParams<{ id: string }>();
  const projects = useProjects();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const uploadImage = useUploadProjectImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const project = projects.data?.projects.find((p) => p.id === Number(id));
  const [description, setDescription] = useState(project?.description ?? '');

  if (!project) return <p className="text-slate-400">Cargando…</p>;

  async function onFileChange() {
    const file = fileInput.current?.files?.[0];
    if (file) await uploadImage.mutateAsync({ projectId: project!.id, file });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="space-y-4">
      <Link to="/proyectos" className="text-sm text-cyan hover:underline">
        ← Proyectos
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">{project.name}</h1>
        <button
          onClick={() => deleteProject.mutate(project.id)}
          className="text-sm text-status-blocked hover:underline"
        >
          Eliminar proyecto
        </button>
      </div>

      <Card>
        {editing ? (
          <div className="space-y-2">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-border bg-base px-3 py-2" />
            <button
              onClick={async () => {
                await updateProject.mutateAsync({ id: project.id, description });
                setEditing(false);
              }}
              className="rounded bg-gold px-3 py-1 text-sm text-base"
            >
              Guardar
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-300">{project.description || 'Sin descripción todavía.'}</p>
            <button onClick={() => setEditing(true)} className="mt-2 text-sm text-cyan hover:underline">
              Editar descripción
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Imágenes</h2>
        <div className="grid grid-cols-4 gap-2">
          {project.images.map((img) => (
            <img key={img.id} src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-24 w-full rounded object-cover" />
          ))}
        </div>
        <input ref={fileInput} type="file" accept="image/*" onChange={onFileChange} className="mt-3 text-sm" />
      </Card>
    </div>
  );
}
