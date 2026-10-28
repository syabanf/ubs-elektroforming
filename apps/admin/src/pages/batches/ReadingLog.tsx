import {
  type BatchCalc,
  type LogHour,
  type ReadingCalc,
  fmtDate,
  fmtHourRange,
  fmtHours,
  fmtNumber,
  fmtPercent,
  fmtSigned,
  hourlyLog,
} from '@ef/fixtures'
import type { Batch } from '@ef/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  KeyValue,
  PillTabs,
  SegmentedTabs,
} from '@ef/ui'
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useNow } from '../../lib/clock'
import type { Pending } from './BatchDetailPage'
import { type ColumnGroup, GROUP_COLUMNS, GROUP_LABEL } from './lib'

type Props = { batch: Batch; calc: BatchCalc; open: (p: Pending) => void }

/** The `jam` value for readings that have no clock time (rows imported from Excel). */
const UNTIMED = 'tanpa'

const hourKeyOf = (r: ReadingCalc) => r.reading.recordedAt?.slice(0, 13) ?? UNTIMED
const hourLabel = (h: LogHour) => `${fmtDate(h.start.slice(0, 10))} · ${fmtHourRange(h.start)}`

/**
 * The batch log as a drill-down: every clock hour of the run, then the readings logged in one hour, then one
 * reading with all its computed columns. The level lives in the URL (`jam`, `catatan`), so Back goes up a level.
 */
export function ReadingLog({ batch, calc, open }: Props) {
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const running = batch.status === 'running'
  const { rows } = calc
  const { hours, untimed } = useMemo(() => hourlyLog(rows, running ? now : undefined), [rows, running, now])
  const group = (params.get('cols') as ColumnGroup | null) ?? 'condition'
  const showAll = params.get('tampil') === 'semua'
  const reading = rows.find((r) => r.reading.id === params.get('catatan'))
  const hourKey = reading ? hourKeyOf(reading) : params.get('jam')
  const hour = hours.find((h) => h.key === hourKey)
  const hourRows = hourKey === UNTIMED ? untimed : (hour?.rows ?? [])
  const hourTitle = hourKey === UNTIMED ? 'Tanpa jam catat' : hour ? hourLabel(hour) : null

  const go = (next: Record<'jam' | 'catatan' | 'tampil', string | null>, replace = false) =>
    setParams(
      (p) => {
        for (const [key, value] of Object.entries(next)) {
          if (value === null) p.delete(key)
          else p.set(key, value)
        }
        return p
      },
      { replace },
    )
  const openHour = (key: string) => go({ jam: key, catatan: null, tampil: null })
  const openReading = (r: ReadingCalc) =>
    go({ jam: null, catatan: r.reading.id, tampil: showAll ? 'semua' : null })
  const top = () => go({ jam: null, catatan: null, tampil: showAll ? 'semua' : null })

  const columns: Column<ReadingCalc>[] = [
    {
      id: 'no',
      header: 'Ke',
      cell: (r) => <span className="text-xs font-semibold font-mono">{r.reading.no}</span>,
      sortValue: (r) => r.reading.no,
    },
    ...GROUP_COLUMNS[group],
    ...(running
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Aksi</span>,
            align: 'right' as const,
            cell: (r: ReadingCalc) => <ReadingMenu reading={r} open={open} />,
          },
        ]
      : []),
  ]
  const groupTabs = (
    <SegmentedTabs
      size="sm"
      items={(Object.keys(GROUP_LABEL) as ColumnGroup[]).map((k) => ({ value: k, label: GROUP_LABEL[k] }))}
      value={group}
      onValueChange={(v) => setParams((p) => (p.set('cols', v), p), { replace: true })}
    />
  )
  const readingTable = (list: ReadingCalc[]) => (
    <DataTable
      columns={columns}
      rows={list}
      getRowKey={(r) => r.reading.id}
      onRowClick={openReading}
      pageSize={0}
      initialSort={{ id: 'no' }}
    />
  )

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Catatan pembacaan</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title={running ? 'Belum ada pembacaan' : 'Batch ini tanpa catatan pembacaan'}
            description={
              running ? 'Catat volt, ampere dan angka meter setiap interval.' : 'Hasilnya ada di tab Hasil.'
            }
            action={
              running && (
                <Button onClick={() => open({ kind: 'reading', reading: null })}>
                  <Plus />
                  Catat pembacaan
                </Button>
              )
            }
          />
        </CardContent>
      </Card>
    )
  }

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: showAll ? 'Semua pembacaan' : 'Semua jam', onClick: top },
  ]
  if (hourTitle && !showAll)
    crumbs.push({ label: hourTitle, onClick: reading ? () => openHour(hourKey!) : undefined })
  if (reading) crumbs.push({ label: `Pembacaan ke-${reading.reading.no}` })
  const atTop = crumbs.length === 1

  return (
    <Card>
      <CardHeader
        action={
          atTop && (
            <PillTabs
              size="sm"
              items={[
                { value: 'hours', label: 'Per jam' },
                { value: 'all', label: 'Semua pembacaan' },
              ]}
              value={showAll ? 'all' : 'hours'}
              onValueChange={(v) =>
                go({ jam: null, catatan: null, tampil: v === 'all' ? 'semua' : null }, true)
              }
            />
          )
        }
      >
        <CardTitle>Catatan pembacaan</CardTitle>
        {atTop ? (
          <p className="text-xs text-muted">
            {showAll
              ? `${rows.length} pembacaan. Klik baris untuk melihat semua hitungannya.`
              : `${hours.filter((h) => h.rows.length).length} dari ${hours.length} jam berisi catatan. Pembacaan masuk ke jam saat dicatat. Klik jam untuk membukanya.`}
          </p>
        ) : (
          <nav aria-label="Posisi" className="gap-1 text-xs flex flex-wrap items-center text-muted">
            {crumbs.map((c, i) => (
              <Fragment key={c.label}>
                {i > 0 && <ChevronRight className="size-3" />}
                {c.onClick ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="font-semibold text-foreground hover:text-accent focus-visible:underline focus-visible:outline-none"
                  >
                    {c.label}
                  </button>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
      </CardHeader>

      {reading ? (
        <ReadingDetail reading={reading} rows={rows} running={running} open={open} onPick={openReading} />
      ) : hourTitle && !showAll ? (
        <CardContent className="px-0 pb-2">
          <HourBar hour={hour} count={hourRows.length} hours={hours} onPick={openHour} tabs={groupTabs} />
          {readingTable(hourRows)}
        </CardContent>
      ) : showAll ? (
        <CardContent className="px-0 pb-2">
          <div className="px-5 pb-3">{groupTabs}</div>
          {readingTable(rows)}
        </CardContent>
      ) : (
        <CardContent className="px-0 pb-2">
          <HourTable hours={hours} running={running} now={now} onPick={openHour} />
          {untimed.length > 0 && (
            <p className="px-5 pt-2 text-xs text-muted">
              {untimed.length} pembacaan tanpa jam catat.{' '}
              <button
                type="button"
                onClick={() => openHour(UNTIMED)}
                className="font-semibold text-foreground hover:text-accent"
              >
                Lihat
              </button>
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function HourTable({
  hours,
  running,
  now,
  onPick,
}: {
  hours: LogHour[]
  running: boolean
  now: string
  onPick: (key: string) => void
}) {
  const last = (h: LogHour, pick: (r: ReadingCalc) => number | null) =>
    h.rows.map(pick).findLast((v) => v !== null) ?? null
  const columns: Column<LogHour>[] = [
    {
      id: 'hour',
      header: 'Jam',
      cell: (h) => (
        <span>
          <span className="text-sm font-semibold block tabular-nums">{fmtHourRange(h.start)}</span>
          <span className="text-xs block text-muted">{fmtDate(h.start.slice(0, 10))}</span>
        </span>
      ),
      sortValue: (h) => h.key,
    },
    {
      id: 'logs',
      header: 'Catatan',
      cell: (h) => {
        if (h.rows.length) return <span className="font-semibold">{h.rows.length} catatan</span>
        if (running && h.key === now.slice(0, 13)) return <span className="text-muted">Belum dicatat</span>
        if (h.state === 'late')
          return <Badge variant="warning">Terlambat · {fmtHours((h.unloggedMin ?? 0) / 60)}</Badge>
        return <span className="text-muted">Tidak ada catatan</span>
      },
    },
    {
      id: 'minutes',
      header: 'Interval (menit)',
      align: 'right',
      hideBelow: 'md',
      cell: (h) => <span className="tabular-nums">{h.rows.length ? fmtNumber(h.minutes, 0) : '–'}</span>,
    },
    {
      id: 'volt',
      header: 'Volt',
      align: 'right',
      cell: (h) => (
        <span className="tabular-nums">
          {fmtNumber(
            last(h, (r) => r.reading.volt),
            2,
            2,
          )}
        </span>
      ),
    },
    {
      id: 'ampere',
      header: 'Ampere',
      align: 'right',
      hideBelow: 'sm',
      cell: (h) => (
        <span className="tabular-nums">
          {fmtNumber(
            last(h, (r) => r.reading.ampere),
            2,
            2,
          )}
        </span>
      ),
    },
    {
      id: 'amm',
      header: 'AMM',
      align: 'right',
      hideBelow: 'md',
      cell: (h) => <span className="tabular-nums">{fmtNumber(h.amm, 1, 1)}</span>,
    },
    {
      id: 'gain',
      header: (
        <>
          Tebal naik <span className="normal-case">(µm)</span>
        </>
      ),
      align: 'right',
      hideBelow: 'sm',
      cell: (h) => <span className="tabular-nums">{fmtSigned(h.micronGain, 1)}</span>,
    },
    {
      id: 'au',
      header: 'Kadar',
      align: 'right',
      hideBelow: 'md',
      cell: (h) => <span className="tabular-nums">{fmtPercent(last(h, (r) => r.reading.au))}</span>,
    },
    {
      id: 'ph',
      header: 'pH',
      align: 'right',
      hideBelow: 'lg',
      cell: (h) => (
        <span className="tabular-nums">
          {fmtNumber(
            last(h, (r) => r.reading.ph),
            2,
            2,
          )}
        </span>
      ),
    },
    {
      id: 'tempC',
      header: 'Suhu (°C)',
      align: 'right',
      hideBelow: 'lg',
      cell: (h) => (
        <span className="tabular-nums">
          {fmtNumber(
            last(h, (r) => r.reading.tempC),
            1,
            1,
          )}
        </span>
      ),
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={hours}
      getRowKey={(h) => h.key}
      onRowClick={(h) => h.rows.length && onPick(h.key)}
      rowClassName={(h) => (h.rows.length ? undefined : 'text-muted')}
      pageSize={0}
      initialSort={{ id: 'hour' }}
    />
  )
}

/** Totals of the open hour, with steps to the previous and next hour that has readings. */
function HourBar({
  hour,
  count,
  hours,
  onPick,
  tabs,
}: {
  hour: LogHour | undefined
  count: number
  hours: LogHour[]
  onPick: (key: string) => void
  tabs: React.ReactNode
}) {
  const logged = hours.filter((h) => h.rows.length)
  const at = hour ? logged.findIndex((h) => h.key === hour.key) : -1
  const prev = at > 0 ? logged[at - 1] : undefined
  const next = at >= 0 ? logged[at + 1] : undefined
  return (
    <div className="gap-3 px-5 pb-3 flex flex-wrap items-center justify-between">
      <p className="text-xs text-muted tabular-nums">
        {count} catatan
        {hour &&
          ` · ${fmtNumber(hour.minutes, 0)} menit · AMM ${fmtNumber(hour.amm, 1)} · tebal naik ${fmtSigned(hour.micronGain, 1)} µm`}
      </p>
      <div className="gap-2 flex flex-wrap items-center">
        {tabs}
        {hour && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Jam sebelumnya"
              disabled={!prev}
              onClick={() => prev && onPick(prev.key)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Jam berikutnya"
              disabled={!next}
              onClick={() => next && onPick(next.key)}
            >
              <ChevronRight />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** Every computed column of one reading, grouped like the table's column groups. */
function ReadingDetail({
  reading,
  rows,
  running,
  open,
  onPick,
}: {
  reading: ReadingCalc
  rows: ReadingCalc[]
  running: boolean
  open: (p: Pending) => void
  onPick: (r: ReadingCalc) => void
}) {
  const at = rows.indexOf(reading)
  const prev = rows[at - 1]
  const next = rows[at + 1]
  const seen = new Set<string>()
  const sections = (Object.keys(GROUP_LABEL) as ColumnGroup[]).map((g) => ({
    title: GROUP_LABEL[g],
    items: GROUP_COLUMNS[g]
      .filter((c) => !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({ label: c.header, value: c.cell(reading) })),
  }))
  return (
    <CardContent className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <div className="gap-2 flex">
          <Button variant="outline" size="sm" disabled={!prev} onClick={() => prev && onPick(prev)}>
            <ChevronLeft />
            Sebelumnya
          </Button>
          <Button variant="outline" size="sm" disabled={!next} onClick={() => next && onPick(next)}>
            Berikutnya
            <ChevronRight />
          </Button>
        </div>
        {running && (
          <div className="gap-2 flex">
            <Button
              variant="outline"
              size="sm"
              onClick={() => open({ kind: 'removeReading', reading: reading.reading })}
            >
              <Trash2 />
              Hapus
            </Button>
            <Button size="sm" onClick={() => open({ kind: 'reading', reading: reading.reading })}>
              <Pencil />
              Ubah
            </Button>
          </div>
        )}
      </div>
      <div className="gap-x-8 gap-y-4 md:grid-cols-2 grid grid-cols-1">
        {sections.map((s) => (
          <section key={s.title}>
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{s.title}</h3>
            <KeyValue bare labelWidth="lg" items={s.items} />
          </section>
        ))}
      </div>
    </CardContent>
  )
}

function ReadingMenu({ reading, open }: { reading: ReadingCalc; open: (p: Pending) => void }) {
  return (
    <ActionMenu
      title={`Pembacaan ke-${reading.reading.no}`}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Aksi pembacaan ke-${reading.reading.no}`}>
          <MoreHorizontal />
        </Button>
      }
      items={[
        {
          key: 'edit',
          label: 'Ubah',
          icon: <Pencil />,
          onSelect: () => open({ kind: 'reading', reading: reading.reading }),
        },
        {
          key: 'remove',
          label: 'Hapus',
          icon: <Trash2 />,
          destructive: true,
          onSelect: () => open({ kind: 'removeReading', reading: reading.reading }),
        },
      ]}
    />
  )
}
