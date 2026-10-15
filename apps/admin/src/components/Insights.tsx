import type { Insight, InsightKind, InsightTone } from '@ef/fixtures'
import { IconTile, type Tone } from '@ef/ui'
import {
  Activity,
  CalendarClock,
  Clock,
  Flag,
  Gauge,
  Hourglass,
  LayoutGrid,
  Ruler,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from './links'

const ICON: Record<InsightKind, ReactNode> = {
  efficiency: <Zap />,
  trend: <TrendingDown />,
  area: <Ruler />,
  forecast: <CalendarClock />,
  duration: <Hourglass />,
  au: <Gauge />,
  bath: <LayoutGrid />,
  record: <Clock />,
  condition: <Thermometer />,
  eta: <Flag />,
  pace: <Activity />,
  volt: <Zap />,
  drift: <Waves />,
}

const TONE: Record<InsightTone, Tone> = { good: 'success', warn: 'warning', info: 'info' }

/** Findings as short cards: icon by topic, colour by whether it needs action. */
export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="gap-3 sm:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
      {insights.map((insight) => (
        <li key={`${insight.kind}-${insight.title}`} className="gap-3 rounded-2xl p-3 flex bg-surface-2">
          <IconTile tone={TONE[insight.tone]} size="sm">
            {insight.kind === 'trend' && insight.tone === 'good' ? <TrendingUp /> : ICON[insight.kind]}
          </IconTile>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{insight.title}</p>
            <p className="mt-0.5 text-xs text-muted">{insight.detail}</p>
            {insight.batchId && (
              <Link
                to={paths.batch(insight.batchId, 'prep')}
                className="mt-1 text-xs font-semibold inline-block text-accent hover:underline"
              >
                Buka persiapan
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
