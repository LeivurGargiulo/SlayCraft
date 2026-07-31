import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDropdown } from './useDropdown';
import type { SelectOption } from './Select';

export default function MultiSelect<T extends string | number>({
  values,
  onChange,
  options,
  className = '',
  placeholder = 'Seleccionar…',
  searchable = true,
}: {
  values: T[];
  onChange: (values: T[]) => void;
  options: SelectOption<T>[];
  className?: string;
  placeholder?: string;
  searchable?: boolean;
}) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function toggle(v: T) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }

  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded border border-border bg-base px-2 py-1 text-left text-sm text-slate-200 hover:border-gold/50"
      >
        <span className="truncate">{selectedLabels.length ? selectedLabels.join(', ') : placeholder}</span>
        <span className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-20 mt-1 max-h-72 w-full min-w-max overflow-hidden rounded border border-border bg-panel shadow-lg"
          >
            {searchable && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full border-b border-border bg-base px-3 py-1.5 text-sm text-slate-200 outline-none"
              />
            )}
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.map((o) => (
                <li key={o.value}>
                  <label className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-base">
                    <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} />
                    {o.label}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-1.5 text-sm text-slate-500">Sin resultados</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
