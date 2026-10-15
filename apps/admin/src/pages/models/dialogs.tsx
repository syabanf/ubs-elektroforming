import { TIN_TARE_G, fmtNumber, tinWeight } from '@ef/fixtures'
import type { Model, RackPart } from '@ef/types'
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
  Textarea,
  toast,
} from '@ef/ui'
import { useState } from 'react'
import { NumberField } from '../../components/NumberField'
import { numberError, parseNum, toInput } from '../../lib/form'
import { useStore } from '../../state/store'

const slug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "CH4222 (12)" → family CH4222, size 12; any other code is its own family. */
function splitCode(code: string) {
  const match = /^([A-Za-z]+\d+)\s*\((\d+)\)$/.exec(code.trim())
  return match
    ? { family: match[1]!.toUpperCase(), size: Number(match[2]) }
    : { family: code.trim(), size: null }
}

/** "3,91; 3,93 4,35" → [3.91, 3.93, 4.35]; null when a value is not a number. */
function parseWeighings(text: string): number[] | null {
  const parts = text.split(/[;\s]+/).filter(Boolean)
  const values = parts.map((p) => Number(p.replace(',', '.')))
  return values.some((v) => Number.isNaN(v) || v <= 0) ? null : values
}

type DialogProps<T> = { open: boolean; onOpenChange: (open: boolean) => void; editing: T | null }

export function ModelDialog({ open, onOpenChange, editing }: DialogProps<Model>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <ModelForm editing={editing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ModelForm({ editing, onDone }: { editing: Model | null; onDone: () => void }) {
  const { state, dispatch } = useStore()
  const [code, setCode] = useState(editing?.code ?? '')
  const [area, setArea] = useState(toInput(editing?.areaDm2 ?? null))
  const [weighings, setWeighings] = useState(editing?.tinWeighings.map((w) => toInput(w)).join('; ') ?? '')
  const [manualTin, setManualTin] = useState(
    editing && editing.tinWeighings.length === 0 ? toInput(editing.tinWeightG) : '',
  )
  const [note, setNote] = useState(editing?.note ?? '')
  const [submitted, setSubmitted] = useState(false)

  const areaValue = parseNum(area)
  const weighingValues = parseWeighings(weighings)
  const manualValue = parseNum(manualTin)
  const duplicate = state.models.some(
    (m) => m.code.toLowerCase() === code.trim().toLowerCase() && m.id !== editing?.id,
  )
  const errors = {
    code: !code.trim() ? 'Isi kode model.' : duplicate ? `Model ${code.trim()} sudah ada.` : null,
    area: numberError(areaValue, { required: true, min: 0.00001, label: 'Luas' }),
    weighings: weighingValues === null ? 'Tulis angka timbangan dipisah titik koma.' : null,
    manualTin: numberError(manualValue, { min: 0, label: 'Berat timah' }),
  }
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null)
  const derivedTin = weighingValues?.length ? tinWeight(weighingValues) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const model: Model = {
      id: editing?.id ?? `md-${slug(code)}`,
      code: code.trim(),
      ...splitCode(code),
      areaDm2: areaValue!,
      tinWeighings: weighingValues ?? [],
      tinWeightG: derivedTin ?? manualValue,
      image: editing?.image ?? null,
      note: note.trim(),
    }
    dispatch({ type: 'models/save', model })
    toast(editing ? 'Model diperbarui' : 'Model ditambahkan', { tone: 'success', description: model.code })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Ubah ${editing.code}` : 'Model baru'}</DialogTitle>
        <DialogDescription>
          Ukuran cincin ditulis dalam kurung, misalnya CH4222 (12), agar masuk ke famili yang sama.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 grid grid-cols-1">
        {editing?.image && (
          <img
            src={editing.image}
            alt={`Foto ${editing.code}`}
            className="h-36 rounded-2xl w-full bg-surface-2 object-contain"
          />
        )}
        <FormField label="Kode model" required error={show('code')}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus={!editing}
            inputClassName="font-mono text-base md:text-sm"
          />
        </FormField>
        <NumberField
          label="Luas area"
          unit="dm²"
          required
          value={area}
          onChange={setArea}
          error={show('area')}
          hint="Dari CAD dalam mm²? Bagi dengan 10.000."
        />
        <FormField
          label="Timbangan model timah"
          error={show('weighings')}
          hint={
            derivedTin !== null
              ? `Berat timah = rata-rata ${weighingValues!.length} timbangan − ${fmtNumber(TIN_TARE_G, 3)} = ${fmtNumber(derivedTin, 3)} g`
              : 'Pisahkan dengan titik koma, contoh 3,91; 3,93; 4,35'
          }
        >
          <Input
            value={weighings}
            onChange={(e) => setWeighings(e.target.value)}
            inputMode="decimal"
            inputClassName="tabular-nums text-base md:text-sm"
          />
        </FormField>
        {!weighingValues?.length && (
          <NumberField
            label="Berat timah langsung"
            unit="g"
            value={manualTin}
            onChange={setManualTin}
            error={show('manualTin')}
            hint="Isi bila tidak ada data timbangan."
          />
        )}
        <FormField label="Catatan">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">{editing ? 'Simpan model' : 'Tambah model'}</Button>
      </DialogFooter>
    </form>
  )
}

export function PartDialog({ open, onOpenChange, editing }: DialogProps<RackPart>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {open && <PartForm editing={editing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PartForm({ editing, onDone }: { editing: RackPart | null; onDone: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = useState(editing?.name ?? '')
  const [area, setArea] = useState(toInput(editing?.areaDm2 ?? null))
  const [submitted, setSubmitted] = useState(false)
  const areaValue = parseNum(area)
  const errors = {
    name: name.trim() ? null : 'Isi nama komponen.',
    area: numberError(areaValue, { required: true, min: 0.00001, label: 'Luas' }),
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.area) return
    dispatch({
      type: 'parts/save',
      part: { id: editing?.id ?? `pt-${slug(name)}`, name: name.trim(), areaDm2: areaValue! },
    })
    toast(editing ? 'Komponen diperbarui' : 'Komponen ditambahkan', {
      tone: 'success',
      description: name.trim(),
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Ubah ${editing.name}` : 'Komponen rak baru'}</DialogTitle>
        <DialogDescription>Luas per buah. Jumlahnya diisi saat mengisi rak batch.</DialogDescription>
      </DialogHeader>
      <div className="gap-4 grid grid-cols-1">
        <FormField label="Nama" required error={submitted ? errors.name : null}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputClassName="text-base md:text-sm"
          />
        </FormField>
        <NumberField
          label="Luas per unit"
          unit="dm²"
          required
          value={area}
          onChange={setArea}
          error={submitted ? errors.area : null}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">{editing ? 'Simpan komponen' : 'Tambah komponen'}</Button>
      </DialogFooter>
    </form>
  )
}
