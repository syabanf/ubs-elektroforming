import type { ScadaSample } from '@ef/fixtures'
import { cn, useMediaQuery } from '@ef/ui'
import { Monitor, RadioTower } from 'lucide-react'
import { type Point, type Shopfloor, unitState } from './shopfloor'
import { UnitReadout } from './readout'

type Props = {
  floor: Shopfloor
  samples: Record<string, ScadaSample>
  batchCodes: Record<string, string>
  /** Modules and mini PC are talking: data packets run along the network cables. */
  online: boolean
  pcLabel: string
}

const line = (path: Point[]) => path.map(([x, z]) => `${x},${z}`).join(' ')

/** The department seen from above: zones per machine, tanks with their newest values, cables to the mini PC. */
export function Shopfloor2D({ floor, samples, batchCodes, online, pcLabel }: Props) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const now = new Date()
  const { room } = floor
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const at = (r: { x: number; z: number; w: number; d: number }) => ({
    left: pct(r.x, room.w),
    top: pct(r.z, room.d),
    width: pct(r.w, room.w),
    height: pct(r.d, room.d),
  })

  return (
    <div className="space-y-3">
      {/* The plan keeps its proportions; on a phone it scrolls sideways inside its frame. */}
      <div className="rounded-2xl overflow-x-auto bg-surface-2">
        <div className="relative min-w-[820px]" style={{ aspectRatio: `${room.w} / ${room.d}` }}>
          <svg
            viewBox={`0 0 ${room.w} ${room.d}`}
            className="inset-0 absolute size-full"
            aria-hidden
            preserveAspectRatio="none"
          >
            {floor.zones.map((z) => (
              <rect
                key={z.machine}
                x={z.x}
                y={z.z}
                width={z.w}
                height={z.d}
                rx={0.25}
                className="fill-card stroke-border"
                strokeWidth={0.04}
              />
            ))}
            {floor.serial.map((c) => (
              <polyline
                key={c.unitId}
                points={line(c.path)}
                fill="none"
                className="stroke-muted"
                strokeWidth={0.05}
                strokeDasharray="0.15 0.12"
              />
            ))}
            {floor.network.map((c) => (
              <polyline
                key={c.machine}
                points={line(c.path)}
                fill="none"
                className={online ? 'stroke-info' : 'stroke-muted'}
                strokeWidth={0.08}
                strokeLinejoin="round"
              />
            ))}
            {online &&
              floor.network.map((c) => (
                <polyline
                  key={`${c.machine}-packets`}
                  points={line(c.path)}
                  fill="none"
                  className="stroke-card"
                  strokeWidth={0.08}
                  strokeDasharray="0.12 0.6"
                >
                  {animate && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0.72"
                      to="0"
                      dur="0.9s"
                      repeatCount="indefinite"
                    />
                  )}
                </polyline>
              ))}
          </svg>

          {floor.zones.map((z) => (
            <p
              key={z.machine}
              className="px-3 pt-2 font-semibold tracking-wider absolute text-[11px] uppercase"
              style={{ left: pct(z.x, room.w), top: pct(z.z, room.d) }}
            >
              {z.name}
            </p>
          ))}
          {floor.units.map((u) => {
            const sample = samples[u.unit.id]
            return (
              <div key={u.unit.id} className="absolute flex items-stretch" style={at(u)}>
                <UnitReadout
                  unit={u.unit}
                  sample={sample}
                  state={unitState(sample, now)}
                  batchCode={batchCodes[u.unit.id]}
                  className="w-full"
                />
              </div>
            )
          })}
          {floor.modules.map((m) => (
            <div
              key={m.machine}
              title="Tiang modul SCADA: serial dari mesin masuk ke sini, lalu lewat kabel jaringan ke mini PC"
              className={cn(
                'rounded-lg [&_svg]:size-4 absolute flex items-center justify-center bg-ink text-on-ink',
                online && 'ring-2 ring-info',
              )}
              style={at(m)}
            >
              <RadioTower />
            </div>
          ))}
          <div
            className="gap-2 rounded-xl px-3 text-xs absolute flex items-center bg-ink text-on-ink"
            style={at(floor.pc)}
          >
            <Monitor className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="font-semibold block">Mini PC</span>
              <span className="block truncate text-on-ink-muted">{pcLabel}</span>
            </span>
          </div>
        </div>
      </div>
      <ul className="gap-x-5 gap-y-1 text-xs flex flex-wrap text-muted">
        <li className="gap-1.5 flex items-center">
          <span className="w-5 border-t-2 border-dashed border-muted" />
          Kabel serial mesin ke modul
        </li>
        <li className="gap-1.5 flex items-center">
          <span className={cn('w-5 border-t-2', online ? 'border-info' : 'border-muted')} />
          Kabel jaringan modul ke mini PC
        </li>
        <li className="gap-1.5 flex items-center">
          <RadioTower className="size-3.5" />
          Tiang modul SCADA
        </li>
        <li className="gap-1.5 flex items-center">
          <span className="size-2 rounded-full bg-success" /> Data baru
          <span className="ml-2 size-2 rounded-full bg-warning" /> Data lama
          <span className="ml-2 size-2 rounded-full bg-muted" /> Belum ada data
        </li>
      </ul>
    </div>
  )
}
