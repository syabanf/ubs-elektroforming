import { PageHeader } from '@ef/ui'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { PRIORITY_LABEL, REPORTS, type ReportMeta } from './catalog'

const GROUPS = Object.keys(PRIORITY_LABEL) as ReportMeta['priority'][]

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan"
        description="Sepuluh laporan proses electroforming. Semua laporan memakai filter tanggal, bak, batch, model dan status yang sama, lalu bisa diunduh sebagai CSV atau dicetak ke PDF."
      />
      {GROUPS.map((group) => (
        <section key={group} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{PRIORITY_LABEL[group].title}</h2>
            <p className="text-xs text-muted">{PRIORITY_LABEL[group].note}</p>
          </div>
          <div className="gap-3 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {REPORTS.filter((r) => r.priority === group).map((r) => (
              <Link
                key={r.code}
                to={`/reports/${r.code.toLowerCase()}`}
                className="p-4 gap-3 flex items-start rounded-card bg-card shadow-card transition-colors hover:bg-surface-2"
              >
                <span className="size-10 text-xs font-bold rounded-xl flex shrink-0 items-center justify-center bg-ink font-mono text-on-ink">
                  {r.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block">{r.title}</span>
                  <span className="mt-0.5 text-xs block text-muted">{r.purpose}</span>
                  {r.missing.length > 0 && (
                    <span className="mt-1.5 text-xs block text-warning">
                      Belum dicatat: {r.missing.join(', ')}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 mt-3 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
