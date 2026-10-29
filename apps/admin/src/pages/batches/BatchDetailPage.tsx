import {
  batchCompleteBlocker,
  batchReopenBlocker,
  batchStartBlocker,
  bathName,
  computeBatch,
  fmtDate,
  fmtHours,
  fmtNumber,
  fmtPercent,
  processHours,
} from '@ef/fixtures'
import {
  BATCH_STATUS_FLOW,
  type Batch,
  type BatchStatus,
  type LoadLine,
  MODEL_MATERIAL_LABEL,
  type Reading,
} from '@ef/types'
import { ActionMenu, Button, Card, ConfirmDialog, EmptyState, PillTabs, toast } from '@ef/ui'
import {
  Check,
  CheckCheck,
  Download,
  MoreHorizontal,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { BatchStatusBadge } from '../../components/badges'
import { HeroMetric } from '../../components/HeroMetric'
import { type BatchTab, paths } from '../../components/links'
import { useNow } from '../../lib/clock'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'
import { LabDialog, LoadLineDialog, ResultDialog, SettingsDialog, StartDialog } from './dialogs'
import { batchCsv, downloadText } from './lib'
import { LogTab } from './LogTab'
import { PrepTab } from './PrepTab'
import { ReadingDialog } from './ReadingDialog'
import { ResultTab } from './ResultTab'

export type Pending =
  | { kind: 'reading'; reading: Reading | null }
  | { kind: 'removeReading'; reading: Reading }
  | { kind: 'line'; line: LoadLine | null }
  | { kind: 'removeLine'; line: LoadLine }
  | { kind: 'start' | 'settings' | 'lab' | 'result' | 'complete' | 'remove' }
  | null

const TAB_FOR_STATUS: Record<BatchStatus, BatchTab> = {
  preparing: 'prep',
  running: 'log',
  completed: 'result',
}
const TABS: { value: BatchTab; label: string }[] = [
  { value: 'prep', label: '1 Siapkan' },
  { value: 'log', label: '2 Catat' },
  { value: 'result', label: '3 Hasil' },
]

export function BatchDetailPage() {
  const { id = '' } = useParams()
  const { state, dispatch } = useStore()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // The dashboard links here with ?catat=1 to open the reading form straight away.
  const [pending, setPending] = useState<Pending>(() =>
    params.get('catat') ? { kind: 'reading', reading: null } : null,
  )
  const batch = state.batches.find((b) => b.id === id)
  const calc = useMemo(() => (batch ? computeBatch(batch, catalog) : null), [batch, catalog])
  const now = useNow()

  if (!batch || !calc) {
    return (
      <Card>
        <h1 className="sr-only">Batch tidak ditemukan</h1>
        <EmptyState
          title="Batch tidak ditemukan"
          description="Batch ini mungkin sudah dihapus dari browser ini."
          action={<BackButton fallback={paths.batches} />}
        />
      </Card>
    )
  }

  const tab = (params.get('tab') as BatchTab | null) ?? TAB_FOR_STATUS[batch.status]
  const stageIndex = BATCH_STATUS_FLOW.indexOf(batch.status)
  const close = () => {
    setPending(null)
    if (params.has('catat')) setParams((p) => (p.delete('catat'), p), { replace: true })
  }
  const open = (p: Pending) => setPending(p)
  const showTab = (next: BatchTab) => setParams({ tab: next }, { replace: true })
  const startBlocker = batchStartBlocker(state, batch)
  const completeBlocker = batchCompleteBlocker(batch)
  const { summary } = calc

  const reopen = () => {
    const blocker = batchReopenBlocker(state, batch)
    if (blocker) return toast('Batch belum bisa dibuka', { tone: 'danger', description: blocker })
    dispatch({ type: 'batches/reopen', id: batch.id })
    toast(`Batch ${batch.code} dibuka lagi`, { description: 'Pembacaan bisa ditambah atau diubah.' })
    showTab('log')
  }

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between print:hidden">
        <BackButton fallback={paths.batches} />
        <div className="gap-2 flex flex-wrap items-center">
          <PrimaryActions
            batch={batch}
            startBlocker={startBlocker}
            completeBlocker={completeBlocker}
            open={open}
            reopen={reopen}
          />
          <ActionMenu
            title={`Batch ${batch.code}`}
            trigger={
              <Button variant="outline" size="icon" aria-label="Menu batch">
                <MoreHorizontal />
              </Button>
            }
            items={[
              {
                key: 'settings',
                label: 'Pengaturan batch',
                description: 'Target, batas kadar, volume larutan',
                icon: <Settings2 />,
                onSelect: () => open({ kind: 'settings' }),
              },
              {
                key: 'csv',
                label: 'Unduh CSV',
                description: 'Semua kolom hitungan per pembacaan',
                icon: <Download />,
                onSelect: () => {
                  downloadText(`batch-${batch.code}.csv`, batchCsv(batch, calc))
                  toast('CSV diunduh', { description: `batch-${batch.code}.csv` })
                },
              },
              { key: 'print', label: 'Cetak', icon: <Printer />, onSelect: () => window.print() },
              'separator',
              {
                key: 'remove',
                label: 'Hapus batch',
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => open({ kind: 'remove' }),
              },
            ]}
          />
        </div>
      </div>

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-on-ink-muted">
              {bathName(state.baths, batch.bathId)} ·{' '}
              {batch.status === 'preparing'
                ? `disiapkan ${fmtDate(batch.prep.date)}`
                : `mulai ${fmtDate(batch.startDate)}`}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight font-mono">Batch {batch.code}</h1>
            <p className="mt-1 text-sm text-on-ink-muted">
              {batch.modelMaterial && `Model ${MODEL_MATERIAL_LABEL[batch.modelMaterial].toLowerCase()} · `}
              Target {fmtNumber(batch.targetMicron, 0)} µm · kadar {fmtNumber(batch.prep.targetAuPct, 1)} %
              {batch.initialAu !== null && ` · kadar awal ${fmtPercent(batch.initialAu)}`}
            </p>
          </div>
          <BatchStatusBadge status={batch.status} />
        </div>
        {batch.readings.length === 0 ? (
          <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
            <HeroMetric label="Luas rak" value={fmtNumber(summary.areaDm2, 2)} unit="dm²" />
            <HeroMetric label="Jumlah barang" value={fmtNumber(calc.prep.pieces, 0)} unit="pcs" />
            <HeroMetric label="AMM teori" value={fmtNumber(summary.theoreticalAmm, 0)} unit="A·menit" />
            {batch.status === 'preparing' ? (
              <HeroMetric label="Ampere awal" value={fmtNumber(summary.initialAmpere, 2)} unit="A" />
            ) : (
              <HeroMetric label="Efisiensi katoda" value={fmtNumber(summary.cathodeEfficiency, 1)} unit="%" />
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
              <HeroMetric
                label="Tebal emas"
                value={fmtNumber(summary.micron, 1)}
                unit={`/ ${fmtNumber(batch.targetMicron, 0)} µm`}
              />
              <HeroMetric
                label={
                  summary.remainingHours !== null && summary.remainingHours < 0
                    ? 'Lewat target'
                    : 'Perkiraan sisa'
                }
                value={summary.remainingHours === null ? '–' : fmtHours(Math.abs(summary.remainingHours))}
              />
              <HeroMetric label="Kecepatan" value={fmtNumber(summary.micronRate, 2)} unit="µm/jam" />
              <HeroMetric
                label="Lama proses"
                value={fmtHours(processHours(summary, batch.status === 'running', now))}
              />
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-xs flex items-center justify-between text-on-ink-muted">
                <span>Menuju target tebal</span>
                <span className="tabular-nums">{fmtPercent(summary.progress, 0)}</span>
              </div>
              <div
                className="h-1.5 bg-white/15 rounded-full"
                role="img"
                aria-label={`Menuju target ${fmtPercent(summary.progress, 0)}`}
              >
                <div
                  className={
                    summary.progress > 1 ? 'h-full rounded-full bg-accent' : 'bg-white h-full rounded-full'
                  }
                  style={{ width: `${Math.min(100, summary.progress * 100)}%` }}
                />
              </div>
            </div>
          </>
        )}
      </Card>

      <nav aria-label="Tahap batch" className="no-scrollbar overflow-x-auto print:hidden">
        <PillTabs
          items={TABS.map((t, i) => ({
            value: t.value,
            label: t.label,
            icon: i < stageIndex || batch.status === 'completed' ? <Check /> : undefined,
          }))}
          value={tab}
          onValueChange={(v) => showTab(v as BatchTab)}
        />
      </nav>

      {tab === 'prep' && <PrepTab batch={batch} calc={calc} startBlocker={startBlocker} open={open} />}
      {tab === 'log' && <LogTab batch={batch} calc={calc} startBlocker={startBlocker} open={open} />}
      {tab === 'result' && <ResultTab batch={batch} calc={calc} open={open} />}

      <ReadingDialog
        open={pending?.kind === 'reading'}
        onOpenChange={(o) => !o && close()}
        batch={batch}
        summary={summary}
        editing={pending?.kind === 'reading' ? pending.reading : null}
      />
      <LoadLineDialog
        open={pending?.kind === 'line'}
        onOpenChange={(o) => !o && close()}
        batch={batch}
        editing={pending?.kind === 'line' ? pending.line : null}
        pieces={calc.prep.pieces}
      />
      <StartDialog
        open={pending?.kind === 'start'}
        onOpenChange={(o) => !o && close()}
        batch={batch}
        onStarted={() => showTab('log')}
      />
      <SettingsDialog open={pending?.kind === 'settings'} onOpenChange={(o) => !o && close()} batch={batch} />
      <LabDialog open={pending?.kind === 'lab'} onOpenChange={(o) => !o && close()} batch={batch} />
      <ResultDialog open={pending?.kind === 'result'} onOpenChange={(o) => !o && close()} batch={batch} />
      <ConfirmDialog
        open={pending?.kind === 'removeReading'}
        onOpenChange={(o) => !o && close()}
        title={pending?.kind === 'removeReading' ? `Hapus pembacaan ke-${pending.reading.no}?` : ''}
        description="Hitungan baris sesudahnya ikut berubah."
        confirmLabel="Hapus pembacaan"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          if (pending?.kind !== 'removeReading') return
          dispatch({ type: 'readings/remove', batchId: batch.id, readingId: pending.reading.id })
          toast('Pembacaan dihapus', { description: `${batch.code} · ke-${pending.reading.no}` })
          close()
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'removeLine'}
        onOpenChange={(o) => !o && close()}
        title="Keluarkan dari rak?"
        description="Luas rak dan kebutuhan bahan dihitung ulang."
        confirmLabel="Keluarkan"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          if (pending?.kind !== 'removeLine') return
          dispatch({ type: 'batches/removeLine', batchId: batch.id, lineId: pending.line.id })
          toast('Dikeluarkan dari rak', { description: `Batch ${batch.code}` })
          close()
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'complete'}
        onOpenChange={(o) => !o && close()}
        title={`Selesaikan batch ${batch.code}?`}
        description={`Tebal terakhir ${fmtNumber(summary.micron, 1)} dari ${fmtNumber(batch.targetMicron, 0)} µm. Pembacaan dikunci dan ${bathName(state.baths, batch.bathId)} bisa dipakai batch berikutnya.`}
        confirmLabel="Selesaikan batch"
        cancelLabel="Batal"
        onConfirm={() => {
          dispatch({ type: 'batches/complete', id: batch.id })
          toast(`Batch ${batch.code} selesai`, {
            tone: 'success',
            description: 'Isi hasil akhir bila sudah ada.',
          })
          close()
          showTab('result')
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'remove'}
        onOpenChange={(o) => !o && close()}
        title={`Hapus batch ${batch.code}?`}
        description={`Isi rak, ${batch.readings.length} pembacaan dan hasil lab ikut terhapus dari browser ini.`}
        confirmLabel="Hapus batch"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          dispatch({ type: 'batches/remove', id: batch.id })
          toast('Batch dihapus', { description: batch.code })
          navigate(paths.batches)
        }}
      />
    </div>
  )
}

/** The one next step for the batch's stage. A waiting step keeps its reason in the title and on the tab. */
function PrimaryActions({
  batch,
  startBlocker,
  completeBlocker,
  open,
  reopen,
}: {
  batch: Batch
  startBlocker: string | null
  completeBlocker: string | null
  open: (p: Pending) => void
  reopen: () => void
}) {
  if (batch.status === 'preparing') {
    return (
      <Button
        disabled={!!startBlocker}
        title={startBlocker ?? undefined}
        onClick={() => open({ kind: 'start' })}
      >
        <Play />
        Mulai proses
      </Button>
    )
  }
  if (batch.status === 'running') {
    return (
      <>
        <Button
          variant="outline"
          disabled={!!completeBlocker}
          title={completeBlocker ?? undefined}
          onClick={() => open({ kind: 'complete' })}
        >
          <CheckCheck />
          Selesaikan
        </Button>
        <Button onClick={() => open({ kind: 'reading', reading: null })}>
          <Plus />
          Catat pembacaan
        </Button>
      </>
    )
  }
  return (
    <Button variant="outline" onClick={reopen}>
      <RotateCcw />
      Buka lagi
    </Button>
  )
}
