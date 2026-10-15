import {
  type AppState,
  type Grain,
  type Insight,
  type ReportBatch,
  type ReportFilters,
  type ReportScope,
  byPeriod,
  fmtDate,
  fmtNumber,
  meanOf,
  sumOf,
  todayIso,
} from '@ef/fixtures'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  Input,
  NativeSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatCard,
  cn,
} from '@ef/ui'
import { Download, SlidersHorizontal } from 'lucide-react'
import { type ReactNode, createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { paths } from '../../components/links'
import { InsightList } from '../../components/Insights'
import { downloadText } from '../batches/lib'
import type { ReportMeta } from './catalog'

export type ReportContextValue = {
  meta: ReportMeta
  filters: ReportFilters
  scope: ReportScope
  /** Every batch, unfiltered, for comparisons against history. */
  all: ReportBatch[]
  state: AppState
  /** The active filters in words, for the print header and the CSV. */
  filterNotes: string[]
  /** Report-specific filters in words, written by `useSpecialFilters` and read when a CSV is exported. */
  specialNotes: { current: string[] }
}

export const ReportContext = createContext<ReportContextValue | null>(null)
export function useReport() {
  const value = useContext(ReportContext)
  if (!value) throw new Error('useReport outside ReportContext')
  return value
}

// Where a number comes from. The catalog asks that these never blend into one column.
export type Source = 'target' | 'actual' | 'lab' | 'estimate'

export const SOURCE: Record<Source, { short: string; label: string; className: string }> = {
  target: { short: 'T', label: 'Target', className: 'bg-surface-2 text-body' },
  actual: { short: 'A', label: 'Aktual proses', className: 'bg-info-soft text-info' },
  lab: { short: 'L', label: 'Lab / QC', className: 'bg-success-soft text-success' },
  estimate: { short: 'P', label: 'Perkiraan rumus', className: 'bg-warning-soft text-warning' },
}

export function SourceTag({ source }: { source: Source }) {
  const s = SOURCE[source]
  return (
    <span
      title={s.label}
      className={cn(
        'size-4 font-bold rounded-md inline-flex items-center justify-center text-[10px]',
        s.className,
      )}
    >
      {s.short}
    </span>
  )
}

export function SourceLegend() {
  return (
    <ul className="gap-x-4 gap-y-1 text-xs flex flex-wrap text-muted">
      {(Object.keys(SOURCE) as Source[]).map((key) => (
        <li key={key} className="gap-1.5 flex items-center">
          <SourceTag source={key} />
          {SOURCE[key].label}
        </li>
      ))}
    </ul>
  )
}

export type ReportColumn<R> = {
  id: string
  label: string
  unit?: string
  source?: Source
  value: (row: R) => number | string | null
  digits?: number
  /** Custom cell, such as a badge; the CSV still uses `value`. */
  cell?: (row: R) => ReactNode
  hideBelow?: Column<R>['hideBelow']
}

const show = (value: number | string | null, digits = 2) =>
  value === null ? '–' : typeof value === 'number' ? fmtNumber(value, digits) : value

const csvCell = (value: string | number | null) => {
  if (value === null) return ''
  const text = String(value)
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

type TableProps<R> = {
  title: string
  note?: string
  columns: ReportColumn<R>[]
  rows: R[]
  getKey: (row: R) => string
  onRowClick?: (row: R) => void
  initialSort?: { id: string; desc?: boolean }
  /** Name of the exported file, after the report code. */
  file: string
}

/** Detail table with a CSV export of exactly the rows on screen, filters noted at the top. */
export function ReportTable<R>({
  title,
  note,
  columns,
  rows,
  getKey,
  onRowClick,
  initialSort,
  file,
}: TableProps<R>) {
  const { meta, filterNotes, specialNotes } = useReport()
  const exportCsv = () => {
    const header = columns.map(
      (c) => `${c.label}${c.unit ? ` (${c.unit})` : ''}${c.source ? ` [${SOURCE[c.source].label}]` : ''}`,
    )
    const lines = [
      [`${meta.code} ${meta.title}: ${title}`],
      [`Dibuat ${new Date().toLocaleString('id-ID')}`],
      ...[...filterNotes, ...specialNotes.current].map((n) => [n]),
      [],
      header,
      ...rows.map((r) =>
        columns.map((c) => {
          const v = c.value(r)
          return typeof v === 'number' ? Number(v.toFixed(4)) : v
        }),
      ),
    ]
    downloadText(
      `${meta.code}-${file}-${todayIso()}.csv`,
      `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\n')}`,
    )
  }
  return (
    <Card>
      <CardHeader
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="print:hidden"
          >
            <Download />
            Unduh CSV
          </Button>
        }
      >
        <CardTitle>{title}</CardTitle>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length} baris{note ? `. ${note}` : '.'}
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <DataTable
          columns={columns.map((c): Column<R> => ({
            id: c.id,
            header: (
              <span className="gap-1 inline-flex items-center whitespace-nowrap">
                {c.label}
                {c.unit && <span className="font-normal text-muted normal-case">{c.unit}</span>}
                {c.source && <SourceTag source={c.source} />}
              </span>
            ),
            cell: (r) => (
              <span className="whitespace-nowrap tabular-nums">
                {c.cell?.(r) ?? show(c.value(r), c.digits)}
              </span>
            ),
            sortValue: (r) => c.value(r),
            align: rows.some((r) => typeof c.value(r) === 'number') ? 'right' : 'left',
            hideBelow: c.hideBelow,
          }))}
          rows={rows}
          getRowKey={getKey}
          onRowClick={onRowClick}
          initialSort={initialSort}
          pageSize={15}
          resetPageKey={rows.length}
        />
      </CardContent>
    </Card>
  )
}

export type Kpi = {
  label: string
  value: number | string | null
  unit?: string
  digits?: number
  hint?: ReactNode
}

export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
      {items.map((k) => (
        <StatCard key={k.label} label={k.label} value={show(k.value, k.digits)} unit={k.unit} hint={k.hint} />
      ))}
    </div>
  )
}

export function ChartCard({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader action={action}>
        <CardTitle>{title}</CardTitle>
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// Report-specific filters, kept in the URL under an `x.` prefix so a filtered report can be shared.

export type RangeFilter<R> = { id: string; label: string; unit?: string; value: (row: R) => number | null }
export type ChoiceFilter<R> = {
  id: string
  label: string
  options: { value: string; label: string }[]
  value: (row: R) => string | null
}

const num = (raw: string | null) => (raw === null || raw.trim() === '' ? null : Number(raw.replace(',', '.')))

export function useSpecialFilters<R>(rows: R[], ranges: RangeFilter<R>[], choices: ChoiceFilter<R>[] = []) {
  const { specialNotes } = useReport()
  const [params, setParams] = useSearchParams()
  const set = (key: string, value: string | null) =>
    setParams((p) => (value === null || value === '' ? p.delete(key) : p.set(key, value), p), {
      replace: true,
    })
  const picked = (id: string) => params.get(`x.${id}`)?.split(',').filter(Boolean) ?? []

  const filtered = rows.filter(
    (r) =>
      ranges.every((f) => {
        const [min, max] = [num(params.get(`x.${f.id}.min`)), num(params.get(`x.${f.id}.max`))]
        if (min === null && max === null) return true
        const v = f.value(r)
        return v !== null && (min === null || v >= min) && (max === null || v <= max)
      }) &&
      choices.every((f) => {
        const values = picked(f.id)
        return values.length === 0 || values.includes(f.value(r) ?? '')
      }),
  )
  const active = [...params.keys()].filter((k) => k.startsWith('x.')).length
  const notes = [
    ...ranges.flatMap((f) => {
      const [min, max] = [params.get(`x.${f.id}.min`), params.get(`x.${f.id}.max`)]
      return min || max ? [`${f.label}: ${min || '…'} s.d. ${max || '…'}${f.unit ? ` ${f.unit}` : ''}`] : []
    }),
    ...choices.flatMap((f) => {
      const values = picked(f.id)
      const labels = f.options.filter((o) => values.includes(o.value)).map((o) => o.label)
      return labels.length ? [`${f.label}: ${labels.join(', ')}`] : []
    }),
  ]
  specialNotes.current = notes
  const clear = () =>
    setParams(
      (p) => {
        for (const k of [...p.keys()]) if (k.startsWith('x.')) p.delete(k)
        return p
      },
      { replace: true },
    )

  const panel = (
    <>
      {notes.length > 0 && (
        <p data-print className="text-xs hidden print:block">
          Filter khusus: {notes.join('; ')}
        </p>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={active ? 'soft' : 'outline'} size="sm" className="print:hidden">
            <SlidersHorizontal />
            Filter khusus{active ? ` (${active})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="space-y-3 w-[min(22rem,calc(100vw-2rem))]">
          {ranges.map((f) => (
            <fieldset key={f.id}>
              <legend className="mb-1 text-xs font-semibold">
                {f.label}
                {f.unit && <span className="font-normal text-muted"> ({f.unit})</span>}
              </legend>
              <div className="gap-2 grid grid-cols-2">
                {(['min', 'max'] as const).map((end) => (
                  <Input
                    key={end}
                    inputMode="decimal"
                    placeholder={end === 'min' ? 'Dari' : 'Sampai'}
                    aria-label={`${f.label} ${end === 'min' ? 'dari' : 'sampai'}`}
                    value={params.get(`x.${f.id}.${end}`) ?? ''}
                    onChange={(e) => set(`x.${f.id}.${end}`, e.target.value)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          {choices.map((f) => (
            <fieldset key={f.id}>
              <legend className="mb-1 text-xs font-semibold">{f.label}</legend>
              <ChipRow className="flex-wrap">
                {f.options.map((o) => {
                  const values = picked(f.id)
                  const on = values.includes(o.value)
                  return (
                    <Chip
                      key={o.value}
                      active={on}
                      onClick={() =>
                        set(
                          `x.${f.id}`,
                          (on ? values.filter((v) => v !== o.value) : [...values, o.value]).join(','),
                        )
                      }
                    >
                      {o.label}
                    </Chip>
                  )
                })}
              </ChipRow>
            </fieldset>
          ))}
          <Button variant="ghost" size="sm" onClick={clear} disabled={!active}>
            Hapus filter khusus
          </Button>
        </PopoverContent>
      </Popover>
    </>
  )
  return { rows: filtered, panel }
}

export function Toolbar({ children }: { children: ReactNode }) {
  // Controls stay off paper; a `data-print` note inside still prints.
  return (
    <div className="gap-2 flex flex-wrap items-center print:[&>:not([data-print])]:hidden">{children}</div>
  )
}

// Trend series for the chosen grouping.

const dayLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' })

export function periodLabel(key: string, grain: Grain) {
  if (grain === 'month') return monthLabel.format(new Date(`${key}-01T00:00:00`))
  const label = dayLabel.format(new Date(`${key}T00:00:00`))
  return grain === 'week' ? `Mg ${label}` : label
}

type TrendPick<T> = {
  date: (item: T) => string | null
  batch: (item: T) => string
  label?: (item: T) => string
  value: (item: T) => number | null
}

/** One point per reading, per batch, or per period; groups take the mean, or the sum when asked. */
export function trend<T>(items: T[], grain: Grain, pick: TrendPick<T>, total = false) {
  const reduce = (group: T[]) => (total ? sumOf : meanOf)(group.map(pick.value))
  if (grain === 'reading')
    return items.map((i) => ({ label: (pick.label ?? pick.batch)(i), value: pick.value(i) }))
  if (grain === 'batch') {
    return [...groupBy(items, pick.batch)].map(([label, group]) => ({ label, value: reduce(group) }))
  }
  return byPeriod(items, pick.date, grain).map(({ key, group }) => ({
    label: periodLabel(key, grain),
    value: reduce(group),
  }))
}

/** Column charts take numbers only. */
export const numbersOnly = (data: { label: string; value: number | null }[]) =>
  data.flatMap((d) => (d.value === null ? [] : [{ label: d.label, value: d.value }]))

/** Date a batch row is grouped under: its start, or its end when the filters use the end date. */
export function useBatchDate() {
  const { filters } = useReport()
  return (rb: ReportBatch) => (filters.basis === 'end' ? rb.endedAt : rb.batch.startDate)
}

/** Identity columns every batch-level table starts with. */
export function batchColumns<R extends { rb: ReportBatch }>(): ReportColumn<R>[] {
  return [
    {
      id: 'start',
      label: 'Mulai',
      value: (r) => r.rb.batch.startDate,
      cell: (r) => fmtDate(r.rb.batch.startDate),
    },
    {
      id: 'code',
      label: 'Batch',
      value: (r) => r.rb.batch.code,
      cell: (r) => <span className="font-semibold font-mono">{r.rb.batch.code}</span>,
    },
    { id: 'bath', label: 'Bak', value: (r) => r.rb.bath, hideBelow: 'md' },
  ]
}

/** First two model codes and a count of the rest, so a mixed rack keeps one table row tall. */
export const shortModels = (models: string[]) =>
  models.length === 0
    ? null
    : models.length <= 2
      ? models.join(', ')
      : `${models.slice(0, 2).join(', ')} +${models.length - 2}`

export function modelColumn<R extends { rb: ReportBatch }>(
  hideBelow: Column<R>['hideBelow'],
): ReportColumn<R> {
  return {
    id: 'model',
    label: 'Model',
    value: (r) => r.rb.models.join(', ') || null,
    cell: (r) => <span title={r.rb.models.join(', ')}>{shortModels(r.rb.models) ?? '–'}</span>,
    hideBelow,
  }
}

/** Batch picked for the per-reading charts, kept in the URL as `fokus`. */
export function useFocusBatch(candidates: ReportBatch[]) {
  const [params, setParams] = useSearchParams()
  const id = params.get('fokus')
  const focus =
    candidates.find((c) => c.batch.id === id) ??
    candidates.find((c) => c.batch.status === 'running') ??
    candidates[candidates.length - 1] ??
    null
  const picker =
    candidates.length > 1 && focus ? (
      <NativeSelect
        aria-label="Batch yang ditampilkan"
        value={focus.batch.id}
        onChange={(e) => setParams((p) => (p.set('fokus', e.target.value), p), { replace: true })}
        options={candidates.map((c) => ({ value: c.batch.id, label: `Batch ${c.batch.code}` }))}
        className="w-36 print:hidden"
      />
    ) : null
  return { focus, picker }
}

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

export function useOpenBatch() {
  const navigate = useNavigate()
  return (r: { rb: ReportBatch }) => navigate(paths.batch(r.rb.batch.id))
}

/** A view choice (chart parameter, tolerance) kept in the URL; the default leaves the URL clean. */
export function useViewParam<T extends string>(key: string, fallback: T) {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) as T | null) ?? fallback
  const set = (v: T) =>
    setParams((p) => (v === fallback ? p.delete(key) : p.set(key, v), p), { replace: true })
  return [value, set] as const
}

export const hours = (minutes: number | null) => (minutes === null ? null : minutes / 60)

/** Findings from the rows on screen, so they follow every filter. */
export function ReportInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null
  return (
    <ChartCard
      title="Apa kata data"
      note="Dihitung dari baris laporan ini. Kuning perlu dicek, hijau sudah baik."
    >
      <InsightList insights={insights} />
    </ChartCard>
  )
}
