import {
  type ScadaBase,
  type ScadaSample,
  SIM_TEMBAGA,
  computeBatch,
  minutesBetween,
  parseScadaSample,
  scadaUnitId,
  scadaUnits,
  simulateSample,
  toLocalSeconds,
} from '@ef/fixtures'
import { createContext, use, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from './catalog'
import { useStore } from './store'

/** Server-sent events from the mini PC gateway; without it the console simulates the modules. */
const GATEWAY_URL = import.meta.env.VITE_SCADA_URL as string | undefined
const SIM_EVERY_MS = 5000

type Scada = {
  mode: 'simulasi' | 'live'
  connected: boolean
  samples: Record<string, ScadaSample>
}

const ScadaContext = createContext<Scada>({ mode: 'simulasi', connected: false, samples: {} })

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const { state } = useStore()
  const catalog = useCatalog()
  const units = useMemo(() => scadaUnits(state.baths), [state.baths])
  const [samples, setSamples] = useState<Record<string, ScadaSample>>({})
  const [connected, setConnected] = useState(false)

  // Simulated EF units hover around the last log of the batch running in their bath; the meter has
  // kept counting at the last ampere since that log.
  const bases = useMemo(() => {
    const out: Record<string, ScadaBase> = {}
    for (const unit of units) {
      if (unit.machine === 'tembaga') {
        out[unit.id] = SIM_TEMBAGA
        continue
      }
      const batch = state.batches.find((b) => b.bathId === unit.bathId && b.status === 'running')
      const s = batch && computeBatch(batch, catalog).summary
      const sinceLog = s?.lastRecordedAt
        ? Math.max(0, minutesBetween(s.lastRecordedAt, toLocalSeconds(new Date())))
        : 0
      out[unit.id] = s
        ? {
            tempC: s.latestTempC,
            volt: s.latestVolt,
            ampere: s.latestAmpere,
            ph: s.latestPh,
            running: true,
            amm: (s.lastAmmReal ?? s.totalAmm) + (s.latestAmpere ?? 0) * sinceLog,
          }
        : { tempC: null, volt: 0, ampere: 0, ph: null, running: false, amm: 0 }
    }
    return out
  }, [units, state.batches, catalog])
  const basesRef = useRef(bases)
  basesRef.current = bases

  useEffect(() => {
    if (GATEWAY_URL) {
      const source = new EventSource(GATEWAY_URL)
      source.onopen = () => setConnected(true)
      source.onerror = () => setConnected(false)
      source.onmessage = (e) => {
        let sample: ScadaSample | null = null
        try {
          sample = parseScadaSample(JSON.parse(e.data))
        } catch {
          return
        }
        if (sample) setSamples((prev) => ({ ...prev, [sample.unitId]: sample }))
      }
      return () => source.close()
    }
    const tick = () =>
      setSamples((prev) => {
        const at = toLocalSeconds(new Date())
        const next: Record<string, ScadaSample> = {}
        for (const unit of units)
          next[unit.id] = simulateSample(unit, basesRef.current[unit.id]!, prev[unit.id], at, Math.random)
        return next
      })
    tick()
    const id = setInterval(tick, SIM_EVERY_MS)
    return () => clearInterval(id)
  }, [units])

  const value = useMemo<Scada>(
    () => ({ mode: GATEWAY_URL ? 'live' : 'simulasi', connected: GATEWAY_URL ? connected : true, samples }),
    [connected, samples],
  )
  return <ScadaContext value={value}>{children}</ScadaContext>
}

export const useScada = () => use(ScadaContext)

/** The latest message from the EF unit of a bath, if any. */
export const useBathSample = (bathId: string): ScadaSample | undefined =>
  useScada().samples[scadaUnitId(bathId)]
