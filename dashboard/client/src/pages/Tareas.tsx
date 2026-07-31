import { useState } from 'react';
import {
  useTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useAddSubtask, useUpdateSubtask, usePlayers,
} from '../api/hooks';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import Card from '../components/Card';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' };
const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Pendiente', in_progress: 'En curso', blocked: 'Bloqueada', done: 'Hecha' };

export default function Tareas() {
  const tasks = useTasks();
  const players = usePlayers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const addSubtask = useAddSubtask();
  const updateSubtask = useUpdateSubtask();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  const [form, setForm] = useState({ title: '', description: '', priority: 'med' as TaskPriority, due_date: '', assignee_ids: [] as number[] });

  function openCreate() {
    setEditing(null);
    setForm({ title: '', description: '', priority: 'med', due_date: '', assignee_ids: [] });
    setModalOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      priority: t.priority,
      due_date: t.due_date ?? '',
      assignee_ids: t.assignees.map((a) => a.id),
    });
    setModalOpen(true);
  }

  async function onSave() {
    const payload = {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_ids: form.assignee_ids,
    };
    if (editing) await updateTask.mutateAsync({ id: editing.id, ...payload });
    else await createTask.mutateAsync(payload);
    setModalOpen(false);
  }

  const visible = (tasks.data?.tasks ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">Tareas</h1>
        <button onClick={openCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          + Nueva tarea
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded px-3 py-1 text-sm ${statusFilter === 'all' ? 'bg-gold text-base' : 'bg-panel text-slate-300'}`}
        >
          Todas
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded px-3 py-1 text-sm ${statusFilter === s ? 'bg-gold text-base' : 'bg-panel text-slate-300'}`}
          >
            <StatusBadge status={s} />
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="mt-1 flex gap-2 text-xs text-slate-400">
                  <StatusBadge status={t.status} />
                  <span>Prioridad: {PRIORITY_LABEL[t.priority]}</span>
                  {t.due_date && <span>Vence: {t.due_date}</span>}
                  {t.assignees.length > 0 && <span>Asignada a: {t.assignees.map((a) => a.minecraft_name).join(', ')}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  value={t.status}
                  onChange={(e) => updateTask.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                  className="rounded border border-border bg-base px-2 py-1 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button onClick={() => openEdit(t)} className="text-sm text-cyan hover:underline">
                  Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm('¿Eliminar esta tarea?')) deleteTask.mutate(t.id);
                  }}
                  className="text-sm text-status-blocked hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
            {t.subtasks.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {t.subtasks.map((st) => (
                  <li key={st.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!st.done}
                      onChange={(e) => updateSubtask.mutate({ id: st.id, done: e.target.checked })}
                    />
                    <span className={st.done ? 'text-slate-500 line-through' : ''}>{st.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('subtitle') as HTMLInputElement;
                if (input.value.trim()) addSubtask.mutate({ taskId: t.id, title: input.value.trim() });
                input.value = '';
              }}
              className="mt-2 flex gap-2"
            >
              <input name="subtitle" placeholder="Agregar subtarea…" className="flex-1 rounded border border-border bg-base px-2 py-1 text-sm" />
              <button type="submit" className="text-sm text-cyan hover:underline">
                Agregar
              </button>
            </form>
          </Card>
        ))}
        {visible.length === 0 && <p className="text-sm text-slate-500">No hay tareas en este filtro.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar tarea' : 'Nueva tarea'}>
        <div className="space-y-3">
          <input
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <textarea
            placeholder="Descripción"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <div className="flex gap-2">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
              className="rounded border border-border bg-base px-3 py-2"
            >
              {Object.entries(PRIORITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded border border-border bg-base px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-slate-400">Asignar a</div>
            <div className="flex flex-wrap gap-2">
              {(players.data?.players ?? []).map((p) => (
                <label key={p.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.assignee_ids.includes(p.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        assignee_ids: e.target.checked
                          ? [...form.assignee_ids, p.id]
                          : form.assignee_ids.filter((id) => id !== p.id),
                      })
                    }
                  />
                  {p.minecraft_name}
                </label>
              ))}
            </div>
          </div>
          <button onClick={onSave} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
            Guardar
          </button>
          {(createTask.isError || updateTask.isError) && (
            <p className="text-sm text-status-blocked">
              {(createTask.error ?? updateTask.error)?.message}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
