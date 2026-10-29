import type { Batch, Directive, Reading } from '@ef/types'
import { type Catalog, type PrepCalc, computePrep } from './prep'

// Electrochemical equivalents of Au and Cu used by the spreadsheet ("Persamaan Elektrokimia").
const AU_EQ = 122.616
const CU_EQ = 39.48
// Fit the sheet uses to read the average Au fraction back from the average equivalent.
const AVG_AU_A = 1.4749
const AVG_AU_B = 58.228
// Current density the sheet assumes for the first interval, A/dm².
const START_ADM2 = 0.3
// Volt difference inside which the advice is "hold".
const VOLT_DEADBAND = 0.005
// The sheet withholds advice until this many earlier readings exist.
export const MIN_REGRESSION_POINTS = 5

export type Regression = { n: number; slope: number | null; intercept: number | null; r2: number | null }

export type Advice = Regression & {
  suggestedVolt: number | null
  deltaVolt: number | null
  directive: Directive
}

/** Every column the sheet derives for one reading. */
export type ReadingCalc = {
  reading: Reading
  realAdm2: number | null
  targetAmpere: number | null
  /** Ampere × minutes for the interval ("AMM"). */
  amm: number | null
  diffAmm: number | null
  cu: number | null
  eqv: number | null
  weightG: number | null
  micron: number | null
  /** Micron gained per ampere-minute since the previous thickness reading. */
  micronPerAmmDelta: number | null
  targetMicronAtAmm: number | null
  pctOfTheory: number | null
  micronPerAmm: number | null
  micronPerHour: number | null
  cumMinutes: number
  /** Advice built from the readings before this one, compared with the volt this one used. */
  advice: Advice
}

export type BatchSummary = {
  readingCount: number
  totalMinutes: number
  totalHours: number
  totalAmm: number
  totalWeightG: number
  avgEqv: number | null
  avgAu: number | null
  lastAmmReal: number | null
  cathodeEfficiency: number | null
  targetMicronPerAmm: number | null
  latestMicron: number | null
  /** Kadar of the first X-ray reading, the first layer plated. */
  firstAu: number | null
  latestAu: number | null
  latestVolt: number | null
  latestAmpere: number | null
  latestPh: number | null
  latestTempC: number | null
  /** Clock time of the most recent reading that has one. */
  lastRecordedAt: string | null
  progress: number
  micronRate: number | null
  remainingHours: number | null
  /** Clock time the target thickness should be reached: the last log plus the remaining hours. */
  finishAt: string | null
  avgPctOfTheory: number | null
  avgMicronPerHour: number | null
  /** Surface area in use: the rack total once the rack has lines, else the typed value. */
  areaDm2: number | null
  areaSource: 'rack' | 'typed' | 'none'
  theoreticalAmm: number | null
  /** AMM meter at the end of the run: the last reading, else the total typed in the result. */
  realAmm: number | null
  /** Deposit thickness so far: the last thickness reading, else the measured result. */
  micron: number | null
  micronPerAmmReal: number | null
  /** Real micron per AMM against the theory, %. */
  micronRatioPct: number | null
  initialAmpere: number | null
  /** Advice for the next interval: every reading so far, compared with the last volt. */
  next: Advice
}

export type BatchCalc = { rows: ReadingCalc[]; summary: BatchSummary; prep: PrepCalc }

const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b)
const percent = (a: number | null, b: number | null) => {
  const r = ratio(a, b)
  return r === null ? null : r * 100
}

/** Equivalent weight of the Au-Cu deposit for an Au fraction. */
export function equivalent(au: number | null): number | null {
  if (au === null || au === 0) return null
  return 1 / (au / AU_EQ + (1 - au) / CU_EQ)
}

export function micronFromThickness(thicknessMm: number | null, initialMm: number | null): number | null {
  if (thicknessMm === null || initialMm === null) return null
  return ((thicknessMm - initialMm) / 2) * 1000
}

/** Least squares of Au fraction (y) against volt (x), the SLOPE / INTERCEPT / RSQ trio of the sheet. */
export function regress(points: { x: number; y: number }[]): Regression {
  const n = points.length
  if (n < 2) return { n, slope: null, intercept: null, r2: null }
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
    syy += (p.y - my) ** 2
  }
  if (sxx === 0) return { n, slope: null, intercept: null, r2: null }
  const slope = sxy / sxx
  return { n, slope, intercept: my - slope * mx, r2: syy === 0 ? null : (sxy * sxy) / (sxx * syy) }
}

export function advise(points: { x: number; y: number }[], targetAu: number, volt: number | null): Advice {
  const fit = regress(points)
  const suggestedVolt =
    fit.slope === null || fit.intercept === null || fit.slope === 0
      ? null
      : (targetAu - fit.intercept) / fit.slope
  const deltaVolt = suggestedVolt === null || volt === null ? null : suggestedVolt - volt
  let directive: Directive = 'insufficient'
  if (fit.n >= MIN_REGRESSION_POINTS && deltaVolt !== null) {
    directive = deltaVolt > VOLT_DEADBAND ? 'raise' : deltaVolt < -VOLT_DEADBAND ? 'lower' : 'hold'
  }
  return { ...fit, suggestedVolt, deltaVolt, directive }
}

const fitPoint = (r: Reading) => (r.au === null || r.volt === null ? [] : [{ x: r.volt, y: r.au }])

export function computeBatch(batch: Batch, catalog: Catalog): BatchCalc {
  const prep = computePrep(batch.prep, batch.targetMicron, catalog)
  const fromRack = prep.lines.length > 0
  const area = fromRack ? prep.areaDm2 : batch.surfaceAreaDm2
  const theoreticalAmm = fromRack ? prep.ammTheory : batch.theoreticalAmm
  const targetPerAmm = ratio(batch.targetMicron, theoreticalAmm)
  const readings = [...batch.readings].sort((a, b) => a.no - b.no)

  let cumMinutes = 0
  let cumAmm = 0
  let prevAmmReal: number | null = null
  let prevMeasured = { micron: 0, ammReal: 0 }
  const points: { x: number; y: number }[] = []

  const rows = readings.map((reading): ReadingCalc => {
    const { minutes, ampere, ammReal, au } = reading
    const amm = ampere !== null && minutes !== null ? ampere * minutes : null
    cumMinutes += minutes ?? 0
    cumAmm += amm ?? 0
    const eqv = equivalent(au)
    const micron = micronFromThickness(reading.thicknessMm, batch.initialThicknessMm)
    const targetMicronAtAmm = targetPerAmm === null || ammReal === null ? null : targetPerAmm * ammReal

    let micronPerAmmDelta: number | null = null
    if (micron !== null && ammReal !== null) {
      micronPerAmmDelta = ratio(micron - prevMeasured.micron, ammReal - prevMeasured.ammReal)
      prevMeasured = { micron, ammReal }
    }
    const diffAmm = ammReal === null ? null : ammReal - (prevAmmReal ?? 0)
    if (ammReal !== null) prevAmmReal = ammReal

    const advice = advise(points, batch.targetAu, reading.volt)
    points.push(...fitPoint(reading))

    return {
      reading,
      realAdm2: ratio(ampere, area),
      targetAmpere: reading.setTargetAdm2 === null || area === null ? null : reading.setTargetAdm2 * area,
      amm,
      diffAmm,
      cu: au === null ? null : 1 - au,
      eqv,
      weightG: eqv === null || amm === null ? null : (eqv * amm) / 1000,
      micron,
      micronPerAmmDelta,
      targetMicronAtAmm,
      pctOfTheory: percent(micron, targetMicronAtAmm),
      micronPerAmm: micron === null ? null : ratio(micron, cumAmm),
      micronPerHour: micron === null ? null : ratio(micron, cumMinutes / 60),
      cumMinutes,
      advice,
    }
  })

  const params = {
    area,
    areaSource: fromRack ? 'rack' : area === null ? 'none' : 'typed',
    theoreticalAmm,
  } as const
  return { rows, summary: summarize(batch, rows, points, params), prep }
}

const lastOf = <T>(rows: ReadingCalc[], pick: (r: ReadingCalc) => T | null): T | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = pick(rows[i]!)
    if (value !== null) return value
  }
  return null
}

const mean = (values: (number | null)[]) => {
  const xs = values.filter((v): v is number => v !== null)
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null
}

type Params = { area: number | null; areaSource: BatchSummary['areaSource']; theoreticalAmm: number | null }

function summarize(
  batch: Batch,
  rows: ReadingCalc[],
  points: { x: number; y: number }[],
  params: Params,
): BatchSummary {
  const totalMinutes = rows.reduce((s, r) => s + (r.reading.minutes ?? 0), 0)
  const totalAmm = rows.reduce((s, r) => s + (r.amm ?? 0), 0)
  const totalWeightG = rows.reduce((s, r) => s + (r.weightG ?? 0), 0)
  const avgEqv = totalWeightG > 0 ? (totalWeightG / totalAmm) * 1000 : null
  const lastAmmReal = lastOf(rows, (r) => r.reading.ammReal)
  const latestMicron = lastOf(rows, (r) => r.micron)
  const realAmm = lastAmmReal ?? batch.prep.totalAmmReal
  const micron = latestMicron ?? batch.prep.actualMicron
  const micronPerAmmReal = ratio(micron, realAmm)
  const latestVolt = lastOf(rows, (r) => r.reading.volt)
  const lastRecordedAt = lastOf(rows, (r) => r.reading.recordedAt)

  // Growth rate over the time it took to reach the last positive thickness reading.
  const lastGrowth = rows.findLastIndex((r) => r.micron !== null && r.micron > 0)
  const growthHours = lastGrowth < 0 ? 0 : rows[lastGrowth]!.cumMinutes / 60
  const micronRate = latestMicron !== null && latestMicron > 0 ? ratio(latestMicron, growthHours) : null
  const remainingHours = latestMicron === null ? null : ratio(batch.targetMicron - latestMicron, micronRate)

  return {
    readingCount: rows.length,
    totalMinutes,
    totalHours: totalMinutes / 60,
    totalAmm,
    totalWeightG,
    avgEqv,
    avgAu: avgEqv === null ? null : AVG_AU_A - AVG_AU_B / avgEqv,
    lastAmmReal,
    cathodeEfficiency: percent(params.theoreticalAmm, realAmm),
    targetMicronPerAmm: ratio(batch.targetMicron, params.theoreticalAmm),
    latestMicron,
    firstAu: rows.find((r) => r.reading.au !== null)?.reading.au ?? null,
    latestAu: lastOf(rows, (r) => r.reading.au),
    latestVolt,
    latestAmpere: lastOf(rows, (r) => r.reading.ampere),
    latestPh: lastOf(rows, (r) => r.reading.ph),
    latestTempC: lastOf(rows, (r) => r.reading.tempC),
    lastRecordedAt,
    progress: micron === null ? 0 : Math.max(0, micron / batch.targetMicron),
    micronRate,
    remainingHours,
    finishAt:
      lastRecordedAt === null || remainingHours === null
        ? null
        : toLocalIso(new Date(Date.parse(lastRecordedAt) + remainingHours * 3_600_000)),
    avgPctOfTheory: mean(rows.map((r) => r.pctOfTheory)),
    avgMicronPerHour: mean(rows.map((r) => r.micronPerHour)),
    areaDm2: params.area,
    areaSource: params.areaSource,
    theoreticalAmm: params.theoreticalAmm,
    realAmm,
    micron,
    micronPerAmmReal,
    micronRatioPct: percent(micronPerAmmReal, ratio(batch.targetMicron, params.theoreticalAmm)),
    initialAmpere: params.area === null ? null : params.area * START_ADM2,
    next: advise(points, batch.targetAu, latestVolt),
  }
}

export type AuBand = 'below' | 'within' | 'above'

export function auBand(au: number, batch: Pick<Batch, 'refAuMin' | 'refAuMax'>): AuBand {
  return au < batch.refAuMin ? 'below' : au > batch.refAuMax ? 'above' : 'within'
}

/** Operators log the bath every one to two hours. */
export const RECORD_DUE_MIN = 60
export const RECORD_LATE_MIN = 120

export type RecordState = 'ok' | 'due' | 'late'

/** Minutes between two local `YYYY-MM-DDTHH:mm` times. */
export const minutesBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60000)

/** How long ago the bath was last logged and whether the next log is due. */
export function recordStatus(lastRecordedAt: string | null, nowIso: string) {
  if (!lastRecordedAt) return null
  const minutesAgo = minutesBetween(lastRecordedAt, nowIso)
  const state: RecordState =
    minutesAgo > RECORD_LATE_MIN ? 'late' : minutesAgo >= RECORD_DUE_MIN ? 'due' : 'ok'
  const lateAt = new Date(Date.parse(lastRecordedAt) + RECORD_LATE_MIN * 60000)
  return { minutesAgo, state, lateAt: toLocalIso(lateAt) }
}

/** Hours since the run started: the logged intervals, plus the time since the last log while the batch runs. */
export function processHours(summary: BatchSummary, running: boolean, nowIso: string) {
  const open =
    running && summary.lastRecordedAt ? Math.max(0, minutesBetween(summary.lastRecordedAt, nowIso)) : 0
  return (summary.totalMinutes + open) / 60
}

/** One clock hour of a run: the readings logged in it, or how long the bath had gone unlogged by its end. */
export type LogHour = {
  /** Local `YYYY-MM-DDTHH`. */
  key: string
  /** Local `YYYY-MM-DDTHH:00`. */
  start: string
  rows: ReadingCalc[]
  minutes: number
  amm: number | null
  /** Deposit gained by the thickness readings of this hour, from the last thickness before it. */
  micronGain: number | null
  /** The last reading of the hour: its volt, ampere, pH and temperature describe the bath at the hour's end. */
  last: ReadingCalc | null
  /** Empty hour: minutes since the last log, at the hour's end or at `now` for the current hour. */
  unloggedMin: number | null
  state: 'logged' | RecordState
}

/** Hours after the last log that a running batch keeps growing empty hours, so a forgotten batch stays readable. */
const OPEN_HOURS_MAX = 24

/**
 * Splits the log into clock hours, from the hour of the first timed reading to the hour of the last one. A running
 * batch passes `nowIso` and gets the empty hours since its last log too. Readings without a clock time (rows
 * imported from Excel) come back in `untimed`.
 */
export function hourlyLog(
  rows: ReadingCalc[],
  nowIso?: string,
): { hours: LogHour[]; untimed: ReadingCalc[] } {
  const timed = rows
    .filter((r) => r.reading.recordedAt)
    .sort((a, b) => a.reading.recordedAt!.localeCompare(b.reading.recordedAt!))
  const untimed = rows.filter((r) => !r.reading.recordedAt)
  if (timed.length === 0) return { hours: [], untimed }

  const hourOf = (iso: string) => iso.slice(0, 13)
  const lastLog = timed.at(-1)!.reading.recordedAt!
  const openUntil = toLocalIso(new Date(Date.parse(lastLog) + OPEN_HOURS_MAX * 3600000))
  const end = nowIso && nowIso > lastLog ? (nowIso < openUntil ? nowIso : openUntil) : lastLog
  const hours: LogHour[] = []
  let lastLogged: string | null = null
  let lastMicron = 0
  let i = 0
  for (let t = Date.parse(`${hourOf(timed[0]!.reading.recordedAt!)}:00`); ; t += 3600000) {
    const start = toLocalIso(new Date(t))
    const key = hourOf(start)
    if (key > hourOf(end)) break
    const inHour: ReadingCalc[] = []
    while (i < timed.length && hourOf(timed[i]!.reading.recordedAt!) === key) inHour.push(timed[i++]!)
    const amms = inHour.map((r) => r.amm).filter((a): a is number => a !== null)
    const microns = inHour.map((r) => r.micron).filter((m): m is number => m !== null)
    let unloggedMin: number | null = null
    let state: LogHour['state'] = 'logged'
    if (inHour.length === 0 && lastLogged) {
      const hourEnd = toLocalIso(new Date(t + 3600000))
      unloggedMin = minutesBetween(lastLogged, hourEnd < end ? hourEnd : end)
      state = unloggedMin > RECORD_LATE_MIN ? 'late' : unloggedMin >= RECORD_DUE_MIN ? 'due' : 'ok'
    }
    hours.push({
      key,
      start,
      rows: inHour,
      minutes: inHour.reduce((sum, r) => sum + (r.reading.minutes ?? 0), 0),
      amm: amms.length ? amms.reduce((a, b) => a + b, 0) : null,
      micronGain: microns.length ? microns.at(-1)! - lastMicron : null,
      last: inHour.at(-1) ?? null,
      unloggedMin,
      state,
    })
    if (inHour.length) lastLogged = inHour.at(-1)!.reading.recordedAt
    if (microns.length) lastMicron = microns.at(-1)!
  }
  return { hours, untimed }
}

export type RangeState = 'within' | 'outside' | 'unset'

export function rangeState(value: number | null, min: number | null, max: number | null): RangeState {
  if (value === null || (min === null && max === null)) return 'unset'
  return (min !== null && value < min) || (max !== null && value > max) ? 'outside' : 'within'
}

/** A Date as local `YYYY-MM-DDTHH:mm`, the format of `<input type="datetime-local">`. */
export function toLocalIso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
