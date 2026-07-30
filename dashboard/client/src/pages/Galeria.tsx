import { useRef, useState } from 'react';
import { useGallery, useUploadGalleryImage, useUpdateGalleryImage, useDeleteGalleryImage } from '../api/hooks';

export default function Galeria() {
  const gallery = useGallery();
  const upload = useUploadGalleryImage();
  const updateCaption = useUpdateGalleryImage();
  const deleteImage = useDeleteGalleryImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [captionDraft, setCaptionDraft] = useState('');

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

      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel p-4">
        <input ref={fileInput} type="file" accept="image/*" className="text-sm" />
        <input
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          placeholder="Descripción (opcional)"
          className="flex-1 rounded border border-border bg-base px-3 py-2"
        />
        <button onClick={onUpload} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          Subir imagen
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {(gallery.data?.images ?? []).map((img) => (
          <div key={img.id} className="overflow-hidden rounded-lg border border-border bg-panel">
            <img src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-32 w-full object-cover" />
            <div className="p-2">
              <input
                defaultValue={img.caption ?? ''}
                onBlur={(e) => updateCaption.mutate({ id: img.id, caption: e.target.value || null })}
                placeholder="Sin descripción"
                className="w-full rounded border border-border bg-base px-2 py-1 text-xs"
              />
              <button onClick={() => deleteImage.mutate(img.id)} className="mt-1 text-xs text-status-blocked hover:underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {(gallery.data?.images.length ?? 0) === 0 && <p className="text-sm text-slate-500">La galería está vacía todavía.</p>}
      </div>
    </div>
  );
}
