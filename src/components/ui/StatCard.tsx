'use client';

type Tone = 'neutral' | 'good' | 'warn' | 'danger';

type StatCardProps = {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
};

const toneClass: Record<Tone, string> = {
  neutral: 'text-base-content',
  good: 'text-success',
  warn: 'text-warning',
  danger: 'text-error',
};

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps) {
  return (
    <div className="privacy-card rounded-xl bg-base-200 border border-base-300 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-base-content/60">{label}</div>
      <div className={`mt-2 text-2xl font-semibold leading-none ${toneClass[tone]}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs text-base-content/65">{hint}</div> : null}
    </div>
  );
}

