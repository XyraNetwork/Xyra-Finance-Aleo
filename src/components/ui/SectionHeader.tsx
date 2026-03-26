'use client';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  badge,
  rightSlot,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`privacy-card rounded-xl bg-base-200 border border-base-300 p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-base-content">{title}</h2>
            {badge ? <span className="badge badge-sm badge-outline">{badge}</span> : null}
          </div>
          {subtitle ? <p className="text-sm text-base-content/70">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
    </div>
  );
}

