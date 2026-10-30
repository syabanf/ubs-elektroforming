import {
  SCADA_MACHINES,
  SCADA_PARAM,
  type ScadaParam,
  type ScadaSample,
  type ScadaUnit,
  fmtNumber,
} from '@ef/fixtures'
import { cn } from '@ef/ui'
import type { UnitState } from './shopfloor'

export const DIGITS: Record<Exclude<ScadaParam, 'running'>, number> = {
  tempC: 1,
  volt: 2,
  ampere: 2,
  ph: 2,
  amm: 1,
}

export const STATE_DOT: Record<UnitState, string> = {
  live: 'bg-success',
  stale: 'bg-warning',
  none: 'bg-muted',
}

/** `2026-10-30T14:32:05` → `14.32.05`. */
export const clockOf = (at: string) => at.slice(11).replaceAll(':', '.')

const withUnit = (p: Exclude<ScadaParam, 'running'>, sample: ScadaSample | undefined) =>
  [fmtNumber(sample?.[p] ?? null, DIGITS[p]), SCADA_PARAM[p].unit].filter(Boolean).join(' ')

/** A unit's newest values in a small card; `compact` puts them on one line for the 3D labels. */
export function UnitReadout({
  unit,
  sample,
  state,
  batchCode,
  compact,
  className,
}: {
  unit: ScadaUnit
  sample: ScadaSample | undefined
  state: UnitState
  batchCode?: string
  compact?: boolean
  className?: string
}) {
  const params = SCADA_MACHINES.find((m) => m.id === unit.machine)!.params.filter((p) => p !== 'running')
  return (
    <div className={cn('rounded-xl p-2 leading-tight bg-card text-[11px] shadow-card', className)}>
      <p className="gap-1.5 font-semibold text-xs flex items-center">
        <span className={cn('size-2 shrink-0 rounded-full', STATE_DOT[state])} />
        <span className="truncate">{unit.name}</span>
        {unit.machine === 'ef' && (
          <span className={cn('font-medium ml-auto', sample?.running ? 'text-success' : 'text-muted')}>
            {sample?.running ? 'Jalan' : 'Berhenti'}
          </span>
        )}
      </p>
      {batchCode && <p className="mt-0.5 font-mono text-muted">Batch {batchCode}</p>}
      {compact ? (
        <p className="mt-1 tabular-nums">
          {params
            .filter((p) => p !== 'amm')
            .map((p) => (p === 'ph' ? 'pH ' : '') + withUnit(p, sample))
            .join(' · ')}
        </p>
      ) : (
        <dl className="mt-1.5 gap-y-0.5 grid">
          {params.map((p) => (
            <div key={p} className="min-w-0 gap-1 flex items-baseline justify-between">
              <dt className="text-muted">{SCADA_PARAM[p].label}</dt>
              <dd className="font-semibold whitespace-nowrap tabular-nums">
                {fmtNumber(sample?.[p] ?? null, DIGITS[p])}
                {SCADA_PARAM[p].unit && (
                  <span className="ml-0.5 font-normal text-muted">{SCADA_PARAM[p].unit}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
