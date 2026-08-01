import type { TaskPriority } from '../api/types';

const LABELS: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' };
const COLORS: Record<TaskPriority, string> = {
  low: 'bg-status-done/20 text-status-done',
  med: 'bg-status-progress/20 text-status-progress',
  high: 'bg-status-blocked/20 text-status-blocked',
};

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`rounded px-2 py-0.5 font-mono text-xs ${COLORS[priority]}`}>{LABELS[priority]}</span>;
}
