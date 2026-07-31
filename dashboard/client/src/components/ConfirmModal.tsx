import Modal from './Modal';

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded border border-status-blocked px-3 py-1.5 text-sm text-status-blocked hover:bg-status-blocked/10"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
