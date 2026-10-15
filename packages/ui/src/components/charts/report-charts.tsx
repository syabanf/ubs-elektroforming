import { cn } from '../../lib/cn'
import { useElementSize } from '../../lib/use-element-size'
import {
  ReferenceLine,
  XLabels,
  YGrid,
  axisWidth,
  columnPath,
  defaultFormat,
  niceScale,
  xAxisLabels,
} from './shared'

const X_BAND = 22
const TOP = 12
const seriesFills = {
  ink: 'fill-ink',
  info: 'fill-info',
  accent: 'fill-accent',
  muted: 'fill-chart-muted',
} as const
const seriesDots = { ink: 'bg-ink', info: 'bg-info', accent: 'bg-accent', muted: 'bg-chart-muted' } as const
type SeriesTone = keyof typeof seriesFills

function Legend({ series }: { series: { name: string; tone: SeriesTone }[] }) {
  return (
    <ul className="mb-2 gap-x-4 gap-y-1 text-xs flex flex-wrap text-muted">
      {series.map((s) => (
        <li key={s.name} className="gap-1.5 flex items-center">
          <span className={cn('size-2.5 rounded-sm', seriesDots[s.tone])} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

export type GroupedColumnChartProps = {
  /** One group per label; `values[i]` belongs to `series[i]`. Nulls leave a gap. */
  data: { label: string; values: (number | null)[] }[]
  series: { name: string; tone: SeriesTone }[]
  height?: number
  format?: (value: number) => string
  referenceLine?: { value: number; label: string }
  ariaLabel: string
  className?: string
}

/** Columns side by side per label, for target against actual or estimate against measured. */
export function GroupedColumnChart({
  data,
  series,
  height = 220,
  format = defaultFormat,
  referenceLine,
  ariaLabel,
  className,
}: GroupedColumnChartProps) {
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>()
  const values = data.flatMap((d) => d.values.filter((v): v is number => v !== null))
  const ref = referenceLine?.value ?? 0
  const scale = niceScale(Math.min(0, ref, ...values), Math.max(0, ref, ...values), 4)
  const tickLabels = scale.ticks.map(format)
  const left = axisWidth(tickLabels)
  const bottom = height - X_BAND
  const y = (v: number) => TOP + ((scale.max - v) / (scale.max - scale.min)) * (bottom - TOP)
  const slot = data.length ? (width - left) / data.length : 0
  const bar = Math.max(1, Math.min(14, (slot - 4) / series.length))
  const center = (i: number) => left + i * slot + slot / 2
  const labels = xAxisLabels(
    data.map((d) => d.label),
    center,
    slot,
    width,
  )

  return (
    <div className={className}>
      <Legend series={series} />
      <div ref={sizeRef} className="relative w-full" style={{ height }}>
        {width > 0 && values.length === 0 && (
          <p className="text-sm flex h-full items-center justify-center text-muted">Belum ada data</p>
        )}
        {width > 0 && values.length > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            className="block overflow-visible"
          >
            <YGrid ticks={scale.ticks} labels={tickLabels} y={y} left={left} right={width} />
            {data.map((d, i) => (
              <g key={d.label}>
                {d.values.map((v, s) =>
                  v === null ? null : (
                    <path
                      key={s}
                      d={columnPath(center(i) - (bar * series.length) / 2 + s * bar, bar - 1, y(0), y(v), 3)}
                      className={seriesFills[series[s]!.tone]}
                    >
                      <title>{`${d.label} · ${series[s]!.name}: ${format(v)}`}</title>
                    </path>
                  ),
                )}
              </g>
            ))}
            {referenceLine && (
              <ReferenceLine
                y={y(referenceLine.value)}
                left={left}
                right={width}
                label={referenceLine.label}
                className="stroke-muted"
              />
            )}
            <XLabels labels={labels} y={height - 6} />
          </svg>
        )}
      </div>
    </div>
  )
}

export type ScatterChartProps = {
  points: { x: number; y: number; label: string }[]
  /** Least-squares line drawn across the x range. */
  fit?: { slope: number; intercept: number } | null
  height?: number
  formatX?: (value: number) => string
  formatY?: (value: number) => string
  xLabel: string
  ariaLabel: string
  className?: string
}

/** One dot per pair, for a relation such as volt against gold content. */
export function ScatterChart({
  points,
  fit,
  height = 240,
  formatX = defaultFormat,
  formatY = defaultFormat,
  xLabel,
  ariaLabel,
  className,
}: ScatterChartProps) {
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>()
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const yScale = niceScale(Math.min(...ys), Math.max(...ys), 4)
  const xScale = niceScale(Math.min(...xs), Math.max(...xs), 5)
  const tickLabels = yScale.ticks.map(formatY)
  const left = axisWidth(tickLabels)
  const bottom = height - X_BAND
  const y = (v: number) => TOP + ((yScale.max - v) / (yScale.max - yScale.min)) * (bottom - TOP)
  const x = (v: number) => left + ((v - xScale.min) / (xScale.max - xScale.min)) * (width - left - 8)
  const clampY = (v: number) => Math.min(bottom, Math.max(TOP, y(v)))

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height: height + 16 }}>
      {width > 0 && points.length === 0 && (
        <p className="text-sm flex h-full items-center justify-center text-muted">Belum ada data</p>
      )}
      {width > 0 && points.length > 0 && (
        <svg
          width={width}
          height={height + 16}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          <YGrid ticks={yScale.ticks} labels={tickLabels} y={y} left={left} right={width} />
          {fit && (
            <line
              x1={x(xScale.min)}
              x2={x(xScale.max)}
              y1={clampY(fit.intercept + fit.slope * xScale.min)}
              y2={clampY(fit.intercept + fit.slope * xScale.max)}
              className="stroke-accent"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(p.x)}
              cy={y(p.y)}
              r={4}
              className="fill-info/70 stroke-card"
              strokeWidth={1}
            >
              <title>{`${p.label}: ${formatX(p.x)} · ${formatY(p.y)}`}</title>
            </circle>
          ))}
          {xScale.ticks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted text-[11px] tabular-nums"
            >
              {formatX(t)}
            </text>
          ))}
          <text x={width} y={height + 12} textAnchor="end" className="fill-muted text-[11px]">
            {xLabel}
          </text>
        </svg>
      )}
    </div>
  )
}

export type WaterfallChartProps = {
  /** `total` steps stand on the axis; `delta` steps float from the running total. */
  steps: { label: string; value: number; kind: 'total' | 'delta' }[]
  height?: number
  format?: (value: number) => string
  ariaLabel: string
  className?: string
}

/** Running balance: opening, additions and removals, closing. */
export function WaterfallChart({
  steps,
  height = 240,
  format = defaultFormat,
  ariaLabel,
  className,
}: WaterfallChartProps) {
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>()
  let running = 0
  const bars = steps.map((s) => {
    const from = s.kind === 'total' ? 0 : running
    const to = s.kind === 'total' ? s.value : running + s.value
    running = to
    return { ...s, from, to }
  })
  const scale = niceScale(
    Math.min(0, ...bars.map((b) => Math.min(b.from, b.to))),
    Math.max(...bars.map((b) => b.to), 0),
    4,
  )
  const tickLabels = scale.ticks.map(format)
  const left = axisWidth(tickLabels)
  const bottom = height - X_BAND
  const y = (v: number) => TOP + ((scale.max - v) / (scale.max - scale.min)) * (bottom - TOP)
  const slot = bars.length ? (width - left) / bars.length : 0
  const bar = Math.max(8, Math.min(48, slot - 12))
  const center = (i: number) => left + i * slot + slot / 2
  const labels = xAxisLabels(
    bars.map((b) => b.label),
    center,
    slot,
    width,
  )

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          <YGrid ticks={scale.ticks} labels={tickLabels} y={y} left={left} right={width} />
          {bars.map((b, i) => {
            const top = y(Math.max(b.from, b.to))
            const tone = b.kind === 'total' ? 'fill-ink' : b.value >= 0 ? 'fill-info' : 'fill-accent'
            return (
              <g key={b.label}>
                <rect
                  x={center(i) - bar / 2}
                  y={top}
                  width={bar}
                  height={Math.max(1, Math.abs(y(b.from) - y(b.to)))}
                  rx={3}
                  className={tone}
                >
                  <title>{`${b.label}: ${format(b.value)}`}</title>
                </rect>
                <text
                  x={center(i)}
                  y={top - 6}
                  textAnchor="middle"
                  className="font-semibold fill-foreground text-[11px] tabular-nums"
                >
                  {b.kind === 'delta' && b.value > 0 ? '+' : ''}
                  {format(b.value)}
                </text>
              </g>
            )
          })}
          <XLabels labels={labels} y={height - 6} />
        </svg>
      )}
    </div>
  )
}
