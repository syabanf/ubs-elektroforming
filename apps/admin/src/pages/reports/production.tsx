import {
  densityRow,
  fmtClock,
  fmtNumber,
  meanOf,
  productionRow,
  sumOf,
  thicknessRow,
  productionInsights,
  thicknessInsights,
  densityInsights,
} from '@ef/fixtures'
import { BATCH_STATUS_LABEL, type BatchStatus } from '@ef/types'
import { Badge, BarList, ColumnChart, GroupedColumnChart, LineChart, SegmentedControl } from '@ef/ui'
import { BatchStatusBadge } from '../../components/badges'
import {
  ChartCard,
  Kpis,
  type ReportColumn,
  ReportTable,
  Toolbar,
  batchColumns,
  hours,
  modelColumn,
  numbersOnly,
  trend,
  useBatchDate,
  useFocusBatch,
  useReport,
  useOpenBatch,
  useSpecialFilters,
  useViewParam,
  ReportInsights,
} from './shared'

const STATUS_OPTIONS = (Object.keys(BATCH_STATUS_LABEL) as BatchStatus[]).map((s) => ({
  value: s,
  label: BATCH_STATUS_LABEL[s],
}))

export function ProductionReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const dateOf = useBatchDate()
  const { rows, panel } = useSpecialFilters(
    scope.batches.map(productionRow),
    [
      { id: 'pcs', label: 'Jumlah barang', unit: 'pcs', value: (r) => r.pieces },
      { id: 'luas', label: 'Luas total', unit: 'dm²', value: (r) => r.areaDm2 },
      { id: 'durasi', label: 'Durasi aktual', unit: 'jam', value: (r) => hours(r.durationMin) },
    ],
    [{ id: 'status', label: 'Status batch', options: STATUS_OPTIONS, value: (r) => r.rb.batch.status }],
  )
  const deposits = sumOf(rows.map((r) => r.depositG))
  const estimated = sumOf(rows.map((r) => r.rb.summary.totalWeightG || null))
  const byModel = new Map<string, number>()
  for (const r of rows)
    for (const line of r.rb.prep.lines) byModel.set(line.name, (byModel.get(line.name) ?? 0) + line.line.qty)

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    ...batchColumns(),
    {
      id: 'end',
      label: 'Selesai',
      value: (r) => r.rb.endedAt,
      cell: (r) => fmtClock(r.rb.endedAt),
      hideBelow: 'lg',
    },
    modelColumn('lg'),
    { id: 'pcs', label: 'Barang', unit: 'pcs', value: (r) => r.pieces, digits: 0 },
    {
      id: 'areaPc',
      label: 'Luas/barang',
      unit: 'dm²',
      value: (r) => r.areaPerPieceDm2,
      digits: 3,
      hideBelow: 'xl',
    },
    { id: 'area', label: 'Luas total', unit: 'dm²', value: (r) => r.areaDm2 },
    {
      id: 'w0',
      label: 'Berat awal',
      unit: 'g',
      source: 'actual',
      value: (r) => r.weightStartG,
      hideBelow: 'xl',
    },
    {
      id: 'w1',
      label: 'Berat akhir',
      unit: 'g',
      source: 'actual',
      value: (r) => r.weightFinalG,
      hideBelow: 'xl',
    },
    { id: 'dep', label: 'Deposit', unit: 'g', source: 'actual', value: (r) => r.depositG, hideBelow: 'xl' },
    {
      id: 'tµ',
      label: 'Tebal',
      unit: 'µm',
      source: 'target',
      value: (r) => r.targetMicron,
      digits: 0,
      hideBelow: 'lg',
    },
    { id: 'µ', label: 'Tebal', unit: 'µm', source: 'actual', value: (r) => r.micron, digits: 1 },
    { id: 'tau', label: 'Au', unit: '%', source: 'target', value: (r) => r.targetAuPct, hideBelow: 'xl' },
    { id: 'lau', label: 'Au', unit: '%', source: 'lab', value: (r) => r.auLabPct, hideBelow: 'xl' },
    { id: 'pau', label: 'Au', unit: '%', source: 'estimate', value: (r) => r.auEstPct, hideBelow: 'lg' },
    {
      id: 'td',
      label: 'Durasi',
      unit: 'jam',
      source: 'estimate',
      value: (r) => hours(r.durationTargetMin),
      digits: 1,
      hideBelow: 'xl',
    },
    {
      id: 'd',
      label: 'Durasi',
      unit: 'jam',
      source: 'actual',
      value: (r) => hours(r.durationMin),
      digits: 1,
    },
    {
      id: 'status',
      label: 'Status',
      value: (r) => BATCH_STATUS_LABEL[r.rb.batch.status],
      cell: (r) => <BatchStatusBadge status={r.rb.batch.status} />,
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>{panel}</Toolbar>
      <Kpis
        items={[
          { label: 'Jumlah batch', value: rows.length, digits: 0 },
          { label: 'Total barang', value: sumOf(rows.map((r) => r.pieces)), unit: 'pcs', digits: 0 },
          { label: 'Total luas', value: sumOf(rows.map((r) => r.areaDm2)), unit: 'dm²', digits: 1 },
          {
            label: 'Total deposit timbang',
            value: deposits,
            unit: 'g',
            digits: 1,
            hint:
              deposits === null
                ? `Belum ditimbang. Perkiraan dari arus ${fmtNumber(estimated, 0)} g.`
                : undefined,
          },
        ]}
      />
      <ReportInsights insights={productionInsights(rows)} />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title={filters.grain === 'batch' ? 'Barang per batch' : 'Barang per periode'}
          note="Jumlah barang di rak, sesuai pengelompokan."
        >
          <ColumnChart
            ariaLabel="Jumlah barang"
            format={(v) => fmtNumber(v, 0)}
            data={numbersOnly(
              trend(
                rows,
                filters.grain,
                { date: (r) => dateOf(r.rb), batch: (r) => r.rb.batch.code, value: (r) => r.pieces },
                true,
              ),
            )}
          />
        </ChartCard>
        <ChartCard title="Rekap per model" note="Jumlah barang tiap model dari isi rak.">
          <BarList
            ariaLabel="Barang per model"
            items={[...byModel]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([label, value]) => ({ key: label, label, value, display: `${fmtNumber(value, 0)} pcs` }))}
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Detail batch"
        file="produksi"
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
        initialSort={{ id: 'start', desc: true }}
      />
    </div>
  )
}

const TOLERANCE_LABEL = { below: 'Di bawah', within: 'Sesuai', above: 'Di atas' } as const
const TOLERANCE_TONE = { below: 'warning', within: 'success', above: 'info' } as const

export function ThicknessReport() {
  const { scope } = useReport()
  const openBatch = useOpenBatch()
  const [tol, setTol] = useViewParam<string>('tol', '3')
  const tolerance = Number(tol)
  const { rows, panel } = useSpecialFilters(
    scope.batches.map((rb) => thicknessRow(rb, tolerance)),
    [
      { id: 'target', label: 'Target tebal', unit: 'µm', value: (r) => r.target },
      { id: 'ukur', label: 'Tebal terukur', unit: 'µm', value: (r) => r.qc ?? r.process },
      { id: 'dev', label: 'Selisih dari target', unit: 'µm', value: (r) => r.deviation },
    ],
    [
      {
        id: 'tol',
        label: 'Status toleransi',
        options: Object.entries(TOLERANCE_LABEL).map(([value, label]) => ({ value, label })),
        value: (r) => r.tolerance,
      },
      {
        id: 'sumber',
        label: 'Sumber nilai',
        options: [
          { value: 'qc', label: 'QC' },
          { value: 'proses', label: 'Ukur proses' },
          { value: 'perkiraan', label: 'Perkiraan saja' },
        ],
        value: (r) => (r.qc !== null ? 'qc' : r.process !== null ? 'proses' : 'perkiraan'),
      },
    ],
  )
  const measured = rows.filter((r) => r.tolerance !== null)
  const withReadings = scope.batches.filter((rb) => rb.rows.some((r) => r.micron !== null))
  const { focus, picker } = useFocusBatch(withReadings)
  const count = (t: keyof typeof TOLERANCE_LABEL) => measured.filter((r) => r.tolerance === t).length

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    ...batchColumns(),
    modelColumn('xl'),
    { id: 'target', label: 'Tebal', unit: 'µm', source: 'target', value: (r) => r.target, digits: 0 },
    {
      id: 'est',
      label: 'Tebal',
      unit: 'µm',
      source: 'estimate',
      value: (r) => r.estimated,
      digits: 1,
      hideBelow: 'lg',
    },
    { id: 'proc', label: 'Ukur proses', unit: 'µm', source: 'actual', value: (r) => r.process, digits: 1 },
    { id: 'qc', label: 'QC', unit: 'µm', source: 'lab', value: (r) => r.qc, digits: 1 },
    {
      id: 'at',
      label: 'Diukur',
      value: (r) => r.measuredAt,
      cell: (r) => fmtClock(r.measuredAt),
      hideBelow: 'xl',
    },
    { id: 'dev', label: 'Selisih', unit: 'µm', value: (r) => r.deviation, digits: 1 },
    { id: 'ach', label: 'Capaian', unit: '%', value: (r) => r.achievementPct, digits: 1, hideBelow: 'md' },
    { id: 'rate', label: 'Laju', unit: 'µm/j', source: 'actual', value: (r) => r.rate, hideBelow: 'lg' },
    {
      id: 'left',
      label: 'Sisa',
      unit: 'jam',
      source: 'estimate',
      value: (r) => r.remainingHours,
      digits: 1,
      hideBelow: 'xl',
    },
    {
      id: 'tol',
      label: `Toleransi ±${tolerance} µm`,
      value: (r) => (r.tolerance ? TOLERANCE_LABEL[r.tolerance] : null),
      cell: (r) =>
        r.tolerance ? (
          <Badge variant={TOLERANCE_TONE[r.tolerance]}>{TOLERANCE_LABEL[r.tolerance]}</Badge>
        ) : (
          '–'
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>
        {panel}
        <span className="text-xs text-muted">Toleransi</span>
        <SegmentedControl
          size="sm"
          value={String(tolerance)}
          onChange={setTol}
          options={['2', '3', '5'].map((v) => ({ value: v, label: `±${v} µm` }))}
        />
      </Toolbar>
      <Kpis
        items={[
          { label: 'Batch terukur', value: `${measured.length} dari ${rows.length}` },
          {
            label: 'Sesuai toleransi',
            value: `${count('within')} batch`,
            hint: `±${tolerance} µm dari target`,
          },
          {
            label: 'Rata-rata selisih',
            value: meanOf(measured.map((r) => r.deviation)),
            unit: 'µm',
            digits: 1,
          },
          { label: 'Rata-rata laju', value: meanOf(rows.map((r) => r.rate)), unit: 'µm/j' },
        ]}
      />
      <ReportInsights insights={thicknessInsights(rows, tolerance)} />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title="Tebal terhadap target"
          note="Batch yang sudah diukur. QC dipakai bila ada, selain itu ukur proses."
        >
          <GroupedColumnChart
            ariaLabel="Tebal terhadap target per batch"
            format={(v) => fmtNumber(v, 0)}
            series={[
              { name: 'Target', tone: 'muted' },
              { name: 'Terukur', tone: 'info' },
            ]}
            data={measured.map((r) => ({ label: r.rb.batch.code, values: [r.target, r.qc ?? r.process] }))}
          />
        </ChartCard>
        <ChartCard
          title={`Pertumbuhan tebal ${focus?.batch.code ?? ''}`}
          note="Tebal tiap pembacaan."
          action={picker}
        >
          <LineChart
            ariaLabel="Pertumbuhan tebal"
            format={(v) => `${fmtNumber(v, 0)} µm`}
            data={(focus?.rows ?? []).map((r) => ({ label: `#${r.reading.no}`, value: r.micron }))}
            referenceLines={
              focus ? [{ value: focus.batch.targetMicron, label: 'Target', tone: 'muted' }] : []
            }
            showDots
          />
        </ChartCard>
      </div>
      <ChartCard title="Sebaran terhadap toleransi" note={`Batch terukur, toleransi ±${tolerance} µm.`}>
        <BarList
          ariaLabel="Sebaran toleransi"
          items={(Object.keys(TOLERANCE_LABEL) as (keyof typeof TOLERANCE_LABEL)[]).map((t) => ({
            key: t,
            label: TOLERANCE_LABEL[t],
            value: count(t),
            display: `${count(t)} batch`,
          }))}
        />
      </ChartCard>
      <ReportTable
        title="Detail ketebalan"
        file="ketebalan"
        note="Perkiraan memakai AMM teori × meter AMM. Rumus Excel ini mengandaikan efisiensi 95 %."
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
        initialSort={{ id: 'start', desc: true }}
      />
    </div>
  )
}

export function DensityReport() {
  const { scope, filters } = useReport()
  const openBatch = useOpenBatch()
  const { rows, panel } = useSpecialFilters(scope.batches.map(densityRow), [
    { id: 'luas', label: 'Luas aktif', unit: 'dm²', value: (r) => r.areaDm2 },
    { id: 'rapat', label: 'Rapat arus aktual', unit: 'A/dm²', value: (r) => r.density },
    { id: 'devr', label: 'Selisih rapat arus', unit: 'A/dm²', value: (r) => r.densityDev },
    { id: 'amm', label: 'Meter AMM', unit: 'A·menit', value: (r) => r.amm },
    { id: 'capai', label: 'Capaian AMM', unit: '%', value: (r) => r.ammAchievementPct },
  ])
  const keep = new Set(rows.map((r) => r.rb.batch.id))
  const readings = scope.readings.filter((r) => keep.has(r.rb.batch.id))
  const { focus, picker } = useFocusBatch(rows.map((r) => r.rb).filter((rb) => rb.rows.length > 0))
  const targetDensity = meanOf(readings.map((r) => r.row.reading.setTargetAdm2))

  const columns: ReportColumn<(typeof rows)[number]>[] = [
    ...batchColumns(),
    { id: 'area', label: 'Luas aktif', unit: 'dm²', value: (r) => r.areaDm2 },
    { id: 'ta', label: 'Arus', unit: 'A', source: 'target', value: (r) => r.ampTarget, hideBelow: 'lg' },
    { id: 'a', label: 'Arus', unit: 'A', source: 'actual', value: (r) => r.amp, hideBelow: 'lg' },
    {
      id: 'td',
      label: 'Rapat arus',
      unit: 'A/dm²',
      source: 'target',
      value: (r) => r.densityTarget,
      digits: 3,
    },
    { id: 'd', label: 'Rapat arus', unit: 'A/dm²', source: 'actual', value: (r) => r.density, digits: 3 },
    { id: 'dd', label: 'Selisih', unit: 'A/dm²', value: (r) => r.densityDev, digits: 3, hideBelow: 'md' },
    { id: 'tamm', label: 'AMM', unit: 'A·mnt', source: 'estimate', value: (r) => r.ammTarget, digits: 0 },
    { id: 'amm', label: 'AMM', unit: 'A·mnt', source: 'actual', value: (r) => r.amm, digits: 0 },
    { id: 'ach', label: 'Capaian AMM', unit: '%', value: (r) => r.ammAchievementPct, digits: 0 },
    {
      id: 'dur',
      label: 'Durasi',
      unit: 'jam',
      value: (r) => hours(r.durationMin),
      digits: 1,
      hideBelow: 'lg',
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>{panel}</Toolbar>
      <Kpis
        items={[
          {
            label: 'Rapat arus rata-rata',
            value: meanOf(readings.map((r) => r.row.realAdm2)),
            unit: 'A/dm²',
            digits: 3,
          },
          { label: 'Set target rata-rata', value: targetDensity, unit: 'A/dm²', digits: 3 },
          { label: 'Total meter AMM', value: sumOf(rows.map((r) => r.amm)), unit: 'A·mnt', digits: 0 },
          {
            label: 'Capaian AMM rata-rata',
            value: meanOf(rows.map((r) => r.ammAchievementPct)),
            unit: '%',
            digits: 0,
            hint: 'Meter AMM ÷ AMM teori',
          },
        ]}
      />
      <ReportInsights insights={densityInsights(rows)} />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard title="Rapat arus terhadap target" note="Garis putus: set target rata-rata.">
          <LineChart
            ariaLabel="Rapat arus"
            format={(v) => fmtNumber(v, 2)}
            data={trend(readings, filters.grain, {
              date: (r) => r.at,
              batch: (r) => r.rb.batch.code,
              label: (r) => `${r.rb.batch.code} #${r.row.reading.no}`,
              value: (r) => r.row.realAdm2,
            })}
            referenceLines={
              targetDensity === null ? [] : [{ value: targetDensity, label: 'Target', tone: 'muted' }]
            }
          />
        </ChartCard>
        <ChartCard
          title={`Akumulasi AMM ${focus?.batch.code ?? ''}`}
          note="Meter AMM tiap pembacaan terhadap AMM teori."
          action={picker}
        >
          <LineChart
            ariaLabel="Akumulasi AMM"
            area
            format={(v) => fmtNumber(v, 0)}
            data={(focus?.rows ?? []).map((r) => ({ label: `#${r.reading.no}`, value: r.reading.ammReal }))}
            referenceLines={
              focus?.summary.theoreticalAmm
                ? [{ value: focus.summary.theoreticalAmm, label: 'AMM teori', tone: 'warning' }]
                : []
            }
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Pencapaian AMM per batch"
        file="rapat-arus-amm"
        note="Arus dan rapat arus adalah rata-rata pembacaan."
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
        initialSort={{ id: 'start', desc: true }}
      />
    </div>
  )
}
