import { Rail, RailAction, RailCollapse, RailItem, cn } from '@ef/ui'
import { Plus } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router'
import { useCreateBatch } from '../components/create'
import { LogoMark } from './LogoMark'
import { NAV, isActive } from './nav'

export function SideRail({
  expanded,
  canExpand,
  onToggle,
}: {
  expanded: boolean
  canExpand: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const createBatch = useCreateBatch()
  return (
    <Rail
      expanded={expanded}
      header={
        <Link
          to="/"
          className={cn('gap-3 rounded-2xl flex items-center', expanded && 'px-1 w-full')}
          aria-label="Ikhtisar"
        >
          <span className="size-11 rounded-2xl bg-white/5 flex shrink-0 items-center justify-center">
            <LogoMark className="size-7" />
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="font-bold leading-tight tracking-tight block text-[15px]">Electroforming</span>
              <span className="block text-[11px] text-on-ink-muted">Konsol bak · trial SCADA</span>
            </span>
          )}
        </Link>
      }
      action={
        <RailAction label="Batch baru" expanded={expanded} onClick={createBatch}>
          <Plus />
        </RailAction>
      }
      footer={canExpand ? <RailCollapse expanded={expanded} onToggle={onToggle} /> : undefined}
    >
      {NAV.map(({ to, label, icon: Icon }) => (
        <RailItem
          key={to}
          asChild
          expanded={expanded}
          active={isActive(pathname, to)}
          icon={<Icon />}
          label={label}
        >
          <NavLink to={to} end={to === '/'} />
        </RailItem>
      ))}
    </Rail>
  )
}
