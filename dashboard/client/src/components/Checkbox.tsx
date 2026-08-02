export default function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
          checked ? 'border-gold bg-gold/30' : 'border-border bg-base'
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? 'translate-x-4 bg-gold' : 'translate-x-0 bg-slate-500'
          }`}
        />
      </button>
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}
