import type { ScadaSample } from '@ef/fixtures'
import { cn, useMediaQuery } from '@ef/ui'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readPalette } from '../../lib/palette'
import { UnitReadout } from './readout'
import { ShopfloorScene, type UnitLook } from './shopfloor-scene'
import { type Shopfloor, unitState } from './shopfloor'

type Props = {
  floor: Shopfloor
  samples: Record<string, ScadaSample>
  batchCodes: Record<string, string>
  online: boolean
  pcLabel: string
}

/** The SCADA floor in 3D; loaded with its own chunk so Three.js stays off the other views. */
export default function Shopfloor3D({ floor, samples, batchCodes, online, pcLabel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ShopfloorScene | null>(null)
  const [labels, setLabels] = useState<Map<string, HTMLElement>>(new Map())
  const motion = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const now = new Date()

  useEffect(() => {
    const scene = new ShopfloorScene(hostRef.current!, readPalette())
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current!
    scene.setFloor(floor)
    setLabels(new Map(scene.labels))
  }, [floor])

  useEffect(() => {
    const scene = sceneRef.current!
    scene.online = online
    scene.motion = motion
    const looks: Record<string, UnitLook> = {}
    for (const u of floor.units) {
      const sample = samples[u.unit.id]
      if (sample)
        looks[u.unit.id] = { running: !!sample.running, fresh: unitState(sample, new Date()) === 'live' }
    }
    scene.setUnits(looks, online)
  }, [floor, samples, online, motion])

  return (
    <div className="space-y-3">
      <div ref={hostRef} className="rounded-2xl relative h-[560px] overflow-hidden" />
      <p className="text-xs text-muted">
        Seret untuk memutar, gulir untuk zoom. Titik biru di kabel adalah data yang mengalir ke mini PC.
      </p>
      {floor.units.map((u) => {
        const el = labels.get(u.unit.id)
        const sample = samples[u.unit.id]
        return (
          el &&
          createPortal(
            <UnitReadout
              unit={u.unit}
              sample={sample}
              state={unitState(sample, now)}
              batchCode={batchCodes[u.unit.id]}
              compact
              className="w-32 opacity-95"
            />,
            el,
            u.unit.id,
          )
        )
      })}
      {floor.modules.map((m) => {
        const el = labels.get(`module:${m.machine}`)
        return el && createPortal(<Tag online={online}>Modul SCADA</Tag>, el, m.machine)
      })}
      {labels.get('pc') &&
        createPortal(<Tag online={online}>Mini PC · {pcLabel}</Tag>, labels.get('pc')!, 'pc')}
    </div>
  )
}

function Tag({ online, children }: { online: boolean; children: React.ReactNode }) {
  return (
    <span className="gap-1.5 px-2.5 py-1 font-semibold flex items-center rounded-full bg-ink/90 text-[11px] whitespace-nowrap text-on-ink">
      <span className={cn('size-1.5 rounded-full', online ? 'bg-success' : 'bg-muted')} />
      {children}
    </span>
  )
}
