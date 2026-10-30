import type { Bath } from '@ef/types'

// SCADA plan of 30 Oct 2026: each machine sends its parameters over serial to a SCADA module,
// and one mini PC for the Electroforming department collects every module.

export type ScadaParam = 'tempC' | 'volt' | 'ampere' | 'running' | 'ph' | 'amm'

export const SCADA_PARAM: Record<ScadaParam, { label: string; unit: string }> = {
  tempC: { label: 'Suhu', unit: '°C' },
  volt: { label: 'Volt', unit: 'V' },
  ampere: { label: 'Ampere', unit: 'A' },
  running: { label: 'Running', unit: '' },
  ph: { label: 'pH', unit: '' },
  amm: { label: 'AMM', unit: 'A·menit' },
}

export type ScadaMachineId = 'ef' | 'tembaga'

export const SCADA_MACHINES: { id: ScadaMachineId; name: string; params: ScadaParam[] }[] = [
  { id: 'ef', name: 'Mesin EF', params: ['tempC', 'volt', 'ampere', 'running', 'ph', 'amm'] },
  { id: 'tembaga', name: 'Mesin Tembaga Asam & Basa', params: ['tempC', 'volt', 'ampere', 'amm'] },
]

export const scadaUnitId = (bathId: string) => `ef:${bathId}`

/** One serial source: an electroforming bath or a copper pre-treatment tank. */
export type ScadaUnit = { id: string; machine: ScadaMachineId; name: string; bathId: string | null }

export function scadaUnits(baths: Bath[]): ScadaUnit[] {
  return [
    ...baths.map((b) => ({ id: scadaUnitId(b.id), machine: 'ef' as const, name: b.name, bathId: b.id })),
    { id: 'tembaga:asam', machine: 'tembaga', name: 'Tembaga asam', bathId: null },
    { id: 'tembaga:basa', machine: 'tembaga', name: 'Tembaga basa', bathId: null },
  ]
}

/** One message from a SCADA module. A parameter the machine does not send stays null. */
export type ScadaSample = {
  unitId: string
  /** Local `YYYY-MM-DDTHH:mm:ss`. */
  at: string
  tempC: number | null
  volt: number | null
  ampere: number | null
  running: boolean | null
  ph: number | null
  /** Cumulative ampere-minute meter. */
  amm: number | null
}

/** A sample older than this no longer counts as live. */
export const SCADA_STALE_SEC = 120

export const toLocalSeconds = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const pad = (n: number) => String(n).padStart(2, '0')

export const sampleAgeSec = (sample: ScadaSample, now: Date) =>
  Math.max(0, Math.round((now.getTime() - Date.parse(sample.at)) / 1000))

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Reads one JSON message from the mini PC gateway; anything without a unit id or a valid time is dropped. */
export function parseScadaSample(raw: unknown): ScadaSample | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.unitId !== 'string' || typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return null
  return {
    unitId: r.unitId,
    at: r.at,
    tempC: num(r.tempC),
    volt: num(r.volt),
    ampere: num(r.ampere),
    running: typeof r.running === 'boolean' ? r.running : null,
    ph: num(r.ph),
    amm: num(r.amm),
  }
}

/** The reading fields a sample fills in the Catat form. */
export const readingFromSample = (s: ScadaSample) => ({
  volt: s.volt,
  ampere: s.ampere,
  ph: s.ph,
  tempC: s.tempC,
  ammReal: s.amm,
})

/** What a simulated unit hovers around: the last logged values of its batch, or the tank placeholders. */
export type ScadaBase = {
  tempC: number | null
  volt: number | null
  ampere: number | null
  ph: number | null
  running: boolean
  amm: number
}

/** Placeholder copper tank values until the modules send real ones. */
export const SIM_TEMBAGA: ScadaBase = { tempC: 45, volt: 2.5, ampere: 8, ph: null, running: true, amm: 0 }

/** Base plus noise, rounded to the digits the plant reads off the display. */
const jitter = (base: number | null, spread: number, digits: number, rand: () => number) =>
  base === null ? null : Number((base + (rand() - 0.5) * 2 * spread).toFixed(digits))

/**
 * A simulated message: values wander around the base and the AMM meter grows by ampere × minutes while
 * the machine runs. The copper machine sends neither pH nor running.
 */
export function simulateSample(
  unit: ScadaUnit,
  base: ScadaBase,
  prev: ScadaSample | undefined,
  at: string,
  rand: () => number,
): ScadaSample {
  const ef = unit.machine === 'ef'
  const volt = base.running ? jitter(base.volt, 0.01, 2, rand) : 0
  const ampere = base.running ? jitter(base.ampere, 0.1, 2, rand) : 0
  const minutes = prev ? Math.max(0, (Date.parse(at) - Date.parse(prev.at)) / 60000) : 0
  // The meter never reads below the last value an operator logged.
  const amm = Math.max(prev?.amm ?? 0, base.amm) + (ampere ?? 0) * minutes
  return {
    unitId: unit.id,
    at,
    tempC: jitter(base.tempC, 0.2, 1, rand),
    volt,
    ampere,
    running: ef ? base.running : null,
    ph: ef ? jitter(base.ph, 0.02, 2, rand) : null,
    amm: Math.round(amm * 10) / 10,
  }
}
