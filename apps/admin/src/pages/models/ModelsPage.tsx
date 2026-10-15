import { areaOutliers, fmtNumber, modelRemoveBlocker } from '@ef/fixtures'
import type { Model, RackPart } from '@ef/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  PillTabs,
  StatCard,
  toast,
} from '@ef/ui'
import {
  Boxes,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Ruler,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useStore } from '../../state/store'
import { ModelDialog, PartDialog } from './dialogs'

type Tab = 'models' | 'parts'

export function ModelsPage() {
  const { state } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'models'
  const [editingModel, setEditingModel] = useState<Model | null | undefined>(undefined)
  const [editingPart, setEditingPart] = useState<RackPart | null | undefined>(undefined)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Daftar model"
        description="Luas permukaan tiap model barang, plat dan kawat. Luas rak setiap batch dihitung dari daftar ini."
        actions={
          <Button onClick={() => (tab === 'models' ? setEditingModel(null) : setEditingPart(null))}>
            <Plus />
            {tab === 'models' ? 'Model baru' : 'Plat atau kawat baru'}
          </Button>
        }
      />
      <PillTabs
        items={[
          { value: 'models', label: 'Barang', count: state.models.length },
          { value: 'parts', label: 'Plat dan kawat', count: state.parts.length },
        ]}
        value={tab}
        onValueChange={(v) => setParams(v === 'models' ? {} : { tab: v }, { replace: true })}
      />
      {tab === 'models' ? <ModelsTab onEdit={setEditingModel} /> : <PartsTab onEdit={setEditingPart} />}
      <ModelDialog
        open={editingModel !== undefined}
        onOpenChange={(o) => !o && setEditingModel(undefined)}
        editing={editingModel ?? null}
      />
      <PartDialog
        open={editingPart !== undefined}
        onOpenChange={(o) => !o && setEditingPart(undefined)}
        editing={editingPart ?? null}
      />
    </div>
  )
}

function ModelsTab({ onEdit }: { onEdit: (model: Model) => void }) {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useHistoryState('query', '')
  const [removing, setRemoving] = useState<Model | null>(null)
  const table = useTableHistory()
  const outliers = useMemo(() => areaOutliers(state.models), [state.models])
  const usage = useMemo(() => {
    const count = new Map<string, number>()
    for (const batch of state.batches)
      for (const line of batch.prep.load)
        if (line.modelId) count.set(line.modelId, (count.get(line.modelId) ?? 0) + 1)
    return count
  }, [state.batches])

  const q = query.trim().toLowerCase()
  const rows = state.models.filter(
    (m) => !q || m.code.toLowerCase().includes(q) || m.family.toLowerCase().includes(q),
  )
  const families = new Set(state.models.map((m) => m.family)).size
  const withTin = state.models.filter((m) => m.tinWeightG !== null).length

  const columns: Column<Model>[] = [
    {
      id: 'photo',
      header: <span className="sr-only">Foto</span>,
      width: '4rem',
      cell: (m) =>
        m.image ? (
          <img
            src={m.image}
            alt={`Foto ${m.code}`}
            loading="lazy"
            className="size-11 rounded-xl bg-surface-2 object-cover"
          />
        ) : (
          <span className="size-11 rounded-xl flex items-center justify-center bg-surface-2 text-muted">
            <ImageOff className="size-4" />
          </span>
        ),
    },
    {
      id: 'code',
      header: 'Model',
      cell: (m) => (
        <div>
          <span className="text-sm font-semibold font-mono">{m.code}</span>
          {outliers.has(m.id) && (
            <Badge variant="warning" className="ml-2">
              <TriangleAlert className="size-3" />
              Cek luas
            </Badge>
          )}
        </div>
      ),
      sortValue: (m) => m.code,
    },
    {
      id: 'family',
      header: 'Famili',
      cell: (m) => <span className="text-xs font-mono">{m.family}</span>,
      sortValue: (m) => m.family,
      hideBelow: 'md',
    },
    {
      id: 'size',
      header: 'Ukuran',
      align: 'right',
      cell: (m) => m.size ?? '–',
      sortValue: (m) => m.size,
      hideBelow: 'lg',
    },
    {
      id: 'area',
      header: 'Luas (dm²)',
      align: 'right',
      cell: (m) => <span className="tabular-nums">{fmtNumber(m.areaDm2, 5, 5)}</span>,
      sortValue: (m) => m.areaDm2,
    },
    {
      id: 'tin',
      header: 'Berat timah (g)',
      align: 'right',
      hideBelow: 'sm',
      cell: (m) => (
        <span className="tabular-nums">
          {fmtNumber(m.tinWeightG, 3, 3)}
          {m.tinWeighings.length > 0 && (
            <span className="ml-1 text-xs text-muted">({m.tinWeighings.length}×)</span>
          )}
        </span>
      ),
      sortValue: (m) => m.tinWeightG,
    },
    {
      id: 'used',
      header: 'Dipakai',
      align: 'right',
      hideBelow: 'md',
      cell: (m) => `${usage.get(m.id) ?? 0} batch`,
      sortValue: (m) => usage.get(m.id) ?? 0,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Aksi</span>,
      align: 'right',
      cell: (m) => {
        const blocker = modelRemoveBlocker(state, m.id)
        return (
          <ActionMenu
            title={m.code}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Aksi ${m.code}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            }
            items={[
              { key: 'edit', label: 'Ubah', icon: <Pencil />, onSelect: () => onEdit(m) },
              {
                key: 'remove',
                label: 'Hapus',
                icon: <Trash2 />,
                destructive: true,
                disabled: !!blocker,
                description: blocker ?? undefined,
                onSelect: () => setRemoving(m),
              },
            ]}
          />
        )
      },
    },
  ]

  return (
    <>
      <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Model"
          value={state.models.length}
          icon={<Boxes />}
          hint={`${families} famili desain`}
        />
        <StatCard
          label="Dengan berat timah"
          value={withTin}
          icon={<Ruler />}
          hint="Rata-rata timbangan − 0,068 g"
        />
        <StatCard
          label="Perlu dicek"
          value={outliers.size}
          icon={<TriangleAlert />}
          tone={outliers.size ? 'warning' : 'default'}
          hint="Luas jauh dari ukuran lain se-famili"
        />
        <StatCard label="Komponen rak" value={state.parts.length} icon={<Boxes />} hint="Plat dan kawat" />
      </div>
      <Input
        variant="pill"
        leftIcon={<Search />}
        placeholder="Cari kode model atau famili"
        aria-label="Cari model"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sm:w-72 w-full"
        inputClassName="text-base md:text-sm"
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(m) => m.id}
        onRowClick={onEdit}
        initialSort={{ id: 'code' }}
        resetPageKey={q}
        pageSize={25}
        {...table}
        empty={
          <EmptyState
            title="Model tidak ditemukan"
            description="Ubah kata kunci atau tambahkan model baru."
          />
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Hapus model ${removing?.code}?`}
        description="Model ini belum pernah masuk rak batch mana pun."
        confirmLabel="Hapus model"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          if (!removing) return
          dispatch({ type: 'models/remove', id: removing.id })
          toast('Model dihapus', { description: removing.code })
          setRemoving(null)
        }}
      />
    </>
  )
}

function PartsTab({ onEdit }: { onEdit: (part: RackPart) => void }) {
  const { state } = useStore()
  const usage = (id: string) => state.batches.filter((b) => b.prep.load.some((l) => l.partId === id)).length
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {state.parts.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onEdit(p)}
          className="gap-3 px-5 py-4 flex w-full items-center justify-between text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        >
          <span className="min-w-0">
            <span className="text-sm font-semibold block">{p.name}</span>
            <span className="text-xs block text-muted">Dipakai di {usage(p.id)} batch</span>
          </span>
          <span className="text-sm font-semibold shrink-0 tabular-nums">
            {fmtNumber(p.areaDm2, 5)} <span className="text-xs text-muted">dm² / unit</span>
          </span>
        </button>
      ))}
    </Card>
  )
}
