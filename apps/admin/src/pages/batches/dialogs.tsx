import {
  type PrepPatch,
  PRETREAT_CHECKS,
  batchStartBlocker,
  bathName,
  fmtNumber,
  toLocalIso,
  todayIso,
} from '@ef/fixtures'
import type { Batch, LoadLine } from '@ef/types'
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  NativeSelect,
  SegmentedControl,
  Textarea,
  toast,
} from '@ef/ui'
import { useState } from 'react'
import { NumberField } from '../../components/NumberField'
import { numberError, parseNum, toInput } from '../../lib/form'
import { useCatalog } from '../../state/catalog'
import { useStore } from '../../state/store'

type Open = { open: boolean; onOpenChange: (open: boolean) => void }

/** Wraps a form so it mounts only while its dialog is open. */
function FormDialog({
  open,
  onOpenChange,
  size,
  children,
}: Open & { size?: 'sm' | 'md' | 'lg'; children: (done: () => void) => React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>{open && children(() => onOpenChange(false))}</DialogContent>
    </Dialog>
  )
}

function Footer({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Batal
      </Button>
      <Button type="submit">{submit}</Button>
    </DialogFooter>
  )
}

/** Text state for a set of numeric fields, with parsing and errors. */
function useNumbers<K extends string>(
  initial: Record<K, number | null>,
  rules: Record<K, { label: string; required?: boolean; min?: number; max?: number; scale?: number }>,
) {
  const keys = Object.keys(rules) as K[]
  const [text, setText] = useState(
    () =>
      Object.fromEntries(keys.map((k) => [k, toInput(initial[k], rules[k].scale ?? 1)])) as Record<K, string>,
  )
  const values = Object.fromEntries(
    keys.map((k) => {
      const v = parseNum(text[k])
      return [k, v === null || Number.isNaN(v) ? v : v / (rules[k].scale ?? 1)]
    }),
  ) as Record<K, number | null>
  const errors = Object.fromEntries(keys.map((k) => [k, numberError(parseNum(text[k]), rules[k])])) as Record<
    K,
    string | null
  >
  const bind = (k: K) => ({ value: text[k], onChange: (v: string) => setText((t) => ({ ...t, [k]: v })) })
  return { values, errors, bind, hasErrors: keys.some((k) => errors[k]) }
}

// Mulai proses

export function StartDialog({ batch, onStarted, ...open }: Open & { batch: Batch; onStarted: () => void }) {
  return (
    <FormDialog {...open}>
      {(done) => <StartForm batch={batch} onDone={done} onStarted={onStarted} />}
    </FormDialog>
  )
}

function StartForm({
  batch,
  onDone,
  onStarted,
}: {
  batch: Batch
  onDone: () => void
  onStarted: () => void
}) {
  const { state, dispatch } = useStore()
  const [date, setDate] = useState(todayIso())
  const [submitted, setSubmitted] = useState(false)
  const n = useNumbers(
    { au: batch.initialAu, thickness: batch.initialThicknessMm },
    {
      au: { label: 'Kadar awal', required: true, min: 1, max: 100, scale: 100 },
      thickness: { label: 'Tebal plat awal', required: true, min: 0.001 },
    },
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (n.hasErrors) return
    const blocker = batchStartBlocker(state, batch)
    if (blocker) return toast('Proses belum bisa dimulai', { tone: 'danger', description: blocker })
    dispatch({
      type: 'batches/start',
      id: batch.id,
      start: { startDate: date, initialAu: n.values.au!, initialThicknessMm: n.values.thickness! },
    })
    toast(`Batch ${batch.code} mulai berjalan`, {
      tone: 'success',
      description: `Di ${bathName(state.baths, batch.bathId)}. Catat pembacaan tiap interval.`,
    })
    onDone()
    onStarted()
  }
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Mulai proses {batch.code}</DialogTitle>
        <DialogDescription>
          Ukur dua hal ini sebelum rak masuk {bathName(state.baths, batch.bathId)}.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <NumberField
          label="Kadar emas awal (X-ray)"
          unit="%"
          required
          autoFocus
          {...n.bind('au')}
          error={submitted ? n.errors.au : null}
          placeholder="72,5"
        />
        <NumberField
          label="Tebal plat awal"
          unit="mm"
          required
          {...n.bind('thickness')}
          error={submitted ? n.errors.thickness : null}
          placeholder="0,205"
        />
        <FormField label="Tanggal mulai" className="sm:col-span-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            inputClassName="text-base md:text-sm"
          />
        </FormField>
      </div>
      <Footer onCancel={onDone} submit="Mulai proses" />
    </form>
  )
}

// Pengaturan batch

export function SettingsDialog({ batch, ...open }: Open & { batch: Batch }) {
  return (
    <FormDialog {...open} size="lg">
      {(done) => <SettingsForm batch={batch} onDone={done} />}
    </FormDialog>
  )
}

function SettingsForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const { dispatch } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const [note, setNote] = useState(batch.note)
  const fromRack = batch.prep.load.length > 0
  const n = useNumbers(
    {
      targetMicron: batch.targetMicron,
      targetAuPct: batch.prep.targetAuPct,
      bathVolumeL: batch.prep.bathVolumeL,
      efficiencyPct: batch.prep.efficiencyPct,
      refAuMin: batch.refAuMin,
      refAuMax: batch.refAuMax,
      targetAu: batch.targetAu,
      initialAu: batch.initialAu,
      initialThicknessMm: batch.initialThicknessMm,
      surfaceAreaDm2: batch.surfaceAreaDm2,
      theoreticalAmm: batch.theoreticalAmm,
      phMin: batch.phMin,
      phMax: batch.phMax,
      tempMin: batch.tempMin,
      tempMax: batch.tempMax,
    },
    {
      targetMicron: { label: 'Target tebal', required: true, min: 1 },
      targetAuPct: { label: 'Target kadar emas', required: true, min: 1, max: 100 },
      bathVolumeL: { label: 'Volume larutan', required: true, min: 1 },
      efficiencyPct: { label: 'Efisiensi arus', required: true, min: 1, max: 100 },
      refAuMin: { label: 'Batas bawah', required: true, min: 1, max: 100, scale: 100 },
      refAuMax: { label: 'Batas atas', required: true, min: 1, max: 100, scale: 100 },
      targetAu: { label: 'Titik tengah', required: true, min: 1, max: 100, scale: 100 },
      initialAu: { label: 'Kadar awal', min: 1, max: 100, scale: 100 },
      initialThicknessMm: { label: 'Tebal plat awal', min: 0.001 },
      surfaceAreaDm2: { label: 'Luas permukaan', min: 0.001 },
      theoreticalAmm: { label: 'AMM teori', min: 1 },
      phMin: { label: 'pH terendah', min: 0, max: 14 },
      phMax: { label: 'pH tertinggi', min: 0, max: 14 },
      tempMin: { label: 'Suhu terendah', min: 0, max: 100 },
      tempMax: { label: 'Suhu tertinggi', min: 0, max: 100 },
    },
  )
  const v = n.values
  const bandError =
    v.refAuMin !== null && v.refAuMax !== null && v.refAuMax < v.refAuMin
      ? 'Batas atas harus lebih besar.'
      : null
  const err = (k: keyof typeof n.errors) => (submitted ? n.errors[k] : null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (n.hasErrors || bandError) return
    dispatch({
      type: 'batches/update',
      id: batch.id,
      patch: {
        targetMicron: v.targetMicron!,
        refAuMin: v.refAuMin!,
        refAuMax: v.refAuMax!,
        targetAu: v.targetAu!,
        initialAu: v.initialAu,
        initialThicknessMm: v.initialThicknessMm,
        surfaceAreaDm2: v.surfaceAreaDm2,
        theoreticalAmm: v.theoreticalAmm,
        phMin: v.phMin,
        phMax: v.phMax,
        tempMin: v.tempMin,
        tempMax: v.tempMax,
        note: note.trim(),
      },
    })
    dispatch({
      type: 'batches/updatePrep',
      id: batch.id,
      patch: { targetAuPct: v.targetAuPct!, bathVolumeL: v.bathVolumeL!, efficiencyPct: v.efficiencyPct! },
    })
    toast('Pengaturan disimpan', { tone: 'success', description: `Batch ${batch.code}` })
    onDone()
  }

  const section = (title: string) => (
    <p className="mt-2 font-semibold tracking-wider sm:col-span-2 text-[11px] text-muted uppercase">
      {title}
    </p>
  )
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Pengaturan {batch.code}</DialogTitle>
        <DialogDescription>Semua angka batch dihitung ulang setelah disimpan.</DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        {section('Target')}
        <NumberField
          label="Target tebal"
          unit="µm"
          required
          {...n.bind('targetMicron')}
          error={err('targetMicron')}
        />
        <NumberField
          label="Target kadar emas"
          unit="%"
          required
          {...n.bind('targetAuPct')}
          error={err('targetAuPct')}
          hint="Untuk hitung GPC dan CuCN."
        />
        {section('Saran volt dari X-ray')}
        <NumberField
          label="Batas bawah kadar"
          unit="%"
          required
          {...n.bind('refAuMin')}
          error={err('refAuMin')}
        />
        <NumberField
          label="Batas atas kadar"
          unit="%"
          required
          {...n.bind('refAuMax')}
          error={err('refAuMax') ?? (submitted ? bandError : null)}
        />
        <NumberField
          label="Titik tengah yang dikejar"
          unit="%"
          required
          {...n.bind('targetAu')}
          error={err('targetAu')}
          hint="Saran volt mengarah ke angka ini."
        />
        {section('Batas aman kondisi bak (opsional)')}
        <NumberField label="pH terendah" {...n.bind('phMin')} error={err('phMin')} />
        <NumberField label="pH tertinggi" {...n.bind('phMax')} error={err('phMax')} />
        <NumberField label="Suhu terendah" unit="°C" {...n.bind('tempMin')} error={err('tempMin')} />
        <NumberField
          label="Suhu tertinggi"
          unit="°C"
          {...n.bind('tempMax')}
          error={err('tempMax')}
          hint="Kosongkan bila belum ada standar."
        />
        {section('Larutan')}
        <NumberField
          label="Volume larutan"
          unit="L"
          required
          {...n.bind('bathVolumeL')}
          error={err('bathVolumeL')}
        />
        <NumberField
          label="Efisiensi arus (asumsi)"
          unit="%"
          required
          {...n.bind('efficiencyPct')}
          error={err('efficiencyPct')}
          hint="Excel memakai 95 %."
        />
        {batch.status !== 'preparing' && (
          <>
            {section('Ukuran awal')}
            <NumberField label="Kadar emas awal" unit="%" {...n.bind('initialAu')} error={err('initialAu')} />
            <NumberField
              label="Tebal plat awal"
              unit="mm"
              {...n.bind('initialThicknessMm')}
              error={err('initialThicknessMm')}
            />
          </>
        )}
        {!fromRack && (
          <>
            {section('Tanpa isi rak')}
            <NumberField
              label="Luas permukaan"
              unit="dm²"
              {...n.bind('surfaceAreaDm2')}
              error={err('surfaceAreaDm2')}
              hint="Dipakai selama rak kosong."
            />
            <NumberField
              label="AMM teori"
              unit="A·menit"
              {...n.bind('theoreticalAmm')}
              error={err('theoreticalAmm')}
              hint="Dipakai selama rak kosong."
            />
          </>
        )}
      </div>
      <FormField label="Catatan" className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </FormField>
      <Footer onCancel={onDone} submit="Simpan pengaturan" />
    </form>
  )
}

// Hasil lab dan hasil akhir

const LAB_FIELDS = {
  auStart: { label: 'Emas sebelum proses', group: 'chem' },
  auEnd: { label: 'Emas setelah proses', group: 'chem' },
  cuStart: { label: 'Tembaga sebelum', group: 'chem' },
  cuEnd: { label: 'Tembaga setelah', group: 'chem' },
  kcnStart: { label: 'KCN sebelum', group: 'chem' },
  kcnEnd: { label: 'KCN setelah', group: 'chem' },
  kcnTarget: { label: 'Target KCN', group: 'chem' },
  basaCu: { label: 'Tembaga basa · Cu', group: 'pretreat' },
  basaKcn: { label: 'Tembaga basa · KCN', group: 'pretreat' },
  asamCu: { label: 'Tembaga asam · Cu', group: 'pretreat' },
  asamH2so4: { label: 'Tembaga asam · H₂SO₄', group: 'pretreat' },
} as const
type LabKey = keyof typeof LAB_FIELDS

export function LabDialog({ batch, ...open }: Open & { batch: Batch }) {
  return (
    <FormDialog {...open} size="lg">
      {(done) => <LabForm batch={batch} onDone={done} />}
    </FormDialog>
  )
}

function LabForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const { dispatch } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const keys = Object.keys(LAB_FIELDS) as LabKey[]
  const { chem } = batch.prep
  const current = { ...chem, ...batch.prep.pretreat }
  // A sample with no results yet starts at the current time; results saved without a time stay without one.
  const tested = (
    values: Record<`${'au' | 'cu' | 'kcn'}${'Start' | 'End'}`, number | null>,
    side: 'Start' | 'End',
  ) => (['au', 'cu', 'kcn'] as const).some((el) => values[`${el}${side}`] !== null)
  const now = toLocalIso(new Date())
  const [startAt, setStartAt] = useState(chem.startAt ?? (tested(chem, 'Start') ? '' : now))
  const [endAt, setEndAt] = useState(chem.endAt ?? (tested(chem, 'End') ? '' : now))
  const n = useNumbers(
    Object.fromEntries(keys.map((k) => [k, current[k]])) as Record<LabKey, number | null>,
    Object.fromEntries(keys.map((k) => [k, { label: LAB_FIELDS[k].label, min: 0 }])) as Record<
      LabKey,
      { label: string; min: number }
    >,
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (n.hasErrors) return
    const pick = (group: 'chem' | 'pretreat') =>
      Object.fromEntries(keys.filter((k) => LAB_FIELDS[k].group === group).map((k) => [k, n.values[k]]))
    dispatch({
      type: 'batches/updatePrep',
      id: batch.id,
      patch: {
        chem: {
          ...pick('chem'),
          startAt: tested(n.values, 'Start') ? startAt || null : null,
          endAt: tested(n.values, 'End') ? endAt || null : null,
        },
        pretreat: pick('pretreat'),
      } as PrepPatch,
    })
    toast('Hasil lab disimpan', { tone: 'success', description: `Batch ${batch.code}` })
    onDone()
  }
  const field = (k: LabKey) => (
    <NumberField
      key={k}
      label={LAB_FIELDS[k].label}
      unit="g/L"
      {...n.bind(k)}
      error={submitted ? n.errors[k] : null}
    />
  )
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Hasil lab {batch.code}</DialogTitle>
        <DialogDescription>
          Isi dari hasil AAS dan titrasi. Yang belum diuji biarkan kosong.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <p className="font-semibold tracking-wider sm:col-span-2 text-[11px] text-muted uppercase">
          Larutan emas
        </p>
        <FormField label="Waktu uji sebelum proses" hint="Tanggal dan jam sampel diuji">
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            inputClassName="text-base tabular-nums md:text-sm"
          />
        </FormField>
        <FormField label="Waktu uji setelah proses" hint="Tanggal dan jam sampel diuji">
          <Input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            inputClassName="text-base tabular-nums md:text-sm"
          />
        </FormField>
        {keys.filter((k) => LAB_FIELDS[k].group === 'chem').map(field)}
        <p className="mt-2 font-semibold tracking-wider sm:col-span-2 text-[11px] text-muted uppercase">
          Tangki pre-treatment (optimal {PRETREAT_CHECKS.map((c) => c.optimal).join(' · ')} g/L)
        </p>
        {keys.filter((k) => LAB_FIELDS[k].group === 'pretreat').map(field)}
      </div>
      <Footer onCancel={onDone} submit="Simpan hasil lab" />
    </form>
  )
}

export function ResultDialog({ batch, ...open }: Open & { batch: Batch }) {
  return <FormDialog {...open}>{(done) => <ResultForm batch={batch} onDone={done} />}</FormDialog>
}

function ResultForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const { dispatch } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const hasLog = batch.readings.length > 0
  const n = useNumbers(
    {
      actualAuPct: batch.prep.actualAuPct,
      gpcAddedG: batch.prep.gpcAddedG,
      totalAmmReal: batch.prep.totalAmmReal,
      actualMicron: batch.prep.actualMicron,
    },
    {
      actualAuPct: { label: 'Kadar emas produk', min: 1, max: 100 },
      gpcAddedG: { label: 'GPC yang ditambahkan', min: 0 },
      totalAmmReal: { label: 'Total AMM', min: 0 },
      actualMicron: { label: 'Tebal akhir', min: 0 },
    },
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (n.hasErrors) return
    dispatch({ type: 'batches/updatePrep', id: batch.id, patch: n.values })
    toast('Hasil akhir disimpan', { tone: 'success', description: `Batch ${batch.code}` })
    onDone()
  }
  const err = (k: keyof typeof n.errors) => (submitted ? n.errors[k] : null)
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Hasil akhir {batch.code}</DialogTitle>
        <DialogDescription>Berat akhir tiap barang diisi di daftar rak.</DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <NumberField
          label="Kadar emas produk"
          unit="%"
          {...n.bind('actualAuPct')}
          error={err('actualAuPct')}
          hint="Hasil uji barang jadi."
        />
        <NumberField
          label="GPC yang ditambahkan"
          unit="g"
          {...n.bind('gpcAddedG')}
          error={err('gpcAddedG')}
        />
        {!hasLog && (
          <>
            <NumberField
              label="Total AMM di meter"
              unit="A·menit"
              {...n.bind('totalAmmReal')}
              error={err('totalAmmReal')}
              hint="Batch ini tanpa log pembacaan."
            />
            <NumberField
              label="Tebal akhir"
              unit="µm"
              {...n.bind('actualMicron')}
              error={err('actualMicron')}
            />
          </>
        )}
      </div>
      <Footer onCancel={onDone} submit="Simpan hasil" />
    </form>
  )
}

// Isi rak

export function LoadLineDialog({
  batch,
  editing,
  pieces,
  ...open
}: Open & { batch: Batch; editing: LoadLine | null; pieces: number }) {
  return (
    <FormDialog {...open}>
      {(done) => <LoadLineForm batch={batch} editing={editing} pieces={pieces} onDone={done} />}
    </FormDialog>
  )
}

function LoadLineForm({
  batch,
  editing,
  pieces,
  onDone,
}: {
  batch: Batch
  editing: LoadLine | null
  pieces: number
  onDone: () => void
}) {
  const { state, dispatch } = useStore()
  const { models, parts } = useCatalog()
  const [kind, setKind] = useState<'model' | 'part'>(editing?.partId ? 'part' : 'model')
  const [modelId, setModelId] = useState<string | null>(editing?.modelId ?? null)
  const [partId, setPartId] = useState(editing?.partId ?? state.parts[0]?.id ?? '')
  const [label, setLabel] = useState(editing?.label ?? '')
  const [submitted, setSubmitted] = useState(false)
  const n = useNumbers(
    {
      qty: editing?.qty ?? null,
      start: editing?.weightStartG ?? null,
      afterAcid: editing?.weightAfterAcidG ?? null,
      final: editing?.weightFinalG ?? null,
    },
    {
      qty: { label: 'Jumlah', required: true, min: 0.01 },
      start: { label: 'Berat awal', min: 0 },
      afterAcid: { label: 'Berat setelah tembaga asam', min: 0 },
      final: { label: 'Berat akhir', min: 0 },
    },
  )
  const itemError = kind === 'model' && !modelId ? 'Pilih model.' : null
  const unitArea =
    kind === 'model' ? (modelId ? models.get(modelId)?.areaDm2 : undefined) : parts.get(partId)?.areaDm2
  const isHook = kind === 'part' && /cantolan/i.test(parts.get(partId)?.name ?? '')
  const { qty, start, afterAcid, final } = n.values

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (n.hasErrors || itemError) return
    const line: LoadLine = {
      id: editing?.id ?? `ld-${batch.id.slice(3)}-${Date.now().toString(36)}`,
      modelId: kind === 'model' ? modelId : null,
      partId: kind === 'part' ? partId : null,
      label: label.trim(),
      qty: qty!,
      weightStartG: start,
      weightAfterAcidG: afterAcid,
      weightFinalG: final,
    }
    dispatch({ type: 'batches/saveLine', batchId: batch.id, line })
    const name = kind === 'model' ? models.get(modelId!)?.code : parts.get(partId)?.name
    toast(editing ? 'Isi rak diperbarui' : 'Masuk ke rak', {
      tone: 'success',
      description: `${name} × ${fmtNumber(line.qty, 1)}`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Ubah isi rak' : 'Tambah ke rak'}</DialogTitle>
        <DialogDescription>Luas dihitung dari daftar model, tidak perlu diketik.</DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <SegmentedControl
          aria-label="Jenis"
          className="sm:col-span-2"
          options={[
            { value: 'model', label: 'Barang' },
            { value: 'part', label: 'Plat atau kawat' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as 'model' | 'part')}
        />
        {kind === 'model' ? (
          <FormField
            label="Model barang"
            required
            error={submitted ? itemError : null}
            className="sm:col-span-2"
          >
            <Combobox
              items={state.models}
              getKey={(m) => m.id}
              getLabel={(m) => m.code}
              getDescription={(m) => `${fmtNumber(m.areaDm2, 5)} dm² per pcs`}
              getKeywords={(m) => [m.family]}
              renderIcon={(m) =>
                m.image ? <img src={m.image} alt="" className="size-7 rounded-lg object-cover" /> : null
              }
              value={modelId}
              onChange={setModelId}
              placeholder="Pilih model"
              searchPlaceholder="Ketik kode, misalnya AT5713"
              emptyText="Model belum ada. Tambahkan di Daftar model."
            />
          </FormField>
        ) : (
          <FormField label="Plat atau kawat" required className="sm:col-span-2">
            <NativeSelect
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              options={state.parts.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FormField>
        )}
        <NumberField
          label="Jumlah"
          unit={kind === 'model' ? 'pcs' : 'buah'}
          required
          {...n.bind('qty')}
          error={submitted ? n.errors.qty : null}
          hint={
            isHook && pieces > 0
              ? `Biasanya sama dengan jumlah barang: ${fmtNumber(pieces, 0)}`
              : unitArea !== undefined && qty
                ? `Luas ${fmtNumber(unitArea * qty, 4)} dm²`
                : undefined
          }
        />
        <FormField label="Posisi di rak" hint="Opsional, misalnya A atau B">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            inputClassName="text-base md:text-sm"
          />
        </FormField>
        <p className="mt-2 font-semibold tracking-wider sm:col-span-2 text-[11px] text-muted uppercase">
          Timbangan (opsional)
        </p>
        <NumberField
          label="Berat awal"
          unit="g"
          {...n.bind('start')}
          error={submitted ? n.errors.start : null}
        />
        <NumberField
          label="Setelah tembaga asam"
          unit="g"
          {...n.bind('afterAcid')}
          error={submitted ? n.errors.afterAcid : null}
        />
        <NumberField
          label="Berat akhir"
          unit="g"
          {...n.bind('final')}
          error={submitted ? n.errors.final : null}
          hint={
            final !== null && afterAcid !== null
              ? `Emas menempel ${fmtNumber(final - afterAcid, 2)} g`
              : 'Setelah keluar dari bak'
          }
        />
      </div>
      <Footer onCancel={onDone} submit={editing ? 'Simpan' : 'Masukkan ke rak'} />
    </form>
  )
}
