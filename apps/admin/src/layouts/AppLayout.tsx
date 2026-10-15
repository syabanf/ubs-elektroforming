import { Banner, useMediaQuery } from '@ef/ui'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router'
import { CreateBatchProvider } from '../components/create'
import { usePersistentState } from '../lib/storage'
import { useStore } from '../state/store'
import { Header } from './Header'
import { PhoneNav } from './PhoneNav'
import { SideRail } from './SideRail'

const GLOW =
  'radial-gradient(38% 34% at 72% 22%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%), radial-gradient(34% 30% at 55% 8%, color-mix(in srgb, var(--color-accent-soft) 70%, transparent), transparent 72%)'

// Scroll position of `main` per history entry key, for Back and Forward.
const scrollTops = new Map<string, number>()

export function AppLayout() {
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const [expandedPref, setExpandedPref] = usePersistentState('ef.admin.rail', true)
  const { storageError } = useStore()
  const { key, pathname } = useLocation()
  const navigationType = useNavigationType()
  const mainRef = useRef<HTMLElement>(null)
  const entryKey = useRef(key)

  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const save = () => scrollTops.set(entryKey.current, main.scrollTop)
    main.addEventListener('scroll', save, { passive: true })
    return () => main.removeEventListener('scroll', save)
  }, [])
  useLayoutEffect(() => {
    entryKey.current = key
  }, [key])
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: navigationType === 'POP' ? (scrollTops.get(key) ?? 0) : 0 })
  }, [pathname])

  return (
    <CreateBatchProvider>
      <div className="gap-4 p-3 lg:p-4 print:bg-white print:p-0 relative flex h-dvh overflow-clip bg-surface print:block print:h-auto print:overflow-visible">
        <div aria-hidden className="inset-0 pointer-events-none absolute overflow-hidden print:hidden">
          <div
            className="blur-xl absolute -top-[30%] -right-[8%] h-[120%] w-[70%] opacity-70"
            style={{ background: GLOW }}
          />
        </div>
        <div className="md:block relative hidden shrink-0 print:hidden">
          <SideRail
            expanded={expandedPref && isDesktop}
            canExpand={isDesktop}
            onToggle={() => setExpandedPref(!expandedPref)}
          />
        </div>
        <div className="min-w-0 gap-4 relative flex flex-1 flex-col">
          <nav aria-label="Lompat">
            <a
              href="#main"
              className="px-4 py-2 text-sm font-semibold focus:left-4 focus:top-3 sr-only z-30 rounded-full bg-ink text-on-ink shadow-float focus:not-sr-only focus:absolute"
            >
              Lompat ke konten
            </a>
          </nav>
          <Header />
          <main
            id="main"
            tabIndex={-1}
            ref={mainRef}
            className="min-h-0 pb-24 pr-0.5 md:pb-2 print:p-0 relative flex-1 overflow-y-auto print:overflow-visible"
          >
            {storageError && (
              <Banner tone="danger" title="Perubahan tidak bisa disimpan" className="mb-4">
                Browser menolak penyimpanan lokal. Data yang dicatat hilang saat halaman ditutup.
              </Banner>
            )}
            <Outlet />
          </main>
        </div>
        <PhoneNav />
      </div>
    </CreateBatchProvider>
  )
}
