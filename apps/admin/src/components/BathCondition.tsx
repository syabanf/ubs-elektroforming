import { type BatchSummary, fmtAgo, fmtClock, fmtNumber, rangeState, recordStatus } from '@ef/fixtures'
import type { Batch } from '@ef/types'
import { Badge, cn } from '@ef/ui'
import { Clock, Droplets, Thermometer, Zap } from 'lucide-react'
import { useNow } from '../lib/clock'

type Props = { batch: Batch; summary: BatchSummary; className?: string }

/** Badges in a narrow tile wrap instead of running past its edge. */
const WRAP = 'whitespace-normal text-left'

const range = (min: number | null, max: number | null, unit = '') =>
  `${min === null ? '…' : fmtNumber(min, 1)}–${max === null ? '…' : fmtNumber(max, 1)}${unit}`

/** The four numbers operators check on every round: pH, volt, temperature and when the bath was last logged. */
export function BathCondition({ batch, summary, className }: Props) {
  const now = useNow()
  const status = batch.status === 'running' ? recordStatus(summary.lastRecordedAt, now) : null
  const ph = rangeState(summary.latestPh, batch.phMin, batch.phMax)
  const temp = rangeState(summary.latestTempC, batch.tempMin, batch.tempMax)
  const next = summary.next

  return (
    <dl className={cn('gap-2 sm:grid-cols-4 grid grid-cols-2', className)}>
      <Tile icon={<Droplets />} label="pH" value={fmtNumber(summary.latestPh, 2)}>
        {ph === 'unset' ? (
          <span className="text-muted">
            {summary.latestPh === null ? 'Belum dicatat' : 'Batas belum diatur'}
          </span>
        ) : (
          <Badge className={WRAP} variant={ph === 'within' ? 'success' : 'warning'}>
            {ph === 'within' ? 'Aman' : `Di luar ${range(batch.phMin, batch.phMax)}`}
          </Badge>
        )}
      </Tile>
      <Tile icon={<Zap />} label="Volt" value={fmtNumber(summary.latestVolt, 2)} unit="V">
        <span className="text-muted">
          {next.directive === 'insufficient'
            ? 'Saran belum ada'
            : `Saran ${fmtNumber(next.suggestedVolt, 2)} V`}
        </span>
      </Tile>
      <Tile icon={<Thermometer />} label="Suhu" value={fmtNumber(summary.latestTempC, 1)} unit="°C">
        {temp === 'unset' ? (
          <span className="text-muted">
            {summary.latestTempC === null ? 'Belum dicatat' : 'Batas belum diatur'}
          </span>
        ) : (
          <Badge className={WRAP} variant={temp === 'within' ? 'success' : 'warning'}>
            {temp === 'within' ? 'Aman' : `Di luar ${range(batch.tempMin, batch.tempMax, ' °C')}`}
          </Badge>
        )}
      </Tile>
      <Tile
        icon={<Clock />}
        label="Terakhir dicatat"
        value={fmtClock(summary.lastRecordedAt, now.slice(0, 10))}
      >
        {status === null ? (
          <span className="text-muted">
            {summary.lastRecordedAt ? 'Batch tidak berjalan' : 'Belum ada jam catat'}
          </span>
        ) : status.state === 'ok' ? (
          <span className="text-muted">
            {fmtAgo(status.minutesAgo)} · catat lagi sebelum {fmtClock(status.lateAt, now.slice(0, 10))}
          </span>
        ) : (
          <Badge className={WRAP} variant={status.state === 'due' ? 'warning' : 'danger'} dot>
            {status.state === 'due'
              ? `Waktunya catat · ${fmtAgo(status.minutesAgo)}`
              : `Terlambat · ${fmtAgo(status.minutesAgo)}`}
          </Badge>
        )}
      </Tile>
    </dl>
  )
}

function Tile({
  icon,
  label,
  value,
  unit,
  children,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-2xl p-3 bg-surface-2">
      <dt className="gap-1.5 text-xs [&_svg]:size-3.5 flex items-center text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 gap-1 flex items-start">
        <span className="text-2xl font-bold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="pt-1 text-xs font-semibold text-muted">{unit}</span>}
      </dd>
      <dd className="mt-1 text-xs">{children}</dd>
    </div>
  )
}
