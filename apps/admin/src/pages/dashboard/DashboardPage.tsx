import { type BatchCalc, computeBatch, fmtNumber, plantInsights } from '@ef/fixtures'
import { type Bath, type Batch, MODEL_MATERIAL_LABEL } from '@ef/types'
import { Button, Card, CardContent, CardHeader, CardTitle, ColumnChart, EmptyState } from '@ef/ui'
import { ArrowRight, ClipboardList, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { DirectiveBadge, SampleBadge } from '../../components/badges'
import { ProcessParams } from '../../components/ProcessParams'
import { useCreateBatch } from '../../components/create'
import { InsightList } from '../../components/Insights'
import { paths } from '../../components/links'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'

type Entry = { batch: Batch; calc: BatchCalc }

export function DashboardPage() {
  const { state } = useStore()
  const catalog = useCatalog()
  const createBatch = useCreateBatch()
  const entries = useMemo(
    () => state.batches.map((batch) => ({ batch, calc: computeBatch(batch, catalog) })),
    [state.batches, catalog],
  )
  const running = entries.filter((e) => e.batch.status === 'running')
  const preparing = entries.filter((e) => e.batch.status === 'preparing')
  const finished = entries
    .filter((e) => e.batch.status === 'completed')
    .sort((a, b) => a.batch.startDate.localeCompare(b.batch.startDate))
  const withEff = finished.filter((e) => e.calc.summary.cathodeEfficiency !== null)

  const insights = useMemo(() => plantInsights(entries, state.baths), [entries, state.baths])
  const sampleCondition = state.batches.some((b) => b.conditionIsSample)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Beranda</h1>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1 items-start">
        {state.baths.map((bath) => (
          <BathCard
            key={bath.id}
            bath={bath}
            current={running.find((e) => e.batch.bathId === bath.id)}
            next={preparing.filter((e) => e.batch.bathId === bath.id)}
            onCreate={createBatch}
          />
        ))}
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Apa kata data</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Pola dari semua batch. Kuning perlu dicek, hijau sudah baik.
              {sampleCondition && ' pH, suhu dan jam catat masih data contoh.'}
            </p>
          </CardHeader>
          <CardContent>
            <InsightList insights={insights} />
          </CardContent>
        </Card>
      )}

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Efisiensi katoda tiap batch</CardTitle>
            <p className="mt-0.5 text-xs text-muted">Batch selesai, urut tanggal. Kolom terakhir disorot.</p>
          </CardHeader>
          <CardContent>
            {withEff.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada data"
                description="Efisiensi muncul setelah batch selesai dan meter AMM terisi."
              />
            ) : (
              <ColumnChart
                ariaLabel="Efisiensi katoda tiap batch"
                height={220}
                format={(v) => `${fmtNumber(v, 1)} %`}
                data={withEff.map((e, i) => ({
                  label: e.batch.code,
                  value: e.calc.summary.cathodeEfficiency!,
                  highlight: i === withEff.length - 1,
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kecepatan tebal tiap batch</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Mikron per jam, batch dengan catatan pembacaan. Yang disorot masih berjalan.
            </p>
          </CardHeader>
          <CardContent>
            <ColumnChart
              ariaLabel="Kecepatan tebal tiap batch"
              height={220}
              format={(v) => `${fmtNumber(v, 2)} µm/j`}
              data={[...finished, ...running]
                .filter((e) => e.calc.summary.micronRate !== null)
                .map((e) => ({
                  label: e.batch.code,
                  value: e.calc.summary.micronRate!,
                  highlight: e.batch.status === 'running',
                }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function BathCard({
  bath,
  current,
  next,
  onCreate,
}: {
  bath: Bath
  current: Entry | undefined
  next: Entry[]
  onCreate: () => void
}) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="gap-3 flex items-center justify-between">
        <h2 className="gap-2 text-base font-semibold flex items-center">
          {bath.name}
          {current?.batch.conditionIsSample && <SampleBadge />}
        </h2>
        {current && <DirectiveBadge directive={current.calc.summary.next.directive} />}
      </div>
      {current ? (
        <RunningBody entry={current} />
      ) : (
        <p className="mt-1 text-sm text-muted">Bak kosong, siap untuk batch berikutnya.</p>
      )}

      {next.map(({ batch, calc }) => (
        <div
          key={batch.id}
          className="mt-3 gap-3 rounded-2xl p-3 text-sm flex flex-wrap items-center justify-between bg-surface-2"
        >
          <span className="min-w-0">
            <span className="gap-1.5 font-semibold flex items-center">
              <ClipboardList className="size-4 text-muted" />
              Berikutnya <span className="font-mono">{batch.code}</span>
            </span>
            <span className="text-xs text-muted">
              Persiapan ·{' '}
              {calc.prep.pieces ? `${fmtNumber(calc.prep.pieces, 0)} barang di rak` : 'rak masih kosong'}
            </span>
          </span>
          <Button asChild variant="outline" size="sm">
            <Link to={paths.batch(batch.id, 'prep')}>Lanjut persiapan</Link>
          </Button>
        </div>
      ))}

      <div className="pt-4 mt-auto">
        {current ? (
          <div className="gap-2 grid grid-cols-2">
            <Button asChild variant="soft">
              <Link to={paths.batch(current.batch.id, 'log')}>
                Buka batch
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild>
              <Link to={`${paths.batch(current.batch.id, 'log')}&catat=1`}>
                <Plus />
                Catat pembacaan
              </Link>
            </Button>
          </div>
        ) : (
          next.length === 0 && (
            <Button variant="outline" className="w-full" onClick={onCreate}>
              <Plus />
              Mulai batch baru
            </Button>
          )
        )}
      </div>
    </Card>
  )
}

function RunningBody({ entry: { batch, calc } }: { entry: Entry }) {
  return (
    <>
      <p className="mt-1 text-xs text-muted">
        Batch <span className="font-semibold font-mono text-foreground">{batch.code}</span>
        {batch.modelMaterial && ` · model ${MODEL_MATERIAL_LABEL[batch.modelMaterial].toLowerCase()}`}
      </p>
      <div className="mt-4">
        <ProcessParams batch={batch} summary={calc.summary} compact />
      </div>
    </>
  )
}
