import { fmtToday } from '@ef/fixtures'
import { ActionMenu, Button, ConfirmDialog } from '@ef/ui'
import { MoreHorizontal, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { useCreateBatch } from '../components/create'
import { useStore } from '../state/store'
import { navFor } from './nav'

export function Header() {
  const { pathname } = useLocation()
  const createBatch = useCreateBatch()
  const { reset } = useStore()
  const [resetting, setResetting] = useState(false)

  return (
    <header className="h-14 gap-3 flex shrink-0 items-center print:hidden">
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight truncate">{navFor(pathname).label}</h2>
        <p className="text-xs truncate text-muted">{fmtToday()}</p>
      </div>
      <div className="gap-2 ml-auto flex shrink-0 items-center">
        <Button className="sm:inline-flex hidden" onClick={createBatch}>
          <Plus />
          Batch baru
        </Button>
        <ActionMenu
          title="Data demo"
          trigger={
            <Button variant="card" size="icon-lg" aria-label="Menu data">
              <MoreHorizontal />
            </Button>
          }
          items={[
            {
              key: 'reset',
              label: 'Kembalikan data awal',
              description: 'Hapus perubahan, muat ulang data dari kedua file Excel',
              icon: <RotateCcw />,
              destructive: true,
              onSelect: () => setResetting(true),
            },
          ]}
        />
      </div>
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Kembalikan data awal?"
        description="Semua batch dan pembacaan yang dicatat di browser ini akan dihapus, lalu data dari kedua file Excel dimuat lagi."
        confirmLabel="Kembalikan data"
        cancelLabel="Batal"
        destructive
        onConfirm={reset}
      />
    </header>
  )
}
