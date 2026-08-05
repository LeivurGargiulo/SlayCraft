import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAlerts, useDismissAlert, useFarms } from '../api/hooks';
import { useDropdown } from './useDropdown';

export default function AlertBell() {
  const alerts = useAlerts();
  const farms = useFarms();
  const dismissAlert = useDismissAlert();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>(buttonRef);

  const active = alerts.data?.alerts ?? [];
  const farmName = (farmId: string) => farms.data?.farms.find((f) => f.id === farmId)?.name ?? farmId;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded p-2 text-slate-300 hover:bg-base hover:text-gold"
        aria-label="Alertas"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-1.7 1.7a1 1 0 0 0 .7 1.71h16a1 1 0 0 0 .7-1.71L19 16Z" />
        </svg>
        {active.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-blocked px-1 text-[10px] font-bold text-white">
            {active.length}
          </span>
        )}
      </button>
      {open && (
        <div ref={ref} className="absolute left-0 z-40 mt-2 w-80 rounded-lg border border-border bg-panel p-2 shadow-lg">
          {active.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">Sin alertas activas.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {active.map((a) => (
                <li key={a.id} className="rounded p-2 hover:bg-base">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/granjas/${a.farmId}`} className="block truncate text-sm font-medium text-cyan hover:underline">
                        {farmName(a.farmId)}
                      </Link>
                      <p className="text-xs text-slate-400">{a.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissAlert.mutate(a.id)}
                      className="shrink-0 text-xs text-slate-500 hover:text-status-blocked"
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
