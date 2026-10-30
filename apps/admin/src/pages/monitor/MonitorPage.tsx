import {
  type BatchCalc,
  auBand,
  bathRemoveBlocker,
  computeBatch,
  fmtClock,
  fmtNumber,
  fmtPercent,
} from '@ef/fixtures'
import type { Bath, Batch } from '@ef/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PillTabs,
  Sparkline,
  StatusDot,
  cn,
  toast,
} from '@ef/ui'
import { ArrowRight, ClipboardList, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { issuesOf } from '../../components/attention'
import { AU_BAND_LABEL, BatchStatusBadge, SampleBadge } from '../../components/badges'
import { ProcessParams } from '../../components/ProcessParams'
import { BathDialog } from '../../components/BathDialog'
import { useCreateBatch } from '../../components/create'
import { paths } from '../../components/links'
import { useNow } from '../../lib/clock'
import { usePersistentState } from '../../lib/storage'
import { useCatalog } from '../../state/catalog'
import { ReadingDialog } from '../batches/ReadingDialog'
import { useStore } from '../../state/store'
import { readPalette } from '../../lib/palette'
import { type Anchor, type BathVisual, MonitorScene, type PickKey } from './scene'

type Entry = { batch: Batch; calc: BatchCalc }
type BathRow = { bath: Bath; no: number; current: Entry | undefined; next: Entry[]; issues: string[] }
type Selection = 'all' | PickKey

const TONE_DOT = { ok: 'success', warn: 'warning', idle: 'default' } as const

export function MonitorPage() {
  const { state } = useStore()
  const catalog = useCatalog()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const selected = (params.get('lihat') as Selection | null) ?? 'all'
  const hostRef = useRef<HTMLDivElement>(null)
  const [operator, setOperator] = useState('patroli')
  // Off by default when the system asks for reduced motion; the switch overrides it.
  const [motion, setMotion] = usePersistentState(
    'ef.admin.monitor.motion',
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [bathForm, setBathForm] = useState<{ editing: Bath | null } | null>(null)
  const [removing, setRemoving] = useState<Bath | null>(null)
  const { dispatch } = useStore()
  const sceneRef = useRef<MonitorScene | null>(null)
  const motionRef = useRef(true)
  const labelRefs = useRef(new Map<PickKey, HTMLElement>())
  const selectRef = useRef<(key: Selection) => void>(() => {})
  selectRef.current = (key) => setParams(key === 'all' ? {} : { lihat: key }, { replace: true })

  const rows = useMemo<BathRow[]>(() => {
    const entries = state.batches.map((batch) => ({ batch, calc: computeBatch(batch, catalog) }))
    return state.baths.map((bath, i) => {
      const current = entries.find((e) => e.batch.bathId === bath.id && e.batch.status === 'running')
      return {
        bath,
        no: i + 1,
        current,
        next: entries.filter((e) => e.batch.bathId === bath.id && e.batch.status === 'preparing'),
        issues: current ? issuesOf(current.batch, current.calc.summary, now) : [],
      }
    })
  }, [state.baths, state.batches, catalog, now])

  const visuals = useMemo<BathVisual[]>(
    () =>
      rows.map(({ bath, no, current, issues }) => {
        const s = current?.calc.summary
        const b = current?.batch
        const mid = b && b.tempMin !== null && b.tempMax !== null ? (b.tempMin + b.tempMax) / 2 : null
        return {
          id: bath.id,
          name: bath.name,
          no,
          running: !!current,
          tone: !current ? 'idle' : issues.length ? 'warn' : 'ok',
          volt: s?.latestVolt ?? null,
          tempC: s?.latestTempC ?? null,
          heating: s?.latestTempC != null && mid !== null && s.latestTempC < mid,
          progress: s?.progress ?? 0,
        }
      }),
    [rows],
  )

  // The scene lives for the page; React only feeds it data and positions the labels.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new MonitorScene(host, readPalette(), (key) => selectRef.current(key ?? 'all'))
    scene.onFrame = (anchors: Anchor[]) => {
      for (const a of anchors) {
        const el = labelRefs.current.get(a.key)
        if (!el) continue
        el.style.visibility = a.visible ? 'visible' : 'hidden'
        el.style.transform = `translate(${a.x - el.offsetWidth / 2}px, ${a.y - el.offsetHeight - 10}px) scale(${a.scale.toFixed(3)})`
        el.style.zIndex = String(1000 - Math.round(a.depth * 10))
      }
    }
    scene.onOperator = setOperator
    scene.motion = motionRef.current
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setBaths(visuals)
    scene.setPcScreen(
      'REKAP ELECTROFORMING',
      rows.map(({ bath, current }, i) => {
        const s = current?.calc.summary
        return {
          name: `${bath.name}${current ? ` · ${current.batch.code}` : ''}`,
          tone: visuals[i]!.tone,
          lines: s
            ? [
                `pH ${fmtNumber(s.latestPh, 2)}`,
                `${fmtNumber(s.latestTempC, 1)} °C`,
                `${fmtNumber(s.latestVolt, 2)} V`,
                `${fmtNumber(s.micron, 1)} µm`,
              ]
            : ['Kosong'],
        }
      }),
    )
  }, [visuals, rows])

  useEffect(() => {
    sceneRef.current?.view(selected)
  }, [selected])

  motionRef.current = motion
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.motion = motion
  }, [motion])

  // Every new reading plays the operator's round in the room: check the bath, carry an X-ray sample when the
  // reading has a kadar, then log it at the PC. The first pass only remembers the counts.
  const seenReadings = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const scene = sceneRef.current
    const seen = seenReadings.current
    for (const { bath, current } of rows) {
      const batch = current?.batch
      const before = batch && seen?.get(batch.id)
      if (scene && batch && before !== undefined && batch.readings.length > before)
        scene.playReading(bath.id, batch.readings.at(-1)?.au != null)
    }
    seenReadings.current = new Map(
      rows.flatMap(({ current }) => (current ? [[current.batch.id, current.batch.readings.length]] : [])),
    )
  }, [rows])

  const recording = rows.find((r) => r.current?.batch.id === recordingId)?.current

  const setLabel = (key: PickKey) => (el: HTMLElement | null) => {
    if (el) labelRefs.current.set(key, el)
    else labelRefs.current.delete(key)
  }
  const tabs = [
    { value: 'all', label: 'Semua ruang' },
    ...rows.map((r) => ({ value: `bath:${r.bath.id}`, label: r.bath.name })),
    { value: 'pc', label: 'PC rekap' },
    { value: 'xray', label: 'X-Ray' },
  ]
  const selectedRow = rows.find((r) => `bath:${r.bath.id}` === selected)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monitor 3D"
        description="Ruang bak dari data batch yang berjalan. Klik bak, PC rekap atau X-Ray, seret untuk memutar, gulir untuk zoom."
        actions={
          <Button variant="outline" onClick={() => setBathForm({ editing: null })}>
            <Plus />
            Tambah bak
          </Button>
        }
      />
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <nav aria-label="Sudut pandang" className="min-w-0 no-scrollbar max-w-full overflow-x-auto">
          <PillTabs items={tabs} value={selected} onValueChange={(v) => selectRef.current(v as Selection)} />
        </nav>
        <Button variant="outline" size="sm" aria-pressed={motion} onClick={() => setMotion(!motion)}>
          {motion ? <Pause /> : <Play />}
          {motion ? 'Matikan animasi' : 'Nyalakan animasi'}
        </Button>
      </div>
      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_360px] grid grid-cols-1">
        <div className="relative h-[min(68vh,640px)] min-h-[380px] overflow-hidden rounded-hero bg-ink shadow-float">
          <div
            ref={hostRef}
            className="inset-0 absolute"
            role="img"
            aria-label={`Ruang electroforming 3D dengan ${rows.length} bak, PC rekap dan X-Ray`}
          />
          <p
            aria-live="polite"
            className="bottom-3 left-3 gap-2 px-3 py-1.5 text-xs font-semibold pointer-events-none absolute z-[1100] flex items-center rounded-full bg-card/95 shadow-float"
          >
            <StatusDot tone="success" pulse />
            {motion ? `Operator · ${operator}` : 'Animasi dimatikan'}
          </p>
          <div className="inset-0 pointer-events-none absolute">
            {rows.map((row, i) => (
              <SceneLabel
                key={row.bath.id}
                ref={setLabel(`bath:${row.bath.id}`)}
                active={selected === `bath:${row.bath.id}`}
                onClick={() => selectRef.current(`bath:${row.bath.id}`)}
                title={row.bath.name}
                tone={visuals[i]!.tone}
              >
                {row.current ? (
                  <>
                    <span className="block tabular-nums">
                      pH {fmtNumber(row.current.calc.summary.latestPh, 2)} ·{' '}
                      {fmtNumber(row.current.calc.summary.latestTempC, 1)} °C ·{' '}
                      {fmtNumber(row.current.calc.summary.latestVolt, 2)} V
                    </span>
                    <span className="mt-1 h-1 block overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-info"
                        style={{ width: `${Math.min(100, row.current.calc.summary.progress * 100)}%` }}
                      />
                    </span>
                  </>
                ) : (
                  <span className="block">
                    {row.next[0] ? `Persiapan ${row.next[0].batch.code}` : 'Kosong'}
                  </span>
                )}
              </SceneLabel>
            ))}
            <SceneLabel
              ref={setLabel('pc')}
              active={selected === 'pc'}
              onClick={() => selectRef.current('pc')}
              title="PC rekap"
              tone="ok"
            >
              <span className="block">{rows.length} bak · rekap per jam</span>
            </SceneLabel>
            <SceneLabel
              ref={setLabel('xray')}
              active={selected === 'xray'}
              onClick={() => selectRef.current('xray')}
              title="X-Ray"
              tone="ok"
            >
              <span className="block">Kadar emas terakhir</span>
            </SceneLabel>
          </div>
        </div>

        <Card className="p-5">
          {selectedRow ? (
            <BathPanel
              row={selectedRow}
              onRecord={setRecordingId}
              menu={
                <BathMenu
                  bath={selectedRow.bath}
                  onEdit={(bath) => setBathForm({ editing: bath })}
                  onRemove={setRemoving}
                />
              }
            />
          ) : selected === 'pc' ? (
            <PcPanel rows={rows} />
          ) : selected === 'xray' ? (
            <XrayPanel rows={rows} />
          ) : (
            <OverviewPanel
              rows={rows}
              visuals={visuals}
              onSelect={(key) => selectRef.current(key)}
              onAdd={() => setBathForm({ editing: null })}
            />
          )}
        </Card>
      </div>
      {recording && (
        <ReadingDialog
          open
          onOpenChange={(open) => !open && setRecordingId(null)}
          batch={recording.batch}
          summary={recording.calc.summary}
          editing={null}
        />
      )}
      <BathDialog
        open={!!bathForm}
        onOpenChange={(open) => !open && setBathForm(null)}
        editing={bathForm?.editing ?? null}
        onSaved={(bath) => selectRef.current(`bath:${bath.id}`)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Hapus ${removing?.name}?`}
        description="Bak ini belum dipakai batch mana pun. Tangkinya hilang dari ruang 3D."
        confirmLabel="Hapus bak"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          if (!removing) return
          dispatch({ type: 'baths/remove', id: removing.id })
          toast(`${removing.name} dihapus`)
          setRemoving(null)
          selectRef.current('all')
        }}
      />
    </div>
  )
}

function SceneLabel({
  ref,
  active,
  onClick,
  title,
  tone,
  children,
}: {
  ref: (el: HTMLElement | null) => void
  active: boolean
  onClick: () => void
  title: string
  tone: BathVisual['tone']
  children: React.ReactNode
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'left-0 top-0 rounded-2xl px-3 py-2 sm:min-w-[8.5rem] pointer-events-auto invisible absolute origin-bottom bg-card text-left shadow-float transition-shadow focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        active && 'ring-2 ring-accent',
      )}
    >
      <span className="gap-2 text-xs font-semibold flex items-center justify-between">
        {title}
        <StatusDot tone={TONE_DOT[tone]} pulse={tone === 'warn'} />
      </span>
      <span className="mt-0.5 sm:block hidden text-[11px] text-muted">{children}</span>
    </button>
  )
}

function PanelTitle({ title, kicker, aside }: { title: string; kicker?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 gap-3 flex items-start justify-between">
      <div className="min-w-0">
        {kicker && <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">{kicker}</p>}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {aside}
    </div>
  )
}

/** Rename or delete a bath; deleting waits until no batch uses it, and the menu says why. */
function BathMenu({
  bath,
  onEdit,
  onRemove,
}: {
  bath: Bath
  onEdit: (bath: Bath) => void
  onRemove: (bath: Bath) => void
}) {
  const { state } = useStore()
  const blocker = bathRemoveBlocker(state, bath.id)
  return (
    <ActionMenu
      title={bath.name}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Menu ${bath.name}`}>
          <MoreHorizontal />
        </Button>
      }
      items={[
        { key: 'edit', label: 'Ubah nama bak', icon: <Pencil />, onSelect: () => onEdit(bath) },
        {
          key: 'remove',
          label: 'Hapus bak',
          icon: <Trash2 />,
          destructive: true,
          disabled: !!blocker,
          description: blocker ?? undefined,
          onSelect: () => onRemove(bath),
        },
      ]}
    />
  )
}

function BathPanel({
  row,
  onRecord,
  menu,
}: {
  row: BathRow
  onRecord: (batchId: string) => void
  menu: React.ReactNode
}) {
  const { models } = useCatalog()
  const createBatch = useCreateBatch()
  const { bath, current, next } = row
  if (!current) {
    return (
      <>
        <PanelTitle title={bath.name} kicker={bath.description || 'Bak'} aside={menu} />
        {next[0] ? (
          <div className="rounded-2xl p-4 text-sm bg-surface-2">
            <p className="gap-1.5 font-semibold flex items-center">
              <ClipboardList className="size-4 text-muted" />
              Berikutnya <span className="font-mono">{next[0].batch.code}</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Persiapan ·{' '}
              {next[0].calc.prep.pieces
                ? `${fmtNumber(next[0].calc.prep.pieces, 0)} barang di rak`
                : 'rak masih kosong'}
            </p>
            <Button asChild className="mt-3 w-full">
              <Link to={paths.batch(next[0].batch.id, 'prep')}>Lanjut persiapan</Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            compact
            title="Bak kosong"
            description="Tidak ada batch berjalan di bak ini."
            action={
              <Button variant="outline" onClick={createBatch}>
                <Plus />
                Mulai batch baru
              </Button>
            }
          />
        )}
      </>
    )
  }
  const { batch, calc } = current
  const s = calc.summary
  return (
    <>
      <PanelTitle
        kicker={bath.name}
        title={`Batch ${batch.code}`}
        aside={
          <span className="gap-1.5 flex flex-wrap justify-end">
            {batch.conditionIsSample && <SampleBadge />}
            <BatchStatusBadge status={batch.status} />
            {menu}
          </span>
        }
      />
      <ProcessParams batch={batch} summary={s} compact />
      <Section title={`Tren ${calc.rows.length} pembacaan`}>
        <div className="gap-2 grid grid-cols-2">
          {trendsOf(calc).map((t) => (
            <div key={t.label} className="min-w-0 rounded-2xl p-3 bg-surface-2">
              <p className="gap-2 text-xs flex items-baseline justify-between">
                <span className="text-muted">{t.label}</span>
                <span className="font-semibold tabular-nums">
                  {fmtNumber(t.data.at(-1) ?? null, t.digits)} {t.unit}
                </span>
              </p>
              {t.data.length > 1 ? (
                <Sparkline
                  data={t.data}
                  height={36}
                  ariaLabel={`Tren ${t.label}`}
                  format={(v) => fmtNumber(v, t.digits)}
                  className="mt-2"
                />
              ) : (
                <p className="mt-2 text-[11px] text-muted">Belum cukup data</p>
              )}
            </div>
          ))}
        </div>
      </Section>
      {calc.prep.lines.length > 0 && (
        <Section
          title={`Isi rak · ${fmtNumber(calc.prep.pieces, 0)} barang · ${fmtNumber(s.areaDm2, 2)} dm²`}
        >
          <ul className="space-y-1.5">
            {calc.prep.lines
              .filter((l) => l.kind === 'model')
              .slice(0, 4)
              .map((l) => {
                const image = l.line.modelId ? models.get(l.line.modelId)?.image : null
                return (
                  <li key={l.line.id} className="gap-3 rounded-xl p-2 text-sm flex items-center bg-surface-2">
                    {image ? (
                      <img src={image} alt="" className="size-8 rounded-lg object-cover" />
                    ) : (
                      <span className="size-8 rounded-lg bg-surface" />
                    )}
                    <span className="font-semibold font-mono">{l.name}</span>
                    <span className="ml-auto text-muted tabular-nums">× {fmtNumber(l.line.qty, 0)}</span>
                  </li>
                )
              })}
          </ul>
          <Link
            to={paths.batch(batch.id, 'prep')}
            className="mt-2 text-xs font-semibold inline-block hover:text-accent"
          >
            Lihat isi rak lengkap
          </Link>
        </Section>
      )}
      <div className="mt-4 gap-2 grid grid-cols-2">
        <Button asChild variant="outline">
          <Link to={paths.batch(batch.id, 'log')}>
            Buka batch
            <ArrowRight />
          </Link>
        </Button>
        <Button onClick={() => onRecord(batch.id)}>
          <Plus />
          Catat
        </Button>
      </div>
      {next[0] && (
        <p className="mt-3 text-xs text-muted">
          Berikutnya di {bath.name}:{' '}
          <Link
            to={paths.batch(next[0].batch.id, 'prep')}
            className="font-semibold font-mono text-foreground hover:text-accent"
          >
            {next[0].batch.code}
          </Link>
        </p>
      )}
    </>
  )
}

function PcPanel({ rows }: { rows: BathRow[] }) {
  return (
    <>
      <PanelTitle kicker="PC rekap" title="Rekap semua bak" />
      <div className="space-y-2">
        {rows.map(({ bath, current }) => {
          const s = current?.calc.summary
          return (
            <div key={bath.id} className="rounded-2xl p-3 text-sm bg-surface-2">
              <p className="gap-2 font-semibold flex items-center justify-between">
                {bath.name}
                {current ? (
                  <Link
                    to={paths.batch(current.batch.id, 'log')}
                    className="text-xs font-mono hover:text-accent"
                  >
                    {current.batch.code}
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-muted">Kosong</span>
                )}
              </p>
              {s && (
                <dl className="mt-2 gap-x-2 gap-y-1 text-xs grid grid-cols-3">
                  {[
                    ['pH', fmtNumber(s.latestPh, 2)],
                    ['Suhu', `${fmtNumber(s.latestTempC, 1)} °C`],
                    ['Volt', `${fmtNumber(s.latestVolt, 2)} V`],
                    ['Tebal', `${fmtNumber(s.micron, 1)} µm`],
                    ['Ampere', `${fmtNumber(s.latestAmpere, 2)} A`],
                    ['Dicatat', fmtClock(s.lastRecordedAt)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )
        })}
      </div>
      <Button asChild variant="outline" className="mt-4 w-full">
        <Link to={paths.dashboard}>Buka Beranda</Link>
      </Button>
    </>
  )
}

function XrayPanel({ rows }: { rows: BathRow[] }) {
  const running = rows.filter((r) => r.current)
  return (
    <>
      <PanelTitle kicker="X-Ray" title="Kadar emas terakhir" />
      {running.length === 0 && (
        <EmptyState
          compact
          title="Belum ada batch berjalan"
          description="Kadar X-Ray muncul setelah batch dimulai."
        />
      )}
      <div className="space-y-4">
        {running.map(({ bath, current }) => {
          const { batch, calc } = current!
          const samples = calc.rows
            .filter((r) => r.reading.au !== null)
            .slice(-5)
            .reverse()
          return (
            <div key={bath.id}>
              <p className="mb-2 text-sm font-semibold flex items-center justify-between">
                {bath.name} · <span className="font-mono">{batch.code}</span>
                <span className="text-xs font-medium text-muted">
                  aman {fmtPercent(batch.refAuMin, 1)}–{fmtPercent(batch.refAuMax, 1)}
                </span>
              </p>
              <ul className="space-y-1.5">
                {samples.map((r) => {
                  const band = auBand(r.reading.au!, batch)
                  return (
                    <li
                      key={r.reading.id}
                      className="gap-2 rounded-xl px-3 py-2 text-sm flex items-center justify-between bg-surface-2"
                    >
                      <span className="text-xs text-muted tabular-nums">
                        {r.reading.recordedAt ? fmtClock(r.reading.recordedAt) : `ke-${r.reading.no}`}
                      </span>
                      <span className="font-semibold tabular-nums">{fmtPercent(r.reading.au)}</span>
                      <Badge variant={band === 'within' ? 'success' : 'warning'}>{AU_BAND_LABEL[band]}</Badge>
                    </li>
                  )
                })}
              </ul>
              <Link
                to={`${paths.batch(batch.id, 'log')}&cols=composition`}
                className="mt-2 text-xs font-semibold inline-block hover:text-accent"
              >
                Semua kadar di batch {batch.code}
              </Link>
            </div>
          )
        })}
      </div>
    </>
  )
}

function OverviewPanel({
  rows,
  visuals,
  onSelect,
  onAdd,
}: {
  rows: BathRow[]
  visuals: BathVisual[]
  onSelect: (key: Selection) => void
  onAdd: () => void
}) {
  return (
    <>
      <PanelTitle
        kicker="Ruang electroforming"
        title={`${rows.filter((r) => r.current).length} dari ${rows.length} bak berjalan`}
      />
      <div className="space-y-2">
        {rows.map((row, i) => (
          <button
            key={row.bath.id}
            type="button"
            onClick={() => onSelect(`bath:${row.bath.id}`)}
            className="gap-3 rounded-2xl p-3 text-sm flex w-full items-center justify-between bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <span className="min-w-0">
              <span className="gap-2 font-semibold flex items-center">
                <StatusDot tone={TONE_DOT[visuals[i]!.tone]} pulse={visuals[i]!.tone === 'warn'} />
                {row.bath.name}
              </span>
              <span className="mt-0.5 text-xs block text-muted">
                {row.current
                  ? row.issues.length
                    ? row.issues[0]
                    : `${row.current.batch.code} · ${fmtNumber(row.current.calc.summary.micron, 1)} µm`
                  : row.next[0]
                    ? `Persiapan ${row.next[0].batch.code}`
                    : 'Kosong'}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted" />
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-2 text-xs text-muted">
        <p className="font-semibold tracking-wider text-[11px] uppercase">Lampu di atas bak</p>
        {(
          [
            ['ok', 'Berjalan, semua aman'],
            ['warn', 'Perlu dicek: kadar, pH, suhu, volt atau terlambat catat'],
            ['idle', 'Tidak ada batch berjalan'],
          ] as const
        ).map(([tone, text]) => (
          <div key={tone} className="gap-2 flex items-center">
            <StatusDot tone={TONE_DOT[tone]} />
            {text}
          </div>
        ))}
      </div>
      <Button variant="outline" className="mt-5 w-full" onClick={onAdd}>
        <Plus />
        Tambah bak
      </Button>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 font-semibold tracking-wider text-[11px] text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** The four series an operator follows on a running bath, from every reading that has a value. */
function trendsOf(calc: BatchCalc) {
  const series = (pick: (r: BatchCalc['rows'][number]) => number | null) =>
    calc.rows.map(pick).filter((v): v is number => v !== null)
  return [
    { label: 'Tebal emas', unit: 'µm', digits: 1, data: series((r) => r.micron) },
    { label: 'pH', unit: '', digits: 2, data: series((r) => r.reading.ph) },
    { label: 'Suhu', unit: '°C', digits: 1, data: series((r) => r.reading.tempC) },
    { label: 'Volt', unit: 'V', digits: 2, data: series((r) => r.reading.volt) },
  ]
}
