import { BottomBar, BottomBarAction, BottomBarItem, Sheet, SheetContent, SheetTitle, cn } from '@ef/ui'
import { LayoutGrid, Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useCreateBatch } from '../components/create'
import { PHONE_MAIN, PHONE_MORE, isActive } from './nav'

/** Phone navigation: three destinations and the create action, the rest in a dark bottom sheet. */
export function PhoneNav() {
  const { pathname } = useLocation()
  const createBatch = useCreateBatch()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = PHONE_MORE.some((item) => isActive(pathname, item.to))
  return (
    <>
      <BottomBar className="print:hidden">
        {PHONE_MAIN.map(({ to, label, icon: Icon }, index) => (
          <Fragment key={to}>
            {index === 2 && (
              <BottomBarAction label="Batch baru" onClick={createBatch}>
                <Plus />
              </BottomBarAction>
            )}
            <BottomBarItem asChild icon={<Icon />} label={label} active={isActive(pathname, to)}>
              <Link to={to} />
            </BottomBarItem>
          </Fragment>
        ))}
        <BottomBarItem
          icon={<LayoutGrid />}
          label="Lainnya"
          active={moreOpen || moreActive}
          onClick={() => setMoreOpen(true)}
        />
      </BottomBar>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" tone="dark" hideClose aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menu lainnya</SheetTitle>
          <div className="gap-2 px-3 pb-4 pt-4 grid grid-cols-3">
            {PHONE_MORE.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className="gap-2 rounded-2xl p-3 hover:bg-white/10 flex flex-col items-center text-center transition-colors"
              >
                <span
                  className={cn(
                    'size-11 rounded-2xl bg-white/10 [&_svg]:size-5 flex items-center justify-center',
                    isActive(pathname, to) && 'text-white bg-accent shadow-glow',
                  )}
                >
                  <Icon />
                </span>
                <span className="text-xs font-medium leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
