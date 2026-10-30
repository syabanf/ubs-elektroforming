import {
  Box,
  Calculator,
  FileChartColumn,
  Gem,
  House,
  Layers,
  type LucideIcon,
  RadioTower,
  TestTubeDiagonal,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const NAV: NavItem[] = [
  { to: '/', label: 'Beranda', icon: House },
  { to: '/batches', label: 'Batch', icon: Layers },
  { to: '/monitor', label: 'Monitor 3D', icon: Box },
  { to: '/scada', label: 'SCADA', icon: RadioTower },
  { to: '/reports', label: 'Laporan', icon: FileChartColumn },
  { to: '/models', label: 'Daftar model', icon: Gem },
  { to: '/gpc', label: 'Catatan GPC', icon: TestTubeDiagonal },
  { to: '/formulas', label: 'Cara hitung', icon: Calculator },
]

/** The phone bar holds the daily three; the rest, the 3D monitor included, open from "Lainnya". */
const PHONE_MAIN_PATHS = ['/', '/batches', '/models']
export const PHONE_MAIN = NAV.filter((item) => PHONE_MAIN_PATHS.includes(item.to))
export const PHONE_MORE = NAV.filter((item) => !PHONE_MAIN_PATHS.includes(item.to))

export const isActive = (pathname: string, to: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)

export const navFor = (pathname: string) =>
  [...NAV].reverse().find((item) => isActive(pathname, item.to)) ?? NAV[0]!
