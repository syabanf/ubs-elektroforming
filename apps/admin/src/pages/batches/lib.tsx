import {
  type BatchCalc,
  type ReadingCalc,
  fmtClock,
  fmtHours,
  fmtNumber,
  fmtPercent,
  fmtSigned,
} from '@ef/fixtures'
import { type Batch, DIRECTIVE_LABEL } from '@ef/types'
import type { Column } from '@ef/ui'
import { DirectiveBadge } from '../../components/badges'

export type ColumnGroup = 'condition' | 'electric' | 'composition' | 'thickness' | 'advice'

export const GROUP_LABEL: Record<ColumnGroup, string> = {
  condition: 'Kondisi',
  electric: 'Mesin',
  composition: 'Kadar',
  thickness: 'Tebal',
  advice: 'Saran volt',
}

const num = (
  id: string,
  header: string,
  pick: (r: ReadingCalc) => number | null,
  digits: number,
  hideBelow?: Column<ReadingCalc>['hideBelow'],
): Column<ReadingCalc> => ({
  id,
  header,
  align: 'right',
  hideBelow,
  cell: (r) => <span className="tabular-nums">{fmtNumber(pick(r), digits, digits)}</span>,
  sortValue: pick,
})

const pct = (
  id: string,
  header: string,
  pick: (r: ReadingCalc) => number | null,
  hideBelow?: Column<ReadingCalc>['hideBelow'],
): Column<ReadingCalc> => ({
  id,
  header,
  align: 'right',
  hideBelow,
  cell: (r) => <span className="tabular-nums">{fmtPercent(pick(r))}</span>,
  sortValue: pick,
})

const elapsed: Column<ReadingCalc> = {
  id: 'elapsed',
  header: 'Jam ke',
  align: 'right',
  hideBelow: 'sm',
  cell: (r) => <span className="text-muted tabular-nums">{fmtHours(r.cumMinutes / 60)}</span>,
  sortValue: (r) => r.cumMinutes,
}

export const GROUP_COLUMNS: Record<ColumnGroup, Column<ReadingCalc>[]> = {
  condition: [
    {
      id: 'recordedAt',
      header: 'Jam catat',
      cell: (r) =>
        r.reading.recordedAt ? (
          <span className="tabular-nums">{fmtClock(r.reading.recordedAt)}</span>
        ) : (
          <span className="text-muted tabular-nums">jam ke {fmtHours(r.cumMinutes / 60)}</span>
        ),
      sortValue: (r) => r.reading.recordedAt ?? r.cumMinutes,
    },
    num('minutes', 'Menit', (r) => r.reading.minutes, 0, 'sm'),
    num('volt', 'Volt', (r) => r.reading.volt, 2),
    num('ph', 'pH', (r) => r.reading.ph, 2),
    num('tempC', 'Suhu (°C)', (r) => r.reading.tempC, 1),
  ],
  electric: [
    num('minutes', 'Menit', (r) => r.reading.minutes, 0),
    elapsed,
    num('volt', 'Volt', (r) => r.reading.volt, 2),
    num('ampere', 'Ampere', (r) => r.reading.ampere, 2),
    num('realAdm2', 'Arus per luas', (r) => r.realAdm2, 3, 'md'),
    num('targetAmpere', 'Target ampere', (r) => r.targetAmpere, 2, 'lg'),
    num('amm', 'AMM', (r) => r.amm, 1, 'md'),
    num('ammReal', 'Meter AMM', (r) => r.reading.ammReal, 1),
    num('diffAmm', 'Naik meter', (r) => r.diffAmm, 1, 'lg'),
  ],
  composition: [
    pct('au', 'Emas', (r) => r.reading.au),
    pct('cu', 'Tembaga', (r) => r.cu, 'sm'),
    num('eqv', 'Faktor elektrokimia', (r) => r.eqv, 3, 'md'),
    num('weight', 'Perkiraan emas (g)', (r) => r.weightG, 2),
  ],
  thickness: [
    num('thickness', 'Tebal plat (mm)', (r) => r.reading.thicknessMm, 3),
    num('micron', 'Tebal emas (µm)', (r) => r.micron, 1),
    num('delta', 'µm per AMM terakhir', (r) => r.micronPerAmmDelta, 5, 'lg'),
    num('targetAtAmm', 'Seharusnya (µm)', (r) => r.targetMicronAtAmm, 1, 'md'),
    num('pctTheory', '% dari seharusnya', (r) => r.pctOfTheory, 1, 'md'),
    num('perAmm', 'µm per total AMM', (r) => r.micronPerAmm, 5, 'lg'),
    num('perHour', 'µm per jam', (r) => r.micronPerHour, 2),
  ],
  advice: [
    num('n', 'Jumlah data', (r) => r.advice.n, 0, 'sm'),
    num('slope', 'Kemiringan', (r) => r.advice.slope, 4, 'md'),
    num('intercept', 'Titik potong', (r) => r.advice.intercept, 4, 'lg'),
    num('r2', 'Keyakinan (R²)', (r) => r.advice.r2, 3, 'md'),
    num('suggested', 'Saran volt', (r) => r.advice.suggestedVolt, 3),
    {
      id: 'delta',
      header: 'Selisih',
      align: 'right',
      hideBelow: 'sm',
      cell: (r) => <span className="tabular-nums">{fmtSigned(r.advice.deltaVolt)}</span>,
      sortValue: (r) => r.advice.deltaVolt,
    },
    { id: 'directive', header: 'Saran', cell: (r) => <DirectiveBadge directive={r.advice.directive} /> },
  ],
}

const csvCell = (value: string | number | null) => {
  if (value === null) return ''
  const text = String(value)
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Every column the spreadsheet shows, one row per reading, with a dot decimal so Excel and SCADA tools read it. */
export function batchCsv(batch: Batch, calc: BatchCalc): string {
  const header = [
    'No',
    'Jam catat',
    'Waktu (menit)',
    'Volt (V)',
    'Ampere (A)',
    'Real A/dm2',
    'Set target (A/dm2)',
    'pH',
    'Suhu (C)',
    'Target ampere',
    'AMM',
    'AMM (real)',
    'Diff AMM',
    'Au',
    'Cu',
    'Persamaan elektrokimia',
    'Perkiraan emas (g)',
    'Ketebalan plat (mm)',
    'Deposit (mikron)',
    'Diff mikron per AMM',
    'Target mikron',
    '% mikron real vs teori',
    'Mikron per total AMM',
    'Mikron per jam',
    'n data',
    'Slope Au vs volt',
    'Titik potong',
    'R2',
    'Saran volt',
    'Delta volt',
    'Arahan',
  ]
  const rows = calc.rows.map((r) => [
    r.reading.no,
    r.reading.recordedAt,
    r.reading.minutes,
    r.reading.volt,
    r.reading.ampere,
    r.realAdm2,
    r.reading.setTargetAdm2,
    r.reading.ph,
    r.reading.tempC,
    r.targetAmpere,
    r.amm,
    r.reading.ammReal,
    r.diffAmm,
    r.reading.au,
    r.cu,
    r.eqv,
    r.weightG,
    r.reading.thicknessMm,
    r.micron,
    r.micronPerAmmDelta,
    r.targetMicronAtAmm,
    r.pctOfTheory,
    r.micronPerAmm,
    r.micronPerHour,
    r.advice.n,
    r.advice.slope,
    r.advice.intercept,
    r.advice.r2,
    r.advice.suggestedVolt,
    r.advice.deltaVolt,
    DIRECTIVE_LABEL[r.advice.directive],
  ])
  return [[`Batch ${batch.code}`], header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
