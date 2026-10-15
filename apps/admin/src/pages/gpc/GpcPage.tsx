import { GPC_AU, type GpcRow, batchIdFor, fmtDate, fmtNumber, gpcLedger, todayIso } from '@ef/fixtures'
import type { GpcEntry } from '@ef/types'
import {
  ActionMenu,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  StatCard,
  toast,
} from '@ef/ui'
import { Coins, FlaskRound, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { NumberField } from '../../components/NumberField'
import { numberError, parseNum, toInput } from '../../lib/form'
import { useStore } from '../../state/store'

type Pending =
  { kind: 'entry'; entry: GpcEntry | null } | { kind: 'remove'; entry: GpcEntry } | { kind: 'initial' } | null

export function GpcPage() {
  const { state, dispatch } = useStore()
  const [pending, setPending] = useState<Pending>(null)
  const rows = useMemo(() => gpcLedger(state.gpc.entries, state.gpc.initialAuG), [state.gpc])
  const totalGpc = state.gpc.entries.reduce((s, e) => s + e.grams, 0)
  const totalAu = rows.reduce((s, r) => s + r.auInG, 0)
  const close = () => setPending(null)

  const columns: Column<GpcRow>[] = [
    {
      id: 'date',
      header: 'Tanggal',
      cell: (r) => (r.entry.date ? fmtDate(r.entry.date) : <span className="text-muted">Belum diisi</span>),
      sortValue: (r) => r.entry.date,
    },
    {
      id: 'batch',
      header: 'Batch',
      cell: (r) => {
        const batch = state.batches.find((b) => b.id === batchIdFor(r.entry.batchCode))
        return batch ? (
          <Link
            to={paths.batch(batch.id, 'prep')}
            className="text-sm font-semibold font-mono hover:text-accent"
            onClick={(e) => e.stopPropagation()}
          >
            {r.entry.batchCode}
          </Link>
        ) : (
          <span className="text-sm font-mono">{r.entry.batchCode}</span>
        )
      },
    },
    {
      id: 'grams',
      header: 'GPC (g)',
      align: 'right',
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.entry.grams, 2, 2)}</span>,
      sortValue: (r) => r.entry.grams,
    },
    {
      id: 'kadar',
      header: 'Kadar Au',
      align: 'right',
      hideBelow: 'md',
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.entry.auFraction * 100, 1)} %</span>,
    },
    {
      id: 'au',
      header: 'Au masuk (g)',
      align: 'right',
      cell: (r) => <span className="font-semibold tabular-nums">{fmtNumber(r.auInG, 2, 2)}</span>,
      sortValue: (r) => r.auInG,
    },
    {
      id: 'cum',
      header: 'Au kumulatif (g)',
      align: 'right',
      hideBelow: 'sm',
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.cumulativeAuG, 1, 1)}</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Aksi</span>,
      align: 'right',
      cell: (r) => (
        <ActionMenu
          title={`GPC batch ${r.entry.batchCode}`}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi GPC batch ${r.entry.batchCode}`}>
              <MoreHorizontal />
            </Button>
          }
          items={[
            {
              key: 'edit',
              label: 'Ubah',
              icon: <Pencil />,
              onSelect: () => setPending({ kind: 'entry', entry: r.entry }),
            },
            {
              key: 'remove',
              label: 'Hapus',
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => setPending({ kind: 'remove', entry: r.entry }),
            },
          ]}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catatan GPC"
        description="Setiap GPC (garam emas) yang dimasukkan ke larutan. Emas masuk = berat GPC × kadar emas GPC."
        actions={
          <Button onClick={() => setPending({ kind: 'entry', entry: null })}>
            <Plus />
            Catat penambahan
          </Button>
        }
      />
      <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Au awal larutan"
          value={fmtNumber(state.gpc.initialAuG, 1)}
          unit="g"
          icon={<Scale />}
          hint="Ketuk untuk ubah"
          onClick={() => setPending({ kind: 'initial' })}
        />
        <StatCard
          label="Total GPC"
          value={fmtNumber(totalGpc, 1)}
          unit="g"
          icon={<FlaskRound />}
          hint={`${state.gpc.entries.length} penambahan`}
        />
        <StatCard label="Total Au masuk" value={fmtNumber(totalAu, 1)} unit="g" icon={<Coins />} />
        <StatCard
          label="Au kumulatif"
          value={fmtNumber(state.gpc.initialAuG + totalAu, 1)}
          unit="g"
          icon={<Coins />}
          hint="Belum dikurangi deposit"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.entry.id}
        pageSize={0}
        empty={
          <EmptyState
            title="Belum ada penambahan GPC"
            description="Catat setiap GPC yang dimasukkan ke larutan emas."
          />
        }
      />
      <GpcDialog
        open={pending?.kind === 'entry'}
        onOpenChange={(o) => !o && close()}
        editing={pending?.kind === 'entry' ? pending.entry : null}
      />
      <InitialDialog open={pending?.kind === 'initial'} onOpenChange={(o) => !o && close()} />
      <ConfirmDialog
        open={pending?.kind === 'remove'}
        onOpenChange={(o) => !o && close()}
        title={`Hapus penambahan GPC batch ${pending?.kind === 'remove' ? pending.entry.batchCode : ''}?`}
        description="Au kumulatif di baris sesudahnya ikut berubah."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          if (pending?.kind !== 'remove') return
          dispatch({ type: 'gpc/remove', id: pending.entry.id })
          toast('Penambahan GPC dihapus', { description: `Batch ${pending.entry.batchCode}` })
          close()
        }}
      />
    </div>
  )
}

function GpcDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: GpcEntry | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {open && <GpcForm editing={editing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function GpcForm({ editing, onDone }: { editing: GpcEntry | null; onDone: () => void }) {
  const { dispatch } = useStore()
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [code, setCode] = useState(editing?.batchCode ?? '')
  const [grams, setGrams] = useState(toInput(editing?.grams ?? null))
  const [kadar, setKadar] = useState(toInput(editing?.auFraction ?? GPC_AU, 100))
  const [submitted, setSubmitted] = useState(false)
  const g = parseNum(grams)
  const k = parseNum(kadar)
  const errors = {
    code: code.trim() ? null : 'Isi nomor batch.',
    grams: numberError(g, { required: true, min: 0.01, label: 'Berat GPC' }),
    kadar: numberError(k, { required: true, min: 1, max: 100, label: 'Kadar Au' }),
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const entry: GpcEntry = {
      id: editing?.id ?? `gp-${Date.now().toString(36)}`,
      date: date || null,
      batchCode: code.trim(),
      grams: g!,
      auFraction: k! / 100,
    }
    dispatch({ type: 'gpc/save', entry })
    toast(editing ? 'Penambahan GPC diperbarui' : 'Penambahan GPC dicatat', {
      tone: 'success',
      description: `Batch ${entry.batchCode} · ${fmtNumber(entry.grams, 2)} g`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Ubah penambahan GPC' : 'Catat penambahan GPC'}</DialogTitle>
        <DialogDescription>Tulis kode batch, misalnya B64, supaya tersambung ke batchnya.</DialogDescription>
      </DialogHeader>
      <div className="gap-4 grid grid-cols-1">
        <FormField label="Tanggal">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            inputClassName="text-base md:text-sm"
          />
        </FormField>
        <FormField label="Nomor batch" required error={submitted ? errors.code : null}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputClassName="font-mono text-base md:text-sm"
          />
        </FormField>
        <NumberField
          label="Berat GPC"
          unit="g"
          required
          value={grams}
          onChange={setGrams}
          error={submitted ? errors.grams : null}
        />
        <NumberField
          label="Kadar Au GPC"
          unit="%"
          required
          value={kadar}
          onChange={setKadar}
          error={submitted ? errors.kadar : null}
          hint={g && k ? `Au masuk ${fmtNumber((g * k) / 100, 2)} g` : undefined}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">{editing ? 'Simpan' : 'Catat penambahan'}</Button>
      </DialogFooter>
    </form>
  )
}

function InitialDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">{open && <InitialForm onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function InitialForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore()
  const [grams, setGrams] = useState(toInput(state.gpc.initialAuG))
  const [submitted, setSubmitted] = useState(false)
  const value = parseNum(grams)
  const error = numberError(value, { required: true, min: 0, label: 'Au awal' })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error) return
    dispatch({ type: 'gpc/setInitial', grams: value! })
    toast('Au awal larutan disimpan', { tone: 'success', description: `${fmtNumber(value, 1)} g` })
    onDone()
  }
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Au awal larutan</DialogTitle>
        <DialogDescription>
          Hasil AAS × volume larutan sebelum penambahan pertama. Excel: 9,03 g/L × 140 L.
        </DialogDescription>
      </DialogHeader>
      <NumberField
        label="Au awal"
        unit="g"
        required
        value={grams}
        onChange={setGrams}
        error={submitted ? error : null}
        autoFocus
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}
