import { bathIdFor, bathSaveBlocker, nextBathName } from '@ef/fixtures'
import type { Bath } from '@ef/types'
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
import { useStore } from '../state/store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Bath | null
  /** Called with the saved bath, so the page can fly the 3D camera to it. */
  onSaved?: (bath: Bath) => void
}

export function BathDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {open && <BathForm {...rest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function BathForm({
  editing,
  onSaved,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = useState(editing?.name ?? nextBathName(state.baths))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [submitted, setSubmitted] = useState(false)
  const bath: Bath = {
    id: editing?.id ?? bathIdFor(state.baths, name),
    name,
    description: description.trim(),
  }
  const error = bathSaveBlocker(state, bath)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error) return
    dispatch({ type: 'baths/save', bath })
    toast(editing ? 'Bak diperbarui' : `${bath.name.trim()} ditambahkan`, {
      tone: 'success',
      description: editing ? bath.name.trim() : 'Muncul di Beranda, form batch baru dan Monitor 3D.',
    })
    onDone()
    onSaved?.(bath)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Ubah ${editing.name}` : 'Tambah bak'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Nama baru langsung dipakai di semua halaman.'
            : 'Bak baru siap dipakai batch berikutnya.'}
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 grid grid-cols-1">
        <FormField label="Nama bak" required error={submitted ? error : null}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            inputClassName="text-base md:text-sm"
          />
        </FormField>
        <FormField label="Keterangan" hint="Opsional, misalnya lini atau lokasi">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">{editing ? 'Simpan bak' : 'Tambah bak'}</Button>
      </DialogFooter>
    </form>
  )
}
