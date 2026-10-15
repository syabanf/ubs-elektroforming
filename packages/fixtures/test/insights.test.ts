import assert from 'node:assert/strict'
import { test } from 'node:test'
import { batchInsights, catalogOf, computeBatch, plantInsights, seedState } from '../src/index.ts'

const entriesOf = (state: ReturnType<typeof seedState>) => {
  const catalog = catalogOf(state)
  return state.batches.map((batch) => ({ batch, calc: computeBatch(batch, catalog) }))
}
const titles = (xs: { title: string }[]) => xs.map((x) => x.title)

test('plant insights read the sample history and put warnings first', () => {
  const state = seedState()
  const insights = plantInsights(entriesOf(state), state.baths)
  const all = titles(insights)

  assert.ok(all.includes('Efisiensi 3 batch terakhir turun 4,8 poin'))
  assert.ok(all.includes('Rak makin luas, tebal tumbuh makin lambat'))
  assert.ok(all.includes('Bak 1 4,3 poin lebih efisien dari Bak 2'))
  assert.match(
    all.find((t) => t.startsWith('B70'))!,
    /^B70 diperkirakan butuh 29 j/,
  )
  const firstInfo = insights.findIndex((i) => i.tone !== 'warn')
  assert.ok(insights.slice(firstInfo).every((i) => i.tone !== 'warn'))
})

test('batch insights compare a run with the finished batches', () => {
  const entries = entriesOf(seedState())
  const of = (code: string) =>
    titles(
      batchInsights(
        entries.find((e) => e.batch.code === code)!,
        entries,
      ),
    )

  assert.ok(of('B36').includes('Naik 0,1 V menurunkan kadar sekitar 0,84 poin'))
  assert.ok(of('33L').includes('Pola volt dan kadar masih lemah'))
  assert.ok(of('B69').includes('Efisiensi 26 %, 11,3 poin di bawah rata-rata'))
})

test('a fresh plant with no history says nothing it cannot back up', () => {
  const state = { ...seedState(), batches: [] }
  assert.deepEqual(plantInsights(entriesOf(state), state.baths), [])
})
