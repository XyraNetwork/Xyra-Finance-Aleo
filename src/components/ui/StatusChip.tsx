'use client';

type Variant = 'neutral' | 'good' | 'warn' | 'danger' | 'info';

type StatusChipProps = {
  label: string;
  variant?: Variant;
};

const variantClass: Record<Variant, string> = {
  neutral: 'border-base-300 text-base-content/80',
  good: 'border-success/45 text-success',
  warn: 'border-warning/45 text-warning',
  danger: 'border-error/45 text-error',
  info: 'border-info/45 text-info',
};

export function StatusChip({ label, variant = 'neutral' }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-base-100/70 px-2.5 py-1 text-[11px] font-medium tracking-wide ${variantClass[variant]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

