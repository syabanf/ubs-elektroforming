import {
  type BatchSummary,
  fmtAgo,
  fmtClock,
  fmtDate,
  fmtHours,
  fmtNumber,
  minutesBetween,
  processHours,
  rangeState,
  recordStatus,
} from '@ef/fixtures'
import type { Batch } from '@ef/types'
import { Badge, ProgressBar, cn } from '@ef/ui'
import {
  Clock,
  Droplets,
  FlagTriangleRight,
  FlaskConical,
  Gauge,
  Layers,
  Ruler,
  Scale,
  Thermometer,
  Timer,
  Zap,
} from 'lucide-react'
import { useNow } from '../lib/clock'
import { AuBadge } from './badges'

type Props = { batch: Batch; summary: BatchSummary; className?: string }

const AREA_NOTE: Record<BatchSummary['areaSource'], string> = {
  rack: 'Jumlah luas rak',
  typed: 'Diketik, rak belum diisi',
  none: 'Isi rak di tab Siapkan',
}

/** Badges in a narrow tile wrap instead of running past its edge. */
const WRAP = 'whitespace-normal text-left'

const range = (min: number | null, max: number | null, unit = '') =>
  `${min === null ? '…' : fmtNumber(min, 1)}–${max === null ? '…' : fmtNumber(max, 1)}${unit}`

/** The four numbers operators check on every round: pH, volt, temperature and when the bath was last logged. */
export function BathCondition({ batch, summary, className }: Props) {
  const now = useNow()
  return (
    <dl className={cn('gap-2 sm:grid-cols-4 grid grid-cols-2', className)}>
      <PhTile batch={batch} summary={summary} />
      <Tile icon={<Zap />} label="Volt" value={<Num value={fmtNumber(summary.latestVolt, 2)} unit="V" />}>
        <VoltAdvice summary={summary} />
      </Tile>
      <TempTile batch={batch} summary={summary} />
      <LastLogTile batch={batch} summary={summary} now={now} />
    </dl>
  )
}

/** The process parameters of a run, in the order the plant reads them, plus when the bath was last logged. */
export function ProcessParams({ batch, summary, className }: Props) {
  const now = useNow()
  const running = batch.status === 'running'
  const { chem } = batch.prep
  const labEnd = chem.auEnd !== null
  const lab = labEnd
    ? { au: chem.auEnd, cu: chem.cuEnd, kcn: chem.kcnEnd, at: chem.endAt }
    : { au: chem.auStart, cu: chem.cuStart, kcn: chem.kcnStart, at: chem.startAt }

  return (
    <dl className={cn('gap-2 sm:grid-cols-3 lg:grid-cols-4 grid grid-cols-2', className)}>
      <Tile
        icon={<Scale />}
        label="Kadar rata-rata teori"
        value={<Num value={summary.avgAu === null ? '–' : fmtNumber(summary.avgAu * 100, 2)} unit="%" />}
      >
        <span className="gap-1.5 flex flex-wrap items-center">
          <AuBadge au={summary.avgAu} batch={batch} />
          <span className="text-muted">
            Acuan {fmtNumber(batch.refAuMin * 100, 1)}–{fmtNumber(batch.refAuMax * 100, 1)} %
          </span>
        </span>
      </Tile>
      <Tile
        icon={<Gauge />}
        label="Kecepatan"
        value={<Num value={fmtNumber(summary.micronRate, 2)} unit="µm/jam" />}
      >
        <span className="text-muted">
          {summary.micronRate === null ? 'Menunggu tebal plat' : 'Rata-rata sejak mulai'}
        </span>
      </Tile>
      <TempTile batch={batch} summary={summary} />
      <PhTile batch={batch} summary={summary} />
      <Tile
        icon={<Timer />}
        label="Lama proses"
        value={<Num value={fmtHours(processHours(summary, running, now))} />}
      >
        <span className="text-muted">Mulai {fmtDate(batch.startDate)}</span>
      </Tile>
      <FinishTile batch={batch} summary={summary} now={now} />
      <Tile
        icon={<Layers />}
        label="Ketebalan saat ini"
        value={<Num value={fmtNumber(summary.micron, 1)} unit="µm" />}
      >
        <ProgressBar
          value={Math.min(1, summary.progress)}
          tone="info"
          size="sm"
          aria-label={`Tebal ${batch.code}`}
        />
        <span className="mt-1 block text-muted">
          Target {fmtNumber(batch.targetMicron, 0)} µm · {fmtNumber(summary.progress * 100, 0)} %
        </span>
      </Tile>
      <Tile
        icon={<Ruler />}
        label="Luas permukaan"
        value={<Num value={fmtNumber(summary.areaDm2, 2)} unit="dm²" />}
      >
        <span className="text-muted">{AREA_NOTE[summary.areaSource]}</span>
      </Tile>
      <Tile
        icon={<FlaskConical />}
        label="Komposisi bak"
        className="lg:col-span-2"
        value={
          <span className="gap-x-3 gap-y-1 flex flex-wrap">
            <Num label="Au" value={fmtNumber(lab.au, 1)} small />
            <Num label="Cu" value={fmtNumber(lab.cu, 1)} small />
            <Num label="KCN" value={fmtNumber(lab.kcn, 1)} small />
          </span>
        }
      >
        <span className="text-muted">
          {lab.au === null
            ? 'Belum ada hasil lab'
            : `g/L · lab ${labEnd ? 'akhir' : 'awal'} · ${
                lab.at ? `diuji ${fmtClock(lab.at, now.slice(0, 10))}` : 'jam uji belum diisi'
              }`}
        </span>
      </Tile>
      <Tile
        icon={<Zap />}
        label="Volt dan ampere"
        value={
          <span className="gap-x-3 flex flex-wrap">
            <Num value={fmtNumber(summary.latestVolt, 2)} unit="V" />
            <Num value={fmtNumber(summary.latestAmpere, 1)} unit="A" />
          </span>
        }
      >
        <VoltAdvice summary={summary} />
      </Tile>
      <LastLogTile batch={batch} summary={summary} now={now} />
    </dl>
  )
}

function FinishTile({ batch, summary, now }: { batch: Batch; summary: BatchSummary; now: string }) {
  const finishIn = summary.finishAt ? minutesBetween(now, summary.finishAt) : null
  let value = fmtHours(summary.remainingHours)
  let note: React.ReactNode = summary.remainingHours === null ? 'Menunggu kecepatan' : 'Sisa waktu'
  if (batch.status === 'preparing') {
    value = '–'
    note = 'Batch belum mulai'
  } else if (batch.status === 'completed') {
    value = 'Selesai'
    note = 'Batch sudah ditutup'
  } else if (summary.micron !== null && summary.micron >= batch.targetMicron) {
    value = 'Tercapai'
    note = 'Ukur ulang, lalu selesaikan'
  } else if (summary.finishAt && finishIn !== null) {
    value = fmtClock(summary.finishAt, now.slice(0, 10))
    note =
      finishIn < 0 ? (
        <Badge className={WRAP} variant="warning">
          Lewat {fmtHours(-finishIn / 60)}
        </Badge>
      ) : (
        `${fmtHours(finishIn / 60)} lagi`
      )
  }
  return (
    <Tile icon={<FlagTriangleRight />} label="Estimasi selesai" value={<Num value={value} />}>
      {typeof note === 'string' ? <span className="text-muted">{note}</span> : note}
    </Tile>
  )
}

function PhTile({ batch, summary }: { batch: Batch; summary: BatchSummary }) {
  const ph = rangeState(summary.latestPh, batch.phMin, batch.phMax)
  return (
    <Tile icon={<Droplets />} label="pH" value={<Num value={fmtNumber(summary.latestPh, 2)} />}>
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
  )
}

function TempTile({ batch, summary }: { batch: Batch; summary: BatchSummary }) {
  const temp = rangeState(summary.latestTempC, batch.tempMin, batch.tempMax)
  return (
    <Tile
      icon={<Thermometer />}
      label="Suhu"
      value={<Num value={fmtNumber(summary.latestTempC, 1)} unit="°C" />}
    >
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
  )
}

function VoltAdvice({ summary }: { summary: BatchSummary }) {
  const next = summary.next
  return (
    <span className="text-muted">
      {next.directive === 'insufficient' ? 'Saran belum ada' : `Saran ${fmtNumber(next.suggestedVolt, 2)} V`}
    </span>
  )
}

function LastLogTile({ batch, summary, now }: { batch: Batch; summary: BatchSummary; now: string }) {
  const status = batch.status === 'running' ? recordStatus(summary.lastRecordedAt, now) : null
  const today = now.slice(0, 10)
  return (
    <Tile
      icon={<Clock />}
      label="Terakhir dicatat"
      value={<Num value={fmtClock(summary.lastRecordedAt, today)} />}
    >
      {status === null ? (
        <span className="text-muted">
          {summary.lastRecordedAt ? 'Batch tidak berjalan' : 'Belum ada jam catat'}
        </span>
      ) : status.state === 'ok' ? (
        <span className="text-muted">
          {fmtAgo(status.minutesAgo)} · catat lagi sebelum {fmtClock(status.lateAt, today)}
        </span>
      ) : (
        <Badge className={WRAP} variant={status.state === 'due' ? 'warning' : 'danger'} dot>
          {status.state === 'due'
            ? `Waktunya catat · ${fmtAgo(status.minutesAgo)}`
            : `Terlambat · ${fmtAgo(status.minutesAgo)}`}
        </Badge>
      )}
    </Tile>
  )
}

/** A tile number with its unit; `small` fits three numbers in one tile, `label` names each of them. */
function Num({
  value,
  unit,
  label,
  small,
}: {
  value: string
  unit?: string
  label?: string
  small?: boolean
}) {
  return (
    <span className="gap-1 inline-flex items-start">
      {label && <span className="pt-1 text-xs font-semibold text-muted">{label}</span>}
      <span className={cn('font-bold tracking-tight tabular-nums', small ? 'text-lg' : 'text-2xl')}>
        {value}
      </span>
      {unit && <span className="pt-1 text-xs font-semibold text-muted">{unit}</span>}
    </span>
  )
}

function Tile({
  icon,
  label,
  value,
  className,
  children,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 rounded-2xl p-3 bg-surface-2', className)}>
      <dt className="gap-1.5 text-xs [&_svg]:size-3.5 flex items-center text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
      <dd className="mt-1 text-xs">{children}</dd>
    </div>
  )
}
