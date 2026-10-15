import { auBand, regress } from './engine'
import { fmtHours, fmtNumber, fmtPercent } from './format'
import type { Insight } from './insights'
import {
  type chemicalRow,
  type comparisonRow,
  type compositionRows,
  type densityRow,
  type efficiencyRow,
  type electricalRow,
  type goldBalanceRows,
  type predictionRow,
  type productionRow,
  type thicknessRow,
  type voltAdviceRows,
  maxOf,
  meanOf,
  minOf,
  sumOf,
  validation,
} from './reports'

// What each report's rows say, in sentences. Every function takes the rows the report shows,
// after its own filters, so the findings always match the table below them.

type Rows<F extends (...args: never[]) => unknown> = ReturnType<F> extends (infer R)[] ? R[] : ReturnType<F>[]

const n0 = (v: number | null) => fmtNumber(v, 0)
const n1 = (v: number | null) => fmtNumber(v, 1)
const n2 = (v: number | null) => fmtNumber(v, 2)
const pct = (v: number | null, digits = 0) => `${fmtNumber(v, digits)} %`
const share = (part: number, whole: number) => (whole ? part / whole : 0)
const found = (xs: (Insight | null | false)[]) => xs.filter((x): x is Insight => !!x)

/** The rows with the lowest and highest value, skipping rows without one. */
function extremes<T>(rows: T[], value: (r: T) => number | null) {
  const sorted = rows.filter((r) => value(r) !== null).sort((a, b) => value(a)! - value(b)!)
  return sorted.length ? { low: sorted[0]!, high: sorted[sorted.length - 1]! } : null
}

/** "x dari y batch belum punya ..." when a field the catalog asks for is still empty. */
function missing<T>(rows: T[], value: (r: T) => unknown, what: string): Insight | null {
  const empty = rows.filter((r) => value(r) === null).length
  if (empty === 0 || rows.length === 0) return null
  return {
    kind: 'data',
    tone: 'warn',
    title:
      empty === rows.length ? `Belum ada ${what}` : `${empty} dari ${rows.length} batch belum punya ${what}`,
    detail: 'Isi saat hasilnya keluar supaya laporan ini bisa membandingkan rumus dengan hasil nyata.',
  }
}

export function productionInsights(rows: Rows<typeof productionRow>): Insight[] {
  const withPieces = rows.filter((r) => r.pieces !== null)
  const fullest = extremes(withPieces, (r) => r.pieces)?.high
  const models = new Map<string, { qty: number; batches: number }>()
  for (const r of rows)
    for (const line of r.rb.prep.lines.filter((l) => l.kind === 'model')) {
      const m = models.get(line.name) ?? { qty: 0, batches: 0 }
      models.set(line.name, { qty: m.qty + line.line.qty, batches: m.batches + 1 })
    }
  const [topName, top] = [...models].sort((a, b) => b[1].qty - a[1].qty)[0] ?? []
  const timed = rows.filter((r) => r.durationMin !== null && r.durationTargetMin !== null)
  const slow = timed.length ? meanOf(timed.map((r) => r.durationMin! / r.durationTargetMin!)) : null
  return found([
    withPieces.length > 0 && {
      kind: 'model',
      tone: 'info',
      title: `Rata-rata ${n0(meanOf(withPieces.map((r) => r.pieces)))} barang per batch`,
      detail: `Luas rata-rata ${n1(meanOf(withPieces.map((r) => r.areaDm2)))} dm². Rak terpadat ${fullest!.rb.batch.code} dengan ${n0(fullest!.pieces)} barang.`,
    },
    top && {
      kind: 'model',
      tone: 'info',
      title: `${topName} paling banyak diproduksi`,
      detail: `${n0(top.qty)} barang di ${top.batches} isi rak, dari ${models.size} model yang tercatat.`,
    },
    slow !== null && {
      kind: 'duration',
      tone: slow > 1.5 ? 'warn' : 'good',
      title: `Proses nyata ${fmtNumber(slow, 1)}× durasi teori`,
      detail: `Dari ${timed.length} batch dengan catatan. Durasi teori mengandaikan efisiensi 95 % dan rapat arus awal 0,3 A/dm².`,
    },
    missing(rows, (r) => r.weightFinalG, 'timbangan akhir'),
  ])
}

export function electricalInsights(rows: Rows<typeof electricalRow>, tolerancePct: number): Insight[] {
  const withSet = rows.filter((r) => r.ampDevPct !== null)
  const outside = withSet.filter((r) => Math.abs(r.ampDevPct!) > tolerancePct)
  const advised = rows.filter((r) => r.voltDev !== null)
  const gap = meanOf(advised.map((r) => Math.abs(r.voltDev!)))
  const perBatch = new Map<string, number>()
  for (const r of rows)
    perBatch.set(r.rb.batch.code, (perBatch.get(r.rb.batch.code) ?? 0) + (r.energyKwh ?? 0))
  const energy = extremes([...perBatch], ([, kwh]) => kwh)
  return found([
    withSet.length > 0 && {
      kind: 'volt',
      tone: share(outside.length, withSet.length) > 0.2 ? 'warn' : 'good',
      title: `${fmtPercent(share(outside.length, withSet.length), 0)} pembacaan arus meleset lebih dari ±${tolerancePct} %`,
      detail: `${outside.length} dari ${withSet.length} pembacaan jauh dari set target ampere. Selisih rata-rata ${pct(
        meanOf(withSet.map((r) => r.ampDevPct)),
        1,
      )}.`,
    },
    gap !== null && {
      kind: 'volt',
      tone: gap <= 0.02 ? 'good' : 'info',
      title: `Volt yang dipakai rata-rata ${n2(gap)} V dari saran`,
      detail: `Dari ${advised.length} pembacaan yang punya saran. ${
        gap <= 0.02
          ? 'Operator mengikuti saran dengan rapat.'
          : 'Bandingkan dengan R10 untuk melihat dampaknya pada kadar.'
      }`,
    },
    energy !== null && {
      kind: 'energy',
      tone: 'info',
      title: `Energi DC rata-rata ${n2(meanOf([...perBatch.values()]))} kWh per batch`,
      detail: `Terbesar ${energy.high[0]} (${n2(energy.high[1])} kWh), terkecil ${energy.low[0]} (${n2(energy.low[1])} kWh).`,
    },
  ])
}

export function thicknessInsights(rows: Rows<typeof thicknessRow>, toleranceUm: number): Insight[] {
  const measured = rows.filter((r) => r.tolerance !== null)
  const within = measured.filter((r) => r.tolerance === 'within').length
  const bias = meanOf(measured.map((r) => r.deviation))
  const rates = extremes(rows, (r) => r.rate)
  const overshoot = meanOf(
    measured.map((r) =>
      r.estimated === null || !(r.qc ?? r.process) ? null : r.estimated / (r.qc ?? r.process)!,
    ),
  )
  return found([
    measured.length > 0 && {
      kind: 'au',
      tone: share(within, measured.length) >= 0.8 ? 'good' : 'warn',
      title: `${within} dari ${measured.length} batch tebalnya sesuai target ±${toleranceUm} µm`,
      detail:
        bias === null || Math.abs(bias) < 0.5
          ? 'Rata-rata batch berhenti tepat di target.'
          : `Rata-rata ${n1(Math.abs(bias))} µm ${bias < 0 ? 'di bawah' : 'di atas'} target. ${
              bias < 0
                ? 'Batch cenderung diangkat sedikit terlalu awal.'
                : 'Batch cenderung dibiarkan sedikit lebih lama.'
            }`,
    },
    rates !== null &&
      rates.low !== rates.high && {
        kind: 'pace',
        tone: 'info',
        title: `Laju tebal ${n2(rates.low.rate)} sampai ${n2(rates.high.rate)} µm/j`,
        detail: `Tercepat ${rates.high.rb.batch.code}, paling lambat ${rates.low.rb.batch.code}. Bandingkan luas raknya di R01.`,
      },
    overshoot !== null &&
      overshoot > 1.5 && {
        kind: 'prediction',
        tone: 'warn',
        title: `Perkiraan rumus ${fmtNumber(overshoot, 1)}× tebal terukur`,
        detail:
          'Rumus Excel mengandaikan efisiensi 95 %. Efisiensi nyata jauh lebih rendah, jadi pakai ukur proses untuk memutuskan.',
      },
    missing(measured.length ? rows : [], (r) => r.qc, 'tebal QC'),
  ])
}

export function densityInsights(rows: Rows<typeof densityRow>): Insight[] {
  const both = rows.filter((r) => r.density !== null && r.densityTarget !== null)
  const gap = meanOf(both.map((r) => ((r.density! - r.densityTarget!) / r.densityTarget!) * 100))
  const amm = rows.filter((r) => r.ammAchievementPct !== null && r.rb.batch.status === 'completed')
  const ratio = meanOf(amm.map((r) => r.ammAchievementPct! / 100))
  const worst = extremes(both, (r) => Math.abs(r.densityDev!))
  return found([
    gap !== null && {
      kind: 'volt',
      tone: Math.abs(gap) > 10 ? 'warn' : 'good',
      title: `Rapat arus aktual ${pct(Math.abs(gap))} ${gap < 0 ? 'di bawah' : 'di atas'} set target`,
      detail: `Rata-rata ${both.length} batch. Paling jauh ${worst!.high.rb.batch.code}: ${fmtNumber(worst!.high.density, 3)} terhadap ${fmtNumber(worst!.high.densityTarget, 3)} A/dm².`,
    },
    ratio !== null && {
      kind: 'efficiency',
      tone: ratio > 1.5 ? 'warn' : 'good',
      title: `Meter AMM rata-rata ${fmtNumber(ratio, 1)}× AMM teori`,
      detail: `Dari ${amm.length} batch selesai. Arus lebih banyak dari teori berarti sebagian arus tidak menjadi deposit; lihat R08.`,
    },
  ])
}

export function compositionInsights(rows: Rows<typeof compositionRows>): Insight[] {
  const xray = rows.filter((r) => r.source === 'xray')
  const bands = xray.map((r) => auBand(r.auPct / 100, r.rb.batch))
  const above = bands.filter((b) => b === 'above').length
  const below = bands.filter((b) => b === 'below').length
  const points = xray.flatMap((r) => (r.volt === null ? [] : [{ x: r.volt, y: r.auPct }]))
  const fit = regress(points)
  const devByBatch = new Map<string, number[]>()
  for (const r of xray)
    devByBatch.set(r.rb.batch.code, [...(devByBatch.get(r.rb.batch.code) ?? []), r.deviationPp])
  const worst = extremes([...devByBatch], ([, devs]) => Math.abs(meanOf(devs)!))
  const equation = rows.filter((r) => r.source === 'estimate')
  const eqGap = meanOf(
    equation.map((e) => {
      const own = xray.filter((x) => x.rb.batch.id === e.rb.batch.id)
      return own.length ? e.auPct - meanOf(own.map((x) => x.auPct))! : null
    }),
  )
  return found([
    xray.length > 0 && {
      kind: 'au',
      tone: share(xray.length - above - below, xray.length) >= 0.9 ? 'good' : 'warn',
      title: `${fmtPercent(share(xray.length - above - below, xray.length), 0)} X-ray masuk batas kadar`,
      detail: `${above} di atas, ${below} di bawah batas. ${
        above > below
          ? 'Kadar lebih sering kelebihan emas.'
          : below > above
            ? 'Kadar lebih sering kekurangan emas.'
            : ''
      }`,
    },
    worst !== null && {
      kind: 'drift',
      tone: 'info',
      title: `${worst.high[0]} paling jauh dari target kadar`,
      detail: `Rata-rata ${fmtNumber(meanOf(worst.high[1]), 2)} poin dari target. Paling dekat ${worst.low[0]} (${fmtNumber(meanOf(worst.low[1]), 2)} poin).`,
    },
    fit.slope !== null &&
      fit.r2 !== null && {
        kind: 'volt',
        tone: fit.r2 >= 0.3 ? 'good' : 'warn',
        title:
          fit.r2 >= 0.3
            ? `Naik 0,1 V ${fit.slope < 0 ? 'menurunkan' : 'menaikkan'} kadar ${fmtNumber(Math.abs(fit.slope / 10), 2)} poin`
            : 'Lintas batch, volt belum menjelaskan kadar',
        detail: `R² ${n2(fit.r2)} dari ${points.length} hasil X-ray. ${
          fit.r2 >= 0.3
            ? 'Pola ini berlaku di semua batch dalam filter.'
            : 'Pola volt per batch lebih bisa dipegang; lihat saran volt tiap batch.'
        }`,
      },
    eqGap !== null && {
      kind: 'prediction',
      tone: Math.abs(eqGap) <= 0.5 ? 'good' : 'warn',
      title: `Persamaan elektrokimia ${fmtNumber(Math.abs(eqGap), 2)} poin dari rata-rata X-ray`,
      detail: `Dari ${equation.length} batch. ${Math.abs(eqGap) <= 0.5 ? 'Cukup dekat untuk memperkirakan kadar sebelum hasil lab keluar.' : 'Cek kalibrasi X-ray atau konstanta persamaan.'}`,
    },
  ])
}

export function chemicalInsights(rows: Rows<typeof chemicalRow>): Insight[] {
  const both = rows.filter((r) => r.gpcRequired !== null && r.gpcAdded !== null)
  const ratio = share(sumOf(both.map((r) => r.gpcAdded)) ?? 0, sumOf(both.map((r) => r.gpcRequired)) ?? 0)
  const withLab = rows.filter((r) => r.auGL !== null)
  const kcn = rows.filter((r) => r.kcnGL !== null)
  return found([
    both.length > 0 && {
      kind: 'material',
      tone: Math.abs(ratio - 1) <= 0.1 ? 'good' : 'warn',
      title: `GPC yang ditambahkan ${fmtPercent(ratio, 0)} dari kebutuhan`,
      detail: `Dari ${both.length} batch yang punya keduanya. ${
        ratio > 1.1
          ? 'Penambahan melebihi hitungan; cek kadar Au larutan berikutnya.'
          : ratio < 0.9
            ? 'Penambahan kurang dari hitungan.'
            : 'Penambahan mengikuti hitungan.'
      }`,
    },
    withLab.length > 1 && {
      kind: 'material',
      tone: 'info',
      title: `Kadar Au larutan ${n1(minOf(withLab.map((r) => r.auGL)))} sampai ${n1(maxOf(withLab.map((r) => r.auGL)))} g/L`,
      detail: `Dari ${withLab.length} hasil lab. Pertama ${withLab[0]!.rb.batch.code} ${n2(withLab[0]!.auGL)} g/L, terakhir ${
        withLab[withLab.length - 1]!.rb.batch.code
      } ${n2(withLab[withLab.length - 1]!.auGL)} g/L.`,
    },
    kcn.length > 1 && {
      kind: 'trend',
      tone: 'info',
      title: `KCN larutan ${kcn[kcn.length - 1]!.kcnGL! > kcn[0]!.kcnGL! ? 'naik' : 'turun'} dari ${n1(kcn[0]!.kcnGL)} ke ${n1(kcn[kcn.length - 1]!.kcnGL)} g/L`,
      detail: `Target KCN batch terakhir ${n1(kcn[kcn.length - 1]!.rb.batch.prep.chem.kcnTarget)} g/L.`,
    },
    missing(rows, (r) => r.cucnAdded, 'catatan penambahan CuCN dan KCN'),
  ])
}

export function goldBalanceInsights(rows: Rows<typeof goldBalanceRows>): Insight[] {
  const complete = rows.filter((r) => r.status !== 'incomplete')
  const gaps = complete.filter((r) => r.status === 'gap')
  const worst = extremes(complete, (r) => Math.abs(r.variance!))
  const theory = rows.filter((r) => r.depositSource !== 'Timbang').length
  return found([
    rows.length > 0 && {
      kind: 'balance',
      tone: complete.length === 0 ? 'warn' : gaps.length ? 'warn' : 'good',
      title: complete.length
        ? `${complete.length - gaps.length} dari ${complete.length} neraca cocok`
        : 'Belum ada neraca yang bisa dihitung',
      detail: `${rows.length - complete.length} batch belum punya kadar Au awal atau akhir dari lab.`,
    },
    worst !== null && {
      kind: 'balance',
      tone: 'warn',
      title: `Selisih terbesar ${worst.high.rb.batch.code}: ${n0(Math.abs(worst.high.variance!))} g`,
      detail: `${pct(Math.abs(worst.high.variancePct!), 1)} dari emas di bak. ${
        worst.high.variance! > 0
          ? 'Emas di bak lebih banyak dari hitungan, mungkin penambahan GPC belum dicatat.'
          : 'Emas di bak kurang dari hitungan, cek emas di kawat dan sampel.'
      }`,
    },
    theory > 0 && {
      kind: 'data',
      tone: 'warn',
      title: `${theory} dari ${rows.length} batch memakai perkiraan emas menempel`,
      detail: 'Timbang produk sebelum dan sesudah proses supaya neraca memakai berat nyata.',
    },
  ])
}

export function efficiencyInsights(rows: Rows<typeof efficiencyRow>): Insight[] {
  const done = rows.filter((r) => r.efficiencyPct !== null)
  const byModel = new Map<string, number[]>()
  for (const r of done)
    for (const m of r.rb.models) byModel.set(m, [...(byModel.get(m) ?? []), r.efficiencyPct!])
  const models = extremes(
    [...byModel].filter(([, xs]) => xs.length >= 2),
    ([, xs]) => meanOf(xs),
  )
  const kwhPerG = meanOf(
    rows.map((r) =>
      r.energyKwh === null || !r.depositEstimate ? null : (r.energyKwh * 1000) / r.depositEstimate,
    ),
  )
  const eff = extremes(done, (r) => r.efficiencyPct)
  return found([
    eff !== null && {
      kind: 'efficiency',
      tone: 'info',
      title: `Efisiensi ${n1(eff.low.efficiencyPct)} sampai ${n1(eff.high.efficiencyPct)} %`,
      detail: `Rata-rata ${pct(meanOf(done.map((r) => r.efficiencyPct)), 1)} dari ${done.length} batch. Terbaik ${eff.high.rb.batch.code}, terendah ${eff.low.rb.batch.code}.`,
    },
    models !== null &&
      models.low !== models.high &&
      meanOf(models.high[1])! - meanOf(models.low[1])! >= 3 && {
        kind: 'model',
        tone: 'info',
        title: `${models.high[0]} paling efisien, ${models.low[0]} paling boros`,
        detail: `${pct(meanOf(models.high[1]), 1)} terhadap ${pct(meanOf(models.low[1]), 1)}, model yang muncul di 2 batch atau lebih.`,
      },
    kwhPerG !== null && {
      kind: 'energy',
      tone: 'info',
      title: `Sekitar ${n1(kwhPerG)} Wh energi DC per gram deposit`,
      detail: 'Deposit dihitung dari arus. Angka ini membantu membandingkan biaya listrik antar-batch.',
    },
  ])
}

export function comparisonInsights(rows: Rows<typeof comparisonRow>): Insight[] {
  const spread = (values: (number | null)[]) => {
    const xs = values.filter((v): v is number => v !== null)
    const m = meanOf(xs)
    if (xs.length < 3 || !m) return null
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) / m
  }
  const durationCv = spread(rows.map((r) => r.hours))
  const effCv = spread(rows.map((r) => r.efficiencyPct))
  const devs = rows.filter((r) => r.micronDev !== null)
  const outlier = extremes(devs, (r) => Math.abs(r.micronDev!))
  return found([
    durationCv !== null && {
      kind: 'duration',
      tone: durationCv > 0.2 ? 'warn' : 'good',
      title: `Durasi antar-batch bervariasi ±${pct(durationCv * 100)}`,
      detail:
        durationCv > 0.2
          ? 'Variasi besar; bandingkan luas rak dan rapat arus batch terlama.'
          : 'Durasi cukup konsisten.',
    },
    effCv !== null && {
      kind: 'efficiency',
      tone: effCv > 0.15 ? 'warn' : 'good',
      title: `Efisiensi bervariasi ±${pct(effCv * 100)} antar-batch`,
      detail: 'Variasi di atas 15 % biasanya datang dari kondisi bak, bukan dari rak.',
    },
    outlier !== null && {
      kind: 'au',
      tone: Math.abs(outlier.high.micronDev!) > 3 ? 'warn' : 'good',
      title: `Selisih tebal terbesar ${outlier.high.rb.batch.code}: ${fmtNumber(outlier.high.micronDev, 1)} µm`,
      detail: `Dari ${devs.length} batch terukur.`,
    },
    rows.length > 0 && {
      kind: 'data',
      tone: 'warn',
      title: 'Tingkat lolos QC belum bisa dihitung',
      detail: 'Catat hasil QC lolos atau gagal per batch untuk melengkapi perbandingan mutu.',
    },
  ])
}

const PREDICTION_LABEL = {
  thicknessErrPct: 'tebal',
  durationErrPct: 'durasi',
  depositErrPct: 'deposit',
} as const

export function predictionInsights(
  rows: Rows<typeof predictionRow>,
  advice: Rows<typeof voltAdviceRows>,
): Insight[] {
  const scored = (Object.keys(PREDICTION_LABEL) as (keyof typeof PREDICTION_LABEL)[])
    .map((key) => ({ key, ...validation(rows.map((r) => r[key])) }))
    .filter((s) => s.mape !== null)
    .sort((a, b) => a.mape! - b.mape!)
  const durationBias = meanOf(rows.map((r) => r.durationErrPct))
  const followed = advice.filter((a) => Math.abs(a.gap) <= 0.02 && a.au !== null)
  const ignored = advice.filter((a) => Math.abs(a.gap) > 0.02 && a.au !== null)
  const miss = (xs: typeof advice) => meanOf(xs.map((a) => Math.abs(a.au! - a.rb.batch.targetAu) * 100))
  const [hit, off] = [miss(followed), miss(ignored)]
  return found([
    scored.length > 0 && {
      kind: 'prediction',
      tone: scored[0]!.validated ? 'good' : 'info',
      title: `Perkiraan ${PREDICTION_LABEL[scored[0]!.key]} paling akurat, error ${pct(scored[0]!.mape, 1)}`,
      detail:
        scored.length > 1
          ? `Paling meleset: ${PREDICTION_LABEL[scored[scored.length - 1]!.key]} dengan error ${pct(scored[scored.length - 1]!.mape, 0)}.`
          : `Dari ${scored[0]!.n} batch.`,
    },
    durationBias !== null && {
      kind: 'duration',
      tone: Math.abs(durationBias) > 10 ? 'warn' : 'info',
      title: `Perkiraan durasi rata-rata ${durationBias < 0 ? 'kependekan' : 'kelamaan'} ${pct(Math.abs(durationBias))}`,
      detail: `Per batch tetap meleset rata-rata ${pct(validation(rows.map((r) => r.durationErrPct)).mape)}, ke dua arah. Batch selesai rata-rata ${fmtHours(meanOf(rows.map((r) => r.durationActual)))}.`,
    },
    hit !== null &&
      off !== null && {
        kind: 'volt',
        tone: hit < off ? 'good' : 'info',
        title:
          hit < off
            ? 'Mengikuti saran volt mendekatkan kadar ke target'
            : 'Mengikuti saran volt belum terlihat manfaatnya',
        detail: `Saat volt dalam ±0,02 V dari saran, kadar meleset ${n2(hit)} poin (${followed.length} pembacaan). Saat tidak, ${n2(off)} poin (${ignored.length} pembacaan).`,
      },
  ])
}
