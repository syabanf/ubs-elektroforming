import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMPTY_FILTERS,
  catalogOf,
  chemicalRow,
  compositionInsights,
  compositionRows,
  efficiencyInsights,
  goldBalanceInsights,
  goldBalanceRows,
  periodKey,
  predictionRow,
  productionInsights,
  productionRow,
  reportScope,
  seedState,
  thicknessInsights,
  thicknessRow,
  validation,
} from '../src/index.ts'

const state = seedState()
const catalog = catalogOf(state)
const scopeOf = (f: Partial<typeof EMPTY_FILTERS>) => reportScope(state, catalog, { ...EMPTY_FILTERS, ...f })
const codes = (s: ReturnType<typeof scopeOf>) => s.batches.map((b) => b.batch.code)

test('global filters narrow batches and readings together', () => {
  const all = scopeOf({})
  assert.equal(all.batches.length, 19)
  assert.equal(all.readings.length, 141)

  const bak2 = scopeOf({ bathIds: ['bak-2'] })
  assert.ok(bak2.batches.every((b) => b.batch.bathId === 'bak-2'))
  assert.ok(bak2.readings.every((r) => r.rb.batch.bathId === 'bak-2'))

  assert.deepEqual(codes(scopeOf({ from: '2026-10-01', to: '2026-10-06' })), ['B64', '27L', '33L', 'B69'])
  assert.deepEqual(codes(scopeOf({ statuses: ['running'] })).sort(), ['33L', 'B36'])
  assert.ok(codes(scopeOf({ modelIds: ['md-at5713'] })).includes('B36'))
})

test('the end-date basis only counts finished batches with clock times', () => {
  const ended = scopeOf({ basis: 'end', from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(codes(ended), ['B64', '27L', 'B69'])
})

test('measurement basis keeps only readings inside the period', () => {
  const day = scopeOf({ basis: 'reading', from: '2026-09-25', to: '2026-09-25' })
  assert.deepEqual(codes(day), ['B54'])
  assert.ok(day.readings.every((r) => r.at!.startsWith('2026-09-25')))
})

test('thickness rows separate QC from process measurement', () => {
  const b36 = scopeOf({}).batches.find((b) => b.batch.code === 'B36')!
  const row = thicknessRow(b36, 3)
  assert.equal(row.process, 47.000000000000014)
  assert.equal(row.qc, 122.5)
  assert.equal(row.tolerance, 'within')
  assert.equal(thicknessRow(b36, 2).tolerance, 'above')
})

test('composition keeps X-ray, lab and equation values apart', () => {
  const rows = compositionRows(scopeOf({ batchIds: ['bt-b36'] }))
  assert.equal(rows.filter((r) => r.source === 'xray').length, 8)
  assert.equal(rows.filter((r) => r.source === 'lab').length, 1)
  assert.equal(rows.filter((r) => r.source === 'estimate').length, 1)
})

test('GPC added comes from the GPC log first', () => {
  const s = scopeOf({})
  const row = (code: string) =>
    chemicalRow(
      s.batches.find((b) => b.batch.code === code)!,
      state.gpc,
    )
  assert.equal(row('B36').gpcAdded, 532.68)
  assert.equal(row('B39').gpcAdded, 381)
  assert.equal(row('B64').gpcAdded, null)
})

test('gold balance flags batches without opening and closing lab values', () => {
  const s = scopeOf({})
  const rows = goldBalanceRows(s, state.gpc, s.batches)
  const b45 = rows.find((r) => r.rb.batch.code === 'B45')!
  assert.equal(b45.opening, 9.2 * 140)
  assert.equal(b45.closing, 10.25 * 140)
  assert.equal(b45.status, 'gap')
  assert.equal(rows.find((r) => r.rb.batch.code === 'B64')!.status, 'incomplete')
})

test('predictions are scored against finished batches only', () => {
  const s = scopeOf({ statuses: ['completed'] })
  const rows = s.batches.map((rb) => predictionRow(rb, s.batches))
  const duration = validation(rows.map((r) => r.durationErrPct))
  assert.equal(duration.n, 5)
  assert.equal(duration.validated, false)
})

test('weeks start on Monday', () => {
  assert.equal(periodKey('2026-10-15', 'week'), '2026-10-12')
  assert.equal(periodKey('2026-10-12T08:00', 'week'), '2026-10-12')
  assert.equal(periodKey('2026-10-15', 'month'), '2026-10')
})

test('report insights read the filtered rows', () => {
  const s = scopeOf({})
  const titles = (xs: { title: string }[]) => xs.map((x) => x.title)
  const production = titles(productionInsights(s.batches.map(productionRow)))
  assert.ok(production.includes('AT5742 paling banyak diproduksi'), 'rack hooks are not models')
  assert.ok(
    titles(
      thicknessInsights(
        s.batches.map((b) => thicknessRow(b, 3)),
        3,
      ),
    ).includes('7 dari 7 batch tebalnya sesuai target ±3 µm'),
  )
  assert.ok(
    titles(goldBalanceInsights(goldBalanceRows(s, state.gpc, s.batches))).includes('0 dari 5 neraca cocok'),
  )

  const bak1 = scopeOf({ bathIds: ['bak-1'] })
  assert.ok(titles(compositionInsights(compositionRows(bak1)))[0]!.endsWith('X-ray masuk batas kadar'))
  assert.deepEqual(efficiencyInsights([]), [])
})
