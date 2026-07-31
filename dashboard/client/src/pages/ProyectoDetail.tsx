import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjects, useUpdateProject, useDeleteProject, useUploadProjectImage, useDeleteProjectImage } from '../api/hooks';
import Card from '../components/Card';
import ImageZoom from '../components/ImageZoom';
import FileUploadButton from '../components/FileUploadButton';

export default function ProyectoDetail() {
  const { id } = useParams<{ id: string }>();
  const projects = useProjects();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const uploadImage = useUploadProjectImage();
  const deleteImage = useDeleteProjectImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const project = projects.data?.projects.find((p) => p.id === Number(id));
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState('');

  if (!project) return <p className="text-slate-400">Cargando…</p>;

  function startEdit() {
    setDescription(project!.description ?? '');
    setCoordinates(project!.coordinates ?? '');
    setEditing(true);
  }

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
          onClick={() => {
            if (confirm('¿Eliminar este proyecto? Se borrarán todas sus imágenes.')) deleteProject.mutate(project.id);
          }}
          className="text-sm text-status-blocked hover:underline"
        >
          Eliminar proyecto
        </button>
      </div>

      <Card>
        {editing ? (
          <div className="space-y-2">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-border bg-base px-3 py-2" />
            <input
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              placeholder="Coordenadas (ej. 120, 80, -500)"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />
            <button
              onClick={async () => {
                await updateProject.mutateAsync({ id: project.id, description, coordinates: coordinates || null });
                setEditing(false);
              }}
              className="rounded bg-gold px-3 py-1 text-sm text-base"
            >
              Guardar
            </button>
            {updateProject.isError && (
              <p className="text-sm text-status-blocked">{updateProject.error.message}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-300">{project.description || 'Sin descripción todavía.'}</p>
            {project.coordinates && <p className="mt-1 font-mono text-sm text-slate-400">{project.coordinates}</p>}
            <button onClick={startEdit} className="mt-2 text-sm text-cyan hover:underline">
              Editar descripción
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Imágenes</h2>
        <div className="grid grid-cols-4 gap-2">
          {project.images.map((img, i) => (
            <div key={img.id} className="relative">
              <ImageZoom
                src={`/uploads/${img.path}`}
                alt={img.caption ?? ''}
                className="h-24 w-full rounded object-cover"
                index={i}
                gallery={project.images.map((g) => ({ src: `/uploads/${g.path}`, alt: g.caption ?? '' }))}
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
        {uploadImage.isError && (
          <p className="mt-2 text-sm text-status-blocked">{uploadImage.error.message}</p>
        )}
      </Card>
    </div>
  );
}
