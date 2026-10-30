import {
  SCADA_MACHINES,
  SCADA_PARAM,
  type ScadaParam,
  type ScadaSample,
  type ScadaUnit,
  fmtNumber,
  scadaUnits,
} from '@ef/fixtures'
import { Badge, Banner, Card, CardContent, CardHeader, CardTitle, PageHeader, PillTabs, cn } from '@ef/ui'
import { Suspense, lazy, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths } from '../../components/links'
import { useScada } from '../../state/scada'
import { useStore } from '../../state/store'
import { DIGITS, clockOf } from './readout'
import { Shopfloor2D } from './Shopfloor2D'
import { shopfloorLayout, unitState } from './shopfloor'

const Shopfloor3D = lazy(() => import('./Shopfloor3D'))

const COLS: Record<number, string> = { 4: 'sm:grid-cols-4', 6: 'sm:grid-cols-3 lg:grid-cols-6' }

const VIEWS = [
  { value: '2d', label: 'Shopfloor 2D' },
  { value: '3d', label: 'Shopfloor 3D' },
  { value: 'data', label: 'Data' },
]

export function ScadaPage() {
  const { state } = useStore()
  const { mode, connected, samples } = useScada()
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some((v) => v.value === params.get('tampilan')) ? params.get('tampilan')! : '2d'
  const units = useMemo(() => scadaUnits(state.baths), [state.baths])
  const floor = useMemo(() => shopfloorLayout(units), [units])
  const running = state.batches.filter((b) => b.status === 'running')
  const batchOf = (unit: ScadaUnit) => running.find((b) => b.bathId === unit.bathId)
  const batchCodes = Object.fromEntries(
    units.flatMap((u) => {
      const batch = batchOf(u)
      return batch ? [[u.id, batch.code]] : []
    }),
  )
  const pcLabel = mode === 'simulasi' ? 'simulasi' : connected ? 'terhubung' : 'terputus'
  const floorProps = { floor, samples, batchCodes, online: connected, pcLabel }

  return (
    <div className="space-y-4">
      <PageHeader
        title="SCADA"
        description="Data serial dari mesin EF dan mesin tembaga asam & basa. Tiap mesin punya modul SCADA, lalu satu mini PC mengumpulkan semuanya untuk departemen Electroforming."
        actions={
          <>
            {mode === 'simulasi' ? (
              <Badge variant="warning">Simulasi · modul belum terpasang</Badge>
            ) : (
              <Badge variant={connected ? 'success' : 'danger'} dot>
                {connected ? 'Terhubung ke mini PC' : 'Terputus dari mini PC'}
              </Badge>
            )}
            <PillTabs
              items={VIEWS}
              value={view}
              onValueChange={(v) => setParams((p) => (p.set('tampilan', v), p), { replace: true })}
            />
          </>
        }
      />
      {mode === 'simulasi' && (
        <Banner tone="info" title="Angka di halaman ini simulasi">
          Bak yang sedang berjalan bergerak di sekitar catatan terakhirnya, tangki tembaga memakai angka
          contoh. Setelah modul terpasang, isi alamat stream mini PC di VITE_SCADA_URL dan angka asli
          menggantikan simulasi.
        </Banner>
      )}
      {view === 'data' ? (
        SCADA_MACHINES.map((machine) => (
          <Card key={machine.id}>
            <CardHeader>
              <CardTitle>{machine.name}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Parameter serial: {machine.params.map((p) => SCADA_PARAM[p].label).join(', ')}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {units
                .filter((u) => u.machine === machine.id)
                .map((unit) => (
                  <UnitRow
                    key={unit.id}
                    unit={unit}
                    params={machine.params}
                    sample={samples[unit.id]}
                    batch={batchOf(unit)}
                  />
                ))}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card className="p-4">
          {view === '2d' ? (
            <Shopfloor2D {...floorProps} />
          ) : (
            <Suspense fallback={<div className="rounded-2xl h-[560px] bg-ink" />}>
              <Shopfloor3D {...floorProps} />
            </Suspense>
          )}
        </Card>
      )}
    </div>
  )
}

function UnitRow({
  unit,
  params,
  sample,
  batch,
}: {
  unit: ScadaUnit
  params: ScadaParam[]
  sample?: ScadaSample
  batch?: { id: string; code: string }
}) {
  const stale = unitState(sample, new Date()) !== 'live'
  return (
    <section>
      <div className="mb-2 gap-2 text-sm flex flex-wrap items-center justify-between">
        <h2 className="gap-2 font-semibold flex items-center">
          {unit.name}
          {batch && (
            <Link
              to={paths.batch(batch.id, 'log')}
              className="text-xs font-mono text-muted hover:text-accent"
            >
              Batch {batch.code}
            </Link>
          )}
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {!sample
            ? 'Belum ada data'
            : stale
              ? `Data lama, jam ${clockOf(sample.at)}`
              : `Diperbarui ${clockOf(sample.at)}`}
        </span>
      </div>
      <dl className={cn('gap-2 grid grid-cols-2', COLS[params.length])}>
        {params.map((p) => (
          <div key={p} className={cn('min-w-0 rounded-2xl p-3 bg-surface-2', stale && 'opacity-60')}>
            <dt className="text-xs text-muted">{SCADA_PARAM[p].label}</dt>
            <dd className="mt-1 gap-1 flex items-start">
              {p === 'running' ? (
                <Badge variant={sample?.running ? 'success' : 'muted'} dot>
                  {sample?.running === null || !sample ? '–' : sample.running ? 'Jalan' : 'Berhenti'}
                </Badge>
              ) : (
                <>
                  <span className="text-2xl font-bold tracking-tight tabular-nums">
                    {fmtNumber(sample?.[p] ?? null, DIGITS[p])}
                  </span>
                  <span className="pt-1 text-xs font-semibold text-muted">{SCADA_PARAM[p].unit}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
