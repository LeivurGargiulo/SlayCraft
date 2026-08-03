import { useRef, useState } from 'react';
import { useGallery, useUploadGalleryImage, useUpdateGalleryImage, useDeleteGalleryImage } from '../api/hooks';
import ImageZoom from '../components/ImageZoom';
import FileUploadButton from '../components/FileUploadButton';
import ConfirmModal from '../components/ConfirmModal';

export default function Galeria() {
  const gallery = useGallery();
  const upload = useUploadGalleryImage();
  const updateCaption = useUpdateGalleryImage();
  const deleteImage = useDeleteGalleryImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  async function onUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    await upload.mutateAsync({ file, caption: captionDraft || undefined });
    setCaptionDraft('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Galería</h1>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-4 sm:flex-row sm:items-center">
        <FileUploadButton ref={fileInput} />
        <input
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          placeholder="Descripción (opcional)"
          className="rounded border border-border bg-base px-3 py-2 sm:flex-1"
        />
        <button onClick={onUpload} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          Subir imagen
        </button>
      </div>
      {upload.isError && <p className="text-sm text-status-blocked">{upload.error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(gallery.data?.images ?? []).map((img, i) => (
          <div key={img.id} className="overflow-hidden rounded-lg border border-border bg-panel">
            <ImageZoom
              src={`/uploads/${img.path}`}
              alt={img.caption ?? ''}
              className="h-32 w-full object-cover"
              index={i}
              gallery={(gallery.data?.images ?? []).map((g) => ({ src: `/uploads/${g.path}`, alt: g.caption ?? '' }))}
            />
            <div className="p-2">
              <input
                defaultValue={img.caption ?? ''}
                onBlur={(e) => updateCaption.mutate({ id: img.id, caption: e.target.value || null })}
                placeholder="Sin descripción"
                className="w-full rounded border border-border bg-base px-2 py-1 text-xs"
              />
              <button
                onClick={() => setDeleteTarget(img.id)}
                className="mt-1 text-xs text-status-blocked hover:underline"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {(gallery.data?.images.length ?? 0) === 0 && <p className="text-sm text-slate-500">La galería está vacía todavía.</p>}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Eliminar imagen"
        message="¿Eliminar esta imagen? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) deleteImage.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
