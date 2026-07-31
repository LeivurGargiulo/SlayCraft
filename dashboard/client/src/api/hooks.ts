import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  Task, TaskInput, Subtask, Player, FarmSummary, FarmDetail, FarmHistorySample,
  LivePlayer, Performance, Project, ProjectImage, GalleryImage, FarmImage,
} from './types';

// --- auth ---
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => apiFetch<{ ok: true }>('/me'), retry: false });
}
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => apiFetch<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/logout', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

// --- tasks ---
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<{ tasks: Task[] }>('/tasks'),
    refetchInterval: 15_000,
  });
}
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: number }) =>
      apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useAddSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: number; title: string }) =>
      apiFetch<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; done?: boolean; title?: string }) =>
      apiFetch<Subtask>(`/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/subtasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// --- players (registry) ---
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: () => apiFetch<{ players: Player[] }>('/players'),
    refetchInterval: 30_000,
  });
}
export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { minecraft_name: string; note?: string | null }) =>
      apiFetch<Player>('/players', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
export function useUpdatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; minecraft_name?: string; note?: string | null }) =>
      apiFetch<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
export function useDeletePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/players/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

// --- farms (live, proxied) ---
export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: () => apiFetch<{ farms: FarmSummary[] }>('/farms'),
    refetchInterval: 30_000,
  });
}
export function useFarm(id: string) {
  return useQuery({ queryKey: ['farms', id], queryFn: () => apiFetch<FarmDetail>(`/farms/${id}`), refetchInterval: 15_000 });
}
export function useFarmHistory(id: string, range: string) {
  return useQuery({
    queryKey: ['farms', id, 'history', range],
    queryFn: () => apiFetch<{ samples: FarmHistorySample[] }>(`/farms/${id}/history?range=${range}`),
    refetchInterval: 30_000,
  });
}
export function useUpdateFarmMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, tags, coordinates }: { id: string; notes?: string | null; tags?: string[]; coordinates?: string | null }) =>
      apiFetch(`/farms/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ notes, tags, coordinates }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.id] });
    },
  });
}
export function useUploadFarmImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ farmId, file, caption }: { farmId: string; file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<FarmImage>(`/farms/${farmId}/images`, { method: 'POST', body: form });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.farmId] });
    },
  });
}
export function useDeleteFarmImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/farm-images/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['farms'] }),
  });
}
export function useLivePlayers() {
  return useQuery({
    queryKey: ['players', 'live'],
    queryFn: () => apiFetch<{ players: LivePlayer[] }>('/players/live'),
    refetchInterval: 15_000,
  });
}
export function usePerformance() {
  return useQuery({ queryKey: ['performance'], queryFn: () => apiFetch<Performance>('/performance'), refetchInterval: 10_000 });
}

// --- projects ---
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Project[] }>('/projects'),
    refetchInterval: 30_000,
  });
}
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null; status?: string; coordinates?: string | null }) =>
      apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; name?: string; description?: string | null; status?: string; coordinates?: string | null }) =>
      apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useUploadProjectImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, file, caption }: { projectId: number; file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<ProjectImage>(`/projects/${projectId}/images`, { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// --- gallery ---
export function useGallery() {
  return useQuery({
    queryKey: ['gallery'],
    queryFn: () => apiFetch<{ images: GalleryImage[] }>('/gallery'),
    refetchInterval: 30_000,
  });
}
export function useUploadGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, caption }: { file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<GalleryImage>('/gallery', { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
export function useUpdateGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, caption }: { id: number; caption: string | null }) =>
      apiFetch<GalleryImage>(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ caption }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
export function useDeleteGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/gallery/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
