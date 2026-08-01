const LABELS: Record<string, string> = {
  todo: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  online: 'En línea',
  offline: 'Fuera de línea',
};

const COLORS: Record<string, string> = {
  todo: 'bg-status-todo/20 text-status-todo',
  in_progress: 'bg-status-progress/20 text-status-progress',
  done: 'bg-status-done/20 text-status-done',
  online: 'bg-status-done/20 text-status-done',
  offline: 'bg-status-blocked/20 text-status-blocked',
};

export default function StatusBadge({ status }: { status: keyof typeof LABELS }) {
  return (
    <span className={`rounded px-2 py-0.5 font-mono text-xs ${COLORS[status]}`}>{LABELS[status]}</span>
  );
}
