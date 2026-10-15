import {
  type DateBasis,
  EMPTY_FILTERS,
  type Grain,
  type ReportFilters,
  fmtDate,
  reportScope,
} from '@ef/fixtures'
import { BATCH_STATUS_LABEL, type BatchStatus } from '@ef/types'
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  FormField,
  Input,
  MultiCombobox,
  NativeSelect,
  PageHeader,
  cn,
  useMediaQuery,
} from '@ef/ui'
import { ChevronDown, Printer, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'
import { GRAIN_LABEL, REPORTS, type ReportMeta, reportByCode } from './catalog'
import { BODIES } from './bodies'
import { ReportContext, SourceLegend } from './shared'

const BASIS_LABEL: Record<DateBasis, string> = {
  start: 'Tanggal mulai batch',
  end: 'Tanggal selesai batch',
  reading: 'Tanggal pengukuran',
}
const GLOBAL_KEYS = ['dari', 'sampai', 'basis', 'bak', 'batch', 'model', 'status', 'grup']

function useReportFilters(meta: ReportMeta) {
  const [params, setParams] = useSearchParams()
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? []
  const grain = params.get('grup') as Grain | null
  const filters: ReportFilters = {
    from: params.get('dari'),
    to: params.get('sampai'),
    basis: (params.get('basis') as DateBasis | null) ?? EMPTY_FILTERS.basis,
    bathIds: list('bak'),
    batchIds: list('batch'),
    modelIds: list('model'),
    statuses: list('status') as BatchStatus[],
    grain: grain && meta.grains.includes(grain) ? grain : meta.grains[0]!,
  }
  const set = (key: string, value: string | string[] | null) =>
    setParams(
      (p) => {
        const text = Array.isArray(value) ? value.join(',') : value
        if (text) p.set(key, text)
        else p.delete(key)
        return p
      },
      { replace: true },
    )
  const reset = () => setParams(new URLSearchParams(), { replace: true })
  /** Global filters only, carried over when switching reports. */
  const carry = () => {
    const next = new URLSearchParams()
    for (const k of GLOBAL_KEYS) if (k !== 'grup' && params.get(k)) next.set(k, params.get(k)!)
    return next.toString()
  }
  return { filters, set, reset, carry, dirty: GLOBAL_KEYS.some((k) => params.has(k)) }
}

export function ReportPage() {
  const { code } = useParams()
  const meta = reportByCode(code)
  if (!meta)
    return (
      <Card>
        <EmptyState
          title="Laporan tidak ditemukan"
          action={
            <Button asChild variant="outline">
              <Link to="/reports">Ke daftar laporan</Link>
            </Button>
          }
        />
      </Card>
    )
  return <Report key={meta.code} meta={meta} />
}

function Report({ meta }: { meta: ReportMeta }) {
  const { state } = useStore()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const { filters, set, reset, carry, dirty } = useReportFilters(meta)
  const scope = useMemo(() => reportScope(state, catalog, filters), [state, catalog, filters])
  const all = useMemo(() => reportScope(state, catalog, EMPTY_FILTERS).batches, [state, catalog])

  const name = (ids: string[], pick: (id: string) => string) => ids.map(pick).join(', ')
  const filterNotes = [
    filters.from || filters.to
      ? `Periode: ${filters.from ? fmtDate(filters.from) : 'awal'} s.d. ${filters.to ? fmtDate(filters.to) : 'sekarang'} (${BASIS_LABEL[filters.basis].toLowerCase()})`
      : 'Periode: semua tanggal',
    filters.bathIds.length
      ? `Bak: ${name(filters.bathIds, (id) => state.baths.find((b) => b.id === id)?.name ?? id)}`
      : null,
    filters.batchIds.length
      ? `Batch: ${name(filters.batchIds, (id) => state.batches.find((b) => b.id === id)?.code ?? id)}`
      : null,
    filters.modelIds.length
      ? `Model: ${name(filters.modelIds, (id) => catalog.models.get(id)?.code ?? id)}`
      : null,
    filters.statuses.length
      ? `Status: ${name(filters.statuses, (s) => BATCH_STATUS_LABEL[s as BatchStatus])}`
      : null,
    `Pengelompokan: ${GRAIN_LABEL[filters.grain]}`,
  ].filter((n): n is string => n !== null)

  const specialNotes = useRef<string[]>([])
  const Body = BODIES[meta.code]
  return (
    <ReportContext.Provider value={{ meta, filters, scope, all, state, filterNotes, specialNotes }}>
      <div className="space-y-4">
        <BackButton fallback="/reports" />
        <PageHeader
          eyebrow={meta.code}
          title={meta.title}
          description={meta.purpose}
          className="mb-2"
          actions={
            <div className="gap-2 flex flex-wrap print:hidden">
              <NativeSelect
                aria-label="Pindah laporan"
                value={meta.code}
                onChange={(e) => navigate(`/reports/${e.target.value.toLowerCase()}?${carry()}`)}
                options={REPORTS.map((r) => ({ value: r.code, label: `${r.code} ${r.title}` }))}
                className="w-56"
              />
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Cetak PDF
              </Button>
            </div>
          }
        />

        <div className="text-xs hidden print:block">
          {filterNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p>Dicetak {new Date().toLocaleString('id-ID')}</p>
        </div>

        <GlobalFilters meta={meta} filters={filters} set={set} reset={reset} dirty={dirty} />

        {meta.missing.length > 0 && (
          <Banner tone="info" title={`Belum dicatat: ${meta.missing.join(', ')}`} className="print:hidden">
            Kolomnya tampil kosong sampai datanya diisi. Laporan tidak mengisinya dengan angka perkiraan.
          </Banner>
        )}
        <SourceLegend />

        {scope.batches.length === 0 ? (
          <Card>
            <EmptyState
              title="Tidak ada batch yang cocok"
              description="Longgarkan filter tanggal, bak atau status."
              action={
                <Button variant="outline" onClick={reset}>
                  Hapus filter
                </Button>
              }
            />
          </Card>
        ) : (
          <Body />
        )}
      </div>
    </ReportContext.Provider>
  )
}

type FilterProps = {
  meta: ReportMeta
  filters: ReportFilters
  set: (key: string, value: string | string[] | null) => void
  reset: () => void
  dirty: boolean
}

function GlobalFilters({ meta, filters, set, reset, dirty }: FilterProps) {
  const { state } = useStore()
  const catalog = useCatalog()
  const usedModels = useMemo(() => {
    const ids = new Set(
      state.batches.flatMap((b) => b.prep.load.flatMap((l) => (l.modelId ? [l.modelId] : []))),
    )
    return [...ids].flatMap((id) => catalog.models.get(id) ?? []).sort((a, b) => a.code.localeCompare(b.code))
  }, [state.batches, catalog])
  const wide = useMediaQuery('(min-width: 1024px)')
  const [open, setOpen] = useState(false)
  const active = [
    filters.from || filters.to,
    filters.bathIds.length,
    filters.batchIds.length,
    filters.modelIds.length,
    filters.statuses.length,
  ].filter(Boolean).length

  return (
    <Card className="p-4 space-y-3 print:hidden">
      {!wide && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="gap-2 text-sm font-semibold flex w-full items-center"
        >
          <SlidersHorizontal className="size-4" />
          Filter{active ? ` · ${active} aktif` : ''}
          <ChevronDown className={cn('size-4 ml-auto transition-transform', open && 'rotate-180')} />
        </button>
      )}
      {(wide || open) && (
        <>
          <div className="gap-3 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
            <FormField label="Dari tanggal">
              <Input
                type="date"
                value={filters.from ?? ''}
                onChange={(e) => set('dari', e.target.value || null)}
              />
            </FormField>
            <FormField label="Sampai tanggal">
              <Input
                type="date"
                value={filters.to ?? ''}
                onChange={(e) => set('sampai', e.target.value || null)}
              />
            </FormField>
            <FormField label="Tanggal yang dipakai">
              <NativeSelect
                value={filters.basis}
                onChange={(e) => set('basis', e.target.value === 'start' ? null : e.target.value)}
                options={(Object.keys(BASIS_LABEL) as DateBasis[]).map((b) => ({
                  value: b,
                  label: BASIS_LABEL[b],
                }))}
              />
            </FormField>
            <FormField label="Pengelompokan grafik">
              <NativeSelect
                value={filters.grain}
                onChange={(e) => set('grup', e.target.value === meta.grains[0] ? null : e.target.value)}
                options={meta.grains.map((g) => ({ value: g, label: GRAIN_LABEL[g] }))}
              />
            </FormField>
            <FormField label="Bak">
              <MultiCombobox
                items={state.baths}
                getKey={(b) => b.id}
                getLabel={(b) => b.name}
                values={filters.bathIds}
                onChange={(v) => set('bak', v)}
                placeholder="Semua bak"
              />
            </FormField>
            <FormField label="Batch">
              <MultiCombobox
                items={[...state.batches].sort((a, b) => b.startDate.localeCompare(a.startDate))}
                getKey={(b) => b.id}
                getLabel={(b) => b.code}
                getDescription={(b) => `${fmtDate(b.startDate)} · ${BATCH_STATUS_LABEL[b.status]}`}
                values={filters.batchIds}
                onChange={(v) => set('batch', v)}
                placeholder="Semua batch"
                searchPlaceholder="Cari kode batch"
              />
            </FormField>
            <FormField label="Model produk">
              <MultiCombobox
                items={usedModels}
                getKey={(m) => m.id}
                getLabel={(m) => m.code}
                values={filters.modelIds}
                onChange={(v) => set('model', v)}
                placeholder="Semua model"
                searchPlaceholder="Cari kode model"
              />
            </FormField>
            <FormField label="Status batch">
              <MultiCombobox
                items={Object.keys(BATCH_STATUS_LABEL) as BatchStatus[]}
                getKey={(s) => s}
                getLabel={(s) => BATCH_STATUS_LABEL[s]}
                values={filters.statuses}
                onChange={(v) => set('status', v)}
                placeholder="Semua status"
              />
            </FormField>
          </div>
          <div className="gap-2 text-xs flex flex-wrap items-center text-muted">
            <span>Belum dicatat, belum bisa difilter:</span>
            {['Shift', 'Operator', 'Status QC'].map((label) => (
              <Chip key={label} disabled title="Isian ini belum ada di form pencatatan">
                {label}
              </Chip>
            ))}
            {dirty && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
                <RotateCcw />
                Atur ulang filter
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
