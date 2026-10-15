import {
  type CompositionSource,
  auBand,
  compositionRows,
  electricalRow,
  fmtClock,
  fmtNumber,
  maxOf,
  meanOf,
  minOf,
  regress,
  sumOf,
} from '@ef/fixtures'
import { Badge, ColumnChart, LineChart, ScatterChart, SegmentedControl } from '@ef/ui'
import { AU_BAND_LABEL } from '../../components/badges'
import {
  ChartCard,
  Kpis,
  type ReportColumn,
  ReportTable,
  Toolbar,
  numbersOnly,
  groupBy,
  trend,
  useReport,
  useOpenBatch,
  useSpecialFilters,
  useViewParam,
} from './shared'

/** Current more than this far from the set target counts as a deviation. */
const AMP_TOLERANCE_PCT = 10

const range = (values: (number | null)[], digits: number, unit: string) => {
  const [lo, hi] = [minOf(values), maxOf(values)]
  return lo === null ? null : `${fmtNumber(lo, digits)}–${fmtNumber(hi, digits)} ${unit}`
}

export function ElectricalReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const [param, setParam] = useViewParam<'volt' | 'amp'>('param', 'volt')
  const [mode, setMode] = useViewParam<'actual' | 'set' | 'dev'>('mode', 'actual')
  const { rows, panel } = useSpecialFilters(
    scope.readings.map(electricalRow),
    [
      { id: 'volt', label: 'Volt', unit: 'V', value: (r) => r.volt },
      { id: 'amp', label: 'Ampere', unit: 'A', value: (r) => r.amp },
      { id: 'jalan', label: 'Lama berjalan', unit: 'jam', value: (r) => r.elapsedMin / 60 },
    ],
    [
      {
        id: 'dev',
        label: `Arus terhadap set target (±${AMP_TOLERANCE_PCT} %)`,
        options: [
          { value: 'out', label: 'Di luar toleransi' },
          { value: 'in', label: 'Dalam toleransi' },
        ],
        value: (r) =>
          r.ampDevPct === null ? null : Math.abs(r.ampDevPct) > AMP_TOLERANCE_PCT ? 'out' : 'in',
      },
    ],
  )
  const outside = rows.filter((r) => r.ampDevPct !== null && Math.abs(r.ampDevPct) > AMP_TOLERANCE_PCT)
  const pick = (r: (typeof rows)[number]) =>
    param === 'volt'
      ? { actual: r.volt, set: r.voltSet, dev: r.voltDev }[mode]
      : { actual: r.amp, set: r.ampSet, dev: r.ampDev }[mode]
  const unit = param === 'volt' ? 'V' : 'A'

  const perBatch = [...groupBy(rows, (r) => r.rb.batch.id).values()].map((group) => ({
    rb: group[0]!.rb,
    n: group.length,
    volts: group.map((r) => r.volt),
    amps: group.map((r) => r.amp),
    energy: sumOf(group.map((r) => r.energyKwh)),
  }))

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    { id: 'at', label: 'Jam catat', value: (r) => r.at, cell: (r) => fmtClock(r.at) },
    {
      id: 'code',
      label: 'Batch',
      value: (r) => r.rb.batch.code,
      cell: (r) => <span className="font-semibold font-mono">{r.rb.batch.code}</span>,
    },
    { id: 'no', label: 'Ke', value: (r) => r.row.reading.no, digits: 0 },
    { id: 'el', label: 'Berjalan', unit: 'jam', value: (r) => r.elapsedMin / 60, digits: 1, hideBelow: 'md' },
    {
      id: 'vs',
      label: 'Volt saran',
      unit: 'V',
      source: 'estimate',
      value: (r) => r.voltSet,
      hideBelow: 'lg',
    },
    { id: 'v', label: 'Volt', unit: 'V', source: 'actual', value: (r) => r.volt },
    { id: 'vd', label: 'Selisih volt', unit: 'V', value: (r) => r.voltDev, hideBelow: 'xl' },
    { id: 'as', label: 'Ampere set', unit: 'A', source: 'target', value: (r) => r.ampSet, hideBelow: 'lg' },
    { id: 'a', label: 'Ampere', unit: 'A', source: 'actual', value: (r) => r.amp },
    {
      id: 'ad',
      label: 'Selisih arus',
      unit: '%',
      value: (r) => r.ampDevPct,
      digits: 1,
      cell: (r) =>
        r.ampDevPct === null ? (
          '–'
        ) : (
          <Badge variant={Math.abs(r.ampDevPct) > AMP_TOLERANCE_PCT ? 'warning' : 'muted'}>
            {fmtNumber(r.ampDevPct, 1)} %
          </Badge>
        ),
    },
    {
      id: 'e',
      label: 'Energi DC',
      unit: 'kWh',
      source: 'estimate',
      value: (r) => r.energyKwh,
      digits: 3,
      hideBelow: 'xl',
    },
  ]
  const statColumns: ReportColumn<(typeof perBatch)[number]>[] = [
    {
      id: 'code',
      label: 'Batch',
      value: (r) => r.rb.batch.code,
      cell: (r) => <span className="font-semibold font-mono">{r.rb.batch.code}</span>,
    },
    { id: 'n', label: 'Pembacaan', value: (r) => r.n, digits: 0 },
    { id: 'vmin', label: 'Volt min', unit: 'V', value: (r) => minOf(r.volts) },
    { id: 'vmax', label: 'Volt maks', unit: 'V', value: (r) => maxOf(r.volts) },
    { id: 'vavg', label: 'Volt rata-rata', unit: 'V', value: (r) => meanOf(r.volts) },
    { id: 'amin', label: 'Ampere min', unit: 'A', value: (r) => minOf(r.amps), hideBelow: 'md' },
    { id: 'amax', label: 'Ampere maks', unit: 'A', value: (r) => maxOf(r.amps), hideBelow: 'md' },
    { id: 'aavg', label: 'Ampere rata-rata', unit: 'A', value: (r) => meanOf(r.amps), hideBelow: 'md' },
    { id: 'e', label: 'Energi DC', unit: 'kWh', source: 'estimate', value: (r) => r.energy, digits: 3 },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>{panel}</Toolbar>
      <Kpis
        items={[
          {
            label: 'Volt',
            value: range(
              rows.map((r) => r.volt),
              2,
              'V',
            ),
            hint: `Rata-rata ${fmtNumber(meanOf(rows.map((r) => r.volt)), 2)} V`,
          },
          {
            label: 'Ampere',
            value: range(
              rows.map((r) => r.amp),
              2,
              'A',
            ),
            hint: `Rata-rata ${fmtNumber(meanOf(rows.map((r) => r.amp)), 2)} A`,
          },
          {
            label: 'Energi DC',
            value: sumOf(rows.map((r) => r.energyKwh)),
            unit: 'kWh',
            digits: 2,
            hint: 'Volt × ampere × menit',
          },
          {
            label: 'Arus di luar toleransi',
            value: `${outside.length} pembacaan`,
            hint: `${fmtNumber((sumOf(outside.map((r) => r.row.reading.minutes)) ?? 0) / 60, 1)} jam, lebih dari ±${AMP_TOLERANCE_PCT} % set target`,
          },
        ]}
      />
      <ChartCard
        title={`${param === 'volt' ? 'Volt' : 'Ampere'} ${{ actual: 'aktual', set: param === 'volt' ? 'saran' : 'set target', dev: 'selisih' }[mode]}`}
        note="Rata-rata per kelompok, mengikuti pengelompokan grafik."
        action={
          <div className="gap-2 flex flex-wrap print:hidden">
            <SegmentedControl
              size="sm"
              value={param}
              onChange={(v) => setParam(v as 'volt' | 'amp')}
              options={[
                { value: 'volt', label: 'Volt' },
                { value: 'amp', label: 'Ampere' },
              ]}
            />
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={(v) => setMode(v as 'actual' | 'set' | 'dev')}
              options={[
                { value: 'actual', label: 'Aktual' },
                { value: 'set', label: 'Setpoint' },
                { value: 'dev', label: 'Selisih' },
              ]}
            />
          </div>
        }
      >
        <LineChart
          ariaLabel="Tren listrik"
          format={(v) => `${fmtNumber(v, 2)} ${unit}`}
          data={trend(rows, filters.grain, {
            date: (r) => r.at,
            batch: (r) => r.rb.batch.code,
            label: (r) => `${r.rb.batch.code} #${r.row.reading.no}`,
            value: pick,
          })}
          referenceLines={mode === 'dev' ? [{ value: 0, label: '0', tone: 'muted' }] : []}
        />
      </ChartCard>
      <ReportTable
        title="Statistik per batch"
        file="listrik-statistik"
        columns={statColumns}
        rows={perBatch}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
      />
      <ReportTable
        title="Log pembacaan"
        file="listrik-log"
        note="Volt saran berasal dari regresi kadar terhadap volt sebelum pembacaan itu."
        columns={columns}
        rows={rows}
        getKey={(r) => r.row.reading.id}
        onRowClick={openBatch}
      />
    </div>
  )
}

const SOURCE_LABEL: Record<CompositionSource, string> = {
  xray: 'X-ray proses',
  lab: 'Uji lab',
  estimate: 'Persamaan',
}

export function CompositionReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const [element, setElement] = useViewParam<'au' | 'cu'>('unsur', 'au')
  const all = compositionRows(scope)
  const bandOf = (r: (typeof all)[number]) => auBand(r.auPct / 100, r.rb.batch)
  const { rows, panel } = useSpecialFilters(
    all,
    [
      { id: 'au', label: 'Kadar Au', unit: '%', value: (r) => r.auPct },
      { id: 'dev', label: 'Selisih Au dari target', unit: 'poin', value: (r) => r.deviationPp },
    ],
    [
      {
        id: 'sumber',
        label: 'Sumber hasil',
        options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
        value: (r) => r.source,
      },
      {
        id: 'batas',
        label: 'Terhadap batas kadar',
        options: Object.entries(AU_BAND_LABEL).map(([value, label]) => ({ value, label })),
        value: bandOf,
      },
    ],
  )
  const xray = rows.filter((r) => r.source === 'xray')
  const value = (r: (typeof rows)[number]) => (element === 'au' ? r.auPct : r.cuPct)
  const points = xray.flatMap((r) =>
    r.volt === null ? [] : [{ x: r.volt, y: r.auPct, label: r.rb.batch.code }],
  )
  const fit = regress(points)
  const perBatch = [...groupBy(xray, (r) => r.rb.batch.code)].map(([label, group]) => ({
    label,
    value: meanOf(group.map((r) => r.deviationPp)),
  }))

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    { id: 'at', label: 'Waktu sampel', value: (r) => r.at, cell: (r) => fmtClock(r.at) },
    {
      id: 'code',
      label: 'Batch',
      value: (r) => r.rb.batch.code,
      cell: (r) => <span className="font-semibold font-mono">{r.rb.batch.code}</span>,
    },
    { id: 'sample', label: 'Sampel', value: (r) => r.sample, hideBelow: 'md' },
    { id: 'src', label: 'Sumber', value: (r) => SOURCE_LABEL[r.source] },
    { id: 'tau', label: 'Au', unit: '%', source: 'target', value: (r) => r.targetAuPct },
    {
      id: 'au',
      label: 'Au',
      unit: '%',
      value: (r) => r.auPct,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.auPct, 2)}</span>,
    },
    { id: 'cu', label: 'Cu', unit: '%', value: (r) => r.cuPct, hideBelow: 'md' },
    { id: 'dev', label: 'Selisih', unit: 'poin', value: (r) => r.deviationPp },
    {
      id: 'band',
      label: 'Batas kadar',
      value: (r) => AU_BAND_LABEL[bandOf(r)],
      cell: (r) => (
        <Badge variant={bandOf(r) === 'within' ? 'success' : 'warning'}>{AU_BAND_LABEL[bandOf(r)]}</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>
        {panel}
        <SegmentedControl
          size="sm"
          value={element}
          onChange={(v) => setElement(v as 'au' | 'cu')}
          options={[
            { value: 'au', label: 'Emas (Au)' },
            { value: 'cu', label: 'Tembaga (Cu)' },
          ]}
        />
      </Toolbar>
      <Kpis
        items={[
          { label: 'Hasil X-ray', value: xray.length, digits: 0 },
          {
            label: 'Masuk batas kadar',
            value: xray.length
              ? (xray.filter((r) => bandOf(r) === 'within').length / xray.length) * 100
              : null,
            unit: '%',
            digits: 0,
          },
          { label: `Rata-rata ${element === 'au' ? 'Au' : 'Cu'}`, value: meanOf(xray.map(value)), unit: '%' },
          { label: 'Rata-rata selisih Au', value: meanOf(xray.map((r) => r.deviationPp)), unit: 'poin' },
        ]}
      />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title={`Tren kadar ${element === 'au' ? 'emas' : 'tembaga'}`}
          note="Hasil X-ray, mengikuti pengelompokan grafik."
        >
          <LineChart
            ariaLabel="Tren kadar"
            format={(v) => `${fmtNumber(v, 2)} %`}
            data={trend(xray, filters.grain, {
              date: (r) => r.at,
              batch: (r) => r.rb.batch.code,
              label: (r) => `${r.rb.batch.code} ${r.sample}`,
              value,
            })}
            referenceLines={
              element === 'au' && xray.length
                ? [{ value: meanOf(xray.map((r) => r.targetAuPct))!, label: 'Target', tone: 'muted' }]
                : []
            }
          />
        </ChartCard>
        <ChartCard
          title="Selisih Au rata-rata per batch"
          note="Poin persen dari target. Positif berarti kadar di atas target."
        >
          <ColumnChart
            ariaLabel="Selisih Au per batch"
            format={(v) => fmtNumber(v, 2)}
            data={numbersOnly(perBatch)}
          />
        </ChartCard>
      </div>
      <ChartCard
        title="Volt terhadap kadar Au"
        note={
          fit.slope === null
            ? 'Semua hasil X-ray dalam filter.'
            : `Semua hasil X-ray dalam filter. Garis: naik 0,1 V mengubah kadar ${fmtNumber(fit.slope / 10, 2)} poin (R² ${fmtNumber(fit.r2, 2)}).`
        }
      >
        <ScatterChart
          ariaLabel="Volt terhadap kadar Au"
          points={points}
          fit={
            fit.slope === null || fit.intercept === null
              ? null
              : { slope: fit.slope, intercept: fit.intercept }
          }
          formatX={(v) => `${fmtNumber(v, 2)} V`}
          formatY={(v) => `${fmtNumber(v, 1)} %`}
          xLabel="Volt"
        />
      </ChartCard>
      <ReportTable
        title="Hasil kadar"
        file="kadar-au-cu"
        note="Persamaan elektrokimia adalah perkiraan, terpisah dari hasil uji."
        columns={columns}
        rows={rows}
        getKey={(r) => `${r.rb.batch.id}-${r.sample}`}
        onRowClick={openBatch}
      />
    </div>
  )
}
