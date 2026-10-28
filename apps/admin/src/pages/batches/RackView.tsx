import { type BatchCalc, type LoadLineCalc, fmtNumber } from '@ef/fixtures'
import type { Batch } from '@ef/types'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@ef/ui'
import { Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from '../../state/catalog'
import { type RackLine, RackScene } from './rack-scene'

type Props = { batch: Batch; calc: BatchCalc }

/** Models with a ring size are rings; parts are told apart by name (plat, kawat SS hooks, copper wire). */
function shapeOf(l: LoadLineCalc, sized: boolean): RackLine['shape'] {
  if (l.kind === 'model') return sized ? 'ring' : 'drop'
  if (/plat/i.test(l.name)) return 'plate'
  return /\bss\b|cantol/i.test(l.name) ? 'hook' : 'wire'
}

/** Deposit after each thickness reading, so the slider replays the gold growing on the rack. */
function depositSteps(batch: Batch, calc: BatchCalc) {
  const steps = calc.rows
    .filter((r) => r.micron !== null)
    .map((r) => ({ label: `Pembacaan ke-${r.reading.no}`, micron: r.micron! }))
  if (steps.length === 0 && calc.summary.micron !== null)
    steps.push({ label: 'Hasil akhir', micron: calc.summary.micron })
  return [{ label: batch.status === 'preparing' ? 'Belum dilapis' : 'Awal proses', micron: 0 }, ...steps]
}

export function RackView({ batch, calc }: Props) {
  const { models } = useCatalog()
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<RackScene | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const steps = useMemo(() => depositSteps(batch, calc), [batch, calc])
  const [step, setStep] = useState<number | null>(null)
  const shown = steps[Math.min(step ?? steps.length - 1, steps.length - 1)]!
  const progress = batch.targetMicron > 0 ? shown.micron / batch.targetMicron : 0

  const lines = calc.prep.lines
  const rackLines = useMemo<RackLine[]>(
    () =>
      lines.map((l) => ({
        id: l.line.id,
        group: l.line.label.trim(),
        qty: l.line.qty,
        unitAreaDm2: l.unitAreaDm2,
        shape: shapeOf(l, models.get(l.line.modelId ?? '')?.size != null),
      })),
    [lines, models],
  )
  const byId = useMemo(() => new Map(lines.map((l) => [l.line.id, l])), [lines])
  const hovered = hover ? byId.get(hover.id) : undefined

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim()
    const scene = new RackScene(
      host,
      ink,
      (id, x, y) => setHover(id ? { id, x, y } : null),
      (id) => setSelected((current) => (id === current ? null : id)),
    )
    scene.motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => sceneRef.current?.setRack(rackLines), [rackLines])
  useEffect(() => sceneRef.current?.setProgress(progress), [progress])
  useEffect(() => sceneRef.current?.highlight(selected), [selected])

  return (
    <Card>
      <CardHeader
        action={
          <Button variant="outline" size="sm" onClick={() => sceneRef.current?.fit()}>
            <Maximize2 />
            Tampilan awal
          </Button>
        }
      >
        <CardTitle>Rak 3D</CardTitle>
        <p className="text-xs text-muted">
          Satu kait per barang, ukuran mengikuti luas per buah. Warna berubah dari timah ke emas mengikuti
          tebal lapisan. Seret untuk memutar, klik barang untuk menyorot barisnya.
        </p>
      </CardHeader>
      <CardContent className="gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] grid grid-cols-1">
        <div className="space-y-3 min-w-0">
          <div className="h-80 sm:h-96 rounded-2xl relative overflow-hidden bg-ink">
            <div
              ref={hostRef}
              className="inset-0 absolute"
              role="img"
              aria-label={`Rak batch ${batch.code}: ${fmtNumber(calc.prep.pieces, 0)} barang, tebal ${fmtNumber(shown.micron, 1)} µm`}
            />
            {hovered && hover && (
              <div
                className="px-3 py-2 text-xs rounded-xl shadow-lg pointer-events-none absolute z-10 bg-card"
                style={{ left: hover.x + 12, top: hover.y + 12 }}
              >
                <p className={cn('font-semibold', hovered.kind === 'model' && 'font-mono')}>{hovered.name}</p>
                <p className="text-muted tabular-nums">
                  {fmtNumber(hovered.line.qty, 1)} × {fmtNumber(hovered.unitAreaDm2, 5)} dm² ={' '}
                  {fmtNumber(hovered.areaDm2, 3)} dm²
                </p>
              </div>
            )}
            <p className="left-3 top-3 px-2.5 py-1 text-xs bg-white/10 absolute rounded-full text-on-ink tabular-nums">
              {shown.label} · {fmtNumber(shown.micron, 1)} / {fmtNumber(batch.targetMicron, 0)} µm
            </p>
          </div>
          {steps.length > 1 && (
            <label className="gap-3 text-xs flex items-center text-muted">
              <span className="shrink-0">Putar ulang</span>
              <input
                type="range"
                min={0}
                max={steps.length - 1}
                value={Math.min(step ?? steps.length - 1, steps.length - 1)}
                onChange={(e) => setStep(Number(e.target.value))}
                className="w-full accent-accent"
                aria-valuetext={`${shown.label}, ${fmtNumber(shown.micron, 1)} µm`}
              />
            </label>
          )}
        </div>
        <ul className="lg:max-h-96 space-y-1 overflow-y-auto" aria-label="Isi rak di gambar">
          {lines.map((l) => {
            const active = selected === l.line.id
            return (
              <li key={l.line.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(active ? null : l.line.id)}
                  className={cn(
                    'gap-3 px-3 py-2 rounded-xl flex w-full items-center justify-between text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                    active ? 'bg-ink text-on-ink' : 'hover:bg-surface',
                    hover?.id === l.line.id && !active && 'bg-surface',
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'text-sm font-semibold block truncate',
                        l.kind === 'model' && 'font-mono',
                      )}
                    >
                      {l.name}
                    </span>
                    <span className={cn('text-xs block', active ? 'text-on-ink-muted' : 'text-muted')}>
                      {l.line.label
                        ? `Rak ${l.line.label}`
                        : l.kind === 'model'
                          ? 'Barang'
                          : 'Plat atau kawat'}
                    </span>
                  </span>
                  <span className="text-sm shrink-0 tabular-nums">{fmtNumber(l.line.qty, 1)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
