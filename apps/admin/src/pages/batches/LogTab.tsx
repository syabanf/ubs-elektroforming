import {
  type BatchCalc,
  MIN_REGRESSION_POINTS,
  type ReadingCalc,
  batchInsights,
  computeBatch,
  fmtNumber,
  fmtPercent,
  fmtSigned,
} from '@ef/fixtures'
import { type Batch, DIRECTIVE_LABEL } from '@ef/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LineChart,
  type LineChartProps,
  PillTabs,
  StatCard,
} from '@ef/ui'
import { Box, Gauge, Play, Plus, Scale, Timer, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AuBadge, DIRECTIVE_ICON, SampleBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { ProcessParams } from '../../components/ProcessParams'
import { InsightList } from '../../components/Insights'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'
import type { Pending } from './BatchDetailPage'
import { ReadingLog } from './ReadingLog'

type Props = { batch: Batch; calc: BatchCalc; startBlocker: string | null; open: (p: Pending) => void }

type ChartKey = 'micron' | 'au' | 'volt' | 'ph' | 'tempC'

type ChartSpec = {
  tab: string
  title: string
  note: string
  pick: (r: ReadingCalc) => number | null
  format: (v: number) => string
  zones?: LineChartProps['zones']
  referenceLines?: LineChartProps['referenceLines']
}

/** One spec per measure; a pH or temperature band shows only once its range is set. */
function chartSpecs(batch: Batch): Record<ChartKey, ChartSpec> {
  const band = (min: number | null, max: number | null): LineChartProps['zones'] =>
    min === null || max === null ? undefined : [{ from: min, to: max, tone: 'success' }]
  return {
    micron: {
      tab: 'Tebal',
      title: 'Tebal emas per pembacaan',
      note: `Garis: target ${fmtNumber(batch.targetMicron, 0)} µm.`,
      pick: (r) => r.micron,
      format: (v) => `${fmtNumber(v, 0)} µm`,
      referenceLines: [{ value: batch.targetMicron, label: 'Target', tone: 'muted' }],
    },
    au: {
      tab: 'Kadar',
      title: 'Kadar emas per pembacaan',
      note: `Pita hijau: batas aman ${fmtPercent(batch.refAuMin, 1)} sampai ${fmtPercent(batch.refAuMax, 1)}. Garis: titik tengah.`,
      pick: (r) => (r.reading.au === null ? null : r.reading.au * 100),
      format: (v) => `${fmtNumber(v, 1)} %`,
      zones: band(batch.refAuMin * 100, batch.refAuMax * 100),
      referenceLines: [{ value: batch.targetAu * 100, label: 'Tengah', tone: 'warning' }],
    },
    volt: {
      tab: 'Volt',
      title: 'Volt per pembacaan',
      note: 'Volt yang dipakai tiap interval.',
      pick: (r) => r.reading.volt,
      format: (v) => `${fmtNumber(v, 2)} V`,
    },
    ph: {
      tab: 'pH',
      title: 'pH larutan per pembacaan',
      note:
        batch.phMin !== null && batch.phMax !== null
          ? 'Pita hijau: batas aman pH.'
          : 'Atur batas pH di Pengaturan batch untuk melihat pita aman.',
      pick: (r) => r.reading.ph,
      format: (v) => fmtNumber(v, 2),
      zones: band(batch.phMin, batch.phMax),
    },
    tempC: {
      tab: 'Suhu',
      title: 'Suhu larutan per pembacaan',
      note:
        batch.tempMin !== null && batch.tempMax !== null
          ? 'Pita hijau: batas aman suhu.'
          : 'Atur batas suhu di Pengaturan batch untuk melihat pita aman.',
      pick: (r) => r.reading.tempC,
      format: (v) => `${fmtNumber(v, 1)} °C`,
      zones: band(batch.tempMin, batch.tempMax),
    },
  }
}

export function LogTab({ batch, calc, startBlocker, open }: Props) {
  const [chart, setChart] = useState<ChartKey>('micron')
  const { state } = useStore()
  const catalog = useCatalog()
  const insights = useMemo(() => {
    const history = state.batches.map((b) => ({ batch: b, calc: computeBatch(b, catalog) }))
    return batchInsights({ batch, calc }, history)
  }, [batch, calc, state.batches, catalog])
  const { summary, rows } = calc
  const running = batch.status === 'running'
  const firstAuRow = rows.find((r) => r.reading.au !== null)

  if (batch.status === 'preparing') {
    return (
      <Card>
        <EmptyState
          icon={<Play />}
          title="Proses belum dimulai"
          description={
            startBlocker ??
            'Rak sudah siap. Tekan Mulai proses, lalu catat volt, ampere dan meter tiap interval di sini.'
          }
          action={
            <Button disabled={!!startBlocker} onClick={() => open({ kind: 'start' })}>
              <Play />
              Mulai proses
            </Button>
          }
        />
      </Card>
    )
  }

  const next = summary.next

  const specs = chartSpecs(batch)
  const spec = specs[chart]
  const chartData = rows.map((r) => ({ label: String(r.reading.no), value: spec.pick(r) }))
  const hasChartData = chartData.some((d) => d.value !== null)

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 gap-2 flex flex-wrap items-center justify-between">
          <div>
            <h2 className="gap-2 text-base font-semibold flex items-center">
              Parameter proses
              {batch.conditionIsSample && <SampleBadge />}
            </h2>
            <p className="text-xs text-muted">Dari pencatatan terakhir. Catat setiap 1 sampai 2 jam.</p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link to={paths.monitorBath(batch.bathId)}>
                <Box />
                Lihat di Monitor 3D
              </Link>
            </Button>
            {running && (
              <Button size="sm" onClick={() => open({ kind: 'reading', reading: null })}>
                <Plus />
                Catat sekarang
              </Button>
            )}
          </div>
        </div>
        <ProcessParams batch={batch} summary={summary} />
      </Card>
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Apa kata data batch ini</CardTitle>
            <p className="mt-0.5 text-xs text-muted">Dibandingkan dengan batch yang sudah selesai.</p>
          </CardHeader>
          <CardContent>
            <InsightList insights={insights} />
          </CardContent>
        </Card>
      )}
      <div className="gap-4 lg:grid-cols-3 grid grid-cols-1">
        <Card variant="accent" className="p-5">
          <p className="font-semibold tracking-wider text-[11px] uppercase opacity-80">
            Saran volt berikutnya
          </p>
          <div className="mt-3 gap-2 flex items-end">
            <span className="text-5xl font-extrabold tracking-tight tabular-nums">
              {next.directive === 'insufficient' ? '–' : fmtNumber(next.suggestedVolt, 2)}
            </span>
            <span className="pb-1 text-sm font-semibold opacity-80">V</span>
          </div>
          <p className="mt-2 gap-1.5 text-sm font-semibold flex items-center">
            {DIRECTIVE_ICON[next.directive]}
            {DIRECTIVE_LABEL[next.directive]}
            {next.directive !== 'insufficient' && (
              <span className="font-normal opacity-80">
                · {fmtSigned(next.deltaVolt)} V dari {fmtNumber(summary.latestVolt, 2)} V
              </span>
            )}
          </p>
          <p className="mt-3 text-xs opacity-80">
            {next.n < MIN_REGRESSION_POINTS
              ? `Saran muncul setelah ${MIN_REGRESSION_POINTS} pembacaan berisi kadar X-ray. Sekarang baru ${next.n}.`
              : `Dihitung dari ${next.n} pembacaan, menuju kadar ${fmtPercent(batch.targetAu, 1)}.${
                  next.r2 !== null && next.r2 < 0.3
                    ? ' Hubungan volt dan kadar masih lemah, pastikan dengan X-ray berikutnya.'
                    : ''
                }`}
          </p>
        </Card>
        <div className="gap-3 sm:gap-4 lg:col-span-2 grid grid-cols-2">
          <StatCard
            label="Kadar layer pertama"
            value={firstAuRow ? fmtNumber(firstAuRow.reading.au! * 100, 2) : '–'}
            unit="%"
            icon={<Gauge />}
            hint={
              firstAuRow ? (
                <span className="gap-1.5 flex flex-wrap items-center">
                  <AuBadge au={firstAuRow.reading.au} batch={batch} />
                  Pembacaan ke-{firstAuRow.reading.no}
                </span>
              ) : (
                'Belum ada X-ray'
              )
            }
          />
          <StatCard
            label="Kadar layer terakhir"
            value={summary.latestAu === null ? '–' : fmtNumber(summary.latestAu * 100, 2)}
            unit="%"
            icon={<Gauge />}
            hint={<AuBadge au={summary.latestAu} batch={batch} />}
          />
          <StatCard
            label="Kadar rata-rata"
            value={summary.avgAu === null ? '–' : fmtNumber(summary.avgAu * 100, 2)}
            unit="%"
            icon={<Scale />}
            hint="Dari seluruh arus yang lewat"
          />
          <StatCard
            label="Efisiensi katoda"
            value={fmtNumber(summary.cathodeEfficiency, 1)}
            unit="%"
            icon={<Zap />}
            hint={
              summary.theoreticalAmm === null
                ? 'Isi rak supaya AMM teori diketahui'
                : running
                  ? 'Naik terus sampai batch selesai'
                  : 'AMM teori ÷ meter AMM'
            }
          />
          <StatCard
            className="col-span-2"
            label="Perkiraan emas menempel"
            value={fmtNumber(summary.totalWeightG, 1)}
            unit="g"
            icon={<Timer />}
            hint={`Dari ${fmtNumber(summary.totalAmm, 0)} ampere-menit`}
          />
        </div>
      </div>

      <Card>
        <CardHeader
          action={
            <PillTabs
              size="sm"
              items={(Object.keys(specs) as ChartKey[]).map((k) => ({ value: k, label: specs[k].tab }))}
              value={chart}
              onValueChange={(v) => setChart(v as ChartKey)}
            />
          }
        >
          <CardTitle>{spec.title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">{spec.note}</p>
        </CardHeader>
        <CardContent>
          {!hasChartData ? (
            <EmptyState
              compact
              title="Belum ada data"
              description={`Grafik muncul setelah ${spec.tab === 'Tebal' ? 'tebal plat' : spec.tab} dicatat.`}
            />
          ) : (
            <LineChart
              key={chart}
              ariaLabel={spec.title}
              data={chartData}
              height={220}
              showDots
              tone={chart === 'micron' ? 'ink' : 'info'}
              area={chart === 'micron'}
              format={spec.format}
              referenceLines={spec.referenceLines}
              zones={spec.zones}
            />
          )}
        </CardContent>
      </Card>

      <ReadingLog batch={batch} calc={calc} open={open} />
    </div>
  )
}
