import { Button, cn } from '@ef/ui'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

/** Goes back inside the app; a page opened from a bookmark has no history, so it goes to `fallback`. */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const navigate = useNavigate()
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback)
  }
  return (
    <Button variant="ghost" size="sm" className={cn('-ml-1 print:hidden', className)} onClick={back}>
      <ArrowLeft />
      Kembali
    </Button>
  )
}
