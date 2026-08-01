import type { ReactNode } from 'react';

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-mono text-lg text-gold">{title}</h2>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
