import {
  type BatchSummary,
  auBand,
  fmtAgo,
  fmtNumber,
  fmtPercent,
  rangeState,
  recordStatus,
} from '@ef/fixtures'
import { type Batch, DIRECTIVE_LABEL } from '@ef/types'
import { AU_BAND_LABEL } from './badges'

/** What an operator should do on a running batch, in plain words and in order. Empty when the bath is fine. */
export function issuesOf(batch: Batch, summary: BatchSummary, now: string): string[] {
  const issues: string[] = []
  const record = recordStatus(summary.lastRecordedAt, now)
  if (record?.state === 'late') issues.push(`terlambat catat, terakhir ${fmtAgo(record.minutesAgo)}`)
  if (record?.state === 'due') issues.push(`waktunya catat, terakhir ${fmtAgo(record.minutesAgo)}`)
  if (summary.micron !== null && summary.micron >= batch.targetMicron)
    issues.push('tebal sudah sampai target, ukur ulang lalu selesaikan batch')
  const { directive, suggestedVolt } = summary.next
  if (directive === 'raise' || directive === 'lower')
    issues.push(`${DIRECTIVE_LABEL[directive].toLowerCase()} ke ${fmtNumber(suggestedVolt, 2)} V`)
  const avg = summary.avgAu
  if (avg !== null && auBand(avg, batch) !== 'within')
    issues.push(`kadar rata-rata ${fmtPercent(avg)} ${AU_BAND_LABEL[auBand(avg, batch)].toLowerCase()}`)
  const au = summary.latestAu
  if (au !== null && auBand(au, batch) !== 'within')
    issues.push(`kadar ${fmtPercent(au)} ${AU_BAND_LABEL[auBand(au, batch)].toLowerCase()}`)
  if (rangeState(summary.latestPh, batch.phMin, batch.phMax) === 'outside')
    issues.push(`pH ${fmtNumber(summary.latestPh, 2)} di luar batas`)
  if (rangeState(summary.latestTempC, batch.tempMin, batch.tempMax) === 'outside')
    issues.push(`suhu ${fmtNumber(summary.latestTempC, 1)} °C di luar batas`)
  return issues
}
