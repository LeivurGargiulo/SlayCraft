let globalCloseWired = false;

function closeAll(except) {
  document.querySelectorAll('[data-custom-select]').forEach((wrapper) => {
    if (wrapper === except) return;
    wrapper.querySelector('[data-select-list]')?.classList.add('hidden');
    wrapper.querySelector('[data-select-trigger]')?.setAttribute('aria-expanded', 'false');
  });
}

export function initCustomSelects(root = document) {
  if (!globalCloseWired) {
    globalCloseWired = true;
    document.addEventListener('click', (e) => {
      const wrapper = e.target.closest('[data-custom-select]');
      if (!wrapper) closeAll();
    });
  }

  root.querySelectorAll('[data-custom-select]').forEach((wrapper) => {
    const select = wrapper.querySelector('select');
    const trigger = wrapper.querySelector('[data-select-trigger]');
    const label = wrapper.querySelector('[data-select-label]');
    const list = wrapper.querySelector('[data-select-list]');
    const options = [...list.querySelectorAll('[role="option"]')];

    function selectOption(option) {
      select.value = option.dataset.value;
      label.textContent = option.textContent;
      options.forEach((o) => o.setAttribute('aria-selected', String(o === option)));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      list.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }

    trigger.addEventListener('click', () => {
      const willOpen = list.classList.contains('hidden');
      closeAll(wrapper);
      list.classList.toggle('hidden', !willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) (options.find((o) => o.dataset.value === select.value) ?? options[0])?.focus();
    });

    options.forEach((option, i) => {
      option.addEventListener('click', () => selectOption(option));
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectOption(option);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          (options[i + 1] ?? options[0]).focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          (options[i - 1] ?? options[options.length - 1]).focus();
        } else if (e.key === 'Escape') {
          list.classList.add('hidden');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });
    });
  });
}
