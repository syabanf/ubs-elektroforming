import type { BatchStatus } from '@ef/types'
import { type BatchCalc, type ReadingCalc, computeBatch, regress } from './engine'
import { type Catalog, GPC_AU } from './prep'
import { type AppState, bathName } from './store'

// Rows behind the reporting catalog (R01 to R10). Every value keeps its source apart:
// target, measured in process, lab/QC, or estimated by a formula. Missing records stay null.

export type DateBasis = 'start' | 'end' | 'reading'
export type Grain = 'reading' | 'batch' | 'day' | 'week' | 'month'

export type ReportFilters = {
  from: string | null
  to: string | null
  basis: DateBasis
  bathIds: string[]
  batchIds: string[]
  modelIds: string[]
  statuses: BatchStatus[]
  grain: Grain
}

export const EMPTY_FILTERS: ReportFilters = {
  from: null,
  to: null,
  basis: 'start',
  bathIds: [],
  batchIds: [],
  modelIds: [],
  statuses: [],
  grain: 'batch',
}

export const FORMULA_VERSION = 'Rumus Excel EF Bak 1 · v1'

export type ReportBatch = BatchCalc & {
  batch: AppState['batches'][number]
  bath: string
  modelIds: string[]
  models: string[]
  /** Clock time of the last reading of a finished batch; null while running or without clock times. */
  endedAt: string | null
}

export type ReportReading = { rb: ReportBatch; row: ReadingCalc; at: string | null }

export type ReportScope = { batches: ReportBatch[]; readings: ReportReading[] }

const inRange = (date: string | null, { from, to }: ReportFilters) =>
  date !== null && (from === null || date.slice(0, 10) >= from) && (to === null || date.slice(0, 10) <= to)
const hasDates = (f: ReportFilters) => f.from !== null || f.to !== null
const anyOf = <T>(picked: T[], value: T) => picked.length === 0 || picked.includes(value)

function toReportBatch(state: AppState, catalog: Catalog, batch: ReportBatch['batch']): ReportBatch {
  const calc = computeBatch(batch, catalog)
  const modelIds = [...new Set(batch.prep.load.flatMap((l) => (l.modelId ? [l.modelId] : [])))]
  return {
    ...calc,
    batch,
    bath: bathName(state.baths, batch.bathId),
    modelIds,
    models: modelIds.map((id) => catalog.models.get(id)?.code ?? id),
    endedAt: batch.status === 'completed' ? calc.summary.lastRecordedAt : null,
  }
}

/** Batches and readings that pass the global filters, oldest first. */
export function reportScope(state: AppState, catalog: Catalog, f: ReportFilters): ReportScope {
  const batches = state.batches
    .map((b) => toReportBatch(state, catalog, b))
    .filter(
      ({ batch, modelIds }) =>
        anyOf(f.bathIds, batch.bathId) &&
        anyOf(f.batchIds, batch.id) &&
        anyOf(f.statuses, batch.status) &&
        (f.modelIds.length === 0 || modelIds.some((id) => f.modelIds.includes(id))),
    )
    .filter((rb) => {
      if (!hasDates(f)) return true
      if (f.basis === 'start') return inRange(rb.batch.startDate, f)
      if (f.basis === 'end') return inRange(rb.endedAt, f)
      return rb.rows.some((r) => inRange(r.reading.recordedAt, f))
    })
    .sort(
      (a, b) =>
        a.batch.startDate.localeCompare(b.batch.startDate) || a.batch.code.localeCompare(b.batch.code),
    )
  const readings = batches.flatMap((rb) =>
    rb.rows
      .map((row) => ({ rb, row, at: row.reading.recordedAt }))
      .filter((r) => f.basis !== 'reading' || !hasDates(f) || inRange(r.at, f)),
  )
  return { batches, readings }
}

// Small numeric helpers shared by the builders and the pages.

const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null)
const orNull = (xs: number[], f: (ys: number[]) => number) => (xs.length ? f(xs) : null)
const total = (ys: number[]) => ys.reduce((s, v) => s + v, 0)

export const sumOf = (xs: (number | null)[]) => orNull(present(xs), total)
export const meanOf = (xs: (number | null)[]) => orNull(present(xs), (ys) => total(ys) / ys.length)
export const minOf = (xs: (number | null)[]) => orNull(present(xs), (ys) => Math.min(...ys))
export const maxOf = (xs: (number | null)[]) => orNull(present(xs), (ys) => Math.max(...ys))
const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b)
const per = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b)
const pctOf = (a: number | null, b: number | null) => {
  const r = per(a, b)
  return r === null ? null : r * 100
}
const times = (a: number | null, b: number | null) => (a === null || b === null ? null : a * b)

/** Period a date falls in: the day, the Monday of its week, or the month. */
export function periodKey(date: string, grain: Grain): string {
  const day = date.slice(0, 10)
  if (grain === 'month') return day.slice(0, 7)
  if (grain !== 'week') return day
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Groups items by period and keeps the periods in date order. */
export function byPeriod<T>(items: T[], dateOf: (item: T) => string | null, grain: Grain) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const date = dateOf(item)
    if (!date) continue
    const key = periodKey(date, grain)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({ key, group }))
}

/** DC energy over readings: volt × ampere × minutes. */
export function energyKwh(rows: ReadingCalc[]) {
  const voltAmpMin = sumOf(rows.map((r) => times(times(r.reading.volt, r.reading.ampere), r.reading.minutes)))
  return voltAmpMin === null ? null : voltAmpMin / 60_000
}

// R01 Production batch

export function productionRow(rb: ReportBatch) {
  const { batch, prep, summary } = rb
  const load = batch.prep.load
  const durationTargetMin =
    summary.theoreticalAmm === null || summary.initialAmpere === null || summary.initialAmpere === 0
      ? null
      : summary.theoreticalAmm / summary.initialAmpere
  return {
    rb,
    pieces: prep.pieces || null,
    areaDm2: summary.areaDm2,
    areaPerPieceDm2: prep.pieces ? (summary.areaDm2 ?? 0) / prep.pieces : null,
    weightStartG: sumOf(load.map((l) => l.weightStartG)),
    weightFinalG: sumOf(load.map((l) => l.weightFinalG)),
    depositG: prep.actual.depositG,
    targetMicron: batch.targetMicron,
    micron: summary.micron,
    targetAuPct: batch.prep.targetAuPct,
    auLabPct: batch.prep.actualAuPct,
    auEstPct: summary.avgAu === null ? null : summary.avgAu * 100,
    durationTargetMin,
    durationMin: summary.totalMinutes || null,
  }
}

// R02 Electrical and process, one row per reading

export function electricalRow({ rb, row, at }: ReportReading) {
  const { volt, ampere, minutes } = row.reading
  return {
    rb,
    row,
    at,
    elapsedMin: row.cumMinutes,
    voltSet: row.advice.suggestedVolt,
    volt,
    voltDev: diff(volt, row.advice.suggestedVolt),
    ampSet: row.targetAmpere,
    amp: ampere,
    ampDev: diff(ampere, row.targetAmpere),
    ampDevPct: pctOf(diff(ampere, row.targetAmpere), row.targetAmpere),
    energyKwh:
      volt === null || ampere === null || minutes === null ? null : (volt * ampere * minutes) / 60_000,
  }
}

// R03 Thickness

export type ToleranceState = 'below' | 'within' | 'above'

export function thicknessRow(rb: ReportBatch, toleranceUm: number) {
  const { batch, summary } = rb
  const estimated = times(summary.targetMicronPerAmm, summary.realAmm)
  const qc = batch.prep.actualMicron
  const process = summary.latestMicron
  const measured = qc ?? process
  const deviation = diff(measured, batch.targetMicron)
  const tolerance: ToleranceState | null =
    deviation === null
      ? null
      : deviation < -toleranceUm
        ? 'below'
        : deviation > toleranceUm
          ? 'above'
          : 'within'
  return {
    rb,
    target: batch.targetMicron,
    estimated,
    process,
    qc,
    measuredAt: summary.lastRecordedAt,
    deviation,
    achievementPct: pctOf(measured, batch.targetMicron),
    rate: summary.micronRate,
    remainingHours: batch.status === 'running' ? summary.remainingHours : null,
    tolerance,
  }
}

// R04 Current density and AMM

export function densityRow(rb: ReportBatch) {
  const { rows, summary } = rb
  const densityTarget = meanOf(rows.map((r) => r.reading.setTargetAdm2))
  const density = meanOf(rows.map((r) => r.realAdm2))
  return {
    rb,
    areaDm2: summary.areaDm2,
    ampTarget: meanOf(rows.map((r) => r.targetAmpere)),
    amp: meanOf(rows.map((r) => r.reading.ampere)),
    densityTarget,
    density,
    densityDev: diff(density, densityTarget),
    ammTarget: summary.theoreticalAmm,
    amm: summary.realAmm,
    ammAchievementPct: pctOf(summary.realAmm, summary.theoreticalAmm),
    durationMin: summary.totalMinutes || null,
  }
}

// R05 Composition: X-ray readings in process, plus the lab result of each batch

export type CompositionSource = 'xray' | 'lab' | 'estimate'

export function compositionRows(scope: ReportScope) {
  const xray = scope.readings.flatMap(({ rb, row, at }) =>
    row.reading.au === null
      ? []
      : [
          {
            rb,
            at,
            sample: `X-ray ke-${row.reading.no}`,
            source: 'xray' as CompositionSource,
            volt: row.reading.volt,
            targetAuPct: rb.batch.targetAu * 100,
            auPct: row.reading.au * 100,
          },
        ],
  )
  const perBatch = scope.batches.flatMap((rb) => {
    const lab = rb.batch.prep.actualAuPct
    const estimate = rb.summary.avgAu
    const base = { rb, at: rb.endedAt, volt: null, targetAuPct: rb.batch.prep.targetAuPct }
    return [
      ...(lab === null ? [] : [{ ...base, sample: 'Uji lab akhir', source: 'lab' as const, auPct: lab }]),
      ...(estimate === null
        ? []
        : [
            { ...base, sample: 'Persamaan elektrokimia', source: 'estimate' as const, auPct: estimate * 100 },
          ]),
    ]
  })
  return [...xray, ...perBatch].map((r) => ({
    ...r,
    cuPct: 100 - r.auPct,
    deviationPp: r.auPct - r.targetAuPct,
  }))
}

// R06 Chemical consumption

/** GPC added for a batch: the GPC log when it has entries, else the amount typed on the batch. */
function gpcAdded(batch: ReportBatch['batch'], gpc: AppState['gpc']) {
  const ledger = gpc.entries.filter((e) => e.batchCode === batch.code)
  if (ledger.length)
    return {
      grams: ledger.reduce((s, e) => s + e.grams, 0),
      auG: ledger.reduce((s, e) => s + e.grams * e.auFraction, 0),
      date: ledger.find((e) => e.date)?.date ?? null,
    }
  const grams = batch.prep.gpcAddedG
  return { grams, auG: grams === null ? 0 : grams * GPC_AU, date: null }
}

export function chemicalRow(rb: ReportBatch, gpc: AppState['gpc']) {
  const { batch, prep } = rb
  const added = gpcAdded(batch, gpc)
  const chem = batch.prep.chem
  return {
    rb,
    date: added.date ?? batch.prep.date,
    gpcRequired: prep.bath.gpcAddG,
    gpcAdded: added.grams,
    gpcVariance: diff(added.grams, prep.bath.gpcAddG),
    cucnRequired: prep.bath.cucnAddG,
    cucnAdded: null as number | null,
    kcnRequired: prep.bath.kcnAddG,
    kcnAdded: null as number | null,
    replenisherRequiredMl: prep.replenisherMl,
    replenisherAddedMl: null as number | null,
    auGL: chem.auStart,
    cuGL: chem.cuStart,
    kcnGL: chem.kcnStart,
  }
}

// R07 Gold material balance, per bath in run order

export type BalanceStatus = 'match' | 'gap' | 'incomplete'
/** Variance under this share of the gold in play counts as reconciled. */
export const BALANCE_TOLERANCE = 0.02

export function goldBalanceRows(scope: ReportScope, gpc: AppState['gpc'], all: ReportBatch[]) {
  return scope.batches.map((rb) => {
    const { batch, prep, summary } = rb
    const litres = batch.prep.bathVolumeL
    const opening = times(batch.prep.chem.auStart, litres)
    const sameBath = all
      .filter((o) => o.batch.bathId === batch.bathId)
      .sort((a, b) => a.batch.startDate.localeCompare(b.batch.startDate))
    const next = sameBath[sameBath.findIndex((o) => o.batch.id === batch.id) + 1]
    const closing = times(batch.prep.chem.auEnd ?? next?.batch.prep.chem.auStart ?? null, litres)
    const auIn = gpcAdded(batch, gpc).auG
    const depositActual = prep.actual.auG
    const depositEstimate =
      summary.avgAu === null || summary.totalWeightG === 0 ? null : summary.totalWeightG * summary.avgAu
    const depositTheory = prep.lines.length ? prep.auG : null
    const deposit = depositActual ?? depositEstimate ?? depositTheory
    const depositSource =
      depositActual !== null ? 'Timbang' : depositEstimate !== null ? 'Perkiraan' : 'Teori'
    const expectedClosing = opening === null || deposit === null ? null : opening + auIn - deposit
    const variance = diff(closing, expectedClosing)
    const inPlay = opening === null ? null : opening + auIn
    const status: BalanceStatus =
      variance === null || inPlay === null
        ? 'incomplete'
        : Math.abs(variance) <= inPlay * BALANCE_TOLERANCE
          ? 'match'
          : 'gap'
    return {
      rb,
      opening,
      auIn,
      depositActual,
      depositEstimate,
      depositTheory,
      deposit,
      depositSource,
      otherOut: null as number | null,
      closing,
      variance,
      variancePct: pctOf(variance, inPlay),
      status,
    }
  })
}

// R08 Process efficiency

export function efficiencyRow(rb: ReportBatch) {
  const { batch, prep, summary, rows } = rb
  const avgAmp = summary.totalMinutes ? summary.totalAmm / summary.totalMinutes : null
  return {
    rb,
    ammTheory: summary.theoreticalAmm,
    amm: summary.realAmm,
    depositTheory: prep.lines.length ? prep.depositWeightG : null,
    depositActual: prep.actual.depositG,
    depositEstimate: summary.totalWeightG || null,
    efficiencyPct: batch.status === 'completed' ? summary.cathodeEfficiency : null,
    rateTheory: avgAmp === null ? null : times(summary.targetMicronPerAmm, avgAmp * 60),
    rate: summary.micronRate,
    depositPerAmm: per(prep.actual.depositG ?? (summary.totalWeightG || null), summary.realAmm),
    durationMin: summary.totalMinutes || null,
    energyKwh: energyKwh(rows),
    assumedEfficiencyPct: batch.prep.efficiencyPct,
  }
}

// R09 Batch comparison

export function comparisonRow(rb: ReportBatch) {
  const { batch, summary, rows, prep } = rb
  const measured = batch.prep.actualMicron ?? summary.latestMicron
  const au = batch.prep.actualAuPct ?? (summary.avgAu === null ? null : summary.avgAu * 100)
  return {
    rb,
    pieces: prep.pieces || null,
    areaDm2: summary.areaDm2,
    avgVolt: meanOf(rows.map((r) => r.reading.volt)),
    avgAmp: meanOf(rows.map((r) => r.reading.ampere)),
    amm: summary.realAmm,
    hours: summary.totalHours || null,
    targetMicron: batch.targetMicron,
    micron: measured,
    micronDev: diff(measured, batch.targetMicron),
    targetAuPct: batch.prep.targetAuPct,
    auPct: au,
    auDev: diff(au, batch.prep.targetAuPct),
    depositAuG: prep.actual.auG ?? (summary.avgAu === null ? null : summary.totalWeightG * summary.avgAu),
    efficiencyPct: batch.status === 'completed' ? summary.cathodeEfficiency : null,
    rate: summary.micronRate,
  }
}

// R10 Prediction and optimisation

/** Duration each finished batch would get from the area pattern of the others (leave one out). */
function predictedHours(rb: ReportBatch, history: ReportBatch[]) {
  const others = history.filter(
    (o) => o.batch.id !== rb.batch.id && o.summary.micronRate !== null && o.summary.areaDm2 !== null,
  )
  const area = rb.summary.areaDm2
  if (others.length < 3 || area === null) return null
  const fit = regress(others.map((o) => ({ x: o.summary.areaDm2!, y: o.summary.micronRate! })))
  if (fit.slope === null || fit.intercept === null) return null
  const rate = fit.intercept + fit.slope * area
  return rate > 0 ? rb.batch.targetMicron / rate : null
}

export function predictionRow(rb: ReportBatch, history: ReportBatch[]) {
  const { batch, summary, prep } = rb
  const finished = history.filter((o) => o.batch.status === 'completed')
  const auActual =
    batch.prep.actualAuPct ?? meanOf(rb.rows.map((r) => (r.reading.au === null ? null : r.reading.au * 100)))
  const thicknessPred = times(summary.targetMicronPerAmm, summary.realAmm)
  const thicknessActual = batch.prep.actualMicron ?? summary.latestMicron
  const durationPred = predictedHours(rb, finished)
  const durationActual = summary.totalHours || null
  const depositPred = prep.lines.length ? prep.depositWeightG : null
  const depositActual = prep.actual.depositG
  const auPred = summary.avgAu === null ? null : summary.avgAu * 100
  return {
    rb,
    thicknessPred,
    thicknessActual,
    thicknessErrPct: pctOf(diff(thicknessPred, thicknessActual), thicknessActual),
    durationPred,
    durationActual,
    durationErrPct: pctOf(diff(durationPred, durationActual), durationActual),
    depositPred,
    depositActual,
    depositErrPct: pctOf(diff(depositPred, depositActual), depositActual),
    auPred,
    auActual,
    auSource: batch.prep.actualAuPct !== null ? 'Lab' : auActual === null ? null : 'Rata-rata X-ray',
    auErrPp: diff(auPred, auActual),
    ammLeft: batch.status === 'running' ? diff(summary.theoreticalAmm, summary.realAmm) : null,
    voltAdvice: summary.next.suggestedVolt,
    densityAdvice: rb.rows.at(-1)?.reading.setTargetAdm2 ?? null,
  }
}

/** Mean absolute error in percent; a formula counts as validated from five batches under 10 %. */
export function validation(errors: (number | null)[]) {
  const abs = errors.filter((e): e is number => e !== null).map(Math.abs)
  const mape = abs.length ? abs.reduce((s, v) => s + v, 0) / abs.length : null
  return { n: abs.length, mape, validated: abs.length >= 5 && mape !== null && mape <= 10 }
}

/** Every reading where the advice was on screen next to the volt the operator then set. */
export function voltAdviceRows(scope: ReportScope) {
  return scope.readings.flatMap(({ rb, row, at }) =>
    row.advice.suggestedVolt === null || row.reading.volt === null
      ? []
      : [
          {
            rb,
            at,
            no: row.reading.no,
            advised: row.advice.suggestedVolt,
            applied: row.reading.volt,
            gap: row.reading.volt - row.advice.suggestedVolt,
            directive: row.advice.directive,
            au: row.reading.au,
          },
        ],
  )
}
