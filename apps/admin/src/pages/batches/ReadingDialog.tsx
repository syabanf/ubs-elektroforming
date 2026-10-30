import {
  type BatchSummary,
  type ReadingInput,
  fmtClock,
  fmtNumber,
  fmtPercent,
  micronFromThickness,
  minutesBetween,
  nextReadingNo,
  readingBlocker,
  readingFromSample,
  SCADA_STALE_SEC,
  sampleAgeSec,
  toLocalIso,
} from '@ef/fixtures'
import type { Batch, Reading } from '@ef/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  toast,
} from '@ef/ui'
import { RadioTower, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { NumberField } from '../../components/NumberField'
import { numberError, parseNum, toInput } from '../../lib/form'
import { useBathSample, useScada } from '../../state/scada'
import { useStore } from '../../state/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  batch: Batch
  summary: BatchSummary
  editing: Reading | null
}

export function ReadingDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && <ReadingForm {...rest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

type NumKey =
  'no' | 'minutes' | 'volt' | 'ampere' | 'ph' | 'tempC' | 'ammReal' | 'au' | 'thicknessMm' | 'setTargetAdm2'

/** The reading logged before `no`, whose clock time sets the interval of this one. */
const previousOf = (batch: Batch, no: number, exceptId?: string) =>
  batch.readings.filter((r) => r.no < no && r.id !== exceptId).at(-1)

/** A new reading starts at the current time, with the interval since the last log and the volt it used. */
function initialForm(batch: Batch, editing: Reading | null) {
  const recordedAt = editing ? (editing.recordedAt ?? '') : toLocalIso(new Date())
  const no = editing?.no ?? nextReadingNo(batch)
  const prev = previousOf(batch, no, editing?.id)
  const minutes = editing
    ? editing.minutes
    : prev?.recordedAt
      ? minutesBetween(prev.recordedAt, recordedAt)
      : (prev?.minutes ?? null)
  const r = editing
  const text: Record<NumKey, string> = {
    no: String(no),
    minutes: toInput(minutes),
    volt: toInput(r ? r.volt : (prev?.volt ?? null)),
    ampere: toInput(r?.ampere ?? null),
    ph: toInput(r?.ph ?? null),
    tempC: toInput(r?.tempC ?? null),
    ammReal: toInput(r?.ammReal ?? null),
    au: toInput(r?.au ?? null, 100),
    thicknessMm: toInput(r?.thicknessMm ?? null),
    setTargetAdm2: toInput(r?.setTargetAdm2 ?? null),
  }
  return { recordedAt, text }
}

function ReadingForm({
  batch,
  summary,
  editing,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const { dispatch } = useStore()
  const [initial] = useState(() => initialForm(batch, editing))
  const [recordedAt, setRecordedAt] = useState(initial.recordedAt)
  const [form, setForm] = useState(initial.text)
  // The interval follows the clock time until the operator types one.
  const [minutesTyped, setMinutesTyped] = useState(!!editing)
  const [submitted, setSubmitted] = useState(false)
  const set = (key: NumKey) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  // A new reading can take volt, ampere, pH, temperature and the AMM meter from a live SCADA message.
  const { mode } = useScada()
  const sample = useBathSample(batch.bathId)
  const live = !editing && sample && sampleAgeSec(sample, new Date()) <= SCADA_STALE_SEC ? sample : undefined
  const [scadaFilled, setScadaFilled] = useState<Partial<Record<NumKey, string>>>({})
  const fillFromScada = () => {
    const r = readingFromSample(live!)
    const values = Object.fromEntries(
      Object.entries(r)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [key, toInput(value)]),
    ) as Partial<Record<NumKey, string>>
    setForm((f) => ({ ...f, ...values }))
    setScadaFilled(values)
  }
  const fromScada = (key: NumKey) => scadaFilled[key] !== undefined && scadaFilled[key] === form[key]
  const scadaHint = (key: NumKey) => (fromScada(key) ? 'Dari SCADA' : undefined)

  const v = Object.fromEntries(Object.entries(form).map(([k, text]) => [k, parseNum(text)])) as Record<
    NumKey,
    number | null
  >
  const prev = v.no === null ? undefined : previousOf(batch, v.no, editing?.id)
  const changeTime = (value: string) => {
    setRecordedAt(value)
    if (!minutesTyped && prev?.recordedAt && value)
      set('minutes')(toInput(minutesBetween(prev.recordedAt, value)))
  }

  const duplicateNo = batch.readings.some((r) => r.no === v.no && r.id !== editing?.id)
  const beforePrev = !!recordedAt && !!prev?.recordedAt && recordedAt <= prev.recordedAt
  const errors = {
    no:
      numberError(v.no, { required: true, min: 1, label: 'Nomor' }) ??
      (duplicateNo ? `Nomor ${v.no} sudah dipakai.` : null),
    recordedAt: beforePrev ? `Harus setelah pencatatan sebelumnya (${fmtClock(prev!.recordedAt)}).` : null,
    minutes: numberError(v.minutes, { required: true, min: 1, label: 'Lama interval' }),
    volt: numberError(v.volt, { required: true, min: 0.01, max: 10, label: 'Volt' }),
    ampere: numberError(v.ampere, { required: true, min: 0, label: 'Ampere' }),
    ph: numberError(v.ph, { min: 0, max: 14, label: 'pH' }),
    tempC: numberError(v.tempC, { min: 0, max: 100, label: 'Suhu' }),
    ammReal: numberError(v.ammReal, { min: 0, label: 'Angka meter AMM' }),
    au: numberError(v.au, { min: 1, max: 100, label: 'Kadar emas' }),
    thicknessMm: numberError(v.thicknessMm, { min: 0.001, label: 'Tebal plat' }),
    setTargetAdm2: numberError(v.setTargetAdm2, { min: 0, label: 'Target arus' }),
  }
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null)
  const valid = (x: number | null) => (x === null || Number.isNaN(x) ? null : x)

  const fraction = valid(v.au) === null ? null : v.au! / 100
  const micron = micronFromThickness(valid(v.thicknessMm), batch.initialThicknessMm)
  const area = summary.areaDm2
  const next = summary.next
  const suggestion =
    !editing && next.directive !== 'insufficient' && next.suggestedVolt !== null
      ? Number(next.suggestedVolt.toFixed(2))
      : null
  const lastAmm = summary.lastAmmReal
  const ammBackwards = !editing && lastAmm !== null && valid(v.ammReal) !== null && v.ammReal! < lastAmm

  const preview = [
    {
      label: 'Arus per luas',
      value: valid(v.ampere) === null || area === null ? '–' : `${fmtNumber(v.ampere! / area, 3)} A/dm²`,
    },
    {
      label: 'AMM interval ini',
      value:
        valid(v.ampere) === null || valid(v.minutes) === null ? '–' : fmtNumber(v.ampere! * v.minutes!, 1),
    },
    { label: 'Tebal emas', value: micron === null ? '–' : `${fmtNumber(micron, 1)} µm` },
    { label: 'Tembaga', value: fraction === null ? '–' : fmtPercent(1 - fraction) },
  ]

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const blocker = readingBlocker(batch)
    if (blocker) return toast('Pembacaan tidak disimpan', { tone: 'danger', description: blocker })
    const reading: ReadingInput = {
      no: v.no!,
      recordedAt: recordedAt || null,
      minutes: v.minutes,
      volt: v.volt,
      ampere: v.ampere,
      ph: v.ph,
      tempC: v.tempC,
      setTargetAdm2: v.setTargetAdm2,
      ammReal: v.ammReal,
      au: fraction,
      thicknessMm: v.thicknessMm,
      source: editing
        ? editing.source
        : (Object.keys(scadaFilled) as NumKey[]).some(fromScada)
          ? 'scada'
          : 'manual',
    }
    if (editing) dispatch({ type: 'readings/update', batchId: batch.id, readingId: editing.id, reading })
    else dispatch({ type: 'readings/add', batchId: batch.id, reading })
    toast(editing ? 'Pembacaan diperbarui' : 'Pembacaan tersimpan', {
      tone: 'success',
      description: `${batch.code} · pembacaan ke-${reading.no}${reading.recordedAt ? ` jam ${fmtClock(reading.recordedAt)}` : ''}`,
    })
    onDone()
  }

  const heading = (text: string) => (
    <p className="mt-1 font-semibold tracking-wider sm:col-span-4 col-span-2 text-[11px] text-muted uppercase">
      {text}
    </p>
  )
  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Ubah pembacaan ke-${editing.no}` : `Pembacaan ke-${form.no}`}</DialogTitle>
        <DialogDescription>
          Batch <span className="font-mono">{batch.code}</span>. Catat setiap 1 sampai 2 jam.
          {prev?.recordedAt && ` Sebelumnya jam ${fmtClock(prev.recordedAt)}.`}
        </DialogDescription>
      </DialogHeader>
      {live && (
        <div className="mb-3 gap-3 rounded-2xl p-3 text-sm flex flex-wrap items-center justify-between bg-info-soft">
          <span className="gap-2 flex items-start">
            <RadioTower className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              SCADA jam {live.at.slice(11).replaceAll(':', '.')}
              {mode === 'simulasi' && ' (simulasi)'}:{' '}
              <span className="font-semibold tabular-nums">
                {fmtNumber(live.volt, 2)} V · {fmtNumber(live.ampere, 2)} A · pH {fmtNumber(live.ph, 2)} ·{' '}
                {fmtNumber(live.tempC, 1)} °C · AMM {fmtNumber(live.amm, 1)}
              </span>
            </span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={fillFromScada}>
            <RadioTower />
            Isi dari SCADA
          </Button>
        </div>
      )}
      {suggestion !== null && (
        <div className="mb-4 gap-3 rounded-2xl p-3 text-sm flex flex-wrap items-center justify-between bg-surface-2">
          <span>
            Saran volt untuk interval ini:{' '}
            <span className="font-semibold tabular-nums">{fmtNumber(suggestion, 2)} V</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => set('volt')(toInput(suggestion))}>
            <Sparkles />
            Pakai saran
          </Button>
        </div>
      )}
      <div className="gap-4 sm:grid-cols-4 grid grid-cols-2">
        {heading('Kondisi bak')}
        <FormField label="Jam catat" error={show('recordedAt')} className="sm:col-span-1 col-span-2">
          <Input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => changeTime(e.target.value)}
            inputClassName="text-base tabular-nums md:text-sm"
          />
        </FormField>
        <NumberField
          label="pH"
          value={form.ph}
          onChange={set('ph')}
          error={show('ph')}
          hint={scadaHint('ph')}
          autoFocus
          placeholder={toInput(summary.latestPh)}
        />
        <NumberField
          label="Suhu"
          unit="°C"
          value={form.tempC}
          onChange={set('tempC')}
          error={show('tempC')}
          hint={scadaHint('tempC')}
          placeholder={toInput(summary.latestTempC)}
        />
        <NumberField
          label="Volt"
          unit="V"
          required
          value={form.volt}
          onChange={set('volt')}
          error={show('volt')}
          hint={scadaHint('volt')}
        />

        {heading('Dari mesin')}
        <NumberField
          label="Lama interval"
          unit="menit"
          required
          value={form.minutes}
          onChange={(value) => {
            setMinutesTyped(true)
            set('minutes')(value)
          }}
          error={show('minutes')}
          hint={!minutesTyped && prev?.recordedAt ? 'Dihitung dari jam catat' : undefined}
        />
        <NumberField
          label="Ampere"
          unit="A"
          required
          value={form.ampere}
          onChange={set('ampere')}
          error={show('ampere')}
          hint={scadaHint('ampere')}
          placeholder={toInput(summary.latestAmpere)}
        />
        <NumberField
          label="Angka meter AMM"
          value={form.ammReal}
          onChange={set('ammReal')}
          error={show('ammReal')}
          hint={
            fromScada('ammReal') ? (
              'Dari SCADA'
            ) : ammBackwards ? (
              <span className="text-warning">Lebih kecil dari sebelumnya ({fmtNumber(lastAmm, 1)}).</span>
            ) : lastAmm !== null && !editing ? (
              `Sebelumnya ${fmtNumber(lastAmm, 1)}`
            ) : undefined
          }
        />
        <NumberField
          label="Target arus"
          unit="A/dm²"
          value={form.setTargetAdm2}
          onChange={set('setTargetAdm2')}
          error={show('setTargetAdm2')}
          hint="Opsional"
        />

        {heading('Hasil ukur (isi bila diukur)')}
        <NumberField
          label="Kadar emas (X-ray)"
          unit="%"
          value={form.au}
          onChange={set('au')}
          error={show('au')}
        />
        <NumberField
          label="Tebal plat"
          unit="mm"
          value={form.thicknessMm}
          onChange={set('thicknessMm')}
          error={show('thicknessMm')}
        />
        <NumberField label="Nomor urut" required value={form.no} onChange={set('no')} error={show('no')} />
      </div>
      <dl className="mt-5 gap-2 rounded-2xl p-3 sm:grid-cols-4 grid grid-cols-2 bg-surface-2">
        {preview.map((p) => (
          <div key={p.label} className="px-1">
            <dt className="font-semibold tracking-wider text-[11px] text-muted uppercase">{p.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{p.value}</dd>
          </div>
        ))}
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">{editing ? 'Simpan perubahan' : 'Simpan pembacaan'}</Button>
      </DialogFooter>
    </form>
  )
}
