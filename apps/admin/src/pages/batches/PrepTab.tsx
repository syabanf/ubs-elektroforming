import {
  type BatchCalc,
  type LoadLineCalc,
  PRETREAT_CHECKS,
  PRETREAT_STEPS,
  PRETREAT_TANK_L,
  bathName,
  fmtNumber,
  runningBatchIn,
} from '@ef/fixtures'
import type { Batch } from '@ef/types'
import {
  ActionMenu,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  KeyValue,
  cn,
} from '@ef/ui'
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'
import type { Pending } from './BatchDetailPage'

type Props = { batch: Batch; calc: BatchCalc; startBlocker: string | null; open: (p: Pending) => void }

// Three.js loads only when a batch with a filled rack shows this card.
const RackView = lazy(() => import('./RackView').then((m) => ({ default: m.RackView })))

const g = (value: number | null, digits = 1) => (value === null ? '–' : `${fmtNumber(value, digits)} g`)
const gl = (value: number | null) => (value === null ? '–' : `${fmtNumber(value, 2)} g/L`)

export function PrepTab({ batch, calc, startBlocker, open }: Props) {
  const { models } = useCatalog()
  const { state } = useStore()
  const busy = runningBatchIn(state, batch.bathId, batch.id)
  const { prep, summary } = calc
  const b = prep.bath
  const labDone = batch.prep.chem.auStart !== null
  const pretreatDone = Object.values(batch.prep.pretreat).some((v) => v !== null)

  const columns: Column<LoadLineCalc>[] = [
    {
      id: 'name',
      header: 'Isi rak',
      cell: (l) => {
        const image = l.line.modelId ? models.get(l.line.modelId)?.image : null
        return (
          <div className="gap-3 flex items-center">
            {image ? (
              <img src={image} alt="" className="size-10 rounded-xl shrink-0 bg-surface-2 object-cover" />
            ) : (
              <span className="size-10 rounded-xl shrink-0 bg-surface-2" />
            )}
            <span className="min-w-0">
              <span className={cn('text-sm font-semibold block', l.kind === 'model' && 'font-mono')}>
                {l.name}
              </span>
              <span className="text-xs block text-muted">
                {l.kind === 'model'
                  ? l.line.label
                    ? `Barang · rak ${l.line.label}`
                    : 'Barang'
                  : 'Plat atau kawat'}
              </span>
            </span>
          </div>
        )
      },
    },
    {
      id: 'qty',
      header: 'Jumlah',
      align: 'right',
      cell: (l) => <span className="tabular-nums">{fmtNumber(l.line.qty, 1)}</span>,
      sortValue: (l) => l.line.qty,
    },
    {
      id: 'unit',
      header: 'Luas per buah',
      align: 'right',
      hideBelow: 'lg',
      cell: (l) => <span className="text-muted tabular-nums">{fmtNumber(l.unitAreaDm2, 5, 5)} dm²</span>,
    },
    {
      id: 'area',
      header: 'Luas',
      align: 'right',
      cell: (l) => <span className="font-semibold tabular-nums">{fmtNumber(l.areaDm2, 3, 3)} dm²</span>,
      sortValue: (l) => l.areaDm2,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Aksi</span>,
      align: 'right',
      cell: (l) => (
        <ActionMenu
          title={l.name}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi ${l.name}`}>
              <MoreHorizontal />
            </Button>
          }
          items={[
            {
              key: 'edit',
              label: 'Ubah jumlah atau timbangan',
              icon: <Pencil />,
              onSelect: () => open({ kind: 'line', line: l.line }),
            },
            {
              key: 'remove',
              label: 'Keluarkan dari rak',
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => open({ kind: 'removeLine', line: l.line }),
            },
          ]}
        />
      ),
    },
  ]

  const chemRows = [
    { name: 'Emas (Au)', start: batch.prep.chem.auStart, target: b.targetAuGL, add: b.auAddG },
    { name: 'Tembaga (Cu)', start: batch.prep.chem.cuStart, target: b.targetCuGL, add: b.cuAddG },
    { name: 'KCN', start: batch.prep.chem.kcnStart, target: batch.prep.chem.kcnTarget, add: b.kcnTopUpG },
  ]

  return (
    <div className="space-y-4">
      {batch.status === 'preparing' && (
        <Card className="p-5">
          <h2 className="text-base font-semibold">Siap mulai?</h2>
          <p className="mt-0.5 text-xs text-muted">Yang bertanda wajib harus beres sebelum Mulai proses.</p>
          <ul className="mt-4 gap-2 md:grid-cols-2 grid grid-cols-1">
            <CheckItem
              done={batch.prep.load.length > 0}
              required
              title="Isi rak"
              detail={
                batch.prep.load.length
                  ? `${fmtNumber(prep.pieces, 0)} barang, luas ${fmtNumber(summary.areaDm2, 2)} dm²`
                  : 'Tambahkan barang dari daftar model.'
              }
              action={
                <Button size="sm" variant="outline" onClick={() => open({ kind: 'line', line: null })}>
                  Tambah ke rak
                </Button>
              }
            />
            <CheckItem
              done={!busy}
              required
              title={`${bathName(state.baths, batch.bathId)} kosong`}
              detail={
                busy
                  ? `Masih dipakai batch ${busy.code}. Selesaikan dulu batch itu.`
                  : 'Tidak ada batch lain yang berjalan di bak ini.'
              }
            />
            <CheckItem
              done={labDone}
              title="Uji larutan emas"
              detail={
                labDone
                  ? `Emas ${gl(batch.prep.chem.auStart)}, perlu tambah GPC ${g(b.gpcAddG)}`
                  : 'Disarankan. Isi hasil AAS supaya tambahan GPC terhitung.'
              }
              action={
                <Button size="sm" variant="outline" onClick={() => open({ kind: 'lab' })}>
                  Isi hasil lab
                </Button>
              }
            />
            <CheckItem
              done={pretreatDone}
              title="Uji tangki pre-treatment"
              detail={pretreatDone ? 'Sudah diuji.' : 'Disarankan. Tembaga basa dan tembaga asam.'}
              action={
                <Button size="sm" variant="outline" onClick={() => open({ kind: 'lab' })}>
                  Isi hasil lab
                </Button>
              }
            />
          </ul>
          <div className="mt-4 gap-3 flex flex-wrap items-center justify-end">
            {startBlocker && <p className="text-sm text-muted">{startBlocker}</p>}
            <Button disabled={!!startBlocker} onClick={() => open({ kind: 'start' })}>
              <Play />
              Mulai proses
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          action={
            <Button variant="outline" size="sm" onClick={() => open({ kind: 'line', line: null })}>
              <Plus />
              Tambah ke rak
            </Button>
          }
        >
          <CardTitle>Isi rak</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            {summary.areaSource === 'typed'
              ? `Rak kosong, jadi batch ini memakai luas yang diketik: ${fmtNumber(summary.areaDm2, 2)} dm².`
              : `Luas dihitung dari daftar model. Total ${fmtNumber(summary.areaDm2, 3)} dm².`}
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <DataTable
            columns={columns}
            rows={prep.lines}
            getRowKey={(l) => l.line.id}
            pageSize={0}
            empty={
              <EmptyState
                compact
                title="Rak masih kosong"
                description="Masukkan barang, plat dan kawat. Luas permukaan langsung terhitung."
                action={
                  <Button onClick={() => open({ kind: 'line', line: null })}>
                    <Plus />
                    Tambah ke rak
                  </Button>
                }
              />
            }
          />
          {prep.lines.length > 0 && (
            <p className="px-5 pt-2 text-xs text-muted">
              Model belum ada?{' '}
              <Link to={paths.models} className="font-semibold text-foreground hover:text-accent">
                Tambahkan di Daftar model
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {prep.lines.length > 0 && (
        <Suspense fallback={<Card className="animate-pulse h-[30rem]" />}>
          <RackView batch={batch} calc={calc} />
        </Suspense>
      )}

      {prep.lines.length > 0 && (
        <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
          <Card>
            <CardHeader
              action={
                <Button variant="ghost" size="sm" onClick={() => open({ kind: 'settings' })}>
                  Ubah target
                </Button>
              }
            >
              <CardTitle>Bahan yang dibutuhkan</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Untuk tebal {fmtNumber(batch.targetMicron, 0)} µm dengan kadar{' '}
                {fmtNumber(batch.prep.targetAuPct, 1)} %.
              </p>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                labelWidth="md"
                items={[
                  { label: 'Berat emas yang akan menempel', value: g(prep.depositWeightG) },
                  { label: 'GPC', value: `${g(prep.gpcG)} (berisi emas ${g(prep.auG)})` },
                  { label: 'CuCN', value: `${g(prep.cucnG)} (berisi tembaga ${g(prep.cuG)})` },
                  { label: 'Replenisher', value: `${fmtNumber(prep.replenisherMl, 0)} mL` },
                  {
                    label: 'AMM teori',
                    value: `${fmtNumber(prep.ammTheory, 0)} A·menit (efisiensi ${fmtNumber(batch.prep.efficiencyPct, 0)} %)`,
                  },
                  { label: 'Ampere awal yang disarankan', value: `${fmtNumber(summary.initialAmpere, 2)} A` },
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
              <CardTitle>Larutan emas</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Larutan {fmtNumber(batch.prep.bathVolumeL, 0)} L harus cukup untuk emas yang akan terpakai.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {chemRows.map((r) => (
                <div
                  key={r.name}
                  className="gap-2 rounded-2xl p-3 text-sm flex flex-wrap items-center justify-between bg-surface-2"
                >
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-muted tabular-nums">
                    sekarang {gl(r.start)} · perlu {gl(r.target)}
                  </span>
                  <span className="text-xs sm:w-auto w-full tabular-nums">
                    {r.add === null
                      ? 'Belum diuji'
                      : r.add === 0
                        ? 'Cukup, tidak perlu tambah'
                        : `Tambah ${g(r.add)}`}
                  </span>
                </div>
              ))}
              <div className="gap-2 pt-1 text-sm flex flex-wrap">
                <span className="gap-1.5 px-3 py-1.5 inline-flex items-center rounded-full bg-surface">
                  <FlaskConical className="size-4 text-muted" />
                  Masukkan GPC <b className="tabular-nums">{g(b.gpcAddG)}</b>
                </span>
                <span className="gap-1.5 px-3 py-1.5 inline-flex items-center rounded-full bg-surface">
                  CuCN <b className="tabular-nums">{g(b.cucnAddG)}</b>
                </span>
                <span className="gap-1.5 px-3 py-1.5 inline-flex items-center rounded-full bg-surface">
                  KCN <b className="tabular-nums">{g(b.kcnAddG)}</b>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          action={
            <Button variant="ghost" size="sm" onClick={() => open({ kind: 'lab' })}>
              Isi hasil lab
            </Button>
          }
        >
          <CardTitle>Tangki pre-treatment</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Urutan: {PRETREAT_STEPS.map((s) => `${s.tank} ${s.minutes} menit`).join(' → ')}. Tangki{' '}
            {PRETREAT_TANK_L} L.
          </p>
        </CardHeader>
        <CardContent>
          <div className="gap-2 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
            {PRETREAT_CHECKS.map((check, i) => {
              const row = prep.pretreat[i]!
              return (
                <div key={check.key} className="rounded-2xl p-3 bg-surface-2">
                  <p className="text-xs text-muted">
                    {check.tank} · {check.test}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {row.result === null ? '–' : fmtNumber(row.result, 2)}{' '}
                    <span className="text-xs font-semibold text-muted">/ {check.optimal} g/L</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.add === null
                      ? 'Belum diuji'
                      : row.add === 0
                        ? 'Cukup'
                        : `Tambah ${fmtNumber(row.add, 1)} ${check.unit}`}
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CheckItem({
  done,
  required = false,
  title,
  detail,
  action,
}: {
  done: boolean
  required?: boolean
  title: string
  detail: string
  action?: React.ReactNode
}) {
  const Icon = done ? CheckCircle2 : required ? CircleAlert : Circle
  return (
    <li className="gap-3 rounded-2xl p-3 flex items-start bg-surface-2">
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          done ? 'text-success' : required ? 'text-warning' : 'text-muted',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {title}
          {required && !done && <span className="ml-1.5 text-xs font-medium text-warning">wajib</span>}
          <span className="sr-only">{done ? ', sudah' : ', belum'}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
      {!done && action}
    </li>
  )
}
