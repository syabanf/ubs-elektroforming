import {
  SCADA_MACHINES,
  SCADA_PARAM,
  SCADA_STALE_SEC,
  type ScadaParam,
  type ScadaSample,
  type ScadaUnit,
  fmtNumber,
  sampleAgeSec,
  scadaUnits,
} from '@ef/fixtures'
import { Badge, Banner, Card, CardContent, CardHeader, CardTitle, PageHeader, cn } from '@ef/ui'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { useScada } from '../../state/scada'
import { useStore } from '../../state/store'

const DIGITS: Record<Exclude<ScadaParam, 'running'>, number> = { tempC: 1, volt: 2, ampere: 2, ph: 2, amm: 1 }

const COLS: Record<number, string> = { 4: 'sm:grid-cols-4', 6: 'sm:grid-cols-3 lg:grid-cols-6' }

export function ScadaPage() {
  const { state } = useStore()
  const { mode, connected, samples } = useScada()
  const units = scadaUnits(state.baths)

  return (
    <div className="space-y-4">
      <PageHeader
        title="SCADA"
        description="Data serial dari mesin EF dan mesin tembaga asam & basa. Tiap mesin punya modul SCADA, lalu satu mini PC mengumpulkan semuanya untuk departemen Electroforming."
        actions={
          mode === 'simulasi' ? (
            <Badge variant="warning">Simulasi · modul belum terpasang</Badge>
          ) : (
            <Badge variant={connected ? 'success' : 'danger'} dot>
              {connected ? 'Terhubung ke mini PC' : 'Terputus dari mini PC'}
            </Badge>
          )
        }
      />
      {mode === 'simulasi' && (
        <Banner tone="info" title="Angka di halaman ini simulasi">
          Bak yang sedang berjalan bergerak di sekitar catatan terakhirnya, tangki tembaga memakai angka
          contoh. Setelah modul terpasang, isi alamat stream mini PC di VITE_SCADA_URL dan angka asli
          menggantikan simulasi.
        </Banner>
      )}
      {SCADA_MACHINES.map((machine) => (
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
                <UnitRow key={unit.id} unit={unit} params={machine.params} sample={samples[unit.id]} />
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function UnitRow({ unit, params, sample }: { unit: ScadaUnit; params: ScadaParam[]; sample?: ScadaSample }) {
  const { state } = useStore()
  const batch = unit.bathId
    ? state.batches.find((b) => b.bathId === unit.bathId && b.status === 'running')
    : undefined
  const stale = sample ? sampleAgeSec(sample, new Date()) > SCADA_STALE_SEC : true
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
              ? `Data lama, jam ${clock(sample.at)}`
              : `Diperbarui ${clock(sample.at)}`}
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

/** `2026-10-30T14:32:05` → `14.32.05`. */
const clock = (at: string) => at.slice(11).replaceAll(':', '.')
