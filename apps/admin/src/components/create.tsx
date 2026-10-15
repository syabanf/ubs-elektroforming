import { type NewBatch, batchCreateBlocker, batchIdFor, bathName, todayIso } from '@ef/fixtures'
import type { Batch } from '@ef/types'
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
  NativeSelect,
  SegmentedControl,
  Textarea,
  toast,
} from '@ef/ui'
import { createContext, use, useState } from 'react'
import { useNavigate } from 'react-router'
import { numberError, parseNum } from '../lib/form'
import { useStore } from '../state/store'
import { paths } from './links'
import { NumberField } from './NumberField'

const CreateContext = createContext<() => void>(() => {})

/** Lets the rail, header, phone bar and pages open the same "new batch" dialog. */
export function CreateBatchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <CreateContext value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <NewBatchForm onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </CreateContext>
  )
}

export const useCreateBatch = () => use(CreateContext)

/** B70 after B69: the highest "B" number plus one. */
function nextCode(batches: Batch[]) {
  const numbers = batches
    .map((b) => /^B(\d+)$/i.exec(b.code)?.[1])
    .filter(Boolean)
    .map(Number)
  return numbers.length ? `B${Math.max(...numbers) + 1}` : 'B1'
}

function NewBatchForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const freeBath =
    state.baths.find((b) => !state.batches.some((x) => x.bathId === b.id && x.status !== 'completed')) ??
    state.baths[0]!
  const [code, setCode] = useState(() => nextCode(state.batches))
  const [bathId, setBathId] = useState(freeBath.id)
  const [startDate, setStartDate] = useState(todayIso())
  const [micron, setMicron] = useState('120')
  const [kadar, setKadar] = useState('72')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const values = { micron: parseNum(micron), kadar: parseNum(kadar) }
  const errors = {
    code: batchCreateBlocker(state, code),
    startDate: startDate ? null : 'Pilih tanggal.',
    micron: numberError(values.micron, { required: true, min: 1, label: 'Target tebal' }),
    kadar: numberError(values.kadar, { required: true, min: 1, max: 100, label: 'Target kadar' }),
  }
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null)
  const busy = state.batches.find((b) => b.bathId === bathId && b.status === 'running')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const batch: NewBatch = {
      code,
      bathId,
      startDate,
      targetMicron: values.micron!,
      targetAuPct: values.kadar!,
      note: note.trim(),
    }
    dispatch({ type: 'batches/create', batch })
    toast(`Batch ${code.trim()} dibuat`, { tone: 'success', description: 'Lanjutkan dengan mengisi rak.' })
    onDone()
    navigate(paths.batch(batchIdFor(code), 'prep'))
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Batch baru</DialogTitle>
        <DialogDescription>
          Setelah ini Anda mengisi rak dan hasil lab, lalu menekan Mulai proses.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Kode batch" required error={show('code')} hint="Diisi otomatis, boleh diganti.">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputClassName="font-mono text-base md:text-sm"
          />
        </FormField>
        <FormField label="Tanggal" required error={show('startDate')}>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            inputClassName="text-base md:text-sm"
          />
        </FormField>
        <FormField
          label="Bak"
          required
          className="sm:col-span-2"
          hint={
            busy
              ? `${bathName(state.baths, bathId)} masih dipakai ${busy.code}. Persiapan tetap bisa dimulai sekarang.`
              : undefined
          }
        >
          {state.baths.length <= 4 ? (
            <SegmentedControl
              aria-label="Bak"
              options={state.baths.map((b) => ({ value: b.id, label: b.name }))}
              value={bathId}
              onChange={setBathId}
            />
          ) : (
            <NativeSelect
              value={bathId}
              onChange={(e) => setBathId(e.target.value)}
              options={state.baths.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
        </FormField>
        <NumberField
          label="Target tebal"
          unit="µm"
          required
          value={micron}
          onChange={setMicron}
          error={show('micron')}
        />
        <NumberField
          label="Target kadar emas"
          unit="%"
          required
          value={kadar}
          onChange={setKadar}
          error={show('kadar')}
        />
      </div>
      <FormField label="Catatan" className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Opsional" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Buat batch</Button>
      </DialogFooter>
    </form>
  )
}
