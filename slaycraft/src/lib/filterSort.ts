export interface ProjectSummary {
  status: string;
  author: string;
  biome: string;
  date: string;
  title: string;
}

export interface ProjectFilters {
  status?: string;
  author?: string;
  biome?: string;
}

export function matchesFilters(project: ProjectSummary, filters: ProjectFilters): boolean {
  if (filters.status && project.status !== filters.status) return false;
  if (filters.author && project.author !== filters.author) return false;
  if (filters.biome && project.biome !== filters.biome) return false;
  return true;
}

export type SortKey = "date-desc" | "date-asc" | "title-asc";

export function compareProjects(a: ProjectSummary, b: ProjectSummary, sortKey: SortKey): number {
  switch (sortKey) {
    case "date-asc":
      return a.date.localeCompare(b.date);
    case "title-asc":
      return a.title.localeCompare(b.title, "es");
    case "date-desc":
    default:
      return b.date.localeCompare(a.date);
  }
}
