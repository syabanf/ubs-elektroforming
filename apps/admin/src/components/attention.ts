import { type BatchCalc, auBand, fmtAgo, fmtNumber, fmtPercent, rangeState, recordStatus } from '@ef/fixtures'
import { type Batch, DIRECTIVE_LABEL } from '@ef/types'
import { AU_BAND_LABEL } from './badges'

/** What an operator should look at on a running batch, in plain words. Empty when the bath is fine. */
export function issuesOf(batch: Batch, { summary }: BatchCalc, now: string): string[] {
  const issues: string[] = []
  const record = recordStatus(summary.lastRecordedAt, now)
  if (record?.state === 'late') issues.push(`terlambat catat, terakhir ${fmtAgo(record.minutesAgo)}`)
  const au = summary.latestAu
  if (au !== null && auBand(au, batch) !== 'within')
    issues.push(`kadar ${fmtPercent(au)} ${AU_BAND_LABEL[auBand(au, batch)].toLowerCase()}`)
  if (rangeState(summary.latestPh, batch.phMin, batch.phMax) === 'outside')
    issues.push(`pH ${fmtNumber(summary.latestPh, 2)} di luar batas`)
  if (rangeState(summary.latestTempC, batch.tempMin, batch.tempMax) === 'outside')
    issues.push(`suhu ${fmtNumber(summary.latestTempC, 1)} °C di luar batas`)
  const { directive, suggestedVolt } = summary.next
  if (directive === 'raise' || directive === 'lower')
    issues.push(`${DIRECTIVE_LABEL[directive].toLowerCase()} ke ${fmtNumber(suggestedVolt, 2)} V`)
  return issues
}
