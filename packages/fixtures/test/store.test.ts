import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bathIdFor,
  bathRemoveBlocker,
  bathSaveBlocker,
  batchStartBlocker,
  catalogOf,
  computeBatch,
  modelRemoveBlocker,
  nextBathName,
  partRemoveBlocker,
  reduce,
  seedState,
  type NewBatch,
} from '../src/index.ts'

const input: NewBatch = {
  code: 'B71',
  bathId: 'bak-2',
  startDate: '2026-10-15',
  targetMicron: 120,
  targetAuPct: 72,
  note: '',
}
const line = {
  id: 'ld-1',
  modelId: 'md-at5713',
  partId: null,
  label: '',
  qty: 100,
  weightStartG: null,
  weightAfterAcidG: null,
  weightFinalG: null,
}

test('a batch is prepared while another runs, and starts once the bath is free', () => {
  let state = reduce(seedState(), { type: 'batches/create', batch: input })
  const id = 'bt-b71'
  assert.equal(state.batches.find((b) => b.id === id)!.status, 'preparing')
  assert.match(
    batchStartBlocker(
      state,
      state.batches.find((b) => b.id === id)!,
    ) ?? '',
    /Isi rak dulu/,
  )

  state = reduce(state, { type: 'batches/saveLine', batchId: id, line })
  const batch = state.batches.find((b) => b.id === id)!
  near(computeBatch(batch, catalogOf(state)).summary.areaDm2!, 5.68764416)
  assert.match(batchStartBlocker(state, batch) ?? '', /Bak 2 masih dipakai batch 33L/)

  state = reduce(state, { type: 'batches/complete', id: 'bt-33l' })
  const start = { startDate: '2026-10-15', initialAu: 0.72, initialThicknessMm: 0.205 }
  state = reduce(state, { type: 'batches/start', id, start })
  assert.equal(state.batches.find((b) => b.id === id)!.status, 'running')
})

test('journey: log readings, edit one, close the batch', () => {
  let state = seedState()
  const id = 'bt-b36'
  const reading = {
    no: 9,
    minutes: 60,
    volt: 1.5,
    ampere: 10.4,
    setTargetAdm2: null,
    ammReal: 4671,
    au: 0.715,
    thicknessMm: 0.398,
    recordedAt: '2026-10-14T10:00',
    ph: 10.2,
    tempC: 62,
  }
  state = reduce(state, { type: 'readings/add', batchId: id, reading })
  state = reduce(state, { type: 'readings/add', batchId: id, reading: { ...reading, no: 10, ammReal: 5300 } })
  const added = state.batches.find((b) => b.id === id)!.readings.filter((r) => r.no >= 9)
  assert.equal(new Set(added.map((r) => r.id)).size, 2, 'ids stay unique')
  state = reduce(state, {
    type: 'readings/update',
    batchId: id,
    readingId: added[0]!.id,
    reading: { ...reading, volt: 1.52 },
  })
  assert.equal(state.batches.find((b) => b.id === id)!.readings.find((r) => r.no === 9)!.volt, 1.52)
  const { summary } = computeBatch(
    state.batches.find((b) => b.id === id)!,
    catalogOf(state),
  )
  assert.deepEqual(
    [summary.latestPh, summary.latestTempC, summary.lastRecordedAt],
    [10.2, 62, '2026-10-14T10:00'],
  )
  state = reduce(state, { type: 'batches/complete', id })
  const closed = state.batches.find((b) => b.id === id)!
  assert.equal(closed.status, 'completed')
  assert.equal(
    reduce(state, { type: 'readings/remove', batchId: id, readingId: added[0]!.id }),
    state,
    'closed batch is read-only',
  )
})

test('a model on a rack cannot be removed', () => {
  const state = seedState()
  assert.match(modelRemoveBlocker(state, 'md-at5713') ?? '', /rak batch B36, B39/)
  assert.equal(reduce(state, { type: 'models/remove', id: 'md-at5713' }), state)
})

test('a rack part on a rack cannot be removed, an unused one can', () => {
  const state = seedState()
  assert.match(partRemoveBlocker(state, 'pt-plat') ?? '', /rak batch/)
  assert.equal(reduce(state, { type: 'parts/remove', id: 'pt-plat' }), state)
  const unused = reduce(state, { type: 'parts/save', part: { id: 'pt-baru', name: 'Baru', areaDm2: 0.01 } })
  assert.equal(partRemoveBlocker(unused, 'pt-baru'), null)
  assert.ok(!reduce(unused, { type: 'parts/remove', id: 'pt-baru' }).parts.some((p) => p.id === 'pt-baru'))
})

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`)
}

test('running sample batches were last logged 40 minutes before load, and new batches get the sample limits', () => {
  const now = new Date('2026-10-14T15:00')
  const state = seedState(now)
  const b36 = state.batches.find((b) => b.id === 'bt-b36')!
  assert.equal(b36.readings.at(-1)!.recordedAt, '2026-10-14T14:20')
  assert.equal(b36.readings.at(-2)!.recordedAt, '2026-10-14T13:20', 'intervals keep their length')
  const created = reduce(state, { type: 'batches/create', batch: input }).batches.find(
    (b) => b.id === 'bt-b71',
  )!
  assert.deepEqual(
    [created.phMin, created.phMax, created.tempMin, created.tempMax, created.conditionIsSample],
    [9.5, 10.5, 60, 65, false],
  )
})

test('baths can be added, renamed and removed while no batch uses them', () => {
  let state = seedState()
  assert.equal(nextBathName(state.baths), 'Bak 3')
  const id = bathIdFor(state.baths, 'Bak 3')
  assert.equal(id, 'bak-3')
  state = reduce(state, { type: 'baths/save', bath: { id, name: ' Bak 3 ', description: '' } })
  assert.deepEqual(
    state.baths.map((b) => b.name),
    ['Bak 1', 'Bak 2', 'Bak 3'],
  )
  assert.match(bathSaveBlocker(state, { id: 'bak-x', name: 'bak 1', description: '' }) ?? '', /sudah dipakai/)
  state = reduce(state, { type: 'baths/save', bath: { id, name: 'Bak 3 trial', description: 'baru' } })
  assert.equal(state.baths.at(-1)!.name, 'Bak 3 trial')
  assert.match(bathRemoveBlocker(state, 'bak-2') ?? '', /Bak 2 dipakai \d+ batch/)
  assert.equal(reduce(state, { type: 'baths/remove', id: 'bak-2' }), state)
  state = reduce(state, { type: 'baths/remove', id })
  assert.equal(state.baths.length, 2)
})
