/** A number on an ink hero card, with its unit bottom-aligned beside it. */
export function HeroMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-on-ink-muted">{label}</p>
      <p className="mt-1 gap-1.5 flex items-end">
        <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="pb-0.5 text-xs font-semibold text-on-ink-muted">{unit}</span>}
      </p>
    </div>
  )
}
