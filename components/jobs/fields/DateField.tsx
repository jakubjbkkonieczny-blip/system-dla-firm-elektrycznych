import { useId } from "react";

export function DateField({
  label,
  value,
  onChange,
  disabled,
  required,
  min,
  max,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  describedBy?: string;
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        type="date"
        className="min-h-[44px] w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        aria-describedby={describedBy}
      />
    </div>
  );
}
