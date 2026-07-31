import { forwardRef, useState, type ChangeEvent } from 'react';

const FileUploadButton = forwardRef<HTMLInputElement, {
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  className?: string;
}>(function FileUploadButton({ onChange, label = 'Elegir imagen', className = '' }, ref) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded border border-border bg-base px-3 py-2 text-sm text-slate-300 hover:border-gold/50 ${className}`}
    >
      <span className="rounded bg-panel px-2 py-0.5 text-xs text-gold">{label}</span>
      <span className="truncate text-slate-400">{fileName ?? 'Ningún archivo seleccionado'}</span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          setFileName(e.target.files?.[0]?.name ?? null);
          onChange?.(e);
        }}
      />
    </label>
  );
});

export default FileUploadButton;
