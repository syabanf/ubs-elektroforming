import type { Bath, Batch } from '@ef/types'
import {
  type BatchCalc,
  MIN_REGRESSION_POINTS,
  RECORD_LATE_MIN,
  auBand,
  minutesBetween,
  rangeState,
  regress,
  toLocalIso,
} from './engine'
import { fmtClock, fmtHours, fmtNumber, fmtPercent } from './format'

export type InsightTone = 'good' | 'warn' | 'info'
export type InsightKind =
  | 'efficiency'
  | 'trend'
  | 'area'
  | 'forecast'
  | 'duration'
  | 'au'
  | 'bath'
  | 'record'
  | 'condition'
  | 'eta'
  | 'pace'
  | 'volt'
  | 'drift'

/** One finding from the data, written as a sentence an operator can act on. */
export type Insight = {
  kind: InsightKind
  tone: InsightTone
  title: string
  detail: string
  batchId?: string
}

type Entry = { batch: Batch; calc: BatchCalc }

/** Weak patterns stay out of the headlines. */
const STRONG_R2 = 0.3
/** Efficiency gaps under this many points are noise. */
const EFF_GAP_PT = 3
const TREND_WINDOW = 3

const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
const pt = (v: number, digits = 1) => `${fmtNumber(Math.abs(v), digits)} poin`
const pct = (v: number) => `${fmtNumber(v, 1)} %`
const byStart = (a: Entry, b: Entry) => a.batch.startDate.localeCompare(b.batch.startDate)
const extremes = <T>(xs: T[], value: (x: T) => number) => {
  const sorted = [...xs].sort((a, b) => value(a) - value(b))
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! }
}

const completed = (entries: Entry[]) => entries.filter((e) => e.batch.status === 'completed').sort(byStart)
const withEfficiency = (entries: Entry[]) =>
  completed(entries).filter((e) => e.calc.summary.cathodeEfficiency !== null)
/** Finished batches with a reading log, the only ones that carry a growth rate. */
const withRate = (entries: Entry[]) => completed(entries).filter((e) => e.calc.summary.micronRate !== null)

/** What the whole plant's history says, warnings first. */
export function plantInsights(entries: Entry[], baths: Bath[]): Insight[] {
  const found = [
    efficiency(entries),
    efficiencyTrend(entries),
    areaVsRate(entries),
    ...forecasts(entries),
    duration(entries),
    auStability(entries),
    bathComparison(entries, baths),
    recordGaps(entries),
    conditionDrift(entries.flatMap((e) => e.batch.readings.map((r) => ({ r, b: e.batch })))),
  ].filter((i): i is Insight => i !== null)
  const rank = { warn: 0, good: 1, info: 2 }
  return found.sort((a, b) => rank[a.tone] - rank[b.tone])
}

function efficiency(entries: Entry[]): Insight | null {
  const done = withEfficiency(entries)
  if (done.length === 0) return null
  const eff = (e: Entry) => e.calc.summary.cathodeEfficiency!
  const { low, high } = extremes(done, eff)
  return {
    kind: 'efficiency',
    tone: 'info',
    title: `Efisiensi katoda rata-rata ${pct(avg(done.map(eff)))}`,
    detail: `Dari ${done.length} batch selesai. Tertinggi ${high.batch.code} (${pct(eff(high))}), terendah ${low.batch.code} (${pct(eff(low))}).`,
  }
}

function efficiencyTrend(entries: Entry[]): Insight | null {
  const done = withEfficiency(entries)
  if (done.length < TREND_WINDOW * 2) return null
  const eff = (e: Entry) => e.calc.summary.cathodeEfficiency!
  const recent = done.slice(-TREND_WINDOW)
  const before = avg(done.slice(0, -TREND_WINDOW).map(eff))
  const now = avg(recent.map(eff))
  const gap = now - before
  if (Math.abs(gap) < EFF_GAP_PT) return null
  return {
    kind: 'trend',
    tone: gap < 0 ? 'warn' : 'good',
    title: `Efisiensi ${TREND_WINDOW} batch terakhir ${gap < 0 ? 'turun' : 'naik'} ${pt(gap)}`,
    detail: `${recent.map((e) => e.batch.code).join(', ')} rata-rata ${pct(now)}, batch sebelumnya ${pct(before)}.${
      gap < 0 ? ' Bandingkan isi rak dan kondisi bak ketiganya.' : ''
    }`,
  }
}

/** Growth rate against rack area over finished batches; null when the pattern is weak or the data thin. */
function areaFit(entries: Entry[]) {
  const done = withRate(entries).filter((e) => e.calc.summary.areaDm2 !== null)
  if (done.length < 4) return null
  const fit = regress(done.map((e) => ({ x: e.calc.summary.areaDm2!, y: e.calc.summary.micronRate! })))
  if (fit.slope === null || fit.intercept === null || fit.r2 === null || fit.r2 < STRONG_R2) return null
  return { done, slope: fit.slope, intercept: fit.intercept, r2: fit.r2 }
}

function areaVsRate(entries: Entry[]): Insight | null {
  const fit = areaFit(entries)
  if (!fit) return null
  const { low, high } = extremes(fit.done, (e) => e.calc.summary.areaDm2!)
  const describe = (e: Entry) =>
    `${e.batch.code} (${fmtNumber(e.calc.summary.areaDm2, 1)} dm²) ${fmtNumber(e.calc.summary.micronRate, 2)} µm/j`
  const slower = fit.slope < 0
  return {
    kind: 'area',
    tone: 'info',
    title: slower ? 'Rak makin luas, tebal tumbuh makin lambat' : 'Rak makin luas, tebal tumbuh makin cepat',
    detail: `Tiap tambah 5 dm², laju tebal ${slower ? 'turun' : 'naik'} sekitar ${fmtNumber(Math.abs(fit.slope * 5), 2)} µm/j. ${describe(low)}, ${describe(high)}.`,
  }
}

/** Run time for each batch still in preparation, read off the area pattern. */
function forecasts(entries: Entry[]): Insight[] {
  const fit = areaFit(entries)
  if (!fit) return []
  return entries.flatMap(({ batch, calc }) => {
    const area = calc.summary.areaDm2
    if (batch.status !== 'preparing' || area === null) return []
    const rate = fit.intercept + fit.slope * area
    if (rate <= 0) return []
    return [
      {
        kind: 'forecast' as const,
        tone: 'info' as const,
        batchId: batch.id,
        title: `${batch.code} diperkirakan butuh ${fmtHours(batch.targetMicron / rate)}`,
        detail: `Rak ${fmtNumber(area, 1)} dm² biasanya tumbuh ${fmtNumber(rate, 2)} µm/j, menuju ${fmtNumber(batch.targetMicron, 0)} µm.`,
      },
    ]
  })
}

function duration(entries: Entry[]): Insight | null {
  const done = withRate(entries)
  if (done.length < 2) return null
  const hours = (e: Entry) => e.calc.summary.totalHours
  const { low, high } = extremes(done, hours)
  return {
    kind: 'duration',
    tone: 'info',
    title: `Satu batch butuh rata-rata ${fmtHours(avg(done.map(hours)))}`,
    detail: `Dari ${done.length} batch selesai yang punya catatan. Tercepat ${low.batch.code} ${fmtHours(hours(low))}, terlama ${high.batch.code} ${fmtHours(hours(high))}.`,
  }
}

function auStability(entries: Entry[]): Insight | null {
  const readings = entries.flatMap((e) =>
    e.batch.readings.flatMap((r) => (r.au === null ? [] : [{ au: r.au, batch: e.batch }])),
  )
  if (readings.length === 0) return null
  const band = (b: ReturnType<typeof auBand>) => readings.filter((r) => auBand(r.au, r.batch) === b).length
  const [below, above] = [band('below'), band('above')]
  const share = (readings.length - below - above) / readings.length
  return {
    kind: 'au',
    tone: share >= 0.9 ? 'good' : 'warn',
    title: `${fmtPercent(share, 0)} hasil X-ray masuk batas kadar`,
    detail: `Rata-rata kadar ${fmtPercent(avg(readings.map((r) => r.au)), 2)} dari ${readings.length} pembacaan. ${
      below + above === 0
        ? 'Belum ada yang keluar batas.'
        : `${above} di atas batas, ${below} di bawah batas.`
    }`,
  }
}

function bathComparison(entries: Entry[], baths: Bath[]): Insight | null {
  const done = withEfficiency(entries)
  const rows = baths
    .map((bath) => {
      const own = done.filter((e) => e.batch.bathId === bath.id)
      return {
        bath,
        n: own.length,
        eff: own.length ? avg(own.map((e) => e.calc.summary.cathodeEfficiency!)) : 0,
      }
    })
    .filter((r) => r.n >= 2)
    .sort((a, b) => b.eff - a.eff)
  if (rows.length < 2) return null
  const [best, worst] = [rows[0]!, rows[rows.length - 1]!]
  const gap = best.eff - worst.eff
  const line = (r: (typeof rows)[number]) => `${r.bath.name} ${pct(r.eff)} dari ${r.n} batch`
  return {
    kind: 'bath',
    tone: 'info',
    title:
      gap < EFF_GAP_PT
        ? 'Efisiensi antar-bak setara'
        : `${best.bath.name} ${pt(gap)} lebih efisien dari ${worst.bath.name}`,
    detail: `${rows.map(line).join(', ')}.`,
  }
}

/** Gaps between consecutive clock-stamped readings, all batches together. */
function recordGaps(entries: Entry[]): Insight | null {
  const gaps = entries.flatMap(({ batch }) => {
    const times = [...batch.readings]
      .sort((a, b) => a.no - b.no)
      .flatMap((r) => (r.recordedAt ? [r.recordedAt] : []))
    return times.slice(1).map((t, i) => minutesBetween(times[i]!, t))
  })
  if (gaps.length === 0) return null
  const late = gaps.filter((g) => g > RECORD_LATE_MIN).length
  return {
    kind: 'record',
    tone: late === 0 ? 'good' : 'warn',
    title: `Jarak antar-catatan rata-rata ${fmtHours(avg(gaps) / 60)}`,
    detail:
      late === 0
        ? `Semua ${gaps.length} jeda di bawah 2 jam.`
        : `${late} dari ${gaps.length} jeda lewat 2 jam. Pasang pengingat di jam shift.`,
  }
}

function conditionDrift(readings: { r: Batch['readings'][number]; b: Batch }[]): Insight | null {
  const ph = readings.filter(({ r, b }) => rangeState(r.ph, b.phMin, b.phMax) !== 'unset')
  const temp = readings.filter(({ r, b }) => rangeState(r.tempC, b.tempMin, b.tempMax) !== 'unset')
  if (ph.length + temp.length === 0) return null
  const phOut = ph.filter(({ r, b }) => rangeState(r.ph, b.phMin, b.phMax) === 'outside').length
  const tempOut = temp.filter(({ r, b }) => rangeState(r.tempC, b.tempMin, b.tempMax) === 'outside').length
  const clean = phOut + tempOut === 0
  const counts = [
    ph.length ? (clean ? `${ph.length} catatan pH` : `pH ${phOut} dari ${ph.length}`) : null,
    temp.length ? (clean ? `${temp.length} catatan suhu` : `suhu ${tempOut} dari ${temp.length}`) : null,
  ].filter(Boolean)
  return {
    kind: 'condition',
    tone: clean ? 'good' : 'warn',
    title: clean
      ? 'pH dan suhu selalu di dalam batas'
      : `${phOut + tempOut} catatan pH atau suhu di luar batas`,
    detail: clean ? `Dari ${counts.join(' dan ')}.` : `Di luar batas: ${counts.join(', ')}.`,
  }
}

/** What this batch's own readings say, compared with the finished batches in `history`. */
export function batchInsights(entry: Entry, history: Entry[]): Insight[] {
  const { batch, calc } = entry
  const others = history.filter((e) => e.batch.id !== batch.id)
  return [
    eta(entry),
    pace(entry, others),
    voltPattern(entry),
    auDrift(batch),
    batch.status === 'completed' ? efficiencyVsOthers(calc, others) : null,
    conditionDrift(batch.readings.map((r) => ({ r, b: batch }))),
  ].filter((i): i is Insight => i !== null)
}

function eta({ batch, calc: { summary } }: Entry): Insight | null {
  if (batch.status !== 'running' || summary.latestMicron === null) return null
  const left = batch.targetMicron - summary.latestMicron
  if (left <= 0)
    return {
      kind: 'eta',
      tone: 'good',
      title: `Tebal sudah ${fmtNumber(summary.latestMicron, 1)} µm, target tercapai`,
      detail: 'Ukur ulang tebal, lalu selesaikan batch di tab Hasil.',
    }
  if (summary.remainingHours === null) return null
  const at = summary.lastRecordedAt
    ? fmtClock(toLocalIso(new Date(Date.parse(summary.lastRecordedAt) + summary.remainingHours * 3_600_000)))
    : null
  return {
    kind: 'eta',
    tone: 'info',
    title: at
      ? `Target ${fmtNumber(batch.targetMicron, 0)} µm tercapai sekitar ${at}`
      : `Target ${fmtNumber(batch.targetMicron, 0)} µm tercapai ${fmtHours(summary.remainingHours)} lagi`,
    detail: `Sisa ${fmtNumber(left, 1)} µm dengan laju ${fmtNumber(summary.micronRate, 2)} µm/j${
      at ? ', dihitung dari catatan terakhir' : ''
    }.`,
  }
}

function pace({ batch, calc: { summary } }: Entry, others: Entry[]): Insight | null {
  const done = withRate(others)
  if (summary.micronRate === null || done.length < 2) return null
  const typical = avg(done.map((e) => e.calc.summary.micronRate!))
  const ratio = summary.micronRate / typical
  if (Math.abs(ratio - 1) < 0.15)
    return {
      kind: 'pace',
      tone: 'good',
      title: 'Laju tebal sesuai kebiasaan',
      detail: `${fmtNumber(summary.micronRate, 2)} µm/j, rata-rata ${done.length} batch selesai ${fmtNumber(typical, 2)} µm/j.`,
    }
  const faster = ratio > 1
  return {
    kind: 'pace',
    tone: 'info',
    title: faster
      ? `Tumbuh ${fmtNumber(ratio, 1)}× lebih cepat dari biasanya`
      : `Tumbuh ${fmtPercent(1 - ratio, 0)} lebih lambat dari biasanya`,
    detail: `${fmtNumber(summary.micronRate, 2)} µm/j, rata-rata ${done.length} batch selesai ${fmtNumber(typical, 2)} µm/j.${
      batch.status === 'running' && summary.progress < 0.5 ? ' Laju di awal batch biasanya lebih tinggi.' : ''
    }`,
  }
}

function voltPattern({ calc: { summary } }: Entry): Insight | null {
  const { n, slope, r2 } = summary.next
  if (n < MIN_REGRESSION_POINTS || slope === null || r2 === null) return null
  if (r2 < STRONG_R2)
    return {
      kind: 'volt',
      tone: 'warn',
      title: 'Pola volt dan kadar masih lemah',
      detail: `R² ${fmtNumber(r2, 2)} dari ${n} pembacaan. Ubah volt sedikit demi sedikit dan cek dengan X-ray berikutnya.`,
    }
  return {
    kind: 'volt',
    tone: 'good',
    title: `Naik 0,1 V ${slope < 0 ? 'menurunkan' : 'menaikkan'} kadar sekitar ${pt(slope * 10, 2)}`,
    detail: `Pola dari ${n} pembacaan batch ini cukup kuat (R² ${fmtNumber(r2, 2)}). Saran volt memakai pola ini.`,
  }
}

function auDrift(batch: Batch): Insight | null {
  const aus = [...batch.readings].sort((a, b) => a.no - b.no).flatMap((r) => (r.au === null ? [] : [r.au]))
  if (aus.length < TREND_WINDOW * 2) return null
  const first = avg(aus.slice(0, TREND_WINDOW))
  const last = avg(aus.slice(-TREND_WINDOW))
  const gap = (last - first) * 100
  if (Math.abs(gap) < 0.5) return null
  const away = Math.abs(last - batch.targetAu) > Math.abs(first - batch.targetAu)
  return {
    kind: 'drift',
    tone: away ? 'warn' : 'good',
    title: `Kadar ${gap < 0 ? 'turun' : 'naik'} ${pt(gap)} sejak awal batch`,
    detail: `Rata-rata ${TREND_WINDOW} X-ray pertama ${fmtPercent(first)}, ${TREND_WINDOW} terakhir ${fmtPercent(last)}. ${
      away ? 'Makin jauh dari target' : 'Makin dekat ke target'
    } ${fmtPercent(batch.targetAu, 1)}.`,
  }
}

function efficiencyVsOthers({ summary }: BatchCalc, others: Entry[]): Insight | null {
  const done = withEfficiency(others)
  if (summary.cathodeEfficiency === null || done.length < 2) return null
  const typical = avg(done.map((e) => e.calc.summary.cathodeEfficiency!))
  const gap = summary.cathodeEfficiency - typical
  const close = Math.abs(gap) < EFF_GAP_PT
  return {
    kind: 'efficiency',
    tone: close ? 'info' : gap > 0 ? 'good' : 'warn',
    title: close
      ? `Efisiensi ${pct(summary.cathodeEfficiency)}, sesuai rata-rata`
      : `Efisiensi ${pct(summary.cathodeEfficiency)}, ${pt(gap)} ${gap > 0 ? 'di atas' : 'di bawah'} rata-rata`,
    detail: `Rata-rata ${done.length} batch selesai lainnya ${pct(typical)}.`,
  }
}
