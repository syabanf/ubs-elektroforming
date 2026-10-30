import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type ScadaBase,
  parseScadaSample,
  readingFromSample,
  scadaUnits,
  seedState,
  simulateSample,
} from '../src/index.ts'

const units = scadaUnits(seedState().baths)
const ef = units.find((u) => u.id === 'ef:bak-2')!
const asam = units.find((u) => u.id === 'tembaga:asam')!
const base: ScadaBase = { tempC: 63, volt: 1.45, ampere: 9, ph: 10.1, running: true, amm: 1000 }
const half = () => 0.5

test('each bath is an EF unit and the copper machine has an acid and a base tank', () => {
  assert.deepEqual(
    units.map((u) => u.id),
    ['ef:bak-1', 'ef:bak-2', 'tembaga:asam', 'tembaga:basa'],
  )
})

test('the simulated AMM meter grows by ampere times minutes while the machine runs', () => {
  const first = simulateSample(ef, base, undefined, '2026-10-30T10:00:00', half)
  assert.equal(first.amm, 1000)
  const next = simulateSample(ef, base, first, '2026-10-30T10:02:00', half)
  assert.equal(next.amm, 1018)
  const stopped = simulateSample(ef, { ...base, running: false }, next, '2026-10-30T10:05:00', half)
  assert.deepEqual([stopped.volt, stopped.ampere, stopped.running, stopped.amm], [0, 0, false, 1018])
})

test('the copper machine sends neither pH nor running', () => {
  const s = simulateSample(asam, base, undefined, '2026-10-30T10:00:00', half)
  assert.deepEqual([s.ph, s.running, s.tempC], [null, null, 63])
})

test('gateway messages need a unit id and a time, and bad numbers become null', () => {
  assert.equal(parseScadaSample({ at: '2026-10-30T10:00:00' }), null)
  assert.equal(parseScadaSample({ unitId: 'ef:bak-1', at: 'kemarin' }), null)
  const s = parseScadaSample({
    unitId: 'ef:bak-1',
    at: '2026-10-30T10:00:00',
    volt: 1.4,
    ampere: 'x',
    running: true,
  })!
  assert.deepEqual([s.volt, s.ampere, s.running, s.ph], [1.4, null, true, null])
  assert.deepEqual(readingFromSample(s), { volt: 1.4, ampere: null, ph: null, tempC: null, ammReal: null })
})
