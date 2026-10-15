import {
  FORMULA_VERSION,
  comparisonRow,
  efficiencyRow,
  fmtClock,
  fmtNumber,
  meanOf,
  predictionRow,
  sumOf,
  validation,
  voltAdviceRows,
} from '@ef/fixtures'
import { DIRECTIVE_LABEL } from '@ef/types'
import {
  Badge,
  BarList,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ColumnChart,
  GroupedColumnChart,
  NativeSelect,
  SegmentedControl,
  StatCard,
} from '@ef/ui'
import {
  ChartCard,
  Kpis,
  type ReportColumn,
  ReportTable,
  Toolbar,
  batchColumns,
  groupBy,
  hours,
  numbersOnly,
  shortModels,
  trend,
  useBatchDate,
  useOpenBatch,
  useReport,
  useSpecialFilters,
  useViewParam,
} from './shared'

export function EfficiencyReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const dateOf = useBatchDate()
  const { rows, panel } = useSpecialFilters(scope.batches.map(efficiencyRow), [
    { id: 'eff', label: 'Efisiensi katoda', unit: '%', value: (r) => r.efficiencyPct },
    {
      id: 'seldep',
      label: 'Selisih deposit perkiraan − teori',
      unit: 'g',
      value: (r) =>
        r.depositEstimate === null || r.depositTheory === null ? null : r.depositEstimate - r.depositTheory,
    },
    {
      id: 'durasi',
      label: 'Durasi',
      unit: 'jam',
      value: (r) => hours(r.durationMin),
    },
    { id: 'amm', label: 'Meter AMM', unit: 'A·menit', value: (r) => r.amm },
  ])
  const done = rows.filter((r) => r.efficiencyPct !== null)
  const byModel = [
    ...groupBy(
      done.flatMap((r) => r.rb.models.map((m) => ({ m, r }))),
      (x) => x.m,
    ),
  ].map(([m, xs]) => ({
    m,
    n: xs.length,
    eff: meanOf(xs.map((x) => x.r.efficiencyPct))!,
  }))
  const withDeposit = rows.filter(
    (r) => r.depositTheory !== null || r.depositEstimate !== null || r.depositActual !== null,
  )

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    ...batchColumns(),
    { id: 'tamm', label: 'AMM', unit: 'A·mnt', source: 'estimate', value: (r) => r.ammTheory, digits: 0 },
    { id: 'amm', label: 'AMM', unit: 'A·mnt', source: 'actual', value: (r) => r.amm, digits: 0 },
    {
      id: 'tdep',
      label: 'Deposit teori',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.depositTheory,
      digits: 1,
      hideBelow: 'md',
    },
    {
      id: 'edep',
      label: 'Deposit arus',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.depositEstimate,
      digits: 1,
      hideBelow: 'lg',
    },
    {
      id: 'adep',
      label: 'Deposit',
      unit: 'g',
      source: 'lab',
      value: (r) => r.depositActual,
      digits: 1,
      hideBelow: 'lg',
    },
    { id: 'eff', label: 'Efisiensi', unit: '%', value: (r) => r.efficiencyPct, digits: 1 },
    {
      id: 'trate',
      label: 'Laju',
      unit: 'µm/j',
      source: 'estimate',
      value: (r) => r.rateTheory,
      hideBelow: 'xl',
    },
    { id: 'rate', label: 'Laju', unit: 'µm/j', source: 'actual', value: (r) => r.rate, hideBelow: 'md' },
    { id: 'dpa', label: 'Deposit/AMM', unit: 'g', value: (r) => r.depositPerAmm, digits: 4, hideBelow: 'xl' },
    {
      id: 'dur',
      label: 'Durasi',
      unit: 'jam',
      value: (r) => hours(r.durationMin),
      digits: 1,
      hideBelow: 'lg',
    },
    {
      id: 'kwh',
      label: 'Energi DC',
      unit: 'kWh',
      source: 'estimate',
      value: (r) => r.energyKwh,
      digits: 2,
      hideBelow: 'xl',
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>{panel}</Toolbar>
      <Kpis
        items={[
          {
            label: 'Efisiensi rata-rata',
            value: meanOf(done.map((r) => r.efficiencyPct)),
            unit: '%',
            digits: 1,
            hint: `${done.length} batch selesai`,
          },
          { label: 'Total meter AMM', value: sumOf(rows.map((r) => r.amm)), unit: 'A·mnt', digits: 0 },
          {
            label: 'Deposit per AMM',
            value: meanOf(rows.map((r) => r.depositPerAmm)),
            unit: 'g',
            digits: 4,
            hint: 'Rata-rata, dari timbang atau arus',
          },
          { label: 'Energi DC', value: sumOf(rows.map((r) => r.energyKwh)), unit: 'kWh', digits: 2 },
        ]}
      />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title="Deposit teori dan aktual"
          note="Gram per batch. Deposit arus dihitung dari ampere × menit × persamaan elektrokimia."
        >
          <GroupedColumnChart
            ariaLabel="Deposit teori dan aktual"
            format={(v) => fmtNumber(v, 0)}
            series={[
              { name: 'Teori (rak)', tone: 'muted' },
              { name: 'Dari arus', tone: 'info' },
              { name: 'Timbang', tone: 'ink' },
            ]}
            data={withDeposit.map((r) => ({
              label: r.rb.batch.code,
              values: [r.depositTheory, r.depositEstimate, r.depositActual],
            }))}
          />
        </ChartCard>
        <ChartCard title="Tren efisiensi" note="Batch selesai, mengikuti pengelompokan grafik.">
          <ColumnChart
            ariaLabel="Tren efisiensi"
            format={(v) => `${fmtNumber(v, 1)} %`}
            data={numbersOnly(
              trend(done, filters.grain, {
                date: (r) => dateOf(r.rb),
                batch: (r) => r.rb.batch.code,
                value: (r) => r.efficiencyPct,
              }),
            )}
          />
        </ChartCard>
      </div>
      <ChartCard
        title="Efisiensi menurut model"
        note="Rata-rata batch selesai yang memuat model itu. Satu batch bisa memuat beberapa model."
      >
        <BarList
          ariaLabel="Efisiensi per model"
          items={byModel
            .sort((a, b) => b.eff - a.eff)
            .slice(0, 12)
            .map((x) => ({
              key: x.m,
              label: x.m,
              value: x.eff,
              display: `${fmtNumber(x.eff, 1)} %`,
              hint: `${x.n} batch`,
            }))}
        />
      </ChartCard>
      <ReportTable
        title="Teori terhadap aktual"
        file="efisiensi"
        note={`Parameter: efisiensi asumsi ${fmtNumber(rows[0]?.assumedEfficiencyPct ?? 95, 0)} %, rapat arus awal 0,3 A/dm², ${FORMULA_VERSION}.`}
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
        initialSort={{ id: 'start', desc: true }}
      />
    </div>
  )
}

type CompareRow = ReturnType<typeof comparisonRow>
const METRICS = {
  eff: {
    label: 'Efisiensi',
    unit: '%',
    digits: 1,
    value: (r: CompareRow) => r.efficiencyPct,
    higherIsBetter: true,
  },
  rate: {
    label: 'Laju tebal',
    unit: 'µm/j',
    digits: 2,
    value: (r: CompareRow) => r.rate,
    higherIsBetter: true,
  },
  micronDev: {
    label: 'Selisih tebal',
    unit: 'µm',
    digits: 1,
    value: (r: CompareRow) => r.micronDev,
    higherIsBetter: null,
  },
  auDev: {
    label: 'Selisih Au',
    unit: 'poin',
    digits: 2,
    value: (r: CompareRow) => r.auDev,
    higherIsBetter: null,
  },
  hours: {
    label: 'Durasi',
    unit: 'jam',
    digits: 1,
    value: (r: CompareRow) => r.hours,
    higherIsBetter: false,
  },
  amm: {
    label: 'Meter AMM',
    unit: 'A·mnt',
    digits: 0,
    value: (r: CompareRow) => r.amm,
    higherIsBetter: false,
  },
}
type Metric = keyof typeof METRICS

/** Deviation metrics rank by distance from zero; the rest by value. */
const rankValue = (key: Metric, r: CompareRow) => {
  const v = METRICS[key].value(r)
  return v === null
    ? null
    : METRICS[key].higherIsBetter === null
      ? -Math.abs(v)
      : METRICS[key].higherIsBetter
        ? v
        : -v
}

const SIDE_BY_SIDE: {
  label: string
  unit?: string
  digits: number
  value: (r: CompareRow) => number | string | null
}[] = [
  { label: 'Model', digits: 0, value: (r) => shortModels(r.rb.models) },
  { label: 'Barang', unit: 'pcs', digits: 0, value: (r) => r.pieces },
  { label: 'Luas', unit: 'dm²', digits: 2, value: (r) => r.areaDm2 },
  { label: 'Volt rata-rata', unit: 'V', digits: 2, value: (r) => r.avgVolt },
  { label: 'Ampere rata-rata', unit: 'A', digits: 2, value: (r) => r.avgAmp },
  { label: 'Meter AMM', unit: 'A·mnt', digits: 0, value: (r) => r.amm },
  { label: 'Durasi', unit: 'jam', digits: 1, value: (r) => r.hours },
  { label: 'Tebal target', unit: 'µm', digits: 0, value: (r) => r.targetMicron },
  { label: 'Tebal aktual', unit: 'µm', digits: 1, value: (r) => r.micron },
  { label: 'Au target', unit: '%', digits: 2, value: (r) => r.targetAuPct },
  { label: 'Au aktual', unit: '%', digits: 2, value: (r) => r.auPct },
  { label: 'Emas menempel', unit: 'g', digits: 1, value: (r) => r.depositAuG },
  { label: 'Efisiensi', unit: '%', digits: 1, value: (r) => r.efficiencyPct },
  { label: 'Hasil QC', digits: 0, value: () => 'Belum dicatat' },
]
const MAX_SIDE = 6

export function ComparisonReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const [metric, setMetric] = useViewParam<Metric>('banding', 'eff')
  const { rows, panel } = useSpecialFilters(scope.batches.map(comparisonRow), [
    { id: 'dtebal', label: 'Selisih tebal', unit: 'µm', value: (r) => r.micronDev },
    { id: 'dau', label: 'Selisih Au', unit: 'poin', value: (r) => r.auDev },
    { id: 'eff', label: 'Efisiensi', unit: '%', value: (r) => r.efficiencyPct },
  ])
  const m = METRICS[metric]
  const ranked = rows
    .filter((r) => m.value(r) !== null)
    .sort((a, b) => rankValue(metric, b)! - rankValue(metric, a)!)
  const side = filters.batchIds.length ? rows.slice(0, MAX_SIDE) : ranked.slice(0, MAX_SIDE)
  const show = (v: number | string | null, digits: number) =>
    v === null ? '–' : typeof v === 'number' ? fmtNumber(v, digits) : v

  const columns: ReportColumn<CompareRow>[] = [
    ...batchColumns(),
    { id: 'pcs', label: 'Barang', unit: 'pcs', value: (r) => r.pieces, digits: 0, hideBelow: 'lg' },
    { id: 'area', label: 'Luas', unit: 'dm²', value: (r) => r.areaDm2, hideBelow: 'lg' },
    { id: 'v', label: 'Volt', unit: 'V', source: 'actual', value: (r) => r.avgVolt, hideBelow: 'xl' },
    { id: 'a', label: 'Ampere', unit: 'A', source: 'actual', value: (r) => r.avgAmp, hideBelow: 'xl' },
    {
      id: 'amm',
      label: 'AMM',
      unit: 'A·mnt',
      source: 'actual',
      value: (r) => r.amm,
      digits: 0,
      hideBelow: 'md',
    },
    { id: 'h', label: 'Durasi', unit: 'jam', value: (r) => r.hours, digits: 1, hideBelow: 'md' },
    { id: 'µ', label: 'Tebal', unit: 'µm', source: 'actual', value: (r) => r.micron, digits: 1 },
    { id: 'dµ', label: 'Selisih tebal', unit: 'µm', value: (r) => r.micronDev, digits: 1 },
    { id: 'au', label: 'Au', unit: '%', value: (r) => r.auPct, hideBelow: 'md' },
    { id: 'dau', label: 'Selisih Au', unit: 'poin', value: (r) => r.auDev },
    { id: 'eff', label: 'Efisiensi', unit: '%', value: (r) => r.efficiencyPct, digits: 1 },
    { id: 'qc', label: 'QC', value: () => null, hideBelow: 'xl' },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>
        {panel}
        <NativeSelect
          aria-label="Parameter perbandingan"
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          options={Object.entries(METRICS).map(([value, x]) => ({ value, label: `Urutkan: ${x.label}` }))}
          className="w-52"
        />
      </Toolbar>
      <Kpis
        items={[
          { label: 'Batch dibandingkan', value: rows.length, digits: 0 },
          { label: `${m.label} rata-rata`, value: meanOf(rows.map(m.value)), unit: m.unit, digits: m.digits },
          {
            label: 'Terbaik',
            value: ranked[0]?.rb.batch.code ?? null,
            hint: ranked[0] ? `${show(m.value(ranked[0]), m.digits)} ${m.unit}` : undefined,
          },
          { label: 'Tingkat lolos QC', value: null, hint: 'Hasil QC belum dicatat' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Berdampingan</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            {filters.batchIds.length
              ? `Batch pilihan filter, maksimal ${MAX_SIDE}.`
              : `${MAX_SIDE} teratas menurut ${m.label.toLowerCase()}. Pilih batch di filter untuk membandingkan batch tertentu.`}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="text-sm w-full min-w-[32rem]">
            <thead>
              <tr className="text-xs text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Parameter</th>
                {side.map((r) => (
                  <th
                    key={r.rb.batch.id}
                    className="py-2 px-2 font-semibold text-right font-mono text-foreground"
                  >
                    {r.rb.batch.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIDE_BY_SIDE.map((p) => (
                <tr key={p.label} className="border-t border-border">
                  <th className="py-2 pr-3 font-normal text-left text-muted">
                    {p.label}
                    {p.unit && <span className="text-xs"> ({p.unit})</span>}
                  </th>
                  {side.map((r) => (
                    <td key={r.rb.batch.id} className="py-2 px-2 text-right tabular-nums">
                      {show(p.value(r), p.digits)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <ChartCard
        title={`Peringkat: ${m.label.toLowerCase()}`}
        note={
          m.higherIsBetter === null
            ? 'Paling dekat ke nol di atas.'
            : m.higherIsBetter
              ? 'Tertinggi di atas.'
              : 'Terendah di atas.'
        }
      >
        <BarList
          ariaLabel="Peringkat batch"
          items={ranked.slice(0, 12).map((r) => ({
            key: r.rb.batch.id,
            label: r.rb.batch.code,
            value: Math.abs(m.value(r)!),
            display: `${show(m.value(r), m.digits)} ${m.unit}`,
            onClick: () => openBatch(r),
          }))}
        />
      </ChartCard>
      <ReportTable
        title="Batch dengan selisih terbesar"
        file="perbandingan-batch"
        note="Urut dari selisih tebal terbesar."
        columns={columns}
        rows={[...rows].sort((a, b) => Math.abs(b.micronDev ?? 0) - Math.abs(a.micronDev ?? 0))}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
      />
    </div>
  )
}

type PredRow = ReturnType<typeof predictionRow>
const PREDICTIONS = {
  thickness: {
    label: 'Tebal',
    unit: 'µm',
    digits: 1,
    pred: (r: PredRow) => r.thicknessPred,
    actual: (r: PredRow) => r.thicknessActual,
    err: (r: PredRow) => r.thicknessErrPct,
  },
  duration: {
    label: 'Durasi',
    unit: 'jam',
    digits: 1,
    pred: (r: PredRow) => r.durationPred,
    actual: (r: PredRow) => r.durationActual,
    err: (r: PredRow) => r.durationErrPct,
  },
  deposit: {
    label: 'Deposit',
    unit: 'g',
    digits: 1,
    pred: (r: PredRow) => r.depositPred,
    actual: (r: PredRow) => r.depositActual,
    err: (r: PredRow) => r.depositErrPct,
  },
  au: {
    label: 'Kadar Au',
    unit: '%',
    digits: 2,
    pred: (r: PredRow) => r.auPred,
    actual: (r: PredRow) => r.auActual,
    err: (r: PredRow) => (r.auErrPp === null || r.auActual === null ? null : (r.auErrPp / r.auActual) * 100),
  },
}
type Prediction = keyof typeof PREDICTIONS
const ERROR_BUCKETS = [
  { label: '≤ 5 %', max: 5 },
  { label: '5–10 %', max: 10 },
  { label: '10–25 %', max: 25 },
  { label: '> 25 %', max: Infinity },
]

export function PredictionReport() {
  const { scope, all } = useReport()
  const openBatch = useOpenBatch()
  const [kind, setKind] = useViewParam<Prediction>('prediksi', 'duration')
  const p = PREDICTIONS[kind]
  const { rows, panel } = useSpecialFilters(
    scope.batches.filter((rb) => rb.batch.status === 'completed').map((rb) => predictionRow(rb, all)),
    [
      { id: 'err', label: `Error ${p.label.toLowerCase()}`, unit: '%', value: p.err },
      { id: 'target', label: 'Target tebal', unit: 'µm', value: (r) => r.rb.batch.targetMicron },
    ],
  )
  const running = scope.batches
    .filter((rb) => rb.batch.status === 'running')
    .map((rb) => predictionRow(rb, all))
  const paired = rows.filter((r) => p.pred(r) !== null && p.actual(r) !== null)
  const advice = voltAdviceRows(scope)

  const columns: ReportColumn<PredRow>[] = [
    ...batchColumns(),
    {
      id: 'tp',
      label: 'Tebal',
      unit: 'µm',
      source: 'estimate',
      value: (r) => r.thicknessPred,
      digits: 1,
      hideBelow: 'lg',
    },
    {
      id: 'ta',
      label: 'Tebal',
      unit: 'µm',
      source: 'actual',
      value: (r) => r.thicknessActual,
      digits: 1,
      hideBelow: 'lg',
    },
    { id: 'dp', label: 'Durasi', unit: 'jam', source: 'estimate', value: (r) => r.durationPred, digits: 1 },
    { id: 'da', label: 'Durasi', unit: 'jam', source: 'actual', value: (r) => r.durationActual, digits: 1 },
    {
      id: 'gp',
      label: 'Deposit',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.depositPred,
      digits: 1,
      hideBelow: 'xl',
    },
    {
      id: 'ga',
      label: 'Deposit',
      unit: 'g',
      source: 'lab',
      value: (r) => r.depositActual,
      digits: 1,
      hideBelow: 'xl',
    },
    { id: 'ap', label: 'Au', unit: '%', source: 'estimate', value: (r) => r.auPred, hideBelow: 'md' },
    { id: 'aa', label: 'Au', unit: '%', source: 'actual', value: (r) => r.auActual, hideBelow: 'md' },
    { id: 'err', label: `Error ${p.label.toLowerCase()}`, unit: '%', value: p.err, digits: 1 },
    { id: 'ver', label: 'Versi rumus', value: () => FORMULA_VERSION, hideBelow: 'xl' },
  ]
  const adviceColumns: ReportColumn<(typeof advice)[number]>[] = [
    { id: 'at', label: 'Jam catat', value: (r) => r.at, cell: (r) => fmtClock(r.at) },
    {
      id: 'code',
      label: 'Batch',
      value: (r) => r.rb.batch.code,
      cell: (r) => <span className="font-semibold font-mono">{r.rb.batch.code}</span>,
    },
    { id: 'no', label: 'Ke', value: (r) => r.no, digits: 0 },
    { id: 'adv', label: 'Volt saran', unit: 'V', source: 'estimate', value: (r) => r.advised },
    { id: 'app', label: 'Volt dipakai', unit: 'V', source: 'actual', value: (r) => r.applied },
    { id: 'gap', label: 'Selisih', unit: 'V', value: (r) => r.gap },
    { id: 'dir', label: 'Arahan', value: (r) => DIRECTIVE_LABEL[r.directive], hideBelow: 'md' },
    {
      id: 'au',
      label: 'Kadar hasil',
      unit: '%',
      source: 'actual',
      value: (r) => (r.au === null ? null : r.au * 100),
      hideBelow: 'md',
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>
        {panel}
        <SegmentedControl
          size="sm"
          value={kind}
          onChange={(v) => setKind(v as Prediction)}
          options={Object.entries(PREDICTIONS).map(([value, x]) => ({ value, label: x.label }))}
        />
      </Toolbar>
      <div className="gap-3 sm:gap-4 lg:grid-cols-4 grid grid-cols-2">
        {(Object.keys(PREDICTIONS) as Prediction[]).map((key) => {
          const v = validation(rows.map(PREDICTIONS[key].err))
          return (
            <StatCard
              key={key}
              label={`Error ${PREDICTIONS[key].label.toLowerCase()}`}
              value={v.mape === null ? '–' : fmtNumber(v.mape, 1)}
              unit="%"
              hint={
                <span className="gap-1.5 flex flex-wrap items-center">
                  <Badge variant={v.validated ? 'success' : 'muted'}>
                    {v.validated ? 'Tervalidasi' : 'Belum tervalidasi'}
                  </Badge>
                  {v.n} batch
                </span>
              }
            />
          )
        })}
      </div>
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title={`${p.label}: perkiraan terhadap hasil`}
          note={`${p.unit}, batch selesai yang punya keduanya.`}
        >
          <GroupedColumnChart
            ariaLabel="Perkiraan terhadap hasil"
            format={(v) => fmtNumber(v, p.digits)}
            series={[
              { name: 'Perkiraan', tone: 'muted' },
              { name: 'Hasil', tone: 'info' },
            ]}
            data={paired.map((r) => ({ label: r.rb.batch.code, values: [p.pred(r), p.actual(r)] }))}
          />
        </ChartCard>
        <ChartCard title="Sebaran error" note={`Error absolut ${p.label.toLowerCase()} dalam persen.`}>
          <BarList
            ariaLabel="Sebaran error"
            items={ERROR_BUCKETS.map((b, i) => {
              const n = paired.filter((r) => {
                const e = Math.abs(p.err(r)!)
                return e <= b.max && (i === 0 || e > ERROR_BUCKETS[i - 1]!.max)
              }).length
              return { key: b.label, label: b.label, value: n, display: `${n} batch` }
            })}
          />
        </ChartCard>
      </div>
      {running.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saran untuk batch berjalan</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Rekomendasi analitis. Operator tetap yang mengubah setelan mesin.
            </p>
          </CardHeader>
          <CardContent className="gap-3 sm:grid-cols-2 grid grid-cols-1">
            {running.map((r) => (
              <button
                key={r.rb.batch.id}
                type="button"
                onClick={() => openBatch(r)}
                className="p-3 rounded-2xl text-sm bg-surface-2 text-left hover:bg-surface"
              >
                <p className="font-semibold font-mono">{r.rb.batch.code}</p>
                <p className="text-xs text-muted">
                  Volt saran {fmtNumber(r.voltAdvice, 2)} V · set target {fmtNumber(r.densityAdvice, 2)} A/dm²
                  · AMM teori tersisa {fmtNumber(r.ammLeft, 0)} A·menit
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
      <ReportTable
        title="Perkiraan terhadap hasil"
        file="akurasi-perkiraan"
        note="Durasi diperkirakan dari pola luas rak batch lain. Tebal dari AMM teori × meter AMM."
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
      />
      <ReportTable
        title="Riwayat saran volt"
        file="riwayat-saran-volt"
        note="Saran yang tampil saat pembacaan dicatat, dibanding volt yang dipakai operator."
        columns={adviceColumns}
        rows={advice}
        getKey={(r) => `${r.rb.batch.id}-${r.no}`}
        onRowClick={openBatch}
      />
    </div>
  )
}
