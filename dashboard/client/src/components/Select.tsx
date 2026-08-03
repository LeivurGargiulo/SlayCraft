import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDropdown } from './useDropdown';

export type SelectOption<T extends string | number> = { value: T; label: string };

export default function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = '',
  searchable = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  searchable?: boolean;
}) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded border border-border bg-base px-2 py-1 text-left text-sm text-slate-200 hover:border-gold/50"
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <span className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{ maxWidth: 'calc(100vw - 16px)' }}
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
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-base ${
                      o.value === value ? 'text-gold' : 'text-slate-200'
                    }`}
                  >
                    {o.label}
                  </button>
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
