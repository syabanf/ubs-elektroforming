import { type AuBand, auBand } from '@ef/fixtures'
import { BATCH_STATUS_LABEL, type Batch, type BatchStatus, DIRECTIVE_LABEL, type Directive } from '@ef/types'
import { Badge, type BadgeProps } from '@ef/ui'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

const STATUS_VARIANT: Record<BatchStatus, BadgeProps['variant']> = {
  preparing: 'warning',
  running: 'info',
  completed: 'muted',
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} dot={status === 'running'}>
      {BATCH_STATUS_LABEL[status]}
    </Badge>
  )
}

const DIRECTIVE_VARIANT: Record<Directive, BadgeProps['variant']> = {
  insufficient: 'outline',
  raise: 'warning',
  lower: 'warning',
  hold: 'success',
}

export const DIRECTIVE_ICON: Record<Directive, React.ReactNode> = {
  insufficient: null,
  raise: <ArrowUp className="size-3" />,
  lower: <ArrowDown className="size-3" />,
  hold: <Minus className="size-3" />,
}

export function DirectiveBadge({ directive }: { directive: Directive }) {
  return (
    <Badge variant={DIRECTIVE_VARIANT[directive]}>
      {DIRECTIVE_ICON[directive]}
      {DIRECTIVE_LABEL[directive]}
    </Badge>
  )
}

export const AU_BAND_LABEL: Record<AuBand, string> = {
  below: 'Di bawah batas',
  within: 'Aman',
  above: 'Di atas batas',
}

export function AuBadge({ au, batch }: { au: number | null; batch: Batch }) {
  if (au === null) return <Badge variant="outline">Belum diukur</Badge>
  const band = auBand(au, batch)
  return <Badge variant={band === 'within' ? 'success' : 'warning'}>{AU_BAND_LABEL[band]}</Badge>
}

/** Marks pH, temperature and clock times that were generated for the demo, not logged at the plant. */
export function SampleBadge() {
  return (
    <Badge variant="outline" title="pH, suhu dan jam catat batch ini dibuat sebagai contoh, bukan dari Excel">
      Data contoh
    </Badge>
  )
}
