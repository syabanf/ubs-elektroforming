import {
  type BatchCalc,
  bathName,
  computeBatch,
  fmtDate,
  fmtHours,
  fmtNumber,
  fmtPercent,
} from '@ef/fixtures'
import type { Batch, BatchStatus } from '@ef/types'
import {
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  StatCard,
} from '@ef/ui'
import { Activity, CheckCircle2, ClipboardList, Layers, Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { BatchStatusBadge, DirectiveBadge } from '../../components/badges'
import { useCreateBatch } from '../../components/create'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'

type Row = { batch: Batch; calc: BatchCalc; bath: string }

const columns: Column<Row>[] = [
  {
    id: 'code',
    header: 'Batch',
    cell: ({ batch }) => (
      <Link
        to={paths.batch(batch.id)}
        className="text-sm font-semibold font-mono hover:text-accent"
        onClick={(e) => e.stopPropagation()}
      >
        {batch.code}
      </Link>
    ),
    sortValue: ({ batch }) => batch.code,
  },
  {
    id: 'bath',
    header: 'Bak',
    cell: ({ bath }) => bath,
    sortValue: ({ batch }) => batch.bathId,
    hideBelow: 'sm',
  },
  {
    id: 'start',
    header: 'Tanggal',
    cell: ({ batch }) => fmtDate(batch.startDate),
    sortValue: ({ batch }) => batch.startDate,
    hideBelow: 'md',
  },
  {
    id: 'status',
    header: 'Tahap',
    cell: ({ batch }) => <BatchStatusBadge status={batch.status} />,
    sortValue: ({ batch }) => batch.status,
  },
  {
    id: 'deposit',
    header: 'Tebal emas',
    cell: ({ batch, calc }) => (
      <div className="min-w-[8rem]">
        <span className="text-sm font-semibold tabular-nums">{fmtNumber(calc.summary.micron, 1)}</span>
        <span className="text-xs text-muted"> / {fmtNumber(batch.targetMicron, 0)} µm</span>
        <ProgressBar
          value={Math.min(1, calc.summary.progress)}
          tone={batch.status === 'running' ? 'info' : 'ink'}
          className="mt-1.5"
          aria-label={`Menuju target ${batch.code}`}
        />
      </div>
    ),
    sortValue: ({ calc }) => calc.summary.progress,
  },
  {
    id: 'readings',
    header: 'Pembacaan',
    align: 'right',
    cell: ({ calc }) => calc.summary.readingCount,
    sortValue: ({ calc }) => calc.summary.readingCount,
    hideBelow: 'lg',
  },
  {
    id: 'hours',
    header: 'Lama',
    align: 'right',
    cell: ({ calc }) => <span className="tabular-nums">{fmtHours(calc.summary.totalHours)}</span>,
    sortValue: ({ calc }) => calc.summary.totalHours,
    hideBelow: 'lg',
  },
  {
    id: 'avgAu',
    header: 'Kadar rata-rata',
    align: 'right',
    cell: ({ calc }) => <span className="tabular-nums">{fmtPercent(calc.summary.avgAu)}</span>,
    sortValue: ({ calc }) => calc.summary.avgAu,
    hideBelow: 'md',
  },
  {
    id: 'eff',
    header: 'Efisiensi',
    align: 'right',
    cell: ({ calc }) => (
      <span className="tabular-nums">
        {calc.summary.cathodeEfficiency === null ? '–' : `${fmtNumber(calc.summary.cathodeEfficiency, 1)} %`}
      </span>
    ),
    sortValue: ({ calc }) => calc.summary.cathodeEfficiency,
    hideBelow: 'xl',
  },
  {
    id: 'advice',
    header: 'Saran volt',
    cell: ({ batch, calc }) =>
      batch.status === 'running' ? (
        <DirectiveBadge directive={calc.summary.next.directive} />
      ) : (
        <span className="text-muted">–</span>
      ),
    hideBelow: 'md',
  },
]

type StatusFilter = BatchStatus | 'all'

export function BatchesPage() {
  const { state } = useStore()
  const navigate = useNavigate()
  const createBatch = useCreateBatch()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as StatusFilter | null) ?? 'all'
  const bath = params.get('bath') ?? 'all'
  const [query, setQuery] = useHistoryState('query', '')
  const table = useTableHistory()

  const catalog = useCatalog()
  const all = useMemo(
    () =>
      state.batches.map((batch) => ({
        batch,
        calc: computeBatch(batch, catalog),
        bath: bathName(state.baths, batch.bathId),
      })),
    [state.batches, state.baths, catalog],
  )
  const setFilter = (key: 'status' | 'bath', value: string) =>
    setParams((p) => (value === 'all' ? p.delete(key) : p.set(key, value), p), { replace: true })

  const rows = all.filter(
    ({ batch }) =>
      (status === 'all' || batch.status === status) &&
      (bath === 'all' || batch.bathId === bath) &&
      batch.code.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const count = (s: StatusFilter) => all.filter(({ batch }) => s === 'all' || batch.status === s).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Batch"
        description="Setiap batch melewati tiga tahap: persiapan rak dan larutan, pencatatan selama proses, lalu hasil."
        actions={
          <Button onClick={createBatch}>
            <Plus />
            Batch baru
          </Button>
        }
      />
      <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Semua batch"
          value={count('all')}
          icon={<Layers />}
          onClick={() => setFilter('status', 'all')}
          tone={status === 'all' ? 'ink' : 'default'}
        />
        <StatCard
          label="Persiapan"
          value={count('preparing')}
          icon={<ClipboardList />}
          onClick={() => setFilter('status', 'preparing')}
          tone={status === 'preparing' ? 'ink' : 'default'}
        />
        <StatCard
          label="Berjalan"
          value={count('running')}
          icon={<Activity />}
          onClick={() => setFilter('status', 'running')}
          tone={status === 'running' ? 'ink' : 'default'}
        />
        <StatCard
          label="Selesai"
          value={count('completed')}
          icon={<CheckCircle2 />}
          onClick={() => setFilter('status', 'completed')}
          tone={status === 'completed' ? 'ink' : 'default'}
        />
      </div>
      <div className="gap-3 flex flex-wrap items-center">
        <ChipRow>
          <Chip active={bath === 'all'} onClick={() => setFilter('bath', 'all')}>
            Semua bak
          </Chip>
          {state.baths.map((b) => (
            <Chip
              key={b.id}
              active={bath === b.id}
              onClick={() => setFilter('bath', b.id)}
              count={all.filter((r) => r.batch.bathId === b.id).length}
            >
              {b.name}
            </Chip>
          ))}
        </ChipRow>
        <Input
          variant="pill"
          leftIcon={<Search />}
          placeholder="Cari kode, misalnya B64"
          aria-label="Cari kode batch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:ml-auto sm:w-64 w-full"
          inputClassName="text-base md:text-sm"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.batch.id}
        onRowClick={(r) => navigate(paths.batch(r.batch.id))}
        initialSort={{ id: 'start', desc: true }}
        resetPageKey={`${status}|${bath}|${query}`}
        pageSize={20}
        {...table}
        empty={
          <EmptyState
            title="Tidak ada batch yang cocok"
            description="Ubah filter atau mulai batch baru."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setParams({}, { replace: true })
                  setQuery('')
                }}
              >
                Hapus filter
              </Button>
            }
          />
        }
      />
    </div>
  )
}
