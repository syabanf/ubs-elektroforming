import type { GpcEntry, LoadLine, Model, Prep, RackPart } from '@ef/types'

// Constants from the "Data Sheet" tabs of "Luas AREA Bak1 Utk Trial Scada.xlsx".
const AU_DENSITY = 19.32
const CU_DENSITY = 8.96
const AU_MOLAR = 196.97
const CU_MOLAR = 63.54
const FARADAY = 96485
/** Au share of GPC and Cu share of CuCN. */
export const GPC_AU = 0.683
const CUCN_CU = 0.71
/** KCN that one gram of CuCN needs to dissolve. */
const KCN_PER_CUCN = 1.45
const REPLENISHER_ML_PER_G = 1.5
/** Base bath strength the top-up aims for, g/L, before adding the metal the load will take out. */
const BASE_AU_GL = 10
const BASE_CU_GL = 45
/** Sprue tare subtracted from the mean of the tin model weighings, g. */
export const TIN_TARE_G = 0.068

/** Copper pre-treatment tanks: 200 L each, sulphuric acid at 1.84 g/mL. */
export const PRETREAT_TANK_L = 200
const H2SO4_DENSITY = 1.84
export const PRETREAT_CHECKS = [
  { key: 'basaCu', tank: 'Tembaga basa', test: 'Cu (AAS)', optimal: 35, unit: 'g' },
  { key: 'basaKcn', tank: 'Tembaga basa', test: 'KCN (titrasi)', optimal: 25, unit: 'g' },
  { key: 'asamCu', tank: 'Tembaga asam', test: 'Cu (AAS)', optimal: 57, unit: 'g' },
  { key: 'asamH2so4', tank: 'Tembaga asam', test: 'H₂SO₄ (titrasi)', optimal: 55, unit: 'mL' },
] as const

export const PRETREAT_STEPS = [
  { tank: 'Tembaga basa', minutes: 30 },
  { tank: 'Tembaga asam 1', minutes: 40 },
  { tank: 'Tembaga asam 2', minutes: 90 },
]

export type Catalog = { models: Map<string, Model>; parts: Map<string, RackPart> }

export const tinWeight = (weighings: number[]) =>
  weighings.length ? weighings.reduce((s, w) => s + w, 0) / weighings.length - TIN_TARE_G : null

export type LoadLineCalc = {
  line: LoadLine
  name: string
  kind: 'model' | 'part'
  unitAreaDm2: number
  areaDm2: number
  depositG: number | null
}

export type PrepCalc = {
  lines: LoadLineCalc[]
  pieces: number
  areaDm2: number
  areaCm2: number
  depositVolumeCm3: number
  alloyDensity: number
  depositWeightG: number
  gpcG: number
  auG: number
  cucnG: number
  cuG: number
  replenisherMl: number
  /** Ampere-minutes the deposit needs at the assumed efficiency ("AMM Teori"). */
  ammTheory: number
  gramPerAmmTheory: number
  micronPerAmmTheory: number
  bath: {
    targetAuGL: number
    targetCuGL: number
    auAddG: number | null
    cuAddG: number | null
    kcnTopUpG: number | null
    gpcAddG: number | null
    cucnAddG: number | null
    kcnForCucnG: number | null
    kcnExcessG: number | null
    kcnAddG: number | null
    auUsedG: number | null
    cuUsedG: number | null
  }
  /** Deposit from the line weighings (final − after acid). */
  actual: { depositG: number | null; auG: number | null; cuG: number | null }
  pretreat: { key: (typeof PRETREAT_CHECKS)[number]['key']; result: number | null; add: number | null }[]
}

const times = (gl: number | null, litres: number) => (gl === null ? null : gl * litres)
/** Grams to add so a bath at `actual` g/L reaches `target`; nothing when it is already there. */
const topUp = (actual: number | null, target: number | null, litres: number) =>
  actual === null || target === null ? null : actual > target ? 0 : (target - actual) * litres

export function lineName(line: LoadLine, { models, parts }: Catalog) {
  if (line.modelId) return models.get(line.modelId)?.code ?? 'Model terhapus'
  return parts.get(line.partId ?? '')?.name ?? 'Komponen terhapus'
}

export function computePrep(prep: Prep, targetMicron: number, catalog: Catalog): PrepCalc {
  const lines = prep.load.map((line): LoadLineCalc => {
    const unitAreaDm2 =
      (line.modelId
        ? catalog.models.get(line.modelId)?.areaDm2
        : catalog.parts.get(line.partId ?? '')?.areaDm2) ?? 0
    return {
      line,
      name: lineName(line, catalog),
      kind: line.modelId ? 'model' : 'part',
      unitAreaDm2,
      areaDm2: unitAreaDm2 * line.qty,
      depositG:
        line.weightFinalG === null || line.weightAfterAcidG === null
          ? null
          : line.weightFinalG - line.weightAfterAcidG,
    }
  })
  const areaDm2 = lines.reduce((s, l) => s + l.areaDm2, 0)
  const areaCm2 = areaDm2 * 100
  const au = prep.targetAuPct / 100
  const depositVolumeCm3 = (areaCm2 * targetMicron) / 10000
  const alloyDensity = 1 / (au / AU_DENSITY + (1 - au) / CU_DENSITY)
  const depositWeightG = depositVolumeCm3 * alloyDensity
  const gpcG = (depositWeightG * au) / GPC_AU
  const auG = gpcG * GPC_AU
  const cucnG = ((1 - au) * depositWeightG) / CUCN_CU
  const cuG = cucnG * CUCN_CU
  const coulombs = (auG / AU_MOLAR + cuG / CU_MOLAR) * FARADAY
  const ammTheory = ((coulombs / 60) * (200 - prep.efficiencyPct)) / 100
  const { chem } = prep
  const V = prep.bathVolumeL

  const targetAuGL = BASE_AU_GL + auG / V
  const targetCuGL = BASE_CU_GL + cuG / V
  const auAddG = topUp(chem.auStart, targetAuGL, V)
  const cuAddG = topUp(chem.cuStart, targetCuGL, V)
  const kcnTopUpG = topUp(chem.kcnStart, chem.kcnTarget, V)
  const cucnAddG = cuAddG === null ? null : cuAddG / CUCN_CU
  const kcnForCucnG = cucnAddG === null ? null : cucnAddG * KCN_PER_CUCN
  const kcnExcessG =
    chem.kcnStart === null || chem.kcnTarget === null ? null : (chem.kcnStart - chem.kcnTarget) * V
  const kcnShortG = kcnForCucnG ? kcnForCucnG - (kcnExcessG ?? 0) : 0
  const auStartG = times(chem.auStart, V)
  const cuStartG = times(chem.cuStart, V)
  const auEndG = times(chem.auEnd, V)
  const cuEndG = times(chem.cuEnd, V)

  const depositG = lines.some((l) => l.depositG !== null)
    ? lines.reduce((s, l) => s + (l.depositG ?? 0), 0)
    : null
  const actualAu = depositG === null || prep.actualAuPct === null ? null : (depositG * prep.actualAuPct) / 100

  return {
    lines,
    pieces: lines.filter((l) => l.kind === 'model').reduce((s, l) => s + l.line.qty, 0),
    areaDm2,
    areaCm2,
    depositVolumeCm3,
    alloyDensity,
    depositWeightG,
    gpcG,
    auG,
    cucnG,
    cuG,
    replenisherMl: REPLENISHER_ML_PER_G * depositWeightG,
    ammTheory,
    gramPerAmmTheory: depositWeightG / ammTheory,
    micronPerAmmTheory: targetMicron / ammTheory,
    bath: {
      targetAuGL,
      targetCuGL,
      auAddG,
      cuAddG,
      kcnTopUpG,
      gpcAddG: auAddG === null ? null : auAddG / GPC_AU,
      cucnAddG,
      kcnForCucnG,
      kcnExcessG,
      kcnAddG: kcnTopUpG === null ? null : kcnTopUpG + Math.max(0, kcnShortG),
      auUsedG: auStartG === null || auEndG === null ? null : auStartG + (auAddG ?? 0) - auEndG,
      cuUsedG: cuStartG === null || cuEndG === null ? null : cuStartG + (cuAddG ?? 0) - cuEndG,
    },
    actual: {
      depositG,
      auG: actualAu,
      cuG: depositG === null || actualAu === null ? null : depositG - actualAu,
    },
    pretreat: PRETREAT_CHECKS.map((check) => {
      const result = prep.pretreat[check.key]
      const grams = topUp(result, check.optimal, PRETREAT_TANK_L)
      return {
        key: check.key,
        result,
        add: grams === null ? null : check.unit === 'mL' ? grams / H2SO4_DENSITY : grams,
      }
    }),
  }
}

/** Ring families share a design; an area far from the family median is likely a typo in the master. */
export function areaOutliers(models: Model[]): Set<string> {
  const flagged = new Set<string>()
  const families = new Map<string, Model[]>()
  for (const m of models) families.set(m.family, [...(families.get(m.family) ?? []), m])
  for (const group of families.values()) {
    if (group.length < 3) continue
    const sorted = group.map((m) => m.areaDm2).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    for (const m of group) if (m.areaDm2 > median * 3 || m.areaDm2 < median / 3) flagged.add(m.id)
  }
  return flagged
}

export type GpcRow = { entry: GpcEntry; auInG: number; cumulativeAuG: number }

/** GPC log with the gold each addition brings and the running total on top of the starting bath. */
export function gpcLedger(entries: GpcEntry[], initialAuG: number): GpcRow[] {
  let cumulativeAuG = initialAuG
  return entries.map((entry) => {
    const auInG = entry.grams * entry.auFraction
    cumulativeAuG += auInG
    return { entry, auInG, cumulativeAuG }
  })
}
