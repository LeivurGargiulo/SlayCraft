import { matchesFilters, compareProjects, type SortKey } from "../lib/filterSort";

export function initProjectFilters(): void {
  const grid = document.querySelector<HTMLElement>("[data-project-grid]");
  const statusSelect = document.querySelector<HTMLSelectElement>("[data-filter-status]");
  const authorSelect = document.querySelector<HTMLSelectElement>("[data-filter-author]");
  const biomeSelect = document.querySelector<HTMLSelectElement>("[data-filter-biome]");
  const sortSelect = document.querySelector<HTMLSelectElement>("[data-sort]");
  if (!grid || !statusSelect || !authorSelect || !biomeSelect || !sortSelect) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-project-card]"));

  function toSummary(card: HTMLElement) {
    return {
      status: card.dataset.status ?? "",
      author: card.dataset.author ?? "",
      biome: card.dataset.biome ?? "",
      date: card.dataset.date ?? "",
      title: card.dataset.title ?? "",
    };
  }

  function apply() {
    const filters = {
      status: statusSelect!.value || undefined,
      author: authorSelect!.value || undefined,
      biome: biomeSelect!.value || undefined,
    };
    const sortKey = sortSelect!.value as SortKey;

    const visible = cards.filter((card) => matchesFilters(toSummary(card), filters));

    visible
      .sort((a, b) => compareProjects(toSummary(a), toSummary(b), sortKey))
      .forEach((card) => grid!.appendChild(card));

    cards.forEach((card) => {
      card.hidden = !visible.includes(card);
    });
  }

  for (const select of [statusSelect, authorSelect, biomeSelect, sortSelect]) {
    select.addEventListener("change", apply);
  }
}
