import { type BatchCalc, fmtHours, fmtNumber } from '@ef/fixtures'
import type { Batch } from '@ef/types'
import { Banner, Button, Card, CardContent, CardHeader, CardTitle, KeyValue, StatCard } from '@ef/ui'
import { Coins, Gauge, Ruler, Zap } from 'lucide-react'
import type { Pending } from './BatchDetailPage'

type Props = { batch: Batch; calc: BatchCalc; open: (p: Pending) => void }

const g = (value: number | null, digits = 2) => (value === null ? '–' : `${fmtNumber(value, digits)} g`)

export function ResultTab({ batch, calc, open }: Props) {
  const { summary, prep } = calc
  const weighed = prep.lines.filter((l) => l.depositG !== null)

  return (
    <div className="space-y-4">
      {batch.status !== 'completed' && (
        <Banner
          tone="info"
          title={batch.status === 'preparing' ? 'Batch belum berjalan' : 'Batch masih berjalan'}
        >
          Angka di sini terus berubah sampai batch diselesaikan.
        </Banner>
      )}

      <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Tebal akhir"
          value={fmtNumber(summary.micron, 1)}
          unit="µm"
          icon={<Ruler />}
          hint={`Target ${fmtNumber(batch.targetMicron, 0)} µm`}
        />
        <StatCard
          label="Efisiensi katoda"
          value={fmtNumber(summary.cathodeEfficiency, 1)}
          unit="%"
          icon={<Zap />}
          hint={`AMM teori ${fmtNumber(summary.theoreticalAmm, 0)} ÷ meter ${fmtNumber(summary.realAmm, 0)}`}
        />
        <StatCard
          label="Kadar produk"
          value={batch.prep.actualAuPct === null ? '–' : fmtNumber(batch.prep.actualAuPct, 2)}
          unit="%"
          icon={<Gauge />}
          hint={
            batch.prep.actualAuPct === null
              ? 'Belum diuji'
              : `Target ${fmtNumber(batch.prep.targetAuPct, 1)} %`
          }
        />
        <StatCard
          label="Emas menempel"
          value={fmtNumber(prep.actual.depositG, 1)}
          unit="g"
          icon={<Coins />}
          hint={weighed.length ? `Dari ${weighed.length} timbangan` : 'Isi berat akhir di rak'}
        />
      </div>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader
            action={
              <Button variant="ghost" size="sm" onClick={() => open({ kind: 'result' })}>
                Isi hasil akhir
              </Button>
            }
          >
            <CardTitle>Ringkasan proses</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                {
                  label: 'Lama proses',
                  value: summary.readingCount ? fmtHours(summary.totalHours) : 'Tanpa catatan pembacaan',
                },
                {
                  label: 'Total meter AMM',
                  value: summary.realAmm === null ? 'Belum diisi' : fmtNumber(summary.realAmm, 1),
                },
                { label: 'Tebal per AMM', value: fmtNumber(summary.micronPerAmmReal, 5) },
                {
                  label: 'Dibanding teori',
                  value: summary.micronRatioPct === null ? '–' : `${fmtNumber(summary.micronRatioPct, 1)} %`,
                },
                {
                  label: 'Kadar rata-rata dari arus',
                  value: summary.avgAu === null ? '–' : `${fmtNumber(summary.avgAu * 100, 2)} %`,
                },
                { label: 'GPC yang ditambahkan', value: g(batch.prep.gpcAddedG, 1) },
                { label: 'Catatan', value: batch.note || 'Tidak ada' },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            action={
              <Button variant="ghost" size="sm" onClick={() => open({ kind: 'lab' })}>
                Isi hasil lab
              </Button>
            }
          >
            <CardTitle>Emas dan tembaga</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Dari timbangan barang dan uji larutan sebelum dan sesudah.
            </p>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                { label: 'Emas menempel (timbangan)', value: g(prep.actual.auG) },
                { label: 'Tembaga menempel (timbangan)', value: g(prep.actual.cuG) },
                { label: 'Emas terpakai dari larutan', value: g(prep.bath.auUsedG, 1) },
                { label: 'Tembaga terpakai dari larutan', value: g(prep.bath.cuUsedG, 1) },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {prep.lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timbangan per isi rak</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Ketuk baris untuk mengisi berat. Emas menempel = berat akhir − berat setelah tembaga asam.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {prep.lines.map((l) => (
              <button
                key={l.line.id}
                type="button"
                onClick={() => open({ kind: 'line', line: l.line })}
                className="gap-2 rounded-2xl p-3 text-sm flex w-full flex-wrap items-center justify-between bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{l.name}</span>
                  <span className="ml-2 text-xs text-muted">× {fmtNumber(l.line.qty, 1)}</span>
                </span>
                <span className="text-xs text-muted tabular-nums">
                  awal {g(l.line.weightStartG)} · setelah asam {g(l.line.weightAfterAcidG)} · akhir{' '}
                  {g(l.line.weightFinalG)}
                </span>
                <span className="font-semibold tabular-nums">
                  {l.depositG === null ? '–' : `+${g(l.depositG)}`}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
