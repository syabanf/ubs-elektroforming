import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  areaOutliers,
  catalogOf,
  computeBatch,
  gpcLedger,
  hourlyLog,
  processHours,
  rangeState,
  recordStatus,
  seedState,
  toLocalIso,
} from '../src/index.ts'

const near = (actual: number | null, expected: number, eps = 1e-6) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`)

const state = seedState()
const catalog = catalogOf(state)
const calc = (code: string) => {
  const found = state.batches.find((b) => b.code === code)
  assert.ok(found, code)
  return computeBatch(found, catalog)
}

// Expected values are the cached results in "Program EF Bak 1 Utk Trial Scada.xlsx".
test('B36 rows match the sheet', () => {
  const { rows, summary } = calc('B36')
  near(rows[0]!.realAdm2, 0.2991146832887973)
  near(rows[0]!.targetAmpere, 0.25 * 19.1230511488)
  near(rows[0]!.eqv, 77.14578009966903)
  near(rows[0]!.weightG, 13.238215865103204)
  near(rows[1]!.micron, 5)
  near(rows[1]!.micronPerAmm, 0.014318442153493713)
  near(rows[1]!.micronPerHour, 5)
  near(rows[7]!.micronPerHour, 7.230769230769233)
  // Row 6: first row with five earlier readings.
  near(rows[5]!.advice.slope, 0.019184782608695272)
  near(rows[5]!.advice.intercept, 0.7023744565217396)
  near(rows[5]!.advice.r2, 0.008729798211907412)
  near(rows[5]!.advice.suggestedVolt, 0.5538526912181163)
  assert.equal(rows[5]!.advice.directive, 'lower')
  assert.equal(rows[6]!.advice.directive, 'raise')
  near(rows[7]!.advice.deltaVolt, 0.005442280768740426)
  assert.equal(rows[4]!.advice.directive, 'insufficient')
  near(summary.totalMinutes, 390)
  near(summary.totalWeightG, 239.65334578860023)
  near(summary.avgEqv, 77.22781186794283)
  near(summary.avgAu, 0.7209229211262898)
  near(summary.remainingHours, 10.095744680851059)
  near(summary.initialAmpere, 5.736915344639999)
  // The rack of data sheet 36 gives the theory; the log so far reached AMM 4047.1.
  near(summary.cathodeEfficiency, (4559.141002782301 / 4047.1) * 100)
  assert.equal(summary.areaSource, 'rack')
})

test('newer sheets match their summaries', () => {
  const cases = [
    {
      code: 'B54',
      eff: 32.3307885781199,
      remaining: 0,
      avgAu: 0.7175788906317645,
      weight: 737.6035626763284,
    },
    {
      code: '17L',
      eff: 38.570633026746016,
      remaining: 0.13340306834030302,
      avgAu: 0.7247854811608254,
      weight: 734.4138953243116,
    },
    {
      code: 'B64',
      eff: 27.734185004301263,
      remaining: 0.4685654008438773,
      avgAu: 0.7245940279938368,
      weight: 1563.0201636064908,
    },
    {
      code: 'B69',
      eff: 25.96103685019628,
      remaining: 1.043162393162393,
      avgAu: 0.7195587946083593,
      weight: 1593.0305554773806,
    },
    {
      code: '27L',
      eff: 44.52622388441165,
      remaining: -0.8792682926829267,
      avgAu: 0.7213213372926081,
      weight: 725.6924057738925,
    },
    {
      code: '33L',
      eff: 35.688963463240285,
      remaining: 0.1354253835425345,
      avgAu: 0.7181301999284461,
      weight: 1063.3066386157536,
    },
  ]
  for (const c of cases) {
    const { summary } = calc(c.code)
    near(summary.cathodeEfficiency, c.eff)
    near(summary.remainingHours, c.remaining, 1e-9)
    near(summary.avgAu, c.avgAu)
    near(summary.totalWeightG, c.weight)
  }
})

test('micron gain per AMM uses the previous thickness reading', () => {
  const { rows } = calc('B64')
  // Sheet U17: (T17 - T16) / (M17 - M16); row 2 has no thickness, so row 3 compares with row 1.
  near(rows[3]!.micronPerAmmDelta, (13 - 5) / (2429.7 - 1387.6))
  near(rows[2]!.micronPerAmmDelta, (5 - 0.5) / (1387.6 - 385.6))
})

// Cached results of every "Batch nn" tab in "Luas AREA Bak1 Utk Trial Scada.xlsx".
const PREP_EXPECTED: Record<string, { area: number; weight: number; amm: number; eff: number | null }> = {
  B36: { area: 19.1230511488, weight: 334.9188425562071, amm: 4559.141002782301, eff: 43.37041126684774 },
  B39: {
    area: 12.335932420200002,
    weight: 216.0500526760467,
    amm: 2941.0189235421544,
    eff: 43.602949200031944,
  },
  B40: { area: 13.7328891468, weight: 240.51618657557034, amm: 3274.068427086166, eff: 38.895509730637784 },
  B43: {
    area: 23.700192749000003,
    weight: 415.08235595302443,
    amm: 5650.3807731848365,
    eff: 42.946140604434454,
  },
  B45: { area: 9.19621409, weight: 161.06139940514447, amm: 2192.476315721945, eff: 34.65543848450083 },
  B48: { area: 18.8045486408, weight: 329.3406275265777, amm: 4483.206580371739, eff: 32.7959515755065 },
  B50: { area: 20.450740000000003, weight: 358.17182712747876, amm: 4875.6763000705, eff: null },
  B52: { area: 19.34220283, weight: 338.7570390260397, amm: 4611.389119874761, eff: null },
  B54: { area: 16.95988, weight: 297.03332043059487, amm: 4043.417742733987, eff: 32.3307885781199 },
  B56: { area: 23.809958, weight: 417.0047714991502, amm: 5676.549989206945, eff: 35.001973074072595 },
  B58: { area: 10.80875632, weight: 189.30327216081585, amm: 2576.9237212277517, eff: null },
  B60: { area: 32.490808416, weight: 569.0401528359162, amm: 7746.158063914672, eff: 38.940876347467956 },
  B62: { area: 11.66732, weight: 204.34005430028327, amm: 2781.6145337204694, eff: null },
}

test('every prepared batch matches its area, deposit weight, AMM teori and efficiency', () => {
  for (const [code, e] of Object.entries(PREP_EXPECTED)) {
    const { prep, summary } = calc(code)
    near(prep.areaDm2, e.area)
    near(prep.depositWeightG, e.weight)
    near(prep.ammTheory, e.amm)
    // B36's log is still running, so its efficiency uses the log's AMM, not the sheet's final total.
    if (e.eff !== null && code !== 'B36') near(summary.cathodeEfficiency, e.eff)
  }
})

test('batch 36 chemistry and additions match the sheet', () => {
  const { prep } = calc('B36')
  near(prep.gpcG, 353.0623230460748)
  near(prep.cucnG, 132.08067030385635)
  near(prep.replenisherMl, 502.37826383431064)
  near(prep.bath.targetAuGL, 11.722439761717636)
  near(prep.bath.targetCuGL, 45.66983768511241)
  near(prep.bath.auAddG, 376.94156664046915)
  near(prep.bath.gpcAddG, 551.8910199714043)
  near(prep.bath.cuAddG, 0)
  near(prep.bath.kcnExcessG, 316.4)
  near(prep.bath.auUsedG, 346.1415666404689)
  near(prep.bath.cuUsedG, 358.75)
  assert.equal(prep.pieces, 272)
})

test('a batch without a log uses the typed result for thickness per AMM', () => {
  const { summary } = calc('B39')
  assert.equal(summary.realAmm, 6745)
  near(summary.cathodeEfficiency, 43.602949200031944)
})

test('the master flags the CH4151 (12) area typed with /1000', () => {
  const flagged = areaOutliers(state.models)
  assert.deepEqual(
    [...flagged].map((id) => catalog.models.get(id)!.code),
    ['CH4151 (12)'],
  )
})

test('GPC ledger adds 68.3 % of each addition', () => {
  const rows = gpcLedger(state.gpc.entries, state.gpc.initialAuG)
  near(rows[0]!.auInG, 363.82044)
  near(rows[0]!.cumulativeAuG, 1264.2 + 363.82044)
})

test('the bath is due for a log after an hour and late after two', () => {
  assert.equal(recordStatus(null, '2026-10-14T12:00'), null)
  assert.deepEqual(recordStatus('2026-10-14T11:20', '2026-10-14T12:00'), {
    minutesAgo: 40,
    state: 'ok',
    lateAt: '2026-10-14T13:20',
  })
  assert.equal(recordStatus('2026-10-14T10:30', '2026-10-14T12:00')!.state, 'due')
  assert.equal(recordStatus('2026-10-14T09:45', '2026-10-14T12:00')!.state, 'late')
})

test('pH and temperature ranges are optional', () => {
  assert.equal(rangeState(10.2, null, null), 'unset')
  assert.equal(rangeState(10.2, 9.5, 10.5), 'within')
  assert.equal(rangeState(66, null, 65), 'outside')
  assert.equal(rangeState(null, 9.5, 10.5), 'unset')
})

test('the hourly log keeps every reading once and fills the hours between logs', () => {
  const b54 = calc('B54')
  const { hours, untimed } = hourlyLog(b54.rows)
  assert.equal(untimed.length, 0)
  assert.equal(hours[0]!.key, '2026-09-25T08')
  assert.equal(hours.at(-1)!.key, '2026-09-26T05')
  assert.equal(hours.length, 22)
  assert.equal(hours.flatMap((h) => h.rows).length, b54.rows.length)
  const gained = hours.reduce((sum, h) => sum + (h.micronGain ?? 0), 0)
  near(gained, b54.rows.findLast((r) => r.micron !== null)!.micron!)
  for (const h of hours) assert.equal(h.state === 'logged', h.rows.length > 0)
})

test('a running batch grows empty hours up to now and flags them late after two hours', () => {
  const b36 = calc('B36')
  const last = b36.rows.at(-1)!.reading.recordedAt!
  const nowIso = toLocalIso(new Date(Date.parse(last) + 150 * 60000))
  const { hours } = hourlyLog(b36.rows, nowIso)
  const open = hours.filter((h) => h.rows.length === 0 && h.start > last)
  assert.ok(open.length >= 2)
  assert.equal(open.at(-1)!.unloggedMin, 150)
  assert.equal(open.at(-1)!.state, 'late')
  assert.equal(hourlyLog(b36.rows).hours.at(-1)!.key, last.slice(0, 13), 'no now, no open hours')
})

test('a running batch counts the time since its last log and finishes after the remaining hours', () => {
  const { summary } = calc('B36')
  const last = summary.lastRecordedAt!
  const nowIso = toLocalIso(new Date(Date.parse(last) + 90 * 60000))
  near(processHours(summary, true, nowIso), (summary.totalMinutes + 90) / 60)
  near(processHours(summary, false, nowIso), summary.totalHours)
  assert.equal(summary.finishAt, toLocalIso(new Date(Date.parse(last) + summary.remainingHours! * 3_600_000)))
})
