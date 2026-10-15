import {
  type BalanceStatus,
  BALANCE_TOLERANCE,
  chemicalRow,
  fmtNumber,
  goldBalanceRows,
  meanOf,
  sumOf,
  chemicalInsights,
  goldBalanceInsights,
} from '@ef/fixtures'
import { Badge, ColumnChart, GroupedColumnChart, LineChart, SegmentedControl, WaterfallChart } from '@ef/ui'
import {
  ChartCard,
  Kpis,
  type ReportColumn,
  ReportTable,
  Toolbar,
  batchColumns,
  numbersOnly,
  trend,
  useBatchDate,
  useFocusBatch,
  useOpenBatch,
  useReport,
  useSpecialFilters,
  useViewParam,
  ReportInsights,
} from './shared'

type ChemRow = ReturnType<typeof chemicalRow>
const MATERIALS = {
  gpc: {
    label: 'GPC',
    unit: 'g',
    required: (r: ChemRow) => r.gpcRequired,
    added: (r: ChemRow) => r.gpcAdded,
  },
  cucn: {
    label: 'CuCN',
    unit: 'g',
    required: (r: ChemRow) => r.cucnRequired,
    added: (r: ChemRow) => r.cucnAdded,
  },
  kcn: {
    label: 'KCN',
    unit: 'g',
    required: (r: ChemRow) => r.kcnRequired,
    added: (r: ChemRow) => r.kcnAdded,
  },
  repl: {
    label: 'Replenisher',
    unit: 'mL',
    required: (r: ChemRow) => r.replenisherRequiredMl,
    added: (r: ChemRow) => r.replenisherAddedMl,
  },
}
type Material = keyof typeof MATERIALS
const SOLUTION = {
  au: { label: 'Au', value: (r: ChemRow) => r.auGL },
  cu: { label: 'Cu', value: (r: ChemRow) => r.cuGL },
  kcn: { label: 'KCN', value: (r: ChemRow) => r.kcnGL },
}
type Solution = keyof typeof SOLUTION

export function ChemicalReport() {
  const { scope, state, filters } = useReport()
  const openBatch = useOpenBatch()
  const dateOf = useBatchDate()
  const [material, setMaterial] = useViewParam<Material>('bahan', 'gpc')
  const [solution, setSolution] = useViewParam<Solution>('larutan', 'au')
  const { rows, panel } = useSpecialFilters(
    scope.batches.map((rb) => chemicalRow(rb, state.gpc)),
    [
      { id: 'gpcb', label: 'GPC dibutuhkan', unit: 'g', value: (r) => r.gpcRequired },
      { id: 'gpct', label: 'GPC ditambahkan', unit: 'g', value: (r) => r.gpcAdded },
      { id: 'au', label: 'Kadar Au larutan', unit: 'g/L', value: (r) => r.auGL },
      { id: 'kcn', label: 'Kadar KCN larutan', unit: 'g/L', value: (r) => r.kcnGL },
    ],
    [
      {
        id: 'catat',
        label: 'Tipe catatan',
        options: [
          { value: 'tambah', label: 'Ada penambahan' },
          { value: 'lab', label: 'Ada hasil lab' },
          { value: 'butuh', label: 'Kebutuhan saja' },
        ],
        value: (r) => (r.gpcAdded !== null ? 'tambah' : r.auGL !== null ? 'lab' : 'butuh'),
      },
    ],
  )
  const m = MATERIALS[material]
  const group = { date: (r: ChemRow) => dateOf(r.rb), batch: (r: ChemRow) => r.rb.batch.code }
  const required = trend(rows, filters.grain, { ...group, value: m.required }, true)
  const added = trend(rows, filters.grain, { ...group, value: m.added }, true)

  const columns: ReportColumn<ChemRow>[] = [
    ...batchColumns(),
    { id: 'gb', label: 'GPC butuh', unit: 'g', source: 'estimate', value: (r) => r.gpcRequired, digits: 1 },
    { id: 'gt', label: 'GPC tambah', unit: 'g', source: 'actual', value: (r) => r.gpcAdded, digits: 1 },
    { id: 'gv', label: 'Selisih GPC', unit: 'g', value: (r) => r.gpcVariance, digits: 1, hideBelow: 'md' },
    {
      id: 'cb',
      label: 'CuCN butuh',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.cucnRequired,
      digits: 1,
      hideBelow: 'lg',
    },
    {
      id: 'ct',
      label: 'CuCN tambah',
      unit: 'g',
      source: 'actual',
      value: (r) => r.cucnAdded,
      hideBelow: 'xl',
    },
    {
      id: 'kb',
      label: 'KCN butuh',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.kcnRequired,
      digits: 1,
      hideBelow: 'lg',
    },
    { id: 'kt', label: 'KCN tambah', unit: 'g', source: 'actual', value: (r) => r.kcnAdded, hideBelow: 'xl' },
    {
      id: 'rb',
      label: 'Replenisher butuh',
      unit: 'mL',
      source: 'estimate',
      value: (r) => r.replenisherRequiredMl,
      digits: 0,
      hideBelow: 'xl',
    },
    {
      id: 'rt',
      label: 'Replenisher tambah',
      unit: 'mL',
      source: 'actual',
      value: (r) => r.replenisherAddedMl,
      hideBelow: 'xl',
    },
    { id: 'au', label: 'Au', unit: 'g/L', source: 'lab', value: (r) => r.auGL },
    { id: 'cu', label: 'Cu', unit: 'g/L', source: 'lab', value: (r) => r.cuGL, hideBelow: 'md' },
    { id: 'kcn', label: 'KCN', unit: 'g/L', source: 'lab', value: (r) => r.kcnGL, hideBelow: 'md' },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>
        {panel}
        <SegmentedControl
          size="sm"
          value={material}
          onChange={(v) => setMaterial(v as Material)}
          options={Object.entries(MATERIALS).map(([value, x]) => ({ value, label: x.label }))}
        />
        <SegmentedControl
          size="sm"
          value={solution}
          onChange={(v) => setSolution(v as Solution)}
          options={Object.entries(SOLUTION).map(([value, x]) => ({ value, label: `Larutan ${x.label}` }))}
        />
      </Toolbar>
      <Kpis
        items={[
          {
            label: 'GPC dibutuhkan',
            value: sumOf(rows.map((r) => r.gpcRequired)),
            unit: 'g',
            digits: 0,
            hint: 'Dari rak dan hasil lab',
          },
          {
            label: 'GPC ditambahkan',
            value: sumOf(rows.map((r) => r.gpcAdded)),
            unit: 'g',
            digits: 0,
            hint: 'Dari catatan GPC',
          },
          {
            label: 'Batch dengan penambahan',
            value: `${rows.filter((r) => r.gpcAdded !== null).length} dari ${rows.length}`,
          },
          {
            label: 'Kadar Au larutan',
            value: meanOf(rows.map((r) => r.auGL)),
            unit: 'g/L',
            hint: 'Rata-rata hasil lab awal batch',
          },
        ]}
      />
      <ReportInsights insights={chemicalInsights(rows)} />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title={`${m.label}: kebutuhan dan penambahan`}
          note={`Jumlah ${m.unit}, mengikuti pengelompokan grafik.`}
        >
          <GroupedColumnChart
            ariaLabel={`Kebutuhan dan penambahan ${m.label}`}
            format={(v) => fmtNumber(v, 0)}
            series={[
              { name: 'Kebutuhan (rumus)', tone: 'muted' },
              { name: 'Ditambahkan', tone: 'info' },
            ]}
            data={required.map((d, i) => ({ label: d.label, values: [d.value, added[i]?.value ?? null] }))}
          />
        </ChartCard>
        <ChartCard
          title={`Kadar ${SOLUTION[solution].label} larutan`}
          note="Hasil lab di awal tiap batch, g/L."
        >
          <LineChart
            ariaLabel="Kadar larutan"
            showDots
            format={(v) => fmtNumber(v, 2)}
            data={trend(rows, filters.grain, { ...group, value: SOLUTION[solution].value })}
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Histori bahan per batch"
        file="bahan-kimia"
        note="Kebutuhan dihitung dari isi rak dan hasil lab. Penambahan GPC diambil dari Catatan GPC."
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
        initialSort={{ id: 'start', desc: true }}
      />
    </div>
  )
}

const STATUS_LABEL: Record<BalanceStatus, string> = {
  match: 'Cocok',
  gap: 'Ada selisih',
  incomplete: 'Belum lengkap',
}
const STATUS_TONE = { match: 'success', gap: 'warning', incomplete: 'muted' } as const

export function GoldBalanceReport() {
  const { scope, state, all } = useReport()
  const openBatch = useOpenBatch()
  const balance = goldBalanceRows(scope, state.gpc, all)
  type Row = (typeof balance)[number]
  const { rows, panel } = useSpecialFilters(
    balance,
    [
      { id: 'sel', label: 'Selisih', unit: 'g', value: (r) => r.variance },
      { id: 'selp', label: 'Selisih', unit: '%', value: (r) => r.variancePct },
    ],
    [
      {
        id: 'status',
        label: 'Status rekonsiliasi',
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
        value: (r) => r.status,
      },
      {
        id: 'deposit',
        label: 'Dasar emas menempel',
        options: ['Timbang', 'Perkiraan', 'Teori'].map((v) => ({ value: v, label: v })),
        value: (r) => r.depositSource,
      },
    ],
  )
  const complete = rows.filter((r) => r.status !== 'incomplete')
  const { focus, picker } = useFocusBatch(complete.map((r) => r.rb))
  const f = rows.find((r) => r.rb.batch.id === focus?.batch.id)

  const columns: ReportColumn<Row>[] = [
    ...batchColumns(),
    { id: 'open', label: 'Saldo awal', unit: 'g', source: 'lab', value: (r) => r.opening, digits: 1 },
    { id: 'in', label: 'Masuk', unit: 'g', source: 'actual', value: (r) => r.auIn || null, digits: 1 },
    {
      id: 'dA',
      label: 'Menempel',
      unit: 'g',
      source: 'actual',
      value: (r) => r.depositActual,
      digits: 1,
      hideBelow: 'xl',
    },
    {
      id: 'dE',
      label: 'Menempel',
      unit: 'g',
      source: 'estimate',
      value: (r) => r.depositEstimate ?? r.depositTheory,
      digits: 1,
    },
    { id: 'other', label: 'Kawat/sampel', unit: 'g', value: (r) => r.otherOut, hideBelow: 'xl' },
    { id: 'close', label: 'Saldo akhir', unit: 'g', source: 'lab', value: (r) => r.closing, digits: 1 },
    { id: 'var', label: 'Selisih', unit: 'g', value: (r) => r.variance, digits: 1 },
    { id: 'varp', label: 'Selisih', unit: '%', value: (r) => r.variancePct, digits: 1, hideBelow: 'md' },
    { id: 'src', label: 'Dasar menempel', value: (r) => r.depositSource, hideBelow: 'lg' },
    {
      id: 'status',
      label: 'Status',
      value: (r) => STATUS_LABEL[r.status],
      cell: (r) => <Badge variant={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
  ]

  return (
    <div className="space-y-4">
      <Toolbar>{panel}</Toolbar>
      <Kpis
        items={[
          {
            label: 'Emas masuk',
            value: sumOf(rows.map((r) => r.auIn)),
            unit: 'g',
            digits: 1,
            hint: 'GPC × kadar emas GPC',
          },
          {
            label: 'Emas menempel',
            value: sumOf(rows.map((r) => r.deposit)),
            unit: 'g',
            digits: 1,
            hint: 'Timbang, bila tidak ada pakai perkiraan',
          },
          {
            label: 'Batch cocok',
            value: `${rows.filter((r) => r.status === 'match').length} dari ${complete.length}`,
            hint: `Selisih ≤ ${BALANCE_TOLERANCE * 100} % emas di bak`,
          },
          { label: 'Total selisih', value: sumOf(complete.map((r) => r.variance)), unit: 'g', digits: 1 },
        ]}
      />
      <ReportInsights insights={goldBalanceInsights(rows)} />
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title={`Neraca emas ${focus?.batch.code ?? ''}`}
          note="Saldo awal dan akhir dari kadar Au larutan × volume bak."
          action={picker}
        >
          {f ? (
            <WaterfallChart
              ariaLabel="Neraca emas"
              format={(v) => fmtNumber(v, 0)}
              steps={[
                { label: 'Saldo awal', value: f.opening!, kind: 'total' },
                { label: 'Masuk', value: f.auIn, kind: 'delta' },
                { label: 'Menempel', value: -(f.deposit ?? 0), kind: 'delta' },
                { label: 'Selisih', value: f.variance ?? 0, kind: 'delta' },
                { label: 'Saldo akhir', value: f.closing!, kind: 'total' },
              ]}
            />
          ) : (
            <p className="py-10 text-sm text-center text-muted">
              Belum ada batch dengan kadar Au awal dan akhir. Isi hasil lab di tab Siapkan.
            </p>
          )}
        </ChartCard>
        <ChartCard
          title="Selisih neraca per batch"
          note="Gram. Positif berarti emas di bak lebih banyak dari hitungan."
        >
          <ColumnChart
            ariaLabel="Selisih neraca"
            format={(v) => fmtNumber(v, 0)}
            data={numbersOnly(complete.map((r) => ({ label: r.rb.batch.code, value: r.variance })))}
          />
        </ChartCard>
      </div>
      <ReportTable
        title="Rekonsiliasi per batch"
        file="neraca-emas"
        note="Saldo akhir memakai hasil lab akhir, atau kadar awal batch berikutnya di bak yang sama."
        columns={columns}
        rows={rows}
        getKey={(r) => r.rb.batch.id}
        onRowClick={openBatch}
      />
    </div>
  )
}
