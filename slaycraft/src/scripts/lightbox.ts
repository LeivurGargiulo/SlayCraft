import { nextIndex } from "../lib/gallery";

export function initLightbox(): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lightbox]");
  const items = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gallery-item]"));
  const image = dialog?.querySelector<HTMLImageElement>("[data-lightbox-image]");
  const caption = dialog?.querySelector<HTMLElement>("[data-lightbox-caption]");
  const closeButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-close]");
  const prevButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-prev]");
  const nextButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-next]");
  if (!dialog || !image || !caption || !closeButton || !prevButton || !nextButton || items.length === 0) return;

  let current = 0;

  function show(index: number) {
    current = index;
    const item = items[current];
    image!.src = item.dataset.fullSrc ?? "";
    image!.alt = item.dataset.caption ?? "";
    caption!.textContent = item.dataset.caption ?? "";
  }

  items.forEach((item, index) => {
    item.addEventListener("click", () => {
      show(index);
      dialog.showModal();
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  prevButton.addEventListener("click", () => show(nextIndex(current, items.length, -1)));
  nextButton.addEventListener("click", () => show(nextIndex(current, items.length, 1)));

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(nextIndex(current, items.length, -1));
    if (event.key === "ArrowRight") show(nextIndex(current, items.length, 1));
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
