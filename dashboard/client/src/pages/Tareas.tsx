import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useAddSubtask, useUpdateSubtask, useDeleteSubtask, usePlayers, useFarms, useProjects,
} from '../api/hooks';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import Card from '../components/Card';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import Select from '../components/Select';
import MultiSelect from '../components/MultiSelect';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' };
const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Pendiente', in_progress: 'En curso', done: 'Hecha' };

export default function Tareas() {
  const tasks = useTasks();
  const players = usePlayers();
  const farms = useFarms();
  const projects = useProjects();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const addSubtask = useAddSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [subtaskEditForm, setSubtaskEditForm] = useState<{ title: string; assignee_ids: number[] }>({ title: '', assignee_ids: [] });
  const [subtaskEditError, setSubtaskEditError] = useState<string | null>(null);
  const [subtaskDeleteTarget, setSubtaskDeleteTarget] = useState<number | null>(null);

  function closeSubtaskEditor() {
    setEditingSubtaskId(null);
    setSubtaskEditForm({ title: '', assignee_ids: [] });
    setSubtaskEditError(null);
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [farmFilter, setFarmFilter] = useState<string | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');

  const [form, setForm] = useState({
    title: '', description: '', priority: 'med' as TaskPriority, due_date: '',
    assignee_ids: [] as number[], farm_id: '' as string, project_id: '' as string,
  });

  function openCreate() {
    setEditing(null);
    setForm({ title: '', description: '', priority: 'med', due_date: '', assignee_ids: [], farm_id: '', project_id: '' });
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
      farm_id: t.farm_id ?? '',
      project_id: t.project_id ? String(t.project_id) : '',
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
      farm_id: form.farm_id || null,
      project_id: form.project_id ? Number(form.project_id) : null,
    };
    if (editing) await updateTask.mutateAsync({ id: editing.id, ...payload });
    else await createTask.mutateAsync(payload);
    setModalOpen(false);
  }

  const visible = (tasks.data?.tasks ?? []).filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (assigneeFilter !== 'all' && !t.assignees.some((a) => a.id === assigneeFilter)) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (farmFilter !== 'all' && t.farm_id !== farmFilter) return false;
    if (projectFilter !== 'all' && t.project_id !== projectFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-2xl text-gold">Tareas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-border">
            <button
              type="button"
              aria-pressed={mode === 'view'}
              onClick={() => {
                setMode('view');
                closeSubtaskEditor();
              }}
              className={`rounded-l px-3 py-1.5 text-sm ${mode === 'view' ? 'bg-gold text-base' : 'text-slate-300 hover:bg-panel'}`}
            >
              Ver
            </button>
            <button
              type="button"
              aria-pressed={mode === 'edit'}
              onClick={() => setMode('edit')}
              className={`rounded-r px-3 py-1.5 text-sm ${mode === 'edit' ? 'bg-gold text-base' : 'text-slate-300 hover:bg-panel'}`}
            >
              Editar
            </button>
          </div>
          {mode === 'edit' && (
            <button onClick={openCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
              + Nueva tarea
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="flex flex-wrap gap-2">
        <Select
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          className="w-48"
          searchable
          options={[
            { value: 'all', label: 'Todos los jugadores' },
            ...(players.data?.players ?? []).map((p) => ({ value: p.id, label: p.minecraft_name })),
          ]}
        />
        <Select
          value={priorityFilter}
          onChange={setPriorityFilter}
          className="w-40"
          options={[
            { value: 'all', label: 'Toda prioridad' },
            ...Object.entries(PRIORITY_LABEL).map(([v, label]) => ({ value: v as TaskPriority, label })),
          ]}
        />
        <Select
          value={farmFilter}
          onChange={setFarmFilter}
          className="w-40"
          searchable
          options={[
            { value: 'all', label: 'Toda granja' },
            ...(farms.data?.farms ?? []).map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <Select
          value={projectFilter}
          onChange={setProjectFilter}
          className="w-40"
          searchable
          options={[
            { value: 'all', label: 'Todo proyecto' },
            ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>

      <div className="space-y-2">
        {visible.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                  {t.due_date && <span>Vence: {t.due_date}</span>}
                  {t.assignees.length > 0 && <span>Asignada a: {t.assignees.map((a) => a.minecraft_name).join(', ')}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {t.farm_id && (
                    <Link
                      to={`/granjas/${t.farm_id}`}
                      className="rounded bg-panel px-2 py-0.5 text-xs text-cyan hover:underline"
                    >
                      {farms.data?.farms.find((f) => f.id === t.farm_id)?.name ?? t.farm_id}
                    </Link>
                  )}
                  {t.project_id && (
                    <Link
                      to={`/proyectos/${t.project_id}`}
                      className="rounded bg-panel px-2 py-0.5 text-xs text-cyan hover:underline"
                    >
                      {projects.data?.projects.find((p) => p.id === t.project_id)?.name ?? t.project_id}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === 'edit' ? (
                  <Select
                    value={t.status}
                    onChange={(status) => updateTask.mutate({ id: t.id, status })}
                    className="w-32"
                    options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                  />
                ) : (
                  <StatusBadge status={t.status} />
                )}
                {mode === 'edit' && (
                  <>
                    <button onClick={() => openEdit(t)} className="text-sm text-cyan hover:underline">
                      Editar
                    </button>
                    <button onClick={() => setDeleteTarget(t.id)} className="text-sm text-status-blocked hover:underline">
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
            {t.subtasks.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {t.subtasks.map((st) => (
                  <li key={st.id} className="text-sm">
                    {mode === 'edit' && editingSubtaskId === st.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={subtaskEditForm.title}
                          onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, title: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-border bg-base px-2 py-1 text-sm"
                        />
                        <MultiSelect
                          values={subtaskEditForm.assignee_ids}
                          onChange={(assignee_ids) => setSubtaskEditForm({ ...subtaskEditForm, assignee_ids })}
                          placeholder="Sin asignar"
                          options={(players.data?.players ?? []).map((p) => ({ value: p.id, label: p.minecraft_name }))}
                          className="w-40"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const title = subtaskEditForm.title.trim();
                            if (!title) {
                              setSubtaskEditError('El título no puede estar vacío.');
                              return;
                            }
                            try {
                              await updateSubtask.mutateAsync({ id: st.id, title, assignee_ids: subtaskEditForm.assignee_ids });
                              closeSubtaskEditor();
                            } catch {
                              setSubtaskEditError('No se pudo guardar la subtarea.');
                            }
                          }}
                          className="text-cyan hover:underline"
                        >
                          Guardar
                        </button>
                        <button type="button" onClick={closeSubtaskEditor} className="text-slate-400 hover:underline">
                          Cancelar
                        </button>
                        {subtaskEditError && <p className="w-full text-xs text-status-blocked">{subtaskEditError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!st.done}
                          disabled={mode !== 'edit'}
                          onChange={(e) => updateSubtask.mutate({ id: st.id, done: e.target.checked })}
                        />
                        <span className={st.done ? 'text-slate-500 line-through' : ''}>{st.title}</span>
                        {st.assignees.length > 0 && (
                          <span className="text-xs text-slate-500">({st.assignees.map((a) => a.minecraft_name).join(', ')})</span>
                        )}
                        {mode === 'edit' && (
                          <span className="ml-auto flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSubtaskId(st.id);
                                setSubtaskEditForm({ title: st.title, assignee_ids: st.assignees.map((a) => a.id) });
                                setSubtaskEditError(null);
                              }}
                              className="text-cyan hover:underline"
                            >
                              Editar
                            </button>
                            <button type="button" onClick={() => setSubtaskDeleteTarget(st.id)} className="text-status-blocked hover:underline">
                              Eliminar
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mode === 'edit' && (
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
            )}
          </Card>
        ))}
        {visible.length === 0 && <p className="text-sm text-slate-500">No hay tareas en este filtro.</p>}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar tarea' : 'Nueva tarea'}
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-4">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              value={form.priority}
              onChange={(priority) => setForm({ ...form, priority })}
              options={Object.entries(PRIORITY_LABEL).map(([v, label]) => ({ value: v as TaskPriority, label }))}
            />
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded border border-border bg-base px-3 py-2"
            />
            <Select
              value={form.farm_id}
              onChange={(farm_id) => setForm({ ...form, farm_id })}
              searchable
              options={[
                { value: '', label: 'Sin asignar (granja)' },
                ...(farms.data?.farms ?? []).map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
            <Select
              value={form.project_id}
              onChange={(project_id) => setForm({ ...form, project_id })}
              searchable
              options={[
                { value: '', label: 'Sin asignar (proyecto)' },
                ...(projects.data?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-slate-400">Asignar a</div>
            <MultiSelect
              values={form.assignee_ids}
              onChange={(assignee_ids) => setForm({ ...form, assignee_ids })}
              placeholder="Sin asignar"
              options={(players.data?.players ?? []).map((p) => ({ value: p.id, label: p.minecraft_name }))}
            />
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

      <ConfirmModal
        open={deleteTarget !== null}
        title="Eliminar tarea"
        message="¿Eliminar esta tarea? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) deleteTask.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <ConfirmModal
        open={subtaskDeleteTarget !== null}
        title="Eliminar subtarea"
        message="¿Eliminar esta subtarea? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onCancel={() => setSubtaskDeleteTarget(null)}
        onConfirm={() => {
          if (subtaskDeleteTarget !== null) deleteSubtask.mutate(subtaskDeleteTarget);
          setSubtaskDeleteTarget(null);
        }}
      />
    </div>
  );
}
